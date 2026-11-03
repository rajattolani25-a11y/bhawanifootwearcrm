-- Optional catalog descriptions. Owner product-write policies stay unchanged.
-- Run this whole file once in SQL Editor; repeating it is safe.
-- This adds no sales/stock/checkout changes and executes no reset or return.
BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS catalog_description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_catalog_description_length'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_catalog_description_length
      CHECK (catalog_description IS NULL OR char_length(catalog_description) <= 1000);
  END IF;
END $$;

COMMENT ON COLUMN public.products.catalog_description IS
  'Optional public catalog plain-text description; null/blank hides it. Max 1000 characters. Owner writes use existing products RLS.';

-- Preserve the existing catalog behaviour; add only the description property.
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
        'gender', p.gender, 'color', p.color, 'description', nullif(btrim(p.catalog_description), ''), 'mrp', p.mrp, 'price', p.selling_price, 'image', p.image_url,
        'few_left', s.show_few_left and (select count(*) from public.product_variants v where v.product_id = p.id and v.stock > 0) <= 2,
        'sizes', (select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'available', v.stock > 0) order by v.size)
                  from public.product_variants v where v.product_id = p.id))
        order by p.created_at desc)
      from public.products p
      where p.catalog_visible and p.status <> 'inactive'
        and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
    ), '[]'::jsonb));
end $function$;

REVOKE ALL ON FUNCTION public.public_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalog() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Read-only verification: all three columns should show true.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'catalog_description' AND is_nullable = 'YES'
  ) AS description_column_ready,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_catalog_description_length'
  ) AS description_limit_ready,
  position('p.catalog_description' IN
    pg_get_functiondef('public.public_catalog()'::regprocedure)) > 0
    AS public_catalog_description_ready;
