const CACHE = 'photomemo-v31';
const CACHE_PREFIX = 'photomemo-';   // このアプリのキャッシュだけを見分けるための名前
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // 自分の古いキャッシュだけを消す。キャッシュは「サイト（オリジン）ごと」に
      // 共通なので、名前で絞らないと同じサイトにある別のアプリの分まで消してしまう。
      Promise.all(keys.filter(k => k !== CACHE && k.startsWith(CACHE_PREFIX)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ネットワーク優先：オンライン時は常に最新版を取得してキャッシュも更新する。
// オフライン時のみキャッシュから返す（更新が確実に反映されるようにするため）。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || caches.match('./index.html'))
    )
  );
});
