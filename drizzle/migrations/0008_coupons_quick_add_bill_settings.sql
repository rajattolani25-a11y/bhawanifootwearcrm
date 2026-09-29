CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'flat' CHECK (kind IN ('flat','percent')),
  value numeric NOT NULL CHECK (value > 0),
  max_discount numeric,
  min_bill numeric NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read coupons" ON public.coupons FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "owner manages coupons" ON public.coupons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated USING (public.is_member(auth.uid()));

ALTER TABLE public.sales ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN coupon_code text;
ALTER TABLE public.sales ADD COLUMN coupon_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.store_settings ADD COLUMN bill_design text NOT NULL DEFAULT 'Thermal';
ALTER TABLE public.store_settings ADD COLUMN thermal_width text NOT NULL DEFAULT '80';

CREATE OR REPLACE FUNCTION public.coupon_discount(_code text, _customer uuid, _subtotal numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.coupons%ROWTYPE; amt numeric;
BEGIN
  IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO c FROM public.coupons WHERE code = upper(trim(_code));
  IF NOT FOUND OR NOT c.active THEN RAISE EXCEPTION 'Coupon not found or inactive'; END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN RAISE EXCEPTION 'Coupon is not active yet'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'Coupon has expired'; END IF;
  IF c.usage_limit IS NOT NULL AND c.used_count >= c.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit reached'; END IF;
  IF c.customer_id IS NOT NULL AND c.customer_id IS DISTINCT FROM _customer THEN RAISE EXCEPTION 'This coupon belongs to another customer'; END IF;
  IF coalesce(_subtotal,0) < c.min_bill THEN RAISE EXCEPTION 'Minimum bill for this coupon is Rs %', c.min_bill; END IF;
  amt := CASE WHEN c.kind = 'percent' THEN round(_subtotal * c.value / 100, 2) ELSE c.value END;
  IF c.max_discount IS NOT NULL THEN amt := least(amt, c.max_discount); END IF;
  amt := least(amt, greatest(_subtotal,0));
  RETURN jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'amount', amt);
