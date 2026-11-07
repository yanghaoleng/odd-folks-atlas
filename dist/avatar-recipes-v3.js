(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./avatar-editor-manifest.js'):root.AvatarEditorManifest);if(typeof module==='object'&&module.exports)module.exports=api;else root.AvatarRecipes=api})(typeof globalThis!=='undefined'?globalThis:this,function(manifest){
'use strict';
if(manifest?.mappingVersion!=='refinetaste-assets-v3')throw Error('Canonical manifest required');
const map=Object.fromEntries(['colors','animals','emotions','accessories'].map(k=>[k,Object.fromEntries(manifest[k].map(v=>[v.id,v]))]));
function allowedWordOrders(color,emotion){const c=[...color.label].length,e=[...emotion.label].length;return [...manifest.wordOrderPolicy[c===1?'singleCharacterColor':c===2&&e===2?'twoCharacterColorAndEmotion':'otherwise']]}
function recipe(input,{allowPending=false}={}){
 const color=map.colors[input?.colorId],emotion=map.emotions[input?.emotionId],animal=map.animals[input?.animalId],accessory=map.accessories[input?.accessoryId];
 if(!color||!emotion||!animal||!accessory||emotion.accessoryId!==accessory.id)throw Error('Invalid avatar recipe');
 const values=[color,emotion,animal,accessory];if(!allowPending&&values.some(v=>v.state!=='active'))throw Error('Avatar material is pending calibration');
 const recipeKey=[color.id,emotion.id,animal.id,accessory.id].join('|');
 const allowed=allowedWordOrders(color,emotion),wordOrder=input.wordOrder??allowed[0];if(!allowed.includes(wordOrder))throw Error('Invalid avatar word order');
 const displayName=(wordOrder==='trait_first'?emotion.label+color.label:color.label+emotion.label)+animal.label;
 const identityKey=recipeKey+'|'+wordOrder;
 return {version:3,mappingVersion:manifest.mappingVersion,manifestVersion:manifest.manifestVersion,recipeKey,identityKey,wordOrder,displayName,colorId:color.id,emotionId:emotion.id,animalId:animal.id,accessoryId:accessory.id};
}
function forItem(item){const color=manifest.colors[item.color],emotion=manifest.emotions.find(a=>a.layerKey===item.mood),animal=manifest.animals.find(a=>a.layerKey===item.animal),accessory=manifest.accessories.find(a=>a.layerKey===item.accessory);return recipe({colorId:color?.id,emotionId:emotion?.id,animalId:animal?.id,accessoryId:accessory?.id,wordOrder:color&&emotion&&allowedWordOrders(color,emotion).includes(item.wordOrder)?item.wordOrder:undefined},{allowPending:true})}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function generate(seed,{activeOnly=false}={}){seed=String(seed);const pool=k=>manifest[k].filter(a=>!activeOnly||a.state==='active');const animals=pool('animals'),emotions=pool('emotions'),color=hash(seed+'|color')%manifest.colors.length,animal=animals[hash(seed+'|animal')%animals.length],emotion=emotions[hash(seed+'|emotion')%emotions.length],accessory=map.accessories[emotion.accessoryId];return {uid:seed,animal:animal.layerKey,mood:emotion.layerKey,accessory:accessory.layerKey,color,wordOrder:allowedWordOrders(manifest.colors[color],emotion)[hash(seed+'|wordOrder')%allowedWordOrders(manifest.colors[color],emotion).length],shape:'circle',scheme:'contrast'}}
return {manifest,map,allowedWordOrders,recipe,forItem,generate};
});
