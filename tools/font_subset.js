// 見出し用の書体(M PLUS Rounded 1c ExtraBold・SIL Open Font License 1.1)を、アプリで見出し用の書体(--font-display)を使う所に
// 出る文字だけに絞って、webapp/fonts/ に woff2 を作る
// (見出し h1〜h4・カードやシートの題・ボタン・大きな数字・タブ・バッジ・キャラクターのせりふなど。css/*.css の var(--font-display))
// ファイルは2つに分ける(SLICES。css/style.css の @font-face の unicode-range と同じ分け方):
//   fudomana-rounded-800-base.woff2  かな・英数字・記号(約30KB。起動画面の「ふどまな」はこれだけで描けるので、初回の表示を遅らせない)
//   fudomana-rounded-800-kanji.woff2 漢字(ブラウザは漢字を描くときに読み込む)
//
// 使い方: node tools/font_subset.js --src <MPLUSRounded1c-ExtraBold.ttf> [--webapp webapp] [--python python]
//         node tools/font_subset.js --dry      (文字を集めて、今のフォントに足りない文字を表示するだけ。フォントは作らない)
//   元のフォント: Google Fonts の公式リポジトリ(下の SOURCE.url)からダウンロードする。リポジトリには入れない(3.6MB)
//   必要: Python 3 と fontTools・brotli(pip install "fonttools[woff]")。Python は -I(分離モード)で tools/font_subset.py を動かす
//   CI(GitHub Actions)では動かさない。作った woff2 と文字の一覧をコミットする
//
// 文字の集め方(collectDisplayChars。tools/check.js も同じ関数で、フォントに足りない文字がないか確かめて警告を出す):
//   1. webapp/js/**/*.js の文字列・テンプレート文字列の中の文字(コメント・正規表現は除く)。画面の文言はすべてここにある
//      (見出し用の書体を使う所かどうかは区別しない。数え漏れのないよう、画面の文言は全部入れる)
//   2. index.html の文字(起動画面のアプリ名など)と、静的ページ(learn/)の見出しの文言(tools/static_pages.js の文字列)
//   3. データのうち、見出し・カードの題・タブ・チップ・選択肢の札に出る名前(DATA_KEYS: トピック・小見出し・基礎知識・用語・作品の回・
//      試験と分野・更新履歴の題・法改正の題・情報源の分類と名前 など)と、個数・組合せの問題の選択肢(一つ〜四つ・ア、イ)
//      (解説・問題文などの長い文章は本文の書体なので入れない)
//   4. いつも入れる文字: ASCII・ひらがな・カタカナ・全角の英数字と記号・よく使う句読点と記号(BASE_RANGES)
//   元のフォントにない文字(絵文字・一部の記号や漢字)は入れられない。その文字は端末の書体(--font-display の次の候補)で表示される。
//   × ÷ はこのフォントでは小さな欧文の字形なので、わざと入れない(EXCLUDE。「○×」が釣り合うよう端末の書体で表示する)
// 出力: webapp/fonts/fudomana-rounded-800-base.woff2・-kanji.woff2 と、入れた文字の一覧 fudomana-rounded-800.chars.json
//   (作り直すときの記録。tools/check.js は notInFont(元のフォントにない文字)を警告から除く)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { tokenizeJs } = require('./lib/minify.js');
const { loadApp } = require('./lib/appload.js');

