-- Approved rule: Regular Rs 100 / Premium Rs 200, every fifth eligible visit.
-- Future rewards only. Existing vouchers, bills and visit counts are not updated.
BEGIN;

CREATE OR REPLACE FUNCTION public.reward_amount(_card text, _m integer)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _m IN (5, 10, 15, 20) AND _card = 'regular' THEN 100
    WHEN _m IN (5, 10, 15, 20) AND _card = 'premium' THEN 200
    ELSE 0
  END
$$;

-- Patch only the two milestone conditions in the CURRENT billing definition.
-- Preserve its stock, payment, discount, coupon, GST and daily stamp logic.
-- Unexpected live definitions fail atomically instead of being overwritten.
DO $patch$
DECLARE
  definition text;
  old_count integer;
  new_count integer;
  old_pattern text := 'v_new\s+in\s*\(\s*5\s*,\s*10\s*,\s*20\s*\)';
  new_pattern text := 'v_new\s+in\s*\(\s*5\s*,\s*10\s*,\s*15\s*,\s*20\s*\)';
BEGIN
  SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure)
    INTO definition;
  SELECT count(*) INTO old_count FROM regexp_matches(definition, old_pattern, 'gi');
  SELECT count(*) INTO new_count FROM regexp_matches(definition, new_pattern, 'gi');
  IF old_count = 2 AND new_count = 0 THEN
    EXECUTE regexp_replace(definition, old_pattern, 'v_new in (5,10,15,20)', 'gi');
  ELSIF NOT (old_count = 0 AND new_count = 2) THEN
    RAISE EXCEPTION 'Unexpected loyalty milestone code. No changes committed; share this error for a compatible patch.';
  END IF;
END $patch$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Read-only verification: all three results should be true.
SELECT
  (SELECT bool_and(public.reward_amount('regular', m) = 100)
   FROM (VALUES (5),(10),(15),(20)) milestones(m)) AS regular_fixed_100,
  (SELECT bool_and(public.reward_amount('premium', m) = 200)
   FROM (VALUES (5),(10),(15),(20)) milestones(m)) AS premium_fixed_200,
  (SELECT count(*) = 2
   FROM regexp_matches(
     pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure),
     'v_new\s+in\s*\(\s*5\s*,\s*10\s*,\s*15\s*,\s*20\s*\)', 'gi'
   )) AS every_fifth_visit_ready;
