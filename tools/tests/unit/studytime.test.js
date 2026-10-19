// 学習時間(StudyTime, Node・偽物の時計とタイマー): 操作のない時間・非表示・別のウィンドウ・bfcache・端末のスリープ・
// 0時の境目・時計の変更・容量不足・2つのタブ・書き込みの間隔・古い記録の整理
// 元: scratchpad audit7/T3 t2_studytime.js
'use strict';
const { test, run } = require('../lib/harness.js');
const { load, setKey, getKey, makeStore } = require('../lib/node.js');

const S = 1000;
const MIN = 60 * S;

function boot(opts) {
  const env = load(opts || {});
  env.ctx.location.hash = (opts && opts.hash) || '#home';
  if (env.ctx.StudyTime._internal && env.ctx.StudyTime._internal.setNow) env.ctx.StudyTime._internal.setNow(() => env.clock.t);
  env.ctx.StudyTime.start();
  return env;
}
const total = (env) => { env.ctx.StudyTime._internal.flush(); return env.ctx.StudyTime.totalSeconds(); };
const sum = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
// every ms ごとにタップしながら dur ms
function active(env, dur, every) {
  const step = every || 10 * S;
  for (let el = 0; el < dur; el += step) {
    env.clock.advance(Math.min(step, dur - el));
    env.fireWin('pointerdown', { type: 'pointerdown' });
  }
}

test('操作している時間・操作のない時間(90秒まで)・模擬試験の受験中(5分まで)', (t) => {
  let env = boot();
  active(env, 5 * MIN);
  t.near(total(env), 300, 15, '5分タップし続ける → 約300秒');
  env = boot();
  env.fireWin('pointerdown', { type: 'pointerdown' });
  env.clock.advance(10 * MIN);
  t.near(total(env), 90, 15, '1回タップして10分放置 → 約90秒');
  env = boot({ hash: '#exam/run' });
  env.fireWin('pointerdown', { type: 'pointerdown' });
  env.clock.advance(4 * MIN);
  t.near(total(env), 240, 15, '模擬試験の受験中は操作なしの4分も数える');
  env.clock.advance(10 * MIN);
  t.near(total(env), 300, 15, '…ただし5分まで');
});

test('数えない画面(設定)・非表示・最初から非表示', (t) => {
  let env = boot({ hash: '#settings' });
  active(env, 3 * MIN);
  t.eq(total(env), 0, '設定は数えない');
  env.ctx.location.hash = '#quiz';
  env.fireWin('hashchange');
  active(env, 2 * MIN);
  t.near(total(env), 120, 15, '設定から4択へ移れば数える');
  env = boot();
  active(env, 2 * MIN);
  env.doc.visibilityState = 'hidden';
  env.doc.fire('visibilitychange');
  env.clock.advance(30 * MIN);
  env.doc.visibilityState = 'visible';
  env.doc.fire('visibilitychange');
  active(env, 1 * MIN);
  t.near(total(env), 180, 15, '非表示の30分は数えない');
  env = boot({ hidden: true });
  env.clock.advance(5 * MIN);
  t.eq(total(env), 0, '裏のタブで開いた間は数えない');
  env.doc.visibilityState = 'visible';
  env.doc.fire('visibilitychange');
  active(env, 1 * MIN);
  t.near(total(env), 60, 15, '表示されてから数える');
});

test('bfcache・端末のスリープ(タイマーが止まる)・別のウィンドウ', (t) => {
  let env = boot();
  active(env, 1 * MIN);
  env.fireWin('pagehide', { type: 'pagehide', persisted: true });
  env.clock.frozen = true;
  env.clock.advance(20 * MIN);
  env.clock.frozen = false;
  env.fireWin('pageshow', { type: 'pageshow', persisted: true });
  env.clock.advance(14 * S);
  t.ok(total(env) <= 75, 'bfcache にいた20分は数えない', total(env));
  env = boot();
  active(env, 1 * MIN);
  env.clock.frozen = true;
  env.clock.advance(15 * MIN);
  env.clock.frozen = false;
  env.clock.advance(1 * S);
  t.ok(total(env) <= 95, 'スリープの15分は上限の30秒まで', total(env));
  env = boot();
  active(env, 1 * MIN);
  env.doc._focus = false;
  env.fireWin('blur');
  env.clock.advance(5 * MIN);
  env.fireWin('wheel', { type: 'wheel' });
  env.clock.advance(1 * MIN);
  t.near(total(env), 60, 15, '別のウィンドウにいる間は数えない(ホイールでは戻らない)');
  env.fireWin('pointerdown', { type: 'pointerdown' });
  active(env, 1 * MIN);
  t.near(total(env), 120, 15, 'タップすればまた数える');
});

test('2つのタブで二重に数えない・閉じたら残りのタブが引き継ぐ', (t) => {
  const store = makeStore();
  const a = boot({ store });
  const b = boot({ store });
  b.clock.t = a.clock.t;
  for (let i = 0; i < 30; i++) {
    a.clock.advance(10 * S); b.clock.advance(10 * S);
    a.fireWin('pointerdown', { type: 'pointerdown' }); b.fireWin('pointerdown', { type: 'pointerdown' });
  }
  a.ctx.StudyTime._internal.flush(); b.ctx.StudyTime._internal.flush();
  const s1 = sum(getKey(a.ctx, 'studyTime'));
  t.ok(s1 <= 320, '2つのタブで5分 → 二重に数えない', s1);
  a.fireWin('pagehide', { type: 'pagehide' });
  for (let i = 0; i < 6; i++) { b.clock.advance(10 * S); b.fireWin('pointerdown', { type: 'pointerdown' }); }
  b.ctx.StudyTime._internal.flush();
  t.near(sum(getKey(b.ctx, 'studyTime')) - s1, 60, 16, '閉じたら(pagehide)残りのタブがすぐ引き継ぐ');
});

