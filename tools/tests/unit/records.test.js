// 記録まわり(Node): AnswerLog(日付つきの回答・自信なし)・Drill(解き直し)・Streak・Analysis(自信なしの正解は0.5)
// 元: scratchpad r6/w4 t_node.js・audit7/T3 t1_records.js・r6/fix_p3 t_fix.js(v11.1 の古いコードとの比較は外した)
'use strict';
const { test, run } = require('../lib/harness.js');
const { load, setToday, setKey, getKey, makeStore, rng } = require('../lib/node.js');

const T = '2026-10-14';
const mcOf = (ctx) => ctx.APP_DATA.quiz.filter((q) => ctx.QuizEngine.isMcItem(q));
const catOf = (ctx, q) => { const c = ctx.Stats.categoryOf(q, 'takken'); return c ? c.id : 'other'; };

test('AnswerLog: 分野の対応は Stats.categoryOf(宅建)と同じ', (t) => {
  const { ctx } = load({ today: T });
  const cats = ctx.AnswerLog.categoryIds();
  const bad = mcOf(ctx).filter((q) => ctx.AnswerLog._internal.categoryIdOf(q) !== catOf(ctx, q)).map((q) => q.id);
  t.eq(bad, [], 'categoryIdOf と Stats.categoryOf が違う問題');
  t.ok(mcOf(ctx).every((q) => cats.includes(ctx.AnswerLog._internal.categoryIdOf(q))), 'categoryIds() にない分野がある');
});

test('AnswerLog: 記録・自信なしの付け外し・日付の境目・古い記録の整理', (t) => {
  const { ctx, fired } = load({ today: T });
  const mc = mcOf(ctx);
  const g = mc.find((q) => catOf(ctx, q) === 'gyoho');
  const k = mc.find((q) => catOf(ctx, q) === 'kenri');
  const o = mc.find((q) => catOf(ctx, q) === 'other');
  t.ok(g && k && o, '業法・権利・その他の問題がある');
  const A = ctx.AnswerLog;
  t.ok(A.record(g.id, { ok: true, unsure: false, src: 'quiz' }) === true, 'record は true を返す');
  A.record(g.id, { ok: true, unsure: true, src: 'exam' });
  A.record(g.id, { ok: false, src: 'quiz' });
  A.record(k.id, { ok: false, src: 'quiz' });
  A.record(o.id, { ok: true, src: 'quiz' });
  t.ok(A.record('no-such-id', { ok: true }) === false, '知らない ID は記録しない');
  t.eq(A.daily()[T], { gyoho: [1, 1, 1], kenri: [0, 0, 1], other: [1, 0, 0] }, '分野ごとの [自信あり正解, 自信なし正解, 不正解]');
  t.ok(A.isUnsure(g.id), '自信なしの正解で quizUnsure に入る');
  const dr = ctx.Drill.get(g.id);
  t.eq(dr && { step: dr.step, due: dr.due, unsure: dr.unsure, src: dr.src }, { step: 1, due: '2026-10-17', unsure: true, src: 'exam' }, '自信なし → 解き直し step1・3日後');
  t.ok(A.isUnsure(g.id), '不正解でも自信なしの印は残る');
  A.record(g.id, { ok: true, unsure: false, src: 'quiz' });
  t.ok(!A.isUnsure(g.id), '自信ありの正解で印が消える');
  t.eq(A.daily()[T].gyoho, [2, 1, 1], '2回目の自信ありの正解');
  t.ok(A.markUnsure(g.id, 'quiz') === true, 'markUnsure は true');
  t.eq(A.daily()[T].gyoho, [1, 2, 1], 'markUnsure で今日の自信ありを自信なしへ移す');
  t.ok(A.isUnsure(g.id), 'markUnsure で印が付く');
  t.ok(A.markUnsure(g.id, 'quiz') === false, '2回目の markUnsure は何もしない');
  t.eq(A.daily()[T].gyoho, [1, 2, 1], '二重に移さない');
  t.ok(A.unmarkUnsure(g.id) === true, 'unmarkUnsure は true');
  t.eq(A.daily()[T].gyoho, [2, 1, 1], 'unmarkUnsure で戻す');
  t.ok(!A.isUnsure(g.id), 'unmarkUnsure で印が消える');
  t.ok(A.unmarkUnsure(g.id) === false, '2回目の unmarkUnsure は何もしない');
  const k2 = mc.filter((q) => catOf(ctx, q) === 'kenri')[1];
  A.markUnsure(k2.id, 'quiz');
  t.eq(A.daily()[T].kenri, [0, 0, 1], '今日の記録がない問題の markUnsure は数を変えない');
  t.ok(A.isUnsure(k2.id) && ctx.Drill.get(k2.id) && ctx.Drill.get(k2.id).due === '2026-10-17', '…が印と解き直しは付ける');
  t.ok(fired.includes('answerlog:change'), 'answerlog:change が出る');
  // 120日より古い・形の違うキー・未来(翌日より先)は書くときに捨てる
  setKey(ctx, 'answerDaily', Object.assign({}, getKey(ctx, 'answerDaily'), {
    '2026-06-15': { gyoho: [1, 0, 0] }, '2026-06-16': { gyoho: [2, 0, 0] }, bad: { gyoho: [1, 1, 1] },
    '2026-10-20': { kenri: [1, 0, 0] }, '2026-10-13': { kenri: [3, 'x', -1], zzz: [1, 1, 1] },
  }));
  A.record(k.id, { ok: true, src: 'quiz' });
  const raw = getKey(ctx, 'answerDaily');
  t.ok(!raw['2026-06-15'] && raw['2026-06-16'] && !raw.bad && !raw['2026-10-20'], '古い(121日前)・形の違う・未来の日を捨て、120日前は残す', Object.keys(raw));
  t.eq(raw['2026-10-13'], { kenri: [3, 0, 0] }, '壊れた数と知らない分野を直す');
  // 日付が変わったあとの付け外しは前の日の数を動かさない
  const k3 = mc.filter((q) => catOf(ctx, q) === 'kenri')[2];
  A.record(k3.id, { ok: true, src: 'quiz' });
  setToday(ctx, '2026-10-15');
  A.markUnsure(k3.id, 'quiz');
  t.eq(A.daily()['2026-10-15'], undefined, '日付が変わったあとは今日の数を作らない');
  t.eq(A.daily()[T].kenri, [2, 0, 1], '前の日の数はそのまま');
});

