// 合格予測(Predict, Node): 手で計算した値と合うか(重み・日数での減衰・模擬試験・自信なし・5問免除・必要な問題数・端の値・過去の合格点)
// 元: scratchpad r6/w5 t_node.js(Predict)・audit7/T3 t4_predict_plan.js(7a〜7d)
'use strict';
const { test, run } = require('../lib/harness.js');
const { load, setToday, setKey, getKey, clearAll } = require('../lib/node.js');

const T = '2026-10-14';
const byCatIds = (ctx, cat) => ctx.APP_DATA.quiz.filter((q) => ctx.QuizEngine.isMcItem(q) && (ctx.Stats.categoryOf(q, 'takken') || {}).id === cat).map((q) => q.id);
const local = (y, m, d, h) => new Date(y, m - 1, d, h || 10).getTime();
const catRow = (r, id) => r.byCat.find((c) => c.cat === id);
const CASE2 = { kenri: [10, 2, 8], horei: [6, 0, 4], zei: [2, 0, 1], gyoho: [16, 0, 4], menjo: [6, 0, 2] };
function seedDaily(ctx, d, rows) {
  const cur = getKey(ctx, 'answerDaily') || {};
  cur[d] = rows;
  setKey(ctx, 'answerDaily', cur);
}
function fresh(today) {
  const env = load({ today: today || T });
  return env.ctx;
}

test('記録なし: 5割に寄せた見込み・データ不足(あと40問、税は求めない)', (t) => {
  const ctx = fresh();
  const r = ctx.Predict.estimate();
  t.eq([r.status, r.need], ['insufficient', 40], 'データ不足・あと40問');
  t.eq(r.needWhere.map((x) => [x.cat, x.need]), [['kenri', 8], ['horei', 8], ['gyoho', 8], ['menjo', 8]], '分野ごとに8問(税は問題数3で求めない)');
  t.near(r.expected, 25, 1e-6, '見込み25点');
  // 分散 = 0.25×50 + 0.25×(196+64+9+400+25)/5 = 47.2 → 標準偏差 6.87 → ±8.79
  t.eq([r.low, r.high], [16, 34], '幅 16〜34点');
  t.eq(r.exempt, false, '5問免除は既定でなし');
  // 言われたとおりに解く(必要な分野に8問ずつ+どこでも8問)→ 足りる
  const plan = { kenri: 16, horei: 8, gyoho: 8, menjo: 8 };
  const answer = (id) => { const h = getKey(ctx, 'quizHistory') || {}; h[id] = 'ok'; setKey(ctx, 'quizHistory', h); ctx.AnswerLog.record(id, { ok: true, src: 'quiz' }); };
  Object.keys(plan).forEach((c) => byCatIds(ctx, c).slice(0, plan[c]).forEach(answer));
  t.eq(ctx.Predict.estimate().status, 'ok', '40問(必要な分野に8問ずつ)で足りる');
});

test('日付つきの記録(今日): 手で計算した値・5問免除・設定の保存', (t) => {
  const ctx = fresh();
  seedDaily(ctx, T, CASE2);
  const r = ctx.Predict.estimate();
  t.eq(r.status, 'ok', '足りる');
  t.near(catRow(r, 'kenri').p, 0.542, 0.0006, '権利 p = (10+1+2)/(20+4)');
  t.near(catRow(r, 'gyoho').p, 0.75, 1e-6, '業法 p = 18/24');
  t.near(r.expected, 32.2, 1e-6, '見込み 32.2');
  t.eq([r.low, r.high], [27, 38], '幅 27〜38(標準偏差 4.21)');
  t.near(r.answers, 61, 1e-6, '回答数 61');
  t.eq(r.need, 0, '必要な問題数 0');
  t.near(r.sd, 4.2, 0.05, '標準偏差');
  t.ok(r.byCat.every((c) => c.low <= c.expected && c.expected <= c.high && c.low >= 0 && c.high <= c.n), '分野ごとの幅は順に並び 0〜問題数に収まる', r.byCat);
  t.eq(r.sources.dated, 61, 'sources.dated 61');
  const e = ctx.Predict.estimate({ exempt: true });
  t.near(e.expected, 33.9, 1e-6, '5問免除の見込み 33.9');
  t.eq([e.low, e.high], [29, 39], '5問免除の幅 29〜39(免除科目は分散に入れない)');
  const m = catRow(e, 'menjo');
  t.eq([m.fixed, m.expected, m.low, m.high, m.p], [true, 5, 5, 5, 1], '免除科目は 5/5 で固定');
  t.near(e.answers, 53, 1e-6, '5問免除の回答数は免除科目を除く');
  ctx.Predict.setExempt(true);
  t.eq(getKey(ctx, 'predictPrefs'), { exempt: true }, 'setExempt を保存');
  t.eq(ctx.Predict.estimate().exempt, true, 'estimate は保存した設定を読む');
  setKey(ctx, 'predictPrefs', { exempt: 'yes', other: 1 });
  t.eq(ctx.Predict.estimate().exempt, false, '真偽値でない exempt は false');
  ctx.Predict.setExempt(true);
  t.eq(getKey(ctx, 'predictPrefs'), { exempt: true, other: 1 }, 'setExempt はほかの項目を残す');
});

