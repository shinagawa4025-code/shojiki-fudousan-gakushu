// 公開用ビルド(GitHub Actions で実行。ローカル開発ではビルドせず webapp をそのまま開く)
// 使い方: node tools/build.js <webapp> <出力先>      例: node tools/build.js webapp _site
//
// 1. index.html の <!-- build:css … --> / <!-- build:js … --> 〜 <!-- /build --> の範囲ごとに、ファイルを順番どおりにつなげて
//    assets/<名前>.<内容のハッシュ10桁>.css / .js にまとめる。JS は1ファイルずつ try { } で包む(1つが実行時エラーでも残りは動く。
//    別々の <script> と同じ)。縮小は控えめ(tools/lib/minify.js: コメントと不要な空白だけ。文字列・テンプレートの中身は触らない。行番号は元と同じ)
// 2. まとめたデータを Node で読み込み、元のファイルと同じ内容になることを確かめる(問題・○×の文・索引のハッシュを比較)
// 3. index.html の範囲を1つの <link> / <script> に置き換え、<meta name="app-build"> を入れる
// 4. sw.js をひな形から作る: CACHE_NAME = shojiki-gakushu-<ハッシュ>、BUILD_ID、PRECACHE_URLS(index.html・manifest・まとめたファイル・index.html のアイコン)
// 5. index.html・manifest が参照するファイルと、プリキャッシュのファイルがすべて出力先にあることを確かめる
// 6. 大きさの表を出す(JS と CSS の gzip 合計が 650KB を超えたら警告)
// どこかで失敗したら終了コード1で終わり、出力先は作らない(途中までのサイトを残さない)。CI はそのとき元のファイルのまま公開する。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const vm = require('vm');
const { minifyJs, minifyCss, topLevelLexical, countNl } = require('./lib/minify.js');
const { loadApp, summarize, scriptList, styleList } = require('./lib/appload.js');
const { parseBlocks, localRefs, generateSw } = require('./lib/html.js');

const BUDGET_GZIP = 650 * 1024;
const SKIP_DIRS = new Set(['js', 'css', 'data']); // まとめたので公開しない(古い Service Worker が新旧のファイルを混ぜて保存しないように)
const JUNK = /^(desktop\.ini|thumbs\.db|\..*)$/i;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const GH = !!process.env.GITHUB_ACTIONS;
const warn = (m) => console.log(GH ? `::warning::${m}` : `WARN ${m}`);

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

function buildJs(src, block, report) {
  const parts = [];
  const lineMap = [];
  const contents = [];
  const minified = {};
  block.files.forEach((rel, idx) => {
    const raw = readSrc(src, rel);
    const lex = topLevelLexical(raw);
    if (lex.length) throw new Error(`${rel}: ファイルの最上位に ${lex.join(', ')} があります(try { } で包むと他のファイルから見えなくなる)`);
    const r = minifyJs(raw, rel);
    if (!r.minified) warn(`${rel} は縮小せずにまとめました(${r.reason})`);
    report.push({ file: rel, raw: Buffer.byteLength(raw), out: Buffer.byteLength(r.code), minified: r.minified });
    minified[rel] = r.code;
    contents.push(raw);
    const wrapped = wrap(rel, r.code);
    parts.push(wrapped);
    lineMap.push(null); // try{
    const n = countNl(r.code) + 1;
    for (let i = 0; i < n; i++) lineMap.push({ src: idx, line: i });
    lineMap.push(null); // }catch…
  });
  return { code: parts.join(''), lineMap, contents, minified };
}

