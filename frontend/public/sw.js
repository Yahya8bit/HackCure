// Offline app shell for the patient PWA.
// - Pages and built assets: network first, fall back to cache (so updates arrive when online).
// - API GETs (config, schedule, /me): network first, fall back to the last cached answer.
// - POSTs are never cached: writes go through the IndexedDB queue in the page instead.
const CACHE = "nawba-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icon.svg"])));
  self.skipWaiting();
});
// Drop caches from older versions so a stale page can never point at deleted bundles.
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Never keep clinician data on a device; never cache writes.
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/clinic") || url.pathname.startsWith("/clinic")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html"))),
  );
});
