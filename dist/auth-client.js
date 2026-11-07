(() => {
'use strict';
if (window.AvatarAuth) return;
const node = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n; };
let accountButton;
let dialog, message, retry, keys, dots, progress, previousFocus;
let initialized = false, authenticated = null, pending = false, request = 0, blockedUntil = 0, tick;
let loginAvailable = null;
let pin = '', pendingDigits = 0;
const flashes = new WeakMap();
function announce(value, visible = false) {
  message.textContent = value;
  message.classList.toggle('avatar-auth-sr', !visible);
}
function clear() { pin = ''; update(); }
function update() {
  const locked = Date.now() < blockedUntil;
  const count = pending ? pendingDigits : pin.length;
  for (const button of keys.querySelectorAll('button')) button.disabled = pending || locked;
  [...dots.children].forEach((button, i) => {
    button.classList.toggle('filled', i < count);
    button.disabled = pending || locked || i >= count;
  });
  progress.textContent = pending && pendingDigits ? '正在验证密码。' : `已输入 ${count} 位，共 6 位。`;
  dialog.classList.toggle('is-verifying', pending && pendingDigits === 6);
  dialog.setAttribute('aria-busy', String(pending));
}
function focusKey() { keys.querySelector('button:not(:disabled)')?.focus({ preventScroll: true }); }
function flash(button) {
  clearTimeout(flashes.get(button));
  button.classList.add('is-pressed');
  flashes.set(button, setTimeout(() => button.classList.remove('is-pressed'), 220));
}
function digit(value) {
  if (pending || Date.now() < blockedUntil || pin.length >= 6) return;
  if (!pin.length) announce('请输入六位登录密码。');
  pin += value;
  flash(keys.querySelector(`[data-digit="${value}"]`));
  update();
  if (pin.length === 6) void login();
}
function setAuthenticated(value, forceEvent = false) {
  const changed = value !== authenticated;
  authenticated = value;
  if(accountButton){accountButton.hidden=loginAvailable===false;accountButton.textContent=value?'退出登录':'登录编辑';}
  if (value) { clear(); if (dialog.open) dialog.close(); previousFocus?.focus?.(); }

  if (changed || forceEvent) window.dispatchEvent(new CustomEvent('avatar-auth-changed', { detail: { authenticated: value } }));
}
function open() {
  if(loginAvailable===false){alert('此部署未启用登录。本地编辑请使用 npm run dev；托管编辑需由部署者配置 HTTPS 和管理凭据。');return;}
  init(); clear();
  if (!dialog.open) { previousFocus = document.activeElement; dialog.showModal(); }
  announce(blockedUntil > Date.now() ? '请稍后再试。' : '请输入六位登录密码。输入完成后自动验证。', blockedUntil > Date.now());
  retry.hidden = true; focusKey();
}
function rateLimit(response) {
  const value = response.headers.get('Retry-After'), seconds = Number(value);
  blockedUntil = Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : Math.max(Date.now() + 30000, Date.parse(value) || 0);
  clearInterval(tick);
  const refresh = () => {
    const left = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (left <= 0) { clearInterval(tick); announce('可以重新输入密码了。'); update(); focusKey(); return; }
    announce(`尝试次数过多，请等待 ${left} 秒后再试。`, true); update();
  };
  refresh(); tick = setInterval(refresh, 1000);
}
async function check() {
  init(); if (pending) return;
  const token = ++request; pending = true; update();
  try {
    const response = await fetch('/api/v1/session', { cache: 'no-store', credentials: 'same-origin' });
    if (token !== request) return;
    if (!response.ok) throw Error();
    const data = await response.json();
    if (token !== request) return;
    if (typeof data.authenticated !== 'boolean') throw Error();
    loginAvailable=data.loginAvailable!==false;
    setAuthenticated(data.authenticated);
  } catch {
    if (token !== request) return;
    setAuthenticated(false); if(dialog.open){announce('暂时无法确认登录状态，请重试。', true);retry.hidden=false;}
  } finally {
    if (token === request) { pending = false; update(); if (dialog.open) focusKey(); }
  }
}
async function login(event) {
  event?.preventDefault();
  if (pending || Date.now() < blockedUntil || !/^\d{6}$/.test(pin)) return;
  const token = ++request; pending = true; pendingDigits = pin.length;
  announce('正在验证…'); update();
  try {
    const body = JSON.stringify({ pin }); pin = '';
    const response = await fetch('/api/v1/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body });
    if (token !== request) return;
    if (response.status === 429) { rateLimit(response); return; }
    if (!response.ok) { announce(response.status === 401 ? '密码不正确，请重新输入。' : '暂时无法登录，请稍后重试。', true); return; }
    const data = await response.json();
    if (token !== request) return;
    if (data.authenticated !== true) { announce('暂时无法确认登录状态，请重试。', true); retry.hidden = false; return; }
    setAuthenticated(true, true);
  } catch { if (token === request) announce('网络连接失败，请重试。', true); }
  finally { if (token === request) { pending = false; pendingDigits = 0; clear(); if (dialog.open) focusKey(); } }
}
function init() {
  if (initialized) return; initialized = true;
  if (!document.querySelector('link[data-avatar-auth-style],link[href*="auth-client.css"]')) {
    const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
    const url = new URL(document.currentScript?.src || 'auth-client.js', location.href);
    url.pathname = url.pathname.replace(/[^/]*$/, 'auth-client.css');
    stylesheet.href = url.href; stylesheet.dataset.avatarAuthStyle = ''; document.head.append(stylesheet);
  }
  dialog = node('dialog', 'avatar-auth-dialog'); dialog.setAttribute('aria-labelledby', 'avatar-auth-title');
  dialog.setAttribute('aria-describedby', 'avatar-auth-help');
  dialog.addEventListener('cancel', () => { clear(); });
  const form = node('form', 'avatar-auth-form'); form.addEventListener('submit', login);
  const title = node('h2', 'avatar-auth-sr', '登录头像编辑器'); title.id = 'avatar-auth-title';
  const help = node('p', 'avatar-auth-sr', '输入六位数字后自动登录。点击已填写的圆点可从该位重新输入；键盘退格删除，Escape 关闭。'); help.id = 'avatar-auth-help';
  message = node('p', 'avatar-auth-message avatar-auth-sr'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  progress = node('span', 'avatar-auth-sr'); progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
  dots = node('div', 'avatar-auth-dots'); dots.setAttribute('role', 'group'); dots.setAttribute('aria-label', '六位密码，点击已填写圆点修改');
  for (let i = 0; i < 6; i++) {
    const dot = node('button', 'avatar-auth-dot'); dot.type = 'button';
    const label = i === 0 ? '清空密码' : `从第 ${i + 1} 位重新输入`;
    dot.setAttribute('aria-label', label); dot.title = label;
    dot.addEventListener('click', () => { if (pending || Date.now() < blockedUntil) return; pin = pin.slice(0, i); update(); focusKey(); });
    dots.append(dot);
  }
  keys = node('div', 'avatar-auth-keys'); keys.setAttribute('role', 'group'); keys.setAttribute('aria-label', '数字键盘');
  for (const value of ['1','2','3','4','5','6','7','8','9','0']) {
    const button = node('button', 'avatar-auth-key', value); button.type = 'button'; button.dataset.digit = value;
    button.addEventListener('click', () => digit(value));
    button.addEventListener('pointerdown', () => { if (!button.disabled) flash(button); });
    button.addEventListener('pointercancel', () => button.classList.remove('is-pressed'));
    keys.append(button);
  }
  dialog.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented || event.repeat) return;
    if (/^\d$/.test(event.key)) { event.preventDefault(); digit(event.key); }
    else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault(); if (!pending && Date.now() >= blockedUntil) { pin = pin.slice(0, -1); update(); }
    }
  });
  retry = node('button', 'avatar-auth-retry', '重试'); retry.type = 'button'; retry.hidden = true; retry.addEventListener('click', check);
  const close=node('button','avatar-auth-retry','暂不登录');close.type='button';close.addEventListener('click',()=>{clear();dialog.close();previousFocus?.focus?.();});
  form.append(title, help, dots, progress, keys, message, retry,close); dialog.append(form); document.body.append(dialog);
  const host = document.querySelector('header .heading') || document.querySelector('header') || document.body;
  host.classList.add('avatar-auth-header');
  accountButton=node('button','avatar-auth-retry','登录编辑');accountButton.type='button';accountButton.hidden=true;accountButton.addEventListener('click',async()=>{if(!authenticated){open();return;}try{const r=await fetch('/api/v1/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(r.ok)setAuthenticated(false,true);}catch{}});host.append(accountButton);update();
}
window.AvatarAuth = { open, check };
window.addEventListener('pageshow', () => { if (initialized && !pending) void check(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); else { pin = ''; if (initialized) update(); } });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void check(), { once: true }); else void check();
})();
