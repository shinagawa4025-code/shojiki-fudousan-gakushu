// 自動テストをまとめて実行する(依存パッケージなし。Node 22 以上)
// 使い方: node tools/test.js [--unit | --browser] [--site <サイトのフォルダ>] [--raw <webapp>] [--grep <テスト名の一部>] [--file <ファイル名の一部>]
//                            [--jobs <ブラウザのテストを同時に動かす数>] [--port <番号>] [--require-browser] [--browser-path <実行ファイル>] [--verbose]
//   --unit     単体テスト(tools/tests/unit/*.test.js)だけ。元のファイル(--raw、既定 webapp)を Node で読み込んで確かめる(数秒)
//   --browser  ブラウザのテスト(tools/tests/browser/*.test.js)だけ。--site のフォルダ(既定は --raw)を GitHub Pages と同じ形で配信し、
//              Chrome / Edge をヘッドレスで操作する(tools/smoke.js と同じしくみ。puppeteer も npm install もいらない)
//   どちらも付けなければ両方。公開用ビルドを確かめるときは --site _site --raw webapp(CI と同じ)
//   ブラウザが見つからないときは省いて成功で終わる。--require-browser(GitHub Actions では常に)なら失敗にする
//   --port を付けると、同時に動かすファイルごとに port, port+1, …(--jobs 個まで)を使う(付けなければ空いている番号)
// テストは子プロセスで動かす(タイムゾーンは Asia/Tokyo。日付はテストの中で決める)。最後に集計を出し、失敗があれば終了コード 1
// テストの書き方は tools/tests/lib/harness.js(共通)・lib/node.js(単体テストの読み込み)・lib/browser.js(ブラウザの操作)の先頭を参照
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const has = (k) => args.includes(k);
const ROOT = path.resolve(__dirname, '..');
const GH = !!process.env.GITHUB_ACTIONS;
const RAW = path.resolve(opt('--raw') || path.join(ROOT, 'webapp'));
const SITE = opt('--site') ? path.resolve(opt('--site')) : null;
const ONLY_UNIT = has('--unit');
const ONLY_BROWSER = has('--browser');
const REQUIRE_BROWSER = has('--require-browser') || GH;
const JOBS = Math.max(1, Number(opt('--jobs')) || 2);
const PORT = Number(opt('--port')) || 0;
const FILE = opt('--file');
const pass = ['--grep', '--browser-path'].flatMap((k) => (opt(k) ? [k, opt(k)] : [])).concat(has('--verbose') ? ['--verbose'] : []);

const list = (dir) => {
  const d = path.join(__dirname, 'tests', dir);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.test.js') && (!FILE || f.includes(FILE))).sort().map((f) => path.join(d, f)) : [];
};
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

