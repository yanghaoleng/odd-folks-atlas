(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./identity-lexicon-v2.json'),require('./preview-layer-map-v2.json'));else root.IdentityPreviewV2=factory(root.RefineIdentityLexicon,root.RefinePreviewLayerMap)})(typeof globalThis!=='undefined'?globalThis:this,function(L,P){
'use strict';
if(L?.mappingVersion!=='refinetaste-structured-v2'||L?.lexiconVersion!=='refinetaste-lexicon-v2'||L?.previewMappingVersion!=='preview-v2'||L.colors.length!==20||L.adjectives.length!==20||L.animals.length!==50)throw Error('Fixed v2 lexicon required');
const colors=Object.freeze([...L.colors]),traits=Object.freeze([...L.adjectives]),animals=Object.freeze([...L.animals]);
const headIds={'海豹':'seal','金鱼':'goldfish','熊猫':'panda','水獭':'otter','企鹅':'penguin','小鹿':'deer','兔子':'rabbit','狐狸':'fox','猫头鹰':'owl','小狗':'dog','小猫':'cat','熊熊':'bear'};
const hex={黄色:'#e7c86d',蓝色:'#7197ca',红色:'#d98585',绿色:'#87ae86',紫色:'#ae98c9',橙色:'#e8a267',粉色:'#d49dac',白色:'#e9eee7',黑色:'#59615d',灰色:'#aeb7b3',金色:'#cfb363',银色:'#bdc6cb',青色:'#80bdbe',棕色:'#a88777',米色:'#e5d7b6',茶色:'#c8a48c',桃色:'#e5a28c',草色:'#b0c888',天蓝:'#82b6d7',湖蓝:'#68aaa9'};
const shapes=Object.freeze(['circle','rounded','pill','star','flower','trapezoid','pebble','cloud','squircle']);
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function generate(seed){
 seed=String(seed);const c=hash(seed+'|v2-color')%20,t=hash(seed+'|v2-trait')%20,a=hash(seed+'|v2-animal')%50,order=hash(seed+'|v2-order')%2?'trait_first':'color_first',color=colors[c],trait=traits[t],animal=animals[a];
 const displayName=(order==='color_first'?color+trait:trait+color)+L.animalDisplayLabels[animal];
 const style=P?.version==='preview-layers-v2'?P.adjectiveStyles?.['adjective:'+trait]:null;
 const accessory=['bow','scarf','tie'].includes(style?.accessory)?style.accessory:'none',mood=['sweat','surprise','sparkle','heart','music','idea','sleep'].includes(style?.mood)?style.mood:'none';
 return{uid:seed,mappingVersion:'preview-v2',previewLayerVersion:P?.version==='preview-layers-v2'?P.version:'neutral',descriptor:{mappingVersion:L.mappingVersion,lexiconVersion:L.lexiconVersion,displayName,colorId:'color:'+color,adjectiveId:'adjective:'+trait,animalId:'animal:'+animal,wordOrder:order},animal:headIds[animal]||'none',animalLabel:L.animalDisplayLabels[animal],animalToken:animal,adjective:trait,color:0,colorToken:color,colorHex:hex[color],accessory,mood,shape:shapes[(((c*20+t)*50+a)*7919+10463)%9],assetStatus:headIds[animal]?'ready':'unsupported_asset'};
}
return{version:'preview-v2',colors,traits,animals,generate};
});
