"""Real PostgreSQL/RLS audit on a disposable offline container. No app env/live DB."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1]
container='solestack-loyalty-'+uuid.uuid4().hex[:8]

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
  if path.name.startswith('0031_'):break
  sql(path.read_text())
 owner='00000000-0000-4000-8000-000000000001'
 product='10000000-0000-4000-8000-000000000001';variant='20000000-0000-4000-8000-000000000001'
 regular='30000000-0000-4000-8000-000000000001';premium='30000000-0000-4000-8000-000000000002';legacy='30000000-0000-4000-8000-000000000003'
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test');")
 as_role('authenticated',owner,f"""INSERT INTO products(id,article,selling_price)VALUES('{product}','Demo Pair',1100);
 INSERT INTO product_variants(id,product_id,size,stock,barcode)VALUES('{variant}','{product}','7',200,'LOYAL7');
 INSERT INTO product_costs(product_id,purchase_price)VALUES('{product}',100);
 INSERT INTO customers(id,name,mobile)VALUES('{regular}','Regular Demo','0000000001'),('{premium}','Premium Demo','0000000002'),('{legacy}','Old Vouchers','0000000003');
 INSERT INTO loyalty_rewards(customer_id,card,milestone,amount,status)VALUES('{legacy}','regular',10,250,'active'),('{legacy}','premium',20,1200,'used');""")
 check("reward_amount('regular',10)=250 AND reward_amount('premium',20)=1200 AND reward_amount('regular',15)=0",'legacy escalating rule not reproduced')
 def definition(name):return sql("SELECT pg_get_functiondef('"+name+"'::regprocedure);").stdout
 before=definition('public.create_sale(jsonb,jsonb)')
 ledger=sql("SELECT jsonb_build_object('stock',(SELECT sum(stock) FROM product_variants),'sales',(SELECT count(*) FROM sales),'sequence',(SELECT last_value FROM bill_seq),'customers',(SELECT jsonb_agg(to_jsonb(c)ORDER BY id) FROM customers c),'rewards',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id) FROM loyalty_rewards r));").stdout
 migration=(root/'drizzle/migrations/0031_fixed_loyalty_rewards.sql').read_text()
 sql(migration);sql(migration)
 assert sql("SELECT jsonb_build_object('stock',(SELECT sum(stock) FROM product_variants),'sales',(SELECT count(*) FROM sales),'sequence',(SELECT last_value FROM bill_seq),'customers',(SELECT jsonb_agg(to_jsonb(c)ORDER BY id) FROM customers c),'rewards',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id) FROM loyalty_rewards r));").stdout==ledger,'migration changed business records'
 import re
 expected=re.sub(r'v_new\s+in\s*\(\s*5\s*,\s*10\s*,\s*20\s*\)','v_new in (5,10,15,20)',before,flags=re.I)
 assert definition('public.create_sale(jsonb,jsonb)')==expected,'billing changed beyond milestone conditions'
 check("reward_amount('regular',5)=100 AND reward_amount('regular',10)=100 AND reward_amount('regular',15)=100 AND reward_amount('regular',20)=100 AND reward_amount('premium',5)=200 AND reward_amount('premium',10)=200 AND reward_amount('premium',15)=200 AND reward_amount('premium',20)=200",'fixed reward amounts incorrect')
 check("reward_amount('regular',1)=0 AND reward_amount('premium',14)=0 AND reward_amount('unknown',5)=0",'invalid milestone/card rewarded')
 for card,customer,total,amount in [('regular',regular,500,100),('premium',premium,1100,200)]:
  as_role('authenticated',owner,f"""DO $test$
  DECLARE r jsonb;i integer;
  BEGIN
   FOR i IN 1..25 LOOP
    UPDATE customers SET last_stamp_date=NULL WHERE id='{customer}';
    r:=create_sale(jsonb_build_object('customer_id','{customer}','subtotal',{total},'taxable',{total},'total',{total},'paid_amount',{total},'bill_type','simple','payment_mode','Cash'),jsonb_build_array(jsonb_build_object('variant_id','{variant}','product_name','Demo Pair','size','7','price',{total},'qty',1)));
    IF i % 5 = 0 THEN
      IF jsonb_array_length(r->'unlocked')<>1 OR (r->'unlocked'->0->>'card')<>'{card}' OR (r->'unlocked'->0->>'amount')::numeric<>{amount} THEN RAISE EXCEPTION 'Wrong reward at visit %: %',i,r;END IF;
    ELSIF jsonb_array_length(r->'unlocked')<>0 THEN RAISE EXCEPTION 'Unexpected reward at visit %',i;END IF;
   END LOOP;
  END $test$;""")
  check(f"(SELECT {card}_visits=25 AND {card}_stamps=5 FROM customers WHERE id='{customer}')",'20-stamp cycle failed')
  check(f"(SELECT count(*)=5 AND min(amount)={amount} AND max(amount)={amount} FROM loyalty_rewards WHERE customer_id='{customer}')",'milestone reward count/amount drifted')
 # The same-day cap and minimum amount must remain intact.
 as_role('authenticated',owner,f"SELECT create_sale(jsonb_build_object('customer_id','{regular}','subtotal',500,'taxable',500,'total',500,'paid_amount',500),jsonb_build_array(jsonb_build_object('variant_id','{variant}','size','7','price',500,'qty',1)));")
 check(f"(SELECT regular_visits=25 FROM customers WHERE id='{regular}')",'same-day stamp duplicated')
 as_role('authenticated',owner,f"UPDATE customers SET last_stamp_date=NULL WHERE id='{regular}';SELECT create_sale(jsonb_build_object('customer_id','{regular}','subtotal',298,'taxable',298,'total',298,'paid_amount',298),jsonb_build_array(jsonb_build_object('variant_id','{variant}','size','7','price',298,'qty',1)));")
 check(f"(SELECT regular_visits=25 FROM customers WHERE id='{regular}')",'minimum eligibility changed')
 as_role('authenticated',owner,f"SELECT create_sale(jsonb_build_object('customer_id','{regular}','subtotal',500,'taxable',500,'total',500,'paid_amount',500,'give_stamp',false),jsonb_build_array(jsonb_build_object('variant_id','{variant}','size','7','price',500,'qty',1)));")
 check(f"(SELECT regular_visits=25 FROM customers WHERE id='{regular}')",'stamp-off switch ignored')
 check(f"(SELECT count(*)=2 AND sum(amount)=1450 FROM loyalty_rewards WHERE customer_id='{legacy}')",'old issued vouchers altered')
 # Unknown live code must fail without partially replacing reward_amount.
 sql("CREATE OR REPLACE FUNCTION public.create_sale(_sale jsonb,_items jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RETURN '{}'::jsonb;END$$;CREATE OR REPLACE FUNCTION public.reward_amount(_card text,_m integer) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$SELECT 777::numeric$$;")
 failed=sql(migration,False);assert failed.returncode!=0 and 'Unexpected loyalty milestone code' in failed.stderr
 check("reward_amount('regular',5)=777",'failure did not roll back the whole migration')
 result={'result':'PASS','database':'Disposable PostgreSQL 17, genuine create_sale/RLS','checks':['legacy increasing rewards reproduced','regular 100 / premium 200 at visits 5,10,15,20,25','20-stamp cycle repeats','only two milestone conditions changed in billing','same-day cap / minimum eligibility / stamp-off preserved','existing active and used vouchers unchanged','repeat apply safe','unexpected billing definition rolls entire migration back'],'liveWrites':0}
 out=Path('/tmp/solestack-audit/loyalty-fixed');out.mkdir(parents=True,exist_ok=True);(out/'checks.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 run(['docker','rm','-f',container])
