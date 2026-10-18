// 「AIに聞く」(ブラウザ): 4択・個数問題・○×(記述ア)・模擬試験の結果から質問文を作ってコピー(クリップボード → execCommand →
// 手で選ぶ、の順に代わりの方法)・リンクはトップページだけ(? や # なし・新しいタブ・noopener noreferrer)・個人の情報を入れない・
// 設定でオフ・CSP の違反と外部への通信がない
// 元: scratchpad audit7/T5 t4_askai_ui.js(初回ガイドの部分は onboarding.test.js)
'use strict';
const B = require('../lib/browser.js');

const ASK_LINKS = ['https://chatgpt.com/', 'https://claude.ai/', 'https://gemini.google.com/', 'https://laws.e-gov.go.jp/'];
const SHEET = () => {
  const s = document.querySelector('.ask-ai-sheet');
  if (!s) return null;
  const ta = s.querySelector('textarea');
  return {
    links: Array.from(s.querySelectorAll('a[href]')).map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })),
    text: ta.value, status: s.querySelector('.ask-ai-status').textContent.trim(), open: s.querySelector('details').open,
    sel: document.activeElement === ta ? [ta.selectionStart, ta.selectionEnd, ta.value.length] : null, buffers: document.querySelectorAll('.ask-ai-buffer').length,
  };
};
const copied = (p) => p.waitFor(() => { const s = document.querySelector('.ask-ai-status'); return s && /コピーしました|コピーできませんでした/.test(s.textContent) && !/しています/.test(s.textContent); }, { timeout: 5000 });
const clip = (p) => p.evaluate(() => navigator.clipboard.readText().then((x) => x.split(String.fromCharCode(13)).join('')).catch((e) => `ERR ${e.message}`));
const closeSheet = async (p) => { await p.press('Escape'); await p.waitFor(() => !document.querySelector('.ask-ai-sheet')); };

