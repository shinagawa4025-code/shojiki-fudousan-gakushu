// 4択(ブラウザ): 1問ずつの表示・判定のバー・解説の開閉(間違えたら開く)・勘で当たった・終わりの画面・一覧の中のカード・
// 個数・組合せ・問題の形の絞り込み・キー操作・動きを減らす設定・320px・コントラスト
// 元: scratchpad r7/D3 t_d3_stepper.js・t2_quizflows.js・t5_a11y.js・t6_regress.js・r7/E1 t_e1_quiz.js
'use strict';
const B = require('../lib/browser.js');

const CUR = '.quiz-steps > .quiz-card.is-current';
// 今のカードと上のバー・判定のバーの状態
const STATE = () => {
  const list = document.querySelector('.quiz-steps');
  const cards = Array.from(list.querySelectorAll(':scope > .quiz-card'));
  const cur = list.querySelector(':scope > .quiz-card.is-current');
  const bar = document.querySelector('[data-role="stepbar"]');
  const fb = cur && cur.querySelector(':scope > .quiz-feedback');
  const ae = document.activeElement;
  const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
  const tog = cur && cur.querySelector('[data-role="explain-toggle"]');
  const vis = (sel) => { const e = cur && cur.querySelector(sel); return e ? e.offsetParent !== null : null; };
  return {
    n: cards.length, visible: cards.filter((c) => c.offsetParent !== null).length, idx: cards.indexOf(cur),
    id: cur ? cur.dataset.quizId || cur.dataset.termId : null,
    answered: cur ? cur.classList.contains('is-answered') : null, fresh: cur ? cur.classList.contains('is-fresh') : null,
    explained: cur ? cur.classList.contains('is-explained') : null,
    count: bar.querySelector('[data-role="step-count"]').textContent,
    now: bar.querySelector('[data-role="step-track"]').getAttribute('aria-valuenow'), max: bar.querySelector('[data-role="step-track"]').getAttribute('aria-valuemax'),
    prevDis: bar.querySelector('[data-role="step-prev"]').disabled, nextDis: bar.querySelector('[data-role="step-next"]').disabled,
    fbShown: !!(fb && fb.classList.contains('is-shown')), fbPos: fb ? getComputedStyle(fb).position : null, fbRect: rect(fb),
    live: cur ? (cur.querySelector('[data-role="verdict-live"]') || {}).textContent || '' : '',
    exp: tog ? tog.getAttribute('aria-expanded') : null, togLabel: tog ? tog.textContent.trim() : null, note: vis('.choice-note'),
    hasFb: document.querySelector('.quiz-stepper').classList.contains('has-fb'), finished: document.querySelector('.quiz-stepper').classList.contains('is-finished'),
    focusRole: ae ? (ae.dataset.role || String(ae.className)) : null,
    focusCard: ae && ae.closest('.quiz-card') ? (ae.closest('.quiz-card').dataset.quizId || ae.closest('.quiz-card').dataset.termId) : null,
    barBottom: Math.round(bar.getBoundingClientRect().bottom), curTop: cur ? Math.round(cur.getBoundingClientRect().top) : null,
    correct: rect(cur && cur.querySelector('.choice-btn.correct')),
    vw: document.documentElement.clientWidth, vh: window.innerHeight, navTop: (() => { const n = document.querySelector('.bottom-nav'); return n && getComputedStyle(n).display !== 'none' ? window.innerHeight - n.offsetHeight : window.innerHeight; })(), // 下のタブの上端(固定の要素なので offsetParent は使えない。動きで隠れていても高さから)
  };
};
const state = (p) => p.evaluate(STATE);
// 今のカードに答える(right: 正解を選ぶ)。自動生成のカード(用語)は history.state から正解を探す
const answerCur = (p, right) => p.evaluate((r, c) => {
  const card = document.querySelector(c);
  const q = APP_DATA.quiz.find((x) => x.id === card.dataset.quizId);
  let ci = q ? q.correctIndex : 0;
  if (!q) { const it = (history.state.autoState.questions || []).find((x) => x.termId === card.dataset.termId && x.picked == null); ci = it ? it.choices.findIndex((x) => x.correct) : 0; }
  card.querySelectorAll('.choice-list .choice-btn')[r ? ci : (ci + 1) % 4].click();
  return ci;
}, right, CUR);
const clickCur = (p, sel) => p.evaluate((s, c) => { const el = document.querySelector(c).querySelector(s); if (!el) return false; el.click(); return true; }, sel, CUR);
const bar = (p, role) => p.evaluate((r) => document.querySelector(`[data-role="stepbar"] [data-role="${r}"]`).click(), role);
const answered = (p) => p.waitFor((c) => { const e = document.querySelector(c); return e && e.classList.contains('is-answered'); }, {}, CUR);
const atIdx = (p, i) => p.waitFor((c, n) => { const cs = Array.from(document.querySelectorAll('.quiz-steps > .quiz-card')); return cs.indexOf(document.querySelector(c)) === n; }, {}, CUR, i);
const mcCount = (p) => p.evaluate(() => APP_DATA.quiz.filter((q) => QuizEngine.isMcItem(q)).length);

