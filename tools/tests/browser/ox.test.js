// ○×一問一答(ブラウザ): 上のバー・大きな○×・判定のバー・解説の開閉(間違えたら開く)・連続正解・自信度(たぶん)・自動で次へ・
// キー操作・結果(紙吹雪・マスコット・見出しにフォーカス)・途中で終了・PC と動きを減らす設定
// 元: scratchpad r7/E1 t_e1_ox.js・r7/D3 t6_regress.js(通常の○×)
'use strict';
const B = require('../lib/browser.js');

const prefs = (o) => ({ oxPrefs: Object.assign({ scope: { type: 'cat', id: 'gyoho' }, filter: 'all', count: 10, autoNext: false, confidence: false }, o || {}) });
const cur = (p) => p.evaluate(() => { const s = Views.ox._internal.getSession(); const it = s.items[s.index]; return { truth: it.truth, index: s.index, id: it.id, answered: !!s.answers[s.index] }; });
const answer = (p, right) => p.evaluate((r) => { const s = Views.ox._internal.getSession(); const tr = s.items[s.index].truth; document.querySelector(`.ox-btn[data-answer="${(r ? tr : !tr) ? 'o' : 'x'}"]`).click(); }, right);
const answeredNow = (p) => p.waitFor(() => { const s = Views.ox._internal.getSession(); return !!s.answers[s.index] && document.querySelector('.ox-feedback').classList.contains('is-shown'); });
const atIndex = (p, i) => p.waitFor((n) => { const s = Views.ox._internal.getSession(); return s && s.index === n && !s.answers[n]; }, {}, i);
const STATE = () => {
  const fb = document.querySelector('.ox-feedback');
  const res = document.querySelector('[data-role="result"]');
  const row = document.querySelector('.ox-answer-row');
  const bar = document.querySelector('[data-role="stepbar"]');
  const tog = document.querySelector('[data-role="explain-toggle"]');
  const vis = (sel) => { const e = document.querySelector(sel); return e ? e.offsetParent !== null || getComputedStyle(e).position === 'fixed' : null; };
  const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { t: Math.round(x.top), b: Math.round(x.bottom), l: Math.round(x.left), r: Math.round(x.right) }; };
  const ae = document.activeElement;
  return {
    shown: fb.classList.contains('is-shown'), pos: getComputedStyle(fb).position, fb: r(fb), live: (fb.querySelector('[data-role="verdict-live"]') || {}).textContent || '',
    liveRole: fb.querySelector('[data-role="verdict-live"]').getAttribute('role'),
    exp: tog ? tog.getAttribute('aria-expanded') : null, ctl: tog ? !!document.getElementById(tog.getAttribute('aria-controls')) : null, togLabel: tog ? tog.textContent.trim() : null,
    explained: res.classList.contains('is-explained'), noteVis: vis('.ox-explain'), linksVis: vis('.ox-links'), unsureVis: vis('.ox-unsure-line'),
    row: r(row), bar: r(bar), now: bar.querySelector('[data-role="track"]').getAttribute('aria-valuenow'), max: bar.querySelector('[data-role="track"]').getAttribute('aria-valuemax'),
    count: bar.querySelector('.ox-run-count').textContent.replace(/\s+/g, ''), streak: (() => { const s = bar.querySelector('[data-role="streak"]'); return s.hidden ? '' : s.textContent.replace(/\s+/g, ''); })(),
    hasFb: document.querySelector('.ox-view').classList.contains('has-fb'), oxfb: document.documentElement.style.getPropertyValue('--oxfb-h'),
    focus: ae ? ae.dataset.role || String(ae.className) : null, vh: innerHeight, vw: document.documentElement.clientWidth, navTop: (() => { const n = document.querySelector('.bottom-nav'); return n && getComputedStyle(n).display !== 'none' ? window.innerHeight - n.offsetHeight : window.innerHeight; })(), // 下のタブの上端(固定の要素なので offsetParent は使えない。動きで隠れていても高さから)
    btnSizes: Array.from(document.querySelectorAll('.ox-btn, .ox-feedback .btn, [data-role="stepbar"] .btn')).filter((b) => b.offsetParent || getComputedStyle(b).position === 'fixed').map((b) => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))),
  };
};
const start = async (p) => {
  await p.evaluate(() => document.querySelector('[data-role="start"]').click());
  await p.waitFor(() => { const s = Views.ox._internal.getSession(); return s && s.items && s.items.length && document.querySelector('.ox-btn'); });
  await p.settle();
};

