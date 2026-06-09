const CACHE = 'monitor-cgr-v7';
const LOCAL_ASSETS = [
  '/gfcampogrande/',
  '/gfcampogrande/index.html',
  '/gfcampogrande/styles.css',
  '/gfcampogrande/app.js',
  '/gfcampogrande/manifest.json',
  '/gfcampogrande/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/gfcampogrande/'))
    );
    return;
  }

  const isLocal = !url.hostname.includes('googleapis') &&
                  !url.hostname.includes('gstatic') &&
                  !url.hostname.includes('firebaseapp') &&
                  !url.hostname.includes('cdnjs');
  if (isLocal && url.pathname.startsWith('/gfcampogrande/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
