// レベルと経験値・今日のチャレンジ・出題頻度ランク・税理士の入口の直し(v14 の点検で見つかったもの・ブラウザ)
// ホームのレベルの札は、はじめの XP を付ける前も同じ大きさの「計算しています」(あとから下の主ボタンを動かさない)・3桁区切り・#progress/level へ /
// チャレンジの出題中はアプリバーと下部タブを隠し、○ / × が画面に入る(iPhone SE の高さでも)・次の文は頭から /
// 進捗のレベルのカードは横いっぱい(PC)・はじめの XP の説明・経験値のため方 / 今日の復習の「元に戻す」で経験値も戻す /
// #freq/<テーマ> は行へ移ってフォーカス・行のボタンは語の途中で折り返さない・「基礎を読む」は 44px /
// 税理士(消費税法)が目的なら 問題・学ぶ・ホーム・消費税法のトピックから条文穴埋めへ / 暮らしが目的ならチャレンジの「すべて」に注意書き
'use strict';
const B = require('../lib/browser.js');
const S = require('../fixtures/seeds.js');

const T = '2026-10-14';
const BADGES = { seeded: true, at: { first: '2026-10-01', challengeFirst: '2026-10-01', challenge30: '2026-10-01', level5: '2026-10-01', level10: '2026-10-01', level20: '2026-10-01', level30: '2026-10-01' } };
const SE = { width: 375, height: 553, deviceScaleFactor: 2, mobile: true };
const ZEI = { learnerProfile: { goal: 'zeirishi', interests: [], at: 1 }, badges: BADGES };

B.test('ホームのレベルの札: はじめの XP を付ける前も同じ形(Lv.- ・計算しています)で場所を取り、付けたら数字に(あいさつは動かない)', async (t) => {
  const p = await t.open('home', { seed: { badges: BADGES, activityLog: { '2026-10-10': 400 } } });
  await p.waitFor(() => !!document.querySelector('[data-role="level"] .xp-home'));
  // 詳細(LevelUi)が届く前の状態にする: 保存した xp を消し、数え方を外して描き直す
  await p.evaluate(() => { localStorage.removeItem('shojikiLearn.v1.xp'); window.__levelUi = window.LevelUi; window.LevelUi = undefined; });
  await p.go('more');
  await p.go('home');
  const BOX = () => {
    const b = document.querySelector('[data-role="level"]');
    const g = document.querySelector('.home-greet');
    const m = b && b.querySelector('.xp-main');
    return b && g && m && { medal: b.querySelector('.xp-medal').textContent.replace(/\s+/g, ''), next: b.querySelector('.xp-next').textContent, h: Math.round(b.getBoundingClientRect().height), greet: Math.round(g.getBoundingClientRect().top + scrollY), label: m.getAttribute('aria-label'), href: m.getAttribute('href') };
  };
  const a = await p.waitFor(BOX);
  t.ok(a && a.medal === 'Lv.-' && a.next === '経験値を計算しています' && a.h > 40 && a.label === '経験値を計算しています', '付ける前: 同じ形の「計算しています」(場所を取る)', a);
  await p.evaluate(() => { window.LevelUi = window.__levelUi; Xp.seedIfNeeded(); });
  const b = await p.waitFor(() => { const e = document.querySelector('[data-role="level"] .xp-medal'); return e && e.textContent.replace(/\s+/g, '') !== 'Lv.-'; }) && await p.evaluate(BOX);
  t.ok(b && /^Lv\.\d+$/.test(b.medal) && b.medal !== 'Lv.1' && /次のレベルまで あと[\d,]+ XP/.test(b.next), '付けたら Lv. と次のレベルまで(その場で描き直す)', b);
  t.ok(b && Math.abs(b.h - a.h) <= 2 && Math.abs(b.greet - a.greet) <= 2, 'あいさつ(と主ボタン)の位置は変わらない', { before: a, after: b });
  t.eq(b && b.href, '#progress/level', '札は #progress/level へ');
  // 3桁区切り
  await p.evaluate(() => { localStorage.setItem('shojikiLearn.v1.xp', JSON.stringify({ total: 74152, seeded: true, seen: 40, days: {} })); });
  await p.go('more');
  await p.go('home');
  const c = await p.waitFor(() => { const e = document.querySelector('[data-role="level"] .xp-next'); return e && e.textContent; });
  const want = await p.evaluate(() => Xp.levelOf(74152).rest.toLocaleString('ja-JP'));
  t.ok(c === `次のレベルまで あと${want} XP` && /,/.test(want), '次のレベルまでの XP は 3桁区切り', { c, want });
});

