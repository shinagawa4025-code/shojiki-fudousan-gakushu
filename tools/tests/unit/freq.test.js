// 出題頻度ランク(v14): js/freq.js の API(見本のデータで)・成績・今日のメニュー(js/recommend.js)の頻出Aの優先・
// データの確認(tools/lib/checks/freq.js)。Node
// 見本のデータは、今ある問題・基礎知識から作る(data/frequency.js の中身・件数に左右されない)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, run, RAW } = require('../lib/harness.js');
const { load, setKey } = require('../lib/node.js');
const check = require('../../lib/checks/freq.js');

const T = '2026-10-14';
const run1 = (ctx, rel) => vm.runInContext(fs.readFileSync(path.join(RAW, rel), 'utf8').replace(/^﻿/, ''), ctx, { filename: rel });
const clone = (v) => JSON.parse(JSON.stringify(v));

// 見本: 12回・テーマ4つ(A: 宅建業法の最初の小見出し・4択8問 / B: 2つ目の小見出し・4択4問 / C: 権利関係の最初の小見出し・4択3問 / A: 問題のないテーマ)
function fixture(ctx) {
  const D = ctx.APP_DATA;
  const K = D.topics.find((t) => t.id === 'topicK');
  const L = D.topics.find((t) => t.id === 'topicL');
  const isMc = (q) => ctx.QuizEngine.isMcItem(q) && ctx.QuizEngine.hasStatements(q);
  const of = (cat) => D.quiz.filter((q) => q.examCats && q.examCats.takken === cat && isMc(q)).map((q) => q.id);
  const g = of('gyoho');
  const k = of('kenri');
  const exams = Array.from({ length: 12 }, (_, i) => ({ id: `E${12 - i}`, label: `第${12 - i}回`, date: `${2025 - i}-10-19` }));
  const themes = [
    { id: 'fq-gyoho-01', name: 'テーマA', cat: 'gyoho', topicId: 'topicK', section: K.sections[0].name, basicIds: K.sections[0].ids.slice(0, 3), hits: 11, questions: 14, rank: 'A', last: 'E12' },
    { id: 'fq-gyoho-02', name: 'テーマB', cat: 'gyoho', topicId: 'topicK', section: K.sections[1].name, basicIds: K.sections[1].ids.slice(0, 2), hits: 6, questions: 6, rank: 'B', last: 'E11' },
    { id: 'fq-kenri-01', name: 'テーマC', cat: 'kenri', topicId: 'topicL', section: L.sections[0].name, basicIds: L.sections[0].ids.slice(0, 2), hits: 2, questions: 2, rank: 'C', last: 'E9' },
    { id: 'fq-gyoho-03', name: 'テーマA2', cat: 'gyoho', topicId: 'topicK', section: K.sections[0].name, basicIds: K.sections[0].ids.slice(3, 5), hits: 9, questions: 9, rank: 'A', last: 'E12' },
  ];
  const quizTheme = {};
  g.slice(0, 8).forEach((id) => { quizTheme[id] = 'fq-gyoho-01'; });
  g.slice(8, 12).forEach((id) => { quizTheme[id] = 'fq-gyoho-02'; });
  k.slice(0, 3).forEach((id) => { quizTheme[id] = 'fq-kenri-01'; });
  return { asOf: '2026-10-22', exams, method: '見本のデータです。', rankRule: { A: 0.75, B: 0.4 }, themes, quizTheme };
}

function setup(opts) {
  const env = load(Object.assign({ today: T }, opts || {}));
  run1(env.ctx, 'js/freq.js');
  const f = fixture(env.ctx);
  env.ctx.APP_DATA.frequency = vm.runInContext(`(${JSON.stringify(f)})`, env.ctx);
  return { env, ctx: env.ctx, F: env.ctx.Freq, f };
}

