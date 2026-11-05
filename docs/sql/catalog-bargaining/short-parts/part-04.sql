BEGIN;
-- Include new business records in backup/restore/reset without changing their safety checks.
-- Guard the definition layout and fail atomically on an unsupported backend.
DO $$ DECLARE d text; old_marker text; new_marker text; BEGIN SELECT pg_get_functiondef('public.maintenance_business_tables()'::regprocedure) INTO d;
 IF position('catalog_bargain_policies'IN d)=0 THEN old_marker:='''catalog_bookings'']';
  new_marker:='''catalog_bookings'',''catalog_bargain_policies'',''catalog_bargain_sessions'']';
  IF position(old_marker IN d)=0 THEN RAISE EXCEPTION 'Unsupported maintenance manifest. Stop for review.'; END IF; EXECUTE replace(d,old_marker,new_marker);
 END IF; SELECT pg_get_functiondef('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure) INTO d;
 IF position('public.catalog_bargain_sessions'IN d)=0 THEN old_marker:='TRUNCATE TABLE public.catalog_bookings,';
  IF position(old_marker IN d)=0 THEN RAISE EXCEPTION 'Reclaim reset0029 is required. Stop for review.'; END IF;
  EXECUTE replace(d,old_marker,'TRUNCATE TABLE public.catalog_bargain_sessions, public.catalog_bargain_policies, public.catalog_bookings,'); END IF;
 SELECT pg_get_functiondef('public.restore_store_backup_v2(text,jsonb)'::regprocedure) INTO d;
 IF position('-- optional-bargain-tables-v1'IN d)=0 THEN
  old_marker:=' expected := public.maintenance_business_tables()';
  IF position(old_marker IN d)=0 THEN RAISE EXCEPTION 'Unsupported restore definition. Stop for review.'; END IF;
  new_marker:=E' -- optional-bargain-tables-v1\n _snapshot:=jsonb_set(_snapshot,''{tables}'',jsonb_build_object(''catalog_bargain_policies'',''[]''::jsonb,''catalog_bargain_sessions'',''[]''::jsonb)||(_snapshot->''tables''));\n'||old_marker;
  EXECUTE replace(d,old_marker,new_marker); END IF; END $$; NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.catalog_bargain_enabled() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(p.id),'[]'::jsonb) FROM public.products p JOIN public.catalog_bargain_policies b ON b.product_id=p.id
 WHERE b.enabled AND p.catalog_visible AND p.status='Active' AND EXISTS(SELECT 1 FROM public.store_settings WHERE id=1 AND catalog_enabled) $$;
REVOKE ALL ON FUNCTION public.catalog_bargain_enabled() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.catalog_bargain_enabled() TO anon,authenticated;
COMMIT;
-- Read-only verification after explicitly approved installation.
SELECT
 to_regprocedure('public.catalog_bargain_bid(uuid,uuid,numeric)') IS NOT NULL AS bidding_ready,
 to_regprocedure('public.create_catalog_bargain_order(uuid,text,text,text,text,text,text,uuid,jsonb,uuid,uuid)') IS NOT NULL AS bargain_order_ready,
 to_regprocedure('public.save_catalog_bargain_policy(uuid,jsonb,uuid)') IS NOT NULL AS owner_controls_ready,
 (SELECT relrowsecurity FROM pg_class WHERE oid='public.catalog_bargain_policies'::regclass) AS policies_protected,
 (SELECT relrowsecurity FROM pg_class WHERE oid='public.catalog_bargain_sessions'::regclass) AS sessions_protected,
 position('public.catalog_bargain_sessions' IN pg_get_functiondef('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure))>0 AS reset_compatible;
