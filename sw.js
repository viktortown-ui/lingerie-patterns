// Service worker for Lingerie Pattern Studio.
// Goal: avoid "white screen" after deploy by preferring fresh network assets,
// while still offering an offline fallback.
//
// IMPORTANT: bump BUILD when you deploy a new release.
const BUILD = "v4";
const CACHE_NAME = `lingerie-patterns-${BUILD}`;

// Use relative URLs so the PWA works on GitHub Pages subpaths (/<repo>/)
const CORE = [
  "./",
  "./index.html",
  "./assets/css/app.css",
  "./assets/js/main.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Force re-download (bypass HTTP cache) so new deployments don't keep stale JS.
      await Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("lingerie-patterns-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML + scripts + styles to prevent mismatched versions.
  const isCritical =
    req.mode === "navigate" ||
    req.destination === "document" ||
    req.destination === "script" ||
    req.destination === "style";

  if (isCritical) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cached = await cache.match(req);
          if (cached) return cached;
          // Fallback to cached app shell
          return (await cache.match("./")) || (await cache.match("./index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for everything else.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});
