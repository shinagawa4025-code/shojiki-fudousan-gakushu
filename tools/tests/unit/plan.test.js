// 学習計画(Plan)と目標の試験(Stats の見込みの日付・合格発表), Node
// 元: scratchpad audit7/T3 t4_predict_plan.js(8)・r6/w5 t_node.js(Plan・Stats)
// 段階の境目は今の js/plan.js(標準 120/45/14 日。180日前より後に登録した目標は、演習・実戦を登録からの日数に合わせて縮め、
// 直前の14日は縮めない)。scratch の古い期待値(60/23/7・3/2/1)はこの仕様に合わせて 62/28/14・16/15/14 に直した
'use strict';
const { test, run } = require('../lib/harness.js');
const { load, setToday, setKey, getKey } = require('../lib/node.js');

const T = '2026-10-14';
const byCatIds = (ctx, cat) => ctx.APP_DATA.quiz.filter((q) => ctx.QuizEngine.isMcItem(q) && (ctx.Stats.categoryOf(q, 'takken') || {}).id === cat).map((q) => q.id);
const fresh = (today) => load({ today: today || T }).ctx;
const ts = (ctx, d) => ctx.DateUtil.parse(d).getTime();
function target(ctx, date, created, extra) {
  setKey(ctx, 'examTargets', [Object.assign({ id: 'et1', name: '宅建士試験', examTypeId: 'takken', date, primary: true,
    createdAt: typeof created === 'string' ? new Date(`${created}T09:00:00`).getTime() : (created === undefined ? Date.UTC(2025, 0, 1) : created) }, extra || {})]);
}
const ALLOWED_CATS = ['kenri', 'horei', 'zei', 'gyoho', 'menjo', 'shohi', 'shisan'];
function hrefOk(ctx, h) {
  let m;
  if ((m = h.match(/^#topics\/([^/]+)$/))) return !!ctx.AppIndex.topicsById[m[1]];
  if ((m = h.match(/^#quiz\/([^/]+)$/))) return m[1] === 'due' || !!ctx.AppIndex.topicsById[m[1]];
  if ((m = h.match(/^#ox\/cat\/([^/]+)\/(10|20|50)$/))) return ALLOWED_CATS.includes(m[1]);
  if ((m = h.match(/^#ox\/topic\/([^/]+)\/(10|20|50)$/))) return !!ctx.AppIndex.topicsById[m[1]];
  return ['#ox/weak', '#review', '#exam/full', '#exam/short', '#ox', '#quiz'].includes(h);
}

test('段階の境目(標準・遅い登録で縮める・順に並ぶ)', (t) => {
  const ctx = fresh();
  const P = ctx.Plan._internal;
  t.eq([121, 120, 46, 45, 15, 14, 1, 0].map((n) => P.phaseIdAt(n, P.STD)), ['basics', 'practice', 'practice', 'mock', 'mock', 'final', 'final', 'day'], '標準の境目 121/120/46/45/15/14/1/0');
  const th = P.thresholds({ date: '2026-10-18', createdAt: new Date('2026-07-20T09:00:00').getTime() });
  t.eq([th.practice, th.mock, th.final, th.compressed, th.runway], [62, 28, 14, true, 90], '90日前に登録 → 62/28/14(直前14日は縮めない)');
  const th2 = P.thresholds({ date: '2026-10-18', createdAt: new Date('2026-10-17T09:00:00').getTime() });
  t.eq([th2.practice, th2.mock, th2.final], [16, 15, 14], '前日に登録 → 16/15/14(順に並ぶ)');
  const bad = [];
  for (let rw = 1; rw < 180; rw++) {
    const x = P.thresholds({ date: '2026-10-18', createdAt: new Date('2026-10-18T09:00:00').getTime() - rw * 864e5 });
    if (!(x.compressed && x.final === P.STD.final && x.mock > x.final && x.practice > x.mock && x.practice <= P.STD.practice && x.mock <= P.STD.mock)) bad.push({ rw, x });
  }
  t.eq(bad.slice(0, 3), [], '1〜179日前の登録で境目が順に並び、標準より広がらない');
  t.eq(P.thresholds({ date: '2026-10-18', createdAt: 0 }).compressed, false, 'createdAt が0・不正 → 標準');
  t.eq(P.thresholds({ date: '2026-10-18', createdAt: new Date('2026-10-20T09:00:00').getTime() }).compressed, false, '試験日より後の登録 → 標準');
  t.eq(P.thresholds({ date: '2026-10-18', createdAt: new Date('2026-01-01T09:00:00').getTime() }).compressed, false, '180日より前の登録 → 標準');
});

test('残り日数と段階(標準・遅い登録・createdAt なし)', (t) => {
  const ctx = fresh();
  t.eq(ctx.Plan.current().state, 'none', '目標なし → none');
  [[200, 'basics'], [121, 'basics'], [120, 'practice'], [46, 'practice'], [45, 'mock'], [15, 'mock'], [14, 'final'], [1, 'final']].forEach(([n, ph]) => {
    setToday(ctx, T);
    target(ctx, ctx.DateUtil.addDays(T, n));
    const c = ctx.Plan.current();
    t.eq([c.state, c.daysLeft, c.phase && c.phase.id, c.compressed], ['before', n, ph, false], `残り${n}日 → ${ph}`);
  });
  const late = ctx.DateUtil.addDays(T, 90);
  target(ctx, late, ts(ctx, T));
  [[90, 'basics'], [63, 'basics'], [62, 'practice'], [29, 'practice'], [28, 'mock'], [15, 'mock'], [14, 'final']].forEach(([n, ph]) => {
    setToday(ctx, ctx.DateUtil.addDays(late, -n));
    t.eq(ctx.Plan.current().phase.id, ph, `90日前に登録・残り${n}日 → ${ph}`);
  });
  setToday(ctx, T);
  target(ctx, ctx.DateUtil.addDays(T, 90), null, { createdAt: undefined });
  t.eq(ctx.Plan._internal.thresholds(ctx.Stats.primaryTarget()).compressed, false, 'createdAt がない古い記録 → 標準');
  t.eq(ctx.Plan.current().phase.id, 'practice', '…残り90日 → practice');
});

test('試験の週の状態(今日・試験の後・次の試験)と、今週やることのリンク・時間', (t) => {
  const dates = ['2026-06-01', '2026-08-01', '2026-09-10', '2026-10-01', '2026-10-14', '2026-10-17', '2026-10-18', '2026-10-19'];
  const want = ['basics', 'practice', 'mock', 'mock', 'final', 'final', 'day', null];
  dates.forEach((d, i) => {
    const ctx = fresh(d);
    target(ctx, '2026-10-18', '2025-12-01');
    const p = ctx.Plan.current({ snap: ctx.Analysis.analyze('takken') });
    t.eq(p.phase ? p.phase.id : null, want[i], `${d} の段階`);
    if (p.state === 'before') {
      const tot = p.week.reduce((s, it) => s + it.minutes, 0);
      t.ok(tot <= p.budget.week, `${d}: 今週やることは予定の時間に収まる`, { tot, budget: p.budget });
      t.ok(p.week.length > 0, `${d}: 既定の目標(1日10回)でも1つ以上`, p.budget);
      p.week.forEach((it) => {
        t.ok(hrefOk(ctx, it.href), `${d}: リンク先がある ${it.href}`);
        t.ok(it.minutes >= 5 && it.minutes % 5 === 0 && typeof it.label === 'string', `${d}: 時間は5分単位 (${it.minutes})`);
      });
    }
    if (d === '2026-10-18') t.eq(p.state, 'today', '試験の日 → today');
    if (d === '2026-10-19') {
      t.eq(p.state, 'after', '試験の後 → after');
      t.eq(p.after && [p.after.daysSince, p.after.next && p.after.next.date, p.after.next && p.after.next.tentative, p.after.official, p.after.results && p.after.results.date],
        [1, '2027-10-17', true, null, '2026-11-25'], '試験の後: 次は 2027-10-17(見込み)・合格発表 11/25');
    }
  });
  const ctx = fresh('2026-10-19');
  setKey(ctx, 'examTargets', [
    { id: 'a', name: '宅建士試験', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: 1 },
    { id: 'b', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: false, createdAt: ts(ctx, '2026-10-19'), tentative: true },
  ]);
  const c = ctx.Plan.current();
  t.eq([c.state, c.target.id, c.tentative], ['before', 'b', true], '★の試験が終わっても次の試験があれば before(見込み)');
  setKey(ctx, 'examTargets', [
    { id: 'a', name: '宅建', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: 1 },
    { id: 'b', name: '税理士', examTypeId: 'zeirishi', date: '2027-08-03', createdAt: 1 },
  ]);
  t.eq([ctx.Plan.current().state, ctx.Plan.current().examTypeId], ['before', 'zeirishi'], '終わった★+ほかの試験 → その試験の計画');
});

test('見込みの目標(2027-10-17)と段階の日付', (t) => {
  const ctx = fresh('2027-06-01');
  target(ctx, '2027-10-17', '2026-10-19', { tentative: true });
  const p = ctx.Plan.current({});
  t.eq([p.state, p.tentative, p.phase.id, p.daysLeft, p.compressed], ['before', true, 'basics', 138, false], '2027-06-01 から見た 2027-10-17(見込み)');
  t.eq(p.phases.map((x) => [x.id, x.startDate, x.endDate, x.days]), [
    ['basics', null, '2027-06-18', null], ['practice', '2027-06-19', '2027-09-01', 75], ['mock', '2027-09-02', '2027-10-02', 31], ['final', '2027-10-03', '2027-10-16', 14], ['day', '2027-10-17', '2027-10-17', 1]], '段階の日付');
  let contiguous = true;
  for (let i = 1; i < p.phases.length; i++) if (ctx.DateUtil.addDays(p.phases[i - 1].endDate, 1) !== p.phases[i].startDate) contiguous = false;
  t.ok(contiguous, '段階はすき間なく続く');
});

test('1週間の時間・配分(配点 ×(1.5 − 習熟度))・段階ごとの中身', (t) => {
  const ctx = fresh();
  target(ctx, ctx.DateUtil.addDays(T, 200));
  let c = ctx.Plan.current();
  t.eq([c.budget.perDay, c.budget.week, c.budget.source], [10, 70, 'actions'], '既定(1日10回) → 週70分');
  ctx.Goals.set({ kind: 'minutes', value: 60 });
  c = ctx.Plan.current();
  t.eq([c.budget.perDay, c.budget.week, c.budget.source], [60, 420, 'minutes'], '1日60分 → 週420分');
  t.ok(c.week.reduce((s, x) => s + x.minutes, 0) <= 420, '今週やることが時間に収まる', c.week);
  target(ctx, ctx.DateUtil.addDays(T, 3));
  c = ctx.Plan.current();
  t.eq([c.budget.days, c.budget.week, c.phase.id], [3, 180, 'final'], '残り3日 → 3日分');
  target(ctx, ctx.DateUtil.addDays(T, 30));
  c = ctx.Plan.current();
  t.eq(c.week[0] && [c.week[0].kind, c.week[0].href, c.week[0].minutes], ['exam', '#exam/full', 120], '実戦・時間が足りればフルの模擬試験');
  ctx.Goals.set({ kind: 'actions', value: 10 });
  c = ctx.Plan.current();
  t.eq(c.week[0] && [c.week[0].kind, c.week[0].href], ['exam', '#exam/short'], '実戦・時間が少なければショート');
  setKey(ctx, 'dailyGoal', { kind: 'actions', value: 30 });
  target(ctx, '2026-10-18', '2025-12-01');
  c = ctx.Plan.current({});
  t.eq([c.budget.perDay, c.budget.week], [30, 120], '回数の目標は1回1分(残り4日)');
  const A = ctx.Plan._internal.allocation(ctx.Stats.examType('takken'), null);
  t.near(A.reduce((s, a) => s + a.weight, 0), 1, 1e-9, '記録がなければ習熟度50で重みの合計1');
  t.eq(A.map((a) => Math.round(a.share * 50)), [14, 8, 3, 20, 5], '割合 = 配点');
  const snap = { examTypeId: 'takken', categories: [{ id: 'kenri', available: true, mastery: 20 }, { id: 'horei', available: true, mastery: 90 }, { id: 'zei', available: false, mastery: 0 }, { id: 'gyoho', available: true, mastery: 80 }, { id: 'menjo', available: true, mastery: 100 }] };
  const w = Object.fromEntries(ctx.Plan._internal.allocation(ctx.Stats.examType('takken'), snap).map((a) => [a.cat, a.weight]));
  const raw = { kenri: 14 / 50 * 1.3, horei: 8 / 50 * 0.6, zei: 3 / 50 * 1.5, gyoho: 20 / 50 * 0.7, menjo: 5 / 50 * 0.5 };
  const sum = Object.values(raw).reduce((s, x) => s + x, 0);
  t.ok(Object.keys(raw).every((k) => Math.abs(w[k] - raw[k] / sum) < 1e-9), '配分 = 配点 ×(1.5 − 習熟度/100)(記録のない分野は習熟度0)', w);
  ctx.Goals.set({ kind: 'minutes', value: 60 });
  const snap2 = { examTypeId: 'takken', categories: [
    { id: 'kenri', mastery: 40, available: true, coverage: 0.5 }, { id: 'horei', mastery: 60, available: true, coverage: 0.8 },
    { id: 'zei', mastery: 0, available: false }, { id: 'gyoho', mastery: 80, available: true, coverage: 0.9 }, { id: 'menjo', mastery: 50, available: true, coverage: 0.4 }], topics: [], ctx: { oxEverWrong: 7 } };
  target(ctx, ctx.DateUtil.addDays(T, 100));
  c = ctx.Plan.current({ snap: snap2, cardsPerDay: 0 });
  t.ok(c.week.some((x) => x.kind === 'quiz') && c.week.every((x) => hrefOk(ctx, x.href) && x.minutes >= 5), '演習 → 4択・リンク先がある', c.week);
  target(ctx, ctx.DateUtil.addDays(T, 10));
  setKey(ctx, 'quizDrill', {});
  c = ctx.Plan.current({ snap: snap2, cardsPerDay: 0 });
  t.ok(c.week.some((x) => x.href === '#ox/weak' && /7問/.test(x.sub)), '直前 → 間違えた○×(7問)', c.week);
  target(ctx, ctx.DateUtil.addDays(T, 200));
  c = ctx.Plan.current({ snap: snap2, cardsPerDay: 20 });
  t.ok(c.week.some((x) => x.kind === 'basic' && /^#topics\//.test(x.href)), '基礎固め → 基礎知識', c.week);
  t.ok(c.week.some((x) => x.kind === 'review' && x.href === '#review'), '基礎固め・復習カードあり → 今日の復習', c.week);
});

test('直前の解き直しは試験の前日までに出る分だけ数える', (t) => {
  const ctx = fresh('2026-10-12');
  target(ctx, '2026-10-18', '2025-12-01');
  setKey(ctx, 'dailyGoal', { kind: 'minutes', value: 60 });
  const ids = byCatIds(ctx, 'gyoho');
  const r = {};
  ['2026-10-12', '2026-10-13', '2026-10-17', '2026-10-25', '2026-11-08', '2026-11-08', '2026-11-08', '2026-11-08'].forEach((due, i) => { r[ids[i]] = { step: 2, due, at: '2026-10-05', src: 'quiz' }; });
  setKey(ctx, 'quizRetry', r);
  const d = ctx.Plan.current({}).week.find((x) => x.kind === 'drill');
  t.eq(d && d.sub, '3問', '直前の解き直し = 前日までに出る3問(予定の8問ではない)');
});

test('税理士・その他の試験・税理士の試験の後', (t) => {
  let ctx = fresh();
  setKey(ctx, 'examTargets', [{ id: 'z', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: ctx.DateUtil.addDays(T, 100), primary: true, createdAt: Date.UTC(2025, 0, 1) }]);
  let c = ctx.Plan.current();
  t.eq(c.alloc.map((a) => [a.cat, a.share]), [['shisan', 0.5], ['shohi', 0.5]], '税理士: 分野は同じ割合');
  t.ok(c.week.every((x) => hrefOk(ctx, x.href)), '税理士: リンク先がある', c.week);
  t.ok(!c.week.some((x) => x.kind === 'exam'), '税理士: 模擬試験は出さない');
  setKey(ctx, 'examTargets', [{ id: 'o', name: '何かの試験', examTypeId: 'other', date: ctx.DateUtil.addDays(T, 30), primary: true, createdAt: Date.UTC(2025, 0, 1) }]);
  c = ctx.Plan.current();
  t.ok(c.state === 'before' && c.week.some((x) => x.href === '#ox') && c.week.some((x) => x.href === '#quiz'), 'その他の試験 → ○×と4択', c.week);
  ctx = fresh('2026-08-10');
  setKey(ctx, 'examTargets', [{ id: 'z', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: '2026-08-05', primary: true, createdAt: 1 }]);
  c = ctx.Plan.current();
  t.eq([c.state, c.after.next, c.after.results], ['after', null, null], '税理士の試験の後: 見込みの日付も RETIO も出さない');
  ctx = fresh('2027-03-01');
  setKey(ctx, 'examTargets', [{ id: 'z', name: '税理士', examTypeId: 'zeirishi', date: '2027-08-03', primary: true, createdAt: Date.UTC(2026, 0, 1) }]);
  c = ctx.Plan.current({ snap: ctx.Analysis.analyze('zeirishi') });
  t.ok(c.week.every((x) => typeof x.href === 'string' && x.href.startsWith('#')), '税理士(分析つき): リンクの形');
});

test('Stats: 見込みの目標(tentative)・公式の日付・合格発表', (t) => {
  const ctx = fresh();
  const S = ctx.Stats;
  const x = S.addTarget({ name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', tentative: true });
  t.eq([x.tentative, S.listTargets()[0].tentative, S.isTentative(S.listTargets()[0])], [true, true, true], 'addTarget は見込みを残す');
  S.updateTarget(x.id, { name: '宅建' });
  t.eq(S.listTargets()[0].tentative, true, '名前の変更では見込みのまま');
  S.updateTarget(x.id, { date: '2027-10-17' });
  t.eq(S.listTargets()[0].tentative, true, '同じ日付なら見込みのまま');
  S.updateTarget(x.id, { date: '2027-10-24' });
  t.eq(S.listTargets()[0].tentative, undefined, '日付を変えたら見込みでなくなる');
  S.updateTarget(x.id, { tentative: true });
  t.eq(S.listTargets()[0].tentative, true, 'tentative: true');
  S.updateTarget(x.id, { tentative: false });
  t.eq(S.listTargets()[0].tentative, undefined, 'tentative: false');
  setKey(ctx, 'examTargets', [{ id: 'x', name: 'a', examTypeId: 'takken', date: '2027-10-17', tentative: 'yes' }]);
  t.eq(S.listTargets()[0].tentative, undefined, 'true でない値は捨てる');
  S.setPrimary('x');
  t.eq(getKey(ctx, 'examTargets')[0].tentative, undefined, '保存し直しても捨てた値は残らない');
  ctx.localStorage.clear();
  t.ok(!S.officialDates().some((o) => o.date === '2027-10-17'), '公式の日付に見込みは入れない');
  setToday(ctx, '2026-10-19');
  t.eq(S.officialDates('takken'), [], '10/18 の後は宅建の公式の日付なし');
  t.eq(S.expectedDates('takken').map((o) => [o.date, o.tentative, o.note]), [['2027-10-17', true, '見込み・未発表(例年10月第3日曜)']], '見込みの日付(令和9年度)');
  t.eq(S.expectedDates('zeirishi'), [], '税理士の見込みの日付はなし');
  S.addTarget({ name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', tentative: true });
  t.eq(S.expectedDates('takken'), [], '登録したら見込みの日付は出さない');
  const res = S.examResults({ examTypeId: 'takken', date: '2026-10-18' });
  t.eq([res.url, res.date, res.time], ['https://www.retio.or.jp/exam/', '2026-11-25', '9時30分'], '令和8年度の合格発表');
  const res2 = S.examResults({ examTypeId: 'takken', date: '2025-10-19' });
  t.eq([res2.url, res2.date], ['https://www.retio.or.jp/exam/', undefined], 'ほかの年はリンクだけ');
  t.eq(S.examResults({ examTypeId: 'zeirishi', date: '2026-08-05' }), null, '税理士の合格発表の案内はなし');
  const D = ctx.DateUtil;
  t.ok(D.parse('2027-10-17').getDay() === 0 && D.parse('2027-10-03').getDay() === 0, '2027-10-17 は10月第3日曜');
});

test('速さ(Plan.current)', (t) => {
  const ctx = fresh();
  target(ctx, ctx.DateUtil.addDays(T, 60));
  const snap = ctx.Analysis.analyze('takken');
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) ctx.Plan.current({ snap, cardsPerDay: 10 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  t.log(`Plan.current: ${ms.toFixed(3)} ms/回`);
  t.ok(ms < 50, `Plan.current が遅すぎる(${ms.toFixed(1)} ms/回)`);
});

run();
