import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import { eventSource, event_types } from '../../../script.js';
import { getContext } from '../../../extensions.js';
import { getRequestHeaders } from '../../../script.js';
import { parseImageMarkers } from './trigger-core.js';

const EXT = 'qinghui_lite';
const defaults = { provider:'openai', endpoint:'https://api.openai.com/v1', apiKey:'', model:'gpt-image-1', size:'1024x1024', quality:'medium', naiModel:'nai-diffusion-4-5-full', naiSteps:28, naiScale:5, naiWidth:832, naiHeight:1216, naiSampler:'k_euler_ancestral', naiScheduler:'karras', prompt:'', negative:'', records:[] };
const $ = (s, root=document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false;
function cfg(){ extension_settings[EXT] ??= structuredClone(defaults); return extension_settings[EXT]; }
const autoTasks = new Set();
function markers(text){return parseImageMarkers(text).map(({index,prompt,marker})=>({index,prompt,raw:marker}));}
function hideMarkersInTextNode(root){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())if(walker.currentNode.nodeValue?.includes('image###'))nodes.push(walker.currentNode);for(const node of nodes){node.nodeValue=node.nodeValue.replace(/image###[\s\S]*?###/g,'');}}
async function requestImage(prompt, negativeOverride){
 const c=cfg();
 let raw='',data=null,res;
 if(c.provider==='novelai'){
  const payload={prompt,model:c.naiModel||'nai-diffusion-4-5-full',sampler:c.naiSampler||'k_euler_ancestral',noise_schedule:c.naiScheduler||'karras',steps:Number(c.naiSteps)||28,scale:Number(c.naiScale)||5,width:Number(c.naiWidth)||832,height:Number(c.naiHeight)||1216,negative_prompt:negativeOverride??c.negative??'',seed:-1};
  res=await fetch('/api/novelai/generate-image',{method:'POST',headers:getRequestHeaders(window.token),body:JSON.stringify(payload)});
  raw=await res.text();
  if(!res.ok)throw new Error('NovelAI 请求失败（HTTP '+res.status+'）：'+raw.slice(0,240));
  try{data=JSON.parse(raw);}catch{}
  let value=data?.images?.[0]??data?.image??raw.trim();
  if(typeof value!=='string'||!value)throw new Error('NovelAI 响应中没有可识别的图片');
  return /^(data:|https?:)/.test(value)?value:'data:image/png;base64,'+value.replace(/^data:image\/[^;]+;base64,/,'');
 }
 if(!c.endpoint||!c.apiKey)throw new Error('请先在轻绘设置中填写 OpenAI 兼容 API 地址和 Key');
 const model=String(c.model||'').toLowerCase();
 const negative=String(negativeOverride??c.negative??'').trim();
 const body={model:c.model,prompt,n:1,size:c.size};
 if(model.includes('gpt-image')){
  body.quality=c.quality;
  if(negative)body.prompt=prompt+'\n\nAvoid these visual elements: '+negative;
 }else if(negative){
  body.negative_prompt=negative;
 }
 res=await fetch(c.endpoint.replace(/\/$/, '')+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.apiKey},body:JSON.stringify(body)});
 raw=await res.text();
 try{data=JSON.parse(raw);}catch{throw new Error('接口返回非 JSON（HTTP '+res.status+'）');}
 if(!res.ok)throw new Error(data?.error?.message||'HTTP '+res.status);
 const item=data?.data?.[0];let url=item?.b64_json?'data:image/png;base64,'+item.b64_json:item?.url;
 if(!url&&data?.images?.[0]){const v=data.images[0];url=/^(data:|https?:)/.test(v)?v:'data:image/png;base64,'+v;}
 if(!url)throw new Error('响应中没有可识别的图片');
 return url;
}
function saveCleanImage(src,filename){
 if(!src)return;
 const a=document.createElement('a');a.href=src;a.download=filename||'qinghui-image.png';a.rel='noopener';a.style.display='none';document.body.append(a);a.click();a.remove();
}
function addMessageImage(host,url,prompt,taskKey,recordMeta={}) {
 if(!host)return;
 let card=[...host.querySelectorAll('.ql-chat-image')].find(el=>el.dataset.qlTask===taskKey);
 if(!card){
  card=document.createElement('figure');card.className='ql-chat-image';card.dataset.qlTask=taskKey;
  const img=document.createElement('img');img.loading='lazy';img.alt='轻绘生成图片';
  const caption=document.createElement('figcaption');caption.className='ql-chat-image-prompt';caption.textContent=prompt;
  const controls=document.createElement('div');controls.className='ql-chat-image-controls';
  const prev=document.createElement('button');prev.type='button';prev.className='menu_button';prev.textContent='‹ 上一张';
  const count=document.createElement('span');count.className='ql-chat-image-count';count.textContent='1 / 1';
  const next=document.createElement('button');next.type='button';next.className='menu_button';next.textContent='下一张 ›';
  const reroll=document.createElement('button');reroll.type='button';reroll.className='menu_button';reroll.textContent='再画一张';
  controls.append(prev,count,next,reroll);card.append(img,caption,controls);host.append(card);
  card._qlCandidates=[];card._qlIndex=0;
  const render=()=>{const list=card._qlCandidates;const i=card._qlIndex;img.src=list[i].url;count.textContent=(i+1)+' / '+list.length;prev.disabled=i<=0;next.disabled=i>=list.length-1;};
  const step=delta=>{const nextIndex=card._qlIndex+delta;if(nextIndex>=0&&nextIndex<card._qlCandidates.length){card._qlIndex=nextIndex;render();}};
  prev.addEventListener('click',()=>step(-1));
  next.addEventListener('click',()=>step(1));
  let touchX=0,touchY=0;
  img.addEventListener('touchstart',e=>{const t=e.changedTouches[0];touchX=t.clientX;touchY=t.clientY;},{passive:true});
  img.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-touchX,dy=t.clientY-touchY;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.25)step(dx<0?1:-1);},{passive:true});
  img.addEventListener('contextmenu',e=>{e.preventDefault();saveCleanImage(img.src,'qinghui-'+Date.now()+'.png');});
  reroll.addEventListener('click',async()=>{if(card.dataset.qlBusy==='1')return;card.dataset.qlBusy='1';reroll.disabled=true;const old=reroll.textContent;reroll.textContent='生成中…';try{const fresh=await requestImage(prompt);card._qlCandidates.push({url:fresh,at:Date.now()});card._qlIndex=card._qlCandidates.length-1;render();storeChatRecord(fresh,prompt,taskKey,recordMeta);}catch(e){const note=document.createElement('p');note.className='ql-chat-image-status';note.textContent='轻绘生成失败：'+(e?.message||String(e));card.append(note);}finally{card.dataset.qlBusy='0';reroll.disabled=false;reroll.textContent=old;}});
  card._qlRender=render;
 }
 if(!card._qlCandidates.some(item=>item.url===url)){card._qlCandidates.push({url,at:Date.now()});card._qlIndex=card._qlCandidates.length-1;}
 card._qlRender?.();
}
function snapshotConfig(prompt, negativeOverride){
 const c=cfg();
 return {
  provider:c.provider, endpoint:c.provider==='openai'?c.endpoint:'', model:c.provider==='novelai'?c.naiModel:c.model,
  size:c.provider==='novelai'?(c.naiWidth+'x'+c.naiHeight):c.size,
  quality:c.provider==='openai'?c.quality:null,
  negative:negativeOverride??c.negative??'',
  nai:c.provider==='novelai'?{steps:c.naiSteps,scale:c.naiScale,width:c.naiWidth,height:c.naiHeight,sampler:c.naiSampler,scheduler:c.naiScheduler}:null
 };
}
function storeChatRecord(url,prompt,taskKey,meta={}){
 const c=cfg();
 c.records.unshift({
  id:taskKey+':'+Date.now(),at:Date.now(),prompt,negative:c.negative||'',
  provider:c.provider,model:c.provider==='novelai'?c.naiModel:c.model,
  size:c.provider==='novelai'?(c.naiWidth+'x'+c.naiHeight):c.size,
  quality:c.provider==='openai'?c.quality:null,dataUrl:url,
  config:snapshotConfig(prompt),source:meta.source||'chat',
  messageIndex:meta.messageIndex,taskKey,character:meta.character||null,chatId:getContext()?.chatId||null
 });
 c.records=c.records.slice(0,20);save();history();
}
async function processLatestAssistantMessage(){
 const context=getContext();const chat=context?.chat;if(!Array.isArray(chat)||!chat.length)return;
 let messageIndex=-1;for(let i=chat.length-1;i>=0;i--){if(!chat[i]?.is_user&&!chat[i]?.is_system&&typeof chat[i]?.mes==='string'){messageIndex=i;break;}}
 if(messageIndex<0)return;
 const message=chat[messageIndex];const found=markers(message.mes);if(!found.length)return;
 const host=document.querySelector('.mes[mesid="'+messageIndex+'"] .mes_text');if(host)hideMarkersInTextNode(host);
 for(const marker of found){
  const taskKey=[context.chatId||'chat',messageIndex,message.swipe_id??0,marker.index].join(':');
  if(!host||autoTasks.has(taskKey))continue;
  autoTasks.add(taskKey);
  const pending=document.createElement('p');pending.className='ql-chat-image-status';pending.textContent='轻绘：正在生成图片…';host.append(pending);
  try{const url=await requestImage(marker.prompt);pending.remove();addMessageImage(host,url,marker.prompt,taskKey,{messageIndex});storeChatRecord(url,marker.prompt,taskKey,{messageIndex});}
  catch(error){
   pending.replaceChildren();
   const message=document.createElement('span');
   message.textContent='轻绘生成失败：'+(error?.message||String(error))+' ';
   const retry=document.createElement('button');
   retry.type='button';retry.className='menu_button';retry.textContent='点击重试';
   retry.addEventListener('click',()=>{
    if(autoTasks.has(taskKey))autoTasks.delete(taskKey);
    pending.remove();
    processLatestAssistantMessage().catch(e=>console.warn('[轻绘 Lite] 手动重试失败',e));
   },{once:true});
   pending.append(message,retry);
  }
 }
}

