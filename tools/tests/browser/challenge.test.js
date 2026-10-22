// 今日のチャレンジ(ブラウザ): はじめの画面(ルール・ベスト・出題する文の切り替え)・出題(残り時間のバー・正解の数・キー操作・タップ)・
// 時間切れの結果(正解の数・経験値とボーナス・間違えた文と元の4択へのリンク・記録)・2回目はボーナスなし・途中で終了・画面を移ったら捨てる・
// 320px とダーク・PC。時間はテスト用に短くする(Views.challenge._internal.setDuration)
'use strict';
const B = require('../lib/browser.js');

const T = '2026-10-14';
const BADGES = { seeded: true, at: { first: '2026-10-01', challengeFirst: '2026-10-01', challenge30: '2026-10-01' } };
const SEED = { learnerProfile: { goal: 'takken', interests: [], at: 1 }, badges: BADGES, dailyGoal: { kind: 'actions', value: 200 }, xp: { total: 0, seeded: true, seen: 1, days: {} } };

const START = () => {
  const v = document.querySelector('.ch-view');
  if (!v || !v.querySelector('[data-role="start"]')) return null;
  return {
    h2: (v.querySelector('h2') || {}).textContent, pressed: Array.from(v.querySelectorAll('[data-pool]')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.pool),
    note: v.querySelector('[data-role="pool-note"]').textContent, bests: Array.from(v.querySelectorAll('.ch-best')).map((b) => b.textContent.replace(/\s+/g, '')),
    disabled: v.querySelector('[data-role="start"]').disabled,
  };
};
const start = async (p, ms) => {
  await p.evaluate((d) => Views.challenge._internal.setDuration(d), ms);
  await p.click('[data-role="start"]');
  return p.waitFor(() => !!document.querySelector('.ch-view.is-run .ox-btn') && !!Views.challenge._internal.getRun());
};
// 答える(right: 正しく答えるか。how: 'click' | 'key')
const answer = async (p, right, how) => {
  await p.waitFor(() => { const r = Views.challenge._internal.getRun(); return r && !r.lock; });
  const truth = await p.evaluate(() => { const r = Views.challenge._internal.getRun(); return r.items[r.i].truth; });
  const o = right ? truth : !truth;
  if (how === 'key') await p.press(o ? 'o' : 'x');
  else await p.click(`.ox-btn[data-answer="${o ? 'o' : 'x'}"]`);
  await p.waitFor((n) => { const r = Views.challenge._internal.getRun(); return !r || r.answers.length >= n; }, {}, 1);
};

