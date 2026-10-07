CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  PERFORM pg_advisory_xact_lock(452198, 1);
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (new.id, 'owner');
  END IF;
  RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.remove_team_access(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only an owner can remove access'; END IF;
  PERFORM pg_advisory_xact_lock(452198, 1);
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
    AND (SELECT count(*) FROM public.user_roles WHERE role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'At least one owner must remain';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
END $$;
REVOKE ALL ON FUNCTION public.remove_team_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_access(uuid) TO authenticated;