ALTER TABLE public.products ADD COLUMN IF NOT EXISTS catalog_visible boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS catalog_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS advance_percent integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hold_hours integer NOT NULL DEFAULT 24;

CREATE TABLE public.catalog_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_no text NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  product_name text NOT NULL,
  size text NOT NULL,
  customer_name text NOT NULL,
  mobile text NOT NULL,
  price numeric NOT NULL,
  advance numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  sale_id uuid REFERENCES public.sales(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_bookings TO authenticated;
GRANT ALL ON public.catalog_bookings TO service_role;
ALTER TABLE public.catalog_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read bookings" ON public.catalog_bookings FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE INDEX catalog_bookings_status_idx ON public.catalog_bookings(status, expires_at);
CREATE INDEX catalog_bookings_mobile_idx ON public.catalog_bookings(mobile, status);

-- Release stale unpaid holds (stock goes back).
CREATE OR REPLACE FUNCTION public.expire_catalog_bookings() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare b record; n int := 0;
begin
  for b in select * from public.catalog_bookings where status='pending' and expires_at < now() for update skip locked loop
    update public.product_variants set stock = stock + 1 where id = b.variant_id;
    insert into public.stock_movements(type, variant_id, product_name, qty_in, note) values ('BOOKING_RELEASE', b.variant_id, b.product_name, 1, b.booking_no || ' expired');
    update public.catalog_bookings set status='expired' where id=b.id;
    n := n + 1;
  end loop;
  return n;
end $$;

CREATE OR REPLACE FUNCTION public.public_catalog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare s record;
begin
  perform public.expire_catalog_bookings();
  select * into s from public.store_settings where id=1;
  if s is null or not s.catalog_enabled then
    return jsonb_build_object('enabled', false);
  end if;
  return jsonb_build_object(
    'enabled', true,
    'shop', jsonb_build_object('name', s.business_name, 'phone', s.business_phone, 'address', s.business_address,
      'booking', s.booking_enabled and coalesce(s.upi_id,'') <> '', 'advance_percent', s.advance_percent, 'hold_hours', s.hold_hours),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'brand', p.brand, 'article', p.article, 'category', p.category,
        'gender', p.gender, 'color', p.color, 'mrp', p.mrp, 'price', p.selling_price, 'image', p.image_url,
        'sizes', (select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'available', v.stock > 0) order by v.size)
                  from public.product_variants v where v.product_id = p.id))
        order by p.created_at desc)
      from public.products p
      where p.catalog_visible and p.status <> 'inactive'
        and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
    ), '[]'::jsonb));
end $$;

CREATE OR REPLACE FUNCTION public.is_catalog_image(_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.products p join public.store_settings s on s.id = 1
    where p.image_url = _name and p.catalog_visible and s.catalog_enabled)
$$;

CREATE POLICY "Public reads catalog images" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'product-images' AND public.is_catalog_image(name));

