-- Optional per-product Spotlight word. No prices/stock/settings are changed.
-- Run the whole file in SQL Editor before publishing the matching frontend.
BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS catalog_spotlight_label text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_spotlight_label_format'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_spotlight_label_format CHECK (
        catalog_spotlight_label IS NULL OR (
          char_length(catalog_spotlight_label) BETWEEN 1 AND 12
          AND catalog_spotlight_label ~ '^[A-Z][A-Z0-9-]{0,11}$'
        )
      );
  END IF;
END $constraint$;

COMMENT ON COLUMN public.products.catalog_spotlight_label IS
  'Optional uppercase Spotlight word, max 12 ASCII characters. NULL uses the saved category. Existing owner product RLS applies.';

-- Preserve the installed public_catalog definition, permissions and visibility rules.
-- Extend just its known product JSON object. Unexpected definitions roll back.
DO $catalog$
DECLARE
  definition text;
  marker text := '''id'', p.id,';
  addition text := '''id'', p.id, ''spotlight_label'', p.catalog_spotlight_label,';
BEGIN
  SELECT pg_get_functiondef('public.public_catalog()'::regprocedure)
    INTO definition;
  IF position(addition IN definition) = 0 THEN
    IF position('''spotlight_label''' IN definition) > 0
      OR (length(definition) - length(replace(definition, marker, '')))
         <> length(marker) THEN
      RAISE EXCEPTION 'Unexpected public_catalog definition. No changes applied; review required.';
    END IF;
    EXECUTE replace(definition, marker, addition);
  END IF;
END $catalog$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Both results must be true.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'catalog_spotlight_label' AND is_nullable = 'YES'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_spotlight_label_format'
  ) AS spotlight_heading_ready,
  position('''spotlight_label'', p.catalog_spotlight_label' IN
    pg_get_functiondef('public.public_catalog()'::regprocedure)) > 0
    AS public_heading_ready;
