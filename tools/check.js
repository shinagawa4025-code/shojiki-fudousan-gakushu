// 公開前の確認(CI の最初の段階。ここで失敗したら何も公開せず、今の公開版がそのまま残る)
// 使い方: node tools/check.js [webapp]      (リポジトリの直下で。既定は webapp)
//   1. 4択問題の機械チェック(tools/lint_quiz.js --all)のエラーが0件
//   2. index.html が読み込むスクリプトがすべてあり、構文エラーがない(インラインのスクリプトも)
//   3. データの読み込みと整合性(AppIndex.issues が0件、追加パックの警告なし)
//   4. 元のファイルのまま公開するとき(ビルド失敗時の予備)にも動くこと: sw.js の PRECACHE_URLS がすべて存在し、
//      index.html のスクリプトと CSS をすべて含む。CACHE_NAME が予備の公開で書き換えられる形
//   5. ○×の文の固定(tools/statement_lock.js)
//   6. 公開用ビルドの前提(警告のみ。満たさなければビルドが失敗し、元のファイルのまま公開される):
//      スクリプトと CSS が build の範囲の中にある / ファイルの最上位に const・let・class がない
//   7. 個数・組合せの問題(style)の自己テスト(tools/selftest_styled.js): 見本(tools/fixtures/q4_example.js)を本物の
//      問題エンジン・整合性チェック・検索・lint・ビルドの分割・○×の文の固定に通す
//   8. 見出し用の書体(警告のみ): 画面の文言・データの名前に、fonts/fudomana-rounded-800-*.woff2 にない文字がない。
//      最初の画面の漢字が kanji-core のファイルにあり、css/style.css の kanji-core の unicode-range とそのファイルの文字が一致する
//      (あれば node tools/font_subset.js で作り直す。作り直さなくても、その文字だけ端末の書体で表示される)
//   9. 機能ごとの確認(v14〜): tools/lib/checks/*.js をすべて実行する(名前の順)。各ファイルは
//      module.exports = function (ctx, info) { return { errors: [...], warnings: [...] }; } の形(文字列の配列)。
//      ctx = 3 で読み込んだアプリ(Node の vm。APP_DATA・AppIndex・QuizEngine・Search・Stats・DateUtil・Storage など。画面のコードは読まない。
//      配列は別の vm のものなので instanceof Array ではなく Array.isArray で見る)、info = { webapp: webapp のフォルダ, root: リポジトリの直下 }。
//      errors は公開を止め、warnings は知らせるだけ。例外を投げたらエラーとして扱う
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { loadApp, summarize, scriptList, styleList } = require('./lib/appload.js');
const { topLevelLexical } = require('./lib/minify.js');
const lock = require('./statement_lock.js');
const { parseBlocks, localRefs, readPrecacheList } = require('./lib/html.js');
const styledSelftest = require('./selftest_styled.js');

const WEBAPP = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', 'webapp'));
const GH = !!process.env.GITHUB_ACTIONS;
const errors = [];
const warns = [];
const E = (m) => { errors.push(m); console.log(GH ? `::error::${m}` : `ERROR ${m}`); };
const W = (m) => { warns.push(m); console.log(GH ? `::warning::${m}` : `WARN  ${m}`); };
const step = (name) => console.log(`\n== ${name}`);

