-- Manual fix: show the saved Everyone Live design without a schedule.
-- Does not enable OFF campaigns, extend coupons or change other audiences.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(452198, 1);
DO $fix$
DECLARE s record; c jsonb; i integer;
BEGIN
  SELECT offer_enabled, catalog_enabled, offer_promotion INTO s
  FROM public.store_settings WHERE id = 1 FOR UPDATE;
  IF NOT coalesce(s.offer_enabled, false)
     OR NOT coalesce(s.catalog_enabled, false) THEN
    RAISE EXCEPTION 'Catalog/promotions are OFF. Review owner settings first.';
  END IF;
  SELECT value, (ordinality - 1)::integer INTO c, i
  FROM jsonb_array_elements(s.offer_promotion->'campaigns') WITH ORDINALITY
  WHERE value->>'audience' = 'all';
  IF c IS NULL OR (c->>'enabled')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'No enabled Everyone promotion. Review owner settings first.';
  END IF;
  IF c->'schedule' IS DISTINCT FROM 'null'::jsonb THEN
    IF NOT coalesce((c->'schedule'->>'endsAt')::timestamptz <= now(), false) THEN
      RAISE EXCEPTION 'Schedule is not expired. No promotion was changed.';
    END IF;
    UPDATE public.store_settings
    SET offer_promotion = jsonb_set(
      offer_promotion, ARRAY['campaigns', i::text, 'schedule'], 'null'::jsonb, false
    ) WHERE id = 1;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.public_catalog_promotion()->'campaigns') x
    WHERE x->'campaign'->>'audience' = 'all'
      AND x->'campaign'->'schedule' = 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'Public coupon/catalog is unavailable. No changes were committed.';
  END IF;
END $fix$;
COMMIT;
SELECT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.public_catalog_promotion()->'campaigns') x
  WHERE x->'campaign'->>'audience' = 'all'
    AND x->'campaign'->'schedule' = 'null'::jsonb
) AS live_promotion_ready;
