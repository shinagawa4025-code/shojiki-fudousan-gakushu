// 穴埋めの共通部品(js/cloze.js)と、数字まとめ・比較表・条文穴埋めのデータの確認(tools/lib/checks/tools.js)(Node)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { test, run, RAW } = require('../lib/harness.js');
const { load, setToday, getKey, setKey, rng } = require('../lib/node.js');
const check = require('../../lib/checks/tools.js');

// アプリのデータ+js/cloze.js(画面の部品は使わないので UI は最小限)
function loadCloze(opts) {
  const env = load(Object.assign({ today: '2026-10-14' }, opts || {}));
  env.ctx.UI.escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  vm.runInContext(fs.readFileSync(path.join(RAW, 'js', 'cloze.js'), 'utf8'), env.ctx, { filename: 'js/cloze.js' });
  return env;
}

test('Cloze.options: 正解を1つ含む・重複と空と正解と同じ誤りを除く・最大4つ・決まった乱数で同じ並び', (t) => {
  const { ctx } = loadCloze();
  const C = ctx.Cloze;
  const o = C.options('5年', ['3年', '6年', '10年'], { rnd: rng(1) });
  t.eq(o.slice().sort(), ['10年', '3年', '5年', '6年'].sort(), '正解+誤り3つ');
  t.eq(C.options('5年', ['3年', '6年', '10年'], { rnd: rng(1) }), o, '同じ乱数なら同じ並び');
  t.eq(C.options(' 5年 ', ['5年', '', null, '3年', '3年']).slice().sort(), ['3年', '5年'], '正解と同じ・空・重複は除く(前後の空白も)');
  const many = C.options('A', ['B', 'C', 'D', 'E', 'F'], { rnd: rng(3) });
  t.ok(many.length === 4 && many.includes('A') && new Set(many).size === 4, '多ければ正解+3つ', many);
  t.ok(C.canChoose('A', ['B', 'C']) && !C.canChoose('A', ['B']) && !C.canChoose('A', ['A', 'A']), '誤りが2つ以上なら4択(足りなければ自分で採点)');
  t.eq(Array.from(C.shuffle([1, 2, 3, 4, 5], rng(7))).sort(), [1, 2, 3, 4, 5], 'shuffle は並べ替えるだけ');
});

test('Cloze.textOf: 文字列・空欄(正解か fill)・括弧書きをつなぐ', (t) => {
  const { ctx } = loadCloze();
  const parts = ['国内において', { b: 0 }, '(', { omit: '特定課税仕入れを除く。' }, ')について', { b: 1 }, '。'];
  const blanks = [{ a: '行う課税仕入れ' }, { a: '控除する' }];
  t.eq(ctx.Cloze.textOf(parts, blanks), '国内において行う課税仕入れ(特定課税仕入れを除く。)について控除する。', '正解でつなぐ');
  t.eq(ctx.Cloze.textOf(parts, blanks, (n) => `[${n}]`), '国内において[0](特定課税仕入れを除く。)について[1]。', 'fill で空欄を差し替える');
  t.eq(ctx.Cloze.textOf(null, null), '', 'parts がなければ空');
});

