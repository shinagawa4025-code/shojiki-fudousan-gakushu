// 検索エンジンに載るための静的ページ(learn/)と sitemap.xml を作る(公開時に GitHub Actions で実行。ローカル開発では使わない)
// 使い方: node tools/static_pages.js <サイトのフォルダ> [--webapp <webapp>]
//   例: node tools/build.js webapp _site && node tools/static_pages.js _site --webapp webapp
//
// アプリはハッシュURL(#topics/…)で画面を切り替えるため、本文が検索エンジンに載らない。そこで、同じデータから
// JavaScript なしで読めるページを作る(アプリの動きは変えない。Service Worker のプリキャッシュにも入れない)。
//   learn/index.html            学べるテーマの一覧(アプリのトピック一覧と同じ 暮らし・取引 / 宅建士試験 / 税理士試験 の分け方)
//   learn/<トピックID>.html      トピックの小見出しごとの基礎知識・用語・図解
//   learn/term/<用語ID>.html     用語・基礎知識1件(作品で学ぶ専用の俗語 worksOnly は除く)
//   learn/figure/<図解ID>.html   図解1点(アプリの使い方の図は除く)
//   learn/learn.css             共通のCSS(アプリのデザイントークンと .dg-* の規則から作る。ライト/ダークは OS の設定に従う)
//   sitemap.xml                 アプリの入口と上のページすべて(lastmod は SITE.contentAsOf)
// データは --webapp(既定: サイトのフォルダが元のファイルならそこ、なければ ../webapp)を Node の vm で読む(tools/lib/appload.js)。
// 4択の問題文は載せない。文字列はすべてエスケープする(図解の SVG はアプリと同じものをそのまま入れる)。
// 書き出す前にリンク切れ・title/description/canonical の重複・載せてはいけない語を確かめ、問題があれば何も書かずに終了コード1で終わる。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadApp, styleList } = require('./lib/appload.js');

const GH = !!process.env.GITHUB_ACTIONS;
const warn = (m) => console.log(GH ? `::warning::static_pages: ${m}` : `WARN ${m}`);
const posix = path.posix;

// 載せてはいけない語(作品名。作品で学ぶコーナーの内容は静的ページに出さない)
const FORBIDDEN = [`正直不動産`];
// meta description の長さの目安(文字数)
const DESC_MAX = 110;

// ---- 小さな道具 ----
const esc = (s) => String(s == null ? `` : s).replace(/[&<>"']/g, (c) => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&#39;` }[c]));
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&apos;` }[c]));
// JSON-LD は <script> の中に置くので、</script> などで閉じられないよう < > & をエスケープする
const ldJson = (obj) => JSON.stringify(obj).replace(/</g, `\\u003c`).replace(/>/g, `\\u003e`).replace(/&/g, `\\u0026`);
const oneLine = (s) => String(s == null ? `` : s).replace(/\s+/g, ` `).trim();
function trunc(s, max) {
  const chars = Array.from(oneLine(s));
  return chars.length > max ? `${chars.slice(0, max - 1).join(``)}…` : chars.join(``);
}
// 用語のページの description。ひとことの説明が短い(検索結果で中身が伝わりにくい)ときは、詳しい説明の最初の部分を続ける
const DESC_SHORT = 60;
function termDescription(t) {
  const s = oneLine(t.simpleExplanation);
  const more = oneLine(t.deepDive);
  if (Array.from(s).length >= DESC_SHORT || !more) return trunc(s, DESC_MAX);
  return trunc(`${s.replace(/[。.]$/, ``)}。${more}`, DESC_MAX);
}
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
// 公開パス → 書き出すファイル('learn/' → 'learn/index.html')
const fileOf = (p) => (p.endsWith(`/`) ? `${p}index.html` : p);

// 公開パス('' = アプリの入口、'learn/' = ディレクトリ、'learn/x.html' = ファイル)への相対リンク
// from が 'learn/' のようにディレクトリのときは、その中の index.html から見たリンクにする
function rel(from, to) {
  const fromDir = from.endsWith(`/`) ? from.slice(0, -1) : (posix.dirname(from) === `.` ? `` : posix.dirname(from));
  if (to === `` || to.endsWith(`/`)) {
    const r = posix.relative(fromDir, to.replace(/\/$/, ``));
    return r ? `${r}/` : `./`;
  }
  const r = posix.relative(fromDir, posix.dirname(to) === `.` ? `` : posix.dirname(to));
  return r ? `${r}/${posix.basename(to)}` : posix.basename(to);
}

function parseArgs(argv) {
  const out = { site: null, webapp: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--webapp`) out.webapp = argv[++i];
    else if (!argv[i].startsWith(`--`) && !out.site) out.site = argv[i];
    else throw new Error(`知らない引数: ${argv[i]}`);
  }
  return out;
}

