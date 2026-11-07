'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../dist/avatar-calibration-priority.js'),M=require('../dist/model.js'),R=require('../dist/avatar-recipes-v3.js');
const optionalKeys=new Set(M.optionalAssets.map(a=>a.layer+':'+a.id)),edited=new Set(),saved={transforms:{head:{},accessory:{},mood:{}}};
const context={saved,edited,optionalKeys};
test('only missing optional transforms are confidently unadjusted',()=>{
 assert(P.isUnadjusted('head','elephant',context));
 assert.equal(P.isUnadjusted('head','seal',context),false);
 assert.equal(P.isUnadjusted('head','elephant',{...context,saved:null}),false);
 assert.equal(P.isUnadjusted('head','elephant',{...context,saved:{}}),false);
 assert.equal(P.isUnadjusted('head','elephant',{...context,edited:new Set(['head:elephant'])}),false);
});
test('explicitly saved default/reset is not misclassified',()=>{
 const saved={transforms:{head:{elephant:M.assetDefault('head','elephant'),seal:M.assetDefault('head','seal')}}};
 assert.equal(P.isUnadjusted('head','elephant',{...context,saved}),false);
 assert.equal(P.isUnadjusted('head','seal',{...context,saved}),false);
});
test('priority is stable, non-mutating and preserves all exact generated identities',()=>{
 const items=Array.from({length:24},(_,i)=>R.generate('test:'+i)),snapshot=JSON.stringify(items);
 const score=item=>P.isUnadjusted('head',item.animal,context)?1:0;
 const ranked=P.prioritize(items,score);
 assert.equal(JSON.stringify(items),snapshot);
 assert.deepEqual(ranked.map(R.forItem).map(r=>r.identityKey).sort(),items.map(R.forItem).map(r=>r.identityKey).sort());
 assert(ranked.every((item,i)=>!i||score(ranked[i-1])>=score(item)));
 for(const n of [0,1])assert.deepEqual(ranked.filter(x=>score(x)===n),items.filter(x=>score(x)===n));
 assert.deepEqual(P.prioritize(items,()=>0),items);
});
