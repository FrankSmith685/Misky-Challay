const CACHE = 'misky-challay-shell-v3';
const SHELL = ['/', '/brand/misky-app-icon.jpg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Los estilos y modulos de Vite cambian sin cambiar de URL. Con cache-first,
  // el navegador seguia mostrando un tema anterior aunque el servidor ya enviaba
  // los nuevos archivos. Usar la red primero conserva el respaldo offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error()),
  );
});

const show = (payload = {}) => self.registration.showNotification(payload.title || 'Misky Challay', {
  body: payload.body || 'Hay una novedad en la operación.',
  icon: '/brand/misky-app-icon.jpg',
  badge: '/brand/misky-app-icon.jpg',
  tag: payload.tag || 'misky-challay-operation',
  renotify: true,
  requireInteraction: payload.requireInteraction !== false,
  data: { url: payload.url || '/admin/cocina?kds=1' },
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') event.waitUntil(show(event.data.payload));
});

// Preparado para Web Push del servidor: el KDS no necesita otro service worker
// cuando se configure un proveedor VAPID en produccion.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() }; }
  event.waitUntil(show(payload));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin/cocina?kds=1';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).pathname === '/admin/cocina');
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});

