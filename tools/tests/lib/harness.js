// テストの登録と結果の表示(依存パッケージなし)。単体テスト(tools/tests/unit)とブラウザのテスト(tools/tests/browser)で共通
//
//   const { test, run } = require('../lib/harness.js');
//   test('名前', (t) => { t.ok(条件, '説明', 失敗のときに出す値); t.eq(実際, 期待, '説明'); t.near(実際, 期待, 許容差, '説明'); });
//   run();   // ファイルの最後で。全部のテストを順に実行し、結果を表示して終了コード(失敗があれば 1)で終わる
//
// 1つのテストの中では、確認(ok/eq/near)が失敗しても最後まで続ける(失敗はまとめて表示)。例外はそのテストの失敗になる。
// t.skip('理由') でそのテストを省く(数えるが失敗にしない)。t.defer(fn) は終わったときの後片付け(逆順に実行)。
// 引数: --grep <文字列>(名前に含むテストだけ)・--verbose(t.log を表示)
// 最後の行に ##RESULT {...}(tools/test.js が読む)。GitHub Actions では失敗を ::error:: の注釈にする
'use strict';
const path = require('path');

const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
// 元のファイル(webapp)。単体テストはここを Node で読む。ブラウザのテストで --site がなければ、ここを配信する
const RAW = path.resolve(opt('--raw') || path.join(ROOT, 'webapp'));
// ブラウザで開くサイトのフォルダ(公開用ビルドなど)。なければ元のファイル
const SITE = path.resolve(opt('--site') || RAW);
const GH = !!process.env.GITHUB_ACTIONS;
const GREP = opt('--grep');
const VERBOSE = ARGS.includes('--verbose');

const tests = [];
function test(name, fn, o) { tests.push({ name, fn, o: o || {} }); }

class Skip extends Error {}

function short(v, n) {
  let s;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { s = String(v); }
  n = n || 700;
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
}

class T {
  constructor(name) {
    this.name = name;
    this.checks = 0;
    this.failures = [];
    this.cleanups = [];
  }
  ok(cond, msg, extra) {
    this.checks += 1;
    if (!cond) this.failures.push(extra === undefined ? msg : `${msg} — ${short(extra)}`);
    return !!cond;
  }
  eq(a, b, msg) { return this.ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b }); }
  near(a, b, tol, msg, extra) { return this.ok(typeof a === 'number' && Math.abs(a - b) <= tol, msg, extra === undefined ? { got: a, want: b, tol } : extra); }
  skip(why) { throw new Skip(why); }
  defer(fn) { this.cleanups.push(fn); }
  log(...a) { if (VERBOSE) console.log(`      ${a.map((x) => (typeof x === 'string' ? x : short(x, 400))).join(' ')}`); }
}

function withTimeout(p, ms, what) {
  let timer;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: ${ms / 1000}秒で終わりませんでした`)), ms); }),
  ]);
}

// hooks.after: 全部のテストのあと(ブラウザやサーバーを止める)。hooks.timeout: 1つのテストの上限(ミリ秒)
async function run(hooks) {
  hooks = hooks || {};
  const file = path.relative(ROOT, require.main ? require.main.filename : 'test').replace(/\\/g, '/');
  const t0 = Date.now();
  const res = { file, tests: 0, checks: 0, failed: 0, skipped: 0, ms: 0, failedNames: [] };
  for (const tc of tests) {
    if (GREP && !tc.name.includes(GREP)) continue;
    const t = new T(tc.name);
    const s = Date.now();
    let skipped = null;
    try {
      await withTimeout(tc.fn(t), tc.o.timeout || hooks.timeout || 60000, tc.name);
    } catch (e) {
      if (e instanceof Skip) skipped = e.message;
      else t.failures.push(`例外: ${(e && e.stack) || e}`);
    }
    for (const c of t.cleanups.reverse()) {
      try { await withTimeout(c(), 20000, `${tc.name} の後片付け`); } catch (e) { t.failures.push(`後片付けの例外: ${(e && e.message) || e}`); }
    }
    const ms = Date.now() - s;
    res.tests += 1;
    res.checks += t.checks;
    if (skipped !== null) {
      res.skipped += 1;
      console.log(`SKIP ${tc.name}(${skipped})`);
    } else if (t.failures.length) {
      res.failed += 1;
      res.failedNames.push(tc.name);
      console.log(`FAIL ${tc.name}(${t.checks}件の確認・${ms}ms)`);
      t.failures.forEach((f) => console.log(GH ? `::error title=${file}::${tc.name}: ${f.split('\n')[0]}` : `       ✗ ${f}`));
    } else {
      console.log(`ok   ${tc.name}(${t.checks}件・${ms}ms)`);
    }
  }
  if (hooks.after) {
    try { await withTimeout(hooks.after(), 30000, '終わりの後片付け'); } catch (e) { console.log(`後片付けの例外: ${e.message}`); }
  }
  res.ms = Date.now() - t0;
  console.log(`##RESULT ${JSON.stringify(res)}`);
  // 出力を書き切ってから終わる(Windows のパイプは非同期のため、すぐ exit すると最後の行が欠けることがある)
  const code = res.failed ? 1 : 0;
  process.exitCode = code;
  process.stdout.write('', () => process.exit(code));
}

module.exports = { test, run, T, short, opt, ARGS, ROOT, RAW, SITE, GH, VERBOSE };
