// レベルと経験値(ブラウザ): ホームのレベルの札(iPhone・320px ダーク・PC。はみ出しなし・44px・その場で描き直す)・
// はじめの XP(新しい利用者は Lv.1)・レベルアップのお祝い(○×の途中は出さず、結果で1回だけ。動きを減らす設定でも出る)・進捗のカード
'use strict';
const B = require('../lib/browser.js');

const T = '2026-10-14';
const XP = (o) => Object.assign({ total: 3210, seeded: true, seen: 5, days: { [T]: 120, '2026-10-12': 340 } }, o || {});
const CH = { best: 25, days: { [T]: { best: 18, runs: 2 }, '2026-10-10': { best: 25, runs: 1 } } };
// バッジの知らせ(初めての学習など)がテストの操作に重ならないよう、取得済みにしておく
const BADGES = { seeded: true, at: { first: '2026-10-01', challengeFirst: '2026-10-01', level5: '2026-10-01' } };
const HOME = () => {
  const box = document.querySelector('[data-role="level"]');
  const main = box && box.querySelector('.xp-main');
  const ch = box && box.querySelector('.xp-ch');
  const r = (e) => (e ? e.getBoundingClientRect() : null);
  return box && main && ch && {
    label: main.getAttribute('aria-label'), medal: box.querySelector('.xp-medal').textContent.replace(/\s+/g, ''),
    today: box.querySelector('.xp-today').textContent, bar: box.querySelector('.xp-bar > span').style.width,
    ch: ch.getAttribute('aria-label'), chHref: ch.getAttribute('href'), mainHref: main.getAttribute('href'),
    hidden: getComputedStyle(box).display === 'none',
    sizes: [main, ch].map((e) => Math.round(Math.min(r(e).width, r(e).height))),
    aria: Array.from(box.querySelectorAll('.xp-body, .xp-medal')).every((e) => e.getAttribute('aria-hidden') === 'true'),
  };
};

B.test('ホーム: レベルの札(Lv・次のレベルまで・今日の XP・今日のチャレンジ)・はみ出しなし・XP が増えたらその場で描き直す', async (t) => {
  for (const [device, dark] of [['iphone', false], ['w320', true], ['desktop', false]]) {
    const tag = `${device}${dark ? ' dark' : ''}`;
    const p = await t.open('home', { device, dark, seed: { xp: XP(), challenge: CH, badges: BADGES } });
    const h = await p.waitFor(HOME);
    t.ok(h && !h.hidden && h.medal === 'Lv.5' && /レベル5。次のレベルまで あと140 XP。今日の経験値 120 XP/.test(h.label) && h.today === '今日 +120 XP' && h.bar === '85%', `${tag}: Lv.5・あと140 XP・今日 +120 XP`, h);
    t.ok(h.chHref === '#challenge' && h.ch === '今日のチャレンジ(今日のベスト 18問)' && h.mainHref === '#progress' && h.aria, `${tag}: 今日のチャレンジ(今日のベスト)・読み上げはリンクの名前で`, h);
    t.ok(h.sizes.every((x) => x >= 44), `${tag}: 押せる大きさ 44px 以上`, h.sizes);
    t.ok(!(await p.overflow()), `${tag}: はみ出しなし`);
    if (device === 'iphone') {
      await p.evaluate(() => Xp.award('mc', { id: 'test-q', correct: true }));
      const h2 = await p.waitFor(() => { const e = document.querySelector('[data-role="level"] .xp-today'); return e && e.textContent === '今日 +130 XP' && e.textContent; });
      t.ok(h2, 'XP が増えたら、ホームの札をその場で描き直す', h2);
      await p.click('[data-role="level"] .xp-ch');
      t.ok(await p.waitFor(() => Router.current() === 'challenge' && !!document.querySelector('.ch-view [data-role="start"]')), '今日のチャレンジへ');
    }
    await p.close();
  }
  // 新しい利用者: はじめの XP は 0(Lv.1)。「今日はこれから」
  const f = await t.open('home', { seed: { badges: BADGES } });
  const h = await f.waitFor(HOME);
  const x = await f.get('xp');
  t.ok(h && h.medal === 'Lv.1' && /あと300 XP/.test(h.label) && h.today === '今日はこれから' && /3分で○×/.test(h.ch), '新しい利用者は Lv.1・今日はこれから', h);
  t.ok(x && x.seeded === true && x.total === 0 && x.seed === 0, '新しい利用者にははじめの XP を付けない(seeded)', x);
});

