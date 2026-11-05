-- Part 3: whole-cart coupon counting and expired-reservation compatibility.
-- Definition changes only. Does not run an order, payment, refund or reset.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.create_catalog_cart_order(uuid,jsonb,text,text,text,text,text,jsonb)') IS NULL
 OR to_regprocedure('public.confirm_catalog_cart_payment(text,numeric,boolean)') IS NULL THEN
 RAISE EXCEPTION 'Apply cart Parts 1 and 2 first';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.coupon_usage_count(_id uuid,_code text) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (SELECT count(*) FROM public.coupon_redemptions r JOIN public.sales s ON s.id=r.sale_id WHERE r.coupon_id=_id AND s.voided_at IS NULL)+
 (SELECT count(DISTINCT coalesce(substring(b.booking_no from '^(CT-[0-9A-F]{16})-[0-9]{2}$'),b.booking_no)) FROM public.catalog_bookings b WHERE b.coupon_code=_code AND b.status NOT IN ('cancelled','expired','refunded') AND NOT(b.status='pending' AND b.expires_at<now()))
$$;
REVOKE ALL ON FUNCTION public.coupon_usage_count(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.revalidate_catalog_cart_coupon(_booking_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.catalog_bookings%ROWTYPE;c public.coupons%ROWTYPE;ref text;subtotal numeric;saved_discount numeric;amount numeric;own_active boolean;other_uses bigint;
BEGIN
 SELECT * INTO b FROM public.catalog_bookings WHERE id=_booking_id;
 ref:=substring(b.booking_no from '^(CT-[0-9A-F]{16})-[0-9]{2}$');
 IF ref IS NULL OR b.coupon_code IS NULL THEN RAISE EXCEPTION 'Invalid cart coupon reservation';END IF;
 SELECT * INTO c FROM public.coupons WHERE code=b.coupon_code FOR UPDATE;
 IF NOT FOUND OR NOT c.active THEN RAISE EXCEPTION 'Coupon not found or inactive';END IF;
 IF c.starts_at IS NOT NULL AND c.starts_at>now()THEN RAISE EXCEPTION 'Coupon is not active yet';END IF;
 IF c.expires_at IS NOT NULL AND c.expires_at<now()THEN RAISE EXCEPTION 'Coupon has expired';END IF;
 IF c.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=c.customer_id AND right(regexp_replace(coalesce(mobile,''),'\D','','g'),10)=b.mobile)THEN RAISE EXCEPTION 'This coupon belongs to another customer';END IF;
 IF EXISTS(SELECT 1 FROM public.catalog_bookings x WHERE x.booking_no>=ref||'-'AND x.booking_no<ref||'.'AND x.coupon_code=c.code AND x.status NOT IN('pending','expired','confirmed','packed','shipped','picked','delivered'))THEN RAISE EXCEPTION 'This expired coupon cart has cancelled pairs. Review it before accepting payment';END IF;
 SELECT sum(price+coupon_discount),sum(coupon_discount),coalesce(bool_or(status NOT IN('cancelled','expired','refunded')AND NOT(status='pending'AND expires_at<now())),false)
 INTO subtotal,saved_discount,own_active FROM public.catalog_bookings WHERE booking_no>=ref||'-'AND booking_no<ref||'.'AND coupon_code=c.code;
 other_uses:=public.coupon_usage_count(c.id,c.code)-CASE WHEN own_active THEN 1 ELSE 0 END;
 IF c.usage_limit IS NOT NULL AND other_uses>=c.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit reached';END IF;
 IF EXISTS(SELECT 1 FROM public.coupon_redemptions r JOIN public.customers cu ON cu.id=r.customer_id WHERE r.coupon_id=c.id AND right(regexp_replace(coalesce(cu.mobile,''),'\D','','g'),10)=b.mobile)
 OR EXISTS(SELECT 1 FROM public.catalog_bookings x WHERE x.coupon_code=c.code AND x.mobile=b.mobile AND NOT(x.booking_no>=ref||'-'AND x.booking_no<ref||'.')AND x.status NOT IN('cancelled','expired','refunded')AND NOT(x.status='pending'AND x.expires_at<now()))THEN RAISE EXCEPTION 'You have already used this coupon';END IF;
 IF subtotal IS NULL OR subtotal<c.min_bill THEN RAISE EXCEPTION 'This cart no longer meets the coupon minimum';END IF;
 amount:=CASE WHEN c.kind='percent'THEN round(subtotal*c.value/100,2)ELSE c.value END;
 IF c.max_discount IS NOT NULL THEN amount:=least(amount,c.max_discount);END IF;
 amount:=least(amount,greatest(subtotal-1,0));
 IF saved_discount IS DISTINCT FROM amount THEN RAISE EXCEPTION 'Coupon conditions changed. Review this expired cart before accepting payment';END IF;
 UPDATE public.coupons SET used_count=other_uses+1 WHERE id=c.id;
END $$;
REVOKE ALL ON FUNCTION public.revalidate_catalog_cart_coupon(uuid) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE d text;pattern text;replacement text;
BEGIN
 SELECT pg_get_functiondef('public.confirm_catalog_booking(uuid)'::regprocedure)INTO d;
 IF position('public.revalidate_catalog_cart_coupon(b.id)'IN d)=0 THEN
 pattern:='IF[[:space:]]+b[.]coupon_code[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+THEN[[:space:]]+PERFORM[[:space:]]+public[.]catalog_coupon_amount\(b[.]coupon_code,[[:space:]]*b[.]mobile,[[:space:]]*b[.]price[[:space:]]*\+[[:space:]]*b[.]coupon_discount,[[:space:]]*true\);[[:space:]]*UPDATE[[:space:]]+public[.]coupons[[:space:]]+SET[[:space:]]+used_count[[:space:]]*=[[:space:]]*used_count[[:space:]]*\+[[:space:]]*1[[:space:]]+WHERE[[:space:]]+code[[:space:]]*=[[:space:]]*b[.]coupon_code;[[:space:]]*END[[:space:]]+IF;';
 IF(SELECT count(*)FROM regexp_matches(d,pattern,'gi'))<>1 THEN RAISE EXCEPTION 'Unexpected payment confirmation definition. Stop for review';END IF;
 replacement:='IF b.coupon_code IS NOT NULL THEN IF b.booking_no ~ ''^CT-[0-9A-F]{16}-[0-9]{2}$'' THEN PERFORM public.revalidate_catalog_cart_coupon(b.id); ELSE PERFORM public.catalog_coupon_amount(b.coupon_code,b.mobile,b.price+b.coupon_discount,true); UPDATE public.coupons SET used_count=used_count+1 WHERE code=b.coupon_code; END IF; END IF;';
 EXECUTE regexp_replace(d,pattern,replacement,'i');
 END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
