'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {digest,copy} = require('./definition-model.cjs');
const tag = record => '"avatar-definition-' + record.revision + '-' + digest(record.definition).slice(0,24) + '"';
class DefinitionStore {
  constructor({directory,model,maxBackupBytes=64*1024*1024,minFreeBytes=128*1024*1024,migrateRecord}) {
    if (!directory || !path.isAbsolute(directory) || !model) throw Error('Dedicated absolute data directory and model required');
    Object.assign(this,{directory,model,maxBackupBytes,minFreeBytes,migrateRecord});this.queue=Promise.resolve();this.backupBytes=0;
  }
  async init() {
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    this.file=path.join(this.directory,'definition.json');this.lockFile=path.join(this.directory,'writer.lock');
    this.lock=await fs.open(this.lockFile,'wx',0o600);await this.lock.writeFile(String(process.pid));
    try {
      const files=await fs.readdir(path.join(this.directory,'versions')).catch(e=>{if(e.code==='ENOENT')return [];throw e});
      for(const name of files){const st=await fs.stat(path.join(this.directory,'versions',name));if(st.isFile())this.backupBytes+=st.size;}
      let raw,missing=false;
      try { raw=JSON.parse(await fs.readFile(this.file,'utf8')); }
      catch(e) {if(e.code!=='ENOENT')throw e;missing=true;}
      if(missing){this.record={revision:1,updatedAt:new Date().toISOString(),baseManifestVersion:this.model.base.manifestVersion,baseHash:this.model.baseHash,definition:copy(this.model.seed)};await this.atomic(this.record);}
      else if(raw&&raw.baseHash===this.model.baseHash&&raw.baseManifestVersion===this.model.base.manifestVersion)this.record=this.validateRecord(raw);
      else {
        if(typeof this.migrateRecord!=='function')throw Error('Persisted definition requires explicit base-manifest migration');
        const next=this.validateRecord(this.migrateRecord(raw,this.model));
        if(next.revision!==raw.revision+1)throw Error('Migration must increment revision exactly once');
        await this.backupRecord(raw);await this.atomic(next);this.record=next;
      }
      return this;
    } catch(e) {await this.close();throw e;}
  }
  validateRecord(record) {
    if(!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.updatedAt!=='string'||!Number.isFinite(Date.parse(record.updatedAt))||record.baseHash!==this.model.baseHash||record.baseManifestVersion!==this.model.base.manifestVersion)throw Error('Persisted definition invalid or requires explicit base-manifest migration');
    return {...record,definition:this.model.normalize(record.definition)};
  }
  read() {if(this.failure)throw this.failure;return {...copy(this.record),etag:tag(this.record)};}
  async close(){if(this.lock){await this.queue;await this.lock.close();this.lock=null;await fs.unlink(this.lockFile);}}
  async atomic(record){
    const tmp=path.join(this.directory,'.definition-'+crypto.randomUUID()+'.tmp');let h;
    try{h=await fs.open(tmp,'wx',0o600);await h.writeFile(JSON.stringify(record,null,2)+'\n');await h.sync();await h.close();h=null;await fs.rename(tmp,this.file);const dir=await fs.open(this.directory,'r');try{await dir.sync();}finally{await dir.close();}}
    finally{if(h)await h.close();await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  async backupRecord(record){
      if(this.minFreeBytes){const st=await fs.statfs(this.directory);if(st.bavail*st.bsize<this.minFreeBytes)throw Object.assign(Error('storage_capacity_limit'),{status:503,code:'storage_capacity_limit'});}
      const text=JSON.stringify(record,null,2)+'\n',size=Buffer.byteLength(text);
      if(this.backupBytes+size>this.maxBackupBytes)throw Object.assign(Error('storage_capacity_limit'),{status:503,code:'storage_capacity_limit'});
      const versions=path.join(this.directory,'versions');await fs.mkdir(versions,{recursive:true,mode:0o700});
      const backupFile=path.join(versions,String(record.revision).padStart(12,'0')+'.json');
      const backup=await fs.open(backupFile,'wx',0o600).catch(e=>{if(e.code==='EEXIST')return null;throw e;});
      if(backup){try{await backup.writeFile(text);await backup.sync();this.backupBytes+=size;}finally{await backup.close();}}
      else if(await fs.readFile(backupFile,'utf8')!==text)throw Error('Backup integrity failure');
      const dir=await fs.open(versions,'r');try{await dir.sync();}finally{await dir.close();}
  }
  update(input,expected){
    const job=this.queue.then(async()=>{
      if(this.failure)throw this.failure;
      if(expected!==tag(this.record))throw Object.assign(Error('revision_conflict'),{status:412,code:'revision_conflict'});
      const definition=this.model.normalize(input);
      if(JSON.stringify(definition)===JSON.stringify(this.record.definition))return this.read();
      await this.backupRecord(this.record);
      const next={...this.record,revision:this.record.revision+1,updatedAt:new Date().toISOString(),definition};
      try{await this.atomic(next);}catch(e){this.failure=e;throw e;}
      this.record=next;return this.read();
    });this.queue=job.catch(()=>{});return job;
  }
  // Operator-only local maintenance helper. HTTP never exposes restore/delete/history writes.
  async rollback(revision,expected){
    if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid backup revision');
    const record=this.validateRecord(JSON.parse(await fs.readFile(path.join(this.directory,'versions',String(revision).padStart(12,'0')+'.json'),'utf8')));
    return this.update(record.definition,expected);
  }
}
module.exports={DefinitionStore,tag};
