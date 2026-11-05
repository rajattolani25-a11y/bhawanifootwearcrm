import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='startup';const deadline=setTimeout(()=>{console.error('Audit deadline at',stage);process.exit(1);},90000);deadline.unref();
const checkpoint=s=>{stage=s;console.log('check',s);};
const out='/tmp/solestack-audit/catalog-promotions';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
const start=Date.now()+120000,end=Date.now()+3600000;
const id=i=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const products=[1,2,3,4].map(i=>({id:id(i),article:['CANYON-24','Everyday Sport','Everyday Comfort','Weekend Edit'][i-1],brand:'Demo',category:i<3?'Men / Sports & Active':'Women / Sandals & Flats',color:'Olive',gender:null,price:1599,mrp:2099,image:'/audit-shoe.png',image_key:'photo'+i,sizes:[{id:'v'+i,size:'7',available:true}]}));
const offer={title:'Golden Hour',subtitle:'A little extra for your next pair.',card:true,code:'REAL200',kind:'fixed',value:200,min_bill:1499,max_discount:null};
const campaign=(audience,productIds,schedule)=>({audience,enabled:true,title:audience==='men'?'Golden Hour':'The Weekend Edit',subtitle:'Explore the selected collection',coupon:'REAL200',productIds,advance:{layout:'classic',image:null},live:{layout:'split',image:null},schedule});
const men=campaign('men',[id(1)],{announceAt:new Date(Date.now()-60000).toISOString(),startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()});
const women=campaign('women',[id(3),id(4)],null);
const response={available:true,value:{legacy:false,campaigns:[{campaign:men,offer:{...offer,title:men.title}},{campaign:women,offer:{...offer,title:women.title}}],now:new Date().toISOString()}};
const data={enabled:true,shop:{name:'Bhawani Footwear',phone:'9999999999',booking:true},products,hero:null,offer,presentation:{gallery_enabled:true,category_accents:true,motion_enabled:true,theme:'ivory'}};
const errors=[],writes=[],media=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__promoHang=true;window.__promoReads=0;window.__badImages=[];window.__readPayloads=[];document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement)window.__badImages.push(e.target.src);},true);});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(route.request().method()!=='GET')writes.push(url.pathname);
 if(url.pathname.includes('/src/lib/catalog-promotion.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`const original=${JSON.stringify(response)};export const getCatalogPromotion=async()=>{window.__promoReads++;if(window.__promoHang)await new Promise(r=>window.__releasePromo=r);window.__readPayloads.push(JSON.stringify(window.__promotion??original));return window.__promotion??original};export const getOwnerPromotion=async()=>null;export const saveOwnerPromotion=async()=>{throw Error('No production writes')};export const signPromotionUpload=async()=>null;export const cleanupPromotionPhoto=async()=>null;`});
 if(url.pathname.includes('/src/lib/catalog.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`const data=${JSON.stringify(data)};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>data;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No production writes')};`});
 if(url.pathname==='/promotions-audit.html')return route.fulfill({contentType:'text/html',body:await fs.readFile(new URL('./fixtures/presentation-catalog.html',import.meta.url),'utf8')});
 if(url.hostname==='res.cloudinary.com')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#e1ecda"/><text x="80" y="180" font-size="60">Custom owner artwork</text></svg>'});
 if(url.pathname==='/audit-shoe.png'){
  const path=process.env.PROMO_AUDIT_PRODUCT_PHOTO;
  return route.fulfill(path?{contentType:'image/png',body:await fs.readFile(path)}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><path d="M70 270Q200 240 300 130L420 230 650 210Q740 210 740 280L720 320H90Z" fill="#58703f"/><path d="M70 285H740V320H70Z" fill="#eee"/></svg>'});
 }
 if(url.pathname.includes('/media/catalog-promotions/')&&url.pathname.endsWith('.mp4'))media.push(url.pathname);
 if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();return route.abort();
});
const ticket=()=>page.locator('[data-catalog-offer-ticket]');
const refresh=async value=>{await page.evaluate(value=>{window.__promotion=value;window.dispatchEvent(new Event('solestack-catalog-refresh'));},value);};
try{
 checkpoint('initial load');await page.goto('http://127.0.0.1:3000/promotions-audit.html');
 await page.getByRole('heading',{name:'Shop the collection',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__promoHang),true,'Main catalog renders without waiting for promotion settings');
 await page.waitForFunction(()=>typeof window.__releasePromo==='function');
 await page.evaluate(()=>{window.__promoHang=false;window.__releasePromo();});
 await page.waitForFunction(()=>document.querySelectorAll('[data-catalog-offer-ticket]').length===2);
 assert.equal(await ticket().nth(0).getByRole('button',{name:'Copy Coupon code',exact:true}).count(),0,'Advance notice has no redeem/copy action');
 await ticket().first().scrollIntoViewIfNeeded();
 const download=page.waitForEvent('download');await ticket().first().getByRole('button',{name:'Add calendar reminder',exact:true}).click();assert.equal((await download).suggestedFilename(),'bhawani-sale.ics');
 checkpoint('responsive layouts');for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow at '+width);
  const top=await page.getByRole('heading',{name:'In the spotlight',exact:true}).boundingBox();
  const first=await ticket().first().boundingBox(),last=await ticket().last().boundingBox(),collection=await page.getByRole('heading',{name:'Shop the collection',exact:true}).boundingBox();
  assert(top.y+top.height<first.y&&last.y+last.height<=collection.y,'Spotlight → promotions → collection');
  await ticket().first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/promotions-${width}.png`});
 }
 await page.getByRole('textbox',{name:'Search footwear or brand',exact:true}).fill('no-matching-pair');
 await ticket().last().getByRole('button',{name:'Shop the offer',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Search footwear or brand',exact:true}).inputValue(),'');
 await page.getByRole('navigation',{name:'Footwear categories',exact:true}).getByRole('button',{name:'Women',exact:true}).getAttribute('aria-pressed').then(v=>assert.equal(v,'true'));
 checkpoint('audience filters');const categories=page.getByRole('navigation',{name:'Footwear categories',exact:true});
 await categories.getByRole('button',{name:'Men',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-catalog-offer-ticket]').length===1);
 assert(/Men’s edit/i.test(await ticket().innerText()));assert.equal(await ticket().locator('img').count(),1);
 await categories.getByRole('button',{name:'Women',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-catalog-offer-ticket]')?.textContent.includes('Women’s edit'));
 assert.equal(await ticket().locator('[data-count="2"] img').count(),2);
 await page.setViewportSize({width:390,height:844});await ticket().scrollIntoViewIfNeeded();await page.screenshot({path:`out/women-live.png`.replace('out/',out+'/')});
 await page.getByRole('button',{name:'Switch theme',exact:true}).click();await page.screenshot({path:out+'/women-dark.png'});
 await categories.getByRole('button',{name:'Men',exact:true}).click();
 // A device clock far ahead cannot force early live promotion: response time is the anchor.
 checkpoint('clock/phase');await page.clock.setFixedTime(new Date('2036-01-01T00:00:00Z'));
 const phaseResponse=structuredClone(response);phaseResponse.value.campaigns=[phaseResponse.value.campaigns[0]];
 phaseResponse.value.now=new Date(start-3000).toISOString();
 await refresh(phaseResponse);await page.waitForFunction(()=>document.querySelector('[data-catalog-offer-ticket]')?.dataset.phase==='advance');
 await page.waitForTimeout(4200);await page.waitForFunction(()=>document.querySelector('[data-catalog-offer-ticket]')?.dataset.phase==='live');
 await page.getByRole('button',{name:'Switch theme',exact:true}).click();
 checkpoint('custom artwork');const custom=structuredClone(phaseResponse);custom.value.now=new Date(start+10000).toISOString();custom.value.campaigns[0].campaign.live.image={url:'https://res.cloudinary.com/demo/image/upload/v1/poster.webp',publicId:'solestack-promotions/demo/men/live/10000000-0000-4000-8000-000000000001',bytes:30000,width:800,height:400};
 await refresh(custom);await page.waitForFunction(()=>!!document.querySelector('[data-catalog-offer-ticket] img[src*="cloudinary"]'));
 const art=ticket().locator('img[src*="cloudinary"]');await art.waitFor({state:'visible'});assert.equal(await art.evaluate(el=>getComputedStyle(el).objectFit),'contain');
 const bounds=await art.boundingBox();assert(Math.abs(bounds.width/bounds.height-2)<.03,'Original artwork ratio preserved');
 await page.screenshot({path:out+'/custom-art.png'});
 checkpoint('expiry');const ended=structuredClone(phaseResponse);ended.value.now=new Date(end).toISOString();await refresh(ended);await ticket().waitFor({state:'detached'});
 await refresh({available:true,value:null});assert.equal(await ticket().count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 // Reduced-motion on a fresh visit must never fetch the video.
 checkpoint('reduced motion');await page.emulateMedia({reducedMotion:'reduce'});media.length=0;
 await page.goto('http://127.0.0.1:3000/promotions-audit.html');await page.evaluate(()=>{window.__promoHang=false;window.__releasePromo?.();});
 await ticket().first().scrollIntoViewIfNeeded();await page.waitForTimeout(500);assert.equal(media.length,0);
 const result={passed:true,optionalReadDoesNotBlockCatalog:true,audiencesSeparate:true,oneAndTwoProductLayouts:true,shopOfferClearsStaleFilters:true,sizes:[320,390,768,1440],calendarDownload:true,clockSkewSafePhaseTransition:true,customArtNotCropped:true,expiryHidesCard:true,reducedMotionMediaRequests:0,productionWrites:0};
 await fs.writeFile(out+'/checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error(await page.locator('body').innerText(),errors,await page.evaluate(()=>({badImages:window.__badImages,reads:window.__readPayloads,phase:document.querySelector('[data-catalog-offer-ticket]')?.dataset.phase})));await page.screenshot({path:out+'/failure.png'});throw error;}finally{clearTimeout(deadline);await browser.close();}
