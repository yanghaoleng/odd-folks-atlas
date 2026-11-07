(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const value=factory(node?require('./avatar-identity-v3.js'):root.AvatarIdentityManifest,node?require('./avatar-character-candidates.js'):root.AvatarCharacterCandidates);
 if(node)module.exports=value;else root.AvatarEditorManifest=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(canonical,extension){
 'use strict';
 if(canonical?.mappingVersion!=='refinetaste-assets-v3'||extension?.version!=='odd-folks-atlas-characters-v1'||!Array.isArray(extension.animals))throw Error('Verified editor manifests required');
 // Separate editor copy; canonically promoted candidates must match their verified source asset.
 const manifest=JSON.parse(JSON.stringify(canonical));
 for(const [group,prefix,layer,keyPrefix]of [['animals','animal','head','character-'],['emotions','emotion','mood','visor-']]){
  const ids=new Set(manifest[group].map(row=>row.id)),keys=new Set(manifest[group].map(row=>row.layerKey));
  for(const source of extension[group]||[]){
   const row=JSON.parse(JSON.stringify(source)),key=row.layerKey;
   if(!/^[a-z][a-z0-9-]{0,31}$/.test(key)||!key.startsWith(keyPrefix)||row.id!==prefix+':'+key||row.state!=='pending'||row.editorOnly!==true||row.asset?.id!==layer+':'+key||row.asset.url!=='/assets/characters-v1/'+key+'.png'||!/^[a-f0-9]{64}$/.test(row.asset.sha256))throw Error('Invalid editor-only material');
   if(ids.has(row.id)||keys.has(key)){
    const promoted=manifest[group].find(item=>item.id===row.id&&item.layerKey===key);
    if(!promoted||promoted.editorOnly||['id','url','sha256','mimeType','width','height','bytes','editorFit'].some(field=>promoted.asset?.[field]!==row.asset?.[field]))throw Error('Promoted editor material differs from verified source');
    continue;
   }
   if(group==='emotions'&&!manifest.accessories.some(a=>a.id===row.accessoryId&&a.state==='active'))throw Error('Invalid editor accessory pairing');
   ids.add(row.id);keys.add(key);manifest[group].push(row);
  }
 }
 manifest.editorExtensionVersion=extension.version;
 return manifest;
});
