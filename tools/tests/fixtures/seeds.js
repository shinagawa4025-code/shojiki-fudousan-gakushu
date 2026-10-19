// ブラウザのテスト用の保存データ(ページの中で実行する関数。アプリのデータとロジックを使って localStorage に書く)
// 使い方: await page.evaluate(seeds.learn, { due: 3 }) のあと、読み込み直す(t.open(hash, { seedFn: seeds.learn, seedArgs }) がまとめて行う)
// どれも決まった値を書く(乱数は種つき)。日付は DateUtil.today() から(テストの端末の日時は既定で 2026-10-14)
// 元: scratchpad r3-r4/seeds.js(light・targetsBoth)・bug-b5/heavyseed.js(heavy を軽く・決まった値に)・r7/E2 shots.js(learn)・r7/E3 seeds.js(rich・close・lifeSeed)
/* global DateUtil, APP_DATA, QuizEngine, Stats, AppIndex, Views, Badges */
'use strict';

// 少しだけ使った利用者(権利の4択5問・○×4文・用語2つ・ショートの模擬試験1回・目標2つ)
function light() {
  const P = 'shojikiLearn.v1.';
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  const today = DateUtil.today();
  const kenriMc = APP_DATA.quiz.filter((q) => QuizEngine.isMcItem(q) && (Stats.categoryOf(q, 'takken') || {}).id === 'kenri').slice(0, 5);
  const qh = {};
  kenriMc.forEach((q, i) => { qh[q.id] = i % 2 ? 'ng' : 'ok'; });
  set('quizHistory', qh);
  const ox = {};
  QuizEngine.allStatements().slice(0, 4).forEach((s, i) => { ox[s.id] = { c: i % 2, w: i % 2 ? 0 : 2, last: today, lastOk: !!(i % 2) }; });
  set('oxStats', ox);
  const t = AppIndex.allTerms.slice(0, 2);
  set('autoQuizStats', { [t[0].id]: { correct: 1, wrong: 2 }, [t[1].id]: { correct: 3, wrong: 0 } });
  const E = Views.exam._internal;
  const s = E.createSession('short', true);
  s.answers = s.questions.map((q, i) => (i % 3 ? q.correctIndex : (q.correctIndex + 1) % q.choices.length));
  set('examHistory', [E.gradeSession(s, s.startedAt + 1200000)]);
  set('activityLog', { [today]: 3, [DateUtil.addDays(today, -1)]: 2, [DateUtil.addDays(today, -5)]: 8 });
  set('examTargets', [
    { id: 'et_a', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: 1 },
    { id: 'et_b', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: '2027-08-05', primary: false, createdAt: 2 },
  ]);
  return { qh: Object.keys(qh).length, ox: Object.keys(ox).length };
}

function targetsBoth() {
  localStorage.setItem('shojikiLearn.v1.examTargets', JSON.stringify([
    { id: 'et_b', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: '2027-08-05', primary: true, createdAt: 2 },
    { id: 'et_a', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: false, createdAt: 1 },
  ]));
}

