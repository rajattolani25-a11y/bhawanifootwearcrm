CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text,
  spent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  category text NOT NULL DEFAULT 'Other',
  note text DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'Cash',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all" ON public.expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner')) WITH CHECK (has_role(auth.uid(),'owner'));

CREATE TABLE public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id),
  sale_item_id uuid REFERENCES public.sale_items(id),
  variant_id uuid REFERENCES public.product_variants(id),
  product_name text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  qty integer NOT NULL,
  refund numeric NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'return',
  damaged boolean NOT NULL DEFAULT false,
  note text DEFAULT '',
  user_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_returns TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read" ON public.sale_returns FOR SELECT TO authenticated USING (is_member(auth.uid()));

CREATE OR REPLACE FUNCTION public.receive_stock(_supplier_id uuid, _supplier_name text, _invoice text, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; v record; n int := 0; q int; pr numeric; g numeric;
BEGIN
  IF NOT has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only owner can receive stock'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := (it->>'qty')::int; pr := coalesce((it->>'price')::numeric,0); g := coalesce((it->>'gst_rate')::numeric,0);
    IF q IS NULL OR q <= 0 THEN CONTINUE; END IF;
    SELECT pv.id, pv.product_id, pv.size, p.brand, p.article INTO v
      FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = (it->>'variant_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;
    UPDATE product_variants SET stock = stock + q WHERE id = v.id;
    INSERT INTO purchases(supplier_id, supplier_name, invoice_no, variant_id, quantity, purchase_price, gst_rate, gst_amount, total, paid_amount)
      VALUES (_supplier_id, coalesce(_supplier_name,''), coalesce(_invoice,''), v.id, q, pr, g, round(pr*q*g/100,2), round(pr*q*(1+g/100),2), 0);
    IF pr > 0 THEN
      INSERT INTO product_costs(product_id, purchase_price) VALUES (v.product_id, pr)
        ON CONFLICT (product_id) DO UPDATE SET purchase_price = EXCLUDED.purchase_price;
    END IF;
    INSERT INTO stock_movements(type, variant_id, product_name, qty_in, note, user_id)
      VALUES ('PURCHASE', v.id, v.brand||' '||v.article||' ('||v.size||')', q, coalesce(_invoice,''), auth.uid());
    n := n + q;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.process_return(_sale_item_id uuid, _qty int, _damaged boolean, _kind text, _note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE si record; already int; refund numeric;
BEGIN
  IF NOT is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO si FROM sale_items WHERE id = _sale_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill item not found'; END IF;
  SELECT coalesce(sum(qty),0) INTO already FROM sale_returns WHERE sale_item_id = _sale_item_id;
  IF _qty <= 0 OR _qty + already > si.qty THEN RAISE EXCEPTION 'Return qty more than sold'; END IF;
  refund := round(si.price * _qty - (coalesce(si.discount,0) * _qty / si.qty), 2);
  IF si.variant_id IS NOT NULL THEN
    IF _damaged THEN UPDATE product_variants SET damaged_stock = damaged_stock + _qty WHERE id = si.variant_id;
    ELSE UPDATE product_variants SET stock = stock + _qty WHERE id = si.variant_id; END IF;
  END IF;
  INSERT INTO sale_returns(sale_id, sale_item_id, variant_id, product_name, size, qty, refund, kind, damaged, note)
    VALUES (si.sale_id, si.id, si.variant_id, si.product_name, si.size, _qty, refund, coalesce(_kind,'return'), _damaged, coalesce(_note,''));
  INSERT INTO stock_movements(type, variant_id, product_name, qty_in, note, user_id)
    VALUES (CASE WHEN _damaged THEN 'RETURN-DAMAGED' ELSE 'RETURN' END, si.variant_id, si.product_name||' ('||si.size||')', _qty, coalesce(_note,''), auth.uid());
  RETURN refund;
END $$;