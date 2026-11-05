"""Real PostgreSQL/RLS audit on a disposable offline container. No app env/live DB."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1]
container='solestack-bargain-audit-'+uuid.uuid4().hex[:8]

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
  logs=run(['docker','logs',container]);
  if (logs.stdout+logs.stderr).count('database system is ready to accept connections')>=2 and sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('Disposable PostgreSQL startup timed out')
 sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE SCHEMA storage;GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz DEFAULT now(),deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;""")
 import sys
 split_sql='--split-sql' in sys.argv
 for path in sorted((root/'drizzle/migrations').glob('*.sql')):
  if not split_sql or path.name<'0035_':sql(path.read_text())
 if split_sql:
  for part in sorted((root/'docs/sql/operations-update-parts').glob('part-*.sql')):sql(part.read_text())
  assert sql((root/'docs/sql/operations-update-parts/verify.sql').read_text()).stdout.splitlines()[0]=='t'



 unchanged_sql="SELECT md5(string_agg(pg_get_functiondef(x::regprocedure),'|'ORDER BY x))FROM unnest(ARRAY['public.create_sale(jsonb,jsonb)','public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb)','public.complete_catalog_booking(uuid,jsonb,jsonb)','public.checked_sale_payload(jsonb,jsonb,numeric,numeric)'])x;"
 original_definitions=sql(unchanged_sql).stdout
 if '--cloud-reset-format'in sys.argv:sql((root/'tests/fixtures/reset-formatted-cloud.sql').read_text())
 reset_query="SELECT pg_get_functiondef('public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure);"
 original_reset=sql(reset_query).stdout
 if '--short-parts'in sys.argv:
  for part in sorted((root/'docs/sql/catalog-bargaining/short-parts').glob('part-*.sql')):sql(part.read_text())
 else:sql((root/'docs/sql/catalog-bargaining/support.sql').read_text())
 sql((root/'docs/sql/catalog-bargaining/paste-under-200-lines.sql').read_text()) # idempotent compact paste
 assert sql(unchanged_sql).stdout==original_definitions
 import re
 expected_reset=re.sub(r'TRUNCATE\s+TABLE\s+public[.]catalog_bookings\s*,','TRUNCATE TABLE public.catalog_bargain_sessions, public.catalog_bargain_policies, public.catalog_bookings,',original_reset,count=1,flags=re.I)
 assert sql(reset_query).stdout==expected_reset,'Reset checks or unrelated code were modified'
 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';p='10000000-0000-4000-8000-000000000001';v='20000000-0000-4000-8000-000000000001';v2='20000000-0000-4000-8000-000000000002';client=str(uuid.uuid4())
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');UPDATE store_settings SET catalog_enabled=true,booking_enabled=true,pickup_enabled=true,upi_id='demo@upi',business_phone='9999999999' WHERE id=1;INSERT INTO products(id,article,brand,category,selling_price,catalog_visible)VALUES('{p}','Audit Pair','Demo','Men / Other',2200,true);INSERT INTO product_variants(id,product_id,size,stock)VALUES('{v}','{p}','7',10),('{v2}','{p}','8',10);")
 def call(name,args,who=None,ok=True):
  params=','.join('_'+k+'=>'+('NULL'if x is None else "'"+json.dumps(x).replace("'","''")+"'::jsonb"if isinstance(x,(list,dict))else 'true'if x is True else 'false'if x is False else str(x)if isinstance(x,(int,float))else "'"+x.replace("'","''")+"'")for k,x in args.items())
  r=as_role('anon'if who is None else'authenticated',''if who is None else who,'SELECT to_jsonb('+name+'('+params+'));',ok)
  return (json.loads(r.stdout)if r.stdout.strip()else None)if ok else r
 def fail(name,args,who=None):
  r=call(name,args,who,False);assert r.returncode,(name,r.stdout);return r.stderr
 missing_policy=call('owner_catalog_bargain_policy',{'product_id':p},owner)
 print('Initial owner policy:',json.dumps(missing_policy))
 assert missing_policy['revision']is None
 policy={'enabled':True,'kind':'amount','min_discount':0,'max_discount':200,'rounding':5}
 saved=call('save_catalog_bargain_policy',{'product_id':p,'policy':policy,'expected_revision':None},owner)
 if '--cooldown' in sys.argv:
  ids=sql("SELECT string_agg(oid::text,',')FROM pg_proc WHERE pronamespace='public'::regnamespace;").stdout.strip()
  q="SELECT md5(string_agg(pg_get_functiondef(oid),'|'ORDER BY oid))FROM pg_proc WHERE oid IN("+ids+");"
  before=sql(q).stdout
  for _ in range(2):sql((root/'docs/sql/catalog-bargaining/cooldown-update/support.sql').read_text())
  assert sql(q).stdout==before
  assert sql((root/'docs/sql/catalog-bargaining/cooldown-update/verify.sql').read_text()).stdout.strip()=='t|t|t|t'
  c30=str(uuid.uuid4())
  def fresh_bid(value,again=False,who=c30,variant=v):return call('catalog_bargain_bid_v2',{'variant_id':variant,'client':who,'offer':value,'restart':again})
  def rejects_bid(value,again=False,who=c30,variant=v):return fail('catalog_bargain_bid_v2',{'variant_id':variant,'client':who,'offer':value,'restart':again})
  def state30(who=c30,variant=v):return call('catalog_bargain_state_v2',{'variant_id':variant,'client':who})
  def age_expiry(minutes,who=c30):sql("UPDATE catalog_bargain_sessions SET expires_at=clock_timestamp()-interval'"+str(minutes)+" minutes'WHERE client_hash=md5('"+who+"');")
  # Upgrade an existing old-RPC session without resetting its existing two-bid budget.
  initial=call('catalog_bargain_bid',{'variant_id':v,'client':c30,'offer':1850})
  assert state30()['attempts']==1
  age_expiry(1)
  second=fresh_bid(1900);assert second['attempts']==2 and second['id']!=initial['id']
  assert second['retry_at']is None and second['bid_limit']==4
  third=fresh_bid(1975);assert third['attempts']==3 and third['retry_at']is None
  second=fresh_bid(1990);assert second['attempts']==4
  from datetime import datetime
  assert abs((datetime.fromisoformat(second['retry_at'])-datetime.fromisoformat(second['expires_at'])).total_seconds()-1800)<.1
  assert rejects_bid(1920,True,variant=v2)
  assert state30(variant=v2)['attempts']==4
  age_expiry(1)
  assert rejects_bid(1920,True)
  after=state30();assert 28*60<(datetime.fromisoformat(after['retry_at'])-datetime.fromisoformat(after['server_now'])).total_seconds()<30*60
  age_expiry(31)
  expired=state30();same=fresh_bid(1990);assert same['duplicate']and same['id']==expired['id']
  assert state30()['id']==expired['id']
  from concurrent.futures import ThreadPoolExecutor
  with ThreadPoolExecutor(max_workers=2)as ex:twice=list(ex.map(lambda _:fresh_bid(1850,True),range(2)))
  assert twice[0]['id']==twice[1]['id']and twice[0]['attempts']==twice[1]['attempts']==1
  reopened=twice[0];old_quote=second
  # No daily cap: four more full rounds are allowed once each 30-minute cooldown ends.
  for _ in range(4):
   age_expiry(1);fresh_bid(1900);fresh_bid(1975);fresh_bid(1990);age_expiry(31)
   reopened=fresh_bid(1850,True);assert reopened['attempts']==1
   assert 2000<=reopened['price']<=2200 and reopened['price']%5==0
  assert 'max_discount'not in reopened
  def order_args(deal):
   pct=float(sql('SELECT advance_percent FROM store_settings WHERE id=1;').stdout.strip())
   return {'variant_id':v,'name':'Demo cooldown','mobile':'8888888888','fulfillment':'pickup','address':'','area':'','coupon':'','request_id':str(uuid.uuid4()),'quote':{'price':2200,'net':deal['price'],'charge':0,'advance':__import__('math').ceil(deal['price']*pct/100)},'deal_id':deal['id'],'client':c30}
  assert fail('create_catalog_bargain_order',order_args(old_quote))
  request30=order_args(reopened);placed30=call('create_catalog_bargain_order',request30)
  assert placed30['price']==reopened['price']
  age_expiry(31)
  linked=state30();assert linked['order_placed']and linked['retry_at']is None
  assert rejects_bid(1900,True)
  assert call('create_catalog_bargain_order',request30)==placed30
  id30=sql("SELECT id FROM catalog_bookings WHERE booking_no='"+placed30['booking_no']+"';").stdout.strip()
  call('cancel_catalog_booking',{'id':id30,'note':'Synthetic cooldown audit'},owner)
  accepted_client=str(uuid.uuid4());accepted=fresh_bid(2075,who=accepted_client)
  assert accepted['state']=='accepted'and accepted['attempts']==1
  assert rejects_bid(2080,True,who=accepted_client)
  age_expiry(31,accepted_client)
  assert fresh_bid(1850,True,who=accepted_client)['attempts']==1
  assert as_role('anon','',"SELECT * FROM catalog_bargain_sessions;",False).returncode
  print(json.dumps({'cooldown':'pass','checks':['all original RPC definitions byte-unchanged','old session budget retained','unused second bid survives first quote expiry','30 minutes after final quote expiry','size switch and read cannot restart','concurrent explicit restart idempotency','more than three rounds allowed: no daily cap','old quote rejected and saved order retry unchanged','linked order cannot restart','accepted-first quote cooldown','no new tables or columns; guarded attempts limit widened to four']}))
 assert call('catalog_bargain_enabled',{})==[p]
 assert fail('save_catalog_bargain_policy',{'product_id':p,'policy':policy,'expected_revision':saved['revision']},staff)
 assert as_role('anon','',"SELECT * FROM catalog_bargain_sessions;",False).returncode
 assert as_role('authenticated',staff,"SELECT * FROM catalog_bargain_policies;").stdout==''
 from concurrent.futures import ThreadPoolExecutor
 concurrent_client=str(uuid.uuid4())
 with ThreadPoolExecutor(max_workers=2)as ex:
  concurrent=list(ex.map(lambda _:call('catalog_bargain_bid',{'variant_id':v,'client':concurrent_client,'offer':1850}),range(2)))
 assert concurrent[0]['id']==concurrent[1]['id']and concurrent[0]['attempts']==concurrent[1]['attempts']==1
 a=call('catalog_bargain_bid',{'variant_id':v,'client':client,'offer':1900})
 assert 2000<=a['price']<=2200 and a['price']%5==0 and a['attempts']==1
 assert 179 < ( __import__('datetime').datetime.fromisoformat(a['expires_at'])-__import__('datetime').datetime.fromisoformat(a['server_now'])).total_seconds()<=180
 repeat=call('catalog_bargain_bid',{'variant_id':v,'client':client,'offer':1900})
 assert repeat['duplicate'] and repeat['expires_at']==a['expires_at']and repeat['id']==a['id']and repeat['attempts']==1
 b=call('catalog_bargain_bid',{'variant_id':v,'client':client,'offer':1975})
 assert b['price']<=a['price']and b['price']>2000 and b['attempts']==2 and b['state']in('closer','held')
 assert fail('catalog_bargain_bid',{'variant_id':v,'client':client,'offer':1980})
 assert call('catalog_bargain_state',{'variant_id':v2,'client':client})['attempts']==2
 assert sql(f"SELECT stock FROM product_variants WHERE id='{v}';").stdout.strip()=='10'
 args={'variant_id':v,'name':'Demo buyer','mobile':'9999999999','fulfillment':'pickup','address':'','area':'','coupon':'','request_id':str(uuid.uuid4()),'quote':{'price':2200,'net':b['price'],'charge':0,'advance':__import__('math').ceil(b['price']*.2)},'deal_id':b['id'],'client':client}
 # Read the actual advance percent instead of assuming store defaults.
 percent=float(sql("SELECT advance_percent FROM store_settings WHERE id=1;").stdout.strip());args['quote']['advance']=__import__('math').ceil(b['price']*percent/100)
 assert fail('create_catalog_bargain_order',dict(args,quote=dict(args['quote'],net=1)))
 assert fail('create_catalog_bargain_order',dict(args,coupon='FAKE'))
 assert fail('create_catalog_bargain_order',dict(args,variant_id=v2))
 order=call('create_catalog_bargain_order',args)
 assert order['price']==b['price'] and sql(f"SELECT stock FROM product_variants WHERE id='{v}';").stdout.strip()=='9'
 sql("UPDATE catalog_bargain_sessions SET expires_at=now()-interval'1 hour' WHERE id IS NOT NULL;")
 assert call('create_catalog_bargain_order',args)==order # expired quote cannot break committed retry
 assert fail('create_catalog_bargain_order',dict(args,request_id=str(uuid.uuid4())))
 client2=str(uuid.uuid4());c=call('catalog_bargain_bid',{'variant_id':v,'client':client2,'offer':2075});assert c['price']==2075 and c['state']=='accepted'
 # Owner rule changes invalidate old unplaced quotes without changing placed orders.
 policy['max_discount']=250;call('save_catalog_bargain_policy',{'product_id':p,'policy':policy,'expected_revision':saved['revision']},owner)
 assert call('catalog_bargain_state',{'variant_id':v,'client':client2})is None
 assert call('create_catalog_bargain_order',args)==order
 # Verify full backup manifest and reset integration only on this disposable fixture.
 snap=call('store_backup_snapshot_v2',{},owner);payload=snap['snapshot']if 'snapshot'in snap else snap
 assert 'catalog_bargain_policies'in snap['tables'] and 'catalog_bargain_sessions'in snap['tables']
 # A discounted online order completes through the unchanged receipt + create_sale path.
 booking_id=sql("SELECT id FROM catalog_bookings WHERE booking_no='"+order['booking_no']+"';").stdout.strip()
 call('confirm_catalog_booking',{'id':booking_id},owner)
 bill={'total':order['price'],'subtotal':order['price'],'paid_amount':order['price'],'due_amount':0,'discount':0,'payment_mode':'UPI','bill_type':'simple','tax_mode':'inclusive','gst_rate':0,'give_stamp':False}
 items=[{'variant_id':v,'size':'7','qty':1,'price':order['price'],'product_name':'Demo Audit Pair'}]
 invoice=call('complete_catalog_booking',{'id':booking_id,'sale':bill,'items':items},owner)
 assert invoice['bill_no'] and sql(f"SELECT stock FROM product_variants WHERE id='{v}';").stdout.strip()=='9'
 assert call('complete_catalog_booking',{'id':booking_id,'sale':bill,'items':items},owner)==invoice
 snap=call('store_backup_snapshot_v2',{},owner)
 call('reset_store_data_v2',{'confirmation':'RESET','fingerprint':snap['fingerprint'],'restart_numbers':True},owner)
 assert sql("SELECT(SELECT count(*)FROM catalog_bargain_policies)+(SELECT count(*)FROM catalog_bargain_sessions)+(SELECT count(*)FROM products);").stdout.strip()=='0'
 call('restore_store_backup_v2',{'confirmation':'RESTORE','snapshot':snap},owner)
 assert sql("SELECT count(*)FROM catalog_bargain_policies;").stdout.strip()=='1'
 assert call('catalog_bargain_state',{'variant_id':v,'client':client2})is None
 # Old v2 backups omit the two optional tables; restore still accepts their exact old manifest.
 old=json.loads(json.dumps(snap));del old['tables']['catalog_bargain_policies'];del old['tables']['catalog_bargain_sessions']
 current=call('store_backup_snapshot_v2',{},owner)
 call('reset_store_data_v2',{'confirmation':'RESET','fingerprint':current['fingerprint']},owner)
 call('restore_store_backup_v2',{'confirmation':'RESTORE','snapshot':old},owner)
 assert sql("SELECT count(*)FROM products;").stdout.strip()=='1'
 assert sql("SELECT count(*)FROM catalog_bargain_policies;").stdout.strip()=='0' 
 assert 'catalog_bargain_sessions'in sql("SELECT maintenance_business_tables();").stdout
 assert 'public.catalog_bargain_sessions'in sql("SELECT pg_get_functiondef('reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)'::regprocedure);").stdout
 print(json.dumps({'pass':True,'checks':['only the TRUNCATE allowlist insertion changes in reset; all owner and backup guards byte-preserved','original billing and order definitions unchanged','concurrent duplicate bids serialize to one attempt','owner-only policy / hidden limits','idempotent installation','two bids and duplicate replay','rounded bounded variable counter','180-second server expiry','size switch keeps attempt count','no stock hold during bids','coupon/price/variant forgery blocked','order stock decremented once','expired quote committed-order recovery','owner policy invalidation','maintenance manifest integration','discounted receipt and invoice completion unchanged','reset reclaims new tables and keeps owner','new backup restore and old v2 compatibility']}))
finally:
 run(['docker','rm','-f',container])
