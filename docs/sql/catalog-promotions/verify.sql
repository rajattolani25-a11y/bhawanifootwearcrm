SELECT
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='store_settings' AND column_name='offer_promotion') AS settings_ready,
 to_regprocedure('public.owner_catalog_promotion()') IS NOT NULL AS owner_controls_ready,
 to_regprocedure('public.save_catalog_promotion(jsonb,jsonb)') IS NOT NULL AS save_ready,
 to_regprocedure('public.public_catalog_promotion()') IS NOT NULL AS public_display_ready;