B.test('1問ずつ: バー・前へ/次へ・タップで答える・判定のバー・解説の開閉・勘で当たった・誤答・再読み込みと戻る(iPhone)', async (t) => {
  const p = await t.open('quiz');
  const total = await mcCount(p);
  let s = await state(p);
  t.ok(s.n === 30 && s.visible === 1 && s.idx === 0, '30枚のうち最初の1枚だけ見える', s);
  t.ok(s.prevDis && !s.nextDis && s.now === '1' && s.count === `1/${total}` && s.max === String(total), `バーは 1/${total}・前へは押せない`, s);
  await bar(p, 'step-next');
  await atIdx(p, 1);
  s = await state(p);
  t.ok(s.now === '2' && !s.prevDis && /quiz-question/.test(s.focusRole) && s.focusCard === s.id, '次へ → 2問目・問題文にフォーカス', s);
  t.ok(s.curTop >= s.barBottom - 1, '問題の頭が上のバーに隠れない', s);
  await bar(p, 'step-prev');
  await atIdx(p, 0);
  // 正解をタップ → 判定のバー(固定)・解説は閉じたまま
  const ci = await p.evaluate((c) => APP_DATA.quiz.find((x) => x.id === document.querySelector(c).dataset.quizId).correctIndex, CUR);
  await p.click(`${CUR} .choice-list .choice-btn`, ci);
  await answered(p);
  await p.settle();
  s = await state(p);
  t.ok(s.fresh && s.fbShown && s.fbPos === 'fixed' && /正解!/.test(s.live) && s.hasFb, '正解 → 固定の判定のバー「正解!」', s);
  t.ok(Math.abs(s.fbRect.bottom - s.navTop) <= 2 && s.fbRect.left === 0 && s.fbRect.right === s.vw, '判定のバーは下のタブのすぐ上・画面の幅', s);
  t.ok(s.exp === 'false' && s.note === false && s.togLabel === '解説を見る' && !s.explained, '正解 → 解説は閉じたまま', s);
  t.ok(s.correct && s.correct.bottom <= s.fbRect.top + 1, '正解のタイルが判定のバーに隠れない', s);
  let ex = await p.evaluate((c) => {
    const card = document.querySelector(c);
    const tg = card.querySelector('[data-role="explain-toggle"]');
    return { ctl: !!document.getElementById(tg.getAttribute('aria-controls')), tags: getComputedStyle(card.querySelector('.choice-tags')).position, nextH: card.querySelector('[data-role="next-q"]').getBoundingClientRect().height, togH: tg.getBoundingClientRect().height, liveRole: card.querySelector('[data-role="verdict-live"]').getAttribute('role'), chip: (card.querySelector('[data-role="unsure"]') || {}).offsetParent !== null };
  }, CUR);
  t.ok(ex.ctl && ex.tags === 'absolute' && ex.nextH >= 48 && ex.togH >= 48 && ex.liveRole === 'status', '「解説を見る」と「つづける」は48px以上・読み上げは role=status', ex);
  await p.click(`${CUR} [data-role="explain-toggle"]`);
  await p.waitFor((c) => document.querySelector(c).classList.contains('is-explained'), {}, CUR);
  ex = await p.evaluate((c) => {
    const card = document.querySelector(c);
    const tg = card.querySelector('[data-role="explain-toggle"]');
    const vis = (sel) => { const e = card.querySelector(sel); return e ? e.offsetParent !== null : null; };
    return { exp: tg.getAttribute('aria-expanded'), label: tg.textContent.trim(), note: vis('.choice-note'), chip: vis('[data-role="unsure"]'), explain: vis('.quiz-explain'), ai: vis('.ask-ai-btn'), tags: getComputedStyle(card.querySelector('.choice-tags')).position, focus: document.activeElement === tg };
  }, CUR);
  t.ok(ex.exp === 'true' && ex.label === '解説を閉じる' && ex.note && ex.chip && ex.explain && ex.ai !== false && ex.tags === 'static' && ex.focus, '解説を開く(選択肢の解説・勘で当たった・AIに聞く)・フォーカスはボタンのまま', ex);
  await clickCur(p, '[data-role="unsure"]');
  t.ok(await p.waitFor(() => Object.keys(JSON.parse(localStorage.getItem('shojikiLearn.v1.quizUnsure') || '{}')).length === 1), '開いた解説から「勘で当たった」を押せる');
  await clickCur(p, '[data-role="next-q"]');
  await atIdx(p, 1);
  s = await state(p);
  t.ok(!s.hasFb && /quiz-question/.test(s.focusRole) && s.curTop >= s.barBottom - 1, 'つづける → 次の問題・判定のバーは消える・問題文にフォーカス', s);
  // 誤答 → 解説を最初から開く・正解のタイルが見える
  await answerCur(p, false);
  await answered(p);
  await p.settle();
  s = await p.stable(STATE);
  t.ok(/不正解/.test(s.live) && /おしい!/.test(s.live) && /正解は \d/.test(s.live), '誤答 → 「おしい! 正解は n」', s.live);
  t.ok(s.explained && s.exp === 'true' && s.togLabel === '解説を閉じる' && s.note, '誤答 → 解説は開いた状態', s);
  t.ok(s.correct && s.correct.top >= s.barBottom - 1 && s.correct.top + 40 <= s.fbRect.top, '誤答: 正解のタイルが上のバーと判定のバーの間に見える', s);
  const w = await p.evaluate((c) => { const card = document.querySelector(c); return { inc: card.querySelectorAll('.choice-btn.incorrect .choice-key-mark').length, cor: card.querySelectorAll('.choice-btn.correct .choice-key-mark').length, numSr: getComputedStyle(card.querySelector('.choice-btn.correct .choice-key-num')).position }; }, CUR);
  t.ok(w.inc === 1 && w.cor === 1 && w.numSr === 'absolute', '×と✓の印(番号は読み上げ用に残す)', w);
  await clickCur(p, '[data-role="explain-toggle"]');
  s = await state(p);
  t.ok(!s.explained && s.exp === 'false' && s.note === false, '誤答でも閉じられる', s);
  await clickCur(p, '[data-role="explain-toggle"]');
  // 再読み込み: 見ていた問題・答えた状態・開いた解説
  const before = s.id;
  await p.reload();
  t.ok(await p.waitFor((c) => { const e = document.querySelector(c); return e && e.classList.contains('is-answered'); }, {}, CUR), '再読み込みで答えた状態に戻る');
  s = await state(p);
  t.ok(s.id === before && !s.fresh && s.fbShown && s.explained && s.exp === 'true', '再読み込み: 同じ問題・動きなし・解説は開いたまま', s);
  await p.go('home');
  await p.back();
  t.ok(await p.waitFor((id, c) => { const e = document.querySelector(c); return e && e.dataset.quizId === id && e.classList.contains('is-answered'); }, {}, before, CUR), '戻る: 同じ問題・答えた状態');
});

