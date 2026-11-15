/* ManiPOS service worker — offline shell & Android push alerts for POS terminals. */
const VERSION = 'manipos-v10';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// The worker is deployed at the root of production and under /staging/ for
// staging. registration.scope is therefore '/' or '/staging/' respectively,
// which keeps each environment's cache and offline shell separate.
const BASE = self.registration.scope;
const BASE_PATHNAME = new URL(BASE).pathname;
const OFFLINE_URL = `${BASE}offline.html`;
const ASSET_PREFIX = `${BASE_PATHNAME.endsWith('/') ? BASE_PATHNAME : `${BASE_PATHNAME}/`}assets/`;
const MAX_ASSET_CACHE_ENTRIES = 80;

const SHELL_ASSETS = [
  OFFLINE_URL,
  `${BASE}manifest.webmanifest`,
  `${BASE}favicon.png`,
  `${BASE}favicon.ico`,
  `${BASE}manipos_logo.png`,
  `${BASE}manipos_african_hero.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase, payment or third-party API traffic.
  if (url.origin !== self.location.origin) return;

  // Navigations: always bypass HTTP cache when online so updated HTML and
  // hashed chunk references take effect immediately after a deploy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL) || caches.match('/');
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate with bounded cache size.
  if (url.pathname.startsWith(ASSET_PREFIX) || /\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then(async (res) => {
            if (res && res.ok) {
              await cache.put(request, res.clone());
              const keys = await cache.keys();
              if (keys.length > MAX_ASSET_CACHE_ENTRIES) {
                const excess = keys.slice(0, keys.length - MAX_ASSET_CACHE_ENTRIES);
                await Promise.all(excess.map((oldReq) => cache.delete(oldReq)));
              }
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'SHOW_ORDER_NOTIFICATION' && event.data.title) {
    event.waitUntil(
      self.registration.showNotification(event.data.title, event.data.options || {})
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || BASE;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
