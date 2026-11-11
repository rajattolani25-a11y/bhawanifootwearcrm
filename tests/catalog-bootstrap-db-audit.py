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
  if p.name.startswith('0042_'):continue
  sql(p.read_text())
 before=sql("SELECT md5(string_agg(pg_get_functiondef(oid),'' ORDER BY oid)) FROM pg_proc WHERE pronamespace='public'::regnamespace;").stdout
 patch=(root/'drizzle/migrations/0042_public_catalog_bootstrap.sql').read_text();assert sql(patch).stdout.strip().endswith('t');assert sql(patch).stdout.strip().endswith('t')
 assert before==sql("SELECT md5(string_agg(pg_get_functiondef(oid),'' ORDER BY oid)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname<>'public_catalog_bootstrap';").stdout
 owner='00000000-0000-4000-8000-000000000001';pid='10000000-0000-4000-8000-000000000001';vid='20000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO auth.users(id,email) VALUES('{owner}','owner@example.test');SET request.jwt.claim.sub='{owner}';INSERT INTO products(id,article,category,selling_price,catalog_visible,catalog_spotlight_label) VALUES('{pid}','Real pair','Men / Sports & Active',1599,true,'COMFORT');INSERT INTO product_variants(id,product_id,size,stock) VALUES('{vid}','{pid}','7',2);UPDATE store_settings SET catalog_enabled=true;UPDATE catalog_presentation_settings SET theme='ivory',motion_enabled=false;")
 def read():return json.loads(sql("SET ROLE anon;SELECT public_catalog_bootstrap();").stdout.strip())
 value=read();assert value['catalog']['products'][0]['spotlight_label']=='COMFORT';assert value['presentation']['theme']=='ivory';assert value['presentation']['motion_enabled']==False;assert value['cart_version']==0;assert value['bargain_ids']==[]
 assert set(value['presentation'])=={'gallery_enabled','category_accents','motion_enabled','theme'}
 assert 'stock' not in value['catalog']['products'][0] and 'purchase_price' not in value['catalog']['products'][0]
 sql(f"UPDATE products SET selling_price=1499,catalog_spotlight_label='DAILY' WHERE id='{pid}';UPDATE product_variants SET stock=0 WHERE id='{vid}';")
 assert read()['catalog']['products']==[]
 sql(f"UPDATE product_variants SET stock=3 WHERE id='{vid}';")
 value=read();assert value['catalog']['products'][0]['price']==1499;assert value['catalog']['products'][0]['spotlight_label']=='DAILY'
 sql("CREATE OR REPLACE FUNCTION public.public_catalog_hero() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Optional hero unavailable'; END $$;")
 value=read();assert value['hero_unavailable']==True;assert value['catalog']['enabled']==True
 sql("UPDATE store_settings SET catalog_enabled=false;")
 value=read();assert value=={'version':1,'catalog':{'enabled':False}}
 sql("CREATE OR REPLACE FUNCTION public.public_catalog() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Primary read failed'; END $$;")
 result=sql("SET ROLE anon;SELECT public_catalog_bootstrap();",False);assert result.returncode and 'Primary read failed' in result.stderr
 print(json.dumps({'passed':True,'migrationsThrough':42,'repeatable':True,'allExistingFunctionsUnchanged':True,'anonymousGateRetained':True,'freshPriceStockAndHeading':True,'onlyWhitelistedPresentationFields':True,'optionalFailuresIsolated':True,'primaryFailuresBubble':True,'missingCartAndBargainSafe':True,'liveDatabaseUsed':False}))
finally:run(['docker','stop',name])
