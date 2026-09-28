
create type public.app_role as enum ('owner','staff');

create table public.profiles (
  id uuid primary key,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique(user_id, role)
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create or replace function public.is_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id)
$$;

create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member(auth.uid()) or id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "read own role or owner" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'owner'));

-- first user becomes owner, later signups become staff
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role='owner') then
    insert into public.user_roles(user_id, role) values (new.id,'owner');
  else
    insert into public.user_roles(user_id, role) values (new.id,'staff');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- settings (single row)
create table public.store_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'BHAWANI FOOTWEAR',
  business_phone text default '',
  business_address text default '',
  gstin text default '',
  bill_footer text default 'Size exchange within 7 days with this bill.',
  daily_target numeric default 15000,
  updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values (1);
grant select, update on public.store_settings to authenticated;
grant all on public.store_settings to service_role;
alter table public.store_settings enable row level security;
create policy "members read settings" on public.store_settings for select to authenticated using (public.is_member(auth.uid()));
create policy "owner updates settings" on public.store_settings for update to authenticated using (public.has_role(auth.uid(),'owner'));

-- products (articles)
create table public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  brand text not null default '',
  article text not null,
  category text not null default '',
  gender text default '',
  color text default '',
  season text default 'All Season',
  status text not null default 'Active',
  mrp numeric not null default 0,
  selling_price numeric not null default 0,
  created_at timestamptz not null default now()
);
create index products_article_idx on public.products (lower(article));
create index products_brand_idx on public.products (brand);

-- cost is owner-only in a separate table
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  purchase_price numeric not null default 0
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  sku text unique,
  barcode text unique,
  stock int not null default 0 check (stock >= 0),
  damaged_stock int not null default 0 check (damaged_stock >= 0),
  min_stock int not null default 3,
  rack text default '',
  legacy_id text unique,
  created_at timestamptz not null default now(),
  unique(product_id, size)
);
create index variants_product_idx on public.product_variants(product_id);
create index variants_size_idx on public.product_variants(size);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  mobile text not null unique,
  name text not null default '',
  shoe_size text default '',
  brand_preference text default '',
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  phone text default '',
  gstin text default '',
  address text default '',
  created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  bill_no text not null unique,
  sale_date timestamptz not null default now(),
  customer_id uuid references public.customers(id),
  customer_name text default 'Walk-in',
  staff_id uuid,
  payment_mode text not null default 'Cash',
  split_cash numeric default 0,
  bill_type text not null default 'gst',
  tax_mode text not null default 'inclusive',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  taxable numeric not null default 0,
  gst_rate numeric not null default 0,
  gst_amount numeric not null default 0,
  total numeric not null default 0,
  paid_amount numeric not null default 0,
  due_amount numeric not null default 0
);
create index sales_date_idx on public.sales(sale_date desc);
create index sales_customer_idx on public.sales(customer_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid references public.product_variants(id),
  product_name text not null,
  size text not null,
  sku text,
  price numeric not null,
  qty int not null check (qty > 0),
  discount numeric not null default 0
);
create index sale_items_sale_idx on public.sale_items(sale_id);

create table public.sale_costs (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  total_cost numeric not null default 0,
  profit numeric not null default 0
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  purchase_date timestamptz not null default now(),
  supplier_id uuid references public.suppliers(id),
  supplier_name text default '',
  invoice_no text default '',
  status text default 'Received',
  variant_id uuid references public.product_variants(id),
  quantity int not null default 0,
  purchase_price numeric not null default 0,
  gst_rate numeric default 0,
  gst_amount numeric default 0,
  total numeric not null default 0,
  paid_amount numeric default 0
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  moved_at timestamptz not null default now(),
  type text not null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text default '',
  qty_in int not null default 0,
  qty_out int not null default 0,
  note text default '',
  user_id uuid
);
create index movements_variant_idx on public.stock_movements(variant_id);

-- grants
grant select, insert, update, delete on public.products, public.product_variants, public.customers, public.suppliers, public.sales, public.sale_items, public.stock_movements to authenticated;
grant select, insert, update, delete on public.product_costs, public.sale_costs, public.purchases to authenticated;
grant all on public.products, public.product_costs, public.product_variants, public.customers, public.suppliers, public.sales, public.sale_items, public.sale_costs, public.purchases, public.stock_movements to service_role;

alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_costs enable row level security;
alter table public.purchases enable row level security;
alter table public.stock_movements enable row level security;

