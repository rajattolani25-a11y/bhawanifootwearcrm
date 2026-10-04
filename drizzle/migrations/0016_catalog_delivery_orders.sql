ALTER TABLE public.catalog_bookings
  ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS delivery_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outside_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_charge numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS outside_charge numeric NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS free_delivery_above numeric,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS show_few_left boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.log_booking_status() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_history := coalesce(new.status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', new.status, 'at', now()));
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_log_booking_status ON public.catalog_bookings;
CREATE TRIGGER trg_log_booking_status BEFORE INSERT OR UPDATE ON public.catalog_bookings FOR EACH ROW EXECUTE FUNCTION public.log_booking_status();
UPDATE public.catalog_bookings SET status_history = jsonb_build_array(jsonb_build_object('status', status, 'at', created_at)) WHERE status_history = '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.create_catalog_order(_variant_id uuid, _name text, _mobile text, _fulfillment text, _address text, _area text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare s record; v record; m text := regexp_replace(coalesce(_mobile,''), '\D', '', 'g'); nm text := btrim(coalesce(_name,''));
  adv numeric; chg numeric := 0; bno text; pending int; f text := coalesce(_fulfillment,'pickup'); addr text := btrim(coalesce(_address,''));
begin
  perform public.expire_catalog_bookings();
  select * into s from public.store_settings where id=1;
  if not (s.catalog_enabled and coalesce(s.upi_id,'') <> '') then raise exception 'Ordering is not available right now'; end if;
  if f not in ('pickup','local','outside') then raise exception 'Choose how you want the pair'; end if;
  if f = 'pickup' and not (s.booking_enabled and s.pickup_enabled) then raise exception 'Store pickup booking is not available right now'; end if;
  if f = 'local' and not s.delivery_enabled then raise exception 'Local delivery is not available right now'; end if;
  if f = 'outside' and not s.outside_enabled then raise exception 'Outside city delivery is not available right now'; end if;
  if length(m) = 12 and left(m,2) = '91' then m := right(m,10); end if;
  if m !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if length(nm) < 2 or length(nm) > 60 then raise exception 'Enter your name'; end if;
  if f <> 'pickup' and (length(addr) < 10 or length(addr) > 300) then raise exception 'Enter your full delivery address'; end if;
  select count(*) into pending from public.catalog_bookings where mobile = m and status in ('pending','confirmed','packed','shipped');
  if pending >= 3 then raise exception 'You already have 3 open orders. Please contact the store.'; end if;
  select pv.id, pv.size, pv.stock, p.brand, p.article, p.selling_price, p.catalog_visible into v
    from public.product_variants pv join public.products p on p.id = pv.product_id where pv.id = _variant_id for update of pv;
  if v.id is null or not v.catalog_visible then raise exception 'This item is not available'; end if;
  if v.stock < 1 then raise exception 'Sorry, this size just sold out'; end if;
  update public.product_variants set stock = stock - 1 where id = _variant_id;
  if f = 'pickup' then
    adv := ceil(v.selling_price * greatest(1, least(100, s.advance_percent)) / 100.0);
  else
    chg := case when f = 'local' then s.local_charge else s.outside_charge end;
    if f = 'local' and s.free_delivery_above is not null and v.selling_price >= s.free_delivery_above then chg := 0; end if;
    adv := v.selling_price + chg;
  end if;
  bno := 'BK-' || to_char(now() at time zone 'Asia/Kolkata','MMDD') || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  insert into public.catalog_bookings(booking_no, variant_id, product_name, size, customer_name, mobile, price, advance, expires_at, fulfillment, delivery_charge, address, area)
    values (bno, _variant_id, v.brand || ' ' || v.article, v.size, nm, m, v.selling_price, adv, now() + interval '30 minutes', f, chg, nullif(addr,''), nullif(left(btrim(coalesce(_area,'')),80),''));
  insert into public.stock_movements(type, variant_id, product_name, qty_out, note) values ('BOOKING_HOLD', _variant_id, v.brand || ' ' || v.article, 1, bno);
  return jsonb_build_object('booking_no', bno, 'advance', adv, 'price', v.selling_price, 'delivery_charge', chg, 'fulfillment', f, 'upi_id', s.upi_id, 'shop', s.business_name,
    'phone', s.business_phone, 'product', v.brand || ' ' || v.article, 'size', v.size, 'hold_hours', s.hold_hours);
end $function$;
REVOKE ALL ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_catalog_order(_booking_no text, _mobile text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare b record; m text := right(regexp_replace(coalesce(_mobile,''), '\D', '', 'g'), 10);
begin
  perform public.expire_catalog_bookings();
  select * into b from public.catalog_bookings where upper(booking_no) = upper(btrim(coalesce(_booking_no,''))) and mobile = m;
  if b.id is null then return null; end if;
  return jsonb_build_object('booking_no', b.booking_no, 'product', b.product_name, 'size', b.size, 'status', b.status, 'fulfillment', b.fulfillment,
    'price', b.price, 'advance', b.advance, 'delivery_charge', b.delivery_charge, 'created_at', b.created_at, 'expires_at', b.expires_at, 'history', b.status_history);
end $function$;
REVOKE ALL ON FUNCTION public.track_catalog_order(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.track_catalog_order(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_catalog_order_status(_id uuid, _status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare b record;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  if _status not in ('packed','shipped') then raise exception 'Invalid status'; end if;
  select * into b from public.catalog_bookings where id=_id for update;
  if b.id is null or b.status not in ('confirmed','packed','shipped') then raise exception 'Order cannot be updated'; end if;
  if _status = 'shipped' and b.fulfillment = 'pickup' then raise exception 'Pickup orders are not shipped'; end if;
  update public.catalog_bookings set status=_status where id=_id;
end $function$;
REVOKE ALL ON FUNCTION public.update_catalog_order_status(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_catalog_order_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_catalog_booking(_id uuid, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare b record;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  select * into b from public.catalog_bookings where id=_id for update;
  if b.id is null or b.status not in ('pending','confirmed','packed','shipped') then raise exception 'Booking cannot be cancelled'; end if;
  update public.product_variants set stock = stock + 1 where id = b.variant_id;
  insert into public.stock_movements(type, variant_id, product_name, qty_in, note, user_id) values ('BOOKING_RELEASE', b.variant_id, b.product_name, 1, b.booking_no || ' cancelled', auth.uid());
  update public.catalog_bookings set status = case when b.status = 'pending' then 'cancelled' else 'refunded' end, note=left(_note, 200) where id=_id;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_catalog_booking(_id uuid, _sale jsonb, _items jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare b record; r jsonb;
begin
  if not public.is_member(auth.uid()) then raise exception 'Not allowed'; end if;
  select * into b from public.catalog_bookings where id=_id for update;
  if b.id is null or b.status not in ('confirmed','packed','shipped') then raise exception 'Only paid orders can be billed'; end if;
  update public.product_variants set stock = stock + 1 where id = b.variant_id;
  insert into public.stock_movements(type, variant_id, product_name, qty_in, note, user_id) values ('BOOKING_RELEASE', b.variant_id, b.product_name, 1, b.booking_no || ' completed', auth.uid());
  r := public.create_sale(_sale, _items);
  update public.catalog_bookings set status = case when b.fulfillment = 'pickup' then 'picked' else 'delivered' end, sale_id=(r->>'sale_id')::uuid where id=_id;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.public_catalog()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare s record; pay boolean;
begin
  perform public.expire_catalog_bookings();
  select * into s from public.store_settings where id=1;
  if s is null or not s.catalog_enabled then return jsonb_build_object('enabled', false); end if;
  pay := coalesce(s.upi_id,'') <> '';
  return jsonb_build_object(
    'enabled', true,
    'shop', jsonb_build_object('name', s.business_name, 'phone', s.business_phone, 'address', s.business_address,
      'booking', pay and s.booking_enabled and s.pickup_enabled, 'local', pay and s.delivery_enabled, 'outside', pay and s.outside_enabled,
      'local_charge', s.local_charge, 'outside_charge', s.outside_charge, 'free_delivery_above', s.free_delivery_above, 'delivery_note', s.delivery_note,
      'advance_percent', s.advance_percent, 'hold_hours', s.hold_hours),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'brand', p.brand, 'article', p.article, 'category', p.category,
        'gender', p.gender, 'color', p.color, 'mrp', p.mrp, 'price', p.selling_price, 'image', p.image_url,
        'few_left', s.show_few_left and (select count(*) from public.product_variants v where v.product_id = p.id and v.stock > 0) <= 2,
        'sizes', (select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'available', v.stock > 0) order by v.size)
                  from public.product_variants v where v.product_id = p.id))
        order by p.created_at desc)
      from public.products p
      where p.catalog_visible and p.status <> 'inactive'
        and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
    ), '[]'::jsonb));
end $function$;