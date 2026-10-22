// 数字まとめ・比較表・条文穴埋めの直し(v14 の点検で見つかったもの・ブラウザ)
// 条文の途中で離れても「まだ」/ キーの押しっぱなしで残りの空欄を答えない / 「練習」のリンクは全文を読むにしない /
// 開いた直後もいまの空欄が下の欄の裏に隠れない(iPhone SE の高さも)/ 答えを見て欄が高くなっても隠れない /
// スマホの比較表はカードの上から順に聞く / 数字の4択の2問目は問題の文にフォーカス(Enter 2回で答えない)/
// 結果の見出し・括弧書きのボタンの読み上げ / 「もっと見る」は中身の件数 / 狭い画面の切り替えは横にスクロールしない /
// 数字の検索結果はそのまとまりへ / 税理士が目的なら比較表は消費税法から / カードの × は「覚えていない」 /
// 埋めた長い答えが行をまたいでも、中身のない小さな札が次の行にできない(判定の読み上げは札の外)
// データは作業中に変わるので、問題の中身は画面の中で APP_DATA から読む
'use strict';
const B = require('../lib/browser.js');

// 選択肢・採点のボタンは、作った直後(約0.3秒)のタップを受けない(js/cloze.js の freshGuard)
const FRESH = 400;
// iPhone SE(Safari のツールバーを除いた高さ)
const SE = { width: 375, height: 553, deviceScaleFactor: 2, mobile: true };

// いまの空欄と下に貼り付く欄(重なっていないか)
const CUR_VS_PANEL = () => {
  const b = document.querySelector('.tl-blank.is-current');
  const pn = document.querySelector('.tl-panel');
  if (!b || !pn) return null;
  const r = b.getBoundingClientRect();
  const pr = pn.getBoundingClientRect();
  return { bottom: Math.round(r.bottom), top: Math.round(r.top), panelTop: Math.round(pr.top), ok: r.bottom <= pr.top + 1 && r.top >= 0 };
};

B.test('条文(選んで埋める): 空欄の一部だけ答えて離れても「まだ」(正解でも誤りでも)・苦手に数えない', async (t) => {
  const p = await t.open('joubun');
  const it = await p.evaluate(() => { const x = APP_DATA.joubun.items.find((y) => y.blanks.length >= 3); return x && { id: x.id, n: x.blanks.length }; });
  if (!it) t.skip('空欄が3つ以上の条文がありません');
  await p.go(`joubun/${it.id}/choose`);
  await p.waitFor(() => !!document.querySelector('.tl-panel .choice-btn'));
  // 2つの空欄に正解を選ぶ(キーで)
  const answer = (ok) => p.evaluate((id, good) => {
    const x = APP_DATA.joubun.items.find((y) => y.id === id);
    const b = Number(document.querySelector('.tl-blank.is-current').dataset.b);
    const btns = Array.from(document.querySelectorAll('.tl-panel .choice-btn'));
    const right = btns.findIndex((y) => y.querySelector('.choice-text').textContent === String(x.blanks[b].a).trim());
    return good ? right + 1 : (right === 0 ? 2 : 1);
  }, it.id, ok);
  for (let i = 0; i < 2; i++) {
    const k = await answer(true);
    const before = await p.evaluate(() => document.querySelectorAll('.tl-law-text .tl-blank.is-filled').length);
    await p.press(String(k));
    await p.waitFor((n) => document.querySelectorAll('.tl-law-text .tl-blank.is-filled').length === n + 1, {}, before);
  }
  const st = (await p.get('joubunStats'))[it.id];
  t.ok(st && st.c === 2 && st.w === 0 && !('grade' in st), '途中の記録は c・w だけ(grade: null を残さない)', st);
  await p.go('joubun');
  const row = await p.waitFor((id) => {
    const r = document.querySelector(`a.list-row[data-id="${id}"] .tl-row-status`);
    const start = document.querySelector('[data-role="start-weak"]');
    return r && start && { status: r.textContent.trim(), sub: document.querySelector('.tl-progress-sub').textContent, start: start.textContent.trim() };
  }, {}, it.id);
  t.ok(row && row.status === 'まだ' && !/復習したい/.test(row.sub) && /次の条文を練習/.test(row.start), '一覧は「まだ」・「復習したい条文」なし・「次の条文を練習」', row);
  // 誤りが多い途中も、一覧は「まだ」(終えていないので点は付けない)
  await p.go(`joubun/${it.id}/choose`);
  await p.waitFor(() => !!document.querySelector('.tl-panel .choice-btn'));
  for (let i = 0; i < 2; i++) {
    const k = await answer(false);
    const before = await p.evaluate(() => document.querySelectorAll('.tl-law-text .tl-blank.is-filled').length);
    await p.press(String(k));
    await p.waitFor((n) => document.querySelectorAll('.tl-law-text .tl-blank.is-filled').length === n + 1, {}, before);
  }
  await p.go('joubun');
  const row2 = await p.waitFor((id) => { const r = document.querySelector(`a.list-row[data-id="${id}"] .tl-row-status`); return r && { status: r.textContent.trim(), sub: document.querySelector('.tl-progress-sub').textContent }; }, {}, it.id);
  t.ok(row2 && row2.status === 'まだ' && !/復習したい/.test(row2.sub), '誤りの多い途中も「まだ」', row2);
});

