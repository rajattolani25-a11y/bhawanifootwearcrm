import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCsv, parseCsv } from '../src/lib/csv.ts';

test('formula-like text is inert after CSV parsing, including hidden leading characters',()=>{
 const payloads=['=1+1','+SUM(1,2)','-1+2','@SUM(A1:A2)',' \t=HYPERLINK("https://example.invalid","open")','\r\n=1+1','\uFEFF=1+1','\u200B+1','\u0000@SUM(A1:A2)'];
 for(const payload of payloads){
  const csv=serializeCsv([['brand','article','rack'],['Normal',payload,'A1']]);
  const [row]=parseCsv(csv);assert.equal(row.article,"'"+payload);assert.equal(row.brand,'Normal');assert.equal(row.rack,'A1');
 }
});
test('quoted commas, quotes and line breaks stay in their own cells',()=>{
 const fields=['plain,comma','He said "hello"','line one\nline two','नमस्ते','0012345','Sneaker - One'];
 assert.deepEqual(parseCsv(serializeCsv([fields.map((_,i)=>'c'+i),fields])),[Object.fromEntries(fields.map((v,i)=>['c'+i,v]))]);
 const attack='=1,=2\n=3';assert.equal(parseCsv(serializeCsv([['article','qty'],[attack,4]]))[0].article,"'"+attack);
});
test('real negative amounts and quantities retain numeric representation',()=>{
 assert.equal(serializeCsv([[-123.45,0,2500,'-123.45',null,undefined]]),'"-123.45","0","2500","\'-123.45","",""');
});