// 漢字(CJK 統合漢字・拡張A・互換漢字・拡張B 以降)。css/style.css の漢字の @font-face の unicode-range と同じ範囲
const isKanji = (cp) => (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || cp >= 0x20000;
const SLICES = [
  { id: 'base', file: 'fonts/fudomana-rounded-800-base.woff2', test: (cp) => !isKanji(cp) },
  { id: 'kanji', file: 'fonts/fudomana-rounded-800-kanji.woff2', test: isKanji },
];
const CHARS_REL = 'fonts/fudomana-rounded-800.chars.json';
const SOURCE = {
  name: 'M PLUS Rounded 1c ExtraBold',
  file: 'MPLUSRounded1c-ExtraBold.ttf',
  url: 'https://github.com/google/fonts/raw/main/ofl/mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf',
  license: 'SIL Open Font License 1.1(webapp/fonts/OFL.txt)',
};
const BUDGET = 200 * 1024; // 1つの太さあたりの目安(2つのファイルの合計)

// データの中で、見出し用の書体で表示される名前の項目(どの深さでも、この名前の文字列の項目を集める)
const DATA_KEYS = new Set(['name', 'title', 'label', 'shortName', 'theme', 'displayLabel', 'category', 'orgName', 'level', 'version', 'status', 'duration', 'term', 'resultsOrg']);
// 値がすべて名前のオブジェクト(試験の分野の短い名前など)
const DATA_MAPS = new Set(['compactNames']);

// いつも入れる文字(コードポイントの範囲。両端を含む)。文言・データにまだ出ていなくても、名前を足したときに使いそうなもの
// (かなは全部。記号は和文でよく使うものだけ。ほかの文字は、文言・データに出たときに 1〜3 で入る)
const BASE_RANGES = [
  [0x20, 0x7e], // ASCII
  [0xa0, 0xa0], [0xa5, 0xa5], [0xb0, 0xb0], [0xb7, 0xb7], // ¥ ° ·
  [0x2013, 0x2014], [0x2018, 0x2019], [0x201c, 0x201d], [0x2026, 0x2026], [0x203b, 0x203b], // –— ‘’ “” … ※
  [0x2190, 0x2193], // ←↑→↓
  [0x2460, 0x2469], // ①〜⑩
  [0x25a0, 0x25a1], [0x25b2, 0x25b3], [0x25cb, 0x25cb], [0x25ce, 0x25cf], [0x2605, 0x2606], // ■□ ▲△ ○ ◎● ★☆
  [0x3000, 0x3017], [0x301c, 0x301f], // 和文の句読点・かっこ・記号(、。々〆〇「」『』【】〒〜 など)
  [0x3041, 0x3096], [0x3099, 0x309e], // ひらがな
  [0x30a1, 0x30fe], // カタカナ
  [0xff01, 0xff01], [0xff05, 0xff05], [0xff08, 0xff0f], [0xff10, 0xff1a], [0xff1f, 0xff1f], [0xff5e, 0xff5e], // 全角の ！ ％ （）＊＋，－．／ ０〜９ ： ？ ～
];

// 入れない文字: このフォントでは欧文の幅(全角の約6割)の小さな字形で、和文の中(「○×」など)で釣り合わないもの。
// 端末の書体(ヒラギノ丸ゴ・Yu Gothic UI など。全角の幅)で表示する
const EXCLUDE = new Set([0xd7, 0xf7]); // × ÷

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: '\u00a0', times: '×', divide: '÷', hellip: '…', mdash: '—', ndash: '–', middot: '·', rarr: '→', larr: '←', uarr: '↑', darr: '↓', minus: '−', yen: '¥', deg: '°', plusmn: '±', copy: '©', thinsp: '\u2009', ensp: '\u2002', emsp: '\u2003' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

// JS の文字列の中のエスケープ(あ・\u{1f600}・\x41)を文字に戻す(そのほかの \n などは区切りの文字として扱われ、下で除かれる)
function decodeJsEscapes(s) {
  return s.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (m, a, b, c) => {
    const n = parseInt(a || b || c, 16);
    return n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

// 書体に入れる意味のある文字か(制御文字・改行・空白の仲間・異体字セレクタ・ゼロ幅の文字・サロゲートの片割れは除く。
// 空白は半角・ノーブレーク・全角の3つだけ入れる)
function wantChar(cp) {
  if (EXCLUDE.has(cp)) return false;
  if (cp === 0x20 || cp === 0xa0 || cp === 0x3000) return true;
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return false;
  if (cp >= 0xd800 && cp <= 0xdfff) return false;
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return false;
  if ((cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f) || cp === 0xfeff) return false;
  if (/\s/u.test(String.fromCodePoint(cp))) return false;
  return true;
}

function addText(set, s) {
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (wantChar(cp)) set.add(cp);
  }
}

function listJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJs(p));
    else if (/\.js$/.test(ent.name)) out.push(p);
  }
  return out.sort();
}

// 図解(js/diagrams.js)の図の中の文字は本文の書体(.dg は --font-sans)なので、見出しに出る図の題とグループの名前だけを集める
// (Node の vm で読み込む。読めなければファイルの文字列を全部入れる)
function charsOfDiagrams(src, data) {
  const set = new Set();
  try {
    const quiet = () => {};
    const c = { console: { log: quiet, info: quiet, warn: quiet, error: quiet, debug: quiet }, APP_DATA: data };
    c.window = c;
    vm.createContext(c);
    vm.runInContext(src, c, { filename: 'js/diagrams.js' });
    const D = c.Diagrams;
    if (!D || !D.defs) throw new Error('window.Diagrams.defs がありません');
    Object.values(D.defs).forEach((d) => addText(set, d && d.title ? d.title : ''));
    (D.groups || []).forEach((g) => addText(set, g && g.label ? g.label : ''));
    if (!set.size) throw new Error('図の題がありません');
    return set;
  } catch (e) {
    return charsOfJs(src);
  }
}

