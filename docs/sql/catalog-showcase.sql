-- Bhawani Showcase: owner settings + compressed private photos. Apply once, then reload Studio.
-- No live files, orders, prices, coupons, stock or maintenance definitions are changed.
BEGIN;
-- offer_ is the existing reset convention for marketing data, not operational settings.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS offer_showcase jsonb DEFAULT NULL;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.store_settings'::regclass AND conname='catalog_showcase_bounded') THEN
  ALTER TABLE public.store_settings ADD CONSTRAINT catalog_showcase_bounded CHECK(offer_showcase IS NULL OR (jsonb_typeof(offer_showcase)='object' AND octet_length(offer_showcase::text)<=18000));
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.showcase_photo_in_use(_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
 SELECT EXISTS(SELECT 1 FROM public.store_settings s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.offer_showcase->'items','[]'::jsonb)) p
 WHERE s.id=1 AND p->'image'->>'kind'='upload' AND (_path=p->'image'->>'path' OR _path=regexp_replace(p->'image'->>'path','[.]webp$','-thumb.webp')))
$f$;
CREATE OR REPLACE FUNCTION public.public_catalog_showcase(_audience text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
DECLARE cfg jsonb; live boolean;
BEGIN
 IF _audience IS NULL OR _audience NOT IN ('men','women') THEN RAISE EXCEPTION 'Invalid Showcase collection'; END IF;
 SELECT offer_showcase,catalog_enabled INTO cfg,live FROM public.store_settings WHERE id=1;
 IF live IS DISTINCT FROM true THEN RETURN NULL; END IF;
 IF cfg IS NULL THEN RETURN jsonb_build_object('config',NULL); END IF;
 RETURN jsonb_build_object('config',jsonb_build_object('version',1,'enabled',(cfg->>'enabled')::boolean,'items',
  (SELECT coalesce(jsonb_agg(p ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(cfg->'items') WITH ORDINALITY q(p,ord)
   WHERE (cfg->>'enabled')::boolean AND (p->>'enabled')::boolean AND p->>'audience'=_audience)));
END $f$;
CREATE OR REPLACE FUNCTION public.is_catalog_showcase_photo(_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
 SELECT EXISTS(SELECT 1 FROM public.store_settings s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.offer_showcase->'items','[]'::jsonb)) p
 WHERE s.id=1 AND s.catalog_enabled AND (s.offer_showcase->>'enabled')::boolean AND (p->>'enabled')::boolean
 AND p->'image'->>'kind'='upload' AND (_path=p->'image'->>'path' OR _path=regexp_replace(p->'image'->>'path','[.]webp$','-thumb.webp')))
$f$;
DROP POLICY IF EXISTS "Public reads enabled Showcase photos" ON storage.objects;
CREATE POLICY "Public reads enabled Showcase photos" ON storage.objects FOR SELECT TO anon,authenticated
 USING(bucket_id='catalog-hero-images' AND public.is_catalog_showcase_photo(name));
DROP POLICY IF EXISTS "Protect saved Showcase photos" ON storage.objects;
CREATE POLICY "Protect saved Showcase photos" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'catalog-hero-images' OR NOT public.showcase_photo_in_use(name));
DROP POLICY IF EXISTS "Keep Showcase photo identities immutable" ON storage.objects;
CREATE POLICY "Keep Showcase photo identities immutable" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'catalog-hero-images' OR name NOT LIKE 'showcase/%') WITH CHECK(bucket_id<>'catalog-hero-images' OR name NOT LIKE 'showcase/%');
CREATE OR REPLACE FUNCTION public.unused_catalog_showcase_photos(_paths text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _paths IS NULL OR cardinality(_paths)>48 OR EXISTS(SELECT 1 FROM unnest(_paths) p WHERE p IS NULL OR p !~ '^showcase/[0-9a-f-]{36}(-thumb)?[.]webp$') THEN RAISE EXCEPTION 'Invalid Showcase cleanup paths'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(name),'[]'::jsonb) FROM (SELECT name FROM storage.objects
  WHERE bucket_id='catalog-hero-images' AND name ~ '^showcase/[0-9a-f-]{36}(-thumb)?[.]webp$'
  AND (name=ANY(_paths) OR created_at<now()-interval '1 hour') AND NOT public.showcase_photo_in_use(name) ORDER BY created_at LIMIT 48) q);
END $f$;
CREATE OR REPLACE FUNCTION public.owner_catalog_showcase() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RETURN (SELECT jsonb_build_object('config',offer_showcase,'storage',jsonb_build_object(
  'photo_bytes',(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name LIKE 'showcase/%'),
  'photos',(SELECT count(*) FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name LIKE 'showcase/%'),
  'pending',public.unused_catalog_showcase_photos())) FROM public.store_settings WHERE id=1);