test('AnswerLog: recordMany は record を順に呼んだのと同じ', (t) => {
  const A = load({ today: T });
  const B = load({ today: T });
  const mc = mcOf(A.ctx);
  const rnd = rng(7);
  const items = [];
  for (let i = 0; i < 120; i++) {
    const q = mc[Math.floor(rnd() * mc.length)];
    const okk = rnd() < 0.6;
    items.push({ quizId: q.id, ok: okk, unsure: okk && rnd() < 0.3 });
  }
  items.push({ quizId: 'nope', ok: true }, null, { quizId: 5 });
  [A, B].forEach((e) => setKey(e.ctx, 'quizUnsure', { [mc[2].id]: '2026-10-01', [mc[3].id]: '2026-10-01' }));
  items.forEach((it) => { if (it && typeof it.quizId === 'string') A.ctx.AnswerLog.record(it.quizId, { ok: it.ok, unsure: it.unsure, src: 'exam' }); });
  t.eq(B.ctx.AnswerLog.recordMany(items, 'exam'), 120, 'recordMany は記録した数を返す');
  ['answerDaily', 'quizUnsure', 'quizRetry'].forEach((k) => t.eq(getKey(B.ctx, k), getKey(A.ctx, k), `${k} が同じ`));
});

test('AnswerLog: 自信なしの付け外し(2枚のカード・別のタブ・再読み込み・日付の境目・模擬試験)', (t) => {
  const store = makeStore();
  const tab1 = load({ today: T, store });
  const tab2 = load({ today: T, store });
  const { ctx } = tab1;
  const A = ctx.AnswerLog;
  const mc = mcOf(ctx).filter((q) => A._internal.categoryIdOf(q) === 'gyoho');
  const [q1, q2, q3, q4, q5] = mc;
  const day = () => (A.daily()[ctx.DateUtil.today()] || {}).gyoho || [0, 0, 0];
  A.record(q1.id, { ok: true, src: 'quiz' });
  A.record(q1.id, { ok: true, src: 'quiz' });
  t.eq(day(), [2, 0, 0], '同じ問題に2回(2枚のカード)正解');
  A.markUnsure(q1.id, 'quiz');
  t.eq(day(), [1, 1, 0], '2枚目で付けると1つ移る');
  t.ok(A.markUnsure(q1.id, 'quiz') === false, '1枚目で付けても(今日もう付いている)何もしない');
  t.eq(day(), [1, 1, 0], '…数は変わらない');
  A.unmarkUnsure(q1.id);
  t.eq(day(), [2, 0, 0], '外すと戻る');
  for (let i = 0; i < 5; i++) { A.markUnsure(q1.id, 'quiz'); A.unmarkUnsure(q1.id); }
  t.eq(day(), [2, 0, 0], '5回付け外ししてもずれない');
  A.record(q2.id, { ok: true, src: 'quiz' });
  A.markUnsure(q2.id, 'quiz');
  A.record(q2.id, { ok: false, src: 'quiz' });
  t.ok(A.isUnsure(q2.id), 'あとで不正解でも印は残る');
  A.unmarkUnsure(q2.id);
  t.eq(day(), [3, 0, 1], 'あとで不正解のあとに外すと前の分を戻す');
  tab2.ctx.AnswerLog.record(q3.id, { ok: true, src: 'quiz' });
  A.markUnsure(q3.id, 'quiz');
  t.eq(day(), [4, 0, 1], '別のタブの記録は動かさない');
  t.ok(A.isUnsure(q3.id) && ctx.Drill.get(q3.id), '…が印と解き直しは付ける');
  t.ok(tab2.ctx.AnswerLog.markUnsure(q3.id, 'quiz') === false, '別のタブで今日もう付いていれば何もしない');
  t.eq(day(), [4, 0, 1], '…(仕様上の制限)');
  A.record(q4.id, { ok: true, src: 'quiz' });
  const reloaded = load({ today: T, store });
  reloaded.ctx.AnswerLog.markUnsure(q4.id, 'quiz');
  t.eq((reloaded.ctx.AnswerLog.daily()[T] || {}).gyoho, [5, 0, 1], 'sessionStorage がない再読み込みのあとは数を動かせない(仕様)');
  A.record(q5.id, { ok: true, src: 'quiz' });
  setToday(ctx, '2026-10-15');
  A.markUnsure(q5.id, 'quiz');
  t.eq((A.daily()[T] || {}).gyoho, [6, 0, 1], '日付の境目: 前の日の数はそのまま');
  t.ok(!(A.daily()['2026-10-15'] || {}).gyoho, '日付の境目: 今日には足さない');
  t.ok(A.isUnsure(q5.id), '日付の境目: 印は付く');
  t.ok(A.unmarkUnsure(q5.id) === true && !A.isUnsure(q5.id), '日付の境目: 外すと印が消える');
  t.eq((A.daily()[T] || {}).gyoho, [6, 0, 1], '日付の境目: 外しても数は負にならない');
  setToday(ctx, T);
  const q6 = mc[6];
  A.record(q6.id, { ok: true, src: 'quiz' });
  A.markUnsure(q6.id, 'quiz');
  setToday(ctx, '2026-10-15');
  A.unmarkUnsure(q6.id);
  t.eq((A.daily()[T] || {}).gyoho, [6, 1, 1], '0時を過ぎてから外しても前の日は戻さない');
  setToday(ctx, T);
  const q7 = mc[7];
  A.recordMany([{ quizId: q7.id, ok: true, unsure: true }], 'exam');
  t.ok(A.isUnsure(q7.id), '模擬試験の見直しつき正解で印が付く');
  A.recordMany([{ quizId: q7.id, ok: false, unsure: false }], 'exam');
  t.ok(A.isUnsure(q7.id), '模擬試験の不正解では印は残る');
  A.recordMany([{ quizId: q7.id, ok: true, unsure: false }], 'exam');
  t.ok(!A.isUnsure(q7.id), '模擬試験の自信ありの正解で印が消える');
  A.record(q7.id, { ok: false, unsure: true, src: 'quiz' });
  t.ok(!A.isUnsure(q7.id), '不正解+自信なし は不正解だけ');
});