B.test('今日のチャレンジ(スマホ): 出題中はアプリバーと下部タブを隠す・長い文でも ○ / × が画面に入る(iPhone SE)・次の文は頭から・終わると元に戻る', async (t) => {
  const p = await t.open('challenge', { device: SE, seed: { learnerProfile: { goal: 'takken', interests: [], at: 1 }, badges: BADGES, xp: { total: 0, seeded: true, seen: 1, days: {} } } });
  await p.waitFor(() => !!document.querySelector('.ch-view [data-role="start"]'));
  await p.evaluate(() => Views.challenge._internal.setDuration(60000));
  await p.click('[data-role="start"]');
  await p.waitFor(() => !!document.querySelector('.ch-view.is-run .ox-btn') && !!Views.challenge._internal.getRun());
  const ui = await p.evaluate(() => ({
    header: getComputedStyle(document.querySelector('.app-header')).display, nav: getComputedStyle(document.querySelector('.bottom-nav')).display,
    barTop: Math.round(document.querySelector('.ch-bar').getBoundingClientRect().top),
  }));
  t.ok(ui.header === 'none' && ui.nav === 'none' && ui.barTop <= 24, '出題中: アプリバーと下部タブを隠し、上のバーは画面の上の方', ui);
  // 宅建士の文(300文おきに抜き出し)を出題と同じ形で入れて、○ / × のボタンが画面に入るか(直す前は約3割)
  const fit = await p.evaluate(() => {
    const r = Views.challenge._internal.getRun();
    const list = Views.challenge._internal.statementsFor('takken');
    const pick = list.filter((_, i) => i % 10 === 0);
    let ok = 0;
    const keep = { ctx: r.el.ctx.textContent, hid: r.el.ctx.hidden, text: r.el.text.innerHTML };
    pick.forEach((s) => {
      const c = typeof s.context === 'string' ? s.context : '';
      r.el.ctx.textContent = c;
      r.el.ctx.hidden = !c;
      r.el.text.innerHTML = `${s.sub && s.label ? `<span class="stmt-label ox-stmt-label">${s.label}</span>` : ''}<span class="ox-statement-text">${s.text}</span>`;
      const bottom = Math.max(r.el.o.getBoundingClientRect().bottom, r.el.x.getBoundingClientRect().bottom);
      if (bottom <= innerHeight) ok += 1;
    });
    r.el.ctx.textContent = keep.ctx;
    r.el.ctx.hidden = keep.hid;
    r.el.text.innerHTML = keep.text;
    return { ok, n: pick.length, rate: Math.round((ok / pick.length) * 100) };
  });
  t.ok(fit.n > 100 && fit.rate >= 90, `iPhone SE の高さでも、ほとんどの文で ○ / × のボタンが最初の画面に入る(${fit.ok} / ${fit.n})`, fit);
  // 長めの文(本文 90字・前置き 46字。上から1割ほどの長さ)を次に出して答える
  const LONG = 'あ'.repeat(45) + 'い'.repeat(45);
  await p.evaluate((text) => {
    const r = Views.challenge._internal.getRun();
    const s = Object.assign({}, r.items[r.i + 1], { id: 'test-long', text, context: '宅地建物取引業者Aが、自ら売主として宅地の売買契約を締結する場合に関する次の記述', sub: false });
    r.items.splice(r.i + 1, 0, s);
  }, LONG);
  await p.evaluate(() => window.scrollTo(0, 120));
  await p.click('.ox-btn[data-answer="o"]');
  const v = await p.waitFor(() => {
    const r = Views.challenge._internal.getRun();
    if (!r || r.lock || r.items[r.i].id !== 'test-long') return null;
    const bs = Array.from(document.querySelectorAll('.ch-view .ox-btn')).map((b) => b.getBoundingClientRect());
    return { y: Math.round(scrollY), bottom: Math.round(Math.max(...bs.map((x) => x.bottom))), vh: innerHeight };
  }, { timeout: 4000 });
  t.ok(v && v.y === 0, '次の文は頭から(画面の上へ戻す)', v);
  t.ok(v && v.bottom <= v.vh, '長めの文でも ○ / × のボタンは画面の中', v);
  t.ok(!(await p.overflow()), 'はみ出しなし');
  await p.click('[data-role="quit"]');
  await p.waitFor(() => !!document.querySelector('[data-role="result"]'));
  const back = await p.evaluate(() => ({ header: getComputedStyle(document.querySelector('.app-header')).display, nav: getComputedStyle(document.querySelector('.bottom-nav')).display }));
  t.ok(back.header !== 'none' && back.nav !== 'none', '結果ではアプリバーと下部タブが戻る', back);
});

