"""Offline full-schema Showcase/RLS/storage/reset audit. Never connects to the live shop."""
from pathlib import Path
import subprocess, json, time, uuid, copy
root=Path(__file__).resolve().parents[1]
container='showcase-'+uuid.uuid4().hex[:8]
def run(args,value=None): return subprocess.run(args,input=value,text=True,capture_output=True)
def sql(value,ok=True):
 r=run(['docker','exec','-i',container,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],value)
 if ok and r.returncode: raise RuntimeError(r.stderr)
 return r
owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002'
def asrole(statement,who=owner,role='authenticated',ok=True): return sql(f"SET ROLE {role};SET request.jwt.claim.sub='{who}';"+statement,ok)
def quoted(value): return "'"+json.dumps(value).replace("'","''")+"'::jsonb"
def snapshot(): return json.loads(asrole('SELECT owner_catalog_showcase();').stdout)
def save(config,expected='current',ok=True):
 if expected=='current': expected=snapshot()['config']
 return asrole('SELECT save_catalog_showcase('+quoted(config)+','+('NULL' if expected is None else quoted(expected))+');',ok=ok)
def visible(path): return asrole("SELECT count(*) FROM storage.objects WHERE name='"+path+"';",'', 'anon').stdout.strip()=='1'
def file(path,size=200000,age='0 hours',mime='image/webp'):
 return asrole("INSERT INTO storage.objects(bucket_id,name,metadata,created_at)VALUES('catalog-hero-images','"+path+"',jsonb_build_object('size',"+str(size)+",'mimetype','"+mime+"'),now()-interval '"+age+"');")