test('データがないときは空の結果(札も出さない)・データが届いたら使える', (t) => {
  const env = load({ today: T });
  run1(env.ctx, 'js/freq.js');
  const F = env.ctx.Freq;
  const keep = env.ctx.APP_DATA.frequency;
  env.ctx.APP_DATA.frequency = null; // 公開版の本体(詳細が届く前)
  t.ok(!F.ready() && F.info() === null && F.total() === 0, 'ready() は false・info() は null');
  t.ok(F.themes().length === 0 && F.theme('fq-gyoho-01') === null && F.themeOfQuiz('quiz-K-01') === null && F.rankOfBasic('basicK01') === null, '引いても null・空');
  t.eq(F.chipHtml(null), '', 'ランクなしの札は空');
  t.ok(F.menuPick('basic') === null && F.menuPick('ox') === null, '今日のメニューにも出さない');
  t.eq(Object.keys(F.masteryAll()).length, 0, '成績も空');
  const f = fixture(env.ctx);
  env.ctx.APP_DATA.frequency = vm.runInContext(`(${JSON.stringify(f)})`, env.ctx);
  t.ok(F.ready() && F.themes().length === 4, '届いたら使える(作り置きは作り直す)');
  env.ctx.APP_DATA.frequency = keep;
});

test('引く: テーマ・問題(○×の文の id も)・基礎知識・小見出し・回数・ランクの札', (t) => {
  const { ctx, F, f } = setup();
  const qA = Object.keys(f.quizTheme).find((id) => f.quizTheme[id] === 'fq-gyoho-01');
  const i = F.info();
  t.ok(i.total === 12 && i.first.id === 'E1' && i.last.id === 'E12' && i.asOf === '2026-10-22' && i.rankRule.A === 0.75, 'info: 12回・最も古い回・最も新しい回', i);
  t.eq([F.minHits('A'), F.minHits('B')], [9, 5], '境目は 12回中9回・5回');
  t.eq(F.examLabel('E12'), '第12回', '回の名前');
  const list = F.themes();
  list.pop();
  t.eq(F.themes().length, 4, 'themes() はコピー');
  t.eq(F.theme('fq-gyoho-02').rank, 'B', 'theme(id)');
  t.ok(F.theme('constructor') === null && F.theme(5) === null, '知らない id・文字列でない id は null');
  t.eq(F.themeOfQuiz(qA).id, 'fq-gyoho-01', 'themeOfQuiz');
  t.eq(F.themeOfQuiz(`${qA}#2`).id, 'fq-gyoho-01', '○×の文の id でも元の4択のテーマ');
  t.eq(F.rankOfQuiz(qA), 'A', 'rankOfQuiz');
  const life = ctx.APP_DATA.quiz.find((q) => !(q.examCats && q.examCats.takken));
  t.ok(F.rankOfQuiz(life.id) === null && F.rankOfQuiz('constructor') === null && F.rankOfQuiz(undefined) === null, '宅建士の分野のない問題・知らない id は null');
  const b = f.themes[0].basicIds[0];
  t.ok(F.themeOfBasic(b).id === 'fq-gyoho-01' && F.rankOfBasic(b) === 'A' && F.rankOfBasic('basicZZZ') === null, 'themeOfBasic / rankOfBasic');
  t.eq(F.themesBySection('topicK', f.themes[0].section).map((x) => x.id), ['fq-gyoho-01', 'fq-gyoho-03'], 'themesBySection(小見出し)');
  t.eq(F.themesBySection('topicK').length, 3, 'themesBySection(トピック全体)');
  const K = ctx.APP_DATA.topics.find((x) => x.id === 'topicK');
  t.eq(F.sectionBest('topicK', K.sections[1].name, K.sections[1].ids).id, 'fq-gyoho-02', '小見出しのいちばん高いランク(B だけの小見出し)');
  t.eq(F.sectionBest('topicK', K.sections[0].name, K.sections[0].ids).id, 'fq-gyoho-01', '同じランクなら出た回数の多いテーマ');
  t.ok(F.sectionBest('topicK', 'ない小見出し', []) === null, 'テーマのない小見出しは null');
  const chip = F.chipFor(F.theme('fq-gyoho-01'));
  t.ok(/class="freq-chip is-a"/.test(chip) && /aria-hidden="true">頻出A</.test(chip) && /sr-only">出題頻度A\(直近12回中11回\)</.test(chip), '札: 見た目は「頻出A」・読み上げは回数つき', chip);
  t.ok(/is-c/.test(F.chipHtml('C')) && /sr-only">出題頻度C</.test(F.chipHtml('C')) && F.chipHtml('D') === '' && F.chipHtml('<b>') === '', 'ランクだけの札・知らないランクは空');
  t.ok(/sr-only">この中で出題頻度B/.test(F.chipHtml('B', { prefix: 'この中で' })) && !/<i>/.test(F.chipHtml('A', { cls: '<i>' })), '読み上げの前置き・クラスは文字として入れる');
  t.ok(F.matchLevel(qA, 'A') && F.matchLevel(qA, 'AB') && F.matchLevel(qA, 'all'), 'A の問題は Aだけ・AとB に入る');
  const qB = Object.keys(f.quizTheme).find((id) => f.quizTheme[id] === 'fq-gyoho-02');
  const qC = Object.keys(f.quizTheme).find((id) => f.quizTheme[id] === 'fq-kenri-01');
  t.ok(!F.matchLevel(qB, 'A') && F.matchLevel(qB, 'AB') && !F.matchLevel(qC, 'AB') && !F.matchLevel(life.id, 'A') && F.matchLevel(life.id, 'all'), 'B は AとB だけ・C とテーマのない問題は「すべて」だけ');
  t.eq(F.quizIdsOf('fq-gyoho-01'), Object.keys(f.quizTheme).filter((id) => f.quizTheme[id] === 'fq-gyoho-01'), 'quizIdsOf はデータの順');
  t.eq(F.quizIdsOf('fq-gyoho-03'), [], '問題のないテーマは空');
  const want = ctx.QuizEngine.allStatements().filter((s) => f.quizTheme[s.quizId] === 'fq-gyoho-01').length;
  t.ok(F.statementCountOf('fq-gyoho-01') === want && want > 0, `○×で出せる文の数(${want})`);
});

test('成績: 4択は最後の結果・○×は文ごとの最後の結果(今ある文だけ・壊れた記録は数えない)', (t) => {
  const { ctx, F, f } = setup();
  const qs = F.quizIdsOf('fq-gyoho-01');
  setKey(ctx, 'quizHistory', { [qs[0]]: 'ok', [qs[1]]: 'ng', [qs[2]]: 'ng', [qs[3]]: 'x', constructor: 'ok' });
  const st = ctx.QuizEngine.allStatements().filter((s) => f.quizTheme[s.quizId] === 'fq-gyoho-01');
  setKey(ctx, 'oxStats', {
    [st[0].id]: { c: 1, w: 2, last: T, lastOk: false },
    [st[1].id]: { c: 3, w: 0, last: T, lastOk: true },
    [st[2].id]: { c: 1, w: 1 }, // lastOk がない古い記録は「不正解なし」で決める → 不正解
    [st[3].id]: 'broken',
    [`${qs[0]}#99`]: { c: 1, w: 0, lastOk: true }, // 今ない文
    'quiz-none#1': { c: 1, w: 0, lastOk: true },
  });
  const m = F.mastery('fq-gyoho-01');
  t.eq(m.mc, { answered: 3, correct: 1 }, '4択: 3問中1問正解');
  t.eq(m.ox, { answered: 3, correct: 1 }, '○×: 3文中1文正解');
  t.ok(m.answered === 6 && m.correct === 2 && Math.abs(m.rate - 1 / 3) < 1e-9, '合わせて 6中2(33%)', m);
  t.eq(F.mastery('fq-kenri-01'), { answered: 0, correct: 0, rate: 0, mc: { answered: 0, correct: 0 }, ox: { answered: 0, correct: 0 } }, '解いていないテーマは 0');
  t.eq(F.mastery('nothing').answered, 0, '知らないテーマも 0');
  setKey(ctx, 'quizHistory', 'junk');
  setKey(ctx, 'oxStats', [1, 2]);
  t.eq(F.mastery('fq-gyoho-01').answered, 0, '壊れた保存値は空として読む');
});

test('伸ばしたい論点(頻出Aで正答率の低い順)・まだあまり解いていない論点', (t) => {
  const { ctx, F } = setup();
  const a1 = F.quizIdsOf('fq-gyoho-01');
  const b = F.quizIdsOf('fq-gyoho-02');
  t.eq(F.weakThemes().length, 0, '何も解いていなければ伸ばしたい論点はない');
  t.eq(F.freshThemes({ rank: 'A' }).map((x) => x.theme.id), ['fq-gyoho-01', 'fq-gyoho-03'], 'まだ解いていない頻出A(出た回数の多い順)');
  setKey(ctx, 'quizHistory', { [a1[0]]: 'ok', [a1[1]]: 'ng', [a1[2]]: 'ng', [b[0]]: 'ng', [b[1]]: 'ng', [b[2]]: 'ng' });
  const w = F.weakThemes();
  t.ok(w.length === 1 && w[0].theme.id === 'fq-gyoho-01' && w[0].m.answered === 3, '頻出Aだけ(B の論点は入らない)', w.map((x) => x.theme.id));
  t.eq(F.weakThemes({ rank: 'B' })[0].theme.id, 'fq-gyoho-02', 'rank を指定すると B も');
  t.eq(F.weakThemes({ min: 4 }).length, 0, '解いた数の下限に届かなければ出さない');
  t.eq(F.freshThemes({ rank: 'A' }).map((x) => x.theme.id), ['fq-gyoho-03'], '下限以上解いたテーマは「まだ」から外す');
});

test('今日のメニュー用(menuPick): 頻出Aで成績の低いテーマの次の基礎知識・○×の行き先', (t) => {
  const { ctx, F, f } = setup();
  const order = ctx.AppIndex.topicBasicOrder.topicK;
  const first = (ids) => ids.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  // 何も解いていない: 出た回数の多い A のテーマから
  let p = F.menuPick('basic');
  t.ok(p && p.theme.id === 'fq-gyoho-01' && p.topicId === 'topicK' && p.basicId === first(f.themes[0].basicIds), '最初は出た回数の多い頻出Aの最初の基礎知識', p && { id: p.theme.id, b: p.basicId });
  // fq-gyoho-01 をよく解けている(8割以上)・fq-gyoho-03 は未着手 → 未着手を先に
  const a1 = F.quizIdsOf('fq-gyoho-01');
  setKey(ctx, 'quizHistory', Object.fromEntries(a1.slice(0, 5).map((id) => [id, 'ok'])));
  p = F.menuPick('basic');
  t.eq(p && p.theme.id, 'fq-gyoho-03', 'できているテーマより、まだ解いていない頻出Aを先に');
  // fq-gyoho-01 が弱い(6割未満)→ 弱いテーマを先に
  setKey(ctx, 'quizHistory', Object.fromEntries(a1.slice(0, 4).map((id, i) => [id, i ? 'ng' : 'ok'])));
  p = F.menuPick('basic');
  t.eq(p && p.theme.id, 'fq-gyoho-01', '正答率の低い頻出Aを先に');
  // そのテーマの基礎知識をすべて学習済みにすると次のテーマ
  setKey(ctx, 'basicsProgress', Object.fromEntries(f.themes[0].basicIds.map((id) => [id, { learned: true }])));
  p = F.menuPick('basic');
  t.eq(p && p.theme.id, 'fq-gyoho-03', '学習済みのテーマは飛ばす');
  setKey(ctx, 'basicsProgress', Object.fromEntries(f.themes[0].basicIds.concat(f.themes[3].basicIds).map((id) => [id, { learned: true }])));
  t.eq(F.menuPick('basic'), null, '頻出Aの基礎知識をすべて読んだら null');
  // 分野の指定(伸ばしたい分野)があればその分野の A を先に(この見本では A は宅建業法だけ)
  t.eq(F.menuPick('basic', { cat: 'kenri' }), null, '分野を指定しても、読むものがなければ null');
  const ox = F.menuPick('ox', { min: 10, count: 10 });
  const n = F.statementCountOf('fq-gyoho-01');
  if (n >= 10) t.eq(ox && ox.nav, '#ox/freq/fq-gyoho-01/10', `○×: 弱いテーマ(${n}文)・10問`);
  else t.eq(ox, null, '○×: 10文に届くテーマがなければ null');
  t.eq(F.menuPick('ox', { min: 100000 }), null, '文の数が足りなければ null');
  t.eq(F.menuPick('other'), null, '知らない種類は null');
});

test('今日のメニュー用: まだ解いていない頻出Aは、読む順のトピック(topics)があれば読む順(なければ出た回数の多い順)', (t) => {
  const { ctx, F, f } = setup();
  const g = clone(f);
  g.themes[3].hits = 12; // fq-gyoho-03(小見出しの後ろの基礎知識)の方が多く出た
  ctx.APP_DATA.frequency = vm.runInContext(`(${JSON.stringify(g)})`, ctx);
  t.eq(F.menuPick('basic').theme.id, 'fq-gyoho-03', '読む順なし: 出た回数の多いテーマ');
  t.eq(F.menuPick('basic', { topics: ['topicL', 'topicK'] }).theme.id, 'fq-gyoho-01', '読む順あり: トピックの最初の基礎知識に近いテーマ(はじめての人に途中から勧めない)');
  const a3 = F.quizIdsOf('fq-gyoho-01');
  setKey(ctx, 'quizHistory', Object.fromEntries(a3.slice(0, 3).map((id) => [id, 'ok'])));
  t.eq(F.menuPick('basic', { topics: ['topicK'] }).theme.id, 'fq-gyoho-03', 'できているテーマは後回し(読む順より先に成績で分ける)');
});

test('今日のメニュー(Recommend.todayMenu): 宅建士が目標なら④は頻出Aの基礎知識・③(間違えた文がない日)は頻出Aの○×', (t) => {
  const { ctx, F, f } = setup();
  run1(ctx, 'js/recommend.js');
  setKey(ctx, 'examTargets', [{ id: 'et1', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: Date.UTC(2026, 0, 1) }]);
  const steps = ctx.Recommend.todayMenu();
  const basic = steps.find((s) => s.id === 'basic');
  const p = F.menuPick('basic');
  t.ok(basic && basic.nav === `#topics/${p.topicId}/${p.basicId}` && /^頻出A・/.test(basic.sub), '④ 頻出Aのテーマの基礎知識(「頻出A・」を付ける)', basic);
  const ox = steps.find((s) => s.id === 'ox');
  const pick = F.menuPick('ox', { min: 10, count: 10 });
  if (pick) t.ok(ox.title === '頻出Aの○×' && ox.nav === pick.nav && ox.sub === `${pick.name}・10問`, '③ 頻出Aのテーマの○×', ox);
  else t.ok(ox.title === '○×で腕試し', '③ 10文に届くテーマがなければ今までどおり', ox);
  // 間違えた文があれば③は今までどおり「苦手の○×」
  const s = ctx.QuizEngine.allStatements()[0];
  setKey(ctx, 'oxStats', { [s.id]: { c: 0, w: 1, last: '2026-10-01', lastOk: false } });
  const ox2 = ctx.Recommend.todayMenu().find((x) => x.id === 'ox');
  t.ok(ox2.title === '苦手の○×' && /^#ox\/weak\//.test(ox2.nav), '間違えた文があれば苦手の○×', ox2);
  // 税理士が目標なら頻出は使わない
  setKey(ctx, 'examTargets', [{ id: 'et2', name: '税理士試験', examTypeId: 'zeirishi', date: '2027-08-03', primary: true, createdAt: Date.UTC(2026, 0, 1) }]);
  const z = ctx.Recommend.todayMenu().find((x) => x.id === 'basic');
  t.ok(z && !/^頻出A/.test(z.sub) && !/^#topics\/topicK\//.test(z.nav), '税理士が目標なら今までどおり', z);
  // js/freq.js がない(公開版で詳細が届く前)ときも今までどおり
  setKey(ctx, 'examTargets', [{ id: 'et1', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: Date.UTC(2026, 0, 1) }]);
  setKey(ctx, 'oxStats', {});
  const keep = ctx.Freq;
  ctx.Freq = undefined;
  const plain = ctx.Recommend.todayMenu();
  t.ok(!/^頻出A/.test(plain.find((x) => x.id === 'basic').sub) && plain.find((x) => x.id === 'ox').title === '○×で腕試し', 'Freq がなければ今までどおり');
  ctx.Freq = keep;
  ctx.APP_DATA.frequency = null;
  t.ok(!/^頻出A/.test(ctx.Recommend.todayMenu().find((x) => x.id === 'basic').sub), 'データが null でも今までどおり');
});

test('データの確認(tools/lib/checks/freq.js): 見本は通る・形の誤りはエラー', (t) => {
  const { ctx, f } = setup();
  const D = ctx.APP_DATA;
  const base = { quiz: D.quiz, basics: D.basics, terms: D.terms, topics: D.topics };
  const v = (fr) => check.validate(Object.assign({}, base, { frequency: fr }));
  const ok = v(clone(f));
  t.eq(ok.errors, [], '見本はエラーなし');
  t.ok(ok.warnings.some((w) => /テーマがありません/.test(w)), 'テーマのない宅建士の4択は警告', ok.warnings);
  t.ok(check(ctx).errors.length === 0, 'check(ctx) の形で呼べる');
  const bad = (name, mut, re) => {
    const x = clone(f);
    mut(x);
    const r = v(x);
    t.ok(r.errors.some((e) => re.test(e)), name, r.errors);
  };
  bad('frequency がない', (x) => { Object.keys(x).forEach((k) => delete x[k]); }, /exams がありません|themes がありません/);
  bad('テーマの id が重なる', (x) => { x.themes[1].id = x.themes[0].id; }, /重なっています/);
  bad('分野が違う', (x) => { x.themes[0].cat = 'shohiho'; }, /cat が/);
  bad('トピックがない', (x) => { x.themes[0].topicId = 'topicZ'; }, /トピックがありません/);
  bad('基礎知識がない', (x) => { x.themes[0].basicIds.push('basicZZZ'); }, /basicZZZ.*ありません/);
  bad('基礎知識が2つのテーマに入る', (x) => { x.themes[1].basicIds.push(x.themes[0].basicIds[0]); }, /1つの基礎知識は1つのテーマだけ/);
  bad('ランクが回数と合わない', (x) => { x.themes[1].rank = 'A'; }, /rank A が hits 6\/12/);
  bad('hits が回数より多い', (x) => { x.themes[0].hits = 13; }, /hits は 0〜12/);
  bad('last が回の id でない', (x) => { x.themes[0].last = 'R99'; }, /last "R99"/);
  bad('hits が 0 なのに last がある', (x) => { x.themes[2].hits = 0; x.themes[2].rank = 'C'; }, /hits が 0 なのに last/);
  bad('問題がない', (x) => { x.quizTheme['quiz-none'] = 'fq-gyoho-01'; }, /問題 quiz-none がありません/);
  const life = D.quiz.find((q) => !(q.examCats && q.examCats.takken));
  bad('宅建士の分野のない問題', (x) => { x.quizTheme[life.id] = 'fq-gyoho-01'; }, /宅建士の分野/);
  bad('テーマがない', (x) => { x.quizTheme[Object.keys(x.quizTheme)[0]] = 'fq-none'; }, /テーマ "fq-none" がありません/);
  bad('rankRule の形', (x) => { x.rankRule = { A: 0.3, B: 0.5 }; }, /rankRule/);
  bad('回が新しい順でない', (x) => { x.exams.reverse(); }, /新しい順ではありません/);
  bad('asOf の形', (x) => { x.asOf = '2026/10/22'; }, /asOf/);
  const longName = clone(f);
  longName.themes[0].name = 'あ'.repeat(60);
  t.ok(v(longName).warnings.some((w) => /name が長すぎます/.test(w)), '長い名前は警告(過去問の文を写していないかの見直し)');
  t.eq([check.rankOf(9, 12, { A: 0.75, B: 0.4 }), check.rankOf(5, 12, { A: 0.75, B: 0.4 }), check.rankOf(4, 12, { A: 0.75, B: 0.4 })], ['A', 'B', 'C'], 'rankOf の境目');
});

test('いまの data/frequency.js はエラーなしで読める', (t) => {
  const { ctx } = load({ today: T });
  const r = check(ctx);
  t.eq(r.errors, [], 'tools/lib/checks/freq.js のエラーなし');
  run1(ctx, 'js/freq.js');
  t.ok(ctx.Freq.ready() && ctx.Freq.themes().length === r.stats.themes, `Freq で引ける(テーマ ${r.stats.themes}・回 ${r.stats.exams})`);
});

run();