// 1つのファイルを子プロセスで動かす。戻り値 { file, res(##RESULT), code, out, ms, timedOut }
function runFile(file, extra, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file, ...extra], { cwd: ROOT, env: Object.assign({}, process.env, { TZ: 'Asia/Tokyo' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      const m = out.match(/^##RESULT (.+)$/m);
      let res = null;
      try { res = m ? JSON.parse(m[1]) : null; } catch (e) { res = null; }
      resolve({ file, res, code, out: out.replace(/^##RESULT .+\n?/m, ''), ms: Date.now() - t0, timedOut });
    });
  });
}

// jobs 個ずつ並べて動かし、終わった順に出力を出す
async function runAll(files, jobs, makeArgs, timeoutMs) {
  const results = [];
  let next = 0;
  async function worker(_, w) {
    while (next < files.length) {
      const i = next++;
      const r = await runFile(files[i], makeArgs(i, w), timeoutMs);
      process.stdout.write(`\n── ${rel(files[i])}(${(r.ms / 1000).toFixed(1)}秒)\n${r.out.trimEnd()}\n`);
      if (r.timedOut) console.log(GH ? `::error title=${rel(files[i])}::${timeoutMs / 1000}秒で終わらず止めました` : `FAIL ${timeoutMs / 1000}秒で終わらず止めました`);
      else if (!r.res) console.log(GH ? `::error title=${rel(files[i])}::結果がありません(終了コード ${r.code})` : `FAIL 結果がありません(終了コード ${r.code})`);
      results[i] = r;
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
  return results;
}

function browserAvailable() {
  const { findBrowser } = require('./tests/lib/browser.js');
  const exe = findBrowser();
  if (!exe) return { ok: false, why: 'Chrome / Edge が見つかりません' };
  if (typeof WebSocket === 'undefined') return { ok: false, why: 'この Node には WebSocket がありません(Node 22 以上が必要)' };
  return { ok: true, exe };
}

async function main() {
  const t0 = Date.now();
  const all = [];
  if (!fs.existsSync(path.join(RAW, 'index.html'))) { console.log(`FAIL 元のファイルがありません: ${RAW}/index.html`); return 1; }
  console.log(`元のファイル(--raw): ${rel(RAW) || RAW}・タイムゾーン Asia/Tokyo`);
  let failed = 0;
  if (!ONLY_BROWSER) {
    const files = list('unit');
    console.log(`\n=== 単体テスト ${files.length}ファイル`);
    const r = await runAll(files, Math.min(4, os.cpus().length || 2), () => ['--raw', RAW, ...pass], 120000);
    all.push(...r.map((x) => Object.assign(x, { kind: '単体' })));
  }
  if (!ONLY_UNIT) {
    const site = SITE || RAW;
    const files = list('browser');
    const av = browserAvailable();
    if (!fs.existsSync(path.join(site, 'index.html'))) {
      console.log(GH ? `::error::サイトのフォルダがありません: ${site}` : `FAIL サイトのフォルダがありません: ${site}`);
      failed += 1;
    } else if (!av.ok) {
      if (REQUIRE_BROWSER) { console.log(GH ? `::error::${av.why}` : `FAIL ${av.why}`); failed += 1; } else console.log(`\nSKIP ブラウザのテスト(${av.why})`);
    } else {
      const sw = fs.existsSync(path.join(site, 'sw.js')) ? fs.readFileSync(path.join(site, 'sw.js'), 'utf8') : '';
      const built = /^const BUILD_ID = `[^`]+`/m.test(sw);
      console.log(`\n=== ブラウザのテスト ${files.length}ファイル(${rel(site) || site}・${built ? '公開用ビルド' : '元のファイル'}・同時に ${JOBS}・${av.exe})`);
      // 時間のかかるファイルから(並べたときに早く終わるように)
      const order = files.slice().sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
      const r = await runAll(order, JOBS, (i, w) => ['--raw', RAW, '--site', site, ...(PORT ? ['--port', String(PORT + w)] : []), ...pass], 300000);
      all.push(...r.map((x) => Object.assign(x, { kind: 'ブラウザ' })));
    }
  }
  // 集計
  console.log('\n=== 集計');
  let tests = 0;
  let checks = 0;
  let skipped = 0;
  for (const r of all) {
    const res = r.res || { tests: 0, checks: 0, failed: 1, skipped: 0, failedNames: [r.timedOut ? '時間切れ' : '結果なし'] };
    const bad = res.failed || (r.code !== 0) || !r.res;
    if (bad) failed += 1;
    tests += res.tests;
    checks += res.checks;
    skipped += res.skipped;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${r.kind} ${rel(r.file)}: テスト ${res.tests}件・確認 ${res.checks}件${res.skipped ? `・省略 ${res.skipped}件` : ''}・${(r.ms / 1000).toFixed(1)}秒${bad && res.failedNames && res.failedNames.length ? ` — 失敗: ${res.failedNames.join(' / ')}` : ''}`);
  }
  console.log(`\nテスト ${tests}件・確認 ${checks}件${skipped ? `・省略 ${skipped}件` : ''}・${((Date.now() - t0) / 1000).toFixed(1)}秒`);
  console.log(failed ? `自動テスト: 失敗 ${failed}件` : '自動テスト: すべて成功');
  return failed ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
