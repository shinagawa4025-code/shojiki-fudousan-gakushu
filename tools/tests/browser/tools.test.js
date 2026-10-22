// 数字まとめドリル(#numbers)・比較表で覚える(#compare)・条文穴埋め(#joubun)(v14・ブラウザ)
// 各画面が出る・320px ダークではみ出さない / 数字の4択(正解・誤り・結果・間違えたものだけもう一度)/ カードのキー操作 /
// 比較表の穴埋め(全部正解で記録)/ 条文の「思い出す」(タップで答え・自己採点)/「選んで埋める」と括弧書きの(略)/ リスナーが増えない
// データは作業中に増えるので、問題の中身は画面の中で APP_DATA から読む(件数・文に頼らない)
'use strict';
const B = require('../lib/browser.js');

// 選択肢・採点のボタンは、作った直後(約0.3秒)のタップを受けない(js/cloze.js の freshGuard)。タップで押す前に待つ
const FRESH = 400;

B.test('各画面が出る(見出し・中身あり)・320px ダークで横にはみ出さない(出題中・穴埋め中も)', async (t) => {
  const p = await t.open('numbers', { device: 'w320', dark: true });
  const routes = await p.evaluate(() => {
    const tb = (APP_DATA.compareTables || []).find((x) => x.keys && x.keys.length);
    const jb = (APP_DATA.joubun && APP_DATA.joubun.items || [])[0];
    return ['numbers', 'numbers/list', 'compare'].concat(tb ? [`compare/${tb.id}`, `compare/${tb.id}/fill`] : [])
      .concat(['joubun']).concat(jb ? [`joubun/${jb.id}/choose`, `joubun/${jb.id}/recall`, `joubun/${jb.id}/read`] : []);
  });
  t.ok(routes.length === 9, '比較表と条文のデータがある', routes);
  for (const h of routes) {
    await p.go(h);
    const info = await p.evaluate(() => ({
      h2: ((document.querySelector('#view-root h2') || {}).textContent || '').trim(),
      empty: !!document.querySelector('#view-root .empty-state'),
      err: !!document.querySelector('#view-root .error-view'),
      body: !!document.querySelector('#view-root .tl-progress, #view-root .tl-table, #view-root .tl-law-text, #view-root .tl-num-item'),
    }));
    t.ok(info.h2 && !info.err && !info.empty && info.body, `#${h}: 見出しと中身がある`, info);
    t.ok(!(await p.overflow()), `#${h}: 320px ダークではみ出さない`);
  }
  await p.go('numbers');
  await p.click('[data-role="start"]');
  t.ok(await p.waitFor(() => location.hash === '#numbers/run' && !!document.querySelector('.tl-card')), '出題が始まる(#numbers/run)');
  t.ok(!(await p.overflow()), '#numbers/run: 320px ではみ出さない');
  await p.evaluate(() => { const b = document.querySelector('[data-role="reveal"]'); if (b) b.click(); });
  t.ok(!(await p.overflow()), '#numbers/run 答えを見たあと: 320px ではみ出さない');
});

