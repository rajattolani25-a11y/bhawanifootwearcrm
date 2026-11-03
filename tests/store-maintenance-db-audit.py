"""Runs checked-in migrations on disposable PostgreSQL; NEVER uses app env/DB."""
from pathlib import Path
import subprocess, time, json, uuid, os, re
root=Path(__file__).resolve().parents[1]
name='solestack-maintenance-'+uuid.uuid4().hex[:8]
guard_binary=os.environ.get('SAFEUPDATE_EXTENSION_PATH')
def run(args,sql=None): return subprocess.run(args,input=sql,text=True,capture_output=True)
def sql(s,ok=True):
 if guard_binary and re.search(r'SELECT\s+(?:public\.)?(?:reset_store_data_v2|restore_store_backup_v2)\s*\(',s,re.I):s="LOAD 'safeupdate';"+s
 r=run(['docker','exec','-i',name,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],s)
 if ok and r.returncode: raise RuntimeError(r.stderr)
 return r
r=run(['docker','run','--rm','-d','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
if r.returncode: raise RuntimeError(r.stderr)
try:
 for i in range(150):
  logs=run(['docker','logs',name]);
  if (logs.stdout+logs.stderr).count('database system is ready to accept connections')>=2 and sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('Postgres startup timed out')
 if guard_binary:
  copied=run(['docker','cp',guard_binary,name+':/usr/local/lib/postgresql/safeupdate.so'])
  if copied.returncode:raise RuntimeError(copied.stderr)
  sql("LOAD 'safeupdate'; SELECT current_setting('safeupdate.enabled');")
 sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA storage; GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz DEFAULT now(), deleted_at timestamptz, banned_until timestamptz, raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;
 """)
 for migration in sorted((root/'drizzle/migrations').glob('*.sql')):
  # Public gallery has no dependency on optional maintenance support (0025).
  if migration.name.startswith('0025_'):sql((root/'drizzle/migrations/0027_catalog_product_photos.sql').read_text())
  if guard_binary and migration.name.startswith("0028_"):continue
  sql(migration.read_text())
 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';pending='00000000-0000-4000-8000-000000000003';new='00000000-0000-4000-8000-000000000004'
 ctx=f"SET request.jwt.claim.sub='{owner}';"
 def check(condition,message):sql(f"DO $$ BEGIN IF NOT ({condition}) THEN RAISE EXCEPTION '{message}'; END IF; END $$;")
 def fail(s,contains):
  r=sql(s,False);assert r.returncode and contains in r.stderr,(contains,r.stdout,r.stderr)
 sql(f"INSERT INTO auth.users(id,email) VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test'),('{pending}','pending@example.test');")
 check(f"(SELECT role='owner' FROM user_roles WHERE user_id='{owner}') AND (SELECT count(*)=1 FROM user_roles)",'first signup owner; later pending')
 sql(ctx+f"SELECT set_team_role('{staff}','staff');")
 for who in [staff,pending]:
  fail(f"SET ROLE authenticated; SET request.jwt.claim.sub='{who}';SELECT reset_store_data_v2('RESET','x');",'Owner access required')
  fail(f"SET ROLE authenticated; SET request.jwt.claim.sub='{who}';SELECT store_backup_snapshot_v2();",'Owner access required')
 fail("SET ROLE anon; SELECT store_backup_snapshot_v2();",'permission denied')
 fail(ctx+"SELECT reset_store_data('RESET');",'verified backup/reset flow')
 # Seed genuine linked business records; no stubs for app tables/functions/role guards.
 p='10000000-0000-4000-8000-000000000001';v='20000000-0000-4000-8000-000000000001';c='30000000-0000-4000-8000-000000000001'
 sql(ctx+f"""INSERT INTO products(id,article,selling_price,image_url) VALUES('{p}','Demo Article',999,'products/demo.webp');
 INSERT INTO product_costs VALUES('{p}',500);
 INSERT INTO product_variants(id,product_id,size,stock,barcode) VALUES('{v}','{p}','7',10,'DEMO-7');
 INSERT INTO customers(id,name,mobile) VALUES('{c}','Demo','0000000000');
 UPDATE store_settings SET business_name='Keep Shop',business_phone='0000000000',upi_id='demo@upi',bill_design='A4',daily_target=12345,delivery_enabled=true,local_charge=75,advance_percent=30,offer_enabled=true,offer_title='Old offer',offer_coupon='DEMO';
 UPDATE catalog_hero_settings SET enabled=true,image_path='hero/10000000-0000-4000-8000-000000000001.webp',product_id='{p}';
 UPDATE catalog_presentation_settings SET theme='midnight',motion_enabled=false;
 INSERT INTO storage.objects(bucket_id,name) VALUES('product-images','products/demo.webp'),('catalog-hero-images','hero/10000000-0000-4000-8000-000000000001.webp');
 SELECT create_sale(jsonb_build_object('customer_id','{c}','payment_mode','Cash','paid_amount',999,'total',999),jsonb_build_array(jsonb_build_object('variant_id','{v}','qty',1,'price',999,'size','7')));
 INSERT INTO catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,expires_at,sale_id) SELECT 'BK-DEMO','{v}','Demo Article','7','Demo','0000000000',999,100,now()+interval '1 day',id FROM sales LIMIT 1;
 """)
 # Product gallery access and deletion use the real schema and RLS, not backend stubs.
 sql(ctx+f"UPDATE products SET catalog_visible=true WHERE id='{p}';UPDATE store_settings SET catalog_enabled=true; INSERT INTO storage.objects(bucket_id,name) VALUES('product-images','{p}/side.webp'),('product-images','{p}/sole.webp');")
 check(f"public_catalog_photos('{p}')=ARRAY['products/demo.webp','{p}/side.webp','{p}/sole.webp']",'gallery cover/order mismatch')
 gallery_snapshot=json.loads(sql(ctx+"SELECT store_backup_snapshot_v2();").stdout.strip())
 assert any(asset['bucket']=='product-images' and asset['path']==f'{p}/side.webp' for asset in gallery_snapshot['assets']),'gallery photos missing from backup manifest'

 sql("SET ROLE anon;"+f"SELECT public_catalog_photos('{p}');")
 sql(ctx+f"INSERT INTO storage.objects(bucket_id,name) SELECT 'product-images','{p}/extra-'||n||'.webp' FROM generate_series(1,10) n;")
 check(f"cardinality(public_catalog_photos('{p}'))=8 AND (public_catalog_photos('{p}'))[1]='products/demo.webp'",'gallery did not cap at 8 or lost cover')
 sql(f"DELETE FROM storage.objects WHERE name LIKE '{p}/extra-%';")

 check(f"is_catalog_image('{p}/sole.webp') AND NOT is_catalog_image('{p}/nested/private.webp') AND NOT is_catalog_image('unknown/sole.webp')",'gallery photo scope incorrect')
 sql(ctx+f"UPDATE products SET catalog_visible=false WHERE id='{p}';")
 check(f"cardinality(public_catalog_photos('{p}'))=0 AND NOT is_catalog_image('{p}/sole.webp')",'hidden product exposed gallery')
 sql(ctx+f"UPDATE products SET catalog_visible=true,status='inactive' WHERE id='{p}';")
 check(f"cardinality(public_catalog_photos('{p}'))=0 AND NOT is_catalog_image('{p}/sole.webp')",'archived product exposed gallery')
 sql(ctx+f"UPDATE products SET catalog_visible=false,status='Active' WHERE id='{p}';UPDATE store_settings SET catalog_enabled=false;DELETE FROM storage.objects WHERE name LIKE '{p}/%';")
 fail("SET ROLE authenticated;"+ctx+f"DELETE FROM products WHERE id='{p}';",'foreign key constraint')
 check(f"EXISTS(SELECT 1 FROM products WHERE id='{p}') AND EXISTS(SELECT 1 FROM product_variants WHERE id='{v}') AND EXISTS(SELECT 1 FROM sales)",'failed product deletion changed history')
 sql(f"SET ROLE authenticated;SET request.jwt.claim.sub='{staff}';DELETE FROM products WHERE id='{p}';")
 check(f"EXISTS(SELECT 1 FROM products WHERE id='{p}')",'staff deleted a product')
 # Populate every business table, not just sales/inventory, for an exact full round trip.
 sql(ctx+f"""INSERT INTO suppliers(name,opening_balance) VALUES('Demo Supplier',250);
 INSERT INTO purchases(supplier_id,variant_id,quantity,purchase_price,total,paid_amount) SELECT id,'{v}',2,500,1000,0 FROM suppliers;
 SELECT record_supplier_payment(id,100,'Cash') FROM suppliers;
 INSERT INTO expenses(amount,note) VALUES(50,'Demo expense');
 INSERT INTO sale_returns(sale_id,sale_item_id,variant_id,qty,refund) SELECT sale_id,id,variant_id,1,100 FROM sale_items;
 INSERT INTO credit_payments(sale_id,customer_id,amount) SELECT id,'{c}',10 FROM sales;
 INSERT INTO loyalty_rewards(customer_id,card,milestone,amount,used_sale_id) SELECT '{c}','regular',5,50,id FROM sales;
 INSERT INTO loyalty_events(reward_id,customer_id,action,sale_id) SELECT id,'{c}','demo',used_sale_id FROM loyalty_rewards;
 INSERT INTO coupons(code,value,customer_id) VALUES('DEMO',10,'{c}');
 INSERT INTO coupon_redemptions(coupon_id,sale_id,customer_id,amount) SELECT co.id,sa.id,'{c}',10 FROM coupons co CROSS JOIN sales sa;
 INSERT INTO catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,expires_at) VALUES('BK-UNBILLED','{v}','Demo Article','7','Demo','0000000000',999,100,now()+interval '1 day');
 UPDATE customers SET opening_balance=500 WHERE id='{c}';
 """)
 # Storage RLS rejects deleting a photo used by an existing product.
 sql("SET ROLE authenticated;"+ctx+"DELETE FROM storage.objects WHERE bucket_id='product-images';")
 check("EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='product-images')",'referenced photo could be removed')
 if guard_binary:
  before=json.loads(sql(ctx+"SELECT store_backup_snapshot_v2();").stdout.strip())
  privileges=sql("SELECT proowner::text,proacl::text,prosecdef,proconfig::text FROM pg_proc WHERE oid='public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure;").stdout
  fail(ctx+f"SELECT reset_store_data_v2('RESET','{before['fingerprint']}',true,false,true,false);",'DELETE requires a WHERE clause')
  assert json.loads(sql(ctx+"SELECT store_backup_snapshot_v2();").stdout.strip())==before,'guard failure did not roll back business/settings/team/assets'
  check('(SELECT count(*)=0 FROM store_file_cleanup)','guard failure left cleanup work')
  # Lovable may format the installed function body; harmless whitespace must still patch.
  old_definition=sql("SELECT pg_get_functiondef('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure);").stdout
  sql(old_definition.replace("EXECUTE format('DELETE FROM public.%I',t);", "EXECUTE\n    format( 'DELETE FROM public.%I', t );"))
  patch=(root/'drizzle/migrations/0028_reset_where_compatibility.sql').read_text()
  sql(patch);sql(patch)
  assert sql("SELECT proowner::text,proacl::text,prosecdef,proconfig::text FROM pg_proc WHERE oid='public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure;").stdout==privileges,'patch changed ownership/grants/security'
  assert json.loads(sql(ctx+"SELECT store_backup_snapshot_v2();").stdout.strip())==before,'applying patch mutated business data'
 snap=json.loads(sql(ctx+"SELECT store_backup_snapshot_v2();").stdout.strip());fp=snap['fingerprint'];assert all(snap['tables'][t] for t in snap['tables']), 'fixture must exercise every backed-up table';snapshot=json.dumps(snap).replace("'","''")
 fail(ctx+"SELECT reset_store_data_v2('RESET','stale');",'Store changed since backup')
 check('(SELECT count(*)=2 FROM catalog_bookings)','stale backup changed data')
 # Force error after deletion starts: everything including file queue/generation rolls back.
 sql("CREATE FUNCTION force_reset_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced rollback'; END $$; CREATE TRIGGER reset_failure BEFORE UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION force_reset_failure();")
 fail(ctx+f"SELECT reset_store_data_v2('RESET','{fp}');",'forced rollback')
 check('(SELECT count(*)=1 FROM products) AND (SELECT count(*)=1 FROM sales) AND (SELECT count(*)=2 FROM catalog_bookings) AND (SELECT count(*)=0 FROM store_file_cleanup)','failed reset not atomic')
 sql('DROP TRIGGER reset_failure ON store_settings;')
 result=json.loads(sql("SET ROLE authenticated;"+ctx+f"SELECT reset_store_data_v2('RESET','{fp}',true,false,false,false);").stdout.strip())
 check("(SELECT count(*)=0 FROM products) AND (SELECT count(*)=0 FROM sales) AND (SELECT count(*)=0 FROM catalog_bookings)",'business deletion incomplete')
 check(f"(SELECT count(*)=1 FROM user_roles) AND (SELECT role='owner' FROM user_roles WHERE user_id='{owner}') AND (SELECT count(*)=3 FROM auth.users)",'owner/auth preservation failed')
 check("(SELECT business_name='Keep Shop' AND daily_target=15000 AND bill_design='Thermal' AND upi_id='demo@upi' FROM store_settings) AND (SELECT NOT enabled AND image_path IS NULL FROM catalog_hero_settings) AND (SELECT theme='studio' AND motion_enabled FROM catalog_presentation_settings)",'defaults or identity incorrect')
 check('(SELECT count(*)=2 FROM store_file_cleanup) AND (SELECT count(*)=2 FROM storage.objects)','SQL must queue files without deleting storage metadata')
 sql(ctx+"SELECT ack_store_file_cleanup('product-images',ARRAY['products/demo.webp']);")
 check('(SELECT count(*)=2 FROM store_file_cleanup)','cleanup falsely acknowledged existing file')
 # Mock ONLY storage service's confirmed removal; its real API is tested separately in browser fixtures.
 sql("DELETE FROM storage.objects;"+ctx+"SELECT ack_store_file_cleanup('product-images',ARRAY['products/demo.webp']);SELECT ack_store_file_cleanup('catalog-hero-images',ARRAY['hero/10000000-0000-4000-8000-000000000001.webp']);")
 check('(SELECT count(*)=0 FROM store_file_cleanup)','cleanup ack did not finish')
 sql(ctx+f"SELECT stage_store_restore_files('{json.dumps(snap['assets'])}'::jsonb);")
 check('(SELECT count(*)=2 FROM store_file_cleanup)','restore uploads not durably staged')
 fail(ctx+f"SELECT restore_store_backup_v2('RESTORE','{snapshot}');",'Restore photos before database rows')
 sql("INSERT INTO storage.objects(bucket_id,name) VALUES('product-images','products/demo.webp'),('catalog-hero-images','hero/10000000-0000-4000-8000-000000000001.webp');")
 broken=json.loads(json.dumps(snap));broken['tables']['sale_items'][0]['variant_id']='99999999-0000-4000-8000-000000000000'
 broken_sql=json.dumps(broken).replace("'","''")
 fail(ctx+f"SELECT restore_store_backup_v2('RESTORE','{broken_sql}');",'foreign key constraint')
 check('(SELECT count(*)=0 FROM products) AND (SELECT count(*)=0 FROM sales)','failed restore not atomic')
 sql("SET ROLE authenticated;"+ctx+f"SELECT restore_store_backup_v2('RESTORE','{snapshot}');")
 actual=json.loads(sql(ctx+'SELECT store_backup_snapshot_v2();').stdout.strip())
 assert actual['tables']==snap['tables'],'round trip changed rows/settings/costs/history'
 check('(SELECT count(*)=0 FROM store_file_cleanup)','successful restore left staged file cleanup')
 fail(ctx+f"SELECT restore_store_backup_v2('RESTORE','{snapshot}');",'empty store')
 # Reset with explicit design preservation; product pointer is cleared, hero file excluded.
 fp=actual['fingerprint'];sql(ctx+f"SELECT reset_store_data_v2('RESET','{fp}',false,true,true);")
 check("(SELECT theme='midnight' FROM catalog_presentation_settings) AND (SELECT enabled AND product_id IS NULL FROM catalog_hero_settings) AND (SELECT count(*)=1 FROM store_file_cleanup)",'preserve hero/theme or photo exclusion failed')
 check("(SELECT business_name='BHAWANI FOOTWEAR' FROM store_settings) AND (SELECT last_value=1 AND NOT is_called FROM bill_seq)",'reset identity/counter option failed')
 check("(SELECT bill_design='A4' AND daily_target=12345 AND delivery_enabled AND local_charge=75 AND advance_percent=30 AND NOT offer_enabled AND offer_title IS NULL AND offer_coupon IS NULL FROM store_settings)",'necessary operations not preserved or stale offers retained')
 sql(f"INSERT INTO auth.users(id,email) VALUES('{new}','new-owner@example.test');")
 check(f"NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id='{new}')",'reset opened first-owner takeover')
 fail(ctx+"SELECT transfer_store_ownership('missing@example.test','TRANSFER');",'verify a different email')
 sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{new}';")
 fail(ctx+"SELECT transfer_store_ownership('new-owner@example.test','TRANSFER');",'verify a different email')
 sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{new}';")
 sql(ctx+"SELECT transfer_store_ownership('new-owner@example.test','TRANSFER');")
 check(f"(SELECT count(*)=1 FROM user_roles) AND (SELECT role='owner' FROM user_roles WHERE user_id='{new}')",'ownership transfer failed')
 fail(ctx+"SELECT store_backup_snapshot_v2();",'Owner access required')
 fail(f"SET request.jwt.claim.sub='{new}';SELECT remove_team_access('{new}');",'At least one owner must remain')
 # A role-management call queued before handover cannot run with stale owner authority.
 for action in [f"set_team_role('{pending}','owner')",f"remove_team_access('{pending}')"]:
  sql(f"DELETE FROM user_roles;INSERT INTO user_roles(user_id,role) VALUES('{new}','owner'),('{pending}','staff');")
  cmd=['docker','exec','-i',name,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt']
  holder=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  holder.stdin.write(f"BEGIN;SELECT pg_advisory_xact_lock(452198,1);DELETE FROM user_roles WHERE user_id='{new}';INSERT INTO user_roles(user_id,role) VALUES('{owner}','owner');\n\\echo LOCK_READY\n")
  holder.stdin.flush()
  while holder.stdout.readline().strip()!='LOCK_READY':
   if holder.poll() is not None:raise RuntimeError('Lock holder failed')
  queued=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  queued.stdin.write(f"SET ROLE authenticated;SET request.jwt.claim.sub='{new}';SELECT {action};\n")
  queued.stdin.close()
  for _ in range(100):
   if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND lower(wait_event)='advisory';").stdout.strip()!='0':break
   time.sleep(.02)
  else:raise RuntimeError('Role request did not queue on ownership lock')
  holder.stdin.write("COMMIT;\n\\q\n");holder.stdin.close();holder.wait(timeout=5)
  queued.wait(timeout=5);err=queued.stderr.read()
  assert queued.returncode and 'Owner access required' in err,err
  check(f"EXISTS(SELECT 1 FROM user_roles WHERE user_id='{pending}' AND role='staff')",'queued old owner modified team after handover')
 print(json.dumps({'scope':'Disposable PostgreSQL17, all checked-in migrations; real app schema, auth trigger and role guards; Storage service metadata fixture only. No live backend connection.','checks':['first signup owner / subsequent pending','staff, pending and anon blocked','old reset disabled','gallery: visible-only/cover-first; hidden and archived denied; staff delete denied; billed delete rolls back','stale backup rejected','failed reset atomic','catalog orders cleared before sales/variants','owner preserved, other access revoked, Auth retained','identity/defaults and operational preference preservation; stale offers cleared','storage queue and verified acknowledgements','restore staging','missing photo blocked','corrupt restore rolls back with FK checks','exact full table restore including cost/history','nonempty restore blocked','hero/theme and numbering options','reset never opens public owner signup','atomic verified-email handover','last owner protection','queued role calls recheck ownership after handover'],'safeupdateGuard':bool(guard_binary),'guardRegression':'original 0025 fails/rolls back; 0028 applies twice without data/grant changes; reset and restore remain guarded' if guard_binary else 'not loaded','result':'PASS'},indent=2))
finally:run(['docker','rm','-f',name])
