import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseCsv} from '../src/lib/csv.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true});const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;});
const rows=[['brand','article','qty'],['=HYPERLINK("https://example.invalid","click")',' \u200b@SUM(A1:A2)',4],['Lakhani','Normal, "quoted"\nline',-3]];
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname==='/csv-security-audit.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><button id="export">Export stock</button><script type="module">import{downloadCsv}from'/src/lib/stock.ts';document.getElementById('export').onclick=()=>downloadCsv('stock.csv',${JSON.stringify(rows)});</script></body></html>`});
 if(url.pathname==='/src/integrations/supabase/client.ts')return route.fulfill({contentType:'application/javascript',body:'export const supabase={};'});
 if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();external.push(url.origin);return route.abort();
});
try{
 await page.goto('http://127.0.0.1:3000/csv-security-audit.html');
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Export stock',exact:true}).click();const download=await waiting;
 assert.equal(download.suggestedFilename(),'stock.csv');const text=await fs.readFile(await download.path(),'utf8');const parsed=parseCsv(text);
 assert.equal(parsed[0].brand,"'"+rows[1][0]);assert.equal(parsed[0].article,"'"+rows[1][1]);assert.equal(parsed[0].qty,'4');assert.equal(parsed[1].qty,'-3');assert.equal(parsed[1].article,rows[2][1]);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({passed:true,realStockCsvDownload:true,formulaPayloadsInert:true,normalQuotedDataAndNegativeNumbersPreserved:true,externalRequests:0,liveWrites:0}));
}finally{await browser.close();}