B.test('はじめの XP: 以前の記録のある利用者はホームを開いたときに1回だけ(お祝いはしない)', async (t) => {
  const p = await t.open('home', { seed: { activityLog: { '2026-10-01': 40, '2026-10-02': 60 }, studyTime: { '2026-10-01': 1800 }, badges: BADGES } });
  const h = await p.waitFor(HOME);
  const x = await p.get('xp');
  t.ok(x && x.seeded && x.seed === 300 && x.total === 300 && x.seen === 2, 'これまでの記録から 300 XP(学習の回数 100回 × 3)', x);
  t.ok(h && h.medal === 'Lv.2', 'ホームは Lv.2', h);
  await p.reload();
  await new Promise((r) => setTimeout(r, 2500));
  const x2 = await p.get('xp');
  t.ok(x2.total === 300 && !(await p.exists('[data-role="level-up"]')), '読み込み直しても付け直さない・お祝いは出さない', x2);
});

// ○×を始めて n 文に正しく答える
async function oxAnswer(p, n) {
  for (let i = 0; i < n; i++) {
    await p.waitFor((k) => { const s = Views.ox._internal.getSession(); return s && s.index === k && !s.answers[k] && !!document.querySelector('.ox-btn:not(:disabled)'); }, {}, i);
    await p.evaluate(() => { const s = Views.ox._internal.getSession(); document.querySelector(`.ox-btn[data-answer="${s.items[s.index].truth ? 'o' : 'x'}"]`).click(); });
    await p.waitFor((k) => { const s = Views.ox._internal.getSession(); return !!s.answers[k]; }, {}, i);
    if (i < n - 1) await p.evaluate(() => document.querySelector('[data-role="next"]').click());
  }
}
const DIALOG = () => {
  const d = document.querySelector('[data-role="level-up"]');
  if (!d) return null;
  const ae = document.activeElement;
  return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), name: (document.getElementById('xp-up-name') || {}).textContent, focus: !!ae && ae.dataset.role === 'ok' && d.contains(ae), labelled: d.getAttribute('aria-labelledby'), desc: (document.getElementById('xp-up-desc') || {}).textContent };
};

B.test('レベルアップのお祝い: ○×の途中は出さず、結果の画面で1回だけ・OK で閉じる・読み込み直しても出ない', async (t) => {
  const seed = { xp: { total: 294, seeded: true, seen: 1, days: {} }, badges: BADGES, dailyGoal: { kind: 'actions', value: 200 },
    oxPrefs: { scope: { type: 'cat', id: 'gyoho' }, filter: 'all', count: 10, autoNext: false, confidence: false } };
  const p = await t.open('ox', { seed });
  await p.evaluate(() => document.querySelector('[data-role="start"]').click());
  await oxAnswer(p, 3);
  t.eq(await p.evaluate(() => Xp.level().level), 2, '○×の3文で Lv.2(294 + 9)');
  await new Promise((r) => setTimeout(r, 3200));
  t.ok(!(await p.exists('[data-role="level-up"]')), '○×の途中はお祝いを出さない');
  await p.evaluate(() => document.querySelector('[data-role="quit"]').click());
  const d = await p.waitFor(DIALOG, { timeout: 8000 });
  t.ok(d && d.role === 'dialog' && d.modal === 'true' && d.name === 'Lv.2 になりました' && d.focus && /xp-up-name/.test(d.labelled) && /Lv\.3 まで/.test(d.desc), '結果の画面でお祝いのダイアログ(フォーカスは OK)', d);
  t.eq((await p.get('xp')).seen, 2, 'お祝いしたレベルを記録');
  await p.click('[data-role="level-up"] [data-role="ok"]');
  t.ok(await p.waitFor(() => !document.querySelector('.xp-up-overlay')), 'OK で閉じる');
  await p.reload();
  await new Promise((r) => setTimeout(r, 3000));
  t.ok(!(await p.exists('[data-role="level-up"]')), '同じレベルのお祝いは1回だけ');
  // 画面を移ったときにお祝いを待っていれば、次の画面で出す(Esc で閉じる)
  await p.evaluate(() => { const x = Xp._read(); x.total = 849; Xp._write(x); });
  await p.go('home');
  await p.evaluate(() => Xp.award('mc', { id: 'lv3', correct: true }));
  const d3 = await p.waitFor(DIALOG, { timeout: 8000 });
  t.ok(d3 && d3.name === 'Lv.3 になりました', 'ホームでは少し待って出す', d3);
  await p.press('Escape');
  t.ok(await p.waitFor(() => !document.querySelector('.xp-up-overlay')), 'Esc で閉じる');
});

