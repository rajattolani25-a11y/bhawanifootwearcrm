ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS offer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_title text,
  ADD COLUMN IF NOT EXISTS offer_subtitle text,
  ADD COLUMN IF NOT EXISTS offer_coupon text,
  ADD COLUMN IF NOT EXISTS offer_card boolean NOT NULL DEFAULT true;
ALTER TABLE public.catalog_bookings
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS coupon_discount numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.public_catalog_offer()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
declare s record; c record;
begin
  select * into s from public.store_settings where id=1;
  if s is null or not s.catalog_enabled or not s.offer_enabled then return null; end if;
  if coalesce(s.offer_coupon,'') <> '' then
    select code, kind, value, max_discount, min_bill into c from public.coupons
      where code = upper(btrim(s.offer_coupon)) and active and customer_id is null
        and (expires_at is null or expires_at > now()) and (starts_at is null or starts_at <= now())
        and (usage_limit is null or used_count < usage_limit);
  end if;
  return jsonb_build_object('title', coalesce(nullif(btrim(s.offer_title),''), 'Festive Offer'), 'subtitle', s.offer_subtitle, 'card', s.offer_card,
    'code', c.code, 'kind', c.kind, 'value', c.value, 'max_discount', c.max_discount, 'min_bill', c.min_bill);
end $f$;
REVOKE ALL ON FUNCTION public.public_catalog_offer() FROM public;
GRANT EXECUTE ON FUNCTION public.public_catalog_offer() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.catalog_coupon_amount(_code text, _mobile text, _subtotal numeric, _lock boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare c public.coupons%ROWTYPE; m text := right(regexp_replace(coalesce(_mobile,''), '\D', '', 'g'), 10); amt numeric;
begin
  if _lock then select * into c from public.coupons where code = upper(btrim(coalesce(_code,''))) for update;
  else select * into c from public.coupons where code = upper(btrim(coalesce(_code,''))); end if;
  if not found or not c.active then raise exception 'Coupon not found or inactive'; end if;
  if c.starts_at is not null and c.starts_at > now() then raise exception 'Coupon is not active yet'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'Coupon has expired'; end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then raise exception 'Coupon usage limit reached'; end if;
  if m !~ '^[6-9][0-9]{9}$' then raise exception 'Enter your mobile number to use a coupon'; end if;
  if c.customer_id is not null and not exists (select 1 from public.customers where id = c.customer_id and right(regexp_replace(coalesce(mobile,''),'\D','','g'),10) = m) then
    raise exception 'This coupon belongs to another customer'; end if;
  if exists (select 1 from public.coupon_redemptions r join public.customers cu on cu.id = r.customer_id where r.coupon_id = c.id and right(regexp_replace(coalesce(cu.mobile,''),'\D','','g'),10) = m)
     or exists (select 1 from public.catalog_bookings b where b.coupon_code = c.code and b.mobile = m and b.status not in ('cancelled','expired')) then
    raise exception 'You have already used this coupon'; end if;
  if coalesce(_subtotal,0) < c.min_bill then raise exception 'Minimum order for this coupon is Rs %', c.min_bill; end if;
  amt := case when c.kind = 'percent' then round(_subtotal * c.value / 100) else c.value end;
  if c.max_discount is not null then amt := least(amt, c.max_discount); end if;
  amt := least(amt, greatest(_subtotal - 1, 0));
  return jsonb_build_object('code', c.code, 'amount', amt, 'id', c.id);
end $f$;
REVOKE ALL ON FUNCTION public.catalog_coupon_amount(text,text,numeric,boolean) FROM public;

CREATE OR REPLACE FUNCTION public.check_catalog_coupon(_variant_id uuid, _code text, _mobile text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare p numeric;
begin
  select pr.selling_price into p from public.product_variants pv join public.products pr on pr.id = pv.product_id where pv.id = _variant_id and pr.catalog_visible;
  if p is null then raise exception 'This item is not available'; end if;
  return public.catalog_coupon_amount(_code, _mobile, p, false) - 'id';
end $f$;
REVOKE ALL ON FUNCTION public.check_catalog_coupon(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_catalog_coupon(uuid,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_catalog_order(_variant_id uuid, _name text, _mobile text, _fulfillment text, _address text, _area text, _coupon text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare s record; v record; m text := regexp_replace(coalesce(_mobile,''), '\D', '', 'g'); nm text := btrim(coalesce(_name,''));
  adv numeric; chg numeric := 0; bno text; pending int; f text := coalesce(_fulfillment,'pickup'); addr text := btrim(coalesce(_address,''));
  price numeric; disc numeric := 0; code text; cp jsonb;
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
  price := v.selling_price;
  if coalesce(btrim(_coupon),'') <> '' then
    cp := public.catalog_coupon_amount(_coupon, m, price, true);
    disc := (cp->>'amount')::numeric; code := cp->>'code';
    update public.coupons set used_count = used_count + 1 where id = (cp->>'id')::uuid;
    price := price - disc;
  end if;
  update public.product_variants set stock = stock - 1 where id = _variant_id;
  if f = 'pickup' then
    adv := ceil(price * greatest(1, least(100, s.advance_percent)) / 100.0);
  else
    chg := case when f = 'local' then s.local_charge else s.outside_charge end;
    if f = 'local' and s.free_delivery_above is not null and price >= s.free_delivery_above then chg := 0; end if;
    adv := price + chg;
  end if;
  bno := 'BK-' || to_char(now() at time zone 'Asia/Kolkata','MMDD') || '-' || upper(substr(md5(gen_random_uuid()::text),1,4));
  insert into public.catalog_bookings(booking_no, variant_id, product_name, size, customer_name, mobile, price, advance, expires_at, fulfillment, delivery_charge, address, area, coupon_code, coupon_discount)
    values (bno, _variant_id, v.brand || ' ' || v.article, v.size, nm, m, price, adv, now() + interval '30 minutes', f, chg, nullif(addr,''), nullif(left(btrim(coalesce(_area,'')),80),''), code, disc);
  insert into public.stock_movements(type, variant_id, product_name, qty_out, note) values ('BOOKING_HOLD', _variant_id, v.brand || ' ' || v.article, 1, bno);
  return jsonb_build_object('booking_no', bno, 'advance', adv, 'price', price, 'delivery_charge', chg, 'fulfillment', f, 'upi_id', s.upi_id, 'shop', s.business_name,
    'phone', s.business_phone, 'product', v.brand || ' ' || v.article, 'size', v.size, 'hold_hours', s.hold_hours, 'coupon_code', code, 'coupon_discount', disc);
end $function$;
REVOKE ALL ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_catalog_order(uuid,text,text,text,text,text,text) TO anon, authenticated;