// 初回ガイド(ブラウザ): 誰に出すか(新しい利用者・途中で閉じた・前の版の利用者・記録のある古い利用者・自動で書く記録だけ)と
// お知らせ(WHATS_NEW)のカード・キー操作とマスコット・目標の試験の日付(試験の前は公式の日付、後は見込みの日付)・
// 「まず1問」(AIに聞く・勘で当たったは出さない)
// 元: scratchpad audit7/T5 t1_onboarding.js・t4_askai_ui.js(初回ガイド)・r7/E3 e3_behave.js(初回ガイド)・r6/w6 t_misc.js(初回ガイド)
'use strict';
const B = require('../lib/browser.js');

const goNext = (p) => p.evaluate(() => document.querySelector('.onb-overlay [data-role="next"]').click());
const step = (p, sel) => p.waitFor((s) => !!document.querySelector(s), { timeout: 8000 }, sel);

B.test('誰に出すか: 新しい利用者・途中で閉じて開き直し・スキップ・前の版の利用者(お知らせ)・記録のある古い利用者・自動の記録だけ', async (t) => {
  const W = t.env.info.whatsNew;
  // A: 新しい利用者
  const ctxA = await t.context();
  let p = await t.open('', { fresh: true, context: ctxA });
  t.ok(await step(p, '.onb-overlay.onb-first'), 'A 新しい利用者に初回ガイド');
  await goNext(p);
  await step(p, '[data-goal="takken"]');
  await p.evaluate(() => document.querySelector('[data-goal="takken"]').click());
  await goNext(p);
  await p.close();
  p = await t.open('', { fresh: true, context: ctxA });
  t.ok(await step(p, '.onb-overlay.onb-first'), 'A 目的だけ選んで閉じた → 開き直しても初回ガイド');
  await p.evaluate(() => document.querySelector('.onb-overlay [data-role="skip"]').click());
  t.ok(await p.waitFor(() => !document.querySelector('.onb-overlay')), 'A スキップで閉じる');
  t.ok(!(await p.exists('.home-news')), 'A 新しい利用者にはお知らせのカードを出さない');
  await p.reload();
  t.ok(!(await p.exists('.onb-overlay')) && !(await p.exists('.home-news')), 'A 再読み込み: 初回ガイドもお知らせも出ない');
  // B: 前の版の利用者(初回ガイド済み・お知らせは前の版・記録あり)
  p = await t.open('', { fresh: true, seed: { onboardingDone: { v: 2, at: 1 }, seenWhatsNew: 'v11', quizHistory: { [`quiz-K-01`]: 'ok' }, activityLog: { '2026-10-10': 3 }, schemaVersion: 2 } });
  t.ok(!(await p.exists('.onb-overlay')), 'B 前の版の利用者: 初回ガイドなし');
  // v14 の新しい機能の数はデータから数える(公開版では詳細が届いてから。届いたらカードを作り直す)
  const counts = await p.evaluate(() => ({ exams: APP_DATA.frequency.exams.length, numbers: APP_DATA.numbers.length, tables: APP_DATA.compareTables.length, joubun: APP_DATA.joubun.items.length }));
  const newsText = () => p.waitFor((c) => { const e = document.querySelector('.home-news'); const x = e && e.textContent.replace(/\s+/g, ' '); return x && x.includes(`数字${c.numbers}項目`) && x; }, {}, counts);
  const news = await newsText();
  t.ok(news && /新しくなりました/.test(news) && /出題頻度ランク/.test(news) && /数字まとめドリル/.test(news) && /比較表/.test(news) && /今日のチャレンジ/.test(news) && /条文穴埋め/.test(news), 'B お知らせのカード(v14 の5つの機能)', news && news.slice(0, 400));
  t.ok(news && news.includes(`過去${counts.exams}回`) && news.includes(`${counts.tables}枚`) && news.includes(`条文${counts.joubun}項目`), 'B v14 の数はデータから(本試験の回数・比較表の枚数・条文の項目数)', { counts, news: news && news.slice(0, 400) });
  const links = await p.evaluate(() => Array.from(document.querySelectorAll('.home-news a')).map((a) => a.getAttribute('href')));
  t.ok(['#freq', '#numbers', '#compare', '#challenge', '#joubun', '#progress/level'].every((h) => links.includes(h)), 'B 5つの機能はそれぞれの画面へのリンク', links);
  t.ok(news && /法律の全体/.test(news) && /個数問題/.test(news) && /約\d{1,3},\d{3}問/.test(news), 'B v11 から直接更新した人には v13 の消費税法・個数問題・約1,000問(3桁区切り)も1行で案内', news && news.slice(0, 600));
  t.ok(news && /合格予測/.test(news) && /学習計画/.test(news), 'B …v12 の合格予測・学習計画も1行で案内', news && news.slice(0, 600));
  await p.evaluate(() => document.querySelector('.home-news [data-role="dismiss"]').click());
  await p.waitFor(() => !document.querySelector('.home-news'));
  await p.reload();
  t.ok(!(await p.exists('.home-news')) && (await p.get('seenWhatsNew')) === W, `B 閉じたら次から出さない(seenWhatsNew = ${W})`);
  // B2: v12 のお知らせを見た利用者には、v12 の機能の行は出さない
  p = await t.open('', { fresh: true, seed: { onboardingDone: { v: 2, at: 1 }, seenWhatsNew: 'v12', quizHistory: { [`quiz-K-01`]: 'ok' }, schemaVersion: 2 } });
  const news12 = await newsText();
  t.ok(news12 && /出題頻度ランク/.test(news12) && /法律の全体/.test(news12) && !/合格予測/.test(news12), 'B2 v12 から更新した人: v14 と v13 の点(合格予測の行なし)', news12 && news12.slice(0, 600));
  // B3: v13 のお知らせを見た利用者には、v14 の点だけ
  p = await t.open('', { fresh: true, seed: { onboardingDone: { v: 2, at: 1 }, seenWhatsNew: 'v13', quizHistory: { [`quiz-K-01`]: 'ok' }, schemaVersion: 2 } });
  const news13 = await newsText();
  t.ok(news13 && /条文穴埋め/.test(news13) && !/法律の全体/.test(news13) && !/合格予測/.test(news13), 'B3 v13 から更新した人: v14 の点だけ', news13 && news13.slice(0, 600));
  // C: 記録のある古い利用者(初回ガイドの記録がない)
  p = await t.open('', { fresh: true, seed: { flashcards: { basicA01: true } } });
  t.ok(!(await p.exists('.onb-overlay')), 'C 記録のある古い利用者: 初回ガイドなし');
  t.ok(await p.waitForSelector('.home-news'), 'C …お知らせのカードは出す');
  t.ok(!!(await p.get('onboardingDone')), 'C …初回ガイド済みを記録');
  // D: 起動で自動に書く記録だけ(初回ガイドを終えていない)
  p = await t.open('', { fresh: true, seed: { studyTime: { '2026-10-14': 95 }, studyTimeLock: { tab: 'tx', at: 1 }, badges: { seeded: true, at: {} }, dailyGoal: { kind: 'actions', value: 10 }, answerPrefs: { aiButton: true }, predictPrefs: {}, planPrefs: {}, schemaVersion: 2, srsMigrated: true, learnerProfile: { goal: 'takken', interests: [], at: 1 }, themePreference: 'dark', goalDays: {}, drillStats: {} } });
  t.ok(await step(p, '.onb-overlay.onb-first'), 'D 自動で書く記録だけなら初回ガイドを出す');
});

