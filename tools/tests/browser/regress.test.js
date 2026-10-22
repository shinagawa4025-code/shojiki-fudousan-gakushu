// 回帰の確認(ブラウザ): 画面を行き来してもイベントリスナーが増えない・解き直しの「図解で確認」→ 図解 → 戻るで同じ問題・回答・
// 解説・スクロール位置に戻る・検索(個数・組合せの記述ア〜エ・新しい画面の言葉が1番目に出る)
// 元: scratchpad r7/D3 t6_regress.js(リスナー)・r7/Q1 q3_dueback.js・audit7/T6 t_search.js(速さの確認は CI では揺れるので外した)
'use strict';
const B = require('../lib/browser.js');

B.test('画面を3周してもイベントリスナー(document・window)が増えない(PC)', async (t) => {
  const p = await t.open('home', { device: 'desktop', seed: { oxPrefs: { scope: { type: 'all', id: null }, filter: 'all', count: 10, autoNext: true, confidence: true } } });
  const cycle = async () => {
    for (const h of ['quiz', 'ox', 'exam', 'quiz/due', 'progress', 'plan', 'review', 'topics/topicL', 'glossary', 'settings', 'home']) await p.go(h);
    await p.go('ox/cat/gyoho/10');
    await p.evaluate(() => { const b0 = document.querySelector('.ox-btn[data-level="1"], .ox-btn[data-answer="o"]'); if (b0) b0.click(); });
    await B.sleep(100);
    await p.go('home');
  };
  await cycle();
  const l1 = await p.listeners();
  for (let i = 0; i < 3; i++) await cycle();
  const l2 = await p.listeners();
  const grew = Object.keys(l2).filter((k) => (l2[k] || 0) > (l1[k] || 0)).map((k) => `${k}: ${l1[k] || 0} → ${l2[k]}`);
  t.eq(grew, [], 'リスナーが増えない');
  t.log('listeners', l2);
});

