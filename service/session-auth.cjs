'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const COOKIE='__Host-avatar_session';
const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const now=()=>Date.now();
const fail=(code,status=500)=>Object.assign(Error(code),{code,status});
class SessionAuth {
 constructor({directory,origin,sessionDays=30,maxAttempts=8,windowMs=15*60*1000,clock=now}) {
  const parsedOrigin=new URL(origin);if(parsedOrigin.protocol!=='https:'||parsedOrigin.origin!==origin)throw Error('Explicit HTTPS origin required');
  if(!path.isAbsolute(directory||''))throw Error('Private auth directory required');
  Object.assign(this,{directory,origin,sessionMs:sessionDays*86400000,maxAttempts,windowMs,clock});this.queue=Promise.resolve();
 }
 async init(){
  const dir=await fs.lstat(this.directory);if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))throw Error('Auth directory must be private');
  const file=path.join(this.directory,'credentials.json'),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Credentials must be a private regular file');
  const credentials=JSON.parse(await fs.readFile(file,'utf8'));
  if(credentials.version!==1||credentials.algorithm!=='scrypt-32768-8-1'||!/^[a-f0-9]{32}$/.test(credentials.salt)||!/^[a-f0-9]{64}$/.test(credentials.hash))throw Error('Invalid credentials record');
  this.credentials=credentials;this.stateFile=path.join(this.directory,'sessions.json');this.lockFile=path.join(this.directory,'writer.lock');
  this.lock=await fs.open(this.lockFile,'wx',0o600);await this.lock.writeFile(String(process.pid));
  try{
   try{this.state=JSON.parse(await fs.readFile(this.stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.state={version:1,sessions:{},attempts:[]};await this.persist(this.state);}
   if(this.state.version!==1||!this.state.sessions||Array.isArray(this.state.sessions)||!Array.isArray(this.state.attempts)||Object.entries(this.state.sessions).some(([key,value])=>!/^[a-f0-9]{64}$/.test(key)||!Number.isSafeInteger(value.expiresAt)||!Number.isSafeInteger(value.createdAt))||this.state.attempts.some(t=>!Number.isSafeInteger(t)))throw Error('Invalid session state');
   return this;
  }catch(e){await this.close();throw e;}
 }
 token(req){const candidates=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));if(candidates.length!==1)return null;const value=candidates[0].slice(COOKIE.length+1);return /^[a-zA-Z0-9_-]{43}$/.test(value)?value:null;}
 session(req){if(this.failure)throw this.failure;const value=this.token(req);if(!value)return null;const session=this.state.sessions[hash(value)];return session?.expiresAt>this.clock()?session:null;}
 async verifySession(req){const origin=req.headers.origin;if(!['GET','HEAD'].includes(req.method)&&origin!==this.origin)return false;if(origin&&origin!==this.origin)return false;return !!this.session(req);}
 cookie(token,expiresAt){return COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+Math.max(0,Math.floor((expiresAt-this.clock())/1000))+'; Expires='+new Date(expiresAt).toUTCString();}
 async persist(next){
  const tmp=path.join(this.directory,'.session-'+crypto.randomUUID()+'.tmp');let h;
  try{h=await fs.open(tmp,'wx',0o600);await h.writeFile(JSON.stringify(next)+'\n');await h.sync();await h.close();h=null;await fs.rename(tmp,this.stateFile);const d=await fs.open(this.directory,'r');try{await d.sync();}finally{await d.close();}}
  catch(e){this.failure=e;throw e;}
  finally{if(h)await h.close();await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 change(fn){const job=this.queue.then(async()=>{if(this.failure)throw this.failure;return fn();});this.queue=job.catch(()=>{});return job;}
 async login(pin){return this.change(async()=>{
   const current=this.clock(),state=JSON.parse(JSON.stringify(this.state));state.attempts=state.attempts.filter(t=>t>current-this.windowMs);
   if(state.attempts.length>=this.maxAttempts)throw Object.assign(fail('login_locked',429),{retryAfter:Math.ceil((state.attempts[0]+this.windowMs-current)/1000)});
   // Reserve an attempt durably before expensive verification; restart cannot clear a lockout.
   state.attempts.push(current);await this.persist(state);this.state=state;
   const candidate=await scrypt(typeof pin==='string'&&/^[0-9]{6}$/.test(pin)?pin:'invalid-length-input',Buffer.from(this.credentials.salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
   if(!crypto.timingSafeEqual(candidate,Buffer.from(this.credentials.hash,'hex')))throw fail('invalid_pin',401);
   const next=JSON.parse(JSON.stringify(this.state));next.sessions=Object.fromEntries(Object.entries(next.sessions).filter(([,v])=>v.expiresAt>current));
   if(Object.keys(next.sessions).length>=128)throw fail('session_capacity_limit',503);
   const token=crypto.randomBytes(32).toString('base64url'),expiresAt=current+this.sessionMs;
   next.sessions[hash(token)]={createdAt:current,expiresAt};next.attempts=[];
   await this.persist(next);this.state=next;return{token,expiresAt};
  });}
 async logout(req){return this.change(async()=>{const token=this.token(req);if(token&&this.state.sessions[hash(token)]){const next=JSON.parse(JSON.stringify(this.state));delete next.sessions[hash(token)];await this.persist(next);this.state=next;}});}
 async handler(req,res){
  const url=new URL(req.url,'http://localhost');if(!['/api/v1/session','/api/v1/logout'].includes(url.pathname))return false;
  try{
   if(url.search){send(res,400,{error:'query_not_supported'});return true;}
   if(req.method==='GET'&&url.pathname==='/api/v1/session'){
    const session=req.headers.origin&&req.headers.origin!==this.origin?null:this.session(req);send(res,200,{authenticated:!!session,...(session?{expiresAt:new Date(session.expiresAt).toISOString()}:{} )});return true;
   }
   if(req.method!=='POST'){send(res,405,{error:'method_not_allowed'},{Allow:url.pathname==='/api/v1/session'?'GET, POST':'POST'});return true;}
   if(req.headers.origin!==this.origin){send(res,403,{error:'origin_forbidden'});return true;}
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){send(res,415,{error:'json_required'});return true;}
   if(Number(req.headers['content-length'])>1024){send(res,413,{error:'body_too_large'});return true;}
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024){send(res,413,{error:'body_too_large'});return true;}chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(res,400,{error:'invalid_json'});return true;}
   if(!body||Array.isArray(body)||typeof body!=='object'){send(res,400,{error:'invalid_json'});return true;}
   if(url.pathname==='/api/v1/logout'){
    if(Object.keys(body).length){send(res,400,{error:'invalid_logout'});return true;}
    await this.logout(req);send(res,200,{authenticated:false},{'Set-Cookie':this.cookie('',0)});return true;
   }
   if(Object.keys(body).join(',')!=='pin'||typeof body.pin!=='string'||body.pin.length>64){send(res,400,{error:'invalid_login'});return true;}
   const session=await this.login(body.pin);send(res,200,{authenticated:true,expiresAt:new Date(session.expiresAt).toISOString()},{'Set-Cookie':this.cookie(session.token,session.expiresAt)});
  }catch(e){send(res,e.status||503,{error:e.status?e.code:'authentication_unavailable'},e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});}
  return true;
 }
 async close(){if(this.lock){await this.queue;await this.lock.close();this.lock=null;await fs.unlink(this.lockFile);}}
}
module.exports={SessionAuth,COOKIE};
