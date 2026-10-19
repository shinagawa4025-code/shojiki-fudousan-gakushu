// ブラウザのテスト用の小さな操作ライブラリ(依存パッケージなし)
//
// tools/smoke.js と同じしくみで動く: Chrome / Edge をヘッドレスで起動し、DevTools プロトコル(CDP)を Node 標準の WebSocket
// (Node 22 以上)で操作する。npm install も puppeteer もいらない(CI のランナーに入っている Chrome をそのまま使う)。
// 静的サーバー・ブラウザの探し方・CDP の部分は tools/smoke.js と同じ(smoke.js は単独で動くファイルなので、ここに同じものを置く)。
//
//   const B = require('../lib/browser.js');
//   B.test('名前', async (t) => {
//     const p = await t.open('quiz', { device: 'iphone', dark: false, seed: { quizPrefs: {...} } });
//     await p.click('.choice-btn');                 // 実際のタップ(スマホ)/クリック(PC)
//     t.ok(await p.waitFor(() => !!document.querySelector('.quiz-card.is-answered')), '答えた');
//   });
//   B.run();
//
// t.open(hash, opts) は、テストごとに新しいブラウザのコンテキスト(保存領域が空)を作り、保存データを入れてからアプリを開く。
//   opts.device: 'iphone'(390×664・タッチ・iPhone の UA。既定)| 'w320'(320×640)| 'tablet'(768×1024)| 'desktop'(1280×860)
//   opts.dark / opts.reducedMotion: 色のモード・動きを減らす設定
//   opts.date: 端末の日時(既定 2026-10-14T12:00:00+09:00。時刻は進む)。false で本当の日時。タイムゾーンは Asia/Tokyo
//   opts.seed: 保存データ({ キー: 値 }。shojikiLearn.v1. を付けて入れる)。既定で初回ガイド済み・お知らせ(WHATS_NEW)既読も入れる
//   opts.fresh: 既定の保存データを入れない(初めての利用者)
//   opts.sw: Service Worker を使う(既定は使わない = 対応していないブラウザと同じ。Service Worker は tools/smoke.js が確かめる)
//   opts.allowErrors: ページのエラー(例外・console.error)を失敗にしない。既定では、閉じるときにエラーと外部への通信がないことを確かめる
//   opts.context: 同じコンテキスト(保存領域)で開く
//   opts.seedFn / seedArgs: アプリのデータを使う保存データ(tools/tests/fixtures/seeds.js)。ホームを開いて書き、読み込み直して目的の画面へ
//   opts.pre: 読み込みの最初に実行する関数か文字列(navigator.share の差し替えなど)・opts.clipboard: クリップボードの許可
//   opts.goto: false でアプリを開かない(保存データだけ入れる)
// ページの操作: evaluate(関数, ...引数)・waitFor(関数, {timeout})・click(セレクタ, 番号)・press('Enter')・fill・setFiles・go('#なし')・
//   back・reload・settle(動きが終わるまで)・stable(値が落ち着くまで)・overflow()・storage()・listeners()。
//   公開版は CSP で eval が使えないので、ページの中の関数で eval / new Function は使わない(関数は文字列にしてそのまま送られる)
// サイトは --site(なければ --raw = webapp)のフォルダを GitHub Pages と同じ形(/shojiki-fudousan-gakushu/ の下)で配信する
// --verbose で、時間切れになった waitFor を表示する(遅い・揺れる箇所を探すとき)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const H = require('./harness.js');

const BASE_PATH = '/shojiki-fudousan-gakushu/';
const DEFAULT_DATE = '2026-10-14T12:00:00+09:00';
const P = 'shojikiLearn.v1.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
const DEVICES = {
  iphone: { width: 390, height: 664, deviceScaleFactor: 3, mobile: true },
  w320: { width: 320, height: 640, deviceScaleFactor: 2, mobile: true },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true },
  desktop: { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false },
};

