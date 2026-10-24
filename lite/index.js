import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import { eventSource, event_types } from '../../../script.js';
import { getContext } from '../../../extensions.js';

const EXT = 'qinghui_lite';
const defaults = { provider:'openai', endpoint:'https://api.openai.com/v1', apiKey:'', model:'gpt-image-1', size:'1024x1024', quality:'medium', prompt:'', negative:'', records:[] };
const $ = (s, root=document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false;
function cfg(){ extension_settings[EXT] ??= structuredClone(defaults); return extension_settings[EXT]; }
const autoTasks = new Set();
const markerRe = /image###([\s\S]*?)###/g;
function markers(text){const out=[];markerRe.lastIndex=0;let m;while((m=markerRe.exec(text))!==null){if(m[1].trim())out.push({index:m.index,prompt:m[1].trim(),raw:m[0]});}return out;}
function hideMarkersInTextNode(root){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())if(walker.currentNode.nodeValue?.includes('image###'))nodes.push(walker.currentNode);for(const node of nodes){node.nodeValue=node.nodeValue.replace(/image###[\s\S]*?###/g,'');}}
async function requestImage(prompt){const c=cfg();if(!c.endpoint||!c.apiKey)throw new Error('请先在轻绘设置中填写 API 地址和 Key');const body={model:c.model,prompt,n:1,size:c.size};if(c.model.toLowerCase().includes('gpt-image'))body.quality=c.quality;const res=await fetch(c.endpoint.replace(/\/$/, '')+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.apiKey},body:JSON.stringify(body)});const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{throw new Error('接口返回非 JSON（HTTP '+res.status+'）');}if(!res.ok)throw new Error(data?.error?.message||'HTTP '+res.status);const item=data?.data?.[0];let url=item?.b64_json?'data:image/png;base64,'+item.b64_json:item?.url;if(!url&&data?.images?.[0]){const v=data.images[0];url=/^(data:|https?:)/.test(v)?v:'data:image/png;base64,'+v;}if(!url)throw new Error('响应中没有可识别的图片');return url;}
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
  prev.addEventListener('click',()=>{if(card._qlIndex>0){card._qlIndex--;render();}});
  next.addEventListener('click',()=>{if(card._qlIndex<card._qlCandidates.length-1){card._qlIndex++;render();}});
  reroll.addEventListener('click',async()=>{if(card.dataset.qlBusy==='1')return;card.dataset.qlBusy='1';reroll.disabled=true;const old=reroll.textContent;reroll.textContent='生成中…';try{const fresh=await requestImage(prompt);card._qlCandidates.push({url:fresh,at:Date.now()});card._qlIndex=card._qlCandidates.length-1;render();storeChatRecord(fresh,prompt,taskKey,recordMeta);}catch(e){const note=document.createElement('p');note.className='ql-chat-image-status';note.textContent='轻绘生成失败：'+(e?.message||String(e));card.append(note);}finally{card.dataset.qlBusy='0';reroll.disabled=false;reroll.textContent=old;}});
  card._qlRender=render;
 }
 if(!card._qlCandidates.some(item=>item.url===url)){card._qlCandidates.push({url,at:Date.now()});card._qlIndex=card._qlCandidates.length-1;}
 card._qlRender?.();
}
function storeChatRecord(url,prompt,taskKey,meta={}){const c=cfg();c.records.unshift({at:Date.now(),prompt,negative:'',model:c.model,size:c.size,quality:c.quality,dataUrl:url,source:'chat',messageIndex:meta.messageIndex,taskKey});c.records=c.records.slice(0,20);save();}
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
function save(){ saveSettingsDebounced(); }
function html(){return `<section id="qinghui-lite-panel">
<div class="ql-card"><h3>轻绘 Lite · 测试版</h3><p class="ql-muted">独立工作区可先测试 GPT / OpenAI 兼容生图。酒馆消息自动触发、NovelAI 与状态栏精准注入尚未接通。</p>
<label>API 地址</label><input id="ql-endpoint" placeholder="https://api.openai.com/v1">
<label>API Key</label><input id="ql-key" type="password" autocomplete="off" placeholder="不会写入 GitHub">
<label>模型</label><input id="ql-model" placeholder="gpt-image-1">
<div class="ql-row"><div><label>尺寸</label><select id="ql-size"><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select></div><div><label>质量</label><select id="ql-quality"><option>low</option><option selected>medium</option><option>high</option></select></div></div>
<button id="ql-save" class="menu_button">保存 API 设置</button></div>
<div class="ql-card"><h3>独立生图工作区</h3><label>完整正向提示词</label><textarea id="ql-prompt" placeholder="输入完整提示词"></textarea><label>负向提示词</label><textarea id="ql-negative" placeholder="可选"></textarea><button id="ql-generate" class="menu_button">生成一张</button><p id="ql-status" class="ql-muted" role="status"></p><div id="ql-result"></div></div>
<div class="ql-card"><h3>最近生成（本地记录）</h3><div id="ql-history"></div><button id="ql-clear" class="menu_button">清空记录</button></div></section>`;}
function read(){const s=cfg();s.endpoint=$('#ql-endpoint').value.trim().replace(/\/$/,'');s.apiKey=$('#ql-key').value.trim();s.model=$('#ql-model').value.trim()||'gpt-image-1';s.size=$('#ql-size').value;s.quality=$('#ql-quality').value;s.prompt=$('#ql-prompt').value;s.negative=$('#ql-negative').value;save();}
function status(t){$('#ql-status').textContent=t;}
function history(){const host=$('#ql-history');if(!host)return;host.innerHTML=(cfg().records||[]).slice(0,10).map((r,i)=>`<div class="ql-record"><p>${esc(new Date(r.at).toLocaleString())} · ${esc(r.prompt.slice(0,100))}</p><img src="${r.dataUrl}" alt="生成结果"><button class="menu_button" data-ql-load="${i}">载入提示词</button></div>`).join('')||'<p class="ql-muted">暂无记录</p>';host.querySelectorAll('[data-ql-load]').forEach(b=>b.onclick=()=>{const r=cfg().records[+b.dataset.qlLoad];$('#ql-prompt').value=r.prompt;$('#ql-negative').value=r.negative;status('提示词已载入；点击生成会创建新记录。');});}
function init(){const root=$('#qinghui-lite-panel');if(!root||root.dataset.ready)return;root.dataset.ready='1';const s=cfg();$('#ql-endpoint').value=s.endpoint;$('#ql-key').value=s.apiKey;$('#ql-model').value=s.model;$('#ql-size').value=s.size;$('#ql-quality').value=s.quality;$('#ql-prompt').value=s.prompt;$('#ql-negative').value=s.negative;history();
$('#ql-save').onclick=()=>{read();status('设置已保存到酒馆扩展设置。');};
$('#ql-generate').onclick=async()=>{if(busy)return;read();const c=cfg();if(!c.endpoint||!c.apiKey||!c.prompt.trim()){status('请填写 API 地址、Key 和正向提示词。');return;}busy=true;$('#ql-generate').disabled=true;$('#ql-result').replaceChildren();status('正在请求生图接口……');try{const body={model:c.model,prompt:c.prompt.trim(),n:1,size:c.size};if(c.model.toLowerCase().includes('gpt-image'))body.quality=c.quality;if(c.negative.trim())body.negative_prompt=c.negative.trim();const res=await fetch(c.endpoint+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.apiKey},body:JSON.stringify(body)});const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{throw Error('接口返回非 JSON（HTTP '+res.status+'），请检查供应商兼容格式。');}if(!res.ok)throw Error(data?.error?.message||'HTTP '+res.status);const item=data?.data?.[0];let url=item?.b64_json?'data:image/png;base64,'+item.b64_json:item?.url;if(!url&&data?.images?.[0]){const v=data.images[0];url=/^(data:|https?:)/.test(v)?v:'data:image/png;base64,'+v;}if(!url)throw Error('响应中没有可识别的图片。');const img=document.createElement('img');img.alt='轻绘生成结果';img.src=url;$('#ql-result').append(img);c.records.unshift({at:Date.now(),prompt:c.prompt.trim(),negative:c.negative.trim(),model:c.model,size:c.size,quality:c.quality,dataUrl:url});c.records=c.records.slice(0,20);save();history();status('生成完成。记录已保存在酒馆扩展设置中。');}catch(e){status('生成失败：'+(e?.message||String(e))+'。部分供应商需要支持浏览器 CORS。');}finally{busy=false;$('#ql-generate').disabled=false;}};
$('#ql-clear').onclick=()=>{if(confirm('清空轻绘本地生成记录？不会删除聊天图片。')){cfg().records=[];save();history();status('记录已清空。');}};
}
jQuery(()=>{
 const mount=$('#extensions_settings2')||$('#extensions_settings');
 if(mount&&!$('#qinghui-lite-panel')){mount.insertAdjacentHTML('beforeend',html());init();}
 if(!eventSource||!event_types)return;
 const scheduleScan=()=>setTimeout(()=>{processLatestAssistantMessage().catch(e=>console.warn('[轻绘 Lite] 自动触发失败',e));},100);
 if(event_types.GENERATION_ENDED)eventSource.on(event_types.GENERATION_ENDED,scheduleScan);
 if(event_types.MESSAGE_SWIPED)eventSource.on(event_types.MESSAGE_SWIPED,scheduleScan);
 if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,()=>{autoTasks.clear();});
});
