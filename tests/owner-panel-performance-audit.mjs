import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],external=[];
const heavy=['CatalogHeroPreview','CatalogProductControls','CatalogPromotionSettings','StoreMaintenance','StorageMeter','OwnershipTransfer'];
const requests=[];
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(20000);
const deadline=setTimeout(()=>{console.error('Owner performance audit deadline');process.exit(1);},100000);
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__reads=[];window.__mounts={};});
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 const name=u.pathname.match(/\/src\/components\/(\w+)\.tsx$/)?.[1];
 if(heavy.includes(name)){
  requests.push(name);
  return route.fulfill({contentType:'application/javascript',body:`export function ${name}(){const React=window.__React;const [draft,setDraft]=React.useState('');React.useEffect(()=>{window.__mounts['${name}']=(window.__mounts['${name}']||0)+1},[]);return React.createElement('input',{'aria-label':'${name} draft',value:draft,onChange:e=>setDraft(e.target.value)})}`});
 }
 if(['CatalogThemeSettings','CatalogPresentationSettings'].includes(name))return route.fulfill({contentType:'application/javascript',body:`export function ${name}(){return null;}`});
 if(u.pathname.includes('/src/hooks/use-auth'))return route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({isOwner:true,loading:false,user:{id:'local-owner'}});`});
 if(u.pathname.includes('/src/integrations/supabase/client.ts'))return route.fulfill({contentType:'application/javascript',body:`export const supabase={from(table){const result=()=>{window.__reads.push(table);return {data:table==='store_settings'?{id:1,business_name:'Local Shop',catalog_enabled:true}:[],error:null}};const query=new Proxy({},{get:(_,key)=>key==='then'?(resolve)=>resolve(result()):key==='single'?async()=>result():()=>query});return query}};`});
 if(u.pathname==='/owner-panel-audit.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/owner-panel-performance.tsx"></script>'});
 if(['localhost','127.0.0.1'].includes(u.hostname))return route.continue();
 external.push(u.hostname);return route.abort();
});
try{
 await page.goto('http://127.0.0.1:3000/owner-panel-audit.html?studio');
 await page.getByRole('tab',{name:'Appearance',exact:true}).waitFor();
 assert.deepEqual(requests,[],'Studio heavy editor code is not requested on initial Appearance');
 const visit=async(tab,component)=>{
  await page.getByRole('tab',{name:tab,exact:true}).click();
  await page.getByRole('textbox',{name:component+' draft'}).fill('Unsaved draft survives');
  await page.getByRole('tab',{name:'Appearance',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:component+' draft'}).isVisible(),false,'Inactive panel stays hidden');
  await page.getByRole('tab',{name:tab,exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:component+' draft'}).inputValue(),'Unsaved draft survives');
  assert.equal(await page.evaluate(c=>window.__mounts[c],component),1,'Editor is not remounted');
 };
 await visit('Design & hero','CatalogHeroPreview');
 await visit('Offers & coupons','CatalogPromotionSettings');
 await visit('Products & visibility','CatalogProductControls');
 const studioRequests=[...requests];requests.length=0;
 await page.goto('http://127.0.0.1:3000/owner-panel-audit.html');
 await page.getByRole('tab',{name:'Store',exact:true}).waitFor();
 assert.deepEqual(requests,[],'Data/team code is not requested on initial Store');
 assert(!(await page.evaluate(()=>window.__reads)).includes('user_roles'),'No team read until Team is opened');
 await page.getByRole('tab',{name:'Team',exact:true}).click();
 await page.getByRole('textbox',{name:'OwnershipTransfer draft'}).fill('Retained team draft');
 assert((await page.evaluate(()=>window.__reads)).includes('user_roles'));
 await page.getByRole('tab',{name:'Store',exact:true}).click();
 await page.getByRole('tab',{name:'Team',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'OwnershipTransfer draft'}).inputValue(),'Retained team draft');
 assert.equal(await page.evaluate(()=>window.__reads.filter(t=>t==='user_roles').length),1);
 await page.getByRole('tab',{name:'Data & backup',exact:true}).click();
 await page.getByRole('textbox',{name:'StoreMaintenance draft'}).fill('Retained maintenance state');
 await page.getByRole('textbox',{name:'StorageMeter draft'}).waitFor();
 await page.getByRole('tab',{name:'Store',exact:true}).click();
 await page.getByRole('tab',{name:'Data & backup',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'StoreMaintenance draft'}).inputValue(),'Retained maintenance state');
 assert.equal(await page.evaluate(()=>window.__mounts.StoreMaintenance),1);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({passed:true,initialHeavyEditorsRequested:0,studioFirstUseModules:studioRequests,settingsFirstUseModules:requests,teamReadsOnlyAfterVisit:true,hiddenPanelsHidden:true,draftsAndPendingStateRetained:true,liveWrites:0}));
}catch(e){console.error(await page.locator('body').innerText(),errors);throw e;}finally{clearTimeout(deadline);await browser.close();}
