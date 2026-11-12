-- Existing shop only: preserve all accounts/roles and stop signup from claiming ownership.
BEGIN;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role='owner') THEN
  RAISE EXCEPTION 'No existing owner. Verify and provision the owner through trusted backend administration first.';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
BEGIN
 PERFORM pg_advisory_xact_lock(452198,1);
 INSERT INTO public.profiles(id,full_name)
 VALUES(NEW.id,coalesce(NEW.raw_user_meta_data->>'full_name',split_part(NEW.email,'@',1),''))
 ON CONFLICT(id) DO NOTHING;
 -- Signup creates a profile only. Existing owners use set_team_role / transfer_store_ownership.
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role='owner') AS existing_owner_preserved,
 position('INSERT INTO public.user_roles' IN pg_get_functiondef('public.handle_new_user()'::regprocedure))=0
 AS automatic_owner_claim_removed;
