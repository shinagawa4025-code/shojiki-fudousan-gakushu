// レベルと経験値(v14。js/xp.js・js/views/challenge.js の LevelUi)・レベルと今日のチャレンジのバッジ(Node)
// レベルの曲線と進み方の目安・点数・同じ日の同じ問題(1XP)・目標の達成(1日1回)・チャレンジ(ボーナスは1日1回)・
// はじめの XP(1回だけ・新しい利用者は 0)・壊れた保存値・400日・4択/模擬試験の記録からの経験値・バッジ
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, run, RAW } = require('../lib/harness.js');
const { load, setToday, setKey, getKey } = require('../lib/node.js');

const T = '2026-10-14';
// js/xp.js と LevelUi(js/views/challenge.js)を読み込む。node.js の EXTRA には入っていないため、ここで足す
// ui: false なら xp.js だけ、'only' なら LevelUi だけ(xp.js を読んだあとで)
function addXp(env, ui) {
  const files = (ui === 'only' ? [] : ['js/xp.js']).concat(ui === false ? [] : ['js/views/challenge.js']);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(RAW, f), 'utf8'), env.ctx, { filename: f }));
  return env;
}
const fresh = (o, ui) => addXp(load(Object.assign({ today: T }, o || {})), ui);
const mcIds = (ctx) => ctx.APP_DATA.quiz.filter((q) => ctx.QuizEngine.isMcItem(q)).map((q) => q.id);

test('Xp: レベルの曲線(式・境目・最高レベル)', (t) => {
  const { ctx } = fresh();
  const X = ctx.Xp;
  t.eq([1, 2, 3, 5, 10, 20, 30, 50, 99].map((L) => X.startOf(L)), [0, 300, 850, 2400, 8100, 24850, 46850, 102900, 291050], 'レベル L になる合計 XP = 300 × (L−1)^1.5(10 の位で丸める)');
  let inc = true;
  for (let L = 1; L < 98; L++) if (!(X.startOf(L + 2) - X.startOf(L + 1) > X.startOf(L + 1) - X.startOf(L))) inc = false;
  t.ok(inc, '次のレベルまでの XP はレベルが上がるほど増える');
  t.eq(X.levelOf(0), { level: 1, into: 0, need: 300, rest: 300, pct: 0, max: false }, '0 XP は Lv.1');
  t.eq([X.levelOf(299).level, X.levelOf(300).level, X.levelOf(2399).level, X.levelOf(2400).level], [1, 2, 4, 5], '境目');
  const top = X.levelOf(1e9);
  t.ok(top.level === 99 && top.max && top.pct === 100 && top.need === 0 && X.MAX === 99, '最高は Lv.99', top);
  t.eq(X.levelOf(-5).level, 1, '負の値・壊れた値は 0 として扱う');
  t.eq(X.levelOf('abc').level, 1, '数でない値も 0');
  t.eq(X.levelOf(450), { level: 2, into: 150, need: 550, rest: 400, pct: 27, max: false }, '途中の値(Lv.2 の 150/550)');
});

test('Xp: 進み方の目安(1日に4択40問・約7割正解+目標達成なら Lv.5 まで約1週間・Lv.20 まで約2〜3か月)', (t) => {
  const env = fresh();
  const { ctx } = env;
  ctx.Xp.seedIfNeeded();
  let d = T;
  let lv5 = null;
  let lv20 = null;
  for (let day = 1; day <= 120 && !lv20; day++) {
    setToday(ctx, d);
    for (let i = 0; i < 40; i++) {
      const r = i % 10;
      ctx.Xp.award('mc', { id: `q-${day}-${i}`, correct: r < 8, unsure: r === 7 });
    }
    ctx.dispatchEvent(new ctx.CustomEvent('goal:met', { detail: { date: d } }));
    const L = ctx.Xp.level().level;
    if (L >= 5 && !lv5) lv5 = day;
    if (L >= 20 && !lv20) lv20 = day;
    d = ctx.DateUtil.addDays(d, 1);
  }
  t.ok(lv5 >= 5 && lv5 <= 9, 'Lv.5 まで約1週間', lv5);
  t.ok(lv20 >= 60 && lv20 <= 92, 'Lv.20 まで約2〜3か月', lv20);
  t.ok(Object.keys(getKey(ctx, 'xp').days).length <= 401, '日ごとの記録は400日分まで');
});