test('AnswerLog: 壊れた保存データ・120日の境目', (t) => {
  const { ctx } = load({ today: T });
  const A = ctx.AnswerLog;
  setKey(ctx, 'answerDaily', 'garbage');
  const q = mcOf(ctx)[0];
  t.ok(A.record(q.id, { ok: true }) === true, '壊れた answerDaily の上に記録できる');
  setKey(ctx, 'quizUnsure', [1, 2]);
  t.ok(A.isUnsure(q.id) === false, '配列の quizUnsure でも落ちない');
  A.markUnsure(q.id, 'quiz');
  t.ok(A.isUnsure(q.id), 'markUnsure で配列の値を直す');
  setKey(ctx, 'quizUnsure', { [q.id]: 'not-a-date' });
  t.ok(!A.isUnsure(q.id), '日付でない印は無視');
  setKey(ctx, 'answerDaily', { '2026-06-16': { gyoho: [1, 0, 0] }, '2026-06-15': { gyoho: [1, 0, 0] } });
  const d = A.daily();
  t.ok(d['2026-06-16'] && !d['2026-06-15'], '残すのは120日(合格予測の範囲と同じ)');
});

test('AnswerLog: 再読み込みのあとも付け外しで数を戻せる(タブの sessionStorage)', (t) => {
  const SKEY = 'shojikiLearn.v1.answerLogRecent';
  const ssVal = (ss) => { const r = ss.getItem(SKEY); return r == null ? null : JSON.parse(r); };
  const noLocalRecent = (store) => Object.keys(store._data).every((k) => !/answerLogRecent/.test(k));
  const gy = (ctx) => mcOf(ctx).filter((q) => ctx.AnswerLog._internal.categoryIdOf(q) === 'gyoho');
  const dayOf = (ctx, d) => ((ctx.AnswerLog.daily()[d || T] || {}).gyoho) || [0, 0, 0];
  // 1. 付ける → 再読み込み → 外す
  {
    const store = makeStore();
    const ss = makeStore();
    const p1 = load({ today: T, store, session: ss });
    const [q1] = gy(p1.ctx);
    p1.ctx.AnswerLog.record(q1.id, { ok: true, src: 'quiz' });
    t.ok(p1.ctx.AnswerLog.markUnsure(q1.id, 'quiz') === true, '1 付ける');
    t.eq(dayOf(p1.ctx), [0, 1, 0], '1 自信なしへ移る');
    t.eq(ssVal(ss), { [q1.id]: { date: T, sure: 0, moved: 1 } }, '1 このタブの記録を sessionStorage に置く');
    const p2 = load({ today: T, store, session: ss });
    t.ok(p2.ctx.AnswerLog.unmarkUnsure(q1.id) === true, '1 再読み込みのあと外す');
    t.eq(getKey(p2.ctx, 'quizUnsure'), {}, '1 印が消える');
    t.eq(getKey(p2.ctx, 'answerDaily')[T], { gyoho: [1, 0, 0] }, '1 再読み込みのあとでも数が自信ありに戻る');
    for (let i = 0; i < 4; i++) { p2.ctx.AnswerLog.markUnsure(q1.id, 'quiz'); p2.ctx.AnswerLog.unmarkUnsure(q1.id); }
    t.eq(dayOf(p2.ctx), [1, 0, 0], '1 4回付け外ししてもずれない');
    t.ok(noLocalRecent(store), '1 localStorage には置かない');
  }
  // 2. 記録 → 再読み込み → 付けると数が動く。別のタブ(別の sessionStorage)は動かせない
  {
    const store = makeStore();
    const ssA = makeStore();
    const ssB = makeStore();
    const a1 = load({ today: T, store, session: ssA });
    const [, q1, q2] = gy(a1.ctx);
    a1.ctx.AnswerLog.record(q1.id, { ok: true, src: 'quiz' });
    a1.ctx.AnswerLog.record(q1.id, { ok: true, src: 'quiz' });
    a1.ctx.AnswerLog.record(q2.id, { ok: true, src: 'quiz' });
    t.eq(ssVal(ssA), { [q1.id]: { date: T, sure: 2, moved: 0 }, [q2.id]: { date: T, sure: 1, moved: 0 } }, '2 自信ありの数を置く');
    const a2 = load({ today: T, store, session: ssA });
    const b1 = load({ today: T, store, session: ssB });
    a2.ctx.AnswerLog.markUnsure(q1.id, 'quiz');
    t.eq(dayOf(a2.ctx), [2, 1, 0], '2 再読み込みのあとに付けると1つ移る');
    t.ok(a2.ctx.AnswerLog.markUnsure(q1.id, 'quiz') === false, '2 同じ日の2回目は何もしない');
    b1.ctx.AnswerLog.markUnsure(q2.id, 'quiz');
    t.eq(dayOf(b1.ctx), [2, 1, 0], '2 別のタブは数を動かさない');
    t.ok(b1.ctx.AnswerLog.isUnsure(q2.id) && b1.ctx.Drill.get(q2.id), '2 別のタブでも印と解き直しは付く');
    t.eq(ssVal(ssB), null, '2 別のタブは何も置かない');
  }
  // 3. 日付が変わった分は捨てる
  {
    const store = makeStore();
    const ss = makeStore();
    const p1 = load({ today: T, store, session: ss });
    const [, , , q1, q2] = gy(p1.ctx);
    p1.ctx.AnswerLog.record(q1.id, { ok: true, src: 'quiz' });
    setToday(p1.ctx, '2026-10-15');
    p1.ctx.AnswerLog.record(q2.id, { ok: true, src: 'quiz' });
    t.eq(ssVal(ss), { [q2.id]: { date: '2026-10-15', sure: 1, moved: 0 } }, '3 前の日の分は書くときに捨てる');
    ss.setItem(SKEY, JSON.stringify({ [q1.id]: { date: T, sure: 3, moved: 2 }, [q2.id]: { date: '2026-10-15', sure: 1, moved: 0 } }));
    const p2 = load({ today: '2026-10-15', store, session: ss });
    p2.ctx.AnswerLog.unmarkUnsure(q1.id);
    t.eq(dayOf(p2.ctx, T), [1, 0, 0], '3 古い日の記録は読むときに無視');
    p2.ctx.AnswerLog.markUnsure(q2.id, 'quiz');
    t.eq(dayOf(p2.ctx, '2026-10-15'), [0, 1, 0], '3 今日の記録は使う');
  }
  // 4. sessionStorage が使えない・壊れている → このページの間だけ覚える
  const runBroken = (label, ss) => {
    const store = makeStore();
    const p = load({ today: T, store, session: ss });
    const [, , , , , q1] = gy(p.ctx);
    try {
      p.ctx.AnswerLog.record(q1.id, { ok: true, src: 'quiz' });
      p.ctx.AnswerLog.markUnsure(q1.id, 'quiz');
      t.eq(dayOf(p.ctx), [0, 1, 0], `4 ${label}: このページの中では移る`);
      p.ctx.AnswerLog.unmarkUnsure(q1.id);
      t.eq(dayOf(p.ctx), [1, 0, 0], `4 ${label}: このページの中では戻る`);
    } catch (e) { t.ok(false, `4 ${label}: 例外`, e.message); }
    t.ok(noLocalRecent(store), `4 ${label}: localStorage に置かない`);
    t.eq(p.logs.error, [], `4 ${label}: console.error なし`);
  };
  runBroken('sessionStorage なし', undefined);
  runBroken('sessionStorage が例外', { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } });
  const full = makeStore(); full.quotaChars = 0;
  runBroken('容量0', full);
  const garbage = makeStore(); garbage.setItem(SKEY, '{oops');
  runBroken('壊れた JSON', garbage);
  const bad = makeStore();
  bad.setItem(SKEY, JSON.stringify({ a: 5, b: { date: T, sure: -3, moved: 'x' }, c: { date: T, sure: 1e12, moved: 0 } }));
  runBroken('壊れた中身', bad);
  const v = JSON.parse(bad.getItem(SKEY));
  t.ok(!('a' in v) && !('b' in v) && v.c && v.c.sure === 1e6, '4 壊れた中身は書くときに直す・上限で切る', v);
});