// たくさん使った利用者(全部の○×・全部の4択・全部の用語・模擬試験8回・400日の学習・ブックマーク120件・受験中の模擬試験)
// bug-b5/heavyseed.js を軽くしたもの(模擬試験は30回 → 8回)。乱数は種つき
function heavy() {
  const P = 'shojikiLearn.v1.';
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  let seed = 20261014;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rnd = (n) => Math.floor(rand() * n);
  const today = DateUtil.today();
  const E = Views.exam._internal;
  const hist = [];
  const now = Date.now();
  for (let k = 0; k < 8; k++) {
    const s = E.createSession(k % 3 === 0 ? 'short' : 'full', true);
    s.answers = s.questions.map((q) => (rand() < 0.55 ? q.correctIndex : (rand() < 0.1 ? null : (q.correctIndex + 1 + rnd(q.choices.length - 1)) % q.choices.length)));
    s.id = `ex_${now - k * 86400000}`;
    s.startedAt = now - k * 86400000 - 3600000;
    hist.push(E.gradeSession(s, s.startedAt + 3000000));
  }
  set('examHistory', hist);
  set('examRetryResult', hist[0]);
  const ox = {};
  QuizEngine.allStatements().forEach((s) => { ox[s.id] = { c: 1 + rnd(5), w: rnd(4), last: DateUtil.addDays(today, -rnd(200)), lastOk: rand() < 0.6 }; });
  set('oxStats', ox);
  const qh = {};
  APP_DATA.quiz.forEach((q) => { qh[q.id] = rand() < 0.6 ? 'ok' : 'ng'; });
  set('quizHistory', qh);
  const cards = {};
  AppIndex.allTerms.forEach((t) => { cards[t.id] = { ease: 2.1 + rand(), interval: rnd(120), reps: rnd(8), dueDate: DateUtil.addDays(today, rnd(60) - 10), lastGrade: 1 + rnd(4) }; });
  set('srsCards', cards);
  set('srsMigrated', true);
  const auto = {};
  AppIndex.allTerms.forEach((t) => { auto[t.id] = { wrong: rnd(6), correct: rnd(10) }; });
  set('autoQuizStats', auto);
  const known = {};
  AppIndex.allTerms.forEach((t) => { if (rand() < 0.5) known[t.id] = true; });
  set('flashcards', known);
  const log = {};
  for (let i = 0; i < 400; i++) log[DateUtil.addDays(today, -i)] = 1 + rnd(80);
  set('activityLog', log);
  const bp = {};
  AppIndex.allTerms.forEach((t) => { if (t.source === 'general') bp[t.id] = { learned: rand() < 0.7 }; });
  set('basicsProgress', bp);
  const bm = {};
  AppIndex.allTerms.slice(0, 60).forEach((t, i) => { bm[`term:${t.id}`] = now - i * 1000; });
  APP_DATA.quiz.slice(0, 60).forEach((q, i) => { bm[`quiz:${q.id}`] = now - i * 1000; });
  set('bookmarks', bm);
  set('examTargets', [{ id: 'et_1', name: '税理士試験', examTypeId: 'zeirishi', date: '2027-08-03', primary: true, createdAt: 1 }]);
  set('examSession', E.createSession('full', false));
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); total += k.length + localStorage.getItem(k).length; }
  return { total, statements: Object.keys(ox).length, quiz: APP_DATA.quiz.length };
}

// 学習の画面(トピック・用語集・復習・ブックマーク)用: 業法の基礎知識6つ・権利3つを学習済み、用語12語を記憶済み、
// ブックマーク(用語3・問題2)、今日の復習 opts.due 枚(既定4)+あとの6枚、宅建士の目標
function learn(opts) {
  const P = 'shojikiLearn.v1.';
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  const today = DateUtil.today();
  const y = DateUtil.addDays(today, -1);
  set('examTargets', [{ id: 'et_a', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: 1 }]);
  const orderK = (AppIndex.topicBasicOrder && AppIndex.topicBasicOrder.topicK) || AppIndex.topicsById.topicK.basicIds;
  const orderL = (AppIndex.topicBasicOrder && AppIndex.topicBasicOrder.topicL) || AppIndex.topicsById.topicL.basicIds;
  const bp = {};
  orderK.slice(0, 6).forEach((id) => { bp[id] = { learned: true, learnedAt: y }; });
  orderL.slice(0, 3).forEach((id) => { bp[id] = { learned: true, learnedAt: y }; });
  set('basicsProgress', bp);
  const terms = AppIndex.allTerms.filter((t) => t.worksOnly !== true);
  const known = {};
  terms.slice(0, 12).forEach((t) => { known[t.id] = true; });
  set('flashcards', known);
  const bm = {};
  terms.slice(3, 6).forEach((t, i) => { bm[`term:${t.id}`] = 1000 + i; });
  APP_DATA.quiz.slice(0, 2).forEach((q, i) => { bm[`quiz:${q.id}`] = 2000 + i; });
  set('bookmarks', bm);
  const cards = {};
  const dueN = opts && opts.due != null ? opts.due : 4;
  terms.slice(20, 20 + dueN).forEach((t) => { cards[t.id] = { ease: 2.5, interval: 3, reps: 2, dueDate: y, lastGrade: 3 }; });
  terms.slice(40, 46).forEach((t) => { cards[t.id] = { ease: 2.5, interval: 4, reps: 2, dueDate: DateUtil.addDays(today, 2), lastGrade: 3 }; });
  set('srsCards', cards);
  set('srsMigrated', true);
  set('seenReviewTip', true);
  if (opts && opts.newLimit != null) set('reviewNewLimit', opts.newLimit);
  set('activityLog', { [today]: 2, [y]: 3 });
  return { known: Object.keys(known).length, bm: Object.keys(bm).length, cards: Object.keys(cards).length };
}

