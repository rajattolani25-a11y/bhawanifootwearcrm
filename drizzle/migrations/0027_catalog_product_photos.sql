-- Public-safe, on-demand gallery reads. No changes to checkout, stock or reset RPCs.
-- Standalone: also works before optional store-maintenance migration 0025 is applied.
CREATE OR REPLACE FUNCTION public.public_catalog_photos(_product_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH visible AS (
    SELECT p.id, p.image_url FROM public.products p
    JOIN public.store_settings s ON s.id = 1
    WHERE p.id = _product_id AND p.catalog_visible AND s.catalog_enabled
      AND p.status = 'Active'
      AND EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.stock > 0)
  ), photos AS (
    SELECT image_url AS path, 0 AS priority FROM visible WHERE image_url IS NOT NULL
    UNION
    SELECT o.name, CASE WHEN o.name = p.image_url THEN 0 ELSE 1 END
    FROM storage.objects o JOIN visible p ON split_part(o.name, '/', 1) = p.id::text
    WHERE o.bucket_id = 'product-images' AND array_length(string_to_array(o.name, '/'), 1) = 2
  )
  SELECT coalesce(array_agg(path ORDER BY priority, path), '{}'::text[])
  FROM (SELECT path, min(priority) AS priority FROM photos GROUP BY path ORDER BY min(priority), path LIMIT 8) selected
$$;
REVOKE ALL ON FUNCTION public.public_catalog_photos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalog_photos(uuid) TO anon, authenticated;

-- Keep the existing bucket private. Signing is allowed only for visible storefront photos.
CREATE OR REPLACE FUNCTION public.is_catalog_image(_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products p JOIN public.store_settings s ON s.id = 1
    WHERE p.catalog_visible AND s.catalog_enabled AND p.status = 'Active'
      AND (p.image_url = _name OR (
        split_part(_name, '/', 1) = p.id::text
        AND array_length(string_to_array(_name, '/'), 1) = 2
      ))
  )
$$;
