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
 for path in sorted((root/'drizzle/migrations').glob('*.sql')):
  sql(path.read_text())


 owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002';p='10000000-0000-4000-8000-000000000001';v='20000000-0000-4000-8000-000000000001';c='30000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');")
 as_role('authenticated',owner,f"SELECT set_team_role('{staff}','staff');INSERT INTO products(id,article,brand,category,selling_price)VALUES('{p}','Pair','Demo','Women / Other',500);INSERT INTO product_variants(id,product_id,size,stock,barcode)VALUES('{v}','{p}','7',40,'PAIR7');INSERT INTO product_costs(product_id,purchase_price)VALUES('{p}',100);INSERT INTO customers(id,name,mobile,regular_stamps,regular_visits)VALUES('{c}','Customer','0000000000',4,4);")
 def call(name,args,who=owner,ok=True):
  params=','.join('_'+k+'=>'+('NULL'if x is None else "'"+json.dumps(x).replace("'","''")+"'::jsonb"if isinstance(x,(list,dict))else 'true'if x is True else 'false'if x is False else str(x)if isinstance(x,(int,float))else "'"+x.replace("'","''")+"'")for k,x in args.items())
  r=as_role('authenticated',who,'SELECT '+name+'('+params+');',ok)
  return json.loads(r.stdout)if ok else r
 def variant(variant=None,size='8',stock=0,expected=None,remove=False,reason='',who=owner,ok=True):return call('edit_product_variant',{'product_id':p,'variant_id':variant,'size':size,'stock':stock,'expected_stock':expected,'remove':remove,'reason':reason},who,ok)
 empty=variant();variant(empty['id'],size='8.5',expected=0);variant(empty['id'],size='8.5',expected=0,remove=True)
 added=variant(size='9',stock=2,reason='Opening stock')
 check(f"(SELECT stock=2 AND barcode LIKE 'BF%' FROM product_variants WHERE id='{added['id']}')",'new variant scan code/stock missing')
 variant(added['id'],size='9',stock=3,expected=2,reason='Owner correction')
 assert variant(added['id'],size='10',stock=3,expected=3,ok=False).returncode!=0
 assert variant(added['id'],size='9',stock=3,expected=2,ok=False).returncode!=0
 assert variant(size='11',who=staff,ok=False).returncode!=0
 check(f"(SELECT sum(qty_in)-sum(qty_out)=3 FROM stock_movements WHERE variant_id='{added['id']}')",'size adjustments not ledgered')
 def sale(customer='',stamp=False,paid=500,coupon='',reward=''):
  discount=100 if coupon or reward else 0;total=500-discount
  payload={'request_id':str(uuid.uuid4()),'customer_id':customer,'customer_name':'Customer','subtotal':500,'taxable':total,'discount':discount,'total':total,'paid_amount':min(paid,total),'due_amount':max(total-paid,0),'payment_mode':'Cash','bill_type':'simple','give_stamp':stamp,'coupon_code':coupon,'reward_id':reward}
  items=[{'variant_id':v,'product_name':'Historical Pair','size':'7','qty':1,'price':500}]
  result=call('create_sale',{'sale':payload,'items':items});return result,{'sale':payload,'items':items}
 def void(s,who=owner,ok=True,reason='Duplicate bill',confirmation=None):return call('void_sale',{'sale_id':s['sale_id'],'confirmation':confirmation or s['bill_no'],'reason':reason,'payment_settled':True,'refund_mode':'Cash'},who,ok)
 # Metadata edits leave captured invoice name/size unchanged.
 original,args=sale(c,True,paid=200)
 as_role('authenticated',owner,f"UPDATE products SET article='Renamed Pair',brand='NEW',catalog_description='Optional details' WHERE id='{p}';")
 as_role('authenticated',staff,f"UPDATE products SET article='Unauthorized' WHERE id='{p}';")
 check(f"(SELECT article='Renamed Pair' FROM products WHERE id='{p}') AND (SELECT product_name='Historical Pair' AND size='7' FROM sale_items WHERE sale_id='{original['sale_id']}')",'metadata edit changed history or staff updated product')
 assert void(original,staff,False).returncode!=0
 assert void(original,ok=False,confirmation='WRONG').returncode!=0
 void(original);void(original)
 check(f"(SELECT stock=40 FROM product_variants WHERE id='{v}')",'void did not restore stock exactly once')
 check(f"(SELECT regular_stamps=4 AND regular_visits=4 FROM customers WHERE id='{c}')",'void loyalty reversal failed')
 check(f"(SELECT due_amount=0 AND voided_at IS NOT NULL FROM sales WHERE id='{original['sale_id']}')",'void due not cleared')
 for who in [owner,staff]:
  for table,key in [('sales','id'),('sale_items','sale_id'),('sale_returns','sale_id'),('sale_costs','sale_id')]:
   visible=as_role('authenticated',who,f"SELECT count(*) FROM {table} WHERE {key}='{original['sale_id']}';").stdout.strip();assert visible=='0',(table,visible)
 assert call('create_sale',args,ok=False).returncode!=0
 history=call('list_void_sales',{});assert history['count']==1 and history['rows'][0]['bill_no']==original['bill_no']
 assert call('list_void_sales',{},staff,False).returncode!=0
 assert as_role('authenticated',owner,f"DELETE FROM sales WHERE id='{original['sale_id']}';",False).returncode!=0
 # Coupon is released once; consumed reward is restored without extending its expiry.
 as_role('authenticated',owner,"INSERT INTO coupons(code,kind,value,title)VALUES('VOIDTEST','flat',100,'Test');")
 coupon,args=sale(c,False,coupon='VOIDTEST');void(coupon)
 check("(SELECT used_count=0 FROM coupons WHERE code='VOIDTEST') AND (SELECT count(*)=0 FROM coupon_redemptions)",'void did not release coupon')
 as_role('authenticated',owner,f"INSERT INTO loyalty_rewards(customer_id,card,milestone,amount)VALUES('{c}','regular',5,100);")
 reward=sql(f"SELECT id FROM loyalty_rewards WHERE customer_id='{c}' AND status='active';").stdout.strip()
 redeemed,args=sale(c,False,reward=reward);void(redeemed)
 check(f"(SELECT status='active' AND used_sale_id IS NULL FROM loyalty_rewards WHERE id='{reward}')",'spent-on-voided-bill reward not restored')
 # Later payment / prior return / online order / already spent earned rewards block cancellation atomically.
 credit,_=sale(c,False,paid=200);call('collect_credit_payment',{'sale_id':credit['sale_id'],'amount':50,'mode':'Cash','note':''});assert void(credit,ok=False).returncode!=0
 returned,_=sale();item=sql(f"SELECT id FROM sale_items WHERE sale_id='{returned['sale_id']}';").stdout.strip();call('process_sale_return',{'sale_item_id':item,'variant_id':v,'qty':1,'damaged':False,'kind':'return','refund_mode':'Cash','operation_id':str(uuid.uuid4())});assert void(returned,ok=False).returncode!=0
 # Online-linked bills and spent/unattributable earned rewards require reconciliation.
 booked,_=sale();sql(f"INSERT INTO catalog_bookings(booking_no,variant_id,product_name,size,customer_name,mobile,price,advance,status,expires_at,sale_id)VALUES('BOOKTEST','{v}','Pair','7','Customer','0000000000',500,500,'picked',now(),'{booked['sale_id']}');")
 assert void(booked,ok=False).returncode!=0
 as_role('authenticated',owner,f"UPDATE customers SET last_stamp_date=NULL WHERE id='{c}';")
 earned,_=sale(c,True);as_role('authenticated',owner,f"UPDATE loyalty_rewards SET status='used' WHERE earned_sale_id='{earned['sale_id']}';")
 rejected=void(earned,ok=False);assert rejected.returncode!=0 and 'already been spent' in rejected.stderr
 # A legacy reward review discovered during reversal rolls the entire cancellation back.
 as_role('authenticated',owner,f"UPDATE customers SET regular_stamps=4,regular_visits=4,last_stamp_date=NULL WHERE id='{c}';")
 legacy_case,_=sale(c,True)
 before=call('store_backup_snapshot_v2',{});rejected=void(legacy_case,ok=False);assert rejected.returncode!=0 and 'No changes saved' in rejected.stderr
 assert call('store_backup_snapshot_v2',{})==before
 # Concurrent cancellation requests restore one pair exactly once.
 from concurrent.futures import ThreadPoolExecutor
 concurrent,_=sale();stock=int(sql(f"SELECT stock FROM product_variants WHERE id='{v}';").stdout)
 with ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(lambda _:void(concurrent),range(2)))
 check(f"(SELECT stock={stock+1} FROM product_variants WHERE id='{v}')",'concurrent void restored stock twice')
 assert all(x['voided']for x in results)
 for who,expected in [(owner,4),(staff,0)]:
  count=int(as_role('authenticated',who,"SELECT count(*) FROM loyalty_events WHERE action='bill_voided';").stdout);assert count==expected,(who,count)
 assert call('stored_bill_line_count',{},staff,False).returncode!=0
 assert as_role("authenticated",owner,"SELECT stored_bill_line_count();").stdout.strip()==sql("SELECT count(*)FROM sale_items;").stdout.strip()
 historical=sql("INSERT INTO sales(bill_no,total)VALUES('UNLINKED',500)RETURNING id;").stdout.strip()
 assert call('void_sale',{'sale_id':historical,'confirmation':'UNLINKED','reason':'Old invoice','payment_settled':True,'refund_mode':'Cash'},ok=False).returncode!=0
 # Void and all original line/cost/audit metadata survive backup/reset/restore.
 snapshot=call('store_backup_snapshot_v2',{});call('reset_store_data_v2',{'confirmation':'RESET','fingerprint':snapshot['fingerprint']})
 params=json.dumps(snapshot).replace("'","''");as_role('authenticated',owner,"SELECT restore_store_backup_v2('RESTORE','"+params+"'::jsonb);")
 restored=call('store_backup_snapshot_v2',{});assert restored['tables']==snapshot['tables']
 for migration in ['0033_owner_variant_editor.sql','0034_void_incorrect_bills.sql']:sql((root/'drizzle/migrations'/migration).read_text())
 result={'result':'PASS','scope':'Real offline PostgreSQL17, all migrations; no production writes','checks':['owner size add, unused rename/remove, ledgered quantity adjustment','staff and stale size edits denied','new product metadata does not alter old bill names/sizes','owner confirmation and bill cancellation retry safety','stock/due/loyalty reversed exactly once','void sale/line/returns/cost hidden in all normal owner/staff reads','cancelled request cannot recover as a valid bill','owner-only cancelled bill history; hard-delete blocked','coupon redemption released and consumed voucher restored','later collection/prior return block cancellation atomically','new audit fields survive actual backup/reset/restore','0033 and 0034 reapply safely','online order and spent reward guards','legacy reward conflict fully rolls back cancellation','concurrent cancellation restores stock once','void audit notes and physical line count owner-only']}
 out=Path('/tmp/solestack-audit/owner-product-void');out.mkdir(parents=True,exist_ok=True);(out/'checks.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:run(['docker','rm','-f',container])