function wrap(rel, code) {
  const name = JSON.stringify(rel);
  return `try{\n${code}\n}catch(e){console.error('[bundle] '+${name},e);(window.__bundleErrors=window.__bundleErrors||[]).push(${name})}\n`;
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

    const report = [];
    const assets = []; // { kind, name, url }
    const allMinified = {};
    for (const b of blocks) {
      let code;
      let ext;
      let map = null;
      if (b.kind === 'css') {
        ext = 'css';
        code = b.files.map((rel) => {
          const raw = readSrc(SRC, rel);
          const r = minifyCss(raw);
          if (!r.minified) warn(`${rel} は縮小せずにまとめました(${r.reason})`);
          report.push({ file: rel, raw: Buffer.byteLength(raw), out: Buffer.byteLength(r.code), minified: r.minified });
          return r.code;
        }).join('\n') + '\n';
      } else {
        ext = 'js';
        const r = buildJs(SRC, b, report);
        code = r.code;
        Object.assign(allMinified, r.minified);
        // まとめたファイル全体が1つのスクリプトとしてコンパイルできること
        new vm.Script(code, { filename: `${b.name}.js` });
        map = r;
      }
      const hash = sha(code).slice(0, 10);
      const file = `${b.name}.${hash}.${ext}`;
      if (map) {
        fs.writeFileSync(path.join(TMP, 'assets', `${file}.map`), sourceMap(file, map.lineMap, b.files, map.contents));
        code += `//# sourceMappingURL=${file}.map\n`;
      }
      fs.writeFileSync(path.join(TMP, 'assets', file), code);
      assets.push({ kind: b.kind, name: b.name, url: `assets/${file}`, block: b });
    }

    // まとめたデータが元と同じ内容か(try で包んだ縮小後のコードを1ファイルずつ読み込んで比較)
    const rawApp = loadApp(SRC, { hostname: 'localhost' });
    const bltApp = loadApp(SRC, { hostname: 'localhost', transform: (rel, code) => (Object.prototype.hasOwnProperty.call(allMinified, rel) ? wrap(rel, allMinified[rel]) : code) });
    const a = summarize(rawApp.ctx);
    const b = summarize(bltApp.ctx);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`まとめたデータの内容が元と違います: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    if (bltApp.ctx.__bundleErrors) throw new Error(`まとめたデータの読み込みでエラー: ${bltApp.ctx.__bundleErrors.join(', ')}`);
    // 公開サイト(整合性チェックを省く)でも同じ内容になること
    const prodApp = loadApp(SRC, { hostname: 'shinagawa4025-code.github.io', transform: (rel, code) => (Object.prototype.hasOwnProperty.call(allMinified, rel) ? wrap(rel, allMinified[rel]) : code) });
    const c = summarize(prodApp.ctx);
    if (JSON.stringify(Object.assign({}, a, { issues: 0 })) !== JSON.stringify(Object.assign({}, c, { issues: 0 }))) throw new Error(`公開サイトの条件で読み込んだデータが違います: ${JSON.stringify(c)}`);
    console.log(`データの一致を確認: 問題 ${a.quiz}・○×の文 ${a.statements}・用語 ${a.terms}・基礎知識 ${a.basics}(data ${a.dataHash} / statements ${a.statementsHash})`);

    // index.html: 範囲を後ろから置き換える
    for (const asset of assets.slice().sort((x, y) => y.block.start - x.block.start)) {
      const tag = asset.kind === 'css' ? `<link rel="stylesheet" href="${asset.url}">` : `<script src="${asset.url}"></script>`;
      html = html.slice(0, asset.block.start) + tag + html.slice(asset.block.end);
    }
    const left = [...scriptList(html), ...styleList(html)].filter((s) => !assets.some((x) => x.url === s));
    if (left.length) throw new Error(`置き換えたあとの index.html に、まとめていないファイルが残っています: ${left.join(', ')}`);
    const PLACEHOLDER = '__APP_BUILD_ID__';
    if (!/<meta charset="utf-8">/i.test(html)) throw new Error('index.html に <meta charset="utf-8"> がありません');
    html = html.replace(/<meta charset="utf-8">/i, (m) => `${m}\n  <meta name="app-build" content="${PLACEHOLDER}">`);

    const copied = copyStatic(SRC, TMP);

    // プリキャッシュ: 入口・manifest・まとめたファイル・index.html が使うアイコン(起動画面の画像と OGP 画像は除く)
    const refs = localRefs(html);
    const iconRefs = refs.filter((r) => (r.tag === 'img') || (r.tag === 'link' && /(^|\s)(icon|apple-touch-icon|manifest)(\s|$)/.test(r.rel))).map((r) => r.url);
    const list = [...new Set(['index.html', 'manifest.json', ...assets.map((x) => x.url), ...iconRefs])].map((u) => `./${u}`);
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

    // 大きさ
    const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(TMP, f)), { level: 9 }).length;
    const rows = ['index.html', 'sw.js', ...assets.map((x) => x.url)].map((f) => ({ f, bytes: fs.statSync(path.join(TMP, f)).size, gzip: gz(f) }));
    const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
    console.log('\nファイル                               大きさ      gzip');
    rows.forEach((r) => console.log(`${r.f.padEnd(38)} ${kb(r.bytes).padStart(9)} ${kb(r.gzip).padStart(9)}`));
    const totalGz = rows.filter((r) => /\.(js|css)$/.test(r.f) && r.f.startsWith('assets/')).reduce((s, r) => s + r.gzip, 0);
    const rawBytes = report.reduce((s, r) => s + r.raw, 0);
    const outBytes = report.reduce((s, r) => s + r.out, 0);
    console.log(`縮小: ${report.length}ファイル ${kb(rawBytes)} → ${kb(outBytes)}(縮小しなかったファイル ${report.filter((r) => !r.minified).length}件)`);
    console.log(`JS+CSS の gzip 合計 ${kb(totalGz)}(目安 ${kb(BUDGET_GZIP)} 以内)`);
    if (totalGz > BUDGET_GZIP) warn(`JS+CSS の gzip 合計 ${kb(totalGz)} が目安の ${kb(BUDGET_GZIP)} を超えています(初回の読み込みが遅くなります)`);
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