r=run(['docker','run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
if r.returncode: raise RuntimeError(r.stderr)
try:
 for _ in range(150):
  logs=run(['docker','logs',container])
  if (logs.stdout+logs.stderr).count('database system is ready to accept connections')>=2 and sql('SELECT 1',False).returncode==0: break
  time.sleep(.1)
 else: raise RuntimeError('PostgreSQL startup timeout')
 sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
 GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz DEFAULT now(),deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT ON storage.objects TO anon;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;""")
 for path in sorted((root/'drizzle/migrations').glob('*.sql')): sql(path.read_text())
 sql((root/'docs/sql/catalog-promotions/photo-storage.sql').read_text())
 unchanged="SELECT md5(string_agg(pg_get_functiondef(x::regprocedure),'|'ORDER BY x)) FROM unnest(ARRAY['public.create_sale(jsonb,jsonb)','public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb)','public.store_backup_snapshot_v2()','public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)','public.restore_store_backup_v2(text,jsonb)','public.save_catalog_promotion(jsonb,jsonb)','public.catalog_hero_storage_usage()'])x;"
 before=sql(unchanged).stdout
 install=(root/'docs/sql/catalog-showcase.sql').read_text();sql(install);sql(install)
 assert before==sql(unchanged).stdout
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');")
 assert snapshot()['config'] is None
 assert asrole("SELECT public_catalog_showcase('all');",'','anon',False).returncode
 for who,role in [(staff,'authenticated'),('','anon')]:
  assert asrole('SELECT owner_catalog_showcase();',who,role,False).returncode
  assert asrole("SELECT save_catalog_showcase('{}',NULL);",who,role,False).returncode
  assert asrole('SELECT unused_catalog_showcase_photos();',who,role,False).returncode
 assert asrole("UPDATE store_settings SET offer_showcase='{}' WHERE id=1 RETURNING id;",staff).stdout.strip()==''
 p='showcase/'+str(uuid.uuid4())+'.webp';thumb=p.replace('.webp','-thumb.webp')
 file(p);file(thumb,15000)
 assert not visible(p) and not visible(thumb)
 config={'version':1,'enabled':True,'items':[{'id':str(uuid.uuid4()),'title':'A poster','audience':'men','enabled':True,'productId':None,'image':{'kind':'upload','path':p,'bytes':200000,'thumbnailBytes':15000,'width':1200,'height':1600}}]}
 save(config);assert visible(p) and visible(thumb)
 public=json.loads(asrole("SELECT public_catalog_showcase('men');",'','anon').stdout)['config'];assert public==config
 assert json.loads(asrole("SELECT public_catalog_showcase('women');",'','anon').stdout)['config']['items']==[]
 assert asrole("DELETE FROM storage.objects WHERE name='"+p+"' RETURNING name;").stdout.strip()==''
 assert asrole("UPDATE storage.objects SET metadata='{}' WHERE name='"+p+"' RETURNING name;").stdout.strip()==''
 off=copy.deepcopy(config);off['enabled']=False;save(off);assert not visible(p)
 assert asrole("DELETE FROM storage.objects WHERE name='"+p+"' RETURNING name;").stdout.strip()==''
 hidden=copy.deepcopy(config);hidden['items'][0]['enabled']=False;save(hidden);assert not visible(p)
 save(config)
 # Retries after a committed response loss are idempotent, other stale overwrites fail.
 assert save(config,expected=None).returncode==0
 other=copy.deepcopy(config);other['enabled']=False;assert save(other,expected=None,ok=False).returncode
 for patch in [{'bytes':200001},{'bytes':409601},{'thumbnailBytes':40961},{'path':'hero/'+str(uuid.uuid4())+'.webp'},{'path':'showcase/'+str(uuid.uuid4())+'.webp'},{'width':1601},{'url':'https://example.test/evil'}]:
  bad=copy.deepcopy(config);bad['items'][0]['image'].update(patch);assert save(bad,ok=False).returncode
 bad=copy.deepcopy(config);bad['items']*=13;assert save(bad,ok=False).returncode
 seed=copy.deepcopy(config);seed['items'][0]['image']={'kind':'seed','key':'flyo'};save(seed);assert not visible(p)
 wrong=copy.deepcopy(seed);wrong['items'][0]['audience']='women';assert save(wrong,ok=False).returncode
 wrong=copy.deepcopy(seed);wrong['items'][0]['image']={'kind':'seed','invalid':True};assert save(wrong,ok=False).returncode
 wrong=copy.deepcopy(seed);wrong['version']='1';assert save(wrong,ok=False).returncode
 pending=json.loads(asrole('SELECT unused_catalog_showcase_photos(ARRAY['+"'"+p+"','"+thumb+"']);").stdout);assert set(pending)=={p,thumb}
 assert asrole("DELETE FROM storage.objects WHERE name IN ('"+p+"','"+thumb+"') RETURNING name;").stdout.strip()
 # Old abandoned stages survive reload as cleanup candidates; fresh uncertain stages have grace.
 old='showcase/'+str(uuid.uuid4())+'.webp';fresh='showcase/'+str(uuid.uuid4())+'.webp'
 file(old,11111,'2 hours');file(fresh,22222)
 usage=snapshot()['storage'];assert old in usage['pending'] and fresh not in usage['pending']
 assert usage['photo_bytes']==33333
 assert json.loads(asrole('SELECT catalog_hero_storage_usage();').stdout)['photo_bytes']==33333
 # Backup assets/config are already covered by the existing bucket + settings manifest.
 backup=json.loads(asrole('SELECT store_backup_snapshot_v2();').stdout)
 assert {old,fresh}.issubset({a['path'] for a in backup['assets']})
 asrole("SELECT reset_store_data_v2('RESET','"+backup['fingerprint']+"',true,true,false,true);")
 assert snapshot()['config'] is None
 asrole("DELETE FROM storage.objects WHERE bucket_id='catalog-hero-images';SELECT ack_store_file_cleanup('catalog-hero-images',ARRAY['"+old+"','"+fresh+"']);")
 file(old,11111);file(fresh,22222)
 asrole("SELECT restore_store_backup_v2('RESTORE',"+quoted(backup)+");")
 assert snapshot()['config']==seed
 assert sql(unchanged).stdout==before
 print(json.dumps({'passed':True,'ownerOnly':True,'publicAudienceAndOffGates':True,'savedFilesProtectedWhileOff':True,'boundedMetadataAndActualObjectChecks':True,'staleWriteAndLostResponseRecovery':True,'unusedCleanupGrace':True,'meterCountsActualCustomBytes':True,'backupResetRestore':True,'financialAndMaintenanceDefinitionsUnchanged':True,'liveWrites':0}))
finally: run(['docker','rm','-f',container])
