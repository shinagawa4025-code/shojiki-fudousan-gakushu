// 公開用ビルドの CSS の分け方(tools/lib/cssplit.js), Node
// 最初の表示の CSS は「本体のコードに出てくるクラスだけを要る規則」を元の順番のまま残し、詳細の CSS は元の全部(build.js)。
// ここでは、規則の分け方・戻し方・判定が控えめ(迷うものは残す)であることと、今の webapp の CSS で
// 初回ガイド・ホーム・読み込み中の画面などの規則が最初の表示に入ることを確かめる
'use strict';
const fs = require('fs');
const path = require('path');
const { test, run, RAW } = require('../lib/harness.js');
const C = require('../../lib/cssplit.js');
const { minifyCss } = require('../../lib/minify.js');
const { parseBlocks } = require('../../lib/html.js');

test('規則に分けて戻すと元と同じ(@media の入れ子・文字列の中の { } ; ・url( ) ・コメント)', (t) => {
  const src = `/* c { } */.a{color:red}@media (min-width: 600px){.b{content:"}{;"}@supports (x:y){.c .d{background:url(a;b{.png)}}}@font-face{font-family:F;src:url("f.woff2")}@keyframes k{from{opacity:0}to{opacity:1}}.e::before{content:'\\'}'}`;
  const items = C.parseCss(src);
  t.eq(items.map((x) => x.kind), ['rule', 'group', 'atomic', 'atomic', 'rule'], '最上位の項目の種類');
  t.eq(C.serialize(items), src.replace(/^\/\*[\s\S]*?\*\//, ''), '戻すと元と同じ(先頭のコメントを除く)');
  t.eq(items[1].items[1].items[0].prelude, '.c .d', '入れ子の @supports の中の規則');
});

test('セレクタが要るクラス(関数の中・属性・文字列は条件にしない)', (t) => {
  t.eq(C.splitSelectorList('.a, :is(.b, .c) .d, [data-x="a,b"] .e'), ['.a', ':is(.b, .c) .d', '[data-x="a,b"] .e'], 'トップレベルの , だけで分ける');
  t.eq(C.requiredClasses('.a.b > .c:not(.d)::before'), ['a', 'b', 'c'], ':not の中は条件にしない');
  t.eq(C.requiredClasses(':is(.x, .y) .z:has(.w) [class~="v"]'), ['z'], ':is・:has・属性は条件にしない');
  t.eq(C.requiredClasses('.sm\\:p-2'), ['sm:p-2'], 'エスケープ');
});

test('名前の集め方(前後につなげて作るクラス)と判定', (t) => {
  const has = C.nameIndex(['el.className = `cat-${id} chip`; const k = name + `-icon`; x.classList.add("is-on")']);
  t.ok(has('chip') && has('is-on'), 'そのまま出てくる名前');
  t.ok(has('cat-gyoho') && has('home-icon'), '`cat-${…}` は cat- で始まるクラス・`${…}-icon` は -icon で終わるクラス');
  t.ok(!has('quiz-card'), '出てこない名前');
  t.ok(C.canMatch('.quiz-card .x, .chip', has), 'セレクタの並びのどれかで本体に当たれば残す');
  t.ok(!C.canMatch('.quiz-card .chip', has), '1つでも本体にないクラスを要るなら、詳細が届く前の画面には当たらない');
  t.ok(C.canMatch(':root[data-theme="dark"]', has) && C.canMatch('body', has), 'クラスのない規則は残す');
});

test('最初の表示の CSS は元の順番を保った一部分(@keyframes は使うものだけ・@font-face は残す)', (t) => {
  const src = '.a{animation:spin 1s}.gone{animation:fade 1s}@media (x){.gone2{color:red}.a{color:blue}}@keyframes spin{to{transform:rotate(1turn)}}@keyframes fade{to{opacity:0}}@font-face{font-family:F}';
  const fp = C.firstPaint(C.parseCss(src), (c) => c === 'a');
  t.eq(fp.css, '.a{animation:spin 1s}@media (x){.a{color:blue}}@keyframes spin{to{transform:rotate(1turn)}}@font-face{font-family:F}', '残す規則だけを元の順に');
  const fp2 = C.firstPaint(C.parseCss('@media (x){.gone{color:red}}.a{color:red}'), (c) => c === 'a');
  t.eq(fp2.css, '.a{color:red}', '中身がなくなった @media は出さない');
});

test('今の webapp: 初回ガイド・ホーム・読み込み中・エラーの規則が最初の表示に入り、詳細だけの画面の規則は入らない', (t) => {
  const html = fs.readFileSync(path.join(RAW, 'index.html'), 'utf8');
  const blocks = parseBlocks(html);
  const read = (f) => fs.readFileSync(path.join(RAW, f), 'utf8');
  const core = [html, ...blocks.filter((b) => b.kind === 'js').flatMap((b) => b.files.filter((f) => !b.later.has(f))).map(read)];
  const has = C.nameIndex(core);
  const css = blocks.find((b) => b.kind === 'css');
  let fp = '';
  let all = '';
  for (const f of css.files) {
    const m = minifyCss(read(f)).code;
    const items = C.parseCss(m);
    t.ok(C.serialize(items) === m.trim(), `${f}: 分けて戻すと元と同じ`);
    fp += C.firstPaint(items, has).css;
    all += m;
  }
  for (const sel of ['.onb-overlay{', '.onb-dialog{', '.onb-choice{', '.home-go{', '.boot{', '.boot-status', '.toast', '.bottom-nav', '.fd-badge', '.error-card', '.global-search-results']) {
    t.ok(fp.includes(sel), `最初の表示に ${sel} がある`);
  }
  for (const sel of ['.exam-q-card', '.ox-btn{', '.calc-head', '.flip-card-front,.flip-card-back{']) {
    t.ok(all.includes(sel) && !fp.includes(sel), `${sel} は詳細だけ`);
  }
  t.eq((fp.match(/@font-face\s*\{/g) || []).length, (all.match(/@font-face\s*\{/g) || []).length, '@font-face はすべて最初の表示に');
});

run();
