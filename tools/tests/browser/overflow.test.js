// P1: 4択の1問ずつの表示で、問題が入れ替わる動き(quiz-step-in)の途中もページが横にはみ出さないこと(動きあり)
'use strict';
const B = require('../lib/browser.js');
const PROBE = async (how) => {
  const vw = document.documentElement.clientWidth;
  let max = 0;
  const cur = () => document.querySelector('.quiz-steps > .quiz-card.is-current');
  if (how === 'next') document.querySelector('[data-role="step-next"]').click();
  else if (how === 'prev') document.querySelector('[data-role="step-prev"]').click();
  else {
    cur().querySelectorAll('.choice-btn')[0].click();
    await new Promise((r) => setTimeout(r, 400));
    const n = cur().querySelector('[data-role="next-q"]');
    if (n) n.click();
  }
  const t0 = performance.now();
  await new Promise((res) => { const f = () => { max = Math.max(max, document.documentElement.scrollWidth - vw); if (performance.now() - t0 < 450) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return { how, max, anim: getComputedStyle(cur()).animationName };
};
const DEV = { iphone: 'iphone', w320: 'w320', tablet: 'tablet', land: { width: 844, height: 390, deviceScaleFactor: 3, mobile: true } };
B.test('4択: 問題の入れ替わりの動きの途中も横にはみ出さない(スマホ・320・タブレット・横向き)', async (t) => {
  for (const [name, device] of Object.entries(DEV)) {
    const p = await t.open('quiz', { device, reducedMotion: false });
    const r = [];
    for (const how of ['next', 'answer', 'prev']) { r.push(await p.evaluate(PROBE, how)); await B.sleep(500); }
    t.ok(r.every((x) => x.max <= 0), `${name}: 動きの途中のはみ出し 0px`, r);
    t.ok(!(await p.overflow()), `${name}: 止まったあともはみ出さない`);
    await p.close();
  }
});
B.run();