B.test('30問ごとに続きを足す・直リンクで途中から・前へで手前を足す(PC)', async (t) => {
  const p = await t.open('quiz', { device: 'desktop' });
  const total = await mcCount(p);
  await p.evaluate(() => { for (let i = 0; i < 29; i++) document.querySelector('[data-role="stepbar"] [data-role="step-next"]').click(); });
  await atIdx(p, 29);
  let s = await state(p);
  t.ok(s.n === 30 && !s.nextDis, '30問目でも次へを押せる', s);
  await bar(p, 'step-next');
  await atIdx(p, 30);
  s = await state(p);
  t.ok(s.n === 60 && s.now === '31', '次へで次の30問を足す', s);
  // 30問目に答えると続きを足して「つづける」
  const p2 = await t.open('quiz', { device: 'desktop' });
  await p2.evaluate(() => { for (let i = 0; i < 29; i++) document.querySelector('[data-role="stepbar"] [data-role="step-next"]').click(); });
  await atIdx(p2, 29);
  await answerCur(p2, true);
  t.ok(await p2.waitFor((c) => document.querySelectorAll('.quiz-steps > .quiz-card').length === 60 && !!document.querySelector(c).querySelector('[data-role="next-q"]'), {}, CUR), '最後のカードに答えると続きを足して「つづける」');
  await p2.close();
  const info = await p.evaluate(() => { const mc = APP_DATA.quiz.filter((q) => QuizEngine.isMcItem(q)); return { id: mc[120].id, pos: 121 }; });
  await p.go(`quiz/q/${info.id}`);
  await p.waitFor((id, c) => { const e = document.querySelector(c); return e && e.dataset.quizId === id; }, {}, info.id, CUR);
  s = await state(p);
  t.ok(s.id === info.id && s.idx === 0 && s.now === String(info.pos) && s.max === String(total) && !s.prevDis, `直リンクはその問題から(${info.pos}/${total})・前へを押せる`, s);
  await bar(p, 'step-prev');
  await p.waitFor(() => document.querySelectorAll('.quiz-steps > .quiz-card').length === 60);
  s = await state(p);
  t.ok(s.now === String(info.pos - 1) && s.n === 60 && s.idx === 29, '前へで手前の30問を足す', s);
});

B.test('一覧の終わり(ブックマークの2問)→ 結果を見る・マスコット・紙吹雪・前へで戻る', async (t) => {
  const p = await t.open('home', { seed: { quizPrefs: { status: 'bookmark' } } });
  // 問題 ID はデータから(並びが変わっても動くように)
  const ids = await p.evaluate(() => [APP_DATA.quiz[5].id, APP_DATA.quiz[9].id]);
  await p.evaluate((a, b) => { localStorage.setItem('shojikiLearn.v1.bookmarks', JSON.stringify({ [`quiz:${a}`]: 1, [`quiz:${b}`]: 2 })); }, ids[0], ids[1]);
  await p.goto('index.html?r=1#quiz');
  await p.waitApp();
  let s = await state(p);
  t.ok(s.n === 2 && s.count === '1/2', 'ブックマークの絞り込みで2問', s);
  await answerCur(p, true);
  await answered(p);
  await clickCur(p, '[data-role="next-q"]');
  await atIdx(p, 1);
  await answerCur(p, false);
  await answered(p);
  t.ok(await p.evaluate((c) => !!document.querySelector(c).querySelector('[data-role="step-finish"]'), CUR), '最後のカードは「結果を見る」');
  await clickCur(p, '[data-role="step-finish"]');
  await p.waitFor(() => document.querySelector('.quiz-stepper').classList.contains('is-finished'));
  const conf = await p.evaluate(() => document.querySelectorAll('.confetti .confetti-bit').length);
  s = await state(p);
  const end = await p.evaluate(() => { const e = document.querySelector('[data-role="list-end"]'); return { vis: e.offsetParent !== null, mascot: !!e.querySelector('svg.mascot'), score: (e.querySelector('.quiz-finish-score') || {}).textContent, focus: document.activeElement && document.activeElement.dataset.role }; });
  t.ok(s.finished && s.visible === 0 && end.vis && end.mascot && end.focus === 'finish-title' && /1/.test(end.score) && s.count === '2/2' && s.nextDis && !s.prevDis, '終わりの画面(マスコット・見出しにフォーカス・バーは満杯)', { s, end });
  t.ok(conf > 0 && conf <= 40, '紙吹雪は40個まで', conf);
  t.ok(await p.waitFor(() => !document.querySelector('.confetti'), { timeout: 4000 }), '紙吹雪は消える');
  await bar(p, 'step-prev');
  await p.waitFor(() => !document.querySelector('.quiz-stepper').classList.contains('is-finished'));
  s = await state(p);
  t.ok(s.idx === 1 && s.visible === 1, '前へで最後のカードに戻る', s);
  await clickCur(p, '[data-role="step-finish"]');
  await p.waitFor(() => document.querySelector('.quiz-stepper').classList.contains('is-finished'));
  await p.evaluate(() => document.querySelector('[data-role="end-first"]').click());
  t.ok(await atIdx(p, 0), '「最初の問題へ」');
});