B.test('キー操作とマスコット: 見出しにフォーカス・目的は矢印キー・「まず1問」で顔とひとこと・戻って進むと元どおり(iPhone・320×568)', async (t) => {
  for (const device of ['iphone', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true }]) {
    const tag = typeof device === 'string' ? device : '320x568';
    const p = await t.open('', { fresh: true, device });
    await step(p, '.onb-overlay');
    await p.settle();
    const w = await p.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, mascot: !!document.querySelector('.onb-say.is-hero .mascot[aria-hidden="true"]'), small: (() => { const o = []; document.querySelectorAll('.onb-overlay button').forEach((b) => { if (!b.getClientRects().length) return; const r = b.getBoundingClientRect(); if (r.height < 43.5) o.push(`${b.className} ${Math.round(r.height)}`); }); return o; })() }));
    t.ok(w.focus === 'onb-title' && w.mascot && w.small.length === 0, `${tag}: 見出しにフォーカス・マスコットは読み上げない・ボタン44px以上`, w);
    await goNext(p);
    await step(p, '[data-goal="takken"]');
    await p.focus('[data-goal="takken"]');
    await p.press('ArrowDown');
    const g = await p.waitFor(() => { const c = Array.from(document.querySelectorAll('[data-goal]')).filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.goal); return c.length === 1 && c[0] === (document.activeElement && document.activeElement.dataset.goal) && c[0]; });
    t.eq(g, 'life', `${tag}: 矢印キーで目的(ラジオ)を選ぶ`);
    await p.focus('[data-goal="takken"]');
    await p.press('Space');
    await p.waitFor(() => document.querySelector('[data-goal="takken"]').getAttribute('aria-checked') === 'true');
    await goNext(p);
    await step(p, '[data-role="date-form"], .onb-official');
    await goNext(p); // あとで設定する
    await step(p, '.onb-overlay .quiz-card .choice-list button');
    await p.settle();
    const before = await p.evaluate(() => ({ cls: document.querySelector('.onb-say .mascot').getAttribute('class'), react: document.querySelector('[data-role="react"]').hidden }));
    await p.evaluate(() => {
      const card = document.querySelector('.onb-overlay .quiz-card');
      const q = APP_DATA.quiz.find((x) => x.id === card.dataset.quizId);
      const mq = QuizEngine.fromFixedMc(q, { keepOrder: true });
      card.querySelectorAll('.choice-list button')[mq.choices.findIndex((c) => !c.correct)].click();
    });
    await p.waitForSelector('.onb-overlay .quiz-feedback.is-shown');
    await p.settle();
    const after = await p.evaluate(() => {
      const fb = document.querySelector('.onb-overlay .quiz-feedback.is-shown');
      const r = fb.getBoundingClientRect();
      const body = document.querySelector('.onb-body').getBoundingClientRect();
      return { cls: document.querySelector('.onb-say .mascot').getAttribute('class'), react: document.querySelector('[data-role="react"]').textContent, hidden: document.querySelector('[data-role="react"]').hidden, title: document.querySelector('#onb-title').textContent, fbVisible: r.top < body.bottom && r.bottom <= body.bottom + 1, fbText: fb.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), secondary: document.querySelector('.onb-next').classList.contains('btn-secondary') };
    });
    t.ok(/mascot-normal/.test(before.cls) && before.react && /mascot-think/.test(after.cls) && !after.hidden && /解説/.test(after.react) && after.title === 'まずは1問、解いてみましょう', `${tag}: 「まず1問」で間違えると考える顔とひとこと`, { before, after });
    t.ok(after.fbVisible && /おしい/.test(after.fbText) && after.secondary === false, `${tag}: 判定のバーがガイドの中に見える・次へは主ボタン`, after);
    await p.evaluate(() => document.querySelector('.onb-overlay [data-role="prev"]').click());
    await step(p, '[data-role="date-form"], .onb-official');
    await goNext(p);
    const back = await p.waitFor(() => !!document.querySelector('.onb-overlay .quiz-card.is-answered') && { cls: document.querySelector('.onb-say .mascot').getAttribute('class'), react: document.querySelector('[data-role="react"]').textContent });
    t.ok(back && /mascot-think/.test(back.cls) && /解説/.test(back.react), `${tag}: 戻って進むと答えた状態と顔が戻る`, back);
    await p.close();
  }
});

