-- Complete promotion settings + private compressed uploads. No reset or file deletion is executed.
BEGIN;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS offer_promotion jsonb DEFAULT NULL;
DO $check$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.store_settings'::regclass AND conname='offer_promotion_bounded') THEN
  ALTER TABLE public.store_settings ADD CONSTRAINT offer_promotion_bounded CHECK (offer_promotion IS NULL OR (jsonb_typeof(offer_promotion)='object' AND octet_length(offer_promotion::text)<=16384));
 END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.owner_catalog_promotion()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RETURN (SELECT jsonb_build_object('enabled',offer_enabled,'title',coalesce(offer_title,''),'subtitle',coalesce(offer_subtitle,''),'coupon',coalesce(offer_coupon,''),'card',offer_card,'config',offer_promotion) FROM public.store_settings WHERE id=1);
END $f$;
CREATE OR REPLACE FUNCTION public.public_catalog_promotion()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
DECLARE s record; c public.coupons%ROWTYPE; campaign jsonb; preview jsonb; result jsonb:='[]'::jsonb;
BEGIN
 SELECT * INTO s FROM public.store_settings WHERE id=1;
 IF s IS NULL OR NOT s.catalog_enabled OR NOT s.offer_enabled THEN RETURN NULL; END IF;
 IF s.offer_promotion IS NULL THEN RETURN jsonb_build_object('legacy',true,'campaigns',result,'now',now()); END IF;
 FOR campaign IN SELECT value FROM jsonb_array_elements(s.offer_promotion->'campaigns') LOOP
  IF (campaign->>'enabled')::boolean IS NOT TRUE THEN CONTINUE; END IF;
  c:=NULL;
  IF coalesce(campaign->>'coupon','')<>'' THEN
   SELECT * INTO c FROM public.coupons WHERE code=upper(btrim(campaign->>'coupon')) AND active AND customer_id IS NULL
    AND (expires_at IS NULL OR expires_at>now()) AND (usage_limit IS NULL OR used_count<usage_limit);
   IF c.id IS NULL THEN CONTINUE; END IF;
   IF c.starts_at>now() AND (campaign->'schedule'='null'::jsonb OR (campaign->'schedule'->>'startsAt')::timestamptz<=now()) THEN CONTINUE; END IF;
  END IF;
  preview:=jsonb_build_object('title',coalesce(nullif(btrim(campaign->>'title'),''),'Store offer'),'subtitle',campaign->>'subtitle','card',true,'code',c.code,'kind',c.kind,'value',c.value,'max_discount',c.max_discount,'min_bill',c.min_bill);
  result:=result||jsonb_build_array(jsonb_build_object('campaign',campaign,'offer',preview));
 END LOOP;
 RETURN jsonb_build_object('legacy',false,'campaigns',result,'now',now());
END $f$;

ALTER TABLE public.store_file_cleanup DROP CONSTRAINT IF EXISTS store_file_cleanup_reason_check;
ALTER TABLE public.store_file_cleanup ADD CONSTRAINT store_file_cleanup_reason_check CHECK(reason IN ('reset','restore','promotion'));
CREATE OR REPLACE FUNCTION public.promotion_photo_in_use(_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
 SELECT EXISTS(SELECT 1 FROM public.store_settings s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.offer_promotion->'campaigns','[]'::jsonb)) c CROSS JOIN LATERAL (VALUES(c->'advance'->'image'),(c->'live'->'image')) p(v) WHERE s.id=1 AND v->>'storage'='shop' AND v->>'path'=_path)
