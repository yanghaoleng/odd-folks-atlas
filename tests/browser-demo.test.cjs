'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const reads=[],events={},store=new Map();let revision=1,reloads=0,confirmed=true,destination=null;
 const config=()=>({revision,config:{transforms:{head:{fox:{x:revision}}}},access:{canWrite:true,canUpload:true}});
 const definition={definition:{labels:{red:'红'},colors:{red:'#ff0000'},assetRefs:{},rules:{emotionAccessories:{},wordOrderPolicy:{otherwise:['color_first']}}},manifest:{colors:[{id:'red',label:'红',hex:'#ff0000'}],animals:[],emotions:[],accessories:[]},assets:[],access:{canWrite:true,canUpload:true}};
 class Storage{setItem(k,v){store.set(k,v)}removeItem(k){store.delete(k)}clear(){store.clear()}getItem(k){return store.get(k)||null}}
 class XHR{open(){reads.push('xhr')}}
 const location={href:'https://atlas.example/?demo=1',origin:'https://atlas.example',assign(url){destination=url},reload(){reloads++}};
 const window={confirm:()=>confirmed,fetch:async(input,options)=>{reads.push({path:input,options});return new Response(JSON.stringify(input.endsWith('/config')?config():definition),{status:200})},addEventListener:(name,fn)=>events[name]=fn};
 const context={window,location,document:{readyState:'loading',addEventListener(){}},navigator:{sendBeacon(){throw Error('must not transmit')}},Storage,XMLHttpRequest:XHR,URL,Response,DOMException,AbortController,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/avatar-demo.js'),'utf8'),context);
 return {window,context,reads,events,advance(){revision++},get reloads(){return reloads},confirm(value){confirmed=value},get destination(){return destination}};
}
test('browser demo copies current public config once, strips access and edits only memory',async()=>{
 const f=fixture();f.advance();const first=await(await f.window.AvatarDemo.request('/api/v1/config')).json();assert.equal(first.config.transforms.head.fox.x,2);assert.deepEqual(first.access,{canWrite:false,canUpload:false});
 f.window.AvatarDemo.setConfig({transforms:{head:{fox:{x:99}}}});f.advance();assert.equal((await(await f.window.AvatarDemo.request('/api/v1/config')).json()).config.transforms.head.fox.x,99);assert.equal(f.reads.length,1);assert.equal(f.reads[0].options.credentials,'omit');assert.equal(f.reads[0].options.cache,'no-store');
 const d=await(await f.window.AvatarDemo.request('/api/v1/definition')).json();d.definition.labels.red='演示红';await f.window.AvatarDemo.setDefinition(d.definition);const updated=await(await f.window.AvatarDemo.request('/api/v1/definition')).json();assert.equal(updated.manifest.colors[0].label,'演示红');assert.equal(updated.access.canWrite,false);assert.equal(f.reads.length,2);
});
test('browser demo refuses auth, uploads, network writes and persistence',async()=>{
 const f=fixture();for(const target of ['/api/v1/session','/api/v1/assets','/api/v1/config']){await assert.rejects(f.window.fetch(target,{method:'POST',body:'{}'}),{name:'NotAllowedError'});await assert.rejects(f.window.AvatarDemo.request(target,{method:'PUT'}),{name:'NotAllowedError'});}
 assert.throws(()=>new f.context.XMLHttpRequest().open('POST','/api/v1/assets'),{name:'NotAllowedError'});assert.equal(f.context.navigator.sendBeacon('/api/v1/config','x'),false);const storage=new f.context.Storage();storage.setItem('preference','temporary');assert.equal(storage.getItem('preference'),null);assert.equal(f.reads.length,0);
});
test('browser demo disposes data on leave and reloads browser-cache restoration',async()=>{
 const f=fixture();await f.window.AvatarDemo.request('/api/v1/config');f.events.pagehide();await assert.rejects(f.window.AvatarDemo.request('/api/v1/config'));f.events.pageshow({persisted:true});assert.equal(f.reloads,1);
});
test('login has no hardcoded PIN and retains explicit invalid-PIN and lockout handling',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../dist/auth-client.js'),'utf8');assert.doesNotMatch(source,/pin\s*===?\s*['"]\d{6}/);assert.match(source,/result\.error === 'invalid_pin'/);assert.match(source,/response\.status === 429/);assert.match(source,/data\.authenticated !== true/);
});

test('demo logout asks before discarding and returns to login without a server write',async()=>{
 const f=fixture();await f.window.AvatarDemo.request('/api/v1/config');f.window.AvatarDemo.setConfig({transforms:{}});assert.equal(f.window.AvatarDemo.hasChanges(),true);f.confirm(false);assert.equal(f.window.AvatarDemo.exit(),false);assert.equal(f.destination,null);assert.equal(f.reads.length,1);f.confirm(true);assert.equal(f.window.AvatarDemo.exit(),true);assert.equal(f.destination,'https://atlas.example/?login=1');assert.equal(f.window.avatarLogoutInProgress,true);await assert.rejects(f.window.AvatarDemo.request('/api/v1/config'));assert.equal(f.reads.length,1);
});