// 1. JS の文字列(コメントと正規表現は除く。テンプレートの ${ } の中の文字列も、テンプレートごと入る)
function charsOfJs(src) {
  const set = new Set();
  let tokens;
  try {
    tokens = tokenizeJs(src);
  } catch (e) {
    // 字句を読めないファイル(ほぼない)は、コメントだけ大まかに除いて全体から集める(足りないよりは多い方がよい)
    addText(set, decodeEntities(decodeJsEscapes(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1'))));
    return set;
  }
  for (const tk of tokens) {
    if (tk.t !== 'str' && tk.t !== 'tpl') continue;
    addText(set, decodeEntities(decodeJsEscapes(src.slice(tk.s, tk.e))));
  }
  return set;
}

// 2. HTML の文字(スクリプト・スタイル・コメント・タグの中は除く)
function charsOfHtml(html) {
  const set = new Set();
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ');
  addText(set, decodeEntities(text));
  return set;
}

// 3. データの名前
function charsOfData(data) {
  const set = new Set();
  const walk = (v, key) => {
    if (typeof v === 'string') { if (DATA_KEYS.has(key)) addText(set, v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return; }
    if (!v || typeof v !== 'object') return;
    for (const k of Object.keys(v)) {
      if (DATA_MAPS.has(k) && v[k] && typeof v[k] === 'object') Object.values(v[k]).forEach((x) => { if (typeof x === 'string') addText(set, x); });
      else walk(v[k], k);
    }
  };
  walk(data, '');
  // 個数・組合せの問題の選択肢(一つ〜四つ・「ア、イ」)は大きな札で表示する
  (data.quiz || []).filter((q) => q && q.style && Array.isArray(q.choices)).forEach((q) => q.choices.forEach((c) => addText(set, c)));
  return set;
}

function charsOfBase() {
  const set = new Set();
  for (const [a, b] of BASE_RANGES) for (let cp = a; cp <= b; cp++) if (wantChar(cp)) set.add(cp);
  return set;
}

// 見出し用の書体で表示しうる文字(コードポイントの集合)と、集めた場所ごとの数
// opts.ctx: loadApp の結果の ctx(なければ読み込む)
function collectDisplayChars(webapp, opts) {
  opts = opts || {};
  const all = new Set();
  const by = {};
  const merge = (name, set) => { by[name] = set.size; set.forEach((c) => all.add(c)); };
  const ctx = opts.ctx || loadApp(webapp, { hostname: 'localhost' }).ctx;
  const data = ctx.APP_DATA || {};
  const js = new Set();
  for (const f of listJs(path.join(webapp, 'js'))) {
    const src = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    const rel = path.relative(webapp, f).split(path.sep).join('/');
    (rel === 'js/diagrams.js' ? charsOfDiagrams(src, data) : charsOfJs(src)).forEach((c) => js.add(c));
  }
  merge('js', js);
  // 検索エンジン向けの静的ページ(learn/。tools/static_pages.js が作る)も見出しにこの書体を使う。見出しの文言はこのファイルにある
  const staticPages = path.join(webapp, '..', 'tools', 'static_pages.js');
  if (fs.existsSync(staticPages)) merge('static', charsOfJs(fs.readFileSync(staticPages, 'utf8')));
  merge('html', charsOfHtml(fs.readFileSync(path.join(webapp, 'index.html'), 'utf8')));
  merge('data', charsOfData(data));
  merge('base', charsOfBase());
  return { chars: all, by };
}

// ---- woff2 の文字の対応表(cmap)を読む(Node の標準機能だけ。tools/check.js でも使う) ----
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function woff2Tables(buf) {
  if (buf.length < 48 || buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('woff2 のファイルではありません');
  if (buf.toString('latin1', 4, 8) === 'ttcf') throw new Error('フォントコレクションの woff2 には対応していません');
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[p++];
      if (i === 0 && b === 0x80) throw new Error('woff2 の表の目次が壊れています');
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('woff2 の表の目次が壊れています');
  };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++];
    let tag = WOFF2_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; }
    const ver = flags >> 6;
    const origLength = base128();
    // glyf・loca は変換の版 0 が「変換あり」、ほかの表は 0 が「変換なし」
    const transformed = tag === 'glyf' || tag === 'loca' ? ver === 0 : ver !== 0;
    dir.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(p, p + compressed));
  const tables = {};
  let off = 0;
  for (const t of dir) { tables[t.tag] = data.subarray(off, off + t.length); off += t.length; }
  return tables;
}

// cmap(書式 4・12)から、字形のある(0 番以外に対応する)コードポイントの集合
function cmapCodePoints(cmap) {
  const n = cmap.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) {
    const at = 4 + i * 8;
    const off = cmap.readUInt32BE(at + 4);
    subs.push({ pid: cmap.readUInt16BE(at), eid: cmap.readUInt16BE(at + 2), off, fmt: cmap.readUInt16BE(off) });
  }
  const pick = subs.find((s) => s.fmt === 12 && (s.pid === 3 || s.pid === 0)) || subs.find((s) => s.fmt === 4 && ((s.pid === 3 && s.eid === 1) || s.pid === 0));
  if (!pick) throw new Error('cmap に Unicode の表(書式 4・12)がありません');
  const out = new Set();
  const o = pick.off;
  if (pick.fmt === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const at = o + 16 + g * 12;
      const start = cmap.readUInt32BE(at);
      const end = cmap.readUInt32BE(at + 4);
      const gid = cmap.readUInt32BE(at + 8);
      for (let c = start; c <= end; c++) if (gid + (c - start) !== 0) out.add(c);
    }
    return out;
  }
  const segX2 = cmap.readUInt16BE(o + 6);
  const ends = o + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let i = 0; i < segX2 / 2; i++) {
    const end = cmap.readUInt16BE(ends + i * 2);
    const start = cmap.readUInt16BE(starts + i * 2);
    const delta = cmap.readUInt16BE(deltas + i * 2);
    const ro = cmap.readUInt16BE(ranges + i * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g;
      if (ro === 0) g = (c + delta) & 0xffff;
      else {
        g = cmap.readUInt16BE(ranges + i * 2 + ro + (c - start) * 2);
        if (g) g = (g + delta) & 0xffff;
      }
      if (g) out.add(c);
    }
  }
  return out;
}

