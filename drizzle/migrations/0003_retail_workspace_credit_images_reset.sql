ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

CREATE TABLE public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL DEFAULT 'Cash' CHECK (payment_mode IN ('Cash','UPI','Card','Bank')),
  note text,
  collected_by uuid DEFAULT auth.uid(),
  paid_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credit_payments TO authenticated;
GRANT ALL ON public.credit_payments TO service_role;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read credit payments" ON public.credit_payments FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "Members collect credit payments" ON public.credit_payments FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid()) AND collected_by = auth.uid());
CREATE INDEX credit_payments_sale_idx ON public.credit_payments(sale_id);
CREATE INDEX credit_payments_customer_idx ON public.credit_payments(customer_id);
CREATE INDEX credit_payments_paid_at_idx ON public.credit_payments(paid_at DESC);

CREATE OR REPLACE FUNCTION public.collect_credit_payment(_sale_id uuid, _amount numeric, _mode text DEFAULT 'Cash', _note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_amount numeric;
BEGIN
  IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment must be greater than zero'; END IF;
  IF _mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid payment mode'; END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_sale.due_amount <= 0 THEN RAISE EXCEPTION 'This bill has no outstanding amount'; END IF;

  v_amount := LEAST(_amount, v_sale.due_amount);
  INSERT INTO public.credit_payments(sale_id, customer_id, amount, payment_mode, note, collected_by)
  VALUES (v_sale.id, v_sale.customer_id, v_amount, _mode, NULLIF(trim(_note), ''), auth.uid());

  UPDATE public.sales
  SET paid_amount = paid_amount + v_amount,
      due_amount = greatest(due_amount - v_amount, 0)
  WHERE id = v_sale.id;

  RETURN jsonb_build_object('bill_no', v_sale.bill_no, 'collected', v_amount, 'due', greatest(v_sale.due_amount - v_amount, 0));
END;
$$;
GRANT EXECUTE ON FUNCTION public.collect_credit_payment(uuid,numeric,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.collect_credit_payment(uuid,numeric,text,text) FROM anon;

CREATE OR REPLACE FUNCTION public.reset_store_data(_confirmation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF _confirmation <> 'RESET BHAWANI FOOTWEAR' THEN RAISE EXCEPTION 'Confirmation text does not match'; END IF;

  DELETE FROM public.loyalty_events WHERE id IS NOT NULL;
  DELETE FROM public.loyalty_rewards WHERE id IS NOT NULL;
  DELETE FROM public.credit_payments WHERE id IS NOT NULL;
  DELETE FROM public.sale_returns WHERE id IS NOT NULL;
  DELETE FROM public.sale_costs WHERE sale_id IS NOT NULL;
  DELETE FROM public.sale_items WHERE id IS NOT NULL;
  DELETE FROM public.sales WHERE id IS NOT NULL;
  DELETE FROM public.expenses WHERE id IS NOT NULL;
  DELETE FROM public.purchases WHERE id IS NOT NULL;
  DELETE FROM public.stock_movements WHERE id IS NOT NULL;
  DELETE FROM public.product_costs WHERE product_id IS NOT NULL;
  DELETE FROM public.product_variants WHERE id IS NOT NULL;
  DELETE FROM public.products WHERE id IS NOT NULL;
  DELETE FROM public.suppliers WHERE id IS NOT NULL;
  DELETE FROM public.customers WHERE id IS NOT NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_store_data(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_store_data(text) FROM anon;
