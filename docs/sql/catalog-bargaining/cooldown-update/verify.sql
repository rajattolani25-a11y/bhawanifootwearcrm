SELECT
 EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.catalog_bargain_sessions'::regclass AND conname='catalog_bargain_sessions_attempts_check'AND regexp_replace(lower(pg_get_expr(conbin,conrelid)),'[()[:space:]]','','g')='attempts>=0andattempts<=4')AS four_bids_ready,
 to_regprocedure('public.catalog_bargain_state_v2(uuid,uuid)')IS NOT NULL AS cooldown_state_ready,
 to_regprocedure('public.catalog_bargain_bid_v2(uuid,uuid,numeric,boolean)')IS NOT NULL AS cooldown_bids_ready,
 NOT has_function_privilege('anon','public.catalog_bargain_result_v2(public.catalog_bargain_sessions,boolean)','EXECUTE')AS private_result_protected;
