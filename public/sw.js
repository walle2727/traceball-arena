const CACHE_NAME = 'traceball-arena-v28';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/history.js',
  '/icon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/ws') || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response.ok || response.type !== 'basic') return response;
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
