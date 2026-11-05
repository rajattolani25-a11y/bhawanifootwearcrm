-- Review-only optional cart checkout extension. No tables/migrations or existing RPC definitions are replaced.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.catalog_bargain_bid(uuid,uuid,numeric)')IS NULL OR public.operational_safety_version()<>40 THEN RAISE EXCEPTION 'Verify installed bargaining and operations support first';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.catalog_cart_result(_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE; s public.store_settings%ROWTYPE; ref text; result jsonb;
BEGIN
 SELECT * INTO b FROM public.catalog_bookings WHERE client_request_id=_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cart order not found';END IF;
 ref:=substring(b.booking_no from '^(CT-[0-9A-F]{16})-[0-9]{2}$');
 IF ref IS NULL THEN RAISE EXCEPTION 'This request belongs to another order type';END IF;
 SELECT * INTO s FROM public.store_settings WHERE id=1;
 SELECT jsonb_build_object('cart_no',ref,'price',sum(x.price),'delivery_charge',sum(x.delivery_charge),'advance',sum(x.advance),
 'upi_id',s.upi_id,'shop',s.business_name,'phone',s.business_phone,'hold_hours',s.hold_hours,'server_now',clock_timestamp(),
 'orders',jsonb_agg(jsonb_build_object('booking_no',x.booking_no,'variant_id',x.variant_id,'product_id',pv.product_id,'product',x.product_name,'color',p.color,'size',x.size,'price',x.price,'advance',x.advance,'delivery_charge',x.delivery_charge,'fulfillment',x.fulfillment,'coupon_code',x.coupon_code,'coupon_discount',x.coupon_discount,'status',x.status,'receipt_recorded',coalesce(x.receipt_recorded,false),'expires_at',x.expires_at,'history',x.status_history)ORDER BY x.booking_no))
 INTO result FROM public.catalog_bookings x JOIN public.product_variants pv ON pv.id=x.variant_id JOIN public.products p ON p.id=pv.product_id
 WHERE x.booking_no>=ref||'-' AND x.booking_no<ref||'.';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.catalog_cart_result(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_catalog_cart_order(_request_id uuid,_items jsonb,_name text,_mobile text,_fulfillment text,_address text,_area text,_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.store_settings%ROWTYPE; b public.catalog_bookings%ROWTYPE; v record; it jsonb; line jsonb; lines jsonb:='[]';
 d public.catalog_bargain_sessions%ROWTYPE; p public.catalog_bargain_policies%ROWTYPE; cp jsonb;
 m text:=right(regexp_replace(coalesce(_mobile,''),'\D','','g'),10); nm text:=btrim(coalesce(_name,'')); f text:=coalesce(_fulfillment,'pickup'); addr text:=btrim(coalesce(_address,'')); area text:=btrim(coalesce(_area,''));
 h text; ref text; coupon text; n integer; i integer:=0; line_request uuid; net numeric:=0; fee numeric:=0; advance numeric; price numeric; discount numeric; fee_left numeric; net_left numeric; advance_left numeric; fee_part numeric; advance_part numeric; expiry timestamptz;
BEGIN
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Order request identifier required';END IF;
 h:=md5(jsonb_build_array(_items,nm,m,f,addr,area,_quote)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,37));
 SELECT * INTO b FROM public.catalog_bookings WHERE client_request_id=_request_id;
 IF FOUND THEN
  IF b.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Order retry differs from original request';END IF;
  RETURN public.catalog_cart_result(_request_id);
 END IF;
 IF jsonb_typeof(_items)IS DISTINCT FROM'array' OR jsonb_array_length(_items)NOT BETWEEN 1 AND 30 OR pg_column_size(_items)>50000 THEN RAISE EXCEPTION 'Choose between 1 and 30 different pairs';END IF;
 n:=jsonb_array_length(_items);
 IF (SELECT count(DISTINCT x->>'variant_id')FROM jsonb_array_elements(_items)x)<>n THEN RAISE EXCEPTION 'Each selected size can appear only once in the cart';END IF;
 IF (SELECT count(*)FROM jsonb_array_elements(_items)x WHERE nullif(btrim(x->>'coupon'),'')IS NOT NULL)>1 THEN RAISE EXCEPTION 'Apply the coupon to one selected pair';END IF;
 PERFORM public.expire_catalog_bookings();SELECT * INTO s FROM public.store_settings WHERE id=1;
 IF NOT s.catalog_enabled OR nullif(btrim(s.upi_id),'')IS NULL OR right(regexp_replace(coalesce(s.business_phone,''),'\D','','g'),10)!~'^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Ordering is unavailable. The store must configure UPI and WhatsApp contact.';END IF;
 IF f NOT IN('pickup','local','outside') OR f='pickup'AND NOT(s.booking_enabled AND s.pickup_enabled) OR f='local'AND NOT s.delivery_enabled OR f='outside'AND NOT s.outside_enabled THEN RAISE EXCEPTION 'This fulfilment method is unavailable';END IF;
 IF m!~'^[6-9][0-9]{9}$' OR length(nm)NOT BETWEEN 2 AND 60 OR length(area)>80 OR f<>'pickup'AND length(addr)NOT BETWEEN 10 AND 300 THEN RAISE EXCEPTION 'Enter valid name, mobile and delivery address';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(m,370));
 IF(SELECT count(DISTINCT coalesce(substring(booking_no from '^(CT-[0-9A-F]{16})-[0-9]{2}$'),booking_no))FROM public.catalog_bookings WHERE mobile=m AND status IN('pending','confirmed','packed','shipped'))>=3 THEN RAISE EXCEPTION 'You already have 3 open orders. Contact the store.';END IF;
 -- Lock every selected size in one order before validating or holding any pair.
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT(x->>'variant_id')::uuid FROM jsonb_array_elements(_items)x)ORDER BY id FOR UPDATE;
 FOR it IN SELECT value FROM jsonb_array_elements(_items)LOOP
  SELECT pv.*,pr.brand,pr.article,pr.selling_price,pr.status,pr.catalog_visible INTO v FROM public.product_variants pv JOIN public.products pr ON pr.id=pv.product_id WHERE pv.id=(it->>'variant_id')::uuid;
  IF NOT FOUND OR NOT v.catalog_visible OR v.status<>'Active' OR v.stock<1 THEN RAISE EXCEPTION 'A selected pair is unavailable. No pairs were reserved.';END IF;
  IF coalesce((it->>'qty')::integer,1)<>1 OR (it->>'price')::numeric IS DISTINCT FROM v.selling_price THEN RAISE EXCEPTION 'A product price changed. Review the cart before ordering.';END IF;
  coupon:=upper(btrim(coalesce(it->>'coupon','')));discount:=0;price:=v.selling_price;d:=NULL;
  IF nullif(it->>'bargain_id','')IS NOT NULL THEN
   IF coupon<>'' THEN RAISE EXCEPTION 'Additional offers cannot be combined.';END IF;
   SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=v.product_id FOR SHARE;
   SELECT * INTO d FROM public.catalog_bargain_sessions WHERE quote_id=(it->>'bargain_id')::uuid AND client_hash=md5((it->>'client')::uuid::text)FOR UPDATE;
   IF NOT FOUND OR d.variant_id IS DISTINCT FROM v.id OR d.product_id IS DISTINCT FROM v.product_id OR d.generation IS DISTINCT FROM(SELECT generation FROM public.store_reset_state WHERE id=1)OR p.enabled IS DISTINCT FROM true OR p.revision IS DISTINCT FROM d.policy_revision OR d.listed_price IS DISTINCT FROM v.selling_price OR d.expires_at<=clock_timestamp()OR d.order_request_id IS NOT NULL THEN RAISE EXCEPTION 'CART_BARGAIN_CHANGED:%',v.id;END IF;
   price:=d.price;
  ELSIF coupon<>'' THEN
   cp:=public.catalog_coupon_amount(coupon,m,price,true);discount:=(cp->>'amount')::numeric;coupon:=cp->>'code';price:=price-discount;
   UPDATE public.coupons SET used_count=used_count+1 WHERE id=(cp->>'id')::uuid;
  END IF;
  IF price<=0 OR price<>round(price,2)OR price::text IN('NaN','Infinity','-Infinity')OR(it->>'net')::numeric IS DISTINCT FROM price THEN RAISE EXCEPTION 'A price or coupon changed. Review the cart before ordering.';END IF;
  lines:=lines||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product',v.brand||' '||v.article,'size',v.size,'price',price,'coupon',nullif(coupon,''),'discount',discount,'deal_row',d.id,'deal_id',d.quote_id));net:=net+price;
 END LOOP;
 IF f='pickup'THEN advance:=least(net,ceil(net*greatest(1,least(100,s.advance_percent))/100));
 ELSE fee:=CASE WHEN f='local'THEN s.local_charge ELSE s.outside_charge END;
  IF f='local'AND s.free_delivery_above IS NOT NULL AND net>=s.free_delivery_above THEN fee:=0;END IF;advance:=net+fee;
 END IF;
 IF fee<0 OR fee<>round(fee,2)OR fee::text IN('NaN','Infinity','-Infinity')OR(_quote->>'net')::numeric IS DISTINCT FROM net OR(_quote->>'charge')::numeric IS DISTINCT FROM fee OR(_quote->>'advance')::numeric IS DISTINCT FROM advance THEN RAISE EXCEPTION 'Prices or delivery charges changed. Review the total before ordering.';END IF;
 ref:='CT-'||upper(substr(replace(_request_id::text,'-',''),1,16));fee_left:=fee;net_left:=net;advance_left:=advance;expiry:=clock_timestamp()+interval'30 minutes';
 FOR line IN SELECT value FROM jsonb_array_elements(lines)LOOP
  i:=i+1;price:=(line->>'price')::numeric;
  fee_part:=CASE WHEN i=n THEN fee_left ELSE floor(fee*price/net*100)/100 END;fee_left:=fee_left-fee_part;
  IF f='pickup'THEN
   IF i=n THEN advance_part:=advance_left;
   ELSE advance_part:=greatest(0.01,advance_left-(net_left-price),least(price,advance_left-0.01*(n-i),round(advance_left*price/net_left,2)));END IF;
  ELSE advance_part:=price+fee_part;END IF;
  IF advance_part<=0 OR advance_part>price+fee_part THEN RAISE EXCEPTION 'Invalid allocated advance';END IF;
  advance_left:=advance_left-advance_part;net_left:=net_left-price;
  line_request:=CASE WHEN i=1 THEN _request_id ELSE md5(_request_id::text||':'||(line->>'variant_id'))::uuid END;
  UPDATE public.product_variants SET stock=stock-1 WHERE id=(line->>'variant_id')::uuid;
  INSERT INTO public.catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,expires_at,fulfillment,delivery_charge,address,area,coupon_code,coupon_discount,client_request_id,request_hash,bargain_id)
  VALUES(ref||'-'||lpad(i::text,2,'0'),(line->>'variant_id')::uuid,line->>'product',line->>'size',nm,m,price,advance_part,expiry,f,fee_part,nullif(addr,''),nullif(area,''),line->>'coupon',(line->>'discount')::numeric,line_request,h,(line->>'deal_id')::uuid);
  IF nullif(line->>'deal_row','')IS NOT NULL THEN UPDATE public.catalog_bargain_sessions SET order_request_id=line_request WHERE id=(line->>'deal_row')::uuid;END IF;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note)VALUES('BOOKING_HOLD',(line->>'variant_id')::uuid,line->>'product',1,ref||'-'||lpad(i::text,2,'0'));
 END LOOP;
 RETURN public.catalog_cart_result(_request_id);
