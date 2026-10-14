// 公開用ビルド(GitHub Actions で実行。ローカル開発ではビルドせず webapp をそのまま開く)
// 使い方: node tools/build.js <webapp> <出力先>      例: node tools/build.js webapp _site
//
// 1. index.html の <!-- build:css … --> / <!-- build:js … --> 〜 <!-- /build --> の範囲ごとに、ファイルを順番どおりにつなげて
//    assets/<名前>.<内容のハッシュ10桁>.css / .js にまとめる。JS は1ファイルずつ try { } で包む(1つが実行時エラーでも残りは動く。
//    別々の <script> と同じ)。縮小は控えめ(tools/lib/minify.js: コメントと不要な空白だけ。文字列・テンプレートの中身は触らない。行番号は元と同じ)
// 2. 初回の表示を速くするため、ホームに要らないものを「詳細」の束(assets/detail.*.js)に分ける(webapp/js/appData.js が読み込む):
//    - build:js data の範囲(設定とデータ)は Node で実行し、できた APP_DATA を「本体」と「詳細」に分ける(tools/lib/split.js)。
//      本体の束 = 設定などのコード(SITE・ContentPack)+ 本体の APP_DATA(JSON)+ 詳細の束の場所(window.__APP_DETAIL__)
//    - build:js app の範囲で data-bundle="detail" を付けたファイル(ホーム以外の画面・図解など)は詳細の束に入れ、本体には
//      画面の代わり(AppData.lazyView)だけを置く。詳細の束 = 詳細の APP_DATA を本体に戻す処理 + それらのファイル
// 3. 本体だけの状態でも件数・○×の文の id と正誤・索引・整合性チェックが元と同じこと、詳細を戻すと APP_DATA・○×の文・索引が
//    元のファイルとまったく同じになることを Node で確かめる(localhost と公開サイトのホスト名の両方)
// 4. index.html の範囲を1つの <link> / <script> に置き換え、<meta name="app-build"> を入れる
// 5. sw.js をひな形から作る: CACHE_NAME = shojiki-gakushu-<ハッシュ>、BUILD_ID、PRECACHE_URLS(index.html・manifest・まとめたファイル・
//    詳細の束・index.html のアイコン)
// 6. index.html・manifest が参照するファイルと、プリキャッシュのファイルがすべて出力先にあることを確かめる
// 7. 大きさの表を出す(初回の表示に要る JS と CSS の gzip 合計が 300KB、詳細を含めた合計が 1,000KB を超えたら警告。下の BUDGET_*)
// どこかで失敗したら終了コード1で終わり、出力先は作らない(途中までのサイトを残さない)。CI はそのとき元のファイルのまま公開する。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const vm = require('vm');
const { minifyJs, minifyCss, topLevelLexical, countNl } = require('./lib/minify.js');
const { loadApp, loadBuilt, summarize, scriptList, styleList, ENGINE } = require('./lib/appload.js');
const { parseBlocks, localRefs, generateSw } = require('./lib/html.js');
const split = require('./lib/split.js');

const BUDGET_FIRST = 300 * 1024; // 初回の表示(ホーム)に要る JS+CSS
// 詳細を含めた JS+CSS。v12 で4択を約520問から約800問(+54%)に増やし、詳細の束(解説・選択肢・記述ア〜エ)が大きくなったため
// 800KB → 1,000KB に見直した(2026-10 時点で約900KB)。詳細はホームを描いたあとに読み込むので、ホームの速さは上の BUDGET_FIRST で見る
const BUDGET_TOTAL = 1000 * 1024;
const SKIP_DIRS = new Set(['js', 'css', 'data']); // まとめたので公開しない(古い Service Worker が新旧のファイルを混ぜて保存しないように)
const JUNK = /^(desktop\.ini|thumbs\.db|\..*)$/i;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const GH = !!process.env.GITHUB_ACTIONS;
const warn = (m) => console.log(GH ? `::warning::${m}` : `WARN ${m}`);
const PROD_HOST = 'shinagawa4025-code.github.io';

function vlq(n) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let v = n < 0 ? ((-n) << 1) | 1 : n << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}

