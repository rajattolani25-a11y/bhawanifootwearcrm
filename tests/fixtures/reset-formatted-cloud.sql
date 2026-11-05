-- Reset definition supplied by the owner on 2026-11-05. Preserve guards verbatim.
CREATE OR REPLACE FUNCTION public.reset_store_data_v2(_confirmation text, _fingerprint text, _preserve_identity boolean DEFAULT true, _preserve_design boolean DEFAULT true, _restart_numbers boolean DEFAULT false, _preserve_operations boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assignments text;
  identity jsonb;
  hero_path text;
  saved_hero jsonb;
  db_before bigint;
  db_after bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;

  IF _confirmation IS DISTINCT FROM 'RESET'
    OR _preserve_identity IS NULL
    OR _preserve_design IS NULL
    OR _restart_numbers IS NULL
    OR _preserve_operations IS NULL THEN
    RAISE EXCEPTION 'Invalid reset confirmation or options';
  END IF;

  PERFORM public.maintenance_lock_store();

  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;

  IF _fingerprint IS DISTINCT FROM (
    public.store_backup_snapshot_v2()->>'fingerprint'
  ) THEN
    RAISE EXCEPTION
      'Store changed since backup. Download and verify a fresh backup before resetting.';
  END IF;

  SELECT coalesce(sum(pg_total_relation_size(c.oid)), 0)
  INTO db_before
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  SELECT to_jsonb(s)
  INTO identity
  FROM public.store_settings s
  WHERE id = 1;

  IF _preserve_design THEN
    SELECT image_path, to_jsonb(h)
    INTO hero_path, saved_hero
    FROM public.catalog_hero_settings h
    WHERE id = 1;
  END IF;

  INSERT INTO public.store_file_cleanup(bucket, path, reason)
  SELECT bucket_id, name, 'reset'
  FROM storage.objects
  WHERE bucket_id IN ('product-images', 'catalog-hero-images')
    AND NOT (
      bucket_id = 'catalog-hero-images'
      AND name IS NOT DISTINCT FROM hero_path
    )
  ON CONFLICT (bucket, path)
  DO UPDATE SET reason = 'reset';

  TRUNCATE TABLE
    public.catalog_bookings,
    public.coupon_redemptions,
    public.loyalty_events,
    public.loyalty_rewards,
    public.credit_payments,
    public.sale_returns,
    public.sale_item_costs,
    public.sale_costs,
    public.sale_items,
    public.sales,
    public.coupons,
    public.expenses,
    public.supplier_payments,
    public.purchases,
    public.stock_movements,
    public.product_costs,
    public.product_variants,
    public.products,
    public.suppliers,
    public.customers,
    public.catalog_hero_settings
  CONTINUE IDENTITY RESTRICT;

  IF _preserve_design AND saved_hero IS NOT NULL THEN
    INSERT INTO public.catalog_hero_settings
    SELECT *
    FROM jsonb_populate_record(
      NULL::public.catalog_hero_settings,
      saved_hero || jsonb_build_object(
        'product_id', NULL,
        'updated_at', clock_timestamp()
      )
    );
  ELSE
    INSERT INTO public.catalog_hero_settings(id) VALUES (1);
  END IF;

  IF NOT _preserve_design THEN
    DELETE FROM public.catalog_presentation_settings WHERE id = 1;
    INSERT INTO public.catalog_presentation_settings(id) VALUES (1);
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id <> auth.uid();

  SELECT string_agg(format('%I = DEFAULT', attname), ', ')
  INTO assignments
  FROM pg_attribute
  WHERE attrelid = 'public.store_settings'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname <> 'id'
    AND attgenerated = '';

  EXECUTE 'UPDATE public.store_settings SET '
    || assignments || ' WHERE id=1';

  IF _preserve_identity THEN
    UPDATE public.store_settings
    SET
      business_name = identity->>'business_name',
      business_phone = identity->>'business_phone',
      business_address = identity->>'business_address',
      gstin = identity->>'gstin',
      upi_id = identity->>'upi_id'
    WHERE id = 1;
  END IF;

  IF _preserve_operations THEN
    SELECT string_agg(
      format('%I = x.%I', attname, attname), ', '
    )
    INTO assignments
    FROM pg_attribute
    WHERE attrelid = 'public.store_settings'::regclass
      AND attnum > 0
      AND NOT attisdropped
      AND attgenerated = ''
      AND attname NOT IN (
        'id', 'updated_at', 'business_name',
        'business_phone', 'business_address', 'gstin', 'upi_id'
      )
      AND left(attname, 6) <> 'offer_';

    IF assignments IS NOT NULL THEN
      EXECUTE
        'UPDATE public.store_settings s SET '
        || assignments
        || ' FROM jsonb_populate_record(
          NULL::public.store_settings,$1
        ) x WHERE s.id=1'
      USING identity;
    END IF;
  END IF;

  IF _restart_numbers THEN
    ALTER SEQUENCE public.bill_seq RESTART WITH 1;
  END IF;

  UPDATE public.store_reset_state
  SET generation = gen_random_uuid(),
      reset_at = clock_timestamp()
  WHERE id = 1;

  SELECT coalesce(sum(pg_total_relation_size(c.oid)), 0)
  INTO db_after
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  RETURN jsonb_build_object(
    'state', (
      SELECT to_jsonb(s)
      FROM public.store_reset_state s
      WHERE id = 1
    ),
    'pending_files', (
      SELECT count(*) FROM public.store_file_cleanup
    ),
    'database_bytes_before', db_before,
    'database_bytes_after', db_after,
    'database_bytes_reclaimed', greatest(0, db_before - db_after)
  );
END
$function$;