B.test('数字まとめ(4択で埋める): 正解・誤りの判定と空欄・記録と経験値・結果・間違えたものだけもう一度', async (t) => {
  const p = await t.open('numbers', { seed: { toolPrefs: { numbers: { mode: 'choice', size: 10, cat: 'all', group: 'all' } } } });
  t.ok(await p.waitFor(() => document.querySelector('[data-mode="choice"]').getAttribute('aria-pressed') === 'true'), '好み(toolPrefs)の「4択で埋める」が選ばれている');
  await p.click('[data-role="start"]');
  await p.waitFor(() => location.hash === '#numbers/run' && !!document.querySelector('.tl-card .tl-choices'));
  const cur = () => p.evaluate(() => {
    const s = Views.numbers._internal.getSession();
    const it = s.list[s.index];
    const btns = Array.from(document.querySelectorAll('.tl-choices .choice-btn'));
    return { id: it.id, a: it.a, n: s.list.length, right: btns.findIndex((b) => b.querySelector('.choice-text').textContent === it.a.trim()), count: btns.length };
  });
  const q1 = await cur();
  t.ok(q1.right >= 0 && q1.count === 4, '選択肢は4つで正解が1つ', q1);
  const xp0 = await p.evaluate(() => (window.Xp ? Xp.total() : 0));
  await B.sleep(FRESH);
  await p.click('.tl-choices .choice-btn', q1.right);
  t.ok(await p.waitFor(() => !!document.querySelector('.tl-verdict.is-ok') && !!document.querySelector('.tl-q .tl-blank.is-ok') && document.querySelectorAll('.tl-choices .choice-btn:disabled').length === 4), '正解: 判定・空欄に答え・選択肢は押せなくなる');
  const st1 = await p.get('numbersStats');
  t.ok(st1 && st1[q1.id] && st1[q1.id].c === 1 && st1[q1.id].w === 0 && st1[q1.id].grade === 2, 'numbersStats に正解を記録', st1);
  if (await p.evaluate(() => !!window.Xp)) t.ok((await p.evaluate(() => Xp.total())) > xp0, '経験値が増える');
  if (q1.n < 2) t.skip('数字が1つしかないため、ここまで');
  await p.click('[data-role="next"]');
  await p.waitFor(() => !document.querySelector('.tl-verdict'));
  const q2 = await cur();
  t.ok(q2.id !== q1.id, '次の数字へ', q2);
  await B.sleep(FRESH);
  await p.click('.tl-choices .choice-btn', q2.right === 0 ? 1 : 0);
  t.ok(await p.waitFor(() => { const v = document.querySelector('.tl-verdict.is-ng'); return !!v && v.textContent.includes('正解は') && !!document.querySelector('.tl-q .tl-blank.is-ng') && !!document.querySelector('.choice-btn.correct') && !!document.querySelector('.choice-btn.incorrect'); }), '誤り: 判定(正解は …)・空欄・正解と選んだ誤りの印');
  const st2 = await p.get('numbersStats');
  t.ok(st2[q2.id] && st2[q2.id].w === 1 && st2[q2.id].grade === 0, '誤りを記録', st2[q2.id]);
  await p.click('[data-role="next"]');
  // 残りは正解で進める
  await p.evaluate(async () => {
    for (let k = 0; k < 400 && !document.querySelector('.tl-result'); k++) {
      const s = Views.numbers._internal.getSession();
      const it = s.list[s.index];
      const b = Array.from(document.querySelectorAll('.tl-choices .choice-btn:not(:disabled)')).find((x) => x.querySelector('.choice-text').textContent === it.a.trim());
      if (b) b.click();
      await new Promise((r) => setTimeout(r, 20));
      const n = document.querySelector('[data-role="next"]');
      if (n) n.click();
      await new Promise((r) => setTimeout(r, 20));
    }
  });
  const res = await p.waitFor(() => { const r = document.querySelector('.tl-result'); return r && { score: r.querySelector('.tl-result-score').textContent.replace(/\s+/g, ''), retry: !!r.querySelector('[data-role="retry-missed"]'), focus: document.activeElement === r.querySelector('.tl-result-title') }; });
  t.ok(res && res.score.startsWith(`${q1.n - 1}/${q1.n}`) && res.retry && res.focus, `結果: ${q1.n - 1} / ${q1.n} 正解・「間違えたものだけもう一度」・見出しにフォーカス`, res);
  await p.click('[data-role="retry-missed"]');
  const again = await p.waitFor(() => { const s = Views.numbers._internal.getSession(); return s && !document.querySelector('.tl-result') && document.querySelector('.tl-card') && s.list.map((x) => x.id); });
  t.eq(again, [q2.id], 'もう一度は間違えた数字だけ');
});

B.test('数字まとめ(カードでめくる・PC): Space で答えを見る・1 で「覚えた」・記録・最後は結果', async (t) => {
  const p = await t.open('numbers', { device: 'desktop', seed: { toolPrefs: { numbers: { mode: 'card', size: 10, cat: 'all', group: 'all' } } } });
  await p.click('[data-role="start"]');
  await p.waitFor(() => !!document.querySelector('.tl-card [data-role="reveal"]'));
  const id = await p.evaluate(() => { const s = Views.numbers._internal.getSession(); return s.list[s.index].id; });
  await p.press('Space');
  t.ok(await p.waitFor(() => !!document.querySelector('.tl-card.is-revealed .tl-blank.is-shown') && document.querySelectorAll('.tl-grade [data-grade]').length === 3), 'Space で答え(空欄に表示)と ○△× のボタン');
  t.ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.grade === '2'), 'フォーカスは「覚えた」へ');
  await p.press('1');
  t.ok(await p.waitFor((x) => { const s = Views.numbers._internal.getSession(); return s.results.length === 1 && (s.index >= s.list.length ? !!document.querySelector('.tl-result') : s.list[s.index].id !== x); }, {}, id), '1 で「覚えた」→ 次へ');
  const st = await p.get('numbersStats');
  t.ok(st[id] && st[id].grade === 2 && st[id].c === 1, '覚えたを記録', st[id]);
  // 残りは △(2)で
  await p.evaluate(async () => {
    for (let k = 0; k < 400 && !document.querySelector('.tl-result'); k++) {
      const r = document.querySelector('[data-role="reveal"]');
      if (r) r.click();
      await new Promise((x) => setTimeout(x, 20));
      const g = document.querySelector('.tl-grade [data-grade="1"]');
      if (g) g.click();
      await new Promise((x) => setTimeout(x, 20));
    }
  });
  t.ok(await p.waitFor(() => !!document.querySelector('.tl-result .tl-result-score')), '最後は結果');
});

