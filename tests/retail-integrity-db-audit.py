"""Real PostgreSQL/RLS audit on a disposable offline container. No app env/live DB."""
from pathlib import Path
import sys
latest="--latest"in sys.argv
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
  if path.name<'0032_':sql(path.read_text())

 owner='00000000-0000-4000-8000-000000000001'; staff='00000000-0000-4000-8000-000000000002'; outsider='00000000-0000-4000-8000-000000000003'
 product='10000000-0000-4000-8000-000000000001'; old='20000000-0000-4000-8000-000000000001'; new='20000000-0000-4000-8000-000000000002'; customer='30000000-0000-4000-8000-000000000001'
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test'),('{outsider}','pending@example.test');")
 as_role('authenticated',owner,f"SELECT set_team_role('{staff}','staff');")
 as_role('authenticated',owner,f"""INSERT INTO products(id,article,brand,selling_price)VALUES('{product}','Audit "Pair"','Demo',2200);
 INSERT INTO product_variants(id,product_id,size,stock,barcode,sku,rack)VALUES('{old}','{product}','7',100,'DEMO7','SKU7','A'),('{new}','{product}','8',100,'DEMO8','SKU8','B');
 INSERT INTO product_costs(product_id,purchase_price)VALUES('{product}',1400);
 INSERT INTO customers(id,name,mobile,regular_stamps,regular_visits)VALUES('{customer}','Audit Customer','0000000000',4,4);""")
 # Applying the update with existing business data is definition-only.
 before=json.loads(as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout)
 sql((root/'drizzle/migrations/0032_retail_integrity.sql').read_text())
 after=json.loads(as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout)
 added={'client_request_id','request_hash','request_result','stamp_regular_reversed','stamp_premium_reversed','earned_sale_id','earned_visit_number','replacement_variant_id','replacement_size','refund_mode','operation_id','fingerprint'}
 def original(value):
  if isinstance(value,dict):return {k:original(v)for k,v in value.items()if k not in added}
  if isinstance(value,list):return [original(v)for v in value]
  return value
 assert original(before)==original(after),'migration changed existing business data'
 if latest:
  for path in sorted((root/'drizzle/migrations').glob('*.sql')):
   if path.name>='0033_':sql(path.read_text())
 def call(name,args,who=owner,ok=True):
  params=','.join('_'+k+'=>'+('NULL'if v is None else "'"+json.dumps(v).replace("'","''")+"'::jsonb"if isinstance(v,(list,dict))else 'true'if v is True else 'false'if v is False else str(v)if isinstance(v,(int,float))else "'"+v.replace("'","''")+"'") for k,v in args.items())
  r=as_role('authenticated',who,'SELECT '+name+'('+params+');',ok)
  if ok and name=='restore_store_backup_v2':return None
  return (json.loads(r.stdout) if r.stdout.strip() else None)if ok else r
 def sale(variant=old,amount=2200,cust='',qty=1,request=None,discount=0):
  if latest:sql(f"UPDATE products SET selling_price={amount} WHERE id='{product}';")
  payload={'request_id':request or str(uuid.uuid4()),'customer_id':cust,'customer_name':'Audit Customer','subtotal':amount*qty,'taxable':amount*qty-discount,'discount':discount,'total':amount*qty-discount,'paid_amount':amount*qty-discount,'payment_mode':'Cash','bill_type':'simple','give_stamp':bool(cust)}
  items=[{'variant_id':variant,'product_name':'Audit Pair','size':'7'if variant==old else'8','price':amount,'qty':qty}]
  return call('create_sale',{'sale':payload,'items':items}),{'sale':payload,'items':items}
 def item(s):return sql("SELECT id FROM sale_items WHERE sale_id='"+s['sale_id']+"';").stdout.strip()
 def ret(s,kind='return',variant=old,replacement=None,qty=1,mode='Cash',operation=None,who=owner,ok=True):
  return call('process_sale_return',{'sale_item_id':item(s),'variant_id':variant,'qty':qty,'damaged':kind=='defect','kind':kind,'refund_mode':None if kind=='exchange'else mode,'replacement_variant_id':replacement,'operation_id':operation or str(uuid.uuid4())},who,ok)
 first,args=sale()
 before=sql('SELECT count(*) FROM sales;').stdout
 again=call('create_sale',args);assert again==first and sql('SELECT count(*) FROM sales;').stdout==before
 changed=json.loads(json.dumps(args));changed['sale']['total']=1
 assert call('create_sale',changed,ok=False).returncode!=0
 # Concurrent retries also consume stock and bill number only once.
 from concurrent.futures import ThreadPoolExecutor
 args['sale']['request_id']=str(uuid.uuid4())
 with ThreadPoolExecutor(max_workers=2)as pool:
  results=list(pool.map(lambda _:call('create_sale',args),range(2)))
 assert results[0]==results[1]
 # Same-price size exchange moves stock and no financial columns or new bills.
 financial_before=sql("SELECT jsonb_build_object('sales',(SELECT count(*) FROM sales),'total',(SELECT sum(total) FROM sales),'profit',(SELECT sum(profit) FROM sale_costs));").stdout
 oldstock=int(sql(f"SELECT stock FROM product_variants WHERE id='{old}';").stdout);newstock=int(sql(f"SELECT stock FROM product_variants WHERE id='{new}';").stdout)
 op=str(uuid.uuid4());ret(first,'exchange',replacement=new,operation=op);ret(first,'exchange',replacement=new,operation=op)
 assert int(sql(f"SELECT stock FROM product_variants WHERE id='{old}';").stdout)==oldstock+1
 assert int(sql(f"SELECT stock FROM product_variants WHERE id='{new}';").stdout)==newstock-1
 assert financial_before==sql("SELECT jsonb_build_object('sales',(SELECT count(*) FROM sales),'total',(SELECT sum(total) FROM sales),'profit',(SELECT sum(profit) FROM sale_costs));").stdout
 pos=as_role('authenticated',owner,"SELECT jsonb_agg(p) FROM sale_return_positions('"+item(first)+"')p;").stdout
 assert json.loads(pos)==[{'variant_id':new,'size':'8','qty':1}]
 assert ret(first,variant=old,ok=False).returncode!=0
 returned=ret(first,variant=new,who=staff);assert returned['refund']==2200 and returned['payout']==2200
 assert not json.loads(as_role('authenticated',owner,"SELECT coalesce(jsonb_agg(p),'[]'::jsonb) FROM sale_return_positions('"+item(first)+"')p;").stdout)
 assert ret(first,variant=new,ok=False).returncode!=0
 assert ret(first,variant=new,who=outsider,ok=False).returncode!=0
 assert call('process_return',{'sale_item_id':item(first),'qty':1,'damaged':False,'kind':'exchange','note':''},ok=False).returncode!=0
 # Staff may read operational return data but not costs, including through RPC.
 assert as_role('authenticated',staff,'SELECT refund,kind FROM sale_returns;').returncode==0
 assert as_role('authenticated',staff,'SELECT cost_reversal FROM sale_returns;',False).returncode!=0
 ids=sql('SELECT id FROM sale_returns ORDER BY id;').stdout.split()
 assert as_role('authenticated',staff,"SELECT * FROM return_cost_reversals(ARRAY['"+ids[0]+"']::uuid[]);",False).returncode!=0
 costs=json.loads(as_role('authenticated',owner,"SELECT jsonb_agg(r) FROM return_cost_reversals(ARRAY['"+"','".join(ids)+"']::uuid[])r;").stdout)
 assert sum(float(r['cost_reversal'])for r in costs)==1400
 # Staff cannot hide an owner reward-review exception by forging an acknowledgement.
 forged=as_role('authenticated',staff,f"INSERT INTO loyalty_events(customer_id,action,user_id)VALUES('{customer}','return_reward_reviewed','{staff}');",False)
 assert forged.returncode!=0 and 'Owner access required' in forged.stderr
 # CSV add/replace, no-write preview, preserved identifiers, atomic errors, safe retry.
 rows=[{'brand':'Demo','article':'Audit "Pair"','size':'7','qty':'2'}]
 current=int(sql(f"SELECT stock FROM product_variants WHERE id='{old}';").stdout)
 preview=call('import_stock_csv',{'rows':rows,'mode':'add','preview':True})
 assert preview['plan'][0]['after']==current+2 and int(sql(f"SELECT stock FROM product_variants WHERE id='{old}';").stdout)==current
 op=str(uuid.uuid4());imp={'rows':rows,'mode':'add','preview':False,'operation_id':op,'expected':preview['plan']}
 call('import_stock_csv',imp);call('import_stock_csv',imp)
 check(f"(SELECT stock={current+2} AND barcode='DEMO7' AND sku='SKU7' AND rack='A' FROM product_variants WHERE id='{old}')",'import identifiers/quantity drift')
 check("(SELECT count(*)=1 FROM stock_movements WHERE type='CSV-ADD')",'import ledger missing or duplicated')
 bad=rows+[{'brand':'Demo','article':'Bad later row','size':'9','qty':'not a number'}]
 result=call('import_stock_csv',{'rows':bad,'mode':'add','preview':False,'operation_id':str(uuid.uuid4())},ok=False);assert result.returncode!=0
 check(f"(SELECT stock={current+2} FROM product_variants WHERE id='{old}')",'partial import committed')
 assert call('import_stock_csv',{'rows':rows,'mode':'add','preview':True},staff,False).returncode!=0
 call('import_stock_csv',{'rows':rows,'mode':'replace','preview':False,'operation_id':str(uuid.uuid4())})
 check(f"(SELECT stock=2 FROM product_variants WHERE id='{old}')",'replace did not set stock')
 newrows=[{'brand':'New','article':'Multiline\nArticle','size':'9','qty':'3','cost':'90','selling_price':'200'}]
 fresh_preview=call('import_stock_csv',{'rows':newrows,'mode':'add','preview':True})
 call('import_stock_csv',{'rows':newrows,'mode':'add','preview':False,'operation_id':str(uuid.uuid4()),'expected':fresh_preview['plan']})
 check("(SELECT barcode IS NOT NULL AND stock=3 FROM product_variants WHERE product_id=(SELECT id FROM products WHERE brand='NEW'))",'new import scan code missing')
 # A stock change after preview invalidates confirmation instead of overwriting a sale.
 plan=call('import_stock_csv',{'rows':rows,'mode':'replace','preview':True})
 sql(f"SET request.jwt.claim.sub='{owner}';UPDATE product_variants SET stock=stock-1 WHERE id='{old}';")
 stale=call('import_stock_csv',{'rows':rows,'mode':'replace','preview':False,'expected':plan['plan'],'operation_id':str(uuid.uuid4())},ok=False)
 assert stale.returncode!=0 and 'Stock changed since preview' in stale.stderr
 sql(f"SET request.jwt.claim.sub='{owner}';UPDATE product_variants SET stock=10 WHERE id='{old}';")
 # Qualifying stamp is reversed once; a repeat network request has no second effect.
 fifth,_=sale(amount=500,cust=customer)
 check(f"(SELECT regular_stamps=5 AND regular_visits=5 FROM customers WHERE id='{customer}')",'fifth stamp failed')
 op=str(uuid.uuid4());r=ret(fifth,operation=op);ret(fifth,operation=op)
 check(f"(SELECT regular_stamps=4 AND regular_visits=4 FROM customers WHERE id='{customer}')",'stamp reversal incorrect')
 check(f"(SELECT status='cancelled' AND amount=100 FROM loyalty_rewards WHERE earned_sale_id='{fifth['sale_id']}')",'unearned reward remains active')
 # Legacy voucher stays intact; used tracked voucher is flagged, never repriced or charged back.
 as_role('authenticated',owner,f"INSERT INTO loyalty_rewards(customer_id,card,milestone,amount)VALUES('{customer}','regular',10,250);")
 fifth2,_=sale(amount=500,cust=customer)
 as_role('authenticated',owner,f"UPDATE loyalty_rewards SET status='used' WHERE earned_sale_id='{fifth2['sale_id']}';")
 used=ret(fifth2);assert used['loyalty_review']is True
 check(f"(SELECT status='used' AND amount=100 FROM loyalty_rewards WHERE earned_sale_id='{fifth2['sale_id']}')",'spent voucher altered')
 check(f"EXISTS(SELECT 1 FROM loyalty_rewards WHERE customer_id='{customer}' AND amount=250 AND status='active')",'legacy reward altered')
 # Fresh stock and cumulative penny rounding, payout method, damaged returns.
 sql(f"SET request.jwt.claim.sub='{owner}';UPDATE product_variants SET stock=50 WHERE id='{old}';")
 three,_=sale(amount=999,qty=3,discount=100)
 assert ret(three,mode=None,ok=False).returncode!=0
 for _ in range(3):ret(three,mode='UPI')
 check(f"(SELECT sum(refund)=2897 AND bool_and(refund_mode='UPI') FROM sale_returns WHERE sale_id='{three['sale_id']}')",'separate refunds lost rounding precision or method')
 damaged,_=sale(amount=500);before_damage=int(sql(f"SELECT damaged_stock FROM product_variants WHERE id='{old}';").stdout);ret(damaged,'defect',mode='Card')
 check(f"(SELECT damaged_stock={before_damage+1} FROM product_variants WHERE id='{old}')",'damaged stock incorrect')
 # Card cycle boundaries and partial returns use retained purchase eligibility.
 as_role('authenticated',owner,f"UPDATE customers SET regular_stamps=19,regular_visits=19,last_stamp_date=NULL WHERE id='{customer}';")
 twentieth,_=sale(amount=500,cust=customer)
 check(f"(SELECT regular_stamps=0 AND regular_visits=20 FROM customers WHERE id='{customer}')",'20-stamp wrap failed')
 ret(twentieth)
 check(f"(SELECT regular_stamps=19 AND regular_visits=19 FROM customers WHERE id='{customer}')",'20th return did not restore previous cycle position')
 premium='30000000-0000-4000-8000-000000000002'
 as_role('authenticated',owner,f"INSERT INTO customers(id,name,mobile,premium_stamps,premium_visits)VALUES('{premium}','Premium','0000000002',4,4);")
 pair,_=sale(amount=1100,qty=2,cust=premium)
 ret(pair)
 check(f"(SELECT premium_stamps=5 FROM customers WHERE id='{premium}')",'partial return removed still-eligible stamp')
 ret(pair)
 check(f"(SELECT premium_stamps=4 AND premium_visits=4 FROM customers WHERE id='{premium}')",'premium stamp not reversed')
 check(f"(SELECT amount=200 AND status='cancelled' FROM loyalty_rewards WHERE earned_sale_id='{pair['sale_id']}')",'premium reward amount/reversal incorrect')
 invalid=rows+[{'brand':'Bad','article':'NaN','size':'7','qty':'1','cost':'NaN'}]
 assert call('import_stock_csv',{'rows':invalid,'mode':'add','preview':True},ok=False).returncode!=0
 # Definition-only and repeat application preserve every business row.
 snap=as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout
 if latest:
  for path in sorted((root/'drizzle/migrations').glob('*.sql')):
   if path.name>='0035_':sql(path.read_text())
 else:sql((root/'drizzle/migrations/0032_retail_integrity.sql').read_text())
 assert as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout==snap
 # A real backup/reset/restore preserves new exchange, retry and reward fields.
 snapshot=json.loads(as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout)
 call('reset_store_data_v2',{'confirmation':'RESET','fingerprint':snapshot['fingerprint']})
 call('restore_store_backup_v2',{'confirmation':'RESTORE','snapshot':snapshot})
 restored=json.loads(as_role('authenticated',owner,'SELECT store_backup_snapshot_v2();').stdout)
 assert restored['tables']==snapshot['tables'],'new integrity fields did not survive backup/reset/restore'
 # Unknown live billing code must not be overwritten, and all DDL/grants roll back.
 billing_definition=sql("SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure);").stdout
 sql("CREATE OR REPLACE FUNCTION public.create_sale(_sale jsonb,_items jsonb)RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RETURN '{}'::jsonb; END$$;GRANT SELECT(cost_reversal) ON public.sale_returns TO authenticated;")
 failed=sql((root/'drizzle/migrations/0032_retail_integrity.sql').read_text(),False)
 assert failed.returncode!=0 and 'Unexpected create_sale definition' in failed.stderr
 check("has_column_privilege('authenticated','public.sale_returns','cost_reversal','SELECT')",'failed migration partially committed a privilege change')
 sql(billing_definition+";\nREVOKE SELECT(cost_reversal) ON public.sale_returns FROM authenticated;")
 result={'result':'PASS','scope':('All checked-in migrations and genuine RPCs; no live writes'if latest else'Disposable offline PostgreSQL17; checked-in migrations through0032; no live writes'),'checks':['same and concurrent billing retry returns one bill','payload mismatch rejected','size swap atomic and no duplicate revenue/profit','return replacement size once; over-return blocked','staff operational access retained / cost column and owner RPC denied','CSV add/replace + preserved identifiers + scan codes','CSV preview read-only / bad row rolls everything back','CSV retries do not duplicate stock','full return removes one stamp and unspent fifth-visit reward','used reward flagged without automatic charge; legacy voucher preserved','three separate returns reconcile exact pennies and UPI method','damaged return increments damaged stock','repeat migration preserves backup fingerprint','20-stamp reversal and premium partial/full return rules','non-null integrity fields survive actual backup/reset/restore','stale CSV preview cannot overwrite concurrent stock changes','unknown billing definition fails with full transaction rollback']}
 out=Path('/tmp/solestack-audit/retail-integrity');out.mkdir(parents=True,exist_ok=True);(out/'checks.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 run(['docker','rm','-f',container])
