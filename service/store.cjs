'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const model=require('../dist/model.js');
const motion=require('../dist/avatar-motion.js');
const background=require('../dist/avatar-background.js');
const copy=v=>JSON.parse(JSON.stringify(v));
function normalize(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid configuration');
 const full=input.version===1?input:{...model.initial(),...input};
 const validated=model.migrate(full);
 if(input.motion&&Object.hasOwn(input.motion,'emphasisByMood'))throw Error('Use the separate emotion emphasis extension');
 if(input.emotionEmphasis!==undefined){const map=motion.validateEmphasis(input.emotionEmphasis).byMood,allowed=new Set(model.moods.map(([id])=>id));if(Object.keys(map).some(id=>!allowed.has(id)))throw Error('Unknown emotion material');}
 // Optional editor transforms must not mutate stored envelopes or ETags on startup.
 for(const asset of model.optionalAssets)if(!Object.hasOwn(input.transforms?.[asset.layer]||{},asset.id))delete validated.transforms[asset.layer][asset.id];
 return {version:validated.version,transforms:validated.transforms,scheme:validated.scheme,...(Object.hasOwn(input,'motion')?{motion:motion.validate(input.motion)}:{}),...(Object.hasOwn(input,'emotionEmphasis')?{emotionEmphasis:motion.validateEmphasis(input.emotionEmphasis)}:{}),...(Object.hasOwn(input,'backgroundMotion')?{backgroundMotion:background.validate(input.backgroundMotion)}:{})};
}
const etag=record=>'"avatar-'+record.revision+'-'+crypto.createHash('sha256').update(JSON.stringify(record.config)).digest('hex').slice(0,16)+'"';
class Store{
 constructor({directory,seedFile,maxBackupBytes=Infinity,minFreeBytes=0}){if(!directory)throw Error('Data directory required');this.directory=path.resolve(directory);this.seedFile=seedFile;this.maxBackupBytes=maxBackupBytes;this.minFreeBytes=minFreeBytes;this.backupBytes=0;this.queue=Promise.resolve();}
 async init(){
  await fs.mkdir(this.directory,{recursive:true,mode:0o700});this.file=path.join(this.directory,'config.json');
  this.lockFile=path.join(this.directory,'writer.lock');this.lock=await fs.open(this.lockFile,'wx',0o600);await this.lock.writeFile(String(process.pid));
  try{
  try{const raw=JSON.parse(await fs.readFile(this.file,'utf8'));if(!Number.isSafeInteger(raw.revision)||raw.revision<1||typeof raw.updatedAt!=='string')throw Error('Invalid stored envelope');this.record={revision:raw.revision,updatedAt:raw.updatedAt,config:normalize(raw.config)};}
  catch(e){if(e.code!=='ENOENT')throw e;if(!this.seedFile)throw Error('Explicit seed file required for first startup');const raw=JSON.parse(await fs.readFile(this.seedFile,'utf8'));this.record={revision:1,updatedAt:new Date().toISOString(),config:normalize(raw.config||raw)};await this.atomic(this.file,this.record);}
  if(Number.isFinite(this.maxBackupBytes)){const directory=path.join(this.directory,'versions');for(const name of await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e})){const st=await fs.stat(path.join(directory,name));if(st.isFile())this.backupBytes+=st.size;}}
  return this;
  }catch(e){await this.close();throw e}
 }
 async close(){if(this.lock){await this.queue;await this.lock.close();this.lock=null;await fs.unlink(this.lockFile)}}
 read(){if(this.failure)throw this.failure;return {...copy(this.record),etag:etag(this.record)};}
 async atomic(file,value){
  const tmp=path.join(this.directory,'.config-'+crypto.randomUUID()+'.tmp');let handle;
  try{handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();await handle.close();handle=null;await fs.rename(tmp,file);const dir=await fs.open(this.directory,'r');try{await dir.sync()}finally{await dir.close()}}
  finally{if(handle)await handle.close();await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e})}
 }
 update(config,expected){
  const operation=this.queue.then(async()=>{
   if(this.failure)throw this.failure;
   if(expected!==etag(this.record)){const e=Error('Configuration changed');e.status=412;throw e}
   let normalized=normalize(config);
   // Legacy editor tabs may change material transforms without erasing event settings.
   if(!Object.hasOwn(config,'motion')&&this.record.config.motion)normalized.motion=copy(this.record.config.motion);
   // Old editor tabs cannot erase newer candidate adjustments they do not know.
   for(const asset of model.optionalAssets)if(!Object.hasOwn(normalized.transforms[asset.layer],asset.id)&&Object.hasOwn(this.record.config.transforms[asset.layer],asset.id))normalized.transforms[asset.layer][asset.id]=copy(this.record.config.transforms[asset.layer][asset.id]);
   if(!Object.hasOwn(config,'emotionEmphasis')&&this.record.config.emotionEmphasis)normalized.emotionEmphasis=copy(this.record.config.emotionEmphasis);
   if(!Object.hasOwn(config,'backgroundMotion')&&this.record.config.backgroundMotion)normalized.backgroundMotion=copy(this.record.config.backgroundMotion);
   // Canonical key order must survive restart so ETags do not change within a revision.
   normalized=normalize(normalized);
   if(this.minFreeBytes){const st=await fs.statfs(this.directory);if(st.bavail*st.bsize<this.minFreeBytes)throw Object.assign(Error('Insufficient free storage'),{code:'ESTORAGELOW'});}
   const backupText=JSON.stringify(this.record,null,2)+'\n',backupSize=Buffer.byteLength(backupText);if(this.backupBytes+backupSize>this.maxBackupBytes)throw Object.assign(Error('Version backup storage limit reached'),{code:'EBACKUPLIMIT'});
   const backups=path.join(this.directory,'versions');await fs.mkdir(backups,{recursive:true,mode:0o700});
   // A durable exact copy of the preceding envelope always exists before replacement.
   const backup=await fs.open(path.join(backups,String(this.record.revision).padStart(12,'0')+'.json'),'wx',0o600).catch(e=>{if(e.code==='EEXIST')return null;throw e});
   if(backup)try{await backup.writeFile(backupText);await backup.sync();this.backupBytes+=backupSize;}finally{await backup.close()}
   else if(JSON.stringify(JSON.parse(await fs.readFile(path.join(backups,String(this.record.revision).padStart(12,'0')+'.json'),'utf8')))!==JSON.stringify(this.record))throw Object.assign(Error('Backup integrity failure'),{code:'EBACKUP'});
   const backupDir=await fs.open(backups,'r');try{await backupDir.sync()}finally{await backupDir.close()}
   const next={revision:this.record.revision+1,updatedAt:new Date().toISOString(),config:normalized};try{await this.atomic(this.file,next)}catch(e){this.failure=e;throw e}this.record=next;return this.read();
  });this.queue=operation.catch(()=>{});return operation;
 }
}
module.exports={Store,normalize,etag};
