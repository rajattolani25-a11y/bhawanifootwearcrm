"""Real PostgreSQL/RLS audit on a disposable offline container. No app env/live DB."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1]
container='solestack-description-'+uuid.uuid4().hex[:8]

def run(args,sql=None):return subprocess.run(args,input=sql,text=True,capture_output=True)
def sql(value,ok=True):
 r=run(['docker','exec','-i',container,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],value)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r

def check(condition,message):
 sql("DO $$ BEGIN IF NOT ("+condition+") THEN RAISE EXCEPTION '"+message+"'; END IF; END $$;")

def as_role(role,who,statement,ok=True):
 return sql("SET ROLE "+role+"; SET request.jwt.claim.sub='"+who+"';"+statement,ok)

r=run(['docker','run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
if r.returncode:raise RuntimeError(r.stderr)
try:
 for _ in range(150):
  if sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('Disposable PostgreSQL startup timed out')
 sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE SCHEMA storage;GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz DEFAULT now(),deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;""")
 for path in sorted((root/'drizzle/migrations').glob('*.sql')):
  if path.name.startswith('0030_'):break
  sql(path.read_text())
 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';pending='00000000-0000-4000-8000-000000000003'
 product='10000000-0000-4000-8000-000000000001';variant='20000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test'),('{pending}','pending@example.test');")
 as_role('authenticated',owner,f"SELECT set_team_role('{staff}','staff');")
 as_role('authenticated',owner,f"""INSERT INTO products(id,article,brand,category,selling_price,mrp,catalog_visible,status)VALUES('{product}','Demo Pair','Demo','Gents',2200,2500,true,'Active');
 INSERT INTO product_variants(id,product_id,size,stock,barcode)VALUES('{variant}','{product}','7',4,'DESC7');
 INSERT INTO product_costs(product_id,purchase_price)VALUES('{product}',1400);
 UPDATE store_settings SET catalog_enabled=true,business_name='Demo Footwear',upi_id='demo@upi',booking_enabled=true,pickup_enabled=true,delivery_enabled=true,local_charge=35;
 SELECT create_sale(jsonb_build_object('total',2200,'taxable',2200,'paid_amount',2200,'payment_mode','Cash'),jsonb_build_array(jsonb_build_object('variant_id','{variant}','product_name','Demo Pair','size','7','qty',1,'price',2200)));""")
 original=json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())
 protected=['create_sale(jsonb,jsonb)','process_return(uuid,integer,boolean,text,text)','create_catalog_order(uuid,text,text,text,text,text,text)','reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)']
 definitions={}
 for signature in protected:
  # Read metadata only; these business functions are never run by applying 0030.
  definitions[signature]=sql("SELECT pg_get_functiondef('"+signature+"'::regprocedure);").stdout
 before=sql("SELECT jsonb_build_object('products',(SELECT count(*) FROM products),'sales',(SELECT count(*) FROM sales),'items',(SELECT count(*) FROM sale_items),'returns',(SELECT count(*) FROM sale_returns),'stock',(SELECT sum(stock) FROM product_variants),'bill_seq',(SELECT last_value FROM bill_seq));").stdout
 migration=(root/'drizzle/migrations/0030_catalog_product_description.sql').read_text()
 sql(migration);sql(migration)
 for signature,definition in definitions.items():assert sql("SELECT pg_get_functiondef('"+signature+"'::regprocedure);").stdout==definition,signature+' changed'
 assert sql("SELECT jsonb_build_object('products',(SELECT count(*) FROM products),'sales',(SELECT count(*) FROM sales),'items',(SELECT count(*) FROM sale_items),'returns',(SELECT count(*) FROM sale_returns),'stock',(SELECT sum(stock) FROM product_variants),'bill_seq',(SELECT last_value FROM bill_seq));").stdout==before
 check('NOT EXISTS(SELECT 1 FROM products WHERE catalog_description IS NOT NULL)','default must remain optional/null')
 after=json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())
 for row in after['products']:assert row.pop('description') is None
 assert after==original,'existing catalog output changed beyond description'
 as_role('authenticated',owner,f"UPDATE products SET catalog_description='  Soft upper. आरामदायक फिट.  ' WHERE id='{product}';")
 public=json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())
 assert public['products'][0]['description']=='Soft upper. आरामदायक फिट.'
 assert set(public['products'][0])==set(original['products'][0])|{'description'}
 for who in [staff,pending]:
  result=as_role('authenticated',who,f"UPDATE products SET catalog_description='NOT ALLOWED' WHERE id='{product}' RETURNING id;")
  assert not result.stdout.strip(),'non-owner changed description'
 check(f"(SELECT catalog_description='  Soft upper. आरामदायक फिट.  ' FROM products WHERE id='{product}')",'non-owner write changed row')
 denied=as_role('anon','',f"UPDATE products SET catalog_description='NOT ALLOWED' WHERE id='{product}';",False)
 assert denied.returncode!=0
 limit=as_role('authenticated',owner,f"UPDATE products SET catalog_description=repeat('x',1001) WHERE id='{product}';",False)
 assert limit.returncode!=0 and 'products_catalog_description_length' in limit.stderr
 as_role('authenticated',owner,f"UPDATE products SET catalog_description=repeat('x',1000) WHERE id='{product}';")
 check(f"(SELECT length(catalog_description)=1000 FROM products WHERE id='{product}')",'1000-char limit failed')
 for assignment in ["'  '","NULL"]:
  as_role('authenticated',owner,f"UPDATE products SET catalog_description={assignment} WHERE id='{product}';")
  assert json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())['products'][0]['description'] is None
 as_role('authenticated',owner,f"UPDATE products SET catalog_description='Public demo description' WHERE id='{product}';")
 backup=json.loads(as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout.strip())
 assert backup['tables']['products'][0]['catalog_description']=='Public demo description'
 check("(jsonb_populate_record(NULL::public.products,'{}'::jsonb)).catalog_description IS NULL",'old backup compatibility failed')
 for condition,reset in [('catalog_visible=false','catalog_visible=true'),("status='inactive'","status='Active'")]:
  as_role('authenticated',owner,f"UPDATE products SET {condition} WHERE id='{product}';")
  assert not json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())['products']
  as_role('authenticated',owner,f"UPDATE products SET {reset} WHERE id='{product}';")
 as_role('authenticated',owner,f"UPDATE product_variants SET stock=0 WHERE id='{variant}';")
 assert not json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())['products']
 as_role('authenticated',owner,'UPDATE store_settings SET catalog_enabled=false WHERE id=1;')
 assert json.loads(as_role('anon','',"SELECT public_catalog();").stdout.strip())=={'enabled':False}
 result={'result':'PASS','database':'Disposable PostgreSQL 17, real migrations and RLS','checks':['apply twice safely','nullable optional default','owner save/readback','staff/pending/anonymous writes denied','1000 characters accepted / 1001 rejected','blank and null hide','public payload only adds description','hidden/inactive/out-of-stock/catalog-OFF privacy unchanged','business/stock/counter records unchanged by migration','billing/return/order/reset definitions unchanged','v2 backup includes description / older rows default null'],'liveWrites':0}
 out=Path('/tmp/solestack-audit/catalog-description');out.mkdir(parents=True,exist_ok=True);(out/'db-checks.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 run(['docker','rm','-f',container])
