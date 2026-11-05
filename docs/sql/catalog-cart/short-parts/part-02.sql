-- Part 2 of 2: tracking, manual payment confirmation and activation.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.create_catalog_cart_order(uuid,jsonb,text,text,text,text,text,jsonb)') IS NULL
 OR to_regprocedure('public.catalog_cart_result(uuid)') IS NULL THEN
 RAISE EXCEPTION 'Apply complete cart Part 1 first'; END IF;
END $$;
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
