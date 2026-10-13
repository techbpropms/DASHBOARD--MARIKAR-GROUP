// Service worker for the installable hub. Pages and data are fetched fresh when online (network first, cached copy
// offline); styles, scripts and images come from the cache. Bump VERSION with each release: the pages then show an
// "update available" message, and the new version takes over when the reader taps Update.
const VERSION = '2026.10.13';
const CACHE = 'marikar-hub-' + VERSION;
const CORE = ['./', 'index.html', 'divisions.html', 'dashboard.html', 'tracker.html', 'report.html', 'note.html', 'verify.html',
  'assets/theme.css', 'assets/dashboard.css', 'assets/divisions.css', 'assets/brand.css', 'assets/pwa.js',
  'assets/img/marikar-group.png', 'assets/img/bpro.png', 'assets/img/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('marikar-hub-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || /\.(html|json|csv|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (url.pathname.endsWith('version.json')) return; // always from the network, so updates are noticed
  if (fresh) {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
  }
});
