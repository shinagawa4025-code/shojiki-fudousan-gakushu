// Service Worker: オフライン閲覧対応(同一オリジンのみプリキャッシュ+ネットワークフォールバック)
const CACHE_NAME = `shojiki-gakushu-v4`;

const PRECACHE_URLS = [
  `./`,
  `./index.html`,
  `./manifest.json`,
  `./css/style.css`,
  `./data/episodes.js`,
  `./data/specials.js`,
  `./data/terms.js`,
  `./data/basics.js`,
  `./data/topics.js`,
  `./data/laws.js`,
  `./data/quiz.js`,
  `./data/sources.js`,
  `./js/storage.js`,
  `./js/ui.js`,
  `./js/dataIndex.js`,
  `./js/search.js`,
  `./js/router.js`,
  `./js/theme.js`,
  `./js/tts.js`,
  `./js/srs.js`,
  `./js/streak.js`,
  `./js/recommend.js`,
  `./js/cardUi.js`,
  `./js/app.js`,
  `./js/views/topics.js`,
  `./js/views/glossary.js`,
  `./js/views/review.js`,
  `./js/views/summary.js`,
  `./js/views/quiz.js`,
  `./js/views/calculators.js`,
  `./js/views/sources.js`,
  `./js/views/settings.js`,
  `./icons/icon-192.png`,
  `./icons/icon-512.png`,
  `./icons/apple-touch-icon.png`,
];

self.addEventListener(`install`, (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((url) => fetch(url, { cache: `reload` }).then((res) => cache.put(url, res)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener(`activate`, (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener(`fetch`, (event) => {
  const req = event.request;
  if (req.method !== `GET`) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