test('過去の合格点(RETIO で確かめた値だけ)と比べる範囲', (t) => {
  const ctx = fresh();
  const r = ctx.Predict.estimate();
  const e = ctx.Predict.estimate({ exempt: true });
  // 令和7年度以前(RETIO 試験実施概況)。あとから年度が増えても、この行は変わらない
  const KNOWN = [['令和2年度(10月)', 38, 33], ['令和2年度(12月)', 36, 31], ['令和3年度(10月)', 34, 29], ['令和3年度(12月)', 34, null],
    ['令和4年度', 36, 31], ['令和5年度', 36, 31], ['令和6年度', 37, 32], ['令和7年度', 33, 28]];
  const rows = r.passHistory.map((x) => [x.label, x.score, x.exemptScore]);
  t.eq(KNOWN.filter((k) => !rows.some((x) => JSON.stringify(x) === JSON.stringify(k))), [], '令和2〜7年度の合格点');
  t.ok(r.passHistory.every((x) => Number.isInteger(x.score) && /retio\.or\.jp/.test(x.src)), '確かめた値(RETIO の出典つき)だけ');
  // 範囲は表の値から(年度が増えても成り立つ形で確かめる)
  const sc = r.passHistory.map((x) => x.score);
  const last = r.passHistory[r.passHistory.length - 1];
  t.eq(r.passRange && [r.passRange.min, r.passRange.max, r.passRange.n, r.passRange.of, r.passRange.latest.label, r.passRange.latest.value],
    [Math.min(...sc), Math.max(...sc), sc.length, 50, last.label, last.score], '一般の範囲 = 表の最小〜最大・最新');
  const ex = r.passHistory.filter((x) => x.exemptScore != null).map((x) => x.exemptScore);
  t.eq(e.passRange && [e.passRange.raw.min, e.passRange.raw.max, e.passRange.min, e.passRange.max, e.passRange.n, e.passRange.of],
    [Math.min(...ex), Math.max(...ex), Math.min(...ex) + 5, Math.max(...ex) + 5, ex.length, 45], '5問免除の範囲 = 45問中の値(+5で50点満点)・値のない回は除く');
});

