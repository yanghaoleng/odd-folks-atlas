'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {Store}=require('./store.cjs');
const {createServer}=require('./server.cjs');
const {createDefinitionModel}=require('./definition-model.cjs');
const {DefinitionStore}=require('./definition-store.cjs');
const {createDefinitionHandler}=require('./definition-http.cjs');
const {AssetStore,createAssetHandler}=require('./asset-store.cjs');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
async function start({directory=path.join(root,'data'),port=4180,localDemo=false,host='127.0.0.1',origin,verifySession,authDirectory}={}){
 if(localDemo&&(host!=='127.0.0.1'||process.env.NODE_ENV==='production'))throw Error('Local demo is restricted to 127.0.0.1 and non-production mode');
 if(authDirectory&&(localDemo||verifySession))throw Error('Choose one authentication mode');
 if(authDirectory){const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw Error('Session login requires an explicit HTTPS origin');const authPath=path.resolve(authDirectory);if(!path.isAbsolute(authDirectory)||authPath===path.join(root,'dist')||authPath.startsWith(path.join(root,'dist')+path.sep))throw Error('Absolute private authentication directory outside dist required');}
 if(localDemo&&origin)throw Error('Local demo origin is derived from its loopback listener, not configurable');
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
 directory=path.resolve(directory);
 if(directory===path.join(root,'dist')||directory.startsWith(path.join(root,'dist')+path.sep))throw Error('Data must remain outside the public directory');
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const seed=path.join(directory,'initial-config.json');
 try{await fs.writeFile(seed,JSON.stringify(require('../dist/model.js').initial()),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 const resources=[];let server;
 try{
 let auth;if(authDirectory){auth=await new (require('./session-auth.cjs').SessionAuth)({directory:authDirectory,origin}).init();resources.push(auth);}
 const store=await new Store({directory:path.join(directory,'config'),seedFile:seed,maxBackupBytes:256*1024*1024,minFreeBytes:128*1024*1024}).init();resources.push(store);
 const manifest=require('./avatar-identity-v3.json');
 const model=createDefinitionModel(manifest);
 const definition=await new DefinitionStore({directory:path.join(directory,'definition'),model}).init();resources.push(definition);
 const assets=await new AssetStore({directory:path.join(directory,'uploads'),manifest}).init();resources.push(assets);
 let ownOrigin=origin||`http://${host}:${port}`;
 const allowedOrigins=[ownOrigin];
 // Local writes require both the explicit development switch and an exact browser origin.
 // Host checks additionally block DNS-rebinding and forwarding to this development listener.
 const verify=localDemo?async req=>req.headers.host===new URL(ownOrigin).host&&(!req.headers.origin||req.headers.origin===ownOrigin):auth?(req=>auth.verifySession(req)):verifySession;
 const definitionHandler=createDefinitionHandler({store:definition,model,assetStore:assets,verifySession:verify,allowedOrigins});
 let assetHandler=createAssetHandler({store:assets,verifySession:verify,origin:ownOrigin});
 const routeHandler=async(req,res)=>{
  if(localDemo&&req.headers.host!==new URL(ownOrigin).host){res.writeHead(403);res.end();return true;}
  if(auth&&await auth.handler(req,res))return true;
  if(!auth&&new URL(req.url,'http://localhost').pathname==='/api/v1/session'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({authenticated:!!localDemo,loginAvailable:false}));return true;}
  if(await assetHandler(req,res)||await definitionHandler(req,res))return true;
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')||url.pathname==='/healthz')return false;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return true;}
  let relative;try{relative=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return true;}
  if(relative==='/')relative='/index.html';
  const file=path.resolve(root,'dist','.'+relative);
  if(!file.startsWith(path.join(root,'dist')+path.sep)||relative.split('/').some(p=>p.startsWith('.'))){res.writeHead(404);res.end();return true;}
  try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink())throw Error();const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(404);res.end();}return true;
 };
 server=createServer({store,verifySession:verify,allowedOrigins,routeHandler,healthCheck:()=>{if(auth?.failure)throw auth.failure;definition.read();assets.list();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 if(!origin){ownOrigin=`http://${host}:${server.address().port}`;allowedOrigins[0]=ownOrigin;assetHandler=createAssetHandler({store:assets,verifySession:verify,origin:ownOrigin});}
 let stopped=false;
 return {server,url:ownOrigin,stop:async()=>{if(stopped)return;stopped=true;await new Promise(resolve=>server.close(resolve));for(const resource of resources.reverse())await resource.close();}};
 }catch(e){if(server?.listening)await new Promise(resolve=>server.close(resolve));for(const resource of resources.reverse())await resource.close();throw e;}
}
if(require.main===module)start({directory:process.env.ATLAS_DATA_DIR,port:Number(process.env.PORT||4180),host:process.env.HOST||'127.0.0.1',origin:process.env.ATLAS_ORIGIN,authDirectory:process.env.ATLAS_AUTH_DIR,localDemo:process.argv.includes('--local-demo')}).then(runtime=>{console.log(`Odd Folks Atlas: ${runtime.url} (${process.argv.includes('--local-demo')?'local development editor':process.env.ATLAS_AUTH_DIR?'session-protected editor':'read-only'})`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>runtime.stop().then(()=>process.exit(0)));}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={start};