// ---- GitHub Pages に似せた静的サーバー(tools/smoke.js と同じ) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function startServer(root, port) {
  root = path.resolve(root);
  const log = [];
  const sockets = new Set();
  const ctl = { slow: null };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    log.push(url);
    if (ctl.slow && ctl.slow.re.test(url)) { setTimeout(() => respond(req, res, url), ctl.slow.ms); return; }
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
    if (/gzip/.test(req.headers['accept-encoding'] || '') && !/\.png$/.test(file)) { headers['content-encoding'] = 'gzip'; buf = zlib.gzipSync(buf, { level: 1 }); }
    headers['content-length'] = buf.length;
    res.writeHead(status, headers);
    res.end(buf);
  }
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port || 0, '127.0.0.1', () => resolve({
      port: server.address().port,
      origin: `http://127.0.0.1:${server.address().port}`,
      base: `http://127.0.0.1:${server.address().port}${BASE_PATH}`,
      log,
      ctl,
      stop: () => new Promise((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); }),
    }));
  });
}

// ---- ブラウザ(tools/smoke.js と同じ探し方: --browser-path・CHROME_PATH・CHROME_BIN・GitHub のランナー・Windows・Mac の順。--browser は tools/test.js の「ブラウザのテストだけ」なので別の名前) ----
// Windows・Mac は Edge を先に、次に Chrome。Edge のヘッドレスが起動しない版があるので、起動できなければ次の候補を使う(launchAny)
function findBrowsers() {
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null;
  const c = [H.opt('--browser-path'), process.env.CHROME_PATH, process.env.CHROME_BIN,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', local,
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return [...new Set(c.filter((p) => p && fs.existsSync(p)))];
}
function findBrowser() { return findBrowsers()[0] || null; }

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
    this.closed = false;
    ws.addEventListener('close', () => {
      this.closed = true;
      this.pending.forEach((p) => p.reject(new Error(`${p.method}: ブラウザとの接続が切れました`)));
      this.pending.clear();
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`)); else p.resolve(msg.result);
      } else if (msg.method) {
        this.handlers.forEach((h) => { if (h.method === msg.method && (!h.sessionId || h.sessionId === msg.sessionId)) h.fn(msg.params); });
      }
    });
  }
  send(method, params, sessionId) {
    if (this.closed) return Promise.reject(new Error(`${method}: ブラウザとの接続が切れています`));
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`${method}: timeout`)); } }, 60000);
      this.pending.set(id, { resolve, reject, method, timer });
    });
  }
  on(method, sessionId, fn) { this.handlers.push({ method, sessionId, fn }); }
  off(sessionId) { this.handlers = this.handlers.filter((h) => h.sessionId !== sessionId); }
}

async function launch(exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fudomana-test-'));
  // puppeteer の既定に近い設定(裏のタブを遅くしない・スクロールバーを出さない・色の扱いをそろえる)
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-default-apps', '--disable-popup-blocking',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-ipc-flooding-protection',
    '--disable-hang-monitor', '--disable-breakpad', '--disable-client-side-phishing-detection', '--disable-search-engine-choice-screen', '--metrics-recording-only',
    '--password-store=basic', '--use-mock-keychain', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--lang=ja-JP', '--window-size=1280,900'];
  if (process.platform === 'linux') flags.push('--no-sandbox', '--disable-dev-shm-usage');
  // Edge 155 以降の Windows 版は、起動し直す仕組み(互換レイヤー)のせいでヘッドレスだとすぐ終わる(終了コード 0)。起動し直さないようにする
  if (/msedge(\.exe)?$|Microsoft Edge$/i.test(exe)) flags.push('--edge-skip-compat-layer-relaunch');
  const proc = spawn(exe, [...flags, 'about:blank'], { stdio: 'ignore' });
  // すぐ終わったら(起動できない版など)待たずに失敗にして、次の候補へ(launchAny)
  let exited = null;
  proc.on('exit', (code, signal) => { exited = `終了コード ${code}${signal ? `・${signal}` : ''}`; });
  proc.on('error', (e) => { exited = e.message; });
  const portFile = path.join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !fs.existsSync(portFile) && !exited; i++) await sleep(100);
  if (!fs.existsSync(portFile)) { try { proc.kill(); } catch (e) { /* 終了済み */ } await sleep(300); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 使用中 */ } throw new Error(exited ? `ブラウザがすぐに終了しました(${exited})` : 'ブラウザが起動しませんでした(DevToolsActivePort がない)'); }
  let lines = [];
  // (Windows では書き込み中のファイルを開くと EBUSY になることがあるので、読めるまで待つ)
  for (let i = 0; i < 50; i++) {
    try { lines = fs.readFileSync(portFile, 'utf8').trim().split('\n'); } catch (e) { lines = []; }
    if (lines.length >= 2) break;
    await sleep(100);
  }
  if (lines.length < 2) { proc.kill(); await sleep(300); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 使用中 */ } throw new Error('ブラウザの DevToolsActivePort が読めません'); }
  const cdp = await CDP.connect(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  return {
    cdp,
    exe,
    close: async () => {
      try { await cdp.send('Browser.close'); } catch (e) { /* 終了済み */ }
      await sleep(300);
      try { proc.kill(); } catch (e) { /* 終了済み */ }
      for (let i = 0; i < 10; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch (e) { await sleep(200); } }
    },
  };
}

// 候補を順に起動して、最初に動いたものを使う(Edge が起動しなければ Chrome など。どれも起動できなければ最後の理由で失敗)
async function launchAny(list) {
  let last = null;
  for (let i = 0; i < list.length; i++) {
    try {
      return await launch(list[i]);
    } catch (e) {
      last = e;
      if (i < list.length - 1) console.log(`  (ブラウザ ${list[i]} を起動できませんでした: ${e.message}。次の候補 ${list[i + 1]} を使います)`);
    }
  }
  throw last || new Error('NO_BROWSER');
}

// ---- キー(Input.dispatchKeyEvent) ----
const SPECIAL = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
};
SPECIAL[' '] = SPECIAL.Space;
function keyDef(k) {
  if (SPECIAL[k]) return SPECIAL[k];
  if (/^[0-9]$/.test(k)) return { key: k, code: `Digit${k}`, keyCode: 48 + Number(k), text: k };
  if (/^[a-z]$/i.test(k)) return { key: k, code: `Key${k.toUpperCase()}`, keyCode: k.toUpperCase().charCodeAt(0), text: k };
  throw new Error(`知らないキー: ${k}`);
}

// 端末の日時を変える(読み込みの最初に実行。時刻は進む)
const dateShim = (iso) => `(() => {
  const RealDate = Date;
  const OFFSET = RealDate.parse(${JSON.stringify(iso)}) - RealDate.now();
  function FakeDate(...a) { if (!new.target) return new RealDate(RealDate.now() + OFFSET).toString(); return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + OFFSET); }
  FakeDate.prototype = RealDate.prototype; FakeDate.now = () => RealDate.now() + OFFSET; FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;
  window.Date = FakeDate;
})();`;
// Service Worker のないブラウザにする(アプリは 'serviceWorker' in navigator で確かめている)
const NO_SW = `(() => { try { delete Navigator.prototype.serviceWorker; } catch (e) { /* 無視 */ } })();`;
// スクロールの位置合わせで画面が動かないように(scratch のテストと同じ)・CSP の違反を記録
const PAGE_INIT = `(() => {
  window.__cspv = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__cspv.push(e.violatedDirective + ' ' + e.blockedURI));
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '*{overflow-anchor:none !important}'; document.head.appendChild(s); });
})();`;

class Page {
  constructor(env, ctx, targetId, sessionId, opts) {
    this.env = env;
    this.ctx = ctx;
    this.cdp = env.browser.cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.opts = opts;
    this.errors = [];
    this.warnings = [];
    this.external = [];
    this.loads = 0;
    this.closed = false;
    this.touch = !!(typeof opts.device === 'object' ? opts.device : DEVICES[opts.device || 'iphone']).mobile;
  }
  send(method, params) { return this.cdp.send(method, params, this.sessionId); }
  async init() {
    const o = this.opts;
    const on = (m, fn) => this.cdp.on(m, this.sessionId, fn);
    on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails; this.errors.push(`例外: ${((d.exception && d.exception.description) || d.text).split('\n')[0]}`); });
    on('Runtime.consoleAPICalled', (p) => {
      const text = p.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || '')).join(' ').split('\n')[0];
      if (p.type === 'error') this.errors.push(`console.error: ${text}`);
      if (p.type === 'warning') { this.warnings.push(text); if (/\[(app|bundle|router|起動)\]|ContentPack/.test(text)) this.errors.push(`console.warn: ${text}`); }
    });
    // (保存データを入れるために開く manifest.json では、ブラウザがサイトの外の /favicon.ico を取りに行く。アプリの問題ではないので除く)
    on('Log.entryAdded', (p) => { if (p.entry.level === 'error' && !/\/favicon\.ico$/.test(p.entry.url || '')) this.errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`.trim()); });
    on('Page.loadEventFired', () => { this.loads += 1; });
    on('Page.javascriptDialogOpening', (p) => { this.errors.push(`ダイアログ: ${p.message}`); this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
    on('Network.requestWillBeSent', (p) => {
      const u = p.request.url;
      if (!u.startsWith(this.env.server.origin) && !/^(data|blob|about|chrome|chrome-extension|devtools):/.test(u)) this.external.push(u);
    });
    await Promise.all([this.send('Page.enable'), this.send('Runtime.enable'), this.send('Log.enable'), this.send('Network.enable')]);
    const dev = typeof o.device === 'object' ? o.device : DEVICES[o.device || 'iphone'];
    this.device = dev;
    this.touch = !!dev.mobile;
    await this.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.deviceScaleFactor || 1, mobile: !!dev.mobile });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: !!dev.mobile, maxTouchPoints: dev.mobile ? 5 : 1 });
    if (dev.mobile) await this.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' });
    await this.emulateMedia({ dark: !!o.dark, reducedMotion: !!o.reducedMotion });
    await this.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
    const pre = [PAGE_INIT];
    if (o.date !== false) pre.push(dateShim(o.date || DEFAULT_DATE));
    if (!o.sw) pre.push(NO_SW);
    (o.pre ? [].concat(o.pre) : []).forEach((s) => pre.push(typeof s === 'function' ? `(${s})();` : s));
    for (const source of pre) await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }
  async emulateMedia({ dark, reducedMotion }) {
    this.media = { dark: !!dark, reducedMotion: !!reducedMotion };
    await this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
  }
  // 関数(と引数)か式の文字列をページで実行して、値を返す
  async evaluate(fn, ...args) {
    const expression = typeof fn === 'function' ? `(${fn.toString()})(...${JSON.stringify(args)})` : fn;
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`evaluate: ${((d.exception && d.exception.description) || d.text).split('\n').slice(0, 3).join(' / ')}`);
    }
    return r.result.value;
  }
  // 条件が真になるまで待つ(真になった値を返す。時間切れは false。待つ間の例外は無視)
  async waitFor(fn, opts, ...args) {
    const ms = (opts && opts.timeout) || 10000;
    const end = Date.now() + ms;
    for (;;) {
      try { const v = await this.evaluate(fn, ...args); if (v) return v; } catch (e) { if (/接続が切れ/.test(e.message)) throw e; }
      if (Date.now() > end) {
        if (H.VERBOSE) console.log(`      (waitFor ${ms}ms 時間切れ) ${String(fn).replace(/\s+/g, ' ').slice(0, 140)}`);
        return false;
      }
      await sleep(50);
    }
  }
  waitForSelector(sel, opts) { return this.waitFor((s) => !!document.querySelector(s), opts, sel); }
  // アプリの起動と(公開版の)詳細の読み込みを待つ
  async waitApp(ms) {
    const okBoot = await this.waitFor(() => window.__appBooted === true && (!window.AppData || !AppData.hasDetail || AppData.hasDetail()) && !document.querySelector('#view-root .view-pending'), { timeout: ms || 30000 });
    if (!okBoot) throw new Error(`アプリの起動が終わりません: ${JSON.stringify(await this.evaluate(() => ({ booted: window.__appBooted, failed: window.__bootFailed || null, url: location.href })).catch((e) => e.message))}`);
  }
  async goto(url, opts) {
    const before = this.loads;
    const r = await this.send('Page.navigate', { url: /^https?:/.test(url) ? url : this.env.server.base + url });
    if (r.errorText) throw new Error(`開けません: ${url} (${r.errorText})`);
    if (!r.loaderId) return; // 同じ文書の中の移動(# だけ)
    if (opts && opts.noWait) return;
    for (let i = 0; i < 600 && this.loads === before; i++) await sleep(50);
    if (this.loads === before) throw new Error(`読み込みが終わりません: ${url}`);
  }
  // アプリの画面を開く(index.html#hash)して起動を待つ
  async open(hash, opts) {
    await this.goto(`index.html${hash ? `#${hash}` : ''}`);
    if (!opts || opts.wait !== false) await this.waitApp();
  }
  async reload(opts) {
    const before = this.loads;
    await this.send('Page.reload', {});
    for (let i = 0; i < 600 && this.loads === before; i++) await sleep(50);
    if (!opts || opts.wait !== false) await this.waitApp();
  }
  // # を変えて、画面が出るのを待つ(Router.current() が hash の最初の部分になり、読み込み中でない)
  async go(hash, ms) {
    await this.evaluate((h) => { location.hash = h; }, hash);
    const view = hash.split('/')[0];
    await this.waitFor((v) => window.Router && (Router.current() === v || v === 'summary') && !document.querySelector('#view-root .view-pending') && !!document.querySelector('#view-root .view'), { timeout: ms || 10000 }, view);
    await sleep(80);
  }
  async back() {
    await this.evaluate(() => { history.back(); });
    await sleep(150);
  }
  // 要素の真ん中を実際にタップ/クリックする(見える位置へスクロールしてから)
  //   押す前に、その点の一番上の要素が目的の要素(か、その中・そのラベル)であることを確かめる。動きの途中・ほかの要素が
  //   重なっているときは少し待ってやり直す(最大 約2秒)。それでも重なっていれば、何が重なっているかを書いて失敗にする
  async point(sel, index) {
    let r = null;
    for (let k = 0; k < 20; k++) {
      r = await this.evaluate((s, i) => {
        const el = typeof s === 'string' ? document.querySelectorAll(s)[i || 0] : null;
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;
        const hit = document.elementFromPoint(x, y);
        const lab = hit && hit.closest && hit.closest('label');
        const ok = !!hit && (hit === el || el.contains(hit) || (el.labels && Array.from(el.labels).some((l) => l.contains(hit))) || (lab && lab.contains(el)));
        const desc = (e) => (e ? `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${String(e.className).split(' ').slice(0, 2).join('.')}` : 'なし');
        return { x, y, w: b.width, h: b.height, ok, hit: desc(hit) };
      }, sel, index || 0);
      if (!r || !r.w || !r.h || r.ok) break;
      await sleep(100);
    }
    if (!r) throw new Error(`見つかりません: ${sel}${index ? ` #${index}` : ''}`);
    if (!r.w || !r.h) throw new Error(`見えていません: ${sel}`);
    if (!r.ok) throw new Error(`押せません(ほかの要素が上に重なっています: ${r.hit}): ${sel}`);
    return r;
  }
  async click(sel, index) {
    await sleep(30);
    const r = await this.point(sel, index);
    await this.clickAt(r.x, r.y);
  }
  async clickAt(x, y) {
    if (this.touch) {
      await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    }
    await sleep(30);
  }
  // キーを押す('Enter'・'Tab'・'Shift+Tab'・'Escape'・'Space'・'ArrowDown'・'1'・'o' など)
  async press(combo) {
    const parts = combo.split('+');
    const k = keyDef(parts.pop() || '+');
    const modifiers = parts.reduce((m, x) => m | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 })[x], 0);
    const text = modifiers & ~8 ? undefined : k.text;
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, text, unmodifiedText: text, modifiers });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, modifiers });
    await sleep(30);
  }
  async focus(sel) {
    const okF = await this.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.focus(); return document.activeElement === e; }, sel);
    if (!okF) throw new Error(`フォーカスできません: ${sel}`);
  }
  // 入力欄に文字を入れる(中身を消してから。input イベントが出る)
  async fill(sel, text) {
    await this.evaluate((s) => { const e = document.querySelector(s); e.focus(); e.select && e.select(); e.value = ''; }, sel);
    if (text) await this.send('Input.insertText', { text: String(text) });
  }
  // ファイルを選ぶ(<input type="file">。change イベントが出る)
  async setFiles(sel, files) {
    const { result } = await this.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    if (!result || !result.objectId) throw new Error(`見つかりません: ${sel}`);
    await this.send('DOM.setFileInputFiles', { files: files.map((f) => path.resolve(f)), objectId: result.objectId });
  }
  // document と window のイベントリスナーの数(種類ごと)
  async listeners() {
    const out = {};
    for (const expr of ['document', 'window']) {
      const { result } = await this.send('Runtime.evaluate', { expression: expr });
      const { listeners } = await this.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      listeners.forEach((l) => { const k = `${expr}.${l.type}`; out[k] = (out[k] || 0) + 1; });
    }
    return out;
  }
  async storage(keys) {
    return this.evaluate((pre, ks) => {
      const o = {};
      (ks || Object.keys(localStorage).filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length))).forEach((k) => { const v = localStorage.getItem(pre + k); o[k] = v == null ? null : JSON.parse(v); });
      return o;
    }, P, keys || null);
  }
  async get(key) { return (await this.storage([key]))[key]; }
  async exists(sel) { return this.evaluate((s) => !!document.querySelector(s), sel); }
  // 横にはみ出していないか
  //   スマホの表示では、はみ出すとレイアウトの幅(innerWidth)も広がるので、innerWidth ではなく clientWidth(画面の幅)と比べる。
  //   動き(カードが横から入るなど)の途中は一時的に広がるので、動きが終わってから測る
  async overflow() {
    await this.settle();
    return this.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }
  // 値が落ち着く(100ms おきに3回同じ)まで待って、その値を返す(なめらかなスクロールの途中で測らないため)
  async stable(fn, opts, ...args) {
    const end = Date.now() + ((opts && opts.timeout) || 4000);
    let last = null;
    let same = 0;
    for (;;) {
      const v = JSON.stringify(await this.evaluate(fn, ...args));
      same = v === last ? same + 1 : 0;
      last = v;
      if (same >= 2 || Date.now() > end) return JSON.parse(v === undefined ? 'null' : v);
      await sleep(100);
    }
  }
  // 動き(CSS のアニメーション・トランジション)が終わるのを待つ(無限に続く動き・マスコットの待機中のまばたきと揺れ(fd-blink・fd-sway。
  // 画面を開いてから約10秒続く飾り)は待たない。最大 ms)
  async settle(ms) {
    await this.waitFor(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity && !/^fd-(blink|sway)$/.test(a.animationName || '')).length === 0, { timeout: ms || 3000 });
  }
  // 閉じる(エラー・外部への通信がないことを確かめてから)
  async close() {
    if (this.closed) return;
    this.closed = true;
    const t = this.t;
    if (t && !this.opts.allowErrors) {
      t.ok(this.errors.length === 0, `${this.label}: ページのエラーなし`, this.errors.slice(0, 5));
      t.ok(this.external.length === 0, `${this.label}: 外部への通信なし`, this.external.slice(0, 5));
    }
    try { await this.cdp.send('Target.closeTarget', { targetId: this.targetId }); } catch (e) { /* 閉じ済み */ }
    this.cdp.off(this.sessionId);
  }
}