B.test('キーの押しっぱなし(自動のくり返し)では、次の空欄を答えない(比較表の穴埋め・条文の選んで埋める)', async (t) => {
  const p = await t.open('compare', { device: 'desktop' });
  const tb = await p.evaluate(() => {
    const I = Views.compare._internal;
    const x = APP_DATA.compareTables.find((y) => I.keysOf(y).length >= 3 && I.keysOf(y).every((k) => Cloze.options(String(y.rows[k.r].cells[k.c]), I.columnAlts(y, k)).length >= 3));
    return x && x.id;
  });
  if (!tb) t.skip('4択だけの表がありません');
  await p.go(`compare/${tb}/fill`);
  await p.waitFor(() => !!document.querySelector('.tl-panel .choice-btn'));
  await p.press('1');
  await p.evaluate(() => { for (let i = 0; i < 6; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true, bubbles: true })); });
  await B.sleep(200);
  const done = await p.evaluate(() => document.querySelectorAll('.tl-table .tl-blank.is-filled').length);
  t.eq(done, 1, '押しっぱなしの分は答えない(1マスだけ)');
  t.ok(!(await p.exists('.tl-result')), '結果の画面にならない');
  const st = (await p.get('compareStats'))[tb];
  t.ok(st && st.c + st.w === 1 && !st.done, '記録は1マス分だけ', st);
  const jb = await p.evaluate(() => { const x = APP_DATA.joubun.items.find((y) => y.blanks.length >= 3); return x && x.id; });
  await p.go(`joubun/${jb}/choose`);
  await p.waitFor(() => !!document.querySelector('.tl-panel .choice-btn'));
  await p.press('2');
  await p.evaluate(() => { for (let i = 0; i < 6; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', repeat: true, bubbles: true })); });
  await B.sleep(200);
  t.eq(await p.evaluate(() => document.querySelectorAll('.tl-law-text .tl-blank.is-filled').length), 1, '条文も1か所だけ');
});

B.test('条文: 最後に使ったやり方が「全文を読む」でも、「練習」のボタン・次の条文へは 選んで埋める', async (t) => {
  const p = await t.open('joubun', { seed: { toolPrefs: { joubun: { mode: 'read' } } } });
  const href = await p.waitFor(() => { const a = document.querySelector('[data-role="start-weak"]'); return a && a.getAttribute('href'); });
  t.ok(/\/choose$/.test(href || ''), '「次の条文を練習」は /choose', href);
  await p.click('[data-role="start-weak"]');
  t.ok(await p.waitFor(() => /\/choose$/.test(location.hash) && !!document.querySelector('.tl-panel .choice-btn')), '開くと空欄と選択肢');
  // 思い出すを使ったあとは、思い出すのまま
  await p.click('[data-mode="recall"]');
  await p.go('joubun');
  t.ok(/\/recall$/.test(await p.evaluate(() => document.querySelector('[data-role="start-weak"]').getAttribute('href'))), '思い出すを使ったあとは /recall');
});

B.test('開いた直後も、いまの空欄が下に貼り付く欄の裏に隠れない(iPhone・iPhone SE。比較表の穴埋め・条文の選んで埋める)', async (t) => {
  for (const device of ['iphone', SE]) {
    const tag = device === 'iphone' ? 'iPhone' : 'iPhone SE';
    const p = await t.open('home', { device });
    const ids = await p.evaluate(() => {
      const tbs = APP_DATA.compareTables.filter((x) => x.keys && x.keys.length);
      const jbs = APP_DATA.joubun.items.filter((x) => x.blanks.length);
      const pick = (list, want) => [...new Set([list.find((x) => x.id === want), list[0], list[Math.floor(list.length / 2)], list[list.length - 1]].filter(Boolean).map((x) => x.id))];
      return { cmp: pick(tbs, 'cmp-menkyo-toroku'), jb: pick(jbs, 'jb-002-1-12') };
    });
    const hashes = ids.cmp.map((id) => `compare/${id}/fill`).concat(ids.jb.map((id) => `joubun/${id}/choose`));
    for (const h of hashes) {
      await p.go(h);
      const v = await p.waitFor(() => { const x = (function () { const b = document.querySelector('.tl-blank.is-current'); const pn = document.querySelector('.tl-panel'); if (!b || !pn) return null; const r = b.getBoundingClientRect(); const pr = pn.getBoundingClientRect(); return { ok: r.bottom <= pr.top + 1 && r.top >= 0, bottom: Math.round(r.bottom), panelTop: Math.round(pr.top) }; })(); return x && x.ok && x; }, { timeout: 3000 });
      t.ok(!!v, `${tag} #${h}: いまの空欄が見えている`, v || await p.evaluate(CUR_VS_PANEL));
    }
    await p.close();
  }
});

B.test('比較表(スマホ): 空欄はカードの上から順(行 → 列)・答えを見て欄が高くなっても、いまのマスは隠れない', async (t) => {
  const p = await t.open('compare');
  const tb = await p.evaluate(() => {
    const I = Views.compare._internal;
    // 列の順に並べた keys で、行が戻るものがある表
    const x = APP_DATA.compareTables.find((y) => { const k = I.keysOf(y); return k.some((a, i) => i > 0 && a.r < k[i - 1].r); }) || APP_DATA.compareTables.find((y) => I.keysOf(y).length >= 2);
    return x && x.id;
  });
  await p.go(`compare/${tb}/fill`);
  const order = await p.waitFor(() => {
    const bs = Array.from(document.querySelectorAll('.tl-table button.tl-blank'));
    return bs.length && bs.map((b) => ({ n: Number(b.querySelector('.tl-blank-n').textContent), rc: b.dataset.key.split('-').map(Number) })).sort((a, b) => a.n - b.n).map((x) => x.rc);
  });
  const sorted = order.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  t.eq(order, sorted, `空欄の番号は行 → 列の順(${tb})`);
  t.eq(await p.evaluate(() => document.querySelector('.tl-blank.is-current').querySelector('.tl-blank-n').textContent), '1', '最初は1番');
  // 自分で採点する空欄(同じ列のほかの値が足りない)
  const self = await p.evaluate(() => {
    const I = Views.compare._internal;
    for (const y of APP_DATA.compareTables) {
      const k = I.keysOf(y).find((a) => Cloze.options(String(y.rows[a.r].cells[a.c]), I.columnAlts(y, a)).length < 3);
      if (k) return { id: y.id, key: k.id };
    }
    return null;
  });
  if (!self) { t.ok(true, '自分で採点するマスのある表はない(省く)'); return; }
  await p.go(`compare/${self.id}/fill`);
  await p.waitFor(() => !!document.querySelector('.tl-panel'));
  await p.evaluate((k) => { const b = document.querySelector(`button.tl-blank[data-key="${k}"]`); if (b && !b.classList.contains('is-current')) b.click(); }, self.key);
  await p.waitFor(() => !!document.querySelector('.tl-panel [data-role="reveal"]'));
  await B.sleep(FRESH);
  await p.click('.tl-panel [data-role="reveal"]');
  await p.waitFor(() => document.querySelectorAll('.tl-panel [data-grade]').length === 3);
  const v = await p.stable(CUR_VS_PANEL);
  t.ok(v && v.ok, '答えと ○△× で欄が高くなっても、いまのマスは見えている', v);
});

B.test('数字の4択: 2問目からは問題の文にフォーカス・「つづける」で Enter を2回押しても次の問題を答えない・× は「覚えていない」', async (t) => {
  const p = await t.open('numbers', { device: 'desktop', seed: { toolPrefs: { numbers: { mode: 'choice', size: 10, cat: 'all', group: 'all' } } } });
  t.ok(await p.waitFor(() => /まだ解いていない/.test(document.querySelector('.tl-progress-sub').textContent)), '「まだ」ではなく「まだ解いていない」');
  await p.click('[data-role="start"]');
  await p.waitFor(() => !!document.querySelector('.tl-card .tl-choices'));
  await p.press('1');
  await p.waitFor(() => !!document.querySelector('[data-role="next"]'));
  t.ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.role === 'next'), 'キーで答えると「つづける」にフォーカス');
  await p.press('Enter');
  await p.press('Enter');
  await B.sleep(150);
  const s = await p.evaluate(() => {
    const ss = Views.numbers._internal.getSession();
    const ae = document.activeElement;
    return { index: ss.index, results: ss.results.length, answered: !!document.querySelector('.tl-card.is-answered'), focus: ae ? `${ae.tagName}.${ae.className}` : null };
  });
  t.ok(s.index === 1 && s.results === 1 && !s.answered, 'Enter の2回目で2問目を答えない', s);
  t.ok(/^P\.tl-q/.test(s.focus || ''), '2問目は問題の文にフォーカス', s);
  await p.press('Tab');
  t.ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('choice-btn') && document.activeElement.dataset.choice === '0'), '次の Tab で選択肢1');
  // カードでめくる: × は「覚えていない」
  await p.go('numbers');
  await p.click('[data-mode="card"]');
  await p.click('[data-role="start"]');
  await p.waitFor(() => !!document.querySelector('.tl-card [data-role="reveal"]'));
  await B.sleep(FRESH);
  await p.click('[data-role="reveal"]');
  const labels = await p.waitFor(() => { const bs = document.querySelectorAll('.tl-grade [data-grade]'); return bs.length === 3 && Array.from(bs).map((b) => b.querySelector('.tl-grade-label').textContent.replace(/^[○△×] /, '')); });
  t.eq(labels, ['覚えた', 'あいまい', '覚えていない'], 'カードの ○△× は 覚えた・あいまい・覚えていない');
});