B.test('解き直し(#quiz/due)・自動生成(#quiz/auto)の流れと終わり', async (t) => {
  const p = await t.open('home');
  const d = await p.evaluate(() => { const y = DateUtil.addDays(DateUtil.today(), -1); return { a: APP_DATA.quiz[3].id, b: APP_DATA.quiz[4].id, y }; });
  await p.evaluate((x) => localStorage.setItem('shojikiLearn.v1.quizRetry', JSON.stringify({ [x.a]: { step: 1, due: x.y, at: x.y, src: 'quiz' }, [x.b]: { step: 0, due: x.y, at: x.y, src: 'quiz' } })), d);
  await p.go('quiz/due');
  let s = await state(p);
  t.ok(s.n === 2 && s.count === '0/2' && s.visible === 1, '解き直し 0/2', s);
  await answerCur(p, false);
  await answered(p);
  const line = await p.evaluate((c) => { const x = document.querySelector(c).querySelector('.drill-result'); return x ? { vis: x.offsetParent !== null, text: x.textContent } : null; }, CUR);
  s = await state(p);
  t.ok(s.explained && line && line.vis && /日後|明日|もう一度/.test(line.text), '誤答 → 解説を開き、解き直しの予定の行が見える', { s, line });
  t.ok(s.count === '1/2', '答えるとバーは 1/2', s);
  await clickCur(p, '[data-role="next-q"], [data-role="due-next"]');
  await atIdx(p, 1);
  await answerCur(p, true);
  await answered(p);
  const lbl = await p.evaluate((c) => document.querySelector(c).querySelector('[data-role="due-next"]').textContent.trim(), CUR);
  t.ok(lbl === '結果を見る', '最後は「結果を見る」', lbl);
  await clickCur(p, '[data-role="due-next"]');
  t.ok(await p.waitFor(() => { const e = document.querySelector('[data-role="due-summary"]'); return document.querySelector('.quiz-stepper').classList.contains('is-finished') && e && e.offsetParent !== null && !!e.querySelector('.quiz-finish-hero svg.mascot'); }), '解き直しの結果(マスコット)');
  await p.reload();
  s = await state(p);
  t.ok(s.answered && s.n === 2, '再読み込みでも答えた状態', s);
  // 自動生成(5問)
  const p2 = await t.open('quiz/auto', { seed: { quizPrefs: { autoCount: 5 } } });
  s = await state(p2);
  t.ok(s.n === 5 && s.count === '0/5', '自動生成 0/5', s);
  for (let i = 0; i < 5; i++) {
    await answerCur(p2, i !== 2);
    await answered(p2);
    const st = await state(p2);
    if (i === 2) t.ok(st.explained && st.exp === 'true', '自動生成: 誤答 → 解説を開く', st);
    if (i === 3) t.ok(!st.explained && st.exp === 'false', '自動生成: 正解 → 閉じたまま', st);
    await clickCur(p2, '[data-role="next-q"]');
    if (i < 4) await atIdx(p2, i + 1);
  }
  t.ok(await p2.waitFor(() => { const e = document.querySelector('[data-role="summary"]'); return document.querySelector('.quiz-stepper').classList.contains('is-finished') && e && e.offsetParent !== null && !!e.querySelector('svg.mascot') && !!e.querySelector('[data-role="redo-missed"]'); }), '自動生成の結果(マスコット・間違えた問題をもう一度)');
  await p2.evaluate(() => document.querySelector('[data-role="redo-missed"]').click());
  t.ok(await p2.waitFor(() => !document.querySelector('.quiz-stepper').classList.contains('is-finished') && document.querySelectorAll('.quiz-steps > .quiz-card').length === 1), '間違えた問題をもう一度 → 1問の新しい組');
  s = await state(p2);
  t.ok(s.idx === 0 && s.count === '0/1', '…最初のカードから', s);
  await p2.evaluate(() => document.querySelector('[data-role="retry"]').click());
  t.ok(await p2.waitFor(() => !document.querySelector('.quiz-stepper').classList.contains('is-finished') && document.querySelectorAll('.quiz-steps > .quiz-card').length === 5), '新しい問題で作り直す');
});

B.test('PC: 判定のバーの位置・動きを減らす設定・キー操作(Tab・Enter・数字)', async (t) => {
  const p = await t.open('quiz', { device: 'desktop', reducedMotion: true });
  await answerCur(p, false);
  await answered(p);
  const an = await p.evaluate((c) => { const card = document.querySelector(c); return { card: getComputedStyle(card).animationName, tile: getComputedStyle(card.querySelector('.choice-btn.incorrect')).animationName, key: getComputedStyle(card.querySelector('.choice-btn.correct .choice-key')).animationName, fb: getComputedStyle(card.querySelector('.quiz-feedback')).animationName, st: getComputedStyle(card.querySelector('.quiz-fb-sticker')).animationName }; }, CUR);
  t.ok(Object.values(an).every((v) => v === 'none'), '動きを減らす設定 → 動きなし', an);
  let s = await state(p);
  const side = await p.evaluate(() => Math.round(document.getElementById('view-root').getBoundingClientRect().left)); // 本文の列の左端(= サイドバーの右端)
  t.ok(s.fbPos === 'fixed' && side > 0 && Math.abs(s.fbRect.left - side) <= 1 && Math.abs(s.fbRect.bottom - s.vh) <= 1, 'PC の判定のバーはサイドバーの右・画面の下', { fb: s.fbRect, side });
  const inner = await p.evaluate((c) => { const card = document.querySelector(c); const a = card.querySelector('.quiz-fb-actions').getBoundingClientRect(); const l = card.querySelector('.quiz-fb-live').getBoundingClientRect(); const col = card.querySelector('.quiz-question').getBoundingClientRect(); return { aRight: Math.round(a.right), lLeft: Math.round(l.left), colLeft: Math.round(col.left), colRight: Math.round(col.right) }; }, CUR);
  t.ok(Math.abs(inner.lLeft - inner.colLeft) <= 2 && Math.abs(inner.aRight - inner.colRight) <= 2, 'バーの中身は問題の列にそろう', inner);
  await clickCur(p, '[data-role="next-q"]');
  await atIdx(p, 1);
  await p.emulateMedia({ reducedMotion: false });
  await p.evaluate((c) => document.querySelector(c).querySelector('.quiz-question').focus(), CUR);
  await p.press('Tab');
  const f1 = await p.evaluate(() => String(document.activeElement.className));
  await p.press('Enter');
  const f2 = await p.waitFor(() => document.activeElement && document.activeElement.dataset.role === 'next-q' && 'next-q');
  t.ok(/choice-btn/.test(f1) && f2 === 'next-q', 'Tab で選択肢 → Enter で答える → フォーカスは「つづける」', { f1, f2 });
  await p.press('Enter');
  await atIdx(p, 2);
  s = await state(p);
  t.ok(/quiz-question/.test(s.focusRole), 'Enter(つづける)→ 次の問題文にフォーカス', s);
  await p.press('3');
  t.ok(await p.waitFor((c) => document.querySelector(c).classList.contains('is-answered') && document.activeElement.dataset.role === 'next-q', {}, CUR), '数字キー 3 で答える・フォーカスは「つづける」');
  await p.evaluate(() => document.activeElement.blur());
  await p.press('Enter');
  t.ok(await atIdx(p, 3), 'フォーカスなしの Enter でも次へ');
});

B.test('320px(ライト・ダーク): はみ出しなし・判定のバーとボタンは44px以上', async (t) => {
  for (const dark of [false, true]) {
    const p = await t.open('quiz', { device: 'w320', dark });
    await answerCur(p, false);
    await answered(p);
    await clickCur(p, '[data-role="explain-toggle"]');
    const s = await state(p);
    const sz = await p.evaluate((c) => Array.from(document.querySelector(c).querySelectorAll('.quiz-feedback .btn')).concat(Array.from(document.querySelectorAll('[data-role="stepbar"] .btn'))).map((x) => Math.round(Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width))), CUR);
    t.ok(!(await p.overflow()) && s.fbRect.right <= 320 && sz.length && sz.every((v) => v >= 44), `320px ${dark ? 'ダーク' : 'ライト'}: はみ出しなし・ボタン44px以上`, { fb: s.fbRect, sz });
    await p.close();
  }
});

