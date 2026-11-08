import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});page.setDefaultTimeout(15000);
const out='/tmp/solestack-audit/product-open';await fs.mkdir(out,{recursive:true});
const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
const product={id:'10000000-0000-4000-8000-000000000001',brand:'Demo',article:'Realistic Pair',category:'Men / Sports & Active',color:'Olive',price:1599,mrp:2099,image:'/motion-shoe.svg',sizes:[{id:'20000000-0000-4000-8000-000000000001',size:'7',available:true}]};
const data={enabled:true,shop:{name:'Bhawani Footwear',phone:'9999999999',booking:true,local:false,outside:false,advance_percent:50,hold_hours:24},products:[product],hero:null,offer:null,presentation:{gallery_enabled:false,category_accents:true,motion_enabled:true,theme:'ivory'}};
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__galleryReads=0;window.__orderWrites=0;});
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.pathname.includes('/src/lib/catalog.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`const d=${JSON.stringify(data)};export const getCatalog=async()=>({...d,presentation:{...d.presentation,motion_enabled:!location.search.includes('motion=off')}});export const getCatalogSnapshot=getCatalog;export const getCatalogPhotos=async()=>{window.__galleryReads++;await new Promise(r=>window.__releaseGallery=r);return {available:true,images:[location.search.includes('replacement=1')?'/motion-replacement.svg':'/motion-shoe.svg','/motion-shoe.svg?angle=2']}};export const createBooking=async()=>{window.__orderWrites++;throw Error('No live orders allowed')};export const trackOrder=async()=>null;export const checkCoupon=async()=>null;`});
 if(u.pathname.includes('/src/lib/catalog-promotion.functions.ts'))return route.fulfill({contentType:'application/javascript',body:'export const getCatalogPromotion=async()=>({available:true,value:null});'});
 if(u.pathname==='/product-motion.html')return route.fulfill({contentType:'text/html',body:await fs.readFile(new URL('./fixtures/presentation-catalog.html',import.meta.url),'utf8')});
 if(u.pathname==='/motion-replacement.svg')await new Promise(r=>setTimeout(r,450));
 if(u.pathname==='/motion-shoe.svg'||u.pathname==='/motion-replacement.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>'});
 if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();external.push(u.pathname);return route.abort();
});
const modal=()=>page.locator('[role=dialog][data-product-theme]');
const open=async()=>{const start=Date.now();await page.getByRole('button',{name:'Demo Realistic Pair',exact:true}).click();await modal().waitFor();return Date.now()-start;};
const checks=[];
try{
 await page.goto('http://127.0.0.1:3000/product-motion.html');
 for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,1000]]){
  await page.setViewportSize({width,height});const elapsed=await open();assert(elapsed<1500,'Opening must not wait for gallery transport');
  await page.waitForFunction(()=>!!window.__releaseGallery);
  const timing=await modal().evaluate(node=>{const a=node.getAnimations().find(a=>a.animationName?.includes('product-open'));if(!a)return null;a.pause();a.currentTime=100;return {duration:a.effect.getTiming().duration,properties:Object.keys(a.effect.getKeyframes()[0])};});
  assert(timing,'Scoped product animation exists');assert.equal(timing.duration,280);assert(!timing.properties.some(p=>['width','height','filter','top','left'].includes(p)));
  await modal().evaluate(node=>{const a=node.getAnimations().find(a=>a.animationName?.includes('product-open'));a.currentTime=280;});
  const box=await modal().boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<2,'Horizontal centering preserved');assert(Math.abs(box.y+box.height/2-height/2)<2,'Vertical centering preserved');
  assert.equal(await modal().getByRole('button',{name:'Add to cart',exact:true}).count(),1);
  assert.equal(await modal().getByRole('button',{name:'Get this pair',exact:true}).count(),1);
  assert.equal(await modal().locator('video').count(),0,'No video/box animation added');
  assert.equal(await modal().locator('[aria-label="Product photo gallery"] img').first().getAttribute('decoding'),'async');
  await page.evaluate(()=>window.__releaseGallery());
  await modal().getByRole('button',{name:'View photo 2',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:out+`/product-${width}.png`});checks.push({width,height,openMs:elapsed,centered:true});
  await modal().getByRole('button',{name:'Close',exact:true}).click();await modal().waitFor({state:'detached'});
 }
 await open();await page.evaluate(()=>window.__releaseGallery?.());await modal().getByRole('button',{name:'7',exact:true}).click();await modal().getByRole('button',{name:'Get this pair',exact:true}).click();
 assert(!(await modal().evaluate(n=>getComputedStyle(n).animationName)).includes('product-open'),'Checkout does not inherit opening animation');
 await page.keyboard.press('Escape');
 await page.goto('http://127.0.0.1:3000/product-motion.html?replacement=1');await open();await page.waitForFunction(()=>!!window.__releaseGallery);await page.evaluate(()=>window.__releaseGallery());await page.waitForTimeout(80);assert.equal(await modal().locator('[aria-label="Product photo gallery"] img').first().getAttribute('src'),'/motion-shoe.svg','Keep working cover while replacement decodes');await page.waitForFunction(()=>document.querySelector('[aria-label="Product photo gallery"] img')?.getAttribute('src')==='/motion-replacement.svg');
 await page.goto('http://127.0.0.1:3000/product-motion.html?motion=off');await open();assert.equal(await modal().evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.goto('http://127.0.0.1:3000/product-motion.html');await page.emulateMedia({reducedMotion:'reduce'});await open();assert.equal(await modal().evaluate(n=>getComputedStyle(n).animationName),'none');
 assert.equal(await page.evaluate(()=>window.__orderWrites),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result={passed:true,checks,transformAndOpacityOnly:true,opensBeforeGalleryResponse:true,coverRetainedUntilReplacementDecodes:true,existingActionsAndLayout:true,noAddCartAnimation:true,motionOffAndReducedMotion:true,checkoutUnchanged:true,liveWrites:0};await fs.writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.error(await page.locator('body').innerText(),errors);throw e;}finally{await browser.close();}