test('Xp: 点数・同じ日の同じ問題は 1XP・次の日は元どおり・知らない種類は 0・変化の知らせ', (t) => {
  const { ctx, fired } = fresh();
  const X = ctx.Xp;
  X.seedIfNeeded();
  const got = [];
  const off = X.onChange((info) => got.push(info.gained));
  t.eq([X.award('mc', { id: 'a', correct: true }), X.award('mc', { id: 'b', correct: true, unsure: true }), X.award('mc', { id: 'c', correct: false })], [10, 6, 3], '4択 10・6・3');
  t.eq([X.award('mc', { id: 'a', correct: true }), X.award('mc', { id: 'c', correct: false }), X.award('mc', { id: 'c', correct: true })], [1, 1, 1], '同じ日に同じ問題へもう一度答えると 1XP');
  t.eq(X.award('ox', { id: 'a', correct: true }), 3, '種類が違えば別の問題(○× 3)');
  t.eq([X.award('ox', { id: 'o2', correct: true, unsure: true }), X.award('ox', { id: 'o3', correct: false })], [2, 1], '○× たぶんの正解 2・不正解 1');
  t.eq([X.award('review', { id: 't1', correct: true, grade: 3 }), X.award('review', { id: 't2', correct: false, grade: 1 }), X.award('review', { id: 't1', correct: true })], [3, 3, 1], '復習 3(同じカードの2回目は 1)');
  t.eq(['numbers', 'compare', 'joubun'].map((k) => [X.award(k, { id: 'n1', correct: true }), X.award(k, { id: 'n2', correct: true, unsure: true }), X.award(k, { id: 'n3', correct: false })]), [[4, 2, 1], [4, 2, 1], [4, 2, 1]], '数字まとめ・比較表・条文穴埋め 4・2・1');
  t.eq([X.award('nope', { id: 'x', correct: true }), X.award('mc'), X.award('mc', null)], [0, 3, 3], '知らない種類は 0。id なしは不正解の点(くり返しの判定なし)');
  const sum = 10 + 6 + 3 + 1 + 1 + 1 + 3 + 2 + 1 + 3 + 3 + 1 + 3 * 7 + 0 + 3 + 3;
  t.eq([X.total(), X.today()], [sum, sum], '合計と今日の XP');
  t.eq(got.length, 23, 'onChange は足したたびに呼ぶ(0 のときは呼ばない)');
  off();
  X.award('mc', { id: 'z', correct: true });
  t.eq(got.length, 23, '外したら呼ばない');
  t.ok(fired.filter((x) => x === 'xp:change').length >= 24, "'xp:change' を送る");
  setToday(ctx, '2026-10-15');
  t.eq([X.award('mc', { id: 'a', correct: true }), X.today()], [10, 10], '次の日は同じ問題でも元どおり');
  t.eq(getKey(ctx, 'xp').ids.d, '2026-10-15', '今日答えた問題の印は今日の分だけ');
  t.eq(getKey(ctx, 'xp').days, { [T]: sum + 10, '2026-10-15': 10 }, '日ごとの XP');
});

