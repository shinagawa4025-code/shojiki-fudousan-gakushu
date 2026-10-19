// 学習の画面(ブラウザ): 今日の復習(キー操作・評価・元に戻す・完了の画面)・トピック一覧(区分・分野の色)・トピック詳細(学習済みの印・
// 次へ・未学習のみ・直リンク)・用語集(記憶済みの星・めくる)・ブックマーク(外す・元に戻す)・図解・計算機・320px のはみ出し
// 元: scratchpad r7/E2 behave.js(保存データは tools/tests/fixtures/seeds.js の learn)
'use strict';
const B = require('../lib/browser.js');
const S = require('../fixtures/seeds.js');

// CSS の色のトークン(--cat-kenri など)を rgb(...) にする関数を、ページに window.__token として置く
// (公開版は CSP で eval が使えないので、関数は DevTools の評価で定義する。読み込み直すと消えるので使う前に呼ぶ)
const TOKEN = (name) => { const d = document.createElement('div'); d.style.color = `var(${name})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
// 立体的なボタンの「ふち」(ぼかしなしで下へ 3px 以上ずらした影。厚さはデザインで変わりうるので数は決めない)
const LIP = (shadow) => /(^|,\s*)(rgba?\([^)]*\)\s+)?0px\s+([3-9]|[1-9]\d)px\s+0px/.test(String(shadow));
const defineToken = (p) => p.evaluate(`window.__token = ${TOKEN.toString()}; true`);

B.test('今日の復習: Space でめくる・1〜4 で評価・U で元に戻す・もう一度は後ろへ・完了の画面と紙吹雪(PC)', async (t) => {
  const p = await t.open('review', { device: 'desktop', seedFn: S.learn, seedArgs: { due: 3, newLimit: 0 } });
  const st = () => p.evaluate(() => {
    const card = document.querySelector('.review-view .flip-card');
    const tray = document.querySelector('.review-grade-row');
    return {
      term: card ? card.dataset.termId : null, flipped: card ? card.classList.contains('flipped') : null, count: (document.querySelector('[data-role="count"]') || {}).textContent,
      revealHidden: tray ? tray.querySelector('[data-role="reveal"]').hidden : null, gradesHidden: tray ? Array.from(tray.querySelectorAll('[data-grade]')).map((x) => x.hidden) : null,
      trayLabel: tray ? tray.getAttribute('aria-label') : null, expanded: card ? Array.from(card.querySelectorAll('[data-role="flip"]')).map((x) => x.getAttribute('aria-expanded')) : null,
      done: !!document.querySelector('.rv-done'),
    };
  });
  let s = await st();
  t.ok(s.count === '1 / 3' && !s.flipped && s.revealHidden === false && s.gradesHidden.every(Boolean), '最初は表・「答えを見る」だけ', s);
  // (カードを出すと「めくる」ボタンにフォーカスが来る。ボタンの上の Space はボタンのもの。ここでは画面全体のキー操作を確かめるので、外してから押す)
  const space = async () => { await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); }); await p.press('Space'); };
  await space();
  s = await p.waitFor(() => document.querySelector('.review-view .flip-card').classList.contains('flipped')) && await st();
  t.ok(s.flipped && s.revealHidden === true && s.gradesHidden.every((x) => !x) && s.trayLabel === '覚えていたかを評価', 'Space でめくる → 評価ボタン', s);
  t.ok(s.expanded.every((x) => x === 'true'), 'めくると aria-expanded=true', s.expanded);
  await p.settle();
  const looks = await p.evaluate(() => Array.from(document.querySelectorAll('.review-grade-row [data-grade]')).map((x) => { const cs = getComputedStyle(x); return { bg: cs.backgroundColor, shadow: cs.boxShadow, h: x.getBoundingClientRect().height }; }));
  t.ok(new Set(looks.map((x) => x.bg)).size === 4 && looks.every((x) => LIP(x.shadow) && x.h >= 44), '評価ボタンは4色・ふちつき・44px以上', looks);
  const tts = await p.evaluate(() => {
    const btn = document.querySelector('.review-view .flip-card-back [data-role="tts-btn"]');
    if (!window.TTS || !TTS.supported) return { supported: false };
    let said = null;
    const orig = TTS.speak; TTS.speak = (x) => { said = x; };
    if (btn) btn.click();
    TTS.speak = orig;
    return { supported: true, btn: !!btn, said: !!said, label: btn && btn.getAttribute('aria-label') };
  });
  t.ok(!tts.supported || (tts.btn && tts.said && tts.label === '読み上げ'), '読み上げボタン(使えるとき)', tts);
  const first = s.term;
  await p.press('3');
  s = await p.waitFor((f) => { const c = document.querySelector('.review-view .flip-card'); return c && c.dataset.termId !== f && !c.classList.contains('flipped'); }, {}, first) && await st();
  t.ok(s.count === '2 / 3' && s.term !== first && !s.flipped, '3 で評価 → 次のカード', s);
  await p.press('u');
  s = await p.waitFor((f) => { const c = document.querySelector('.review-view .flip-card'); return c && c.dataset.termId === f; }, {}, first) && await st();
  t.ok(s.count === '1 / 3' && s.term === first, 'U で元に戻す', s);
  await space();
  await p.waitFor(() => document.querySelector('.review-view .flip-card').classList.contains('flipped'), { timeout: 3000 });
  await p.press('1');
  s = await p.waitFor((f) => { const c = document.querySelector('.review-view .flip-card'); return c && c.dataset.termId !== f && !c.classList.contains('flipped'); }, {}, first) && await st();
  t.ok(s.count === '1 / 3' && s.term !== first, '1(もう一度)は後ろへ回す(枚数は同じ)', s);
  for (let i = 0; i < 8 && !(await st()).done; i++) {
    const before = (await st()).term;
    await space();
    await p.waitFor(() => { const c = document.querySelector('.review-view .flip-card'); return !c || c.classList.contains('flipped'); }, { timeout: 3000 });
    await p.press('3');
    await p.waitFor((f) => { const c = document.querySelector('.review-view .flip-card'); return !!document.querySelector('.rv-done') || (c && c.dataset.termId !== f && !c.classList.contains('flipped')); }, {}, before);
  }
  const done = await p.evaluate(() => ({
    done: !!document.querySelector('.rv-done'), mascot: !!document.querySelector('.rv-done .rv-done-hero svg.mascot'),
    heroHidden: document.querySelector('.rv-done-hero') && document.querySelector('.rv-done-hero').getAttribute('aria-hidden'),
    focus: !!document.activeElement && document.activeElement.classList.contains('rv-done-title'), confetti: document.querySelectorAll('.confetti .confetti-bit').length,
    stats: Array.from(document.querySelectorAll('.rv-done-stat strong')).map((x) => x.textContent), ox: !!document.querySelector('[data-role="ox-finish"]'),
  }));
  t.ok(done.done && done.mascot && done.heroHidden === 'true' && done.focus, '完了の画面(マスコットは読み上げない・見出しにフォーカス)', done);
  t.ok(done.confetti > 0 && done.confetti <= 40, '紙吹雪は40個まで', done.confetti);
  t.ok(done.stats[0] === '3' && done.ox, '3枚を評価・「○×で仕上げる」', done);
  t.ok(await p.waitFor(() => !document.querySelector('.confetti'), { timeout: 4000 }), '紙吹雪は消える');
  // 動きを減らす設定: 紙吹雪なし
  const p2 = await t.open('review', { reducedMotion: true, seedFn: S.learn, seedArgs: { due: 1, newLimit: 0 } });
  // (カードを出した直後のタップは、二度押しの防止で無視される。少し待ってから押す)
  await B.sleep(700);
  await p2.evaluate(() => document.querySelector('[data-role="reveal"]').click());
  t.ok(await p2.waitFor(() => { const g = document.querySelector('[data-grade="4"]'); return g && g.offsetParent !== null; }, { timeout: 3000 }), '「答えを見る」で評価ボタン');
  await p2.evaluate(() => document.querySelector('[data-grade="4"]').click());
  const r = await p2.waitFor(() => !!document.querySelector('.rv-done') && ({ confetti: document.querySelectorAll('.confetti').length }));
  t.ok(r && r.confetti === 0, '動きを減らす設定では紙吹雪なし', r);
});

B.test('トピック一覧(区分・分野の色・ⓘ)とトピック詳細(学習済みの印・タップ・Space・次へ・未学習のみ・直リンク)', async (t) => {
  const p = await t.open('topics', { seedFn: S.learn });
  const r = await p.evaluate(() => Array.from(document.querySelectorAll('[data-track]')).map((x) => x.getAttribute('aria-pressed')).join());
  t.eq(r, 'false,true,false', '目標が宅建士なら宅建士の区分');
  const cats = Object.fromEntries(await p.evaluate(() => Array.from(document.querySelectorAll('.topic-card')).map((a) => [a.getAttribute('href'), (a.className.match(/cat-\w+/) || [])[0]])));
  t.ok(cats['#topics/topicL'] === 'cat-kenri' && cats['#topics/topicK'] === 'cat-gyoho' && cats['#topics/topicJ'] === 'cat-horei' && cats['#topics/topicH'] === 'cat-zei' && cats['#topics/topicN'] === 'cat-menjo', '分野の色のクラス', cats);
  await defineToken(p);
  const col = await p.evaluate(() => { const a = document.querySelector('a[href="#topics/topicL"] .topic-icon'); const f = document.querySelector('a[href="#topics/topicL"] .progress-bar-fill'); return { icon: getComputedStyle(a).backgroundColor, fill: getComputedStyle(f).backgroundColor, token: window.__token('--cat-kenri') }; });
  t.ok(col.icon === col.fill && col.icon === col.token, 'ステッカーと進み具合のバーは分野の色(権利 = --cat-kenri)', col);
  await p.evaluate(() => document.querySelector('[data-track="zeirishi"]').click());
  const z = await p.waitFor(() => document.querySelector('[data-track="zeirishi"]').getAttribute('aria-pressed') === 'true' && ({ shohi: !!document.querySelector('a.topic-card.cat-shohi'), saved: history.state && history.state.tState && history.state.tState.track }));
  t.ok(z && z.shohi && z.saved === 'zeirishi', '税理士へ切り替え(消費税は赤)・履歴に保存', z);
  await p.evaluate(() => document.querySelector('.topics-view [data-role="info"]').click());
  t.ok(await p.waitForSelector('.sheet .learn-info-text'), 'ⓘ で説明のシート');
  await p.press('Escape');
  await p.waitFor(() => !document.querySelector('.sheet'));
  await p.settle();
  const sel = await p.evaluate(() => { const x = document.querySelector('[data-track][aria-pressed="true"]'); return { shadow: getComputedStyle(x).boxShadow, h: x.getBoundingClientRect().height }; });
  t.ok(LIP(sel.shadow) && sel.h >= 44, '選んだ区分は塗り+ふち・44px以上', sel);
  t.ok(!(await p.overflow()), 'トピック一覧ははみ出さない');
  // トピック詳細
  await p.go('topics/topicK');
  await p.waitForSelector('.basics-item');
  await p.settle();
  await defineToken(p);
  const info = await p.evaluate(() => {
    const tok = window.__token;
    const items = Array.from(document.querySelectorAll('.basics-item'));
    const learned = items.filter((li) => li.classList.contains('is-learned'));
    const node = learned[0] && learned[0].querySelector('.basics-node');
    const cb = items[0].querySelector('[data-role="learned-checkbox"]').getBoundingClientRect();
    return {
      n: items.length, learned: learned.length, nodeBg: node && getComputedStyle(node).backgroundColor, gold: tok('--gold'),
      hitW: Math.round(cb.width), hitH: Math.round(cb.height), count: document.querySelector('[data-role="basics-count"]').textContent,
      practice: Array.from(document.querySelectorAll('.topic-practice .btn')).map((x) => [x.getAttribute('href'), Math.round(x.getBoundingClientRect().height), getComputedStyle(x).boxShadow]),
      heroCat: document.querySelector('.topic-hero').className,
    };
  });
  t.ok(info.learned === 6 && info.nodeBg === info.gold, '学習済みの印は金色(6つ)', info);
  t.ok(info.hitW >= 44 && info.hitH >= 44, '印の押せる範囲は44px以上', info);
  t.ok(info.practice[0] && info.practice[0][0] === '#quiz/topicK' && info.practice[0][1] >= 56 && LIP(info.practice[0][2]), '問題への入口はふちのある大きなボタン', info.practice);
  t.ok(/cat-gyoho/.test(info.heroCat), '見出しは分野の色', info.heroCat);
  const total = Number((info.count.match(/\/(\d+)/) || [])[1]);
  const id = await p.evaluate(() => { const li = Array.from(document.querySelectorAll('.basics-item')).find((x) => !x.classList.contains('is-learned') && x.offsetParent); return li.dataset.id; });
  const pos = await p.point(`.basics-item[data-id="${id}"] .basics-node`);
  await p.clickAt(pos.x, pos.y);
  const after = await p.waitFor((x) => { const li = document.querySelector(`.basics-item[data-id="${x}"]`); return li.classList.contains('is-learned') && li; }, {}, id) && await p.evaluate((x) => {
    const li = document.querySelector(`.basics-item[data-id="${x}"]`);
    const bp = JSON.parse(localStorage.getItem('shojikiLearn.v1.basicsProgress'));
    return { stored: !!(bp[x] && bp[x].learned), pop: li.classList.contains('just-learned'), count: document.querySelector('[data-role="basics-count"]').textContent, open: li.querySelector('details').open };
  }, id);
  t.ok(after && after.stored && after.pop && after.count === `学習済み 7/${total}` && !after.open, '印をタップで学習済み(開かない・ぽん)', after);
  const kb = await p.evaluate(() => { const li = Array.from(document.querySelectorAll('.basics-item')).find((x) => !x.classList.contains('is-learned') && x.offsetParent); li.querySelector('[data-role="learned-checkbox"]').focus(); return li.dataset.id; });
  await p.press('Space');
  t.ok(await p.waitFor((x) => document.querySelector(`.basics-item[data-id="${x}"]`).classList.contains('is-learned'), {}, kb), 'キーボード(Space)で学習済み');
  const flow = await p.evaluate(async () => {
    const li = Array.from(document.querySelectorAll('.basics-item')).find((x) => !x.classList.contains('is-learned') && x.offsetParent);
    li.querySelector('summary').click();
    await new Promise((r) => setTimeout(r, 300));
    const btn = li.querySelector('[data-role="learn-close"]');
    const label = btn.textContent.trim();
    btn.click();
    await new Promise((r) => setTimeout(r, 400));
    return { id: li.dataset.id, label, learned: li.classList.contains('is-learned'), opened: Array.from(document.querySelectorAll('.basics-item details[open]')).map((d) => d.parentNode.dataset.id) };
  });
  t.ok(flow.label === '学習済みにして次へ' && flow.learned && flow.opened.length === 1 && flow.opened[0] !== flow.id, '「学習済みにして次へ」で次の項目が開く', flow);
  const filt = await p.evaluate(async () => {
    document.querySelector('[data-filter="unlearned"]').click();
    await new Promise((r) => setTimeout(r, 200));
    const vis = Array.from(document.querySelectorAll('.basics-item')).filter((li) => li.offsetParent && li.classList.contains('is-learned') && !li.classList.contains('keep-visible')).length;
    document.querySelector('[data-filter="all"]').click();
    return vis;
  });
  t.eq(filt, 0, '「未学習のみ」で学習済みが隠れる');
  const un = await p.evaluate(async (x) => { const cb = document.querySelector(`.basics-item[data-id="${x}"] [data-role="learned-checkbox"]`); cb.click(); await new Promise((r) => setTimeout(r, 400)); const li = cb.closest('.basics-item'); return { learned: li.classList.contains('is-learned'), bg: getComputedStyle(li.querySelector('.basics-node')).backgroundColor }; }, id);
  t.ok(!un.learned && un.bg !== info.gold, 'チェックを外すと金色の印でなくなる', un);
  t.ok(!(await p.overflow()), 'トピック詳細ははみ出さない');
  // 直リンク #topics/<id>/<基礎知識>
  const bid = await p.evaluate(() => (AppIndex.topicBasicOrder.topicL || AppIndex.topicsById.topicL.basicIds)[10]);
  await p.go(`topics/topicL/${bid}`);
  const dl = await p.waitFor((x) => { const li = document.querySelector(`.topic-detail-view li[data-id="${x}"]`); return li && li.querySelector('details').open && { hl: li.classList.contains('highlighted'), body: !!li.querySelector('.basics-body .term-simple') }; }, {}, bid);
  t.ok(dl && dl.hl && dl.body, '直リンクで項目が開いて目立つ', dl);
});

B.test('用語集(件数の文・記憶済みの星・めくる)とブックマーク(外す・元に戻す・用語だけ)', async (t) => {
  const p = await t.open('glossary', { seedFn: S.learn });
  const r0 = await p.evaluate(() => ({ text: document.querySelector('[data-role="progress-text"]').textContent, cards: document.querySelectorAll('.glossary-view .flip-card').length, cat: Array.from(document.querySelectorAll('.glossary-view .flip-card')).every((c) => /\bcat-\w+/.test(c.className)) }));
  t.ok(/表示中 \d+件・記憶済み 12\/\d+語/.test(r0.text) && r0.cards === 30 && r0.cat, '件数の文・30枚・分野の帯', r0);
  await p.evaluate(() => document.querySelector('[data-status="known"]').click());
  const k = await p.waitFor(() => document.querySelector('[data-status="known"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.glossary-view .flip-card').length);
  t.eq(k, 12, '記憶済みで絞り込み');
  await p.evaluate(() => document.querySelector('[data-status="all"]').click());
  await p.waitFor(() => document.querySelectorAll('.glossary-view .flip-card').length === 30);
  await p.settle();
  await defineToken(p);
  const star = await p.evaluate(async () => {
    const card = Array.from(document.querySelectorAll('.glossary-view .flip-card')).find((c) => !c.querySelector('.known-toggle.is-known'));
    card.querySelector('.flip-card-front [data-role="known-toggle"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const b2 = card.querySelector('.flip-card-front [data-role="known-toggle"]');
    return { on: b2.getAttribute('aria-pressed'), pop: !!b2.querySelector('.anim-pop'), color: getComputedStyle(b2).color, gold: window.__token('--gold-icon'), text: document.querySelector('[data-role="progress-text"]').textContent };
  });
  t.ok(star.on === 'true' && star.pop && star.color === star.gold && /記憶済み 13\//.test(star.text), '星で記憶済み(金色・ぽん・件数が増える)', star);
  const flip = await p.evaluate(async () => {
    const card = document.querySelectorAll('.glossary-view .flip-card')[2];
    card.querySelector('.term-name').click();
    await new Promise((r) => setTimeout(r, 700));
    return { flipped: card.classList.contains('flipped'), backInert: card.querySelector('.flip-card-back').inert, frontInert: card.querySelector('.flip-card-front').inert, saved: !!(history.state && history.state.gState && history.state.gState.flipped.includes(card.dataset.termId)) };
  });
  t.ok(flip.flipped && !flip.backInert && flip.frontInert && flip.saved, 'タップでめくる(見えない面は inert・履歴に保存)', flip);
  const band = await p.evaluate(() => { const f = document.querySelector('.glossary-view .flip-card:not(.flipped) .flip-card-front'); const cs = getComputedStyle(f, '::before'); const c = getComputedStyle(f); return { h: cs.height, shadow: c.boxShadow, border: c.borderTopWidth }; });
  t.ok(parseFloat(band.h) >= 4 && LIP(band.shadow) && parseFloat(band.border) >= 1, 'カードの帯・枠・ふち', band);
  t.ok(!(await p.overflow()), '用語集ははみ出さない');
  // ブックマーク
  const b = await t.open('bookmarks', { seedFn: S.learn });
  const c0 = await b.evaluate(() => ({ seg: Array.from(document.querySelectorAll('.bm-filter [data-filter]')).map((x) => x.textContent).join(), sec: Array.from(document.querySelectorAll('.bm-section')).map((s) => [s.dataset.kind, s.querySelector('[data-role="sec-count"]').textContent]) }));
  t.ok(c0.seg === 'すべて5,用語3,問題2' && JSON.stringify(c0.sec) === '[["term","3"],["quiz","2"]]', '件数(切り替えと見出し)', c0);
  await b.evaluate(() => document.querySelector('.bookmarks-view .flip-card .flip-card-front [data-role="bookmark"]').click());
  const c1 = await b.waitFor(() => document.querySelectorAll('.bookmarks-view .flip-card').length === 2 && ({ seg: Array.from(document.querySelectorAll('.bm-filter [data-filter]')).map((x) => x.textContent).join(), sec: Array.from(document.querySelectorAll('.bm-section')).map((s) => s.querySelector('[data-role="sec-count"]').textContent).join() }));
  t.ok(c1 && c1.seg === 'すべて4,用語2,問題2' && c1.sec === '2,2', '外すと件数が減る', c1);
  await b.waitForSelector('.toast .btn');
  await b.evaluate(() => document.querySelector('.toast .btn').click());
  const c2 = await b.waitFor(() => document.querySelectorAll('.bookmarks-view .flip-card').length === 3 && Array.from(document.querySelectorAll('.bm-section')).map((s) => s.querySelector('[data-role="sec-count"]').textContent).join());
  t.eq(c2, '3,2', '「元に戻す」で戻る');
  await b.evaluate(() => document.querySelector('[data-filter="term"]').click());
  t.ok(await b.waitFor(() => !document.querySelector('.bm-section') && document.querySelectorAll('.bookmarks-view .flip-card').length === 3), '用語だけ');
});

B.test('図解(分野の見出し・全部のタイル・詳細の前後)と計算機(ステッカー・結果の数字・入力の注意)', async (t) => {
  const p = await t.open('figures');
  const r = await p.evaluate(() => ({
    heads: Array.from(document.querySelectorAll('.fig-group-head .sticker')).map((s) => (s.className.match(/cat-\w+/) || [''])[0]),
    tiles: document.querySelectorAll('.fig-card').length, defs: Object.keys(Diagrams.defs).length, terms: !!document.querySelector('.fig-card-terms-text'),
  }));
  t.ok(r.tiles === r.defs && r.heads[0] === 'cat-gyoho' && r.heads.includes('cat-kenri') && r.terms, '分野の色の見出し・全部の図解のタイル', r);
  await p.go('figures/brokerage-fee-cap');
  const d = await p.waitFor(() => { const box = document.querySelector('.fig-detail svg .dg-box-teal'); return box && { fill: getComputedStyle(box).fill, pager: document.querySelectorAll('.fig-pager-link').length }; });
  t.ok(d && d.fill !== 'rgb(0, 0, 0)' && d.pager === 2, '図解の色(青緑の箱)・前後の図へのリンク', d);
  await p.go('calculators/acquisition');
  await p.settle();
  await defineToken(p);
  const c = await p.evaluate(() => {
    const icon = document.querySelector('.calc-head-icon');
    const prim = document.querySelector('.calc-stat.is-primary');
    return { cls: icon.className, primBg: getComputedStyle(prim).backgroundColor, primary: window.__token('--color-primary'), primColor: getComputedStyle(prim.querySelector('.stat-value')).color, size: parseFloat(getComputedStyle(prim.querySelector('.stat-value')).fontSize) };
  });
  t.ok(/cat-zei/.test(c.cls) && c.primBg === c.primary && c.primColor === 'rgb(255, 255, 255)' && c.size >= 34, '税は橙のステッカー・結果は緑の大きな数字', c);
  await p.go('calculators/loan');
  const e = await p.evaluate(async () => { const i = document.querySelector('[data-key="principalMan"]'); i.value = 'abc'; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 400)); return { invalid: i.getAttribute('aria-invalid'), err: !document.querySelector('#calc-e-principalMan').hidden, desc: i.getAttribute('aria-describedby'), prompt: !!document.querySelector('.calc-empty') }; });
  t.ok(e.invalid === 'true' && e.err && /calc-e-principalMan/.test(e.desc) && e.prompt, '入力の注意(aria-invalid・説明につなぐ)', e);
});

B.test('320px: 学習の画面ははみ出さない', async (t) => {
  const p = await t.open('topics', { device: 'w320', seedFn: S.learn });
  for (const h of ['topics', 'topics/topicK', 'glossary', 'figures', 'figures/rental-flow', 'review', 'bookmarks', 'works', 'sources', 'calculators/purchase-costs']) {
    await p.go(h);
    t.ok(!(await p.overflow()), `320px #${h} ははみ出さない`, await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]));
  }
});

B.run();
