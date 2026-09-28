
alter table public.customers
  add column regular_stamps int not null default 0,
  add column premium_stamps int not null default 0,
  add column regular_visits int not null default 0,
  add column premium_visits int not null default 0,
  add column last_stamp_date date;
create index if not exists customers_name_idx on public.customers (lower(name));

alter table public.sales
  add column give_stamp boolean not null default true,
  add column stamp_regular boolean not null default false,
  add column stamp_premium boolean not null default false,
  add column reward_id uuid,
  add column reward_amount numeric not null default 0;

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  card text not null check (card in ('regular','premium')),
  milestone int not null,
  amount numeric not null,
  unlocked_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  status text not null default 'active' check (status in ('active','used','cancelled')),
  used_sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_rewards_customer_idx on public.loyalty_rewards(customer_id);

create table public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid references public.loyalty_rewards(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  action text not null,
  note text default '',
  sale_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.loyalty_rewards, public.loyalty_events to authenticated;
grant all on public.loyalty_rewards, public.loyalty_events to service_role;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_events enable row level security;
create policy "members read" on public.loyalty_rewards for select to authenticated using (public.is_member(auth.uid()));
create policy "owner all" on public.loyalty_rewards for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "members read" on public.loyalty_events for select to authenticated using (public.is_member(auth.uid()));
create policy "members log" on public.loyalty_events for insert to authenticated with check (public.is_member(auth.uid()) and user_id = auth.uid());

-- staff can edit name/size/brand on customers, but not premium or stamps
create or replace function public.guard_customer_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.loyalty_bypass', true),'') = '1' or public.has_role(auth.uid(),'owner') then
    return new;
  end if;
  if new.is_premium is distinct from old.is_premium
     or new.regular_stamps is distinct from old.regular_stamps
     or new.premium_stamps is distinct from old.premium_stamps
     or new.regular_visits is distinct from old.regular_visits
     or new.premium_visits is distinct from old.premium_visits
     or new.last_stamp_date is distinct from old.last_stamp_date then
    raise exception 'Only the Owner can change premium or stamps';
  end if;
  return new;
end $$;
create trigger customers_guard before update on public.customers for each row execute function public.guard_customer_fields();

create or replace function public.guard_customer_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'owner') and coalesce(current_setting('app.loyalty_bypass', true),'') <> '1' then
    new.is_premium := false; new.regular_stamps := 0; new.premium_stamps := 0;
    new.regular_visits := 0; new.premium_visits := 0; new.last_stamp_date := null;
  end if;
  return new;
end $$;
create trigger customers_guard_ins before insert on public.customers for each row execute function public.guard_customer_insert();

create or replace function public.reward_amount(_card text, _m int)
returns numeric language sql immutable as $$
  select case
    when _card='regular' and _m=5 then 100 when _card='regular' and _m=10 then 250 when _card='regular' and _m=20 then 600
    when _card='premium' and _m=5 then 200 when _card='premium' and _m=10 then 500 when _card='premium' and _m=20 then 1200
    else 0 end
$$;

create or replace function public.create_sale(_sale jsonb, _items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid; v_bill text; v_item jsonb; v_rows int; v_cost numeric := 0; v_pp numeric; v_name text;
  v_cust uuid := nullif(_sale->>'customer_id','')::uuid;
  v_total numeric := coalesce((_sale->>'total')::numeric,0);
  v_give boolean := coalesce((_sale->>'give_stamp')::boolean, true);
  v_reward uuid := nullif(_sale->>'reward_id','')::uuid;
  v_removed uuid := nullif(_sale->>'removed_reward_id','')::uuid;
  v_reward_amt numeric := 0;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  c record; v_reg boolean := false; v_prem boolean := false; v_new int; v_unlocked jsonb := '[]'::jsonb;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  if jsonb_array_length(_items) = 0 then raise exception 'Cart is empty'; end if;
  perform set_config('app.loyalty_bypass','1', true);

  if v_reward is not null then
    select amount into v_reward_amt from public.loyalty_rewards
      where id = v_reward and customer_id = v_cust and status='active' and expires_at > now() for update;
    if not found then raise exception 'Reward is no longer valid'; end if;
  end if;

  v_bill := 'BILL-' || to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.bill_seq')::text, 5, '0');
  insert into public.sales(bill_no, customer_id, customer_name, staff_id, payment_mode, split_cash, bill_type, tax_mode,
    subtotal, discount, taxable, gst_rate, gst_amount, total, paid_amount, due_amount, give_stamp, reward_id, reward_amount)
  values (v_bill, v_cust, coalesce(_sale->>'customer_name','Walk-in'), auth.uid(),
    coalesce(_sale->>'payment_mode','Cash'), coalesce((_sale->>'split_cash')::numeric,0), coalesce(_sale->>'bill_type','gst'),
    coalesce(_sale->>'tax_mode','inclusive'), coalesce((_sale->>'subtotal')::numeric,0), coalesce((_sale->>'discount')::numeric,0),
    coalesce((_sale->>'taxable')::numeric,0), coalesce((_sale->>'gst_rate')::numeric,0), coalesce((_sale->>'gst_amount')::numeric,0),
    v_total, coalesce((_sale->>'paid_amount')::numeric, v_total), coalesce((_sale->>'due_amount')::numeric,0), v_give, v_reward, v_reward_amt)
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

  if v_reward is not null then
    update public.loyalty_rewards set status='used', used_sale_id=v_sale_id where id=v_reward;
    insert into public.loyalty_events(reward_id, customer_id, action, sale_id) values (v_reward, v_cust, 'used', v_sale_id);
  end if;
  if v_removed is not null then
    insert into public.loyalty_events(reward_id, customer_id, action, note, sale_id) values (v_removed, v_cust, 'removed_from_bill', 'Removed at billing', v_sale_id);
  end if;

  -- loyalty stamps
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

  return jsonb_build_object('sale_id', v_sale_id, 'bill_no', v_bill, 'stamp_regular', v_reg, 'stamp_premium', v_prem, 'unlocked', v_unlocked);
end $$;
revoke all on function public.create_sale(jsonb, jsonb) from public, anon;
grant execute on function public.create_sale(jsonb, jsonb) to authenticated;

alter publication supabase_realtime add table public.customers;