B.test('正解(解説は閉じる)・不正解(解説を開く)・判定のバーの位置・Enter・連続正解(iPhone ライト / 320px ダーク)', async (t) => {
  for (const [device, dark] of [['iphone', false], ['w320', true]]) {
    const tag = `${device}${dark ? ' dark' : ''}`;
    const p = await t.open('ox', { device, dark, seed: prefs() });
    await start(p);
    let s = await p.evaluate(STATE);
    t.ok(!s.shown && s.now === '0' && s.max === '10' && s.count.includes('1/10') && !s.streak && !s.hasFb, `${tag}: 始め 0/10・判定のバーなし`, s);
    await answer(p, true);
    await answeredNow(p);
    await p.settle();
    s = await p.evaluate(STATE);
    t.ok(s.shown && s.pos === 'fixed' && /正解!/.test(s.live) && /この文は/.test(s.live) && s.liveRole === 'status' && s.hasFb && /px$/.test(s.oxfb), `${tag}: 正解 → 固定の判定のバー「正解!」`, s);
    t.ok(Math.abs(s.fb.b - s.navTop) <= 2 && s.fb.l === 0 && s.fb.r === s.vw, `${tag}: 判定のバーは下のタブのすぐ上`, s.fb);
    t.ok(s.exp === 'false' && s.ctl && !s.explained && s.noteVis === false && s.linksVis === false && s.togLabel === '解説を見る', `${tag}: 正解 → 解説は閉じる`, s);
    t.ok(s.row.b <= s.fb.t + 1 && s.row.t >= s.bar.b - 1, `${tag}: ○×のボタンが上のバーと判定のバーの間に見える`, { row: s.row, fb: s.fb, bar: s.bar });
    t.ok(s.focus === 'next' && s.now === '1' && s.btnSizes.every((x) => x >= 44) && !(await p.overflow()), `${tag}: フォーカスは「つづける」・1/10・ボタン44px以上・はみ出しなし`, s);
    await p.evaluate(() => document.querySelector('[data-role="explain-toggle"]').click());
    s = await p.evaluate(STATE);
    t.ok(s.exp === 'true' && s.explained && s.linksVis && s.togLabel === '解説を閉じる', `${tag}: 「解説を見る」で開く`, s);
    await p.press('Escape');
    await p.evaluate(() => document.activeElement.blur());
    await p.press('Enter');
    await atIndex(p, 1);
    s = await p.evaluate(STATE);
    t.ok(!s.shown && s.count.includes('2/10') && !s.hasFb, `${tag}: Enter → 次の文`, s);
    await answer(p, true);
    await answeredNow(p);
    s = await p.evaluate(STATE);
    t.ok(s.streak === '2問つづけて正解', `${tag}: 連続正解 2`, s.streak);
    await p.evaluate(() => document.querySelector('[data-role="next"]').click());
    await atIndex(p, 2);
    await answer(p, true);
    await answeredNow(p);
    s = await p.evaluate(STATE);
    t.ok(/^3/.test(s.streak) && /3問つづけて正解!/.test(s.live), `${tag}: 3問続けて → 札とバーの文`, { streak: s.streak, live: s.live });
    await p.evaluate(() => document.querySelector('[data-role="next"]').click());
    await atIndex(p, 3);
    await answer(p, false);
    await answeredNow(p);
    await p.settle();
    s = await p.stable(STATE);
    t.ok(/不正解。おしい!/.test(s.live) && s.exp === 'true' && s.explained && s.linksVis && s.togLabel === '解説を閉じる' && !s.streak, `${tag}: 不正解 → 「おしい!」・解説を開く・連続は切れる`, s);
    t.ok(s.row.b <= s.fb.t + 1 && s.row.t >= s.bar.b - 1, `${tag}: 不正解でも○×のボタンが見える`, { row: s.row, fb: s.fb, bar: s.bar });
    const marks = await p.evaluate(() => ({ ans: document.querySelectorAll('.ox-btn.is-answer .ox-btn-tag').length, wrong: document.querySelectorAll('.ox-btn.is-wrong .ox-btn-tag').length }));
    t.ok(marks.ans === 1 && marks.wrong === 1, `${tag}: 「正解」「あなたの回答」の札`, marks);
    await p.close();
  }
});

