-- Explicit, owner-only maintenance. This migration DOES NOT reset any store.
CREATE TABLE public.store_reset_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  installation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  reset_at timestamptz
);
INSERT INTO public.store_reset_state(id) VALUES (1);
ALTER TABLE public.store_reset_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read reset generation" ON public.store_reset_state FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.store_reset_state TO anon, authenticated;

CREATE TABLE public.store_file_cleanup (
  bucket text NOT NULL CHECK (bucket IN ('product-images', 'catalog-hero-images')),
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 1024),
  reason text NOT NULL CHECK (reason IN ('reset', 'restore')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, path)
);
ALTER TABLE public.store_file_cleanup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads pending cleanup" ON public.store_file_cleanup FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
GRANT SELECT ON public.store_file_cleanup TO authenticated;

-- Fixed allowlists: no caller-controlled relation names or arbitrary SQL.
CREATE FUNCTION public.maintenance_business_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT ARRAY['products','product_costs','product_variants','customers','suppliers','coupons','sales','purchases','sale_items','sale_costs','sale_item_costs','sale_returns','credit_payments','loyalty_rewards','loyalty_events','supplier_payments','stock_movements','expenses','coupon_redemptions','catalog_bookings']::text[]
$$;
REVOKE ALL ON FUNCTION public.maintenance_business_tables() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.store_backup_snapshot_v2() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; rows jsonb; tables jsonb := '{}'::jsonb; assets jsonb; team jsonb; state jsonb; numbering jsonb; payload jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 FOREACH t IN ARRAY public.maintenance_business_tables() || ARRAY['store_settings','catalog_hero_settings','catalog_presentation_settings'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(r ORDER BY r::text), ''[]''::jsonb) FROM (SELECT to_jsonb(x) r FROM public.%I x) q', t) INTO rows;
  tables := tables || jsonb_build_object(t, rows);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'path', name, 'updated_at', updated_at) ORDER BY bucket_id, name), '[]'::jsonb)
 INTO assets FROM storage.objects WHERE bucket_id IN ('product-images','catalog-hero-images');
 SELECT jsonb_build_object('profiles', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id), '[]'::jsonb) FROM public.profiles p),
  'roles', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.user_id, r.role), '[]'::jsonb) FROM public.user_roles r)) INTO team;
 SELECT to_jsonb(s) INTO state FROM public.store_reset_state s WHERE id=1;
 SELECT jsonb_build_object('next_bill', CASE WHEN is_called THEN last_value+1 ELSE last_value END) INTO numbering FROM public.bill_seq;
 payload := jsonb_build_object('version',2,'state',state,'tables',tables,'assets',assets,'team',team,'numbering',numbering);
 RETURN payload || jsonb_build_object('fingerprint', md5((payload - 'numbering')::text));
END $$;
REVOKE ALL ON FUNCTION public.store_backup_snapshot_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_backup_snapshot_v2() TO authenticated;

CREATE FUNCTION public.maintenance_lock_store() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE relations text;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM pg_advisory_xact_lock(452198,1);
 SELECT string_agg(format('public.%I',t), ', ' ORDER BY t) INTO relations
 FROM unnest(public.maintenance_business_tables() || ARRAY['store_settings','catalog_hero_settings','catalog_presentation_settings','user_roles','profiles','store_reset_state','store_file_cleanup']) t;
 EXECUTE 'LOCK TABLE ' || relations || ' IN EXCLUSIVE MODE';
 LOCK TABLE storage.objects IN SHARE ROW EXCLUSIVE MODE;
