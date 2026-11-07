/* Isolated, ephemeral demo. No auth, network writes, uploads or persistent storage. */
(() => {
'use strict';
if (new URL(location.href).searchParams.get('demo') !== '1') return;
const clone = value => JSON.parse(JSON.stringify(value));
const nativeFetch = window.fetch.bind(window);
const records = new Map(), loads = new Map();
let disposed = false, changed = false;
const allowed = new Set(['/api/v1/config', '/api/v1/definition']);
const access = Object.freeze({ canWrite: false, canUpload: false });
const pathFor = input => new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
const deny = () => Promise.reject(new DOMException('演示模式不允许网络写入、上传或登录。', 'NotAllowedError'));
// Defense in depth. Application edits use the explicit in-memory methods below.
window.fetch = (input, init = {}) => {
  const url = pathFor(input), method = (init.method || input?.method || 'GET').toUpperCase();
  if (disposed || !['GET', 'HEAD'].includes(method) || url.origin !== location.origin || url.pathname.startsWith('/api/')) return deny();
  return nativeFetch(input, { ...init, credentials: 'omit' });
};
const xhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  const target = pathFor(url);
  if (disposed || !['GET','HEAD'].includes(String(method).toUpperCase()) || target.origin !== location.origin || target.pathname.startsWith('/api/')) throw new DOMException('演示模式不允许此请求。', 'NotAllowedError');
  return xhrOpen.call(this, method, url, ...rest);
};
try { navigator.sendBeacon = () => false; } catch {}
// Protect all existing preference controls as well as future storage call sites.
try { Storage.prototype.setItem = function() {}; Storage.prototype.removeItem = function() {}; Storage.prototype.clear = function() {}; } catch {}
document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
function decorate(path, value) {
  const data = clone(value); data.access = access;
  if (path.endsWith('/definition')) {
    for (const group of ['colors','animals','emotions','accessories']) for (const row of data.manifest[group]) {
      row.label = data.definition.labels[row.id] ?? row.label;
      if (group === 'colors') row.hex = data.definition.colors[row.id] ?? row.hex;
      else { const asset = data.assets.find(a => a.id === data.definition.assetRefs[row.id]); if (asset) row.asset = clone(asset); }
      if (group === 'emotions') row.accessoryId = data.definition.rules.emotionAccessories[row.id];
    }
    data.manifest.wordOrderPolicy = clone(data.definition.rules.wordOrderPolicy);
  }
  return data;
}
async function record(path) {
  if (disposed) throw new Error('演示已结束');
  if (!allowed.has(path)) throw new DOMException('演示不访问认证或上传接口。', 'NotAllowedError');
  if (records.has(path)) return records.get(path);
  if (!loads.has(path)) loads.set(path, (async () => {
    // Public read-only baseline, with no session credentials. Never poll production.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    let value;
    try {
      const response = await nativeFetch(path, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('演示初始素材暂时无法读取');
      value = await response.json();
    } finally { clearTimeout(timer); }
    if (disposed) throw new Error('演示已结束');
    const valueRecord = { value: decorate(path, value), revision: 0 };
    records.set(path, valueRecord); return valueRecord;
  })().catch(error => { loads.delete(path); throw error; }));
  return loads.get(path);
}
async function request(input, options = {}) {
  const url = pathFor(input), method = (options.method || 'GET').toUpperCase();
  if (url.origin !== location.origin || method !== 'GET') return deny();
  const entry = await record(url.pathname);
  return new Response(JSON.stringify(decorate(url.pathname, entry.value)), { headers: { 'Content-Type': 'application/json', ETag: '"demo-' + entry.revision + '"' } });
}
function setConfig(config) {
  if (disposed) return;
  const entry = records.get('/api/v1/config') || { value: { config: {}, access }, revision: 0 };
  records.set('/api/v1/config', entry);
  entry.value.config = clone(config); entry.revision++; changed = true;
}
async function setDefinition(definition) {
  const entry = await record('/api/v1/definition');
  entry.value.definition = clone(definition); entry.revision++; changed = true;
  return request('/api/v1/definition');
}
function exit() {
  if ((changed || window.avatarHasUnsavedChanges?.()) && !window.confirm('退出演示会丢弃本页修改，是否继续？')) return false;
  window.avatarLogoutInProgress = true; disposed = true; records.clear(); loads.clear();
  location.assign(new URL('./?login=1', location.href).href); return true;
}
Object.defineProperty(window, 'AvatarDemo', { value: Object.freeze({ active: true, request, setConfig, setDefinition, hasChanges: () => changed, exit }), writable: false, configurable: false });
function mount() {
  const header = document.querySelector('body > header, body > main > header'); if (!header) return;
  const banner = document.createElement('div'); banner.className = 'avatar-demo-notice'; banner.setAttribute('role', 'status');
  const text = document.createElement('span'); text.textContent = '演示模式 · 仅本页预览，刷新或离开即丢弃';
  const exit = document.createElement('a'); exit.href = './?login=1'; exit.textContent = '退出演示'; exit.addEventListener('click', event => { event.preventDefault(); window.AvatarDemo.exit(); });
  banner.append(text, exit); header.append(banner); document.body.classList.add('avatar-demo');
  document.querySelector('#motionSection > .hint')?.replaceChildren(document.createTextNode('入场和点击分别配置，仅在本页预览。情绪平时隐藏，只在事件中短暂出现。'));
  document.querySelectorAll('a[href="catalog.html"]').forEach(a => { a.href = '?demo=1&view=resources'; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
window.addEventListener('pagehide', () => { disposed = true; records.clear(); loads.clear(); });
// A back/forward cache must not resurrect a discarded demo draft.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
})();
