/* Decorative event backgrounds: no identity, nickname, material mapping or storage. */
(function(root,factory){const api=factory();root.AvatarBackground=api;if(typeof module==='object'&&module.exports)module.exports=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const shapes=['petals','disc','rounded','diamond','bubbles','halo','mix'];
const emphases=['auto','rotate','pulse','bounce','none'];
const base={version:1,shape:'petals',colors:['#f8bbd0','#ffdf9a','#b9dce9'],opacity:.42,scale:1,emphasis:'auto',entrance:{enabled:true,delay:0,enter:260,hold:720,exit:320},click:{enabled:true,delay:0,enter:220,hold:850,exit:300}};
const copy=v=>JSON.parse(JSON.stringify(v));
const keys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
function validate(v){
 if(!keys(v,['version','shape','colors','opacity','scale','emphasis','entrance','click'])||v.version!==1||!shapes.includes(v.shape)||!emphases.includes(v.emphasis)||!Array.isArray(v.colors)||v.colors.length<1||v.colors.length>5||v.colors.some(c=>typeof c!=='string'||!/^#[a-f0-9]{6}$/i.test(c)))throw Error('Invalid background configuration');
 for(const [k,min,max]of [['opacity',.1,.8],['scale',.5,1.2]])if(!Number.isFinite(v[k])||v[k]<min||v[k]>max)throw Error('Invalid background value');
 const result={version:1,shape:v.shape,colors:v.colors.map(c=>c.toLowerCase()),opacity:v.opacity,scale:v.scale,emphasis:v.emphasis};
 for(const event of ['entrance','click']){const e=v[event];if(!keys(e,['enabled','delay','enter','hold','exit'])||typeof e.enabled!=='boolean')throw Error('Invalid background event');for(const [k,min,max]of [['delay',0,1500],['enter',100,1000],['hold',100,3000],['exit',100,1000]])if(!Number.isFinite(e[k])||e[k]<min||e[k]>max)throw Error('Invalid background timing');result[event]={enabled:e.enabled,delay:e.delay,enter:e.enter,hold:e.hold,exit:e.exit};}
 return result;
}
const resolve=v=>{try{return v===undefined?copy(base):validate(v)}catch{return copy(base)}};
const configs=new WeakMap(),ns='http://www.w3.org/2000/svg';
function configure(host,value){configs.set(host,resolve(value));}
function hide(host){const layer=host.querySelector(':scope > .avatar-effect-background');if(layer)layer.style.opacity='0';delete host.dataset.backgroundEvent;}
function node(doc,tag,attrs={}){const el=doc.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));return el;}
function geometry(shape){
 if(shape==='petals')return Array.from({length:6},(_,i)=>{const angle=i*Math.PI/3-Math.PI/2;return {tag:'circle',attrs:{cx:512+225*Math.cos(angle),cy:512+225*Math.sin(angle),r:205},dx:Math.cos(angle),dy:Math.sin(angle)}});
 if(shape==='bubbles')return [[280,260,175],[720,250,140],[790,670,175],[330,790,155],[490,500,260]].map(([cx,cy,r])=>{const angle=Math.atan2(cy-512,cx-512);return {tag:'circle',attrs:{cx,cy,r},dx:Math.cos(angle),dy:Math.sin(angle)}});
 if(shape==='disc')return [{tag:'circle',attrs:{cx:512,cy:512,r:410},dx:0,dy:.6}];
 if(shape==='rounded')return [{tag:'rect',attrs:{x:118,y:118,width:788,height:788,rx:215},dx:0,dy:.6}];
 if(shape==='diamond')return [{tag:'path',attrs:{d:'M512 70 Q535 70 555 90 L934 469 Q977 512 934 555 L555 934 Q512 977 469 934 L90 555 Q47 512 90 469 L469 90 Q489 70 512 70Z'},dx:0,dy:.6}];
 return [{tag:'circle',attrs:{cx:512,cy:512,r:360,fill:'none','stroke-width':105,'stroke-dasharray':'125 38','stroke-linecap':'round'},dx:0,dy:.6}];
}
function render(host,config){
 let wrapper=host.querySelector(':scope > .avatar-effect-background');if(!wrapper){wrapper=host.ownerDocument.createElement('span');wrapper.className='avatar-effect-background';wrapper.setAttribute('aria-hidden','true');Object.assign(wrapper.style,{position:'absolute',inset:'0',zIndex:'0',pointerEvents:'none',opacity:'0',overflow:'hidden'});host.prepend(wrapper)}wrapper.replaceChildren();
 // A fresh decorative variation is independent of every user's identity.
 const shape=config.shape==='mix'?shapes[Math.floor(Math.random()*(shapes.length-1))]:config.shape,shift=config.shape==='mix'?Math.floor(Math.random()*config.colors.length):0;
 const doc=host.ownerDocument,svg=node(doc,'svg',{viewBox:'0 0 1024 1024',focusable:'false'});Object.assign(svg.style,{width:'100%',height:'100%',display:'block',position:'absolute',inset:'0'});
 const size=node(doc,'g',{transform:`translate(512 512) scale(${config.scale}) translate(-512 -512)`}),scene=node(doc,'g',{'class':'avatar-background-scene'});Object.assign(scene.style,{transformOrigin:'512px 512px',transformBox:'view-box'});size.append(scene);svg.append(size);wrapper.append(svg);
 const pieces=geometry(shape).map((part,i)=>{const group=node(doc,'g',{'class':'avatar-background-piece'}),color=config.colors[(i+shift)%config.colors.length],piece=node(doc,part.tag,{fill:color,...part.attrs,...(shape==='halo'?{stroke:color}:{})});Object.assign(group.style,{transformOrigin:'center',transformBox:'fill-box'});group.append(piece);scene.append(group);return {el:group,dx:part.dx,dy:part.dy}});
 host.dataset.backgroundShape=shape;return {wrapper,scene,pieces,shape};
}
function sceneFrames(config,event,shape){
 const d=event.enter+event.hold+event.exit,a=event.enter/d,b=(event.enter+event.hold)/d,kind=config.emphasis==='auto'?(shape==='petals'||shape==='halo'?'rotate':shape==='bubbles'?'bounce':'pulse'):config.emphasis;
 const keys=[{transform:'scale(.84) rotate(-8deg)',offset:0,easing:'ease-out'},{transform:'scale(1) rotate(0deg)',offset:a,easing:'ease-in-out'}];
 if(kind==='rotate')keys.push({transform:'scale(1) rotate(60deg)',offset:b,easing:'ease-in'});
 else if(kind==='pulse')keys.push({transform:'scale(1.08)',offset:a+(b-a)*.5,easing:'ease-in-out'},{transform:'scale(1)',offset:b,easing:'ease-in'});
 else if(kind==='bounce')keys.push({transform:'translateY(-42px)',offset:a+(b-a)*.4,easing:'ease-in-out'},{transform:'translateY(0px)',offset:b,easing:'ease-in'});
 else keys.push({transform:'scale(1)',offset:b,easing:'ease-in'});
 keys.push({transform:kind==='rotate'?'scale(.96) rotate(80deg)':'scale(.96)',offset:1});return keys;
}
function play(host,event,work,animate,reduced){
 const config=configs.get(host)||resolve(),v=config[event];hide(host);if(!v?.enabled||reduced&&event==='entrance')return 0;
 const {wrapper,scene,pieces,shape}=render(host,config),duration=v.enter+v.hold+v.exit,a=v.enter/duration,b=(v.enter+v.hold)/duration;host.dataset.backgroundEvent=event;
 if(reduced||!wrapper.animate){wrapper.style.opacity=String(config.opacity);work.timers.push(setTimeout(()=>hide(host),v.hold));return v.hold}
 animate(wrapper,[{opacity:0,offset:0,easing:'ease-out'},{opacity:config.opacity,offset:a},{opacity:config.opacity,offset:b,easing:'ease-in'},{opacity:0,offset:1}],{duration,delay:v.delay,easing:'linear',fill:'none'});
 animate(scene,sceneFrames(config,v,shape),{duration,delay:v.delay,easing:'linear',fill:'none'});
 for(const piece of pieces)animate(piece.el,[{opacity:0,transform:'scale(.22)',offset:0,easing:'ease-out'},{opacity:1,transform:'scale(1)',offset:a},{opacity:1,transform:'scale(1)',offset:b,easing:'ease-in'},{opacity:0,transform:`translate(${Math.round(piece.dx*230)}px,${Math.round(piece.dy*230)}px) scale(.02)`,offset:1}],{duration,delay:v.delay,easing:'linear',fill:'none'});
 work.timers.push(setTimeout(()=>{delete host.dataset.backgroundEvent;wrapper.style.opacity='0'},duration+v.delay+20));return duration+v.delay;
}
return {defaults:()=>copy(base),validate,resolve,shapes,emphases,configure,hide,play,geometry,sceneFrames};
});