test('Drill: 解き直しの予定・1日30問の上限・卒業・壊れた値', (t) => {
  const { ctx, fired } = load({ today: T });
  const D = ctx.Drill;
  const mc = mcOf(ctx);
  const a = mc[0].id;
  const b = mc[1].id;
  setKey(ctx, 'quizRetry', { [a]: { step: 3, due: T, at: '2026-09-20', src: 'quiz' } });
  t.eq(D.noteRight(a), { graduated: true }, 'step3 で正解すると卒業');
  t.eq(getKey(ctx, 'drillStats'), { graduated: 1 }, '卒業の数 1');
  t.ok(D.noteRight(a) === null, '同じ問題は二重に卒業しない');
  t.eq(D.stats().graduated, 1, '…数も二重に増えない');
  setKey(ctx, 'quizRetry', { [a]: { step: 2, due: '2026-10-30', at: T, src: 'quiz' }, [b]: { step: 0, due: '2026-10-15', at: T, src: 'quiz' } });
  t.ok(D.noteUnsure(a, 'quiz') === true, '先の予定は自信なしで3日後へ寄せる');
  t.eq(D.get(a), { step: 2, due: '2026-10-17', at: T, src: 'quiz' }, '…段階はそのまま');
  t.ok(D.noteUnsure(b, 'quiz') === false, '近い予定はそのまま');
  t.eq(D.get(b), { step: 0, due: '2026-10-15', at: T, src: 'quiz' }, '…変わらない');
  setKey(ctx, 'quizRetry', { [a]: { step: 1, due: T, at: '2026-10-11', src: 'quiz' } });
  t.ok(D.noteUnsure(a, 'quiz') === false && D.get(a).due === T, '今日の予定は後ろへずらさない');
  setKey(ctx, 'quizRetry', {});
  let added = 0;
  mc.slice(10, 50).forEach((q) => { if (D.noteUnsure(q.id, 'ox')) added += 1; });
  t.eq(added, 30, '自信なしで足すのは1日30問まで');
  t.ok(D.noteWrong(mc[51].id, 'quiz') === true, '不正解は上限に関係なく足す');
  setToday(ctx, '2026-10-15');
  t.ok(D.noteUnsure(mc[60].id, 'ox') === true, '上限は次の日に戻る');
  t.ok(fired.includes('drill:change'), 'drill:change が出る');
  setToday(ctx, '2026-10-17');
  t.eq(D.noteRight(mc[10].id), { graduated: false, step: 2, due: '2026-10-24', days: 7 }, '自信なしの step1 → 正解で step2(7日後)');
  t.eq(D.get(mc[10].id).unsure, undefined, '答えると自信なしの印は消える');
  setKey(ctx, 'quizRetry', Object.assign(getKey(ctx, 'quizRetry'), { 'quiz-RETIRED-1': { step: 0, due: '2026-10-13', at: '2026-10-12', src: 'quiz' } }));
  t.ok(!D.dueIds().includes('quiz-RETIRED-1'), 'なくなった問題は出題しない');
  t.ok(D.noteUnsure('quiz-RETIRED-1', 'quiz') === false, 'なくなった問題は自信なしでも足さない');
  t.ok(getKey(ctx, 'quizRetry')['quiz-RETIRED-1'], 'なくなった問題の記録は消さない');
  setKey(ctx, 'drillStats', { graduated: 'x' });
  t.eq(D.stats().graduated, 0, '壊れた drillStats は0');
  setKey(ctx, 'drillStats', { graduated: 1e300 });
  t.eq(D.stats().graduated, 1e6, '大きすぎる drillStats は上限で切る');
});