END $f$;
CREATE OR REPLACE FUNCTION public.save_catalog_showcase(_settings jsonb,_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE cfg jsonb; p jsonb; im jsonb; current_cfg jsonb; thumb text;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM public.maintenance_lock_store();
 SELECT offer_showcase INTO current_cfg FROM public.store_settings WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store settings unavailable'; END IF;
 -- A retry after a lost successful response is safe and keeps the same uploaded files.
 IF current_cfg IS NOT DISTINCT FROM _settings AND _settings IS NOT NULL THEN RETURN current_cfg; END IF;
 IF current_cfg IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Showcase changed in another session. Reload saved settings before saving.'; END IF;
 cfg:=_settings;
 IF jsonb_typeof(cfg) IS DISTINCT FROM 'object' OR octet_length(cfg::text)>18000 OR jsonb_typeof(cfg->'version') IS DISTINCT FROM 'number' OR (cfg->>'version') IS DISTINCT FROM '1'
 OR jsonb_typeof(cfg->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(cfg->'items') IS DISTINCT FROM 'array'
 OR jsonb_array_length(cfg->'items')>12 OR (SELECT count(*) FROM jsonb_object_keys(cfg))<>3 THEN RAISE EXCEPTION 'Invalid Showcase settings'; END IF;
 IF (SELECT count(DISTINCT entry->>'id') FROM jsonb_array_elements(cfg->'items') entry)<>jsonb_array_length(cfg->'items') THEN RAISE EXCEPTION 'Duplicate Showcase poster'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(cfg->'items') LOOP
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>6
  OR coalesce(p->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR coalesce(p->>'audience','') NOT IN ('men','women') OR jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p->'title') IS DISTINCT FROM 'string' OR length(btrim(p->>'title')) NOT BETWEEN 1 AND 60
  OR p->'productId' IS NULL THEN RAISE EXCEPTION 'Invalid Showcase poster'; END IF;
  IF p->'productId'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.products WHERE id::text=p->>'productId' AND catalog_visible AND status IS DISTINCT FROM 'inactive') THEN RAISE EXCEPTION 'Choose a catalog-visible product'; END IF;
  im:=p->'image';
  IF jsonb_typeof(im) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Choose a poster image'; END IF;
  IF im->>'kind'='seed' THEN
   IF (SELECT count(*) FROM jsonb_object_keys(im))<>2 OR NOT ((p->>'audience'='men' AND coalesce(im->>'key','') IN ('yorker','boldfit','flyo')) OR (p->>'audience'='women' AND coalesce(im->>'key','') IN ('tradition','desi','hetro'))) THEN RAISE EXCEPTION 'Invalid starter poster'; END IF;
  ELSIF im->>'kind'='upload' THEN
   IF (SELECT count(*) FROM jsonb_object_keys(im))<>6 OR coalesce(im->>'path','') !~ '^showcase/[0-9a-f-]{36}[.]webp$'
   OR jsonb_typeof(im->'bytes') IS DISTINCT FROM 'number' OR jsonb_typeof(im->'thumbnailBytes') IS DISTINCT FROM 'number' OR jsonb_typeof(im->'width') IS DISTINCT FROM 'number' OR jsonb_typeof(im->'height') IS DISTINCT FROM 'number'
   OR coalesce((im->>'bytes')::integer,0) NOT BETWEEN 1 AND 409600 OR coalesce((im->>'thumbnailBytes')::integer,0) NOT BETWEEN 1 AND 40960
   OR coalesce((im->>'width')::integer,0) NOT BETWEEN 1 AND 1600 OR coalesce((im->>'height')::integer,0) NOT BETWEEN 1 AND 1600 THEN RAISE EXCEPTION 'Invalid compressed Showcase image'; END IF;
   thumb:=regexp_replace(im->>'path','[.]webp$','-thumb.webp');
   IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name=im->>'path' AND metadata->>'mimetype'='image/webp' AND (metadata->>'size')::bigint=(im->>'bytes')::bigint)
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name=thumb AND metadata->>'mimetype'='image/webp' AND (metadata->>'size')::bigint=(im->>'thumbnailBytes')::bigint) THEN RAISE EXCEPTION 'Upload is missing or changed. Reload and retry.'; END IF;
  ELSE RAISE EXCEPTION 'Invalid poster image type'; END IF;
 END LOOP;
 UPDATE public.store_settings SET offer_showcase=cfg WHERE id=1;
 RETURN cfg;
END $f$;
REVOKE ALL ON FUNCTION public.showcase_photo_in_use(text),public.is_catalog_showcase_photo(text),public.public_catalog_showcase(text),public.owner_catalog_showcase(),public.save_catalog_showcase(jsonb,jsonb),public.unused_catalog_showcase_photos(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_catalog_showcase_photo(text),public.public_catalog_showcase(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.showcase_photo_in_use(text),public.owner_catalog_showcase(),public.save_catalog_showcase(jsonb,jsonb),public.unused_catalog_showcase_photos(text[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Both should return true. This does not publish the site or enable/change a poster.
SELECT to_regprocedure('public.public_catalog_showcase(text)') IS NOT NULL AS showcase_public_ready,
       to_regprocedure('public.save_catalog_showcase(jsonb,jsonb)') IS NOT NULL AS showcase_owner_ready;
