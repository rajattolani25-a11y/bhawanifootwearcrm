import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyCampaign,promoConfigSchema,promotionPhase,promotionCountdown,promotionCalendar,promoImageSchema} from '../src/lib/catalog-promotion.ts';
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