B.test('はじめの画面 → 出題(タップ)→ 時間切れの結果・記録・経験値(ボーナス +30)→ もう一度(ボーナスなし)', async (t) => {
  const p = await t.open('challenge', { seed: SEED });
  const s0 = await p.waitFor(START);
  t.ok(s0 && s0.h2 === '今日のチャレンジ' && s0.pressed.join() === 'takken' && /宅建士試験の○×\([\d,]+文\)から出題/.test(s0.note) && !s0.disabled, '学ぶ目的(宅建士)の文から出題', s0);
  t.ok(s0.bests[0].includes('まだ挑戦していません') && s0.bests[1].includes('最初の記録をつくろう'), 'ベストはまだなし', s0.bests);
  t.ok(await start(p, 6000), 'スタートで出題が始まる');
  const run0 = await p.evaluate(() => {
    const r = Views.challenge._internal.getRun();
    const ae = document.activeElement;
    return { n: r.items.length, takken: r.items.every((s) => s.cats.some((c) => ['gyoho', 'kenri', 'horei', 'zei', 'menjo'].includes(c))), time: document.querySelector('[data-role="time"]').textContent, role: document.querySelector('[data-role="time"]').getAttribute('role'), focus: ae && ae.dataset.role, busy: Motion.busy(true), quit: document.querySelector('[data-role="quit"]').getAttribute('aria-label') };
  });
  t.ok(run0.n > 50 && run0.takken && /^0:0[56]$/.test(run0.time) && run0.role === 'timer' && run0.focus === 'statement' && run0.busy && run0.quit === '終了する', '出題中: 宅建士の文・残り時間・文にフォーカス・ほかの知らせは待つ', run0);
  await answer(p, true);
  const sc = await p.waitFor(() => document.querySelector('[data-role="score"] b').textContent === '1' && { ok: !!document.querySelector('.ox-btn.is-answer'), live: document.querySelector('[data-role="live"]').textContent });
  t.ok(sc && sc.ok, '正解の数が増え、正解のボタンに印', sc);
  await answer(p, false);
  await answer(p, true);
  const res = await p.waitFor(() => {
    const el = document.querySelector('[data-role="result"]');
    return el && { title: el.querySelector('#ch-result-title').textContent, score: el.querySelector('.big-num').textContent, gained: el.querySelector('[data-role="gained"]').textContent, bonus: /ボーナス \+30/.test(el.textContent), focus: document.activeElement && document.activeElement.id, wrong: document.querySelectorAll('[data-role="wrong-list"] li').length, links: Array.from(document.querySelectorAll('[data-role="wrong-list"] a')).map((a) => a.getAttribute('href')), stats: el.querySelector('.ch-result-stats').textContent.replace(/\s+/g, ''), run: !!document.querySelector('.ch-view.is-run') };
  }, { timeout: 15000 });
  t.ok(res && res.title === 'はじめての記録!' && res.score === '2' && res.gained === '+34 XP' && res.bonus && res.focus === 'ch-result-title' && !res.run, '時間切れ: 2問正解・+34 XP(ボーナス +30)・見出しにフォーカス', res);
  t.ok(res.wrong === 1 && res.links.length === 1 && /^#quiz\/q\/quiz-/.test(res.links[0]) && /今日のベスト2問/.test(res.stats) && /自己ベスト2問/.test(res.stats), '間違えた文と元の4択へのリンク・ベスト', res);
  const st = await p.storage(['challenge', 'xp', 'activityLog']);
  t.ok(st.challenge.best === 2 && st.challenge.days[T].runs === 1 && st.challenge.days[T].best === 2 && st.xp.total === 34 && st.xp.ch === T && st.activityLog[T] === 3, '記録(ベスト・回数)・経験値・学習の回数(3問)', st);
  // もう一度: ボーナスなし。同じ日に同じ文へ正解したら 1XP
  await p.click('[data-role="again"]');
  t.ok(await p.waitFor(() => !!Views.challenge._internal.getRun()), 'もう一度');
  await answer(p, true);
  const r2 = await p.waitFor(() => { const el = document.querySelector('[data-role="result"]'); return el && { gained: el.querySelector('[data-role="gained"]').textContent, bonus: /ボーナス/.test(el.textContent), all: !!el.parentNode.querySelector('.ox-all-correct'), title: el.querySelector('#ch-result-title').textContent }; }, { timeout: 15000 });
  t.ok(r2 && /^\+[12] XP$/.test(r2.gained) && !r2.bonus && r2.all && r2.title === 'タイムアップ!', '2回目: ボーナスなし・全問正解・ベストに届かなければ「タイムアップ!」', r2);
  const c2 = await p.get('challenge');
  t.ok(c2.days[T].runs === 2 && c2.best === 2, '2回目も回数に入る(ベストはそのまま)', c2);
  // ホームの札に今日のベスト
  await p.go('home');
  t.ok(await p.waitFor(() => /今日のベスト 2問/.test((document.querySelector('[data-role="level"] .xp-ch') || {}).textContent || '')), 'ホームに今日のベスト');
});

B.test('キー操作(PC)・途中で終了(ベストに入れない)・画面を移ったら捨てる・出題する文の切り替え(税理士)', async (t) => {
  const p = await t.open('challenge', { device: 'desktop', seed: SEED });
  await p.waitFor(START);
  t.ok(await start(p, 60000), 'スタート');
  await answer(p, true, 'key');
  await answer(p, false, 'key');
  await p.waitFor(() => !Views.challenge._internal.getRun().lock);
  await p.press('ArrowLeft');
  t.eq(await p.evaluate(() => Views.challenge._internal.getRun().answers.length), 3, '← でも答えられる');
  await p.click('[data-role="quit"]');
  const q = await p.waitFor(() => { const el = document.querySelector('[data-role="result"]'); return el && { title: el.querySelector('#ch-result-title').textContent, note: /ベストと回数に入りません/.test(el.parentNode.textContent), bonus: /ボーナス/.test(el.textContent) }; });
  t.ok(q && q.title === '途中で終了しました' && q.note && !q.bonus, '途中で終了: ベストと回数に入れない・ボーナスなし', q);
  const c = await p.get('challenge');
  t.ok(!c || !c.days || !c.days[T], '途中で終了した回は記録しない', c);
  // 画面を移ったら捨てる
  await p.click('[data-role="again"]');
  await p.waitFor(() => !!Views.challenge._internal.getRun());
  await answer(p, true, 'key');
  const xp0 = (await p.get('xp')).total;
  await p.go('home');
  await new Promise((r) => setTimeout(r, 400));
  t.ok(await p.evaluate(() => !Views.challenge._internal.getRun()), '画面を移ったら回を捨てる(時間も止まる)');
  t.eq((await p.get('xp')).total, xp0, '捨てた回の経験値は付けない');
  // 出題する文の切り替え
  await p.go('challenge');
  await p.waitFor(START);
  await p.click('[data-pool="zeirishi"]');
  const z = await p.waitFor(() => { const s = document.querySelector('[data-pool="zeirishi"]'); return s.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-role="pool-note"]').textContent; });
  t.ok(z && /税理士試験\(消費税法\)の○×/.test(z), '税理士(消費税法)に切り替え', z);
  t.eq((await p.get('challenge')).pool, 'zeirishi', '選んだ文の範囲を残す');
  await start(p, 60000);
  const zi = await p.evaluate(() => Views.challenge._internal.getRun().items.slice(0, 40).every((s) => s.cats.some((c) => c === 'shohi' || c === 'shohiho')));
  t.ok(zi, '税理士の文から出題');
  await p.click('[data-role="quit"]');
  await p.waitFor(() => !!document.querySelector('[data-role="result"]'));
});

B.test('320px ダーク・タブレット・PC: はじめの画面・出題中・結果ではみ出しなし、押せる部品は44px以上', async (t) => {
  for (const [device, dark] of [['w320', true], ['tablet', false], ['desktop', false]]) {
    const tag = `${device}${dark ? ' dark' : ''}`;
    const p = await t.open('challenge', { device, dark, seed: SEED });
    await p.waitFor(START);
    const small = () => Array.from(document.querySelectorAll('.ch-view button, .ch-view a')).filter((e) => e.getClientRects().length && !e.closest('p')).map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }).filter((x) => x < 43.5);
    t.eq(await p.evaluate(small), [], `${tag}: はじめの画面の押せる部品は44px以上`);
    t.ok(!(await p.overflow()), `${tag}: はじめの画面ではみ出しなし`);
    await start(p, 4000);
    t.ok(!(await p.overflow()), `${tag}: 出題中ではみ出しなし`);
    t.eq(await p.evaluate(small), [], `${tag}: 出題中の押せる部品は44px以上`);
    await answer(p, false);
    await p.waitFor(() => !!document.querySelector('[data-role="result"]'), { timeout: 15000 });
    t.ok(!(await p.overflow()), `${tag}: 結果ではみ出しなし`);
    await p.close();
  }
});

B.run();
