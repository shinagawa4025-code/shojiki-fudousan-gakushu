// index.html と sw.js を読む・書き換えるための小さな道具(ビルドと確認で共通)
'use strict';
const vm = require('vm');

const BLOCK_RE = /<!--\s*build:(css|js)\s+([A-Za-z0-9_-]+)[\s\S]*?-->([\s\S]*?)<!--\s*\/build\s*-->/g;
const isLocal = (u) => !!u && !/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(u);

// <!-- build:css app … --> 〜 <!-- /build --> の範囲。中には <link rel="stylesheet"> / <script src></script> と HTML コメントだけを置ける
// <script> に付けてよい属性は data-bundle="detail" だけ(公開時に「詳細」の束へ回すファイルの印。ローカルでは何もしない)。
// 戻り値の later は、その印の付いたファイルの集合
function parseBlocks(html) {
  const blocks = [];
  for (const m of html.matchAll(BLOCK_RE)) {
    const [whole, kind, name, body] = m;
    const tagRe = kind === 'css' ? /<link\b[^>]*>/g : /<script\b[^>]*><\/script>/g;
    const files = [];
    const later = new Set();
    for (const t of body.matchAll(tagRe)) {
      const attr = kind === 'css' ? 'href' : 'src';
      if (kind === 'css' && !/\brel="stylesheet"/.test(t[0])) throw new Error(`build:css ${name} に stylesheet 以外の <link> があります: ${t[0]}`);
      const extra = kind === 'js' ? t[0].replace(/^<script\b/, '').replace(/><\/script>$/, '').replace(/\bsrc="[^"]*"/, '').replace(/\bdata-bundle="detail"/, '').trim() : '';
      if (kind === 'js' && extra) throw new Error(`build:js ${name} の <script> に src と data-bundle="detail" 以外の属性があります(まとめられない): ${t[0]}`);
      const url = (t[0].match(new RegExp(`\\b${attr}="([^"]+)"`)) || [])[1];
      if (!isLocal(url)) throw new Error(`build:${kind} ${name} に外部のファイルがあります: ${t[0]}`);
      const rel = url.replace(/^\.\//, '');
      files.push(rel);
      if (kind === 'js' && /\bdata-bundle="detail"/.test(t[0])) later.add(rel);
    }
    const rest = body.replace(tagRe, '').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (rest) throw new Error(`build:${kind} ${name} の中に、まとめられないものがあります: ${rest.slice(0, 80)}`);
    if (!files.length) throw new Error(`build:${kind} ${name} が空です`);
    blocks.push({ kind, name, files, later, start: m.index, end: m.index + whole.length });
  }
  if (blocks.some((b) => b.kind === 'css') === false) throw new Error('<!-- build:css … --> がありません');
  if (blocks.some((b) => b.kind === 'js') === false) throw new Error('<!-- build:js … --> がありません');
  const names = blocks.map((b) => `${b.kind}:${b.name}`);
  if (new Set(names).size !== names.length) throw new Error(`build の名前が重複しています: ${names.join(', ')}`);
  return blocks;
}

// index.html のタグが参照するローカルのファイル { tag, rel, url }(# やクエリは除く)
function localRefs(html) {
  const out = [];
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of noComments.matchAll(/<(link|script|img|source|video|audio)\b[^>]*>/gi)) {
    const tag = m[1].toLowerCase();
    const rel = ((m[0].match(/\brel="([^"]+)"/i) || [])[1] || '').toLowerCase();
    if (tag === 'link' && rel === 'canonical') continue;
    for (const a of m[0].matchAll(/\b(src|href)="([^"]+)"/gi)) {
      const url = a[2].split('#')[0].split('?')[0];
      if (isLocal(url) && !/^data:/i.test(url)) out.push({ tag, rel, url: url.replace(/^\.\//, '') });
    }
  }
  return out;
}

const PRECACHE_RE = /^const PRECACHE_URLS = \[$[\s\S]*?^\];$/m;
function readPrecacheList(sw) {
  const m = sw.match(PRECACHE_RE);
  if (!m) throw new Error('const PRECACHE_URLS = [ … ]; が見つかりません');
  const list = vm.runInNewContext(m[0].replace(/^const PRECACHE_URLS = /, '(').replace(/;$/, ')'));
  if (!Array.isArray(list) || list.some((u) => typeof u !== 'string')) throw new Error('PRECACHE_URLS が文字列の配列ではありません');
  return list;
}

// sw.js のひな形の3か所を書き換える(どれか1つでも見つからなければ失敗)
function generateSw(template, { cacheName, buildId, list }) {
  const one = (src, re, rep, label) => {
    const n = (src.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) || []).length;
    if (n !== 1) throw new Error(`sw.js の ${label} が1か所ではありません(${n}か所)`);
    return src.replace(re, () => rep);
  };
  let sw = template;
  sw = one(sw, /^const CACHE_NAME = `shojiki-gakushu-[0-9A-Za-z._-]+`;$/m, `const CACHE_NAME = \`${cacheName}\`; // tools/build.js が内容のハッシュから生成`, 'CACHE_NAME');
  sw = one(sw, /^const BUILD_ID = `[^`]*`;$/m, `const BUILD_ID = \`${buildId}\`; // index.html の <meta name="app-build"> と同じ値`, 'BUILD_ID');
  sw = one(sw, PRECACHE_RE, `const PRECACHE_URLS = [\n${list.map((u) => `  \`${u}\`,`).join('\n')}\n];`, 'PRECACHE_URLS');
  return sw;
}

module.exports = { parseBlocks, localRefs, readPrecacheList, generateSw, isLocal };
