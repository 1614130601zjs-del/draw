import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';

const EXT = 'qinghui_lite';
const defaults = { provider:'openai', endpoint:'https://api.openai.com/v1', apiKey:'', model:'gpt-image-1', size:'1024x1024', quality:'medium', prompt:'', negative:'', records:[] };
const $ = (s, root=document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false;
function cfg(){ extension_settings[EXT] ??= structuredClone(defaults); return extension_settings[EXT]; }
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
jQuery(()=>{const mount=$('#extensions_settings2')||$('#extensions_settings');if(!mount||$('#qinghui-lite-panel'))return;mount.insertAdjacentHTML('beforeend',html());init();});