B.test('進捗のレベルのカード: PC は横いっぱい(左にレベル・右に直近7日)・はじめの XP の説明・経験値のため方(4択の 6XP は模擬試験の見直しの印)', async (t) => {
  const p = await t.open('progress/level', { device: 'desktop', seed: { badges: BADGES, xp: { total: 74152, seeded: true, seen: 40, seed: 74000, seedAt: '2026-10-12', days: { [T]: 152 } } } });
  const c = await p.waitFor(() => {
    const m = document.querySelector('[data-role="level-card"]');
    const head = m && m.querySelector('.xp-prog-head');
    const week = m && m.querySelector('.xp-week');
    if (!head || !week) return null;
    const a = head.getBoundingClientRect();
    const b = week.getBoundingClientRect();
    return { span: m.classList.contains('span-all'), side: b.left > a.right, w: Math.round(m.getBoundingClientRect().width), grid: Math.round(document.querySelector('.prog-grid').getBoundingClientRect().width), note: (m.querySelector('[data-role="xp-seed-note"]') || {}).textContent || '', how: m.querySelector('.xp-how').textContent.replace(/\s+/g, '') };
  });
  t.ok(c && c.span && c.side && Math.abs(c.w - c.grid) <= 2, '横いっぱい・中は2列', c);
  t.ok(c && /経験値の記録は.*から始まりました/.test(c.note) && /74,000 XP/.test(c.note), '直近7日に始めた人には「はじめの XP」の説明', c && c.note);
  t.ok(c && /4択\(模擬試験も\):正解10・不正解3XP\(模擬試験で見直しの印を付けた正解は6\)/.test(c.how), '経験値のため方: 4択の 6XP は模擬試験の見直しの印', c && c.how);
  t.ok(!(await p.overflow()), 'はみ出しなし');
  // 古い人(8日より前に始めた)には出さない
  const q = await t.open('progress/level', { seed: { badges: BADGES, xp: { total: 900, seeded: true, seen: 2, seed: 800, seedAt: '2026-09-01', days: {} } } });
  t.ok(await q.waitFor(() => !!document.querySelector('[data-role="level-card"] .xp-card') && !document.querySelector('[data-role="xp-seed-note"]')), '前から使っている人には出さない');
});

B.test('今日の復習: 「元に戻す」(U)で経験値も戻す・評価し直すと1枚 3XP(4XP にならない)', async (t) => {
  const p = await t.open('review', { device: 'desktop', seedFn: S.learn, seedArgs: { due: 3, newLimit: 0 } });
  await p.evaluate(() => { localStorage.setItem('shojikiLearn.v1.xp', JSON.stringify({ total: 0, seeded: true, seen: 1, days: {} })); });
  await p.reload();
  await p.waitFor(() => !!document.querySelector('.review-view .flip-card'));
  const flip = async () => { await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); }); await p.press('Space'); await p.waitFor(() => document.querySelector('.review-view .flip-card').classList.contains('flipped')); };
  const first = await p.evaluate(() => document.querySelector('.review-view .flip-card').dataset.termId);
  await flip();
  await p.press('3');
  await p.waitFor((f) => document.querySelector('.review-view .flip-card').dataset.termId !== f, {}, first);
  t.eq(await p.evaluate(() => Xp.total()), 3, '評価で 3XP');
  await p.press('u');
  await p.waitFor((f) => document.querySelector('.review-view .flip-card').dataset.termId === f, {}, first);
  t.eq(await p.evaluate(() => [Xp.total(), Xp.today()]), [0, 0], '元に戻すと 0XP');
  await flip();
  await p.press('3');
  await p.waitFor((f) => document.querySelector('.review-view .flip-card').dataset.termId !== f, {}, first);
  t.eq(await p.evaluate(() => Xp.total()), 3, '評価し直しても 1枚 3XP');
});