B.test('数字の結果: 上の「やめる」は「数字まとめドリル」に・検索の結果からそのまとまりへ(描いて移る・見出しにフォーカス)', async (t) => {
  const p = await t.open('numbers', { seed: { toolPrefs: { numbers: { mode: 'card', size: 10, cat: 'all', group: 'all' } } } });
  await p.click('[data-role="start"]');
  await p.waitFor(() => !!document.querySelector('.tl-card'));
  t.ok(/やめる/.test(await p.evaluate(() => document.querySelector('[data-role="quit"]').textContent)), '出題中は「やめる」');
  await p.evaluate(async () => {
    for (let k = 0; k < 60 && !document.querySelector('.tl-result'); k++) {
      const r = document.querySelector('[data-role="reveal"]');
      if (r) r.click();
      await new Promise((x) => setTimeout(x, 20));
      const g = document.querySelector('.tl-grade [data-grade="2"]');
      if (g) g.click();
      await new Promise((x) => setTimeout(x, 20));
    }
  });
  t.ok(await p.waitFor(() => !!document.querySelector('.tl-result') && /数字まとめドリル/.test(document.querySelector('[data-role="quit"]').textContent) && !/やめる/.test(document.querySelector('[data-role="quit"]').textContent)), '結果では「数字まとめドリル」(設定へ戻る)');
  // 検索: 後ろの方のまとまり(最初は描かれていない)
  const g = await p.evaluate(() => {
    const groups = Views.numbers._internal.groupsOf(APP_DATA.numbers.filter((n) => n.cat === APP_DATA.numbers[0].cat));
    const x = groups[groups.length - 1];
    const r = GlobalSearch.search(x.name, 20).find((y) => y.type === '数字まとめ' && y.title === x.name);
    return { name: x.name, nav: r && r.nav, last: groups.length };
  });
  t.ok(g.nav && g.nav.startsWith('#numbers/list/') && g.nav.endsWith(encodeURIComponent(g.name)), '検索の行き先はそのまとまり', g);
  await p.evaluate((h) => { location.hash = h; }, g.nav);
  const at = await p.waitFor((name) => {
    const sec = Array.from(document.querySelectorAll('.tl-group')).find((s) => s.dataset.group === name);
    if (!sec) return null;
    const r = sec.getBoundingClientRect();
    const h = sec.querySelector('.tl-group-head');
    return r.top >= 0 && r.top < innerHeight / 2 && document.activeElement === h && { top: Math.round(r.top), y: Math.round(scrollY) };
  }, {}, g.name);
  t.ok(at && at.y > 0, 'そのまとまりが画面の上の方に出て、見出しにフォーカス', at);
});

