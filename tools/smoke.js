// 公開用ビルドの動作確認(依存パッケージなし。Chrome/Edge をヘッドレスで起動し、DevTools プロトコルを Node 標準の WebSocket で操作)
// 使い方: node tools/smoke.js <サイトのフォルダ> [--raw <webapp>] [--require-browser] [--browser <実行ファイル>] [--port <番号>]
//   GitHub Pages と同じ形(/shojiki-fudousan-gakushu/ の下・gzip・max-age=600・ETag)で配信して、次を確かめる:
//   1. 初回訪問: 画面が出る(初回ガイドを含む)・ページのエラーがない
//   2. 主な画面をすべて開く: どれもエラー画面にならず .view が出る・console.error / 例外がない・window.__bundleErrors が空
//   3. 問題数・○×の文の数などが元のファイル(--raw)を Node で読み込んだ値と同じ
//   4. Service Worker が15秒以内に有効になり、キャッシュは CACHE_NAME の1つだけで、PRECACHE_URLS がすべて入っている
//   5. 2回目の起動のネットワーク要求の数
//   6. サーバーを止めて(オフライン)開き直しても画面が出る
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
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    log.push(url);
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
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => server.listen(port || 0, '127.0.0.1', () => resolve({
    port: server.address().port,
    log,
    stop: () => new Promise((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); }),
  })));
}

// ---- ブラウザと DevTools プロトコル ----
function findBrowser() {
  const c = [opt('--browser'), process.env.CHROME_PATH,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium',
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

const STATE = `(() => { const v = document.querySelector('#view-root .view'); return {
  view: v ? v.className : null, error: !!document.querySelector('#view-root .error-view'),
  route: window.Router && Router.current ? Router.current() : null,
  bundleErrors: window.__bundleErrors || null, bootFailed: window.__bootFailed || null, booted: !!window.__appBooted }; })()`;

async function main() {
  if (!fs.existsSync(path.join(SITE, 'index.html'))) { fail(`${SITE}/index.html がありません`); return; }
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
  try {
    // 1. 初回訪問(初回ガイドが出る)
    let page = await openPage(browser.cdp);
    await page.goto(`${base}`);
    if (!(await page.waitFor('window.__appBooted === true', 20000))) fail('初回訪問: 起動が終わりません');
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
