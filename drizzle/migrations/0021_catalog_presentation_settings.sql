-- Catalog-only presentation preferences. No business tables or RPC changes.
CREATE TABLE IF NOT EXISTS public.catalog_presentation_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gallery_enabled boolean NOT NULL DEFAULT true,
  category_accents boolean NOT NULL DEFAULT true,
  motion_enabled boolean NOT NULL DEFAULT true
);

INSERT INTO public.catalog_presentation_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.catalog_presentation_settings ENABLE ROW LEVEL SECURITY;

-- Only these non-sensitive presentation flags are readable publicly.
REVOKE ALL ON public.catalog_presentation_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, gallery_enabled, category_accents, motion_enabled)
  ON public.catalog_presentation_settings TO anon, authenticated;
GRANT UPDATE (gallery_enabled, category_accents, motion_enabled)
  ON public.catalog_presentation_settings TO authenticated;

DROP POLICY IF EXISTS catalog_presentation_read ON public.catalog_presentation_settings;
CREATE POLICY catalog_presentation_read ON public.catalog_presentation_settings
  FOR SELECT TO anon, authenticated USING (id = 1);

DROP POLICY IF EXISTS catalog_presentation_owner_update ON public.catalog_presentation_settings;
CREATE POLICY catalog_presentation_owner_update ON public.catalog_presentation_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (id = 1 AND public.has_role(auth.uid(), 'owner'));
