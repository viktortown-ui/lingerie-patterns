// Service worker for Lingerie Pattern Studio.
// Goal: avoid "white screen" after deploy by preferring fresh network assets,
// while still offering an offline fallback.
//
// IMPORTANT: bump BUILD when you deploy a new release.
const BUILD = "v22";
const CACHE_NAME = `lingerie-patterns-${BUILD}`;
const NETWORK_TIMEOUT_MS = Number.isSafeInteger(self.__LEKALO_QA_NETWORK_TIMEOUT_MS)
  && self.__LEKALO_QA_NETWORK_TIMEOUT_MS > 0
  ? self.__LEKALO_QA_NETWORK_TIMEOUT_MS
  : 4000;

// Use relative URLs so the PWA works on GitHub Pages subpaths (/<repo>/)
const CORE = [
  "./",
  "./index.html",
  "./assets/css/app.css",
  "./assets/js/main.js",
  "./src/core/app/version.js",
  "./src/core/export/dxfExport.js",
  "./src/core/export/dxfParser.js",
  "./src/core/export/pdfExport.js",
  "./src/core/export/pathValidation.js",
  "./src/core/export/storedZip.js",
  "./src/core/export/svgExport.js",
  "./src/core/extensions/assistantHooks.js",
  "./src/core/geometry/Bezier.js",
  "./src/core/geometry/Offset.js",
  "./src/core/geometry/Path.js",
  "./src/core/geometry/Point.js",
  "./src/core/geometry/Units.js",
  "./src/core/grading/patternBatch.js",
  "./src/core/import/index.js",
  "./src/core/import/staticPatternStore.js",
  "./src/core/import/staticPatternSvg.js",
  "./src/core/import/staticSvg.js",
  "./src/core/pattern/annotations.js",
  "./src/core/pattern/panels.js",
  "./src/core/pattern/PatternModule.js",
  "./src/core/pattern/registry.js",
  "./src/core/templates/builtInUnderwearTemplates.js",
  "./src/core/templates/index.js",
  "./src/core/templates/templateModel.js",
  "./src/core/templates/templateStorage.js",
  "./src/core/utils/dom.js",
  "./src/core/utils/id.js",
  "./src/core/utils/math.js",
  "./src/core/validate/constraints.js",
  "./src/core/validate/validate.js",
  "./src/patterns/bralette_soft/draft.js",
  "./src/patterns/bralette_soft/module.js",
  "./src/patterns/bralette_soft/schema.js",
  "./src/patterns/crop_top_basic/draft.js",
  "./src/patterns/crop_top_basic/module.js",
  "./src/patterns/crop_top_basic/schema.js",
  "./src/patterns/index.js",
  "./src/patterns/panties_basic/draft.js",
  "./src/patterns/panties_basic/module.js",
  "./src/patterns/panties_basic/schema.js",
  "./src/patterns/panties_thong_basic/draft.js",
  "./src/patterns/panties_thong_basic/module.js",
  "./src/patterns/panties_thong_basic/schema.js",
  "./src/patterns/shared/lowerBodySchema.js",
  "./src/patterns/shared/underwearDraft.js",
  "./src/patterns/shared/upperBodyDraft.js",
  "./src/patterns/shared/upperBodySchema.js",
  "./src/ui/components/Form.js",
  "./src/ui/components/GradingPanel.js",
  "./src/ui/components/HelpButton.js",
  "./src/ui/components/HelpCenter.js",
  "./src/ui/components/LibraryHub.js",
  "./src/ui/components/PatternAdjuster.js",
  "./src/ui/components/Preview.js",
  "./src/ui/components/StaticImportDialog.js",
  "./src/ui/components/TemplateSaveDialog.js",
  "./src/ui/components/Toast.js",
  "./src/ui/i18n/en.js",
  "./src/ui/i18n/i18n.js",
  "./src/ui/i18n/ru.js",
  "./src/ui/help/helpContent.js",
  "./src/ui/screens/Editor.js",
  "./src/ui/screens/Home.js",
  "./src/ui/screens/StaticPattern.js",
  "./src/ui/state/store.js",
  "./src/ui/styles/theme.js",
  "./src/ui/utils/download.js",
  "./src/ui/utils/jsonImport.js",
  "./src/ui/utils/profiles.js",
  "./assets/icons/app-icon.svg",
  "./assets/icons/app-icon-192.png",
  "./assets/icons/app-icon-512.png",
  "./manifest.webmanifest",
];

async function fetchWithDeadline(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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

  const isNavigation = req.mode === "navigate" || req.destination === "document";
  const isCodeAsset = req.destination === "script" || req.destination === "style";

  // Network-first for navigations. Only navigations may fall back to the app
  // shell; serving HTML for a missing module/CSS request breaks the app by MIME.
  if (isNavigation) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetchWithDeadline(req);
          if (fresh && fresh.ok) {
            await cache.put(req, fresh.clone());
            return fresh;
          }
          return (await cache.match(req))
            || (await cache.match("./"))
            || (await cache.match("./index.html"))
            || fresh
            || Response.error();
        } catch (_) {
          return (await cache.match(req))
            || (await cache.match("./"))
            || (await cache.match("./index.html"))
            || Response.error();
        }
      })()
    );
    return;
  }

  // Scripts and styles may use only an exact cached response. Never substitute
  // the HTML shell, even when both the network and cache miss.
  if (isCodeAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetchWithDeadline(req);
          if (fresh && fresh.ok) {
            await cache.put(req, fresh.clone());
            return fresh;
          }
          return (await cache.match(req)) || fresh || Response.error();
        } catch (_) {
          return (await cache.match(req)) || Response.error();
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
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});