B.test('結果の見出し・括弧書きのボタンの読み上げ・「もっと見る」は中身の件数', async (t) => {
  const p = await t.open('joubun');
  // もっと見る(あと N項目): 描いていない条文の数
  const more = await p.evaluate(() => {
    const b = document.querySelector('[data-role="more"]');
    if (!b) return { none: true };
    const shown = document.querySelectorAll('.tl-joubun-list > li').length;
    return { text: b.textContent, want: APP_DATA.joubun.items.length - shown };
  });
  t.ok(more.none || more.text === `もっと見る(あと${more.want}項目)`, '条文の「もっと見る」は条文の数', more);
  await p.go('compare');
  const more2 = await p.evaluate(() => {
    const b = document.querySelector('[data-role="more"]');
    if (!b) return { none: true };
    return { text: b.textContent, want: APP_DATA.compareTables.length - document.querySelectorAll('.tl-table-list > li').length };
  });
  t.ok(more2.none || more2.text === `もっと見る(あと${more2.want}表)`, '比較表の「もっと見る」は表の数', more2);
  // 括弧書き
  const it = await p.evaluate(() => { const x = APP_DATA.joubun.items.find((y) => y.blanks.length && y.parts.some((q) => q && typeof q.omit === 'string')); return x && x.id; });
  if (it) {
    await p.go(`joubun/${it}/recall`);
    const a = await p.waitFor(() => {
      const b = document.querySelector('.tl-omit');
      const all = document.querySelector('[data-role="omit-all"]');
      return b && { label: b.getAttribute('aria-label'), text: b.textContent, exp: b.getAttribute('aria-expanded'), pressed: all ? all.hasAttribute('aria-pressed') : false };
    });
    t.ok(a && a.label === '括弧書き' && a.text === '（略）' && a.exp === 'false' && !a.pressed, '(略)のボタン: 名前は「括弧書き」・開いているかは aria-expanded・「全部ひらく」に aria-pressed なし', a);
    await p.click('.tl-omit');
    t.ok(await p.waitFor(() => { const b = document.querySelector('.tl-omit'); return b.textContent === 'たたむ' && b.getAttribute('aria-expanded') === 'true' && b.getAttribute('aria-label') === '括弧書き'; }), '開くと「たたむ」・aria-expanded=true');
  }
  // 思い出すの結果の見出しは h3
  const jb = await p.evaluate(() => APP_DATA.joubun.items.find((y) => y.blanks.length).id);
  await p.go(`joubun/${jb}/recall`);
  await p.click('[data-role="reveal-all"]');
  await p.waitFor(() => document.querySelectorAll('.tl-panel [data-grade]').length === 3);
  await B.sleep(FRESH);
  await p.click('.tl-panel [data-grade="2"]');
  const h = await p.waitFor(() => { const e = document.querySelector('.tl-result .tl-result-title'); return e && { tag: e.tagName, focus: document.activeElement === e, text: e.textContent }; });
  t.ok(h && h.tag === 'H3' && h.focus, '「言えました!」は見出し(h3)でフォーカス', h);
});