B.test('レベルアップのお祝い: 動きを減らす設定でも出す(紙吹雪・動きはなし)', async (t) => {
  const p = await t.open('home', { reducedMotion: true, seed: { xp: { total: 299, seeded: true, seen: 1, days: {} }, badges: BADGES } });
  await p.waitFor(HOME);
  await p.evaluate(() => Xp.award('mc', { id: 'rm', correct: true }));
  const d = await p.waitFor(DIALOG, { timeout: 8000 });
  t.ok(d && d.name === 'Lv.2 になりました' && d.focus, '動きを減らす設定でもダイアログは出る', d);
  await new Promise((r) => setTimeout(r, 700));
  const anim = await p.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.xp-up-overlay')).length,
    confetti: Array.from(document.querySelectorAll('.confetti, .fd-burst')).filter((e) => getComputedStyle(e).display !== 'none').length,
  }));
  t.eq(anim, { running: 0, confetti: 0 }, '動き・紙吹雪はなし');
  await p.click('[data-role="level-up"] [data-role="ok"]');
  t.ok(await p.waitFor(() => !document.querySelector('.xp-up-overlay')), '閉じる');
});

// 数字ドリル・比較表/条文の穴埋めの途中も待つ(js/cloze.js が Motion.addBusyCheck で Motion.busy(true) の「途中」に足す)
B.test('レベルアップのお祝い: 数字ドリル・条文穴埋めの途中は出さず、画面を移ったとき・結果の画面で出す', async (t) => {
  const seed = { xp: { total: 298, seeded: true, seen: 1, days: {} }, badges: BADGES, dailyGoal: { kind: 'actions', value: 200 }, toolPrefs: { numbers: { mode: 'choice', size: 10 } } };
  const p = await t.open('numbers', { seed });
  await p.waitFor(() => document.querySelector('[data-role="start"]'));
  await p.evaluate(() => document.querySelector('[data-role="start"]').click());
  await p.waitFor(() => document.querySelector('.tl-run .tl-choices .choice-btn'));
  await p.evaluate(() => {
    const s = Views.numbers._internal.getSession();
    const it = s.list[s.index];
    Array.from(document.querySelectorAll('.tl-run .tl-choices .choice-btn')).find((b) => b.querySelector('.choice-text').textContent === it.a.trim()).click();
  });
  t.eq(await p.evaluate(() => Xp.level().level), 2, '数字ドリルの正解1問で Lv.2(298 + 4)');
  await new Promise((r) => setTimeout(r, 3200));
  t.ok(!(await p.exists('[data-role="level-up"]')), '数字ドリルの途中はお祝いを出さない');
  await p.go('home');
  const d = await p.waitFor(DIALOG, { timeout: 8000 });
  t.ok(d && d.name === 'Lv.2 になりました', '画面を移ったら出す', d);
  await p.press('Escape');
  await p.waitFor(() => !document.querySelector('.xp-up-overlay'));
  // 条文穴埋め(選んで埋める): 849 + 4 で Lv.3。答えの欄があるうちは出さず、全部の空欄を埋めた結果の画面で出す
  await p.evaluate(() => { const x = Xp._read(); x.total = 849; Xp._write(x); });
  await p.go('joubun/jb-030-1/choose');
  await p.waitFor(() => document.querySelector('.tl-panel .choice-btn'));
  let mid = null;
  for (let i = 0; i < 12 && await p.exists('.tl-panel'); i++) {
    await p.evaluate(() => {
      const panel = document.querySelector('.tl-panel');
      const q = panel.querySelector('.tl-panel-q b');
      const it = APP_DATA.joubun.items.find((x) => x.id === 'jb-030-1');
      const btns = Array.from(panel.querySelectorAll('.choice-btn'));
      const want = q ? it.blanks[Number(q.textContent) - 1].a : null;
      const b = btns.find((x) => x.querySelector('.choice-text').textContent === want) || panel.querySelector('button');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 700));
    if (!mid) mid = await p.evaluate(() => (Xp.level().level === 3 && document.querySelector('.tl-panel') ? { dialog: !!document.querySelector('.xp-up-overlay') } : null));
  }
  t.ok(mid && !mid.dialog, '条文穴埋めの途中(Lv.3 になった直後)はお祝いを出さない', mid);
  const d3 = await p.waitFor(DIALOG, { timeout: 8000 });
  t.ok(d3 && d3.name === 'Lv.3 になりました' && !(await p.exists('.tl-panel')), '結果の画面で出す', d3);
});