test('Cloze.record / update / stats: c・w・last・grade を足す・保存の直前に読み直す・壊れた記録は直す', (t) => {
  const { ctx } = loadCloze();
  const C = ctx.Cloze;
  C.record('numbersStats', 'num-a', 2);
  t.eq(getKey(ctx, 'numbersStats')['num-a'], { c: 1, w: 0, last: '2026-10-14', grade: 2 }, '正解(2)は c');
  // 別のタブが書いた記録を消さない
  setKey(ctx, 'numbersStats', Object.assign(getKey(ctx, 'numbersStats'), { 'num-b': { c: 3, w: 1, last: '2026-10-01', grade: 2 } }));
  setToday(ctx, '2026-10-15');
  C.record('numbersStats', 'num-a', 1);
  C.record('numbersStats', 'num-a', 0);
  const all = getKey(ctx, 'numbersStats');
  t.eq(all['num-a'], { c: 2, w: 1, last: '2026-10-15', grade: 0 }, 'あいまい(1)は c、まだ(0)は w。grade は最後の点');
  t.eq(all['num-b'], { c: 3, w: 1, last: '2026-10-01', grade: 2 }, 'ほかの記録はそのまま');
  setKey(ctx, 'joubunStats', { x: { c: -3, w: 'a', last: 'bad', grade: 7 }, y: 'junk', z: { c: 2.7, grade: 1 } });
  const st = C.stats('joubunStats');
  t.eq(st.x, { c: 0, w: 0, last: null, grade: null }, '範囲外の値は直す');
  t.ok(!('y' in st) && st.z.c === 2 && st.z.grade === 1, '壊れた記録は除く・小数は切り捨て', st);
  const u = C.update('compareStats', 'cmp-a', (s) => Object.assign({}, s || {}, { done: ((s && s.done) || 0) + 1 }));
  t.ok(u.done === 1 && getKey(ctx, 'compareStats')['cmp-a'].done === 1, 'update は関数の結果を保存', u);
  setKey(ctx, 'numbersStats', 'junk');
  t.ok(C.record('numbersStats', 'n1', 2).c === 1 && getKey(ctx, 'numbersStats').n1.c === 1, '保存の中身が壊れていても書ける');
});

test('Cloze.weakOrder: 点 0 → 1 → まだ → 2(同じ段は古い順・まだは元の順)', (t) => {
  const { ctx } = loadCloze();
  const st = {
    a: { grade: 2, last: '2026-10-10' }, b: { grade: 0, last: '2026-10-12' }, c: { grade: 1, last: '2026-10-01' },
    e: { grade: 0, last: '2026-10-02' }, f: { grade: 2, last: '2026-09-01' }, g: { c: 1, w: 3 },
  };
  t.eq(Array.from(ctx.Cloze.weakOrder(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], st)), ['g', 'e', 'b', 'c', 'd', 'h', 'f', 'a'], '苦手の順');
  t.ok(ctx.Cloze.known({ grade: 2 }) && !ctx.Cloze.known({ grade: 1 }) && !ctx.Cloze.known(null), '覚えた = 最後の点が 2');
});

test('Cloze.answered / award: 1回で Xp.award を1回(correct・unsure)と学習の記録1回。Xp がなくても・例外でも止まらない', (t) => {
  const { ctx } = loadCloze();
  const calls = [];
  ctx.Xp = { award: (kind, d) => { calls.push([kind, Object.assign({}, d)]); return 8; } };
  const before = ctx.Streak.todayCount ? ctx.Streak.todayCount() : 0;
  t.eq(ctx.Cloze.answered('compare', 'cmp-a:0-1', 2), 8, '足した XP を返す');
  ctx.Cloze.answered('joubun', 'jb-030-1', 1);
  ctx.Cloze.answered('numbers', 'num-1', 0);
  t.eq(calls, [['compare', { id: 'cmp-a:0-1', correct: true, unsure: false }], ['joubun', { id: 'jb-030-1', correct: true, unsure: true }], ['numbers', { id: 'num-1', correct: false, unsure: false }]], 'kind と detail');
  if (ctx.Streak.todayCount) t.eq(ctx.Streak.todayCount() - before, 3, '学習の記録が3回');
  ctx.Xp = { award: () => { throw new Error('x'); } };
  t.eq(ctx.Cloze.award('numbers', { id: 'n', correct: true }), 0, '例外は 0');
  delete ctx.Xp;
  t.eq(ctx.Cloze.answered('numbers', 'n', 2), 0, 'Xp がなければ 0');
});

test('Cloze.freshGuard: 作った直後のタップ(detail > 0)は受けず、キー操作(detail 0)と時間がたったタップは受ける', (t) => {
  const env = loadCloze();
  const ok = env.ctx.Cloze.freshGuard(300);
  t.ok(!ok({ detail: 1 }) && ok({ detail: 0 }) && ok(null), '直後: タップは受けない・キーは受ける');
  env.clock.t += 301;
  t.ok(ok({ detail: 1 }), '0.3秒たてば受ける');
});

