from pathlib import Path
import subprocess,time,json,uuid
# Disposable offline PostgreSQL only; never loads application credentials.
root=Path(__file__).resolve().parents[1];name='bhawani-spot-heading-'+uuid.uuid4().hex[:6]
def run(a,s=None):return subprocess.run(a,input=s,text=True,capture_output=True)
def sql(s,ok=True):
 r=run(['docker','exec','-i',name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],s)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r
r=run(['docker','run','--rm','-d','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);assert r.returncode==0,r.stderr
try:
 for i in range(150):
  if sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz DEFAULT now(),deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;CREATE PUBLICATION supabase_realtime;""")
 for p in sorted((root/'drizzle/migrations').glob('*.sql')):
  if p.name.startswith('0025_'):sql((root/'drizzle/migrations/0027_catalog_product_photos.sql').read_text())
  if p.name.startswith('0041_'):continue
  sql(p.read_text())
 before=sql("SELECT md5(string_agg(pg_get_functiondef(oid),'' ORDER BY oid)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname<>'public_catalog';").stdout
 acl=sql("SELECT proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='public_catalog()'::regprocedure;").stdout
 patch=(root/'drizzle/migrations/0041_product_spotlight_heading.sql').read_text();assert sql(patch).stdout.strip().endswith('t|t');assert sql(patch).stdout.strip().endswith('t|t')
 assert before==sql("SELECT md5(string_agg(pg_get_functiondef(oid),'' ORDER BY oid)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname<>'public_catalog';").stdout
 assert acl==sql("SELECT proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='public_catalog()'::regprocedure;").stdout
 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';pid='10000000-0000-4000-8000-000000000001';vid='20000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO auth.users(id,email) VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');INSERT INTO products(id,article,category,selling_price,catalog_visible) VALUES('{pid}','Real pair','Men / Sports & Active',1599,true);INSERT INTO product_variants(id,product_id,size,stock) VALUES('{vid}','{pid}','7',2);UPDATE store_settings SET catalog_enabled=true;")
 def word():return sql("SET ROLE anon;SELECT public_catalog()->'products'->0->>'spotlight_label';").stdout.strip()
 assert word()==''
 sql(f"SET ROLE authenticated;SET request.jwt.claim.sub='{owner}';UPDATE products SET catalog_spotlight_label='COMFORT' WHERE id='{pid}';")
 assert word()=='COMFORT'
 sql(f"SET ROLE authenticated;SET request.jwt.claim.sub='{staff}';UPDATE products SET catalog_spotlight_label='STOLEN' WHERE id='{pid}';")
 assert word()=='COMFORT'
 for invalid in ['two words','TOOLONGHEADING','<SCRIPT>','123START','']:
  result=sql(f"UPDATE products SET catalog_spotlight_label='{invalid}' WHERE id='{pid}';",False);assert result.returncode and 'products_spotlight_label_format' in result.stderr
 sql(f"UPDATE products SET catalog_visible=false WHERE id='{pid}';")
 assert sql("SET ROLE anon;SELECT jsonb_array_length(public_catalog()->'products');").stdout.strip()=='0'
 sql(f"UPDATE products SET catalog_visible=true WHERE id='{pid}';SET ROLE authenticated;SET request.jwt.claim.sub='{owner}';UPDATE products SET catalog_spotlight_label=null WHERE id='{pid}';")
 assert word()==''
 assert sql("SELECT (jsonb_populate_record(NULL::products,'{\"article\":\"Old backup\"}'::jsonb)).catalog_spotlight_label IS NULL;").stdout.strip()=='t'
 # Unexpected definitions must roll back a fresh column as well as the function change.
 sql("ALTER TABLE products DROP COLUMN catalog_spotlight_label;CREATE OR REPLACE FUNCTION public_catalog() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")
 assert sql(patch,False).returncode
 assert sql("SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='catalog_spotlight_label');").stdout.strip()=='t'
 print(json.dumps({'passed':True,'migrationsThrough':41,'repeatable':True,'ownerOnlyWrite':True,'publicVisibilityRetained':True,'invalidWordsRejected':True,'nullAutomatic':True,'olderBackupFieldNullable':True,'financialFunctionsAndACLUnchanged':True,'unexpectedDefinitionRollsBack':True,'liveDatabaseUsed':False}))
finally:run(['docker','stop',name])