B.test('#freq/<テーマ>: 下の方の行へ移って強調・フォーカス / 行のボタンは語の途中で折り返さない・「基礎を読む」は 44px(320px)', async (t) => {
  const p = await t.open('freq', { device: 'w320', seed: { learnerProfile: { goal: 'takken', interests: [], at: 1 }, badges: BADGES } });
  await p.waitFor(() => window.Freq && Freq.ready() && !!document.querySelector('[data-role="freq-row"]'));
  const th = await p.evaluate(() => { const list = Freq.themes().filter((x) => x.cat === 'gyoho').sort(Freq.byRank); return list[list.length - 1].id; });
  const btns = await p.evaluate(() => Array.from(document.querySelectorAll('.freq-row-actions .btn')).slice(0, 12).map((b) => ({ ws: getComputedStyle(b).whiteSpace, h: Math.round(b.getBoundingClientRect().height), over: b.scrollWidth > b.clientWidth + 1 })));
  t.ok(btns.length && btns.every((b) => b.ws === 'nowrap' && b.h < 60 && !b.over), '4択・○×で解くのボタンは1行(はみ出さない)', btns);
  const read = await p.evaluate(() => Array.from(document.querySelectorAll('.freq-row-read')).slice(0, 5).map((a) => Math.round(a.getBoundingClientRect().height)));
  t.ok(read.length && read.every((h) => h >= 44), '「基礎を読む」は 44px 以上', read);
  t.ok(!(await p.overflow()), 'はみ出しなし');
  await p.go(`freq/${th}`);
  const at = await p.waitFor((id) => {
    const row = document.getElementById(`freq-${id}`);
    if (!row || document.activeElement !== row) return null;
    const r = row.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0 && { top: Math.round(r.top), y: Math.round(scrollY) };
  }, { timeout: 5000 }, th);
  t.ok(at && at.y > 0, '下の方のテーマの行へ移り、行にフォーカス(画面の中)', at);
});

B.test('税理士(消費税法)が目的: 問題・学ぶの入口は条文穴埋めから・消費税法のトピックから条文穴埋め・ホームのタイル', async (t) => {
  const p = await t.open('quiz', { seed: ZEI });
  const q = await p.waitFor(() => { const a = Array.from(document.querySelectorAll('[data-role="hub-tiles"] [data-hub]')).map((x) => x.dataset.hub); return a.length && a; });
  t.eq(q && q[0], 'joubun', '問題の入口: 最初は条文穴埋め');
  const tags = await p.evaluate(() => Array.from(document.querySelectorAll('[data-role="hub-tiles"] [data-hub]')).map((x) => `${x.dataset.hub}:${(x.querySelector('.hub-tile-badge') || {}).textContent || ''}`));
  t.ok(tags.includes('freq:宅建士') && tags.includes('numbers:宅建士') && tags.includes('joubun:税理士'), '出題頻度・数字まとめに「宅建士」の札', tags);
  await p.go('topics');
  t.eq(await p.waitFor(() => { const a = Array.from(document.querySelectorAll('[data-role="hub-tiles"] [data-hub]')).map((x) => x.dataset.hub); return a.length && a; }), ['joubun', 'compare'], '学ぶの入口: 条文穴埋め・比較表');
  await p.go('topics/topicR');
  const j = await p.waitFor(() => { const a = document.querySelector('[data-role="to-joubun"]'); return a && { href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, '') }; });
  t.ok(j && j.href === '#joubun' && /条文穴埋め/.test(j.text) && /\d+項目/.test(j.text), '消費税法のトピックに条文穴埋めのボタン', j);
  await p.go('topics/topicK');
  t.ok(!(await p.exists('[data-role="to-joubun"]')), '宅建業法のトピックには出さない');
  await p.go('home');
  t.ok(await p.waitFor(() => !!document.querySelector('.hero2-quick a.quick[href="#joubun"]')), 'ホームのタイルに条文穴埋め');
  // 宅建士が目的なら今までどおり
  const k = await t.open('quiz', { seed: { learnerProfile: { goal: 'takken', interests: [], at: 1 }, badges: BADGES } });
  t.eq(await k.waitFor(() => { const a = document.querySelector('[data-role="hub-tiles"] [data-hub]'); return a && a.dataset.hub; }), 'challenge', '宅建士が目的なら今までどおり(チャレンジから)');
});

B.test('暮らしが目的: チャレンジの「すべて」は宅建士試験向けの文が多いことを伝える', async (t) => {
  const p = await t.open('challenge', { seed: { learnerProfile: { goal: 'life', interests: [], at: 1 }, badges: BADGES } });
  const note = await p.waitFor(() => { const n = document.querySelector('[data-role="pool-note"]'); return n && n.textContent; });
  t.ok(/すべての分野の○×/.test(note || '') && /宅建士試験向けの文が多く含まれます/.test(note || ''), '「すべて」の注意書き', note);
  await p.click('[data-pool="takken"]');
  t.ok(await p.waitFor(() => !/多く含まれます/.test(document.querySelector('[data-role="pool-note"]').textContent)), '宅建士を選べば注意書きなし');
});

B.run();
