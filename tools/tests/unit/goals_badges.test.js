// 1日の目標(Goals)と達成した日(goalDays)・バッジ(Badges)の条件・お知らせの出し方(Node)
// 元: scratchpad audit7/T3 t3_goals_badges.js・r6/w4 t_node.js
'use strict';
const fs = require('fs');
const path = require('path');
const { test, run, RAW } = require('../lib/harness.js');
const { load, setToday, setKey, getKey, makeStore, rng } = require('../lib/node.js');

const T = '2026-10-14';
const days = (n, from) => Array.from({ length: n }, (_, i) => from(i));
const mcIds = (ctx) => ctx.APP_DATA.quiz.filter((q) => ctx.QuizEngine.isMcItem(q)).map((q) => q.id);
const badge = (env, id) => env.ctx.Badges.list().find((b) => b.id === id);
const earned = (env, id) => !!badge(env, id).earnedAt;
const KNOWN = ['first', 'streak3', 'streak7', 'streak30', 'days50', 'mc100', 'mc300', 'mcAll', 'ox500', 'ox1000', 'drill10', 'examFirst', 'exam35', 'examAll70', 'gyoho80', 'srs100', 'topic1', 'hours10', 'hours50', 'goal7', 'styled10'];

test('Goals: 既定・範囲・不正な値・達成した日・0時の境目・目標を上げても達成した日は残る', (t) => {
  const { ctx, fired } = load({ today: T });
  const G = ctx.Goals;
  t.eq(G.get(), { kind: 'actions', value: 10 }, '既定は1日10回');
  t.eq(G.set({ kind: 'minutes', value: 3 }), { kind: 'minutes', value: 5 }, '分は5分から');
  t.eq(G.set({ kind: 'actions', value: 999 }), { kind: 'actions', value: 200 }, '回数は200回まで');
  t.eq(G.set({ kind: 'actions', value: 0 }), { kind: 'actions', value: 1 }, '回数は1回から');
  t.eq(G.set({ kind: 'minutes', value: 9999 }), { kind: 'minutes', value: 600 }, '分は600分まで');
  t.eq(G.set({ kind: 'actions', value: '12' }), { kind: 'actions', value: 12 }, '数字の文字列は受け付ける');
  t.ok(G.set({ kind: 'hours', value: 1 }) === null && G.set({ kind: 'actions', value: 'x' }) === null && G.set(null) === null, '不正な値は null');
  t.eq(G.get(), { kind: 'actions', value: 12 }, '不正な値で上書きしない');
  setKey(ctx, 'dailyGoal', { kind: 'minutes', value: 1e9 });
  t.eq(G.get(), { kind: 'minutes', value: 600 }, '保存された範囲外の値は読むときに直す');
  setKey(ctx, 'dailyGoal', { kind: 'minutes', value: 12.6 });
  t.eq(G.get(), { kind: 'minutes', value: 13 }, '整数に直す');
  setKey(ctx, 'dailyGoal', 'junk');
  t.eq(G.get(), { kind: 'actions', value: 10 }, '壊れた値は既定');
  ctx.localStorage.removeItem('shojikiLearn.v1.goalDays');
  setKey(ctx, 'dailyGoal', { kind: 'actions', value: 3 });
  G.start();
  for (let i = 0; i < 2; i++) ctx.Streak.recordToday();
  t.ok(!G.isMetDay(T), '2/3 は未達成');
  ctx.Streak.recordToday();
  t.ok(G.isMetDay(T), '3/3 で達成(goalDays)');
  t.eq(fired.filter((x) => x === 'goal:met').length, 1, 'goal:met は1回');
  ctx.Streak.recordToday();
  t.eq(fired.filter((x) => x === 'goal:met').length, 1, 'goal:met は繰り返さない');
  t.eq(G.today(), { kind: 'actions', value: 3, done: 4, pct: 100, met: true }, 'today()(回数)');
  setToday(ctx, '2026-10-15');
  t.ok(!G.today().met, '次の日は未達成から');
  for (let i = 0; i < 3; i++) ctx.Streak.recordToday();
  t.ok(G.isMetDay('2026-10-15'), '次の日も達成');
  t.eq(G.metDaysCount(), 2, '達成した日 2日');
  setKey(ctx, 'goalDays', Object.assign(getKey(ctx, 'goalDays'), { '2026-12-01': true, bad: true, '2026-10-01': 'yes' }));
  t.eq(G.metDaysCount(), 2, '未来・壊れた値は数えない');
  setKey(ctx, 'dailyGoal', { kind: 'minutes', value: 30 });
  setKey(ctx, 'studyTime', { '2026-10-15': 29 * 60 + 59 });
  t.eq(G.today(), { kind: 'minutes', value: 30, done: 29, pct: 97, met: false }, '29分59秒は未達成');
  setKey(ctx, 'studyTime', { '2026-10-15': 30 * 60 });
  t.ok(G.today().met, '30分で達成');
  G.set({ kind: 'minutes', value: 600 });
  t.ok(G.isMetDay('2026-10-15'), '目標を上げても達成した日は消えない');
});