test('日数での減衰(30日で半分・120日まで)・端の値・壊れた模擬試験の記録', (t) => {
  let ctx = fresh();
  seedDaily(ctx, ctx.DateUtil.addDays(T, -30), CASE2);
  let r = ctx.Predict.estimate();
  t.near(r.answers, 30.5, 1e-6, '30日前 → 61 × 0.5');
  t.near(catRow(r, 'kenri').p, 0.536, 0.0005, '権利 p = (5.5+2)/(10+4)');
  t.eq([r.status, r.need], ['insufficient', 10], '必要 = max(ceil(40−30.5), 法令3+免除4)');
  t.eq(r.needWhere.map((x) => [x.cat, x.need]), [['horei', 3], ['menjo', 4]], '足りない分野');
  ctx = fresh();
  seedDaily(ctx, ctx.DateUtil.addDays(T, -120), { gyoho: [16, 0, 0] });
  seedDaily(ctx, ctx.DateUtil.addDays(T, -121), { gyoho: [100, 0, 0] });
  t.near(catRow(ctx.Predict.estimate(), 'gyoho').answers, 1, 0.05, '120日前は重み 1/16・121日前は使わない');
  ctx = fresh();
  seedDaily(ctx, T, { kenri: [1e6, 0, 0], horei: [1e6, 0, 0], zei: [1e6, 0, 0], gyoho: [1e6, 0, 0], menjo: [1e6, 0, 0] });
  r = ctx.Predict.estimate();
  t.ok(r.high === 50 && r.expected <= 50 && r.low <= r.expected, '全問正解でも50点で切る', r);
  setKey(ctx, 'answerDaily', { [T]: { kenri: [0, 0, 1e6], horei: [0, 0, 1e6], zei: [0, 0, 1e6], gyoho: [0, 0, 1e6], menjo: [0, 0, 1e6] } });
  r = ctx.Predict.estimate();
  t.ok(r.low === 0 && r.expected >= 0 && r.low <= r.expected && r.expected <= r.high, '全問不正解でも0点で切る', r);
  r = ctx.Predict.estimate({ exempt: true });
  t.ok(r.low >= 5 && r.expected >= 5, '5問免除は5点より下にならない', r);
  setKey(ctx, 'examHistory', [{ examTypeId: 'takken', startedAt: 1e20, byCategory: { kenri: { correct: 'x', total: -3 } } }, null, 5,
    { examTypeId: 'takken', finishedAt: local(2026, 10, 1), byCategory: { kenri: { correct: 99, total: 14 } }, unsure: 3, wrong: 'x' }]);
  r = ctx.Predict.estimate();
  t.ok(Number.isFinite(r.expected) && r.byCat.every((c) => c.p >= 0 && c.p <= 1), '壊れた模擬試験の記録でも値が出る', r.byCat);
});

test('4択の記録(quizHistory・重み0.3)と日付つきの記録を二重に数えない・自信なしは0.5・範囲外の問題は数えない', (t) => {
  const ctx = fresh();
  const g = byCatIds(ctx, 'gyoho').slice(0, 20);
  const qh = {};
  g.forEach((id, i) => { qh[id] = i < 10 ? 'ok' : 'ng'; });
  setKey(ctx, 'quizHistory', qh);
  let r = ctx.Predict.estimate();
  t.near(catRow(r, 'gyoho').answers, 6, 1e-6, '日付のない記録だけ: 0.3 × 20');
  t.near(catRow(r, 'gyoho').p, 0.5, 1e-6, 'p = (3+2)/(6+4)');
  t.near(r.sources.history, 6, 1e-6, 'sources.history 6');
  seedDaily(ctx, T, { gyoho: [5, 0, 5] });
  r = ctx.Predict.estimate();
  t.near(catRow(r, 'gyoho').answers, 13, 1e-6, '日付つき10 + 0.3×(20−10) = 13');
  t.near(r.sources.history, 3, 1e-6, '日付のない分は3に減る');
  seedDaily(ctx, T, { gyoho: [15, 0, 10] });
  t.near(ctx.Predict.estimate().sources.history, 0, 1e-6, '日付つきが問題数を超えたら日付のない記録は使わない');
  setKey(ctx, 'answerDaily', {});
  setKey(ctx, 'quizUnsure', { [g[0]]: T, [g[1]]: T, [g[15]]: T });
  // 正答率 = (8 + 2×0.5)/20 = 0.45 → S = 0.3×20×0.45 = 2.7 → p = 4.7/10
  t.near(catRow(ctx.Predict.estimate(), 'gyoho').p, 0.47, 1e-6, '自信なしの正解は0.5(不正解の印は影響なし)');
  const other = ctx.APP_DATA.quiz.find((q) => ctx.QuizEngine.isMcItem(q) && !ctx.Stats.categoryOf(q, 'takken'));
  if (other) {
    qh[other.id] = 'ok';
    setKey(ctx, 'quizHistory', qh);
    t.near(ctx.Predict.estimate().answers, 6, 1e-6, '宅建の範囲外の問題は数えない');
  }
});