B.test('目標の試験の日付: 試験の後(2026-10-19)は見込みの日付で登録・「まず1問」に AIに聞く/勘で当たった は出さない・ホームに見込み', async (t) => {
  for (const [device, dark] of [['iphone', false], ['desktop', true]]) {
    const tag = `${device}${dark ? ' dark' : ''}`;
    const p = await t.open('', { fresh: true, device, dark, date: '2026-10-19T12:00:00+09:00' });
    await step(p, '.onb-overlay');
    t.eq(await p.evaluate(() => DateUtil.today()), '2026-10-19', `${tag}: 端末の日付`);
    await goNext(p);
    await step(p, '[data-goal="takken"]');
    await p.evaluate(() => document.querySelector('.onb-overlay [data-goal="takken"]').click());
    await goNext(p);
    await step(p, '.onb-expected');
    const setup = await p.evaluate(() => ({
      officials: document.querySelectorAll('.onb-official:not(.onb-expected)').length,
      expected: Array.from(document.querySelectorAll('.onb-expected')).map((b) => ({ text: b.textContent.replace(/\s+/g, ' ').trim(), date: b.dataset.date })),
      note: (document.querySelector('#onb-expected-note') || {}).textContent || '', other: !!document.querySelector('[data-role="other-date"]'), formHidden: document.querySelector('[data-role="date-form"]').hidden,
    }));
    t.ok(setup.officials === 0 && setup.expected.length === 1 && setup.expected[0].date === '2027-10-17' && /令和9年度試験\(見込み・未発表\)/.test(setup.expected[0].text) && /2027年10月17日\(日\)で登録/.test(setup.expected[0].text), `${tag}: 公式の日付はなく、見込みの日付を出す`, setup);
    t.ok(/見込み・未発表\(例年10月第3日曜\)/.test(setup.note) && setup.other && setup.formHidden, `${tag}: 見込みの説明・ほかの日付のボタン`, setup);
    t.ok(!(await p.overflow()), `${tag}: はみ出しなし`);
    await p.click('.onb-expected');
    const tg = await p.waitFor(() => { const v = JSON.parse(localStorage.getItem('shojikiLearn.v1.examTargets') || 'null'); return Array.isArray(v) && v.length ? v : null; });
    t.ok(tg && tg.length === 1 && tg[0].date === '2027-10-17' && tg[0].tentative === true && tg[0].primary === true, `${tag}: 見込みの目標として登録`, tg);
    await step(p, '.onb-step-question .choice-list button');
    await p.evaluate(() => document.querySelector('.onb-overlay .choice-list button').click());
    await p.waitForSelector('.onb-overlay .quiz-feedback.is-shown');
    const hid = await p.evaluate(() => { const vis = (sel) => Array.from(document.querySelectorAll(`.onb-overlay ${sel}`)).some((e) => e.getClientRects().length > 0); return { ai: vis('.quiz-ask-ai'), aiBtn: vis('.ask-ai-btn'), unsure: vis('.quiz-unsure') }; });
    t.ok(!hid.ai && !hid.aiBtn && !hid.unsure, `${tag}: 「まず1問」では AIに聞く・勘で当たった を出さない`, hid);
    await p.evaluate(() => document.querySelector('.onb-overlay [data-role="prev"]').click());
    const reg = await p.waitFor(() => { const s = document.querySelector('.onb-status'); return s && s.textContent; });
    t.ok(/2027年10月17日\(日\)\(見込み\)/.test(reg || ''), `${tag}: 戻ると「(見込み)」で登録済み`, reg);
    await goNext(p);
    await step(p, '.onb-step-question');
    await goNext(p); // ホームへ
    const home = await p.waitFor(() => !document.querySelector('.onb-overlay') && Router.current() === 'home' && ((document.querySelector('.home-view') || {}).textContent || ''));
    t.ok(home && /見込み/.test(home), `${tag}: ホームに見込みの目標`);
    await p.close();
  }
});