// 行単位の source map(生成した各行 → 元のファイルの同じ行)
function sourceMap(file, lineMap, sources, contents) {
  let prevSrc = 0;
  let prevLine = 0;
  const mappings = lineMap.map((m) => {
    if (!m) return '';
    const seg = vlq(0) + vlq(m.src - prevSrc) + vlq(m.line - prevLine) + vlq(0);
    prevSrc = m.src;
    prevLine = m.line;
    return seg;
  }).join(';');
  return JSON.stringify({ version: 3, file, sources: sources.map((s) => `../${s}`), sourcesContent: contents, names: [], mappings });
}

function readSrc(src, rel) {
  return fs.readFileSync(path.join(src, rel), 'utf8').replace(/^﻿/, '');
}

// HTML の中のスクリプト(src なし・JSON-LD などのデータは除く)の中身。CSP のハッシュに使う
function inlineScripts(html) {
  return [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/\bsrc\s*=/i.test(m[1]) && !/\btype\s*=\s*["']?application\/(ld\+)?json/i.test(m[1]))
    // ブラウザは HTML を読むときに改行 CRLF を LF にそろえてからハッシュを比べる(Windows で取り出したファイルでも CSP が合うように)
    .map((m) => m[2].replace(/\r\n?/g, '\n'));
}

function wrap(rel, code) {
  const name = JSON.stringify(rel);
  return `try{\n${code}\n}catch(e){console.error('[bundle] '+${name},e);(window.__bundleErrors=window.__bundleErrors||[]).push(${name})}\n`;
}

// JS の文字列リテラル(U+2028・U+2029 もエスケープして、生成した行が1行のままになるように)
const LS = String.fromCharCode(0x2028);
const LS_RE = new RegExp(`[${LS}${String.fromCharCode(0x2029)}]`, 'g');
function lit(s) {
  return JSON.stringify(s).replace(LS_RE, (c) => (c === LS ? '\\u2028' : '\\u2029'));
}

// まとめたファイルを作る道具: 元のファイル(行番号を source map に残す)と、生成したコード(1行以上)を順に足す
class Bundle {
  constructor() { this.code = ''; this.lineMap = []; this.sources = []; this.contents = []; }
  // 生成したコード(改行で終わること)
  gen(code) {
    if (!code.endsWith('\n')) code += '\n';
    this.code += code;
    for (let i = 0; i < countNl(code); i++) this.lineMap.push(null);
  }
  // 元のファイル(縮小済み)を try { } で包んで足す。prefix は try の前に付ける文字列(改行なし)
  file(rel, raw, minified, prefix) {
    const idx = this.sources.length;
    this.sources.push(rel);
    this.contents.push(raw);
    this.code += `${prefix || ''}${wrap(rel, minified)}`;
    this.lineMap.push(null); // try{
    const n = countNl(minified) + 1;
    for (let i = 0; i < n; i++) this.lineMap.push({ src: idx, line: i });
    this.lineMap.push(null); // }catch…
  }
}

function minifyFile(src, rel, report) {
  const raw = readSrc(src, rel);
  const lex = topLevelLexical(raw);
  if (lex.length) throw new Error(`${rel}: ファイルの最上位に ${lex.join(', ')} があります(try { } で包むと他のファイルから見えなくなる)`);
  const r = minifyJs(raw, rel);
  if (!r.minified) warn(`${rel} は縮小せずにまとめました(${r.reason})`);
  report.push({ file: rel, raw: Buffer.byteLength(raw), out: Buffer.byteLength(r.code), minified: r.minified });
  return { raw, code: r.code };
}

// 詳細に回したファイルが定義する画面(window.Views.<名前> = …)。本体にはその代わりを置く
function viewNamesOf(rel, raw) {
  const names = [...raw.matchAll(/(?:^|[\s;=])window\.Views\.([A-Za-z_$][\w$]*)\s*=(?!=)/gm)].map((m) => m[1]);
  return [...new Set(names)];
}

function copyStatic(src, out) {
  const copied = [];
  const walk = (rel) => {
    for (const ent of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (!rel && SKIP_DIRS.has(ent.name)) continue;
        if (ent.name.startsWith('.')) continue;
        walk(r);
      } else {
        if (JUNK.test(ent.name)) continue;
        if (!rel && (ent.name === 'index.html' || ent.name === 'sw.js')) continue; // 作り直して書く
        fs.mkdirSync(path.dirname(path.join(out, r)), { recursive: true });
        fs.copyFileSync(path.join(src, r), path.join(out, r));
        copied.push(r);
      }
    }
  };
  walk('');
  return copied;
}

function writeAsset(TMP, name, bundle) {
  const hash = sha(bundle.code).slice(0, 10);
  const file = `${name}.${hash}.js`;
  new vm.Script(bundle.code, { filename: file }); // まとめたファイル全体が1つのスクリプトとしてコンパイルできること
  fs.writeFileSync(path.join(TMP, 'assets', `${file}.map`), sourceMap(file, bundle.lineMap, bundle.sources, bundle.contents));
  fs.writeFileSync(path.join(TMP, 'assets', file), `${bundle.code}//# sourceMappingURL=${file}.map\n`);
  return file;
}

// 本体だけ・詳細を戻したあと、のどちらでも元のファイルと同じになることを確かめる
function checkEquivalence(SRC, built, hostname) {
  const rawApp = loadApp(SRC, { hostname });
  const a = summarize(rawApp.ctx);
  const b = loadBuilt({ hostname, coreData: built.coreDataCode, engine: built.engine });
  if (b.ctx.__bundleErrors) throw new Error(`本体の読み込みでエラー(${hostname}): ${b.ctx.__bundleErrors.join(', ')}`);
  if (!b.ctx.AppData || b.ctx.AppData.hasDetail()) throw new Error(`本体だけの状態になっていません(${hostname})`);
  // 本体だけ: ホームの集計に使う数・○×の文の id と正誤・索引・整合性チェックが元と同じ
  const c = summarize(b.ctx);
  const same = ['quiz', 'mc', 'statements', 'terms', 'basics', 'topics', 'issues', 'skeletonHash', 'indexHash'];
  const diff0 = same.filter((k) => c[k] !== a[k]);
  if (diff0.length) throw new Error(`本体だけの状態が元と違います(${hostname}): ${diff0.map((k) => `${k} ${c[k]} / ${a[k]}`).join(', ')}`);
  if (c.dataHash === a.dataHash) throw new Error('本体のデータが元と同じです(詳細に分けられていない)');
  const issuesCore = JSON.stringify(b.ctx.AppIndex.issues);
  // 詳細を戻す(詳細の束のデータの部分。画面のコードは Node では動かさない)
  b.mergeDetail(built.detailDataCode);
  if (b.ctx.__bundleErrors) throw new Error(`詳細の取り込みでエラー(${hostname}): ${b.ctx.__bundleErrors.join(', ')}`);
  if (!b.ctx.AppData.hasDetail()) throw new Error(`詳細を取り込めませんでした(${hostname}): ${JSON.stringify(b.ctx.AppData.info())}`);
  const d = summarize(b.ctx);
  if (JSON.stringify(a) !== JSON.stringify(d)) throw new Error(`本体+詳細の内容が元と違います(${hostname}): ${JSON.stringify(d)} / ${JSON.stringify(a)}`);
  const diff = split.firstDifference(b.ctx.APP_DATA, rawApp.ctx.APP_DATA, 'APP_DATA');
  if (diff) throw new Error(`本体+詳細の APP_DATA が元と違います(${hostname}): ${diff}`);
  if (JSON.stringify(rawApp.ctx.AppIndex.issues) !== issuesCore) throw new Error(`本体だけの整合性チェックの内容が元と違います(${hostname})`);
  if (b.ctx.AppData.info().premature.length) throw new Error(`詳細より先に詳細を使った処理があります: ${b.ctx.AppData.info().premature.join(', ')}`);
  const logs = [...b.logs.warn, ...b.logs.error].filter((m) => !/^\[(データ整合性チェック|見直し時期)\]/.test(m));
  if (logs.length) throw new Error(`読み込み中の警告・エラー(${hostname}): ${logs.slice(0, 3).join(' / ')}`);
  return { a, c };
}

function main() {
  const [srcArg, outArg] = process.argv.slice(2);
  if (!srcArg || !outArg) { console.error('使い方: node tools/build.js <webapp> <出力先>'); process.exit(2); }
  const SRC = path.resolve(srcArg);
  const OUT = path.resolve(outArg);
  const TMP = `${OUT}.tmp-${process.pid}`;
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(path.join(TMP, 'assets'), { recursive: true });
  try {
    let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
    const blocks = parseBlocks(html);
    const bundled = new Set(blocks.flatMap((b) => b.files));
    const outside = [...scriptList(html), ...styleList(html)].filter((s) => !bundled.has(s.replace(/^\.\//, '')));
    if (outside.length) throw new Error(`build の範囲の外にスクリプト・CSS があります: ${outside.join(', ')}`);
    const dataBlock = blocks.find((b) => b.kind === 'js' && b.name === 'data');
    if (!dataBlock) throw new Error('<!-- build:js data --> の範囲がありません');
    if (dataBlock.later.size) throw new Error('build:js data の範囲では data-bundle="detail" を使えません(データは自動で本体と詳細に分ける)');
    const appBlocks = blocks.filter((b) => b.kind === 'js' && b !== dataBlock);
    const appOrder = appBlocks.flatMap((b) => b.files);
    const later = appBlocks.flatMap((b) => b.files.filter((f) => b.later.has(f)));
    const appDataAt = appOrder.indexOf('js/appData.js');
    if (appDataAt < 0) throw new Error('js/appData.js がアプリの範囲にありません');
    if (later.includes('js/appData.js') || later.some((f) => ENGINE.includes(f))) throw new Error(`本体に必要なファイルに data-bundle="detail" が付いています: ${later.filter((f) => f === 'js/appData.js' || ENGINE.includes(f)).join(', ')}`);
    if (later.length && appOrder.indexOf(later[0]) < appDataAt) throw new Error('data-bundle="detail" のファイルは js/appData.js より後に置く');
    if (blocks.indexOf(dataBlock) > blocks.indexOf(appBlocks[0])) throw new Error('build:js data の範囲はアプリの範囲より前に置く');

    const report = [];
    const assets = []; // { kind, name, url, block }
    const engine = []; // 確認用: 本体のうち ENGINE のファイル(縮小後・包んだもの)

    // ---- CSS ----
    for (const b of blocks.filter((x) => x.kind === 'css')) {
      const code = b.files.map((rel) => {
        const raw = readSrc(SRC, rel);
        const r = minifyCss(raw);
        if (!r.minified) warn(`${rel} は縮小せずにまとめました(${r.reason})`);
        report.push({ file: rel, raw: Buffer.byteLength(raw), out: Buffer.byteLength(r.code), minified: r.minified });
        return r.code;
      }).join('\n') + '\n';
      const file = `${b.name}.${sha(code).slice(0, 10)}.css`;
      fs.writeFileSync(path.join(TMP, 'assets', file), code);
      assets.push({ kind: 'css', name: b.name, url: `assets/${file}`, block: b });
    }

    // ---- データを本体と詳細に分ける ----
    const snap = split.snapshotData(SRC, dataBlock.files);
    const { core, detail, moved } = split.splitData(snap.data);
    const back = split.firstDifference(split.mergeForCheck(core, detail), snap.data, 'APP_DATA');
    if (back) throw new Error(`本体と詳細を戻すと元のデータと違います: ${back}`);
    const coreJson = JSON.stringify(core);
    const detailJson = JSON.stringify(detail);
    const detailId = sha(`${coreJson}\n${detailJson}`).slice(0, 10);

    // ---- 詳細の束: 詳細の APP_DATA を戻す処理 + data-bundle="detail" のファイル ----
    const detailDataCode = `window.__appDetailOk=false;try{window.__appDetailOk=AppData._merge(${lit(detailId)},JSON.parse(${lit(detailJson)}))}catch(e){console.error('[bundle] detail',e);(window.__bundleErrors=window.__bundleErrors||[]).push('detail')}\n`;
    const doneCode = `try{AppData._done(${lit(detailId)},window.__appDetailOk)}catch(e){console.error('[bundle] detail',e)}\n`;
    const det = new Bundle();
    det.gen(detailDataCode);
    const minifiedApp = {};
    for (const rel of appOrder) minifiedApp[rel] = minifyFile(SRC, rel, report);
    // 取り込みに失敗したら画面のコードは定義しない(仮の値のデータで画面を描かないように。画面を開くとエラー画面になる)
    later.forEach((rel) => det.file(rel, minifiedApp[rel].raw, minifiedApp[rel].code, 'if(window.__appDetailOk)'));
    det.gen(doneCode);
    const detailFile = writeAsset(TMP, 'detail', det);
    const detailUrl = `assets/${detailFile}`;

    // ---- 本体のデータの束: 設定などのコード + 本体の APP_DATA + 詳細の束の場所 ----
    const dat = new Bundle();
    snap.codeFiles.forEach((rel) => {
      const m = minifyFile(SRC, rel, report);
      dat.file(rel, m.raw, m.code);
    });
    report.push({ file: `(本体のデータ ${snap.dataFiles.length}ファイル)`, raw: snap.dataFiles.reduce((s, f) => s + Buffer.byteLength(readSrc(SRC, f)), 0), out: Buffer.byteLength(coreJson), minified: true });
    dat.gen(`window.__APP_DETAIL__={src:${lit(detailUrl)},id:${lit(detailId)}};\n`);
    dat.gen(`try{window.APP_DATA=JSON.parse(${lit(coreJson)})}catch(e){console.error('[bundle] data',e);(window.__bundleErrors=window.__bundleErrors||[]).push('data')}\n`);
    if (snap.packs) dat.gen(`try{(function(p){ContentPack.list=function(){return p.slice();};})(JSON.parse(${lit(JSON.stringify(snap.packs))}))}catch(e){console.error('[bundle] data',e);(window.__bundleErrors=window.__bundleErrors||[]).push('data')}\n`);
    const dataFile = writeAsset(TMP, dataBlock.name, dat);
    assets.push({ kind: 'js', name: dataBlock.name, url: `assets/${dataFile}`, block: dataBlock });
    const coreDataCode = dat.code;

    // ---- 本体のコードの束: data-bundle="detail" のファイルは画面の代わり(AppData.lazyView)に置き換える ----
    const coreViews = new Set(appOrder.filter((f) => !later.includes(f)).flatMap((f) => viewNamesOf(f, minifiedApp[f].raw)));
    const clash = later.flatMap((f) => viewNamesOf(f, minifiedApp[f].raw)).filter((n) => coreViews.has(n));
    if (clash.length) throw new Error(`本体のファイルと詳細のファイルが同じ画面を定義しています: ${clash.join(', ')}`);
    const stubs = [];
    for (const b of appBlocks) {
      const bun = new Bundle();
      b.files.forEach((rel) => {
        const m = minifiedApp[rel];
        if (!b.later.has(rel)) {
          bun.file(rel, m.raw, m.code);
          if (ENGINE.includes(rel)) engine.push({ rel, code: wrap(rel, m.code) });
          return;
        }
        const names = viewNamesOf(rel, m.raw);
        if (!names.length) return; // 画面でないもの(図解など)は、詳細が届くまで無い(使う側が無いときの表示を持つ)
        stubs.push(...names);
        bun.gen(`try{window.Views=window.Views||{};${names.map((n) => `window.Views.${n}=AppData.lazyView(${lit(n)});`).join('')}}catch(e){console.error('[bundle] '+${lit(rel)},e);(window.__bundleErrors=window.__bundleErrors||[]).push(${lit(rel)})}\n`);
      });
      const file = writeAsset(TMP, b.name, bun);
      assets.push({ kind: 'js', name: b.name, url: `assets/${file}`, block: b });
    }

    // ---- 元のファイルと同じになるか ----
    const built = { coreDataCode, engine, detailDataCode: detailDataCode + doneCode };
    const eqLocal = checkEquivalence(SRC, built, 'localhost');
    checkEquivalence(SRC, built, PROD_HOST);
    const a = eqLocal.a;
    console.log(`データの一致を確認: 問題 ${a.quiz}・○×の文 ${a.statements}・用語 ${a.terms}・基礎知識 ${a.basics}(data ${a.dataHash} / statements ${a.statementsHash})`);
    console.log(`  本体だけでも同じ: 件数・○×の文の id と正誤(${a.skeletonHash})・索引(${a.indexHash})・整合性チェック ${a.issues}件(localhost と ${PROD_HOST})`);
    console.log(`  詳細に回した項目: ${Object.entries(moved).map(([k, n]) => `${k} ${n}`).join('・')}`);
    console.log(`  詳細に回したファイル ${later.length}件(画面の代わり ${stubs.join(', ')})`);

    // ---- index.html: 範囲を後ろから置き換える ----
    for (const asset of assets.slice().sort((x, y) => y.block.start - x.block.start)) {
      const tag = asset.kind === 'css' ? `<link rel="stylesheet" href="${asset.url}">` : `<script src="${asset.url}"></script>`;
      html = html.slice(0, asset.block.start) + tag + html.slice(asset.block.end);
    }
    const left = [...scriptList(html), ...styleList(html)].filter((s) => !assets.some((x) => x.url === s));
    if (left.length) throw new Error(`置き換えたあとの index.html に、まとめていないファイルが残っています: ${left.join(', ')}`);
    const PLACEHOLDER = '__APP_BUILD_ID__';
    if (!/<meta charset="utf-8">/i.test(html)) throw new Error('index.html に <meta charset="utf-8"> がありません');
    // 最初からホーム以外の画面を開いたとき(静的ページの「アプリで学ぶ」・共有されたリンク)は、詳細の束も本体と並べて読み込み始める
    // (js/appData.js が同じ URL の <script> を入れたときに使われる)。ホームのときは本体を先に届けるため読み込まない
    const preload = `<script>(function(){var h=(location.hash||'').replace(/^#/,'').split('/')[0];if(h&&h!=='home'){var l=document.createElement('link');l.rel='preload';l.as='script';l.href=${lit(detailUrl)};document.head.appendChild(l);}})();</script>`;
    new vm.Script(preload.replace(/^<script>|<\/script>$/g, ''));
    // Content-Security-Policy(公開版だけ。GitHub Pages はヘッダーを付けられないので <meta>)。スクリプトは同じサイトのファイルと、
    // index.html の中のスクリプト(起動の見張り・テーマ・上の preload)のハッシュだけを許す(万一 HTML に文字列が混ざっても実行されない)。
    // style 属性はテンプレートで使うので 'unsafe-inline'。画像・接続・Service Worker は同じサイトだけ。外部への通信はない
    const csp = (h) => {
      const hashes = inlineScripts(h).map((code) => `'sha256-${crypto.createHash('sha256').update(code, 'utf8').digest('base64')}'`);
      return `default-src 'self'; script-src 'self' ${[...new Set(hashes)].join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'self'`;
    };
    const policy = csp(html.replace(/<meta charset="utf-8">/i, (m) => `${m}\n  ${preload}`));
    html = html.replace(/<meta charset="utf-8">/i, (m) => `${m}\n  <meta http-equiv="Content-Security-Policy" content="${policy}">\n  <meta name="app-build" content="${PLACEHOLDER}">\n  ${preload}`);
    if (csp(html) !== policy || html.indexOf('http-equiv="Content-Security-Policy"') > html.search(/<script\b/i)) throw new Error('index.html の Content-Security-Policy が中のスクリプトと合いません');

    const copied = copyStatic(SRC, TMP);

    // プリキャッシュ: 入口・manifest・まとめたファイル(詳細の束も)・index.html が使うアイコン(起動画面の画像と OGP 画像は除く)
    const refs = localRefs(html);
    const iconRefs = refs.filter((r) => (r.tag === 'img') || (r.tag === 'link' && /(^|\s)(icon|apple-touch-icon|manifest)(\s|$)/.test(r.rel))).map((r) => r.url);
    const list = [...new Set(['index.html', 'manifest.json', ...assets.map((x) => x.url), detailUrl, ...iconRefs])].map((u) => `./${u}`);
    const template = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
    const h = crypto.createHash('sha256').update(template);
    for (const u of list) {
      const rel = u.slice(2);
      const buf = rel === 'index.html' ? Buffer.from(html) : fs.readFileSync(path.join(TMP, rel));
      h.update(`\0${rel}\0`).update(buf);
    }
    const buildId = h.digest('hex').slice(0, 10);
    html = html.replace(PLACEHOLDER, buildId);
    fs.writeFileSync(path.join(TMP, 'index.html'), html);
    const cacheName = `shojiki-gakushu-${buildId}`;
    const sw = generateSw(template, { cacheName, buildId, list });
    new vm.Script(sw, { filename: 'sw.js' });
    fs.writeFileSync(path.join(TMP, 'sw.js'), sw);

    // 出力先の確認
    const missing = [];
    list.forEach((u) => { if (!fs.existsSync(path.join(TMP, u.slice(2)))) missing.push(`precache ${u}`); });
    localRefs(html).forEach((r) => { if (!fs.existsSync(path.join(TMP, r.url))) missing.push(`index.html ${r.url}`); });
    const mf = JSON.parse(fs.readFileSync(path.join(TMP, 'manifest.json'), 'utf8'));
    [...(mf.icons || []), ...(mf.shortcuts || []).flatMap((s) => s.icons || [])].forEach((ic) => { if (!fs.existsSync(path.join(TMP, ic.src))) missing.push(`manifest ${ic.src}`); });
    if (missing.length) throw new Error(`出力先にないファイル: ${missing.join(', ')}`);
    if (!fs.readFileSync(path.join(TMP, 'index.html'), 'utf8').includes(buildId)) throw new Error('index.html に BUILD_ID が入っていません');
    if (!fs.readFileSync(path.join(TMP, 'assets', dataFile), 'utf8').includes(detailUrl)) throw new Error('本体のデータの束に詳細の束の場所が入っていません');

    // 大きさ
    const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(TMP, f)), { level: 9 }).length;
    const rows = ['index.html', 'sw.js', ...assets.map((x) => x.url), detailUrl].map((f) => ({ f, bytes: fs.statSync(path.join(TMP, f)).size, gzip: gz(f) }));
    const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
    console.log('\nファイル                               大きさ      gzip');
    rows.forEach((r) => console.log(`${r.f.padEnd(38)} ${kb(r.bytes).padStart(9)} ${kb(r.gzip).padStart(9)}`));
    const firstGz = rows.filter((r) => /\.(js|css)$/.test(r.f) && r.f.startsWith('assets/') && r.f !== detailUrl).reduce((s, r) => s + r.gzip, 0);
    const totalGz = rows.filter((r) => /\.(js|css)$/.test(r.f) && r.f.startsWith('assets/')).reduce((s, r) => s + r.gzip, 0);
    const rawBytes = report.reduce((s, r) => s + r.raw, 0);
    const outBytes = report.reduce((s, r) => s + r.out, 0);
    console.log(`縮小: ${report.length}ファイル ${kb(rawBytes)} → ${kb(outBytes)}(縮小しなかったファイル ${report.filter((r) => !r.minified).length}件)`);
    console.log(`JS+CSS の gzip: 初回の表示に要るもの ${kb(firstGz)}(目安 ${kb(BUDGET_FIRST)} 以内)・詳細を含めた合計 ${kb(totalGz)}(目安 ${kb(BUDGET_TOTAL)} 以内)`);
    if (firstGz > BUDGET_FIRST) warn(`初回の表示に要る JS+CSS の gzip ${kb(firstGz)} が目安の ${kb(BUDGET_FIRST)} を超えています(ホームの表示が遅くなります)`);
    if (totalGz > BUDGET_TOTAL) warn(`JS+CSS の gzip 合計 ${kb(totalGz)} が目安の ${kb(BUDGET_TOTAL)} を超えています(ホーム以外の画面が使えるまでが遅くなります)`);
    console.log(`CACHE_NAME ${cacheName}・プリキャッシュ ${list.length}件・そのままコピー ${copied.length}件`);

    // 出来上がったものだけを出力先に置く
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.renameSync(TMP, OUT);
    console.log(`\nビルド完了: ${OUT}`);
  } catch (e) {
    fs.rmSync(TMP, { recursive: true, force: true });
    console.error(GH ? `::error::ビルドに失敗しました: ${e.message}` : `ビルドに失敗しました: ${e.stack || e.message}`);
    process.exit(1);
  }
}

main();
