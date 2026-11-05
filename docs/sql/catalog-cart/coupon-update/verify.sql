SELECT
 public.catalog_cart_version()=2 AS cart_coupon_version_ready,
 to_regprocedure('public.create_catalog_cart_order_v2(uuid,jsonb,text,text,text,text,text,jsonb,text)')IS NOT NULL AS whole_cart_writer_ready,
 to_regprocedure('public.check_catalog_cart_coupon(uuid[],text,text)')IS NOT NULL AS coupon_preview_ready,
 position('public.revalidate_catalog_cart_coupon(b.id)'IN pg_get_functiondef('public.confirm_catalog_booking(uuid)'::regprocedure))>0 AS expiry_confirmation_ready,
 NOT has_function_privilege('anon','public.revalidate_catalog_cart_coupon(uuid)','EXECUTE')AS private_validation_protected;
