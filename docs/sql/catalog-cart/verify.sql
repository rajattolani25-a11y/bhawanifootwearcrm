-- Read-only: all six results should be true after both cart parts.
SELECT
 to_regprocedure('public.create_catalog_cart_order(uuid,jsonb,text,text,text,text,text,jsonb)') IS NOT NULL AS cart_checkout_ready,
 to_regprocedure('public.track_catalog_cart_order(text,text)') IS NOT NULL AS cart_tracking_ready,
 to_regprocedure('public.catalog_cart_payment_summary(text)') IS NOT NULL AS cart_summary_ready,
 to_regprocedure('public.confirm_catalog_cart_payment(text,numeric,boolean)') IS NOT NULL AS cart_confirmation_ready,
 NOT has_function_privilege('anon','public.catalog_cart_result(uuid)','EXECUTE') AS private_result_protected,
 public.catalog_cart_version() = 1 AS cart_version_ready;
