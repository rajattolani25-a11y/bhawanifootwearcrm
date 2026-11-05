-- Run after the cooldown/four-bid update. Definition patch only; no order/payment/reset is executed.
BEGIN;
DO $minimum$
DECLARE signature text;d text;pattern text;guard text;
BEGIN
 guard:='IF s.attempts=0 AND _offer<ceil(v.selling_price*0.75) THEN RAISE EXCEPTION USING MESSAGE=''Your first offer must be at least 75% of the listed price.'';END IF;';
 pattern:='IF[[:space:]]+_offer[[:space:]]*>=[[:space:]]*floor_price[[:space:]]+THEN';
 FOREACH signature IN ARRAY ARRAY['public.catalog_bargain_bid(uuid,uuid,numeric)','public.catalog_bargain_bid_v2(uuid,uuid,numeric,boolean)']LOOP
  IF to_regprocedure(signature)IS NULL THEN RAISE EXCEPTION 'Apply the cooldown update first';END IF;
  SELECT pg_get_functiondef(to_regprocedure(signature))INTO d;
  IF position(guard IN d)=0 THEN
   IF position('Your first offer must be at least 75%'IN d)>0 OR(SELECT count(*)FROM regexp_matches(d,pattern,'gi'))<>1 THEN RAISE EXCEPTION 'Unexpected bargaining definition: %. Stop for review',signature;END IF;
   EXECUTE regexp_replace(d,pattern,guard||E'\n IF _offer>=floor_price THEN','i');
  END IF;
 END LOOP;
END $minimum$;
NOTIFY pgrst,'reload schema';
COMMIT;