test('模擬試験: 直近2・その前1.5・それ以前1 × 30日で半分・120日まで・記録済みの回は二重に数えない', (t) => {
  const D = fresh().DateUtil;
  const entry = (daysAgo, gy, extra) => {
    const tt = D.parse(D.addDays(T, -daysAgo)).getTime();
    return Object.assign({ id: `ex${daysAgo}`, examTypeId: 'takken', mode: 'full', startedAt: tt - 7200000, finishedAt: tt, score: gy[0], total: gy[1], byCategory: { gyoho: { correct: gy[0], total: gy[1] } }, wrong: [] }, extra || {});
  };
  let ctx = fresh();
  setKey(ctx, 'examHistory', [entry(0, [18, 20]), entry(1, [10, 20]), entry(2, [0, 20]), entry(130, [20, 20]),
    { examTypeId: 'zeirishi', byCategory: { gyoho: { correct: 9, total: 9 } }, finishedAt: Date.now() }, 'junk', null]);
  const g = catRow(ctx.Predict.estimate(), 'gyoho');
  const w1 = Math.pow(0.5, 1 / 30);
  const w2 = Math.pow(0.5, 2 / 30);
  const N = 20 * (2 + 1.5 * w1 + 1 * w2);
  const S = 18 * 2 + 10 * 1.5 * w1;
  t.near(g.answers, Math.round(N * 10) / 10, 1e-6, 'N = 20×(2 + 1.5·w1 + w2)(130日前・ほかの試験は使わない)');
  t.near(g.p, Math.round(((S + 2) / (N + 4)) * 1000) / 1000, 1e-6, 'p を手で計算');
  ctx = fresh();
  setKey(ctx, 'examHistory', [entry(0, [18, 20], { unsure: 0, wrong: [{ kind: 'fixed', chosen: 1, categoryId: 'gyoho' }, { kind: 'fixed', chosen: null, categoryId: 'gyoho' }] })]);
  seedDaily(ctx, T, { gyoho: [18, 0, 1] });
  const r2 = ctx.Predict.estimate();
  t.near(catRow(r2, 'gyoho').answers, 19 + 20, 1e-6, '記録済みの回: 日付つき19 + 模擬試験 (2−1)×20');
  t.near(r2.sources.exam, 20, 1e-6, '記録済みの回の重みは1');
  const qh = {};
  byCatIds(ctx, 'gyoho').slice(0, 5).forEach((id) => { qh[id] = 'ok'; });
  setKey(ctx, 'quizHistory', qh);
  t.near(ctx.Predict.estimate().sources.history, 0.3 * 5, 1e-6, '日付つきから模擬試験の回答(19)を引いてから比べる');
});

