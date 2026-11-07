/* Compact presentation only. The original controls own history, validation and saves. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),choices=new Map();let ready=false,refreshing=false;
function refresh(){
 if(!ready||refreshing)return;refreshing=true;
 for(const [select,entry]of choices){
  const options=[...select.options],signature=options.map(o=>o.value+'\0'+o.textContent+'\0'+o.disabled).join('\n');
  if(entry.signature!==signature){entry.signature=signature;entry.grid.replaceChildren();for(const option of options){const b=document.createElement('button');b.type='button';b.dataset.choice=option.value;b.dataset.avatarSound='select';b.textContent=option.textContent.replace(/^([A-Z]\d+) /,'').replace(/ · 待调位$/,'').split(' · ')[0];b.title=option.textContent;b.setAttribute('aria-label',option.textContent);b.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh()};entry.grid.append(b)}}
  const buttons=[...entry.grid.children],selected=buttons.findIndex(b=>b.dataset.choice===select.value),visible=new Set(buttons.slice(0,entry.limit).map(b=>b.dataset.choice));if(selected>=entry.limit){visible.delete(buttons[entry.limit-1]?.dataset.choice);visible.add(select.value)}
  buttons.forEach((b,index)=>{b.disabled=select.disabled||options[index].disabled;b.setAttribute('aria-pressed',String(b.dataset.choice===select.value));b.hidden=!entry.expanded&&!visible.has(b.dataset.choice)});
  entry.more.hidden=buttons.length<=entry.limit;entry.more.textContent=entry.expanded?'收起':'全部 '+buttons.length;entry.more.setAttribute('aria-expanded',String(entry.expanded));
 }
 refreshing=false;
}
function buttonsFor(id,{limit=Infinity,tab=false}={}){
 const select=$(id);if(!select||choices.has(select))return;const label=select.closest('label'),group=document.createElement('div');group.className='compact-choice-field';group.dataset.select=id;
 const caption=document.createElement('div');caption.className='compact-choice-caption';const text=document.createElement('span');text.id=id+'ChoicesLabel';text.textContent=label.firstChild?.textContent?.trim()||select.getAttribute('aria-label')||'选择';caption.append(text);
 const grid=document.createElement('div');grid.className='compact-choices'+(tab?' compact-event-tabs':'');grid.setAttribute('role','group');grid.setAttribute('aria-labelledby',text.id);grid.id=id+'Choices';
 const more=document.createElement('button');more.className='compact-more';more.type='button';more.setAttribute('aria-controls',grid.id);const entry={grid,more,limit,expanded:false,signature:null};more.onclick=()=>{entry.expanded=!entry.expanded;refresh()};caption.append(more);group.append(caption,grid);
 label.classList.add('compact-native-choice');label.after(group);if(label.dataset.inspectorLayer)group.dataset.inspectorLayer=label.dataset.inspectorLayer;
 choices.set(select,entry);new MutationObserver(refresh).observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled']});
}
function stagePreview(host){
 const stage=$('stageCapture');host.classList.add('compact-stage-preview');host.removeAttribute('role');host.removeAttribute('tabindex');host.setAttribute('aria-hidden','true');stage.append(host);
 new MutationObserver(()=>{const active=host.hasAttribute('data-motion-event');if(active){for(const other of stage.querySelectorAll('.compact-stage-preview'))if(other!==host)AvatarMotion.stop(other)}stage.classList.toggle('compact-preview-playing',[...stage.querySelectorAll('.compact-stage-preview')].some(p=>p.hasAttribute('data-motion-event')))}).observe(host,{attributes:true,attributeFilter:['data-motion-event']});
}
function setup(){
 if(ready||!window.AvatarInspector||!$('backgroundEvent'))return;ready=true;
 const panel=$('materialPanel'),body=panel.querySelector('.drawer-body'),tabs=body.querySelector('.tabs');panel.classList.add('compact-inspector');panel.removeAttribute('aria-labelledby');panel.setAttribute('aria-label','编辑图层');
 const strip=document.createElement('div');strip.className='compact-inspector-tabs';strip.append(tabs,$('panelClose'));panel.prepend(strip);panel.querySelector('.drawer-head').hidden=true;tabs.addEventListener('keydown',event=>{if(!['Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.querySelectorAll('button[data-layer]')],target=event.key==='Home'?buttons[0]:buttons.at(-1);target.click();target.focus()});
 const hint=document.createElement('span');hint.id='inspectorGestureHelp';hint.className='sr-only';hint.textContent='滚动到内容边缘后继续向外滑动可收起。也可按 Escape 或使用关闭按钮。';panel.append(hint);panel.setAttribute('aria-describedby',hint.id);
 for(const id of ['motionPreview','backgroundPreview'])stagePreview($(id));
 $('stageCapture').addEventListener('pointerdown',()=>{for(const host of $('stageCapture').querySelectorAll('.compact-stage-preview'))AvatarMotion.stop(host)},{capture:true});
 panel.addEventListener('close',()=>{panel.style.transform='';for(const host of $('stageCapture').querySelectorAll('.compact-stage-preview'))AvatarMotion.stop(host)});
 const motion=$('motionSection'),advanced=document.createElement('details'),summary=document.createElement('summary');advanced.className='compact-advanced';summary.textContent='时间与更多设置';advanced.append(summary);
 const styleLabel=$('motionStyle').closest('label'),eventLabel=$('motionEvent').closest('label'),play=motion.querySelector('.motion-actions');
 motion.insertBefore(styleLabel,play);motion.insertBefore(eventLabel,styleLabel);
 for(const child of [...motion.children])if(!['motionTitle'].includes(child.id)&&child!==eventLabel&&child!==styleLabel&&child!==play)advanced.append(child);
 motion.append(advanced);$('motionTitle').classList.add('sr-only');
 // Keep infrequent numeric/import/export controls, but remove duplicated explanation.
 motion.querySelectorAll('p.hint').forEach(el=>el.classList.add('sr-only'));
 const reset=$('resetAsset');advanced.append(reset);delete reset.dataset.inspectorLayer;
 body.querySelector('.inspector-preview-options summary').textContent='预览与同步设置';
 for(const id of ['animal','accessory','mood'])buttonsFor(id,{limit:8});
 for(const id of ['inspectorEmphasis','motionStyle','backgroundEmphasis','previewMode'])buttonsFor(id);
 for(const id of ['motionEvent','backgroundEvent'])buttonsFor(id,{tab:true});
 body.addEventListener('change',()=>queueMicrotask(refresh));document.addEventListener('avatar-layer-change',()=>{body.scrollTop=0;refresh()});
 installSheetGesture(panel,body);const fitStage=()=>{if(panel.open&&matchMedia('(max-width:760px)').matches){const top=$('stageCapture').getBoundingClientRect().top;document.documentElement.style.setProperty('--compact-stage-limit',Math.max(96,panel.getBoundingClientRect().top-top-14)+'px')}};new ResizeObserver(fitStage).observe(panel);window.addEventListener('resize',fitStage);window.AvatarCompactInspector={refresh(){refresh();requestAnimationFrame(fitStage)}};refresh();syncInspectorProperties();
}
function installSheetGesture(panel,body){
 let gesture=null,settle=null,wheelDistance=0,wheelTimer=0,suppressClick=false;
 const mobile=()=>matchMedia('(max-width:760px)').matches;
 const reset=()=>{gesture=null;wheelDistance=0;clearTimeout(wheelTimer);settle?.cancel();settle=null;panel.style.transform='';panel.classList.remove('sheet-dragging');};
 function draw(distance){panel.style.transform=`translateY(${distance}px)`;panel.classList.add('sheet-dragging')}
 function finish(distance,cancel=false){panel.classList.remove('sheet-dragging');if(!cancel&&Math.abs(distance)>=64){closeInspector(Math.sign(distance));return}if(!distance)return;if(matchMedia('(prefers-reduced-motion:reduce)').matches){panel.style.transform='';return}settle=panel.animate([{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});settle.onfinish=()=>{panel.style.transform='';settle=null}}
 function touchStart(e){if(!mobile()||!panel.open||e.touches.length!==1||e.target.closest('input,select,textarea,[contenteditable="true"]'))return;settle?.cancel();settle=null;panel.style.transform='';const t=e.touches[0];gesture={id:t.identifier,x:t.clientX,y:t.clientY,mode:null,distance:0};}
 function touchMove(e){if(!gesture)return;if(e.touches.length!==1){finish(gesture.distance,true);gesture=null;return}const t=[...e.touches].find(t=>t.identifier===gesture.id);if(!t)return;const dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(!gesture.mode&&Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>7){gesture=null;return}
  if(!gesture.mode&&Math.abs(dy)<7)return;
  const max=Math.max(0,body.scrollHeight-body.clientHeight),atTop=body.scrollTop<=1,atBottom=body.scrollTop>=max-1;
  if(!gesture.mode){gesture.mode=(dy>0&&atTop)||(dy<0&&atBottom)?'sheet':'scroll';if(gesture.mode==='sheet')gesture.y=t.clientY;}
  if(gesture.mode==='scroll'){
   const step=t.clientY-gesture.y;if((step>0&&atTop)||(step<0&&atBottom)){gesture.mode='sheet';gesture.y=t.clientY}else{gesture.y=t.clientY;return;}
  }
  if(e.cancelable)e.preventDefault();
  if(gesture.mode==='sheet'){gesture.distance=(t.clientY-gesture.y)*.82;draw(gesture.distance);if(Math.abs(gesture.distance)>8)suppressClick=true;}
 }
 function touchEnd(e,cancel=false){if(!gesture)return;const distance=gesture.distance;gesture=null;finish(distance,cancel);if(suppressClick)setTimeout(()=>{suppressClick=false},350)}
 panel.addEventListener('touchstart',touchStart,{passive:true});panel.addEventListener('touchmove',touchMove,{passive:false});panel.addEventListener('touchend',e=>touchEnd(e),{passive:true});panel.addEventListener('touchcancel',e=>touchEnd(e,true),{passive:true});
 panel.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false}},{capture:true});
 // Wheel users retain native scrolling. Only continued outward travel at an edge dismisses.
 body.addEventListener('wheel',e=>{if(!mobile()||!panel.open||e.ctrlKey||e.target.closest('input,select,textarea')||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;const max=Math.max(0,body.scrollHeight-body.clientHeight),out=(e.deltaY<0&&body.scrollTop<=1)||(e.deltaY>0&&body.scrollTop>=max-1);if(!out){if(wheelDistance){const previous=wheelDistance;wheelDistance=0;clearTimeout(wheelTimer);finish(previous,true)}return}e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?body.clientHeight:1);wheelDistance+=-delta*.35;wheelDistance=Math.max(-150,Math.min(150,wheelDistance));draw(wheelDistance);clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{const d=wheelDistance;wheelDistance=0;finish(d)},130)},{passive:false});
 panel.addEventListener('close',reset);window.addEventListener('resize',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});
}
window.addEventListener('avatar-editor-ready',setup);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});if(typeof editorSetupReady!=='undefined'&&editorSetupReady)setup();
})();