B.test('自信度つき(たぶん○で正解 → 「たぶん」の行・自動で次へ進まない)・自動で次へのバー', async (t) => {
  const p = await t.open('ox', { seed: prefs({ confidence: true, autoNext: true }) });
  await start(p);
  let c = await cur(p);
  await p.evaluate((tr) => document.querySelector(`.ox-btn[data-level="${tr ? 2 : 3}"]`).click(), c.truth);
  await answeredNow(p);
  const s = await p.evaluate(STATE);
  t.ok(s.exp === 'false' && s.unsureVis && !s.noteVis, 'たぶんで正解 → 解説は閉じ、「たぶん」の行は見える', s);
  const st = await p.get('oxStats');
  t.ok(st[c.id] && st[c.id].u === 1, '「たぶん」を数える(u)', st[c.id]);
  await B.sleep(1500);
  c = await cur(p);
  t.ok(c.index === 0, '「たぶん」のあとは自動で次へ進まない', c);
  await p.evaluate(() => document.querySelector('[data-role="next"]').click());
  await atIndex(p, 1);
  c = await cur(p);
  await p.press(c.truth ? 'o' : 'x');
  const bar = await p.waitFor(() => { const a = document.querySelector('.ox-feedback [data-role="auto-bar"]'); return a ? { pos: getComputedStyle(a).position, w: Math.round(a.getBoundingClientRect().width) } : null; });
  t.ok(bar && bar.pos === 'absolute' && bar.w > 300, '自信ありの正解 → 判定のバーの上に自動で次へのバー', bar);
  t.ok(await p.waitFor(() => Views.ox._internal.getSession().index === 2, { timeout: 4000 }), '自動で次の文へ');
});

B.test('結果(最後まで → 紙吹雪・マスコット・見出しにフォーカス)・途中で終了・戻ってきたとき', async (t) => {
  const p = await t.open('ox', { seed: prefs() });
  await start(p);
  for (let i = 0; i < 10; i++) {
    await answer(p, i !== 4 && i !== 7);
    await answeredNow(p);
    if (i < 9) { await p.evaluate(() => document.querySelector('[data-role="next"]').click()); await atIndex(p, i + 1); }
  }
  t.eq(await p.evaluate(() => document.querySelector('[data-role="next"]').textContent.trim()), '結果を見る', '最後の文は「結果を見る」');
  await p.evaluate(() => document.querySelector('[data-role="next"]').click());
  await p.waitForSelector('.ox-summary');
  const r = await p.evaluate(() => ({
    conf: document.querySelectorAll('.confetti .confetti-bit').length, mascot: !!document.querySelector('.ox-summary svg.mascot.mascot-cheer'),
    focus: document.activeElement && document.activeElement.id, score: document.querySelector('.ox-score').textContent.replace(/\s+/g, ''),
    cats: Array.from(document.querySelectorAll('.ox-cat-row')).map((x) => x.className), wrong: document.querySelectorAll('.ox-wrong-item').length,
    best: (document.querySelector('.ox-best-run') || {}).textContent || '', hasFb: document.querySelector('.ox-view').classList.contains('has-fb'), banner: !!document.querySelector('.ox-feedback'),
  }));
  t.ok(r.conf > 0 && r.conf <= 40 && r.mascot && r.focus === 'ox-summary-title' && r.score === '8/10問正解' && r.cats.length && r.cats.every((c) => /cat-/.test(c)) && r.wrong === 2 && /最高 ?4問/.test(r.best) && !r.hasFb && !r.banner, '結果(紙吹雪40個まで・マスコット・見出しにフォーカス・8/10・分野の色・間違えた2問・最高4問)', r);
  t.ok(await p.waitFor(() => !document.querySelector('.confetti'), { timeout: 4000 }), '紙吹雪は消える');
  await p.evaluate(() => document.querySelector('[data-role="continue"]').click());
  await atIndex(p, 0);
  await answer(p, true);
  await answeredNow(p);
  await p.evaluate(() => document.querySelector('[data-role="quit"]').click());
  await p.waitForSelector('.ox-summary');
  const q = await p.evaluate(() => ({ conf: document.querySelectorAll('.confetti').length, note: (document.querySelector('.ox-summary') || {}).textContent || '' }));
  t.ok(q.conf === 0 && /10問中1問で終了/.test(q.note), '途中で終了 → 紙吹雪なしの結果', q);
  await p.go('home');
  await p.back();
  const back = await p.waitFor(() => !!document.querySelector('.ox-summary') && ({ conf: document.querySelectorAll('.confetti').length }));
  t.ok(back && back.conf === 0, '戻ってきたとき(描き直し)は紙吹雪なし', back);
});

