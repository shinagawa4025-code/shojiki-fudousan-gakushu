// 出題頻度ランク(v14。ブラウザ): 4択・○×・基礎知識の札「頻出A」・#freq(タブ・行・4択/○×を始める)・
// 出題頻度の絞り込み(4択のシート・○×のトップ・保存)・学習の進捗の「頻出Aで伸ばしたい論点」・押せる大きさとはみ出し
// data/frequency.js の中身(テーマの数・ランク)は決め打ちしない(ページの中の Freq から求める)
'use strict';
const B = require('../lib/browser.js');

const TAKKEN = { examTargets: [{ id: 'et_a', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: 1 }] };
// 押せる部品で 44px 未満のもの(文中のリンクは除く。tools/tests/browser/progress.test.js と同じ数え方。
// 見出しの ⓘ(.view-info-btn。4択・○×と同じ部品で、PC では 40px)は除く)
const SMALL = () => {
  const out = [];
  document.querySelectorAll('#view-root a, #view-root button, .sheet button, .sheet a').forEach((el) => {
    if (el.closest('[hidden]') || !el.getClientRects().length || el.closest('p, li > span')) return;
    if (el.classList.contains('chip-small') || el.classList.contains('view-info-btn')) return;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName}.${String(el.className).split(' ').slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${el.textContent.trim().slice(0, 14)}"`);
  });
  return out;
};
// ページの中で: テーマのある4択(○×の文があるものを優先)と、そのテーマ
const PICK = () => {
  const qt = APP_DATA.frequency.quizTheme;
  const ids = Object.keys(qt).filter((id) => APP_DATA.quiz.some((q) => q.id === id));
  const withSt = ids.find((id) => QuizEngine.allStatements().some((s) => s.quizId === id));
  const id = withSt || ids[0];
  const th = Freq.themeOfQuiz(id);
  const life = APP_DATA.quiz.find((q) => !(q.examCats && q.examCats.takken));
  return { id, theme: th.id, rank: th.rank, name: th.name, topicId: th.topicId, life: life.id, oxTheme: (Freq.themes().find((t) => Freq.statementCountOf(t.id) > 0) || {}).id || null };
};

B.test('札: 4択のカード・○×の文・トピックの小見出しと基礎知識に「頻出A」など(宅建士の分野のない問題には付けない)', async (t) => {
  const p = await t.open('home', { seed: TAKKEN });
  await p.go('topics');
  await p.waitFor(() => window.Freq && Freq.ready());
  const k = await p.evaluate(PICK);
  t.ok(k.id && k.theme, 'テーマのある4択がある', k);
  await p.go(`quiz/q/${k.id}`);
  const chip = await p.waitFor((id) => {
    const c = document.querySelector(`.quiz-card[data-quiz-id="${id}"] .quiz-card-head .freq-chip`);
    return c && { rank: c.dataset.rank, text: c.querySelector('[aria-hidden="true"]').textContent, sr: c.querySelector('.sr-only').textContent };
  }, {}, k.id);
  t.ok(chip && chip.rank === k.rank && chip.text === `頻出${k.rank}` && /^出題頻度[ABC]\(直近\d+回中\d+回\)$/.test(chip.sr), '4択のカードの見出しに札(読み上げは回数つき)', chip);
  await p.go(`quiz/q/${k.life}`);
  const none = await p.waitFor((id) => { const c = document.querySelector(`.quiz-card[data-quiz-id="${id}"]`); return c ? { chip: !!c.querySelector('.freq-chip') } : null; }, {}, k.life);
  t.ok(none && !none.chip, '宅建士の分野のない問題には札なし', none);
  if (k.oxTheme) {
    await p.go(`ox/freq/${k.oxTheme}/10`);
    const ox = await p.waitFor((th) => {
      const s = Views.ox._internal.getSession();
      const c = document.querySelector('.ox-q-meta .freq-chip');
      return s && s.items.length && c && { all: s.items.every((it) => Freq.themeOfQuiz(it.quizId).id === th), label: s.label, hash: location.hash, rank: c.dataset.rank, want: Freq.theme(th).rank };
    }, {}, k.oxTheme);
    t.ok(ox && ox.all && ox.rank === ox.want && /^論点: /.test(ox.label) && ox.hash === '#ox/run', '#ox/freq/<テーマ>: そのテーマの文だけ・文の上に札', ox);
  }
  await p.go(`topics/${k.topicId}`);
  const tp = await p.waitFor(() => {
    const items = document.querySelectorAll('.basics-item summary .freq-chip');
    const secs = document.querySelectorAll('.basics-section-head .freq-chip');
    return items.length ? { items: items.length, secs: secs.length, sr: secs[0] ? secs[0].querySelector('.sr-only').textContent : '' } : null;
  });
  t.ok(tp && tp.items > 0 && (tp.secs === 0 || /^この中でいちばん高いランクは出題頻度/.test(tp.sr)), 'トピック: 基礎知識の項目と小見出しに札', tp);
  await p.close();
});

