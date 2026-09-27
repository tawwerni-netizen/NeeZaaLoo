const CACHE_NAME = 'nizalo-pwa-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Simple network-first strategy for a gaming app
  // since realtime connections (ws) shouldn't be cached anyway.
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/v1/')) return; // Ignore API

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