test('Xp: 目標の達成(1日1回 +50)・今日のチャレンジ(正解1問 2・ボーナス +30 は1日1回)', (t) => {
  const { ctx } = fresh();
  const X = ctx.Xp;
  ctx.dispatchEvent(new ctx.CustomEvent('goal:met', { detail: { date: T } }));
  t.eq(X.total(), 50, "'goal:met' で +50");
  ctx.dispatchEvent(new ctx.CustomEvent('goal:met', { detail: { date: T } }));
  t.eq([X.total(), X.award('goal')], [50, 0], '同じ日は1回だけ');
  t.eq(X.award('challenge', { ids: ['s1', 's2', 's3'], finished: true }), 36, 'チャレンジ: 3問正解 + ボーナス30');
  t.eq(X.award('challenge', { ids: ['s1', 's4'], finished: true }), 3, '2回目: ボーナスなし・同じ文は 1');
  t.eq(X.award('challenge', { ids: [], finished: false }), 0, '途中で終了・正解なしは 0');
  setToday(ctx, '2026-10-15');
  t.eq(X.award('challenge', { ids: ['s1'], finished: false }), 2, '次の日: 途中で終えた回にはボーナスなし');
  t.eq(X.award('challenge', { ids: [], finished: true }), 30, '最後までやればボーナス');
  ctx.dispatchEvent(new ctx.CustomEvent('goal:met', { detail: { date: '2026-10-15' } }));
  t.eq(X.today(), 82, '次の日の目標も +50');
});

test('Xp: はじめの XP(これまでの記録から1回だけ・新しい利用者は 0・数え方が届くまでは付けない)', (t) => {
  // 記録のある利用者
  let env = load({ today: T });
  const ids = mcIds(env.ctx).slice(0, 20);
  setKey(env.ctx, 'answerDaily', { '2026-10-10': { gyoho: [5, 1, 2] }, bad: { gyoho: [9, 9, 9] } });
  setKey(env.ctx, 'quizHistory', Object.fromEntries(ids.map((id, i) => [id, i < 15 ? 'ok' : 'ng'])));
  setKey(env.ctx, 'oxStats', { 'q#1': { c: 3, w: 1, u: 1 }, junk: 5 });
  setKey(env.ctx, 'srsCards', { t1: { reps: 2 }, t2: { reps: 0, lastGrade: 1 } });
  setKey(env.ctx, 'autoQuizStats', { t1: { correct: 1, wrong: 1 } });
  setKey(env.ctx, 'examHistory', [{ finishedAt: new Date(2026, 8, 1, 12).getTime(), total: 50, score: 30 }, { finishedAt: new Date(2026, 9, 12, 12).getTime(), total: 50, score: 40 }, 'x']);
  setKey(env.ctx, 'goalDays', { '2026-10-01': true, '2026-10-02': true, '2026-10-03': 'yes' });
  setKey(env.ctx, 'studyTime', { '2026-10-10': 600 });
  setKey(env.ctx, 'activityLog', { '2026-10-10': 20 });
  addXp(env, false);
  const X = env.ctx.Xp;
  t.eq(X.award('mc', { id: 'pre', correct: true }), 10, '数え方(LevelUi)が届く前でも足せる');
  t.ok(getKey(env.ctx, 'xp').seeded === false, 'まだはじめの XP は付けない');
  addXp(env, 'only');
  const expect = (5 * 10 + 6 + 2 * 3) + 12 * (15 * 10 + 5 * 3) / 20 + (2 * 3 + 2 + 1) + 2 * 3 + 13 + (30 * 10 + 20 * 3) + 2 * 50;
  t.eq(X.total(), Math.round(expect) + 10, '4択・日付のない4択・自動の4択・○×・復習カード・前の模擬試験・目標の日から数える(あとから足した分はそのまま)');
  const x = getKey(env.ctx, 'xp');
  t.ok(x.seeded === true && x.seed === Math.round(expect) && x.seedAt === T && x.seen === X.levelOf(x.total).level, 'seeded・seed・seedAt・お祝い済みのレベル', x);
  t.eq(env.ctx.LevelUi._internal.pending(), 0, 'はじめの XP ではお祝いしない');
  setKey(env.ctx, 'goalDays', Object.fromEntries(Array.from({ length: 30 }, (_, i) => [env.ctx.DateUtil.addDays('2026-01-01', i), true])));
  X.seedIfNeeded();
  t.eq(X.total(), Math.round(expect) + 10, '二度は付けない(あとで記録が増えても)');
  // 新しい利用者
  env = fresh();
  t.eq([env.ctx.Xp.total(), env.ctx.Xp.level().level], [0, 1], '新しい利用者は 0(Lv.1)');
  t.ok(getKey(env.ctx, 'xp').seeded === true && getKey(env.ctx, 'xp').seed === 0, '新しい利用者も seeded(あとで記録が増えても付けない)');
  setKey(env.ctx, 'quizHistory', Object.fromEntries(mcIds(env.ctx).slice(0, 50).map((id) => [id, 'ok'])));
  t.eq(env.ctx.Xp.total(), 0, 'あとから記録が増えても付けない');
  // 学習時間・学習の回数だけの利用者(少なくともこの分)
  env = load({ today: T });
  setKey(env.ctx, 'studyTime', { '2026-10-10': 3600, '2026-10-11': 'x' });
  addXp(env);
  t.eq(env.ctx.Xp.total(), 300, '学習時間 60分 → 300 XP');
  env = load({ today: T });
  setKey(env.ctx, 'activityLog', { '2026-10-10': 40, '2026-10-11': true });
  addXp(env);
  t.eq(env.ctx.Xp.total(), 123, '学習の回数 41回 → 123 XP');
});

