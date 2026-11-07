'use strict';
// Run only after the owner explicitly authorizes this persistent credential setup.
// Receives the PIN on stdin, never argv/environment/logs; outputs no credential material.
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const {promisify}=require('node:util');
(async()=>{
 const directory=process.argv[2];if(!directory||!path.isAbsolute(directory))throw Error('Absolute auth directory required');
 let pin='';if(process.stdin.isTTY){process.stderr.write('Choose a six-digit administrator PIN (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();pin=await new Promise((resolve,reject)=>{let value='';const input=chunk=>{for(const c of chunk.toString()){if(c==='\u0003'){cleanup();reject(Error('Cancelled'));return;}if(c==='\r'||c==='\n'){cleanup();resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(/[0-9]/.test(c)&&value.length<6)value+=c;}};function cleanup(){process.stdin.off('data',input);process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n');}process.stdin.on('data',input);});}else for await(const chunk of process.stdin){pin+=chunk;if(pin.length>64)throw Error('Invalid credential input');}pin=pin.trim();if(!/^\d{6}$/.test(pin))throw Error('Six digits required');
 const salt=crypto.randomBytes(16),derived=await promisify(crypto.scrypt)(pin,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});pin='';
 await fs.mkdir(directory,{recursive:true,mode:0o700});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Auth directory must already be private (0700)');const file=await fs.open(path.join(directory,'credentials.json'),'wx',0o600);
 try{await file.writeFile(JSON.stringify({version:1,algorithm:'scrypt-32768-8-1',salt:salt.toString('hex'),hash:derived.toString('hex')})+'\n');await file.sync();}finally{await file.close();}
 const dir=await fs.open(directory,'r');try{await dir.sync();}finally{await dir.close();}
 process.stdout.write('Authorized credential provisioned. No credential values logged.\n');
})().catch(()=>{console.error('Credential setup failed; inspect target privately.');process.exitCode=1;});
