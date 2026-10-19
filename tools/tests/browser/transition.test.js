// 画面の切り替えの動き(View Transitions)と hashchange の順番(ブラウザ): 動きのあとに Router が送り直す hashchange(fdResent)は、
// 新しい画面を描く前に送る(古い画面の後片付けだけに効く)。動きあり・動きを減らす設定の両方で同じ結果になることを確かめる
// - 模擬試験の「続きから」の残り時間が動き続ける(送り直しが新しい画面のタイマーを止めない)
// - 進捗の画面を描くときに出るバッジのダイアログが、すぐ閉じられない・フォーカスがダイアログの中にある
// - 入力欄で文字を打っている間はバッジのダイアログを出さない(離れたら出す)
// - 動きの途中で描画に失敗しても、白い画面のままにならずエラー画面を出す
// 元: scratchpad r8/wf/vcode t_vc1・t_vc2・t_vc3、r8/wf/VF/x badge2・typing(v12.2 の確認で見つかった不具合)
'use strict';
const B = require('../lib/browser.js');

// 「初めての学習」だけがまだ知らされていない利用者(起動から約4秒の最初の確認より前に操作する)
const PENDING_BADGE = { activityLog: { '2026-10-13': 2, '2026-10-14': 3 }, badges: { seeded: true, at: {} } };

for (const reducedMotion of [false, true]) {
  const mode = reducedMotion ? '動きを減らす' : '動きあり';

  B.test(`模擬試験の「続きから」: ホームから戻ると残り時間が動き続ける(${mode})`, async (t) => {
    const p = await t.open('exam', { device: 'iphone', reducedMotion });
    await p.evaluate(() => document.querySelector('[data-role="start"]').click());
    t.ok(await p.waitFor(() => !!document.querySelector('.exam-q-card .exam-choice')), '時間ありの模擬試験を始めた');
    await p.go('home');
    await B.sleep(300);
    await p.evaluate(() => {
      window.__hc = [];
      window.addEventListener('hashchange', (e) => window.__hc.push(e.fdResent ? 'resent' : 'real'));
      location.hash = '#exam';
    });
    t.ok(await p.waitFor(() => !!document.querySelector('[data-role="resume-time"]')), '続きからのカード');
    await B.sleep(300);
    const a = await p.evaluate(() => document.querySelector('[data-role="resume-time"]').textContent);
    await B.sleep(2300);
    const b = await p.evaluate(() => ({ txt: document.querySelector('[data-role="resume-time"]').textContent, hc: window.__hc }));
    t.ok(a !== b.txt, '残り時間が減っていく', { before: a, after: b });
  });

  B.test(`進捗の画面を描くときに出るバッジのダイアログ: 閉じられずに残り、フォーカスはダイアログの中(${mode})`, async (t) => {
    const p = await t.open('home', { device: 'iphone', reducedMotion, seed: PENDING_BADGE });
    await p.evaluate(() => {
      window.__bd = { added: 0, removed: 0 };
      new MutationObserver((recs) => recs.forEach((r) => {
        r.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('fd-badge-overlay')) window.__bd.added++; });
        r.removedNodes.forEach((n) => { if (n.classList && n.classList.contains('fd-badge-overlay')) window.__bd.removed++; });
      })).observe(document.body, { childList: true });
      location.hash = '#progress/badges';
    });
    await p.waitFor(() => Router.current() === 'progress' && !!document.querySelector('#progress-badges'));
    await B.sleep(1200);
    const r = await p.evaluate(() => {
      const ae = document.activeElement;
      return { bd: window.__bd, open: !!document.querySelector('.fd-badge-overlay'), name: (document.querySelector('.fd-badge-name') || {}).textContent || null, inDialog: !!(ae && ae.closest('.fd-badge-overlay')), ae: ae && `${ae.tagName}${ae.dataset && ae.dataset.role ? `[${ae.dataset.role}]` : ''}` };
    });
    t.ok(r.open && r.name === '初めての学習', 'ダイアログが開いている', r);
    t.eq(r.bd.removed, 0, 'すぐに閉じられていない', r);
    t.ok(r.inDialog, 'フォーカスはダイアログの中(OK)', r);
    await p.press('Enter');
    t.ok(await p.waitFor(() => !document.querySelector('.fd-badge-overlay')), 'Enter で閉じる');
    t.eq(await p.evaluate(() => document.activeElement && document.activeElement.tagName), 'H2', '閉じたらフォーカスは画面の見出しへ');
  });

  B.test(`動きの途中で描画に失敗しても白い画面にならない(エラー画面)(${mode})`, async (t) => {
    const p = await t.open('home', { device: 'iphone', reducedMotion, allowErrors: true });
    await p.evaluate(() => {
      const orig = Nav.subnavFor;
      Nav.subnavFor = function (n) { if (n === 'topics') throw new Error('injected subnav failure'); return orig.apply(this, arguments); };
      location.hash = '#topics';
    });
    t.ok(await p.waitFor(() => !!document.querySelector('#view-root .error-view'), { timeout: 3000 }), 'エラー画面が出る', await p.evaluate(() => document.getElementById('view-root').innerHTML.slice(0, 200)));
    t.ok(p.errors.some((e) => /injected subnav failure/.test(e)), 'エラーが報告される(握りつぶさない)', p.errors);
  });
}

