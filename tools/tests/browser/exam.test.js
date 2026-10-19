// 模擬試験(ブラウザ): メニュー(試験の長さの札・配分)・受験中は正誤を出さない・見直し(金色)・問題一覧・提出 → 結果
// (目安ライン到達で紙吹雪・元気な顔、届かなければ考える顔)・解き直しの結果・開き直したとき・動きを減らす設定
// 元: scratchpad r7/E1 t_e1_exam.js
'use strict';
const B = require('../lib/browser.js');

const submit = async (p) => {
  await p.waitForSelector('[data-role="submit"]');
  await p.evaluate(() => document.querySelector('[data-role="submit"]').click());
  await p.waitForSelector('[data-role="do-submit"]');
  await p.evaluate(() => document.querySelector('[data-role="do-submit"]').click());
  await p.waitFor(() => /#exam\/result\//.test(location.hash) && !!document.querySelector('.exam-result-hero'));
};
// 受験中の回答を書き換えてから受験の画面を開き直す
const setAnswers = async (p, how) => {
  await p.go('exam');
  await p.evaluate((h) => { const s = JSON.parse(localStorage.getItem('shojikiLearn.v1.examSession')); s.answers = s.questions.map((q, i) => (h === 'all' || i < 5 ? q.correctIndex : (q.correctIndex + 1) % 4)); localStorage.setItem('shojikiLearn.v1.examSession', JSON.stringify(s)); }, how);
  await p.go('exam/run');
};

B.test('メニュー → 受験中(正誤・紙吹雪なし)→ 見直し・問題一覧 → 全問正解で提出(紙吹雪・元気な顔)→ 開き直すと紙吹雪なし', async (t) => {
  for (const device of ['iphone', 'desktop']) {
    const p = await t.open('exam', { device });
    let m = await p.evaluate(() => ({
      tiles: Array.from(document.querySelectorAll('.exam-format')).map((x) => ({ mode: x.dataset.mode, p: x.getAttribute('aria-pressed'), name: x.textContent.replace(/\s+/g, ' ').trim(), h: Math.round(x.getBoundingClientRect().height) })),
      alloc: document.querySelectorAll('.exam-alloc-seg').length,
      stickers: Array.from(document.querySelectorAll('.exam-breakdown-list .sticker')).map((x) => (x.className.match(/cat-\w+/) || [''])[0]),
      start: Math.round(document.querySelector('[data-role="start"]').getBoundingClientRect().height),
    }));
    t.ok(m.tiles.length === 2 && m.tiles[0].p === 'true' && /フル 50問・120分/.test(m.tiles[0].name) && /ショート 20問・48分/.test(m.tiles[1].name) && m.tiles.every((x) => x.h >= 44) && m.alloc === 5 && m.stickers.length === 5 && m.stickers.every(Boolean) && m.start >= 56, `${device}: 試験の長さの札・配分・開始ボタン`, m);
    t.ok(!(await p.overflow()), `${device}: メニューははみ出さない`);
    await p.evaluate(() => document.querySelector('[data-mode="short"]').click());
    t.eq(await p.evaluate(() => Array.from(document.querySelectorAll('.exam-format')).map((x) => x.getAttribute('aria-pressed')).join()), 'false,true', `${device}: ショートを選ぶ`);
    await p.evaluate(() => document.querySelector('[data-role="start"]').click());
    await p.waitFor(() => !!document.querySelector('.exam-q-card .exam-choice'));
    const s0 = await p.get('examSession');
    t.ok(s0 && s0.mode === 'short' && s0.questions.length === 20, `${device}: ショート20問で始まる`, s0 && s0.mode);
    await p.evaluate((c) => document.querySelector(`.exam-q-card [data-choice="${c}"]`).click(), s0.questions[0].correctIndex);
    await p.waitFor(() => !!document.querySelector('.exam-choice.is-selected'));
    await p.settle();
    let r = await p.evaluate(() => ({
      sel: Array.from(document.querySelectorAll('.exam-q-card .exam-choice')).filter((x) => x.classList.contains('is-selected') && x.getAttribute('aria-pressed') === 'true').length,
      fb: document.querySelectorAll('.exam-q-card .correct, .exam-q-card .incorrect, .quiz-feedback, .exam-mark').length,
      confetti: document.querySelectorAll('.confetti').length,
      sizes: Array.from(document.querySelectorAll('.exam-q-card .exam-choice, .exam-pager .btn, .exam-topbar .btn')).filter((x) => x.offsetParent).map((x) => Math.round(Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width))),
      lip: getComputedStyle(document.querySelector('.exam-choice.is-selected')).boxShadow,
    }));
    t.ok(r.sel === 1 && r.fb === 0 && r.confetti === 0 && r.sizes.every((x) => x >= 44) && /px/.test(r.lip), `${device}: 選んでも正誤・紙吹雪は出ない・押せる大きさ44px以上`, r);
    t.ok(!(await p.overflow()), `${device}: 受験中ははみ出さない`);
    await p.evaluate(() => document.querySelector('[data-role="flag"]').click());
    r = await p.evaluate(() => { const f = document.querySelector('[data-role="flag"]'); return { on: f.classList.contains('is-on'), pressed: f.getAttribute('aria-pressed') }; });
    t.ok(r.on && r.pressed === 'true', `${device}: 見直しの印`, r);
    const desk = await p.evaluate(() => !!document.querySelector('.exam-side').offsetParent);
    if (!desk) { await p.evaluate(() => document.querySelector('[data-role="open-nav"]').click()); await p.waitForSelector('.sheet .exam-nav-cell'); await p.settle(); }
    r = await p.evaluate((d) => {
      const root = d ? document.querySelector('.exam-side') : document.querySelector('.sheet');
      const cells = Array.from(root.querySelectorAll('.exam-nav-cell'));
      return { n: cells.length, min: Math.min(...cells.map((c) => Math.round(Math.min(c.getBoundingClientRect().height, c.getBoundingClientRect().width)))), ans: cells.filter((c) => c.classList.contains('is-answered')).length, flag: cells.filter((c) => c.classList.contains('is-flagged')).length, dot: getComputedStyle(cells.find((c) => c.classList.contains('is-flagged')), '::after').content };
    }, desk);
    t.ok(r.n === 20 && r.min >= 44 && r.ans === 1 && r.flag === 1 && r.dot !== 'none', `${device}: 問題一覧(${desk ? '右側' : 'シート'})の番号は44px以上・回答済みと見直しの印`, r);
    if (!desk) { await p.press('Escape'); await p.waitFor(() => !document.querySelector('.sheet')); }
    await setAnswers(p, 'all');
    await submit(p);
    r = await p.evaluate(() => ({
      confetti: document.querySelectorAll('.confetti .confetti-bit').length, cheer: !!document.querySelector('.exam-result-hero.is-pass svg.mascot.mascot-cheer'),
      verdict: document.querySelector('.exam-verdict').textContent.trim(),
      cats: Array.from(document.querySelectorAll('.exam-cat-row')).map((x) => (x.className.match(/(^| )cat-(gyoho|kenri|horei|zei|menjo|life)( |$)/) || [''])[0]),
    }));
    t.ok(r.confetti > 0 && r.confetti <= 40 && r.cheer && /目安ライン到達/.test(r.verdict) && r.cats.length >= 4 && r.cats.every(Boolean), `${device}: 合格の目安に届いた結果(紙吹雪・元気な顔・分野の色)`, r);
    t.ok(!(await p.overflow()), `${device}: 結果ははみ出さない`);
    await p.waitFor(() => !document.querySelector('.confetti'), { timeout: 4000 });
    await p.reload();
    r = await p.evaluate(() => ({ confetti: document.querySelectorAll('.confetti').length, hero: !!document.querySelector('.exam-result-hero') }));
    t.ok(r.hero && r.confetti === 0, `${device}: 開き直した結果では紙吹雪なし`, r);
    await p.close();
  }
});