B.test('一覧の中のカード(トピック詳細・ブックマーク)と初回ガイドの1問', async (t) => {
  const p = await t.open('topics/topicG');
  await p.evaluate(() => document.querySelector('[data-role="quiz-list"]').scrollIntoView());
  await p.waitFor(() => document.querySelectorAll('[data-role="quiz-list"] .quiz-card').length >= 2);
  const r = await p.evaluate(() => {
    const cs = document.querySelectorAll('[data-role="quiz-list"] .quiz-card');
    const out = [];
    [[cs[0], false], [cs[1], true]].forEach(([c, right]) => {
      const q = APP_DATA.quiz.find((x) => x.id === c.dataset.quizId);
      c.querySelectorAll('.choice-btn')[right ? q.correctIndex : (q.correctIndex + 1) % 4].click();
      const fb = c.querySelector('.quiz-feedback');
      out.push({ explained: c.classList.contains('is-explained'), note: c.querySelector('.choice-note').offsetParent !== null, pos: getComputedStyle(fb).position, toggle: !!fb.querySelector('[data-role="explain-toggle"]'), next: !!fb.querySelector('[data-role="next-q"]'), last: c.lastElementChild === fb });
    });
    return out;
  });
  t.ok(r[0].explained && r[0].note && !r[1].explained && !r[1].note, 'トピック: 誤答は開く・正解は閉じる', r);
  t.ok(r.every((x) => x.pos === 'static' && x.toggle && x.next && x.last), 'トピック: 判定のバーはカードの中(「解説を見る」と「つづける」)', r);
  await p.evaluate(() => document.querySelector('[data-role="quiz-list"] .quiz-card [data-role="next-q"]').click());
  t.ok(await p.waitFor(() => { const c = document.activeElement && document.activeElement.closest('.quiz-card'); return c && Array.from(document.querySelectorAll('[data-role="quiz-list"] .quiz-card')).indexOf(c) >= 1; }), 'トピック: つづける → 後ろのカードにフォーカス');
  const id = await p.evaluate(() => APP_DATA.quiz[7].id);
  const p3 = await t.open('bookmarks', { seed: { bookmarks: { [`quiz:${id}`]: 1 } } });
  const bm = await p3.evaluate((qid) => { const c = document.querySelector(`.quiz-card[data-quiz-id="${qid}"]`); if (!c) return null; const q = APP_DATA.quiz.find((x) => x.id === qid); c.querySelectorAll('.choice-btn')[(q.correctIndex + 1) % 4].click(); return { explained: c.classList.contains('is-explained'), exp: c.querySelector('[data-role="explain-toggle"]').getAttribute('aria-expanded') }; }, id);
  t.ok(bm && bm.explained && bm.exp === 'true', 'ブックマーク: 誤答 → 開く', bm);
  // 初回ガイドの「まず1問」: 解説はいつも開いた形で「解説を見る」はない
  const p2 = await t.open('home');
  await p2.evaluate(() => Onboarding.start());
  for (let i = 0; i < 8; i++) {
    const done = await p2.evaluate(() => {
      if (document.querySelector('.onb-question .quiz-card')) return true;
      const g = document.querySelector('.onb-overlay [data-goal]');
      if (g && g.getAttribute('aria-checked') !== 'true') g.click();
      const n = document.querySelector('.onb-overlay [data-role="next"]');
      if (n) n.click();
      return false;
    });
    if (done) break;
    await B.sleep(300);
  }
  const o = await p2.evaluate(() => {
    const c = document.querySelector('.onb-question .quiz-card');
    if (!c) return null;
    const q = APP_DATA.quiz.find((x) => x.id === c.dataset.quizId);
    c.querySelectorAll('.choice-btn')[(q.correctIndex + 1) % 4].click();
    const vis = (sel) => { const e = c.querySelector(sel); return e ? e.offsetParent !== null : null; };
    return { note: vis('.choice-note'), toggle: vis('[data-role="explain-toggle"]'), fbPos: getComputedStyle(c.querySelector('.quiz-feedback')).position, live: c.querySelector('[data-role="verdict-live"]').textContent };
  });
  t.ok(o && o.note && o.toggle !== true && o.fbPos !== 'fixed' && /おしい/.test(o.live), '初回ガイド: 解説は開いた形で「解説を見る」はない・判定はガイドの中', o);
});

