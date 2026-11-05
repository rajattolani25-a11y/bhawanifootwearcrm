-- Read-only verification after explicitly approved installation.
SELECT
 to_regprocedure('public.catalog_bargain_bid(uuid,uuid,numeric)') IS NOT NULL AS bidding_ready,
 to_regprocedure('public.create_catalog_bargain_order(uuid,text,text,text,text,text,text,uuid,jsonb,uuid,uuid)') IS NOT NULL AS bargain_order_ready,
 to_regprocedure('public.save_catalog_bargain_policy(uuid,jsonb,uuid)') IS NOT NULL AS owner_controls_ready,
 (SELECT relrowsecurity FROM pg_class WHERE oid='public.catalog_bargain_policies'::regclass) AS policies_protected,
 (SELECT relrowsecurity FROM pg_class WHERE oid='public.catalog_bargain_sessions'::regclass) AS sessions_protected,
 position('public.catalog_bargain_sessions' IN pg_get_functiondef('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure))>0 AS reset_compatible;
