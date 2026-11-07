'use strict';
const {digest} = require('./definition-model.cjs');
const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff',...headers});res.end(body===undefined?undefined:JSON.stringify(body));};
function createDefinitionHandler({store,model,verifySession,allowedOrigins=[],maxBody=65536,assetStore}={}) {
  if(!store||!model)throw Error('Definition store and model required');
  const representationTag=(record,editor)=>record.etag.slice(0,-1)+(assetStore?'-'+assetStore.version:'')+(editor?'-editor':'-reader')+'"';
  return async function definitionHandler(req,res) {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname!=='/api/v1/definition')return false;
    try {
      if(url.search){send(res,400,{error:'query_not_supported'});return true;}
      const origin=req.headers.origin,originAllowed=!origin||allowedOrigins.includes(origin);
      const safe=['GET','HEAD'].includes(req.method);
      if(req.method==='OPTIONS') {
        const requested=req.headers['access-control-request-method']||'GET';
        const headers=(req.headers['access-control-request-headers']||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
        if(!['GET','HEAD'].includes(requested)||headers.some(h=>h!=='if-none-match'))send(res,403,{error:'preflight_forbidden'});
        else send(res,204,undefined,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'If-None-Match'});
        return true;
      }
      const authenticated=!!verifySession&&!!await verifySession(req);
      const canWrite=authenticated&&originAllowed;
      const envelope=record=>({definition:record.definition,manifest:model.materialize(record.definition),baseManifestVersion:record.baseManifestVersion,revision:record.revision,updatedAt:record.updatedAt,rulesVersion:'avatar-rules-v1-'+digest(record.definition.rules).slice(0,24),assets:[...model.assets,...(assetStore?assetStore.list():[])],assetCatalogVersion:assetStore?.version||'builtin',access:{canWrite,canUpload:canWrite&&!!assetStore}});
      if(safe) {
        const record=store.read();
        // Access is part of the representation: an anonymous ETag must never suppress a login transition.
        const etag=representationTag(record,canWrite);
        const headers={ETag:etag,Vary:'Cookie, Authorization, Origin','Access-Control-Expose-Headers':'ETag'};
        if(!authenticated)headers['Access-Control-Allow-Origin']='*';
        else if(origin&&originAllowed){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Credentials']='true';}
        if(req.headers['if-none-match']===etag)send(res,304,undefined,headers);
        else send(res,200,req.method==='HEAD'?undefined:envelope(record),headers);
        return true;
      }
      if(req.method!=='PUT'){send(res,405,{error:'method_not_allowed'},{Allow:'GET, HEAD, PUT, OPTIONS'});return true;}
      if(!originAllowed){send(res,403,{error:'origin_forbidden'});return true;}
      if(!verifySession||!authenticated){send(res,401,{error:'login_required'});return true;}
      if(!req.headers['if-match']){send(res,428,{error:'if_match_required'});return true;}
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){send(res,415,{error:'json_required'});return true;}
      if(Number(req.headers['content-length'])>maxBody){send(res,413,{error:'body_too_large'});return true;}
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBody){send(res,413,{error:'body_too_large'});return true;}chunks.push(chunk);}
      let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||Array.isArray(parsed)||Object.keys(parsed).join(',')!=='definition')throw Error();}catch{send(res,400,{error:'invalid_definition_envelope'});return true;}
      // Only an exact editor ETag is accepted. Wildcards, lists, reader tags and weak tags never write.
      const expected=req.headers['if-match'];const record=store.read();
      if(expected!==representationTag(record,true)){send(res,412,{error:'revision_conflict',revision:record.revision},{ETag:representationTag(record,true)});return true;}
      const next=await store.update(parsed.definition,record.etag);
      send(res,200,envelope(next),{ETag:representationTag(next,true)});return true;
    } catch(e) {
      if(e.status===412){const record=store.read();send(res,412,{error:'revision_conflict',revision:record.revision},{ETag:representationTag(record,true)});}
      else send(res,e.status||500,{error:e.status?e.code:'internal_error'});
      return true;
    }
  };
}
module.exports={createDefinitionHandler};
