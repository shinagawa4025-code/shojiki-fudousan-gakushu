// Service Worker: オフラインで使えるように、アプリ本体を端末に保存(プリキャッシュ)して、そこから返す
//
// 公開時は GitHub Actions(tools/build.js)が、このファイルを元に次の3つを自動で書き換えた sw.js を作る:
//   CACHE_NAME(内容のハッシュ)・BUILD_ID(index.html と組で確かめる目印)・PRECACHE_URLS(まとめたファイルの一覧。
//   ホームを描いたあとに読み込む「詳細」の束 assets/detail.*.js・assets/detail.*.css と、CSS が使う見出し用の書体 fonts/*.woff2 も入れる。
//   js/appData.js)
// 下の一覧は、ビルドに失敗して元のファイルのまま公開するとき(とローカルでの確認)に使う。
// ファイルを追加・削除したら、この一覧も直す(node tools/check.js webapp が index.html との食い違いを知らせる)。
//
// 方針(A4 S4):
// - 保存済みのファイルは保存済みのものだけを返す(裏での取り直しはしない)。更新は新しい sw.js が来たときにまとめて行う
// - インストールは全部そろったときだけ成功させる(途中まで作ったキャッシュは残さない。古い版のまま動き続ける)
// - 消すのは自分の接頭辞(shojiki-gakushu-)のキャッシュだけ(同じ github.io の別のアプリのキャッシュは消さない)
// - ローカル開発(localhost・127.0.0.1 で、ビルドしていないこのファイルのまま)では、編集がすぐ反映されるようネットワーク優先
const CACHE_PREFIX = `shojiki-gakushu-`;
const CACHE_NAME = `shojiki-gakushu-v10`;
const BUILD_ID = ``;

const PRECACHE_URLS = [
  `./index.html`,
  `./manifest.json`,
  `./css/style.css`,
  `./css/shell.css`,
  `./css/calculators.css`,
  `./css/exam.css`,
  `./css/features.css`,
  `./css/ox.css`,
  `./css/practice.css`,
  `./css/home.css`,
  `./css/learning.css`,
  `./css/motion.css`,
  `./fonts/fudomana-rounded-800-base.woff2`,
  `./fonts/fudomana-rounded-800-kanji-core.woff2`,
  `./fonts/fudomana-rounded-800-kanji.woff2`,
  `./js/siteConfig.js`,
  `./data/episodes.js`,
  `./data/specials.js`,
  `./data/terms.js`,
  `./data/basics.js`,
  `./data/topics.js`,
  `./data/laws.js`,
  `./data/quiz.js`,
  `./data/sources.js`,
  `./data/exams.js`,
  `./data/changelog.js`,
  `./data/contentPack.js`,
  `./data/content/kenri.js`,
  `./data/content/horei.js`,
  `./data/content/zei.js`,
  `./data/content/menjo.js`,
  `./data/content/shohizei.js`,
  `./data/content/quizmc_a.js`,
  `./data/content/quizmc_b.js`,
  `./data/content/q2_gyoho_a.js`,
  `./data/content/q2_gyoho_b.js`,
  `./data/content/q2_kenri.js`,
  `./data/content/q2_horei.js`,
  `./data/content/q2_zei_menjo.js`,
  `./data/content/q2_life.js`,
  `./data/content/q3_shohizei.js`,
  `./data/content/q4_gyoho_a.js`,
  `./data/content/q4_gyoho_b.js`,
  `./data/content/q4_kenri.js`,
  `./data/content/q4_horei.js`,
  `./data/content/q4_zei_menjo.js`,
  `./data/content/q4_shohizei.js`,
  `./data/content/q5_shohi_a.js`,
  `./data/content/q5_shohi_b.js`,
  `./data/content/q5_shohi_c.js`,
  `./data/content/q5_styled_a.js`,
  `./data/content/q5_styled_b.js`,
  `./data/content/q2_fix.js`,
  `./js/appData.js`,
  `./js/storage.js`,
  `./js/dates.js`,
  `./js/icons.js`,
  `./js/mascot.js`,
  `./js/motion.js`,
  `./js/ui.js`,
  `./js/errorScreen.js`,
  `./js/report.js`,
  `./js/dataIndex.js`,
  `./js/search.js`,
  `./js/router.js`,
  `./js/nav.js`,
  `./js/theme.js`,
  `./js/tts.js`,
  `./js/srs.js`,
  `./js/drill.js`,
  `./js/streak.js`,
  `./js/stats.js`,
  `./js/recommend.js`,
  `./js/analysis.js`,
  `./js/answerLog.js`,
  `./js/studyTime.js`,
  `./js/goals.js`,
  `./js/badges.js`,
  `./js/predict.js`,
  `./js/plan.js`,
  `./js/bookmarkStore.js`,
  `./js/quizEngine.js`,
  `./js/diagrams.js`,
  `./js/cardUi.js`,
  `./js/askAi.js`,
  `./js/onboarding.js`,
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
  `./js/views/plan.js`,
  `./js/views/works.js`,
  `./js/views/calculators.js`,
  `./js/views/sources.js`,
  `./js/views/about.js`,
  `./js/views/settings.js`,
  `./js/views/more.js`,
  `./js/app.js`,
  `./icons/logo.svg`,
  `./icons/icon-192.png`,
  `./icons/apple-touch-icon.png`,
];

