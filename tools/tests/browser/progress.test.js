// 進捗・計画・設定まわり(ブラウザ): 押せる大きさ(44px)とはみ出し・#progress/〜 のジャンプ・バッジのメダル(キーボード)・
// 合格予測(5問免除のスイッチ)・弱点分析の切り替え・学習計画(道と今週やること)・テーマの切り替え・メニューから学習計画・
// 設定(1日の目標の入力チェックと保存・ホームの輪・AIに聞くのスイッチ・目標の試験の「見込み」)・試験の後(2026-10-19)の表示
// 元: scratchpad r7/E3 e3_behave.js・r6/w6 t_misc.js(設定・メニュー)・tools/smoke.js の試験の後の確認(画面の中身を足した)
'use strict';
const B = require('../lib/browser.js');
const S = require('../fixtures/seeds.js');

// 押せる部品で 44px 未満のもの(文中のリンク・::after で広げた札は除く)
const SMALL = () => {
  const out = [];
  document.querySelectorAll('#view-root a, #view-root button, #view-root summary, #view-root label.btn, .onb-overlay a, .onb-overlay button, .sheet button, .sheet a, .sheet summary').forEach((el) => {
    if (el.closest('[hidden]') || !el.getClientRects().length) return;
    if (el.closest('p, li > span, .prog-note, .calc-note, .ana-how li, .about-section li, .about-section p, .hero-note, .item-meta')) return;
    if (el.classList.contains('chip-small')) return;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName}.${String(el.className).split(' ').slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${el.textContent.trim().slice(0, 14)}"`);
  });
  return out;
};

B.test('進捗・計画・設定・メニュー・このアプリについて: 押せる部品は44px以上・はみ出しなし・#progress/〜 のジャンプ(iPhone・320px・PC)', async (t) => {
  for (const device of ['iphone', 'w320', 'desktop']) {
    const p = await t.open('home', { device, seedFn: S.rich });
    for (const h of ['progress', 'plan', 'settings', 'more', 'about']) {
      await p.go(h);
      await p.settle();
      t.eq(await p.evaluate(SMALL), [], `${device} #${h}: 押せる部品は44px以上`);
      t.ok(!(await p.overflow()), `${device} #${h}: はみ出しなし`);
    }
    if (device === 'w320') continue;
    for (const [h, sel] of [['progress/badges', '#progress-badges'], ['progress/predict', '#progress-predict'], ['progress/time', '#progress-time'], ['progress/weak', '#progress-weak']]) {
      await p.go(h);
      const top = await p.stable((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }, {}, sel);
      t.ok(top != null && top >= -2 && top < 140, `${device} #${h}: そのカードまでスクロール`, top);
    }
    await p.close();
  }
});

