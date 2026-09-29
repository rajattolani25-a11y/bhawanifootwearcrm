CREATE OR REPLACE FUNCTION public.set_team_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only an owner can change team roles'; END IF;
  IF _user_id IS NULL OR _role IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Invalid team member or role';
  END IF;
  PERFORM pg_advisory_xact_lock(452198, 1);
  IF _role = 'staff' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
    AND (SELECT count(*) FROM public.user_roles WHERE role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'At least one owner must remain';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> _role;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.set_team_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_role(uuid, public.app_role) TO authenticated;