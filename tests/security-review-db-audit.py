"""Offline signup hardening + unchanged number-matched coupon regression."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1];container='signup-security-'+uuid.uuid4().hex[:8]
def run(args,value=None):return subprocess.run(args,input=value,text=True,capture_output=True)
def sql(value,ok=True):
 r=run(['docker','exec','-i',container,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],value)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r
owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';fresh='00000000-0000-4000-8000-000000000003';empty='00000000-0000-4000-8000-000000000004'
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
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT ON storage.objects TO anon;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;""")
 for path in sorted((root/'drizzle/migrations').glob('*.sql')):sql(path.read_text())
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');")
 sql((root/'docs/sql/reset-state-read-access.sql').read_text())
 unchanged="SELECT md5(string_agg(pg_get_functiondef(p.oid),'|'ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') AND p.proname<>'handle_new_user';"
 before=sql(unchanged).stdout;roles=sql('SELECT jsonb_agg(to_jsonb(r)ORDER BY r.user_id,r.role)FROM user_roles r;').stdout
 patch=(root/'docs/sql/signup-owner-lockdown.sql').read_text();assert sql(patch).stdout.strip()=='t|t';sql(patch)
 assert sql('SELECT jsonb_agg(to_jsonb(r)ORDER BY r.user_id,r.role)FROM user_roles r;').stdout==roles
 sql(f"INSERT INTO auth.users(id,email,raw_user_meta_data)VALUES('{fresh}','new@example.test','{{\"role\":\"owner\",\"is_owner\":true,\"full_name\":\"New member\"}}');")
 assert sql(f"SELECT count(*) FROM profiles WHERE id='{fresh}';").stdout.strip()=='1'
 assert sql(f"SELECT count(*) FROM user_roles WHERE user_id='{fresh}';").stdout.strip()=='0'
 assert asrole(f"SELECT set_team_role('{fresh}','owner');",fresh,ok=False).returncode
 asrole(f"SELECT set_team_role('{fresh}','staff');")
 assert sql(f"SELECT role FROM user_roles WHERE user_id='{fresh}';").stdout.strip()=='staff'
 asrole(f"SELECT set_team_role('{fresh}','owner');")
 assert sql(f"SELECT role FROM user_roles WHERE user_id='{fresh}';").stdout.strip()=='owner'
 # Public coupons and private matching rules are deliberately unchanged; no OTP is introduced.
 p=str(uuid.uuid4());v=str(uuid.uuid4());c=str(uuid.uuid4())
 sql(f"INSERT INTO products(id,brand,article,category,selling_price,catalog_visible)VALUES('{p}','Demo','Test','Men / Other',1000,true);INSERT INTO product_variants(id,product_id,size,stock)VALUES('{v}','{p}','7',5);INSERT INTO customers(id,name,mobile)VALUES('{c}','Test customer','9876543210');INSERT INTO coupons(code,kind,value,min_bill,customer_id)VALUES('COMMON','flat',100,500,NULL),('PERSONAL','flat',150,500,'{c}');")
 def preview(code,mobile,ok=True):return asrole(f"SELECT check_catalog_coupon('{v}','{code}','{mobile}');",'', 'anon',ok)
 for mobile in ['9876543210','9765432109']:assert json.loads(preview('COMMON',mobile).stdout)['amount']==100
 assert json.loads(preview('PERSONAL','9876543210').stdout)['amount']==150
 assert json.loads(preview('PERSONAL','+91 98765 43210').stdout)['amount']==150
 assert preview('PERSONAL','9765432109',False).returncode
 assert preview('WRONG-CODE','9876543210',False).returncode
 # Emptying roles here is an adversarial OFFLINE fixture, never a proposed live operation.
 sql('DELETE FROM public.user_roles;')
 sql(f"INSERT INTO auth.users(id,email)VALUES('{empty}','empty-backend@example.test');")
 assert sql('SELECT count(*) FROM public.user_roles;').stdout.strip()=='0','Signup must not claim the first owner even when none exists'
 assert sql(patch,False).returncode,'Installer requires a pre-existing verified owner'
 assert sql(unchanged).stdout==before
 print(json.dumps({'passed':True,'existingOwnerAndStaffUntouched':True,'newSignupPendingEvenWithForgedRole':True,'emptyOwnerSetCannotReopenClaim':True,'explicitOwnerApprovalStillWorks':True,'onlySignupFunctionChanged':True,'publicCouponsStillWork':True,'personalCodeAndNumberMatchingPreserved':True,'wrongNumberRejected':True,'phoneFormattingNormalized':True,'noOtpAdded':True,'liveWrites':0}))
finally:run(['docker','rm','-f',container])
