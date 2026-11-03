-- PART 2 OF 5. Run after Part 1.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_returns' AND column_name='operation_id') THEN RAISE EXCEPTION 'Run Part 1 first'; END IF;
END $$;
-- Remaining physical pairs for one original invoice line. New exchanges transfer
-- a position to its replacement size; historical unlinked exchanges stay consumed.
CREATE OR REPLACE FUNCTION public.sale_return_positions(_item uuid)
RETURNS TABLE(variant_id uuid,size text,qty integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 RETURN QUERY WITH movements AS (
  SELECT si.variant_id,si.size,si.qty::bigint AS delta FROM public.sale_items si WHERE si.id=_item
  UNION ALL SELECT r.variant_id,r.size,-r.qty::bigint FROM public.sale_returns r WHERE r.sale_item_id=_item
  UNION ALL SELECT r.replacement_variant_id,r.replacement_size,r.qty::bigint FROM public.sale_returns r WHERE r.sale_item_id=_item AND r.kind='exchange' AND r.replacement_variant_id IS NOT NULL
 ) SELECT m.variant_id,max(m.size),sum(m.delta)::integer FROM movements m GROUP BY m.variant_id HAVING sum(m.delta)>0;
END $$;
REVOKE ALL ON FUNCTION public.sale_return_positions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sale_return_positions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_sale_return(
 _sale_item_id uuid,_variant_id uuid,_qty integer,_damaged boolean,_kind text,
 _note text DEFAULT '',_refund_mode text DEFAULT NULL,_replacement_variant_id uuid DEFAULT NULL,_operation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE si public.sale_items%ROWTYPE; sa public.sales%ROWTYPE; previous public.sale_returns%ROWTYPE;
 available integer; old_size text; replacement public.product_variants%ROWTYPE; old_product uuid;
 already integer; gross numeric; refund numeric:=0; tax_part numeric:=0; gst_part numeric:=0; cost_part numeric:=0; due_part numeric:=0; payout numeric:=0;
 c public.customers%ROWTYPE; v_card text; threshold numeric; reverse_stamp boolean; visit_count integer; r record; review boolean:=false;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _kind IS NULL OR _kind NOT IN ('return','defect','exchange') OR _qty IS NULL OR _qty<=0 OR _damaged IS NULL THEN RAISE EXCEPTION 'Invalid return'; END IF;
 IF _operation_id IS NULL THEN RAISE EXCEPTION 'A return request identifier is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_operation_id::text,33));
 SELECT * INTO previous FROM public.sale_returns WHERE operation_id=_operation_id;
 IF FOUND THEN
  IF previous.sale_item_id IS DISTINCT FROM _sale_item_id OR previous.variant_id IS DISTINCT FROM _variant_id OR previous.qty<>_qty OR previous.kind<>_kind OR previous.damaged<>_damaged OR previous.replacement_variant_id IS DISTINCT FROM _replacement_variant_id OR previous.refund_mode IS DISTINCT FROM _refund_mode THEN RAISE EXCEPTION 'Return request does not match the previous operation'; END IF;
  RETURN jsonb_build_object('refund',previous.refund,'payout',previous.cash_refund,'replayed',true);
 END IF;
 -- Lock bill before line: all return/exchange operations on a bill serialize.
 SELECT s.* INTO sa FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id WHERE i.id=_sale_item_id FOR UPDATE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 SELECT * INTO si FROM public.sale_items WHERE id=_sale_item_id FOR UPDATE;
 SELECT p.qty,p.size INTO available,old_size FROM public.sale_return_positions(si.id) p WHERE p.variant_id IS NOT DISTINCT FROM _variant_id;
 IF coalesce(available,0)<_qty THEN RAISE EXCEPTION 'This size is no longer returnable. Reload the bill.'; END IF;
 IF _kind='exchange' THEN
  IF _damaged OR _variant_id IS NULL OR _replacement_variant_id IS NULL OR _replacement_variant_id=_variant_id THEN RAISE EXCEPTION 'Choose a different available size for exchange'; END IF;
  -- Stable lock order also prevents opposite simultaneous swaps deadlocking.
  PERFORM 1 FROM public.product_variants WHERE id IN (_variant_id,_replacement_variant_id) ORDER BY id FOR UPDATE;
  SELECT product_id INTO old_product FROM public.product_variants WHERE id=_variant_id;
  SELECT * INTO replacement FROM public.product_variants WHERE id=_replacement_variant_id;
  IF NOT FOUND OR replacement.product_id IS DISTINCT FROM old_product THEN RAISE EXCEPTION 'Size exchange must use the same article. Use a return and separate purchase for a different article.'; END IF;
  IF replacement.stock<_qty THEN RAISE EXCEPTION 'Replacement size is out of stock'; END IF;
  UPDATE public.product_variants SET stock=stock-_qty WHERE id=replacement.id;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note,user_id) VALUES('EXCHANGE-OUT',replacement.id,si.product_name||' ('||replacement.size||')',_qty,sa.bill_no,auth.uid());
 ELSE
  IF _replacement_variant_id IS NOT NULL THEN RAISE EXCEPTION 'Replacement is only valid for a size exchange'; END IF;
  IF _refund_mode IS NOT NULL AND _refund_mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid refund method'; END IF;
  SELECT coalesce(sum(qty),0) INTO already FROM public.sale_returns WHERE sale_item_id=si.id AND kind<>'exchange';
  -- Cumulative rounding means separately returning three pairs cannot over-refund a paisa.
  gross:=si.price;
  refund:=coalesce(round(gross*(already+_qty)*greatest(sa.subtotal-sa.discount,0)/nullif(sa.subtotal,0)*CASE WHEN sa.tax_mode='exclusive' AND sa.bill_type='gst' THEN 1+sa.gst_rate/100 ELSE 1 END,2)-round(gross*already*greatest(sa.subtotal-sa.discount,0)/nullif(sa.subtotal,0)*CASE WHEN sa.tax_mode='exclusive' AND sa.bill_type='gst' THEN 1+sa.gst_rate/100 ELSE 1 END,2),0);
  tax_part:=coalesce(round(sa.taxable*gross*(already+_qty)/nullif(sa.subtotal,0),2)-round(sa.taxable*gross*already/nullif(sa.subtotal,0),2),0);
  gst_part:=coalesce(round(sa.gst_amount*gross*(already+_qty)/nullif(sa.subtotal,0),2)-round(sa.gst_amount*gross*already/nullif(sa.subtotal,0),2),0);
  SELECT coalesce((SELECT unit_cost FROM public.sale_item_costs WHERE sale_item_id=si.id),(SELECT sc.total_cost/nullif((SELECT sum(qty) FROM public.sale_items WHERE sale_id=sa.id),0) FROM public.sale_costs sc WHERE sc.sale_id=sa.id),0)*_qty INTO cost_part;
  due_part:=least(refund,sa.due_amount);payout:=refund-due_part;
  IF payout>0 AND _refund_mode IS NULL THEN RAISE EXCEPTION 'Confirm the actual refund payment method'; END IF;
  UPDATE public.sales SET due_amount=greatest(due_amount-due_part,0) WHERE id=sa.id;
 END IF;
 IF _variant_id IS NOT NULL THEN
  UPDATE public.product_variants SET stock=stock+CASE WHEN _damaged THEN 0 ELSE _qty END,damaged_stock=damaged_stock+CASE WHEN _damaged THEN _qty ELSE 0 END WHERE id=_variant_id;
 END IF;
 INSERT INTO public.sale_returns(sale_id,sale_item_id,variant_id,product_name,size,qty,refund,kind,damaged,note,taxable_reversal,gst_reversal,cost_reversal,cash_refund,refund_mode,replacement_variant_id,replacement_size,operation_id)
 VALUES(sa.id,si.id,_variant_id,si.product_name,coalesce(old_size,si.size),_qty,refund,_kind,_damaged,coalesce(_note,''),tax_part,gst_part,cost_part,payout,_refund_mode,_replacement_variant_id,replacement.size,_operation_id);
 INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id) VALUES(CASE WHEN _kind='exchange' THEN 'EXCHANGE-IN' WHEN _damaged THEN 'RETURN-DAMAGED' ELSE 'RETURN' END,_variant_id,si.product_name||' ('||coalesce(old_size,si.size)||')',_qty,sa.bill_no||' '||coalesce(_note,''),auth.uid());
 IF _kind<>'exchange' AND sa.customer_id IS NOT NULL THEN
  SELECT * INTO c FROM public.customers WHERE id=sa.customer_id FOR UPDATE;
  PERFORM set_config('app.loyalty_bypass','1',true);
  FOREACH v_card IN ARRAY ARRAY['regular','premium'] LOOP
   threshold:=CASE WHEN v_card='regular' THEN 299 ELSE 999 END;
   reverse_stamp:=CASE WHEN v_card='regular' THEN sa.stamp_regular AND NOT coalesce(sa.stamp_regular_reversed,false) ELSE sa.stamp_premium AND NOT coalesce(sa.stamp_premium_reversed,false) END;
   IF reverse_stamp AND sa.total-(SELECT coalesce(sum(sr.refund),0) FROM public.sale_returns sr WHERE sr.sale_id=sa.id AND sr.kind<>'exchange')<threshold THEN
    IF v_card='regular' THEN
     UPDATE public.customers SET regular_stamps=(regular_stamps+19)%20,regular_visits=greatest(regular_visits-1,0) WHERE id=c.id RETURNING regular_visits INTO visit_count;
     UPDATE public.sales SET stamp_regular_reversed=true WHERE id=sa.id;
    ELSE
     UPDATE public.customers SET premium_stamps=(premium_stamps+19)%20,premium_visits=greatest(premium_visits-1,0) WHERE id=c.id RETURNING premium_visits INTO visit_count;
     UPDATE public.sales SET stamp_premium_reversed=true WHERE id=sa.id;
    END IF;
    FOR r IN SELECT * FROM public.loyalty_rewards lr WHERE lr.customer_id=c.id AND lr.card=v_card AND lr.earned_visit_number>visit_count AND lr.status IN ('active','used') FOR UPDATE LOOP
     IF r.status='active' THEN UPDATE public.loyalty_rewards SET status='cancelled' WHERE id=r.id;
     ELSE review:=true; END IF;
     INSERT INTO public.loyalty_events(reward_id,customer_id,action,note,sale_id) VALUES(r.id,c.id,CASE WHEN r.status='used' THEN 'return_reward_review' ELSE 'return_reward_cancelled' END,'Purchase eligibility removed after return; spent rewards are never automatically charged back',sa.id);
    END LOOP;
    FOR r IN SELECT * FROM public.loyalty_rewards lr WHERE lr.customer_id=c.id AND lr.card=v_card AND lr.earned_visit_number IS NULL AND lr.status IN ('active','used') LOOP
     review:=true;
     INSERT INTO public.loyalty_events(reward_id,customer_id,action,note,sale_id) VALUES(r.id,c.id,'return_reward_review','Historical voucher has no source purchase link. Owner must review; no automatic cancellation or charge.',sa.id);
    END LOOP;
   END IF;
  END LOOP;
  UPDATE public.customers SET last_stamp_date=(SELECT max((s.sale_date AT TIME ZONE 'Asia/Kolkata')::date) FROM public.sales s WHERE s.customer_id=c.id AND ((s.stamp_regular AND NOT coalesce(s.stamp_regular_reversed,false)) OR (s.stamp_premium AND NOT coalesce(s.stamp_premium_reversed,false)))) WHERE id=c.id;
 END IF;
 RETURN jsonb_build_object('refund',refund,'payout',payout,'refund_mode',_refund_mode,'loyalty_review',review,'replacement_size',replacement.size);
END $$;
REVOKE ALL ON FUNCTION public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid) TO authenticated;
-- Old clients must not perform an unlinked exchange or a refund with no method.
CREATE OR REPLACE FUNCTION public.process_return(_sale_item_id uuid,_qty integer,_damaged boolean,_kind text,_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Reload the app to use the verified return / size exchange flow.'; END $$;


COMMIT;
SELECT to_regprocedure('public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid)') IS NOT NULL AS part_2_ready;
