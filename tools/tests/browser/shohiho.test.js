// 消費税法の全体(v13・ブラウザ): 税理士の区分のトピック一覧(分野ごとの見出し・消費税の色・準備中なし)・トピック詳細(小見出し・問題/○×の入口)・
// ○×の分野の札(消費税法)と直リンク #ox/cat/shohiho/10(出題・文はすべて消費税法)・ホームの「○×で10問」(税理士は消費税法)
'use strict';
const B = require('../lib/browser.js');

const ZEI = { examTargets: [{ id: 'et_z', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: '2027-08-03', primary: true, createdAt: Date.UTC(2026, 0, 1) }], learnerProfile: { goal: 'zeirishi', interests: [], at: 1 } };
const TOPICS = ['topicR', 'topicS', 'topicT'];

B.test('税理士の区分: 消費税法のトピック3つ(見出し・消費税の色・件数)とトピック詳細(小見出し4つ・問題と○×の入口・320px)', async (t) => {
  const p = await t.open('topics', { seed: ZEI });
  const g = await p.waitFor(() => {
    const on = document.querySelector('[data-track="zeirishi"]');
    if (!on || on.getAttribute('aria-pressed') !== 'true') return null;
    return Array.from(document.querySelectorAll('.topic-group')).map((s) => ({
      name: s.querySelector('.topic-group-head h3').textContent.trim(),
      cards: Array.from(s.querySelectorAll('a.topic-card')).map((a) => ({ href: a.getAttribute('href'), cat: (a.className.match(/cat-\w+/) || [])[0], text: a.textContent.replace(/\s+/g, ' ') })),
    }));
  });
  t.ok(!!g, '目標が税理士なら税理士の区分', g);
  const sh = (g || []).find((x) => x.name === '消費税法');
  t.eq(sh && sh.cards.map((c) => c.href), TOPICS.map((id) => `#topics/${id}`), '「消費税法」の見出しに topicR・S・T', g && g.map((x) => x.name));
  t.ok(sh && sh.cards.every((c) => c.cat === 'cat-shohi' && /基礎知識 10/.test(c.text) && /問題 \d+/.test(c.text) && !/準備中/.test(c.text)), '消費税の色・基礎知識10・問題あり・「準備中」なし', sh);
  for (const id of TOPICS) {
    await p.go(`topics/${id}`);
    await p.waitForSelector('.basics-section');
    const d = await p.evaluate(() => ({
      secs: Array.from(document.querySelectorAll('.basics-section-name')).map((x) => x.textContent.trim()),
      other: Array.from(document.querySelectorAll('.basics-section-name')).some((x) => x.textContent.trim() === 'その他'),
      practice: Array.from(document.querySelectorAll('.topic-practice a')).map((a) => a.getAttribute('href')),
      hero: document.querySelector('.topic-hero').className,
      empty: !!document.querySelector('[data-role="quiz-list"] .empty-state'),
    }));
    t.ok(d.secs.length === 4 && !d.other, `${id}: 小見出し4つ(「その他」なし)`, d.secs);
    t.ok(d.practice.includes(`#quiz/${id}`) && d.practice.includes(`#ox/topic/${id}`) && !d.practice.some((h) => /auto/.test(h)) && !d.empty, `${id}: 4択と○×の入口・問題の一覧が空でない`, d);
  }
  const q = await t.open('topics/topicS', { device: 'w320', dark: true, seed: ZEI });
  await q.waitForSelector('.basics-section');
  await q.settle();
  t.ok(!(await q.overflow()), '320px ダーク: topicS ははみ出さない');
});

B.test('○×: 分野の札「消費税法」(消費税の色・文の数)と直リンク #ox/cat/shohiho/10(10問・すべて消費税法の文)', async (t) => {
  const p = await t.open('ox', { seed: ZEI });
  const chip = await p.waitFor(() => {
    const b = document.querySelector('[data-scope="cat:shohiho"]');
    return b && { cls: b.className, name: b.querySelector('.ox-scope-name').textContent.trim(), n: Number(b.querySelector('.ox-chip-count').firstChild.textContent) };
  });
  const want = await p.evaluate(() => Views.ox._internal.loadStatements().filter((s) => (s.cats || []).includes('shohiho')).length);
  t.ok(chip && /cat-shohi\b/.test(chip.cls) && chip.name === '消費税法' && chip.n === want && want >= 400, `札「消費税法」(cat-shohi・${want}文)`, { chip, want });
  await p.go('ox/cat/shohiho/10');
  const s = await p.waitFor(() => {
    const x = Views.ox._internal.getSession();
    return x && x.items && x.items.length && document.querySelector('.ox-btn') && { n: x.items.length, all: x.items.every((it) => (it.cats || []).includes('shohiho')), hash: location.hash };
  });
  t.ok(s && s.n === 10 && s.all && s.hash === '#ox/run', '10問・すべて消費税法の文・URL は #ox/run', s);
  await p.evaluate(() => { const x = Views.ox._internal.getSession(); document.querySelector(`.ox-btn[data-answer="${x.items[x.index].truth ? 'o' : 'x'}"]`).click(); });
  t.ok(await p.waitFor(() => document.querySelector('.ox-feedback').classList.contains('is-shown') && /正解/.test(document.querySelector('.ox-feedback').textContent)), '答えると判定のバー(正解)');
});

B.test('ホーム(税理士): ○×の入口は消費税法(#ox/cat/shohiho/10)', async (t) => {
  const p = await t.open('home', { seed: ZEI });
  const hrefs = await p.waitFor(() => { const a = Array.from(document.querySelectorAll('#view-root a[href^="#ox"]')).map((x) => x.getAttribute('href')); return a.length ? a : null; });
  t.ok(hrefs && hrefs.includes('#ox/cat/shohiho/10') && !hrefs.includes('#ox/cat/shohi/10'), 'ホームの○×は消費税法', hrefs);
  // 記録のない税理士: 基礎知識の案内(今日のメニュー・学習計画)は消費税法(topicR・S・T)から(data/exams.js の focusOrder)
  const topics = await p.evaluate(() => Array.from(document.querySelectorAll('#view-root a[href^="#topics/topic"]')).map((x) => x.getAttribute('href')));
  t.ok(topics.length && /^#topics\/topic[RST]\b/.test(topics[0]) && !topics.some((h) => /^#topics\/topicH\b/.test(h) && topics.indexOf(h) < topics.findIndex((x) => /^#topics\/topic[RST]\b/.test(x))), 'ホームの基礎知識の案内は消費税法が先', topics);
});

B.test('弱点分析・学習計画(税理士・記録なし): 消費税法を先に案内する', async (t) => {
  const p = await t.open('progress', { seed: ZEI });
  const nav = await p.waitFor(() => {
    const a = Array.from(document.querySelectorAll('#view-root a[href^="#topics/topic"]')).map((x) => x.getAttribute('href'));
    return a.length ? a : null;
  });
  t.ok(nav && /^#topics\/topic[RST]\b/.test(nav[0]), '#progress: 最初の基礎知識の案内は消費税法', nav);
  await p.go('plan');
  const plan = await p.waitFor(() => {
    const a = Array.from(document.querySelectorAll('#view-root a[href^="#topics/topic"]')).map((x) => x.getAttribute('href'));
    return a.length ? a : null;
  });
  t.ok(plan && /^#topics\/topic[RST]\b/.test(plan[0]), '#plan: 今週やることの最初の基礎知識は消費税法', plan);
});

B.run();