// ---- CSS: アプリのトークンと図解の規則を取り出す ----
// コメントを除いた最上位の規則 { selector, body }(@media などのブロックは selector が @ で始まる)
function cssRules(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, ``);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf(`{`, i);
    if (open < 0) break;
    const selector = s.slice(i, open).replace(/^(\s*@[^{;]*;)+/, ``).trim();
    let depth = 1;
    let j = open + 1;
    while (j < s.length && depth > 0) {
      if (s[j] === `{`) depth++;
      else if (s[j] === `}`) depth--;
      j++;
    }
    if (depth !== 0) throw new Error(`CSS の { } の対応が取れません(${selector.slice(0, 40)})`);
    out.push({ selector, body: s.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

// 規則の中の宣言(カスタムプロパティと color-scheme だけ)
function tokenDecls(body) {
  return body.split(`;`).map((d) => d.trim()).filter((d) => /^(--[\w-]+|color-scheme)\s*:/.test(d));
}

function buildCss(webapp, html) {
  const files = styleList(html);
  if (!files.length) throw new Error(`index.html に CSS がありません`);
  const light = [];
  const dark = [];
  const dg = [];
  const dgDark = [];
  const DARK = /^:root\[data-theme="dark"\]/;
  for (const rel of files) {
    const rules = cssRules(fs.readFileSync(path.join(webapp, rel), `utf8`));
    for (const r of rules) {
      if (r.selector === `:root`) light.push(...tokenDecls(r.body));
      else if (r.selector === `:root[data-theme="dark"]`) dark.push(...tokenDecls(r.body));
      else {
        const sels = r.selector.split(`,`).map((x) => x.trim());
        if (sels.every((x) => /^\.dg(?![\w])|^\.dg-[\w-]+/.test(x))) dg.push(`${sels.join(`, `)} { ${oneLine(r.body).replace(/;?\s*$/, `;`)} }`);
        else if (sels.every((x) => DARK.test(x) && /\s\.dg(-[\w-]+)?\b/.test(x))) dgDark.push(`${sels.map((x) => x.replace(DARK, `:root`)).join(`, `)} { ${oneLine(r.body).replace(/;?\s*$/, `;`)} }`);
      }
    }
  }
  if (light.length < 20 || dark.length < 10) throw new Error(`CSS のトークン(:root と :root[data-theme="dark"])を読めません(${light.length}・${dark.length}件)`);
  if (!dg.some((r) => /^\.dg \{/.test(r))) throw new Error(`図解の CSS(.dg { … })が見つかりません`);
  const tokenOf = (list, name) => {
    const d = list.slice().reverse().find((x) => x.startsWith(`${name}:`));
    return d ? d.slice(name.length + 1).trim() : null;
  };
  const css = `/* 学べるテーマ(静的ページ)の共通CSS。tools/static_pages.js が css/*.css のトークンと図解(.dg-*)の規則から作る。直接編集しない */
:root {
  ${light.join(`;\n  `)};
  --lp-max: 760px;
}
@media (prefers-color-scheme: dark) {
  :root {
    ${dark.join(`;\n    `)};
  }
${dgDark.map((r) => `  ${r}`).join(`\n`)}
}
${LAYOUT_CSS}
/* 図解(css/style.css と同じ規則) */
${dg.join(`\n`)}
`;
  return { css, themeLight: tokenOf(light, `--color-surface`), themeDark: tokenOf(dark, `--color-surface`) };
}

// 静的ページのレイアウト(色はすべてトークン経由)
const LAYOUT_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: var(--lh-body);
  letter-spacing: .02em;
  -webkit-font-smoothing: antialiased;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
h1, h2, h3 { color: var(--color-heading); line-height: var(--lh-tight); font-weight: var(--fw-bold); letter-spacing: .03em; font-feature-settings: "palt"; text-wrap: pretty; word-break: auto-phrase; }
h1 { font-size: var(--fs-2xl); margin: 0 0 var(--sp-3); }
h2 { font-size: var(--fs-lg); margin: var(--sp-8) 0 var(--sp-3); }
h3 { font-size: var(--fs-base); margin: var(--sp-6) 0 var(--sp-2); }
p { margin: 0 0 var(--sp-3); }
a { color: var(--color-primary); text-underline-offset: 3px; text-decoration-thickness: 1px; }
a:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; border-radius: var(--radius-xs); }
::selection { background: var(--color-primary-soft); color: var(--color-text); }
.lp-skip { position: absolute; left: var(--sp-2); top: -64px; z-index: 10; padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); font-weight: var(--fw-ui); }
.lp-skip:focus { top: var(--sp-2); }

/* ヘッダー */
.lp-header { background: var(--color-surface); border-bottom: 1px solid var(--color-border); padding-top: var(--safe-top); }
.lp-header-inner { max-width: var(--lp-max); margin: 0 auto; min-height: var(--app-bar-h); padding: var(--sp-2) var(--sp-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.lp-brand { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--color-heading); font-weight: var(--fw-bold); font-size: var(--fs-lg); text-decoration: none; letter-spacing: .04em; }
.lp-brand img { flex-shrink: 0; }
.lp-open { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 36px; padding: 0 var(--sp-4); border-radius: var(--radius-pill); background: var(--color-primary-soft); color: var(--color-primary); font-size: var(--fs-sm); font-weight: var(--fw-ui); text-decoration: none; }
@media (hover: hover) { .lp-open:hover { background: var(--color-primary-fill); color: var(--color-on-primary); } }

/* 本文 */
.lp-main { max-width: var(--lp-max); margin: 0 auto; padding: var(--sp-4) var(--sp-4) var(--sp-9); }
.lp-crumbs ol { list-style: none; margin: 0 0 var(--sp-5); padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--sp-1); font-size: var(--fs-sm); line-height: var(--lh-snug); color: var(--color-text-muted); }
.lp-crumbs li { display: inline-flex; align-items: center; gap: var(--sp-1); }
.lp-crumbs li + li::before { content: "›"; color: var(--color-text-muted); }
.lp-crumbs a { color: var(--color-text-muted); text-decoration: underline; display: inline-block; padding-block: 4px; }
.lp-crumbs [aria-current] { color: var(--color-text); }
.lp-kicker { margin: 0 0 var(--sp-1); color: var(--color-text-muted); font-size: var(--fs-sm); font-weight: var(--fw-ui); }
.lp-tags { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1) var(--sp-3); margin: 0 0 var(--sp-5); color: var(--color-text-muted); font-size: var(--fs-sm); }
.lp-level { display: inline-flex; align-items: center; padding: 2px var(--sp-2); border-radius: var(--radius-pill); font-size: var(--fs-2xs); font-weight: var(--fw-bold); line-height: 1.5; letter-spacing: .04em; white-space: nowrap; }
.lp-level-1 { background: var(--lv-1-bg); color: var(--lv-1-fg); }
.lp-level-2 { background: var(--lv-2-bg); color: var(--lv-2-fg); }
.lp-level-3 { background: var(--lv-3-bg); color: var(--lv-3-fg); }
.lp-level-4 { background: var(--lv-4-bg); color: var(--lv-4-fg); }
.lp-lead, .lp-intro { font-size: var(--fs-read); line-height: var(--lh-read); color: var(--color-text); margin: 0 0 var(--sp-5); }
.lp-card { background: var(--color-surface); border: 1px solid var(--card-border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: var(--sp-5) var(--sp-4); }
.lp-card > :last-child { margin-bottom: 0; }
.lp-card > h2:first-child { margin-top: 0; }
section.lp-card { margin-top: var(--sp-5); }

/* 試験のポイント・もう一歩踏み込むと(アプリの .term-deep と同じ見た目) */
.lp-deep { margin: 0 0 var(--sp-4); padding: var(--sp-3) var(--sp-4); border-left: 4px solid var(--color-primary-fill); border-radius: var(--radius-md); background: var(--color-surface-muted); color: var(--color-text); font-size: .96875rem; line-height: var(--lh-read); }
.lp-deep-label { display: block; margin: 0 0 2px; color: var(--color-primary); font-size: var(--fs-xs); font-weight: var(--fw-bold); letter-spacing: .04em; }
.lp-deep p { margin: 0; }

/* 根拠条文・注記 */
.lp-law { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 var(--sp-3); color: var(--color-text-muted); font-size: var(--fs-sm); line-height: var(--lh-snug); }
.lp-law-label { flex-shrink: 0; font-weight: var(--fw-ui); }
.lp-chip { display: inline-block; max-width: 100%; padding: 2px var(--sp-2); border-radius: var(--radius-sm); background: var(--color-primary-soft); color: var(--color-primary); font-size: var(--fs-sm); font-weight: var(--fw-ui); line-height: var(--lh-snug); }
.lp-note { margin: 0 0 var(--sp-3); color: var(--color-text-muted); font-size: var(--fs-sm); line-height: var(--lh-snug); }
.lp-asof { margin: var(--sp-2) 0 0; color: var(--color-text-muted); font-size: var(--fs-xs); }

/* 図解 */
.lp-figure { margin: var(--sp-5) 0; padding: var(--sp-4) var(--sp-3) var(--sp-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.lp-figure-title { margin: 0 0 var(--sp-2); color: var(--color-heading); font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.lp-figure figcaption { margin-top: var(--sp-2); color: var(--color-text-muted); font-size: var(--fs-xs); line-height: var(--lh-snug); }
.lp-figure-link { display: inline-block; padding-block: 4px; margin-top: var(--sp-2); font-size: var(--fs-sm); font-weight: var(--fw-ui); }
.lp-figure-large .dg { max-width: 640px; }

/* アプリへのボタン */
.lp-cta { margin: var(--sp-6) 0; padding: var(--sp-4); border-radius: var(--radius-card); background: var(--color-primary-soft); }
.lp-cta p { margin: var(--sp-2) 0 0; color: var(--color-text); font-size: var(--fs-sm); line-height: var(--lh-snug); }
.lp-btn { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); min-height: 48px; padding: var(--sp-2) var(--sp-5); border-radius: var(--radius-md); background: var(--color-primary-fill); color: var(--color-on-primary); font-weight: var(--fw-bold); text-align: center; text-decoration: none; }
@media (hover: hover) { .lp-btn:hover { background: var(--color-primary-fill-hover); } }
@media (min-width: 600px) { .lp-btn { display: inline-flex; } }

/* 一覧 */
.lp-list { list-style: none; margin: 0; padding: 0; background: var(--color-surface); border: 1px solid var(--card-border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); overflow: hidden; }
.lp-list li + li { border-top: 1px solid var(--color-border); }
.lp-list a { display: block; padding: var(--sp-3) var(--sp-4); color: var(--color-text); text-decoration: none; }
@media (hover: hover) { .lp-list a:hover { background: var(--color-surface-muted); } .lp-list a:hover .lp-item-name { text-decoration: underline; } }
.lp-item-name { display: block; color: var(--color-primary); font-weight: var(--fw-ui); line-height: var(--lh-snug); }
.lp-item-desc { display: block; margin-top: 2px; color: var(--color-text-muted); font-size: var(--fs-md); line-height: var(--lh-snug); }
.lp-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1) var(--sp-2); margin-top: var(--sp-2); color: var(--color-text-muted); font-size: var(--fs-xs); }
.lp-grid { display: grid; grid-template-columns: 1fr; gap: var(--sp-3); list-style: none; margin: 0; padding: 0; }
@media (min-width: 600px) { .lp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lp-grid a { display: block; height: 100%; padding: var(--sp-4); border: 1px solid var(--card-border); border-radius: var(--radius-card); background: var(--color-surface); box-shadow: var(--shadow-card); color: var(--color-text); text-decoration: none; }
@media (hover: hover) { .lp-grid a:hover { box-shadow: var(--shadow-card-hover); } .lp-grid a:hover .lp-item-name { text-decoration: underline; } }
.lp-group-meta { margin-left: var(--sp-2); color: var(--color-text-muted); font-size: var(--fs-sm); font-weight: var(--fw-regular); }
.lp-track { margin-top: var(--sp-8); }
.lp-track > h2 { margin-top: 0; padding-bottom: var(--sp-2); border-bottom: 2px solid var(--color-border); }
.lp-chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); list-style: none; margin: 0; padding: 0; }
.lp-chips a { display: inline-flex; align-items: center; min-height: 36px; padding: var(--sp-1) var(--sp-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-primary); font-size: var(--fs-sm); font-weight: var(--fw-ui); text-decoration: none; line-height: var(--lh-snug); }
@media (hover: hover) { .lp-chips a:hover { border-color: var(--color-primary); } }
.lp-sources { margin: 0; padding-left: 1.2em; font-size: var(--fs-sm); line-height: var(--lh-snug); }
.lp-sources li + li { margin-top: var(--sp-2); }
.lp-sources span { display: block; color: var(--color-text-muted); font-size: var(--fs-xs); }
.lp-laws { margin: 0; padding: 0; list-style: none; }
.lp-laws li { padding: var(--sp-3) 0; border-top: 1px solid var(--color-border); }
.lp-laws li:first-child { border-top: 0; padding-top: 0; }
.lp-laws strong { display: block; color: var(--color-heading); }
.lp-laws span { display: block; color: var(--color-text-muted); font-size: var(--fs-md); line-height: var(--lh-snug); }

/* 前後のページ */
.lp-pager { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin-top: var(--sp-8); }
.lp-pager a { display: block; padding: var(--sp-3) var(--sp-4); border: 1px solid var(--card-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-card); color: var(--color-primary); font-weight: var(--fw-ui); line-height: var(--lh-snug); text-decoration: none; }
.lp-pager small { display: block; color: var(--color-text-muted); font-size: var(--fs-xs); font-weight: var(--fw-regular); }
.lp-pager-next { grid-column: 2; text-align: right; }

/* フッター */
.lp-footer { border-top: 1px solid var(--color-border); padding: var(--sp-6) var(--sp-4) calc(var(--sp-7) + var(--safe-bottom)); color: var(--color-text-muted); font-size: var(--fs-xs); line-height: var(--lh-snug); text-align: center; }
.lp-footer p { max-width: 52em; margin: 0 auto; text-wrap: pretty; }
.lp-footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 var(--sp-4); margin-top: var(--sp-2); }
.lp-footer-links a { display: inline-block; padding-block: 6px; color: var(--color-text-muted); font-weight: var(--fw-ui); text-decoration: none; }
@media (hover: hover) { .lp-footer-links a:hover { color: var(--color-primary); text-decoration: underline; } }