test('手で計算した利用者(日付つき・自信なし・記録済みの模擬試験・古い記録だけの利用者)', (t) => {
  {
    const ctx = fresh();
    setKey(ctx, 'answerDaily', { '2026-10-14': { gyoho: [10, 2, 3] }, '2026-09-14': { gyoho: [4, 0, 4], kenri: [5, 0, 5] }, '2026-10-04': { gyoho: [15, 0, 4], kenri: [7, 0, 7] } });
    const gy = byCatIds(ctx, 'gyoho');
    const kr = byCatIds(ctx, 'kenri');
    const qh = {};
    gy.slice(0, 20).forEach((id, i) => { qh[id] = i < 14 ? 'ok' : 'ng'; });
    kr.slice(0, 10).forEach((id, i) => { qh[id] = i < 5 ? 'ok' : 'ng'; });
    setKey(ctx, 'quizHistory', qh);
    setKey(ctx, 'quizUnsure', { [gy[0]]: '2026-10-01', [gy[1]]: '2026-10-01' });
    const wrong = [];
    for (let i = 0; i < 4; i++) wrong.push({ kind: 'fixed', refId: gy[30 + i], chosen: 1, categoryId: 'gyoho' });
    wrong.push({ kind: 'fixed', refId: gy[34], chosen: null, categoryId: 'gyoho' });
    for (let i = 0; i < 7; i++) wrong.push({ kind: 'fixed', refId: kr[30 + i], chosen: 2, categoryId: 'kenri' });
    setKey(ctx, 'examHistory', [{ id: 'x1', examTypeId: 'takken', mode: 'full', startedAt: local(2026, 10, 4, 9), finishedAt: local(2026, 10, 4, 11), score: 22, total: 34, unsure: 0,
      byCategory: { gyoho: { correct: 15, total: 20 }, kenri: { correct: 7, total: 14 } }, wrong }]);
    const r = ctx.Predict.estimate();
    const d10 = Math.pow(0.5, 10 / 30);
    const gS = 11 + 2 + d10 * 15 + d10 * 15;
    const gN = 15 + 4 + d10 * 19 + d10 * 20;
    const gp = (gS + 2) / (gN + 4);
    const kS = 2.5 + d10 * 7 + d10 * 7;
    const kN = 5 + d10 * 14 + d10 * 14;
    const kp = (kS + 2) / (kN + 4);
    t.near(catRow(r, 'gyoho').p, gp, 0.0006, '業法 p(日付のない記録は日付つきで覆われる)');
    t.near(catRow(r, 'gyoho').answers, gN, 0.06, '業法の重みつき回答数');
    t.near(catRow(r, 'kenri').p, kp, 0.0006, '権利 p');
    const exp = 14 * kp + 8 * 0.5 + 3 * 0.5 + 20 * gp + 5 * 0.5;
    t.near(r.expected, exp, 0.051, '見込み');
    const v = (n, p, N) => n * p * (1 - p) + (n * n * p * (1 - p)) / (N + 5);
    const sd = Math.sqrt(v(14, kp, kN) + v(8, 0.5, 0) + v(3, 0.5, 0) + v(20, gp, gN) + v(5, 0.5, 0));
    t.eq([r.low, r.high], [Math.round(exp - 1.28 * sd), Math.round(exp + 1.28 * sd)], '80%の幅');
    t.eq([r.status, r.need, r.needWhere.map((w) => [w.cat, w.need])], ['insufficient', 16, [['horei', 8], ['menjo', 8]]], '法令・免除が8問ずつ足りない');
    const e = ctx.Predict.estimate({ exempt: true });
    t.near(e.expected, exp - 2.5 + 5, 0.051, '5問免除: 免除科目は5点で固定');
    t.eq(e.needWhere.map((w) => w.cat), ['horei'], '5問免除: 免除科目は求めない');
    t.ok(e.low >= 5 && e.high <= 50, '5問免除の幅は 5〜50');
  }
  {
    const ctx = fresh();
    const qh = {};
    const cnt = { kenri: [100, 60], horei: [50, 30], zei: [20, 10], gyoho: [200, 150], menjo: [30, 20] };
    Object.keys(cnt).forEach((c) => byCatIds(ctx, c).slice(0, cnt[c][0]).forEach((id, i) => { qh[id] = i < cnt[c][1] ? 'ok' : 'ng'; }));
    setKey(ctx, 'quizHistory', qh);
    const bc = { kenri: { correct: 8, total: 14 }, horei: { correct: 4, total: 8 }, zei: { correct: 2, total: 3 }, gyoho: { correct: 14, total: 20 }, menjo: { correct: 3, total: 5 } };
    setKey(ctx, 'examHistory', [
      { id: 'a', examTypeId: 'takken', mode: 'full', startedAt: local(2026, 10, 9), finishedAt: local(2026, 10, 9, 12), score: 31, total: 50, byCategory: bc, wrong: [] },
      { id: 'b', examTypeId: 'takken', mode: 'full', startedAt: local(2026, 9, 4), finishedAt: local(2026, 9, 4, 12), score: 31, total: 50, byCategory: bc, wrong: [] },
      { id: 'c', examTypeId: 'takken', mode: 'full', startedAt: local(2026, 6, 6), finishedAt: local(2026, 6, 6, 12), score: 31, total: 50, byCategory: bc, wrong: [] },
      { id: 'z', examTypeId: 'zeirishi', mode: 'short', startedAt: local(2026, 10, 10), finishedAt: local(2026, 10, 10, 12), score: 1, total: 20, byCategory: { shohi: { correct: 1, total: 20 } }, wrong: [] },
    ]);
    const r = ctx.Predict.estimate();
    const w0 = 2 * Math.pow(0.5, 5 / 30);
    const w1 = 1.5 * Math.pow(0.5, 40 / 30);
    let exp = 0;
    const qs = { kenri: 14, horei: 8, zei: 3, gyoho: 20, menjo: 5 };
    Object.keys(cnt).forEach((c) => {
      const S = 0.3 * cnt[c][1] + (w0 + w1) * bc[c].correct;
      const N = 0.3 * cnt[c][0] + (w0 + w1) * bc[c].total;
      t.near(catRow(r, c).p, (S + 2) / (N + 4), 0.0006, `古い記録だけの利用者: ${c} の p(130日前の試験・税理士の試験は使わない)`);
      exp += qs[c] * ((S + 2) / (N + 4));
    });
    t.near(r.expected, exp, 0.051, '古い記録だけの利用者: 見込み');
    t.eq(r.status, 'ok', '古い記録だけの利用者: 足りる');
  }
});