B.test('解き直しの「図解で確認」→ 図解の詳細 → 戻る: 同じ問題・回答・解説が開いたまま・スクロール位置(不正解・正解で解説を開いたとき)', async (t) => {
  for (const pick of ['wrong', 'right']) {
    const p = await t.open('home', { seed: { learnerProfile: { goal: 'takken', interests: [], at: 1 } } });
    const info = await p.evaluate(() => {
      const today = DateUtil.today();
      const y = DateUtil.addDays(today, -1);
      const mc = APP_DATA.quiz.filter((q) => QuizEngine.isMcItem(q));
      const fig = mc.filter((q) => q.relatedTermId && CardUi.diagramsFor(q.relatedTermId).length);
      const list = mc.slice(60, 62).concat(fig.slice(0, 1)).filter((q, i, a) => a.indexOf(q) === i);
      const r = {};
      list.forEach((q) => { r[q.id] = { step: 0, due: today, at: y, src: 'quiz' }; });
      localStorage.setItem('shojikiLearn.v1.quizRetry', JSON.stringify(r));
      return { fig: fig[0] ? fig[0].id : null };
    });
    if (!info.fig) t.skip('図解のある問題がありません');
    await p.go('quiz/due');
    // 1問ずつ正解で進み、図解のある問題まで行く(タップで答える)
    let figCard = null;
    for (let i = 0; i < 5 && !figCard; i++) {
      const c = await p.evaluate(() => { const card = document.querySelector('.quiz-steps > .quiz-card.is-current'); if (!card) return null; const q = APP_DATA.quiz.find((x) => x.id === card.dataset.quizId); return { id: q.id, ci: q.correctIndex, fig: !!(q.relatedTermId && CardUi.diagramsFor(q.relatedTermId).length) }; });
      if (!c) break;
      const wrong = c.fig && pick === 'wrong';
      await p.click('.quiz-steps > .quiz-card.is-current .choice-btn', wrong ? (c.ci + 1) % 4 : c.ci);
      await p.waitFor(() => document.querySelector('.quiz-steps > .quiz-card.is-current').classList.contains('is-answered'));
      await p.settle();
      if (c.fig) { figCard = c.id; break; }
      await p.click('.quiz-steps > .quiz-card.is-current .quiz-next');
      await p.waitFor((x) => document.querySelector('.quiz-steps > .quiz-card.is-current').dataset.quizId !== x, {}, c.id);
      await p.settle();
    }
    t.ok(!!figCard, `${pick}: 図解のある問題まで進めた`);
    if (!figCard) continue;
    const exp0 = await p.evaluate(() => (document.querySelector('.quiz-steps > .quiz-card.is-current .quiz-explain-toggle') || { getAttribute: () => null }).getAttribute('aria-expanded'));
    if (pick === 'right') {
      t.eq(exp0, 'false', 'right: 正解なので解説は閉じている');
      await p.click('.quiz-steps > .quiz-card.is-current .quiz-explain-toggle');
      await p.waitFor(() => document.querySelector('.quiz-steps > .quiz-card.is-current .quiz-explain-toggle').getAttribute('aria-expanded') === 'true');
    } else t.eq(exp0, 'true', 'wrong: 不正解なので解説は開いている');
    await p.evaluate(() => document.querySelector('.quiz-card.is-current [data-figure]').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await p.settle();
    const before = await p.stable(() => ({ y: Math.round(scrollY), figTop: Math.round(document.querySelector('.quiz-card.is-current [data-figure]').getBoundingClientRect().top) }));
    await p.click('.quiz-card.is-current [data-figure]');
    t.ok(await p.waitForSelector('.fig-sheet-link'), `${pick}: 図解のシートが開く`);
    await p.settle();
    await p.click('.fig-sheet-link');
    t.ok(await p.waitFor(() => /^#figures\//.test(location.hash) && !!document.querySelector('#view-root .view')), `${pick}: 図解の詳細へ`);
    await p.back();
    await p.waitFor((x) => { const c = document.querySelector('.quiz-steps > .quiz-card.is-current'); return /^#quiz\/due/.test(location.hash) && c && c.dataset.quizId === x; }, {}, figCard);
    await p.settle();
    const after = await p.stable(() => {
      const c = document.querySelector('.quiz-steps > .quiz-card.is-current');
      const f = c && c.querySelector('[data-figure]');
      const fb = c && c.querySelector(':scope > .quiz-feedback.is-shown');
      const tg = c && c.querySelector('.quiz-explain-toggle');
      return { hash: location.hash, cur: c ? c.dataset.quizId : null, answered: c ? c.classList.contains('is-answered') : null, exOpen: tg ? tg.getAttribute('aria-expanded') : null, y: Math.round(scrollY), figTop: f ? Math.round(f.getBoundingClientRect().top) : null, fbTop: fb ? Math.round(fb.getBoundingClientRect().top) : null };
    });
    t.ok(after.hash === '#quiz/due' && after.cur === figCard && after.answered === true, `${pick}: 同じ問題・回答済みのまま`, after);
    t.eq(after.exOpen, 'true', `${pick}: 解説は開いたまま`);
    t.ok(after.figTop != null && Math.abs(after.figTop - before.figTop) <= 16, `${pick}: 「図解で確認」の画面上の位置がほぼ同じ(${before.figTop} → ${after.figTop})`, { before, after });
    t.ok(after.figTop != null && after.fbTop != null && after.figTop + 30 < after.fbTop, `${pick}: 「図解で確認」が判定のバーに隠れない`, after);
    // v12.1 では戻ったあと約11px ずれる(見た目の位置と同じ 16px までは許す。先頭へ飛ぶなどの大きな戻りの失敗を見つける)
    t.ok(Math.abs(after.y - before.y) <= 16, `${pick}: スクロール位置が戻る(${before.y} → ${after.y})`, { before, after });
    await p.close();
  }
});

B.test('検索: 個数・組合せの記述ア〜エで問題が見つかる・新しい画面の言葉は1番目にその画面・v14 の比較表・数字まとめ・条文穴埋め', async (t) => {
  const p = await t.open('home', { device: 'desktop' });
  const styled = await p.evaluate(() => {
    const out = [];
    APP_DATA.quiz.filter((q) => QuizEngine.styleOf(q)).forEach((q) => {
      q.stmts.forEach((s, i) => {
        const x = String(s);
        const sub = x.slice(Math.min(6, Math.max(0, x.length - 16)), Math.min(x.length, 22));
        if (!GlobalSearch.search(sub, 100000).some((r) => r.nav === `#quiz/q/${q.id}`)) out.push({ id: q.id, i, sub });
      });
    });
    return { n: APP_DATA.quiz.filter((q) => QuizEngine.styleOf(q)).length, notFound: out };
  });
  t.ok(styled.n > 0, '個数・組合せの問題がある', styled.n);
  t.eq(styled.notFound.slice(0, 5), [], `記述ア〜エ(${styled.n}問 × 4)はどれも検索で問題が見つかる`);
  const SCREEN_Q = [['学習計画', '#plan'], ['計画', '#plan'], ['今週やること', '#plan'], ['合格予測', '#progress'], ['予測', '#progress'], ['バッジ', '#progress'], ['学習時間', '#progress'],
    ['1日の目標', '#settings'], ['１日の目標', '#settings'], ['目標', '#settings'], ['AIに聞く', '#settings'], ['ＡＩ', '#settings'], ['模試', '#exam'], ['バックアップ', '#settings'],
    // v14 の新しい画面
    ['今日のチャレンジ', '#challenge'], ['チャレンジ', '#challenge'], ['タイムアタック', '#challenge'], ['レベル', '#progress'], ['経験値', '#progress'], ['XP', '#progress'],
    ['出題頻度', '#freq'], ['頻出', '#freq'], ['ランク', '#freq'], ['よく出る', '#freq'], ['数字まとめ', '#numbers'], ['数字', '#numbers'], ['金額', '#numbers'],
    ['比較表', '#compare'], ['比較', '#compare'], ['違い', '#compare'], ['条文穴埋め', '#joubun'], ['条文', '#joubun'], ['穴埋め', '#joubun'], ['理論', '#joubun']];
  const scr = await p.evaluate((qs) => qs.map(([q, want]) => { const r = GlobalSearch.search(q, 8); return { q, want, top: r.slice(0, 2).map((x) => `${x.type}:${x.title}→${x.nav}`), first: r[0] ? r[0].nav : null }; }), SCREEN_Q);
  scr.forEach((s) => t.ok(s.first === s.want || (s.first || '').startsWith(`${s.want}/`), `「${s.q}」→ 1番目が ${s.want}`, s));
  const once = await p.evaluate(() => GlobalSearch.search('学習計画', 8).filter((r) => r.nav === '#plan').length);
  t.eq(once, 1, '「学習計画」で #plan は1回だけ');
  t.ok(await p.evaluate(() => GlobalSearch.search('逆算', 8).some((r) => r.nav === '#plan')), '「逆算」でも #plan');
  t.eq(await p.evaluate(() => GlobalSearch.search('レベル', 8)[0].nav), '#progress/level', '「レベル」→ 進捗のレベルのカード(#progress/level)');
  t.ok(await p.evaluate(() => GlobalSearch.search('過去問', 8).some((r) => r.nav === '#freq')), '「過去問」でも #freq');
  // v14: 比較表(表の名前)・数字まとめ(まとまりの名前と文)・条文穴埋め(見出し)も結果に出て、その画面を開く
  const v14 = await p.evaluate(() => {
    const D = APP_DATA;
    const has = (q, nav) => GlobalSearch.search(q, 8).some((r) => r.nav === nav);
    const t = D.compareTables[0];
    const n = D.numbers[0];
    const j = D.joubun.items[0];
    return {
      cmp: has(t.title, `#compare/${t.id}`),
      // 数字まとめの行き先はそのまとまり(#numbers/list/<分野>/<まとまり>)
      numGroup: has(n.group, `#numbers/list/${n.cat}/${encodeURIComponent(n.group)}`),
      numText: GlobalSearch.search(String(n.q).replace('{}', n.a).slice(0, 14), 100000).some((r) => r.nav === `#numbers/list/${n.cat}/${encodeURIComponent(n.group)}`),
      jb: has(j.title, `#joubun/${j.id}`),
      tables: D.compareTables.filter((x) => !GlobalSearch.search(x.title, 100000).some((r) => r.nav === `#compare/${x.id}`)).map((x) => x.id),
      items: D.joubun.items.filter((x) => !GlobalSearch.search(x.title, 100000).some((r) => r.nav === `#joubun/${x.id}`)).map((x) => x.id),
      types: [...new Set(GlobalSearch.search('営業保証金', 8).map((r) => r.type))],
    };
  });
  t.ok(v14.cmp && v14.numGroup && v14.numText && v14.jb, '比較表・数字まとめ・条文穴埋めの項目が検索で見つかる', v14);
  t.eq(v14.tables.concat(v14.items), [], 'どの比較表・条文穴埋めの項目も名前で見つかる');
  await p.evaluate(() => { location.hash = GlobalSearch.search(APP_DATA.compareTables[0].title, 8).find((r) => r.type === '比較表').nav; });
  t.ok(await p.waitFor(() => /^#compare\//.test(location.hash) && !!document.querySelector('#view-root .view') && !document.querySelector('#view-root .error-view')), '比較表の結果から表の画面が開く');
  // 検索の欄に打つと結果が出る
  await p.click('#global-search-input');
  await p.send('Input.insertText', { text: '敷金' });
  t.ok(await p.waitFor(() => { const r = document.getElementById('global-search-results'); return r && !r.hidden && r.querySelectorAll('a, [role="option"]').length > 0; }), '検索の欄に「敷金」→ 結果が出る');
});

B.run();