class Context {
  constructor(env, id) { this.env = env; this.id = id; this.pages = []; }
  async newPage(opts) {
    opts = opts || {};
    const { targetId } = await this.env.browser.cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: this.id });
    const { sessionId } = await this.env.browser.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this.env, this, targetId, sessionId, opts);
    this.pages.push(page);
    await page.init();
    return page;
  }
  // 保存データを入れる(同じオリジンの静的なファイルを開いて localStorage に書く。アプリはまだ動かさない)
  async seed(page, obj) {
    await page.goto('manifest.json');
    await page.evaluate((pre, o) => { Object.keys(o).forEach((k) => localStorage.setItem(pre + k, JSON.stringify(o[k]))); return true; }, P, obj);
  }
  async close() {
    for (const p of this.pages) await p.close();
    try { await this.env.browser.cdp.send('Target.disposeBrowserContext', { browserContextId: this.id }); } catch (e) { /* 閉じ済み */ }
  }
}

// ---- テストごとの環境(ブラウザとサーバーは1つのファイルで1つ) ----
const env = { browser: null, server: null, info: null };
let launching = null;
async function ensure() {
  if (env.browser) return env;
  if (!launching) {
    launching = (async () => {
      const list = findBrowsers();
      if (!list.length) throw new Error('NO_BROWSER');
      if (typeof WebSocket === 'undefined') throw new Error('この Node には WebSocket がありません(Node 22 以上が必要)');
      const port = Number(H.opt('--port')) || 0;
      env.server = await startServer(H.SITE, port);
      env.browser = await launchAny(list);
      env.info = siteInfo();
      return env;
    })();
  }
  return launching;
}

