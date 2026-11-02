import test from 'node:test';
import assert from 'node:assert/strict';
import {QueryClient} from '@tanstack/react-query';
import {refreshOperationalData} from '../src/lib/refresh-operational-data.ts';
test('mutations invalidate financial/inventory and unknown future caches, preserving only unchanged configuration',async()=>{
 const client=new QueryClient();
 const business=['stock-all','sales','returns','acct','report','customers','customer','product-profile-cost','product-profile-history','purchase-costs','bookings','ledger','khata-entries','coupons','hero-product-choices','store-usage','future-business-query'];
 const stable=['settings','shop-identity','team','catalog-settings','catalog-hero-settings','catalog-presentation-settings','catalog-theme-settings'];
 for(const key of [...business,...stable])client.setQueryData([key],{value:1});
 await refreshOperationalData(client);
 for(const key of business)assert.equal(client.getQueryState([key]).isInvalidated,true,key);
 for(const key of stable)assert.equal(client.getQueryState([key]).isInvalidated,false,key);
 client.clear();
});
