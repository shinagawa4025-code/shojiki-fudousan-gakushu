// Service Worker: オフライン閲覧対応(同一オリジンのみプリキャッシュ+ネットワークフォールバック)
// ファイルを追加したら PRECACHE_URLS に追記し、デプロイ毎に CACHE_NAME を上げること
// (1件でも存在しないURLがあるとインストールが失敗し、古いキャッシュのままになる)
const CACHE_NAME = `shojiki-gakushu-v8`;

const PRECACHE_URLS = [
  `./`,
  `./index.html`,
  `./manifest.json`,
  `./css/style.css`,
  `./css/calculators.css`,
  `./css/exam.css`,
  `./css/features.css`,
  `./css/ox.css`,
  `./data/episodes.js`,
  `./data/specials.js`,
  `./data/terms.js`,
  `./data/basics.js`,
  `./data/topics.js`,
  `./data/laws.js`,
  `./data/quiz.js`,
  `./data/sources.js`,
  `./data/exams.js`,
  `./data/contentPack.js`,
  `./data/content/kenri.js`,
  `./data/content/horei.js`,
  `./data/content/zei.js`,
  `./data/content/menjo.js`,
  `./data/content/shohizei.js`,
  `./data/content/quizmc_a.js`,
  `./data/content/quizmc_b.js`,
  `./js/storage.js`,
  `./js/dates.js`,
  `./js/icons.js`,
  `./js/ui.js`,
  `./js/dataIndex.js`,
  `./js/search.js`,
  `./js/router.js`,
  `./js/nav.js`,
  `./js/theme.js`,
  `./js/tts.js`,
  `./js/srs.js`,
  `./js/streak.js`,
  `./js/stats.js`,
  `./js/recommend.js`,
  `./js/analysis.js`,
  `./js/bookmarkStore.js`,
  `./js/quizEngine.js`,
  `./js/diagrams.js`,
  `./js/cardUi.js`,
  `./js/onboarding.js`,
  `./js/app.js`,
  `./js/views/home.js`,
  `./js/views/topics.js`,
  `./js/views/glossary.js`,
  `./js/views/bookmarks.js`,
  `./js/views/figures.js`,
  `./js/views/review.js`,
  `./js/views/quiz.js`,
  `./js/views/exam.js`,
  `./js/views/ox.js`,
  `./js/views/progress.js`,
  `./js/views/summary.js`,
  `./js/views/calculators.js`,
  `./js/views/sources.js`,
  `./js/views/settings.js`,
  `./js/views/more.js`,
  `./icons/logo.svg`,
  `./icons/icon-192.png`,
  `./icons/icon-512.png`,
  `./icons/icon-maskable-512.png`,
  `./icons/apple-touch-icon.png`,
];

self.addEventListener(`install`, (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((url) => fetch(url, { cache: `reload` }).then((res) => {
          if (!res.ok) throw new Error(`precache failed: ${url} (${res.status})`);
          return cache.put(url, res);
        }))
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
    caches.match(req, { ignoreSearch: true }).then((cached) => {
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