B.test('バッジ(最初の選択・キーボードで選ぶ)・合格予測(5問免除のスイッチ)・弱点分析の切り替え・学習計画の道・テーマの切り替え', async (t) => {
  const p = await t.open('progress/badges', { seedFn: S.rich });
  await p.waitForSelector('.badge-btn[aria-pressed="true"]');
  const b0 = await p.evaluate(() => {
    const pressed = Array.from(document.querySelectorAll('.badge-btn[aria-pressed="true"]'));
    const d = document.querySelector('[data-role="badge-detail"]');
    return { n: pressed.length, name: pressed[0] && pressed[0].querySelector('.badge-name').firstChild.textContent, detail: d.textContent.replace(/\s+/g, ' ').trim(), live: d.getAttribute('aria-live'), locked: document.querySelectorAll('.badge-item.is-locked').length, pb: document.querySelectorAll('.badge-item.is-locked [role="progressbar"]').length, earned: document.querySelectorAll('.badge-item.is-earned').length, defs: Badges.DEFS.length };
  });
  t.ok(b0.n === 1 && b0.detail.includes(b0.name) && /次のバッジ/.test(b0.detail) && b0.live === 'polite', '最初は獲得に一番近いバッジを選び、欄に説明', b0);
  t.ok(b0.locked === b0.pb && b0.locked + b0.earned === b0.defs && b0.earned > 0, 'まだのバッジにはすべて進み具合のバー', b0);
  await p.focus('.badge-item.is-earned .badge-btn');
  await p.press('Enter');
  const b1 = await p.waitFor(() => { const btn = document.querySelector('.badge-item.is-earned .badge-btn'); return btn.getAttribute('aria-pressed') === 'true' && { others: document.querySelectorAll('.badge-btn[aria-pressed="true"]').length, detail: document.querySelector('[data-role="badge-detail"]').textContent.replace(/\s+/g, ' ').trim(), name: btn.querySelector('.badge-name').firstChild.textContent, focus: document.activeElement === btn }; });
  t.ok(b1 && b1.others === 1 && b1.detail.includes(b1.name) && /獲得済み/.test(b1.detail) && /に獲得/.test(b1.detail) && b1.focus, 'Enter で獲得済みのバッジを選ぶ(フォーカスはそのまま)', b1);
  await p.go('progress/predict');
  await p.waitForSelector('.pred-main');
  const p0 = await p.evaluate(() => ({ main: document.querySelector('.pred-main').textContent.replace(/\s+/g, ''), cats: Array.from(document.querySelectorAll('.pred-cat')).map((c) => c.className), tag: (document.querySelector('.pred-pass-tag') || {}).textContent }));
  t.ok(/\d+〜\d+点/.test(p0.main) && p0.cats.length === 5 && p0.cats.every((c) => /cat-/.test(c)) && p0.tag === '過去の合格点', '合格予測: 点数の幅・分野の色・過去の合格点', p0);
  await p.click('.pred-toggle');
  const p1 = await p.waitFor(() => document.querySelector('.pred-toggle').getAttribute('aria-checked') === 'true' && { focus: !!document.activeElement && document.activeElement.classList.contains('pred-toggle'), saved: JSON.parse(localStorage.getItem('shojikiLearn.v1.predictPrefs') || '{}').exempt });
  t.ok(p1 && p1.focus && p1.saved === true, '5問免除のスイッチ(フォーカスが残る・保存)', p1);
  await p.click('.pred-toggle');
  await p.go('progress/weak');
  await p.waitForSelector('.ana-card [data-type="zeirishi"]');
  await p.click('.ana-card [data-type="zeirishi"]');
  const a1 = await p.waitFor(() => /税理士/.test((document.querySelector('[data-role="ana-status"]') || {}).textContent || '') && document.querySelectorAll('.ana-cat').length);
  t.ok(a1 > 0, '弱点分析: 試験の切り替えを読み上げる', a1);
  await p.click('.ana-card [data-type="takken"]');
  await p.go('plan');
  await p.waitForSelector('.plan-step');
  const pl = await p.evaluate(() => ({ steps: document.querySelectorAll('.plan-step').length, cur: (document.querySelector('.plan-step[aria-current="step"]') || {}).textContent, items: Array.from(document.querySelectorAll('.plan-item')).map((a) => a.getAttribute('href')), budget: (document.querySelector('.plan-budget') || {}).textContent, alloc: document.querySelectorAll('.plan-alloc-row b').length }));
  t.ok(pl.steps === 5 && /基礎固め/.test(pl.cur) && pl.items.length >= 3 && pl.items.every(Boolean) && /約/.test(pl.budget) && pl.alloc === 5, '学習計画: 5つの段階(今は基礎固め)・今週やること・配分', pl);
  await p.go('more');
  await p.click('.more-view [data-theme-pref="dark"]');
  const th = await p.waitFor(() => document.documentElement.getAttribute('data-theme') === 'dark' && document.querySelector('[data-theme-pref="dark"]').getAttribute('aria-pressed') === 'true');
  t.ok(th, 'メニュー: テーマをダークに切り替え');
  await p.click('.more-view [data-theme-pref="system"]');
  // メニューの「学習計画」(進捗の次)→ #plan・メニューのタブが選ばれる
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll('.more-row')).map((r) => ({ href: r.getAttribute('href'), title: (r.querySelector('.more-row-title') || {}).textContent })));
  const i = rows.findIndex((r) => r.href === '#plan');
  t.ok(i > 0 && rows[i - 1].href === '#progress' && rows[i].title === '学習計画', 'メニュー: 学習計画は進捗の次', rows);
  await p.click('.more-row[href="#plan"]');
  const nav = await p.waitFor(() => window.Router && Router.current() === 'plan' && ({ tab: (document.querySelector('.bottom-nav-item[aria-current="page"]') || { getAttribute: () => null }).getAttribute('data-tab') }));
  t.ok(nav && nav.tab === 'more', 'メニュー → #plan(メニューのタブが選ばれたまま)', nav);
  const d = await t.open('home', { device: 'desktop' });
  const side = await d.evaluate(() => Array.from(document.querySelectorAll('.side-nav-item[data-view]')).map((a) => a.dataset.view));
  t.ok(side.indexOf('plan') === side.indexOf('progress') + 1, 'PC のサイドバー: 学習計画は進捗の次', side);
  await d.click('.side-nav-item[data-view="plan"]');
  t.ok(await d.waitFor(() => Router.current() === 'plan' && document.querySelector('.side-nav-item[data-view="plan"]').getAttribute('aria-current') === 'page'), 'サイドバーから学習計画(選ばれた表示)');
});