test('Xp: 壊れた保存値・型の違う値・400日より古い日・バックアップから戻したとき', (t) => {
  const { ctx } = fresh();
  const X = ctx.Xp;
  setKey(ctx, 'xp', { total: -5, days: { bad: 3, [T]: 'x', '2024-01-01': 50, '2026-10-13': 7 }, seeded: true, seen: 'a', ids: 5, seed: 'many', goal: 'today', ch: 42 });
  t.eq([X.total(), X.today(), X.level().level], [0, 0, 1], '壊れた値は 0');
  t.eq(X.award('mc', { id: 'q', correct: true }), 10, '壊れていても足せる');
  const x = getKey(ctx, 'xp');
  t.eq(x.days, { '2026-10-13': 7, [T]: 10 }, '日付として正しくない日・400日より古い日は消える');
  t.ok(x.seen === 1 && x.seed === 0 && !('goal' in x) && !('ch' in x) && x.ids.d === T, '形の違う値は捨てる', x);
  setKey(ctx, 'xp', 'junk');
  t.eq(X.total(), 0, '形の違う保存値(文字列)は初めてと同じ(記録がなければ 0)');
  t.ok(getKey(ctx, 'xp').seeded === true, 'はじめの XP を付け直す');
  // 読み込んだバックアップ(以前の版で xp がない)→ はじめの XP を付ける
  const env2 = load({ today: T });
  setKey(env2.ctx, 'activityLog', { '2026-10-01': 10 });
  addXp(env2);
  t.eq(env2.ctx.Xp.total(), 30, 'xp のないバックアップから戻したときは、記録から付ける');
  // 例外を投げない(Storage が壊れていても)
  const env3 = fresh();
  env3.ctx.Storage.get = () => { throw new Error('boom'); };
  t.eq([env3.ctx.Xp.award('mc', { id: 'a', correct: true }), env3.ctx.Xp.total(), env3.ctx.Xp.today()], [0, 0, 0], '保存値を読めなくても例外を投げない');
});

test('Xp: 4択・模擬試験の記録(AnswerLog)から・お祝いするレベル(1つのレベルにつき1回)', (t) => {
  const { ctx } = fresh();
  const ids = mcIds(ctx);
  ctx.Xp.seedIfNeeded();
  ctx.AnswerLog.record(ids[0], { ok: true, src: 'quiz' });
  ctx.AnswerLog.record(ids[1], { ok: true, unsure: true, src: 'quiz' });
  ctx.AnswerLog.record(ids[2], { ok: false, src: 'quiz' });
  t.eq(ctx.Xp.total(), 19, 'AnswerLog.record から 10・6・3');
  ctx.AnswerLog.recordMany([{ quizId: ids[0], ok: true }, { quizId: ids[3], ok: true }, { quizId: ids[4], ok: false }, { quizId: 'quiz-NONE', ok: true }], 'exam');
  t.eq(ctx.Xp.total(), 19 + 1 + 10 + 3, '模擬試験の採点(recordMany): 同じ日の同じ問題は 1・ない問題は数えない');
  const P = ctx.LevelUi._internal;
  t.eq(P.pending(), 0, 'Lv.1 のうちはお祝いなし');
  ids.slice(10, 40).forEach((id) => ctx.AnswerLog.record(id, { ok: true, src: 'quiz' }));
  t.eq([ctx.Xp.level().level, P.pending()], [2, 2], 'Lv.2 に上がったらお祝いを待つ');
  P.markSeen(2);
  t.eq(P.pending(), 0, 'お祝いしたら出さない');
  P.markSeen(1);
  t.eq(getKey(ctx, 'xp').seen, 2, 'お祝いしたレベルは下がらない');
});

