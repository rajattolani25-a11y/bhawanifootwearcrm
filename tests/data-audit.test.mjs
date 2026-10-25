import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchAll} from '../src/lib/fetch-all.ts';
import {computeBill} from '../src/lib/pos.ts';

test('reads all 2501 rows beyond the database 1000-row cap', async()=>{
 const rows=Array.from({length:2501},(_,id)=>({id})),ranges=[];
 const result=await fetchAll((a,b)=>{ranges.push([a,b]);return Promise.resolve({data:rows.slice(a,b+1),error:null})});
 assert.equal(result.length,2501);assert.deepEqual(ranges,[[0,999],[1000,1999],[2000,2999]]);assert.deepEqual(result,rows);
});
test('first partial page and empty result do not lose rows',async()=>{
 for(const count of [0,1,49,50]) {const rows=Array.from({length:count},(_,i)=>i);assert.deepEqual(await fetchAll((a,b)=>Promise.resolve({data:rows.slice(a,b+1),error:null}),50),rows)}
});
test('database errors reject instead of producing partial totals',async()=>{
 await assert.rejects(()=>fetchAll(()=>Promise.resolve({data:null,error:{message:'offline'}})),/offline/);
 await assert.rejects(()=>fetchAll(()=>Promise.resolve({data:[],error:null}),0),/positive integer/);
});
test('safety cap rejects incomplete totals',async()=>{
 await assert.rejects(()=>fetchAll(()=>Promise.resolve({data:[1],error:null}),1),/Too many rows/);
});
test('billing audit: inclusive/exclusive GST and discount cap',()=>{
 const items=[{variant_id:'demo',product_name:'Demo',brand:'Demo',size:'7',sku:null,price:1000,qty:1,max:2}];
 const included=computeBill(items,0,0,{billType:'gst',taxMode:'inclusive',rate:5});
 assert.equal(included.total,1000);assert.equal(included.taxable,952.38);assert.ok(Math.abs(included.gst-47.62)<.001);
 assert.equal(computeBill(items,100,0,{billType:'gst',taxMode:'exclusive',rate:5}).total,945);
 assert.equal(computeBill(items,2000,0,{billType:'simple',taxMode:'exclusive',rate:5}).total,0);
});

import {catalogPresentation} from '../src/lib/catalog-presentation.ts';
test('presentation defaults preserve explicit false and ignore unknown fields',()=>{
 assert.deepEqual(catalogPresentation(null),{gallery_enabled:true,category_accents:true,motion_enabled:true});
 assert.deepEqual(catalogPresentation({gallery_enabled:false,category_accents:false,motion_enabled:false,secret:'ignored'}),{gallery_enabled:false,category_accents:false,motion_enabled:false});
 assert.equal(catalogPresentation({motion_enabled:'false'}).motion_enabled,true);
});