B.test('個数・組合せ: トピック・ブックマークのカード・問題の形の絞り込み(件数)・数字キー・再読み込み', async (t) => {
  const p = await t.open('home', { device: 'desktop' });
  const info = await p.evaluate(() => { const q = APP_DATA.quiz.find((x) => x.style === 'count'); return { id: q.id, topic: (q.topicIds || [])[0] }; });
  // トピックの4択の一覧に出る(必要なら「もっと見る」)
  await p.go(`topics/${info.topic}`);
  let found = false;
  for (let k = 0; k < 40 && !found; k++) {
    found = await p.evaluate((id) => !!document.querySelector(`.quiz-card[data-quiz-id="${id}"]`), info.id);
    if (!found) {
      const more = await p.evaluate(() => { const bs = Array.from(document.querySelectorAll('button')).filter((x) => /もっと見る|残り/.test(x.textContent) && x.offsetParent); if (bs[0]) { bs[0].click(); return true; } return false; });
      if (!more) break;
      await B.sleep(150);
    }
  }
  t.ok(found, 'トピックの一覧に個数問題のカード', info);
  if (found) {
    const r = await p.evaluate((id) => { const c = document.querySelector(`.quiz-card[data-quiz-id="${id}"]`); return { stmts: c.querySelectorAll('.stmt-item').length, tag: !!c.querySelector('.source-tag-style'), grid: getComputedStyle(c.querySelector('.choice-list')).display }; }, info.id);
    t.ok(r.stmts === 4 && r.tag && r.grid === 'grid', '記述ア〜エ・個数の札・選択肢は2列', r);
    await p.evaluate((id) => document.querySelector(`.quiz-card[data-quiz-id="${id}"] .choice-btn`).click(), info.id);
    const r2 = await p.evaluate((id) => { const c = document.querySelector(`.quiz-card[data-quiz-id="${id}"]`); return { notes: c.querySelectorAll('.stmt-note').length, done: c.querySelectorAll('.stmt-item.is-done').length, ai: !!c.querySelector('.ask-ai-btn') }; }, info.id);
    t.ok(r2.notes === 4 && r2.done === 4 && r2.ai, '答えると記述ごとの解説・AIに聞く', r2);
  }
  const pb = await t.open('bookmarks', { seed: { bookmarks: { [`quiz:${info.id}`]: 1 } } });
  t.ok(await pb.waitFor((id) => { const c = document.querySelector(`.quiz-card[data-quiz-id="${id}"]`); return c && c.querySelectorAll('.stmt-item').length === 4; }, {}, info.id), 'ブックマークにも記述ア〜エ');
  await pb.close();
  // 問題の形の絞り込み
  const q = await t.open('quiz', { device: 'desktop' });
  await q.click('[data-role="filter-open"]');
  await q.waitForSelector('[data-format="styled"]');
  const want = await q.evaluate(() => { const mc = APP_DATA.quiz.filter((x) => QuizEngine.isMcItem(x)); const L = mc.filter((x) => x.level === '上級'); return { all: [mc.length, mc.filter((x) => !x.style).length, mc.filter((x) => x.style).length], hi: [L.length, L.filter((x) => !x.style).length, L.filter((x) => x.style).length] }; });
  const counts = await q.evaluate(() => Array.from(document.querySelectorAll('[data-format]')).map((x) => x.textContent.replace(/\s+/g, '')));
  t.eq(counts, [`すべて${want.all[0]}問`, `通常の4択${want.all[1]}問`, `個数・組合せ${want.all[2]}問`], '問題の形ごとの件数');
  await q.evaluate(() => document.querySelector('[data-format="styled"]').click());
  t.ok(await q.waitFor((n) => new RegExp(`${n}問`).test(document.querySelector('[data-role="filter-apply"]').textContent), {}, want.all[2]), '適用のボタンに件数');
  await q.evaluate(() => document.querySelector('[data-role="level-chips"] [data-value="上級"]').click());
  await B.sleep(100);
  const counts2 = await q.evaluate(() => Array.from(document.querySelectorAll('[data-format]')).map((x) => x.textContent.replace(/\s+/g, '')));
  t.eq(counts2, [`すべて${want.hi[0]}問`, `通常の4択${want.hi[1]}問`, `個数・組合せ${want.hi[2]}問`], 'レベルで絞ると件数も変わる');
  await q.evaluate(() => document.querySelector('[data-role="level-chips"] [data-value="全て"]').click());
  await q.evaluate(() => document.querySelector('[data-role="filter-apply"]').click());
  await q.waitFor(() => document.querySelectorAll('.quiz-card.is-styled').length > 0 && !document.querySelector('.quiz-card:not(.is-styled)'));
  const list = await q.evaluate(() => ({ cards: document.querySelectorAll('.quiz-card').length, chips: Array.from(document.querySelectorAll('.quiz-filter-chip')).map((x) => x.textContent.trim()), count: document.querySelector('[data-role="filter-count"]').textContent, prefs: JSON.parse(localStorage.getItem('shojikiLearn.v1.quizPrefs')) }));
  t.ok(list.cards === Math.min(30, want.all[2]) && list.chips[0] === '個数・組合せ' && list.count === '1' && list.prefs.format === 'styled', '個数・組合せだけの一覧・絞り込みの札・保存', list);
  // 絞り込みのシートが閉じる動きが終わってから(途中のキーはシートに行く)
  await q.settle();
  const first = await q.evaluate(() => document.querySelector('.quiz-card').dataset.quizId);
  await q.evaluate(() => window.scrollTo(0, 0));
  await q.press('2');
  t.ok(await q.waitFor((id) => { const c = document.querySelector(`.quiz-card[data-quiz-id="${id}"]`); return c.classList.contains('is-answered') && Array.from(c.querySelectorAll('.choice-btn')).findIndex((x) => x.classList.contains('is-picked')) === 1; }, {}, first), '数字キー 2 で答える');
  await q.press('Enter');
  t.ok(await q.waitFor(() => { const a = document.activeElement; const c = a && a.closest('.quiz-card'); return c && c === document.querySelectorAll('.quiz-card')[1] && /quiz-question/.test(a.className); }), 'Enter で次の問題文へ');
  await q.press('4');
  await q.waitFor(() => document.querySelectorAll('.quiz-card.is-answered').length === 2);
  await q.reload();
  const rl = await q.evaluate(() => ({ plain: document.querySelectorAll('.quiz-card:not(.is-styled)').length, answered: document.querySelectorAll('.quiz-card.is-answered').length, chips: Array.from(document.querySelectorAll('.quiz-filter-chip')).map((x) => x.textContent.trim()) }));
  t.ok(rl.plain === 0 && rl.answered === 2 && rl.chips[0] === '個数・組合せ', '再読み込みでも絞り込みと答えた状態', rl);
  await q.evaluate(() => document.querySelector('.quiz-filter-chip').click());
  const cl = await q.waitFor(() => !document.querySelector('.quiz-filter-chip') && document.querySelectorAll('.quiz-card:not(.is-styled)').length > 0 && ({ focus: document.activeElement.dataset.role, prefs: JSON.parse(localStorage.getItem('shojikiLearn.v1.quizPrefs')).format }));
  t.ok(cl && cl.focus === 'filter-open' && cl.prefs === 'all', '札を外すと全部に戻り、フォーカスは絞り込みのボタン', cl);
});