END $$;
REVOKE ALL ON FUNCTION public.maintenance_lock_store() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.reset_store_data_v2(_confirmation text, _fingerprint text, _preserve_identity boolean DEFAULT true,
 _preserve_design boolean DEFAULT true, _restart_numbers boolean DEFAULT false, _preserve_operations boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; assignments text; identity jsonb; hero_path text;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _confirmation IS DISTINCT FROM 'RESET' OR _preserve_identity IS NULL OR _preserve_design IS NULL OR _restart_numbers IS NULL OR _preserve_operations IS NULL THEN RAISE EXCEPTION 'Invalid reset confirmation or options'; END IF;
 PERFORM public.maintenance_lock_store();
 -- Recheck after waiting: another owner may have revoked the caller meanwhile.
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _fingerprint IS DISTINCT FROM (public.store_backup_snapshot_v2()->>'fingerprint') THEN RAISE EXCEPTION 'Store changed since backup. Download and verify a fresh backup before resetting.'; END IF;
 SELECT to_jsonb(s) INTO identity FROM public.store_settings s WHERE id=1;
 IF _preserve_design THEN SELECT image_path INTO hero_path FROM public.catalog_hero_settings WHERE id=1; END IF;
 INSERT INTO public.store_file_cleanup(bucket,path,reason)
 SELECT bucket_id,name,'reset' FROM storage.objects WHERE bucket_id IN ('product-images','catalog-hero-images')
 AND NOT (bucket_id='catalog-hero-images' AND name IS NOT DISTINCT FROM hero_path)
 ON CONFLICT (bucket,path) DO UPDATE SET reason='reset';
 -- Hero resets FIRST so saved-image deletion policy allows subsequent Storage API cleanup.
 IF NOT _preserve_design THEN
  DELETE FROM public.catalog_hero_settings WHERE id=1;
  INSERT INTO public.catalog_hero_settings(id) VALUES(1);
  DELETE FROM public.catalog_presentation_settings WHERE id=1;
  INSERT INTO public.catalog_presentation_settings(id) VALUES(1);
 END IF;
 -- Children before parents, including both unbilled and billed catalog orders.
 FOREACH t IN ARRAY ARRAY['catalog_bookings','coupon_redemptions','loyalty_events','loyalty_rewards','credit_payments','sale_returns','sale_item_costs','sale_costs','sale_items','sales','coupons','expenses','supplier_payments','purchases','stock_movements','product_costs','product_variants','products','suppliers','customers'] LOOP
  EXECUTE format('DELETE FROM public.%I',t);
 END LOOP;
 -- Existing accounts are retained for recovery; every other account loses app access.
 DELETE FROM public.user_roles WHERE user_id <> auth.uid();
 -- Use real column defaults (including newer billing/delivery/offer columns).
 SELECT string_agg(format('%I = DEFAULT',attname),', ') INTO assignments FROM pg_attribute
 WHERE attrelid='public.store_settings'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'id' AND attgenerated='';
 EXECUTE 'UPDATE public.store_settings SET '||assignments||' WHERE id=1';
 IF _preserve_identity THEN
  UPDATE public.store_settings SET business_name=identity->>'business_name',business_phone=identity->>'business_phone',
   business_address=identity->>'business_address',gstin=identity->>'gstin',upi_id=identity->>'upi_id' WHERE id=1;
 END IF;
 -- Preserve configuration independently of shop identity; coupons/promotions are business data.
 IF _preserve_operations THEN
  SELECT string_agg(format('%I = x.%I',attname,attname),', ') INTO assignments FROM pg_attribute
   WHERE attrelid='public.store_settings'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''
   AND attname NOT IN ('id','updated_at','business_name','business_phone','business_address','gstin','upi_id')
   AND left(attname,6)<>'offer_';
  IF assignments IS NOT NULL THEN
   EXECUTE 'UPDATE public.store_settings s SET '||assignments||' FROM jsonb_populate_record(NULL::public.store_settings,$1) x WHERE s.id=1' USING identity;
  END IF;
 END IF;
 IF _restart_numbers THEN ALTER SEQUENCE public.bill_seq RESTART WITH 1; END IF;
 UPDATE public.store_reset_state SET generation=gen_random_uuid(),reset_at=clock_timestamp() WHERE id=1;
 RETURN jsonb_build_object('state',(SELECT to_jsonb(s) FROM public.store_reset_state s WHERE id=1),
  'pending_files',(SELECT count(*) FROM public.store_file_cleanup));
END $$;
REVOKE ALL ON FUNCTION public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean) TO authenticated;

