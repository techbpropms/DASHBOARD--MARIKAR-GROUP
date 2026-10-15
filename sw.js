// Service worker for the installable hub. Pages, scripts, styles and data are fetched fresh when online (network first,
// revalidated with the server, cached copy offline), so a change such as a new account in auth.js applies on the next
// load; images come from the cache. Bump VERSION with each release: the pages then show an
// "update available" message, and the new version takes over when the reader taps Update.
const VERSION = '2026.10.15d';
const CACHE = 'marikar-hub-' + VERSION;
const CORE = ['./', 'index.html', 'hub.html', 'assets/auth.js', 'divisions.html', 'dashboard.html', 'tracker.html', 'report.html', 'note.html', 'verify.html', 'settings.html',
  'assets/theme.css', 'assets/shell.css', 'assets/shell.js', 'assets/dashboard.css', 'assets/divisions.css', 'assets/brand.css', 'assets/pwa.js',
  'assets/img/marikar-group.png', 'assets/img/bpro.png', 'assets/img/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('marikar-hub-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || /\.(html|json|csv|webmanifest|js|css)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (url.pathname.endsWith('version.json')) return; // always from the network, so updates are noticed
  if (fresh) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('hub.html') : Response.error()))));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
  }
});
