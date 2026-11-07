/* Shared bounded motion schema + renderer. No identity, storage or network access. */
(function(root,factory){const value=factory();root.AvatarMotion=value;if(typeof module==='object'&&module.exports)module.exports=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const defaults={version:1,entrance:{enabled:true,style:'pop',duration:480,stagger:80,strength:1,mood:{enabled:true,delay:160,hold:650,duration:240}},click:{enabled:true,style:'bounce',duration:420,stagger:40,strength:1,mood:{enabled:true,delay:0,hold:950,duration:240}}};
const clone=v=>JSON.parse(JSON.stringify(v));
const styles=['pop','bounce','tilt','fade'];
const emphasisPresets=['squash','bounce','swing','none'];
const keys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
function validate(value){
 if(!keys(value,Object.hasOwn(value||{},'emphasisByMood')?['version','entrance','click','emphasisByMood']:['version','entrance','click'])||value.version!==1)throw Error('Unsupported motion configuration');
 const out={version:1};
 for(const event of ['entrance','click']){
  const v=value[event];if(!keys(v,['enabled','style','duration','stagger','strength','mood'])||typeof v.enabled!=='boolean'||!styles.includes(v.style))throw Error('Invalid motion event');
  for(const [k,min,max]of [['duration',100,1500],['stagger',0,300],['strength',0,2]])if(!Number.isFinite(v[k])||v[k]<min||v[k]>max)throw Error('Invalid motion value');
  if(!keys(v.mood,['enabled','delay','hold','duration'])||typeof v.mood.enabled!=='boolean')throw Error('Invalid mood event');
  for(const [k,min,max]of [['delay',0,1500],['hold',100,3000],['duration',100,1000]])if(!Number.isFinite(v.mood[k])||v.mood[k]<min||v.mood[k]>max)throw Error('Invalid mood value');
  out[event]={enabled:v.enabled,style:v.style,duration:v.duration,stagger:v.stagger,strength:v.strength,mood:{enabled:v.mood.enabled,delay:v.mood.delay,hold:v.mood.hold,duration:v.mood.duration}};
 }
 if(Object.hasOwn(value,'emphasisByMood')){const map=value.emphasisByMood;if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>256||Object.entries(map).some(([id,preset])=>!(/^[a-z][a-z0-9-]{0,31}$/).test(id)||!emphasisPresets.includes(preset)))throw Error('Invalid emotion emphasis');out.emphasisByMood=Object.fromEntries(Object.entries(map).sort(([a],[b])=>a.localeCompare(b)));}
 return out;
}
const resolve=value=>{try{return value===undefined?clone(defaults):validate(value)}catch{return clone(defaults)}};
const running=new WeakMap(),configs=new WeakMap();
function stop(host){globalThis.AvatarBackground?.hide(host);delete host.dataset.motionEvent;const work=running.get(host);if(work){for(const a of work.animations)a.cancel();for(const t of work.timers)clearTimeout(t);running.delete(host)}const mood=host.querySelector('.refine-avatar-mood');if(mood)mood.style.opacity='0';}
function configure(host,value,background){globalThis.AvatarBackground?.configure(host,background);configs.set(host,resolve(value));const mood=host.querySelector('.refine-avatar-mood');if(mood){mood.style.opacity='0';mood.style.pointerEvents='none';}}
function frames(v){const s=v.strength;if(v.style==='fade')return [{opacity:.6},{opacity:1}];if(v.style==='tilt')return [{transform:`rotate(${-8*s}deg)`},{transform:`rotate(${5*s}deg)`,offset:.6},{transform:'rotate(0deg)'}];if(v.style==='bounce')return [{transform:'translateY(0%) scale(1)'},{transform:`translateY(${-8*s}%) scale(${1+.04*s})`,offset:.4},{transform:'translateY(0%) scale(1)'}];return [{transform:`scale(${1-.18*s})`},{transform:`scale(${1+.06*s})`,offset:.65},{transform:'scale(1)'}];}
// Persistence keeps the legacy motion object unchanged; this separate extension
// is ignored safely by old clients rather than invalidating their event settings.
function validateEmphasis(value){if(!keys(value,['version','byMood'])||value.version!==1)throw Error('Unsupported emotion emphasis');const base=clone(defaults);base.emphasisByMood=value.byMood;return {version:1,byMood:validate(base).emphasisByMood};}
function fromConfig(config){const value=resolve(config?.motion);if(config?.emotionEmphasis!==undefined)value.emphasisByMood=validateEmphasis(config.emotionEmphasis).byMood;return value;}
function emphasisFor(value,moodId){return resolve(value).emphasisByMood?.[moodId]||'bounce'}
function moodKeyframes(m,preset){
 const duration=m.duration*2+m.hold,a=m.duration/duration,b=(m.duration+m.hold)/duration;
 const transforms={squash:['scale(1,1)','scale(1.08,.78)','scale(.96,1.12)','scale(1.04,.88)','scale(1,1)'],bounce:['translateY(0%)','translateY(-12%)','translateY(0%)','translateY(-6%)','translateY(0%)'],swing:['rotate(0deg)','rotate(-12deg)','rotate(12deg)','rotate(-7deg)','rotate(0deg)'],none:['scale(1)','scale(1)']}[preset]||['scale(1)','scale(1)'];
 const frames=[{opacity:0,transform:'scale(.7)',offset:0,easing:'ease-out'},{opacity:1,transform:transforms[0],offset:a,easing:'ease-in-out'}];
 for(let i=1;i<transforms.length;i++)frames.push({opacity:1,transform:transforms[i],offset:a+(b-a)*i/(transforms.length-1),easing:i===transforms.length-1?'ease-in':'ease-in-out'});
 frames.push({opacity:0,transform:'scale(.85)',offset:1});return frames;
}
function play(host,event){
 stop(host);const config=configs.get(host)||resolve(),v=config[event];if(!v?.enabled)return;
 const work={animations:[],timers:[]};running.set(host,work);const reduced=host.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const animate=(node,keyframes,options)=>{if(!node?.animate)return;const a=node.animate(keyframes,options);work.animations.push(a);a.onfinish=()=>a.cancel();};
 if(!reduced)for(const [i,layer]of ['head','accessory'].entries())animate(host.querySelector('.refine-avatar-'+layer),frames(v),{duration:v.duration,delay:i*v.stagger,easing:'cubic-bezier(.22,.8,.25,1)',fill:'backwards'});
 const mood=host.querySelector('.refine-avatar-mood'),m=v.mood;
 if(mood&&m.enabled){
  if(reduced||!mood.animate){if(event==='click'){mood.style.opacity='1';work.timers.push(setTimeout(()=>mood.style.opacity='0',m.hold));}}
  else {const duration=m.duration*2+m.hold;animate(mood,moodKeyframes(m,emphasisFor(config,host.dataset.avatarMoodId)),{duration,delay:m.delay,easing:'linear',fill:'none'});}
 }
 const backgroundDuration=globalThis.AvatarBackground?.play(host,event,work,animate,reduced)||0;
 host.dataset.motionEvent=event;
 work.timers.push(setTimeout(()=>{if(running.get(host)===work){running.delete(host);delete host.dataset.motionEvent;}},Math.max(v.duration+v.stagger,m.delay+m.duration*2+m.hold,backgroundDuration)+50));
}
return {defaults:()=>clone(defaults),validate,resolve,styles,emphasisPresets,emphasisFor,validateEmphasis,fromConfig,moodKeyframes,configure,play,stop};
});
