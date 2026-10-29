/* MY-KHATA PWA Service Worker */
const CACHE_PREFIX = "my-khata-shell-";
const CACHE_NAME = "my-khata-shell-v7";
const APP_SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/style.css", "./css/dark.css", "./css/theme.css",
  "./js/config.js", "./js/utils.js", "./js/offline.js",
  "./js/i18n-dict.js", "./js/i18n.js", "./js/settings.js",
  "./js/auth.js", "./js/customers.js", "./js/transactions.js",
  "./js/profile.js", "./js/share.js", "./js/app.js", "./js/voice-entry.js",
  "./assets/moneymate-logo.jpg", "./assets/moneymate-splash.png",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
// New version waits until the user taps the "update available" banner.
self.addEventListener("message", event => { if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Do not cache user data, auth, database API calls, or non-static Supabase requests.
  if (/supabase\.(co|in)$/i.test(url.hostname) || url.pathname.includes("/auth/") || url.pathname.includes("/rest/v1/") || url.pathname.includes("/storage/v1/")) return;
  const isStaticCdn = url.hostname === "cdn.jsdelivr.net" || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (url.origin !== self.location.origin && !isStaticCdn) return;
  if (request.mode === "navigate") {
    // The app shell is precached during install. Avoid cloning a navigation
    // response here; some browsers can report its body as already used.
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match("./index.html", { ignoreSearch: true })) ||
        (await caches.match("./", { ignoreSearch: true })) ||
        Response.error()
      )
    );
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response && (response.ok || response.type === "opaque") && (url.origin === self.location.origin || isStaticCdn)) {
        const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => new Response("Offline resource unavailable", {status:503, statusText:"Offline"}));
  }));
});
