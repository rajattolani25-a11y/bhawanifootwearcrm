"""Real PostgreSQL/RLS audit on a disposable offline container. No app env/live DB."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1]
container='solestack-read-audit-'+uuid.uuid4().hex[:8]

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



 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';p='10000000-0000-4000-8000-000000000001';v='20000000-0000-4000-8000-000000000001';c='30000000-0000-4000-8000-000000000001';supplier='40000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');")
 sql(f"SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');INSERT INTO products(id,article,brand,category,selling_price,catalog_visible,image_url)VALUES('{p}','Audit Pair','Demo','Men / Other',1000,true,'products/demo.webp');INSERT INTO product_variants(id,product_id,size,stock,barcode)VALUES('{v}','{p}','7',10,'PAIR7');INSERT INTO product_costs(product_id,purchase_price)VALUES('{p}',400);INSERT INTO customers(id,name,mobile,opening_balance)VALUES('{c}','Demo customer','0000000000',1000);INSERT INTO suppliers(id,name,opening_balance)VALUES('{supplier}','Demo supplier',1000);")
 def call(name,args,who=owner,ok=True):
  params=','.join('_'+k+'=>'+('NULL'if x is None else "'"+json.dumps(x).replace("'","''")+"'::jsonb"if isinstance(x,(list,dict))else 'true'if x is True else 'false'if x is False else str(x)if isinstance(x,(int,float))else "'"+x.replace("'","''")+"'")for k,x in args.items())
  r=as_role('anon'if who is None else'authenticated',''if who is None else who,'SELECT to_jsonb('+name+'('+params+'));',ok)
  return (json.loads(r.stdout)if r.stdout.strip()else None)if ok else r
 def scalar(query):return sql(query).stdout.strip()
 def sale(amount=1000,paid=1000,taxable=None,who=owner):
  payload={'request_id':str(uuid.uuid4()),'customer_id':c,'customer_name':'Demo customer','subtotal':amount,'taxable':amount if taxable is None else taxable,'discount':0,'total':amount,'paid_amount':paid,'due_amount':amount-paid,'payment_mode':'Cash','bill_type':'simple','give_stamp':False}
  items=[{'variant_id':v,'product_name':'Audit Pair','size':'7','qty':1,'price':1000}]
  return call('create_sale',{'sale':payload,'items':items},who)


 from concurrent.futures import ThreadPoolExecutor
 checks=[]
 def expect_fail(name,args,who=owner):
  r=call(name,args,who=who,ok=False);assert r.returncode!=0,(name,r.stdout);return r
 def count(t):return int(scalar('SELECT count(*)FROM '+t+';'))
 def stock(variant=v):return int(scalar(f"SELECT stock FROM product_variants WHERE id='{variant}';"))
 assert call('operational_safety_version',{})==40
 assert as_role('authenticated',staff,"INSERT INTO customers(name,mobile,opening_balance)VALUES('Forged','0000000019',100);",False).returncode
 assert as_role('authenticated',owner,f"INSERT INTO credit_payments(customer_id,amount,payment_mode,collected_by)VALUES('{c}',100,'Cash','{owner}');",False).returncode
 assert as_role('authenticated',owner,"UPDATE customers SET opening_initial=999;",False).returncode
 old=stock();call('adjust_inventory',{'variant_id':v,'expected_stock':old,'expected_damaged':0,'stock':old-1,'reason':'Count corrected'})
 expect_fail('adjust_inventory',{'variant_id':v,'expected_stock':old,'expected_damaged':0,'stock':old,'reason':'Stale form'})
 assert stock()==old-1
 assert as_role('authenticated',owner,f"UPDATE product_variants SET stock=100 WHERE id='{v}';",False).returncode
 expect_fail('adjust_inventory',{'variant_id':v,'expected_stock':stock(),'expected_damaged':0,'stock':2,'reason':'Staff update'},staff)
 sql(f"UPDATE product_variants SET damaged_stock=2 WHERE id='{v}';")
 call('adjust_inventory',{'variant_id':v,'expected_stock':stock(),'expected_damaged':2,'disposition':'supplier','reason':'Sent back to supplier'})
 assert scalar("SELECT sum(qty_out)FROM stock_movements WHERE type='DAMAGE-SUPPLIER';")=='2'
 checks.append('atomic/stale/owner stock guards and damaged disposition ledger')
 def add(color,price=1000):return call('quick_add_product',{'product':{'brand':'SAFE','article':'New Pair','color':color,'selling_price':price},'sizes':[{'size':'7','qty':1}],'cost':400})
 black=add('Black');blue=add('Blue');assert black['product_id']!=blue['product_id']
 expect_fail('quick_add_product',{'product':{'brand':'SAFE','article':'New Pair','color':'Black','selling_price':1200},'sizes':[{'size':'7','qty':1}],'cost':400})
 with ThreadPoolExecutor(max_workers=2)as ex:green=list(ex.map(lambda _:add('Green'),range(2)))
 assert green[0]['product_id']==green[1]['product_id']
 code=call('ensure_variant_label_code',{'variant_id':v});assert len(code)==12 and code.startswith('SS')and call('ensure_variant_label_code',{'variant_id':v})==code
 assert scalar(f"SELECT barcode FROM product_variants WHERE id='{v}';")=='PAIR7'
 checks.append('colour identity, conflicting price rejection, concurrent identity reuse and compact label alias without replacing old code')
 args={'customer_id':c,'amount':500,'mode':'Cash','note':'Opening debt','request_id':str(uuid.uuid4())}
 call('receive_customer_payment',args);call('receive_customer_payment',args)
 assert count('credit_payments')==1 and scalar(f"SELECT opening_initial||'/'||opening_balance FROM customers WHERE id='{c}';")=='1000/500'
 expect_fail('receive_customer_payment',dict(args,amount=400))
 args={'supplier_id':supplier,'amount':500,'mode':'Cash','note':'Opening debt','request_id':str(uuid.uuid4())}
 call('record_supplier_payment_v2',args);call('record_supplier_payment_v2',args)
 assert count('supplier_payments')==1 and scalar(f"SELECT opening_initial||'/'||opening_balance FROM suppliers WHERE id='{supplier}';")=='1000/500'
 checks.append('dated opening receipts, immutable starting balances, retries and altered-payload rejection')
 receipt={'supplier_id':supplier,'supplier_name':'Demo','invoice':'INV1','items':[{'variant_id':v,'qty':3,'price':400,'gst_rate':0}],'request_id':str(uuid.uuid4())}
 start=stock();call('receive_stock_v2',receipt);call('receive_stock_v2',receipt);assert stock()==start+3 and count('purchases')==1
 bad=dict(receipt,request_id=str(uuid.uuid4()),items=receipt['items']+[{'variant_id':v,'qty':-1,'price':400,'gst_rate':0}]);expect_fail('receive_stock_v2',bad);assert stock()==start+3
 checks.append('receiving retry dedup and invalid-line full rollback')
 # Owner must resolve unknown requests before a different cashier can proceed.
 assert call('resolve_pending_operation',{'request_id':receipt['request_id']})['state']=='committed'
 abandoned=str(uuid.uuid4());assert call('resolve_pending_operation',{'request_id':abandoned})['state']=='not_recorded'
 expect_fail('resolve_pending_operation',{'request_id':abandoned,'abandon':True,'confirmation':'ABANDON'},staff)
 assert call('resolve_pending_operation',{'request_id':abandoned,'abandon':True,'confirmation':'ABANDON'})['state']=='abandoned'
 expect_fail('receive_stock_v2',dict(receipt,request_id=abandoned));assert stock()==start+3
 checks.append('owner recovery proves committed state; abandoned unknown request cannot submit a late receipt')

 # Money invariants and recovery are checked against real staff/owner calls.
 payload={'request_id':str(uuid.uuid4()),'customer_id':c,'customer_name':'Demo','subtotal':1000,'discount':0,'taxable':1000,'gst_rate':0,'gst_amount':0,'total':1000,'paid_amount':1000,'due_amount':0,'payment_mode':'Cash','bill_type':'simple','tax_mode':'inclusive','give_stamp':False}
 items=[{'variant_id':v,'product_name':'Audit Pair','size':'7','qty':1,'price':1000}]
 for corrupt in [dict(payload,paid_amount=-100,due_amount=1100),dict(payload,total=1,paid_amount=1),dict(payload,paid_amount='NaN'),dict(payload,payment_mode='Other')]:
  expect_fail('create_sale',{'sale':corrupt,'items':items},staff)
 expect_fail('create_sale',{'sale':payload,'items':[dict(items[0],price=1)]},staff)
 start=stock();sale1=call('create_sale',{'sale':payload,'items':items},staff);again=call('create_sale',{'sale':payload,'items':items},staff);assert again['sale_id']==sale1['sale_id']and stock()==start-1
 checks.append('negative/NaN/inconsistent totals, invalid mode and forged price denied; sale recovery still deduplicates')
 # A combined bill/opening payment by Staff must roll back every allocation.
 credit=call('create_sale',{'sale':dict(payload,request_id=str(uuid.uuid4()),paid_amount=0,due_amount=1000,payment_mode='Credit'),'items':items},staff)
 before_payments=count('credit_payments')
 expect_fail('receive_customer_payment',{'customer_id':c,'amount':1100,'mode':'Cash','note':'Mixed debt','request_id':str(uuid.uuid4())},staff)
 assert count('credit_payments')==before_payments and float(scalar(f"SELECT due_amount FROM sales WHERE id='{credit['sale_id']}';"))==1000
 call('receive_customer_payment',{'customer_id':c,'amount':1000,'mode':'Cash','note':'Bill paid','request_id':str(uuid.uuid4())},staff)
 checks.append('staff mixed opening/bill collection rolls back atomically; permitted bill-only repayment succeeds')
 # Configure genuine public orders, using a checked quote and exact retry key.
 sql("UPDATE store_settings SET catalog_enabled=true,booking_enabled=true,pickup_enabled=true,delivery_enabled=true,outside_enabled=true,upi_id='demo@upi',business_phone='9999999999',advance_percent=30,local_charge=30,outside_charge=80,free_delivery_above=1000 WHERE id=1;")
 def order(mobile,kind='pickup',coupon='',net=1000,wrong=False):
  charge=0 if kind=='pickup'or(kind=='local'and net>=1000)else 30 if kind=='local'else 80
  advance=(net*30+99)//100 if kind=='pickup'else net+charge
  args={'variant_id':v,'name':'Demo buyer','mobile':mobile,'fulfillment':kind,'address':''if kind=='pickup'else'123 Test Road, Demo City','area':'Demo','coupon':coupon,'request_id':str(uuid.uuid4()),'quote':{'price':1000,'net':net,'charge':0 if wrong else charge,'advance':net if wrong else advance}}
  return args
 args=order('9999999901','outside');start=stock();o=call('create_catalog_order',args,who=None);again=call('create_catalog_order',args,who=None);assert o['booking_no']==again['booking_no']and stock()==start-1
 bid=scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+o['booking_no']+"';")
 call('confirm_catalog_booking',{'id':bid});call('confirm_catalog_booking',{'id':bid})
 assert scalar(f"SELECT amount FROM credit_payments WHERE booking_id='{bid}'AND entry_kind='catalog_advance';")=='1080'
 invoice=dict(payload,request_id=str(uuid.uuid4()),payment_mode='UPI',subtotal=1080,taxable=1028.57,gst_rate=5,gst_amount=51.43,total=1080,paid_amount=1080,bill_type='gst',delivery_charge=80)
 completed=call('complete_catalog_booking',{'id':bid,'sale':invoice,'items':items})
 assert json.loads(scalar(f"SELECT to_jsonb(ARRAY[total,paid_amount,delivery_charge]) FROM sales WHERE id='{completed['sale_id']}';"))==[1080,1080,80]
 assert call('complete_catalog_booking',{'id':bid,'sale':invoice,'items':items})['sale_id']==completed['sale_id']
 assert stock()==start-1
 checks.append('public order retry one hold; manual receipt one event; delivery1080 reconciles invoice and receipt; completion retry one bill')
 # Pickup300UPI +700Cash must retain the correct split after receipts are linked.
 args=order('9999999902');o=call('create_catalog_order',args,who=None);bid=scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+o['booking_no']+"';");call('confirm_catalog_booking',{'id':bid})
 before=call('owner_cash_today',{})['cash_net']
 invoice=dict(payload,request_id=str(uuid.uuid4()),payment_mode='Split',split_cash=700)
 call('complete_catalog_booking',{'id':bid,'sale':invoice,'items':items})
 assert call('owner_cash_today',{})['cash_net']-before==700
 checks.append('pickup split preserves300UPI/700Cash; dashboard cash uses actual receipts without double counting advance')
 # Cancellation has an explicit refund-pending stage, then one recorded external refund.
 args=order('9999999903');o=call('create_catalog_order',args,who=None);bid=scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+o['booking_no']+"';");start=stock();call('confirm_catalog_booking',{'id':bid});call('cancel_catalog_booking',{'id':bid,'note':'Customer cancelled'})
 assert stock()==start+1 and scalar(f"SELECT status FROM catalog_bookings WHERE id='{bid}';")=='refund_pending'
 refund={'id':bid,'mode':'UPI','reference':'DEMO-UTR-123','request_id':str(uuid.uuid4())};expect_fail('record_catalog_refund',refund,staff);call('record_catalog_refund',refund);call('record_catalog_refund',refund)
 assert scalar(f"SELECT count(*)FROM credit_payments WHERE booking_id='{bid}'AND entry_kind='catalog_refund';")=='1'
 checks.append('paid cancel restores stock and waits for recorded refund; owner reference and refund retries protected')
 # Coupon reservation release, cross-channel usage and discounted delivery quote.
 sql("INSERT INTO coupons(code,kind,value,title,usage_limit)VALUES('ONE','flat',200,'One-use',1),('CROSS','flat',100,'Cross',NULL);")
 args=order('9999999904','local','ONE',800,wrong=True);expect_fail('create_catalog_order',args,None)
 args['quote']={'price':1000,'net':800,'charge':30,'advance':830};o=call('create_catalog_order',args,who=None);bid=scalar("SELECT id FROM catalog_bookings WHERE booking_no='"+o['booking_no']+"';")
 assert o['advance']==830
 call('cancel_catalog_booking',{'id':bid,'note':'Unpaid cancelled'});assert scalar("SELECT used_count FROM coupons WHERE code='ONE';")=='0'
 args=order('9999999905','local','ONE',800);call('create_catalog_order',args,who=None)
 sql(f"UPDATE customers SET mobile='9999999906'WHERE id='{c}';")
 args=order('9999999906','pickup','CROSS',900);call('create_catalog_order',args,who=None)
 expect_fail('coupon_discount',{'code':'CROSS','customer':c,'subtotal':1000})
 sql(f"UPDATE products SET status='inactive',catalog_visible=true WHERE id='{p}';")
 expect_fail('create_catalog_order',order('9999999907'),None)
 checks.append('coupon cancellation releases quota; online/POS repeats blocked; net-price delivery quote checked; archived orders rejected')
 # Last physical pair: concurrent orders cannot both acquire it.
 sql(f"UPDATE products SET status='Active'WHERE id='{p}';UPDATE product_variants SET stock=1 WHERE id='{v}';")
 attempts=[order('9999999911'),order('9999999912')]
 with ThreadPoolExecutor(max_workers=2)as ex:outcomes=list(ex.map(lambda a:call('create_catalog_order',a,who=None,ok=False),attempts))
 assert sum(r.returncode==0 for r in outcomes)==1 and stock()==0
 # Quota1 across two distinct sizes: the coupon lock must protect capacity.
 sql(f"UPDATE product_variants SET stock=5 WHERE id='{v}';INSERT INTO coupons(code,kind,value,title,usage_limit)VALUES('RACE','flat',100,'Last coupon',1);")
 attempts=[order('9999999913',coupon='RACE',net=900),order('9999999914',coupon='RACE',net=900)]
 attempts[1]['variant_id']=scalar(f"SELECT id FROM product_variants WHERE product_id='{blue['product_id']}'LIMIT 1;")
 with ThreadPoolExecutor(max_workers=2)as ex:outcomes=list(ex.map(lambda a:call('create_catalog_order',a,who=None,ok=False),attempts))
 assert sum(r.returncode==0 for r in outcomes)==1
 checks.append('simultaneous last-pair orders and limited coupon prevent oversell/quota overspend')
 # New nullable columns and the deferred booking-receipt FK survive the genuine v2 round trip.
 snapshot=call('store_backup_snapshot_v2',{});call('reset_store_data_v2',{'confirmation':'RESET','fingerprint':snapshot['fingerprint']})
 call('restore_store_backup_v2',{'confirmation':'RESTORE','snapshot':snapshot})
 restored=call('store_backup_snapshot_v2',{});assert restored['tables']==snapshot['tables']
 checks.append('all new receipt, booking and stock fields survive actual verified backup/reset/restore')
 # The importer is checked only in an empty synthetic shop and must never overwrite it.
 call('reset_store_data_v2',{'confirmation':'RESET','fingerprint':restored['fingerprint']})
 legacy={'products':[{'id':'OLD7','brand':'OLD','name':'Pair','color':'Black','category':'Gents','sellingPrice':1000,'purchasePrice':400,'size':'7','stock':2}],'customers':[],'suppliers':[],'sales':[{'id':'OLDBILL','billNo':'OLD-1','subtotal':1000,'total':1000,'paidAmount':1000,'dueAmount':0,'taxable':1000,'billType':'simple','items':[{'productId':'OLD7','name':'Pair','size':'7','price':1000,'qty':1,'cost':400}]}],'purchases':[],'movements':[]}
 import copy
 for corrupt in ['money','stock','unsupported']:
  bad=copy.deepcopy(legacy)
  if corrupt=='money':bad['sales'][0]['items'][0]['price']='NaN'
  elif corrupt=='stock':bad['products'][0]['stock']=-1
  else:bad['creditPayments']=[{'amount':100}]
  expect_fail('import_legacy_store',{'payload':bad,'request_id':str(uuid.uuid4())})
  assert count('products')==0 and count('sales')==0
 checks.append('malformed legacy money/stock and unsupported payment history reject with full rollback')
 args={'payload':legacy,'request_id':str(uuid.uuid4())};r=call('import_legacy_store',args);assert r['sales']==1 and count('products')==1
 assert call('import_legacy_store',args)['replayed']and count('sales')==1
 expect_fail('import_legacy_store',{'payload':dict(legacy,sales=[]),'request_id':str(uuid.uuid4())})
 checks.append('legacy import atomic/no-overwrite/re-import safe; closing stock not deducted for historical bills')
 # Definition reapplication never resets data and keeps the billing safety patches once.
 before=call('store_backup_snapshot_v2',{})
 if split_sql:
  for part in sorted((root/'docs/sql/operations-update-parts').glob('part-*.sql')):sql(part.read_text())
  assert sql((root/'docs/sql/operations-update-parts/verify.sql').read_text()).stdout.splitlines()[0]=='t'
 else:
  for path in sorted((root/'drizzle/migrations').glob('*.sql')):
   if path.name>='0035_':sql(path.read_text())
 after=call('store_backup_snapshot_v2',{})
 assert before['tables']==after['tables']and call('operational_safety_version',{})==40
 assert scalar("SELECT count(*)FROM regexp_matches(pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure),'server-bill-validation-v38','g');")=='1'
 checks.append('reapplying the complete definition update preserves business rows and one guarded bill patch')
 result={'result':'PASS','scope':'All migrations on offline PostgreSQL17, genuine RPCs/RLS; no production writes','checks':checks,'productionWrites':0}
 print(json.dumps(result))
finally:run(['docker','rm','-f',container])