test('Cloze.prefs / setPrefs: 画面ごとの好みを足して保存する', (t) => {
  const { ctx } = loadCloze();
  t.eq(JSON.parse(JSON.stringify(ctx.Cloze.prefs('numbers'))), {}, '最初は空');
  ctx.Cloze.setPrefs('numbers', { cat: 'gyoho', size: 10 });
  ctx.Cloze.setPrefs('numbers', { mode: 'choice' });
  ctx.Cloze.setPrefs('joubun', { mode: 'recall' });
  t.eq(getKey(ctx, 'toolPrefs'), { numbers: { cat: 'gyoho', size: 10, mode: 'choice' }, joubun: { mode: 'recall' } }, '画面ごとに足す');
});

// ---- データの確認 ----
const base = () => {
  const { ctx } = load({ today: '2026-10-14', extra: false });
  return ctx;
};
// 見本のデータ(ctx の APP_DATA を差し替えずに、確認だけに渡す)
function fake(ctx, patch) {
  return { APP_DATA: Object.assign({}, ctx.APP_DATA, patch), AppIndex: ctx.AppIndex, DateUtil: ctx.DateUtil };
}
const SRC = 'src01';
const goodNum = (o) => Object.assign({ id: 'num-x-1', cat: 'gyoho', group: 'g', q: '期間は{}である。', a: '5年', alts: ['3年', '6年', '10年'], note: '根拠。', lawRef: '法1条', sources: [SRC], basicIds: [] }, o || {});
const goodTable = (o) => Object.assign({
  id: 'cmp-x', title: 't', cat: 'kenri', topicId: 'topicL', basicIds: [], intro: 'i', cols: ['期間', '方式'],
  rows: [{ label: 'A', cells: ['50年以上', '書面'] }, { label: 'B', cells: ['30年以上', '定めなし'] }], keys: [[0, 0], [1, 0]], notes: [], lawRef: '法', sources: [SRC],
}, o || {});
const goodJoubun = (items, law) => ({ law: Object.assign({ name: '消費税法', num: '昭和63年法律第108号', asOf: '2026-10-01', url: 'https://laws.e-gov.go.jp/law/363AC0000000108' }, law || {}), items });
const jItem = (o) => Object.assign({ id: 'jb-001-1', article: '第1条第1項', title: '趣旨', group: '総則', topicId: 'topicR', basicIds: [], ref: { art: '1', para: '1' },
  parts: ['この法律は、', { b: 0 }, 'について、', { omit: '(略した文)' }, '定める。'], blanks: [{ a: '消費税', alts: ['所得税', '法人税', '酒税'] }] }, o || {});

test('データの確認: いまのデータはエラーなし(JSON があれば条文の照合も)', (t) => {
  const ctx = base();
  const r = check(ctx, { lawJson: null });
  t.eq(r.errors, [], '形の確認でエラーなし');
  const json = check.findLawJson();
  if (json) {
    const r2 = check(ctx, {});
    t.eq(r2.errors, [], '条文の照合もエラーなし');
    const n = (ctx.APP_DATA.joubun && ctx.APP_DATA.joubun.items || []).length;
    t.eq(r2.joubunChecked, n, `${n}項目すべて e-Gov の本文と一致`);
  } else t.log('e-Gov の JSON がないので照合は省略');
});

