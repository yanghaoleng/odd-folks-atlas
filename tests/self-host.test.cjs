'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {start}=require('../service/self-host.cjs');
async function setup(t,localDemo){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-test-'));const runtime=await start({directory,port:0,localDemo});t.after(async()=>{await runtime.stop();await fs.rm(directory,{recursive:true,force:true});});return {...runtime,directory};}
test('fresh standalone deployment is read-only and all registered assets are local and intact',async t=>{
 const r=await setup(t,false);const config=await(await fetch(r.url+'/api/v1/config')).json();assert.equal(config.access.canWrite,false);
 assert.equal((await fetch(r.url+'/api/v1/config',{method:'PUT'})).status,503);
 const response=await fetch(r.url+'/api/v1/definition');assert.equal(response.status,200);const data=await response.json();assert.equal(data.baseManifestVersion,'odd-folks-atlas-v1');assert.equal(data.access.canWrite,false);
 for(const row of ['animals','emotions','accessories'].flatMap(g=>require('../dist/avatar-editor-manifest.js')[g])){
  for(const asset of [row.asset,row.asset.thumbnail].filter(x=>x&&typeof x==='object')){assert.match(asset.url,/^\/assets\//);const response=await fetch(r.url+asset.url);assert.equal(response.status,200,asset.url);assert.equal(crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),asset.sha256);}
 }
 assert.equal((await fetch(r.url+'/service/self-host.cjs')).status,404);assert.equal((await fetch(r.url+'/data/initial-config.json')).status,404);assert.equal((await fetch(r.url+'/')).status,200);
});
test('explicit loopback demo persists edits and rejects cross-origin writes and forged hosts',async t=>{
 const r=await setup(t,true);let response=await fetch(r.url+'/api/v1/config'),data=await response.json(),tag=response.headers.get('etag');assert.equal(data.access.canWrite,true);data.config.transforms.head.seal.x=12;
 const options={method:'PUT',headers:{'Content-Type':'application/json','If-Match':tag,Origin:r.url},body:JSON.stringify({config:data.config})};assert.equal((await fetch(r.url+'/api/v1/config',options)).status,200);
 assert.equal((await fetch(r.url+'/api/v1/config',{...options,headers:{...options.headers,Origin:'https://example.invalid'}})).status,403);
 assert.equal(await new Promise(resolve=>require('node:http').get(r.url+'/api/v1/config',{headers:{Host:'example.invalid'}},res=>{res.resume();resolve(res.statusCode);})),403);
 response=await fetch(r.url+'/api/v1/definition');data=await response.json();assert.equal(data.access.canWrite,true);assert.equal(data.access.canUpload,true);
 const edit=JSON.parse(JSON.stringify(data.definition));edit.labels[Object.keys(edit.labels)[0]]='新色';
 assert.equal((await fetch(r.url+'/api/v1/definition',{method:'PUT',headers:{Origin:r.url,'Content-Type':'application/json','If-Match':response.headers.get('etag')},body:JSON.stringify({definition:edit})})).status,200);
 await r.stop();const restarted=await start({directory:r.directory,port:0,localDemo:true});assert.equal((await(await fetch(restarted.url+'/api/v1/config')).json()).config.transforms.head.seal.x,12);await restarted.stop();
});
test('demo cannot bind publicly',async()=>{await assert.rejects(()=>start({localDemo:true,host:'0.0.0.0'}),/restricted/);});
