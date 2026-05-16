// Priorities service worker (M20). Deliberately minimal: precache the
// app icon + an offline fallback, and serve a cached shell for failed
// navigations. It does NOT cache API/data responses — offline writes are
// an explicit v1 non-goal, and stale cached data would be worse than an
// honest offline message.
const CACHE = 'priorities-v1';
const PRECACHE = ['/icon.svg', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept API/auth/data — always go to network.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first, fall back to the cached offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/offline').then((r) => r ?? new Response('Offline', { status: 503 })),
      ),
    );
    return;
  }

  // Static assets (Next build output, icon): cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg'
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
  }
});