B.test('勘で当たった: 記録の付け替え・解き直しの予定・再読み込みと戻る・#quiz/due の行', async (t) => {
  const p = await t.open('home');
  const info = await p.evaluate(() => { const q = APP_DATA.quiz.find((x) => x.style === 'combo'); return { id: q.id, correct: q.correctIndex, cat: (Stats.categoryOf(q, 'takken') || {}).id, today: DateUtil.today(), plus3: DateUtil.addDays(DateUtil.today(), 3) }; });
  await p.go(`quiz/q/${info.id}`);
  const sel = `.quiz-card[data-quiz-id="${info.id}"]`;
  await p.waitForSelector(`${sel} .choice-btn`);
  await p.evaluate((s, i) => document.querySelectorAll(`${s} .choice-btn`)[i].click(), sel, info.correct);
  await p.waitForSelector(`${sel} [data-role="unsure"]`);
  let d = await p.get('answerDaily');
  t.eq(d[info.today][info.cat], [1, 0, 0], '正解は自信ありで記録');
  const chip = `${sel} [data-role="unsure"]`;
  let st = await p.evaluate((c) => ({ p: document.querySelector(c).getAttribute('aria-pressed'), desc: !!document.getElementById(document.querySelector(c).getAttribute('aria-describedby')) }), chip);
  t.ok(st.p === 'false' && st.desc, '最初は押されていない・説明つき', st);
  await p.evaluate((c) => document.querySelector(c).click(), chip);
  await p.waitFor((c) => document.querySelector(c).getAttribute('aria-pressed') === 'true', {}, chip);
  const s1 = await p.storage(['answerDaily', 'quizUnsure', 'quizRetry']);
  t.ok(JSON.stringify(s1.answerDaily[info.today][info.cat]) === '[0,1,0]' && s1.quizUnsure[info.id] === info.today && s1.quizRetry[info.id] && s1.quizRetry[info.id].due === info.plus3 && s1.quizRetry[info.id].step === 1, '押す → 自信なしへ・解き直し3日後', s1);
  await p.evaluate((c) => document.querySelector(c).click(), chip);
  await p.waitFor((c) => document.querySelector(c).getAttribute('aria-pressed') === 'false', {}, chip);
  const s2 = await p.storage(['answerDaily', 'quizUnsure']);
  t.ok(JSON.stringify(s2.answerDaily[info.today][info.cat]) === '[1,0,0]' && !(info.id in s2.quizUnsure), '外す → 自信ありに戻る', s2);
  await p.evaluate((c) => document.querySelector(c).click(), chip);
  await p.waitFor((c) => document.querySelector(c).getAttribute('aria-pressed') === 'true', {}, chip);
  await p.reload();
  t.ok(await p.waitFor((c) => { const e = document.querySelector(c); return e && e.getAttribute('aria-pressed') === 'true'; }, {}, chip), '再読み込みのあとも押された状態');
  await p.go('home');
  await p.back();
  t.ok(await p.waitFor((c) => { const e = document.querySelector(c); return e && e.getAttribute('aria-pressed') === 'true'; }, {}, chip), '戻ったあとも押された状態');
  await p.evaluate((c) => document.querySelector(c).click(), chip);
  await p.waitFor((c) => document.querySelector(c).getAttribute('aria-pressed') === 'false', {}, chip);
  d = await p.get('answerDaily');
  t.eq(d[info.today][info.cat], [1, 0, 0], '再読み込みのあとに外しても自信ありに戻る(タブの記録)');
  // #quiz/due: 卒業の行が「勘で当たった」で3日後に変わる
  const p2 = await t.open('home');
  const di = await p2.evaluate(() => { const st = APP_DATA.quiz.filter((x) => x.style); const y = DateUtil.addDays(DateUtil.today(), -1); return { a: st[2].id, b: st[3].id, ca: st[2].correctIndex, cb: st[3].correctIndex, y }; });
  await p2.evaluate((x) => localStorage.setItem('shojikiLearn.v1.quizRetry', JSON.stringify({ [x.a]: { step: 3, due: x.y, at: x.y, src: 'quiz' }, [x.b]: { step: 1, due: x.y, at: x.y, src: 'quiz' } })), di);
  await p2.go('quiz/due');
  const cards = await p2.evaluate(() => Array.from(document.querySelectorAll('.quiz-card')).map((c) => c.querySelectorAll('.stmt-item').length));
  t.ok(cards.length === 2 && cards.every((n) => n === 4), '解き直しにも記述ア〜エ', cards);
  for (const [id, ci, before] of [[di.a, di.ca, /卒業/], [di.b, di.cb, null]]) {
    const s = `.quiz-card[data-quiz-id="${id}"]`;
    if (id === di.b) { await p2.evaluate(() => { const n = document.querySelector('.quiz-steps > .quiz-card.is-current [data-role="next-q"], .quiz-steps > .quiz-card.is-current [data-role="due-next"]'); if (n) n.click(); }); await p2.waitFor((x) => { const e = document.querySelector(x); return e && e.classList.contains('is-current'); }, {}, s); }
    await p2.evaluate((x, i) => document.querySelectorAll(`${x} .choice-btn`)[i].click(), s, ci);
    await p2.waitForSelector(`${s} .drill-result`);
    if (before) t.ok(before.test(await p2.evaluate((x) => document.querySelector(`${x} .drill-result`).textContent, s)), '卒業の行');
    await p2.evaluate((x) => document.querySelector(`${x} [data-role="unsure"]`).click(), s);
    const line = await p2.waitFor((x) => { const tx = Array.from(document.querySelectorAll(`${x} .drill-result`)).map((e) => e.textContent).join(' / '); return /3日後/.test(tx) && !/卒業です/.test(tx) && tx; }, {}, s);
    t.ok(line, `勘で当たった → 行が「3日後」に変わる(${id === di.a ? '卒業していた問題' : 'step1 の問題'})`, line);
  }
  await p2.reload();
  const rl = await p2.evaluate(() => Array.from(document.querySelectorAll('.drill-result')).map((e) => e.textContent));
  t.ok(rl.length === 2 && rl.every((x) => /3日後/.test(x)), '再読み込みのあとも同じ行', rl);
});

B.test('通常の4択: 誤答の表示・正解で「勘で当たった」・自動生成の数字キーと Enter(PC)', async (t) => {
  const p = await t.open('quiz', { device: 'desktop', seed: { quizPrefs: { status: 'all', format: 'plain' } } });
  const id = await p.evaluate(() => document.querySelector('.quiz-card:not(.is-styled)').dataset.quizId);
  const sel = `.quiz-card[data-quiz-id="${id}"]`;
  await p.evaluate((s) => { const c = document.querySelector(s); const q = APP_DATA.quiz.find((z) => z.id === c.dataset.quizId); c.querySelectorAll('.choice-btn')[(q.correctIndex + 1) % 4].click(); }, sel);
  await p.waitFor((s) => document.querySelector(s).classList.contains('is-answered'), {}, sel);
  const r = await p.evaluate((s) => { const c = document.querySelector(s); return { notes: c.querySelectorAll('.choice-note').length, marks: c.querySelectorAll('.choice-note .ox-mark').length, verdict: c.querySelector('.quiz-verdict').textContent, next: !!c.querySelector('[data-role="next-q"]'), ai: !!c.querySelector('.ask-ai-btn'), chip: !!c.querySelector('[data-role="unsure"]'), stmts: !!c.querySelector('.stmt-list') }; }, sel);
  t.ok(r.notes === 4 && r.next && r.ai && !r.chip && !r.stmts && /不正解/.test(r.verdict), '誤答: 選択肢ごとの解説・AIに聞く・「勘で当たった」はない', r);
  await p.evaluate(() => { const n = document.querySelector('.quiz-steps > .quiz-card.is-current [data-role="next-q"]'); if (n) n.click(); });
  await p.waitFor(() => { const c = document.querySelector('.quiz-steps > .quiz-card.is-current'); return c && !c.classList.contains('is-answered'); });
  await answerCur(p, true);
  t.ok(await p.waitFor((c) => !!document.querySelector(c).querySelector('[data-role="unsure"]'), {}, CUR), '正解: 「勘で当たった」');
  await p.evaluate(() => document.querySelector('[data-mode="auto"]').click());
  await p.waitFor(() => document.querySelectorAll('.quiz-card').length > 0 && !document.querySelector('.quiz-card.is-answered') && !!document.querySelector('.quiz-card[data-term-id]'));
  await p.press('1');
  const a2 = await p.waitFor(() => document.querySelectorAll('.quiz-card.is-answered').length === 1 && document.activeElement && document.activeElement.dataset.role);
  t.ok(a2 === 'next-q', '自動生成: 数字キーで答える・フォーカスは「つづける」', a2);
  await p.press('Enter');
  t.ok(await p.waitFor(() => Array.from(document.querySelectorAll('.quiz-card')).indexOf(document.activeElement.closest('.quiz-card')) === 1), '自動生成: Enter で次のカード');
});

