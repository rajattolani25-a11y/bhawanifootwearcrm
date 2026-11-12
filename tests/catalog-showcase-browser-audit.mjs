import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const seeds=JSON.parse(await fs.readFile(new URL('../src/lib/catalog-showcase-seeds.json',import.meta.url),'utf8'));
const out='/workspace/review/catalog-showcase';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
const errors=[],external=[],assets=[];
page.on('pageerror',e=>errors.push(e.message));
const products=Object.values(seeds).filter(s=>s.productId).map((s,i)=>({id:s.productId,article:s.title,brand:'Demo',category:s.audience==='men'?'Men / Sports & Active':'Women / Sneakers & Casuals',gender:null,color:'Black',price:899,mrp:1099,image:'/audit-shoe.webp',image_key:'demo'+i,bargain_enabled:false,sizes:[{id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,size:'7',available:true}]}));
const data={enabled:true,shop:{name:'Bhawani Footwear',phone:null,address:null,booking:true,local:false,outside:false,local_charge:0,outside_charge:0,free_delivery_above:null,delivery_note:null,advance_percent:20,hold_hours:24},products,hero:null,offer:null,presentation:{gallery_enabled:true,category_accents:true,motion_enabled:false,theme:'ivory'}};
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__showcaseReads=[];});
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.pathname.includes('/src/lib/catalog-showcase.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`import{defaultShowcase,showcaseItems}from'/src/lib/catalog-showcase.ts';export const getCatalogShowcase=async({data})=>{window.__showcaseReads.push(data.audience);if(window.__showcaseFail)throw Error('Temporary failure');if(window.__showcaseHold)await new Promise(r=>window.__releaseShowcase=r);const cfg=window.__showcaseConfig??defaultShowcase();return{items:showcaseItems({...cfg,items:cfg.enabled?cfg.items.filter(p=>p.enabled&&p.audience===data.audience):[]},{})}};export const getOwnerShowcase=async()=>null;export const saveOwnerShowcase=async()=>{throw Error('No writes')};export const cleanupShowcaseUploads=async()=>null;`});
 if(u.pathname.includes('/src/lib/catalog.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`const data=${JSON.stringify(data)};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>data;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No writes')};`});
 if(u.pathname.includes('/src/lib/catalog-promotion.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`export const getCatalogPromotion=async()=>({available:true,value:null});`});
 if(u.pathname==='/showcase-audit.html')return route.fulfill({contentType:'text/html',body:await fs.readFile(new URL('./fixtures/presentation-catalog.html',import.meta.url),'utf8')});
 if(u.pathname==='/audit-shoe.webp')return route.fulfill({contentType:'image/webp',body:await fs.readFile('/workspace/bhawani-product-motion-preview/public/product-0.webp')});
 if(u.pathname.includes('/media/showcase/'))assets.push(u.pathname);
 if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();external.push(u.origin);return route.abort();
});
const categories=()=>page.getByRole('navigation',{name:'Footwear categories',exact:true});
const entry=()=>page.locator('[data-showcase-audience]');
try{
 await page.goto('http://127.0.0.1:3000/showcase-audit.html');await page.getByRole('heading',{name:'Shop the collection',exact:true}).waitFor();
 assert.equal(await entry().count(),0);assert.deepEqual(await page.evaluate(()=>window.__showcaseReads),[]);assert.deepEqual(assets,[],'All downloads no Showcase art');
 await categories().getByRole('button',{name:'Men',exact:true}).click();await entry().waitFor();
 assert.equal(await entry().getAttribute('data-showcase-audience'),'men');assert.match(await entry().innerText(),/The Men’s Edit/);
 await entry().scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('[data-showcase-audience] img')].every(i=>i.complete&&i.naturalWidth>0));
 assert(assets.length===2&&assets.every(p=>p.endsWith('-thumb.webp')),'Entry loads only two small thumbnails');
 const spotlight=await page.locator('[data-spotlight-product]').boundingBox();const e=await entry().boundingBox();const collection=await page.getByRole('heading',{name:'Shop the collection',exact:true}).boundingBox();
 if(spotlight)assert(spotlight.y+spotlight.height<=e.y+1);assert(e.y+e.height<=collection.y);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await entry().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No overflow '+width);
  await page.screenshot({path:`${out}/men-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});await entry().getByRole('button').click();const gallery=page.getByRole('dialog');await gallery.getByRole('heading',{name:'The Men’s Edit',exact:true}).waitFor();
 await gallery.locator('article').first().waitFor();assert.equal(await gallery.locator('article').count(),3);await gallery.locator('img').first().waitFor();assert(assets.some(p=>!p.endsWith('-thumb.webp')),'Full posters load only after opening');
 assert.equal(await gallery.locator('img').first().evaluate(el=>getComputedStyle(el).objectFit),'contain');
 await page.waitForFunction(()=>{const d=document.querySelector('[role=dialog]');return d&&getComputedStyle(d).opacity==='1'&&[...d.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0);});
 assert.equal(await gallery.getByText('View poster',{exact:false}).count(),0,'No separate View poster link');await page.screenshot({path:`${out}/men-gallery.png`});
 await gallery.getByRole('button',{name:'Open poster: Lakhani FLYO Wood-1',exact:true}).click();await gallery.getByText('Full-screen poster',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const r=document.querySelector('[role=dialog][data-zoom=true]')?.getBoundingClientRect();return r&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2;});
 const full=await gallery.boundingBox();assert(Math.abs(full.width-390)<2&&Math.abs(full.height-844)<2,'Poster overlay fills the viewport');assert.equal(await gallery.locator('a').count(),0,'No external poster tab');await page.screenshot({path:`${out}/full-screen-poster.png`});
 await gallery.getByRole('button',{name:'Back to Showcase',exact:false}).click();await gallery.locator('article').first().getByRole('button',{name:'View pair',exact:false}).click();await page.getByRole('dialog').getByRole('heading',{name:'Product details',exact:true}).waitFor();
 assert.match(await page.getByRole('dialog').innerText(),/Lakhani FLYO Wood-1/);await page.getByRole('dialog').getByRole('button',{name:'Back to catalog',exact:true}).click();
 await categories().getByRole('button',{name:'Women',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-showcase-audience]')?.dataset.showcaseAudience==='women');
 assert.match(await entry().innerText(),/The Women’s Edit/);await entry().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/women-entry.png`});
 await entry().getByRole('button').click();await gallery.getByRole('heading',{name:'The Women’s Edit',exact:true}).waitFor();await gallery.locator('article').first().waitFor();assert.equal(await gallery.locator('article').count(),3);assert.equal(await gallery.getByText('TRV Yorker-1',{exact:true}).count(),0);await gallery.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(async()=>{const m=await import('/src/lib/catalog-showcase.ts');window.__showcaseConfig=m.defaultShowcase();window.__showcaseConfig.items=[];window.dispatchEvent(new Event('catalog-showcase-refresh'));});await entry().waitFor({state:'detached'});
 await page.evaluate(()=>{delete window.__showcaseConfig;window.dispatchEvent(new Event('catalog-showcase-refresh'));});await entry().waitFor();
 await page.evaluate(async()=>{const m=await import('/src/lib/catalog-showcase.ts');window.__showcaseConfig={...m.defaultShowcase(),enabled:false};window.dispatchEvent(new Event('catalog-showcase-refresh'));});await entry().waitFor({state:'detached'});
 await categories().getByRole('button',{name:'Kids',exact:true}).click();assert.equal(await entry().count(),0);
 await categories().getByRole('button',{name:'All',exact:true}).click();assert.equal(await entry().count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({passed:true,menWomenOnly:true,allNoArtworkRequests:true,twoEntryThumbnailsOnly:true,galleryOnTap:true,sixInitialPosters:true,exactLinkedProduct:true,disabledAndRemovedStayHidden:true,widths:[320,390,768,1440],liveWrites:0}));
}catch(error){console.error(await page.locator('body').innerText(),errors);await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw error;}finally{await browser.close();}
