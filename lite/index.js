import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';

const EXT = 'qinghui_lite';
const defaults = {
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-image-1',
  naiEndpoint: 'https://image.novelai.net',
  naiToken: '',
  prompt: '',
  negative: '',
  size: '1024x1024',
  quality: 'medium',
  autoTrigger: true,
  hideMarker: true,
  placement: 'end',
  records: [],
};

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy = false;

function settings() {
  extension_settings[EXT] ??= structuredClone(defaults);
  return extension_settings[EXT];
}
function save() { saveSettingsDebounced(); }
function panelHtml() {
  const s = settings();
  return `
  <div id="qinghui-lite-panel">
    <div class="ql-card">
      <b>轻绘 Lite · 可安装测试版</b>
      <p class="ql-muted">当前先接入独立工作区与 OpenAI 兼容生图。自动识别酒馆消息和状态栏容器仍在开发中。</p>
      <label>生图后端</label>
      <select id="ql-provider"><option value="openai">GPT / OpenAI 兼容接口</option><option value="nai">NovelAI（接入中）</option></select>
      <label>API 地址（OpenAI 兼容）</label><input id="ql-endpoint" placeholder="https://api.openai.com/v1">
      <label>API Key</label><input id="ql-key" type="password" autocomplete="off" placeholder="仅保存在当前酒馆设置，不会写入仓库">
      <label>模型</label><input id="ql-model" placeholder="gpt-image-1">
      <div class="ql-row"><div><label>图片尺寸</label><select id="ql-size"><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select></div><div><label>质量</label><select id="ql-quality"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div></div>
      <button id="ql-save" class="menu_button">保存设置</button>
    </div>
    <div class="ql-card">
      <b>独立生图工作区</b>
      <label>正向提示词</label><textarea id="ql-prompt" placeholder="输入完整提示词；也可以在酒馆消息中使用 image###提示词###"></textarea>
      <label>负向提示词</label><textarea id="ql-negative" placeholder="可选"></textarea>
      <button id="ql-generate" class="menu_button">生成一张</button>
      <div id="ql-status" class="ql-status ql-muted" role="status"></div>
      <div id="ql-result" class="ql-result"></div>
    </div>
    <div class="ql-card"><b>最近生成</b><div id="ql-history" class="ql-history"></div><button id="ql-clear" class="menu_button">清空本地记录</button></div>
  </div>`;
}
function syncToUI() {
  const s = settings();
  $('#ql-provider').value = s.provider;
  $('#ql-endpoint').value = s.endpoint;
  $('#ql-key').value = s.apiKey;
  $('#ql-model').value = s.model;
  $('#ql-size').value = s.size;
  $('#ql-quality').value = s.quality;
  $('#ql-prompt').value = s.prompt;
  $('#ql-negative').value = s.negative;
  renderHistory();
}
function readUI() {
  const s = settings();
  s.provider = $('#ql-provider').value;
  s.endpoint = $('#ql-endpoint').value.trim().replace(/\/$/, '');
  s.apiKey = $('#ql-key').value.trim();
  s.model = $('#ql-model').value.trim() || 'gpt-image-1';
  s.size = $('#ql-size').value;
  s.quality = $('#ql-quality').value;
  s.prompt = $('#ql-prompt').value;
  s.negative = $('#ql-negative').value;
  save();
}
function status(message) { $('#ql-status').textContent = message; }
function renderHistory() {
  const host = $('#ql-history');
  if (!host) return;
  const records = settings().records || [];
  host.innerHTML = records.slice(0, 12).map((r, i) => `<div class="ql-card"><div class="ql-muted">${esc(new Date(r.createdAt).toLocaleString())}</div><div>${esc(r.prompt.slice(0, 160))}</div><img src="${r.dataUrl}" alt="生成图片" style="width:100%;max-width:240px;border-radius:8px;margin-top:8px"><button class="menu_button" data-ql-record="${i}">载入提示词</button></div>`).join('') || '<p class="ql-muted">暂无记录。</p>';
  host.querySelectorAll('[data-ql-record]').forEach(btn => btn.addEventListener('click', () => {
    const r = settings().records[Number(btn.dataset.qlRecord)];
    if (!r) return;
    $('#ql-prompt').value = r.prompt;
    $('#ql-negative').value = r.negative || '';
    status('已载入记录的提示词；再次生成会创建新记录。');
  }));
}
function getImageData(json) {
  const item = json?.data?.[0];
  if (item?.b64_json) return 'data:image/png;base64,' + item.b64_json;
  if (item?.url) return item.url;
  if (json?.images?.[0]) {
    const value = json.images[0];
    return value.startsWith('data:') || value.startsWith('http') ? value : 'data:image/png;base64,' + value;
  }
  throw new Error(json?.error?.message || '接口响应中没有可识别的图片。');
}
async function generate() {
  if (busy) return;
  readUI();
  const s = settings();
  if (s.provider !== 'openai') {
    status('NovelAI 后端还没有接入，请先选择 GPT / OpenAI 兼容接口。');
    return;
  }
  if (!s.endpoint || !s.apiKey) { status('请先填写 API 地址和 API Key。'); return; }
  if (!s.prompt.trim()) { status('请先输入正向提示词。'); return; }
  busy = true;
  $('#ql-generate').disabled = true;
  $('#ql-result').replaceChildren();
  status('正在请求生图接口……');
  try {
    const payload = { model: s.model, prompt: s.prompt.trim(), n: 1, size: s.size };
    if (s.model.toLowerCase().includes('gpt-image')) payload.quality = s.quality;
    if (s.negative.trim()) payload.negative_prompt = s.negative.trim();
    const response = await fetch(s.endpoint + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error('接口返回非 JSON（HTTP ' + response.status + '）。请检查 API 地址或供应商兼容格式。'); }
    if (!response.ok) throw new Error(json?.error?.message || 'HTTP ' + response.status);
    const dataUrl = getImageData(json);
    $('#ql-result').innerHTML = '<img alt="生成结果">';
    $('#ql-result img').src = dataUrl;
    const record = { id: crypto.randomUUID?.() || String(Date.now()), createdAt: Date.now(), prompt: s.prompt.trim(), negative: s.negative.trim(), provider: s.provider, model: s.model, size: s.size, quality: s.quality, dataUrl };
    s.records.unshift(record);
    s.records = s.records.slice(0, 30);
    save();
    renderHistory();
    status('生成完成。已保存到轻绘本地记录；长按图片可由浏览器保存。');
  } catch (error) {
    status('生成失败：' + (error?.message || String(error)) + '\n提示：部分供应商不支持浏览器跨域请求，需要其提供 CORS 或酒馆代理。');
  } finally {
    busy = false;
    $('#ql-generate').disabled = false;
  }
}
function bind() {
  const root = $('#qinghui-lite-panel');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  syncToUI();
  $('#ql-save').addEventListener('click', () => { readUI(); status('设置已保存。'); });
  $('#ql-generate').addEventListener('click', generate);
  $('#ql-clear').addEventListener('click', () => {
    if (!confirm('清空轻绘本地生成记录？不会删除酒馆聊天中的图片。')) return;
    settings().records = []; save(); renderHistory(); status('本地记录已清空。');
  });
  $('#ql-provider').addEventListener('change', () => {
    const nai = $('#ql-provider').value === 'nai';
    status(nai ? 'NovelAI 后端正在开发，当前测试版暂不发送 NAI 请求。' : '');
  });
}
jQuery(async () => {
  const mount = $('#extensions_settings2') || $('#extensions_settings');
  if (!mount || $('#qinghui-lite-panel')) return;
  mount.insertAdjacentHTML('beforeend', panelHtml());
  bind();
});