B.test('目標の試験の日付: 試験の前(2026-10-14)は公式の日付だけ・税理士は日付の入力欄', async (t) => {
  const p = await t.open('', { fresh: true });
  await step(p, '.onb-overlay');
  await goNext(p);
  await step(p, '[data-goal="takken"]');
  await p.evaluate(() => document.querySelector('.onb-overlay [data-goal="takken"]').click());
  await goNext(p);
  await step(p, '.onb-official');
  const s = await p.evaluate(() => ({ off: document.querySelectorAll('.onb-official:not(.onb-expected)').length, exp: document.querySelectorAll('.onb-expected').length, text: (document.querySelector('.onb-official') || {}).textContent }));
  t.ok(s.off === 1 && s.exp === 0 && /令和8年度/.test(s.text), '宅建: 公式の日付(令和8年度)だけ', s);
  await p.evaluate(() => document.querySelector('.onb-overlay [data-role="prev"]').click());
  await step(p, '[data-goal="zeirishi"]');
  await p.evaluate(() => document.querySelector('.onb-overlay [data-goal="zeirishi"]').click());
  await goNext(p);
  t.ok(await p.waitFor(() => { const f = document.querySelector('[data-role="date-form"]'); return f && !f.hidden; }), '税理士: 日付の入力欄');
});

B.run();
