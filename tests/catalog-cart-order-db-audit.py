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
 if '--whole-coupon' in sys.argv:
  exceptions="'coupon_usage_count','confirm_catalog_booking','catalog_cart_version'"
  protected=scalar("SELECT md5(string_agg(pg_get_functiondef(oid),'|'ORDER BY oid))FROM pg_proc WHERE oid IN("+existing+")AND proname NOT IN("+exceptions+");")
  original_confirm=scalar("SELECT pg_get_functiondef('public.confirm_catalog_booking(uuid)'::regprocedure);")
  for _ in range(2):
   for path in sorted((root/'docs/sql/catalog-cart/coupon-update').glob('part-*.sql')):sql(path.read_text())
  assert sql((root/'docs/sql/catalog-cart/coupon-update/verify.sql').read_text()).stdout.strip()=='t|t|t|t|t'
  assert protected==scalar("SELECT md5(string_agg(pg_get_functiondef(oid),'|'ORDER BY oid))FROM pg_proc WHERE oid IN("+existing+")AND proname NOT IN("+exceptions+");")
  old_clause="IF b.coupon_code IS NOT NULL THEN PERFORM public.catalog_coupon_amount(b.coupon_code,b.mobile,b.price+b.coupon_discount,true);UPDATE public.coupons SET used_count=used_count+1 WHERE code=b.coupon_code;END IF;"
  new_clause="IF b.coupon_code IS NOT NULL THEN IF b.booking_no ~ '^CT-[0-9A-F]{16}-[0-9]{2}$' THEN PERFORM public.revalidate_catalog_cart_coupon(b.id); ELSE PERFORM public.catalog_coupon_amount(b.coupon_code,b.mobile,b.price+b.coupon_discount,true); UPDATE public.coupons SET used_count=used_count+1 WHERE code=b.coupon_code; END IF; END IF;"
  assert original_confirm.count(old_clause)==1
  assert scalar("SELECT pg_get_functiondef('public.confirm_catalog_booking(uuid)'::regprocedure);")==original_confirm.replace(old_clause,new_clause)

  sql("INSERT INTO coupons(code,value,kind,min_bill,usage_limit)VALUES('WHOLE10',10,'percent',2500,1),('MIX150',150,'flat',1000,10),('EXPIRED10',10,'percent',2500,1),('CHANGED10',10,'percent',2500,5),('LEGACY20',20,'flat',0,5);")
  plain=[{'variant_id':vs[0],'price':2200,'net':1980,'coupon':''},{'variant_id':vs[1],'price':800,'net':720,'coupon':''}]
  whole=dict(args,request_id=str(uuid.uuid4()),items=plain,mobile='7777777777',coupon='WHOLE10',quote={'net':2700,'charge':90,'advance':2790})
  preview=json.loads(as_role('anon','','SELECT check_catalog_cart_coupon(ARRAY[\''+vs[0]+'\',\''+vs[1]+'\']::uuid[],\'WHOLE10\',\'7777777777\');').stdout)
  assert preview['amount']==300
  before=stocks()
  assert fail('create_catalog_cart_order_v2',dict(whole,items=[dict(plain[0],net=1979),plain[1]]))
  assert before==stocks() and scalar("SELECT used_count FROM coupons WHERE code='WHOLE10';")=='0'
  with ThreadPoolExecutor(max_workers=2)as ex:gr=list(ex.map(lambda _:call('create_catalog_cart_order_v2',whole),range(2)))
  group=gr[0];assert group['cart_no']==gr[1]['cart_no']
  assert [x['coupon_discount']for x in group['orders']]==[220,80]
  assert [x['price']for x in group['orders']]==[1980,720]
  assert scalar("SELECT coupon_usage_count(id,code)FROM coupons WHERE code='WHOLE10';")=='1'
  assert fail('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),mobile='6666666666'))
  def bid(item):return scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+item['booking_no']+"';")
  for index,item in enumerate(group['orders']):
   call('cancel_catalog_booking',{'id':bid(item),'note':'Synthetic audit cancellation'},owner)
   assert scalar("SELECT coupon_usage_count(id,code)FROM coupons WHERE code='WHOLE10';")==str(1-index)
   assert scalar("SELECT used_count FROM coupons WHERE code='WHOLE10';")==str(1-index)
  # Expiration frees the shared coupon once; full confirmation revalidates the original basket once.
  expiry=call('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),coupon='EXPIRED10',mobile='6666666666'))
  sql("UPDATE catalog_bookings SET expires_at=now()-interval'1 hour'WHERE booking_no LIKE '"+expiry['cart_no']+"-%';SELECT expire_catalog_bookings();")
  assert scalar("SELECT used_count FROM coupons WHERE code='EXPIRED10';")=='0'
  receipt_before=int(scalar('SELECT count(*)FROM credit_payments;'))
  call('confirm_catalog_cart_payment',{'cart_no':expiry['cart_no'],'expected_advance':2790,'settled':True},owner)
  call('confirm_catalog_cart_payment',{'cart_no':expiry['cart_no'],'expected_advance':2790,'settled':True},owner)
  assert int(scalar('SELECT count(*)FROM credit_payments;'))==receipt_before+2
  assert scalar("SELECT used_count FROM coupons WHERE code='EXPIRED10';")=='1'
  # Per-pair refunds use their saved net advance; remaining coupon pairs keep one use reserved.
  for index,item in enumerate(expiry['orders']):
   call('cancel_catalog_booking',{'id':bid(item),'note':'Synthetic verified cancellation'},owner)
   refund_args={'id':bid(item),'mode':'UPI','reference':'Synthetic refund audit','request_id':str(uuid.uuid4())}
   call('record_catalog_refund',refund_args,owner);call('record_catalog_refund',refund_args,owner)
   assert scalar("SELECT coupon_usage_count(id,code)FROM coupons WHERE code='EXPIRED10';")==str(1-index)
  assert float(scalar("SELECT sum(amount)FROM credit_payments WHERE entry_kind='catalog_refund'AND booking_id IN(SELECT id FROM catalog_bookings WHERE booking_no LIKE '"+expiry['cart_no']+"-%');"))==2790
  # Another customer consuming a freed limited coupon blocks reactivation, atomically.
  conflict=call('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),coupon='EXPIRED10',mobile='6666666666'))
  sql("UPDATE catalog_bookings SET expires_at=now()-interval'1 hour'WHERE booking_no LIKE '"+conflict['cart_no']+"-%';SELECT expire_catalog_bookings();")
  call('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),coupon='EXPIRED10',mobile='7777777777'))
  before=stocks();count=scalar('SELECT count(*)FROM credit_payments;')
  assert fail('confirm_catalog_cart_payment',{'cart_no':conflict['cart_no'],'expected_advance':2790,'settled':True},owner)
  assert before==stocks()and count==scalar('SELECT count(*)FROM credit_payments;')
  # Price/coupon rule changes cannot silently change an expired order's contracted money.
  changed=call('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),coupon='CHANGED10',mobile='6666666666'))
  sql("UPDATE catalog_bookings SET expires_at=now()-interval'1 hour'WHERE booking_no LIKE '"+changed['cart_no']+"-%';SELECT expire_catalog_bookings();UPDATE coupons SET value=5 WHERE code='CHANGED10';")
  assert fail('confirm_catalog_cart_payment',{'cart_no':changed['cart_no'],'expected_advance':2790,'settled':True},owner)
  # Mixed basket: coupon minimum/discount use only normal prices, never the bargain or delivery.
  # Quote client capability has to match; keep it explicitly rather than reconstructing it.
  fresh_client=str(uuid.uuid4());d2=call('catalog_bargain_bid',{'variant_id':vs[0],'client':fresh_client,'offer':2050})
  mixed_items=[{'variant_id':vs[0],'price':2200,'net':d2['price'],'coupon':'','bargain_id':d2['id'],'client':fresh_client},{'variant_id':vs[1],'price':800,'net':694.09,'coupon':''},{'variant_id':vs[2],'price':333,'net':288.91,'coupon':''}]
  mixed_total=d2['price']+983
  mix=call('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),items=mixed_items,coupon='MIX150',mobile='8888888888',quote={'net':mixed_total,'charge':90,'advance':mixed_total+90}))
  assert mix['orders'][0]['coupon_code']is None and mix['orders'][0]['coupon_discount']==0
  assert sum(x['coupon_discount']for x in mix['orders'])==150
  assert mix['orders'][1]['coupon_discount']==105.91 and mix['orders'][2]['coupon_discount']==44.09
  assert fail('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),items=[mixed_items[0]],coupon='MIX150',quote={'net':d2['price'],'charge':90,'advance':d2['price']+90}))
  sql("INSERT INTO coupons(code,value,kind)VALUES('SMALL-A',99,'flat'),('SMALL-B',99,'flat');")
  tiny_ids=["30000000-0000-4000-8000-000000000001","30000000-0000-4000-8000-000000000002"]
  # Use a separate article priced 2, retaining the original tiny article for the final paisa.
  regular=vs[2]
  sql("UPDATE products SET selling_price=2 WHERE id='"+ps[2]+"';")
  for index, ordered in enumerate([[(regular,2,0.99),(tiny_ids[0],0.01,0.01)],[(tiny_ids[1],0.01,0.01),(regular,2,0.99)]]):
   edge=call('create_catalog_cart_order_v2',dict(whole,request_id=str(uuid.uuid4()),mobile='9999999999',coupon=['SMALL-A','SMALL-B'][index],fulfillment='pickup',address='',items=[{'variant_id':v,'price':p,'net':net,'coupon':''}for v,p,net in ordered],quote={'net':1,'charge':0,'advance':1}))
   assert sum(x['coupon_discount']for x in edge['orders'])==1.01 and edge['price']==1
   for item in edge['orders']:call('cancel_catalog_booking',{'id':bid(item),'note':'Synthetic rounding check'},owner)
  sql("UPDATE products SET selling_price=333 WHERE id='"+ps[2]+"';")
  # Legacy single-price coupon confirmation still uses its original code path.
  legacy=call('create_catalog_order',{'variant_id':vs[2],'name':'Demo legacy','mobile':'9999999999','fulfillment':'pickup','address':'','area':'','coupon':'LEGACY20','request_id':str(uuid.uuid4()),'quote':{'price':333,'net':313,'charge':0,'advance':63}})
  sql("UPDATE catalog_bookings SET expires_at=now()-interval'1 hour'WHERE booking_no='"+legacy['booking_no']+"';SELECT expire_catalog_bookings();")
  legacy_id=scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+legacy['booking_no']+"';")
  call('confirm_catalog_booking',{'id':legacy_id},owner)
  assert scalar("SELECT receipt_recorded FROM catalog_bookings WHERE id='"+legacy_id+"';")=='t'
  print(json.dumps({'whole_cart_coupon':'pass','checks':['percentage/minimum on combined eligible total','proportional per-pair net','one shared usage','partial cancel retains usage until last pair','expired cart revalidation/once-only receipts','exact net refunds without duplicate','capacity conflict rollback','changed coupon blocks late confirmation','mixed bargain exclusion','old single-order confirmation preserved','other existing RPC definitions byte-identical']}))
 print(json.dumps({'pass':True,'checks':['existing RPC definitions byte-unchanged before optional coupon update','atomic all-pair hold','coupon rollback and once-per-pair application','no bargain stacking','concurrent request dedup','committed retry after bargain expiry','one delivery charge allocated exactly','three open carts rather than three item rows','mobile-scoped group tracking','one combined UPI receipt allocated once','original billing uses saved prices and delivery','small-money allocation guards']}))
finally:run(['docker','rm','-f',container])