function woff2CodePoints(file) {
  const t = woff2Tables(fs.readFileSync(file));
  if (!t.cmap) throw new Error(`${path.basename(file)} に cmap がありません`);
  return cmapCodePoints(t.cmap);
}

function readCharsFile(webapp) {
  const f = path.join(webapp, CHARS_REL);
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const cps = (lines) => new Set([...(Array.isArray(lines) ? lines.join('') : String(lines || ''))].map((c) => c.codePointAt(0)));
  return { ...j, includedSet: cps(j.included), notInFontSet: cps(j.notInFont) };
}

// tools/check.js 用: 見出し用の書体で表示しうる文字のうち、フォントにない文字(元のフォントにない文字は除く)。
// 文字はその文字の範囲のファイル(SLICES)で探す(css の unicode-range と同じ。ほかのファイルにあっても使われない)
function checkCoverage(webapp, opts) {
  const files = SLICES.map((s) => s.file);
  const absent = files.filter((f) => !fs.existsSync(path.join(webapp, f)));
  if (absent.length) return { files, absent, exists: false, missing: [] };
  const have = SLICES.map((s) => woff2CodePoints(path.join(webapp, s.file)));
  const list = readCharsFile(webapp);
  const skip = list ? list.notInFontSet : new Set();
  const { chars } = collectDisplayChars(webapp, opts);
  const missing = [...chars].filter((c) => !skip.has(c) && !SLICES.some((s, i) => s.test(c) && have[i].has(c))).sort((a, b) => a - b);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(webapp, f)).size, 0);
  return { files, absent, exists: true, glyphChars: have.reduce((n, h) => n + h.size, 0), missing, bytes };
}

const fmtChars = (cps) => cps.map((c) => (c === 0x20 ? '(空白)' : c === 0x3000 ? '(全角空白)' : c === 0xa0 ? '(NBSP)' : String.fromCodePoint(c))).join('');
const chunk = (cps, n) => {
  const s = cps.map((c) => String.fromCodePoint(c));
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n).join(''));
  return out;
};

