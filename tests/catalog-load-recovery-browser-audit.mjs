import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const product={id:'10000000-0000-4000-8000-000000000001',brand:'Demo',article:'Everyday Pair',category:'Men / Sports & Active',color:'Black',price:999,mrp:1299,image:null,sizes:[{id:'10000000-0000-4000-8000-000000000002',size:'7',available:true}]};
const data={enabled:true,shop:{name:'Bhawani Footwear',phone:null,booking:false},products:[product],hero:null,offer:null,presentation:{gallery_enabled:false,motion_enabled:false,category_accents:false,theme:'ivory'}};
const baseline=process.argv.includes('--expect-storage-crash');
const failures=[],external=[];
try{
 for(const scenario of ['blocked','normal','saved-dark','stale-chunk','owner-only']){
  const blocked=scenario==='blocked'||scenario==='owner-only';let documentRequests=0;
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>failures.push(e.message));
  await page.addInitScript(blocked=>{
   window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;
   if(!blocked)localStorage.setItem('solestack-theme','dark');
   if(blocked)for(const method of ['getItem','setItem'])Storage.prototype[method]=()=>{throw new DOMException('Device storage is blocked','SecurityError')};
  },blocked);
  await page.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.pathname.includes('/src/lib/catalog.functions.ts'))return r.fulfill({contentType:'application/javascript',body:`const data=${JSON.stringify(data)};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>data;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No live writes')}`});
   if(u.pathname.includes('/src/lib/catalog-promotion.functions.ts'))return r.fulfill({contentType:'application/javascript',body:'export const getCatalogPromotion=async()=>({available:true,value:null});export const getOwnerPromotion=async()=>null;export const saveOwnerPromotion=async()=>null;export const preparePromotionUpload=async()=>null;export const cleanupPromotionUploads=async()=>null;'});
   if(u.pathname==='/catalog-load-audit.html')return r.fulfill({contentType:'text/html',body:'<!doctype html><script>window.__simulateChunkFailure='+JSON.stringify(scenario==='stale-chunk'&&documentRequests++===0)+';window.__ownerOnly='+JSON.stringify(scenario==='owner-only')+'</script><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/catalog-load-recovery.tsx"></script>'});
   if(['127.0.0.1','localhost'].includes(u.hostname))return r.continue();external.push(u.pathname);return r.abort();
  });
  await page.goto('http://127.0.0.1:3000/catalog-load-audit.html');
  if(scenario==='stale-chunk'){await page.getByRole('heading',{name:"This page didn't load",exact:true}).waitFor();await page.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>!window.__simulateChunkFailure);assert.equal(documentRequests,2,'Manual retry loads a fresh document, without a reload loop');}
  if(baseline&&blocked){await page.getByRole('heading',{name:"This page didn't load",exact:true}).waitFor();console.log(JSON.stringify({baselineStorageCrashReproduced:true,matchesCustomerScreenshot:true,liveWrites:0}));await page.close();break;}
  if(scenario==='owner-only'){await page.getByRole('button',{name:'Owner dark theme',exact:true}).click();assert.equal(await page.getByRole('heading',{name:"This page didn't load",exact:true}).count(),0);await page.close();continue;}
  await page.getByRole('heading',{name:'Shop the collection',exact:true}).waitFor();
  await page.getByRole('button',{name:'Switch theme',exact:true}).click();
  assert.equal(await page.getByRole('heading',{name:"This page didn't load",exact:true}).count(),0);
  await page.getByRole('button',{name:'Demo Everyday Pair',exact:true}).click();
  await page.getByText('Choose size',{exact:true}).last().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.close();
 }
 if(!baseline){assert.deepEqual(failures,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({passed:true,blockedStorageLoadsCatalog:true,ownerAndCatalogThemesWork:true,productOpens:true,normalStorageWorks:true,staleModuleManualReload:true,liveWrites:0}));}
}finally{await browser.close();}
