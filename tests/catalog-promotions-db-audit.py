"""Offline PostgreSQL/RLS test, never connects to the application database."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1]
container='catalog-promotion-test-'+uuid.uuid4().hex[:8]
def run(args,sql=None):return subprocess.run(args,input=sql,text=True,capture_output=True)
def sql(value,ok=True):
 r=run(['docker','exec','-i',container,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],value)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r
owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002'
def call(name,args='',who=owner,role='authenticated',ok=True):
 r=sql(f"SET ROLE {role};SET request.jwt.claim.sub='{who}';SELECT {name}({args});",ok)
 return (json.loads(r.stdout)if r.stdout.strip()else None)if ok else r
r=run(['docker','run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
if r.returncode:raise RuntimeError(r.stderr)
try:
 for _ in range(150):
  logs=run(['docker','logs',container])
  if (logs.stdout+logs.stderr).count('database system is ready to accept connections')>=2 and sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('Disposable PostgreSQL startup timed out')
 sql(f"""CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id='{owner}'::uuid AND _role='owner' $$;
 CREATE TABLE public.store_settings(id integer PRIMARY KEY,offer_enabled boolean DEFAULT false,offer_title text,offer_subtitle text,offer_coupon text,offer_card boolean DEFAULT true,catalog_enabled boolean DEFAULT true);
 INSERT INTO public.store_settings(id)VALUES(1);
 CREATE TABLE public.products(id uuid PRIMARY KEY,catalog_visible boolean DEFAULT true);
 CREATE TABLE public.coupons(id uuid DEFAULT gen_random_uuid(),code text,active boolean DEFAULT true,customer_id uuid,starts_at timestamptz,expires_at timestamptz,usage_limit integer,used_count integer DEFAULT 0,kind text,value numeric,max_discount numeric,min_bill numeric);
 CREATE FUNCTION public.public_catalog_offer() RETURNS jsonb LANGUAGE sql AS $$ SELECT null::jsonb $$;
 CREATE FUNCTION public.create_sale() RETURNS text LANGUAGE sql AS $$ SELECT 'untouched'::text $$;
 """)
 before=sql("SELECT pg_get_functiondef('public.create_sale()'::regprocedure)").stdout
 install=(root/'docs/sql/catalog-promotions/install.sql').read_text()
 sql(install);sql(install)
 assert sql("SELECT pg_get_functiondef('public.create_sale()'::regprocedure)").stdout==before
 for role,who in [('anon',''),('authenticated',staff)]:
  assert call('public.owner_catalog_promotion',who=who,role=role,ok=False).returncode
  assert call('public.save_catalog_promotion',"'{}','{}'",who=who,role=role,ok=False).returncode
 snap=call('public.owner_catalog_promotion');assert snap['config']is None
 assert call('public.public_catalog_promotion',who='',role='anon')is None
 product='10000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO products(id)VALUES('{product}');INSERT INTO coupons(code,kind,value,min_bill,starts_at,expires_at)VALUES('REAL200','fixed',200,1499,now()+interval '1 hour',now()+interval '3 hours');")
 dates=json.loads(sql("SELECT jsonb_build_object('announceAt',now()-interval '1 hour','startsAt',now()+interval '1 hour 1 second','endsAt',now()+interval '2 hours');").stdout)
 campaign={'audience':'men','enabled':True,'title':'Real campaign','subtitle':'Actual conditions','coupon':'REAL200','productIds':[product],'advance':{'layout':'classic','image':None},'live':{'layout':'split','image':None},'schedule':dates}
 settings={**snap,'enabled':True,'config':{'version':1,'campaigns':[campaign]}}
 q=lambda x:"'"+json.dumps(x).replace("'","''")+"'::jsonb"
 saved=call('public.save_catalog_promotion',q(settings)+','+q(snap));assert saved==settings
 pub=call('public.public_catalog_promotion',who='',role='anon');assert pub['campaigns'][0]['offer']['value']==200 and pub['campaigns'][0]['offer']['min_bill']==1499
 assert 'customer_id' not in json.dumps(pub)
 assert call('public.save_catalog_promotion',q(settings)+','+q(snap),ok=False).returncode # stale-save protection
 invalid={**settings,'config':{'version':1,'campaigns':[{**campaign,'schedule':{**dates,'endsAt':dates['announceAt']}}]}}
 assert call('public.save_catalog_promotion',q(invalid)+','+q(saved),ok=False).returncode
 assert call('public.owner_catalog_promotion')==saved # atomic rollback
 for patch in [{'schedule':None},{'schedule':{**dates,'startsAt':dates['announceAt']}}]:
  changed={**settings,'config':{'version':1,'campaigns':[{**campaign,**patch}]}}
  if patch['schedule']is None:
   cur=call('public.save_catalog_promotion',q(changed)+','+q(saved))
   assert call('public.public_catalog_promotion',who='',role='anon')['campaigns']==[] # future coupon never live early
   saved=call('public.save_catalog_promotion',q(settings)+','+q(cur))
  else:assert call('public.save_catalog_promotion',q(changed)+','+q(saved),ok=False).returncode
 sql("UPDATE coupons SET usage_limit=1,used_count=1 WHERE code='REAL200';")
 assert call('public.public_catalog_promotion',who='',role='anon')['campaigns']==[]
 sql("UPDATE store_settings SET offer_enabled=false WHERE id=1;")
 assert call('public.public_catalog_promotion',who='',role='anon')is None
 assert all(v=='t' for v in sql((root/'docs/sql/catalog-promotions/verify.sql').read_text()).stdout.strip().split('|'))
 print(json.dumps({'passed':True,'idempotent_install':True,'owner_only':True,'stale_save_rejected':True,'atomic_validation':True,'future_coupon_safety':True,'usage_limit_checked':True,'financial_definition_unchanged':True,'production_writes':0}))
finally:run(['docker','rm','-f',container])