test('データの確認(数字): 空欄が1つ・誤りの選択肢3つ(正解・互いと違う)・出典と基礎知識・id の重複・分野', (t) => {
  const ctx = base();
  const errs = (list) => check(fake(ctx, { numbers: list, compareTables: [], joubun: null }), { lawJson: null }).errors;
  t.eq(errs([goodNum()]), [], '正しい形はエラーなし');
  t.ok(errs([goodNum({ q: '{}と{}' })]).some((e) => /ちょうど1つ/.test(e)), '空欄が2つ');
  t.ok(errs([goodNum({ q: '空欄なし' })]).some((e) => /ちょうど1つ/.test(e)), '空欄なし');
  t.ok(errs([goodNum({ alts: ['3年', '6年'] })]).some((e) => /ちょうど3つ/.test(e)), '誤りが2つ');
  t.ok(errs([goodNum({ alts: ['3年', '5年', '6年'] })]).some((e) => /正解.*同じ/.test(e)), '誤りに正解');
  t.ok(errs([goodNum({ alts: ['3年', '3年', '6年'] })]).some((e) => /2回/.test(e)), '誤りが重複');
  t.ok(errs([goodNum({ sources: ['src9999'] })]).some((e) => /存在しない出典/.test(e)), '出典がない');
  t.ok(errs([goodNum({ sources: [] })]).some((e) => /sources/.test(e)), '出典が空');
  t.ok(errs([goodNum({ basicIds: ['basicZZZ'] })]).some((e) => /存在しない基礎知識/.test(e)), '基礎知識がない');
  t.ok(errs([goodNum(), goodNum()]).some((e) => /重複/.test(e)), 'id の重複');
  t.ok(errs([goodNum({ cat: 'shohiho' })]).some((e) => /cat/.test(e)), '数字に消費税法の分野はない');
  t.ok(errs([goodNum({ reviewBy: '2026/10/1' })]).some((e) => /reviewBy/.test(e)), 'reviewBy の形');
  t.ok(check(fake(ctx, { numbers: [goodNum({ reviewBy: '2026-01-01' })], compareTables: [], joubun: null }), { lawJson: null }).warnings.some((w) => /過ぎて/.test(w)), '見直す日を過ぎたら警告');
});

test('データの確認(比較表): 行と列の数・隠すマス(範囲・重複・同じ列に同じ値)・トピックと出典', (t) => {
  const ctx = base();
  const res = (tb) => check(fake(ctx, { numbers: [], compareTables: [tb], joubun: null }), { lawJson: null });
  t.eq(res(goodTable()).errors, [], '正しい形はエラーなし');
  t.ok(res(goodTable({ rows: [{ label: 'A', cells: ['1'] }, { label: 'B', cells: ['2', '3'] }] })).errors.some((e) => /cells の数/.test(e)), 'マスの数が列と違う');
  t.ok(res(goodTable({ keys: [[0, 0], [0, 0]] })).errors.some((e) => /重複/.test(e)), '隠すマスの重複');
  t.ok(res(goodTable({ keys: [[5, 0]] })).errors.some((e) => /表の外/.test(e)), '隠すマスが表の外');
  t.ok(res(goodTable({ keys: [[0, 1]], rows: [{ label: 'A', cells: ['50年', '書面'] }, { label: 'B', cells: ['30年', '書面'] }] })).errors.some((e) => /同じ値/.test(e)), '同じ列に同じ値');
  t.ok(res(goodTable({ keys: [] })).errors.some((e) => /keys/.test(e)), '隠すマスがない');
  t.ok(res(goodTable({ topicId: 'topicZZ' })).errors.some((e) => /トピック/.test(e)), 'トピックがない');
  t.ok(res(goodTable({ cat: 'other' })).errors.some((e) => /cat/.test(e)), '分野');
  t.ok(res(goodTable({ rows: [{ label: 'A', cells: ['あ'.repeat(29), 'x'] }, { label: 'B', cells: ['y', 'z'] }] })).warnings.some((w) => /28字/.test(w)), '29字のマスは警告');
  t.eq(res(goodTable({ cat: 'shohiho', topicId: 'topicS' })).errors, [], '消費税法の表');
});