B.test('320px: やり方・問題数・出題する文の切り替えは横にはみ出さず、全部の名前が見える', async (t) => {
  const p = await t.open('numbers', { device: 'w320', dark: true });
  const cut = () => p.evaluate(() => Array.from(document.querySelectorAll('.tl-seg, .ch-seg')).filter((s) => s.getClientRects().length && s.scrollWidth > s.clientWidth + 1).map((s) => `${s.dataset.role || s.className}: ${s.scrollWidth}>${s.clientWidth}`));
  await p.waitFor(() => document.querySelectorAll('.tl-seg').length >= 2);
  t.eq(await cut(), [], '#numbers: やり方・問題数');
  await p.go('challenge');
  await p.waitFor(() => !!document.querySelector('.ch-seg'));
  t.eq(await cut(), [], '#challenge: 出題する文');
  const jb = await p.evaluate(() => APP_DATA.joubun.items.find((y) => y.blanks.length).id);
  await p.go(`joubun/${jb}/choose`);
  await p.waitFor(() => !!document.querySelector('.tl-mode'));
  t.eq(await cut(), [], '#joubun: やり方');
  t.ok(!(await p.overflow()), 'はみ出しなし');
  // 条文の一覧: 条の番号は「第」の前でだけ折り返す
  await p.go('joubun');
  const art = await p.evaluate(() => { const e = document.querySelector('.tl-row-art'); return e && getComputedStyle(e).wordBreak; });
  t.eq(art, 'keep-all', '条の番号は途中で折り返さない(keep-all)');
  // 数字の4択(2列)で間違えたとき: 札は1行・はみ出しなし
  await p.go('numbers');
  await p.click('[data-mode="choice"]');
  await p.click('[data-role="start"]');
  await p.waitFor(() => !!document.querySelector('.tl-card .tl-choices'));
  await p.evaluate(() => {
    const s = Views.numbers._internal.getSession();
    const it = s.list[s.index];
    const b = Array.from(document.querySelectorAll('.tl-choices .choice-btn')).find((x) => x.querySelector('.choice-text').textContent !== it.a.trim());
    b.click();
  });
  await p.waitFor(() => !!document.querySelector('.choice-tag.is-mine'));
  const tag = await p.evaluate(() => { const e = document.querySelector('.choice-tag.is-mine'); return { ws: getComputedStyle(e).whiteSpace, h: Math.round(e.getBoundingClientRect().height) }; });
  t.ok(tag.ws === 'nowrap' && tag.h <= 24, '「あなたの回答」は1行', tag);
  t.ok(!(await p.overflow()), '答えたあともはみ出しなし');
});