// 1. lint_quiz
step('4択問題の機械チェック(lint_quiz.js --all)');
{
  const r = spawnSync(process.execPath, [path.join(__dirname, 'lint_quiz.js'), '--all', '--webapp', WEBAPP], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const lines = out.split('\n');
  lines.filter((l) => /^(対象|ERROR|WARN) /.test(l) || /^ {2}E /.test(l)).forEach((l) => console.log(l));
  if (r.status !== 0) E(`lint_quiz.js --all がエラーで終わりました(終了コード ${r.status})`);
}

const html = fs.readFileSync(path.join(WEBAPP, 'index.html'), 'utf8');
const scripts = scriptList(html);
const styles = styleList(html);

// 2. スクリプトの存在と構文
step('スクリプトの存在と構文');
{
  for (const s of [...scripts, ...styles]) if (!fs.existsSync(path.join(WEBAPP, s))) E(`index.html が読み込む ${s} がありません`);
  for (const s of scripts) {
    const f = path.join(WEBAPP, s);
    if (!fs.existsSync(f)) continue;
    try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: s }); } catch (e) { E(`${s}: 構文エラー ${e.message}`); }
  }
  // インラインのスクリプト(JSON-LD は JSON として)
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    if (/\bsrc=/.test(m[1])) return;
    if (/application\/ld\+json/.test(m[1])) { try { JSON.parse(m[2]); } catch (e) { E(`index.html の JSON-LD が JSON として読めません: ${e.message}`); } return; }
    try { new vm.Script(m[2], { filename: `index.html inline #${i + 1}` }); } catch (e) { E(`index.html のインラインスクリプト #${i + 1}: 構文エラー ${e.message}`); }
  });
  try { new vm.Script(fs.readFileSync(path.join(WEBAPP, 'sw.js'), 'utf8'), { filename: 'sw.js' }); } catch (e) { E(`sw.js: 構文エラー ${e.message}`); }
  try { JSON.parse(fs.readFileSync(path.join(WEBAPP, 'manifest.json'), 'utf8')); } catch (e) { E(`manifest.json が JSON として読めません: ${e.message}`); }
  console.log(`スクリプト ${scripts.length}件・CSS ${styles.length}件`);
}