test('LevelUi: 今日のチャレンジの記録を整えて読む・直近の日ごとの XP', (t) => {
  const { ctx } = fresh();
  setKey(ctx, 'challenge', { best: '9', days: { [T]: { best: 12, runs: 2 }, bad: { best: 3, runs: 1 }, '2026-10-13': 'x', '2026-10-12': { best: 0, runs: 0 } }, pool: 'zeirishi' });
  t.eq(ctx.LevelUi.readChallenge(), { best: 9, days: { [T]: { best: 12, runs: 2 } }, pool: 'zeirishi' }, '壊れた日・空の日は捨てる');
  setKey(ctx, 'challenge', [1, 2]);
  t.eq(ctx.LevelUi.readChallenge(), { best: 0, days: {}, pool: null }, '形の違う値は空');
  ctx.Xp.award('mc', { id: 'a', correct: true });
  const d = ctx.LevelUi.lastDays(3);
  t.eq(d, [{ date: '2026-10-12', xp: 0 }, { date: '2026-10-13', xp: 0 }, { date: T, xp: 10 }], '直近3日(古い順)');
});

test('Badges: レベル(5・10・20・30・50)・今日のチャレンジ(初挑戦・30問)', (t) => {
  const { ctx } = fresh();
  const B = ctx.Badges;
  const row = (id) => B.list().find((b) => b.id === id);
  ['level5', 'level10', 'level20', 'level30', 'level50', 'challengeFirst', 'challenge30'].forEach((id) => t.ok(B.DEFS.some((d) => d.id === id), `${id} がある`));
  t.eq(row('level5').progress, { now: 0, goal: 2400, unit: 'XP' }, 'level5 の進み具合は Lv.5 までの XP');
  setKey(ctx, 'xp', { total: 2399, seeded: true, seen: 4, days: {} });
  t.ok(!row('level5').earnedAt, '2399 XP では取れない');
  setKey(ctx, 'xp', { total: 8100, seeded: true, seen: 10, days: {} });
  t.ok(row('level5').earnedAt && row('level10').earnedAt && !row('level20').earnedAt, '8100 XP で level5・level10');
  t.ok(!row('challengeFirst').earnedAt && !row('challenge30').earnedAt, 'チャレンジなしでは取れない');
  setKey(ctx, 'challenge', { best: 0, days: { [T]: { best: 0, runs: 1 } } });
  t.ok(row('challengeFirst').earnedAt && !row('challenge30').earnedAt, '最後までやれば初挑戦(0問でも)');
  setKey(ctx, 'challenge', { best: 29, days: { [T]: { best: 29, runs: 3 } } });
  t.ok(!row('challenge30').earnedAt, '29問では取れない');
  setKey(ctx, 'challenge', { best: 30, days: { [T]: { best: 30, runs: 4 } } });
  t.ok(row('challenge30').earnedAt, '30問で取れる');
  // Xp がない版(本体の読み込みに失敗したとき)でも落ちない
  const env = load({ today: T });
  const r = env.ctx.Badges.list().find((b) => b.id === 'level5');
  t.eq(r.progress, { now: 0, goal: 2400, unit: 'XP' }, 'Xp がなくても同じ式で進み具合を出す');
});

run();