B.test('4択(誤答): 質問文をコピー・シートのリンク・個人の情報なし・コピーし直し・代わりの方法(execCommand・手で選ぶ)', async (t) => {
  const p = await t.open('home', { clipboard: true, seed: { examTargets: [{ id: 'et_x', name: 'TESTNAME<b>', examTypeId: 'takken', date: '2031-10-19', primary: true, createdAt: 1 }], learnerProfile: { goal: 'takken', interests: [], at: 1 } } });
  const id = await p.evaluate(() => (APP_DATA.quiz.find((x) => x.id === 'quiz-K-01') || APP_DATA.quiz.find((x) => QuizEngine.isMcItem(x) && !x.style)).id);
  const card = `[data-quiz-id="${id}"]`;
  await p.go(`quiz/q/${id}`);
  await p.waitForSelector(`${card} .choice-list button`);
  const wrongIdx = await p.evaluate((x) => { const q = APP_DATA.quiz.find((z) => z.id === x); return (q.correctIndex + 2) % 4; }, id);
  await p.click(`${card} .choice-list button`, wrongIdx);
  await p.waitForSelector(`${card} .ask-ai-btn`);
  await p.click(`${card} .ask-ai-btn`);
  t.ok(await copied(p), 'シートが開いてコピーの結果が出る');
  let st = await p.evaluate(SHEET);
  const expected = await p.evaluate((x, i) => AskAi.buildPrompt({ kind: 'quiz', quizId: x, picked: i }), id, wrongIdx);
  t.ok(st.status === '質問文をコピーしました' && (await clip(p)) === expected && st.text === expected, 'クリップボードにコピー(シートの文と同じ)', st.status);
  t.ok(expected.includes(`【私の解答】\n${wrongIdx + 1}. `) && /【正解】/.test(expected), '質問文に問題・私の解答・正解');
  t.ok(!/TESTNAME|2031|et_x/.test(expected), '目標の試験などの個人の情報は入れない');
  t.eq(st.links.map((l) => l.href).sort(), ASK_LINKS.slice().sort(), 'リンクは ChatGPT・Claude・Gemini・e-Gov のトップページ');
  t.ok(st.links.every((l) => !/[?#]/.test(l.href) && l.target === '_blank' && /\bnoopener\b/.test(l.rel) && /\bnoreferrer\b/.test(l.rel)), 'リンクに問い合わせの文字列なし・新しいタブ・noopener noreferrer', st.links);
  t.eq(st.buffers, 0, 'コピー用の入れ物は残さない');
  await p.evaluate(() => navigator.clipboard.writeText('x'));
  await p.click('.ask-ai-sheet [data-role="recopy"]');
  t.ok(await p.waitFor(async (e) => (await navigator.clipboard.readText()).split(String.fromCharCode(13)).join('') === e, {}, expected), 'コピーし直し');
  await closeSheet(p);
  // 代わり1: クリップボードの API が断る → execCommand
  await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
  await p.click(`${card} .ask-ai-btn`);
  await copied(p);
  st = await p.evaluate(SHEET);
  t.ok(st.status === '質問文をコピーしました' && (await clip(p)) === expected && st.buffers === 0, 'API が使えないときは execCommand でコピー', st.status);
  await closeSheet(p);
  // 代わり2: どちらもだめ → 質問文を開いて全部選ぶ
  await p.evaluate(() => { document.execCommand = () => false; });
  await p.click(`${card} .ask-ai-btn`);
  await copied(p);
  st = await p.evaluate(SHEET);
  t.ok(st.status === '自動でコピーできませんでした' && st.open && st.sel && st.sel[0] === 0 && st.sel[1] === st.sel[2], 'コピーできないときは質問文を開いて全部選ぶ', { status: st.status, open: st.open, sel: st.sel });
  await closeSheet(p);
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
  await p.click(`${card} .ask-ai-btn`);
  await copied(p);
  st = await p.evaluate(SHEET);
  t.ok(st.status === '自動でコピーできませんでした' && st.open, 'クリップボードの API がない端末でも同じ', st.status);
  await closeSheet(p);
  t.eq(await p.evaluate(() => window.__cspv), [], 'CSP の違反なし');
});

B.test('個数問題(正解)・○×の記述ア・模擬試験の結果: データの順の質問文・私の解答', async (t) => {
  const p = await t.open('home', { clipboard: true });
  const cq = await p.evaluate(() => { const q = APP_DATA.quiz.find((x) => x.style === 'count'); return { id: q.id, c: q.correctIndex }; });
  await p.go(`quiz/q/${encodeURIComponent(cq.id)}`);
  await p.waitForSelector(`[data-quiz-id="${cq.id}"] .choice-list button`);
  await p.click(`[data-quiz-id="${cq.id}"] .choice-list button`, cq.c);
  await p.waitForSelector(`[data-quiz-id="${cq.id}"] .ask-ai-btn`);
  // 正解のときは解説(AIに聞くを含む)が閉じているので開く
  await p.evaluate((x) => { const tg = document.querySelector(`[data-quiz-id="${x}"] [data-role="explain-toggle"]`); if (tg && tg.getAttribute('aria-expanded') !== 'true') tg.click(); }, cq.id);
  await p.click(`[data-quiz-id="${cq.id}"] .ask-ai-btn`);
  await copied(p);
  let st = await p.evaluate(SHEET);
  const exp2 = await p.evaluate((o) => AskAi.buildPrompt({ kind: 'quiz', quizId: o.id, picked: o.c }), cq);
  t.ok(st.text === exp2 && /【記述】\nア /.test(st.text) && /ほかの選択肢/.test(st.text), '個数問題: 記述ア〜エとほかの選択肢を入れた質問文');
  await closeSheet(p);
  // ○×: 組合せ問題の記述ア(#ox/weak/<ID#s0>)に○と答える
  const oxId = await p.evaluate(() => {
    const q = APP_DATA.quiz.find((x) => x.style === 'combo');
    const s = QuizEngine.statementsFrom(q)[0];
    localStorage.setItem('shojikiLearn.v1.oxStats', JSON.stringify({ [s.id]: { c: 0, w: 1, last: '2026-10-01', lastOk: false } }));
    return s.id;
  });
  await p.go(`ox/weak/${encodeURIComponent(oxId)}`);
  await p.waitForSelector('.ox-view .ox-btn[data-answer="o"], .ox-view .ox-btn');
  await p.evaluate(() => (document.querySelector('.ox-view [data-answer="o"]') || document.querySelector('.ox-view .ox-btn')).click());
  t.ok(await p.waitForSelector('.ox-ask-ai .ask-ai-btn'), '○×: AIに聞くのボタン');
  await p.evaluate(() => { const tg = document.querySelector('[data-role="explain-toggle"]'); if (tg && tg.getAttribute('aria-expanded') !== 'true') tg.click(); });
  await p.click('.ox-ask-ai .ask-ai-btn');
  await copied(p);
  st = await p.evaluate(SHEET);
  const exp3 = await p.evaluate((x) => { const s = QuizEngine.allStatements().find((z) => z.id === x); return AskAi.buildPrompt({ kind: 'ox', quizId: s.quizId, stmtKey: x, picked: true }); }, oxId);
  t.ok(st.text === exp3 && /【私の解答】\n○\(正しい\)/.test(st.text) && /記述ア: /.test(st.text), '○×: ○と答えた質問文(記述ア)');
  await closeSheet(p);
  // 模擬試験の結果(選んだ番号は表示の順 → データの順)
  const examId = await p.evaluate(() => {
    const E = Views.exam._internal;
    const s = E.createSession('full', true);
    s.answers = s.questions.map((q, i) => (i % 4 === 0 ? null : i % 3 ? q.correctIndex : (q.correctIndex + 1) % q.choices.length));
    const entry = E.gradeSession(s, s.startedAt + 1200000);
    localStorage.setItem('shojikiLearn.v1.examHistory', JSON.stringify([entry]));
    return entry.id;
  });
  await p.go(`exam/result/${examId}`);
  await p.waitForSelector('.exam-result');
  t.ok(await p.waitFor(() => document.querySelectorAll('.exam-ask .ask-ai-btn').length > 0), '模擬試験の結果: 問題ごとに AIに聞く');
  const slot = await p.evaluate(() => {
    const s = Array.from(document.querySelectorAll('.exam-ask[data-ask]')).find((x) => x.dataset.picked !== '' && x.querySelector('.ask-ai-btn'));
    for (let el = s; el; el = el.parentElement) { if (el.tagName === 'DETAILS') el.open = true; if (el.hidden) el.hidden = false; }
    s.querySelector('.ask-ai-btn').id = 'ask-target';
    return { quizId: s.dataset.ask, picked: s.dataset.picked };
  });
  await p.click('#ask-target');
  await copied(p);
  st = await p.evaluate(SHEET);
  const v = await p.evaluate((x) => { const q = APP_DATA.quiz.find((z) => z.id === x); return { choices: q.choices }; }, slot.quizId);
  const mine = (st.text.match(/【私の解答】\n([^\n]+)/) || [])[1];
  t.ok(mine === `${Number(slot.picked) + 1}. ${v.choices[Number(slot.picked)]}` && /模擬試験で解いた/.test(st.text), '模擬試験: 私の解答はデータの順の選択肢', { slot, mine });
  await closeSheet(p);
  const bad = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.exam-ask[data-ask]').forEach((s) => {
      const pk = s.dataset.picked;
      if (pk === '' || pk === undefined) return;
      const q = APP_DATA.quiz.find((x) => x.id === s.dataset.ask);
      const item = s.closest('li, .exam-wrong-item, details, article') || s.parentElement;
      if (!(item ? item.textContent : '').includes(String(q.choices[Number(pk)]).slice(0, 12))) out.push(`${s.dataset.ask}:${pk}`);
    });
    return out;
  });
  t.eq(bad, [], '模擬試験: どの問題も、選んだ番号(データの順)の選択肢がその問題の表示にある');
  t.eq(await p.evaluate(() => window.__cspv), [], 'CSP の違反なし');
});

B.test('設定でオフにすると4択にボタンを出さない', async (t) => {
  const p = await t.open('home', { seed: { answerPrefs: { aiButton: false } } });
  const id = await p.evaluate(() => APP_DATA.quiz.find((x) => QuizEngine.isMcItem(x) && !x.style).id);
  await p.go(`quiz/q/${id}`);
  await p.waitForSelector(`[data-quiz-id="${id}"] .choice-list button`);
  await p.click(`[data-quiz-id="${id}"] .choice-list button`, 0);
  await p.waitFor((x) => document.querySelector(`[data-quiz-id="${x}"]`).classList.contains('is-answered'), {}, id);
  await p.settle();
  t.ok(!(await p.exists('.ask-ai-btn')), 'オフ → AIに聞くのボタンなし');
});

B.run();
