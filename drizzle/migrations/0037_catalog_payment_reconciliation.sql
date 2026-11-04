-- Payment confirmations are receipts, not payment-gateway verification.
BEGIN;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS delivery_charge numeric;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS receipt_recorded boolean;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS refund_paid_at timestamptz;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS refund_reference text;
ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS refund_mode text;
CREATE INDEX IF NOT EXISTS booking_coupon_idx ON public.catalog_bookings(coupon_code,mobile,status) WHERE coupon_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS booking_request_unique ON public.catalog_bookings(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS booking_advance_unique ON public.credit_payments(booking_id) WHERE entry_kind='catalog_advance';
CREATE UNIQUE INDEX IF NOT EXISTS booking_refund_unique ON public.credit_payments(booking_id) WHERE entry_kind='catalog_refund';
CREATE OR REPLACE FUNCTION public.coupon_usage_count(_id uuid,_code text) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (SELECT count(*) FROM public.coupon_redemptions r JOIN public.sales s ON s.id=r.sale_id WHERE r.coupon_id=_id AND s.voided_at IS NULL)+
 (SELECT count(*) FROM public.catalog_bookings b WHERE b.coupon_code=_code AND b.status NOT IN ('cancelled','expired','refunded') AND NOT(b.status='pending' AND b.expires_at<now()))
$$;
REVOKE ALL ON FUNCTION public.coupon_usage_count(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.release_catalog_coupon() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.coupon_code IS NOT NULL AND OLD.status NOT IN ('cancelled','expired','refunded') AND NEW.status IN ('cancelled','expired','refunded') THEN
  PERFORM 1 FROM public.coupons WHERE code=OLD.coupon_code FOR UPDATE;
  UPDATE public.coupons SET used_count=public.coupon_usage_count(id,code) WHERE code=OLD.coupon_code;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS release_catalog_coupon ON public.catalog_bookings;
CREATE TRIGGER release_catalog_coupon AFTER UPDATE OF status ON public.catalog_bookings FOR EACH ROW EXECUTE FUNCTION public.release_catalog_coupon();
-- Reconcile usage counters from existing recorded redemptions/reservations only.
UPDATE public.coupons c SET used_count=public.coupon_usage_count(c.id,c.code) WHERE c.id IS NOT NULL AND used_count<>public.coupon_usage_count(c.id,c.code);
CREATE OR REPLACE FUNCTION public.catalog_coupon_amount(_code text, _mobile text, _subtotal numeric, _lock boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare c public.coupons%ROWTYPE; m text := right(regexp_replace(coalesce(_mobile,''), '\D', '', 'g'), 10); amt numeric;
begin
  if _lock then select * into c from public.coupons where code = upper(btrim(coalesce(_code,''))) for update;
  else select * into c from public.coupons where code = upper(btrim(coalesce(_code,''))); end if;
  if not found or not c.active then raise exception 'Coupon not found or inactive'; end if;
  if c.starts_at is not null and c.starts_at > now() then raise exception 'Coupon is not active yet'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'Coupon has expired'; end if;
  if c.usage_limit is not null and public.coupon_usage_count(c.id,c.code) >= c.usage_limit then raise exception 'Coupon usage limit reached'; end if;
  if m !~ '^[6-9][0-9]{9}$' then raise exception 'Enter your mobile number to use a coupon'; end if;
  if c.customer_id is not null and not exists (select 1 from public.customers where id = c.customer_id and right(regexp_replace(coalesce(mobile,''),'\D','','g'),10) = m) then
    raise exception 'This coupon belongs to another customer'; end if;
  if exists (select 1 from public.coupon_redemptions r join public.customers cu on cu.id = r.customer_id where r.coupon_id = c.id and right(regexp_replace(coalesce(cu.mobile,''),'\D','','g'),10) = m)
     or exists (select 1 from public.catalog_bookings b where b.coupon_code = c.code and b.mobile = m and b.status not in ('cancelled','expired','refunded') and not(b.status='pending' and b.expires_at<now())) then
    raise exception 'You have already used this coupon'; end if;
  if coalesce(_subtotal,0) < c.min_bill then raise exception 'Minimum order for this coupon is Rs %', c.min_bill; end if;
  amt := case when c.kind = 'percent' then round(_subtotal * c.value / 100,2) else c.value end;
  if c.max_discount is not null then amt := least(amt, c.max_discount); end if;
  amt := least(amt, greatest(_subtotal - 1, 0));
  return jsonb_build_object('code', c.code, 'amount', amt, 'id', c.id);
end $f$;
REVOKE ALL ON FUNCTION public.catalog_coupon_amount(text,text,numeric,boolean) FROM public;


CREATE OR REPLACE FUNCTION public.coupon_discount(_code text, _customer uuid, _subtotal numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.coupons%ROWTYPE; amt numeric;
BEGIN
  IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO c FROM public.coupons WHERE code = upper(trim(_code));
  IF NOT FOUND OR NOT c.active THEN RAISE EXCEPTION 'Coupon not found or inactive'; END IF;
  IF _customer IS NULL THEN RAISE EXCEPTION 'Select a customer to use a coupon'; END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN RAISE EXCEPTION 'Coupon is not active yet'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'Coupon has expired'; END IF;
  IF c.usage_limit IS NOT NULL AND public.coupon_usage_count(c.id,c.code) >= c.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit reached'; END IF;
  IF c.customer_id IS NOT NULL AND c.customer_id IS DISTINCT FROM _customer THEN RAISE EXCEPTION 'This coupon belongs to another customer'; END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE coupon_id = c.id AND customer_id = _customer) THEN RAISE EXCEPTION 'This customer has already used this coupon'; END IF;
  IF EXISTS(SELECT 1 FROM public.catalog_bookings b JOIN public.customers cu ON right(regexp_replace(cu.mobile,'\D','','g'),10)=b.mobile WHERE cu.id=_customer AND b.coupon_code=c.code AND b.status NOT IN ('cancelled','expired','refunded') AND NOT(b.status='pending' AND b.expires_at<now())) THEN RAISE EXCEPTION 'This customer has already used this coupon online'; END IF;
  IF coalesce(_subtotal,0) < c.min_bill THEN RAISE EXCEPTION 'Minimum bill for this coupon is Rs %', c.min_bill; END IF;
  amt := CASE WHEN c.kind = 'percent' THEN round(_subtotal * c.value / 100, 2) ELSE c.value END;
  IF c.max_discount IS NOT NULL THEN amt := least(amt, c.max_discount); END IF;
  amt := least(amt, greatest(_subtotal,0));
  RETURN jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'amount', amt);
END $$;


CREATE OR REPLACE FUNCTION public.check_catalog_coupon(_variant_id uuid, _code text, _mobile text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare p numeric;
begin
  select pr.selling_price into p from public.product_variants pv join public.products pr on pr.id = pv.product_id where pv.id = _variant_id and pr.catalog_visible and pr.status='Active';
  if p is null then raise exception 'This item is not available'; end if;
  return public.catalog_coupon_amount(_code, _mobile, p, false) - 'id';
end $f$;
REVOKE ALL ON FUNCTION public.check_catalog_coupon(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_catalog_coupon(uuid,text,text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.create_catalog_order(_variant_id uuid,_name text,_mobile text,_fulfillment text,_address text,_area text,_coupon text,_request_id uuid,_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.store_settings%ROWTYPE; v record; b public.catalog_bookings%ROWTYPE; m text:=right(regexp_replace(coalesce(_mobile,''),'\D','','g'),10);
 nm text:=btrim(coalesce(_name,'')); f text:=coalesce(_fulfillment,'pickup'); addr text:=btrim(coalesce(_address,'')); h text;
 price numeric; discount numeric:=0; charge numeric:=0; advance numeric; cp jsonb; no text; code text;
BEGIN
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Order request identifier required'; END IF;
 h:=md5(jsonb_build_array(_variant_id,nm,m,f,addr,btrim(coalesce(_area,'')),upper(btrim(coalesce(_coupon,''))),_quote)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,37));
 SELECT * INTO b FROM public.catalog_bookings WHERE client_request_id=_request_id;
 IF FOUND THEN
  IF b.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Order retry differs from original request'; END IF;
  IF b.status='pending'AND b.expires_at<=now()OR b.status IN ('cancelled','expired','refunded','refund_pending') THEN RAISE EXCEPTION 'This order is closed. Track it before creating another order.'; END IF;
 ELSE
  PERFORM public.expire_catalog_bookings();
  SELECT * INTO s FROM public.store_settings WHERE id=1;
  IF NOT s.catalog_enabled OR nullif(btrim(s.upi_id),'') IS NULL OR right(regexp_replace(coalesce(s.business_phone,''),'\D','','g'),10) !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Ordering is unavailable. The store must configure UPI and WhatsApp contact.'; END IF;
  IF f NOT IN ('pickup','local','outside') OR f='pickup' AND NOT(s.booking_enabled AND s.pickup_enabled) OR f='local' AND NOT s.delivery_enabled OR f='outside' AND NOT s.outside_enabled THEN RAISE EXCEPTION 'This fulfilment method is unavailable'; END IF;
  IF m !~ '^[6-9][0-9]{9}$' OR length(nm) NOT BETWEEN 2 AND 60 OR f<>'pickup' AND length(addr) NOT BETWEEN 10 AND 300 THEN RAISE EXCEPTION 'Enter valid name, mobile and delivery address'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(m,370));
  IF (SELECT count(*)FROM public.catalog_bookings WHERE mobile=m AND status IN ('pending','confirmed','packed','shipped'))>=3 THEN RAISE EXCEPTION 'You already have 3 open orders. Contact the store.'; END IF;
  SELECT pv.*,p.brand,p.article,p.selling_price,p.catalog_visible,p.status INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=_variant_id FOR UPDATE OF pv;
  IF NOT FOUND OR NOT v.catalog_visible OR v.status<>'Active' THEN RAISE EXCEPTION 'This item is unavailable'; END IF;
  IF v.stock<1 THEN RAISE EXCEPTION 'Sorry, this size just sold out'; END IF;
  price:=v.selling_price;
  IF nullif(btrim(_coupon),'') IS NOT NULL THEN
   cp:=public.catalog_coupon_amount(_coupon,m,price,true);discount:=(cp->>'amount')::numeric;code:=cp->>'code';
   UPDATE public.coupons SET used_count=used_count+1 WHERE id=(cp->>'id')::uuid;
   price:=price-discount;
  END IF;
  IF f='pickup' THEN advance:=ceil(price*greatest(1,least(100,s.advance_percent))/100.0);
  ELSE charge:=CASE WHEN f='local' THEN s.local_charge ELSE s.outside_charge END;
   IF f='local' AND s.free_delivery_above IS NOT NULL AND price>=s.free_delivery_above THEN charge:=0; END IF;
   advance:=price+charge;
  END IF;
  IF (_quote->>'price')::numeric IS DISTINCT FROM v.selling_price OR (_quote->>'net')::numeric IS DISTINCT FROM price OR (_quote->>'charge')::numeric IS DISTINCT FROM charge OR (_quote->>'advance')::numeric IS DISTINCT FROM advance THEN RAISE EXCEPTION 'Prices or delivery charges changed. Refresh the pair and review the total.'; END IF;
  IF price<=0 OR charge<0 OR price::text IN ('NaN','Infinity','-Infinity') OR charge::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid order price or delivery charge'; END IF;
  LOOP
   no:='BK-'||to_char(now()AT TIME ZONE'Asia/Kolkata','MMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,10));
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.catalog_bookings WHERE booking_no=no);
  END LOOP;
  UPDATE public.product_variants SET stock=stock-1 WHERE id=v.id;
  INSERT INTO public.catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,expires_at,fulfillment,delivery_charge,address,area,coupon_code,coupon_discount,client_request_id,request_hash)
  VALUES(no,v.id,v.brand||' '||v.article,v.size,nm,m,price,advance,now()+interval'30 minutes',f,charge,nullif(addr,''),nullif(left(btrim(coalesce(_area,'')),80),''),code,discount,_request_id,h) RETURNING * INTO b;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note)VALUES('BOOKING_HOLD',v.id,b.product_name,1,no);
 END IF;
 SELECT * INTO s FROM public.store_settings WHERE id=1;
 RETURN jsonb_build_object('booking_no',b.booking_no,'advance',b.advance,'price',b.price,'delivery_charge',b.delivery_charge,'fulfillment',b.fulfillment,'upi_id',s.upi_id,'shop',s.business_name,'phone',s.business_phone,'product',b.product_name,'size',b.size,'hold_hours',s.hold_hours,'coupon_code',b.coupon_code,'coupon_discount',b.coupon_discount);
END $$;
REVOKE ALL ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text,text),public.create_catalog_order(uuid,text,text,text,text,text),public.create_catalog_booking(uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.confirm_catalog_booking(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE; cust uuid;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO b FROM public.catalog_bookings WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF b.receipt_recorded AND b.status IN ('confirmed','packed','shipped','picked','delivered') THEN RETURN; END IF;
 IF b.status NOT IN ('pending','expired','confirmed','packed','shipped','refund_pending') THEN RAISE EXCEPTION 'Order cannot be confirmed'; END IF;
 IF b.status='expired' THEN
  UPDATE public.product_variants SET stock=stock-1 WHERE id=b.variant_id AND stock>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order expired and this pair is no longer available'; END IF;
  -- An expired coupon reservation must be revalidated/re-reserved before taking money.
  IF b.coupon_code IS NOT NULL THEN PERFORM public.catalog_coupon_amount(b.coupon_code,b.mobile,b.price+b.coupon_discount,true);UPDATE public.coupons SET used_count=used_count+1 WHERE code=b.coupon_code;END IF;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note,user_id)VALUES('BOOKING_HOLD',b.variant_id,b.product_name,1,b.booking_no||' re-held',auth.uid());
 END IF;
 INSERT INTO public.customers(mobile,name)VALUES(b.mobile,b.customer_name)ON CONFLICT(mobile)DO NOTHING;
 SELECT id INTO cust FROM public.customers WHERE mobile=b.mobile;
 IF b.advance<=0 THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
 INSERT INTO public.credit_payments(customer_id,booking_id,amount,payment_mode,note,collected_by,entry_kind)
 VALUES(cust,b.id,b.advance,'UPI',b.booking_no||' — manually verified UPI receipt',auth.uid(),'catalog_advance');
 UPDATE public.catalog_bookings SET receipt_recorded=true,status=CASE WHEN status IN ('confirmed','packed','shipped','refund_pending') THEN status ELSE 'confirmed' END,confirmed_at=coalesce(confirmed_at,now()) WHERE id=b.id;
END $$;
CREATE OR REPLACE FUNCTION public.cancel_catalog_booking(_id uuid,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO b FROM public.catalog_bookings WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR b.status NOT IN ('pending','confirmed','packed','shipped') THEN RAISE EXCEPTION 'Order cannot be cancelled'; END IF;
 IF length(btrim(coalesce(_note,'')))<3 THEN RAISE EXCEPTION 'Enter a cancellation reason'; END IF;
 UPDATE public.product_variants SET stock=stock+1 WHERE id=b.variant_id;
 INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id)VALUES('BOOKING_RELEASE',b.variant_id,b.product_name,1,b.booking_no||' cancelled',auth.uid());
 UPDATE public.catalog_bookings SET status=CASE WHEN b.status='pending' THEN 'cancelled' ELSE 'refund_pending' END,note=left(_note,300) WHERE id=b.id;
END $$;
CREATE OR REPLACE FUNCTION public.record_catalog_refund(_id uuid,_mode text,_reference text,_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE; prior public.credit_payments%ROWTYPE; cust uuid; h text;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _request_id IS NULL OR _mode IS NULL OR _mode NOT IN ('Cash','UPI','Card','Bank') OR length(btrim(coalesce(_reference,''))) NOT BETWEEN 3 AND 150 THEN RAISE EXCEPTION 'Confirm refund method and payment reference/reason'; END IF;
 h:=md5(jsonb_build_array(_id,_mode,btrim(_reference),auth.uid())::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE operation_id=_request_id AND type='OP-ABANDONED') THEN RAISE EXCEPTION 'This request was closed by the Owner. Check transaction history.';END IF;
 SELECT * INTO prior FROM public.credit_payments WHERE operation_id=_request_id LIMIT 1;
 IF FOUND THEN IF prior.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Refund retry differs from original'; END IF;RETURN jsonb_build_object('refunded',prior.amount,'replayed',true);END IF;
 SELECT * INTO b FROM public.catalog_bookings WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR b.status<>'refund_pending' THEN RAISE EXCEPTION 'No pending refund for this order'; END IF;
 SELECT customer_id INTO cust FROM public.credit_payments WHERE booking_id=b.id AND entry_kind='catalog_advance';
 IF NOT FOUND THEN RAISE EXCEPTION 'Verify and record the original payment receipt before recording a refund'; END IF;
 INSERT INTO public.credit_payments(customer_id,booking_id,amount,payment_mode,note,collected_by,entry_kind,operation_id,request_hash)
 VALUES(cust,b.id,b.advance,_mode,btrim(_reference),auth.uid(),'catalog_refund',_request_id,h);
 UPDATE public.catalog_bookings SET status='refunded',refund_paid_at=now(),refund_reference=btrim(_reference),refund_mode=_mode WHERE id=b.id;
 RETURN jsonb_build_object('refunded',b.advance);
END $$;
REVOKE ALL ON FUNCTION public.record_catalog_refund(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_catalog_refund(uuid,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.complete_catalog_booking(_id uuid,_sale jsonb,_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE; r jsonb; cust uuid; subtotal numeric;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||(SELECT customer_id::text FROM public.credit_payments WHERE booking_id=_id AND entry_kind='catalog_advance'),400));
 SELECT * INTO b FROM public.catalog_bookings WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF b.sale_id IS NOT NULL AND b.status IN ('picked','delivered') THEN SELECT coalesce(request_result,jsonb_build_object('sale_id',id,'bill_no',bill_no,'unlocked','[]'::jsonb)) INTO r FROM public.sales WHERE id=b.sale_id AND voided_at IS NULL;IF r IS NULL THEN RAISE EXCEPTION 'The linked invoice is unavailable';END IF;RETURN r;END IF;
 IF b.status NOT IN ('confirmed','packed','shipped') OR b.receipt_recorded IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verify and record the payment receipt before billing'; END IF;
 SELECT customer_id INTO cust FROM public.credit_payments WHERE booking_id=b.id AND entry_kind='catalog_advance';
 subtotal:=b.price+coalesce(b.delivery_charge,0);
 IF jsonb_array_length(_items)<>1 OR (_items->0->>'variant_id')::uuid<>b.variant_id OR (_items->0->>'qty')::integer<>1 OR (_items->0->>'price')::numeric<>b.price OR coalesce((_sale->>'discount')::numeric,0)<>0 OR nullif(_sale->>'coupon_code','') IS NOT NULL OR nullif(_sale->>'reward_id','') IS NOT NULL THEN RAISE EXCEPTION 'Invoice must match the reserved pair and prepaid price'; END IF;
 IF (_sale->>'total')::numeric<>subtotal OR (_sale->>'paid_amount')::numeric<>subtotal OR coalesce((_sale->>'due_amount')::numeric,0)<>0 OR _sale->>'tax_mode'<>'inclusive' THEN RAISE EXCEPTION 'Invoice must include product and delivery, paid in full'; END IF;
 PERFORM set_config('app.catalog_billing',b.id::text,true);
 _sale:=_sale||jsonb_build_object('request_id',b.id,'customer_id',cust,'customer_name',b.customer_name,'delivery_charge',coalesce(b.delivery_charge,0),'catalog_booking_id',b.id);
 UPDATE public.product_variants SET stock=stock+1 WHERE id=b.variant_id;
 INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id)VALUES('BOOKING_RELEASE',b.variant_id,b.product_name,1,b.booking_no||' completed',auth.uid());
 r:=public.create_sale(_sale,_items);
 UPDATE public.credit_payments SET sale_id=(r->>'sale_id')::uuid WHERE booking_id=b.id AND entry_kind='catalog_advance';
 UPDATE public.sales SET delivery_charge=coalesce(b.delivery_charge,0) WHERE id=(r->>'sale_id')::uuid;
 UPDATE public.catalog_bookings SET status=CASE WHEN b.fulfillment='pickup' THEN 'picked' ELSE 'delivered' END,sale_id=(r->>'sale_id')::uuid WHERE id=b.id;
 PERFORM set_config('app.catalog_billing','',true);
 RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.expire_catalog_bookings() TO service_role;
-- Install a minute scheduler only where the provider has already enabled pg_cron.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  EXECUTE $job$SELECT cron.schedule('solestack-expire-orders','* * * * *','SELECT public.expire_catalog_bookings()')$job$;
 ELSE RAISE NOTICE 'pg_cron is unavailable; active stock/catalog screens also expire holds. Enable the optional minute scheduler for idle stores.'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