END $$;
REVOKE ALL ON FUNCTION public.create_catalog_cart_order(uuid,jsonb,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_cart_order(uuid,jsonb,text,text,text,text,text,jsonb)TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.track_catalog_cart_order(_cart_no text,_mobile text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request uuid; ref text:=upper(btrim(_cart_no));m text:=right(regexp_replace(coalesce(_mobile,''),'\D','','g'),10);
BEGIN
 IF ref!~'^CT-[0-9A-F]{16}$' OR m!~'^[6-9][0-9]{9}$' THEN RETURN NULL;END IF;
 PERFORM public.expire_catalog_bookings();
 SELECT client_request_id INTO request FROM public.catalog_bookings WHERE booking_no=ref||'-01' AND mobile=m;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.catalog_cart_result(request);
END $$;
REVOKE ALL ON FUNCTION public.track_catalog_cart_order(text,text)FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_catalog_cart_order(text,text)TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_cart_payment_summary(_cart_no text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request uuid;
BEGIN
 IF NOT public.is_member(auth.uid())THEN RAISE EXCEPTION 'Not allowed';END IF;
 IF _cart_no!~'^CT-[0-9A-F]{16}$' THEN RAISE EXCEPTION 'Invalid cart reference';END IF;
 SELECT client_request_id INTO request FROM public.catalog_bookings WHERE booking_no=_cart_no||'-01';
 IF NOT FOUND THEN RAISE EXCEPTION 'Cart order not found';END IF;
 RETURN public.catalog_cart_result(request);
END $$;
REVOKE ALL ON FUNCTION public.catalog_cart_payment_summary(text)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.catalog_cart_payment_summary(text)TO authenticated;
CREATE OR REPLACE FUNCTION public.confirm_catalog_cart_payment(_cart_no text,_expected_advance numeric,_settled boolean)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE; amount numeric;
BEGIN
 IF NOT public.is_member(auth.uid())THEN RAISE EXCEPTION 'Not allowed';END IF;
 IF _settled IS DISTINCT FROM true OR _cart_no!~'^CT-[0-9A-F]{16}$' THEN RAISE EXCEPTION 'Verify the full UPI receipt before confirming';END IF;
 PERFORM 1 FROM public.catalog_bookings WHERE booking_no>=_cart_no||'-' AND booking_no<_cart_no||'.'ORDER BY id FOR UPDATE;
 SELECT sum(advance)INTO amount FROM public.catalog_bookings WHERE booking_no>=_cart_no||'-' AND booking_no<_cart_no||'.';
 IF amount IS NULL OR amount IS DISTINCT FROM _expected_advance THEN RAISE EXCEPTION 'Cart payment total changed. Reload before confirming';END IF;
 IF EXISTS(SELECT 1 FROM public.catalog_bookings WHERE booking_no>=_cart_no||'-' AND booking_no<_cart_no||'.'AND status NOT IN('pending','expired','confirmed','packed','shipped'))THEN RAISE EXCEPTION 'This cart includes closed pairs. Review each pair before recording payment';END IF;
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT variant_id FROM public.catalog_bookings WHERE booking_no>=_cart_no||'-' AND booking_no<_cart_no||'.')ORDER BY id FOR UPDATE;
 FOR b IN SELECT * FROM public.catalog_bookings WHERE booking_no>=_cart_no||'-' AND booking_no<_cart_no||'.'ORDER BY id LOOP
  PERFORM public.confirm_catalog_booking(b.id);
 END LOOP;
 RETURN public.catalog_cart_payment_summary(_cart_no);
END $$;
REVOKE ALL ON FUNCTION public.confirm_catalog_cart_payment(text,numeric,boolean)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_catalog_cart_payment(text,numeric,boolean)TO authenticated;
-- Availability is published only after all cart functions above are installed atomically.
CREATE OR REPLACE FUNCTION public.catalog_cart_version()RETURNS integer LANGUAGE sql IMMUTABLE AS $$SELECT 1$$;
REVOKE ALL ON FUNCTION public.catalog_cart_version()FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.catalog_cart_version()TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
