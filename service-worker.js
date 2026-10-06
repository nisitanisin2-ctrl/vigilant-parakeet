const CACHE = 'saien-note-v4';
const CACHE_PREFIX = 'saien-note-';
// 以前ここにあった「写真メモ」アプリの古いキャッシュも片付ける
const OLD_PREFIXES = ['photomemo-'];
const ASSETS = ['./', './index.html', './css/style.css', './js/veg-data.js', './js/util.js', './js/plan.js', './js/store.js', './js/app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && (k.startsWith(CACHE_PREFIX) || OLD_PREFIXES.some(p => k.startsWith(p))))
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ネットワーク優先：オンライン時は最新版を取得、オフライン時だけキャッシュから返す
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});
