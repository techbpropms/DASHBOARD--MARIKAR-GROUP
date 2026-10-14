// Makes the hub installable on phones and shows an update message when a new version is published.
// The message lists the release notes from version.json; Update switches to the new version and reloads.
(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const banner = (reg, info) => {
    if (document.getElementById('hub-update')) return;
    const b = document.createElement('div');
    b.id = 'hub-update'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;width:min(560px,calc(100% - 24px));background:#131c38;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:14px 16px;font:14px/1.45 "Plus Jakarta Sans",system-ui,sans-serif;display:flex;gap:12px;align-items:flex-start;border-top:4px solid #d49a3a';
    const txt = document.createElement('div'); txt.style.flex = '1';
    const h = document.createElement('b'); h.textContent = 'Update available' + (info && info.title ? ': ' + info.title : '');
    txt.append(h);
    if (info && info.notes && info.notes.length) { const ul = document.createElement('ul'); ul.style.cssText = 'margin:6px 0 0;padding-left:18px;opacity:.9;font-size:13px'; info.notes.slice(0, 4).forEach((n) => { const li = document.createElement('li'); li.textContent = n; ul.append(li); }); txt.append(ul); }
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Update';
    go.style.cssText = 'font:inherit;font-weight:700;border:0;border-radius:10px;padding:8px 14px;background:#d49a3a;color:#1d1408;cursor:pointer';
    const later = document.createElement('button'); later.type = 'button'; later.textContent = 'Later'; later.setAttribute('aria-label', 'Dismiss');
    later.style.cssText = 'font:inherit;border:0;background:transparent;color:#fff;opacity:.75;cursor:pointer;padding:8px 4px';
    go.onclick = () => { if (reg.waiting) reg.waiting.postMessage('skip-waiting'); else location.reload(); };
    later.onclick = () => b.remove();
    b.append(txt, go, later); document.body.append(b);
  };
  const notes = () => fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = () => notes().then((info) => banner(reg, info));
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(); });
    });
    // Check for a new version when the app is reopened and every 30 minutes while it stays open.
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
})();
