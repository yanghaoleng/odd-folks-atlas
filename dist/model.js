(function(root,factory){const model=factory(typeof module==='object'&&module.exports?require('./avatar-editor-manifest.js'):root.AvatarEditorManifest);if(typeof module==='object'&&module.exports)module.exports=model;else root.AvatarModel=model})(typeof globalThis!=='undefined'?globalThis:this,function(manifest){
'use strict';
if(manifest?.mappingVersion!=='refinetaste-assets-v3')throw Error('Canonical asset manifest required');
const animals=manifest.animals.map(a=>[a.layerKey,a.label]),productionAnimals=manifest.animals.filter(a=>a.state==='active').map(a=>[a.layerKey,a.label]);
const accessories=manifest.accessories.map(a=>[a.layerKey,a.label]),moods=manifest.emotions.map(a=>[a.layerKey,a.label]);
const editorCandidates=manifest.animals.filter(a=>a.state==='pending').map(a=>({id:a.layerKey,label:a.label,code:a.sourceCode,url:a.asset.url}));
// The persistence contract is independent of production activation: old tabs may omit every post-launch resource.
const optionalAssets=[['head','animals'],['accessory','accessories'],['mood','emotions']].flatMap(([layer,section])=>manifest[section].filter(a=>manifest.configurationRequired?!manifest.configurationRequired[layer].includes(a.layerKey):a.state==='pending').map(a=>({layer,id:a.layerKey})));
const optionalKeys=new Set(optionalAssets.map(a=>a.layer+':'+a.id));
const shapes=[['circle','圆形'],['rounded','圆角方形'],['pill','胶囊'],['star','软五角星'],['flower','六瓣花'],['trapezoid','圆角梯形'],['pebble','鹅卵石'],['cloud','云朵'],['squircle','软方糖']];
const adjectives=['温柔','勇敢','好奇','机灵','乐观','安静','闪亮','自在','甜甜','认真','暖心','顽皮','聪明','悠闲','快乐','爱笑','从容','元气','体贴','梦幻'];
const palette=manifest.colors.map(c=>[c.label,c.hex]);
const identity=()=>({x:0,y:0,scale:1,rotation:0});
function assetDefault(layer,id){const rows=layer==='head'?manifest.animals:layer==='accessory'?manifest.accessories:manifest.emotions;return {...(rows.find(a=>a.layerKey===id)?.defaultTransform||identity())}}
function initial(){return {version:3,uid:'1',animal:'seal',accessory:'bow',mood:'sweat',shape:'circle',scheme:'contrast',color:0,batchSeed:'1',transforms:{head:Object.fromEntries(animals.map(([id])=>[id,identity()])),accessory:Object.fromEntries(accessories.map(([id])=>[id,identity()])),mood:Object.fromEntries(moods.map(([id])=>[id,assetDefault('mood',id)]))}}}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const choose=(seed,n,salt)=>hash(`${seed}|${salt}`)%n;
// Preview-only recipe. Fixed candidates never depend on a growing asset catalog.
const previewMapping=Object.freeze({version:'preview-v1',animals:['seal','otter','fox','panda','rabbit','penguin','cat','bear','owl','deer','dog','goldfish'],accessories:['bow','scarf','tie'],moods:['sweat','surprise','sparkle','heart','music','idea','sleep'],shapes:['circle','rounded','pill','star','flower','trapezoid','pebble','cloud','squircle'],colorCount:20,adjectiveCount:20});
function previewShape(uid){return previewMapping.shapes[choose(uid,previewMapping.shapes.length,'shape')]}
function previewGenerated(uid){return {uid,mappingVersion:previewMapping.version,animal:previewMapping.animals[choose(uid,previewMapping.animals.length,'animal')],adjective:adjectives[choose(uid,previewMapping.adjectiveCount,'adj')],color:choose(uid,previewMapping.colorCount,'color'),accessory:previewMapping.accessories[choose(uid,previewMapping.accessories.length,'acc')],mood:previewMapping.moods[choose(uid,previewMapping.moods.length,'mood')],shape:previewShape(uid)}}
function batchUid(seed,index){return (seed.length>60?seed.slice(0,48)+'-'+hash(seed).toString(36):seed)+'-'+index}
const ids=rows=>rows.map(x=>x[0]);
function cleanTransform(c){if(!c||typeof c!=='object'||!Number.isFinite(c.x)||!Number.isFinite(c.y)||!Number.isFinite(c.scale)||Math.abs(c.x)>1024||Math.abs(c.y)>1024||c.scale<.2||c.scale>2.5)throw Error('元素位置或大小超出范围');if(!Number.isFinite(c.rotation)||Math.abs(c.rotation)>180)throw Error('旋转角度超出范围');return {x:c.x,y:c.y,scale:c.scale,rotation:c.rotation}}
function validate(d){
 if(!d||d.version!==3||typeof d.uid!=='string'||d.uid.length>64||typeof d.batchSeed!=='string'||d.batchSeed.length>64||!ids(animals).includes(d.animal)||!ids(accessories).concat('none').includes(d.accessory)||!ids(moods).concat('none').includes(d.mood)||!ids(shapes).concat('random').includes(d.shape)||!['contrast','complement'].includes(d.scheme)||!Number.isInteger(d.color)||d.color<0||d.color>=palette.length)throw Error('配置格式有误');
 let s=initial();for(const k of ['uid','batchSeed','animal','accessory','mood','shape','scheme','color'])s[k]=d[k];
 for(const [layer,rows] of [['head',animals],['accessory',accessories],['mood',moods]]){if(!d.transforms?.[layer])throw Error('缺少素材配置');for(const [id]of rows)s.transforms[layer][id]=optionalKeys.has(layer+':'+id)&&!Object.hasOwn(d.transforms[layer],id)?assetDefault(layer,id):cleanTransform(d.transforms[layer][id]);}
 if(d.migration&&typeof d.migration==='object')s.migration={sourceVersion:1,sourceAnimal:String(d.migration.sourceAnimal||'').slice(0,32),acknowledged:!!d.migration.acknowledged};
 return s;
}
function migrate(d){
 if(d?.version===3)return validate(d);
 if(d?.version===2){const copy=JSON.parse(JSON.stringify(d));copy.version=3;for(const map of Object.values(copy.transforms||{}))for(const c of Object.values(map))c.rotation=0;return validate(copy)}
 if(!d||d.version!==1||!d.configs||typeof d.configs!=='object')throw Error('不支持此配置文件');
 const s=initial();for(const k of ['uid','animal','accessory','mood','shape','scheme','color'])if(d[k]!==undefined)s[k]=d[k];
 if(!ids(animals).includes(s.animal))s.animal='seal';s.batchSeed=String(d.uid||'1').slice(0,64);
 for(const [id]of animals)if(d.configs[id]?.head)s.transforms.head[id]=cleanTransform({...d.configs[id].head,rotation:0});
 for(const layer of ['accessory','mood'])if(s[layer]!=='none'&&d.configs[s.animal]?.[layer]){
  let c=cleanTransform({...d.configs[s.animal][layer],rotation:0});if(layer==='accessory'&&s.animal==='goldfish')c.x-=80;
  s.transforms[layer][s[layer]]=c;
 }
 s.migration={sourceVersion:1,sourceAnimal:s.animal,acknowledged:false};return validate(s);
}
function config(s,item,layer){const id=layer==='head'?item.animal:item[layer];return s.transforms[layer][id]||identity()}
function angle(a){return ((a+180)%360+360)%360-180}
function world(c,p){const a=(c.rotation||0)*Math.PI/180,x=(p.x-512)*c.scale,y=(p.y-512)*c.scale;return {x:512+c.x+x*Math.cos(a)-y*Math.sin(a),y:512+c.y+x*Math.sin(a)+y*Math.cos(a)}}
function inverse(c,p){const a=-(c.rotation||0)*Math.PI/180,x=p.x-512-c.x,y=p.y-512-c.y;return {x:512+(x*Math.cos(a)-y*Math.sin(a))/c.scale,y:512+(x*Math.sin(a)+y*Math.cos(a))/c.scale}}
function rect(bounds,c){const center=world(c,{x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2});return {x:center.x-bounds.w*c.scale/2,y:center.y-bounds.h*c.scale/2,w:bounds.w*c.scale,h:bounds.h*c.scale,cx:center.x,cy:center.y,rotation:c.rotation||0}}
function rotated(start,bounds,delta){const r=rect(bounds,start),rotation=angle(start.rotation+delta),a=rotation*Math.PI/180,x=(bounds.x+bounds.w/2-512)*start.scale,y=(bounds.y+bounds.h/2-512)*start.scale;return {x:Math.max(-1024,Math.min(1024,r.cx-512-x*Math.cos(a)+y*Math.sin(a))),y:Math.max(-1024,Math.min(1024,r.cy-512-x*Math.sin(a)-y*Math.cos(a))),rotation}}
function resized(start,bounds,anchor,pointer){
 const center={x:512+start.x,y:512+start.y};const opposite={x:anchor.x,y:anchor.y};
 const dx=center.x-opposite.x,dy=center.y-opposite.y;
 const corner={x:opposite.x+anchor.vx,y:opposite.y+anchor.vy};
 const vx=corner.x-opposite.x,vy=corner.y-opposite.y;
 const factor=((pointer.x-opposite.x)*vx+(pointer.y-opposite.y)*vy)/(vx*vx+vy*vy);
 const scale=Math.max(.2,Math.min(2.5,start.scale*factor));const f=scale/start.scale;
 return {x:Math.max(-1024,Math.min(1024,opposite.x+dx*f-512)),y:Math.max(-1024,Math.min(1024,opposite.y+dy*f-512)),scale,rotation:start.rotation||0};
}
return {manifest,optionalAssets,animals,productionAnimals,editorCandidates,accessories,moods,shapes,adjectives,palette,identity,assetDefault,initial,previewGenerated,previewMapping,previewShape,batchUid,choose,validate,migrate,config,rect,resized,world,inverse,rotated,angle};
});