B.test('設定: 1日の目標(入力チェック・分への切り替え・保存・ホームの輪)・AIに聞くのスイッチ・目標の試験の「見込み」', async (t) => {
  const p = await t.open('settings/goal', { seed: { learnerProfile: { goal: 'takken', interests: [], at: 1 }, examTargets: [{ id: 'et_g', name: '宅建士試験', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: 1 }] } });
  const card = '[data-role="goal-card"]';
  await p.waitForSelector(`${card} input`);
  const st = await p.stable((c) => { const e = document.querySelector(c); const r = e.getBoundingClientRect(); const i = e.querySelector('input'); return { top: Math.round(r.top), value: i.value, unit: e.querySelector('[data-role="goal-unit"]').textContent, min: i.min, max: i.max, pressed: Array.from(e.querySelectorAll('.segmented-item')).map((b) => b.getAttribute('aria-pressed')).join(), now: e.querySelector('[data-role="goal-now"]').textContent }; }, {}, card);
  t.ok(st.top < 200 && st.value === '10' && st.unit === '回' && st.min === '1' && st.max === '200' && st.pressed === 'true,false' && /今の目標: 1日10回/.test(st.now), '#settings/goal で目標のカードへ・既定は1日10回', st);
  const submit = async () => {
    await p.click(`${card} button[type="submit"]`);
    return p.stable((c) => { const m = document.querySelector(`${c} [data-role="goal-msg"]`); return { text: m.textContent, ng: m.classList.contains('is-ng'), inv: document.querySelector(`${c} input`).getAttribute('aria-invalid') }; }, {}, card);
  };
  await p.fill(`${card} input`, '0');
  let m = await submit();
  t.ok(m.ng && /1〜200回の範囲/.test(m.text) && m.inv === 'true', '0 は範囲外(aria-invalid)', m);
  await p.fill(`${card} input`, '201');
  m = await submit();
  t.ok(m.ng && /1〜200回の範囲/.test(m.text), '201 は範囲外', m);
  await p.fill(`${card} input`, '1.5');
  m = await submit();
  t.ok(m.ng && /整数/.test(m.text), '1.5 は整数でない', m);
  await p.fill(`${card} input`, '');
  m = await submit();
  t.ok(m.ng && /入力してください/.test(m.text), '空は「入力してください」', m);
  t.eq(await p.get('dailyGoal'), null, 'エラーのときは保存しない');
  await p.click(`${card} .segmented-item[data-value="minutes"]`);
  const s2 = await p.waitFor((c) => document.querySelector(`${c} [data-role="goal-unit"]`).textContent === '分' && ({ v: document.querySelector(`${c} input`).value, max: document.querySelector(`${c} input`).max, msg: document.querySelector(`${c} [data-role="goal-msg"]`).textContent, range: document.querySelector(`${c} [data-role="goal-range"]`).textContent }), {}, card);
  t.ok(s2 && s2.v === '30' && s2.max === '600' && /保存する/.test(s2.msg) && /5〜600分/.test(s2.range), '分に切り替えると既定の30分', s2);
  await p.fill(`${card} input`, '3');
  m = await submit();
  t.ok(m.ng && /5〜600分/.test(m.text), '3分は範囲外', m);
  await p.fill(`${card} input`, '45');
  m = await submit();
  t.ok(!m.ng && /保存しました/.test(m.text) && /1日45分/.test(m.text), '45分を保存', m);
  t.eq(await p.get('dailyGoal'), { kind: 'minutes', value: 45 }, '保存した値');
  await p.go('home');
  // ホームの「今日の目標」(輪のついたカウンター)の読み上げ
  const ring = () => p.evaluate(() => { const r = document.querySelector('.home-view .stat-goal'); return r ? r.getAttribute('aria-label') : null; });
  t.ok(/今日の目標 \d+分\/45分/.test(await ring() || ''), 'ホームの今日の目標が45分', await ring());
  await p.go('settings/goal');
  await p.click(`${card} .segmented-item[data-value="actions"]`);
  await p.fill(`${card} input`, '20');
  await submit();
  await p.go('home');
  const rl = await ring();
  t.ok(/今日の目標 \d+\/20回/.test(rl || ''), 'ホームの今日の目標が20回', rl);
  // AIに聞くのスイッチ
  await p.go('settings/answer');
  const cb = '[data-role="answer-card"] input[data-role="ai-button"]';
  await p.waitForSelector(cb);
  t.ok(await p.evaluate((c) => document.querySelector(c).checked, cb), 'AIに聞く: 既定はオン');
  await p.click(cb);
  t.ok(await p.waitFor(() => (JSON.parse(localStorage.getItem('shojikiLearn.v1.answerPrefs') || '{}').aiButton === false) && AskAi.button({ kind: 'quiz', quizId: APP_DATA.quiz[0].id }) === null), 'オフを保存・ボタンを作らない');
  await p.click(cb);
  t.ok(await p.waitFor(() => (JSON.parse(localStorage.getItem('shojikiLearn.v1.answerPrefs') || '{}').aiButton === true) && !!AskAi.button({ kind: 'quiz', quizId: APP_DATA.quiz[0].id })), 'オンに戻す');
  // 目標の試験の一覧(見込み)
  const q = await t.open('settings/targets', { seed: { examTargets: [
    { id: 'et_a', name: '宅建士試験', examTypeId: 'takken', date: '2026-10-18', primary: false, createdAt: 1 },
    { id: 'et_b', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: 2, tentative: true },
  ] } });
  const rows = await q.evaluate(() => Array.from(document.querySelectorAll('.target-row')).map((r) => ({ text: r.textContent.replace(/\s+/g, ' ').trim(), tag: !!r.querySelector('.target-tentative-tag'), aria: r.querySelector('[data-edit]').getAttribute('aria-label') })));
  t.ok(rows.length === 2 && !rows[0].tag && rows[1].tag && /2027年10月17日\(日\)\(見込み\)/.test(rows[1].text) && /見込み/.test(rows[1].aria), '見込みの札と日付・読み上げ', rows);
});

B.test('試験の後(2026-10-19): ホームの合格発表の案内・学習計画の試験後の表示・設定の「終了」', async (t) => {
  const p = await t.open('home', { date: '2026-10-19T12:00:00+09:00', seed: { examTargets: [{ id: 'et_s', name: '宅建士試験', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: 1 }], learnerProfile: { goal: 'takken', interests: [], at: 1 } } });
  t.eq(await p.evaluate(() => DateUtil.today()), '2026-10-19', '端末の日付');
  t.ok(await p.waitFor(() => !!document.querySelector('#view-root .home-view .hero2-days.is-after') && !!document.querySelector('#view-root .after-panel a[href="https://www.retio.or.jp/exam/"]')), 'ホーム: 「お疲れさまでした」と合格発表(RETIO)の案内');
  await p.go('plan');
  t.ok(await p.waitForSelector('#view-root .plan-after'), '学習計画: 試験後の表示');
  await p.go('settings/targets');
  t.ok(await p.waitFor(() => /終了/.test((document.querySelector('[data-role="target-list"]') || {}).textContent || '')), '設定: 目標の試験が「終了」');
});

B.run();