@media (min-width: 768px) {
  h1 { font-size: var(--fs-3xl); }
  h2 { font-size: var(--fs-xl); }
  .lp-main { padding-top: var(--sp-6); }
  .lp-card { padding: var(--sp-6); }
}
@media print {
  .lp-header, .lp-cta, .lp-pager, .lp-skip { display: none; }
}
`;

// ---- アプリの画面と同じ分け方・表記を取り出す ----
// js/views/topics.js の TRACKS・LIFE_GROUPS(配列リテラル)。読めないときは同じ内容の控えを使う
const FALLBACK_TRACKS = [{ id: `life`, label: `暮らし・取引` }, { id: `takken`, label: `宅建士試験` }, { id: `zeirishi`, label: `税理士試験` }];
const FALLBACK_LIFE = [
  { id: `rent`, name: `住まいを借りる`, ids: [`topicI`, `topicA`] },
  { id: `own`, name: `買う・持つ・売る`, ids: [`topicB`, `topicC`, `topicD`, `topicP`, `topicQ`, `topicE`, `topicH`] },
  { id: `trade`, name: `業界のしくみとトラブル`, ids: [`topicF`, `topicG`] },
];
function literalFrom(src, name, fallback, file) {
  const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n {2}\\]);`));
  if (m) {
    try {
      const v = vm.runInNewContext(`(${m[1]})`, {}, { timeout: 1000 });
      if (Array.isArray(v) && v.length) return v;
    } catch (e) { /* 下で控えを使う */ }
  }
  warn(`${file} の ${name} を読めないため、控えの内容を使います`);
  return fallback;
}

// js/views/figures.js の APP_HELP_IDS(アプリの使い方の図。静的ページには載せない)
function appHelpIds(webapp) {
  const file = path.join(webapp, `js/views/figures.js`);
  const src = fs.existsSync(file) ? fs.readFileSync(file, `utf8`) : ``;
  const m = src.match(/const APP_HELP_IDS = (\[[^\]]*\]);/);
  if (m) {
    try { return vm.runInNewContext(`(${m[1]})`, {}, { timeout: 1000 }); } catch (e) { /* 下で控え */ }
  }
  warn(`js/views/figures.js の APP_HELP_IDS を読めないため、srs-cycle だけを除きます`);
  return [`srs-cycle`];
}

