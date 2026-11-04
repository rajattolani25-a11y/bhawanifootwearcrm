-- Part 5. Source: 0037_catalog_payment_reconciliation.sql. No reset/import/sale is executed.
BEGIN;
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
SELECT true AS part_05_applied;
