"""Targeted access regression against the full offline schema; no production connection."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1];container='reset-state-access-'+uuid.uuid4().hex[:8]
def run(args,value=None):return subprocess.run(args,input=value,text=True,capture_output=True)
def sql(value,ok=True):
 r=run(['docker','exec','-i',container,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],value)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r
owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';pending='00000000-0000-4000-8000-000000000003'
def asrole(statement,who=owner,role='authenticated',ok=True):return sql(f"SET ROLE {role};SET request.jwt.claim.sub='{who}';"+statement,ok)
r=run(['docker','run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
if r.returncode:raise RuntimeError(r.stderr)
try:
 for _ in range(150):
  logs=run(['docker','logs',container])
  if (logs.stdout+logs.stderr).count('database system is ready to accept connections')>=2 and sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('PostgreSQL startup timeout')
 sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
 GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz DEFAULT now(),deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT ON storage.objects TO anon;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;""")
 for path in sorted((root/'drizzle/migrations').glob('*.sql')):sql(path.read_text())
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test'),('{pending}','pending@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');")
 assert asrole('SELECT count(*) FROM store_reset_state;',who='',role='anon').stdout.strip()=='1'
 # A backend may also have a legacy broad policy and column-level grants.
 sql("CREATE POLICY legacy_open_reset_read ON public.store_reset_state FOR SELECT TO anon,authenticated USING(true);GRANT SELECT(installation_id) ON public.store_reset_state TO PUBLIC,anon;")
 fingerprint="SELECT md5(string_agg(pg_get_functiondef(p.oid),'|'ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p');"
 before=sql(fingerprint).stdout
 state=sql('SELECT row_to_json(s) FROM store_reset_state s;').stdout
 others=sql("SELECT md5(string_agg(to_jsonb(p)::text,'|'ORDER BY schemaname,tablename,policyname)) FROM pg_policies p WHERE tablename<>'store_reset_state';").stdout
 install=(root/'docs/sql/reset-state-read-access.sql').read_text();installed=sql(install);sql(install)
 assert installed.stdout.strip()=='t|t'
 assert sql('SELECT row_to_json(s) FROM store_reset_state s;').stdout==state
 for query in ['SELECT * FROM store_reset_state;','SELECT installation_id FROM store_reset_state;']:
  assert asrole(query,who='',role='anon',ok=False).returncode
 for who in [owner,staff]:
  row=json.loads(asrole('SELECT row_to_json(s) FROM (SELECT installation_id,generation,reset_at FROM store_reset_state WHERE id=1) s;',who).stdout)
  assert set(row)=={'installation_id','generation','reset_at'}
 for who in [pending,'']:
  assert asrole('SELECT count(*) FROM store_reset_state;',who).stdout.strip()=='0'
 # Both existing member roles can detect a changed generation without granting write access.
 sql('UPDATE store_reset_state SET generation=gen_random_uuid() WHERE id=1;')
 assert asrole('SELECT generation FROM store_reset_state;',owner).stdout==asrole('SELECT generation FROM store_reset_state;',staff).stdout
 for who in [owner,staff,pending]:
  assert asrole('UPDATE store_reset_state SET generation=gen_random_uuid() WHERE id=1;',who,ok=False).returncode
 asrole(f"SELECT remove_team_access('{staff}');")
 assert asrole('SELECT count(*) FROM store_reset_state;',staff).stdout.strip()=='0'
 backup=json.loads(asrole('SELECT store_backup_snapshot_v2();').stdout)
 assert backup['state']['installation_id']==json.loads(state)['installation_id']
 assert sql(fingerprint).stdout==before
 assert sql("SELECT md5(string_agg(to_jsonb(p)::text,'|'ORDER BY schemaname,tablename,policyname)) FROM pg_policies p WHERE tablename<>'store_reset_state';").stdout==others
 print(json.dumps({'passed':True,'anonymousTableAndColumnReadsBlocked':True,'ownerStaffReadsPreserved':True,'pendingRemovedAndEmptyIdentityBlocked':True,'otherPermissivePolicyCannotBypass':True,'directWritesRemainDenied':True,'ownerBackupStillWorks':True,'allExistingPublicFunctionsAndOtherPoliciesUnchanged':True,'repeatableInstall':True,'liveDatabaseWrites':0}))
finally:run(['docker','rm','-f',container])