$f$;
REVOKE ALL ON FUNCTION public.promotion_photo_in_use(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.promotion_photo_in_use(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.is_catalog_promotion_photo(_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(public.public_catalog_promotion()->'campaigns','[]'::jsonb)) x CROSS JOIN LATERAL (SELECT x->'campaign' AS c) q
 WHERE (c->'schedule'='null'::jsonb OR (now()>=(c->'schedule'->>'announceAt')::timestamptz AND now()<(c->'schedule'->>'endsAt')::timestamptz))
 AND c->(CASE WHEN c->'schedule'<>'null'::jsonb AND now()<(c->'schedule'->>'startsAt')::timestamptz THEN 'advance' ELSE 'live' END)->'image'->>'storage'='shop'
 AND c->(CASE WHEN c->'schedule'<>'null'::jsonb AND now()<(c->'schedule'->>'startsAt')::timestamptz THEN 'advance' ELSE 'live' END)->'image'->>'path'=_path)
$f$;
REVOKE ALL ON FUNCTION public.is_catalog_promotion_photo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_catalog_promotion_photo(text) TO anon,authenticated;
DROP POLICY IF EXISTS "Public reads current promotion photos" ON storage.objects;
CREATE POLICY "Public reads current promotion photos" ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='catalog-hero-images' AND public.is_catalog_promotion_photo(name));
DROP POLICY IF EXISTS "Protect saved promotion photos" ON storage.objects;
CREATE POLICY "Protect saved promotion photos" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'catalog-hero-images' OR NOT public.promotion_photo_in_use(name));
DROP POLICY IF EXISTS "Keep promotion photo identities immutable" ON storage.objects;
CREATE POLICY "Keep promotion photo identities immutable" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'catalog-hero-images' OR name NOT LIKE 'promotions/%') WITH CHECK(bucket_id<>'catalog-hero-images' OR name NOT LIKE 'promotions/%');
CREATE OR REPLACE FUNCTION public.prepare_catalog_promotion_photo(_audience text,_slot text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE p text;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _audience NOT IN ('all','men','women') OR _slot NOT IN ('advance','live') OR _audience IS NULL OR _slot IS NULL THEN RAISE EXCEPTION 'Invalid promotion slot'; END IF;
 PERFORM public.maintenance_lock_store();
 p:='promotions/'||_audience||'/'||_slot||'/'||gen_random_uuid()::text||'.webp';
 RETURN p;
END $f$;
REVOKE ALL ON FUNCTION public.prepare_catalog_promotion_photo(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_catalog_promotion_photo(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.owner_catalog_promotion_storage() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RETURN jsonb_build_object('version',1,'photo_bytes',(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name LIKE 'promotions/%'),'photos',(SELECT count(*) FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name LIKE 'promotions/%'),
 'pending',(SELECT coalesce(jsonb_agg(path),'[]'::jsonb) FROM (SELECT path FROM public.store_file_cleanup WHERE bucket='catalog-hero-images' AND reason='promotion' AND NOT public.promotion_photo_in_use(path) UNION SELECT name AS path FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name ~ '^promotions/(all|men|women)/(advance|live)/[a-f0-9-]{36}[.]webp$' AND created_at<now()-interval '1 hour' AND NOT public.promotion_photo_in_use(name) LIMIT 50) q));
END $f$;
REVOKE ALL ON FUNCTION public.owner_catalog_promotion_storage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_catalog_promotion_storage() TO authenticated;
CREATE OR REPLACE FUNCTION public.save_catalog_promotion(_settings jsonb,_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE cfg jsonb; campaign jsonb; slot jsonb; im jsonb; k text; s jsonb; c public.coupons%ROWTYPE; a timestamptz; b timestamptz; e timestamptz;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM public.maintenance_lock_store();
 PERFORM 1 FROM public.store_settings WHERE id=1 FOR UPDATE;
 IF _expected IS DISTINCT FROM public.owner_catalog_promotion() THEN RAISE EXCEPTION 'Promotion settings changed. Reload before saving.'; END IF;
 cfg := _settings->'config';
 INSERT INTO public.store_file_cleanup(bucket,path,reason) SELECT 'catalog-hero-images',v->>'path','promotion' FROM jsonb_array_elements(coalesce((SELECT offer_promotion->'campaigns' FROM public.store_settings WHERE id=1),'[]'::jsonb)) old_campaign CROSS JOIN LATERAL (VALUES(old_campaign->'advance'->'image'),(old_campaign->'live'->'image')) p(v) WHERE v->>'storage'='shop' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'campaigns') n WHERE n->'advance'->'image'->>'path'=v->>'path' OR n->'live'->'image'->>'path'=v->>'path') ON CONFLICT(bucket,path) DO UPDATE SET reason='promotion',created_at=clock_timestamp();
 IF jsonb_typeof(_settings) IS DISTINCT FROM 'object' OR octet_length(_settings::text)>18000
 OR jsonb_typeof(_settings->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(_settings->'card') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(_settings->'title') IS DISTINCT FROM 'string' OR length(_settings->>'title')>60
 OR jsonb_typeof(_settings->'subtitle') IS DISTINCT FROM 'string' OR length(_settings->>'subtitle')>120
 OR jsonb_typeof(_settings->'coupon') IS DISTINCT FROM 'string' OR length(_settings->>'coupon')>30
 OR jsonb_typeof(cfg) IS DISTINCT FROM 'object' OR (cfg->>'version') IS DISTINCT FROM '1'
 OR jsonb_typeof(cfg->'campaigns') IS DISTINCT FROM 'array' OR jsonb_array_length(cfg->'campaigns')>3 THEN RAISE EXCEPTION 'Invalid promotion settings'; END IF;
 IF (SELECT count(DISTINCT x->>'audience') FROM jsonb_array_elements(cfg->'campaigns') x) <> jsonb_array_length(cfg->'campaigns') THEN RAISE EXCEPTION 'Use one promotion per audience'; END IF;
 FOR campaign IN SELECT value FROM jsonb_array_elements(cfg->'campaigns') LOOP
  IF jsonb_typeof(campaign) IS DISTINCT FROM 'object' OR coalesce(campaign->>'audience','') NOT IN ('all','men','women')
  OR jsonb_typeof(campaign->'enabled') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(campaign->'title') IS DISTINCT FROM 'string' OR length(campaign->>'title')>60
  OR jsonb_typeof(campaign->'subtitle') IS DISTINCT FROM 'string' OR length(campaign->>'subtitle')>120
  OR jsonb_typeof(campaign->'coupon') IS DISTINCT FROM 'string' OR length(campaign->>'coupon')>30
  OR jsonb_typeof(campaign->'productIds') IS DISTINCT FROM 'array' OR jsonb_array_length(campaign->'productIds')>2 THEN RAISE EXCEPTION 'Invalid campaign'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(campaign->'productIds') x WHERE x !~ '^[a-f0-9-]{36}$' OR NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id::text=x AND p.catalog_visible)) THEN RAISE EXCEPTION 'Choose catalog-visible products'; END IF;
  FOREACH k IN ARRAY ARRAY['advance','live'] LOOP
   slot := campaign->k; im := slot->'image';
   IF jsonb_typeof(slot) IS DISTINCT FROM 'object' OR coalesce(slot->>'layout','') NOT IN ('classic','split') OR im IS NULL THEN RAISE EXCEPTION 'Invalid promotion layout'; END IF;
   IF im <> 'null'::jsonb THEN
    IF im->>'storage'='shop' THEN
     IF coalesce(im->>'path','') !~ ('^promotions/'||(campaign->>'audience')||'/'||k||'/[a-f0-9-]{36}[.]webp$')
     OR coalesce((im->>'bytes')::integer,0) NOT BETWEEN 1 AND 409600
     OR coalesce((im->>'width')::integer,0) NOT BETWEEN 1 AND 1600 OR coalesce((im->>'height')::integer,0) NOT BETWEEN 1 AND 1600
     OR im ? 'url' OR im ? 'publicId' THEN RAISE EXCEPTION 'Invalid compressed promotion photo'; END IF;
     IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='catalog-hero-images' AND o.name=im->>'path' AND (o.metadata->>'size')::bigint=(im->>'bytes')::bigint AND o.metadata->>'mimetype'='image/webp') THEN RAISE EXCEPTION 'Promotion upload is missing or incomplete. Upload the photo again.'; END IF;
    ELSE
     IF jsonb_typeof(im) IS DISTINCT FROM 'object' OR coalesce(im->>'url','') !~ '^https://res[.]cloudinary[.]com/[a-z0-9_-]+/image/upload/[A-Za-z0-9_.,!~*''()/%:-]+$'
     OR coalesce(im->>'publicId','') !~ '^solestack-promotions/[a-z0-9_-]+/(all|men|women)/(advance|live)/[a-f0-9-]{36}$'
     OR coalesce((im->>'bytes')::integer,0) NOT BETWEEN 1 AND 716800
     OR coalesce((im->>'width')::integer,0) NOT BETWEEN 1 AND 1600 OR coalesce((im->>'height')::integer,0) NOT BETWEEN 1 AND 1600 THEN RAISE EXCEPTION 'Invalid external poster'; END IF;
    END IF;
   END IF;
  END LOOP;
  s := campaign->'schedule'; a:=NULL; b:=NULL; e:=NULL;
  IF s IS NULL THEN RAISE EXCEPTION 'Missing promotion schedule'; END IF;
  IF s <> 'null'::jsonb THEN
   a:=(s->>'announceAt')::timestamptz; b:=(s->>'startsAt')::timestamptz; e:=(s->>'endsAt')::timestamptz;
   IF a IS NULL OR b IS NULL OR e IS NULL OR NOT isfinite(a) OR NOT isfinite(b) OR NOT isfinite(e) OR a>b OR b>=e THEN RAISE EXCEPTION 'Choose valid announce, start and end times'; END IF;
  END IF;
  IF btrim(campaign->>'coupon')<>'' THEN
   SELECT * INTO c FROM public.coupons WHERE code=upper(btrim(campaign->>'coupon')) AND active AND customer_id IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active public coupon'; END IF;
   IF b IS NOT NULL AND ((c.starts_at IS NOT NULL AND b<c.starts_at) OR (c.expires_at IS NOT NULL AND e>c.expires_at)) THEN RAISE EXCEPTION 'Sale times must fall within coupon validity. Edit the coupon first.'; END IF;
  END IF;
 END LOOP;
 UPDATE public.store_settings SET offer_enabled=(_settings->>'enabled')::boolean,offer_title=nullif(btrim(_settings->>'title'),''),offer_subtitle=nullif(btrim(_settings->>'subtitle'),''),offer_coupon=nullif(upper(btrim(_settings->>'coupon')),''),offer_card=(_settings->>'card')::boolean,offer_promotion=cfg WHERE id=1;
 DELETE FROM public.store_file_cleanup WHERE bucket='catalog-hero-images' AND reason='promotion' AND public.promotion_photo_in_use(path);
 RETURN public.owner_catalog_promotion();
END $f$;
REVOKE ALL ON FUNCTION public.owner_catalog_promotion(),public.save_catalog_promotion(jsonb,jsonb),public.public_catalog_promotion() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_catalog_promotion(),public.save_catalog_promotion(jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_catalog_promotion() TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
