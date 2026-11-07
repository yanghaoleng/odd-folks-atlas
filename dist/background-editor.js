/* Background inspector only. Shared rendering configuration, never identity state. */
(()=>{
'use strict';
const palettes=[['糖果',['#f8bbd0','#ffdf9a','#b9dce9']],['海盐',['#b8e3e9','#b9cbff','#c7eee0']],['暖阳',['#ffd791','#ffc3aa','#f4e9ae']],['森林',['#b8d9b6','#dce8a8','#acd6ce']],['莓果',['#ddc4ef','#efb9d3','#becaf1']]];
const shapeNames={petals:'圆瓣花',disc:'圆形',rounded:'圆角方',diamond:'菱形',bubbles:'泡泡',halo:'圆环',mix:'随机几何'};
let panel=null,previewHost=null,eventName='entrance',ready=false;
const config=()=>AvatarBackground.resolve(state.backgroundMotion);
const $=id=>document.getElementById(id);
function status(){const el=$('backgroundSaveStatus');if(!el)return;el.textContent=window.AvatarDemo?.active?'仅本页预览，不保存':conflict?'版本冲突，修改已保留':!canWrite||syncError?'暂未同步，修改已保留':dirty||saving?'正在自动同步…':'背景动效已同步';}
function refresh(){
 if(!ready)return;const value=config();
 for(const button of panel.querySelectorAll('[data-background-shape]'))button.setAttribute('aria-pressed',String(button.dataset.backgroundShape===value.shape));
 for(const button of panel.querySelectorAll('[data-background-palette]'))button.setAttribute('aria-pressed',String(JSON.stringify(palettes[+button.dataset.backgroundPalette][1])===JSON.stringify(value.colors)));
 $('backgroundEvent').value=eventName;$('backgroundEmphasis').value=value.emphasis;$('backgroundOpacity').value=value.opacity;$('backgroundEnabled').checked=value[eventName].enabled;
 for(const key of ['delay','enter','hold','exit'])if(document.activeElement!==$('background-'+key))$('background-'+key).value=value[eventName][key];
 const colors=$('backgroundCustomColors');if(!colors.contains(document.activeElement)){colors.replaceChildren();value.colors.forEach((color,index)=>{const label=document.createElement('label');label.title='背景颜色 '+(index+1);const input=document.createElement('input');input.type='color';input.value=color;input.setAttribute('aria-label',label.title);input.onchange=()=>change(next=>{next.colors[index]=input.value});label.append(input);colors.append(label);});}
 renderMotionPreview(previewHost);AvatarMotion.configure(previewHost,motionConfig(),value);status();
}
function preview(event=eventName){
 if(!ready)return;renderMotionPreview(previewHost);const motion=motionConfig();motion[event].enabled=true;AvatarMotion.configure(previewHost,motion,config());AvatarMotion.play(previewHost,event);
}
function change(update){
 const next=config();update(next);try{AvatarBackground.validate(next)}catch{toast('背景参数超出范围');refresh();return}
 startHistory();state.backgroundMotion=next;backgroundEdited=true;finishHistory();save();refresh();preview();
}
function setup(){
 if(ready||!window.AvatarBackground||typeof editorSetupReady==='undefined'||!editorSetupReady)return;panel=$('backgroundProperties');if(!panel)return;
 panel.innerHTML='<p class="hint background-intro">只在入场和点击时出现，不参与昵称或身份。此部署遵循事件总开关，预览可单独播放。</p><div id="backgroundPreview" class="motion-preview background-preview" role="button" tabindex="0" aria-label="播放背景动画"></div><div class="background-play-actions"><button type="button" id="backgroundPlayEntrance">预览入场</button><button type="button" id="backgroundPlayClick">预览点击</button></div><div class="background-shapes" role="group" aria-label="背景几何形状"></div><div class="background-palettes" role="group" aria-label="背景配色"></div><div id="backgroundCustomColors" class="background-colors"></div><label class="background-field">强调方式<select id="backgroundEmphasis"><option value="auto">跟随形状</option><option value="rotate">旋转</option><option value="pulse">轻轻呼吸</option><option value="bounce">上下轻跳</option><option value="none">静止停留</option></select></label><label class="background-field">颜色浓度<input id="backgroundOpacity" type="range" min="0.1" max="0.8" step="0.02" aria-label="背景颜色浓度"></label><details class="background-timing"><summary>事件与时间</summary><label class="background-field">编辑事件<select id="backgroundEvent"><option value="entrance">入场</option><option value="click">点击</option></select></label><label class="background-check"><input id="backgroundEnabled" type="checkbox">在这个事件显示背景</label><div class="background-time-grid"><label>延迟（ms）<input id="background-delay" type="number" min="0" max="1500" step="10"></label><label>入场（ms）<input id="background-enter" type="number" min="100" max="1000" step="10"></label><label>强调（ms）<input id="background-hold" type="number" min="100" max="3000" step="10"></label><label>出场（ms）<input id="background-exit" type="number" min="100" max="1000" step="10"></label></div><div class="background-json"><button type="button" id="backgroundExport">导出背景</button><label>导入背景<input id="backgroundImport" type="file" accept="application/json,.json"></label></div><button type="button" id="backgroundReset" class="text-button">恢复默认背景</button></details><p class="hint" id="backgroundSaveStatus" role="status"></p>';
 previewHost=$('backgroundPreview');for(const layer of ['head','accessory','mood']){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.className='refine-avatar-'+layer;canvas.setAttribute('aria-hidden','true');previewHost.append(canvas)}
 const shapes=panel.querySelector('.background-shapes');for(const shape of AvatarBackground.shapes){const b=document.createElement('button');b.type='button';b.dataset.backgroundShape=shape;b.dataset.avatarSound='select';b.textContent=shapeNames[shape];b.onclick=()=>change(next=>{next.shape=shape});shapes.append(b);}
 const palettesHost=panel.querySelector('.background-palettes');palettes.forEach(([name,colors],index)=>{const button=document.createElement('button');button.type='button';button.dataset.backgroundPalette=index;button.dataset.avatarSound='select';button.setAttribute('aria-label',name+'配色');button.title=name;for(const color of colors){const dot=document.createElement('span');dot.style.backgroundColor=color;dot.setAttribute('aria-hidden','true');button.append(dot)}button.onclick=()=>change(next=>{next.colors=[...colors]});palettesHost.append(button);});
 $('backgroundEvent').onchange=()=>{eventName=$('backgroundEvent').value;refresh();preview()};$('backgroundEmphasis').onchange=()=>change(next=>{next.emphasis=$('backgroundEmphasis').value});$('backgroundOpacity').onchange=()=>change(next=>{next.opacity=Number($('backgroundOpacity').value)});$('backgroundEnabled').onchange=()=>change(next=>{next[eventName].enabled=$('backgroundEnabled').checked});
 for(const key of ['delay','enter','hold','exit'])$('background-'+key).onchange=()=>change(next=>{next[eventName][key]=Number($('background-'+key).value)});
 $('backgroundPlayEntrance').onclick=()=>preview('entrance');$('backgroundPlayClick').onclick=()=>preview('click');previewHost.onclick=()=>preview('click');previewHost.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();preview('click')}};
 $('backgroundReset').onclick=()=>change(next=>Object.assign(next,AvatarBackground.defaults()));
 $('backgroundExport').onclick=()=>{const blob=new Blob([JSON.stringify(config(),null,2)+'\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='avatar-background-v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)};
 $('backgroundImport').onchange=async()=>{const file=$('backgroundImport').files[0];if(!file)return;try{if(file.size>8192)throw Error();const next=AvatarBackground.validate(JSON.parse(await file.text()));change(value=>Object.assign(value,next));toast('背景配置已导入')}catch{toast('背景文件格式不正确，原配置未改动')}finally{$('backgroundImport').value=''}};
 for(const id of ['backgroundPlayEntrance','backgroundPlayClick','backgroundPreview'])$(id).dataset.avatarSound='reaction';$('backgroundReset').dataset.avatarSound='select';ready=true;refresh();
}
window.avatarBackgroundEditor={setup,refresh,status,preview};
document.addEventListener('avatar-layer-change',event=>{setup();if(event.detail?.layer==='background'){refresh();preview()}});
window.addEventListener('avatar-editor-ready',setup);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
