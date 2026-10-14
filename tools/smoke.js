// 公開用ビルドの動作確認(依存パッケージなし。Chrome/Edge をヘッドレスで起動し、DevTools プロトコルを Node 標準の WebSocket で操作)
// 使い方: node tools/smoke.js <サイトのフォルダ> [--raw <webapp>] [--require-browser] [--browser <実行ファイル>] [--port <番号>]
//   GitHub Pages と同じ形(/shojiki-fudousan-gakushu/ の下・gzip・max-age=600・ETag)で配信して、次を確かめる:
//   1. 初回訪問: 画面が出る(初回ガイドを含む)・ページのエラーがない
//   2. 主な画面をすべて開く: どれもエラー画面にならず .view が出る・console.error / 例外がない・window.__bundleErrors が空
//   3. 問題数・○×の文の数などが元のファイル(--raw)を Node で読み込んだ値と同じ
//   4. Service Worker が15秒以内に有効になり、キャッシュは CACHE_NAME の1つだけで、PRECACHE_URLS がすべて入っている
//   5. 2回目の起動のネットワーク要求の数
//   6. サーバーを止めて(オフライン)開き直しても画面が出る
//   7. 検索エンジン向けの静的ページ(tools/static_pages.js が作る learn/ と sitemap.xml)があれば:
//      件数・sitemap の URL とファイルの対応・載せてはいけない語(Node で)、ページが開けて CSS と図解が出る・
//      Service Worker のキャッシュに入らない・アプリへのリンクで起動する(ブラウザで)。
//      静的ページがないときは、--require-static なら失敗、なければ確認を省く
//   8. 直リンク(最初からホーム以外の画面を開く): 4択の1問・用語・トピックの基礎知識・模擬試験の結果・間違えた○× が出る。
//      検索。ブラウザの中の APP_DATA と○×の文が元のファイル(--raw)を Node で読んだものとまったく同じ(ハッシュ)
//   9. 公開版(ビルドしたもの)だけ: 詳細の束(assets/detail.*.js)が遅いとき、ホームは詳細を待たずに出る・検索は届いた分で動く・
//      ほかの画面は「読み込み中」のあと届いたら出る・再読み込みで保存したスクロール位置に戻る
//   6 のオフラインでは、直リンクと、公開版では入れ子の URL(learn/)がアプリの入口へ移ることも確かめる
//   ブラウザが見つからないときは、--require-browser なら失敗、なければ確認を省いて成功で終わる
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { readPrecacheList } = require('./lib/html.js');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SITE = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : '_site');
const RAW = opt('--raw');
const REQUIRE = args.includes('--require-browser');
const REQUIRE_STATIC = args.includes('--require-static');
const BASE_PATH = '/shojiki-fudousan-gakushu/';
const GH = !!process.env.GITHUB_ACTIONS;
const ROUTES = ['home', 'topics', 'topics/topicL', 'glossary', 'bookmarks', 'figures', 'calculators', 'review', 'quiz', 'ox', 'exam', 'progress', 'works', 'summary', 'sources', 'about', 'about/privacy', 'settings', 'more'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (m) => { failures.push(m); console.log(GH ? `::error::smoke: ${m}` : `FAIL ${m}`); };
const ok = (m) => console.log(`ok   ${m}`);

// ---- GitHub Pages に似せた静的サーバー ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json' };
function startServer(root, port) {
  const log = [];
  const sockets = new Set();
  // slow: { re, ms } に合う URL は ms だけ遅らせて返す(遅い通信の確認用)
  const ctl = { slow: null };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    log.push(url);
    if (ctl.slow && ctl.slow.re.test(url)) { const ms = ctl.slow.ms; setTimeout(() => respond(req, res, url), ms); return; }
    respond(req, res, url);
  });
  function respond(req, res, url) {
    if (!url.startsWith(BASE_PATH)) { res.writeHead(404); res.end(); return; }
    let rel = url.slice(BASE_PATH.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    let status = 200;
    let buf;
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      status = 404;
      buf = fs.existsSync(path.join(root, '404.html')) ? fs.readFileSync(path.join(root, '404.html')) : Buffer.from('not found');
    } else buf = fs.readFileSync(file);
    const etag = `W/"${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}"`;
    const headers = { 'content-type': TYPES[path.extname(status === 404 ? '.html' : file)] || 'application/octet-stream', 'cache-control': 'max-age=600', etag, vary: 'Accept-Encoding' };
    if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    if (/gzip/.test(req.headers['accept-encoding'] || '') && !/\.png$/.test(file)) { headers['content-encoding'] = 'gzip'; buf = zlib.gzipSync(buf, { level: 6 }); }
    headers['content-length'] = buf.length;
    res.writeHead(status, headers);
    res.end(buf);
  }
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => server.listen(port || 0, '127.0.0.1', () => resolve({
    port: server.address().port,
    log,
    ctl,
    stop: () => new Promise((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); }),
  })));
}