test('Goals: ホームの輪と同じ数え方・学習時間の変化(studytime:change)で達成', (t) => {
  const { ctx, fired } = load({ today: T });
  const G = ctx.Goals;
  [0, 1, 3, 9, 10, 11, 57, 2.7, -1, true].forEach((v) => {
    setKey(ctx, 'activityLog', { [T]: v });
    const count = Math.max(0, Math.floor(Number(ctx.Streak.todayCount()) || 0));
    const d = G.today();
    t.ok(d.done === count && d.met === (count >= 10), `今日の回数 ${JSON.stringify(v)} の数え方`, d);
  });
  setToday(ctx, '2026-10-16');
  ctx.localStorage.removeItem('shojikiLearn.v1.goalDays');
  G.set({ kind: 'minutes', value: 20 });
  setKey(ctx, 'studyTime', { '2026-10-16': 1199, '2026-10-13': 5000 });
  const d = G.today();
  t.eq([d.done, d.met, d.pct], [19, false, 95], '学習時間の目標の進み具合(秒 → 分)');
  G.start();
  ctx.Streak.recordToday();
  t.eq(getKey(ctx, 'goalDays'), null, '未達成なら goalDays に書かない');
  setKey(ctx, 'studyTime', { '2026-10-16': 1200 });
  ctx.dispatchEvent(new ctx.CustomEvent('studytime:change'));
  t.eq(getKey(ctx, 'goalDays'), { '2026-10-16': true }, 'studytime:change で達成を記録');
  t.ok(fired.includes('goal:met'), 'goal:met が出る');
});

test('Badges: 定義(既知のバッジ・アイコンが icons.js にある・一覧の形)', (t) => {
  const env = load({ today: T });
  const B = env.ctx.Badges;
  const ids = B.DEFS.map((d) => d.id);
  t.eq(KNOWN.filter((id) => !ids.includes(id)), [], '既知のバッジがすべてある');
  t.eq(ids.length, new Set(ids).size, 'バッジの ID は重複しない');
  const icons = fs.readFileSync(path.join(RAW, 'js', 'icons.js'), 'utf8');
  t.eq(B.DEFS.filter((d) => !new RegExp(`\\n\\s+'?${d.icon.replace(/[-]/g, '\\-')}'?:`).test(icons)).map((d) => d.icon), [], 'アイコンが icons.js にある');
  const rows = B.list();
  t.eq(rows.length, B.DEFS.length, '一覧の数');
  t.ok(rows.every((x) => typeof x.name === 'string' && typeof x.desc === 'string' && typeof x.icon === 'string' && ('earnedAt' in x)), '一覧の項目の形');
  t.ok(badge(env, 'mcAll').progress.goal === mcIds(env.ctx).length, 'mcAll の目標は4択の問題数');
});

