// Service worker template. The build fills in the cache version and the list
// of files to precache (see the serviceWorker plugin in vite.config.ts) and
// writes the result to dist/sw.js.
const CACHE = "spin-__VERSION__";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  // Download the whole app up front so it works offline from then on.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("spin-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Pages: try the network for updates, fall back to the cached app offline.
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html", { ignoreSearch: true }).then((r) => r || caches.match("./"))),
    );
    return;
  }

  // Assets: serve from cache (they're content-hashed), else the network.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
