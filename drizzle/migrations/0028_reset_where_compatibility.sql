-- Update only the installed reset function. This migration does not execute a reset.
-- Preserve owner checks, verified backup, locks, transaction, retention options and grants.
DO $patch$
DECLARE
  target regprocedure := to_regprocedure('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)');
  definition text;
  old_statement text := $old$EXECUTE\s+format\(\s*'DELETE FROM public\.%I'\s*,\s*t\s*\)\s*;$old$;
  new_statement text := $new$EXECUTE format('DELETE FROM public.%I WHERE %I IS NOT NULL',t,
   CASE t WHEN 'product_costs' THEN 'product_id'
    WHEN 'sale_costs' THEN 'sale_id'
    WHEN 'sale_item_costs' THEN 'sale_item_id' ELSE 'id' END);$new$;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Safe reset support (0025) is missing. Stop; do not replay old migrations.';
  END IF;
  definition := pg_get_functiondef(target);
  IF definition ~* old_statement THEN
    EXECUTE regexp_replace(definition, old_statement, new_statement, 'i');
  ELSIF strpos(definition, new_statement) = 0 THEN
    RAISE EXCEPTION 'Installed reset definition differs from the approved version. Stop for review.';
  END IF;
END
$patch$;

NOTIFY pgrst, 'reload schema';
