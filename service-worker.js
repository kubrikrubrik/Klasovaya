// service-worker.js — работа без интернета. Кэширует только файлы приложения;
// данные пользователя живут в IndexedDB и при обновлении версии не затрагиваются.
const VERSION = 'kazna-1.0.0-b20261125';
const CORE = ['./', './index.html', './styles.css', './art.css', './app.js', './database.js', './ui.js', './icons.js', './art.js', './bosses.js',
  './scenes.js', './animations.js', './finance.js', './analytics.js', './boyars.js', './game.js', './home.js', './pantry.js', './importer.js',
  './settings.js', './products.json', './manifest.json', './lora.woff', './lora-italic.woff', './texture-paper.jpg', './texture-wood.jpg',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kazna-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { // страница: сначала сеть (чтобы видеть обновления), без сети — из кэша
    event.respondWith(fetch(req).catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('./index.html') || caches.match('./')));
    return;
  }
  if (url.pathname.endsWith('/kladovaya_product_catalog.json')) { // необязательный пользовательский каталог
    event.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(async () => (await caches.match(req)) || new Response('{}', { status: 404 })));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
    return r;
  })));
});
