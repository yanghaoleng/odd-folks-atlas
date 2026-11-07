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
 // Put animation editing first; source-instance replacement is a secondary choice.
 const properties=$('layerProperties');properties.prepend(motion);const emphasis=$('inspectorEmphasis').closest('label'),emphasisButtons=body.querySelector('[data-select="inspectorEmphasis"]');motion.prepend(emphasis,emphasisButtons);play.after($('inspectorSyncStatus'),$('inspectorRetry'));
 for(const [id,label]of [['animal','替换动物'],['accessory','替换配饰'],['mood','替换情绪']])body.querySelector(`[data-select="${id}"] .compact-choice-caption span`).textContent=label;
 const background=$('backgroundProperties'),backgroundTiming=background.querySelector('.background-timing');background.prepend($('backgroundEmphasis').closest('label'),body.querySelector('[data-select="backgroundEmphasis"]'),$('backgroundEvent').closest('label'),body.querySelector('[data-select="backgroundEvent"]'),$('backgroundEnabled').closest('label'),background.querySelector('.background-play-actions'),backgroundTiming);
 installPageScrollGuard(panel);
 body.addEventListener('change',()=>queueMicrotask(refresh));document.addEventListener('avatar-layer-change',()=>{body.scrollTop=0;refresh()});
 installSheetGesture(panel,body);const fitStage=()=>{if(panel.open&&matchMedia('(max-width:760px)').matches){const top=$('stageCapture').getBoundingClientRect().top;document.documentElement.style.setProperty('--compact-stage-limit',Math.max(96,panel.getBoundingClientRect().top-top-14)+'px')}};new ResizeObserver(fitStage).observe(panel);window.addEventListener('resize',fitStage);window.AvatarCompactInspector={refresh(){refresh();requestAnimationFrame(fitStage)}};refresh();syncInspectorProperties();
}
function installPageScrollGuard(panel){
 // CSS handles current browsers. This narrowly scoped fallback only consumes an
 // outward pull at the document top, never ordinary/nested scrolling or the sheet.
 let point=null;
 const path=e=>e.composedPath?e.composedPath():[e.target];
 document.addEventListener('touchstart',e=>{if(e.touches.length!==1||path(e).includes(panel)){point=null;return}point={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
 document.addEventListener('touchmove',e=>{
  if(!point||e.touches.length!==1||!e.cancelable||path(e).includes(panel))return;
  const t=e.touches[0],dx=t.clientX-point.x,dy=t.clientY-point.y;point={x:t.clientX,y:t.clientY};
  if(dy<=0||Math.abs(dx)>Math.abs(dy)||(document.scrollingElement?.scrollTop||0)>0)return;
  const canScroll=path(e).some(el=>el instanceof Element&&el!==document.body&&el!==document.documentElement&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1&&el.scrollTop>0);
  if(!canScroll&&!path(e).some(el=>el instanceof Element&&el.matches('input,textarea,select,[contenteditable="true"]')))e.preventDefault();
 },{passive:false});
 const clear=()=>{point=null};document.addEventListener('touchend',clear,{passive:true});document.addEventListener('touchcancel',clear,{passive:true});
}
function installSheetGesture(panel,body){
 let gesture=null,settle=null,momentum=0,wheelDistance=0,wheelTimer=0,suppressClick=false;
 const mobile=()=>matchMedia('(max-width:760px)').matches;
 const stopMomentum=()=>{if(momentum)cancelAnimationFrame(momentum);momentum=0};
 const reset=()=>{gesture=null;stopMomentum();wheelDistance=0;clearTimeout(wheelTimer);settle?.cancel();settle=null;panel.style.transform='';panel.classList.remove('sheet-dragging');suppressClick=false;};
 const draw=distance=>{panel.style.transform=`translateY(${distance}px)`;panel.classList.toggle('sheet-dragging',Math.abs(distance)>.1)};
 function finish(distance,cancel=false){
  panel.classList.remove('sheet-dragging');if(!cancel&&Math.abs(distance)>=64){closeInspector(Math.sign(distance));return}
  if(!distance||matchMedia('(prefers-reduced-motion:reduce)').matches){panel.style.transform='';return}
  const animation=panel.animate([{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});settle=animation;animation.onfinish=()=>{if(settle===animation){panel.style.transform='';settle=null}};
 }
 function coast(velocity){
  if(Math.abs(velocity)<.08||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  let previous=performance.now();const tick=now=>{const dt=Math.min(32,now-previous);previous=now;velocity*=Math.exp(-dt/220);const max=Math.max(0,body.scrollHeight-body.clientHeight),next=Math.max(0,Math.min(max,body.scrollTop-velocity*dt));body.scrollTop=next;if(!panel.open||next<=0||next>=max||Math.abs(velocity)<.02){momentum=0;return}momentum=requestAnimationFrame(tick)};momentum=requestAnimationFrame(tick);
 }
 function touchStart(e){
  if(!mobile()||!panel.open||inspectorTransition||e.touches.length!==1||e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  stopMomentum();clearTimeout(wheelTimer);wheelDistance=0;const current=settle?new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42:0;settle?.cancel();settle=null;draw(current);suppressClick=false;
  const t=e.touches[0];gesture={id:t.identifier,x:t.clientX,y:t.clientY,lastY:t.clientY,lastTime:performance.now(),vertical:false,distance:current,velocity:0,content:body.contains(e.target)};
 }
 function moveContent(delta){
  // One gesture owner consumes content scrolling first and carries only the
  // unconsumed finger movement into the sheet. Reversing returns to scrolling.
  if(gesture.distance&&Math.sign(delta)!==Math.sign(gesture.distance)){
   const previous=gesture.distance;gesture.distance=previous+delta*.94;
   if(Math.sign(gesture.distance)===Math.sign(previous)){draw(gesture.distance);return}
   delta+=previous/.94;gesture.distance=0;
  }
  if(!gesture.distance&&gesture.content){const max=Math.max(0,body.scrollHeight-body.clientHeight),before=body.scrollTop;body.scrollTop=Math.max(0,Math.min(max,before-delta));delta-=before-body.scrollTop;}
  gesture.distance=Math.max(-panel.clientHeight*.85,Math.min(panel.clientHeight*.85,gesture.distance+delta*.94));draw(gesture.distance);
 }
 function touchMove(e){
  if(!gesture)return;if(e.touches.length!==1){finish(gesture.distance,true);gesture=null;return}
  const t=[...e.touches].find(t=>t.identifier===gesture.id);if(!t)return;const dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(!gesture.vertical&&Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>6){gesture=null;return}
  if(!gesture.vertical&&Math.abs(dy)<6)return;
  if(!e.cancelable){finish(gesture.distance,true);gesture=null;return}e.preventDefault();gesture.vertical=true;suppressClick=true;
  const now=performance.now(),delta=t.clientY-gesture.lastY,dt=Math.max(8,now-gesture.lastTime);gesture.velocity=.35*gesture.velocity+.65*Math.max(-2,Math.min(2,delta/dt));gesture.lastY=t.clientY;gesture.lastTime=now;moveContent(delta);
 }
 function touchEnd(e,cancel=false){
  if(!gesture)return;const current=gesture;gesture=null;finish(current.distance,cancel);
  if(!cancel&&current.vertical&&!current.distance&&performance.now()-current.lastTime<100)coast(current.velocity);
  if(cancel)suppressClick=false;else if(suppressClick)setTimeout(()=>{suppressClick=false},350);
 }
 panel.addEventListener('touchstart',touchStart,{passive:true});panel.addEventListener('touchmove',touchMove,{passive:false});panel.addEventListener('touchend',e=>touchEnd(e),{passive:true});panel.addEventListener('touchcancel',e=>touchEnd(e,true),{passive:true});
 panel.addEventListener('pointerdown',()=>{suppressClick=false},{capture:true});
 panel.addEventListener('click',e=>{if(suppressClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();suppressClick=false}},{capture:true});
 body.addEventListener('wheel',e=>{if(!mobile()||!panel.open||e.ctrlKey||e.target.closest('input,select,textarea')||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;const max=Math.max(0,body.scrollHeight-body.clientHeight),out=(e.deltaY<0&&body.scrollTop<=1)||(e.deltaY>0&&body.scrollTop>=max-1);if(!out){if(wheelDistance){const previous=wheelDistance;wheelDistance=0;clearTimeout(wheelTimer);finish(previous,true)}return}e.preventDefault();stopMomentum();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?body.clientHeight:1);wheelDistance=Math.max(-150,Math.min(150,wheelDistance-delta*.35));draw(wheelDistance);clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{const d=wheelDistance;wheelDistance=0;finish(d)},130)},{passive:false});
 panel.addEventListener('close',reset);window.addEventListener('resize',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});
}
window.addEventListener('avatar-editor-ready',setup);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});if(typeof editorSetupReady!=='undefined'&&editorSetupReady)setup();
})();
