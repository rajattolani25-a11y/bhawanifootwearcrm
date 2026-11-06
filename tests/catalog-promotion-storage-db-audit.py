"""Full-schema, offline PostgreSQL/RLS/backup-reset-restore audit; no live backend."""
from pathlib import Path
import subprocess,json,time,uuid
root=Path(__file__).resolve().parents[1];container='promo-storage-'+uuid.uuid4().hex[:8]
def run(args,value=None):return subprocess.run(args,input=value,text=True,capture_output=True)
def sql(value,ok=True):
 r=run(['docker','exec','-i',container,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-qAt'],value)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r
owner='00000000-0000-4000-8000-000000000001';staff='00000000-0000-4000-8000-000000000002'
def asrole(statement,who=owner,role='authenticated',ok=True):return sql(f"SET ROLE {role};SET request.jwt.claim.sub='{who}';"+statement,ok)
def quoted(v):return "'"+json.dumps(v).replace("'","''")+"'::jsonb"
def snapshot():return json.loads(asrole('SELECT public.owner_catalog_promotion();').stdout)
def save(c,ok=True):return asrole('SELECT public.save_catalog_promotion('+quoted(c)+','+quoted(snapshot())+');',ok=ok)
def file(path,size=200000,age='0 hours'):
 return asrole("INSERT INTO storage.objects(bucket_id,name,metadata,created_at)VALUES('catalog-hero-images','"+path+"',jsonb_build_object('size',"+str(size)+",'mimetype','image/webp'),now()-interval '"+age+"');")
def visible(path,role='anon',who=''):return asrole("SELECT count(*) FROM storage.objects WHERE bucket_id='catalog-hero-images' AND name='"+path+"';",who,role).stdout.strip()=='1'
r=run(['docker','run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
if r.returncode:raise RuntimeError(r.stderr)
try:
 for _ in range(150):
  logs=run(['docker','logs',container]);
  if (logs.stdout+logs.stderr).count('database system is ready to accept connections')>=2 and sql('SELECT 1',False).returncode==0:break
  time.sleep(.1)
 else:raise RuntimeError('PostgreSQL startup timeout')
 sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
 GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz DEFAULT now(),deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT ON storage.objects TO anon;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE PUBLICATION supabase_realtime;""")
 for path in sorted((root/'drizzle/migrations').glob('*.sql')):sql(path.read_text())
 unchanged="SELECT md5(string_agg(pg_get_functiondef(x::regprocedure),'|'ORDER BY x)) FROM unnest(ARRAY['public.create_sale(jsonb,jsonb)','public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb)','public.store_backup_snapshot_v2()','public.reset_store_data_v2(text,text,boolean,boolean,boolean,boolean)','public.restore_store_backup_v2(text,jsonb)'])x;"
 before=sql(unchanged).stdout
 install=(root/'docs/sql/catalog-promotions/photo-storage.sql').read_text();sql(install);sql(install)
 assert before==sql(unchanged).stdout
 assert sql((root/'docs/sql/catalog-promotions/install.sql').read_text(),False).returncode
 assert before==sql(unchanged).stdout
 sql(f"INSERT INTO auth.users(id,email)VALUES('{owner}','owner@example.test'),('{staff}','staff@example.test');SET request.jwt.claim.sub='{owner}';SELECT set_team_role('{staff}','staff');")
 for who,role in [(staff,'authenticated'),('','anon')]:
  assert asrole("SELECT prepare_catalog_promotion_photo('men','advance');",who,role,False).returncode
  assert asrole('SELECT owner_catalog_promotion_storage();',who,role,False).returncode
 p=asrole("SELECT prepare_catalog_promotion_photo('men','advance');").stdout.strip();file(p)
 live='promotions/men/live/'+str(uuid.uuid4())+'.webp';file(live)
 assert not visible(p)
 assert asrole("INSERT INTO storage.objects(bucket_id,name)VALUES('catalog-hero-images','promotions/staff.webp');",staff,ok=False).returncode
 dates=json.loads(sql("SELECT jsonb_build_object('announceAt',now()-interval '1 hour','startsAt',now()+interval '1 hour','endsAt',now()+interval '2 hours');").stdout)
 image=lambda path,size=200000:{'storage':'shop','path':path,'bytes':size,'width':1200,'height':600}
 campaign={'audience':'men','enabled':True,'title':'Store edit','subtitle':'','coupon':'','productIds':[],'advance':{'layout':'classic','image':image(p)},'live':{'layout':'split','image':image(live)},'schedule':dates}
 settings={**snapshot(),'enabled':True,'config':{'version':1,'campaigns':[campaign]}};save(settings)
 assert visible(p) and not visible(live)
 assert asrole("UPDATE storage.objects SET metadata='{}' WHERE name='"+p+"' RETURNING name;").stdout.strip()==''
 # Saved files remain protected even if marketing is OFF.
 assert asrole("DELETE FROM storage.objects WHERE name='"+p+"' RETURNING name;").stdout.strip()==''
 off={**settings,'enabled':False};save(off);assert not visible(p)
 assert asrole("DELETE FROM storage.objects WHERE name='"+p+"' RETURNING name;").stdout.strip()==''
 save(settings)
 # Validate actual uploaded size, reject missing/forged/oversized paths atomically.
 for patch in [{'bytes':199999},{'bytes':409601},{'path':'hero/'+str(uuid.uuid4())+'.webp'},{'path':'promotions/men/advance/'+str(uuid.uuid4())+'.webp'}]:
  bad=json.loads(json.dumps(settings));bad['config']['campaigns'][0]['advance']['image'].update(patch);assert save(bad,False).returncode
 replacement='promotions/men/advance/'+str(uuid.uuid4())+'.webp';file(replacement)
 settings['config']['campaigns'][0]['advance']['image']=image(replacement);save(settings)
 usage=json.loads(asrole('SELECT owner_catalog_promotion_storage();').stdout);assert p in usage['pending'] and usage['photo_bytes']==600000
 assert not visible(p) and visible(replacement)
 assert asrole("DELETE FROM storage.objects WHERE name='"+p+"' RETURNING name;").stdout.strip()==p
 asrole("SELECT ack_store_file_cleanup('catalog-hero-images',ARRAY['"+p+"']);")
 # A fresh discarded upload is retained for recovery; an old orphan is eligible for cleanup.
 orphan='promotions/women/live/'+str(uuid.uuid4())+'.webp';file(orphan,123456,'2 hours')
 fresh='promotions/women/advance/'+str(uuid.uuid4())+'.webp';file(fresh,100000)
 usage=json.loads(asrole('SELECT owner_catalog_promotion_storage();').stdout);assert orphan in usage['pending'] and fresh not in usage['pending']
 # All native promo files are already part of the existing backup and measured hero bucket.
 sizes=json.loads(sql("SELECT jsonb_object_agg(name,(metadata->>'size')::integer) FROM storage.objects;").stdout)
 backup=json.loads(asrole('SELECT store_backup_snapshot_v2();').stdout)
 assert replacement in [a['path'] for a in backup['assets']] and live in [a['path'] for a in backup['assets']]
 assert json.loads(asrole('SELECT catalog_hero_storage_usage();').stdout)['photo_bytes']==usage['photo_bytes']
 # Existing verified reset clears promotion settings and queues native files without any definition patch.
 asrole("SELECT reset_store_data_v2('RESET','"+backup['fingerprint']+"',true,true,false,true);")
 assert snapshot()['config'] is None
 assert asrole("SELECT count(*) FROM store_file_cleanup WHERE reason='reset';").stdout.strip()==str(len(backup['assets']))
 asrole("DELETE FROM storage.objects WHERE bucket_id='catalog-hero-images';SELECT ack_store_file_cleanup('catalog-hero-images',ARRAY["+','.join("'"+a['path']+"'" for a in backup['assets'])+"]);")
 for asset in backup['assets']:file(asset['path'],sizes[asset['path']])
 asrole("SELECT restore_store_backup_v2('RESTORE',"+quoted(backup)+");")
 assert snapshot()['config']==settings['config']
 assert asrole("DELETE FROM storage.objects WHERE name='"+replacement+"' RETURNING name;").stdout.strip()==''
 assert sql(unchanged).stdout==before
 assert all(x=='t' for x in sql((root/'docs/sql/catalog-promotions/verify-photo-storage.sql').read_text()).stdout.strip().split('|'))
 print(json.dumps({'passed':True,'fullSchema':True,'ownerOnlyUploads':True,'currentPhasePublicRead':True,'savedPhotosDeleteProtected':True,'immutableIdentities':True,'sizeAndPathValidation':True,'durableReplacementCleanup':True,'orphanRecoveryGrace':True,'backupResetRestoreRoundtrip':True,'usageIncludesPhotos':True,'financialAndMaintenanceDefinitionsUnchanged':True,'liveWrites':0}))
finally:run(['docker','rm','-f',container])