test('Badges: 条件と説明が合う(境目の値)', (t) => {
  const fresh = (o) => load(Object.assign({ today: T }, o || {}));
  let env = fresh();
  t.ok(!earned(env, 'first'), 'first: 学習なしでは取れない');
  setKey(env.ctx, 'activityLog', { [T]: 1 });
  t.ok(earned(env, 'first'), 'first: 1日');
  env = fresh();
  setKey(env.ctx, 'activityLog', Object.fromEntries(days(3, (i) => [env.ctx.DateUtil.addDays('2026-01-10', i), 1])));
  t.ok(earned(env, 'streak3') && !earned(env, 'streak7'), 'streak3: 過去の連続(最長)');
  env = fresh();
  setKey(env.ctx, 'activityLog', Object.fromEntries(days(50, (i) => [env.ctx.DateUtil.addDays('2026-01-01', i * 2), 1])));
  t.ok(earned(env, 'days50') && !earned(env, 'streak3'), 'days50: 連続でなくてよい');
  env = fresh();
  setKey(env.ctx, 'activityLog', Object.fromEntries(days(49, (i) => [env.ctx.DateUtil.addDays('2026-01-01', i * 2), 1]).concat([['garbage', 5], ['2026-02-30', 3]])));
  t.ok(!earned(env, 'days50'), 'days50: 正しくない日付は数えない');
  env = fresh();
  setKey(env.ctx, 'activityLog', Object.fromEntries(days(30, (i) => [env.ctx.DateUtil.addDays('2026-03-01', i), true])));
  t.ok(earned(env, 'streak30'), 'streak30: 古い形(true)の値でも数える');
  // 4択の数
  env = fresh();
  const ids = mcIds(env.ctx);
  const qh = {};
  ids.slice(0, 99).forEach((id) => { qh[id] = 'ng'; });
  qh['quiz-RETIRED-9'] = 'ok';
  setKey(env.ctx, 'quizHistory', qh);
  t.ok(!earned(env, 'mc100'), 'mc100: 99問+なくなった問題では取れない');
  qh[ids[99]] = 'ok';
  setKey(env.ctx, 'quizHistory', qh);
  t.ok(earned(env, 'mc100') && !earned(env, 'mc300'), 'mc100: 100問');
  ids.forEach((id) => { qh[id] = 'ng'; });
  setKey(env.ctx, 'quizHistory', qh);
  t.ok(earned(env, 'mcAll'), 'mcAll: 全問(不正解も解いた数に入る)');
  // ○×
  env = fresh();
  const st = env.ctx.QuizEngine.allStatements();
  const ox = {};
  st.slice(0, 499).forEach((s) => { ox[s.id] = { c: 1, w: 0 }; });
  ox['quiz-K01#9'] = { c: 5, w: 0 };
  ox['quiz-K01#s4'] = { c: 5, w: 0 };
  ox[st[499].id] = { c: 0, w: 0 };
  setKey(env.ctx, 'oxStats', ox);
  t.ok(!earned(env, 'ox500'), 'ox500: 形の違うキー・0回の記録は数えない');
  ox[st[499].id] = { c: 0, w: 1 };
  setKey(env.ctx, 'oxStats', ox);
  t.ok(earned(env, 'ox500'), 'ox500: 500文');
  // 解き直し
  env = fresh();
  setKey(env.ctx, 'drillStats', { graduated: 9 });
  t.ok(!earned(env, 'drill10'), 'drill10: 9問では取れない');
  setKey(env.ctx, 'drillStats', { graduated: 10 });
  t.ok(earned(env, 'drill10'), 'drill10: 10問');
  // 模擬試験
  const ex = (o) => Object.assign({ id: `e${Math.random()}`, examTypeId: 'takken', mode: 'full', startedAt: Date.UTC(2026, 9, 1), finishedAt: Date.UTC(2026, 9, 1, 2), score: 30, total: 50, byCategory: {}, wrong: [] }, o);
  env = fresh();
  setKey(env.ctx, 'examHistory', [ex({ examTypeId: 'zeirishi', mode: 'short', score: 5, total: 20 })]);
  t.ok(earned(env, 'examFirst') && !earned(env, 'exam35'), 'examFirst: どの試験でも');
  setKey(env.ctx, 'examHistory', [ex({ mode: 'short', score: 20, total: 20 }), ex({ score: 34 })]);
  t.ok(!earned(env, 'exam35'), 'exam35: ショート20/20・フル34点では取れない');
  setKey(env.ctx, 'examHistory', [ex({ score: 35 })]);
  t.ok(earned(env, 'exam35'), 'exam35: フル35点');
  setKey(env.ctx, 'examHistory', [ex({ score: 99, total: 50 })]);
  t.eq(badge(env, 'exam35').progress.now, 35, 'exam35: 進み具合は上限で切る');
  const bc = (k, h, z, g, m) => ({ kenri: { correct: k, total: 14 }, horei: { correct: h, total: 8 }, zei: { correct: z, total: 3 }, gyoho: { correct: g, total: 20 }, menjo: { correct: m, total: 5 } });
  env = fresh();
  setKey(env.ctx, 'examHistory', [ex({ byCategory: bc(10, 6, 2, 14, 4) }), ex({ byCategory: bc(14, 8, 3, 13, 5) })]);
  t.ok(!earned(env, 'examAll70'), 'examAll70: 1回の中で全分野7割が必要');
  setKey(env.ctx, 'examHistory', [ex({ byCategory: bc(10, 6, 3, 14, 4) })]);
  t.ok(earned(env, 'examAll70'), 'examAll70: 10/14・6/8・3/3・14/20・4/5');
  env = fresh();
  setKey(env.ctx, 'examHistory', [ex({ mode: 'short', byCategory: bc(14, 8, 3, 20, 5) })]);
  t.ok(!earned(env, 'examAll70'), 'examAll70: ショートは数えない(説明は「フル」)');
  env = fresh();
  const b2 = bc(10, 6, 3, 14, 4); b2.other = { correct: 0, total: 2 };
  setKey(env.ctx, 'examHistory', [ex({ byCategory: b2 })]);
  t.ok(earned(env, 'examAll70'), 'examAll70: 「その他」の分野は見ない');
  // 業法8割(自信なしは0.5)
  env = fresh();
  const gy = env.ctx.APP_DATA.quiz.filter((q) => env.ctx.QuizEngine.isMcItem(q) && (env.ctx.Stats.categoryOf(q, 'takken') || {}).id === 'gyoho').map((q) => q.id);
  const q2 = {};
  gy.slice(0, 100).forEach((id, i) => { q2[id] = i < 80 ? 'ok' : 'ng'; });
  setKey(env.ctx, 'quizHistory', q2);
  t.ok(earned(env, 'gyoho80'), 'gyoho80: ちょうど 80/100');
  env = fresh();
  setKey(env.ctx, 'quizHistory', q2);
  setKey(env.ctx, 'quizUnsure', { [gy[0]]: '2026-10-10' });
  t.ok(!earned(env, 'gyoho80'), 'gyoho80: 自信なし1つで 79.5/100 → 取れない');
  env = fresh();
  const q3 = {};
  gy.slice(0, 99).forEach((id) => { q3[id] = 'ok'; });
  setKey(env.ctx, 'quizHistory', q3);
  t.eq(badge(env, 'gyoho80').progress, { now: 99, goal: 100, unit: '問' }, 'gyoho80: 100問未満は問題数で進み具合');
  let floatBad = 0;
  for (let t2 = 1; t2 <= 50; t2++) for (let c = 0; c <= t2; c++) if (c / t2 >= 0.7 && Math.floor((c / t2) * 100) < 70) floatBad += 1;
  t.eq(floatBad, 0, '7割ちょうどが浮動小数点で70未満にならない');
  // 用語の復習
  env = fresh();
  const terms = env.ctx.AppIndex.allTerms.filter((x) => x.worksOnly !== true);
  const cards = {};
  terms.slice(0, 100).forEach((x, i) => { cards[x.id] = { ease: 2.5, interval: i < 99 ? 21 : 20, reps: 5, dueDate: '2026-11-01', lastGrade: 3 }; });
  setKey(env.ctx, 'srsCards', cards);
  t.ok(!earned(env, 'srs100'), 'srs100: 間隔21日以上が99枚');
  cards[terms[99].id].interval = 21;
  setKey(env.ctx, 'srsCards', cards);
  t.ok(earned(env, 'srs100'), 'srs100: 100枚');
  // トピック1つを学び終える
  env = fresh();
  const rows = env.ctx.Stats.byTopic().filter((r) => r.total > 0).sort((a, b) => a.total - b.total);
  const small = rows[0];
  const ids2 = (env.ctx.AppIndex.topicTermIndex[small.topic.id] || []).filter((id) => env.ctx.AppIndex.termsById[id] && env.ctx.AppIndex.termsById[id].worksOnly !== true);
  const known = {};
  ids2.slice(0, -1).forEach((id) => { known[id] = true; });
  setKey(env.ctx, 'flashcards', known);
  t.ok(!earned(env, 'topic1'), 'topic1: 1つ残っていれば取れない');
  setKey(env.ctx, 'basicsProgress', { [ids2[ids2.length - 1]]: { learned: true } });
  t.ok(earned(env, 'topic1'), 'topic1: ★と✓の組み合わせで学び終える');
  // 学習時間・目標・個数・組合せ
  env = fresh();
  setKey(env.ctx, 'studyTime', { '2026-10-13': 36000 - 1 });
  t.ok(!earned(env, 'hours10'), 'hours10: 9時間59分59秒');
  setKey(env.ctx, 'studyTime', { '2026-10-13': 18000, '2026-10-12': 18000, '2026-12-31': 99999 });
  t.ok(earned(env, 'hours10') && !earned(env, 'hours50'), 'hours10: 10時間(未来の日は数えない)');
  env = fresh();
  setKey(env.ctx, 'goalDays', Object.fromEntries(days(7, (i) => [env.ctx.DateUtil.addDays('2026-09-01', i * 3), true])));
  t.ok(earned(env, 'goal7'), 'goal7: 7日(連続でなくてよい)');
  env = fresh();
  const sty = env.ctx.APP_DATA.quiz.filter((q) => q.style).map((q) => q.id);
  const q4 = {};
  sty.slice(0, 9).forEach((id) => { q4[id] = 'ok'; });
  sty.slice(9, 15).forEach((id) => { q4[id] = 'ng'; });
  setKey(env.ctx, 'quizHistory', q4);
  t.ok(!earned(env, 'styled10'), 'styled10: 正解9問');
  q4[sty[9]] = 'ok';
  setKey(env.ctx, 'quizHistory', q4);
  t.ok(earned(env, 'styled10'), 'styled10: 正解10問');
});

