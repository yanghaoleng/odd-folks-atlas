/* An isolated, ephemeral brand avatar. Never edits an avatar or saves configuration. */
(() => {
  'use strict';
  const random = () => {
    if (globalThis.crypto?.getRandomValues) return Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(36)).join('-');
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  };
  const icon = document.querySelector('link[data-avatar-favicon]');
  const mount = () => {
    const heading = document.querySelector('body.editor-page > header h1');
    if (!heading || heading.querySelector('.avatar-brand-random')) return;
    heading.classList.add('avatar-brand-heading');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'avatar-brand-random';
    button.title = '点一下，遇见另一位怪可爱';
    button.setAttribute('aria-label', '随机换一个怪可爱头像');
    button.disabled = true;
    const host = document.createElement('span'); host.className = 'avatar-brand-art'; host.setAttribute('aria-hidden', 'true');
    for (const layer of ['head', 'accessory', 'mood']) {
      const canvas = document.createElement('canvas'); canvas.className = 'refine-avatar-' + layer;
      canvas.width = canvas.height = 128; host.append(canvas);
    }
    button.append(host); heading.prepend(button);
    let sequence = 0, current = null, generation = 0;
    const visit = random();
    const change = async () => {
      const version = ++generation;
      const seed = 'odd-folks-brand:' + visit + ':' + ++sequence + ':' + random();
      let item;
      // Keep valid existing combinations and avoid visually identical consecutive results.
      for (let attempt = 0; attempt < 100; attempt++) {
        item = R.generate(seed + ':' + attempt, { activeOnly: true });
        if (!current || R.forItem(item).identityKey !== R.forItem(current).identityKey) break;
      }
      const ready = await Promise.all(['head', 'accessory', 'mood'].map(layer => {
        const id = assetId(item, layer); return id === 'none' ? true : loadAsset(layer, id);
      }));
      if (version !== generation || ready.some(ok => !ok)) return;
      AvatarMotion.stop(host);
      const pair = colorPair(item);
      for (const layer of ['head', 'accessory', 'mood']) {
        const canvas = host.querySelector('.refine-avatar-' + layer), ctx = canvas.getContext('2d');
        ctx.setTransform(.125, 0, 0, .125, 0, 0); ctx.clearRect(0, 0, 1024, 1024);
        const id = assetId(item, layer), name = sourceName(layer, id);
        if (id === 'none' || !images[name]) continue;
        const image = layer === 'accessory' ? tintFor(name, pair.accent) : images[name];
        const transform = state.transforms[layer][id] || M.assetDefault(layer, id);
        ctx.save(); ctx.translate(512 + transform.x, 512 + transform.y);
        ctx.rotate((transform.rotation || 0) * Math.PI / 180); ctx.scale(transform.scale, transform.scale);
        ctx.drawImage(image, -512, -512, 1024, 1024); ctx.restore();
      }
      // A single static PNG per completed selection, never an animated favicon.
      // The image itself is the cache key, so a new combination replaces old tab art.
      if (icon) {
        const tab = document.createElement('canvas'); tab.width = tab.height = 128;
        const context = tab.getContext('2d');
        for (const canvas of host.querySelectorAll('canvas')) context.drawImage(canvas, 0, 0);
        icon.type = 'image/png'; icon.sizes = '128x128';
        icon.href = tab.toDataURL('image/png'); icon.dataset.avatarFavicon = seed;
      }
      current = item; host.dataset.avatarMoodId = assetId(item, 'mood'); button.dataset.brandSeed = seed;
      AvatarMotion.configure(host, motionConfig(), backgroundConfig());
      AvatarMotion.play(host, 'entrance');
    };
    button.addEventListener('click', () => { change().catch(() => {}); });
    const start = () => { button.disabled = false; change().catch(() => {}); };
    if (typeof editorSetupReady !== 'undefined' && editorSetupReady) start();
    else window.addEventListener('avatar-editor-ready', start, { once: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
