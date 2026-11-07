/* Layout-only resize control. Never changes avatar configuration or saved user data. */
(() => {
  'use strict';
  let initialized = false;
  const setup = () => {
  if (initialized) return;
  initialized = true;
  const handle = document.getElementById('workspaceResize');
  const stage = document.getElementById('stageCapture');
  const workspace = document.getElementById('editorWorkspace');
  if (!handle || !stage || !workspace) return;
  let gesture = null, size = 0, userSize = null, pending = 0, frame = 0;
  const limits = () => {
    const width = workspace.querySelector('.editor-stage-column')?.clientWidth || workspace.clientWidth;
    const max = Math.floor(Math.max(160, Math.min(520, width - 72, window.innerWidth <= 760 && document.body.classList.contains('inspector-open') ? window.innerHeight * .28 : window.innerHeight - 240)));
    return { min: Math.min(180, max), max, default: Math.min(max, window.innerWidth <= 650 ? 280 : 360) };
  };
  const apply = value => {
    const range = limits();
    size = Math.round(Math.max(range.min, Math.min(range.max, value)));
    workspace.style.setProperty('--workspace-size', size + 'px');
    handle.setAttribute('aria-valuemin', String(Math.ceil(range.min)));
    handle.setAttribute('aria-valuemax', String(Math.floor(range.max)));
    handle.setAttribute('aria-valuenow', String(size));
    handle.setAttribute('aria-valuetext', '编辑区 ' + size + ' 像素');
  };
  const flush = () => { if (frame) cancelAnimationFrame(frame); frame = 0; apply(pending); };
  const finish = cancel => {
    if (!gesture) return;
    const previous = gesture; gesture = null;
    if (frame) flush();
    if (cancel) { userSize = previous.userSize; apply(previous.size); }
    else userSize = size;
    document.documentElement.classList.remove('workspace-resizing');
    if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
  };
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture || (typeof drag !== 'undefined' && drag)) return;
    gesture = { id: event.pointerId, y: event.clientY, size, userSize };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    document.documentElement.classList.add('workspace-resizing');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    pending = gesture.size + event.clientY - gesture.y;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; apply(pending); });
    event.preventDefault();
  });
  handle.addEventListener('pointerup', event => { if (gesture?.id === event.pointerId) finish(false); });
  handle.addEventListener('pointercancel', event => { if (gesture?.id === event.pointerId) finish(true); });
  handle.addEventListener('lostpointercapture', event => { if (gesture?.id === event.pointerId) finish(true); });
  window.addEventListener('blur', () => finish(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(true); });
  handle.addEventListener('dblclick', () => { finish(true); userSize = null; apply(limits().default); });
  handle.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const range = limits(), step = event.shiftKey ? 48 : 16;
    const values = { ArrowUp: size - step, ArrowDown: size + step, Home: range.min, End: range.max, Enter: range.default };
    if (event.key === 'Escape' && gesture) { event.preventDefault(); finish(true); return; }
    if (!Object.hasOwn(values, event.key)) return;
    event.preventDefault(); finish(true); apply(values[event.key]);
    userSize = event.key === 'Enter' ? null : size;
  });
  const resize = () => { finish(true); apply(userSize ?? limits().default); };
  const column=workspace.querySelector('.editor-stage-column') || workspace;
  let observedWidth = column.clientWidth;
  new ResizeObserver(() => {
    if (column.clientWidth !== observedWidth) { observedWidth = column.clientWidth; requestAnimationFrame(resize); }
  }).observe(column);
  window.addEventListener('resize', resize);
  apply(limits().default);
  };
  window.addEventListener('avatar-editor-ready', setup, { once: true });
  if (typeof editorSetupReady !== 'undefined' && editorSetupReady) setup();
})();
