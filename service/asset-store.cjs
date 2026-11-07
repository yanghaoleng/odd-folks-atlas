'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const error=(code,status)=>Object.assign(Error(code),{code,status});
const copy=value=>JSON.parse(JSON.stringify(value));
class AssetStore {
 constructor({directory,manifest,maxBytes=256*1024*1024,maxAssets=128}){if(!path.isAbsolute(directory||''))throw Error('Absolute upload directory required');Object.assign(this,{directory,manifest,maxBytes,maxAssets});this.queue=Promise.resolve();this.attempts=[];}
 async init(){
  await fs.mkdir(this.directory,{recursive:true,mode:0o700});this.objects=path.join(this.directory,'objects');await fs.mkdir(this.objects,{recursive:true,mode:0o700});this.file=path.join(this.directory,'asset-index.json');
  try{this.index=JSON.parse(await fs.readFile(this.file,'utf8'));if(this.index.version!==1||!Number.isSafeInteger(this.index.revision)||!Array.isArray(this.index.assets)||this.index.assets.length>this.maxAssets)throw Error('Invalid asset index');}
  catch(e){if(e.code!=='ENOENT')throw e;this.index={version:1,revision:1,assets:[]};await this.atomic(this.file,this.index);}
  this.usedBytes=0;for(const name of await fs.readdir(this.objects)){if(!/^[a-f0-9]{64}\.png$/.test(name))throw Error('Unexpected object file');const st=await fs.lstat(path.join(this.objects,name));if(!st.isFile()||st.isSymbolicLink())throw Error('Unexpected object type');this.usedBytes+=st.size;}
  this.refresh();for(const sha of this.known){const bytes=await fs.readFile(path.join(this.objects,sha+'.png'));if(hash(bytes)!==sha)throw Error('Uploaded asset integrity mismatch');}
  return this;
 }
 refresh(){this.known=new Set(this.index.assets.flatMap(a=>[a.sha256,a.thumbnail.sha256]));this.version='uploaded-assets-'+this.index.revision+'-'+hash(Buffer.from(JSON.stringify(this.index.assets))).slice(0,16);}
 list(){if(this.failure)throw this.failure;return copy(this.index.assets);}
 async atomic(file,value){const temp=path.join(this.directory,'.upload-'+crypto.randomUUID()+'.tmp');let h;try{h=await fs.open(temp,'wx',0o600);await h.writeFile(JSON.stringify(value)+'\n');await h.sync();await h.close();h=null;await fs.rename(temp,file);const d=await fs.open(path.dirname(file),'r');try{await d.sync();}finally{await d.close();}}catch(e){this.failure=e;throw e;}finally{if(h)await h.close();await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
 async object(buffer){
  const sha=hash(buffer),file=path.join(this.objects,sha+'.png'),tmp=path.join(this.directory,'.object-'+crypto.randomUUID()+'.tmp');
  let handle;try{
   handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(buffer);await handle.sync();await handle.close();handle=null;
   try{await fs.link(tmp,file);this.usedBytes+=buffer.length;}catch(e){if(e.code!=='EEXIST')throw e;const old=await fs.readFile(file);if(hash(old)!==sha)throw Error('Immutable object mismatch');}
   const d=await fs.open(this.objects,'r');try{await d.sync();}finally{await d.close();}return sha;
  }finally{if(handle)await handle.close();await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 decode(buffer){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'png-worker.cjs'),{workerData:buffer,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32}});const timer=setTimeout(()=>{worker.terminate();reject(error('image_processing_timeout',400));},10000);worker.once('message',value=>{clearTimeout(timer);worker.terminate();if(!value.ok)return reject(error('invalid_png',400));resolve({...value,image:Buffer.from(value.image),thumbnail:Buffer.from(value.thumbnail)});});worker.once('error',()=>{clearTimeout(timer);reject(error('invalid_png',400));});worker.once('exit',code=>{if(code){clearTimeout(timer);reject(error('invalid_png',400));}});});}
 upload(targetId,buffer){const job=this.queue.then(async()=>{
  if(this.failure)throw this.failure;
  const now=Date.now();this.attempts=this.attempts.filter(t=>t>now-60000);if(this.attempts.length>=6)throw error('upload_rate_limited',429);this.attempts.push(now);
  let row,layer;for(const [group,value]of [['animals','head'],['emotions','mood'],['accessories','accessory']]){const found=this.manifest[group].find(r=>r.id===targetId);if(found){row=found;layer=value;}}
  if(!row)throw error('invalid_upload_target',400);if(this.index.assets.length>=this.maxAssets)throw error('upload_quota_exceeded',503);
  const stat=await fs.statfs(this.directory);if(stat.bavail*stat.bsize<256*1024*1024)throw error('upload_quota_exceeded',503);
  const normalized=await this.decode(buffer);if(normalized.image.length>8*1024*1024||normalized.thumbnail.length>256*1024||this.usedBytes+normalized.image.length+normalized.thumbnail.length>this.maxBytes)throw error('upload_quota_exceeded',503);
  const sha=hash(normalized.image),existing=this.index.assets.find(a=>a.sha256===sha&&a.targetId===targetId);if(existing)return copy(existing);
  const main=await this.object(normalized.image),thumb=await this.object(normalized.thumbnail),url=hash=>'/api/v1/assets/'+hash+'.png';
  const asset={id:'upload:'+layer+':'+row.layerKey+':'+main,layer,targetId,transformKey:row.layerKey,state:'pending',label:row.label+' · 上传待校准',url:url(main),sha256:main,mimeType:'image/png',bytes:normalized.image.length,width:1024,height:1024,sourceWidth:normalized.sourceWidth,sourceHeight:normalized.sourceHeight,createdAt:new Date().toISOString(),thumbnail:{url:url(thumb),sha256:thumb,mimeType:'image/png',bytes:normalized.thumbnail.length,width:128,height:128}};
  const versions=path.join(this.directory,'versions');await fs.mkdir(versions,{recursive:true,mode:0o700});const previous=path.join(versions,String(this.index.revision).padStart(12,'0')+'.json');try{await fs.access(previous);}catch(e){if(e.code!=='ENOENT')throw e;await this.atomic(previous,this.index);}
  const next={...this.index,revision:this.index.revision+1,assets:[...this.index.assets,asset]};await this.atomic(this.file,next);this.index=next;this.refresh();return copy(asset);
 });this.queue=job.catch(()=>{});return job;}
 async read(sha){if(this.failure)throw this.failure;if(!this.known.has(sha))throw error('asset_not_found',404);const buffer=await fs.readFile(path.join(this.objects,sha+'.png'));if(hash(buffer)!==sha)throw error('asset_integrity_failed',503);return buffer;}
 async close(){await this.queue;}
}
function createAssetHandler({store,verifySession,origin=''}){
 const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body===undefined?undefined:JSON.stringify(body));};
 return async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/v1/assets'&&!url.pathname.startsWith('/api/v1/assets/'))return false;
  try{
   if(url.search){send(res,400,{error:'query_not_supported'});return true;}
   const match=/^\/api\/v1\/assets\/([a-f0-9]{64})\.png$/.exec(url.pathname);
   if(match){if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'method_not_allowed'});return true;}const body=await store.read(match[1]);res.writeHead(200,{'Content-Type':'image/png','Content-Length':body.length,'X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Cache-Control':'public, max-age=31536000, immutable','Access-Control-Allow-Origin':'*','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(req.method==='HEAD'?undefined:body);return true;}
   if(url.pathname!=='/api/v1/assets'){send(res,404,{error:'not_found'});return true;}
   if(req.method!=='POST'){send(res,405,{error:'method_not_allowed'});return true;}
   if(req.headers.origin!==origin){send(res,403,{error:'origin_forbidden'});return true;}
   if(!verifySession||!await verifySession(req)){send(res,401,{error:'login_required'});return true;}
   if(req.headers['content-type']!=='image/png'){send(res,415,{error:'png_required'});return true;}
   const max=4*1024*1024;if(Number(req.headers['content-length'])>max){send(res,413,{error:'body_too_large'});return true;}
   let size=0;const chunks=[];for await(const data of req){size+=data.length;if(size>max){send(res,413,{error:'body_too_large'});return true;}chunks.push(data);}
   const asset=await store.upload(req.headers['x-avatar-target'],Buffer.concat(chunks));send(res,201,{asset,assetCatalogVersion:store.version});
  }catch(e){send(res,e.status||503,{error:e.status?e.code:'asset_service_unavailable'});}return true;
 };
}
module.exports={AssetStore,createAssetHandler};
