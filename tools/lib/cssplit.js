// 公開用ビルドで、CSS を「最初の表示に要る分」と「詳細」に分ける(tools/build.js と組で使う。js/appData.js が詳細の CSS を読み込む)
//
// 最初の表示(ホーム・初回ガイド・検索・お知らせ・読み込み中/エラーの画面など)で作られる要素は、本体のコード(詳細に回していない JS)と
// index.html とデータのファイルだけが作る。そこで、それらの中に出てくる名前(クラス名になりうる文字列)を集め、
// 「セレクタのクラスがすべてその中にある」規則だけを最初の表示の CSS に入れる(どれか1つでも本体に出てこないクラスを要る規則は、
// 詳細が届く前の画面には当てはまらない)。判定は控えめ(迷うものは入れる):
//   - :not() :is() :where() :has() などの関数の中・属性セレクタ・ID は条件にしない(要らない規則が入ることはあっても、要る規則は落とさない)
//   - クラスのない規則(:root・要素だけ・属性だけ)・@font-face・@property は入れる。@keyframes は入れた規則が名前を使っていれば入れる
//   - 名前の集め方: 本体のファイルの英数字・-・_ の並びをすべて(コメントや変数名も)。`cat-${id}` や 'cat-' + id のように
//     - で終わる並びは「その名前で始まるクラス」、`${k}-icon` のように - で始まる並びは「その名前で終わるクラス」とみなす
// 詳細の CSS は、元の CSS の全部を元の順番のまま入れる(最初の表示の CSS のあとに読み込むので、同じ規則が後ろにもう一度来る)。
// こうすると、詳細が届いたあとのカスケード(同じ詳細度の規則はあとのものが勝つ)が元のファイルとまったく同じになる
// (各規則の「最後に出てくる位置」が元の順番どおり)。詳細が届く前は、最初の表示の CSS が元の順番を保った一部分なので、
// その時点で画面にある要素には元と同じ規則が同じ順番で当たる。
'use strict';

// CSS(縮小済みでもそうでなくてもよい)を最上位の項目に分ける
//   { kind: 'rule', prelude, text }                         ふつうの規則(セレクタ { 宣言 })
//   { kind: 'group', name, prelude, open, items, text }      @media・@supports・@container・@layer(ブロック)・@document: 中を同じように分ける
//   { kind: 'atomic', name, prelude, text }                  @font-face・@keyframes・@property など(中は分けない)
//   { kind: 'statement', name, text }                         @charset・@import・@layer a, b; など(; で終わるもの)
const GROUP_AT = new Set(['media', 'supports', 'container', 'layer', 'document', '-moz-document', 'scope', 'starting-style']);

function skipString(src, i) {
  const q = src[i];
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) return i + 1;
    if (c === '\n') throw new Error('CSS の文字列が閉じていません');
    i++;
  }
  throw new Error('CSS の文字列が閉じていません');
}

function skipComment(src, i) {
  const end = src.indexOf('*/', i + 2);
  if (end < 0) throw new Error('CSS のコメントが閉じていません');
  return end + 2;
}

// ( から対応する ) の次の位置まで(url( ) や関数の中の { } ; を飛ばす)
function skipParens(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === '\'') { i = skipString(src, i); continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  throw new Error('CSS の ( ) の対応が取れません');
}

// i から、対応する } の次の位置まで(i は { の次)
function skipBlock(src, i) {
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === '\'') { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === '(') { i = skipParens(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  throw new Error('CSS の { } の対応が取れません');
}

function parseCss(src, from, to) {
  from = from || 0;
  to = to == null ? src.length : to;
  const items = [];
  let i = from;
  while (i < to) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    const start = i;
    // 前置き(セレクタ・@規則の条件)を { か ; まで読む
    let j = i;
    let end = -1;
    let open = -1;
    while (j < to) {
      const d = src[j];
      if (d === '"' || d === '\'') { j = skipString(src, j); continue; }
      if (d === '/' && src[j + 1] === '*') { j = skipComment(src, j); continue; }
      if (d === '\\') { j += 2; continue; }
      if (d === '(') { j = skipParens(src, j); continue; } // url( ) や関数の中の ; { } を飛ばす
      if (d === '{') { open = j; break; }
      if (d === ';') { end = j + 1; break; }
      if (d === '}') throw new Error(`CSS の } が余っています(${src.slice(start, j + 1).slice(0, 60)})`);
      j++;
    }
    if (open < 0 && end < 0) throw new Error(`CSS の最後の規則が閉じていません(${src.slice(start, start + 60)})`);
    const prelude = src.slice(start, open >= 0 ? open : end - 1).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const at = /^@([\w-]+)/.exec(prelude);
    if (open < 0) { items.push({ kind: 'statement', name: at ? at[1].toLowerCase() : '', text: src.slice(start, end) }); i = end; continue; }
    const close = skipBlock(src, open + 1);
    const text = src.slice(start, close);
    if (at && GROUP_AT.has(at[1].toLowerCase())) {
      items.push({ kind: 'group', name: at[1].toLowerCase(), prelude, open: src.slice(start, open + 1), items: parseCss(src, open + 1, close - 1), text });
    } else if (at) {
      items.push({ kind: 'atomic', name: at[1].toLowerCase(), prelude, text });
    } else {
      items.push({ kind: 'rule', prelude, text });
    }
    i = close;
  }
  return items;
}