-- members (owner+staff) read shared tables
create policy "members read" on public.products for select to authenticated using (public.is_member(auth.uid()));
create policy "members read" on public.product_variants for select to authenticated using (public.is_member(auth.uid()));
create policy "members read" on public.customers for select to authenticated using (public.is_member(auth.uid()));
create policy "members read" on public.suppliers for select to authenticated using (public.is_member(auth.uid()));
create policy "members read" on public.sales for select to authenticated using (public.is_member(auth.uid()));
create policy "members read" on public.sale_items for select to authenticated using (public.is_member(auth.uid()));
create policy "members read" on public.stock_movements for select to authenticated using (public.is_member(auth.uid()));
-- staff can add/edit customers
create policy "members add customers" on public.customers for insert to authenticated with check (public.is_member(auth.uid()));
create policy "members edit customers" on public.customers for update to authenticated using (public.is_member(auth.uid()));
-- owner full control
create policy "owner all" on public.products for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.product_costs for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.product_variants for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.customers for delete to authenticated using (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.suppliers for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.sales for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.sale_items for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.sale_costs for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.purchases for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "owner all" on public.stock_movements for all to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

-- atomic sale: stock decrement is race-safe; second counter selling last pair gets "Out of stock"
create sequence public.bill_seq;
create or replace function public.create_sale(_sale jsonb, _items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid;
  v_bill text;
  v_item jsonb;
  v_rows int;
  v_cost numeric := 0;
  v_pp numeric;
  v_name text;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  v_bill := 'BILL-' || to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.bill_seq')::text, 5, '0');
  insert into public.sales(bill_no, customer_id, customer_name, staff_id, payment_mode, split_cash, bill_type, tax_mode,
    subtotal, discount, taxable, gst_rate, gst_amount, total, paid_amount, due_amount)
  values (v_bill, nullif(_sale->>'customer_id','')::uuid, coalesce(_sale->>'customer_name','Walk-in'), auth.uid(),
    coalesce(_sale->>'payment_mode','Cash'), coalesce((_sale->>'split_cash')::numeric,0), coalesce(_sale->>'bill_type','gst'),
    coalesce(_sale->>'tax_mode','inclusive'), coalesce((_sale->>'subtotal')::numeric,0), coalesce((_sale->>'discount')::numeric,0),
    coalesce((_sale->>'taxable')::numeric,0), coalesce((_sale->>'gst_rate')::numeric,0), coalesce((_sale->>'gst_amount')::numeric,0),
    coalesce((_sale->>'total')::numeric,0), coalesce((_sale->>'paid_amount')::numeric,0), coalesce((_sale->>'due_amount')::numeric,0))
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(_items) loop
    update public.product_variants set stock = stock - (v_item->>'qty')::int
      where id = (v_item->>'variant_id')::uuid and stock >= (v_item->>'qty')::int;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Out of stock: % size %', v_item->>'product_name', v_item->>'size';
    end if;
    select coalesce(pc.purchase_price,0), p.article into v_pp, v_name
      from public.product_variants pv join public.products p on p.id = pv.product_id
      left join public.product_costs pc on pc.product_id = p.id
      where pv.id = (v_item->>'variant_id')::uuid;
    v_cost := v_cost + v_pp * (v_item->>'qty')::int;
    insert into public.sale_items(sale_id, variant_id, product_name, size, sku, price, qty, discount)
      values (v_sale_id, (v_item->>'variant_id')::uuid, coalesce(v_item->>'product_name', v_name), v_item->>'size', v_item->>'sku',
        (v_item->>'price')::numeric, (v_item->>'qty')::int, coalesce((v_item->>'discount')::numeric,0));
    insert into public.stock_movements(type, variant_id, product_name, qty_out, note, user_id)
      values ('SALE', (v_item->>'variant_id')::uuid, coalesce(v_item->>'product_name', v_name), (v_item->>'qty')::int, v_bill, auth.uid());
  end loop;

  insert into public.sale_costs(sale_id, total_cost, profit)
    values (v_sale_id, v_cost, coalesce((_sale->>'taxable')::numeric,0) - v_cost);
  return jsonb_build_object('sale_id', v_sale_id, 'bill_no', v_bill);
end $$;
revoke all on function public.create_sale(jsonb, jsonb) from public, anon;
grant execute on function public.create_sale(jsonb, jsonb) to authenticated;

alter publication supabase_realtime add table public.product_variants;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.sales;
