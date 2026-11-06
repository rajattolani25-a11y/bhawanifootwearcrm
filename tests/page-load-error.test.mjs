import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsDocumentReload} from '../src/lib/page-load-error.ts';
test('explicit retry reloads a rejected module after deploy, without treating other app errors as module failures',()=>{
 for(const message of ['Failed to fetch dynamically imported module: https://example.test/old.js','error loading dynamically imported module','Importing a module script failed.','Loading chunk 12 failed.','ChunkLoadError','Unable to preload CSS for /assets/old.css'])assert(needsDocumentReload(new TypeError(message)));
 for(const error of [null,undefined,{message:'untrusted'},new Error('Network request failed'),new Error('Device storage is blocked'),new Error('Owner access required')])assert.equal(needsDocumentReload(error),false);
});