function heavy(ctx) {
  const rnd = rng(5);
  const log = {};
  for (let i = 0; i < 400; i++) log[ctx.DateUtil.addDays(T, -i)] = 1 + Math.floor(rnd() * 80);
  setKey(ctx, 'activityLog', log);
  const qh = {};
  ctx.APP_DATA.quiz.forEach((q) => { qh[q.id] = rnd() < 0.85 ? 'ok' : 'ng'; });
  setKey(ctx, 'quizHistory', qh);
  const ox = {};
  ctx.QuizEngine.allStatements().forEach((st) => { ox[st.id] = { c: 1 + Math.floor(rnd() * 5), w: Math.floor(rnd() * 3), lastOk: rnd() < 0.6, last: '2026-09-01' }; });
  setKey(ctx, 'oxStats', ox);
  const cards = {};
  ctx.AppIndex.allTerms.forEach((x) => { cards[x.id] = { ease: 2.5, interval: Math.floor(rnd() * 120), reps: 5, dueDate: '2026-11-01', lastGrade: 3 }; });
  setKey(ctx, 'srsCards', cards);
  const hist = [];
  for (let k = 0; k < 30; k++) {
    hist.push({ id: `e${k}`, examTypeId: 'takken', mode: k % 3 ? 'full' : 'short', startedAt: Date.UTC(2026, 8, 1) + k * 864e5, finishedAt: Date.UTC(2026, 8, 1) + k * 864e5 + 7e6, score: 30 + (k % 8), total: k % 3 ? 50 : 20,
      byCategory: { kenri: { correct: 10, total: 14 }, horei: { correct: 6, total: 8 }, zei: { correct: 3, total: 3 }, gyoho: { correct: 16, total: 20 }, menjo: { correct: 4, total: 5 } }, wrong: [] });
  }
  setKey(ctx, 'examHistory', hist);
}