B.test('#freq: 説明・分野のタブ・行(回数・成績・ボタン)・4択/○×を始める・はみ出しなし(iPhone / 320px ダーク / PC)', async (t) => {
  for (const [device, dark] of [['iphone', false], ['w320', true], ['desktop', false]]) {
    const tag = `${device}${dark ? ' dark' : ''}`;
    const p = await t.open('freq', { device, dark, seed: TAKKEN });
    const s = await p.waitFor(() => {
      const tabs = Array.from(document.querySelectorAll('.freq-tabs [data-cat]'));
      const on = tabs.find((b) => b.getAttribute('aria-pressed') === 'true');
      const rows = Array.from(document.querySelectorAll('[data-role="freq-row"]'));
      if (!tabs.length || !rows.length) return null;
      const cats = Freq.CATS.filter((c) => Freq.themes().some((x) => x.cat === c.id)).map((c) => c.id);
      const want = Freq.themes().filter((x) => x.cat === on.dataset.cat).sort(Freq.byRank).map((x) => x.id);
      return {
        tabs: tabs.map((b) => b.dataset.cat), cats, rows: rows.map((r) => r.dataset.themeId), want,
        lead: document.querySelector('.freq-intro-lead').textContent, legend: document.querySelectorAll('.freq-legend li').length,
        meta: document.querySelector('.freq-intro-meta').textContent, hits: rows[0].querySelector('.freq-row-hits').textContent.replace(/\s+/g, ''),
        total: Freq.total(), mc: rows.filter((r) => r.querySelector('[data-role="start-mc"]')).length,
        mcOk: rows.every((r) => { const a = r.querySelector('[data-role="start-mc"]'); return !a || a.getAttribute('href') === `#quiz/freq/${encodeURIComponent(r.dataset.themeId)}`; }),
      };
    });
    t.ok(s && JSON.stringify(s.tabs) === JSON.stringify(s.cats) && JSON.stringify(s.rows) === JSON.stringify(s.want), `${tag}: タブは分野の順・行はランク → 回数の順`, s);
    t.ok(s && /本試験/.test(s.lead) && s.legend === 3 && /目安/.test(s.meta) && new RegExp(`^${s.total}回中\\d+回$`).test(s.hits) && s.mcOk, `${tag}: 説明(数え方・目安)・A/B/C の目安・「12回中11回」・4択のリンク`, s);
    t.ok(!(await p.overflow()), `${tag}: はみ出しなし`);
    t.eq(await p.evaluate(SMALL), [], `${tag}: 押せる部品は44px以上`);
    await p.close();
  }
  // タブの切り替え(保存して、戻ってきたときも同じ)・4択を始める
  const p = await t.open('freq', { seed: TAKKEN });
  await p.waitForSelector('[data-role="freq-row"]');
  const other = await p.evaluate(() => { const b = document.querySelectorAll('.freq-tabs [data-cat]')[1]; return b ? b.dataset.cat : null; });
  if (other) {
    await p.click(`.freq-tabs [data-cat="${other}"]`);
    const sw = await p.waitFor((c) => document.querySelector(`.freq-tabs [data-cat="${c}"]`).getAttribute('aria-pressed') === 'true'
      && Array.from(document.querySelectorAll('[data-role="freq-row"]')).every((r) => Freq.theme(r.dataset.themeId).cat === c)
      && JSON.parse(localStorage.getItem('shojikiLearn.v1.freqPrefs') || '{}').tab === c, {}, other);
    t.ok(sw, 'タブを押すとその分野の行・選んだ分野を保存');
  }
  const row = await p.evaluate(() => { const r = document.querySelector('[data-role="freq-row"] [data-role="start-mc"]'); return r ? r.closest('[data-role="freq-row"]').dataset.themeId : null; });
  t.ok(!!row, '4択のボタンのある行がある');
  await p.click(`[data-theme-id="${row}"] [data-role="start-mc"]`);
  const q = await p.waitFor((th) => {
    const cards = Array.from(document.querySelectorAll('.quiz-card'));
    const chip = document.querySelector('.quiz-filter-chip');
    return cards.length && chip && { all: cards.every((c) => Freq.themeOfQuiz(c.dataset.quizId).id === th), n: document.querySelector('[data-role="step-track"]').getAttribute('aria-valuemax'), want: Freq.quizIdsOf(th).length, chip: chip.textContent.trim(), hash: location.hash, prefs: JSON.parse(localStorage.getItem('shojikiLearn.v1.quizPrefs') || '{}') };
  }, {}, row);
  t.ok(q && q.all && Number(q.n) === q.want && /^論点: /.test(q.chip) && q.hash === `#quiz/freq/${row}` && q.prefs.theme === undefined, '4択で解く: そのテーマの問題だけ・札「論点: …」・テーマは保存しない', q);
  await p.reload();
  const rl = await p.waitFor(() => { const c = document.querySelector('.quiz-filter-chip'); return c && c.textContent.trim(); });
  t.ok(/^論点: /.test(rl || ''), '再読み込みでもテーマの条件のまま', rl);
  await p.click('.quiz-filter-chip');
  const cleared = await p.waitFor((th) => !document.querySelector('.quiz-filter-chip') && Number(document.querySelector('[data-role="step-track"]').getAttribute('aria-valuemax')) > Freq.quizIdsOf(th).length, {}, row);
  t.ok(cleared, '札を外すとすべての問題に戻る');
  await p.back();
  await p.waitForSelector('[data-role="freq-row"]');
  if (other) t.eq(await p.evaluate(() => document.querySelector('.freq-tabs [aria-pressed="true"]').dataset.cat), other, '戻ると選んでいた分野のタブ');
  await p.close();
});