// 埋めた空欄の札が行をまたぐとき、中身のない小さな札(幅 24px 未満のかけら)ができていないか。読み上げ用の判定は札のすぐ後ろ
const EMPTY_PIECES = (sel) => Array.from(document.querySelectorAll(sel)).map((el) => ({
  text: el.textContent, widths: Array.from(el.getClientRects()).map((r) => Math.round(r.width)),
  srInside: !!el.querySelector('.sr-only'), srAfter: !!(el.nextElementSibling && el.nextElementSibling.matches('.sr-only') && /^\((正解|覚えていた)/.test(el.nextElementSibling.textContent)),
}));

B.test('埋めた空欄の長い答え(iPhone): 行をまたいでも中身のない札が次の行にできない・判定の読み上げは札のすぐ後ろ(比較表・条文)', async (t) => {
  const p = await t.open('compare');
  // スマホの幅で長い答えが行末にかかる表と条文(データが変わっても、確かめる中身は同じ)
  for (const id of ['cmp-teishakuchi', 'cmp-hosho', 'cmp-muken-dairi']) {
    if (!(await p.evaluate((x) => (APP_DATA.compareTables || []).some((y) => y.id === x), id))) continue;
    await p.go(`compare/${id}/fill`);
    await p.waitFor(() => !!document.querySelector('.tl-blank.is-current'));
    await p.evaluate(async (x) => {
      const tb = APP_DATA.compareTables.find((y) => y.id === x);
      for (let i = 0; i < 40 && document.querySelector('.tl-blank.is-current'); i++) {
        const [r, c] = document.querySelector('.tl-blank.is-current').dataset.key.split('-').map(Number);
        const btn = Array.from(document.querySelectorAll('.tl-panel .choice-btn')).find((e) => e.querySelector('.choice-text').textContent === String(tb.rows[r].cells[c]).trim());
        const reveal = document.querySelector('.tl-panel [data-role="reveal"]');
        if (btn) btn.click();
        else if (reveal) {
          // 選択肢を作れないマスは「答えを見る」→「覚えていた」
          reveal.click();
          await new Promise((res) => setTimeout(res, 50));
          const g = document.querySelector('.tl-panel [data-grade="2"]');
          if (!g) break;
          g.click();
        } else break;
        await new Promise((res) => setTimeout(res, 50));
      }
    }, id);
    const list = await p.evaluate(EMPTY_PIECES, '.tl-table .tl-blank.is-filled.is-ok');
    t.ok(list.length > 0, `${id}: 埋めた`, list.length);
    const bad = list.filter((x) => (x.widths.length > 1 && x.widths.some((w) => w < 24)) || x.srInside || !x.srAfter);
    t.ok(!bad.length, `${id}: 中身のない札なし・判定は札の後ろ`, bad);
  }
  for (const id of ['jb-002-1-8', 'jb-011-1']) {
    if (!(await p.evaluate((x) => ((APP_DATA.joubun || {}).items || []).some((y) => y.id === x), id))) continue;
    await p.go(`joubun/${id}/choose`);
    await p.waitFor(() => !!document.querySelector('.tl-law-text .tl-blank.is-current'));
    await p.evaluate(async (x) => {
      const it = APP_DATA.joubun.items.find((y) => y.id === x);
      for (let i = 0; i < 20 && document.querySelector('.tl-law-text .tl-blank.is-current'); i++) {
        const a = it.blanks[Number(document.querySelector('.tl-law-text .tl-blank.is-current').dataset.b)].a;
        const btn = Array.from(document.querySelectorAll('.tl-panel .choice-btn')).find((e) => e.querySelector('.choice-text').textContent === a);
        if (!btn) break;
        btn.click();
        await new Promise((res) => setTimeout(res, 50));
      }
    }, id);
    const list = await p.evaluate(EMPTY_PIECES, '.tl-law-text .tl-blank.is-filled.is-ok');
    t.ok(list.length > 0, `${id}: 選んで埋めた`, list.length);
    const bad = list.filter((x) => (x.widths.length > 1 && x.widths.some((w) => w < 24)) || x.srInside || !x.srAfter);
    t.ok(!bad.length, `${id}: 中身のない札なし・判定は札の後ろ`, bad);
  }
});

B.test('税理士(消費税法)が目的: 比較表は消費税法の表から', async (t) => {
  const p = await t.open('compare', { seed: { learnerProfile: { goal: 'zeirishi', interests: [], at: 1 } } });
  const first = await p.waitFor(() => { const h = document.querySelector('.tl-group .tl-group-title'); return h && h.textContent; });
  t.ok(/消費税法/.test(first || ''), '最初のまとまりは消費税法', first);
});

B.run();
