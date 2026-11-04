"""Package definition-only updates for SQL editors limited to 200 lines.
Never split functions/DO blocks or leave their grants to another transaction.
"""
from pathlib import Path
import re,hashlib,json
root=Path(__file__).resolve().parents[1]
out=root/'docs/sql/operations-update-parts'
out.mkdir(parents=True,exist_ok=True)
preflight="""DO $preflight$
BEGIN
 IF to_regprocedure('public.void_sale(uuid,text,text,boolean,text)') IS NULL
 OR to_regprocedure('public.edit_product_variant(uuid,uuid,text,integer,integer,boolean,text)') IS NULL
 OR to_regprocedure('public.retail_integrity_version()') IS NULL
 THEN RAISE EXCEPTION 'Required updates0032-0034 are missing. Stop and apply their approved SQL first.';END IF;
 IF public.retail_integrity_version()<>32 OR public.reward_amount('regular',5)<>100 OR public.reward_amount('premium',5)<>200 THEN
 RAISE EXCEPTION 'Required retail/loyalty version does not match. Stop; do not replay old migrations.';END IF;
END $preflight$;"""
for old in out.glob('part-*.sql'):old.unlink()
manifest=[]
for path in sorted((root/'drizzle/migrations').glob('*.sql')):
 if path.name<'0035_':continue
 source=path.read_text()
 body=re.sub(r'^BEGIN;\s*','',source,count=1,flags=re.M)
 body=re.sub(r'^COMMIT;\s*$','',body,count=1,flags=re.M).strip()
 # Each chunk begins at a whole function. Its REVOKE/GRANT and following DO
 # blocks remain attached, so default PUBLIC execution never leaks on commit.
 groups=re.split(r'(?=^CREATE OR REPLACE FUNCTION )',body,flags=re.M)
 chunks=[];current=''
 for group in groups:
  if not group:continue
  if len((current+group).splitlines())>175 and current:
   chunks.append(current.rstrip());current=''
  current+=group
 if current.strip():chunks.append(current.rstrip())
 for chunk in chunks:
  number=len(manifest)+1
  file=f'part-{number:02d}-{path.stem[:4]}.sql'
  text=f'-- Part {number}. Source: {path.name}. No reset/import/sale is executed.\nBEGIN;\n'
  if number==1:text+=preflight+'\n'
  text+=chunk+f"\nCOMMIT;\nSELECT true AS part_{number:02d}_applied;\n"
  assert len(text.splitlines())<200,(file,len(text.splitlines()))
  (out/file).write_text(text)
  manifest.append({'file':file,'source':path.name,'lines':len(text.splitlines()),'sha256':hashlib.sha256(text.encode()).hexdigest()})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'verify.sql').write_text("""-- Read-only final check. Ready must be true; then publish matching frontend.
SELECT public.operational_safety_version()=40
 AND to_regprocedure('public.adjust_inventory(uuid,integer,integer,integer,integer,text,text,text)')IS NOT NULL
 AND to_regprocedure('public.receive_customer_payment(uuid,numeric,text,text,uuid)')IS NOT NULL
 AND to_regprocedure('public.collect_credit_payment_v2(uuid,numeric,text,text,uuid)')IS NOT NULL
 AND to_regprocedure('public.record_supplier_payment_v2(uuid,numeric,text,text,uuid,uuid)')IS NOT NULL
 AND to_regprocedure('public.receive_stock_v2(uuid,text,text,jsonb,uuid)')IS NOT NULL
 AND to_regprocedure('public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb)')IS NOT NULL
 AND to_regprocedure('public.record_catalog_refund(uuid,text,text,uuid)')IS NOT NULL
 AND to_regprocedure('public.import_legacy_store(jsonb,uuid)')IS NOT NULL
 AND to_regprocedure('public.resolve_pending_operation(uuid,boolean,text)')IS NOT NULL
 AND NOT has_table_privilege('authenticated','public.credit_payments','INSERT')
 AND NOT has_table_privilege('authenticated','public.product_variants','UPDATE')
 AS ready_for_matching_frontend;
SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')AS optional_idle_scheduler_available;
""")
print(json.dumps(manifest))
