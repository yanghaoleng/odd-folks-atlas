import { createUISFX } from './vendor/uisfx-0.4.0.js';

// Sound stays a local device preference and never enters avatar sync/config data.
const preferenceKey = 'jojo-avatar:sounds:v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch {}
const player = createUISFX({
  pack: 'rubber',
  volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.28,
  enabled: typeof saved.enabled === 'boolean' ? saved.enabled : true,
  preferences: { key: preferenceKey }, maxVoices: 2, cooldownMs: 140,
});
const allowed = new Set(['select', 'open', 'close', 'undo', 'redo', 'success', 'error', 'drop', 'reaction', 'complete', 'toggle-on', 'toggle-off']);
let unlocked = false, unlocking = null, lastPlayed = -Infinity;
let controls = null;
const state = () => ({ enabled: player.isEnabled(), volume: player.getVolume(), pack: 'rubber' });

function unlock(event) {
  if (!event?.isTrusted || document.hidden || !player.isEnabled() || player.getVolume() === 0) return;
  if (event.type === 'keydown' && (event.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))) return;
  if (!unlocking) {
    try {
      unlocking = player.unlock().then(ok => { unlocked = !!ok; return unlocked; }, () => false)
        .finally(() => { unlocking = null; });
    } catch { unlocked = false; }
  }
}
function play(cue) {
  if (!allowed.has(cue) || !player.isEnabled() || player.getVolume() === 0 || document.hidden) return;
  const requested = performance.now();
  const run = () => {
    if (!unlocked || !player.isEnabled() || player.getVolume() === 0 || document.hidden || performance.now() - requested > 300) return;
    const cooldown = cue === 'success' || cue === 'complete' ? 600 : 110;
    if (performance.now() - lastPlayed < cooldown) return;
    try {
      const sound = player.play(cue, { retrigger: 'restart', cooldownMs: 140 });
      if (sound) {
        lastPlayed = performance.now();
        document.dispatchEvent(new CustomEvent('avatar-sound-played', { detail: { cue } }));
      }
    } catch { /* Unsupported audio must not interrupt editing. */ }
  };
  if (unlocked) run();
  else if (unlocking) void unlocking.then(run);
}
function renderControls() {
  if (!controls) return;
  const value = state(), audible = value.enabled && value.volume > 0;
  controls.querySelector('[data-sound-enabled]').checked = value.enabled;
  controls.querySelector('[data-sound-volume]').value = Math.round(value.volume * 100);
  controls.querySelector('output').textContent = `${Math.round(value.volume * 100)}%`;
  controls.querySelector('summary').setAttribute('aria-label', `操作音效，${audible ? '已开启' : '已静音'}`);
  controls.querySelector('summary').title = `操作音效${audible ? '已开启' : '已静音'}，点击设置`;
  controls.dataset.muted = String(!audible);
}
function setEnabled(value) {
  player.setEnabled(!!value); renderControls();
  if (!value) unlocked = false;
}
function setVolume(value) {
  if (!Number.isFinite(value)) return;
  player.setVolume(Math.max(0, Math.min(1, value))); renderControls();
  if (player.getVolume() === 0) player.stopAll();
}
function mountControls(host = document.getElementById('avatarSoundControls')) {
  if (!host) {
    const nav = document.querySelector('body.editor-page > header nav');
    if (!nav) return;
    host = document.createElement('div'); host.id = 'avatarSoundControls';
    nav.insertBefore(host, document.getElementById('panelToggle'));
  }
  if (host.querySelector('.avatar-sound-settings')) return;
  const detail = document.createElement('details');
  detail.className = 'avatar-sound-settings';
  detail.innerHTML = `<summary aria-label="操作音效" title="操作音效设置"><span class="avatar-sound-glyph" aria-hidden="true"></span></summary><div class="avatar-sound-popover"><label class="avatar-sound-switch"><span>操作音效</span><input type="checkbox" data-sound-enabled></label><label class="avatar-sound-volume"><span>音量 <output></output></span><input type="range" min="0" max="100" step="5" data-sound-volume aria-label="操作音效音量"></label><p>轻轻弹一下。设置只保存在本机。</p></div>`;
  host.append(detail); controls = detail;
  detail.querySelector('[data-sound-enabled]').addEventListener('change', event => {
    setEnabled(event.target.checked);
    if (event.target.checked) { unlock(event); play('toggle-on'); }
  });
  const volume = detail.querySelector('[data-sound-volume]');
  volume.addEventListener('input', event => setVolume(Number(event.target.value) / 100));
  volume.addEventListener('change', event => { unlock(event); play('select'); });
  detail.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); detail.open = false; detail.querySelector('summary').focus();
  });
  const keepPopoverInView = () => {
    if (!detail.open) return;
    const panel = detail.querySelector('.avatar-sound-popover');
    panel.style.transform = '';
    const rect = panel.getBoundingClientRect();
    const shift = rect.left < 14 ? 14 - rect.left : rect.right > innerWidth - 14 ? innerWidth - 14 - rect.right : 0;
    if (shift) panel.style.transform = `translateX(${shift}px)`;
  };
  detail.addEventListener('toggle', keepPopoverInView);
  window.addEventListener('resize', keepPopoverInView);
  document.addEventListener('pointerdown', event => { if (!detail.contains(event.target)) detail.open = false; });
  document.addEventListener('focusin', event => { if (!detail.contains(event.target)) detail.open = false; });
  renderControls();
}

// A gesture unlocks Web Audio, but creates no sound itself.
document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
document.addEventListener('keydown', unlock, { capture: true });
const clickCues = [
  ['#undo', 'undo'], ['#redo', 'redo'],
  ['#batchButton, #changeAvatar, #applyUid, .tile, .tabs [data-layer], .emotion-option', 'select'],
  ['#panelToggle, #motionOpen, #editEmotionEmphasis', 'open'],
  ['#panelClose, .emotion-sheet-close', 'close'],
  ['#playEntrance, #playClick, #motionPreview', 'reaction'],
];
document.addEventListener('click', event => {
  if (!event.isTrusted || !(event.target instanceof Element)) return;
  const target = event.target.closest('[data-avatar-sound], button, [role="button"]');
  if (!target || target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true' || target.closest('#avatarSoundControls')) return;
  const cue = target.dataset.avatarSound || clickCues.find(([selector]) => target.matches(selector))?.[1];
  if (cue) queueMicrotask(() => { if (!event.defaultPrevented) play(cue); });
}, { capture: true });
document.addEventListener('change', event => {
  if (!event.isTrusted || !(event.target instanceof Element) || event.target.closest('#avatarSoundControls')) return;
  if (event.target.matches('body.editor-page select')) play('select');
  else if (event.target.matches('body.editor-page input[type="checkbox"]')) play(event.target.checked ? 'toggle-on' : 'toggle-off');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { player.stopAll(); unlocked = false; }
});
window.addEventListener('pagehide', () => { player.stopAll(); unlocked = false; });
window.AvatarSounds = Object.freeze({ play, setEnabled, setVolume, getState: state, mountControls });
mountControls();
