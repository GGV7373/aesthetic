/* Makes the site work offline. Every same-origin GET goes to the network first
   and a copy is kept; the copy is only used when the network fails, so a deploy
   is never hidden behind an old cache. Google Fonts and YouTube thumbnails are
   left to the browser: offline, the page falls back to system fonts.
   Registered from assets/js/data.js. */
var CACHE = 'aq-v1'; /* change the name to throw away everything saved so far */

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return fetch(req).then(function (res) {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function (err) {
      /* A page link may carry ?seed= or ?compare=; the saved page is the same one. */
      return cache.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) {
        if (hit) return hit;
        throw err;
      });
    });
  }));
});