B.test('進捗: レベルと経験値のカード(合計・次のレベル・直近7日・今日のチャレンジ・経験値のため方)', async (t) => {
  for (const device of ['iphone', 'desktop']) {
    const p = await t.open('progress', { device, seed: { xp: XP({ seed: 2000, seedAt: '2026-10-10' }), challenge: CH, badges: BADGES } });
    const c = await p.waitFor(() => {
      const el = document.querySelector('[data-role="level-card"] .xp-card');
      if (!el) return null;
      const bar = el.querySelector('[role="progressbar"]');
      return { medal: el.querySelector('.xp-medal').textContent.replace(/\s+/g, ''), total: el.querySelector('.xp-prog-level').textContent.replace(/\s+/g, ''), now: bar.getAttribute('aria-valuenow'), max: bar.getAttribute('aria-valuemax'), text: bar.getAttribute('aria-valuetext'), cols: el.querySelectorAll('.st-col').length, chart: el.querySelector('[data-role="xp-chart"]').getAttribute('aria-label'), ch: el.querySelector('[data-role="xp-challenge"]').textContent.replace(/\s+/g, ''), seed: el.querySelector('.xp-how').textContent };
    });
    t.ok(c && c.medal === 'Lv.5' && /3,210XP/.test(c.total) && c.now === '810' && c.max === '950' && /あと 140 XP/.test(c.text), `${device}: Lv.5・合計・次のレベルまでのバー`, c);
    t.ok(c.cols === 7 && /340 XP/.test(c.chart) && /120 XP/.test(c.chart) && /今日のベスト18問\(2回\)・自己ベスト25問/.test(c.ch) && /2,000 XP を付けました/.test(c.seed), `${device}: 直近7日・今日のチャレンジ・はじめの XP の説明`, c);
    await p.click('[data-role="xp-chart"] .st-col', 6);
    t.ok(await p.waitFor(() => /120 XP/.test(document.querySelector('[data-role="xp-detail"]').textContent)), `${device}: 棒を押すとその日の XP`);
    t.ok(!(await p.overflow()), `${device}: はみ出しなし`);
    await p.close();
  }
});

B.run();
