CREATE OR REPLACE FUNCTION public.process_return(_sale_item_id uuid,_qty integer,_damaged boolean,_kind text,_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE si public.sale_items%ROWTYPE; sa public.sales%ROWTYPE; already int; gross numeric; refund numeric; taxable_part numeric; gst_part numeric; cost_part numeric; due_offset numeric; cash_part numeric;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _kind NOT IN ('return','defect','exchange') THEN RAISE EXCEPTION 'Invalid return type'; END IF;
 IF _qty IS NULL OR _qty<=0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
 SELECT * INTO si FROM public.sale_items WHERE id=_sale_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill item not found'; END IF;
 SELECT * INTO sa FROM public.sales WHERE id=si.sale_id FOR UPDATE;
 SELECT coalesce(sum(qty),0) INTO already FROM public.sale_returns WHERE sale_item_id=_sale_item_id;
 IF _qty+already>si.qty THEN RAISE EXCEPTION 'Return qty more than sold'; END IF;
 gross:=si.price*_qty;
 refund:=CASE WHEN _kind='exchange' THEN 0 ELSE round(gross*greatest(sa.subtotal-sa.discount,0)/nullif(sa.subtotal,0),2) END;
 refund:=coalesce(refund,0);
 IF _kind<>'exchange' AND sa.tax_mode='exclusive' AND sa.bill_type='gst' THEN refund:=round(refund*(1+sa.gst_rate/100),2); END IF;
 taxable_part:=CASE WHEN _kind='exchange' THEN 0 ELSE round(sa.taxable*gross/nullif(sa.subtotal,0),2) END;
 gst_part:=CASE WHEN _kind='exchange' THEN 0 ELSE round(sa.gst_amount*gross/nullif(sa.subtotal,0),2) END;
 cost_part:=CASE WHEN _kind='exchange' THEN 0 ELSE round(coalesce((SELECT unit_cost FROM public.sale_item_costs WHERE sale_item_id=si.id),(SELECT sc.total_cost/nullif((SELECT sum(qty) FROM public.sale_items WHERE sale_id=sa.id),0) FROM public.sale_costs sc WHERE sc.sale_id=sa.id),0)*_qty,2) END;
 due_offset:=least(refund,sa.due_amount);cash_part:=refund-due_offset;
 IF si.variant_id IS NOT NULL THEN IF _damaged THEN UPDATE public.product_variants SET damaged_stock=damaged_stock+_qty WHERE id=si.variant_id; ELSE UPDATE public.product_variants SET stock=stock+_qty WHERE id=si.variant_id; END IF; END IF;
 INSERT INTO public.sale_returns(sale_id,sale_item_id,variant_id,product_name,size,qty,refund,kind,damaged,note,taxable_reversal,gst_reversal,cost_reversal,cash_refund)
 VALUES(sa.id,si.id,si.variant_id,si.product_name,si.size,_qty,refund,_kind,_damaged,coalesce(_note,''),coalesce(taxable_part,0),coalesce(gst_part,0),coalesce(cost_part,0),cash_part);
 IF due_offset>0 THEN UPDATE public.sales SET due_amount=greatest(due_amount-due_offset,0) WHERE id=sa.id; END IF;
 INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id) VALUES(CASE WHEN _damaged THEN 'RETURN-DAMAGED' ELSE 'RETURN' END,si.variant_id,si.product_name||' ('||si.size||')',_qty,coalesce(_note,''),auth.uid());
 RETURN refund;
END $$;