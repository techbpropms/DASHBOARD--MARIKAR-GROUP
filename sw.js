// Service worker for the installable hub. Pages, scripts, styles and data are fetched fresh when online (network first,
// revalidated with the server, cached copy offline), so a change such as a new account in auth.js applies on the next
// load; images come from the cache. Bump VERSION with each release: the new version installs, takes over at once and
// the open hub pages reload on it on every device (no tap needed), so nobody keeps running an old copy.
const VERSION = '2026.10.17l';
const CACHE = 'marikar-hub-' + VERSION;
const CORE = ['./', 'index.html', 'hub.html', 'assets/auth.js', 'divisions.html', 'dashboard.html', 'tracker.html', 'canon.html', 'report.html', 'note.html', 'verify.html', 'settings.html', 'reset.html', '404.html', 'feedback.html', 'password-help.html',
  'assets/theme.css', 'assets/shell.css', 'assets/shell.js', 'assets/dashboard.css', 'assets/divisions.css', 'assets/brand.css', 'assets/pwa.js',
  'assets/img/marikar-group.png', 'assets/img/bpro.png', 'assets/img/icon-192.png', 'assets/img/favicon.svg', 'assets/img/favicon-32.png', 'assets/img/mark-loader.svg', 'assets/img/mark-loader-light.svg', 'assets/img/mark-loader-dark.svg', 'manifest.webmanifest'];

// a new version does not wait for every tab to close: it installs, activates and takes over at once, and the open hub
// pages reload themselves when it takes control (pwa.js, on controllerchange)
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  // Chromium can leave the new version waiting when an open page fetches through the old one at the moment of the
  // switch (older pages ask for version.json just then), so ask again a few times while this worker is awake
  [1000, 3000, 8000, 20000].forEach((t) => setTimeout(() => self.skipWaiting(), t));
});
// no page navigation from here: a navigation waits for activation to finish, so waiting on it would never end
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('marikar-hub-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || /\.(html|json|csv|webmanifest|js|css)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (url.pathname.endsWith('version.json')) return; // always from the network, so updates are noticed
  // the server's own endpoints and live files: never cached (the sign-in beacon, submitted codes, the sign-in log,
  // the clerk's status), or a repeat sign-in would be answered from the cache and never reach the server
  if (/(?:^|\/)(signin-log|submit|signins\.log|clerk\.json|results\.json)$/.test(url.pathname)) return;
  if (fresh) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('404.html').then((n) => n || caches.match('hub.html')) : Response.error()))));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
  }
});