// ---- ブラウザと DevTools プロトコル ----
function findBrowser() {
  // Linux は GitHub のランナー(ubuntu-24.04・26.04 とも Chrome・Chromium・Edge 入り)の置き場所を順に探す
  const c = [opt('--browser'), process.env.CHROME_PATH, process.env.CHROME_BIN,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find((p) => p && fs.existsSync(p)) || null;
}

async function launch(exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--window-size=390,844'];
  if (process.platform === 'linux') flags.push('--no-sandbox', '--disable-dev-shm-usage');
  const proc = spawn(exe, [...flags, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) { proc.kill(); throw new Error('ブラウザが起動しませんでした(DevToolsActivePort がない)'); }
  let lines = [];
  for (let i = 0; i < 50; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split('\n'); if (lines.length >= 2) break; await sleep(100); }
  const cdp = await CDP.connect(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  return { cdp, close: async () => { try { await cdp.send('Browser.close'); } catch (e) { /* 終了済み */ } await sleep(500); try { proc.kill(); } catch (e) { /* 終了済み */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 使用中 */ } } };
}

class CDP {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const c = new CDP(ws);
      ws.addEventListener('open', () => resolve(c));
      ws.addEventListener('error', (e) => reject(new Error(`WebSocket: ${e.message || 'error'}`)));
    });
  }
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`)); else p.resolve(msg.result);
      } else if (msg.method) {
        this.handlers.forEach((h) => { if (h.method === msg.method && (!h.sessionId || h.sessionId === msg.sessionId)) h.fn(msg.params); });
      }
    });
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`${method}: timeout`)); } }, 60000);
    });
  }
  on(method, sessionId, fn) { this.handlers.push({ method, sessionId, fn }); }
}

async function openPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = { targetId, sessionId, errors: [], warnings: [], loads: 0 };
  const s = (m, p) => cdp.send(m, p, sessionId);
  page.send = s;
  cdp.on('Runtime.exceptionThrown', sessionId, (p) => { const d = p.exceptionDetails; page.errors.push(`exception: ${(d.exception && d.exception.description) || d.text}`.split('\n')[0]); });
  cdp.on('Runtime.consoleAPICalled', sessionId, (p) => {
    const text = p.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || '')).join(' ');
    if (p.type === 'error') page.errors.push(`console.error: ${text}`.split('\n')[0]);
    if (p.type === 'warning') page.warnings.push(text.split('\n')[0]);
  });
  cdp.on('Log.entryAdded', sessionId, (p) => { if (p.entry.level === 'error') page.errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`.trim()); });
  cdp.on('Page.loadEventFired', sessionId, () => { page.loads++; });
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Log.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  page.eval = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`evaluate: ${(r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text}`);
    return r.result.value;
  };
  page.goto = async (url) => {
    const before = page.loads;
    await s('Page.navigate', { url });
    for (let i = 0; i < 300 && page.loads === before; i++) await sleep(100);
    if (page.loads === before) throw new Error(`読み込みが終わりません: ${url}`);
  };
  page.waitFor = async (expression, ms) => {
    const end = Date.now() + (ms || 10000);
    while (Date.now() < end) { try { if (await page.eval(expression)) return true; } catch (e) { /* 読み込み中 */ } await sleep(100); }
    return false;
  };
  page.close = () => cdp.send('Target.closeTarget', { targetId });
  return page;
}

function expected() {
  if (!RAW) return null;
  const { loadApp, summarize } = require('./lib/appload.js');
  return summarize(loadApp(path.resolve(RAW), { hostname: 'localhost' }).ctx);
}