END $$;
REVOKE ALL ON FUNCTION public.coupon_discount(text, uuid, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.coupon_discount(text, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.quick_add_product(_product jsonb, _sizes jsonb, _cost numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid; s jsonb; v_vid uuid; v_out jsonb := '[]'::jsonb; v_qty int; v_size text; v_name text;
BEGIN
  IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF coalesce(trim(_product->>'article'),'') = '' THEN RAISE EXCEPTION 'Article name is required'; END IF;
  IF coalesce((_product->>'selling_price')::numeric,0) <= 0 THEN RAISE EXCEPTION 'Selling price is required'; END IF;
  IF jsonb_typeof(_sizes) <> 'array' OR jsonb_array_length(_sizes) = 0 THEN RAISE EXCEPTION 'Add at least one size'; END IF;
  SELECT id INTO v_pid FROM public.products WHERE lower(brand) = lower(coalesce(_product->>'brand','')) AND lower(article) = lower(trim(_product->>'article')) LIMIT 1;
  IF v_pid IS NULL THEN
    INSERT INTO public.products(brand, article, category, color, mrp, selling_price)
    VALUES (upper(coalesce(_product->>'brand','')), trim(_product->>'article'), coalesce(_product->>'category',''), coalesce(_product->>'color',''),
      greatest(coalesce((_product->>'mrp')::numeric,0), (_product->>'selling_price')::numeric), (_product->>'selling_price')::numeric)
    RETURNING id INTO v_pid;
  END IF;
  v_name := upper(coalesce(_product->>'brand','')) || ' ' || trim(_product->>'article');
  IF _cost IS NOT NULL AND _cost > 0 AND public.has_role(auth.uid(),'owner') THEN
    INSERT INTO public.product_costs(product_id, purchase_price) VALUES (v_pid, _cost)
    ON CONFLICT (product_id) DO UPDATE SET purchase_price = excluded.purchase_price;
  END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(_sizes) LOOP
    v_size := trim(s->>'size'); v_qty := coalesce((s->>'qty')::int, 0);
    IF v_size = '' OR v_qty < 0 OR v_qty > 999 THEN RAISE EXCEPTION 'Invalid size or quantity'; END IF;
    SELECT id INTO v_vid FROM public.product_variants WHERE product_id = v_pid AND size = v_size;
    IF v_vid IS NULL THEN
      INSERT INTO public.product_variants(product_id, size, stock, rack) VALUES (v_pid, v_size, v_qty, coalesce(_product->>'rack',''))
      RETURNING id INTO v_vid;
    ELSE
      UPDATE public.product_variants SET stock = stock + v_qty WHERE id = v_vid;
    END IF;
    PERFORM public.ensure_variant_code(v_vid);
    IF v_qty > 0 THEN
      INSERT INTO public.stock_movements(type, variant_id, product_name, qty_in, note, user_id)
      VALUES ('QUICK-ADD', v_vid, v_name || ' (' || v_size || ')', v_qty, 'Quick add', auth.uid());
    END IF;
    v_out := v_out || jsonb_build_object('id', v_vid, 'size', v_size);
    v_vid := NULL;
  END LOOP;
  RETURN jsonb_build_object('product_id', v_pid, 'variants', v_out);
END $$;
REVOKE ALL ON FUNCTION public.quick_add_product(jsonb, jsonb, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.quick_add_product(jsonb, jsonb, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_sale(_sale jsonb, _items jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_sale_id uuid; v_bill text; v_item jsonb; v_rows int; v_cost numeric := 0; v_pp numeric; v_name text;
  v_cust uuid := nullif(_sale->>'customer_id','')::uuid;
  v_total numeric := coalesce((_sale->>'total')::numeric,0);
  v_give boolean := coalesce((_sale->>'give_stamp')::boolean, true);
  v_reward uuid := nullif(_sale->>'reward_id','')::uuid;
  v_removed uuid := nullif(_sale->>'removed_reward_id','')::uuid;
  v_code text := nullif(trim(coalesce(_sale->>'coupon_code','')),'');
  v_coupon jsonb; v_coupon_id uuid; v_coupon_amt numeric := 0;
  v_reward_amt numeric := 0;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  c record; v_reg boolean := false; v_prem boolean := false; v_new int; v_unlocked jsonb := '[]'::jsonb;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  if jsonb_array_length(_items) = 0 then raise exception 'Cart is empty'; end if;
  if coalesce((_sale->>'due_amount')::numeric,0) > 0 and v_cust is null then raise exception 'Select a customer for a bill with due amount'; end if;
  perform set_config('app.loyalty_bypass','1', true);

  if v_reward is not null then
    select amount into v_reward_amt from public.loyalty_rewards
      where id = v_reward and customer_id = v_cust and status='active' and expires_at > now() for update;
    if not found then raise exception 'Reward is no longer valid'; end if;
  end if;

  if v_code is not null then
    perform 1 from public.coupons where code = upper(v_code) for update;
    v_coupon := public.coupon_discount(v_code, v_cust, coalesce((_sale->>'subtotal')::numeric,0));
    v_coupon_id := (v_coupon->>'id')::uuid; v_coupon_amt := (v_coupon->>'amount')::numeric;
  end if;

  v_bill := 'BILL-' || to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.bill_seq')::text, 5, '0');
  insert into public.sales(bill_no, customer_id, customer_name, staff_id, payment_mode, split_cash, bill_type, tax_mode,
    subtotal, discount, taxable, gst_rate, gst_amount, total, paid_amount, due_amount, give_stamp, reward_id, reward_amount, coupon_id, coupon_code, coupon_amount)
  values (v_bill, v_cust, coalesce(_sale->>'customer_name','Walk-in'), auth.uid(),
    coalesce(_sale->>'payment_mode','Cash'), coalesce((_sale->>'split_cash')::numeric,0), coalesce(_sale->>'bill_type','gst'),
    coalesce(_sale->>'tax_mode','inclusive'), coalesce((_sale->>'subtotal')::numeric,0), coalesce((_sale->>'discount')::numeric,0),
    coalesce((_sale->>'taxable')::numeric,0), coalesce((_sale->>'gst_rate')::numeric,0), coalesce((_sale->>'gst_amount')::numeric,0),
    v_total, coalesce((_sale->>'paid_amount')::numeric, v_total), coalesce((_sale->>'due_amount')::numeric,0), v_give, v_reward, v_reward_amt,
    v_coupon_id, v_coupon->>'code', v_coupon_amt)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(_items) loop
    update public.product_variants set stock = stock - (v_item->>'qty')::int
      where id = (v_item->>'variant_id')::uuid and stock >= (v_item->>'qty')::int;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'Out of stock: % size %', v_item->>'product_name', v_item->>'size'; end if;
    select coalesce(pc.purchase_price,0), p.article into v_pp, v_name
      from public.product_variants pv join public.products p on p.id = pv.product_id
      left join public.product_costs pc on pc.product_id = p.id where pv.id = (v_item->>'variant_id')::uuid;
    v_cost := v_cost + v_pp * (v_item->>'qty')::int;
    insert into public.sale_items(sale_id, variant_id, product_name, size, sku, price, qty, discount)
      values (v_sale_id, (v_item->>'variant_id')::uuid, coalesce(v_item->>'product_name', v_name), v_item->>'size', v_item->>'sku',
        (v_item->>'price')::numeric, (v_item->>'qty')::int, coalesce((v_item->>'discount')::numeric,0));
    insert into public.stock_movements(type, variant_id, product_name, qty_out, note, user_id)
      values ('SALE', (v_item->>'variant_id')::uuid, coalesce(v_item->>'product_name', v_name), (v_item->>'qty')::int, v_bill, auth.uid());
  end loop;

  insert into public.sale_costs(sale_id, total_cost, profit)
    values (v_sale_id, v_cost, coalesce((_sale->>'taxable')::numeric,0) - v_cost);

  if v_coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
    insert into public.coupon_redemptions(coupon_id, sale_id, customer_id, amount, user_id) values (v_coupon_id, v_sale_id, v_cust, v_coupon_amt, auth.uid());
  end if;
  if v_reward is not null then
    update public.loyalty_rewards set status='used', used_sale_id=v_sale_id where id=v_reward;
    insert into public.loyalty_events(reward_id, customer_id, action, sale_id) values (v_reward, v_cust, 'used', v_sale_id);
  end if;
  if v_removed is not null then
    insert into public.loyalty_events(reward_id, customer_id, action, note, sale_id) values (v_removed, v_cust, 'removed_from_bill', 'Removed at billing', v_sale_id);
  end if;

  if v_cust is not null and v_give and v_total >= 299 then
    select * into c from public.customers where id = v_cust for update;
    if c.last_stamp_date is distinct from v_today then
      v_reg := true; v_prem := v_total >= 999;
      v_new := c.regular_stamps + 1;
      if v_new in (5,10,20) then
        insert into public.loyalty_rewards(customer_id, card, milestone, amount) values (v_cust,'regular',v_new, public.reward_amount('regular',v_new));
        v_unlocked := v_unlocked || jsonb_build_object('card','regular','milestone',v_new,'amount',public.reward_amount('regular',v_new));
      end if;
      update public.customers set regular_stamps = case when v_new >= 20 then 0 else v_new end,
        regular_visits = regular_visits + 1, last_stamp_date = v_today where id = v_cust;
      if v_prem then
        v_new := c.premium_stamps + 1;
        if v_new in (5,10,20) then
          insert into public.loyalty_rewards(customer_id, card, milestone, amount) values (v_cust,'premium',v_new, public.reward_amount('premium',v_new));
          v_unlocked := v_unlocked || jsonb_build_object('card','premium','milestone',v_new,'amount',public.reward_amount('premium',v_new));
        end if;
        update public.customers set premium_stamps = case when v_new >= 20 then 0 else v_new end,
          premium_visits = premium_visits + 1 where id = v_cust;
      end if;
      update public.sales set stamp_regular = v_reg, stamp_premium = v_prem where id = v_sale_id;
    end if;
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'bill_no', v_bill, 'stamp_regular', v_reg, 'stamp_premium', v_prem, 'unlocked', v_unlocked, 'coupon_amount', v_coupon_amt);
end $function$;

CREATE OR REPLACE FUNCTION public.reset_store_data(_confirmation text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _confirmation <> 'RESET BHAWANI FOOTWEAR' THEN RAISE EXCEPTION 'Confirmation text does not match'; END IF;
 DELETE FROM public.coupon_redemptions WHERE id IS NOT NULL; DELETE FROM public.coupons WHERE id IS NOT NULL;
 DELETE FROM public.loyalty_events WHERE id IS NOT NULL; DELETE FROM public.loyalty_rewards WHERE id IS NOT NULL;
 DELETE FROM public.credit_payments WHERE id IS NOT NULL; DELETE FROM public.sale_returns WHERE id IS NOT NULL;
 DELETE FROM public.sale_costs WHERE sale_id IS NOT NULL; DELETE FROM public.sale_item_costs WHERE sale_item_id IS NOT NULL;
 DELETE FROM public.sale_items WHERE id IS NOT NULL; DELETE FROM public.sales WHERE id IS NOT NULL;
 DELETE FROM public.expenses WHERE id IS NOT NULL; DELETE FROM public.supplier_payments WHERE id IS NOT NULL;
 DELETE FROM public.purchases WHERE id IS NOT NULL; DELETE FROM public.stock_movements WHERE id IS NOT NULL;
 DELETE FROM public.product_costs WHERE product_id IS NOT NULL; DELETE FROM public.product_variants WHERE id IS NOT NULL;
 DELETE FROM public.products WHERE id IS NOT NULL; DELETE FROM public.suppliers WHERE id IS NOT NULL; DELETE FROM public.customers WHERE id IS NOT NULL;
END $function$;