"""Real PostgreSQL/RLS audit on a disposable offline container. No app env/live DB."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1]
container='solestack-cart-audit-'+uuid.uuid4().hex[:8]

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



 sql((root/'docs/sql/catalog-bargaining/support.sql').read_text())
 original=sql("SELECT md5(string_agg(pg_get_functiondef(p.oid),'|'ORDER BY p.oid))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';").stdout
 existing=sql("SELECT string_agg(p.oid::text,',')FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';").stdout.strip()
 original=sql("SELECT md5(string_agg(pg_get_functiondef(p.oid),'|'ORDER BY p.oid))FROM pg_proc p WHERE p.oid IN("+existing+");").stdout
 if '--short-parts' in sys.argv:
  for _ in range(2):
   for part in sorted((root/'docs/sql/catalog-cart/short-parts').glob('part-*.sql')):sql(part.read_text())
 else:
  sql((root/'docs/sql/catalog-cart/support.sql').read_text())
  sql((root/'docs/sql/catalog-cart/support.sql').read_text())
 assert sql((root/'docs/sql/catalog-cart/verify.sql').read_text()).stdout.strip()=='t|t|t|t|t|t'
 assert sql("SELECT md5(string_agg(pg_get_functiondef(p.oid),'|'ORDER BY p.oid))FROM pg_proc p WHERE p.oid IN("+existing+");").stdout==original
 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002'
 ps=['10000000-0000-4000-8000-'+str(i).zfill(12)for i in range(1,5)];vs=['20000000-0000-4000-8000-'+str(i).zfill(12)for i in range(1,4)]
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');UPDATE store_settings SET catalog_enabled=true,booking_enabled=true,pickup_enabled=true,delivery_enabled=true,local_charge=90,free_delivery_above=5000,advance_percent=20,upi_id='demo@upi',business_phone='9999999999' WHERE id=1;")
 for p,v,price in zip(ps,vs,[2200,800,333]):sql(f"INSERT INTO products(id,article,brand,category,selling_price,catalog_visible)VALUES('{p}','Cart Pair','DEMO','Men / Other',{price},true);INSERT INTO product_variants(id,product_id,size,stock)VALUES('{v}','{p}','7',30);")
 def call(name,args,who=None,ok=True):
  params=','.join('_'+k+'=>'+('NULL'if x is None else "'"+json.dumps(x).replace("'","''")+"'::jsonb"if isinstance(x,(list,dict))else 'true'if x is True else 'false'if x is False else str(x)if isinstance(x,(int,float))else "'"+x.replace("'","''")+"'")for k,x in args.items())
  r=as_role('anon'if who is None else'authenticated',''if who is None else who,'SELECT to_jsonb('+name+'('+params+'));',ok)
  return (json.loads(r.stdout)if r.stdout.strip()else None)if ok else r
 def fail(name,args,who=None):
  r=call(name,args,who,False);assert r.returncode,(name,r.stdout);return r.stderr
 def scalar(q):return sql(q).stdout.strip()
 def stocks():return scalar("SELECT string_agg(stock::text,','ORDER BY id)FROM product_variants;")
 assert call('catalog_cart_version',{})==1
 call('save_catalog_bargain_policy',{'product_id':ps[0],'policy':{'enabled':True,'kind':'amount','min_discount':10,'max_discount':250,'rounding':5},'expected_revision':None},owner)
 client=str(uuid.uuid4());deal=call('catalog_bargain_bid',{'variant_id':vs[0],'client':client,'offer':2075})
 sql("INSERT INTO coupons(code,value,kind)VALUES('CART100',100,'flat');")
 items=[{'variant_id':vs[0],'price':2200,'net':deal['price'],'coupon':'','bargain_id':deal['id'],'client':client},{'variant_id':vs[1],'price':800,'net':700,'coupon':'CART100'},{'variant_id':vs[2],'price':333,'net':333,'coupon':''}]
 net=deal['price']+700+333
 args={'request_id':str(uuid.uuid4()),'items':items,'name':'Demo buyer','mobile':'9999999999','fulfillment':'local','address':'Synthetic demo address only','area':'Demo','quote':{'net':net,'charge':90,'advance':net+90}}
 before=stocks()
 assert fail('create_catalog_cart_order',dict(args,items=[items[0],dict(items[1],net=1),items[2]]))
 assert stocks()==before and scalar('SELECT count(*)FROM catalog_bookings;')=='0'and scalar("SELECT used_count FROM coupons WHERE code='CART100';")=='0'
 # Failure after a coupon check still rolls back the coupon reservation and all holds.
 assert fail('create_catalog_cart_order',dict(args,items=[items[1],dict(items[2],price=1)]))
 assert scalar("SELECT used_count FROM coupons WHERE code='CART100';")=='0'
 assert fail('create_catalog_cart_order',dict(args,items=[dict(items[0],coupon='CART100')]))
 from concurrent.futures import ThreadPoolExecutor
 with ThreadPoolExecutor(max_workers=2)as ex:results=list(ex.map(lambda _:call('create_catalog_cart_order',args),range(2)))
 result=results[0];assert result['cart_no']==results[1]['cart_no']and len(result['orders'])==3
 assert result['price']==net and result['advance']==net+90 and result['delivery_charge']==90
 assert sum(x['delivery_charge']for x in result['orders'])==90
 assert scalar('SELECT count(*)FROM catalog_bookings;')=='3'and scalar("SELECT used_count FROM coupons WHERE code='CART100';")=='1'
 assert stocks()=='29,29,29'
 sql("UPDATE catalog_bargain_sessions SET expires_at=now()-interval'1 hour'WHERE id IS NOT NULL;")
 assert call('create_catalog_cart_order',args)['cart_no']==result['cart_no']
 assert fail('create_catalog_cart_order',dict(args,name='Different name'))
 assert call('track_catalog_cart_order',{'cart_no':result['cart_no'],'mobile':'8888888888'})is None
 assert len(call('track_catalog_cart_order',{'cart_no':result['cart_no'],'mobile':'9999999999'})['orders'])==3
 # An existing three-pair cart counts as one active order, rather than three.
 for _ in range(2):
  call('create_catalog_cart_order',dict(args,request_id=str(uuid.uuid4()),items=[{'variant_id':vs[2],'price':333,'net':333,'coupon':''}],quote={'net':333,'charge':90,'advance':423}))
 assert fail('create_catalog_cart_order',dict(args,request_id=str(uuid.uuid4()),items=[{'variant_id':vs[2],'price':333,'net':333,'coupon':''}],quote={'net':333,'charge':90,'advance':423}))
 assert scalar('SELECT count(*)FROM credit_payments;')=='0'
 assert fail('confirm_catalog_cart_payment',{'cart_no':result['cart_no'],'expected_advance':1,'settled':True},owner)
 assert fail('confirm_catalog_cart_payment',{'cart_no':result['cart_no'],'expected_advance':result['advance'],'settled':False},owner)
 assert fail('confirm_catalog_cart_payment',{'cart_no':result['cart_no'],'expected_advance':result['advance'],'settled':True})
 call('confirm_catalog_cart_payment',{'cart_no':result['cart_no'],'expected_advance':result['advance'],'settled':True},owner)
 call('confirm_catalog_cart_payment',{'cart_no':result['cart_no'],'expected_advance':result['advance'],'settled':True},owner)
 assert scalar('SELECT count(*)FROM credit_payments;')=='3'
 assert float(scalar('SELECT sum(amount)FROM credit_payments;'))==result['advance']
 assert scalar("SELECT count(*)FROM catalog_bookings WHERE receipt_recorded;")=='3'
 # Original per-pair billing still produces exact net prices and allocated delivery, without holding stock twice.
 for item in result['orders']:
  booking=scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+item['booking_no']+"';")
  total=item['price']+item['delivery_charge']
  bill={'subtotal':total,'total':total,'paid_amount':total,'due_amount':0,'discount':0,'payment_mode':'UPI','bill_type':'simple','tax_mode':'inclusive','gst_rate':0,'give_stamp':False}
  call('complete_catalog_booking',{'id':booking,'sale':bill,'items':[{'variant_id':item['variant_id'],'product_name':item['product'],'size':item['size'],'qty':1,'price':item['price']}]},owner)
 assert scalar('SELECT count(*)FROM sales;')=='3'and float(scalar('SELECT sum(total)FROM sales;'))==result['advance']
 assert float(scalar('SELECT sum(amount)FROM credit_payments;'))==result['advance']
 # Tiny prices cannot create zero/negative allocated receipts or an advance larger than the order.
 sql(f"INSERT INTO products(id,article,selling_price,catalog_visible)VALUES('{ps[3]}','Tiny Audit',0.01,true);")
 tiny=[]
 for i in range(5):
  v='30000000-0000-4000-8000-'+str(i+1).zfill(12);sql(f"INSERT INTO product_variants(id,product_id,size,stock)VALUES('{v}','{ps[3]}','{i+1}',2);")
  tiny.append({'variant_id':v,'price':0.01,'net':0.01,'coupon':''})
 small=call('create_catalog_cart_order',dict(args,request_id=str(uuid.uuid4()),items=tiny,mobile='8888888888',fulfillment='pickup',address='',quote={'net':0.05,'charge':0,'advance':0.05}))
 assert small['advance']==0.05 and all(item['advance']==0.01 for item in small['orders'])
 print(json.dumps({'pass':True,'checks':['existing RPC definitions byte-unchanged','atomic all-pair hold','coupon rollback and once-per-pair application','no bargain stacking','concurrent request dedup','committed retry after bargain expiry','one delivery charge allocated exactly','three open carts rather than three item rows','mobile-scoped group tracking','one combined UPI receipt allocated once','original billing uses saved prices and delivery','small-money allocation guards']}))
finally:run(['docker','rm','-f',container])
