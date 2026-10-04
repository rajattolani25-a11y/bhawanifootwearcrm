CREATE OR REPLACE FUNCTION public.store_usage()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
  RETURN jsonb_build_object(
    'db_bytes', (SELECT coalesce(sum(pg_total_relation_size(c.oid)),0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
    'photo_bytes', (SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects WHERE bucket_id='product-images'),
    'photos', (SELECT count(*) FROM storage.objects WHERE bucket_id='product-images'),
    'products', (SELECT count(*) FROM products),
    'variants', (SELECT count(*) FROM product_variants),
    'bills', (SELECT count(*) FROM sales),
    'customers', (SELECT count(*) FROM customers),
    'suppliers', (SELECT count(*) FROM suppliers),
    'stock_entries', (SELECT count(*) FROM stock_movements)
  );
END $$;
REVOKE ALL ON FUNCTION public.store_usage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.store_usage() TO authenticated;