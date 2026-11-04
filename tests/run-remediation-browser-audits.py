"""Run local real-browser regressions with intercepted synthetic app backends.
Requires the dev server on port3000 and Playwright+Chromium. No live writes.
PLAYWRIGHT_MODULE can point to an externally installed Playwright ESM module.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import subprocess,os,json,time
root=Path(__file__).resolve().parents[1]
out=Path(os.environ.get('AUDIT_OUT','/tmp/solestack-audit/remediation-run'));out.mkdir(parents=True,exist_ok=True)
names=['product-photos-browser-audit.mjs','retail-integrity-browser-audit.mjs','presentation-settings-audit.mjs','store-maintenance-browser-audit.mjs','label-dock-audit.mjs','poster-studio-audit.mjs','catalog-theme-audit.mjs','browser-audit.mjs','storage-meter-browser-audit.mjs','catalog-product-gallery-audit.mjs','ivory-background-audit.mjs','catalog-product-actions-audit.mjs','sales-financial-browser-audit.mjs','operations-safety-browser-audit.mjs','receipts-financial-browser-audit.mjs','catalog-order-recovery-browser-audit.mjs','order-fulfillment-browser-audit.mjs']
def audit(name):
 original=root/'tests'/name
 source=original.read_text().replace('http://localhost:8080/','http://127.0.0.1:3000/').replace('import.meta.url',json.dumps(original.as_uri()))
 script=out/('coverage-'+name);script.write_text(source);started=time.monotonic()
 try:
  result=subprocess.run(['node',str(script)],cwd=root,env=os.environ,capture_output=True,text=True,timeout=180)
  (out/(name+'.log')).write_text(result.stdout+result.stderr)
  return {'test':name,'exit':result.returncode,'seconds':round(time.monotonic()-started,1)}
 except subprocess.TimeoutExpired as e:
  (out/(name+'.log')).write_text('Timed out after180seconds\n'+str(e.stdout)+str(e.stderr));return {'test':name,'exit':'timeout'}
results=[]
with ThreadPoolExecutor(max_workers=3)as executor:
 for future in as_completed([executor.submit(audit,name)for name in names]):
  result=future.result();results.append(result);print(json.dumps(result),flush=True)
  (out/'browser-coverage.json').write_text(json.dumps(results,indent=2)+'\n')
raise SystemExit(0 if all(r['exit']==0 for r in results)else 1)
