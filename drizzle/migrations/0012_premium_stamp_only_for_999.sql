CREATE OR REPLACE FUNCTION public.create_sale(_sale jsonb, _items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
      v_prem := v_total >= 999; v_reg := not v_prem;
      if v_reg then
        v_new := c.regular_stamps + 1;
        if v_new in (5,10,20) then
          insert into public.loyalty_rewards(customer_id, card, milestone, amount) values (v_cust,'regular',v_new, public.reward_amount('regular',v_new));
          v_unlocked := v_unlocked || jsonb_build_object('card','regular','milestone',v_new,'amount',public.reward_amount('regular',v_new));
        end if;
        update public.customers set regular_stamps = case when v_new >= 20 then 0 else v_new end,
          regular_visits = regular_visits + 1, last_stamp_date = v_today where id = v_cust;
      else
        v_new := c.premium_stamps + 1;
        if v_new in (5,10,20) then
          insert into public.loyalty_rewards(customer_id, card, milestone, amount) values (v_cust,'premium',v_new, public.reward_amount('premium',v_new));
          v_unlocked := v_unlocked || jsonb_build_object('card','premium','milestone',v_new,'amount',public.reward_amount('premium',v_new));
        end if;
        update public.customers set premium_stamps = case when v_new >= 20 then 0 else v_new end,
          premium_visits = premium_visits + 1, last_stamp_date = v_today where id = v_cust;
      end if;
      update public.sales set stamp_regular = v_reg, stamp_premium = v_prem where id = v_sale_id;
    end if;
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'bill_no', v_bill, 'stamp_regular', v_reg, 'stamp_premium', v_prem, 'unlocked', v_unlocked, 'coupon_amount', v_coupon_amt);
end $function$;