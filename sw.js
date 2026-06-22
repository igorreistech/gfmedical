const CACHE = 'monitor-cgr-v17';
const BASE = new URL('./', self.location).pathname;
const LOCAL_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'manifest.json',
  BASE + 'icon.svg',
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

  // Ignora esquemas que o Cache API não suporta (ex.: extensões do Chrome
  // injetando requisições chrome-extension://) — deixa o navegador tratar.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, {cache:'reload'}).catch(() => caches.match(BASE))
    );
    return;
  }

  const isLocal = !url.hostname.includes('googleapis') &&
                  !url.hostname.includes('cdnjs') &&
                  !url.hostname.includes('supabase.co') &&
                  !url.hostname.includes('esm.sh');
  if (isLocal && url.pathname.startsWith(BASE)) {
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
