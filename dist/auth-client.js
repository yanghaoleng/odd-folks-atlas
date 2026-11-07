(() => {
'use strict';
if (window.AvatarAuth) return;
if (window.AvatarDemo?.active) { window.AvatarAuth = Object.freeze({ open() {}, check() {}, logout: () => window.AvatarDemo.exit(), getState: () => ({ authenticated: false, demo: true, loginAvailable: false }) }); return; }
const node = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n; };
let accountButton;
let loginAvailable = null;
let dialog, message, retry, keys, dots, progress, previousFocus, soundToggle;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let initialized = false, authenticated = null, pending = false, request = 0, blockedUntil = 0, tick;
let pin = '', pendingDigits = 0, demoNavigation;
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
    const entering = i < count && !button.classList.contains('filled');
    button.classList.toggle('filled', i < count);
    if (entering) { button.classList.remove('is-entering'); void button.offsetWidth; button.classList.add('is-entering'); }
    if (i >= count) button.classList.remove('is-entering');
    button.disabled = pending || locked || i >= count;
  });
  progress.textContent = pending && pendingDigits ? '正在验证密码。' : `已输入 ${count} 位，共 6 位。`;
  dialog.classList.toggle('is-verifying', pending && pendingDigits === 6);
  dialog.setAttribute('aria-busy', String(pending));
  for (const button of dialog.querySelectorAll('.avatar-auth-retry')) button.disabled = pending;
}
function focusKey() { keys.querySelector('button:not(:disabled)')?.focus({ preventScroll: true }); }
function flash(button, repeat = true) {
  if (!button || (!repeat && button.classList.contains('is-pressed'))) return;
  clearTimeout(flashes.get(button));
  button.classList.remove('is-pressed'); void button.offsetWidth;
  button.classList.add('is-pressed');
  flashes.set(button, setTimeout(() => button.classList.remove('is-pressed'), 560));
}
function sound(cue = 'press') { window.AvatarSounds?.play(cue); }
function syncSoundToggle() {
  if (!soundToggle) return;
  const value = window.AvatarSounds?.getState(), enabled = !!value?.enabled && value.volume > 0;
  soundToggle.textContent = enabled ? '音效开' : '音效关';
  soundToggle.setAttribute('aria-label', enabled ? '关闭按键音效' : '开启按键音效');
  soundToggle.setAttribute('aria-pressed', String(enabled));
  soundToggle.disabled = !value;
}
function digit(value) {
  if (pending || Date.now() < blockedUntil || pin.length >= 6) return;
  if (!pin.length) announce('请输入六位登录密码。');
  pin += value;
  flash(keys.querySelector(`[data-digit="${value}"]`), false); sound();
  update();
  if (pin.length === 6) void login();
}
function setAuthenticated(value, forceEvent = false) {
  const changed = value !== authenticated;
  authenticated = value;
  if (value) { const url = new URL(location.href); if (url.searchParams.has('login')) { url.searchParams.delete('login'); history.replaceState(history.state, '', url.href); } }
  if(accountButton){accountButton.hidden=loginAvailable===false;accountButton.textContent=value?'退出登录':'登录编辑';}
  if (value) { clear(); if (dialog.open) dialog.close(); previousFocus?.focus?.(); }

  if (changed || forceEvent) window.dispatchEvent(new CustomEvent('avatar-auth-changed', { detail: { authenticated: value } }));
}
function open() {
  if(loginAvailable===false){alert('此部署未启用登录。本地编辑请使用 npm run dev；托管编辑需由部署者配置 HTTPS 和管理凭据。');return;}
  init(); clear(); syncSoundToggle();
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
    const forceEntry = new URL(location.href).searchParams.get('login') === '1';
    setAuthenticated(forceEntry ? false : data.authenticated);
    if (forceEntry && loginAvailable !== false && !dialog.open) open();
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
  let openingDemo = false;
  announce('正在验证…'); update();
  try {
    const body = JSON.stringify({ pin }); pin = '';
    const response = await fetch('/api/v1/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body });
    if (token !== request) return;
    if (response.status === 429) { rateLimit(response); return; }
    if (response.status === 401) {
      const result = await response.json();
      if (token !== request) return;
      // Only a verified invalid-PIN result enters demo. Lockouts and transport failures never do.
      if (result.error === 'invalid_pin') {
        openingDemo = true; announce('正在打开本页演示…'); update();
        const url = new URL(location.href); url.pathname = url.pathname.replace(/catalog\.html$/, ''); url.searchParams.delete('login'); url.searchParams.set('demo', '1');
        if (location.pathname.endsWith('/catalog.html')) url.searchParams.set('view', 'resources');
        demoNavigation = setTimeout(() => location.assign(url.href), reducedMotion() ? 70 : 260);
        return;
      }
      announce('暂时无法确认登录状态，请重试。', true); retry.hidden = false; return;
    }
    if (!response.ok) { announce('暂时无法登录，请稍后重试。', true); return; }
    const data = await response.json();
    if (token !== request) return;
    if (data.authenticated !== true) { announce('暂时无法确认登录状态，请重试。', true); retry.hidden = false; return; }
    setAuthenticated(true, true);
  } catch { if (token === request) announce('网络连接失败，请重试。', true); }
  finally { if (token === request && !openingDemo) { pending = false; pendingDigits = 0; clear(); if (dialog.open) focusKey(); } }
}
async function logout() {
  if (pending) return false;
  if (window.avatarPrepareLogout && !window.avatarPrepareLogout()) return false;
  init(); const token = ++request; pending = true; update();
  if (!dialog.open) { previousFocus = document.activeElement; dialog.showModal(); }
  announce('正在退出登录…', true);
  const button = document.getElementById('logoutSession'); if (button) button.disabled = true;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/v1/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
    if (token !== request) return false;
    if (!response.ok || (await response.json()).authenticated !== false) throw Error('logout_unconfirmed');
    setAuthenticated(false, true);
    location.assign(new URL('./?login=1', location.href).href); return true;
  } catch {
    if (token === request) {
      const url = new URL(location.href); url.searchParams.set('login', '1'); history.replaceState(history.state, '', url.href);
      window.avatarLogoutFailed?.(); setAuthenticated(false, true); if (!dialog.open) open();
      announce('退出结果未确认，当前修改仍留在本页。请重新验证后再同步。', true);
    }
    return false;
  } finally { clearTimeout(timer); if (token === request) { pending = false; pendingDigits = 0; update(); if (button) button.disabled = false; } }
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
    dot.addEventListener('click', () => { if (pending || Date.now() < blockedUntil) return; pin = pin.slice(0, i); sound('release'); update(); focusKey(); });
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
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending) { clear(); dialog.close(); previousFocus?.focus?.(); } }
    else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault(); if (!pending && Date.now() >= blockedUntil) { pin = pin.slice(0, -1); sound('release'); update(); }
    }
  });
  retry = node('button', 'avatar-auth-retry', '重试'); retry.type = 'button'; retry.hidden = true; retry.addEventListener('click', check);
  soundToggle = node('button', 'avatar-auth-sound', '音效'); soundToggle.type = 'button';
  soundToggle.addEventListener('click', () => { const sounds = window.AvatarSounds; if (!sounds) return; const current = sounds.getState(); const enabled = !current.enabled || current.volume === 0; sounds.setEnabled(enabled); if (enabled && current.volume === 0) sounds.setVolume(0.28); syncSoundToggle(); });
  document.addEventListener('avatar-sounds-ready', syncSoundToggle);
  document.addEventListener('avatar-sounds-changed', syncSoundToggle);
  const demoHint = node('p', 'avatar-auth-demo-hint', '正式密码登录，其余六位数字进入演示');
  const close=node('button','avatar-auth-retry','暂不登录');close.type='button';close.addEventListener('click',()=>{clear();dialog.close();previousFocus?.focus?.();});
  form.append(title, help, dots, progress, keys, message, retry, soundToggle, demoHint, close); dialog.append(form); document.body.append(dialog);
  const host = document.querySelector('header .heading') || document.querySelector('header') || document.body;
  host.classList.add('avatar-auth-header');
  accountButton=node('button','avatar-auth-retry','登录编辑');accountButton.type='button';accountButton.hidden=true;accountButton.addEventListener('click',async()=>{if(!authenticated){open();return;}await logout();});host.append(accountButton);update();
}
window.AvatarAuth = { open, check, logout, getState: () => ({ authenticated, pending, loginAvailable: loginAvailable }) };
window.addEventListener('pagehide', () => { ++request; clearTimeout(demoNavigation); pin = ''; pending = false; pendingDigits = 0; if (initialized) update(); });
window.addEventListener('pageshow', () => { if (initialized && !pending) void check(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); else { pin = ''; if (initialized) update(); } });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void check(), { once: true }); else void check();
})();
