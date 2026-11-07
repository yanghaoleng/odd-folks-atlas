/* Same-document workspace tabs. The editor and resource draft stay mounted. */
(()=>{
'use strict';
const root=document.documentElement,body=document.body;
body.dataset.focusInput='pointer';document.addEventListener('pointerdown',()=>{body.dataset.focusInput='pointer'},{capture:true,passive:true});document.addEventListener('keydown',event=>{if(!['Shift','Control','Alt','Meta'].includes(event.key))body.dataset.focusInput='keyboard'},{capture:true});
let ready=false,active='editor',catalog=null,catalogLoading=false,lastEditorFocus=null,tabButtons=[];
function setup(){
 if(ready||!window.AvatarInspector)return;ready=true;
 const header=document.querySelector('body.editor-page > header'),nav=header.querySelector('nav'),editor=document.querySelector('body.editor-page > main');
 if(!header||!editor)return;
 body.classList.add('workspace-shell');editor.id='workspaceEditorView';editor.setAttribute('role','tabpanel');editor.setAttribute('aria-labelledby','workspaceEditorTab');
 const tabs=document.createElement('div');tabs.id='workspaceMainTabs';tabs.className='workspace-main-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','头像工作区');
 for(const [id,label,panel]of [['editor','头像编辑器','workspaceEditorView'],['resources','资源对照表','workspaceResourcesView']]){const b=document.createElement('button');b.id=id==='editor'?'workspaceEditorTab':'workspaceResourcesTab';b.type='button';b.dataset.workspaceTab=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel);b.textContent=label;b.onclick=()=>switchView(id,{history:true});tabs.append(b);tabButtons.push(b)}
 header.insertBefore(tabs,nav);nav.querySelector('.catalog-entry')?.remove();document.getElementById('motionOpen').hidden=true;
 const resources=document.createElement('section');resources.id='workspaceResourcesView';resources.className='workspace-resources-view';resources.hidden=true;resources.setAttribute('role','tabpanel');resources.setAttribute('aria-labelledby','workspaceResourcesTab');
 const loading=document.createElement('p');loading.className='workspace-resource-status';loading.id='workspaceResourceStatus';loading.textContent='正在打开资源对照表…';loading.setAttribute('role','status');resources.append(loading);editor.after(resources);
 const heading=document.querySelector('.gallery-heading'),shuffle=document.getElementById('batchButton');heading.append(shuffle);shuffle.querySelector('span').textContent='换一组';shuffle.setAttribute('aria-label','换一组随机头像');
 document.getElementById('resizeHelp').hidden=true;document.getElementById('workspaceResize').removeAttribute('aria-describedby');
 const updateHeader=()=>root.style.setProperty('--workspace-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');new ResizeObserver(updateHeader).observe(header);updateHeader();
 tabs.addEventListener('keydown',event=>{let index=tabButtons.indexOf(document.activeElement);if(index<0)return;const next=event.key==='ArrowRight'?(index+1)%2:event.key==='ArrowLeft'?(index+1)%2:event.key==='Home'?0:event.key==='End'?1:null;if(next===null)return;event.preventDefault();tabButtons[next].focus();switchView(tabButtons[next].dataset.workspaceTab,{history:true})});
 window.addEventListener('popstate',()=>switchView(new URL(location.href).searchParams.get('view')==='resources'?'resources':'editor'));
 // Save interception is app-scoped and never applies inside text editors or resource cells.
 document.addEventListener('keydown',event=>{if(active!=='editor'||document.querySelector('dialog:modal')||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if((event.metaKey||event.ctrlKey)&&!event.altKey&&event.key.toLowerCase()==='s'){event.preventDefault();retrySync();}});
 window.AvatarWorkspace={showEditor:()=>switchView('editor',{history:true}),showResources:()=>switchView('resources',{history:true}),get active(){return active}};
 switchView(new URL(location.href).searchParams.get('view')==='resources'?'resources':'editor');
}
function switchView(next,{history:writeHistory=false}={}){
 if(!ready)return;const editor=document.getElementById('workspaceEditorView'),resources=document.getElementById('workspaceResourcesView');if(!editor||!resources)return;
 if(next==='resources'&&active==='editor'&&editor.contains(document.activeElement))lastEditorFocus=document.activeElement;
 if(next!=='resources'&&catalog)catalog.shadowRoot.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 active=next==='resources'?'resources':'editor';body.dataset.workspaceView=active;editor.hidden=active!=='editor';resources.hidden=active!=='resources';
 for(const b of tabButtons){const selected=b.dataset.workspaceTab===active;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1}
 const nav=document.querySelector('body.editor-page > header nav');nav.hidden=active==='resources';
 if(active==='resources'&&!catalog&&!catalogLoading)void mountCatalog(resources);
 if(active==='editor')requestAnimationFrame(()=>{window.AvatarInspector?.refresh();window.dispatchEvent(new Event('resize'))});
 if(writeHistory){const url=new URL(location.href);active==='resources'?url.searchParams.set('view','resources'):url.searchParams.delete('view');if(url.href!==location.href)window.history.pushState({workspace:active},'',url)}
}
async function mountCatalog(resources){
 catalogLoading=true;const status=document.getElementById('workspaceResourceStatus');status.hidden=false;status.textContent='正在打开资源对照表…';resources.querySelector('.workspace-resource-retry')?.remove();
 let host=null;
 try{
  const response=await fetch('catalog.html?component=1',{credentials:'same-origin',cache:'no-cache'});if(!response.ok)throw Error('资源表暂不可用');
  const parsed=new DOMParser().parseFromString(await response.text(),'text/html');if(!parsed.querySelector('#asset-table'))throw Error('资源表内容不完整');
  host=document.createElement('div');host.className='workspace-catalog-component';host.setAttribute('role','region');host.setAttribute('aria-label','资源对照表');const shadow=host.attachShadow({mode:'open'}),content=document.createElement('div');content.className='catalog-document';
  // Isolate stylesheet selectors, not the application or its data. No frame/CSP changes.
  for(const name of ['catalog.css','editor-theme.css','mobile-interaction.css']){const source=[...parsed.querySelectorAll('link[rel=stylesheet]')].find(el=>new URL(el.getAttribute('href'),location.href).pathname.endsWith('/'+name));if(source){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(source.getAttribute('href'),location.href).href;shadow.append(link)}}
  const css=document.createElement('link');css.rel='stylesheet';css.href=document.querySelector('link[data-catalog-component-style]')?.href||new URL('catalog-component.css',location.href).href;shadow.append(css);
  content.innerHTML=parsed.body.innerHTML;content.querySelectorAll('script').forEach(script=>script.remove());shadow.append(content);resources.append(host);
  // Let each table control handle the key first, then keep parent canvas shortcuts out.
  shadow.addEventListener('keydown',event=>event.stopPropagation());
  const facade={getElementById:id=>shadow.getElementById(id),querySelector:selector=>shadow.querySelector(selector),querySelectorAll:selector=>shadow.querySelectorAll(selector),createElement:document.createElement.bind(document),createTextNode:document.createTextNode.bind(document),body:content,addEventListener:document.addEventListener.bind(document)};
  Object.defineProperties(facade,{activeElement:{get:()=>shadow.activeElement},hidden:{get:()=>document.hidden||active!=='resources'}});window.AvatarCatalogDocument=facade;
  const source=[...parsed.scripts].find(script=>new URL(script.getAttribute('src')||'',location.href).pathname.endsWith('/catalog-editor.js'));if(!source)throw Error('资源表模块缺失');
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(source.getAttribute('src'),location.href).href;script.onload=resolve;script.onerror=()=>reject(Error('资源表模块加载失败'));document.body.append(script)});
  delete window.AvatarCatalogDocument;catalog=host;status.hidden=true;
 }catch(error){delete window.AvatarCatalogDocument;host?.remove();status.textContent='资源对照表暂未加载，请重试。';const retry=document.createElement('button');retry.className='workspace-resource-retry';retry.textContent='重新加载资源表';retry.onclick=()=>mountCatalog(resources);resources.append(retry)}finally{catalogLoading=false}
}
window.addEventListener('avatar-editor-ready',setup);
if(typeof editorSetupReady!=='undefined'&&editorSetupReady)setup();
})();
