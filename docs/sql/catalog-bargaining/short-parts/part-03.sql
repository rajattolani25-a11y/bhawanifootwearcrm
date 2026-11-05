BEGIN;
CREATE OR REPLACE FUNCTION public.create_catalog_bargain_order(_variant_id uuid,_name text,_mobile text,_fulfillment text,_address text,_area text,_coupon text,_request_id uuid,_quote jsonb,_deal_id uuid,_client uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.store_settings%ROWTYPE; v record; b public.catalog_bookings%ROWTYPE; m text:=right(regexp_replace(coalesce(_mobile,''),'\D','','g'),10);
 nm text:=btrim(coalesce(_name,'')); f text:=coalesce(_fulfillment,'pickup'); addr text:=btrim(coalesce(_address,'')); h text;
 deal public.catalog_bargain_sessions%ROWTYPE; policy public.catalog_bargain_policies%ROWTYPE;
 price numeric; discount numeric:=0; charge numeric:=0; advance numeric; cp jsonb; no text; code text; BEGIN
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Order request identifier required'; END IF;
 h:=md5(jsonb_build_array(_variant_id,nm,m,f,addr,btrim(coalesce(_area,'')),upper(btrim(coalesce(_coupon,''))),_quote,_deal_id,md5(_client::text))::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,37)); SELECT * INTO b FROM public.catalog_bookings WHERE client_request_id=_request_id;
 IF FOUND THEN IF b.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Order retry differs from original request'; END IF;
  IF b.status='pending'AND b.expires_at<=now()OR b.status IN ('cancelled','expired','refunded','refund_pending') THEN RAISE EXCEPTION 'This order is closed. Track it before creating another order.'; END IF;
 ELSE PERFORM public.expire_catalog_bookings(); SELECT * INTO s FROM public.store_settings WHERE id=1;
  IF NOT s.catalog_enabled OR nullif(btrim(s.upi_id),'') IS NULL OR right(regexp_replace(coalesce(s.business_phone,''),'\D','','g'),10) !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Ordering is unavailable. The store must configure UPI and WhatsApp contact.'; END IF;
  IF f NOT IN ('pickup','local','outside') OR f='pickup' AND NOT(s.booking_enabled AND s.pickup_enabled) OR f='local' AND NOT s.delivery_enabled OR f='outside' AND NOT s.outside_enabled THEN RAISE EXCEPTION 'This fulfilment method is unavailable'; END IF;
  IF m !~ '^[6-9][0-9]{9}$' OR length(nm) NOT BETWEEN 2 AND 60 OR f<>'pickup' AND length(addr) NOT BETWEEN 10 AND 300 THEN RAISE EXCEPTION 'Enter valid name, mobile and delivery address'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(m,370));
  IF (SELECT count(*)FROM public.catalog_bookings WHERE mobile=m AND status IN ('pending','confirmed','packed','shipped'))>=3 THEN RAISE EXCEPTION 'You already have 3 open orders. Contact the store.'; END IF;
  SELECT pv.*,p.brand,p.article,p.selling_price,p.catalog_visible,p.status INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=_variant_id FOR UPDATE OF pv;
  IF NOT FOUND OR NOT v.catalog_visible OR v.status<>'Active' THEN RAISE EXCEPTION 'This item is unavailable'; END IF;
  IF v.stock<1 THEN RAISE EXCEPTION 'Sorry, this size just sold out'; END IF;
  IF nullif(btrim(_coupon),'') IS NOT NULL THEN RAISE EXCEPTION 'Additional offers cannot be combined.'; END IF;
  SELECT * INTO policy FROM public.catalog_bargain_policies WHERE product_id=v.product_id FOR SHARE;
  SELECT * INTO deal FROM public.catalog_bargain_sessions WHERE quote_id=_deal_id AND client_hash=md5(_client::text) FOR UPDATE;
  IF NOT FOUND OR deal.variant_id IS DISTINCT FROM v.id OR deal.product_id IS DISTINCT FROM v.product_id
   OR deal.generation IS DISTINCT FROM(SELECT generation FROM public.store_reset_state WHERE id=1)
   OR policy.enabled IS DISTINCT FROM true OR policy.revision IS DISTINCT FROM deal.policy_revision
   OR deal.listed_price IS DISTINCT FROM v.selling_price OR deal.expires_at<=clock_timestamp()
   OR deal.order_request_id IS NOT NULL THEN RAISE EXCEPTION 'This bargain price has expired or changed. Review the listed price before ordering.'; END IF;
  price:=deal.price; IF f='pickup' THEN advance:=ceil(price*greatest(1,least(100,s.advance_percent))/100.0);
  ELSE charge:=CASE WHEN f='local' THEN s.local_charge ELSE s.outside_charge END;
   IF f='local' AND s.free_delivery_above IS NOT NULL AND price>=s.free_delivery_above THEN charge:=0; END IF; advance:=price+charge; END IF;
  IF (_quote->>'price')::numeric IS DISTINCT FROM v.selling_price OR (_quote->>'net')::numeric IS DISTINCT FROM price OR (_quote->>'charge')::numeric IS DISTINCT FROM charge OR (_quote->>'advance')::numeric IS DISTINCT FROM advance THEN RAISE EXCEPTION 'Prices or delivery charges changed. Refresh the pair and review the total.'; END IF;
  IF price<=0 OR charge<0 OR price::text IN ('NaN','Infinity','-Infinity') OR charge::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid order price or delivery charge'; END IF;
  LOOP no:='BK-'||to_char(now()AT TIME ZONE'Asia/Kolkata','MMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,10));
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.catalog_bookings WHERE booking_no=no); END LOOP; UPDATE public.product_variants SET stock=stock-1 WHERE id=v.id;
  INSERT INTO public.catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,expires_at,fulfillment,delivery_charge,address,area,coupon_code,coupon_discount,client_request_id,request_hash,bargain_id)
  VALUES(no,v.id,v.brand||' '||v.article,v.size,nm,m,price,advance,now()+interval'30 minutes',f,charge,nullif(addr,''),nullif(left(btrim(coalesce(_area,'')),80),''),code,discount,_request_id,h,_deal_id) RETURNING * INTO b;
  UPDATE public.catalog_bargain_sessions SET order_request_id=_request_id WHERE id=deal.id;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note)VALUES('BOOKING_HOLD',v.id,b.product_name,1,no); END IF;
 SELECT * INTO s FROM public.store_settings WHERE id=1;
 RETURN jsonb_build_object('booking_no',b.booking_no,'advance',b.advance,'price',b.price,'delivery_charge',b.delivery_charge,'fulfillment',b.fulfillment,'upi_id',s.upi_id,'shop',s.business_name,'phone',s.business_phone,'product',b.product_name,'size',b.size,'hold_hours',s.hold_hours,'coupon_code',b.coupon_code,'coupon_discount',b.coupon_discount);
END $$; REVOKE ALL ON FUNCTION public.create_catalog_bargain_order(uuid,text,text,text,text,text,text,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_bargain_order(uuid,text,text,text,text,text,text,uuid,jsonb,uuid,uuid) TO anon,authenticated;
COMMIT;
