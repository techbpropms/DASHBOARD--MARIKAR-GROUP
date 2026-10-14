// Makes the hub an installable app, invites every visitor to install it, and shows an update message when a new
// version is published (the message lists the notes from version.json; Update switches over and reloads).
//
// Install invitation: on Android, Chrome and Edge the browser raises `beforeinstallprompt`; we keep that event and
// open the native install dialog from an "Install the app" card at the foot of the page and an "Install app" button
// in the bar. iPhone and iPad have no such event, so there the card shows the Share > "Add to Home Screen" steps.
// The card returns on every new visit until the hub is installed; "Not now" hides it for the current session only.
(() => {
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } return v; };
  const snoozed = () => { try { return sessionStorage.getItem('mg-install-snooze') === '1'; } catch (e) { return false; } };
  const snooze = () => { try { sessionStorage.setItem('mg-install-snooze', '1'); } catch (e) { /* ignore */ } };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|chrome|android/i.test(navigator.userAgent);
  const FONT = '"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif';
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  let deferred = null;

  // ----- the install card
  function card(mode) {
    if (document.getElementById('hub-install') || standalone() || pref('mg-installed') === '1' || snoozed()) return;
    const b = el('div', 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:50;width:min(560px,calc(100% - 24px));background:#fffcf7;color:#2a241f;border:1px solid #e8dfd1;border-top:4px solid #5b4f9e;border-radius:14px;box-shadow:0 14px 40px rgba(30,20,10,.22);padding:14px 16px;font:14px/1.45 ' + FONT + ';display:flex;gap:14px;align-items:flex-start');
    b.id = 'hub-install'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Install the Marikar hub app');
    const tile = el('span', 'flex:none;background:#fff;border:1px solid #e8dfd1;border-radius:12px;padding:6px 8px;line-height:0');
    const img = el('img'); img.src = 'assets/img/icon-192.png'; img.alt = ''; img.width = 44; img.height = 44; tile.append(img);
    const txt = el('div', 'flex:1;min-width:0');
    txt.append(el('b', 'display:block;font-size:15px', 'Install the Marikar hub app'));
    const actions = el('div', 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px');
    const notNow = el('button', 'font:inherit;border:0;background:transparent;color:#5b4f9e;font-weight:700;cursor:pointer;padding:8px 6px', 'Not now');
    notNow.type = 'button'; notNow.onclick = () => { snooze(); b.remove(); };
    if (mode === 'ios') {
      txt.append(el('span', 'display:block;color:#6b6157;font-size:13.5px', 'Opens full-screen from your Home Screen and works offline. Two taps in Safari:'));
      const ol = el('ol', 'margin:8px 0 0;padding-left:20px;font-size:13.5px');
      const li1 = el('li'); li1.append('Tap ', el('b', null, 'Share'), ' (the square with the arrow at the bottom of the screen)');
      const li2 = el('li'); li2.append('Choose ', el('b', null, 'Add to Home Screen'), ', then ', el('b', null, 'Add'));
      ol.append(li1, li2); txt.append(ol);
      const done = el('button', 'font:inherit;font-weight:700;border:0;border-radius:10px;padding:8px 14px;background:#131c38;color:#fff;cursor:pointer', 'Done, it’s installed');
      done.type = 'button'; done.onclick = () => { pref('mg-installed', '1'); b.remove(); };
      actions.append(done, notNow);
    } else {
      txt.append(el('span', 'display:block;color:#6b6157;font-size:13.5px', 'One tap: it opens full-screen from your home screen or desktop, works offline, and updates itself.'));
      const go = el('button', 'font:inherit;font-weight:800;border:0;border-radius:10px;padding:9px 16px;background:#131c38;color:#fff;cursor:pointer', 'Install');
      go.type = 'button'; go.onclick = () => install(go);
      actions.append(go, notNow);
    }
    txt.append(actions); b.append(tile, txt); document.body.append(b);
  }
  async function install(btn) {
    if (!deferred) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Opening…'; }
    const ev = deferred; deferred = null;
    try { ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === 'accepted') pref('mg-installed', '1'); } catch (e) { /* the browser declined to show it */ }
    const c = document.getElementById('hub-install'); if (c) c.remove();
    const bb = document.getElementById('hub-install-btn'); if (bb) bb.remove(); document.body.classList.remove('mg-has-install');
  }
  // "Install app" in the bar, when the browser can install right now
  function barButton() {
    if (document.getElementById('hub-install-btn') || standalone()) return;
    const right = document.querySelector('.mg-right'); if (!right) return;
    const b = el('button', 'font:inherit;font-size:12.5px;font-weight:700;color:#fff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:6px 11px;cursor:pointer;white-space:nowrap', 'Install app');
    b.id = 'hub-install-btn'; b.type = 'button'; b.title = 'Install the hub as an app'; b.onclick = () => install(b);
    right.prepend(b); document.body.classList.add('mg-has-install');   // the bar compresses earlier to make room
  }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; barButton(); card('native'); });
  addEventListener('appinstalled', () => { pref('mg-installed', '1'); const c = document.getElementById('hub-install'); if (c) c.remove(); const bb = document.getElementById('hub-install-btn'); if (bb) bb.remove(); });
  // iPhone / iPad: no event, so invite with the steps; wait a moment so the page has settled
  if (isIOS && isSafari && !standalone()) setTimeout(() => card('ios'), 1500);

  // ----- updates
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const banner = (reg, info) => {
    if (document.getElementById('hub-update')) return;
    const b = el('div', 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:51;width:min(560px,calc(100% - 24px));background:#131c38;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:14px 16px;font:14px/1.45 ' + FONT + ';display:flex;gap:12px;align-items:flex-start;border-top:4px solid #d49a3a');
    b.id = 'hub-update'; b.setAttribute('role', 'status');
    const txt = el('div', 'flex:1');
    txt.append(el('b', null, 'Update available' + (info && info.title ? ': ' + info.title : '')));
    if (info && info.notes && info.notes.length) { const ul = el('ul', 'margin:6px 0 0;padding-left:18px;opacity:.9;font-size:13px'); info.notes.slice(0, 4).forEach((n) => ul.append(el('li', null, n))); txt.append(ul); }
    const go = el('button', 'font:inherit;font-weight:700;border:0;border-radius:10px;padding:8px 14px;background:#d49a3a;color:#1d1408;cursor:pointer', 'Update'); go.type = 'button';
    const later = el('button', 'font:inherit;border:0;background:transparent;color:#fff;opacity:.75;cursor:pointer;padding:8px 4px', 'Later'); later.type = 'button'; later.setAttribute('aria-label', 'Dismiss');
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
  window.MGInstall = { install: () => install(null), available: () => !!deferred };
})();