-- Old clients must not bypass verified backup and the expanded reset policy.
CREATE OR REPLACE FUNCTION public.reset_store_data(_confirmation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RAISE EXCEPTION 'Refresh SoleStack and use the verified backup/reset flow in Settings.';
END $$;

CREATE FUNCTION public.ack_store_file_cleanup(_bucket text, _paths text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 DELETE FROM public.store_file_cleanup q WHERE q.bucket=_bucket AND q.path=ANY(_paths)
 AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id=q.bucket AND o.name=q.path);
END $$;
REVOKE ALL ON FUNCTION public.ack_store_file_cleanup(text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ack_store_file_cleanup(text,text[]) TO authenticated;

-- Queue new restore uploads BEFORE sending bytes, so failed restores are cleanable.
CREATE FUNCTION public.stage_store_restore_files(_assets jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; occupied boolean;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM public.maintenance_lock_store();
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 FOREACH t IN ARRAY public.maintenance_business_tables() LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t) INTO occupied;
  IF occupied THEN RAISE EXCEPTION 'Restore requires an empty store'; END IF;
 END LOOP;
 IF jsonb_typeof(_assets) IS DISTINCT FROM 'array' OR jsonb_array_length(_assets)>10000 THEN RAISE EXCEPTION 'Invalid asset manifest'; END IF;
 INSERT INTO public.store_file_cleanup(bucket,path,reason)
 SELECT a->>'bucket',a->>'path','restore' FROM jsonb_array_elements(_assets) a
 WHERE NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=a->>'bucket' AND o.name=a->>'path')
 ON CONFLICT(bucket,path) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.stage_store_restore_files(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_store_restore_files(jsonb) TO authenticated;

CREATE FUNCTION public.restore_store_backup_v2(_confirmation text, _snapshot jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; occupied boolean; columns text; tr record; triggers jsonb := '[]'::jsonb; j jsonb; expected text[]; seq_next bigint; backup_next bigint;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _confirmation IS DISTINCT FROM 'RESTORE' OR (_snapshot->>'version') IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Invalid restore file or confirmation'; END IF;
 PERFORM public.maintenance_lock_store();
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF (_snapshot->'state'->>'installation_id') IS DISTINCT FROM (SELECT installation_id::text FROM public.store_reset_state WHERE id=1) THEN RAISE EXCEPTION 'This backup belongs to a different backend. Cross-shop restore is blocked.'; END IF;
 expected := public.maintenance_business_tables() || ARRAY['store_settings','catalog_hero_settings','catalog_presentation_settings'];
 IF (SELECT count(*) FROM jsonb_object_keys(_snapshot->'tables')) <> cardinality(expected) THEN RAISE EXCEPTION 'Backup table manifest does not match this version'; END IF;
 FOREACH t IN ARRAY expected LOOP
  IF jsonb_typeof(_snapshot->'tables'->t) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing backup table: %',t; END IF;
  IF t=ANY(public.maintenance_business_tables()) THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t) INTO occupied;
   IF occupied THEN RAISE EXCEPTION 'Restore requires an empty store'; END IF;
  ELSIF jsonb_array_length(_snapshot->'tables'->t)<>1 OR (_snapshot->'tables'->t->0->>'id') IS DISTINCT FROM '1' THEN
   RAISE EXCEPTION 'Invalid settings singleton: %',t;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.store_file_cleanup WHERE reason='reset') THEN RAISE EXCEPTION 'Finish reset photo cleanup before restoring'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_snapshot->'assets') a WHERE NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=a->>'bucket' AND o.name=a->>'path')) THEN RAISE EXCEPTION 'Restore photos before database rows'; END IF;
 -- Suspend only user triggers, never FK/constraint triggers. Rollback restores their state too.
 FOR tr IN SELECT c.relname,tg.tgname,tg.tgenabled FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(expected) AND NOT tg.tgisinternal AND tg.tgenabled<>'D' LOOP
  triggers := triggers || jsonb_build_array(jsonb_build_object('table',tr.relname,'name',tr.tgname,'mode',tr.tgenabled));
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',tr.relname,tr.tgname);
 END LOOP;
 FOREACH t IN ARRAY expected LOOP
  IF NOT t=ANY(public.maintenance_business_tables()) THEN EXECUTE format('DELETE FROM public.%I WHERE id=1',t); END IF;
  SELECT string_agg(format('%I',attname),', ' ORDER BY attnum) INTO columns FROM pg_attribute
   WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)',t,columns,columns,t)
   USING _snapshot->'tables'->t;
 END LOOP;
 FOR j IN SELECT value FROM jsonb_array_elements(triggers) LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE %s TRIGGER %I',j->>'table',CASE j->>'mode' WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END,j->>'name');
 END LOOP;
 SELECT CASE WHEN is_called THEN last_value+1 ELSE last_value END INTO seq_next FROM public.bill_seq;
 backup_next := (_snapshot->'numbering'->>'next_bill')::bigint;
 IF backup_next IS NULL OR backup_next<1 THEN RAISE EXCEPTION 'Missing invoice counter'; END IF;
 EXECUTE format('ALTER SEQUENCE public.bill_seq RESTART WITH %s',greatest(seq_next,backup_next));
 DELETE FROM public.store_file_cleanup q WHERE reason='restore' AND EXISTS(SELECT 1 FROM jsonb_array_elements(_snapshot->'assets') a WHERE a->>'bucket'=q.bucket AND a->>'path'=q.path);
 -- Auth credentials and roles are deliberately never restored from a JSON file.
 UPDATE public.store_reset_state SET generation=gen_random_uuid(),reset_at=clock_timestamp() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.restore_store_backup_v2(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_store_backup_v2(text,jsonb) TO authenticated;


-- Recheck access after the shared ownership lock, including requests queued before handover.
CREATE OR REPLACE FUNCTION public.set_team_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only an owner can change team roles'; END IF;
  IF _user_id IS NULL OR _role IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Invalid team member or role';
  END IF;
  PERFORM pg_advisory_xact_lock(452198, 1);
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF _role = 'staff' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
    AND (SELECT count(*) FROM public.user_roles WHERE role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'At least one owner must remain';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> _role;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.set_team_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_role(uuid, public.app_role) TO authenticated;
CREATE OR REPLACE FUNCTION public.remove_team_access(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only an owner can remove access'; END IF;
  PERFORM pg_advisory_xact_lock(452198, 1);
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
    AND (SELECT count(*) FROM public.user_roles WHERE role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'At least one owner must remain';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
END $$;
REVOKE ALL ON FUNCTION public.remove_team_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_access(uuid) TO authenticated;
CREATE FUNCTION public.transfer_store_ownership(_email text, _confirmation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; caller uuid := auth.uid();
BEGIN
 IF NOT public.has_role(caller,'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM pg_advisory_xact_lock(452198,1);
 IF NOT public.has_role(caller,'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _confirmation IS DISTINCT FROM 'TRANSFER' THEN RAISE EXCEPTION 'Type TRANSFER to confirm'; END IF;
 SELECT id INTO target FROM auth.users WHERE lower(email)=lower(trim(_email)) AND email_confirmed_at IS NOT NULL
  AND deleted_at IS NULL AND coalesce(banned_until,'-infinity'::timestamptz)<now();
 IF target IS NULL OR target=caller THEN RAISE EXCEPTION 'New owner must sign up and verify a different email first'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(target,'owner') ON CONFLICT(user_id,role) DO NOTHING;
 DELETE FROM public.user_roles WHERE user_id=target AND role<>'owner';
 -- Other team roles remain; only the outgoing owner is revoked. Explicit UI warning.
 DELETE FROM public.user_roles WHERE user_id=caller;
 UPDATE public.store_reset_state SET generation=gen_random_uuid(),reset_at=clock_timestamp() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.transfer_store_ownership(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_store_ownership(text,text) TO authenticated;
-- A concurrent maintenance cleanup must not remove a photo now used by restored rows.
-- Existing replacement flows save the new path before deleting the old path.
CREATE FUNCTION public.maintenance_file_in_use(_bucket text, _path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT CASE WHEN _bucket='product-images' THEN EXISTS(SELECT 1 FROM public.products WHERE image_url=_path)
 WHEN _bucket='catalog-hero-images' THEN EXISTS(SELECT 1 FROM public.catalog_hero_settings WHERE image_path=_path)
 ELSE false END
$$;
REVOKE ALL ON FUNCTION public.maintenance_file_in_use(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_file_in_use(text,text) TO authenticated;
CREATE POLICY "Protect referenced photos during maintenance" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (bucket_id NOT IN ('product-images','catalog-hero-images') OR NOT public.maintenance_file_in_use(bucket_id,name));
NOTIFY pgrst, 'reload schema';
