// TOP SHELF service worker. The server fills in VERSION (a hash of the game files) and FILES
// at startup, so any deploy that changes a file installs a fresh worker and cache.
// Network first (always the latest game when online), falling back to the cache offline.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `topshelf-${VERSION}`;
const SKIP = /^\/(ws|health|\.well-known)(\/|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('topshelf-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req, timeout) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fromNetwork(req, nav ? 4000 : 6000);
      // keep recorded commentary and anything else we fetched for offline use
      if (res.ok && res.type === 'basic' && !nav) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: nav });
      if (hit) return hit;
      if (nav) return (await cache.match('/')) || Response.error();
      throw err;
    }
  })());
});