test('「あと n 問」のとおりに解けば足りる(解き直しでも新しい問題でも)', (t) => {
  const answer = (ctx, id) => { const h = getKey(ctx, 'quizHistory') || {}; h[id] = 'ok'; setKey(ctx, 'quizHistory', h); ctx.AnswerLog.record(id, { ok: true, src: 'quiz' }); };
  for (const offset of [0, 100]) {
    const ctx = fresh();
    const kr = byCatIds(ctx, 'kenri');
    const qh = {};
    kr.slice(0, 20).forEach((id) => { qh[id] = 'ok'; });
    setKey(ctx, 'quizHistory', qh);
    const w = ctx.Predict.estimate().needWhere.find((x) => x.cat === 'kenri');
    t.ok(w && w.need > 0, '権利が足りない', w);
    for (let i = 0; i < (w ? w.need : 0); i++) answer(ctx, kr[offset + i]);
    t.ok(!ctx.Predict.estimate().needWhere.some((x) => x.cat === 'kenri'), `${offset ? '新しい問題' : '前に解いた問題'}を「あと${w && w.need}問」解けば足りる`);
  }
  const ctx = fresh();
  seedDaily(ctx, T, { gyoho: [40, 0, 0] });
  t.eq([ctx.Predict.estimate().status, ctx.Predict.estimate().need], ['insufficient', 24], '業法だけ → あと24問(権利・法令・免除 8問ずつ)');
  const e = ctx.Predict.estimate({ exempt: true });
  t.eq([e.need, e.needWhere.map((x) => x.cat)], [16, ['kenri', 'horei']], '5問免除なら免除科目は求めない');
});

test('速さ(たくさん記録のある利用者でも estimate は速い)', (t) => {
  const ctx = fresh();
  const qh = {};
  ctx.APP_DATA.quiz.forEach((q, i) => { qh[q.id] = i % 3 ? 'ok' : 'ng'; });
  setKey(ctx, 'quizHistory', qh);
  for (let i = 0; i < 120; i++) seedDaily(ctx, ctx.DateUtil.addDays(T, -i), CASE2);
  const hist = [];
  for (let i = 0; i < 30; i++) {
    const tt = ctx.DateUtil.parse(ctx.DateUtil.addDays(T, -i * 3)).getTime();
    hist.push({ id: `e${i}`, examTypeId: 'takken', mode: 'full', startedAt: tt - 7200000, finishedAt: tt, score: 12, total: 20, byCategory: { gyoho: { correct: 12, total: 20 } }, wrong: [] });
  }
  setKey(ctx, 'examHistory', hist);
  ctx.Predict.estimate();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) ctx.Predict.estimate();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  t.log(`Predict.estimate: ${ms.toFixed(2)} ms/回`);
  // 遅いマシン(CI)でも余裕のある上限。大きく遅くなったときだけ知らせる
  t.ok(ms < 100, `estimate が遅すぎる(${ms.toFixed(1)} ms/回)`);
  clearAll(ctx);
  setToday(ctx, T);
});

run();
