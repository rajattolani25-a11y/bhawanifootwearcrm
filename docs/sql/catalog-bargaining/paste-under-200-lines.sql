-- REVIEW / MANUAL APPROVAL REQUIRED. New optional bargaining support; no live application by Codex.
-- Requires existing operations update 0040. Applying definitions NEVER creates a sale or resets data.
BEGIN; DO $$ BEGIN IF public.operational_safety_version()<>40 THEN RAISE EXCEPTION 'Apply and verify operations update 0040 first'; END IF; END $$; CREATE TABLE IF NOT EXISTS public.catalog_bargain_policies (
 product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false, kind text NOT NULL CHECK(kind IN('amount','percent')),
 min_discount numeric NOT NULL DEFAULT 0 CHECK(min_discount>=0 AND min_discount::text NOT IN('NaN','Infinity','-Infinity')),
 max_discount numeric NOT NULL DEFAULT 0 CHECK(max_discount>=min_discount AND max_discount::text NOT IN('NaN','Infinity','-Infinity')),
 rounding integer NOT NULL DEFAULT 5 CHECK(rounding IN(5,10)), revision uuid NOT NULL DEFAULT gen_random_uuid() ); CREATE TABLE IF NOT EXISTS public.catalog_bargain_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
 client_hash text NOT NULL, generation uuid NOT NULL, policy_revision uuid NOT NULL, listed_price numeric NOT NULL, price numeric NOT NULL, offer numeric NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2), bids jsonb NOT NULL DEFAULT '[]',
 quote_id uuid NOT NULL DEFAULT gen_random_uuid(), state text NOT NULL DEFAULT 'counter', heading integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 order_request_id uuid, UNIQUE(product_id,client_hash) ); CREATE INDEX IF NOT EXISTS catalog_bargain_sessions_age ON public.catalog_bargain_sessions(created_at);
ALTER TABLE public.catalog_bargain_policies ENABLE ROW LEVEL SECURITY; ALTER TABLE public.catalog_bargain_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_bargain_policies,public.catalog_bargain_sessions FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.catalog_bargain_policies TO authenticated; DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'AND tablename='catalog_bargain_policies'AND policyname='owner reads bargain rules') THEN
  CREATE POLICY "owner reads bargain rules" ON public.catalog_bargain_policies FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'owner')); END IF; END $$;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS bargain_id uuid;