test('Drill: 勘で当たったときは同じページ・同じ日の卒業を取り消す', (t) => {
  const seedDue = (ctx, id, step) => setKey(ctx, 'quizRetry', Object.assign(getKey(ctx, 'quizRetry') || {}, { [id]: { step, due: T, at: '2026-09-23', src: 'quiz' } }));
  const store = makeStore();
  const p = load({ today: T, store, session: makeStore() });
  const D = p.ctx.Drill;
  const mc = mcOf(p.ctx);
  const [a, b, c] = mc.slice(100, 103).map((q) => q.id);
  seedDue(p.ctx, a, 3);
  t.eq(D.noteRight(a), { graduated: true }, '卒業');
  t.ok(D.noteUnsure(a, 'quiz') === true, '勘で当たった → 予定に戻す');
  t.eq(D.get(a), { step: 1, due: '2026-10-17', at: T, src: 'quiz', unsure: true }, '…step1・3日後');
  t.eq(D.stats().graduated, 0, '卒業の数を取り消す');
  t.ok(D.noteUnsure(a, 'quiz') === false, '2回目は何もしない');
  t.eq(D.stats().graduated, 0, '…二重に減らさない');
  seedDue(p.ctx, b, 3);
  D.noteRight(b);
  D.noteUnsure(c, 'quiz');
  t.eq(D.stats().graduated, 1, '別の問題では取り消さない');
  setKey(p.ctx, 'drillStats', { graduated: 0, keep: 'x' });
  D.noteUnsure(b, 'quiz');
  t.eq(getKey(p.ctx, 'drillStats'), { graduated: 0, keep: 'x' }, '0 より減らさない・ほかの項目は残す');
  const d = mc[103].id;
  seedDue(p.ctx, d, 3);
  setKey(p.ctx, 'drillStats', { graduated: 5 });
  D.noteRight(d);
  load({ today: T, store, session: makeStore() }).ctx.Drill.noteUnsure(d, 'quiz');
  t.eq(D.stats().graduated, 6, '別のページの卒業は取り消さない');
  const e = mc[104].id;
  seedDue(p.ctx, e, 3);
  D.noteRight(e);
  setToday(p.ctx, '2026-10-15');
  D.noteUnsure(e, 'quiz');
  t.eq(D.stats().graduated, 7, '次の日には取り消さない');
  // 画面の流れ: 4択の「勘で当たった」(AnswerLog 経由)・模擬試験の見直し・○× の「たぶん」・上限
  const p2 = load({ today: T, store: makeStore(), session: makeStore() });
  const [q, x, o] = mcOf(p2.ctx).slice(200, 203).map((z) => z.id);
  seedDue(p2.ctx, q, 3);
  p2.ctx.AnswerLog.record(q, { ok: true, src: 'quiz' });
  t.eq(p2.ctx.Drill.note(q, true, 'quiz'), { graduated: true }, '4択: 卒業');
  p2.ctx.AnswerLog.markUnsure(q, 'quiz');
  t.eq(p2.ctx.Drill.stats().graduated, 0, '4択の「勘で当たった」で取り消す');
  p2.ctx.AnswerLog.unmarkUnsure(q);
  t.ok(p2.ctx.Drill.get(q) && p2.ctx.Drill.stats().graduated === 0, '外しても予定は残る(数は取り消したまま)');
  seedDue(p2.ctx, x, 3);
  p2.ctx.Drill.note(x, true, 'exam');
  p2.ctx.AnswerLog.recordMany([{ quizId: x, ok: true, unsure: true }], 'exam');
  t.eq(p2.ctx.Drill.stats().graduated, 0, '模擬試験の見直しつき正解で取り消す');
  seedDue(p2.ctx, o, 3);
  p2.ctx.Drill.noteRight(o);
  p2.ctx.Drill.noteUnsure(o, 'ox');
  t.eq(p2.ctx.Drill.stats().graduated, 0, '○×の「たぶん」で取り消す');
  const p3 = load({ today: T, store: makeStore(), session: makeStore() });
  const mc3 = mcOf(p3.ctx);
  for (let i = 0; i < 30; i++) p3.ctx.Drill.noteUnsure(mc3[300 + i].id, 'ox');
  seedDue(p3.ctx, mc3[400].id, 3);
  p3.ctx.Drill.noteRight(mc3[400].id);
  t.ok(p3.ctx.Drill.noteUnsure(mc3[400].id, 'quiz') === false && !p3.ctx.Drill.get(mc3[400].id), '上限に達していれば戻さない');
  t.eq(p3.ctx.Drill.stats().graduated, 1, '…卒業はそのまま');
  const p4 = load({ today: T, store: makeStore(), session: makeStore() });
  setKey(p4.ctx, 'drillStats', { graduated: 9 });
  const h = mcOf(p4.ctx)[500].id;
  seedDue(p4.ctx, h, 3);
  p4.ctx.AnswerLog.record(h, { ok: true, src: 'quiz' });
  p4.ctx.Drill.note(h, true, 'quiz');
  p4.ctx.AnswerLog.markUnsure(h, 'quiz');
  t.eq(p4.ctx.Badges.list().find((r) => r.id === 'drill10').progress.now, 9, 'バッジ(解き直し卒業10問)の進み具合にも反映');
});

