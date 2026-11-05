-- Part 4: whole-cart coupon preview/writer and version 2 activation.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.revalidate_catalog_cart_coupon(uuid)')IS NULL THEN RAISE EXCEPTION 'Apply cart coupon Part 3 first';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.check_catalog_cart_coupon(_variant_ids uuid[],_code text,_mobile text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE subtotal numeric;found_count integer;
BEGIN
 IF cardinality(_variant_ids)NOT BETWEEN 1 AND 30 OR cardinality(_variant_ids)IS DISTINCT FROM(SELECT count(DISTINCT x)FROM unnest(_variant_ids)x)THEN RAISE EXCEPTION 'Choose distinct eligible pairs';END IF;
 SELECT sum(p.selling_price),count(*)INTO subtotal,found_count FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE v.id=ANY(_variant_ids)AND p.catalog_visible AND p.status='Active'AND v.stock>0;
 IF found_count<>cardinality(_variant_ids)OR subtotal IS NULL THEN RAISE EXCEPTION 'A selected pair is unavailable';END IF;
 RETURN public.catalog_coupon_amount(_code,_mobile,subtotal,false)-'id';
END $$;
REVOKE ALL ON FUNCTION public.check_catalog_cart_coupon(uuid[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_catalog_cart_coupon(uuid[],text,text)TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_catalog_cart_order_v2(_request_id uuid,_items jsonb,_name text,_mobile text,_fulfillment text,_address text,_area text,_quote jsonb,_coupon text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eligible_total numeric:=0;eligible_count integer:=0;priced_lines jsonb:='[]';discount_total numeric:=0;discount_left numeric:=0;eligible_left numeric:=0;discount_part numeric:=0;coupon_code text:=upper(btrim(coalesce(_coupon,'')));
 s public.store_settings%ROWTYPE; b public.catalog_bookings%ROWTYPE; v record; it jsonb; line jsonb; lines jsonb:='[]';
 d public.catalog_bargain_sessions%ROWTYPE; p public.catalog_bargain_policies%ROWTYPE; cp jsonb;
 m text:=right(regexp_replace(coalesce(_mobile,''),'\D','','g'),10); nm text:=btrim(coalesce(_name,'')); f text:=coalesce(_fulfillment,'pickup'); addr text:=btrim(coalesce(_address,'')); area text:=btrim(coalesce(_area,''));
 h text; ref text; coupon text; n integer; i integer:=0; line_request uuid; net numeric:=0; fee numeric:=0; advance numeric; price numeric; discount numeric; fee_left numeric; net_left numeric; advance_left numeric; fee_part numeric; advance_part numeric; expiry timestamptz;
BEGIN
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Order request identifier required';END IF;
 h:=md5(jsonb_build_array(_items,nm,m,f,addr,area,_quote,coupon_code)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,37));
 SELECT * INTO b FROM public.catalog_bookings WHERE client_request_id=_request_id;
 IF FOUND THEN
  IF b.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Order retry differs from original request';END IF;
  RETURN public.catalog_cart_result(_request_id);
 END IF;
 IF jsonb_typeof(_items)IS DISTINCT FROM'array' OR jsonb_array_length(_items)NOT BETWEEN 1 AND 30 OR pg_column_size(_items)>50000 THEN RAISE EXCEPTION 'Choose between 1 and 30 different pairs';END IF;
 n:=jsonb_array_length(_items);
 IF (SELECT count(DISTINCT x->>'variant_id')FROM jsonb_array_elements(_items)x)<>n THEN RAISE EXCEPTION 'Each selected size can appear only once in the cart';END IF;
 IF length(coupon_code)>30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(_items)x WHERE nullif(btrim(x->>'coupon'),'')IS NOT NULL)THEN RAISE EXCEPTION 'Use the single cart coupon field';END IF;
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
  coupon:='';discount:=0;price:=v.selling_price;d:=NULL;
  IF nullif(it->>'bargain_id','')IS NOT NULL THEN
   IF coupon<>'' THEN RAISE EXCEPTION 'Additional offers cannot be combined.';END IF;
   SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=v.product_id FOR SHARE;
   SELECT * INTO d FROM public.catalog_bargain_sessions WHERE quote_id=(it->>'bargain_id')::uuid AND client_hash=md5((it->>'client')::uuid::text)FOR UPDATE;
   IF NOT FOUND OR d.variant_id IS DISTINCT FROM v.id OR d.product_id IS DISTINCT FROM v.product_id OR d.generation IS DISTINCT FROM(SELECT generation FROM public.store_reset_state WHERE id=1)OR p.enabled IS DISTINCT FROM true OR p.revision IS DISTINCT FROM d.policy_revision OR d.listed_price IS DISTINCT FROM v.selling_price OR d.expires_at<=clock_timestamp()OR d.order_request_id IS NOT NULL THEN RAISE EXCEPTION 'CART_BARGAIN_CHANGED:%',v.id;END IF;
   price:=d.price;
  ELSE
   coupon:=coupon_code;eligible_total:=eligible_total+price;eligible_count:=eligible_count+1;
  END IF;
  IF price<=0 OR price<>round(price,2)OR price::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'A price or coupon changed. Review the cart before ordering.';END IF;
  lines:=lines||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product',v.brand||' '||v.article,'size',v.size,'price',price,'coupon',nullif(coupon,''),'discount',discount,'expected_net',(it->>'net')::numeric,'deal_row',d.id,'deal_id',d.quote_id));net:=net+price;
 END LOOP;
 IF coupon_code<>'' THEN
  IF eligible_count=0 THEN RAISE EXCEPTION 'Coupons cannot be combined with bargained pairs';END IF;
  cp:=public.catalog_coupon_amount(coupon_code,m,eligible_total,true);discount_total:=(cp->>'amount')::numeric;coupon_code:=cp->>'code';
  UPDATE public.coupons SET used_count=used_count+1 WHERE id=(cp->>'id')::uuid;
 END IF;
 discount_left:=discount_total*100;eligible_left:=eligible_total*100;
 FOR line IN SELECT value FROM jsonb_array_elements(lines)LOOP
  price:=(line->>'price')::numeric;discount_part:=0;
  IF nullif(line->>'deal_id','')IS NULL AND coupon_code<>''THEN
   discount_part:=greatest(0,discount_left-(eligible_left-price*100-(eligible_count-1)),least(price*100-1,floor(discount_total*100*price/eligible_total)));
   discount_left:=discount_left-discount_part;eligible_left:=eligible_left-price*100;eligible_count:=eligible_count-1;
   discount_part:=discount_part/100;
  END IF;
  price:=price-discount_part;
  IF price<=0 OR price IS DISTINCT FROM(line->>'expected_net')::numeric THEN RAISE EXCEPTION 'Cart coupon or product price changed. Apply the coupon again';END IF;
  priced_lines:=priced_lines||jsonb_build_array(line||jsonb_build_object('price',price,'discount',discount_part));
 END LOOP;
 IF discount_left<>0 THEN RAISE EXCEPTION 'Invalid cart discount allocation';END IF;
 lines:=priced_lines;net:=net-discount_total;
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
REVOKE ALL ON FUNCTION public.create_catalog_cart_order_v2(uuid,jsonb,text,text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_cart_order_v2(uuid,jsonb,text,text,text,text,text,jsonb,text)TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.catalog_cart_version()RETURNS integer LANGUAGE sql IMMUTABLE AS $$SELECT 2$$;
REVOKE ALL ON FUNCTION public.catalog_cart_version()FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.catalog_cart_version()TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