B.test('コントラスト(個数・組合せのカード・勘で当たった・○×の自信度・模擬試験の記述): ライト・ダーク', async (t) => {
  for (const dark of [false, true]) {
    const tag = dark ? 'ダーク' : 'ライト';
    const p = await t.open('home', { dark, seed: { themePreference: dark ? 'dark' : 'light' } });
    const ids = await p.evaluate(() => { const s = APP_DATA.quiz.filter((q) => q.style); return { a: s[0].id, ca: s[0].correctIndex }; });
    await p.go(`quiz/q/${ids.a}`);
    const sel = `.quiz-card[data-quiz-id="${ids.a}"]`;
    await p.waitForSelector(`${sel} .stmt-text`);
    await p.settle();
    let r = await p.evaluate(B.contrastOf, [`${sel} .source-tag-style`, `${sel} .stmt-label`, `${sel} .stmt-text`]);
    await p.evaluate((s, i) => document.querySelectorAll(`${s} .choice-btn`)[i].click(), sel, ids.ca);
    await p.waitForSelector(`${sel} .stmt-note`);
    await p.evaluate((s) => { const tg = document.querySelector(`${s} [data-role="explain-toggle"]`); if (tg && tg.getAttribute('aria-expanded') !== 'true') tg.click(); }, sel);
    await p.settle();
    r = r.concat(await p.evaluate(B.contrastOf, [`${sel} .stmt-item.is-true .stmt-label`, `${sel} .stmt-item.is-false .stmt-label`, `${sel} .stmt-item.is-true .stmt-truth`, `${sel} .stmt-item.is-false .stmt-truth`, `${sel} .stmt-note`, `${sel} .quiz-unsure-chip`, `${sel} .quiz-unsure-help`, `${sel} .choice-list-styled .choice-btn.correct .choice-text`, `${sel} .choice-list-styled .choice-btn.is-done:not(.correct) .choice-text`, `${sel} .ask-ai-btn`]));
    await p.evaluate((s) => document.querySelector(`${s} [data-role="unsure"]`).click(), sel);
    await p.settle();
    r = r.concat(await p.evaluate(B.contrastOf, [`${sel} .quiz-unsure-chip[aria-pressed="true"]`]));
    const names = await p.evaluate((s) => { const c = document.querySelector(s); const list = c.querySelector('.stmt-list'); const lv = c.querySelector('[data-role="verdict-live"]'); return { label: list.getAttribute('aria-label'), live: !!lv && (lv.getAttribute('role') === 'status' || !!lv.getAttribute('aria-live')) }; }, sel);
    t.ok(names.label && names.live, `${tag}: 記述の一覧の名前・判定の読み上げ`, names);
    // ○×(自信度つき)
    await p.evaluate(() => localStorage.setItem('shojikiLearn.v1.oxPrefs', JSON.stringify({ scope: { type: 'all', id: null }, filter: 'all', count: 10, autoNext: false, confidence: true })));
    await p.goto('index.html?r=2#ox');
    await p.waitApp();
    await p.waitForSelector('.ox-confidence-help');
    await p.settle();
    r = r.concat(await p.evaluate(B.contrastOf, ['.ox-confidence-help', '.ox-auto-next']));
    await p.go(`ox/quiz/${ids.a}`);
    await p.waitForSelector('.ox-btn-conf.is-sure .ox-btn-label');
    await p.settle();
    r = r.concat(await p.evaluate(B.contrastOf, ['.ox-stmt-label', '.ox-btn-conf.is-sure .ox-btn-label', '.ox-btn-conf.is-maybe .ox-btn-label', '.ox-context']));
    await p.evaluate(() => { const s = Views.ox._internal.getSession(); const tr = s.items[s.index].truth; localStorage.removeItem('shojikiLearn.v1.quizRetry'); document.querySelector(`.ox-btn[data-level="${tr ? 2 : 3}"]`).click(); });
    await p.waitForSelector('.ox-unsure-line a');
    await p.settle();
    r = r.concat(await p.evaluate(B.contrastOf, ['.ox-btn-tag', '.ox-unsure-line a', '.ox-unsure-line span', '.ox-result .ask-ai-btn']));
    // 模擬試験の個数・組合せの記述
    await p.evaluate(() => { const E = Views.exam._internal; const s = E.createSession('short', false); s.questions.forEach((q, i) => { if (q.style) s.current = i; }); localStorage.setItem('shojikiLearn.v1.examSession', JSON.stringify(s)); });
    await p.go('exam/run');
    await p.waitForSelector('.exam-stmt-text');
    await p.settle();
    r = r.concat(await p.evaluate(B.contrastOf, ['.exam-stmt-label', '.exam-stmt-text']));
    r.forEach((x) => t.ok(!x.missing && x.ratio >= x.need, `${tag} ${x.sel.replace(/\.quiz-card\[[^\]]+\] /, '')} のコントラスト ≥${x.need}`, x));
    t.log(tag, r.map((x) => `${x.sel.replace(/\.quiz-card\[[^\]]+\] /, '')}=${x.ratio}`).join(' | '));
    await p.close();
  }
});

B.run();
