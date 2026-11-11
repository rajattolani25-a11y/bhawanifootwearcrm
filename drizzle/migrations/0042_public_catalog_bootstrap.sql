-- One fresh public read. Existing financial/catalog functions stay unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.public_catalog_bootstrap()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $bootstrap$
DECLARE
  c jsonb; presentation jsonb; offer jsonb; hero jsonb;
  hero_failed boolean := false;
  bargains jsonb := '[]'::jsonb;
  cart_version integer := 0;
BEGIN
  c := public.public_catalog();
  IF NOT coalesce((c->>'enabled')::boolean, false) THEN
    RETURN jsonb_build_object('version',1,'catalog',c);
  END IF;
  BEGIN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'gallery_enabled',to_jsonb(s)->'gallery_enabled',
      'category_accents',to_jsonb(s)->'category_accents',
      'motion_enabled',to_jsonb(s)->'motion_enabled',
      'theme',to_jsonb(s)->'theme'
    )) INTO presentation
    FROM public.catalog_presentation_settings s WHERE id=1;
  EXCEPTION WHEN OTHERS THEN presentation := NULL;
  END;
  BEGIN
    offer := public.public_catalog_offer();
  EXCEPTION WHEN OTHERS THEN offer := NULL;
  END;
  BEGIN
    hero := public.public_catalog_hero();
  EXCEPTION WHEN OTHERS THEN hero_failed := true; hero := NULL;
  END;
  BEGIN
    bargains := public.catalog_bargain_enabled();
  EXCEPTION WHEN OTHERS THEN bargains := '[]'::jsonb;
  END;
  BEGIN
    cart_version := public.catalog_cart_version();
  EXCEPTION WHEN OTHERS THEN cart_version := 0;
  END;
  RETURN jsonb_build_object(
    'version',1,'catalog',c,'presentation',presentation,
    'offer',offer,'hero',hero,'hero_unavailable',hero_failed,
    'bargain_ids',bargains,'cart_version',cart_version
  );
END $bootstrap$;
REVOKE ALL ON FUNCTION public.public_catalog_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalog_bootstrap() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

SELECT to_regprocedure('public.public_catalog_bootstrap()') IS NOT NULL
  AS catalog_fast_read_ready;