function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const WEBAPP = path.resolve(opt('--webapp') || path.join(__dirname, '..', 'webapp'));
  const { chars, by } = collectDisplayChars(WEBAPP);
  const sorted = [...chars].sort((a, b) => a - b);
  console.log(`集めた文字 ${sorted.length}字(うち漢字 ${sorted.filter(isKanji).length}字)・場所ごと: JS の文言 ${by.js}・静的ページ ${by.static || 0}・index.html ${by.html}・データの名前 ${by.data}・いつも入れる文字 ${by.base}`);

  if (args.includes('--dry')) {
    const r = checkCoverage(WEBAPP);
    if (!r.exists) console.log(`まだないファイル: ${r.absent.join(', ')}`);
    else console.log(`今のフォント(${(r.bytes / 1024).toFixed(1)}KB・${r.glyphChars}字)に足りない文字 ${r.missing.length}字${r.missing.length ? `: ${fmtChars(r.missing.slice(0, 80))}` : ''}`);
    return;
  }

  const src = opt('--src');
  if (!src || !fs.existsSync(src)) {
    console.error(`元のフォントを --src で指定してください(${SOURCE.file}。ダウンロード元: ${SOURCE.url})`);
    process.exit(2);
  }
  const python = opt('--python') || (process.platform === 'win32' ? 'python' : 'python3');
  const srcBuf = fs.readFileSync(src);
  const made = [];
  const fail = (m) => { made.forEach((x) => fs.rmSync(x.tmp, { force: true })); console.error(m); process.exit(1); };
  for (const s of SLICES) {
    const out = path.join(WEBAPP, s.file);
    const tmp = `${out}.tmp-${process.pid}`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    made.push({ s, out, tmp });
    // -I: 分離モード(カレントフォルダや環境変数のモジュールを読まない)
    const r = spawnSync(python, ['-I', path.join(__dirname, 'font_subset.py'), path.resolve(src), tmp], { input: JSON.stringify(sorted.filter(s.test)), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) fail(`サブセットを作れませんでした(${python} -I tools/font_subset.py・終了コード ${r.status}):\n${r.stderr || r.error || ''}\nfontTools がないときは: python -m pip install "fonttools[woff]"`);
    const res = JSON.parse(r.stdout);
    // 作ったファイルを Node の読み取り(tools/check.js と同じもの)で確かめる: 入れたはずの文字がすべてある
    const have = woff2CodePoints(tmp);
    const lost = res.included.filter((c) => !have.has(c));
    if (lost.length) fail(`${s.file} に入っていない文字があります: ${fmtChars(lost.slice(0, 40))}`);
    made[made.length - 1].res = res;
  }
  // 全部できてから置き換える
  made.forEach((x) => fs.renameSync(x.tmp, x.out));
  const included = made.flatMap((x) => x.res.included).sort((a, b) => a - b);
  const notInFont = made.flatMap((x) => x.res.notInFont).sort((a, b) => a - b);
  const r0 = made[0].res;
  const list = {
    about: '見出し用の書体(fudomana-rounded-800-*.woff2)に入れた文字の一覧。node tools/font_subset.js が作る(手で直さない)。notInFont は元のフォントにない文字、excluded はわざと入れない文字(どちらも端末の書体で表示される)',
    source: { ...SOURCE, sha256: crypto.createHash('sha256').update(srcBuf).digest('hex') },
    subset: { tool: `fontTools ${r0.fontTools}(tools/font_subset.py)`, features: r0.features, featuresInSource: r0.featuresInSource, hinting: false },
    files: Object.fromEntries(made.map((x) => [path.basename(x.out), { chars: x.res.included.length, glyphs: x.res.glyphs, bytes: fs.statSync(x.out).size }])),
    count: included.length,
    excluded: [...EXCLUDE].map((c) => String.fromCodePoint(c)).join(''),
    included: chunk(included, 50),
    notInFont: chunk(notInFont, 50),
  };
  fs.writeFileSync(path.join(WEBAPP, CHARS_REL), `${JSON.stringify(list, null, 2)}\n`);
  let total = 0;
  for (const x of made) {
    const bytes = fs.statSync(x.out).size;
    total += bytes;
    console.log(`${x.s.file}: ${(bytes / 1024).toFixed(1)}KB・${x.res.included.length}字・字形 ${x.res.glyphs}・機能 ${x.res.features.join(', ') || 'なし'}`);
  }
  console.log(`合計 ${(total / 1024).toFixed(1)}KB(元のフォントの機能: ${r0.featuresInSource.join(', ')})`);
  if (notInFont.length) console.log(`元のフォントにない文字 ${notInFont.length}字(端末の書体で表示): ${fmtChars(notInFont.slice(0, 60))}${notInFont.length > 60 ? '…' : ''}`);
  console.log(`文字の一覧: ${CHARS_REL}`);
  if (total > BUDGET) console.log(`WARN 見出し用の書体の合計が目安の ${BUDGET / 1024}KB を超えています(${(total / 1024).toFixed(1)}KB)`);
}

module.exports = { collectDisplayChars, checkCoverage, woff2CodePoints, readCharsFile, SLICES, CHARS_REL, fmtChars };

if (require.main === module) main();
