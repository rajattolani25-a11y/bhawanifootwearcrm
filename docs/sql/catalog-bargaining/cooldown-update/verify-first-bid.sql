SELECT
 position('s.attempts=0 AND _offer<ceil(v.selling_price*0.75)'IN pg_get_functiondef('public.catalog_bargain_bid(uuid,uuid,numeric)'::regprocedure))>0 AS legacy_first_bid_protected,
 position('s.attempts=0 AND _offer<ceil(v.selling_price*0.75)'IN pg_get_functiondef('public.catalog_bargain_bid_v2(uuid,uuid,numeric,boolean)'::regprocedure))>0 AS current_first_bid_protected;
