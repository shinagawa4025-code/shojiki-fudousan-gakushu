// ホームと v14 の新しい機能(ブラウザ): 公開版(詳細の束をホームのあとに読む)では、出題頻度ランク(js/freq.js・data/frequency.js)と
// 新しい機能のデータが最初の表示にない。詳細が届いたら、表示中のホームの今日のメニューと「新しくなりました」を1回だけ作り直す
// (js/views/home.js の watchDetail)。作り直したあとは、詳細がそろった状態で描き直したホームと同じになること。
// 元のファイル(--raw)では最初から詳細があるので、はじめから同じ。#progress/level はレベルのカードへ
'use strict';
const B = require('../lib/browser.js');

const SEED = {
  learnerProfile: { goal: 'takken', interests: [], at: 1 },
  examTargets: [{ id: 'et_h', name: '宅建士試験', examTypeId: 'takken', date: '2031-10-19', primary: true, createdAt: 1 }],
  // お知らせは v13 まで見た人(v14 の点だけが出る)
  seenWhatsNew: 'v13',
  quizHistory: { 'quiz-K-01': 'ok' },
  activityLog: { '2026-10-13': 3 },
  schemaVersion: 2,
};

const snap = () => {
  const menu = Array.from(document.querySelectorAll('.home-menu [data-step]')).map((a) => `${a.dataset.step} ${a.getAttribute('href')} ${a.getAttribute('aria-label')}`);
  const go = document.querySelector('.home-go.is-dup');
  const news = document.querySelector('.home-news .home-news-list');
  return { menu, go: go ? `${go.getAttribute('href')} ${go.textContent.replace(/\s+/g, ' ').trim()}` : null, news: news ? news.textContent.replace(/\s+/g, ' ').trim() : null };
};

B.test('ホーム: 詳細が届いたあとの今日のメニュー・お知らせが、描き直したホームと同じ(宅建士・v13 から更新した人)', async (t) => {
  const p = await t.open('home', { seed: SEED });
  const mode = await p.evaluate(() => (window.AppData && AppData.info ? AppData.info().mode : 'raw'));
  t.log(`読み込み: ${mode}`);
  // 作り直しは詳細を取り込んだあとのタスク(setTimeout 0)。値が落ち着くまで待つ
  const first = await p.stable(snap);
  t.ok(first.menu.length >= 2, '今日のメニューがある', first);
  t.ok(first.news && /出題頻度ランク/.test(first.news) && /\d+項目/.test(first.news), 'お知らせに v14 の点と数(データから)', first.news);
  t.ok(await p.evaluate(() => typeof Freq !== 'undefined' && Freq.ready()), '出題頻度ランクが使える');
  // 出題頻度ランクがないとき(公開版の詳細が届く前)とあるときのメニュー。今の表示は「あるとき」と同じ
  const cmp = await p.evaluate(() => {
    const o = Views.home.menuOptions();
    const F = window.Freq;
    let pre;
    try { window.Freq = undefined; pre = Recommend.todayMenu(o).map((s) => s.nav); } finally { window.Freq = F; }
    return { pre, post: Recommend.todayMenu(o).map((s) => s.nav) };
  });
  t.log(`頻度なしのメニュー ${cmp.pre.join(' ')} / 頻度ありのメニュー ${cmp.post.join(' ')}`);
  t.eq(first.menu.map((s) => s.split(' ')[1]), cmp.post, '表示中のメニューは出題頻度ランクを使った手順');
  // ほかの画面へ行って戻る(詳細がそろった状態でホームを描き直す)
  await p.evaluate(() => { location.hash = '#glossary'; });
  t.ok(await p.waitFor(() => Router.current() === 'glossary' && !!document.querySelector('#view-root .view:not(.view-pending)')), '用語集へ');
  await p.evaluate(() => { location.hash = '#home'; });
  t.ok(await p.waitFor(() => Router.current() === 'home' && !!document.querySelector('#view-root .home-view')), 'ホームへ戻る');
  const again = await p.stable(snap);
  t.eq(first, again, `最初に開いたホーム(${mode})と描き直したホームの、今日のメニュー・主ボタン・お知らせが同じ`);
  await p.close();
});

B.test('#progress/level: レベルと経験値のカードまでスクロール', async (t) => {
  const p = await t.open('progress/level', { seed: Object.assign({}, SEED, { xp: { total: 1200, seeded: true, seen: 3, days: { '2026-10-14': 40 } } }), device: 'iphone' });
  t.ok(await p.waitForSelector('[data-role="level-card"] .card, [data-role="level-card"] section'), 'レベルのカードがある');
  const top = await p.stable(() => { const el = document.querySelector('[data-role="level-card"]'); return el ? Math.round(el.getBoundingClientRect().top) : null; });
  t.ok(top != null && top >= -2 && top < 200, `カードが画面の上のほうにある(top ${top})`, top);
  await p.close();
});

B.run();