// 進捗・計画の画面用: 模擬試験6回・4択と○×の記録・用語・84日の学習・日付つきの回答20日・学習時間・目標の達成・目標2つ(宅建は見込み)
function rich() {
  const P = 'shojikiLearn.v1.';
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  let s = 12345;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (n) => Math.floor(rnd() * n);
  const today = DateUtil.today();
  const E = Views.exam._internal;
  const hist = [];
  for (let k = 0; k < 6; k++) {
    const sess = E.createSession(k % 2 ? 'short' : 'full', true);
    const p = 0.5 + k * 0.04;
    sess.answers = sess.questions.map((q) => (rnd() < p ? q.correctIndex : (q.correctIndex + 1) % q.choices.length));
    const t0 = new Date(`${DateUtil.addDays(today, -(6 - k) * 9)}T10:00:00`).getTime();
    sess.id = `ex_${t0}`;
    sess.startedAt = t0;
    hist.push(E.gradeSession(sess, t0 + 3000000));
  }
  set('examHistory', hist);
  const qh = {};
  APP_DATA.quiz.forEach((q, i) => { if (i % 3 === 0) qh[q.id] = rnd() < 0.62 ? 'ok' : 'ng'; });
  set('quizHistory', qh);
  const ox = {};
  QuizEngine.allStatements().forEach((st, i) => { if (i % 4 === 0) ox[st.id] = { c: 1 + ri(4), w: ri(3), last: DateUtil.addDays(today, -ri(40)), lastOk: rnd() < 0.65 }; });
  set('oxStats', ox);
  const cards = {};
  AppIndex.allTerms.forEach((t, i) => { if (i % 2 === 0) cards[t.id] = { ease: 2.3, interval: [1, 3, 9, 15, 30, 60][i % 6], reps: 1 + (i % 6), dueDate: DateUtil.addDays(today, (i % 9) - 2), lastGrade: 3 }; });
  set('srsCards', cards);
  set('srsMigrated', true);
  const known = {};
  AppIndex.allTerms.forEach((t, i) => { if (i % 3 === 0) known[t.id] = true; });
  set('flashcards', known);
  const bp = {};
  AppIndex.allTerms.forEach((t, i) => { if (t.source === 'general' && i % 2 === 0) bp[t.id] = { learned: true }; });
  set('basicsProgress', bp);
  const log = {};
  for (let i = 0; i < 84; i++) { if (i % 5 !== 3 && i % 7 !== 6) log[DateUtil.addDays(today, -i)] = 1 + ((i * 7) % 40); }
  set('activityLog', log);
  const ad = {};
  for (let i = 0; i < 20; i++) ad[DateUtil.addDays(today, -i)] = { gyoho: [6 + (i % 4), 1, 2 + (i % 3)], kenri: [3 + (i % 3), 1, 3], horei: [2, 0, 2 + (i % 2)], zei: [1, 0, 1], menjo: [1, 0, i % 2] };
  set('answerDaily', ad);
  const stt = {};
  [1500, 0, 2400, 900, 3300, 1200, 600].forEach((sec, i) => { if (sec) stt[DateUtil.addDays(today, -6 + i)] = sec; });
  for (let i = 7; i < 60; i++) if (i % 3) stt[DateUtil.addDays(today, -i)] = 900 + (i * 37) % 1800;
  set('studyTime', stt);
  const g = {};
  for (let i = 1; i < 12; i++) g[DateUtil.addDays(today, -i)] = true;
  set('goalDays', g);
  set('examTargets', [
    { id: 'et_a', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: 1, tentative: true },
    { id: 'et_b', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: '2027-08-05', primary: false, createdAt: 2 },
  ]);
  set('learnerProfile', { goal: 'takken', interests: [], at: 1 });
  try { if (window.Badges && Badges.check) Badges.check(); } catch (e) { /* 古い版 */ }
  return { ok: true };
}

// 試験の直前(2026-10-18 の試験。今日は 2026-10-14〜17 で使う)
function close() {
  const P = 'shojikiLearn.v1.';
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  const today = DateUtil.today();
  set('activityLog', { [today]: 3, [DateUtil.addDays(today, -1)]: 2, [DateUtil.addDays(today, -2)]: 4 });
  set('examTargets', [{ id: 'et_c', name: '宅建士試験', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: 1 }]);
  set('learnerProfile', { goal: 'takken', interests: [], at: 1 });
  return { ok: true };
}

// 暮らしの目的の利用者(試験なし)
function lifeSeed() {
  const P = 'shojikiLearn.v1.';
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  const today = DateUtil.today();
  set('learnerProfile', { goal: 'life', interests: ['rent', 'buy'], at: 1 });
  const known = {};
  AppIndex.allTerms.forEach((t, i) => { if (i % 4 === 0) known[t.id] = true; });
  set('flashcards', known);
  set('activityLog', { [today]: 3, [DateUtil.addDays(today, -1)]: 2, [DateUtil.addDays(today, -5)]: 8 });
  return { ok: true };
}

module.exports = { light, targetsBoth, heavy, learn, rich, close, lifeSeed };