// ファイル名に内容のハッシュが入ったもの(assets/app.0123456789.js など)は中身が変わらないので、ブラウザのキャッシュを使ってよい
const HASHED = /\/assets\/[^/]+\.[0-9a-f]{10}\.(?:js|css)$/;
const DEV = !BUILD_ID && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);

self.addEventListener(`install`, (event) => {
  event.waitUntil((async () => {
    // no-cache = ブラウザのキャッシュを使う前にサーバーへ確認する(変わっていなければ 304 で中身は送られない)
    const get = async (url) => {
      const res = await fetch(url, { cache: HASHED.test(new URL(url, self.location).pathname) ? `default` : `no-cache` });
      if (!res.ok) throw new Error(`precache failed: ${url} (${res.status})`);
      return [url, res];
    };
    // 1) 先に index.html を取り、この sw.js と同じビルドのものか確かめる
    //    (配信の切り替わり途中で古い index.html を掴んだときは、大きなファイルを取る前にやめて次の起動でやり直す)
    const shell = await get(`./index.html`);
    if (BUILD_ID && !(await shell[1].clone().text()).includes(BUILD_ID)) throw new Error(`index.html does not match build ${BUILD_ID}`);
    // 2) 残りを全部取得してから保存する(1件でも失敗したら何も保存しない)
    const responses = [shell, ...(await Promise.all(PRECACHE_URLS.filter((url) => url !== `./index.html`).map(get)))];
    // 3) 保存。途中で失敗したら作りかけのキャッシュを消す(端末に取り残されないように)
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all(responses.map(([url, res]) => cache.put(url, res)));
    } catch (err) {
      await caches.delete(CACHE_NAME);
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener(`activate`, (event) => {
  event.waitUntil(
    caches.keys()
      // 自分の古い版だけを消す(同じ github.io の別アプリのキャッシュは消さない)
      .then((names) => Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener(`fetch`, (event) => {
  const req = event.request;
  if (req.method !== `GET`) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  // アプリの入口(/ と /index.html。?utm=… などが付いていても)を開くときは、保存済みの index.html
  const isShell = req.mode === `navigate` && (url.pathname === scope || url.pathname === `${scope}index.html`);
  event.respondWith((async () => {
    if (DEV) {
      // ローカル開発: ネットワーク優先(つながらないときだけ保存済みのもの)
      try { return await fetch(req); } catch (err) {
        const hit = await caches.match(isShell ? `./index.html` : req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    }
    const cache = await caches.open(CACHE_NAME);
    if (isShell) {
      const shell = await cache.match(`./index.html`);
      if (shell) return shell;
    }
    // 保存済みのファイルは保存済みのものだけを返す(裏での取り直しはしない)
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      // オフラインで、アプリの中の別のページを開いたとき
      if (req.mode === `navigate`) {
        // 入れ子の URL(learn/… の静的ページなど)で index.html を返すと、相対パスのファイル(assets/…・icons/…)を読めないので、
        // アプリの入口へ移す(入口は保存済みの index.html で開く)
        if (url.pathname.slice(scope.length).includes(`/`)) return Response.redirect(self.registration.scope, 302);
        const shell = await cache.match(`./index.html`);
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
