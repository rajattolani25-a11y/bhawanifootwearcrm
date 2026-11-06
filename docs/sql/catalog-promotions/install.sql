-- Definitions only; no reset/sale/file upload is executed. Run this whole file once.
BEGIN;
DO $guard$ BEGIN IF to_regprocedure('public.owner_catalog_promotion_storage()') IS NOT NULL THEN RAISE EXCEPTION 'Photo storage is already installed. Use photo-storage.sql instead of replaying this older base installer.'; END IF; END $guard$;
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
CREATE OR REPLACE FUNCTION public.save_catalog_promotion(_settings jsonb,_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE cfg jsonb; campaign jsonb; slot jsonb; im jsonb; k text; s jsonb; c public.coupons%ROWTYPE; a timestamptz; b timestamptz; e timestamptz;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'owner'),false) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM 1 FROM public.store_settings WHERE id=1 FOR UPDATE;
 IF _expected IS DISTINCT FROM public.owner_catalog_promotion() THEN RAISE EXCEPTION 'Promotion settings changed. Reload before saving.'; END IF;
 cfg := _settings->'config';
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
    IF jsonb_typeof(im) IS DISTINCT FROM 'object' OR coalesce(im->>'url','') !~ '^https://res[.]cloudinary[.]com/[a-z0-9_-]+/image/upload/[A-Za-z0-9_.,!~*''()/%:-]+$'
    OR coalesce(im->>'publicId','') !~ '^solestack-promotions/[a-z0-9_-]+/(all|men|women)/(advance|live)/[a-f0-9-]{36}$'
    OR coalesce((im->>'bytes')::integer,0) NOT BETWEEN 1 AND 716800
    OR coalesce((im->>'width')::integer,0) NOT BETWEEN 1 AND 1600 OR coalesce((im->>'height')::integer,0) NOT BETWEEN 1 AND 1600 THEN RAISE EXCEPTION 'Invalid external poster'; END IF;
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
 RETURN public.owner_catalog_promotion();
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
REVOKE ALL ON FUNCTION public.owner_catalog_promotion(),public.save_catalog_promotion(jsonb,jsonb),public.public_catalog_promotion() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_catalog_promotion(),public.save_catalog_promotion(jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_catalog_promotion() TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