B.test('絞り込み: 4択(シートの「出題頻度」・保存・札)と○×(トップの「出題頻度」・出題はそのランクの文だけ)', async (t) => {
  const p = await t.open('quiz', { seed: Object.assign({ quizPrefs: { freq: 'A' } }, TAKKEN) });
  const a = await p.waitFor(() => {
    const cards = Array.from(document.querySelectorAll('.quiz-card'));
    const chip = document.querySelector('.quiz-filter-chip');
    if (!cards.length || !chip) return null;
    const want = APP_DATA.quiz.filter((q) => Freq.rankOfQuiz(q.id) === 'A').length;
    return { all: cards.every((c) => Freq.rankOfQuiz(c.dataset.quizId) === 'A'), n: Number(document.querySelector('[data-role="step-track"]').getAttribute('aria-valuemax')), want, chip: chip.textContent.trim() };
  });
  t.ok(a && a.all && a.n === a.want && a.want > 0 && a.chip === '頻出A', '保存した「Aだけ」: 頻出Aの問題だけ・札「頻出A」', a);
  await p.click('[data-role="filter-open"]');
  await p.waitForSelector('.sheet [data-role="freq"]');
  const sh = await p.evaluate(() => ({
    pressed: document.querySelector('.sheet [data-freq][aria-pressed="true"]').dataset.freq,
    counts: Array.from(document.querySelectorAll('.sheet [data-role="freq-count"]')).map((x) => Number(x.textContent.replace(/\D/g, ''))),
    want: ['all', 'A', 'AB'].map((l) => APP_DATA.quiz.filter((q) => Freq.matchLevel(q.id, l)).length),
  }));
  t.ok(sh.pressed === 'A' && JSON.stringify(sh.counts) === JSON.stringify(sh.want), 'シート: 「Aだけ」を選んだ状態・件数(すべて・A・AとB)', sh);
  await p.evaluate(() => document.querySelector('.sheet [data-freq="AB"]').click());
  await p.evaluate(() => document.querySelector('.sheet [data-role="filter-apply"]').click());
  const ab = await p.waitFor(() => {
    const chip = document.querySelector('.quiz-filter-chip');
    return chip && chip.textContent.trim() === '頻出A・B' && {
      all: Array.from(document.querySelectorAll('.quiz-card')).every((c) => ['A', 'B'].includes(Freq.rankOfQuiz(c.dataset.quizId))),
      prefs: JSON.parse(localStorage.getItem('shojikiLearn.v1.quizPrefs')).freq,
    };
  });
  t.ok(ab && ab.all && ab.prefs === 'AB', '「AとB」に変えると保存・A と B の問題だけ', ab);
  await p.settle();
  await p.click('.quiz-filter-chip');
  const all = await p.waitFor(() => !document.querySelector('.quiz-filter-chip') && JSON.parse(localStorage.getItem('shojikiLearn.v1.quizPrefs')).freq === 'all');
  t.ok(all, '札を外すと「すべて」に戻して保存');
  // ○×
  await p.evaluate(() => localStorage.setItem('shojikiLearn.v1.oxPrefs', JSON.stringify({ scope: { type: 'all', id: null }, filter: 'all', count: 10, autoNext: false, confidence: false })));
  await p.go('ox');
  await p.waitForSelector('.ox-freq [data-freq]');
  const ox0 = await p.evaluate(() => ({
    pressed: document.querySelector('.ox-freq [aria-pressed="true"]').dataset.freq,
    counts: Array.from(document.querySelectorAll('.ox-freq [data-role="fqcount"]')).map((x) => Number(x.textContent.replace(/\D/g, ''))),
    want: ['all', 'A', 'AB'].map((l) => Views.ox._internal.loadStatements().filter((s) => l === 'all' || Freq.matchLevel(s.quizId, l)).length),
  }));
  t.ok(ox0.pressed === 'all' && JSON.stringify(ox0.counts) === JSON.stringify(ox0.want), '○×のトップ: 出題頻度(すべて・A・AとB の文の数)', ox0);
  if (ox0.want[1] > 0) {
    await p.click('.ox-freq [data-freq="A"]');
    await p.waitFor(() => document.querySelector('.ox-freq [data-freq="A"]').getAttribute('aria-pressed') === 'true');
    await p.evaluate(() => document.querySelector('[data-role="start"]').click());
    const run = await p.waitFor(() => {
      const s = Views.ox._internal.getSession();
      return s && s.items.length && document.querySelector('.ox-btn') && { all: s.items.every((it) => Freq.rankOfQuiz(it.quizId) === 'A'), label: s.label, prefs: JSON.parse(localStorage.getItem('shojikiLearn.v1.oxPrefs')).freq };
    });
    t.ok(run && run.all && /頻出A$/.test(run.label) && run.prefs === 'A', '「Aだけ」で開始: 頻出Aの文だけ・条件に「頻出A」・保存', run);
  }
  // ほかのディープリンクは出題頻度で絞らない
  await p.go('ox/cat/gyoho/10');
  const deep = await p.waitFor(() => { const s = Views.ox._internal.getSession(); return s && s.items.length && document.querySelector('.ox-btn') && { freq: s.freq, label: s.label }; });
  t.ok(deep && deep.freq === 'all' && !/頻出/.test(deep.label), '#ox/cat/…(今日のメニューなど)は絞らない', deep);
  await p.close();
});