// index.html のフッター(免責の文・このアプリについてのリンク)
function footerFrom(html, asOfJa) {
  const out = {
    text: `個人が運営する非公式の学習アプリです。内容は${asOfJa}時点の法令・公表資料に基づく一般的な解説で、個別の法律・税務相談には当たりません。`,
    links: [[`このアプリについて`, `#about`], [`プライバシー`, `#about/privacy`], [`免責事項`, `#about/terms`], [`更新履歴`, `#about/changelog`]],
  };
  const m = html.match(/<footer\b[^>]*class="app-footer"[^>]*>([\s\S]*?)<\/footer>/);
  if (!m) { warn(`index.html のフッターが見つからないため、控えの文を使います`); return out; }
  const p = m[1].match(/<p>([\s\S]*?)<\/p>/);
  if (p) {
    const text = oneLine(p[1].replace(/<span data-role="as-of">[\s\S]*?<\/span>/, asOfJa).replace(/<[^>]+>/g, ``));
    if (text) out.text = text;
  }
  const links = [...m[1].matchAll(/<a\b[^>]*href="(#[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((a) => [oneLine(a[2].replace(/<[^>]+>/g, ``)), a[1]]).filter((l) => l[0]);
  if (links.length) out.links = links;
  return out;
}

const LEVEL_CLASS = (level) => {
  const s = String(level || ``);
  if (s.includes(`超入門`)) return 1;
  if (s.includes(`上`)) return 4;
  if (s.includes(`中`)) return 3;
  return 2;
};

// ---- データの読み込み ----
function loadModel(webapp) {
  const { ctx, html, logs } = loadApp(webapp, { hostname: `localhost` });
  if (!ctx.APP_DATA || !ctx.AppIndex || !ctx.SITE) throw new Error(`アプリのデータ(APP_DATA・AppIndex・SITE)を読み込めません`);
  if (ctx.AppIndex.issues.length) warn(`データ整合性チェックの警告 ${ctx.AppIndex.issues.length}件(node tools/check.js で確認)`);
  logs.error.forEach((m) => warn(`読み込み中のエラー: ${m.split(`\n`)[0]}`));
  // 図解と、カードの表記(試験のポイント/もう一歩踏み込むと・根拠条文の分け方)はアプリと同じ関数を使う
  ctx.UI = ctx.UI || { icon: () => ``, escapeHtml: esc };
  for (const f of [`js/diagrams.js`, `js/cardUi.js`]) {
    vm.runInContext(fs.readFileSync(path.join(webapp, f), `utf8`).replace(/^﻿/, ``), ctx, { filename: f });
  }
  if (!ctx.Diagrams || !ctx.Diagrams.defs) throw new Error(`js/diagrams.js から Diagrams.defs を読めません`);
  if (!ctx.CardUi || typeof ctx.CardUi.deepDiveLabel !== `function`) throw new Error(`js/cardUi.js から CardUi を読めません`);
  return { ctx, html };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.site) throw new Error(`使い方: node tools/static_pages.js <サイトのフォルダ> [--webapp <webapp>]`);
  const SITE_DIR = path.resolve(args.site);
  if (!fs.existsSync(path.join(SITE_DIR, `index.html`))) throw new Error(`${SITE_DIR}/index.html がありません(先にビルドするか、元のファイルをコピーする)`);
  const WEBAPP = path.resolve(args.webapp || (fs.existsSync(path.join(SITE_DIR, `js/diagrams.js`)) ? SITE_DIR : path.join(__dirname, `..`, `webapp`)));

  const { ctx, html } = loadModel(WEBAPP);
  const D = ctx.APP_DATA;
  const I = ctx.AppIndex;
  const S = ctx.SITE;
  const CU = ctx.CardUi;
  const DG = ctx.Diagrams;
  const BASE = String(S.url || ``).replace(/\/?$/, `/`);
  if (!/^https:\/\/[^/]+\/.*\/$/.test(BASE)) throw new Error(`SITE.url が https:// で始まる絶対URLではありません: ${S.url}`);
  const NAME = String(S.name);
  const asOf = String(S.contentAsOf || ``);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`SITE.contentAsOf が YYYY-MM-DD ではありません: ${asOf}`);
  const asOfJa = ctx.DateUtil && typeof ctx.DateUtil.toJapanese === `function` ? ctx.DateUtil.toJapanese(asOf) : asOf;
  const lawAsOf = (t) => { const m = String(t.asOf || asOf).match(/^(\d{4})-(\d{1,2})/); return m ? `${m[1]}年${Number(m[2])}月時点の法令に基づく` : ``; };
  const { css, themeLight, themeDark } = buildCss(WEBAPP, html);
  const cssHash = crypto.createHash(`sha256`).update(css).digest(`hex`).slice(0, 10);
  const footer = footerFrom(html, asOfJa);
  const topicsSrc = fs.readFileSync(path.join(WEBAPP, `js/views/topics.js`), `utf8`);
  const TRACKS = literalFrom(topicsSrc, `TRACKS`, FALLBACK_TRACKS, `js/views/topics.js`);
  const LIFE_GROUPS = literalFrom(topicsSrc, `LIFE_GROUPS`, FALLBACK_LIFE, `js/views/topics.js`);
  const OG_IMAGE = `icons/og-image.png`;
  for (const f of [OG_IMAGE, `icons/logo.svg`, `icons/icon-192.png`, `icons/apple-touch-icon.png`]) {
    if (!fs.existsSync(path.join(SITE_DIR, f))) throw new Error(`サイトに ${f} がありません`);
  }

  // ---- 載せる項目 ----
  const topics = D.topics.filter((t) => t && SAFE_ID.test(t.id));
  if (topics.length !== D.topics.length) throw new Error(`ファイル名に使えないトピックIDがあります`);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const terms = I.allTerms.filter((t) => t && t.worksOnly !== true);
  const bad = terms.filter((t) => !SAFE_ID.test(t.id));
  if (bad.length) throw new Error(`ファイル名に使えない用語IDがあります: ${bad.map((t) => t.id).join(`, `)}`);
  const termById = new Map(terms.map((t) => [t.id, t]));
  const helpIds = new Set(appHelpIds(WEBAPP));
  const figIds = Object.keys(DG.defs).filter((id) => DG.defs[id] && typeof DG.defs[id].render === `function` && !helpIds.has(id));
  const badFig = figIds.filter((id) => !SAFE_ID.test(id));
  if (badFig.length) throw new Error(`ファイル名に使えない図解IDがあります: ${badFig.join(`, `)}`);
  const figSet = new Set(figIds);
  const figSvg = new Map(figIds.map((id) => {
    const svg = DG.defs[id].render();
    if (typeof svg !== `string` || !/^<svg\b[\s\S]*<\/svg>$/.test(svg.trim())) throw new Error(`図解 ${id} の SVG を作れません`);
    return [id, svg.trim()];
  }));
  // 図解 ⇔ 用語(Diagrams.byTerm)
  const figsOfTerm = (id) => (typeof CU.diagramsFor === `function` ? CU.diagramsFor(id) : (DG.byTerm[id] || [])).filter((f) => figSet.has(f));
  const termsOfFig = new Map(figIds.map((f) => [f, []]));
  terms.forEach((t) => figsOfTerm(t.id).forEach((f) => { if (!termsOfFig.get(f).includes(t)) termsOfFig.get(f).push(t); }));

  // アプリで開く場所: サイト内検索(GlobalSearch)と同じ案内先(初めての人 = 試験の登録なし のとき)
  const navOf = new Map();
  terms.forEach((t) => {
    let nav = null;
    try {
      const hits = ctx.GlobalSearch.search(t.name, 100000);
      const re = new RegExp(`^#(topics/[A-Za-z0-9_-]+|glossary)/${t.id}$`);
      const hit = hits.find((h) => re.test(h.nav));
      nav = hit ? hit.nav : null;
    } catch (e) { nav = null; }
    if (!nav) nav = `#glossary/${t.id}`;
    navOf.set(t.id, nav);
  });
  // 用語の「親」のトピック(パンくず・試験のポイントの判定・前後のページ)
  const parentOf = (t) => {
    const m = navOf.get(t.id).match(/^#topics\/([^/]+)\//);
    if (m && topicById.has(m[1])) return topicById.get(m[1]);
    const tid = (t.topicIds || []).find((id) => topicById.has(id));
    return tid ? topicById.get(tid) : null;
  };
  const topicsOfTerm = (t) => topics.filter((tp) => (I.topicTermIndex[tp.id] || []).includes(t.id));
  // トピックの小見出し(なければ「基礎知識」の1つ)と、基礎知識にない用語
  const sectionsOf = (tp) => {
    const secs = I.topicSections[tp.id] || [{ name: `基礎知識`, ids: I.topicBasicOrder[tp.id] || tp.basicIds }];
    return secs.map((s) => ({ name: String(s.name), items: s.ids.map((id) => termById.get(id)).filter(Boolean) })).filter((s) => s.items.length);
  };
  const extraTermsOf = (tp) => (I.topicTermIndex[tp.id] || []).filter((id) => !tp.basicIds.includes(id)).map((id) => termById.get(id)).filter(Boolean);
  const orderOf = (tp) => sectionsOf(tp).flatMap((s) => s.items).concat(extraTermsOf(tp));

  // アプリのトピック一覧と同じまとまり(js/views/topics.js の trackGroups と同じ考え方)
  const examType = (id) => ((D.exams && D.exams.types) || []).find((x) => x.id === id) || null;
  function trackGroups(track) {
    const takken = examType(`takken`);
    const cats = takken && Array.isArray(takken.categories) ? takken.categories : [];
    const zei = examType(`zeirishi`);
    const zeiIds = zei && Array.isArray(zei.categories) ? zei.categories.flatMap((c) => c.topicIds || []) : [];
    const used = new Set();
    const pick = (ids) => (ids || []).filter((id) => topicById.has(id) && !used.has(id)).map((id) => { used.add(id); return topicById.get(id); });
    let groups;
    if (track === `takken`) groups = cats.map((c) => ({ id: c.id, name: c.name, meta: c.questions ? `例年${c.questions}問` : ``, topics: pick(c.topicIds) }));
    else if (track === `zeirishi`) groups = [{ id: `zeirishi`, name: `不動産の税金と消費税`, meta: ``, topics: pick(zeiIds) }];
    else {
      groups = LIFE_GROUPS.map((g) => ({ id: g.id, name: g.name, meta: ``, topics: pick(g.ids) }));
      const elsewhere = new Set(cats.flatMap((c) => c.topicIds || []).concat(zeiIds));
      groups.push({ id: `other`, name: `そのほかのテーマ`, meta: ``, topics: pick(topics.filter((t) => !used.has(t.id) && !elsewhere.has(t.id)).map((t) => t.id)) });
    }
    return groups.filter((g) => g.topics.length);
  }
  const tracks = TRACKS.map((tr) => ({ id: tr.id, label: tr.label, groups: trackGroups(tr.id) })).filter((tr) => tr.groups.length);
  const listed = new Set(tracks.flatMap((tr) => tr.groups.flatMap((g) => g.topics.map((t) => t.id))));
  const unlisted = topics.filter((t) => !listed.has(t.id));
  if (unlisted.length) {
    warn(`どの一覧にも入らないトピックを「そのほかのテーマ」に入れました: ${unlisted.map((t) => t.id).join(`, `)}`);
    tracks.push({ id: `other`, label: `そのほかのテーマ`, groups: [{ id: `other`, name: `そのほかのテーマ`, meta: ``, topics: unlisted }] });
  }

  // ---- ページの部品 ----
  const pages = new Map(); // 公開パス → 内容
  const meta = []; // { path, url, title, description }
  const LEARN = `learn/`;
  const urlOf = (p) => `${BASE}${p}`;
  const crumbs = (from, list) => `
    <nav class="lp-crumbs" aria-label="パンくずリスト"><ol>${list.map(([label, to], i) => (i === list.length - 1 ? `<li aria-current="page">${esc(label)}</li>` : `<li><a href="${esc(rel(from, to))}">${esc(label)}</a></li>`)).join(``)}</ol></nav>`;
  const crumbsLd = (list) => ({
    '@type': `BreadcrumbList`,
    itemListElement: list.map(([label, to], i) => ({ '@type': `ListItem`, position: i + 1, name: label, item: urlOf(to) })),
  });
  const levelHtml = (level) => (level ? `<span class="lp-level lp-level-${LEVEL_CLASS(level)}">${esc(level)}</span>` : ``);
  const appLink = (from, hash) => `${rel(from, ``)}${hash}`;
  const figureHtml = (from, id, opts) => {
    const def = DG.defs[id];
    opts = opts || {};
    return `
      <figure class="lp-figure${opts.large ? ` lp-figure-large` : ``}">
        ${opts.noTitle ? `` : `<p class="lp-figure-title">図解: ${esc(def.title)}</p>`}
        ${figSvg.get(id)}
        ${def.caption ? `<figcaption>${esc(def.caption)}</figcaption>` : ``}
        ${opts.link ? `<a class="lp-figure-link" href="${esc(rel(from, `${LEARN}figure/${id}.html`))}">この図の説明と関連する用語</a>` : ``}
      </figure>`;
  };

  function page(p, o) {
    const url = urlOf(p);
    const title = `${o.title}|${NAME}`;
    meta.push({ path: p, url, title, description: o.description });
    const icon = (f) => esc(rel(p, f));
    const ld = { '@context': `https://schema.org`, '@graph': o.ld };
    pages.set(fileOf(p), `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(o.description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="${o.ogType || `article`}">
  <meta property="og:site_name" content="${esc(NAME)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(o.description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(urlOf(OG_IMAGE))}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(`${NAME} — ${S.tagline || ``}`)}">
  <meta property="og:locale" content="ja_JP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="color-scheme" content="light dark">
  ${themeLight ? `<meta name="theme-color" content="${esc(themeLight)}" media="(prefers-color-scheme: light)">` : ``}
  ${themeDark ? `<meta name="theme-color" content="${esc(themeDark)}" media="(prefers-color-scheme: dark)">` : ``}
  <link rel="icon" type="image/svg+xml" href="${icon(`icons/logo.svg`)}">
  <link rel="icon" type="image/png" sizes="192x192" href="${icon(`icons/icon-192.png`)}">
  <link rel="apple-touch-icon" href="${icon(`icons/apple-touch-icon.png`)}">
  <link rel="stylesheet" href="${esc(rel(p, `${LEARN}learn.css`))}?v=${cssHash}">
  <script type="application/ld+json">${ldJson(ld)}</script>
</head>
<body>
  <a class="lp-skip" href="#main">本文へ移動</a>
  <header class="lp-header">
    <div class="lp-header-inner">
      <a class="lp-brand" href="${esc(rel(p, ``))}"><img src="${icon(`icons/logo.svg`)}" alt="" width="28" height="28">${esc(NAME)}</a>
      <a class="lp-open" href="${esc(rel(p, ``))}">アプリを開く</a>
    </div>
  </header>
  <main id="main" class="lp-main">${o.crumbs || ``}
${o.body}
  </main>
  <footer class="lp-footer">
    <p>${esc(footer.text)}</p>
    <nav class="lp-footer-links" aria-label="このアプリについて">
      <a href="${esc(rel(p, LEARN))}">学べるテーマの一覧</a>
      ${footer.links.map(([label, hash]) => `<a href="${esc(appLink(p, hash))}">${esc(label)}</a>`).join(`\n      `)}
    </nav>
  </footer>
</body>
</html>
`);
  }

  const isPartOf = { '@type': `WebSite`, name: NAME, url: BASE };
  const termSet = { '@type': `DefinedTermSet`, '@id': `${urlOf(LEARN)}#terms`, name: `${NAME}の用語・基礎知識`, url: urlOf(LEARN), inLanguage: `ja` };
  const kindOf = (t) => (t.source === `general` ? `基礎知識` : `用語`);
  const CRUMB_ROOT = [NAME, ``];
  const CRUMB_LEARN = [`学べるテーマ`, LEARN];

  // ---- learn/index.html ----
  {
    const p = LEARN;
    const basicsCount = (tp) => sectionsOf(tp).reduce((n, s) => n + s.items.length, 0);
    const card = (tp) => {
      const nb = basicsCount(tp);
      const nt = extraTermsOf(tp).length;
      return `<li><a href="${esc(rel(p, `${LEARN}${tp.id}.html`))}"><span class="lp-item-name">${esc(tp.name)}</span><span class="lp-item-desc">${esc(tp.description)}</span><span class="lp-item-meta">${levelHtml(tp.level)}<span>基礎知識${nb}項目${nt ? `・用語${nt}語` : ``}</span></span></a></li>`;
    };
    const body = `
    <h1>学べるテーマの一覧</h1>
    <p class="lp-intro">${esc(NAME)}で学べる基礎知識と用語を、テーマごとにまとめました。暮らしの中の賃貸・売買・相続から、宅建士試験・税理士試験(消費税法)の対策まで、根拠となる法令と公的な出典つきで確認できます。</p>
    <div class="lp-cta"><a class="lp-btn" href="${esc(rel(p, ``))}">アプリで学ぶ(無料・登録不要)</a><p>4択・○×問題、暗記カード、間隔をあけた復習の予定づくりはアプリで。学習の記録はこの端末の中だけに保存されます。</p></div>
    ${tracks.map((tr) => `
    <section class="lp-track" aria-labelledby="track-${esc(tr.id)}">
      <h2 id="track-${esc(tr.id)}">${esc(tr.label)}</h2>
      ${tr.groups.map((g) => `
      <h3>${esc(g.name)}${g.meta ? `<span class="lp-group-meta">${esc(g.meta)}</span>` : ``}</h3>
      <ul class="lp-grid">${g.topics.map(card).join(``)}</ul>`).join(``)}
    </section>`).join(``)}
    ${figIds.length ? `
    <section class="lp-track" id="figures" aria-labelledby="track-figures">
      <h2 id="track-figures">図解</h2>
      <ul class="lp-list">${figIds.map((id) => `<li><a href="${esc(rel(p, `${LEARN}figure/${id}.html`))}"><span class="lp-item-name">${esc(DG.defs[id].title)}</span>${DG.defs[id].caption ? `<span class="lp-item-desc">${esc(trunc(DG.defs[id].caption, 80))}</span>` : ``}</a></li>`).join(``)}</ul>
    </section>` : ``}`;
    page(p, {
      title: `学べるテーマの一覧`,
      ogType: `website`,
      description: trunc(`暮らしの不動産から宅建士試験・税理士試験(消費税法)の対策まで、${topics.length}のテーマ・基礎知識と用語${terms.length}項目${figIds.length ? `・図解${figIds.length}点` : ``}を根拠条文と出典つきで解説します。`, DESC_MAX),
      crumbs: crumbs(p, [CRUMB_ROOT, [`学べるテーマの一覧`, LEARN]]),
      body,
      ld: [
        { '@type': `CollectionPage`, '@id': urlOf(p), name: `学べるテーマの一覧`, url: urlOf(p), inLanguage: `ja`, isPartOf, hasPart: topics.map((tp) => ({ '@type': `LearningResource`, name: tp.name, url: urlOf(`${LEARN}${tp.id}.html`) })) },
        termSet,
        crumbsLd([CRUMB_ROOT, [`学べるテーマの一覧`, LEARN]]),
      ],
    });
  }

  // ---- learn/<トピックID>.html ----
  topics.forEach((tp) => {
    const p = `${LEARN}${tp.id}.html`;
    const secs = sectionsOf(tp);
    const extra = extraTermsOf(tp);
    const nQuiz = (I.topicQuizIndex[tp.id] || []).length;
    const figs = [...new Set(orderOf(tp).flatMap((t) => figsOfTerm(t.id)))];
    const laws = ((I.topicLawIndex && I.topicLawIndex[tp.id]) || []).map((id) => D.laws.laws.find((l) => l.id === id)).filter(Boolean);
    const item = (t) => `<li><a href="${esc(rel(p, `${LEARN}term/${t.id}.html`))}"><span class="lp-item-name">${esc(t.name)}</span><span class="lp-item-desc">${esc(t.simpleExplanation)}</span></a></li>`;
    const others = topics.filter((x) => x.id !== tp.id);
    const crumbList = [CRUMB_ROOT, CRUMB_LEARN, [tp.name, p]];
    const body = `
    <article>
      <p class="lp-kicker">学べるテーマ</p>
      <h1>${esc(tp.name)}</h1>
      <p class="lp-tags">${levelHtml(tp.level)}<span>基礎知識${secs.reduce((n, s) => n + s.items.length, 0)}項目${extra.length ? `・用語${extra.length}語` : ``}${figs.length ? `・図解${figs.length}点` : ``}</span></p>
      <p class="lp-intro">${esc(tp.description)}</p>
      <div class="lp-cta"><a class="lp-btn" href="${esc(appLink(p, `#topics/${tp.id}`))}">アプリでこのテーマを学ぶ</a><p>${nQuiz ? `このテーマの4択・確認問題${nQuiz}問と、` : ``}暗記カード・復習の予定づくりは無料のアプリで(登録不要)。</p></div>
      ${secs.map((s) => `
      <section>
        <h2>${esc(s.name)}</h2>
        <ul class="lp-list">${s.items.map(item).join(``)}</ul>
      </section>`).join(``)}
      ${extra.length ? `
      <section>
        <h2>このテーマの用語</h2>
        <ul class="lp-list">${extra.map(item).join(``)}</ul>
      </section>` : ``}
      ${figs.length ? `
      <section>
        <h2>図解</h2>
        <ul class="lp-chips">${figs.map((id) => `<li><a href="${esc(rel(p, `${LEARN}figure/${id}.html`))}">${esc(DG.defs[id].title)}</a></li>`).join(``)}</ul>
      </section>` : ``}
      ${laws.length ? `
      <section>
        <h2>関連する法律・制度</h2>
        <ul class="lp-laws lp-card">${laws.map((l) => `<li><strong>${esc(l.name)}</strong><span>${esc(l.description)}</span></li>`).join(``)}</ul>
      </section>` : ``}
      <section>
        <h2>ほかのテーマ</h2>
        <ul class="lp-chips">${others.map((x) => `<li><a href="${esc(rel(p, `${LEARN}${x.id}.html`))}">${esc(x.name)}</a></li>`).join(``)}</ul>
      </section>
    </article>`;
    page(p, {
      title: tp.name,
      description: trunc(tp.description, DESC_MAX),
      crumbs: crumbs(p, crumbList),
      body,
      ld: [
        {
          '@type': `LearningResource`, '@id': urlOf(p), name: tp.name, description: oneLine(tp.description), url: urlOf(p), inLanguage: `ja`, isAccessibleForFree: true,
          educationalLevel: tp.level, learningResourceType: `基礎知識の解説`, isPartOf,
          // LearningResource が扱う用語は teaches(DefinedTerm を取れる。hasPart は CreativeWork 用)
          teaches: orderOf(tp).map((t) => ({ '@type': `DefinedTerm`, name: t.name, url: urlOf(`${LEARN}term/${t.id}.html`) })),
        },
        crumbsLd(crumbList),
      ],
    });
  });

  // ---- learn/term/<用語ID>.html ----
  terms.forEach((t) => {
    const p = `${LEARN}term/${t.id}.html`;
    const parent = parentOf(t);
    const nav = navOf.get(t.id);
    const viaTopic = nav.startsWith(`#topics/`);
    const label = CU.deepDiveLabel(t, viaTopic && parent ? parent.id : null);
    const chips = t.lawRef ? (typeof CU.splitLawRef === `function` ? CU.splitLawRef(t.lawRef) : [t.lawRef]) : [];
    const srcs = (t.sources || []).map((id) => I.sourcesById[id]).filter((s) => s && /^https?:\/\//.test(String(s.url)));
    const figs = figsOfTerm(t.id);
    const related = topicsOfTerm(t);
    const order = parent ? orderOf(parent) : [];
    const idx = order.indexOf(t);
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
    const aliases = (t.aliases || []).filter((a) => a && a !== t.name);
    const crumbList = [CRUMB_ROOT, CRUMB_LEARN].concat(parent ? [[parent.name, `${LEARN}${parent.id}.html`]] : []).concat([[t.name, p]]);
    const body = `
    <article class="lp-card">
      <p class="lp-kicker">${kindOf(t)}${parent ? `・${esc(parent.name)}` : ``}</p>
      <h1>${esc(t.name)}</h1>
      <p class="lp-tags">${levelHtml(t.level)}${aliases.length ? `<span>別名: ${esc(aliases.join(`、`))}</span>` : ``}</p>
      <p class="lp-lead">${esc(t.simpleExplanation)}</p>
      ${t.deepDive ? `<div class="lp-deep"><p class="lp-deep-label">${esc(label)}</p><p>${esc(t.deepDive)}</p></div>` : ``}
      ${chips.length ? `<p class="lp-law"><span class="lp-law-label">根拠</span>${chips.map((c) => `<span class="lp-chip">${esc(c)}</span>`).join(``)}</p>` : ``}
      ${t.kind === `practice` && !t.lawRef ? `<p class="lp-note">実務上の目安です(法令上の決まりではありません)</p>` : ``}
      ${figs.map((id) => figureHtml(p, id, { link: true })).join(``)}
      ${t.lawRef ? `<p class="lp-asof">${esc(lawAsOf(t))}</p>` : ``}
    </article>
    <div class="lp-cta"><a class="lp-btn" href="${esc(appLink(p, nav))}">アプリで学ぶ</a><p>${viaTopic ? `「${esc(parent ? parent.name : ``)}」のテーマの中で開きます。` : `用語集で開きます。`}確認問題・暗記カード・復習の予定づくりは無料のアプリで(登録不要)。</p></div>
    ${srcs.length ? `
    <section>
      <h2>出典</h2>
      <ul class="lp-sources">${srcs.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.orgName)}</a>${s.description ? `<span>${esc(s.description)}</span>` : ``}</li>`).join(``)}</ul>
    </section>` : ``}
    ${related.length ? `
    <section>
      <h2>このことばが出てくるテーマ</h2>
      <ul class="lp-chips">${related.map((x) => `<li><a href="${esc(rel(p, `${LEARN}${x.id}.html`))}">${esc(x.name)}</a></li>`).join(``)}</ul>
    </section>` : ``}
    ${prev || next ? `
    <nav class="lp-pager" aria-label="同じテーマの前後の項目">
      ${prev ? `<a href="${esc(rel(p, `${LEARN}term/${prev.id}.html`))}"><small>前へ</small>${esc(prev.name)}</a>` : ``}
      ${next ? `<a class="lp-pager-next" href="${esc(rel(p, `${LEARN}term/${next.id}.html`))}"><small>次へ</small>${esc(next.name)}</a>` : ``}
    </nav>` : ``}`;
    // DefinedTerm は inLanguage を持てない(CreativeWork の項目)。言語は <html lang> と用語集(DefinedTermSet)で示す
    const dt = { '@type': `DefinedTerm`, '@id': `${urlOf(p)}#term`, name: t.name, description: oneLine(t.simpleExplanation), url: urlOf(p), inDefinedTermSet: termSet };
    if (aliases.length) dt.alternateName = aliases;
    page(p, {
      title: t.name,
      description: termDescription(t),
      crumbs: crumbs(p, crumbList),
      body,
      ld: [dt, crumbsLd(crumbList)],
    });
  });

  // ---- learn/figure/<図解ID>.html ----
  figIds.forEach((id, i) => {
    const p = `${LEARN}figure/${id}.html`;
    const def = DG.defs[id];
    const rel_ = termsOfFig.get(id) || [];
    const prev = i > 0 ? figIds[i - 1] : null;
    const next = i < figIds.length - 1 ? figIds[i + 1] : null;
    const crumbList = [CRUMB_ROOT, CRUMB_LEARN, [`図解`, `${LEARN}#figures`], [def.title, p]];
    const body = `
    <article>
      <p class="lp-kicker">図解</p>
      <h1>${esc(def.title)}</h1>
      ${figureHtml(p, id, { large: true, noTitle: true })}
      ${def.alt ? `
      <section class="lp-card">
        <h2>この図の説明</h2>
        <p>${esc(def.alt)}</p>
      </section>` : ``}
      <div class="lp-cta"><a class="lp-btn" href="${esc(appLink(p, `#figures/${id}`))}">アプリでこの図を見る</a><p>関連する基礎知識の確認問題・暗記カードも無料のアプリで(登録不要)。</p></div>
      ${rel_.length ? `
      <section>
        <h2>関連する用語</h2>
        <ul class="lp-list">${rel_.map((t) => `<li><a href="${esc(rel(p, `${LEARN}term/${t.id}.html`))}"><span class="lp-item-name">${esc(t.name)}</span><span class="lp-item-desc">${esc(t.simpleExplanation)}</span></a></li>`).join(``)}</ul>
      </section>` : ``}
      ${prev || next ? `
      <nav class="lp-pager" aria-label="ほかの図解">
        ${prev ? `<a href="${esc(rel(p, `${LEARN}figure/${prev}.html`))}"><small>前の図解</small>${esc(DG.defs[prev].title)}</a>` : ``}
        ${next ? `<a class="lp-pager-next" href="${esc(rel(p, `${LEARN}figure/${next}.html`))}"><small>次の図解</small>${esc(DG.defs[next].title)}</a>` : ``}
      </nav>` : ``}
    </article>`;
    page(p, {
      title: `図解: ${def.title}`,
      description: trunc(def.caption || def.alt || def.title, DESC_MAX),
      crumbs: crumbs(p, crumbList),
      body,
      ld: [
        { '@type': `LearningResource`, '@id': urlOf(p), name: def.title, description: oneLine(def.alt || def.caption || def.title), url: urlOf(p), inLanguage: `ja`, isAccessibleForFree: true, learningResourceType: `図解`, isPartOf, about: rel_.map((t) => ({ '@type': `DefinedTerm`, name: t.name, url: urlOf(`${LEARN}term/${t.id}.html`) })) },
        crumbsLd(crumbList),
      ],
    });
  });

  // 同じ description が複数あれば、名前を前に付けて見分けられるようにする(title は名前なので重ならない想定。重なればエラー)
  {
    const count = new Map();
    meta.forEach((m) => count.set(m.description, (count.get(m.description) || 0) + 1));
    meta.forEach((m) => {
      if (count.get(m.description) < 2) return;
      const name = m.title.replace(new RegExp(`\\|${NAME}$`), ``);
      const fixed = trunc(`${name}: ${m.description}`, DESC_MAX);
      const f = fileOf(m.path);
      pages.set(f, pages.get(f).split(`content="${esc(m.description)}"`).join(`content="${esc(fixed)}"`));
      m.description = fixed;
    });
  }

  pages.set(`${LEARN}learn.css`, css);
  const sitemapUrls = [BASE].concat(meta.map((m) => m.url));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${xmlEsc(u)}</loc><lastmod>${asOf}</lastmod></url>`).join(`\n`)}
</urlset>
`;

  // ---- 書き出す前の確認 ----
  const errors = validate({ pages, meta, sitemap, sitemapUrls, SITE_DIR, BASE, counts: { topics: topics.length, terms: terms.length, figures: figIds.length } });
  if (errors.length) {
    errors.slice(0, 50).forEach((e) => console.log(GH ? `::error::static_pages: ${e}` : `ERROR ${e}`));
    throw new Error(`静的ページの確認で ${errors.length}件の問題が見つかりました(何も書き出していません)`);
  }

  // ---- 書き出し(learn/ は作り直す。途中で失敗したら作りかけを残さない) ----
  const OUT = path.join(SITE_DIR, `learn`);
  const TMP = path.join(SITE_DIR, `.learn.tmp-${process.pid}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  try {
    for (const [f, content] of pages) {
      const dest = path.join(TMP, f.slice(LEARN.length));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.renameSync(TMP, OUT);
    fs.writeFileSync(path.join(SITE_DIR, `sitemap.xml`), sitemap);
  } catch (e) {
    fs.rmSync(TMP, { recursive: true, force: true });
    throw e;
  }
  const bytes = [...pages.values()].reduce((n, c) => n + Buffer.byteLength(c), 0);
  console.log(`静的ページ: 一覧1・トピック${topics.length}・用語と基礎知識${terms.length}・図解${figIds.length}(計${meta.length}ページ・${(bytes / 1024).toFixed(0)}KB)・sitemap.xml ${sitemapUrls.length}件 → ${OUT}`);
}

// リンク切れ・重複・載せてはいけない語・sitemap の形を確かめる(エラーの一覧を返す)
function validate({ pages, meta, sitemap, sitemapUrls, SITE_DIR, BASE, counts }) {
  const errors = [];
  const exists = (p) => pages.has(p) || (p !== `` && fs.existsSync(path.join(SITE_DIR, p)) && fs.statSync(path.join(SITE_DIR, p)).isFile());
  const htmlFiles = [...pages.keys()].filter((f) => f.endsWith(`.html`));
  const want = 1 + counts.topics + counts.terms + counts.figures;
  if (htmlFiles.length !== want) errors.push(`ページ数が ${htmlFiles.length} です(期待 ${want})`);
  if (meta.length !== want) errors.push(`title などの記録が ${meta.length} 件です(期待 ${want})`);
  for (const key of [`title`, `description`, `url`]) {
    const seen = new Map();
    meta.forEach((m) => {
      if (!m[key]) errors.push(`${m.path}: ${key} が空です`);
      else if (seen.has(m[key])) errors.push(`${key} が重複: ${m.path} と ${seen.get(m[key])}「${m[key]}」`);
      else seen.set(m[key], m.path);
    });
  }
  for (const [f, content] of pages) {
    FORBIDDEN.forEach((w) => { if (content.includes(w)) errors.push(`${f}: 載せてはいけない語「${w}」があります`); });
    if (!f.endsWith(`.html`)) continue;
    if (/<script\b(?![^>]*application\/ld\+json)/i.test(content)) errors.push(`${f}: JSON-LD 以外の <script> があります`);
    const ld = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (ld.length !== 1) errors.push(`${f}: JSON-LD が ${ld.length} 個です`);
    ld.forEach((m) => { try { JSON.parse(m[1]); } catch (e) { errors.push(`${f}: JSON-LD が JSON として読めません ${e.message}`); } });
    const canon = content.match(/<link rel="canonical" href="([^"]*)">/);
    const me = meta.find((x) => fileOf(x.path) === f);
    if (!canon || !me || canon[1] !== esc(me.url)) errors.push(`${f}: canonical が想定と違います`);
    for (const m of content.replace(/<link rel="canonical"[^>]*>/, ``).matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const raw = m[1].replace(/&amp;/g, `&`);
      if (/^https?:\/\//.test(raw)) {
        if (raw.startsWith(BASE)) errors.push(`${f}: サイト内なのに絶対URLのリンク ${raw}`);
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith(`//`)) { errors.push(`${f}: 想定外のリンク ${raw}`); continue; }
      if (raw.startsWith(`#`)) {
        const id = raw.slice(1);
        if (id && !content.includes(`id="${id}"`)) errors.push(`${f}: ページ内のリンク先がありません ${raw}`);
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(f), raw.split(`#`)[0].split(`?`)[0]));
      if (target.startsWith(`..`)) { errors.push(`${f}: サイトの外を指すリンク ${raw}`); continue; }
      const file = target === `.` || raw.split(/[?#]/)[0].endsWith(`/`) ? posix.join(target === `.` ? `` : target, `index.html`) : target;
      if (!exists(file)) { errors.push(`${f}: リンク切れ ${raw}(${file})`); continue; }
      const hash = raw.includes(`#`) ? raw.slice(raw.indexOf(`#`) + 1) : ``;
      if (!hash) continue;
      // アプリの中の場所(#topics/… など)は決まった形だけ。静的ページの中の見出しへのリンクは、その id があること
      if (file === `index.html`) {
        if (!/^(about(\/[a-z]+)?|topics\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?|glossary\/[A-Za-z0-9_-]+|figures\/[A-Za-z0-9_-]+)$/.test(hash)) errors.push(`${f}: アプリの中の場所が想定外です ${raw}`);
      } else if (pages.has(file) && !pages.get(file).includes(`id="${hash}"`)) errors.push(`${f}: リンク先の見出しがありません ${raw}`);
    }
  }
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n[\s\S]*<\/urlset>\n$/.test(sitemap)) errors.push(`sitemap.xml の形が想定外です`);
  if (new Set(sitemapUrls).size !== sitemapUrls.length) errors.push(`sitemap.xml の URL が重複しています`);
  sitemapUrls.forEach((u) => {
    if (!u.startsWith(BASE)) errors.push(`sitemap.xml: サイトの外の URL ${u}`);
    const p = u.slice(BASE.length);
    const file = p === `` || p.endsWith(`/`) ? `${p}index.html` : p;
    if (!exists(file)) errors.push(`sitemap.xml: ファイルがない URL ${u}`);
  });
  if (sitemapUrls.length !== want + 1) errors.push(`sitemap.xml の URL が ${sitemapUrls.length}件です(期待 ${want + 1})`);
  return errors;
}

try {
  main();
} catch (e) {
  console.error(GH ? `::error::静的ページの生成に失敗しました: ${e.message}` : `静的ページの生成に失敗しました: ${e.stack || e.message}`);
  process.exit(1);
}
