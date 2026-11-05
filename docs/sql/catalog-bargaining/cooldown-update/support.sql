-- Manual review update: four bids, then a 30-minute cooldown after quote expiry. No daily round cap.
-- Adds scoped functions and widens only the existing attempts CHECK from 2 to 4. Billing/order RPCs are unchanged.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.catalog_bargain_bid(uuid,uuid,numeric)')IS NULL THEN RAISE EXCEPTION 'Install existing bargaining support first';END IF;
END $$;
DO $limit$
DECLARE rule text;
BEGIN
 SELECT regexp_replace(lower(pg_get_expr(conbin,conrelid)),'[()[:space:]]','','g')INTO rule FROM pg_constraint
 WHERE conrelid='public.catalog_bargain_sessions'::regclass AND conname='catalog_bargain_sessions_attempts_check'AND contype='c';
 IF rule IS NULL OR rule NOT IN('attempts>=0andattempts<=2','attempts>=0andattempts<=3','attempts>=0andattempts<=4')THEN RAISE EXCEPTION 'Unexpected bargaining attempt constraint. Stop for review';END IF;
 IF rule<>'attempts>=0andattempts<=4'THEN
  ALTER TABLE public.catalog_bargain_sessions DROP CONSTRAINT catalog_bargain_sessions_attempts_check;
  ALTER TABLE public.catalog_bargain_sessions ADD CONSTRAINT catalog_bargain_sessions_attempts_check CHECK(attempts BETWEEN 0 AND 4);
 END IF;