B.test('目安に届かない結果(考える顔・紙吹雪なし)・解き直しの結果・動きを減らす設定', async (t) => {
  const p = await t.open('home');
  await p.evaluate(() => { const s = Views.exam._internal.createSession('short', false); localStorage.setItem('shojikiLearn.v1.examSession', JSON.stringify(s)); });
  await setAnswers(p, 'five');
  await submit(p);
  let r = await p.evaluate(() => ({ confetti: document.querySelectorAll('.confetti').length, think: !!document.querySelector('.exam-result-hero.is-fail svg.mascot.mascot-think'), verdict: document.querySelector('.exam-verdict').textContent.trim(), low: document.querySelectorAll('.exam-cat-row.is-low').length }));
  t.ok(r.confetti === 0 && r.think && /目安まであと/.test(r.verdict) && r.low > 0, '届かない → 考える顔・紙吹雪なし・弱い分野の印', r);
  await p.evaluate(() => document.querySelector('[data-role="retry"]').click());
  await p.waitFor(() => !!JSON.parse(localStorage.getItem('shojikiLearn.v1.examSession') || 'null'));
  await setAnswers(p, 'all');
  await p.evaluate(() => document.querySelector('[data-role="submit"]').click());
  await p.waitForSelector('[data-role="do-submit"]');
  await p.evaluate(() => document.querySelector('[data-role="do-submit"]').click());
  r = await p.waitFor(() => location.hash === '#exam/result/retry' && !!document.querySelector('.exam-result-hero') && ({ confetti: document.querySelectorAll('.confetti').length, cheer: !!document.querySelector('.exam-result-hero svg.mascot.mascot-cheer'), verdict: !!document.querySelector('.exam-verdict') }));
  t.ok(r && r.confetti === 0 && r.cheer && !r.verdict, '解き直しの結果: 元気な顔・目安の判定なし・紙吹雪なし', r);
  const p2 = await t.open('home', { reducedMotion: true });
  await p2.evaluate(() => { const s = Views.exam._internal.createSession('short', false); localStorage.setItem('shojikiLearn.v1.examSession', JSON.stringify(s)); });
  await setAnswers(p2, 'all');
  await submit(p2);
  r = await p2.evaluate(() => ({ confetti: document.querySelectorAll('.confetti').length, pass: !!document.querySelector('.exam-result-hero.is-pass') }));
  t.ok(r.pass && r.confetti === 0, '動きを減らす設定では紙吹雪なし', r);
});

B.run();
