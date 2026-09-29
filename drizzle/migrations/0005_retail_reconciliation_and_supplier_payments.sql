ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS taxable_reversal numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS gst_reversal numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS cost_reversal numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS cash_refund numeric NOT NULL DEFAULT 0;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS free_sample boolean NOT NULL DEFAULT false;
CREATE TABLE public.supplier_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id uuid NOT NULL REFERENCES public.suppliers(id), purchase_id uuid REFERENCES public.purchases(id), amount numeric NOT NULL CHECK (amount > 0), payment_mode text NOT NULL CHECK (payment_mode IN ('Cash','UPI','Card','Bank')), note text NOT NULL DEFAULT '', paid_at timestamptz NOT NULL DEFAULT now(), recorded_by uuid DEFAULT auth.uid()
);
GRANT SELECT ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads supplier payments" ON public.supplier_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE INDEX supplier_payments_supplier_idx ON public.supplier_payments(supplier_id,paid_at DESC);
CREATE OR REPLACE FUNCTION public.record_supplier_payment(_supplier_id uuid, _amount numeric, _mode text, _note text DEFAULT '', _purchase_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_due numeric; v_purchase public.purchases%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment must be greater than zero'; END IF;
 IF _mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid payment mode'; END IF;
 PERFORM 1 FROM public.suppliers WHERE id=_supplier_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
 IF _purchase_id IS NOT NULL THEN
   SELECT * INTO v_purchase FROM public.purchases WHERE id=_purchase_id AND supplier_id=_supplier_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Supplier invoice not found'; END IF;
   v_due := greatest(v_purchase.total-coalesce(v_purchase.paid_amount,0),0);
 ELSE
   SELECT coalesce(sum(total-coalesce(paid_amount,0)),0) INTO v_due FROM public.purchases WHERE supplier_id=_supplier_id;
 END IF;
 IF _amount > v_due THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 INSERT INTO public.supplier_payments(supplier_id,purchase_id,amount,payment_mode,note,recorded_by) VALUES (_supplier_id,_purchase_id,_amount,_mode,trim(coalesce(_note,'')),auth.uid());
 IF _purchase_id IS NOT NULL THEN
   UPDATE public.purchases SET paid_amount=coalesce(paid_amount,0)+_amount WHERE id=_purchase_id;
 ELSE
   WITH allocations AS (
     SELECT id, least(greatest(total-coalesce(paid_amount,0),0), greatest(_amount-coalesce(sum(greatest(total-coalesce(paid_amount,0),0)) OVER (ORDER BY purchase_date,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0),0)) AS applied
     FROM public.purchases WHERE supplier_id=_supplier_id AND total>coalesce(paid_amount,0)
   ) UPDATE public.purchases p SET paid_amount=coalesce(p.paid_amount,0)+a.applied FROM allocations a WHERE p.id=a.id AND a.applied>0;
 END IF;
 RETURN v_due-_amount;
END $$;
REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid,numeric,text,text,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid,numeric,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.receive_stock(_supplier_id uuid, _supplier_name text, _invoice text, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; v record; n int := 0; q int; pr numeric; g numeric; v_free boolean;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only owner can receive stock'; END IF;
 IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Add stock before receiving'; END IF;
 FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
   q := (it->>'qty')::int; pr := (it->>'price')::numeric; g := coalesce((it->>'gst_rate')::numeric,0); v_free := coalesce((it->>'free_sample')::boolean,false);
   IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
   IF pr IS NULL OR pr < 0 OR (pr=0 AND NOT v_free) THEN RAISE EXCEPTION 'Enter purchase cost or mark as free/sample stock'; END IF;
   IF v_free AND pr<>0 THEN RAISE EXCEPTION 'Sample stock must have zero cost'; END IF;
   IF g < 0 OR g > 28 THEN RAISE EXCEPTION 'Invalid GST rate'; END IF;
   SELECT pv.id,pv.product_id,pv.size,p.brand,p.article INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=(it->>'variant_id')::uuid FOR UPDATE OF pv;
   IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;
   UPDATE public.product_variants SET stock=stock+q WHERE id=v.id;
   INSERT INTO public.purchases(supplier_id,supplier_name,invoice_no,variant_id,quantity,purchase_price,gst_rate,gst_amount,total,paid_amount,free_sample)
     VALUES (_supplier_id,coalesce(_supplier_name,''),coalesce(_invoice,''),v.id,q,pr,g,round(pr*q*g/100,2),round(pr*q*(1+g/100),2),0,v_free);
   IF pr>0 THEN INSERT INTO public.product_costs(product_id,purchase_price) VALUES (v.product_id,pr) ON CONFLICT (product_id) DO UPDATE SET purchase_price=excluded.purchase_price; END IF;
   INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id) VALUES ('PURCHASE',v.id,v.brand||' '||v.article||' ('||v.size||')',q,coalesce(_invoice,''),auth.uid());
   n:=n+q;
 END LOOP;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.capture_sale_item_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF new.unit_cost IS NULL AND new.variant_id IS NOT NULL THEN
   SELECT pc.purchase_price INTO new.unit_cost FROM public.product_variants pv JOIN public.product_costs pc ON pc.product_id=pv.product_id WHERE pv.id=new.variant_id;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER capture_sale_item_cost BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.capture_sale_item_cost();
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
 gross := si.price*_qty;
 refund := CASE WHEN _kind='exchange' THEN 0 ELSE round(gross*greatest(sa.subtotal-sa.discount,0)/nullif(sa.subtotal,0),2) END;
 refund := coalesce(refund,0);
 IF _kind<>'exchange' AND sa.tax_mode='exclusive' AND sa.bill_type='gst' THEN refund:=round(refund*(1+sa.gst_rate/100),2); END IF;
 taxable_part := CASE WHEN _kind='exchange' THEN 0 ELSE round(sa.taxable*gross/nullif(sa.subtotal,0),2) END;
 gst_part := CASE WHEN _kind='exchange' THEN 0 ELSE round(sa.gst_amount*gross/nullif(sa.subtotal,0),2) END;
 cost_part := CASE WHEN _kind='exchange' THEN 0 ELSE round(coalesce(si.unit_cost,coalesce((SELECT sc.total_cost/nullif((SELECT sum(qty) FROM public.sale_items WHERE sale_id=sa.id),0) FROM public.sale_costs sc WHERE sc.sale_id=sa.id),0))*_qty,2) END;
 due_offset := least(refund,sa.due_amount);
 cash_part := refund-due_offset;
 IF si.variant_id IS NOT NULL THEN
   IF _damaged THEN UPDATE public.product_variants SET damaged_stock=damaged_stock+_qty WHERE id=si.variant_id;
   ELSE UPDATE public.product_variants SET stock=stock+_qty WHERE id=si.variant_id; END IF;
 END IF;
 INSERT INTO public.sale_returns(sale_id,sale_item_id,variant_id,product_name,size,qty,refund,kind,damaged,note,taxable_reversal,gst_reversal,cost_reversal,cash_refund)
 VALUES (sa.id,si.id,si.variant_id,si.product_name,si.size,_qty,refund,_kind,_damaged,coalesce(_note,''),coalesce(taxable_part,0),coalesce(gst_part,0),coalesce(cost_part,0),cash_part);
 IF due_offset>0 THEN UPDATE public.sales SET due_amount=greatest(due_amount-due_offset,0) WHERE id=sa.id; END IF;
 INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id)
 VALUES (CASE WHEN _damaged THEN 'RETURN-DAMAGED' ELSE 'RETURN' END,si.variant_id,si.product_name||' ('||si.size||')',_qty,coalesce(_note,''),auth.uid());
 RETURN refund;
END $$;
REVOKE INSERT ON public.credit_payments FROM authenticated;
DROP POLICY IF EXISTS "Members collect credit payments" ON public.credit_payments;
CREATE OR REPLACE FUNCTION public.ensure_variant_code(_variant_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code text;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT coalesce(nullif(barcode,''),nullif(sku,'')) INTO v_code FROM public.product_variants WHERE id=_variant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Size not found'; END IF;
 IF v_code IS NULL THEN
   v_code:='BF'||replace(_variant_id::text,'-','');
   UPDATE public.product_variants SET barcode=v_code WHERE id=_variant_id;
 END IF;
 RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.ensure_variant_code(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.ensure_variant_code(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reset_store_data(_confirmation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _confirmation <> 'RESET BHAWANI FOOTWEAR' THEN RAISE EXCEPTION 'Confirmation text does not match'; END IF;
 DELETE FROM public.loyalty_events WHERE id IS NOT NULL;
 DELETE FROM public.loyalty_rewards WHERE id IS NOT NULL;
 DELETE FROM public.credit_payments WHERE id IS NOT NULL;
 DELETE FROM public.sale_returns WHERE id IS NOT NULL;
 DELETE FROM public.sale_costs WHERE sale_id IS NOT NULL;
 DELETE FROM public.sale_items WHERE id IS NOT NULL;
 DELETE FROM public.sales WHERE id IS NOT NULL;
 DELETE FROM public.expenses WHERE id IS NOT NULL;
 DELETE FROM public.supplier_payments WHERE id IS NOT NULL;
 DELETE FROM public.purchases WHERE id IS NOT NULL;
 DELETE FROM public.stock_movements WHERE id IS NOT NULL;
 DELETE FROM public.product_costs WHERE product_id IS NOT NULL;
 DELETE FROM public.product_variants WHERE id IS NOT NULL;
 DELETE FROM public.products WHERE id IS NOT NULL;
 DELETE FROM public.suppliers WHERE id IS NOT NULL;
 DELETE FROM public.customers WHERE id IS NOT NULL;
END $$;