import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyCampaign,promoConfigSchema,promotionPhase,promotionCountdown,promotionCalendar,promoImageSchema,promoImageSource,storedPromoImageSchema,PROMO_MAX_BYTES,savedPromotionStatus} from '../src/lib/catalog-promotion.ts';
const start='2026-11-08T12:00:00Z',end='2026-11-08T14:00:00Z',announce='2026-11-07T12:00:00Z';
test('advance, live and end boundaries are exact and disabled campaigns stay hidden',()=>{
 const c={...emptyCampaign('men'),enabled:true,schedule:{announceAt:announce,startsAt:start,endsAt:end}};
 for(const [time,phase] of [[Date.parse(announce)-1,'hidden'],[Date.parse(announce),'advance'],[Date.parse(start)-1,'advance'],[Date.parse(start),'live'],[Date.parse(end),'hidden']])assert.equal(promotionPhase(c,time),phase);
 assert.equal(promotionPhase({...c,enabled:false},Date.parse(start)),'hidden');
 assert.equal(promotionPhase({...c,schedule:null},Date.parse(start)),'live');
});
test('reject reordered dates, duplicate audiences/products and more than two featured pairs',()=>{
 const c={...emptyCampaign('women'),enabled:true,schedule:{announceAt:announce,startsAt:start,endsAt:end}};
 assert(promoConfigSchema.safeParse({version:1,campaigns:[c]}).success);
 assert(!promoConfigSchema.safeParse({version:1,campaigns:[c,c]}).success);
 assert(!promoConfigSchema.safeParse({version:1,campaigns:[{...c,schedule:{...c.schedule,endsAt:announce}}]}).success);
 const id='10000000-0000-4000-8000-000000000001';
 assert(!promoConfigSchema.safeParse({version:1,campaigns:[{...c,productIds:[id,id]}]}).success);
 assert(!promoConfigSchema.safeParse({version:1,campaigns:[{...c,productIds:[id,id,id]}]}).success);
});
test('external metadata never accepts local/base64/unbounded images or non-promotion identities',()=>{
 const image={url:'https://res.cloudinary.com/demo/image/upload/v1/solestack-promotions/demo/men/live/10000000-0000-4000-8000-000000000001.webp',publicId:'solestack-promotions/demo/men/live/10000000-0000-4000-8000-000000000001',bytes:100000,width:1200,height:600};
 assert(promoImageSchema.safeParse(image).success);
 for(const patch of [{url:'data:image/png;base64,123'},{url:'http://localhost/a.png'},{url:'https://example.com/x.jpg'},{bytes:716801},{width:1601},{publicId:'product-images/abc'}])assert(!promoImageSchema.safeParse({...image,...patch}).success);
});
test('countdown clamps and calendar escapes text, preserves UTC times and folds UTF8 lines',()=>{
 assert.equal(promotionCountdown(start,Date.parse(start)+1000),'00:00:00');
 assert.equal(promotionCountdown(end,Date.parse(start)),'02:00:00');
 const ics=promotionCalendar('Sale, now;\nBEGIN:fake '+ 'अच्छा'.repeat(30),start,end,'https://example.test/catalog');
 assert(ics.includes('DTSTART:20261108T120000Z'));
 assert(ics.includes('DTEND:20261108T140000Z'));
 assert(ics.includes('Sale\\, now\\;\\nBEGIN:fake'));
 assert(ics.split('\r\n').every(l=>Buffer.byteLength(l)<=75));
 assert.equal(ics.split('\r\n').filter(l=>l==='BEGIN:VEVENT').length,1);
});

test('shop images store a bounded path without a URL, and use temporary resolved URLs only for display',()=>{
 const image={storage:'shop',path:'promotions/men/live/10000000-0000-4000-8000-000000000001.webp',bytes:200000,width:1600,height:800};
 assert(storedPromoImageSchema.safeParse(image).success);assert(promoImageSchema.safeParse(image).success);
 for(const patch of [{bytes:PROMO_MAX_BYTES+1},{path:'hero/10000000-0000-4000-8000-000000000001.webp'},{url:'https://example.test/token'}])assert(!storedPromoImageSchema.safeParse({...image,...patch}).success);
 assert.equal(promoImageSource(image), '');assert.equal(promoImageSource(image,{[image.path]:'https://signed.example.test/temporary'}),'https://signed.example.test/temporary');
});
test('saved visibility reports the real phase, disabled gates and unavailable public coupons',()=>{
 const c={...emptyCampaign('men'),enabled:true};
 const published={checked:true,now:start,audiences:['men'],legacy:false};
 assert.match(savedPromotionStatus(false,c,published),/Show promotions on catalog is off/);
 assert.match(savedPromotionStatus(true,{...c,enabled:false},published),/audience promotion is off/);
 assert.match(savedPromotionStatus(true,c,undefined),/could not be checked/);
 assert.match(savedPromotionStatus(true,c,published),/Visible now: Live sale/);
 assert.match(savedPromotionStatus(true,c,{...published,audiences:[]}),/coupon's validity or usage limit/);
 assert.match(savedPromotionStatus(true,c,{...published,legacy:true}),/previous offer/);
 const scheduled={...c,schedule:{announceAt:announce,startsAt:start,endsAt:end}};
 assert.match(savedPromotionStatus(true,scheduled,{...published,now:new Date(Date.parse(announce)-1).toISOString()}),/hidden until/);
 assert.match(savedPromotionStatus(true,scheduled,{...published,now:announce}),/Visible now: Advance promotion/);
 assert.match(savedPromotionStatus(true,scheduled,{...published,now:end}),/has ended/);
});