let statusbarObserver=null;
const statusbarObservedDocs=new WeakSet();
let statusbarSerial=0;
function parseStatusbarMarker(text){const match=String(text||'').match(/image###([\s\S]*?)###/);return match?.[1]?.trim()||'';}
function renderStatusbarCard(frame,prompt,url,taskKey){
 let card=frame.querySelector('.ql-statusbar-card');
 if(!card||card.dataset.qlTask!==taskKey){
  frame.replaceChildren();
  card=document.createElement('div');card.className='ql-statusbar-card';card.dataset.qlTask=taskKey;
  card.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#000;';
  const img=document.createElement('img');img.alt='轻绘状态栏画面';img.loading='eager';img.style.cssText='display:block;width:100%;height:100%;object-fit:contain;';
  const controls=document.createElement('div');controls.className='ql-statusbar-controls';controls.style.cssText='position:absolute;left:0;right:0;bottom:4px;z-index:8;display:flex;align-items:center;justify-content:center;gap:4px;opacity:.92;';
  const prev=document.createElement('button');prev.type='button';prev.className='menu_button';prev.textContent='‹';
  const count=document.createElement('span');count.className='ql-statusbar-count';count.textContent='1 / 1';count.style.cssText='color:#fff;font-size:11px;text-shadow:0 1px 3px #000;padding:0 4px;';
  const next=document.createElement('button');next.type='button';next.className='menu_button';next.textContent='›';
  const reroll=document.createElement('button');reroll.type='button';reroll.className='menu_button';reroll.textContent='再画一张';
  controls.append(prev,count,next,reroll);card.append(img,controls);frame.append(card);
  card._qlCandidates=[];card._qlIndex=0;card._qlPrompt=prompt;
  const render=()=>{const list=card._qlCandidates;if(!list.length)return;img.src=list[card._qlIndex].url;count.textContent=(card._qlIndex+1)+' / '+list.length;prev.disabled=card._qlIndex<=0;next.disabled=card._qlIndex>=list.length-1;};
  const step=delta=>{const nextIndex=card._qlIndex+delta;if(nextIndex>=0&&nextIndex<card._qlCandidates.length){card._qlIndex=nextIndex;render();}};
  prev.onclick=()=>step(-1);next.onclick=()=>step(1);
  let touchX=0,touchY=0;
  img.addEventListener('touchstart',e=>{const t=e.changedTouches[0];touchX=t.clientX;touchY=t.clientY;},{passive:true});
  img.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-touchX,dy=t.clientY-touchY;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.25)step(dx<0?1:-1);},{passive:true});
  img.addEventListener('contextmenu',e=>{e.preventDefault();saveCleanImage(img.src,'qinghui-'+Date.now()+'.png');});
  reroll.onclick=async()=>{if(card.dataset.busy==='1')return;card.dataset.busy='1';reroll.disabled=true;const old=reroll.textContent;reroll.textContent='生成中';try{const fresh=await requestImage(card._qlPrompt);card._qlCandidates.push({url:fresh,at:Date.now()});card._qlIndex=card._qlCandidates.length-1;render();storeChatRecord(fresh,card._qlPrompt,taskKey,{source:'statusbar'});}catch(e){statusbarError(frame,card._qlPrompt,taskKey,e);}finally{card.dataset.busy='0';reroll.disabled=false;reroll.textContent=old;}};
  card._qlRender=render;
 }
 if(!card._qlCandidates.some(item=>item.url===url)){card._qlCandidates.push({url,at:Date.now()});card._qlIndex=card._qlCandidates.length-1;}
 card._qlRender?.();
 frame.classList.remove('scanning');frame.dataset.qlDone='1';
}
function statusbarError(frame,prompt,taskKey,error){
 frame.replaceChildren();const note=document.createElement('div');note.className='ql-statusbar-error';
 const text=document.createElement('span');text.textContent='轻绘生成失败：'+(error?.message||String(error))+' ';
 const retry=document.createElement('button');retry.type='button';retry.className='menu_button';retry.textContent='点击重试';
 retry.onclick=async()=>{retry.disabled=true;retry.textContent='生成中…';try{const url=await requestImage(prompt);renderStatusbarCard(frame,prompt,url,taskKey);storeChatRecord(url,prompt,taskKey,{source:'statusbar'});}catch(e){statusbarError(frame,prompt,taskKey,e);}};
 note.append(text,retry);frame.append(note);
}
async function processStatusbarFrames(){
 const docs=[document];
 document.querySelectorAll('iframe').forEach(iframe=>{try{if(iframe.contentDocument)docs.push(iframe.contentDocument);}catch{}});
 const frames=docs.flatMap(doc=>Array.from(doc.querySelectorAll('.shot-frame.scanning')));
 for(const frame of frames){
  if(frame.dataset.qlBusy==='1'||frame.dataset.qlDone==='1')continue;
  const prompt=parseStatusbarMarker(frame.textContent);
  if(!prompt)continue;
  frame.dataset.qlPrompt=prompt;frame.dataset.qlBusy='1';
  const taskKey='statusbar:'+((getContext()?.chatId)||'chat')+':'+(frame.dataset.qlTaskId||(frame.dataset.qlTaskId=''+(++statusbarSerial)));
  frame.textContent='轻绘：正在生成画面…';
  try{const url=await requestImage(prompt);renderStatusbarCard(frame,prompt,url,taskKey);storeChatRecord(url,prompt,taskKey,{source:'statusbar'});}
  catch(e){statusbarError(frame,prompt,taskKey,e);}
  finally{frame.dataset.qlBusy='0';}
 }
}
function observeStatusbarFrames(){
 const attach=doc=>{
  if(!doc||statusbarObservedDocs.has(doc))return;
  const target=doc.body||doc.documentElement;if(!target)return;
  statusbarObservedDocs.add(doc);
  const observer=new MutationObserver(()=>{attachFrames();processStatusbarFrames().catch(e=>console.warn('[轻绘 Lite] 状态栏触发失败',e));});
  observer.observe(target,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  if(doc===document)statusbarObserver=observer;
 };
 const attachFrames=()=>{
  attach(document);
  document.querySelectorAll('iframe').forEach(frame=>{try{attach(frame.contentDocument);}catch{}});
 };
 attachFrames();
 processStatusbarFrames().catch(e=>console.warn('[轻绘 Lite] 状态栏触发失败',e));
}

function save(){ saveSettingsDebounced(); }
function html(){return `<section id="qinghui-lite-panel">
<div class="ql-card"><h3>轻绘 Lite · 测试版</h3><p class="ql-muted">独立工作区支持 GPT / OpenAI 兼容接口和酒馆已配置的 NovelAI 连接。状态栏画面框注入已接入，尚需实际酒馆验证。</p>
<label>生图后端</label><select id="ql-provider"><option value="openai">GPT / OpenAI 兼容接口</option><option value="novelai">NovelAI（使用酒馆已配置的连接）</option></select>
<div id="ql-openai-settings"><label>API 地址</label><input id="ql-endpoint" placeholder="https://api.openai.com/v1">
<label>API Key</label><input id="ql-key" type="password" autocomplete="off" placeholder="不会写入 GitHub">
<label>模型</label><input id="ql-model" placeholder="gpt-image-1">
<div class="ql-row"><div><label>尺寸</label><select id="ql-size"><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select></div><div><label>质量</label><select id="ql-quality"><option>low</option><option selected>medium</option><option>high</option></select></div></div>
</div><div id="ql-nai-settings" hidden><label>NovelAI 模型</label><input id="ql-nai-model" value="nai-diffusion-4-5-full"><div class="ql-row"><div><label>步数</label><input id="ql-nai-steps" type="number" min="1" max="50"></div><div><label>CFG Scale</label><input id="ql-nai-scale" type="number" min="1" max="20" step="0.5"></div></div><div class="ql-row"><div><label>宽度</label><select id="ql-nai-width"><option>512</option><option>640</option><option>768</option><option selected>832</option><option>1024</option></select></div><div><label>高度</label><select id="ql-nai-height"><option>512</option><option>640</option><option>768</option><option selected>1216</option><option>1024</option><option>1536</option></select></div></div><label>采样器</label><select id="ql-nai-sampler"><option value="k_euler_ancestral">Euler Ancestral</option><option value="k_euler">Euler</option><option value="k_dpmpp_2m">DPM++ 2M</option><option value="k_dpmpp_2s_ancestral">DPM++ 2S Ancestral</option></select><label>调度器</label><select id="ql-nai-scheduler"><option value="karras">Karras</option><option value="native">Native</option></select></div><button id="ql-save" class="menu_button">保存后端设置</button></div>
<div class="ql-card"><h3>独立生图工作区</h3><label>完整正向提示词</label><textarea id="ql-prompt" placeholder="输入完整提示词"></textarea><label>负向提示词</label><textarea id="ql-negative" placeholder="可选"></textarea><button id="ql-generate" class="menu_button">生成一张</button><p id="ql-status" class="ql-muted" role="status"></p><div id="ql-result"></div></div>
<div class="ql-card"><h3>最近生成（本地记录）</h3><div id="ql-history"></div><button id="ql-clear" class="menu_button">清空记录</button></div></section>`;}
function read(){const s=cfg();s.provider=$('#ql-provider').value;s.endpoint=$('#ql-endpoint').value.trim().replace(/\/$/,'');s.apiKey=$('#ql-key').value.trim();s.model=$('#ql-model').value.trim()||'gpt-image-1';s.size=$('#ql-size').value;s.quality=$('#ql-quality').value;s.naiModel=$('#ql-nai-model').value.trim()||'nai-diffusion-4-5-full';s.naiSteps=Number($('#ql-nai-steps').value)||28;s.naiScale=Number($('#ql-nai-scale').value)||5;s.naiWidth=Number($('#ql-nai-width').value)||832;s.naiHeight=Number($('#ql-nai-height').value)||1216;s.naiSampler=$('#ql-nai-sampler').value;s.naiScheduler=$('#ql-nai-scheduler').value;s.prompt=$('#ql-prompt').value;s.negative=$('#ql-negative').value;save();}
function status(t){$('#ql-status').textContent=t;}
function history(){const host=$('#ql-history');if(!host)return;host.innerHTML=(cfg().records||[]).slice(0,10).map((r,i)=>`<div class="ql-record"><p>${esc(new Date(r.at).toLocaleString())} · ${esc(r.prompt.slice(0,100))}</p><img src="${r.dataUrl}" alt="生成结果"><button class="menu_button" data-ql-load="${i}">载入提示词</button></div>`).join('')||'<p class="ql-muted">暂无记录</p>';host.querySelectorAll('[data-ql-load]').forEach(b=>b.onclick=()=>{const r=cfg().records[+b.dataset.qlLoad];$('#ql-prompt').value=r.prompt;$('#ql-negative').value=r.negative;status('提示词已载入；点击生成会创建新记录。');});}
function init(){const root=$('#qinghui-lite-panel');if(!root||root.dataset.ready)return;root.dataset.ready='1';const s=cfg();$('#ql-provider').value=s.provider||'openai';$('#ql-endpoint').value=s.endpoint;$('#ql-key').value=s.apiKey;$('#ql-model').value=s.model;$('#ql-size').value=s.size;$('#ql-quality').value=s.quality;$('#ql-nai-model').value=s.naiModel||'nai-diffusion-4-5-full';$('#ql-nai-steps').value=s.naiSteps||28;$('#ql-nai-scale').value=s.naiScale||5;$('#ql-nai-width').value=s.naiWidth||832;$('#ql-nai-height').value=s.naiHeight||1216;$('#ql-nai-sampler').value=s.naiSampler||'k_euler_ancestral';$('#ql-nai-scheduler').value=s.naiScheduler||'karras';$('#ql-prompt').value=s.prompt;$('#ql-negative').value=s.negative;const toggleProvider=()=>{const nai=$('#ql-provider').value==='novelai';$('#ql-openai-settings').hidden=nai;$('#ql-nai-settings').hidden=!nai;};$('#ql-provider').onchange=toggleProvider;toggleProvider();history();
$('#ql-save').onclick=()=>{read();status('设置已保存到酒馆扩展设置。');};
$('#ql-generate').onclick=async()=>{
 if(busy)return;read();const conf=cfg();
 if(!conf.prompt.trim()){status('请填写正向提示词。');return;}
 if(conf.provider!=='novelai'&&(!conf.endpoint||!conf.apiKey)){status('请填写 OpenAI 兼容 API 地址和 Key。');return;}
 busy=true;$('#ql-generate').disabled=true;$('#ql-result').replaceChildren();status('正在请求生图接口……');
 try{
  const url=await requestImage(conf.prompt.trim(),conf.negative.trim());
  const img=document.createElement('img');img.alt='轻绘生成结果';img.src=url;$('#ql-result').append(img);
  conf.records.unshift({at:Date.now(),prompt:conf.prompt.trim(),negative:conf.negative.trim(),provider:conf.provider,model:conf.provider==='novelai'?conf.naiModel:conf.model,size:conf.provider==='novelai'?(conf.naiWidth+'x'+conf.naiHeight):conf.size,quality:conf.quality,dataUrl:url});
  conf.records=conf.records.slice(0,20);save();history();status('生成完成。记录已保存在酒馆扩展设置中。');
 }catch(e){status('生成失败：'+(e?.message||String(e))+'。');}
 finally{busy=false;$('#ql-generate').disabled=false;}
}
$('#ql-clear').onclick=()=>{if(confirm('清空轻绘本地生成记录？不会删除聊天图片。')){cfg().records=[];save();history();status('记录已清空。');}};
}
jQuery(()=>{
 const mount=$('#extensions_settings2')||$('#extensions_settings');
 if(mount&&!$('#qinghui-lite-panel')){mount.insertAdjacentHTML('beforeend',html());init();}
 observeStatusbarFrames();
 if(!eventSource||!event_types)return;
 const scheduleScan=()=>setTimeout(()=>{processLatestAssistantMessage().catch(e=>console.warn('[轻绘 Lite] 自动触发失败',e));processStatusbarFrames().catch(e=>console.warn('[轻绘 Lite] 状态栏触发失败',e));},100);
 if(event_types.GENERATION_ENDED)eventSource.on(event_types.GENERATION_ENDED,scheduleScan);
 if(event_types.MESSAGE_SWIPED)eventSource.on(event_types.MESSAGE_SWIPED,scheduleScan);
 if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,()=>{autoTasks.clear();});
});
