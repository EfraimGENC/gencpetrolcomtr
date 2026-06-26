/* Genç Petrol — offline-first service worker
 *
 * Strateji: önce cache (anında açılır), sonra arka planda ağdan güncelle
 * (stale-while-revalidate). İnternet yokken bile uygulama ikonundan açılır.
 *
 * Sürümü değiştirince (CACHE_VERSION) eski cache temizlenir ve kabuk yeniden
 * yüklenir. İçerik güncellendiğinde bu numarayı artırmak yeterli.
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = "gp-shell-" + CACHE_VERSION;
const FONT_CACHE = "gp-fonts-" + CACHE_VERSION;

/* İnternet olmadan da açılması için önceden cache'lenecek uygulama kabuğu. */
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/favicon-96x96.png",
  "/apple-touch-icon.png",
  "/logo.svg",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== FONT_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* cache'i öncele, ağ yanıtı gelirse arka planda güncelle. */
function staleWhileRevalidate(cacheName, request, fallbackKey) {
  return caches.open(cacheName).then((cache) =>
    cache.match(fallbackKey || request, { ignoreSearch: !!fallbackKey }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            cache.put(fallbackKey || request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Sayfa gezinmeleri: her zaman cache'lenmiş kabuğu hemen ver, arka planda güncelle.
  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, request, "/index.html"));
    return;
  }

  // Aynı origin statik dosyalar: cache öncelikli, arka planda güncelle.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, request));
    return;
  }

  // Google Fonts (CSS + font dosyaları): ilk çevrimiçi ziyaretten sonra çevrimdışı çalışır.
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, request));
    return;
  }

  // Diğer her şey (ör. Google Analytics): varsayılan ağ; çevrimdışıyken sessizce başarısız olur.
});