test('データの確認(条文): 空欄の番号・誤りの選択肢・ref・e-Gov の本文との照合(JSON があるときだけ)', (t) => {
  const ctx = base();
  const res = (items, info, law) => check(fake(ctx, { numbers: [], compareTables: [], joubun: goodJoubun(items, law) }), info || { lawJson: null });
  t.eq(res([jItem()]).errors, [], '正しい形はエラーなし');
  t.ok(res([jItem({ parts: ['あ', { b: 0 }, { b: 0 }] })]).errors.some((e) => /2回以上/.test(e)), '同じ空欄を2回');
  t.ok(res([jItem({ parts: ['あ', { b: 1 }] })]).errors.some((e) => /外です/.test(e)), '空欄の番号が blanks の外');
  t.ok(res([jItem({ parts: ['あ'] })]).errors.some((e) => /使われていません/.test(e)), '使わない空欄');
  t.ok(res([jItem({ parts: ['あ', { b: 0 }, { x: 1 }] })]).errors.some((e) => /どれでもありません/.test(e)), '知らない部品');
  t.ok(res([jItem({ blanks: [{ a: '消費税', alts: ['所得税', '消費税', '酒税'] }] })]).errors.some((e) => /正解/.test(e)), '誤りに正解');
  t.ok(res([jItem(), jItem()]).errors.some((e) => /重複/.test(e)), 'id の重複');
  t.ok(res([jItem()], null, { url: 'https://example.com/' }).errors.some((e) => /e-Gov/.test(e)), 'URL は e-Gov');
  t.ok(res([jItem({ ref: { art: '2', para: '1' } })]).warnings.some((w) => /合っていません/.test(w)), 'article と ref が違えば警告');
  t.eq(check.refFromArticle('第57条の4第1項第2号'), { art: '57_4', para: '1', item: '2' }, 'article から ref(条の枝番・号)');
  t.eq(check.refFromArticle('第2条第1項第8号の2'), { art: '2', para: '1', item: '8_2' }, '号の枝番');
  t.eq(check.refFromArticle('第9条'), { art: '9', para: '1' }, '項がなければ第1項');

  // 照合: 一時的な JSON(CI にも同じものを置ける)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fudomana-law-'));
  t.defer(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'law.json');
  fs.writeFileSync(file, JSON.stringify({ asOf: '2026-10-01', articles: {
    1: { paragraphs: { 1: { sentence: 'この法律は、消費税について、(略した文)定める。', items: {} } } },
    2: { paragraphs: { 1: { sentence: '', items: { 8: '号の文。' }, subitems: { 8: { イ: 'イの文。' } } } } },
  } }));
  const ok = res([jItem()], { lawJson: file });
  t.ok(ok.errors.length === 0 && ok.joubunChecked === 1, '一致すればエラーなし(照合 1件)', ok);
  const ng = res([jItem({ parts: ['この法律は、', { b: 0 }, 'については、', { omit: '(略した文)' }, '定める。'] })], { lawJson: file });
  t.ok(ng.errors.some((e) => /e-Gov の本文と違います/.test(e) && /違います/.test(e)), '1字でも違えばエラー(違う所を示す)', ng.errors);
  t.ok(res([jItem({ ref: { art: '1', para: '3' } })], { lawJson: file }).errors.some((e) => /JSON にありません/.test(e)), 'JSON にない項');
  t.ok(res([jItem({ id: 'jb-002-1-8', article: '第2条第1項第8号', ref: { art: '2', para: '1', item: '8' }, parts: [{ b: 0 }, '文。'], blanks: [{ a: '号の', alts: ['a', 'b', 'c'] }] })], { lawJson: file }).errors.length === 0, '号(item)の本文と照合');
  t.ok(res([jItem({ id: 'jb-s', article: '第2条第1項第8号', ref: { art: '2', para: '1', item: '8', sub: 'イ' }, parts: ['イの', { b: 0 }], blanks: [{ a: '文。', alts: ['a', 'b', 'c'] }] })], { lawJson: file }).errors.length === 0, '号の細分(sub)の本文と照合');
  t.ok(res([jItem()], { lawJson: file }, { asOf: '2026-11-01' }).warnings.some((w) => /時点/.test(w)), '時点が違えば警告');
  t.eq(res([jItem({ parts: ['ちがう', { b: 0 }] })], { lawJson: null }).errors, [], 'JSON がなければ照合しない(CI)');
  t.ok(res([jItem()], { lawJson: path.join(dir, 'none.json') }).errors.some((e) => /読めません/.test(e)), '指定した JSON が読めなければエラー');
});

run();
