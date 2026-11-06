SELECT to_regprocedure('public.prepare_catalog_promotion_photo(text,text)') IS NOT NULL AS upload_ready,
 to_regprocedure('public.owner_catalog_promotion_storage()') IS NOT NULL AS usage_ready,
 to_regprocedure('public.is_catalog_promotion_photo(text)') IS NOT NULL AS public_photo_access_ready,
 EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Protect saved promotion photos') AS saved_photo_protection_ready;