CREATE OR REPLACE FUNCTION public.owner_catalog_bargain_policy(_product_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.catalog_bargain_policies%ROWTYPE; BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF; SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=_product_id;
 RETURN coalesce(to_jsonb(p)-'product_id',jsonb_build_object('enabled',false,'kind','amount','min_discount',0,'max_discount',0,'rounding',5,'revision',null)); END $$;
REVOKE ALL ON FUNCTION public.owner_catalog_bargain_policy(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.owner_catalog_bargain_policy(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_catalog_bargain_policy(_product_id uuid,_policy jsonb,_expected_revision uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE price numeric; p public.catalog_bargain_policies%ROWTYPE; en boolean:=(_policy->>'enabled')::boolean;
 kind text:=_policy->>'kind'; lo numeric:=(_policy->>'min_discount')::numeric; hi numeric:=(_policy->>'max_discount')::numeric; step integer:=(_policy->>'rounding')::integer; floor_price numeric; ceiling numeric; BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF; SELECT selling_price INTO price FROM public.products WHERE id=_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
 IF en IS NULL OR kind NOT IN('amount','percent') OR kind IS NULL OR step NOT IN(5,10) OR step IS NULL OR lo IS NULL OR hi IS NULL OR lo<0 OR hi<lo OR lo::text IN('NaN','Infinity','-Infinity') OR hi::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid minimum and maximum discount.'; END IF;
 IF en THEN IF price<=0 OR hi<=0 OR kind='percent'AND hi>=100 OR kind='amount'AND hi>=price THEN RAISE EXCEPTION 'The maximum discount must leave a price above zero.'; END IF;
  floor_price:=ceil((price-CASE WHEN kind='percent'THEN price*hi/100 ELSE hi END)/step)*step; ceiling:=floor((price-CASE WHEN kind='percent'THEN price*lo/100 ELSE lo END)/step)*step;
  IF floor_price>ceiling OR floor_price>=price OR floor_price<=0 THEN RAISE EXCEPTION 'This range has no valid rounded bargain price. Widen the range or change rounding.'; END IF; END IF;
 SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=_product_id FOR UPDATE;
 IF p.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'Bargaining rules changed. Reload before saving.'; END IF;
 INSERT INTO public.catalog_bargain_policies(product_id,enabled,kind,min_discount,max_discount,rounding)VALUES(_product_id,en,kind,lo,hi,step)
 ON CONFLICT(product_id)DO UPDATE SET enabled=en,kind=EXCLUDED.kind,min_discount=lo,max_discount=hi,rounding=step,revision=gen_random_uuid(); RETURN public.owner_catalog_bargain_policy(_product_id); END $$;
REVOKE ALL ON FUNCTION public.save_catalog_bargain_policy(uuid,jsonb,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_catalog_bargain_policy(uuid,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_enabled() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(p.id),'[]'::jsonb) FROM public.products p JOIN public.catalog_bargain_policies b ON b.product_id=p.id
 WHERE b.enabled AND p.catalog_visible AND p.status='Active' AND EXISTS(SELECT 1 FROM public.store_settings WHERE id=1 AND catalog_enabled) $$; REVOKE ALL ON FUNCTION public.catalog_bargain_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_bargain_enabled() TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_result(_s public.catalog_bargain_sessions,_duplicate boolean DEFAULT false) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',_s.quote_id,'product_id',_s.product_id,'variant_id',_s.variant_id,'listed_price',_s.listed_price,'price',_s.price,'offer',_s.offer,'attempts',_s.attempts,'state',_s.state,'heading',_s.heading,'expires_at',_s.expires_at,'server_now',clock_timestamp(),'duplicate',_duplicate)
$$; REVOKE ALL ON FUNCTION public.catalog_bargain_result(public.catalog_bargain_sessions,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_state(_variant_id uuid,_client uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s public.catalog_bargain_sessions%ROWTYPE; BEGIN
 IF _client IS NULL THEN RAISE EXCEPTION 'Customer session required'; END IF; SELECT q.* INTO s FROM public.catalog_bargain_sessions q JOIN public.product_variants v ON v.product_id=q.product_id
 JOIN public.products p ON p.id=v.product_id JOIN public.catalog_bargain_policies b ON b.product_id=p.id
 WHERE v.id=_variant_id AND q.client_hash=md5(_client::text) AND q.generation=(SELECT generation FROM public.store_reset_state WHERE id=1)
 AND b.enabled AND b.revision=q.policy_revision AND p.selling_price=q.listed_price AND p.status='Active'AND p.catalog_visible AND q.created_at>clock_timestamp()-interval'24 hours' AND q.order_request_id IS NULL
 AND EXISTS(SELECT 1 FROM public.store_settings WHERE id=1 AND catalog_enabled); IF NOT FOUND THEN RETURN null; END IF;
 -- Two chances are per product/colour, not reset by changing size. The quote remains bound to its exact size.
 RETURN public.catalog_bargain_result(s); END $$; REVOKE ALL ON FUNCTION public.catalog_bargain_state(uuid,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.catalog_bargain_state(uuid,uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_bid(_variant_id uuid,_client uuid,_offer numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; p public.catalog_bargain_policies%ROWTYPE; s public.catalog_bargain_sessions%ROWTYPE; generation uuid; floor_price numeric; ceiling numeric; next_price numeric; fraction numeric; BEGIN
 IF _client IS NULL OR _offer IS NULL OR _offer<=0 OR _offer<>round(_offer,2) OR _offer::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid offer amount.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bargain:'||_client::text,41));
 DELETE FROM public.catalog_bargain_sessions WHERE id IN(SELECT id FROM public.catalog_bargain_sessions WHERE created_at<clock_timestamp()-interval'24 hours' ORDER BY created_at LIMIT 100);
 IF NOT EXISTS(SELECT 1 FROM public.store_settings WHERE id=1 AND catalog_enabled AND nullif(btrim(upi_id),'')IS NOT NULL AND (booking_enabled AND pickup_enabled OR delivery_enabled OR outside_enabled)) THEN RAISE EXCEPTION 'Ordering is unavailable'; END IF;
 SELECT pv.*,pr.selling_price,pr.catalog_visible,pr.status INTO v FROM public.product_variants pv JOIN public.products pr ON pr.id=pv.product_id WHERE pv.id=_variant_id FOR UPDATE OF pv;
 IF NOT FOUND OR NOT v.catalog_visible OR v.status<>'Active' OR v.stock<1 THEN RAISE EXCEPTION 'This selection is unavailable.'; END IF;
 IF _offer>=v.selling_price THEN RAISE EXCEPTION 'Enter an offer below the listed price.'; END IF; SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=v.product_id FOR SHARE;
 IF NOT FOUND OR NOT p.enabled THEN RAISE EXCEPTION 'Bargaining is unavailable for this pair.'; END IF; SELECT r.generation INTO generation FROM public.store_reset_state r WHERE id=1;
 floor_price:=ceil((v.selling_price-CASE WHEN p.kind='percent'THEN v.selling_price*p.max_discount/100 ELSE p.max_discount END)/p.rounding)*p.rounding;
 ceiling:=least(v.selling_price,floor((v.selling_price-CASE WHEN p.kind='percent'THEN v.selling_price*p.min_discount/100 ELSE p.min_discount END)/p.rounding)*p.rounding);
 IF floor_price<=0 OR floor_price>ceiling OR floor_price>=v.selling_price THEN RAISE EXCEPTION 'The store needs to update bargaining rules for this price.'; END IF;
 SELECT * INTO s FROM public.catalog_bargain_sessions WHERE product_id=v.product_id AND client_hash=md5(_client::text) FOR UPDATE;
 IF FOUND AND(s.generation IS DISTINCT FROM generation OR s.policy_revision IS DISTINCT FROM p.revision OR s.listed_price IS DISTINCT FROM v.selling_price) THEN
  DELETE FROM public.catalog_bargain_sessions WHERE id=s.id; s:=NULL; END IF; IF s.id IS NULL THEN
  IF(SELECT count(*)FROM public.catalog_bargain_sessions WHERE client_hash=md5(_client::text))>=30 THEN RAISE EXCEPTION 'Please complete an existing negotiation first.'; END IF;
  INSERT INTO public.catalog_bargain_sessions(product_id,variant_id,client_hash,generation,policy_revision,listed_price,price,offer)
  VALUES(v.product_id,v.id,md5(_client::text),generation,p.revision,v.selling_price,v.selling_price,_offer)RETURNING * INTO s; END IF;
 IF s.order_request_id IS NOT NULL THEN RAISE EXCEPTION 'This deal is already linked to an order. Track the order before trying again.'; END IF;
 IF s.bids @> jsonb_build_array(_offer) THEN RETURN public.catalog_bargain_result(s,true)||jsonb_build_object('duplicate_offer',_offer); END IF;
 IF s.state='accepted' AND s.attempts>0 THEN RAISE EXCEPTION 'Your offer is already accepted. Place the order before it expires.'; END IF;
 IF s.attempts>=2 THEN RAISE EXCEPTION 'Both chances have been used. Accept the current counter before it expires.'; END IF;
 IF s.attempts>0 AND s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'This negotiation has expired.'; END IF; IF _offer>=floor_price THEN
  next_price:=least(floor(_offer/p.rounding)*p.rounding,ceiling,s.price); s.state:='accepted'; ELSIF s.attempts>0 AND _offer-s.offer<p.rounding THEN next_price:=s.price;s.state:='held'; ELSE
  fraction:=CASE WHEN s.attempts=0 THEN .18+.45*least(1,_offer/v.selling_price)+random()*.18
   ELSE least(.94,(v.selling_price-s.price)/(v.selling_price-floor_price)+(.08+random()*.12)*least(1,(_offer-s.offer)/greatest(p.rounding,floor_price-s.offer))) END;
  next_price:=greatest(floor_price,least(ceiling,ceil((v.selling_price-(v.selling_price-floor_price)*fraction)/p.rounding)*p.rounding,s.price));
  -- Leave room above the owner's floor when multiple rounded price points exist.
  IF ceiling>floor_price THEN next_price:=greatest(floor_price+p.rounding,next_price); END IF; s.state:=CASE WHEN s.attempts=0 THEN 'counter' WHEN next_price<s.price THEN 'closer' ELSE 'held' END; END IF;
 s.attempts:=s.attempts+1;
 -- attempts=2 makes the response final; retain honest progress/held wording for the heading.
 s.heading:=(s.heading+1+floor(random()*2)::integer)%3;
 UPDATE public.catalog_bargain_sessions SET variant_id=v.id,price=next_price,offer=_offer,attempts=s.attempts,bids=bids||jsonb_build_array(_offer),quote_id=gen_random_uuid(),state=s.state,heading=s.heading,expires_at=clock_timestamp()+interval'3 minutes' WHERE id=s.id RETURNING * INTO s;
 RETURN public.catalog_bargain_result(s); END $$; REVOKE ALL ON FUNCTION public.catalog_bargain_bid(uuid,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_bargain_bid(uuid,uuid,numeric) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_catalog_bargain_order(_variant_id uuid,_name text,_mobile text,_fulfillment text,_address text,_area text,_coupon text,_request_id uuid,_quote jsonb,_deal_id uuid,_client uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.store_settings%ROWTYPE; v record; b public.catalog_bookings%ROWTYPE; m text:=right(regexp_replace(coalesce(_mobile,''),'\D','','g'),10);
 nm text:=btrim(coalesce(_name,'')); f text:=coalesce(_fulfillment,'pickup'); addr text:=btrim(coalesce(_address,'')); h text;
 deal public.catalog_bargain_sessions%ROWTYPE; policy public.catalog_bargain_policies%ROWTYPE; price numeric; discount numeric:=0; charge numeric:=0; advance numeric; cp jsonb; no text; code text; BEGIN
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Order request identifier required'; END IF;
 h:=md5(jsonb_build_array(_variant_id,nm,m,f,addr,btrim(coalesce(_area,'')),upper(btrim(coalesce(_coupon,''))),_quote,_deal_id,md5(_client::text))::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,37)); SELECT * INTO b FROM public.catalog_bookings WHERE client_request_id=_request_id; IF FOUND THEN
  IF b.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Order retry differs from original request'; END IF;
  IF b.status='pending'AND b.expires_at<=now()OR b.status IN ('cancelled','expired','refunded','refund_pending') THEN RAISE EXCEPTION 'This order is closed. Track it before creating another order.'; END IF; ELSE
  PERFORM public.expire_catalog_bookings(); SELECT * INTO s FROM public.store_settings WHERE id=1;
  IF NOT s.catalog_enabled OR nullif(btrim(s.upi_id),'') IS NULL OR right(regexp_replace(coalesce(s.business_phone,''),'\D','','g'),10) !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Ordering is unavailable. The store must configure UPI and WhatsApp contact.'; END IF;
  IF f NOT IN ('pickup','local','outside') OR f='pickup' AND NOT(s.booking_enabled AND s.pickup_enabled) OR f='local' AND NOT s.delivery_enabled OR f='outside' AND NOT s.outside_enabled THEN RAISE EXCEPTION 'This fulfilment method is unavailable'; END IF;
  IF m !~ '^[6-9][0-9]{9}$' OR length(nm) NOT BETWEEN 2 AND 60 OR f<>'pickup' AND length(addr) NOT BETWEEN 10 AND 300 THEN RAISE EXCEPTION 'Enter valid name, mobile and delivery address'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(m,370));
  IF (SELECT count(*)FROM public.catalog_bookings WHERE mobile=m AND status IN ('pending','confirmed','packed','shipped'))>=3 THEN RAISE EXCEPTION 'You already have 3 open orders. Contact the store.'; END IF;
  SELECT pv.*,p.brand,p.article,p.selling_price,p.catalog_visible,p.status INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=_variant_id FOR UPDATE OF pv;
  IF NOT FOUND OR NOT v.catalog_visible OR v.status<>'Active' THEN RAISE EXCEPTION 'This item is unavailable'; END IF; IF v.stock<1 THEN RAISE EXCEPTION 'Sorry, this size just sold out'; END IF;
  IF nullif(btrim(_coupon),'') IS NOT NULL THEN RAISE EXCEPTION 'Additional offers cannot be combined.'; END IF; SELECT * INTO policy FROM public.catalog_bargain_policies WHERE product_id=v.product_id FOR SHARE;
  SELECT * INTO deal FROM public.catalog_bargain_sessions WHERE quote_id=_deal_id AND client_hash=md5(_client::text) FOR UPDATE;
  IF NOT FOUND OR deal.variant_id IS DISTINCT FROM v.id OR deal.product_id IS DISTINCT FROM v.product_id OR deal.generation IS DISTINCT FROM(SELECT generation FROM public.store_reset_state WHERE id=1)
   OR policy.enabled IS DISTINCT FROM true OR policy.revision IS DISTINCT FROM deal.policy_revision OR deal.listed_price IS DISTINCT FROM v.selling_price OR deal.expires_at<=clock_timestamp()
   OR deal.order_request_id IS NOT NULL THEN RAISE EXCEPTION 'This bargain price has expired or changed. Review the listed price before ordering.'; END IF; price:=deal.price;
  IF f='pickup' THEN advance:=ceil(price*greatest(1,least(100,s.advance_percent))/100.0); ELSE charge:=CASE WHEN f='local' THEN s.local_charge ELSE s.outside_charge END;
   IF f='local' AND s.free_delivery_above IS NOT NULL AND price>=s.free_delivery_above THEN charge:=0; END IF; advance:=price+charge; END IF;
  IF (_quote->>'price')::numeric IS DISTINCT FROM v.selling_price OR (_quote->>'net')::numeric IS DISTINCT FROM price OR (_quote->>'charge')::numeric IS DISTINCT FROM charge OR (_quote->>'advance')::numeric IS DISTINCT FROM advance THEN RAISE EXCEPTION 'Prices or delivery charges changed. Refresh the pair and review the total.'; END IF;
  IF price<=0 OR charge<0 OR price::text IN ('NaN','Infinity','-Infinity') OR charge::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid order price or delivery charge'; END IF; LOOP
   no:='BK-'||to_char(now()AT TIME ZONE'Asia/Kolkata','MMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,10)); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.catalog_bookings WHERE booking_no=no); END LOOP;
  UPDATE public.product_variants SET stock=stock-1 WHERE id=v.id;
  INSERT INTO public.catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,expires_at,fulfillment,delivery_charge,address,area,coupon_code,coupon_discount,client_request_id,request_hash,bargain_id)
  VALUES(no,v.id,v.brand||' '||v.article,v.size,nm,m,price,advance,now()+interval'30 minutes',f,charge,nullif(addr,''),nullif(left(btrim(coalesce(_area,'')),80),''),code,discount,_request_id,h,_deal_id) RETURNING * INTO b;
  UPDATE public.catalog_bargain_sessions SET order_request_id=_request_id WHERE id=deal.id; INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note)VALUES('BOOKING_HOLD',v.id,b.product_name,1,no);
 END IF; SELECT * INTO s FROM public.store_settings WHERE id=1;
 RETURN jsonb_build_object('booking_no',b.booking_no,'advance',b.advance,'price',b.price,'delivery_charge',b.delivery_charge,'fulfillment',b.fulfillment,'upi_id',s.upi_id,'shop',s.business_name,'phone',s.business_phone,'product',b.product_name,'size',b.size,'hold_hours',s.hold_hours,'coupon_code',b.coupon_code,'coupon_discount',b.coupon_discount);
END $$; REVOKE ALL ON FUNCTION public.create_catalog_bargain_order(uuid,text,text,text,text,text,text,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_bargain_order(uuid,text,text,text,text,text,text,uuid,jsonb,uuid,uuid) TO anon,authenticated;
-- Include new business records in backup/restore/reset without changing their safety checks.
-- Guard the definition layout and fail atomically on an unsupported backend.
DO $maintenance$ DECLARE d text; old_marker text; new_marker text; BEGIN SELECT pg_get_functiondef('public.maintenance_business_tables()'::regprocedure) INTO d; IF position('catalog_bargain_policies'IN d)=0 THEN
  old_marker:='''catalog_bookings'']'; new_marker:='''catalog_bookings'',''catalog_bargain_policies'',''catalog_bargain_sessions'']';
  IF position(old_marker IN d)=0 THEN RAISE EXCEPTION 'Unsupported maintenance manifest. Stop for review.'; END IF; EXECUTE replace(d,old_marker,new_marker); END IF;
 SELECT pg_get_functiondef('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure) INTO d; IF position('public.catalog_bargain_sessions'IN d)=0 THEN
  old_marker:='TRUNCATE[[:space:]]+TABLE[[:space:]]+public[.]catalog_bookings[[:space:]]*,';
  IF (SELECT count(*) FROM regexp_matches(d,old_marker,'gi'))<>1 THEN RAISE EXCEPTION 'Reset cleanup layout differs. Stop for review.'; END IF;
  EXECUTE regexp_replace(d,old_marker,'TRUNCATE TABLE public.catalog_bargain_sessions, public.catalog_bargain_policies, public.catalog_bookings,','i'); END IF;
 SELECT pg_get_functiondef('public.restore_store_backup_v2(text,jsonb)'::regprocedure) INTO d;
 IF position('-- optional-bargain-tables-v1'IN d)=0 THEN
  old_marker:=' expected := public.maintenance_business_tables()'; IF position(old_marker IN d)=0 THEN RAISE EXCEPTION 'Unsupported restore definition. Stop for review.'; END IF;
  new_marker:=E' -- optional-bargain-tables-v1\n _snapshot:=jsonb_set(_snapshot,''{tables}'',jsonb_build_object(''catalog_bargain_policies'',''[]''::jsonb,''catalog_bargain_sessions'',''[]''::jsonb)||(_snapshot->''tables''));\n'||old_marker;
  EXECUTE replace(d,old_marker,new_marker); END IF; END $maintenance$; NOTIFY pgrst,'reload schema'; COMMIT;
