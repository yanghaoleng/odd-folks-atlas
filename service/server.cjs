'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {Store}=require('./store.cjs');
const model=require('../dist/model.js');
function validMaterialKeys(config){
 if(Object.keys(config).filter(k=>!['motion','emotionEmphasis','backgroundMotion'].includes(k)).sort().join(',')!=='scheme,transforms,version'||config.version!==3||!config.transforms||typeof config.transforms!=='object'||Array.isArray(config.transforms)||Object.keys(config.transforms).sort().join(',')!=='accessory,head,mood')return false;
 for(const [layer,rows]of [['head',model.animals],['accessory',model.accessories],['mood',model.moods]]){const values=config.transforms[layer],allowed=new Set(rows.map(([id])=>id));if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(id=>!allowed.has(id)))return false;for(const value of Object.values(values))if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='rotation,scale,x,y')return false;}return true;
}
const SERVER_VERSION='1.0.0';
function authentication(hash){
 if(hash!==undefined&&!/^[a-f0-9]{64}$/i.test(hash))throw Error('AVATAR_EDITOR_TOKEN_SHA256 must be an existing token SHA-256 hex digest');
 if(!hash)return null;const expected=Buffer.from(hash,'hex');
 return async req=>{const match=/^Bearer ([^\s]{1,4096})$/.exec(req.headers.authorization||'');return !!match&&crypto.timingSafeEqual(expected,crypto.createHash('sha256').update(match[1]).digest())};
}
function createServer({store,tokenHash,verifySession,allowedOrigins=[],maxBody=65536,catalog,publicWrite=false,routeHandler,healthCheck}={}){
 if(!store)throw Error('Store required');
 // No forwarded identity header is trusted. A host adapter must verify its actual session.
 const verify=verifySession||authentication(tokenHash);
 const catalogBody=catalog?JSON.parse(JSON.stringify(catalog)):null;
 if(catalogBody&&(typeof catalogBody.version!=='string'||!catalogBody.version))throw Error('Catalog requires an immutable string version');
 const catalogEtag=catalogBody?'"avatar-catalog-'+crypto.createHash('sha256').update(JSON.stringify(catalogBody)).digest('hex').slice(0,24)+'"':null;
 const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Avatar-Service-Version':SERVER_VERSION,...headers});res.end(body===undefined?undefined:JSON.stringify(body))};
 return http.createServer(async(req,res)=>{
  try{
   if(routeHandler&&await routeHandler(req,res))return;
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/healthz'&&req.method==='GET'){store.read();if(healthCheck)await healthCheck();return send(res,200,{status:'ok',serverVersion:SERVER_VERSION,mode:publicWrite?'public-write':verify?'authenticated-write':'read-only'})}
   const isCatalog=url.pathname==='/api/v1/catalog';
   if(url.pathname!=='/api/v1/config'&&!(isCatalog&&catalogBody))return send(res,404,{error:'not_found'});
   if(url.search)return send(res,400,{error:'query_not_supported'});
   const origin=req.headers.origin;const originAllowed=!origin||allowedOrigins.includes(origin);
   if(req.method==='OPTIONS'){
    const requestedMethod=(req.headers['access-control-request-method']||'GET').toUpperCase();
    const requestedHeaders=(req.headers['access-control-request-headers']||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(requestedMethod==='PUT'){
     if(!publicWrite||isCatalog||!origin||!allowedOrigins.includes(origin)||requestedHeaders.some(h=>!['content-type','if-match'].includes(h)))return send(res,403,{error:'preflight_forbidden'});
     return send(res,204,undefined,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, HEAD, PUT','Access-Control-Allow-Headers':'Content-Type, If-Match',Vary:'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'});
    }
    if(!['GET','HEAD'].includes(requestedMethod)||requestedHeaders.some(h=>h!=='if-none-match'))return send(res,403,{error:'preflight_forbidden'});
    return send(res,204,undefined,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'If-None-Match',Vary:'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'});
   }
   const authenticated=!!verify&&!!await verify(req);
   const canWrite=(authenticated||publicWrite)&&originAllowed;
   if(req.method==='GET'||req.method==='HEAD'){
    const record=isCatalog?null:store.read();const tag=isCatalog?catalogEtag:record.etag;
    const headers={ETag:tag,Vary:'Authorization, Cookie, Origin','Cache-Control':'private, no-cache','Access-Control-Expose-Headers':'ETag, X-Avatar-Service-Version'};
    if(!authenticated)headers['Access-Control-Allow-Origin']='*';
    else if(origin&&allowedOrigins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Credentials']='true'}
    if(req.headers['if-none-match']===tag)return send(res,304,undefined,headers);
    return send(res,200,req.method==='HEAD'?undefined:isCatalog?catalogBody:{config:record.config,revision:record.revision,updatedAt:record.updatedAt,access:{canWrite}},headers);
   }
   if(isCatalog)return send(res,405,{error:'method_not_allowed'},{Allow:'GET, HEAD, OPTIONS'});
   if(req.method!=='PUT')return send(res,405,{error:'method_not_allowed'},{Allow:'GET, HEAD, PUT, OPTIONS'});
   if(!verify&&!publicWrite)return send(res,503,{error:'write_auth_not_configured'});
   if(!originAllowed)return send(res,403,{error:'origin_forbidden'});
   if(!canWrite)return send(res,401,{error:'authentication_required'});
   if(!req.headers['if-match'])return send(res,428,{error:'if_match_required'});
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(res,415,{error:'json_required'});
   if(Number(req.headers['content-length'])>maxBody)return send(res,413,{error:'body_too_large'});
   let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBody)return send(res,413,{error:'body_too_large'});body+=chunk.toString('utf8')}
   let parsed;try{parsed=JSON.parse(body);if(!parsed||Object.keys(parsed).length!==1||!parsed.config)throw Error()}catch{return send(res,400,{error:'invalid_json_envelope'})}
   if(!parsed.config||typeof parsed.config!=='object'||Object.keys(parsed.config).some(key=>!['version','transforms','scheme','motion','emotionEmphasis','backgroundMotion'].includes(key)))return send(res,400,{error:'invalid_configuration'});
   if(!validMaterialKeys(parsed.config))return send(res,400,{error:'invalid_material_configuration'});
   let record;try{record=await store.update(parsed.config,req.headers['if-match'])}catch(e){if(e.status===412)return send(res,412,{error:'revision_conflict',revision:store.read().revision},{ETag:store.read().etag});if(['EBACKUPLIMIT','ESTORAGELOW'].includes(e.code))return send(res,503,{error:'storage_capacity_limit'});if(e.code)throw e;return send(res,400,{error:'invalid_configuration'})}
   // Legacy tabs omit motion; preserve it durably but do not trigger their old autosave comparison loop.
   const replyConfig={...record.config};if(!Object.hasOwn(parsed.config,'motion'))delete replyConfig.motion;if(!Object.hasOwn(parsed.config,'emotionEmphasis'))delete replyConfig.emotionEmphasis;if(!Object.hasOwn(parsed.config,'backgroundMotion'))delete replyConfig.backgroundMotion;
   return send(res,200,{config:replyConfig,revision:record.revision,updatedAt:record.updatedAt,access:{canWrite:true}},{ETag:record.etag});
  }catch{send(res,500,{error:'internal_error'})}
 });
}
module.exports={createServer,authentication};