test('0時の境目・時計の変更', (t) => {
  let env = boot({ now: new Date(2026, 9, 14, 23, 58, 0).getTime() });
  active(env, 5 * MIN);
  env.ctx.StudyTime._internal.flush();
  const st = getKey(env.ctx, 'studyTime');
  t.near(st['2026-10-14'] || 0, 120, 16, '0時より前 → 10/14');
  t.near(st['2026-10-15'] || 0, 180, 16, '0時より後 → 10/15');
  t.eq(env.ctx.StudyTime.lastNDays(2).map((d) => d.date), ['2026-10-14', '2026-10-15'], 'lastNDays は古い順');
  env = boot();
  active(env, 1 * MIN);
  env.clock.t -= 60 * MIN;
  env.clock.timers.forEach((x) => { x.at -= 60 * MIN; });
  env.clock.advance(30 * MIN);
  t.ok(total(env) <= 160, '時計を1時間戻したあとの操作のない時間は数えない', total(env));
  env = boot();
  active(env, 1 * MIN);
  env.clock.t -= 60 * MIN;
  env.clock.timers.forEach((x) => { x.at -= 60 * MIN; });
  active(env, 2 * MIN);
  t.ok(sum(getKey(env.ctx, 'studyTime')) >= 150, '時計を戻しても30秒ごとの保存は続く(1時間待たない)', getKey(env.ctx, 'studyTime'));
  env = boot();
  active(env, 1 * MIN);
  env.clock.t += 24 * 60 * MIN;
  env.clock.timers.forEach((x) => { x.at += 24 * 60 * MIN; });
  active(env, 1 * MIN);
  t.ok(total(env) <= 150, '時計が1日進んでも足すのは上限まで', total(env));
});

test('容量不足: 保存できない間も今日の時間に入る・整理のあとに二重に数えない・空いたら失わない', (t) => {
  {
    const store = makeStore();
    const env = boot({ store });
    active(env, 1 * MIN);
    const base = sum(getKey(env.ctx, 'studyTime'));
    store.quotaChars = 1;
    active(env, 5 * MIN);
    t.ok(env.ctx.Storage.isWriteFailing(), '書き込みが失敗している');
    t.near(env.ctx.StudyTime.todaySeconds(), base + 300, 20, '保存できない分も今日の時間に入る');
  }
  {
    const store = makeStore();
    const env = boot({ store });
    active(env, 1 * MIN);
    const base = sum(getKey(env.ctx, 'studyTime'));
    let lastAttempt = null;
    const origSet = store.setItem;
    store.setItem = function (k, v) { if (k.endsWith('.studyTime')) lastAttempt = v; return origSet.call(store, k, v); };
    store.quotaChars = 1;
    active(env, 5 * MIN);
    store.quotaChars = Infinity;
    // 「古い記録を整理」: Storage が失敗した値を書き直す
    store._data['shojikiLearn.v1.studyTime'] = lastAttempt;
    active(env, 1 * MIN);
    env.ctx.StudyTime._internal.flush();
    t.near(sum(getKey(env.ctx, 'studyTime')), base + 360, 25, '整理で書き直したあとも二重に数えない');
  }
  {
    const store = makeStore();
    const env = boot({ store });
    active(env, 1 * MIN);
    const base = sum(getKey(env.ctx, 'studyTime'));
    store.quotaChars = 1;
    active(env, 5 * MIN);
    store.quotaChars = Infinity;
    active(env, 1 * MIN);
    env.ctx.StudyTime._internal.flush();
    t.near(sum(getKey(env.ctx, 'studyTime')), base + 360, 25, 'ほかの方法で空いたときも失わない');
  }
});

test('書き込みの間隔(ロック25秒・時間30秒)・古い記録の整理と未来の日', (t) => {
  const store = makeStore();
  let lockWrites = 0;
  let timeWrites = 0;
  const origSet = store.setItem;
  store.setItem = function (k, v) { if (k.endsWith('studyTimeLock')) lockWrites += 1; if (k.endsWith('.studyTime')) timeWrites += 1; return origSet.call(store, k, v); };
  const env = boot({ store });
  active(env, 10 * MIN, 2 * S);
  t.ok(lockWrites <= 10 * 60 / 25 + 2, 'ロックの書き込みは25秒に1回まで', lockWrites);
  t.ok(timeWrites <= 10 * 60 / 30 + 2, '時間の書き込みは30秒に1回まで', timeWrites);
  const e2 = boot();
  setKey(e2.ctx, 'studyTime', { '2025-09-01': 100, '2025-09-09': 50, '2026-10-20': 500, bad: 5, '2026-10-13': 'x' });
  active(e2, 1 * MIN);
  const st = getKey(e2.ctx, 'studyTime');
  t.ok(!st['2025-09-01'] && st['2025-09-09'] === 50 && st['2026-10-20'] === 500 && !st.bad, '400日より古い日を捨て、未来の日は残す', st);
  t.near(e2.ctx.StudyTime.totalSeconds(), 50 + 60, 15, '未来の日は合計に入れない');
});

run();