// 7. 静的ページ(Node で確かめる部分)。戻り値: ブラウザで開くページ { index, figure } / 静的ページがなければ null
function checkStaticFiles() {
  const learn = path.join(SITE, 'learn');
  if (!fs.existsSync(path.join(learn, 'index.html'))) {
    if (REQUIRE_STATIC) fail('静的ページ learn/index.html がありません(tools/static_pages.js を実行していない)');
    else console.log('SKIP 静的ページ(learn/)がありません');
    return null;
  }
  const list = (dir) => (fs.existsSync(path.join(learn, dir)) ? fs.readdirSync(path.join(learn, dir)).filter((f) => f.endsWith('.html')) : []);
  const topics = list('').filter((f) => f !== 'index.html');
  const terms = list('term');
  const figures = list('figure');
  const htmlCount = 1 + topics.length + terms.length + figures.length;
  // アプリ名(ページの title の末尾)は元のファイルの SITE.name、なければ index.html の og:site_name から読む(名前を決め打ちしない)
  let siteName = (fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(/<meta property="og:site_name" content="([^"]+)">/) || [])[1] || null;
  if (RAW) {
    const { loadApp } = require('./lib/appload.js');
    const { ctx } = loadApp(path.resolve(RAW), { hostname: 'localhost' });
    if (ctx.SITE && ctx.SITE.name) siteName = String(ctx.SITE.name);
    const wantTerms = ctx.AppIndex.allTerms.filter((t) => t.worksOnly !== true).length;
    if (topics.length !== ctx.APP_DATA.topics.length) fail(`静的ページのトピックが ${topics.length}件(元のファイル ${ctx.APP_DATA.topics.length}件)`);
    if (terms.length !== wantTerms) fail(`静的ページの用語・基礎知識が ${terms.length}件(元のファイル ${wantTerms}件)`);
  }
  if (!figures.length) fail('静的ページの図解がありません');
  if (!siteName) fail('アプリ名が分かりません(--raw の SITE.name も index.html の og:site_name もない)');
  const smPath = path.join(SITE, 'sitemap.xml');
  if (!fs.existsSync(smPath)) { fail('sitemap.xml がありません'); return null; }
  const sm = fs.readFileSync(smPath, 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const root = locs[0] || '';
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/.test(sm)) fail('sitemap.xml の形が想定外です');
  if (!/^https:\/\/[^/]+\/.*\/$/.test(root)) fail(`sitemap.xml の最初の URL がアプリの入口ではありません: ${root}`);
  if (locs.length !== htmlCount + 1) fail(`sitemap.xml の URL が ${locs.length}件(静的ページ ${htmlCount}件+入口1件のはず)`);
  const missing = locs.filter((u) => {
    if (!u.startsWith(root)) return true;
    const rel = u.slice(root.length);
    return !fs.existsSync(path.join(SITE, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel));
  });
  if (missing.length) fail(`sitemap.xml の URL にファイルがない・サイトの外: ${missing.slice(0, 5).join(', ')}`);
  const banned = ['learn/index.html', 'learn/learn.css', ...topics.map((f) => `learn/${f}`), ...terms.map((f) => `learn/term/${f}`), ...figures.map((f) => `learn/figure/${f}`), 'sitemap.xml']
    .filter((f) => fs.existsSync(path.join(SITE, f)) && fs.readFileSync(path.join(SITE, f), 'utf8').includes('正直不動産'));
  if (banned.length) fail(`静的ページに作品名があります: ${banned.slice(0, 5).join(', ')}`);
  if (!/<a href="learn\/">/.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'))) fail('index.html に静的ページ(learn/)へのリンクがありません');
  ok(`静的ページ ${htmlCount}件(トピック ${topics.length}・用語と基礎知識 ${terms.length}・図解 ${figures.length})・sitemap.xml ${locs.length}件`);
  // 図解のある用語のページ(図解のページへのリンクを持つもの)
  const withFig = terms.find((f) => fs.readFileSync(path.join(learn, 'term', f), 'utf8').includes('href="../figure/'));
  return { term: withFig ? `learn/term/${withFig}` : null, figure: `learn/figure/${figures[0]}`, siteName: siteName || '' };
}

// 公開版の詳細(js/appData.js)がそろったか。元のファイルのままなら常に true
const DETAIL_READY = `(!window.AppData || AppData.hasDetail())`;
const HASH_JS = `(async (v) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(v))); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16); })`;

// 読み込みを待たずに移動する(公開版の詳細の束は load を遅らせることがあるため)
async function navigateNoWait(page, url) {
  await page.send('Page.navigate', { url });
}

// 8. 直リンク(最初からホーム以外の画面を開く)・検索・データのハッシュ。戻り値: オフラインの確認に使う ID
async function checkDeepLinks(browser, base, exp) {
  let page = await openPage(browser.cdp);
  await page.goto(`${base}index.html#home`);
  if (!(await page.waitFor(`window.__appBooted === true && ${DETAIL_READY}`, 30000))) { fail('直リンクの準備: 詳細がそろいません'); await page.close(); return null; }
  // ブラウザの中の APP_DATA・○×の文が、元のファイルを Node で読んだものとまったく同じ(公開版は本体+詳細)
  if (exp) {
    const hp = await page.eval(`(async () => ({ data: await ${HASH_JS}(APP_DATA), statements: await ${HASH_JS}(QuizEngine.allStatements()) }))()`);
    if (hp.data !== exp.dataHash || hp.statements !== exp.statementsHash) fail(`ブラウザの中のデータが元のファイルと違います: data ${hp.data} / ${exp.dataHash}・statements ${hp.statements} / ${exp.statementsHash}`);
    else ok(`ブラウザの中の APP_DATA と○×の文が元のファイルと同じ(${hp.data} / ${hp.statements})`);
  }
  const search = await page.eval(`['クーリング', '敷金', '35条'].map((q) => GlobalSearch.search(q, 8).length)`);
  if (search.some((n) => !n)) fail(`検索の結果がありません: ${JSON.stringify(search)}`); else ok(`検索(クーリング ${search[0]}件・敷金 ${search[1]}件・35条 ${search[2]}件)`);
  // ID を選び、間違えた○×と模擬試験の結果の記録を作る
  const ids = await page.eval(`(() => {
    const P = 'shojikiLearn.v1.';
    const q = APP_DATA.quiz.find((x) => QuizEngine.isMcItem(x) && x.ask);
    const term = AppIndex.allTerms.find((t) => t.source !== 'general' && t.worksOnly !== true);
    const topic = AppIndex.topicsById.topicL || APP_DATA.topics[0];
    const order = AppIndex.topicBasicOrder[topic.id] || topic.basicIds;
    const basic = order[Math.min(3, order.length - 1)];
    const st = QuizEngine.allStatements().filter((s) => s.quizId === q.id);
    const ox = {};
    st.forEach((s) => { ox[s.id] = { c: 0, w: 2, last: DateUtil.today(), lastOk: false }; });
    localStorage.setItem(P + 'oxStats', JSON.stringify(ox));
    let examId = null;
    const E = window.Views && Views.exam && Views.exam._internal;
    if (E && E.createSession && E.gradeSession) {
      const s = E.createSession('short', true);
      s.answers = s.questions.map((x, i) => (i % 3 ? x.correctIndex : (x.correctIndex + 1) % x.choices.length));
      const entry = E.gradeSession(s, s.startedAt + 600000);
      localStorage.setItem(P + 'examHistory', JSON.stringify([entry]));
      examId = entry.id;
    }
    return { quiz: q.id, term: term.id, topic: topic.id, basic, examId, stmtTexts: st.map((s) => String(s.text).slice(0, 20)) };
  })()`);
  await page.close();
  const sel = (s) => JSON.stringify(s);
  const links = [
    [`quiz/q/${ids.quiz}`, 'quiz', `!!document.querySelector('.quiz-view [data-quiz-id=' + ${sel(sel(ids.quiz))} + ']')`],
    [`glossary/${ids.term}`, 'glossary', `!!document.querySelector('.glossary-view [data-term-id=' + ${sel(sel(ids.term))} + ']')`],
    [`topics/${ids.topic}/${ids.basic}`, 'topics', `!!document.querySelector('.topic-detail-view li[data-id=' + ${sel(sel(ids.basic))} + '] details[open]')`],
    // 間違えた文の○×はすぐ出題を始める(#ox/run)。記録した4つの文のどれかが出る
    [`ox/weak`, 'ox', `!!document.querySelector('.ox-view') && ${sel(ids.stmtTexts)}.some((t) => document.querySelector('.ox-view').textContent.includes(t))`],
  ];
  if (ids.examId) links.push([`exam/result/${ids.examId}`, 'exam', `!!document.querySelector('.exam-view.exam-result')`]);
  else console.log('info 模擬試験の結果の直リンク: Views.exam._internal がないため省略');
  const shown = [];
  for (const [hash, view, expr] of links) {
    page = await openPage(browser.cdp);
    await navigateNoWait(page, `${base}index.html#${hash}`);
    const okShown = await page.waitFor(`window.__appBooted === true && Router.current() === ${sel(view)} && !document.querySelector('#view-root .view-pending') && ${expr}`, 30000);
    const st = await page.eval(STATE).catch(() => null);
    if (!okShown || !st || st.error) fail(`直リンク #${hash}: 画面が出ません ${JSON.stringify(st)}`);
    else if (page.errors.length) page.errors.forEach((e) => fail(`直リンク #${hash}: ${e}`));
    else shown.push(`#${hash.split('/').slice(0, 2).join('/')}`);
    await page.close();
  }
  if (shown.length === links.length) ok(`直リンク ${shown.length}件(${shown.join('・')})`);
  return ids;
}

// 9. 公開版で詳細の束が遅いとき(サーバーで3秒遅らせ、Service Worker とブラウザのキャッシュを使わないページで)
async function checkSlowDetail(browser, base, server) {
  server.ctl.slow = { re: /\/assets\/detail\.[0-9a-f]+\.js$/, ms: 3000 };
  const page = await openPage(browser.cdp);
  try {
    await page.send('Network.enable');
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await navigateNoWait(page, `${base}index.html#home`);
    const homeFirst = await page.waitFor(`window.__appBooted === true && !!document.querySelector('#view-root .home-view')`, 20000);
    const st0 = await page.eval(`({ detail: AppData.hasDetail(), mode: AppData.info().mode })`);
    if (!homeFirst || st0.detail || st0.mode !== 'split') { fail(`詳細が遅いとき: ホームが詳細より先に出ません ${JSON.stringify(st0)}`); return; }
    // 検索: 届いた分(問題文・名前・説明)で動き、仮の値を出さない
    const sr = await page.eval(`(() => { const r = GlobalSearch.search('敷金', 8); return { n: r.length, leak: r.filter((x) => [x.title, x.snippet].some((s) => String(s) === AppData.PENDING)).length }; })()`);
    const partial = { length: sr.n };
    const leak = { length: sr.leak };
    // ほかの画面: 読み込み中 → 届いたら出る
    await page.eval(`location.hash = '#quiz'; true`);
    const pend = await page.eval(`!!document.querySelector('#view-root .view-pending') && Router.current() === 'quiz'`);
    // 読み込み中にホームへ戻って、また別の画面へ(古い待ちは捨てる)
    await page.eval(`location.hash = '#home'; true`);
    const backHome = await page.waitFor(`!!document.querySelector('#view-root .home-view') && Router.current() === 'home'`, 3000);
    await page.eval(`location.hash = '#topics/topicL'; true`);
    const arrived = await page.waitFor(`AppData.hasDetail() && !!document.querySelector('#view-root .topic-detail-view') && Router.current() === 'topics'`, 20000);
    const full = await page.eval(`GlobalSearch.search('敷金', 8).length`);
    if (!pend) fail('詳細が遅いとき: ほかの画面を開いても「読み込み中」になりません');
    else if (!backHome) fail('詳細が遅いとき: 読み込み中からホームへ戻れません');
    else if (!arrived) fail(`詳細が遅いとき: 詳細が届いても画面が出ません ${JSON.stringify(await page.eval(STATE).catch(() => null))}`);
    else if (!partial.length || leak.length || !full) fail(`詳細が遅いとき: 検索が届いた分で動きません(届く前 ${partial.length}件・仮の値 ${leak.length}件・届いたあと ${full}件)`);
    else ok(`詳細が遅いとき: ホームが先に出る・検索は届く前 ${partial.length}件/後 ${full}件・ほかの画面は読み込み中のあと出る`);
    // 再読み込み: 保存したスクロール位置に、詳細が届いたあとで戻る
    await page.eval(`window.scrollTo(0, 700); true`);
    await sleep(800);
    const savedY = await page.eval('window.scrollY');
    await page.send('Page.reload', {});
    const pend2 = await page.waitFor(`!!document.querySelector('#view-root .view-pending')`, 15000);
    const shown2 = await page.waitFor(`AppData.hasDetail() && !!document.querySelector('#view-root .topic-detail-view')`, 20000);
    await sleep(400);
    const y = await page.eval('window.scrollY');
    if (!pend2 || !shown2 || savedY < 100 || Math.abs(y - savedY) > 2) fail(`詳細が遅いとき: 再読み込みでスクロール位置に戻りません(読み込み中 ${pend2}・表示 ${shown2}・保存 ${savedY}・今 ${y})`);
    else ok(`詳細が遅いとき: 再読み込みで「読み込み中」のあと保存した位置(${y}px)に戻る`);
    if (page.errors.length) page.errors.forEach((e) => fail(`詳細が遅いとき: ${e}`));
  } finally {
    server.ctl.slow = null;
    await page.close();
  }
}

const STATE = `(() => { const v = document.querySelector('#view-root .view'); return {
  view: v ? v.className : null, error: !!document.querySelector('#view-root .error-view'),
  route: window.Router && Router.current ? Router.current() : null,
  bundleErrors: window.__bundleErrors || null, bootFailed: window.__bootFailed || null, booted: !!window.__appBooted }; })()`;

async function main() {
  if (!fs.existsSync(path.join(SITE, 'index.html'))) { fail(`${SITE}/index.html がありません`); return; }
  const staticPages = checkStaticFiles();
  const exe = findBrowser();
  if (!exe || typeof WebSocket === 'undefined') {
    const why = !exe ? 'Chrome / Edge が見つかりません' : 'この Node には WebSocket がありません(Node 22 以上が必要)';
    if (REQUIRE) fail(why); else console.log(`SKIP ${why}(ブラウザでの確認を省きます)`);
    return;
  }
  const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  const cacheName = (sw.match(/^const CACHE_NAME = `([^`]+)`/m) || [])[1];
  // BUILD_ID が空 = ビルドしていない元のファイル(予備の公開)。127.0.0.1 では開発用のネットワーク優先で動くため、2回目の起動の要求数は確かめない
  const built = !!(sw.match(/^const BUILD_ID = `([^`]+)`/m) || [])[1];
  const precache = readPrecacheList(sw);
  const exp = expected();
  const server = await startServer(SITE, Number(opt('--port')) || 0);
  const base = `http://127.0.0.1:${server.port}${BASE_PATH}`;
  console.log(`配信 ${base}(${SITE})・ブラウザ ${exe}`);
  const browser = await launch(exe);
  const result = { cacheName };
  let deepIds = null;
  try {
    // 1. 初回訪問(初回ガイドが出る)
    let page = await openPage(browser.cdp);
    await page.goto(`${base}`);
    if (!(await page.waitFor('window.__appBooted === true', 20000))) fail('初回訪問: 起動が終わりません');
    // 初回ガイドを開いているときは、その下のホームを次のタスクで描く(js/router.js)。ホームが出るまで待つ
    if (!(await page.waitFor(`!!document.querySelector('#view-root .home-view')`, 10000))) fail('初回訪問: ホームが描かれません');
    const first = await page.eval(STATE);
    if (!first.view || first.error) fail(`初回訪問: 画面が出ません ${JSON.stringify(first)}`); else ok(`初回訪問: ${first.route}${(await page.eval('!!document.querySelector(".onb-overlay, [class*=onboarding], [class*=onb-]")')) ? '(初回ガイドあり)' : ''}`);

    // 4. Service Worker
    const swOk = await page.waitFor(`(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active && r.active.state === 'activated' && navigator.serviceWorker.controller); })()`, 15000);
    if (!swOk) fail('Service Worker が15秒以内に有効になりません');
    const cacheState = await page.eval(`(async () => { const names = await caches.keys(); const out = { names, missing: [] };
      if (names.includes(${JSON.stringify(cacheName)})) { const c = await caches.open(${JSON.stringify(cacheName)}); for (const u of ${JSON.stringify(precache)}) if (!(await c.match(u))) out.missing.push(u); out.entries = (await c.keys()).length; }
      return out; })()`);
    result.caches = cacheState;
    if (JSON.stringify(cacheState.names) !== JSON.stringify([cacheName])) fail(`キャッシュが ${cacheName} の1つではありません: ${JSON.stringify(cacheState.names)}`);
    else if (cacheState.missing.length) fail(`プリキャッシュに無いファイル: ${cacheState.missing.join(', ')}`);
    else ok(`Service Worker 有効・キャッシュ ${cacheName}(${cacheState.entries}件)`);
    result.firstVisitRequests = server.log.length;

    // 2. 主な画面(初回ガイドを済ませた状態)
    await page.eval(`localStorage.setItem('shojikiLearn.v1.onboardingDone', JSON.stringify({ v: 1, at: 1 })); true`);
    page.errors.length = 0;
    await page.goto(`${base}index.html#home`);
    await page.waitFor('window.__appBooted === true', 20000);
    for (const r of ROUTES) {
      await page.eval(`location.hash = ${JSON.stringify(`#${r}`)}; true`);
      const want = r.split('/')[0] === 'summary' ? 'works' : r.split('/')[0];
      const shown = await page.waitFor(`(() => { const s = ${STATE}; return s.route === ${JSON.stringify(want)} && !!s.view; })()`, 8000);
      await sleep(150);
      const st = await page.eval(STATE);
      if (!shown || st.error) fail(`#${r}: 画面が出ません ${JSON.stringify(st)}`);
    }
    const st = await page.eval(STATE);
    if (st.bundleErrors) fail(`window.__bundleErrors: ${st.bundleErrors.join(', ')}`);
    if (st.bootFailed) fail(`読み込めなかったスクリプト: ${st.bootFailed.join(', ')}`);
    if (page.errors.length) page.errors.forEach((e) => fail(`画面の確認中のエラー: ${e}`)); else ok(`${ROUTES.length}画面を表示(エラーなし)`);
    const bad = page.warnings.filter((w) => /\[(app|bundle|router|起動)\]|ContentPack/.test(w));
    bad.forEach((w) => fail(`警告: ${w}`));

    // 3. データの件数
    const counts = await page.eval(`({ quiz: APP_DATA.quiz.length, mc: APP_DATA.quiz.filter((q) => q.format === 'mc').length, statements: QuizEngine.allStatements().length, terms: APP_DATA.terms.length, basics: APP_DATA.basics.length, topics: APP_DATA.topics.length, issues: AppIndex.issues.length })`);
    result.counts = counts;
    if (exp) {
      const diff = ['quiz', 'mc', 'statements', 'terms', 'basics', 'topics', 'issues'].filter((k) => counts[k] !== exp[k]);
      if (diff.length) fail(`件数が元のファイルと違います: ${diff.map((k) => `${k} ${counts[k]} / ${exp[k]}`).join(', ')}`); else ok(`件数が元と同じ: 問題 ${counts.quiz}・○×の文 ${counts.statements}・基礎知識 ${counts.basics}`);
    } else if (!(counts.quiz > 0 && counts.statements > 0)) fail(`データが空です ${JSON.stringify(counts)}`);
    await page.close();

    // 8. 直リンク・検索・データのハッシュ
    deepIds = await checkDeepLinks(browser, base, exp);
    // 9. 詳細の束が遅いとき(公開版だけ)
    if (built) await checkSlowDetail(browser, base, server);

    // 5. 2回目の起動(Service Worker から。ネットワークは sw.js の更新確認だけのはず)
    const before = server.log.length;
    page = await openPage(browser.cdp);
    await page.goto(`${base}index.html#home`);
    await page.waitFor('window.__appBooted === true', 20000);
    await sleep(1500);
    result.repeatRequests = server.log.slice(before);
    const extra = result.repeatRequests.filter((u) => !/\/sw\.js$/.test(u));
    if (!built) console.log(`info 2回目の起動のネットワーク要求 ${result.repeatRequests.length}件(元のファイルの sw.js は 127.0.0.1 ではネットワーク優先のため確かめない)`);
    else if (extra.length) fail(`2回目の起動で Service Worker 以外から読み込んだ: ${extra.join(', ')}`); else ok(`2回目の起動のネットワーク要求 ${result.repeatRequests.length}件(${result.repeatRequests.join(', ') || 'なし'})`);
    await page.close();

    // 7. 静的ページ(ブラウザで): Service Worker が有効な状態で開いても静的ページが出る・CSS と図解が出る・キャッシュに入らない・アプリへ戻れる
    if (staticPages) {
      page = await openPage(browser.cdp);
      const LP = `(() => { const s = document.querySelector('svg.dg'); const og = document.querySelector('meta[property="og:site_name"]');
        return { title: document.title, site: og ? og.content : null, h1: !!document.querySelector('h1'), app: !!document.getElementById('view-root'),
        main: !!document.querySelector('main.lp-main'), css: getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
        svg: s ? Math.round(s.getBoundingClientRect().height) : 0, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`;
      for (const [rel, wantSvg] of [['learn/', false], [staticPages.term, true], [staticPages.figure, true]]) {
        if (!rel) continue;
        await page.goto(`${base}${rel}`);
        const s = await page.eval(LP);
        if (s.app || !s.main || !s.h1) fail(`静的ページ ${rel}: 静的ページが出ません ${JSON.stringify(s)}`);
        else if (s.site !== staticPages.siteName || !s.title.endsWith(`|${staticPages.siteName}`)) fail(`静的ページ ${rel}: アプリ名が ${staticPages.siteName} ではありません(title「${s.title}」・og:site_name「${s.site}」)`);
        else if (!s.css) fail(`静的ページ ${rel}: learn.css が効いていません`);
        else if (wantSvg && s.svg < 100) fail(`静的ページ ${rel}: 図解が出ません(高さ ${s.svg}px)`);
        else if (s.overflow) fail(`静的ページ ${rel}: 横にはみ出しています`);
      }
      const cached = await page.eval(`(async () => { const out = []; for (const n of await caches.keys()) { const c = await caches.open(n); (await c.keys()).forEach((r) => { if (r.url.includes('/learn/') || r.url.endsWith('/sitemap.xml')) out.push(r.url); }); } return out; })()`);
      if (cached.length) fail(`静的ページが Service Worker のキャッシュに入っています: ${cached.slice(0, 3).join(', ')}`);
      // 「アプリを開く」でアプリが起動する(相対リンクが入口を指している)
      await page.eval(`document.querySelector('.lp-open').click(); true`);
      if (!(await page.waitFor(`window.__appBooted === true && !!document.querySelector('#view-root .view')`, 20000))) fail('静的ページの「アプリを開く」からアプリが起動しません');
      if (page.errors.length) page.errors.forEach((e) => fail(`静的ページの確認中のエラー: ${e}`));
      else ok('静的ページを表示(Service Worker 有効・キャッシュに入らない・CSS と図解あり・アプリへ戻れる)');
      await page.close();
    }

    // 6. オフライン(サーバーを止める)
    await server.stop();
    page = await openPage(browser.cdp);
    await page.goto(`${base}?utm_source=smoke#ox`);
    const offOk = await page.waitFor(`(() => { const s = ${STATE}; return s.booted && s.route === 'ox' && !!s.view && !s.error; })()`, 15000);
    const offErr = page.errors.filter((e) => !/^log: /.test(e)); // sw.js の更新確認の失敗などのネットワークのログは除く
    if (!offOk) fail(`オフラインで画面が出ません ${JSON.stringify(await page.eval(STATE).catch(() => null))}`);
    else if (offErr.length) offErr.forEach((e) => fail(`オフライン: ${e}`));
    else ok('オフラインで起動(#ox・?utm 付きの入口)');
    await page.close();
    // オフラインの直リンク(公開版では詳細の束も保存済みのものから読む)
    if (deepIds) {
      page = await openPage(browser.cdp);
      await page.goto(`${base}index.html#glossary/${encodeURIComponent(deepIds.term)}`);
      const offDeep = await page.waitFor(`!!document.querySelector('.glossary-view [data-term-id=${JSON.stringify(deepIds.term)}]') && (!window.AppData || AppData.hasDetail())`, 15000);
      const offDeepErr = page.errors.filter((e) => !/^log: /.test(e));
      if (!offDeep) fail(`オフラインの直リンク #glossary/${deepIds.term} で用語が出ません ${JSON.stringify(await page.eval(STATE).catch(() => null))}`);
      else if (offDeepErr.length) offDeepErr.forEach((e) => fail(`オフラインの直リンク: ${e}`));
      else ok(`オフラインの直リンク(#glossary/${deepIds.term})`);
      await page.close();
    }
    // 公開版: オフラインで入れ子の URL(learn/ の静的ページ)を開くと、アプリの入口へ移る(index.html をそのまま返すと CSS などが読めない)
    // (上の 7 で開いたページはブラウザのキャッシュから出るので、まだ開いていないページで確かめる)
    if (built) {
      const termDir = path.join(SITE, 'learn', 'term');
      const unseen = (fs.existsSync(termDir) ? fs.readdirSync(termDir) : []).map((f) => `learn/term/${f}`).find((f) => !staticPages || f !== staticPages.term) || 'learn/term/offline-check.html';
      page = await openPage(browser.cdp);
      await navigateNoWait(page, `${base}${unseen}`);
      const nestedOk = await page.waitFor(`location.pathname === ${JSON.stringify(BASE_PATH)} && window.__appBooted === true && !!document.querySelector('#view-root .view')`, 15000);
      if (!nestedOk) fail(`オフラインで ${unseen} を開いてもアプリの入口へ移りません(${await page.eval('location.href').catch(() => '?')})`);
      else ok(`オフラインで入れ子の URL(${unseen})を開くとアプリの入口へ移る`);
      await page.close();
    }
  } catch (e) {
    fail(`確認が途中で止まりました: ${e.stack || e.message}`);
  } finally {
    await browser.close();
    await server.stop().catch(() => {});
  }
  console.log(JSON.stringify({ firstVisitRequests: result.firstVisitRequests, repeatRequests: result.repeatRequests && result.repeatRequests.length, counts: result.counts, cache: result.cacheName }));
}

main().then(() => {
  console.log(failures.length ? `\n動作確認: 失敗 ${failures.length}件` : '\n動作確認: すべて成功');
  process.exit(failures.length ? 1 : 0);
}, (e) => { console.error(e); process.exit(1); });
