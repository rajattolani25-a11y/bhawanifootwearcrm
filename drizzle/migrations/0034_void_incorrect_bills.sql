-- Cancel an incorrect bill atomically; keep its original invoice/audit record.
BEGIN;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS voided_by uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS void_refund_mode text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS void_metadata jsonb;
CREATE INDEX IF NOT EXISTS sales_voided_at_idx ON public.sales(voided_at) WHERE voided_at IS NOT NULL;
REVOKE DELETE ON public.sales FROM authenticated;
CREATE OR REPLACE FUNCTION public.sale_is_active(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_member(auth.uid()) AND EXISTS(SELECT 1 FROM public.sales s WHERE s.id=_id AND s.voided_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.sale_is_active(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sale_is_active(uuid) TO authenticated;
-- Restrictive policies also constrain the existing owner-all permissive policies.
DROP POLICY IF EXISTS "Hide void bills from normal queries" ON public.sales;
CREATE POLICY "Hide void bills from normal queries" ON public.sales AS RESTRICTIVE FOR SELECT TO authenticated USING(voided_at IS NULL);
DROP POLICY IF EXISTS "Hide void bill lines" ON public.sale_items;
CREATE POLICY "Hide void bill lines" ON public.sale_items AS RESTRICTIVE FOR SELECT TO authenticated USING(public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Hide void bill costs" ON public.sale_costs;
CREATE POLICY "Hide void bill costs" ON public.sale_costs AS RESTRICTIVE FOR SELECT TO authenticated USING(public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Hide void line costs" ON public.sale_item_costs;
CREATE POLICY "Hide void line costs" ON public.sale_item_costs AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.sale_items i WHERE i.id=sale_item_id));
DROP POLICY IF EXISTS "Hide void reversal entries" ON public.sale_returns;
CREATE POLICY "Hide void reversal entries" ON public.sale_returns AS RESTRICTIVE FOR SELECT TO authenticated USING(sale_id IS NULL OR public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Hide void collections" ON public.credit_payments;
CREATE POLICY "Hide void collections" ON public.credit_payments AS RESTRICTIVE FOR SELECT TO authenticated USING(public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Owner reads void event notes" ON public.loyalty_events;
CREATE POLICY "Owner reads void event notes" ON public.loyalty_events AS RESTRICTIVE FOR SELECT TO authenticated USING(action<>'bill_voided' OR public.has_role(auth.uid(),'owner'));
CREATE OR REPLACE FUNCTION public.void_sale(_sale_id uuid,_confirmation text,_reason text,_payment_settled boolean,_refund_mode text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales%ROWTYPE;i record;r jsonb;restored integer:=0;redemptions jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO s FROM public.sales WHERE id=_sale_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF s.voided_at IS NOT NULL THEN RETURN jsonb_build_object('voided',true,'bill_no',s.bill_no,'replayed',true); END IF;
 IF _confirmation IS DISTINCT FROM s.bill_no OR length(trim(coalesce(_reason,'')))<3 OR length(_reason)>500 THEN RAISE EXCEPTION 'Type the exact bill number and a reason (3 to 500 characters)'; END IF;
 IF s.paid_amount>0 AND (_payment_settled IS DISTINCT FROM true OR _refund_mode IS NULL OR _refund_mode NOT IN ('Cash','UPI','Card','Bank')) THEN RAISE EXCEPTION 'Confirm the original payment is settled and select its refund/reversal method'; END IF;
 IF EXISTS(SELECT 1 FROM public.sale_returns WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM public.credit_payments WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM public.catalog_bookings WHERE sale_id=s.id) THEN RAISE EXCEPTION 'This bill has returns, later collections or an online order. Reconcile those transactions instead of cancelling it.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id AND variant_id IS NULL) THEN RAISE EXCEPTION 'This historical bill has unlinked product sizes. Reconcile inventory before cancellation.'; END IF;
 IF s.reward_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.loyalty_rewards WHERE id=s.reward_id) THEN RAISE EXCEPTION 'The original redeemed reward is missing. Owner reconciliation is required.'; END IF;
 IF EXISTS(SELECT 1 FROM public.loyalty_rewards WHERE earned_sale_id=s.id AND status='used') THEN RAISE EXCEPTION 'A reward earned by this bill has already been spent. Owner reconciliation is required.'; END IF;
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT variant_id FROM public.sale_items WHERE sale_id=s.id) ORDER BY id FOR UPDATE;
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 FOR i IN SELECT * FROM public.sale_items WHERE sale_id=s.id ORDER BY id LOOP
  r:=public.process_sale_return(i.id,i.variant_id,i.qty,false,'return','Void incorrect bill: '||trim(_reason),_refund_mode,NULL,gen_random_uuid());
  IF coalesce((r->>'loyalty_review')::boolean,false) THEN RAISE EXCEPTION 'Historical or spent loyalty rewards require owner review before this bill can be cancelled. No changes saved.'; END IF;
  UPDATE public.stock_movements SET type='VOID-RESTORE',note=s.bill_no||' - Incorrect bill cancelled' WHERE type='RETURN' AND variant_id=i.variant_id AND note=s.bill_no||' Void incorrect bill: '||trim(_reason) AND user_id=auth.uid();
  restored:=restored+i.qty;
 END LOOP;
 IF s.reward_id IS NOT NULL THEN
  UPDATE public.loyalty_rewards SET status='active',used_sale_id=NULL WHERE id=s.reward_id AND used_sale_id=s.id AND status='used';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(cr)),'[]'::jsonb) INTO redemptions FROM public.coupon_redemptions cr WHERE cr.sale_id=s.id;
 IF s.coupon_id IS NOT NULL THEN
  PERFORM 1 FROM public.coupons WHERE id=s.coupon_id FOR UPDATE;
  UPDATE public.coupons SET used_count=greatest(used_count-(SELECT count(*)::integer FROM public.coupon_redemptions WHERE sale_id=s.id AND coupon_id=s.coupon_id),0) WHERE id=s.coupon_id;
  DELETE FROM public.coupon_redemptions WHERE sale_id=s.id;
 END IF;
 UPDATE public.sales SET due_amount=0,voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=trim(_reason),void_refund_mode=_refund_mode,void_metadata=jsonb_build_object('original_due',s.due_amount,'original_paid',s.paid_amount,'coupon_redemptions',redemptions) WHERE id=s.id;
 INSERT INTO public.loyalty_events(customer_id,action,note,sale_id) VALUES(s.customer_id,'bill_voided',s.bill_no||': '||trim(_reason),s.id);
 RETURN jsonb_build_object('voided',true,'bill_no',s.bill_no,'pairs_restored',restored);
END $$;
REVOKE ALL ON FUNCTION public.void_sale(uuid,text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_sale(uuid,text,text,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_void_sales(_offset integer DEFAULT 0,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb; v_count bigint;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _offset<0 OR _limit<1 OR _limit>100 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 SELECT count(*) INTO v_count FROM public.sales WHERE voided_at IS NOT NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO rows FROM (SELECT id,bill_no,customer_name,total,voided_at,void_reason FROM public.sales WHERE voided_at IS NOT NULL ORDER BY voided_at DESC,id LIMIT _limit OFFSET _offset)x;
 RETURN jsonb_build_object('rows',rows,'count',v_count);
END $$;
REVOKE ALL ON FUNCTION public.list_void_sales(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_void_sales(integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.stored_bill_line_count() RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RETURN (SELECT count(*) FROM public.sale_items);
END $$;
REVOKE ALL ON FUNCTION public.stored_bill_line_count() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stored_bill_line_count() TO authenticated;
-- A cashier recovering a lost response must not present a cancelled bill as valid.
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure) INTO d;
 IF position('-- void-bill-retry-guard' IN d)=0 THEN
  IF position('if v_existing.staff_id is distinct from auth.uid()' IN d)=0 THEN RAISE EXCEPTION 'Apply approved update 0032 first. No changes committed.'; END IF;
  d:=replace(d,'if v_existing.staff_id is distinct from auth.uid()',E'-- void-bill-retry-guard\n      if v_existing.voided_at is not null then raise exception ''The original billing request was cancelled. Start a fresh bill if needed.''; end if;\n      if v_existing.staff_id is distinct from auth.uid()');
  EXECUTE d;
 END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT to_regprocedure('public.void_sale(uuid,text,text,boolean,text)') IS NOT NULL AS void_bill_ready;