// セレクタの並び(a, b)をトップレベルの , で分ける
function splitSelectorList(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '"' || c === '\'') { const e = skipString(sel, i); cur += sel.slice(i, e); i = e - 1; continue; }
    if (c === '\\') { cur += sel.slice(i, i + 2); i++; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// 1つのセレクタ(複合)が要るクラス名。関数の中(:not() など)・属性セレクタ・文字列は条件にしない
function requiredClasses(sel) {
  let s = '';
  let depth = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '"' || c === '\'') { i = skipString(sel, i) - 1; continue; }
    if (c === '\\') { if (!depth) s += sel.slice(i, i + 2); i++; continue; }
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth--; continue; }
    if (!depth) s += c;
  }
  const out = [];
  for (const m of s.matchAll(/\.((?:[\w-]|\\.)+)/g)) out.push(m[1].replace(/\\(.)/g, '$1'));
  return out;
}

// 本体のファイルの中身から「クラス名になりうる名前」を集める。戻り値 has(クラス名) → true/false
function nameIndex(sources) {
  const exact = new Set();
  const prefixes = new Set();
  const suffixes = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/[\w-]+/g)) {
      const t = m[0];
      exact.add(t);
      if (t.length > 1 && t.endsWith('-') && !t.startsWith('--')) prefixes.add(t.replace(/^-+/, ''));
      if (t.length > 1 && t.startsWith('-') && !t.startsWith('--')) suffixes.add(t.replace(/-+$/, ''));
    }
  }
  const pre = [...prefixes].filter((p) => p && p !== '-');
  const suf = [...suffixes].filter((p) => p && p !== '-');
  return (cls) => exact.has(cls) || pre.some((p) => cls.startsWith(p)) || suf.some((p) => cls.endsWith(p));
}

// 規則が「本体の要素に当たりうる」か(セレクタの並びのどれか1つで、要るクラスがすべて本体にある)
function canMatch(prelude, has) {
  return splitSelectorList(prelude).some((sel) => requiredClasses(sel).every(has));
}

// アニメーションの名前(animation / animation-name で使っているもの)
function animationNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/gi)) {
    for (const part of m[1].split(',')) for (const w of part.trim().split(/\s+/)) if (/^-?[A-Za-z_][\w-]*$/.test(w)) names.add(w);
  }
  return names;
}

// 最初の表示に入れる項目を選んで、元の順番のままの CSS の文字列にする。
// 戻り値 { css, kept, dropped }(数は規則の数。@media の中も1つずつ数える)
function firstPaint(items, has) {
  let kept = 0;
  let dropped = 0;
  const used = new Set();
  // 1回目: 規則を選ぶ(@keyframes はあとで)
  const pick = (list) => list.map((it) => {
    if (it.kind === 'rule') {
      if (canMatch(it.prelude, has)) { animationNames(it.text).forEach((n) => used.add(n)); return it; }
      dropped++;
      return null;
    }
    if (it.kind === 'group') {
      const inner = pick(it.items);
      return inner.some(Boolean) ? Object.assign({}, it, { picked: inner }) : null;
    }
    return it; // @font-face・@keyframes・@property・; で終わるものは2回目で決める
  });
  const picked = pick(items);
  // 2回目: @keyframes は、入れた規則が使っているもの・本体のコードに名前が出てくるもの(element.animate や style.animation で使う)
  const out = (list) => list.map((it) => {
    if (!it) return '';
    if (it.kind === 'group') {
      const inner = out(it.picked);
      return inner ? `${it.open}${inner}}` : '';
    }
    if (it.kind === 'atomic' && /keyframes$/.test(it.name)) {
      const name = it.prelude.replace(/^@[\w-]+\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
      if (!used.has(name) && !has(name)) { dropped++; return ''; }
    }
    kept++;
    return it.text;
  }).join('');
  return { css: out(picked), kept, dropped };
}

// 項目を文字列に戻したもの(確認用: parseCss のあとに元へ戻せること)
function serialize(items) {
  return items.map((it) => (it.kind === 'group' ? `${it.open}${serialize(it.items)}}` : it.text)).join('');
}

module.exports = { parseCss, splitSelectorList, requiredClasses, nameIndex, canMatch, animationNames, firstPaint, serialize };