END $limit$;
CREATE OR REPLACE FUNCTION public.catalog_bargain_result_v2(_s public.catalog_bargain_sessions,_duplicate boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE retry_at timestamptz;
BEGIN
 IF _s.order_request_id IS NULL AND(_s.attempts>=4 OR _s.state='accepted')THEN
  retry_at:=_s.expires_at+interval'30 minutes';
 END IF;
 RETURN public.catalog_bargain_result(_s,_duplicate)||jsonb_build_object('retry_at',retry_at,'order_placed',_s.order_request_id IS NOT NULL,'cooldown_supported',true,'bid_limit',4);
END $$;
REVOKE ALL ON FUNCTION public.catalog_bargain_result_v2(public.catalog_bargain_sessions,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_state_v2(_variant_id uuid,_client uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.catalog_bargain_sessions%ROWTYPE;
BEGIN
 IF _client IS NULL THEN RAISE EXCEPTION 'Customer session required';END IF;
 SELECT q.*INTO s FROM public.catalog_bargain_sessions q JOIN public.product_variants v ON v.product_id=q.product_id
 JOIN public.products p ON p.id=v.product_id JOIN public.catalog_bargain_policies b ON b.product_id=p.id
 WHERE v.id=_variant_id AND q.client_hash=md5(_client::text)AND q.generation=(SELECT generation FROM public.store_reset_state WHERE id=1)
 AND b.enabled AND b.revision=q.policy_revision AND p.selling_price=q.listed_price AND p.status='Active'AND p.catalog_visible
 AND q.created_at>clock_timestamp()-interval'24 hours'AND EXISTS(SELECT 1 FROM public.store_settings WHERE id=1 AND catalog_enabled);
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.catalog_bargain_result_v2(s);
END $$;
REVOKE ALL ON FUNCTION public.catalog_bargain_state_v2(uuid,uuid)FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_bargain_state_v2(uuid,uuid)TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_bid_v2(_variant_id uuid,_client uuid,_offer numeric,_restart boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; p public.catalog_bargain_policies%ROWTYPE; s public.catalog_bargain_sessions%ROWTYPE; generation uuid;
 floor_price numeric; ceiling numeric; next_price numeric; fraction numeric; retry_at timestamptz; instant timestamptz;
BEGIN
 IF _restart IS NULL THEN RAISE EXCEPTION 'Invalid restart option';END IF;
 IF _client IS NULL OR _offer IS NULL OR _offer<=0 OR _offer<>round(_offer,2) OR _offer::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid offer amount.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bargain:'||_client::text,41));
 DELETE FROM public.catalog_bargain_sessions WHERE id IN(SELECT id FROM public.catalog_bargain_sessions WHERE created_at<clock_timestamp()-interval'24 hours' ORDER BY created_at LIMIT 100);
 IF NOT EXISTS(SELECT 1 FROM public.store_settings WHERE id=1 AND catalog_enabled AND nullif(btrim(upi_id),'')IS NOT NULL AND (booking_enabled AND pickup_enabled OR delivery_enabled OR outside_enabled)) THEN RAISE EXCEPTION 'Ordering is unavailable'; END IF;
 SELECT pv.*,pr.selling_price,pr.catalog_visible,pr.status INTO v FROM public.product_variants pv JOIN public.products pr ON pr.id=pv.product_id WHERE pv.id=_variant_id FOR UPDATE OF pv;
 IF NOT FOUND OR NOT v.catalog_visible OR v.status<>'Active' OR v.stock<1 THEN RAISE EXCEPTION 'This selection is unavailable.'; END IF;
 IF _offer>=v.selling_price THEN RAISE EXCEPTION 'Enter an offer below the listed price.'; END IF;
 SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=v.product_id FOR SHARE;
 IF NOT FOUND OR NOT p.enabled THEN RAISE EXCEPTION 'Bargaining is unavailable for this pair.'; END IF;
 SELECT r.generation INTO generation FROM public.store_reset_state r WHERE id=1;
 floor_price:=ceil((v.selling_price-CASE WHEN p.kind='percent'THEN v.selling_price*p.max_discount/100 ELSE p.max_discount END)/p.rounding)*p.rounding;
 ceiling:=least(v.selling_price,floor((v.selling_price-CASE WHEN p.kind='percent'THEN v.selling_price*p.min_discount/100 ELSE p.min_discount END)/p.rounding)*p.rounding);
 IF floor_price<=0 OR floor_price>ceiling OR floor_price>=v.selling_price THEN RAISE EXCEPTION 'The store needs to update bargaining rules for this price.'; END IF;
 SELECT * INTO s FROM public.catalog_bargain_sessions WHERE product_id=v.product_id AND client_hash=md5(_client::text) FOR UPDATE;
 IF FOUND AND(s.generation IS DISTINCT FROM generation OR s.policy_revision IS DISTINCT FROM p.revision OR s.listed_price IS DISTINCT FROM v.selling_price) THEN
  DELETE FROM public.catalog_bargain_sessions WHERE id=s.id; s:=NULL;
 END IF;
 IF s.id IS NULL THEN
  IF(SELECT count(*)FROM public.catalog_bargain_sessions WHERE client_hash=md5(_client::text))>=30 THEN RAISE EXCEPTION 'Please complete an existing negotiation first.'; END IF;
  INSERT INTO public.catalog_bargain_sessions(product_id,variant_id,client_hash,generation,policy_revision,listed_price,price,offer)
  VALUES(v.product_id,v.id,md5(_client::text),generation,p.revision,v.selling_price,v.selling_price,_offer)RETURNING * INTO s;
 END IF;
 IF s.order_request_id IS NOT NULL THEN RAISE EXCEPTION 'This deal is already linked to an order. Track the order before trying again.'; END IF;
 instant:=clock_timestamp();
 retry_at:=(public.catalog_bargain_result_v2(s)->>'retry_at')::timestamptz;
 IF _restart AND retry_at IS NOT NULL AND retry_at<=instant THEN
  UPDATE public.catalog_bargain_sessions SET variant_id=v.id,attempts=0,bids='[]',price=v.selling_price,offer=_offer,state='counter',heading=0,quote_id=gen_random_uuid(),created_at=instant,expires_at=instant WHERE id=s.id RETURNING * INTO s;
 ELSIF s.bids @> jsonb_build_array(_offer)THEN
  RETURN public.catalog_bargain_result_v2(s,true)||jsonb_build_object('duplicate_offer',_offer);
 ELSIF _restart AND s.attempts>0 THEN
  RAISE EXCEPTION 'Please wait for the 30-minute cooldown before starting a new bargain.';
 END IF;
 IF s.state='accepted' AND s.attempts>0 THEN RAISE EXCEPTION 'Your offer is already accepted. Use the current price or wait for the next round.';END IF;
 IF s.attempts>=4 THEN RAISE EXCEPTION 'All bids have been used. Start a new bargain after the cooldown.';END IF;
 -- An unused distinct bid stays available after the first quote expires.
 IF _offer>=floor_price THEN
  next_price:=least(floor(_offer/p.rounding)*p.rounding,ceiling,s.price); s.state:='accepted';
 ELSIF s.attempts>0 AND _offer-s.offer<p.rounding THEN next_price:=s.price;s.state:='held';
 ELSE
  fraction:=CASE WHEN s.attempts=0 THEN .18+.45*least(1,_offer/v.selling_price)+random()*.18
   ELSE least(.94,(v.selling_price-s.price)/(v.selling_price-floor_price)+(.08+random()*.12)*least(1,(_offer-s.offer)/greatest(p.rounding,floor_price-s.offer))) END;
  next_price:=greatest(floor_price,least(ceiling,ceil((v.selling_price-(v.selling_price-floor_price)*fraction)/p.rounding)*p.rounding,s.price));
  -- Leave room above the owner's floor when multiple rounded price points exist.
  IF ceiling>floor_price THEN next_price:=greatest(floor_price+p.rounding,next_price); END IF;
  s.state:=CASE WHEN s.attempts=0 THEN 'counter' WHEN next_price<s.price THEN 'closer' ELSE 'held' END;
 END IF;
 s.attempts:=s.attempts+1;
 -- attempts=4 makes the response final; retain honest progress/held wording for the heading.
 s.heading:=(s.heading+1+floor(random()*2)::integer)%3;
 UPDATE public.catalog_bargain_sessions SET variant_id=v.id,price=next_price,offer=_offer,attempts=s.attempts,bids=bids||jsonb_build_array(_offer),quote_id=gen_random_uuid(),state=s.state,heading=s.heading,expires_at=clock_timestamp()+interval'3 minutes' WHERE id=s.id RETURNING * INTO s;
 RETURN public.catalog_bargain_result_v2(s);
END $$;
REVOKE ALL ON FUNCTION public.catalog_bargain_bid_v2(uuid,uuid,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_bargain_bid_v2(uuid,uuid,numeric,boolean) TO anon,authenticated;

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
