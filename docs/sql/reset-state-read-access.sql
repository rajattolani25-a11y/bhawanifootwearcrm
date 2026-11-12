-- Targeted access fix only. Does not run reset, replay migrations, or change store data.
BEGIN;
ALTER TABLE public.store_reset_state ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON TABLE public.store_reset_state FROM PUBLIC, anon;
REVOKE SELECT (id, installation_id, generation, reset_at)
 ON TABLE public.store_reset_state FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.store_reset_state TO authenticated;

DROP POLICY IF EXISTS "Read reset generation" ON public.store_reset_state;
DROP POLICY IF EXISTS "Store members read reset generation" ON public.store_reset_state;
CREATE POLICY "Store members read reset generation"
 ON public.store_reset_state FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND public.is_member(auth.uid()));

-- Also constrain any older permissive SELECT policy that may exist in the backend.
DROP POLICY IF EXISTS "Require store membership for reset state" ON public.store_reset_state;
CREATE POLICY "Require store membership for reset state"
 ON public.store_reset_state AS RESTRICTIVE FOR SELECT TO anon, authenticated
 USING (auth.uid() IS NOT NULL AND public.is_member(auth.uid()));

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT
 (NOT has_table_privilege('anon','public.store_reset_state','SELECT')
  AND NOT has_any_column_privilege('anon','public.store_reset_state','SELECT')) AS anon_read_blocked,
 (has_table_privilege('authenticated','public.store_reset_state','SELECT')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.store_reset_state'::regclass)
  AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.store_reset_state'::regclass
   AND polname='Require store membership for reset state' AND polcmd='r' AND NOT polpermissive)
  AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.store_reset_state'::regclass
   AND polname='Store members read reset generation' AND polcmd='r')) AS member_guard_enabled;