B.test('PC: 動きを減らす設定・判定のバーの位置とそろえ方・キーの案内', async (t) => {
  const p = await t.open('ox', { device: 'desktop', reducedMotion: true, seed: prefs() });
  await start(p);
  await answer(p, false);
  await answeredNow(p);
  const an = await p.evaluate(() => ({ fb: getComputedStyle(document.querySelector('.ox-feedback')).animationName, st: getComputedStyle(document.querySelector('.quiz-fb-sticker')).animationName, wrong: getComputedStyle(document.querySelector('.ox-btn.is-wrong')).animationName }));
  t.ok(Object.values(an).every((x) => x === 'none'), '動きを減らす設定 → 動きなし', an);
  const s = await p.evaluate(STATE);
  const col = await p.evaluate(() => { const c = document.querySelector('.ox-card').getBoundingClientRect(); const l = document.querySelector('.ox-feedback .quiz-fb-live').getBoundingClientRect(); const a = document.querySelector('.ox-feedback .quiz-fb-actions').getBoundingClientRect(); return { cl: Math.round(c.left), cr: Math.round(c.right), ll: Math.round(l.left), ar: Math.round(a.right) }; });
  const side = await p.evaluate(() => Math.round(document.getElementById('view-root').getBoundingClientRect().left)); // 本文の列の左端(= サイドバーの右端)
  t.ok(side > 0 && Math.abs(s.fb.l - side) <= 1 && Math.abs(s.fb.b - s.vh) <= 1 && Math.abs(col.cl - col.ll) <= 2 && Math.abs(col.cr - col.ar) <= 2, 'PC の判定のバーはサイドバーの右・列にそろう', { fb: s.fb, col, side });
  t.ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ox-keys')).display !== 'none'), 'PC ではキーの案内を出す');
});

B.test('通常の○×(自信度なし): 2つのボタン・数字キーと自動で次へ・矢印キー・Enter(PC)', async (t) => {
  const p = await t.open('ox', { device: 'desktop', seed: prefs({ scope: { type: 'cat', id: 'kenri' }, autoNext: true }) });
  await start(p);
  t.eq(await p.evaluate(() => Array.from(document.querySelectorAll('.ox-answer-row .ox-btn')).map((x) => x.dataset.answer).join('')), 'ox', '○と×の2つ');
  let c = await cur(p);
  await p.press(c.truth ? '1' : '2');
  t.ok(await p.waitFor(() => Views.ox._internal.getSession().index === 1, { timeout: 4000 }), '数字キー(1=○・2=×)で正解 → 自動で次へ');
  c = await cur(p);
  await p.press(c.truth ? 'ArrowRight' : 'ArrowLeft');
  const a = await p.waitFor(() => { const s = Views.ox._internal.getSession(); return s.answers[s.index] || null; });
  t.ok(a && !a.ok && a.level === null && !a.unsure, '矢印キーで不正解(自信度なし)', a);
  await p.press('Enter');
  t.ok(await p.waitFor(() => Views.ox._internal.getSession().index === 2), 'Enter で次へ');
});

B.run();