// お知らせ(WHATS_NEW)の版とアプリの版。元のファイル(--raw)から読む
function siteInfo() {
  const onb = fs.readFileSync(path.join(H.RAW, 'js', 'onboarding.js'), 'utf8');
  const cfg = fs.readFileSync(path.join(H.RAW, 'js', 'siteConfig.js'), 'utf8');
  return {
    whatsNew: (onb.match(/const WHATS_NEW = [`'"]([^`'"]+)[`'"]/) || [])[1] || null,
    version: (cfg.match(/version: [`'"]([^`'"]+)[`'"]/) || [])[1] || null,
    built: /^const BUILD_ID = `[^`]+`/m.test(fs.readFileSync(path.join(H.SITE, 'sw.js'), 'utf8')),
  };
}

async function newContext(t, opts) {
  await ensure();
  const { browserContextId } = await env.browser.cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const ctx = new Context(env, browserContextId);
  if (opts && opts.clipboard) {
    await env.browser.cdp.send('Browser.grantPermissions', { origin: env.server.origin, browserContextId, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  }
  if (t) t.defer(() => ctx.close());
  return ctx;
}

// テスト(t)に open / context / env を足して登録する
function test(name, fn, o) {
  H.test(name, async (t) => {
    try {
      await ensure();
    } catch (e) {
      if (e.message === 'NO_BROWSER') t.skip('Chrome / Edge が見つかりません');
      throw e;
    }
    t.env = env;
    t.context = (opts) => newContext(t, opts);
    t.open = async (hash, opts) => {
      opts = opts || {};
      const ctx = opts.context || await newContext(t, opts);
      const page = await ctx.newPage(opts);
      page.t = t;
      page.label = `#${hash || ''}${opts.device && typeof opts.device === 'string' ? ` ${opts.device}` : ''}${opts.dark ? ' dark' : ''}`;
      const seed = opts.fresh ? Object.assign({}, opts.seed || {}) : Object.assign({ onboardingDone: { v: 2, at: 1 }, seenWhatsNew: env.info.whatsNew }, opts.seed || {});
      if (Object.keys(seed).length) await ctx.seed(page, seed);
      if (opts.seedFn) {
        // アプリのデータを使う保存データ(tools/tests/fixtures/seeds.js): いったんホームを開いて書き、読み込み直して目的の画面へ
        await page.open('home');
        page.seeded = await page.evaluate(opts.seedFn, opts.seedArgs || {});
        if (opts.goto !== false) { await page.goto(`index.html?seeded=1${hash ? `#${hash}` : ''}`); await page.waitApp(); }
        return page;
      }
      if (opts.goto !== false) await page.open(hash, opts);
      return page;
    };
    await fn(t);
  }, Object.assign({ timeout: 120000 }, o || {}));
}

async function closeAll() {
  if (env.browser) await env.browser.close();
  if (env.server) await env.server.stop().catch(() => {});
}

// 画面の文字のコントラスト(重なった背景と不透明度を合成して計算。WCAG の比)
function contrastOf(selectors) {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; }
    let bg = parse(getComputedStyle(document.body).backgroundColor);
    if (bg[3] < 1) bg = [255, 255, 255, 1];
    if (layers.length && layers[layers.length - 1][3] >= 1) bg = layers.pop();
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };
  return selectors.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    let fg = blend(parse(cs.color), bg);
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 1) fg = blend([fg[0], fg[1], fg[2], op], bg);
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    return { sel, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, size: cs.fontSize, weight: cs.fontWeight };
  });
}

function run() { return H.run({ after: closeAll, timeout: 120000 }); }

module.exports = { test, run, env, ensure, newContext, startServer, findBrowser, findBrowsers, launch, launchAny, contrastOf, sleep, P, DEVICES, DEFAULT_DATE, BASE_PATH };