test('Streak: 今日の回数と study:action', (t) => {
  const { ctx, fired } = load({ today: T });
  ctx.Streak.recordToday();
  ctx.Streak.recordToday();
  t.eq(getKey(ctx, 'activityLog'), { [T]: 2 }, 'activityLog に今日の回数');
  t.eq(fired.filter((x) => x === 'study:action').length, 2, '記録ごとに study:action');
});

test('Analysis: 自信なしの正解は0.5問ぶん(分野ごと・正確に)、壊れた印は無視', (t) => {
  const env = load({ today: T });
  const { ctx } = env;
  const rnd = rng(11);
  const qh = {};
  ctx.APP_DATA.quiz.forEach((q) => { if (rnd() < 0.7) qh[q.id] = rnd() < 0.62 ? 'ok' : 'ng'; });
  setKey(ctx, 'quizHistory', qh);
  const ox = {};
  ctx.QuizEngine.allStatements().forEach((st) => { if (rnd() < 0.5) ox[st.id] = { c: Math.floor(rnd() * 4), w: Math.floor(rnd() * 3), lastOk: rnd() < 0.6, last: '2026-10-01' }; });
  setKey(ctx, 'oxStats', ox);
  const auto = {};
  ctx.AppIndex.allTerms.slice(0, 300).forEach((x) => { auto[x.id] = { correct: Math.floor(rnd() * 5), wrong: Math.floor(rnd() * 3) }; });
  setKey(ctx, 'autoQuizStats', auto);
  setKey(ctx, 'examHistory', [{ id: 'e1', examTypeId: 'takken', mode: 'full', startedAt: Date.UTC(2026, 9, 1), finishedAt: Date.UTC(2026, 9, 1, 2), score: 33, total: 50,
    byCategory: { kenri: { correct: 8, total: 14 }, horei: { correct: 5, total: 8 }, zei: { correct: 2, total: 3 }, gyoho: { correct: 15, total: 20 }, menjo: { correct: 3, total: 5 } }, wrong: [] }]);
  setKey(ctx, 'examTargets', [{ id: 'et1', name: '宅建', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: Date.UTC(2026, 3, 1) }]);
  const strip = (snap) => JSON.parse(JSON.stringify(snap, (k, v) => (k === 'type' || k === 'topic' ? undefined : v)));
  const base = strip(ctx.Analysis.analyze('takken'));
  setKey(ctx, 'quizUnsure', {});
  t.eq(strip(ctx.Analysis.analyze('takken')), base, '空の quizUnsure では変わらない');
  const okIds = Object.keys(qh).filter((id) => qh[id] === 'ok' && ctx.QuizEngine.isMcItem(ctx.Drill.quizOf(id))).slice(0, 10);
  const ngId = Object.keys(qh).find((id) => qh[id] === 'ng' && ctx.QuizEngine.isMcItem(ctx.Drill.quizOf(id)));
  const flags = { 'quiz-missing': '2026-10-10', [ngId]: '2026-10-10' };
  okIds.forEach((id) => { flags[id] = '2026-10-10'; });
  setKey(ctx, 'quizUnsure', flags);
  const now = ctx.Analysis.analyze('takken');
  const drop = {};
  okIds.forEach((id) => { const c = ctx.Stats.categoryOf(ctx.Drill.quizOf(id), 'takken'); if (c) drop[c.id] = (drop[c.id] || 0) + 0.5; });
  const bad = [];
  base.categories.forEach((row) => {
    const cur = now.categories.find((r) => r.id === row.id);
    const mcB = row.sources.find((s) => s.id === 'mc');
    const mcN = cur.sources.find((s) => s.id === 'mc');
    if (Math.abs((mcB.correct - mcN.correct) - (drop[row.id] || 0)) > 1e-9 || mcB.total !== mcN.total) bad.push({ cat: row.id, before: mcB, after: mcN, drop: drop[row.id] });
    if (cur.accuracy > row.accuracy || cur.mastery > row.mastery) bad.push({ cat: row.id, higher: true });
  });
  t.eq(bad, [], '4択の正解が印1つにつき0.5減る(不正解の印・ない問題の印は影響なし)・正答率と習熟度は上がらない');
  setKey(ctx, 'quizUnsure', { [okIds[0]]: true, [okIds[1]]: '2026-13-01' });
  t.eq(strip(ctx.Analysis.analyze('takken')).categories, base.categories, '日付でない印は無視');
});

run();
