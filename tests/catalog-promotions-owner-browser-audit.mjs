import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='/tmp/solestack-audit/catalog-promotions';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
const id=i=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const products=[1,2,3,4].map(i=>({id:id(i),brand:'Demo',article:i<3?'Mens pair '+i:'Womens pair '+i,category:i<3?'Men / Sports & Active':'Women / Sandals & Flats',color:'Olive',image_url:null,mrp:2099,selling_price:1599}));
const errors=[],external=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__vite_plugin_react_preamble_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.pathname.includes('/src/lib/catalog-promotion.functions.ts'))return route.fulfill({contentType:'application/javascript',body:`let snapshot={enabled:false,title:'',subtitle:'',coupon:'',card:true,config:null};export const getOwnerPromotion=async()=>({snapshot,uploadReady:!!window.__hostingReady});export const saveOwnerPromotion=async({data})=>{window.__saved=data.settings;return snapshot=data.settings};export const signPromotionUpload=async({data})=>({endpoint:'https://api.cloudinary.com/v1_1/demo/image/upload',apiKey:'public-demo-key',signature:'mock-signature',params:{public_id:'solestack-promotions/demo/'+data.audience+'/'+data.slot+'/10000000-0000-4000-8000-000000000001'}});export const cleanupPromotionPhoto=async()=>true;export const getCatalogPromotion=async()=>({available:false,value:null});`});
 if(url.pathname.includes('/src/integrations/supabase/client.ts'))return route.fulfill({contentType:'application/javascript',body:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'local-fake-session-not-a-real-credential'}}})},from(table){const rows=table==='products'?${JSON.stringify(products)}:[{code:'REAL200',title:'Real coupon',kind:'fixed',value:200,min_bill:1499,max_discount:null}];return new Proxy({},{get:(_,key)=>key==='then'?(resolve)=>resolve({data:rows,error:null}):()=>supabase.from(table)})}};`});
 if(url.pathname==='/owner-promo-audit.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/promotion-owner.tsx"></script>'});
 if(url.hostname==='api.cloudinary.com'){
  const body=route.request().postDataBuffer();uploads.push(body.toString('latin1'));
  return route.fulfill({contentType:'application/json',body:JSON.stringify({secure_url:'https://res.cloudinary.com/demo/image/upload/v1/solestack-promotions/demo/men/live/10000000-0000-4000-8000-000000000001.webp',public_id:'solestack-promotions/demo/men/live/10000000-0000-4000-8000-000000000001',bytes:12345,width:1600,height:800})});
 }
 if(url.hostname==='res.cloudinary.com')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#faf1dc"/></svg>'});
 if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();external.push(url.hostname);return route.abort();
});
try{
 await page.goto('http://127.0.0.1:3000/owner-promo-audit.html');await page.getByRole('heading',{name:'Sale promotions',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Street Drop',exact:true}).count(),2);
 assert.equal(await page.getByRole('button',{name:'Sticker Edit',exact:true}).count(),2);
 const switches=page.getByRole('switch');await switches.nth(0).click();await switches.nth(1).click();
 await page.getByRole('textbox',{name:'Promotion title',exact:true}).fill('All sale');
 await page.getByRole('button',{name:'Men',exact:true}).click();await switches.nth(1).click();
 await page.getByRole('textbox',{name:'Promotion title',exact:true}).fill('Men sale');
 const opts=await page.getByRole('combobox',{name:'Product 1',exact:true}).locator('option').allTextContents();assert(!opts.some(v=>v.includes('Womens')));
 await page.getByRole('combobox',{name:'Product 1',exact:true}).selectOption(id(1));
 await page.getByRole('combobox',{name:'Product 2',exact:true}).selectOption(id(2));
 await page.getByRole('combobox',{name:'Coupon',exact:true}).selectOption('REAL200');
 await page.getByRole('button',{name:'Women',exact:true}).click();await switches.nth(1).click();
 await page.getByRole('textbox',{name:'Promotion title',exact:true}).fill('Women sale');
 assert(!(await page.getByRole('combobox',{name:'Product 1',exact:true}).locator('option').allTextContents()).some(v=>v.includes('Mens')));
 await page.getByRole('combobox',{name:'Product 1',exact:true}).selectOption(id(3));
 await page.getByRole('button',{name:'Men',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Promotion title',exact:true}).inputValue(),'Men sale');
 assert.equal(await page.getByRole('combobox',{name:'Product 2',exact:true}).inputValue(),id(2));
 assert.equal(await page.locator('input[type=file]:disabled').count(),2,'Cannot claim external uploads are configured');
 await page.getByText('Connect external photo hosting',{exact:true}).click();await page.getByText(/Built-in presets and existing product photos work now/).waitFor();
 await page.getByRole('button',{name:'Save promotions',exact:true}).click();await page.waitForFunction(()=>!!window.__saved);
 const saved=await page.evaluate(()=>window.__saved);assert.equal(saved.config.campaigns.find(c=>c.audience==='men').productIds.length,2);assert.equal(saved.config.campaigns.find(c=>c.audience==='women').productIds.length,1);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Owner overflow '+width);await page.screenshot({path:out+`/owner-${width}.png`,fullPage:true});}
 // Mock an externally connected account: exercise actual in-browser compression and upload UI.
 await page.evaluate(()=>{window.__hostingReady=true;});
 await page.getByRole('button',{name:'Reload saved',exact:true}).click();
 await page.locator('input[type=file]:enabled').first().waitFor();
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1000;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff8e8';ctx.fillRect(0,0,2000,1000);ctx.fillStyle='#111';ctx.font='bold 140px sans-serif';ctx.fillText('OWNER ARTWORK',120,440);return canvas.toDataURL('image/png').split(',')[1];});
 await page.locator('input[type=file]').nth(1).setInputFiles({name:'owner-poster.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByText(/ready to upload on Save/).waitFor();
 await page.getByRole('button',{name:'Save promotions',exact:true}).click();
 await page.waitForFunction(()=>!!window.__saved.config.campaigns.find(c=>c.audience==='men').live.image);
 assert.equal(uploads.length,1);assert(uploads[0].includes('image/webp'));assert(!uploads[0].includes('local-fake-session'));
 const image=await page.evaluate(()=>window.__saved.config.campaigns.find(c=>c.audience==='men').live.image);
 assert.equal(image.width,1600);assert.equal(image.height,800);assert(image.bytes<=716800);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({passed:true,independentAudiences:true,twoPresetsPerPhase:true,existingPhotoReuse:true,ownerSave:true,unconfiguredUploadExplicit:true,mockedExternalUploadCompressed:true,noAuthTokenSentToImageHost:true,mobileWidths:[320,390,768,1440],liveWrites:0}));
}catch(e){console.error(await page.locator('body').innerText(),errors);await page.screenshot({path:out+'/owner-failure.png',fullPage:true});throw e;}finally{await browser.close();}