B.test('学習の進捗: 「頻出Aで伸ばしたい論点」(宅建士が目標・正答率の低い順・4択/○×のボタン)・税理士が目標なら出さない', async (t) => {
  const p = await t.open('home', { seed: TAKKEN });
  await p.go('topics');
  await p.waitFor(() => window.Freq && Freq.ready());
  // 頻出Aのテーマの4択を下限以上(全部不正解)解いた記録を入れる
  const seeded = await p.evaluate(() => {
    const th = Freq.themes().filter((x) => x.rank === 'A' && Freq.quizIdsOf(x.id).length >= Freq.MIN_ANSWERED);
    if (!th.length) return null;
    const qh = {};
    Freq.quizIdsOf(th[0].id).slice(0, Freq.MIN_ANSWERED).forEach((id) => { qh[id] = 'ng'; });
    localStorage.setItem('shojikiLearn.v1.quizHistory', JSON.stringify(qh));
    return th[0].id;
  });
  await p.go('progress');
  const c = await p.waitFor(() => {
    const card = document.querySelector('[data-role="freq-card"] .freq-prog-card');
    if (!card) return null;
    const rows = Array.from(card.querySelectorAll('[data-role="freq-prog-row"]'));
    return { n: rows.length, first: rows[0] && rows[0].dataset.themeId, title: card.querySelector('h3').textContent.trim(), mc: rows.every((r) => !r.querySelector('[data-role="start-mc"]') || /^#quiz\/freq\//.test(r.querySelector('[data-role="start-mc"]').getAttribute('href'))), link: !!card.querySelector('a[href="#freq"]') };
  });
  t.ok(c && c.n >= 1 && c.n <= 5 && c.title === '頻出Aで伸ばしたい論点' && c.mc && c.link, 'カードがある(5つまで・4択のリンク・#freq へのリンク)', c);
  if (seeded) t.eq(c && c.first, seeded, '全部不正解のテーマが先頭');
  t.eq(await p.evaluate(SMALL), [], '押せる部品は44px以上');
  await p.close();
  const z = await t.open('progress', { seed: { examTargets: [{ id: 'et_b', name: '税理士試験(消費税法)', examTypeId: 'zeirishi', date: '2027-08-05', primary: true, createdAt: 2 }] } });
  await z.waitForSelector('.prog-grid .card');
  await z.settle();
  t.ok(await z.evaluate(() => { const m = document.querySelector('[data-role="freq-card"]'); return !!m && !m.firstElementChild; }), '税理士が目標で宅建の記録がなければ出さない');
  await z.close();
});

B.run();