CREATE OR REPLACE FUNCTION public.create_catalog_booking(_variant_id uuid, _name text, _mobile text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare s record; v record; m text := regexp_replace(coalesce(_mobile,''), '\D', '', 'g'); nm text := btrim(coalesce(_name,''));
  adv numeric; bno text; bid uuid; pending int;
begin
  perform public.expire_catalog_bookings();
  select * into s from public.store_settings where id=1;
  if not (s.catalog_enabled and s.booking_enabled and coalesce(s.upi_id,'') <> '') then raise exception 'Booking is not available right now'; end if;
  if length(m) = 12 and left(m,2) = '91' then m := right(m,10); end if;
  if m !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if length(nm) < 2 or length(nm) > 60 then raise exception 'Enter your name'; end if;
  select count(*) into pending from public.catalog_bookings where mobile = m and status in ('pending','confirmed');
  if pending >= 2 then raise exception 'You already have 2 open bookings. Please visit the store.'; end if;
  select pv.id, pv.size, pv.stock, p.brand, p.article, p.selling_price, p.catalog_visible into v
    from public.product_variants pv join public.products p on p.id = pv.product_id where pv.id = _variant_id for update of pv;
  if v.id is null or not v.catalog_visible then raise exception 'This item is not available'; end if;
  if v.stock < 1 then raise exception 'Sorry, this size just sold out'; end if;
  update public.product_variants set stock = stock - 1 where id = _variant_id;
  adv := ceil(v.selling_price * greatest(1, least(100, s.advance_percent)) / 100.0);
  bno := 'BK-' || to_char(now() at time zone 'Asia/Kolkata','MMDD') || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  insert into public.catalog_bookings(booking_no, variant_id, product_name, size, customer_name, mobile, price, advance, expires_at)
    values (bno, _variant_id, v.brand || ' ' || v.article, v.size, nm, m, v.selling_price, adv, now() + interval '30 minutes')
    returning id into bid;
  insert into public.stock_movements(type, variant_id, product_name, qty_out, note) values ('BOOKING_HOLD', _variant_id, v.brand || ' ' || v.article, 1, bno);
  return jsonb_build_object('booking_no', bno, 'advance', adv, 'price', v.selling_price, 'upi_id', s.upi_id, 'shop', s.business_name,
    'phone', s.business_phone, 'product', v.brand || ' ' || v.article, 'size', v.size, 'hold_hours', s.hold_hours);
end $$;

CREATE OR REPLACE FUNCTION public.confirm_catalog_booking(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare b record;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  select * into b from public.catalog_bookings where id=_id for update;
  if b.id is null then raise exception 'Booking not found'; end if;
  if b.status = 'expired' then
    update public.product_variants set stock = stock - 1 where id = b.variant_id and stock >= 1;
    if not found then raise exception 'Hold expired and the size is now out of stock'; end if;
    insert into public.stock_movements(type, variant_id, product_name, qty_out, note, user_id) values ('BOOKING_HOLD', b.variant_id, b.product_name, 1, b.booking_no || ' re-held', auth.uid());
  elsif b.status <> 'pending' then raise exception 'Booking is already %', b.status; end if;
  update public.catalog_bookings set status='confirmed', confirmed_at=now() where id=_id;
end $$;

CREATE OR REPLACE FUNCTION public.cancel_catalog_booking(_id uuid, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare b record;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  select * into b from public.catalog_bookings where id=_id for update;
  if b.id is null or b.status not in ('pending','confirmed') then raise exception 'Booking cannot be cancelled'; end if;
  update public.product_variants set stock = stock + 1 where id = b.variant_id;
  insert into public.stock_movements(type, variant_id, product_name, qty_in, note, user_id) values ('BOOKING_RELEASE', b.variant_id, b.product_name, 1, b.booking_no || ' cancelled', auth.uid());
  update public.catalog_bookings set status='cancelled', note=left(_note, 200) where id=_id;
end $$;

-- Pickup: release the hold and run the normal sale in the same transaction.
CREATE OR REPLACE FUNCTION public.complete_catalog_booking(_id uuid, _sale jsonb, _items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare b record; r jsonb;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  select * into b from public.catalog_bookings where id=_id for update;
  if b.id is null or b.status <> 'confirmed' then raise exception 'Only confirmed bookings can be billed'; end if;
  update public.product_variants set stock = stock + 1 where id = b.variant_id;
  insert into public.stock_movements(type, variant_id, product_name, qty_in, note, user_id) values ('BOOKING_RELEASE', b.variant_id, b.product_name, 1, b.booking_no || ' picked up', auth.uid());
  r := public.create_sale(_sale, _items);
  update public.catalog_bookings set status='picked', sale_id=(r->>'sale_id')::uuid where id=_id;
  return r;
end $$;

REVOKE ALL ON FUNCTION public.expire_catalog_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_catalog_booking(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_catalog_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_catalog_booking(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_catalog_booking(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_catalog_image(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_booking(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_catalog_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_catalog_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_catalog_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_catalog_booking(uuid, jsonb, jsonb) TO authenticated;