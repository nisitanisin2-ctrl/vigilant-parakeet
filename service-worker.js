// 版を上げたら、ここも js/version.js の APP_VERSION と同じにする（テストでたしかめている）
const CACHE = 'saien-note-v10';
const CACHE_PREFIX = 'saien-note-';
// 以前ここにあった「写真メモ」アプリの古いキャッシュも片付ける
const OLD_PREFIXES = ['photomemo-'];
const ASSETS = ['./', './index.html', './css/style.css', './js/version.js', './js/veg-data.js', './js/util.js', './js/plan.js', './js/grow.js', './js/sick.js', './js/weather.js', './js/store.js', './js/app.js', './manifest.json', './icon-192.png', './icon-512.png'];
// v6 までの画面には「いま更新」のボタンがない（新しい版が来ると勝手に読み込み直す作り）。
// その版から来たときだけは待たずに入れ替わる。次からは「いま更新」で入れ替わる
const NO_ASK = k => /^saien-note-v[1-6]$/.test(k) || OLD_PREFIXES.some(p => k.startsWith(p));

// 新しい版が用意できても、すぐには入れ替わらない（入力の途中で画面が変わらないように）。
// 画面の「いま更新」を押したときだけ SKIP_WAITING が届いて入れ替わる（表電卓と同じ）。
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => caches.keys()).then(keys => { if (keys.some(NO_ASK)) return self.skipWaiting(); }));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && (k.startsWith(CACHE_PREFIX) || OLD_PREFIXES.some(p => k.startsWith(p))))
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// GitHub Pages はブラウザに10分ほど控えを持たせるので、自分のサイトの分は毎回サーバーにたしかめて取る
function netFetch(req) {
  if (new URL(req.url).origin === self.location.origin) return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  return fetch(req);
}
// ネットワーク優先：オンライン時は最新版を取得、オフライン時だけキャッシュから返す
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;   // 天気予報など、ほかのサイトはそのまま（とっておかない）
  e.respondWith(
    netFetch(e.request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then(cached => cached ||
      (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
