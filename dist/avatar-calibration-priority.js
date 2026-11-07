(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AvatarCalibrationPriority=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// An absent optional transform is reliable evidence that the material has not been
// submitted. A stored default may be a deliberate reset, and required defaults
// were seeded by older versions, so neither is claimed to be untouched.
function isUnadjusted(layer,id,{saved,edited,optionalKeys}){
 const key=layer+':'+id;
 return !!saved?.transforms?.[layer]&&optionalKeys.has(key)&&!edited.has(key)&&!Object.hasOwn(saved.transforms[layer],id);
}
function prioritize(items,score){return items.map((item,index)=>({item,index,score:score(item)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(row=>row.item)}
return {isUnadjusted,prioritize};
});