B.test('比較表(穴埋め): 表を見る → 穴埋め(URL)・空欄に答えると判定がマスに残り次の空欄へ・全部正解で記録', async (t) => {
  const p = await t.open('compare');
  const tb = await p.evaluate(() => { const x = (APP_DATA.compareTables || []).find((y) => y.keys && y.keys.length); return x && { id: x.id, n: x.keys.length }; });
  if (!tb) t.skip('穴埋めのある表がありません');
  await p.click(`a.list-row[data-id="${tb.id}"]`);
  t.ok(await p.waitFor((id) => location.hash === `#compare/${id}` && !!document.querySelector('.tl-table') && !document.querySelector('.tl-blank'), {}, tb.id), '一覧から表を開く(表を見る)');
  await p.click('[data-mode="fill"]');
  t.ok(await p.waitFor((id) => location.hash === `#compare/${id}/fill` && document.querySelectorAll('.tl-table .tl-blank.is-q').length && !!document.querySelector('.tl-panel'), {}, tb.id), '穴埋め: 空欄と答えの欄・URL は /fill');
  t.eq(await p.evaluate(() => document.querySelectorAll('.tl-table button.tl-blank').length), tb.n, '空欄の数 = keys の数');
  // いまの空欄の正解(表のデータから)
  const answerOf = () => p.evaluate((id) => {
    const x = APP_DATA.compareTables.find((y) => y.id === id);
    const cur = document.querySelector('.tl-blank.is-current');
    if (!cur) return null;
    const [r, c] = cur.dataset.key.split('-').map(Number);
    const a = String(x.rows[r].cells[c]).trim();
    const btns = Array.from(document.querySelectorAll('.tl-panel .choice-btn'));
    return { key: cur.dataset.key, a, idx: btns.findIndex((b) => b.querySelector('.choice-text').textContent === a), choices: btns.length };
  }, tb.id);
  const first = await answerOf();
  await B.sleep(FRESH);
  if (first.choices) {
    t.ok(first.idx >= 0 && first.choices >= 3 && first.choices <= 4, '選択肢は3〜4つで正解を含む', first);
    await p.click('.tl-panel .choice-btn', first.idx);
  } else {
    await p.click('[data-role="reveal"]');
    await B.sleep(FRESH);
    await p.click('.tl-panel [data-grade="2"]');
  }
  t.ok(await p.waitFor((k) => !!document.querySelector(`.tl-table .tl-blank.is-filled.is-ok[data-key="${k}"]`), {}, first.key), '答えたマスは正解の色で答えを表示');
  if (tb.n > 1) t.ok(await p.waitFor((k) => { const c = document.querySelector('.tl-blank.is-current'); return !!c && c.dataset.key !== k && !!document.querySelector('.tl-panel-prev'); }, {}, first.key), '次の空欄へ(前の判定は欄の上に)');
  await p.evaluate(async (id) => {
    const x = APP_DATA.compareTables.find((y) => y.id === id);
    for (let k = 0; k < 60 && !document.querySelector('.tl-result'); k++) {
      const cur = document.querySelector('.tl-blank.is-current');
      if (cur) {
        const [r, c] = cur.dataset.key.split('-').map(Number);
        const a = String(x.rows[r].cells[c]).trim();
        const b = Array.from(document.querySelectorAll('.tl-panel .choice-btn')).find((y) => y.querySelector('.choice-text').textContent === a);
        if (b) b.click();
        else { const rv = document.querySelector('.tl-panel [data-role="reveal"]'); if (rv) rv.click(); const g = document.querySelector('.tl-panel [data-grade="2"]'); if (g) g.click(); }
      }
      await new Promise((r) => setTimeout(r, 30));
    }
  }, tb.id);
  const res = await p.waitFor(() => { const r = document.querySelector('.tl-result'); return r && { score: r.querySelector('.tl-result-score').textContent.replace(/\s+/g, ''), retry: !!r.querySelector('[data-role="retry-missed"]') }; });
  t.ok(res && res.score.startsWith(`${tb.n}/${tb.n}`) && !res.retry, `結果: 全部正解(${tb.n} / ${tb.n})・「間違えたマスだけ」は出ない`, res);
  t.eq(await p.evaluate(() => document.querySelectorAll('.tl-table .tl-blank.is-filled.is-ok').length), tb.n, '表のマスはすべて正解の色');
  const st = (await p.get('compareStats'))[tb.id];
  t.ok(st && st.done === 1 && st.c === tb.n && st.w === 0 && st.lastOk === tb.n && st.lastN === tb.n && st.grade === 2, 'compareStats(done・c・lastOk・grade)', st);
  // 結果へのなめらかなスクロールが止まってから押す(途中で押すと別のボタンに当たる)
  await p.stable(() => window.scrollY);
  await p.click('[data-role="to-view"]');
  t.ok(await p.waitFor((id) => location.hash === `#compare/${id}` && !document.querySelector('.tl-blank') && !document.querySelector('.tl-panel'), {}, tb.id), '「表を見る」で元の表へ');
  t.ok(!(await p.overflow()), 'はみ出さない');
});