// 3. データの読み込みと整合性
step('データの読み込みと整合性(AppIndex.issues)');
let summary = null;
let styledNote = '';
let appCtx = null; // 9. の機能ごとの確認に渡す
try {
  const { ctx, logs } = loadApp(WEBAPP, { hostname: 'localhost' });
  appCtx = ctx;
  summary = summarize(ctx);
  const issues = ctx.AppIndex ? ctx.AppIndex.issues : null;
  if (!issues) E('AppIndex が作られませんでした');
  else if (issues.length) { E(`データ整合性チェックの警告 ${issues.length}件`); issues.forEach((m) => console.log(`  - ${m}`)); }
  logs.warn.filter((m) => /^\[ContentPack\]/.test(m)).forEach((m) => E(m));
  logs.error.forEach((m) => E(`読み込み中のエラー: ${m.split('\n')[0]}`));
  // 個数・組合せの問題(style)の数と、○×の文の内訳(選択肢の文「#n」/ 記述ア〜エ「#sn」)
  const quiz = ctx.APP_DATA.quiz || [];
  const nCount = quiz.filter((q) => q.style === 'count').length;
  const nCombo = quiz.filter((q) => q.style === 'combo').length;
  const stmts = ctx.QuizEngine ? ctx.QuizEngine.allStatements() : [];
  const nSub = stmts.filter((s) => /#s\d$/.test(s.id)).length;
  const badKeys = stmts.filter((s) => !lock.KEY_RE.test(String(s.id)));
  if (badKeys.length) E(`○×の文のキーの形が違うものがあります: ${badKeys.slice(0, 5).map((s) => s.id).join(', ')}`);
  // 個数・組合せの問題で○×の文を作れないもの(形の誤りは上の整合性チェックが理由を出す)
  const noStmt = quiz.filter((q) => q.style != null && !(ctx.QuizEngine && ctx.QuizEngine.hasStatements(q)));
  if (noStmt.length) E(`個数・組合せの問題で○×の文を作れないもの: ${noStmt.map((q) => q.id).join(', ')}`);
  styledNote = nCount || nCombo ? `(個数 ${nCount}・組合せ ${nCombo})` : '';
  console.log(`問題 ${summary.quiz}問(4択 ${summary.mc}${styledNote ? `・うち個数 ${nCount}・組合せ ${nCombo}` : ''})・○×の文 ${summary.statements}(選択肢の文 ${summary.statements - nSub}・記述ア〜エ ${nSub})・用語 ${summary.terms}・基礎知識 ${summary.basics}・トピック ${summary.topics}`);
} catch (e) {
  E(`データの読み込みに失敗しました: ${e.message}`);
}

// 4. 元のファイルのまま公開するときの sw.js
step('sw.js のプリキャッシュ(元のファイルのまま公開する場合)');
{
  const sw = fs.readFileSync(path.join(WEBAPP, 'sw.js'), 'utf8');
  let list = [];
  try { list = readPrecacheList(sw); } catch (e) { E(`sw.js の PRECACHE_URLS を読めません: ${e.message}`); }
  const norm = (u) => u.replace(/^\.\//, '');
  const set = new Set(list.map(norm));
  list.forEach((u) => { if (!fs.existsSync(path.join(WEBAPP, norm(u) || 'index.html'))) E(`sw.js の PRECACHE_URLS にある ${u} がありません`); });
  [...scripts, ...styles].forEach((s) => { if (!set.has(s)) E(`index.html の ${s} が sw.js の PRECACHE_URLS にありません`); });
  ['index.html', 'manifest.json'].forEach((s) => { if (!set.has(s)) E(`sw.js の PRECACHE_URLS に ${s} がありません`); });
  if ((sw.match(/^const CACHE_NAME = `shojiki-gakushu-[0-9A-Za-z._-]+`;$/mg) || []).length !== 1) E('sw.js の CACHE_NAME が「const CACHE_NAME = `shojiki-gakushu-…`;」の1行になっていません(ビルドと予備の公開が書き換えられない)');
  if ((sw.match(/^const BUILD_ID = `[^`]*`;$/mg) || []).length !== 1) E('sw.js に「const BUILD_ID = ``;」の行がありません');
  if ((sw.match(/^const PRECACHE_URLS = \[$/mg) || []).length !== 1) E('sw.js の「const PRECACHE_URLS = [」の行が見つかりません');
  // index.html・manifest.json が参照するローカルのファイル(アイコン・起動画面など)
  localRefs(html).forEach((r) => { if (!fs.existsSync(path.join(WEBAPP, r.url))) E(`index.html が参照する ${r.url} がありません`); });
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(WEBAPP, 'manifest.json'), 'utf8'));
    const icons = [...(mf.icons || []), ...(mf.shortcuts || []).flatMap((s) => s.icons || [])];
    icons.forEach((ic) => { if (!fs.existsSync(path.join(WEBAPP, ic.src))) E(`manifest.json のアイコン ${ic.src} がありません`); });
  } catch (e) { /* 上で報告済み */ }
  console.log(`PRECACHE_URLS ${list.length}件`);
}

// 5. ○×の文の固定
step('○×の文の固定(statement_lock.json)');
try {
  const r = lock.run({ mode: 'check', webapp: WEBAPP });
  // まだ固定していない新しい文は警告にする(公開する前に --update してコミットしないと、公開後の正誤の変更を CI が止められない)
  r.info.forEach((m) => (/^まだ固定していない新しい文/.test(m) ? W(`公開する前に固定する: ${m}`) : console.log(m)));
  r.warns.forEach((m) => W(m));
  r.errors.forEach((m) => E(m));
} catch (e) {
  E(`statement lock の確認に失敗しました: ${e.message}`);
}

// 6. 公開用ビルドの前提(警告のみ)
step('公開用ビルドの前提');
{
  try {
    const blocks = parseBlocks(html);
    const inBlocks = new Set(blocks.flatMap((b) => b.files));
    [...scripts, ...styles].forEach((s) => { if (!inBlocks.has(s)) W(`${s} が index.html の build の範囲(<!-- build:… --> 〜 <!-- /build -->)の外にあります。このままではビルドが失敗し、元のファイルのまま公開されます`); });
    console.log(blocks.map((b) => `${b.kind}:${b.name} ${b.files.length}件`).join(' / '));
  } catch (e) { W(`build の範囲を読めません: ${e.message}`); }
  for (const s of scripts) {
    const f = path.join(WEBAPP, s);
    if (!fs.existsSync(f)) continue;
    try {
      const found = topLevelLexical(fs.readFileSync(f, 'utf8'));
      if (found.length) W(`${s}: ファイルの最上位に ${found.join(', ')} があります(まとめると他のファイルから見えなくなるため、ビルドが失敗します。window.X = … の形にする)`);
    } catch (e) { /* 字句を読めないファイルは、ビルドでそのまま(縮小せず)使われる */ }
  }
}

// 7. 個数・組合せの問題の自己テスト
step('個数・組合せの問題の自己テスト(tools/selftest_styled.js・見本 tools/fixtures/q4_example.js)');
try {
  const r = styledSelftest.run(WEBAPP);
  r.errors.forEach((m) => E(`個数・組合せの自己テスト: ${m.split('\n')[0]}`));
  console.log(`成功 ${r.passed}件・失敗 ${r.errors.length}件`);
} catch (e) {
  E(`個数・組合せの自己テストを実行できませんでした: ${e.message}`);
}

// 8. 見出し用の書体に足りない文字(警告のみ)
step('見出し用の書体(tools/font_subset.js)に足りない文字');
try {
  const font = require('./font_subset.js');
  const r = font.checkCoverage(WEBAPP);
  if (!r.exists) W(`${r.absent.join(', ')} がありません。node tools/font_subset.js --src <MPLUSRounded1c-ExtraBold.ttf> で作ってください(なくても端末の書体で表示されます)`);
  else {
    const sw = fs.readFileSync(path.join(WEBAPP, 'sw.js'), 'utf8');
    const pre = new Set(readPrecacheList(sw).map((u) => u.replace(/^\.\//, '')));
    r.files.filter((f) => !pre.has(f)).forEach((f) => W(`${f} が sw.js の PRECACHE_URLS にありません(オフラインで見出しが端末の書体になります)`));
    if (r.missing.length) W(`画面の文言・データの名前に、見出し用の書体(fonts/fudomana-rounded-800-*.woff2)にない文字が ${r.missing.length}字あります: ${font.fmtChars(r.missing.slice(0, 40))}${r.missing.length > 40 ? '…' : ''}。node tools/font_subset.js --src <MPLUSRounded1c-ExtraBold.ttf> を実行し直してください(そのままでも、その文字だけ端末の書体で表示されます)`);
    if (!r.coreRange) W('css/style.css に fudomana-rounded-800-kanji-core.woff2 の @font-face(unicode-range 付き)がありません(最初の画面でも漢字の書体全体を読み込みます)');
    else if (r.rangeDiff.length) W(`css/style.css の kanji-core の unicode-range と fonts/fudomana-rounded-800-kanji-core.woff2 の漢字が ${r.rangeDiff.length}字食い違っています: ${font.fmtChars(r.rangeDiff.slice(0, 40))}${r.rangeDiff.length > 40 ? '…' : ''}。node tools/font_subset.js --src <MPLUSRounded1c-ExtraBold.ttf> で作り直してください(unicode-range も書き直します)`);
    if (r.coreMissing.length) W(`最初の画面(index.html・詳細の束に入れない js/・トピックと試験の名前)の漢字 ${r.coreMissing.length}字が fonts/fudomana-rounded-800-kanji-core.woff2 にありません: ${font.fmtChars(r.coreMissing.slice(0, 40))}${r.coreMissing.length > 40 ? '…' : ''}。表示はできますが、初めて開いたときに漢字の書体全体を読み込みます。node tools/font_subset.js --src <MPLUSRounded1c-ExtraBold.ttf> を実行し直してください`);
    console.log(`${r.files.join('・')}: 合計 ${(r.bytes / 1024).toFixed(1)}KB・${r.glyphChars}字・足りない文字 ${r.missing.length}字`);
  }
} catch (e) {
  W(`見出し用の書体の確認ができませんでした: ${e.message}`);
}

// 9. 機能ごとの確認(tools/lib/checks/*.js)
step('機能ごとの確認(tools/lib/checks/*.js)');
{
  const dir = path.join(__dirname, 'lib', 'checks');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort() : [];
  if (!files.length) console.log('なし');
  else if (!appCtx) E('データを読み込めなかったため、機能ごとの確認(tools/lib/checks)を実行できません');
  else {
    const info = { webapp: WEBAPP, root: path.resolve(__dirname, '..') };
    files.forEach((f) => {
      const rel = `tools/lib/checks/${f}`;
      try {
        const fn = require(path.join(dir, f));
        if (typeof fn !== 'function') { E(`${rel} が関数を書き出していません(module.exports = function (ctx, info) { … })`); return; }
        const r = fn(appCtx, info);
        if (!r || typeof r !== 'object') { E(`${rel} の結果が { errors: [], warnings: [] } の形ではありません`); return; }
        const errs = Array.isArray(r.errors) ? r.errors : [];
        const ws = Array.isArray(r.warnings) ? r.warnings : [];
        errs.forEach((m) => E(`${f}: ${m}`));
        ws.forEach((m) => W(`${f}: ${m}`));
        console.log(`${f}: エラー ${errs.length}件・警告 ${ws.length}件`);
      } catch (e) {
        E(`${rel} を実行できませんでした: ${e.message}`);
      }
    });
  }
}

console.log(`\n確認の結果: エラー ${errors.length}件・警告 ${warns.length}件${summary ? `(問題 ${summary.quiz}${styledNote}・○×の文 ${summary.statements})` : ''}`);
process.exit(errors.length ? 1 : 0);
