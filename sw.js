/* Everything the app needs is precached on install, so once the page has been
   opened one time it starts with no network at all. Responses are served from
   the cache first and refreshed in the background, so a new deploy is picked
   up the next time the app is launched.

   Bump CACHE on every release, or the new worker inherits stale entries. */
const CACHE = 'devops-pocket-toolkit-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/tools/cidr.png',
  './icons/tools/subnet.png',
  './icons/tools/base64.png',
  './icons/tools/url.png',
  './icons/tools/regex.png',
  './icons/tools/jwt.png',
  './icons/tools/time.png',
  './icons/tools/uuid.png',
  './icons/tools/password.png',
  './icons/tools/hash.png',
  './icons/tools/json.png',
  './icons/tools/yaml.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || fresh;
    })
  );
});