B.test('条文穴埋め(思い出す): 空欄をタップで答え・全部見て ○ で記録・経験値・次の条文へ(苦手の順)', async (t) => {
  const p = await t.open('joubun');
  const it = await p.evaluate(() => { const x = (APP_DATA.joubun.items || []).find((y) => y.blanks.length >= 2); return x && { id: x.id, a0: x.blanks[0].a, n: x.blanks.length }; });
  if (!it) t.skip('空欄が2つ以上の条文がありません');
  await p.go(`joubun/${it.id}/recall`);
  t.ok(await p.waitFor((n) => document.querySelectorAll('.tl-law-text button.tl-blank').length === n && !!document.querySelector('[data-role="reveal-next"]'), {}, it.n), '空欄はすべて隠れていて、「次の空欄を見る」がある');
  const n0 = await p.evaluate(() => document.querySelector('.tl-law-text button.tl-blank').dataset.b);
  await p.click('.tl-law-text button.tl-blank');
  t.ok(await p.waitFor((b, a) => { const el = document.querySelector(`.tl-law-text .tl-blank.is-shown[data-b="${b}"]`); return !!el && el.textContent.includes(a); }, {}, n0, it.a0), 'タップした空欄に答えが出る');
  t.ok(!(await p.exists('[data-grade]')), '全部見るまで採点のボタンは出ない');
  await p.click('[data-role="reveal-all"]');
  t.ok(await p.waitFor(() => !document.querySelector('.tl-law-text button.tl-blank') && document.querySelectorAll('.tl-panel [data-grade]').length === 3), '全部の答え → ○△× のボタン');
  const xp0 = await p.evaluate(() => (window.Xp ? Xp.total() : 0));
  await B.sleep(FRESH);
  await p.click('.tl-panel [data-grade="2"]');
  const res = await p.waitFor((id) => { const a = document.querySelector('.tl-result [data-role="next-weak"]'); return a && { href: a.getAttribute('href') }; }, {}, it.id);
  t.ok(res && /^#joubun\/[^/]+\/recall$/.test(res.href) && !res.href.includes(`/${it.id}/`), '「次の条文へ」は別の条文(同じやり方)', res);
  const st = (await p.get('joubunStats'))[it.id];
  t.ok(st && st.grade === 2 && st.c === 1 && st.w === 0, 'joubunStats に ○ を記録', st);
  if (await p.evaluate(() => !!window.Xp)) t.ok((await p.evaluate(() => Xp.total())) > xp0, '経験値が増える');
  // 一覧: 覚えた数と、その条文の状態
  await p.go('joubun');
  t.ok(await p.waitFor((id) => { const r = document.querySelector(`a.list-row[data-id="${id}"] .tl-row-status`); return !!r && /言えた/.test(r.textContent) && /^1 \//.test(document.querySelector('.tl-progress-num').textContent.trim()); }, {}, it.id), '一覧: 覚えた 1・その条文は「言えた」');
  t.ok(await p.evaluate((id) => !document.querySelector('[data-role="start-weak"]').getAttribute('href').includes(`/${id}`), it.id), '「次の条文を練習」は覚えた条文以外から');
});

B.test('条文穴埋め(選んで埋める): 正解で空欄が埋まり次の空欄へ・(略)はその場で開いて閉じる・キー 1〜4(PC)', async (t) => {
  const p = await t.open('joubun', { device: 'desktop' });
  const it = await p.evaluate(() => {
    const items = APP_DATA.joubun.items || [];
    const x = items.find((y) => y.blanks.length >= 2 && y.parts.some((q) => q && typeof q.omit === 'string')) || items.find((y) => y.blanks.length >= 2);
    return x && { id: x.id, omit: (x.parts.find((q) => q && typeof q.omit === 'string') || {}).omit || null };
  });
  if (!it) t.skip('空欄が2つ以上の条文がありません');
  await p.go(`joubun/${it.id}/choose`);
  await p.waitFor(() => !!document.querySelector('.tl-panel .choice-btn'));
  if (it.omit) {
    t.ok(await p.evaluate(() => document.querySelector('.tl-omit-text').hidden && document.querySelector('.tl-omit').getAttribute('aria-expanded') === 'false'), '括弧書きは(略)にたたまれている');
    await p.click('.tl-omit');
    t.ok(await p.waitFor((o) => { const x = document.querySelector('.tl-omit-text'); return !x.hidden && x.textContent === o && document.querySelector('.tl-omit').getAttribute('aria-expanded') === 'true'; }, {}, it.omit), '押すとその場で開く(e-Gov の文のまま)');
    await p.click('.tl-omit');
    t.ok(await p.waitFor(() => document.querySelector('.tl-omit-text').hidden), 'もう一度押すとたたむ');
  }
  const answerKey = () => p.evaluate((id) => {
    const x = APP_DATA.joubun.items.find((y) => y.id === id);
    const b = Number(document.querySelector('.tl-blank.is-current').dataset.b);
    const btns = Array.from(document.querySelectorAll('.tl-panel .choice-btn'));
    return { b, key: btns.findIndex((y) => y.querySelector('.choice-text').textContent === String(x.blanks[b].a).trim()) + 1, n: btns.length };
  }, it.id);
  const k1 = await answerKey();
  t.ok(k1.n === 4 && k1.key >= 1, '選択肢は4つで正解を含む', k1);
  await p.press(String(k1.key));
  t.ok(await p.waitFor(() => document.querySelectorAll('.tl-law-text .tl-blank.is-filled.is-ok').length === 1 && !!document.querySelector('.tl-panel-prev.is-ok')), 'キーで正解 → 空欄が埋まり、判定が欄に出る');
  const k2 = await answerKey();
  t.ok(k2.b !== k1.b, '次の空欄へ進む', { k1, k2 });
  const wrong = k2.key === 1 ? 2 : 1;
  await B.sleep(FRESH);
  await p.click('.tl-panel .choice-btn', wrong - 1);
  t.ok(await p.waitFor(() => !!document.querySelector('.tl-law-text .tl-blank.is-filled.is-ng')), '誤りは赤い空欄(正解を表示)');
  const st = (await p.get('joubunStats'))[it.id];
  t.ok(st && st.c === 1 && st.w === 1, '空欄ごとに c・w を記録', st);
});

B.test('3つの画面を行き来してもイベントリスナー(document・window)が増えない(PC)', async (t) => {
  const p = await t.open('home', { device: 'desktop' });
  const hs = await p.evaluate(() => {
    const tb = (APP_DATA.compareTables || [])[0];
    const jb = (APP_DATA.joubun.items || [])[0];
    return ['numbers', 'numbers/list', 'compare'].concat(tb ? [`compare/${tb.id}/fill`] : []).concat(['joubun']).concat(jb ? [`joubun/${jb.id}/choose`, `joubun/${jb.id}/recall`] : []).concat(['home']);
  });
  const cycle = async () => {
    for (const h of hs) await p.go(h);
    await p.go('numbers');
    await p.click('[data-role="start"]');
    await p.waitFor(() => !!document.querySelector('.tl-card'));
    await p.go('home');
  };
  await cycle();
  const l1 = await p.listeners();
  for (let i = 0; i < 3; i++) await cycle();
  const l2 = await p.listeners();
  const grew = Object.keys(l2).filter((k) => (l2[k] || 0) > (l1[k] || 0)).map((k) => `${k}: ${l1[k] || 0} → ${l2[k]}`);
  t.eq(grew, [], 'リスナーが増えない');
});

B.run();