B.test('公開版: 詳細を待つ「読み込み中」の間もフォーカスが <body> に落ちない(読み込み中の見出し → 届いたら画面の見出し)', async (t) => {
  if (!t.env.info.built) t.skip('公開用ビルドだけ(元のファイルには詳細の待ちがない)');
  t.env.server.ctl.slow = { re: /\/assets\/detail\.[0-9a-f]+\.(js|css)$/, ms: 2500 };
  t.defer(() => { t.env.server.ctl.slow = null; });
  // (ページの load は詳細が届くまで終わらないので、load を待たずに進める)
  const p = await t.open('home', { device: 'desktop', goto: false });
  await p.goto('index.html#home', { noWait: true });
  t.ok(await p.waitFor(() => window.__appBooted === true && !!document.querySelector('#view-root .home-view a[href^="#progress"]'), { timeout: 15000 }), 'ホームが出た');
  const pending = await p.evaluate(() => window.AppData && !AppData.hasDetail());
  t.ok(pending, '詳細はまだ届いていない');
  await p.focus('#view-root .home-view a[href^="#progress"]');
  await p.press('Enter');
  t.ok(await p.waitFor(() => !!document.querySelector('#view-root .view-pending'), { timeout: 3000 }), '読み込み中の画面');
  const r = await p.evaluate(() => ({ tag: document.activeElement && document.activeElement.tagName, inPending: !!(document.activeElement && document.activeElement.closest('.view-pending')) }));
  t.ok(r.tag === 'H2' && r.inPending, '読み込み中はその見出しにフォーカス', r);
  t.ok(await p.waitFor(() => !document.querySelector('#view-root .view-pending') && Router.current() === 'progress', { timeout: 15000 }), '詳細が届いて進捗の画面');
  const r2 = await p.evaluate(() => ({ tag: document.activeElement && document.activeElement.tagName, text: document.activeElement && document.activeElement.textContent.trim() }));
  t.ok(r2.tag === 'H2' && !/読み込み中/.test(r2.text), '届いたら画面の見出しへ', r2);
});

B.test('入力欄で文字を打っている間はバッジのダイアログを出さない(離れたら出す)', async (t) => {
  const p = await t.open('glossary', { device: 'desktop', seed: PENDING_BADGE });
  const sel = await p.evaluate(() => { const i = document.querySelector('.glossary-view input'); i.id = i.id || 't-in'; return `#${i.id}`; });
  await p.focus(sel);
  await p.press('s');
  const fresh = await p.evaluate(() => Badges.check());
  t.eq(fresh, ['first'], '新しいバッジを判定した');
  await p.press('h');
  await p.press('i');
  await B.sleep(300);
  const r1 = await p.evaluate((s) => ({ dlg: !!document.querySelector('.fd-badge-overlay'), focusIn: document.activeElement === document.querySelector(s), v: document.querySelector(s).value }), sel);
  t.ok(!r1.dlg && r1.focusIn && r1.v === 'shi', '入力中はダイアログを出さず、文字は入力欄に入る', r1);
  await p.evaluate(() => { document.activeElement.blur(); });
  t.ok(await p.waitFor(() => !!document.querySelector('.fd-badge-overlay'), { timeout: 4000 }), '入力欄を離れるとダイアログが出る');
  await p.press('Escape');
  await p.waitFor(() => !document.querySelector('.fd-badge-overlay'));
});

B.run();