test('Badges: 既存の利用者は黙って記録・新しい獲得は1回のお知らせ(まとめて1つ・試験中と初回ガイドの間は待つ)', (t) => {
  {
    const env = load({ today: T });
    heavy(env.ctx);
    env.ctx.Badges.start();
    env.clock.advance(3900);
    t.eq(env.toasts.length, 0, '最初の確認の前はお知らせなし');
    env.clock.advance(200);
    t.eq(env.toasts.length, 0, 'たくさん記録のある利用者でも最初の確認は黙って記録');
    const st = getKey(env.ctx, 'badges');
    t.ok(st && st.seeded === true && Object.keys(st.at).length >= 10, '…多くのバッジを記録', st && Object.keys(st.at));
    env.ctx.Streak.recordToday();
    env.clock.advance(2500);
    t.eq(env.toasts.length, 0, '次の学習でも同じバッジを知らせない');
    env.doc.body.classList.add('exam-active');
    setKey(env.ctx, 'drillStats', { graduated: 10 });
    env.ctx.dispatchEvent(new env.ctx.CustomEvent('drill:change', { detail: { kind: 'graduated' } }));
    env.clock.advance(20000);
    t.eq(env.toasts.length, 0, '模擬試験の受験中は知らせない');
    env.doc.body.classList.remove('exam-active');
    env.clock.advance(5100);
    t.eq(env.toasts.length, 1, '試験が終わったら知らせる');
    t.ok(env.toasts[0] && /解き直し卒業10問/.test(env.toasts[0].msg) && env.toasts[0].o.position === 'top', 'お知らせの文と位置', env.toasts[0]);
  }
  {
    const env = load({ today: T });
    env.doc._overlay = true;
    env.ctx.Badges.start();
    env.clock.advance(4100);
    t.ok(getKey(env.ctx, 'badges') && getKey(env.ctx, 'badges').seeded, '新しい利用者も初回ガイドの間に記録を始める');
    env.ctx.Streak.recordToday();
    env.clock.advance(12000);
    t.eq(env.toasts.length, 0, '初回ガイドが開いている間は知らせない');
    env.doc._overlay = false;
    env.clock.advance(5100);
    t.eq(env.toasts.map((x) => x.msg), ['バッジ「初めての学習」を獲得しました'], '閉じたら最初のバッジを知らせる');
  }
  {
    const env = load({ today: T });
    setKey(env.ctx, 'badges', { seeded: true, at: {} });
    heavy(env.ctx);
    env.ctx.Badges.check();
    t.eq(env.toasts.length, 1, '一度にたくさん取ってもお知らせは1つ');
    t.ok(/\d+個/.test(env.toasts[0].msg), '…「n個」の文', env.toasts[0].msg);
    const store = makeStore();
    const a = load({ today: T, store });
    const b = load({ today: T, store });
    setKey(a.ctx, 'badges', { seeded: true, at: {} });
    setKey(a.ctx, 'activityLog', { [T]: 1 });
    a.ctx.Badges.check();
    b.ctx.Badges.check();
    t.eq(a.toasts.length + b.toasts.length, 1, '2つのタブでもお知らせは1回');
  }
  {
    const store = makeStore();
    const env = load({ today: T, store });
    setKey(env.ctx, 'badges', { seeded: true, at: {} });
    setKey(env.ctx, 'activityLog', { [T]: 1 });
    store.quotaChars = 1;
    env.ctx.Badges.check();
    env.ctx.Badges.check();
    env.ctx.Badges.list();
    t.eq(env.toasts.filter((x) => /バッジ/.test(x.msg)).length, 1, '容量不足で保存できなくても、学習のたびに知らせ直さない');
  }
  {
    const env = load({ today: T });
    t.eq(env.ctx.Badges.check(), [], '新しい利用者: 最初は何もない');
    t.eq(getKey(env.ctx, 'badges'), { seeded: true, at: {} }, '…空で記録を始める');
    env.ctx.Streak.recordToday();
    t.eq(env.ctx.Badges.check(), ['first'], '最初の学習で first');
    t.eq(env.toasts.length, 1, '…お知らせ1回');
    setKey(env.ctx, 'examHistory', [{ examTypeId: 'takken', mode: 'full', score: 40, total: 50, byCategory: { kenri: { correct: 10, total: 14 }, horei: { correct: 6, total: 8 }, zei: { correct: 3, total: 3 }, gyoho: { correct: 18, total: 20 }, menjo: { correct: 4, total: 5 } }, wrong: [] }]);
    const got = env.ctx.Badges.check().sort();
    t.eq(got, ['exam35', 'examAll70', 'examFirst'], '模擬試験のバッジ3つ');
    t.ok(env.toasts.length === 2 && /3個/.test(env.toasts[1].msg), '…まとめて「3個」', env.toasts[1]);
  }
});

run();
