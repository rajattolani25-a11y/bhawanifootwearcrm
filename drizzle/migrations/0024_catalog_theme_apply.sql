-- Owner-selected catalog banner palette. Existing rows, switches and RLS stay intact.
ALTER TABLE public.catalog_presentation_settings
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'studio';

ALTER TABLE public.catalog_presentation_settings
  ALTER COLUMN theme SET DEFAULT 'studio',
  ALTER COLUMN theme SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_presentation_settings'::regclass
      AND conname = 'catalog_presentation_theme_check'
  ) THEN
    ALTER TABLE public.catalog_presentation_settings
      ADD CONSTRAINT catalog_presentation_theme_check
      CHECK (theme IN ('studio', 'midnight', 'plum', 'ivory', 'sage', 'copper', 'slate'));
  END IF;
END
$$;

-- Only the non-sensitive palette ID is public. The existing owner-only update
-- policy still blocks staff; no RPC or business-table permissions are changed.
GRANT SELECT (theme) ON public.catalog_presentation_settings TO anon, authenticated;
GRANT UPDATE (theme) ON public.catalog_presentation_settings TO authenticated;

NOTIFY pgrst, 'reload schema';