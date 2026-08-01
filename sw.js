/* LAST CALL service worker — deliberately minimal.
   Network-first for EVERYTHING so deploys are instant (no stale index.html, ever).
   Cache is only an offline fallback for the shell + icons. */
const CACHE = "lastcall-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // only same-origin GETs; let Supabase/Daily/CDN traffic pass straight through
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // HTML documents: bypass the HTTP cache entirely (GitHub Pages serves
  // max-age=600, which made fresh deploys invisible for up to 10 minutes).
  // Other assets keep normal caching; everything stays network-first.
  const isDoc = e.request.mode === "navigate" ||
                (e.request.headers.get("accept") || "").includes("text/html");
  const req = isDoc ? new Request(e.request, { cache: "no-cache" }) : e.request;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
