// 今日のチャレンジ(v14)。ルート #challenge: 3分間の○×タイムアタック(はじめの画面 → 出題 → 結果)。
// あわせて、レベルと経験値の画面の部品 window.LevelUi(詳細の束。本体の js/xp.js を軽くするため、こちらに置く):
//   seedValue()       はじめの XP の数え方(Xp.seedIfNeeded が1回だけ使う)
//   celebrate(delay)  まだお祝いしていないレベルがあれば、落ち着いたとき(結果の画面・次の画面の移動のあと。4択・○×・復習・模擬試験の
//                     途中・ほかのダイアログ・文字の入力中は待つ)にお祝いのダイアログを出す(1つのレベルにつき1回。Xp の seen)
//   renderProgress(el) 進捗の画面(#progress)のカード: レベル・合計 XP・直近7日の XP・今日のチャレンジのベスト・経験値のため方
//   readChallenge()   Storage `challenge` を整えて読む
// チャレンジの文は ○×一問一答と同じ文(Views.ox の loadStatements・spreadByQuiz を使う)から、学ぶ目的(宅建士・税理士)に合わせて選ぶ
// (はじめの画面で 宅建士 / 税理士(消費税法)/ すべて を選べる。選んだものは challenge.pool に残す)
// 保存: Storage `challenge` = { best: 最後までやった回の最高の正解数, days: { 'YYYY-MM-DD': { best, runs: 最後までやった回数 } }(400日分), pool }
// ○×の記録(oxStats)・解き直し・復習には入れない(時間に追われて答えるため)。答えた数は学習の回数(Streak)に入れる
// 経験値: 終わったときに Xp.award('challenge', { ids: 正解した文, finished: 最後までやったか })。途中で画面を移ったときは何も残さない
window.Views = window.Views || {};

window.LevelUi = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);
  const obj = (v) => Storage.isPlainObject(v);
  const n0 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e9) : 0; };
  const fmt = (n) => Number(n).toLocaleString(`ja-JP`);
  const GOAL_XP = 50;

  // ===== はじめの XP(これまでの学習の記録から。js/xp.js の点数と同じ数え方) =====
  // 4択(answerDaily: 日ごと・分野ごとの [自信あり正解, 自信なし正解, 不正解])10・6・3 / 日付のない4択の記録(quizHistory)は、日ごとの
  // 記録より多い問題数の分をその正答率で / 自動で作る4択(autoQuizStats)/ ○×(oxStats)3・2・1 / 復習カード(srsCards の評価して進んだ回数)3 /
  // 模擬試験(examHistory。日ごとの記録より前の回だけ)/ 目標を達成した日(goalDays)50。
  // 学習時間(1分 5XP)・学習の回数(activityLog。1回 3XP)から出した値より少なくはしない(古い記録が消えていても少なすぎないように)
  function seedValue() {
    try {
      const o = (k) => { const v = Storage.get(k, {}); return obj(v) ? v : {}; };
      const vals = (k) => Object.values(o(k));
      let s = 0;
      let n = 0;
      let first = ``;
      const daily = o(`answerDaily`);
      Object.keys(daily).forEach((d) => {
        if (!DateUtil.isValid(d) || !obj(daily[d])) return;
        if (!first || d < first) first = d;
        Object.values(daily[d]).forEach((tr) => {
          if (!Array.isArray(tr)) return;
          n += n0(tr[0]) + n0(tr[1]) + n0(tr[2]);
          s += n0(tr[0]) * 10 + n0(tr[1]) * 6 + n0(tr[2]) * 3;
        });
      });
      let ok = 0;
      let ng = 0;
      vals(`quizHistory`).forEach((v) => { if (v === `ok`) ok += 1; else if (v === `ng`) ng += 1; });
      const extra = ok + ng - n;
      if (extra > 0) s += (extra * (ok * 10 + ng * 3)) / (ok + ng);
      vals(`autoQuizStats`).forEach((v) => { if (obj(v)) s += n0(v.correct) * 10 + n0(v.wrong) * 3; });
      vals(`oxStats`).forEach((v) => {
        if (!obj(v)) return;
        const c = n0(v.c);
        const u = Math.min(n0(v.u), c);
        s += (c - u) * 3 + u * 2 + n0(v.w);
      });
      vals(`srsCards`).forEach((v) => { if (obj(v)) s += n0(v.reps) * 3; });
      const ex = Storage.get(`examHistory`, []);
      if (Array.isArray(ex)) {
        ex.forEach((e) => {
          const at = Number(obj(e) ? e.finishedAt : NaN);
          if (!(at > 0) || !Number.isFinite(at)) return;
          if (first && DateUtil.format(new Date(at)) >= first) return;
          const tot = Math.min(n0(e.total), 1000);
          const sc = Math.min(n0(e.score), tot);
          s += sc * 10 + (tot - sc) * 3;
        });
      }
      const gd = o(`goalDays`);
      s += Object.keys(gd).filter((d) => gd[d] === true && DateUtil.isValid(d)).length * GOAL_XP;
      let sec = 0;
      vals(`studyTime`).forEach((v) => { sec += Math.min(n0(v), 86400); });
      let acts = 0;
      vals(`activityLog`).forEach((v) => { acts += v === true ? 1 : Math.min(n0(v), 100000); });
      return Math.min(1e7, Math.round(Math.max(s, (sec / 60) * 5, acts * 3)));
    } catch (e) {
      console.error(`[経験値] これまでの記録を数えられませんでした`, e);
      return 0;
    }
  }

  // ===== お祝いしたレベル =====
  // まだお祝いしていないレベル(なければ 0。はじめの XP を付ける前は 0)
  function pending() {
    try {
      if (!window.Xp || !Xp._read) return 0;
      const x = Xp._read();
      if (!x.seeded) return 0;
      const L = Xp.levelOf(x.total).level;
      return L > x.seen ? L : 0;
    } catch (e) { return 0; }
  }
  function markSeen(L) {
    const x = Xp._read();
    if (L > x.seen) { x.seen = L; Xp._write(x); }
  }

  // 直近 n 日の [{ date, xp }](古い順)
  function lastDays(n) {
    if (window.Xp) Xp.seedIfNeeded();
    const x = window.Xp ? Xp._read() : { days: {} };
    const t = DateUtil.today();
    return Array.from({ length: n }, (_, i) => { const date = DateUtil.addDays(t, i - n + 1); return { date, xp: x.days[date] || 0 }; });
  }

  // Storage `challenge` を整えて読む(壊れた値は捨てる)
  function readChallenge() {
    const v = Storage.get(`challenge`, {});
    const days = {};
    if (obj(v.days)) {
      Object.keys(v.days).forEach((d) => {
        const e = v.days[d];
        if (DateUtil.isValid(d) && obj(e) && (n0(e.runs) || n0(e.best))) days[d] = { best: n0(e.best), runs: n0(e.runs) };
      });
    }
    return { best: n0(v.best), days, pool: [`takken`, `zeirishi`, `all`].includes(v.pool) ? v.pool : null };
  }

  // ===== レベルアップのお祝い(バッジの知らせと同じ形の小さなダイアログ。マスコットと紙吹雪。動きを減らす設定では動かさない) =====
  let showing = false;
  let waitTimer = null;
  let waitHash = false;

  // 文字を入力している途中は出さない(打った文字・Enter がダイアログに取られないように)
  function typing() {
    const ae = document.activeElement;
    if (!ae) return false;
    if (ae.isContentEditable || ae.tagName === `TEXTAREA` || ae.tagName === `SELECT`) return true;
    return ae.tagName === `INPUT` && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(ae.type || ``);
  }

  // 落ち着いているか(4択・○×・復習・チャレンジ・模擬試験の途中・ほかのダイアログ・初回ガイド・裏のタブでない)
  function quiet() {
    if (typing() || document.querySelector(`.ch-view.is-run`)) return false;
    if (window.Motion && typeof Motion.busy === `function`) return !Motion.busy(true);
    return document.visibilityState !== `hidden` && !document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay, .quiz-stepper:not(.is-finished), .ox-view.is-run`)
      && !document.body.classList.contains(`exam-active`);
  }

  function celebrate(delay) {
    if (typeof document === `undefined` || !document.body) return;
    clearTimeout(waitTimer);
    waitTimer = setTimeout(tryShow, delay == null ? 700 : delay);
  }

  function tryShow() {
    if (showing) return;
    const L = pending();
    if (!L) return;
    if (!quiet()) {
      clearTimeout(waitTimer);
      waitTimer = setTimeout(tryShow, 2500);
      // 画面を移ったら(結果の画面から次の画面へ)少し待って確かめる
      if (!waitHash) { waitHash = true; window.addEventListener(`hashchange`, () => { if (!showing && pending()) celebrate(600); }); }
      return;
    }
    show(L);
  }

  function show(L) {
    showing = true;
    markSeen(L);
    const lv = Xp.level();
    const back = document.activeElement;
    const mascot = window.Mascot && Mascot.svg ? Mascot.svg(`cheer`, 104, { className: `xp-up-mascot` }) : ``;
    const overlay = document.createElement(`div`);
    overlay.className = `modal-overlay fd-badge-overlay xp-up-overlay`;
    overlay.innerHTML = `
      <div class="modal-box fd-badge xp-up" role="dialog" aria-modal="true" aria-labelledby="xp-up-kicker xp-up-name" aria-describedby="xp-up-desc" data-role="level-up">
        <p class="fd-badge-kicker" id="xp-up-kicker">レベルアップ!</p>
        <div class="xp-up-art" aria-hidden="true">${mascot}<span class="xp-medal xp-up-medal"><small>Lv.</small><b>${L}</b></span></div>
        <p class="fd-badge-name" id="xp-up-name">Lv.${L} になりました</p>
        <p class="fd-badge-desc" id="xp-up-desc">${lv.max ? `最高のレベルです。ここまでの積み重ね、すばらしいです` : `次の Lv.${lv.level + 1} まで あと ${fmt(lv.rest)} XP。この調子でいこう!`}</p>
        <button type="button" class="btn btn-gold btn-lg btn-block" data-role="ok">OK</button>
      </div>`;
    document.body.appendChild(overlay);
    const ok = overlay.querySelector(`[data-role="ok"]`);
    const release = UI.trapFocus(overlay, () => close(true));
    overlay.addEventListener(`click`, (e) => { if (e.target === overlay) close(true); });
    ok.addEventListener(`click`, () => close(true));
    ok.focus({ preventScroll: true });
    // 紙吹雪とメダルのきらめき(動きを減らす設定では Mascot.confetti・Motion.burst は何もしない)
    setTimeout(() => {
      if (!overlay.isConnected) return;
      if (window.Mascot && Mascot.confetti) Mascot.confetti(overlay.querySelector(`.xp-up-art`));
      if (window.Motion && Motion.burst) Motion.burst(overlay.querySelector(`.xp-up-medal`), 12);
    }, 320);
    // 画面が移ったら(戻る操作など)閉じる。フォーカスは新しい画面の見出しのまま
    // (画面の切り替えの動きのあとに Router が送り直す hashchange(fdResent)は、同じ移動の2回目なので数えない)
    function onNav(e) { if (!(e && e.fdResent)) close(false); }
    window.addEventListener(`hashchange`, onNav);
    function close(restore) {
      if (!overlay.isConnected) return;
      window.removeEventListener(`hashchange`, onNav);
      release(false);
      overlay.remove();
      showing = false;
      if (restore && back && back.focus && back.isConnected) back.focus({ preventScroll: true });
      // 開いている間にさらに上がったら、落ち着いてからもう一度
      if (pending()) celebrate(600);
    }
  }

  // ===== 進捗の画面のカード =====
  function renderProgress(el) {
    if (!el || !window.Xp) return;
    Xp.seedIfNeeded();
    const x = Xp._read();
    if (!x.seeded) return;
    const lv = Xp.levelOf(x.total);
    const days = lastDays(7);
    const week = days.reduce((s, d) => s + d.xp, 0);
    const max = Math.max(...days.map((d) => d.xp), 30);
    const t = DateUtil.today();
    const WD = [`日`, `月`, `火`, `水`, `木`, `金`, `土`];
    const label = (d) => `${DateUtil.toJapanese(d.date, true)}: ${d.xp ? `${fmt(d.xp)} XP` : `なし`}`;
    const ch = readChallenge();
    const td = ch.days[t];
    const next = lv.max ? `最高のレベルです` : `次の Lv.${lv.level + 1} まで あと ${fmt(lv.rest)} XP`;
    const P = Xp.POINTS || {};
    const pts = (k) => (Array.isArray(P[k]) ? P[k] : [0, 0, 0]);
    el.innerHTML = `
      <section class="card xp-card" aria-labelledby="xp-card-title">
        <div class="recommend-head">
          <h3 class="card-title prog-title" id="xp-card-title"><span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`star-fill`, 18)}</span><span>レベルと経験値</span></h3>
          <span class="st-total num">直近7日 <strong>${fmt(week)}</strong> XP</span>
        </div>
        <div class="xp-prog-head">
          <span class="xp-medal xp-medal-lg" aria-hidden="true"><small>Lv.</small><b>${lv.level}</b></span>
          <div class="xp-prog-main">
            <p class="xp-prog-level"><span class="sr-only">いまのレベル ${lv.level}。</span><span class="xp-prog-total">これまでの合計</span><span class="num"><b>${fmt(x.total)}</b> XP</span></p>
            <div class="xp-bar xp-bar-lg" role="progressbar" aria-label="次のレベルまで" aria-valuemin="0" aria-valuemax="${lv.need || 1}" aria-valuenow="${lv.max ? 1 : lv.into}" aria-valuetext="${esc(next)}"><span style="width:${lv.pct}%"></span></div>
            <p class="xp-prog-next">${esc(next)}</p>
          </div>
        </div>
        <div class="st-chart xp-chart" role="img" aria-label="${esc(`直近7日の経験値(古い順): ${days.map(label).join(`、`)}`)}" data-role="xp-chart">
          ${days.map((d) => {
            const dt = DateUtil.parse(d.date);
            const h = d.xp > 0 ? Math.max(4, Math.round((d.xp / max) * 100)) : 0;
            return `<span class="st-col${d.date === t ? ` is-today` : ``}" data-label="${esc(label(d))}">
              <span class="st-val num" aria-hidden="true">${d.xp || ``}</span>
              <span class="st-bar-wrap" aria-hidden="true"><span class="st-bar" style="height:${h}%"></span></span>
              <span class="st-day" aria-hidden="true">${dt ? WD[dt.getDay()] : ``}</span>
            </span>`;
          }).join(``)}
        </div>
        <p class="chart-readout" aria-live="polite" data-role="xp-detail">棒をタップすると、その日の経験値が表示されます。</p>
        <a class="xp-ch-row" href="#challenge" data-role="xp-challenge">
          <span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`bolt`, 18)}</span>
          <span class="xp-ch-text"><b>今日のチャレンジ</b><small>${td ? `今日のベスト ${td.best}問(${td.runs}回)` : `今日はまだ`}${ch.best || Object.keys(ch.days).length ? `・自己ベスト ${ch.best}問` : ``}</small></span>
          ${ic(`chevron-right`, 18)}
        </a>
        <details class="xp-how">
          <summary>${ic(`help`, 16)}<span>経験値のため方</span>${ic(`chevron-down`, 16)}</summary>
          <ul>
            <li>4択: 正解 ${pts(`mc`)[0]}・自信なしの正解 ${pts(`mc`)[1]}・不正解 ${pts(`mc`)[2]} XP(模擬試験も)</li>
            <li>○×: 正解 ${pts(`ox`)[0]}・不正解 ${pts(`ox`)[2]} XP / 今日の復習: 1枚 ${pts(`review`)[0]} XP</li>
            <li>数字まとめ・比較表・条文穴埋め: 正解 ${pts(`numbers`)[0]}・不正解 ${pts(`numbers`)[2]} XP</li>
            <li>今日のチャレンジ: 正解1問 2 XP、その日はじめて最後までやると +30 XP</li>
            <li>1日の目標を達成: +${GOAL_XP} XP(1日1回)</li>
          </ul>
          <p class="prog-note">同じ日に同じ問題へもう一度答えたときは、2回目から 1 XP です。${x.seed ? `はじめに、それまでの学習の記録から ${fmt(x.seed)} XP を付けました${x.seedAt ? `(${DateUtil.toJapanese(x.seedAt)})` : ``}。` : ``}</p>
        </details>
      </section>`;
    const chart = el.querySelector(`[data-role="xp-chart"]`);
    const out = el.querySelector(`[data-role="xp-detail"]`);
    let picked = null;
    chart.addEventListener(`click`, (e) => {
      const col = e.target.closest(`.st-col`);
      if (!col) return;
      if (picked) picked.classList.remove(`is-picked`);
      picked = col;
      col.classList.add(`is-picked`);
      out.textContent = col.dataset.label || ``;
    });
  }

  // 詳細の束が届いたら: はじめの XP(まだなら)と、まだお祝いしていないレベル(前に開いていたときに上がった分)
  setTimeout(() => {
    try {
      if (!window.Xp) return;
      Xp.seedIfNeeded();
      if (pending()) celebrate(1500);
    } catch (e) { console.error(`[経験値]`, e); }
  }, 0);

  return { seedValue, celebrate, renderProgress, readChallenge, lastDays, _internal: { pending, markSeen, quiet } };
})();

window.Views.challenge = (function () {
  const KEY = `challenge`;
  const KEEP_DAYS = 400;
  const FEEDBACK_OK_MS = 350;
  const FEEDBACK_NG_MS = 1000;
  const POOLS = [
    { id: `takken`, label: `宅建士`, name: `宅建士試験` },
    { id: `zeirishi`, label: `税理士(消費税法)`, name: `税理士試験(消費税法)` },
    { id: `all`, label: `すべて`, name: `すべての分野` },
  ];
  const ZEI_CATS = [`shohi`, `shohiho`];
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);
  let duration = 180000; // 3分(テストでは短くできる)
  let run = null; // 進行中の回(画面を移ると捨てる)
  const shownIds = new Set(); // このページで出した文(次の回では後回しにする)

  // ===== 出題する文 =====
  function oxApi() {
    return window.Views && Views.ox && Views.ox._internal ? Views.ox._internal : null;
  }
  // 学ぶ目的(なければ主目標の試験)から選ぶ既定の文の範囲
  function defaultPool() {
    let id = null;
    try { id = Stats.goalExamTypeId(); } catch (e) { id = null; }
    if (!id) {
      try { const p = Stats.primaryTarget(); id = p ? p.examTypeId : null; } catch (e) { id = null; }
    }
    return id === `takken` || id === `zeirishi` ? id : `all`;
  }
  function poolId() {
    return LevelUi.readChallenge().pool || defaultPool();
  }
  // その範囲の文(○×一問一答と同じ文。分野 cats 付き)
  function statementsFor(id) {
    const api = oxApi();
    const all = api && typeof api.loadStatements === `function` ? api.loadStatements() : [];
    if (id === `zeirishi`) return all.filter((s) => Array.isArray(s.cats) && s.cats.some((c) => ZEI_CATS.includes(c)));
    if (id === `takken`) {
      const t = Stats.examType(`takken`);
      const ids = t && Array.isArray(t.categories) ? t.categories.map((c) => c.id) : [];
      return all.filter((s) => Array.isArray(s.cats) && s.cats.some((c) => ids.includes(c)));
    }
    return all;
  }
  // 出す順: まだこのページで出していない文を先に、ばらばらに(同じ4択の文は続けない)
  function ordered(list) {
    const api = oxApi();
    const sh = QuizEngine.shuffle(list);
    const fresh = sh.filter((s) => !shownIds.has(s.id)).concat(sh.filter((s) => shownIds.has(s.id))).slice(0, 300);
    return api && typeof api.spreadByQuiz === `function` ? api.spreadByQuiz(fresh) : fresh;
  }

  // ===== 記録 =====
  function save(score) {
    const c = LevelUi.readChallenge();
    const t = DateUtil.today();
    const d = c.days[t] || { best: 0, runs: 0 };
    d.runs += 1;
    d.best = Math.max(d.best, score);
    c.days[t] = d;
    c.best = Math.max(c.best, score);
    const old = DateUtil.addDays(t, -KEEP_DAYS);
    Object.keys(c.days).forEach((k) => { if (k < old) delete c.days[k]; });
    const out = { best: c.best, days: c.days };
    if (c.pool) out.pool = c.pool;
    Storage.set(KEY, out);
  }
  function savePool(id) {
    const c = LevelUi.readChallenge();
    const out = { best: c.best, days: c.days, pool: id };
    Storage.set(KEY, out);
  }

  // ===== 小物 =====
  function markSvg(kind) {
    const body = kind === `o`
      ? `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/>`
      : `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`;
    return `<svg class="ox-glyph ox-glyph-${kind}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function clock(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, `0`)}`;
  }
  function contextOf(s) {
    try { return typeof s.context === `string` ? s.context : ``; } catch (e) { return ``; }
  }
  function noteOf(s) {
    try { return typeof s.note === `string` ? s.note : ``; } catch (e) { return ``; }
  }

  // ===== はじめの画面 =====
  function renderStart(wrap) {
    wrap.classList.remove(`is-run`);
    const c = LevelUi.readChallenge();
    const t = DateUtil.today();
    const td = c.days[t];
    const runs = Object.keys(c.days).reduce((s, d) => s + c.days[d].runs, 0);
    let pool = poolId();
    const mascot = window.Mascot && Mascot.svg ? Mascot.svg(`cheer`, 80, { className: `ch-mascot` }) : ``;
    wrap.innerHTML = `
      <h2>今日のチャレンジ</h2>
      <section class="card ch-start" aria-label="ルールとスタート">
        <div class="ch-hero${mascot ? `` : ` no-mascot`}">${mascot}<p class="ch-lead">3分間で、○×に何問正解できるかな?</p></div>
        <ul class="ch-rules">
          <li>${ic(`timer`)}<span>制限時間は3分。間違えても、そのまま次の文へ進みます</span></li>
          <li>${ic(`o-x`)}<span>○(正しい)か×(誤り)で答えます${matchMedia(`(hover: hover) and (pointer: fine)`).matches ? `(キーボードは O・← で○、X・→ で×)` : ``}</span></li>
          <li>${ic(`sparkles`)}<span>正解1問で 2 XP。その日はじめて最後までやると +30 XP</span></li>
        </ul>
        <div class="ch-bests">
          <div class="ch-best"><span class="ch-best-label">今日のベスト</span><span class="ch-best-num num"><b>${td ? td.best : `-`}</b>${td ? `<small>問</small>` : ``}</span><span class="ch-best-sub">${td ? `今日 ${td.runs}回` : `まだ挑戦していません`}</span></div>
          <div class="ch-best is-all"><span class="ch-best-label">自己ベスト</span><span class="ch-best-num num"><b>${runs ? c.best : `-`}</b>${runs ? `<small>問</small>` : ``}</span><span class="ch-best-sub">${runs ? `これまで ${runs}回` : `最初の記録をつくろう`}</span></div>
        </div>
        <div class="ch-pool">
          <p class="ch-pool-label" id="ch-pool-label">出題する文</p>
          <div class="segmented seg-bold ch-seg" role="group" aria-labelledby="ch-pool-label" data-role="pool">
            ${POOLS.map((p) => `<button type="button" class="segmented-item" data-pool="${p.id}" aria-pressed="${p.id === pool}">${esc(p.label)}</button>`).join(``)}
          </div>
          <p class="ch-pool-note" data-role="pool-note"></p>
        </div>
        <button type="button" class="btn btn-gold btn-lg btn-block ch-go" data-role="start">${ic(`play`, 20)}スタート</button>
      </section>`;
    const note = wrap.querySelector(`[data-role="pool-note"]`);
    const startBtn = wrap.querySelector(`[data-role="start"]`);
    const paintPool = () => {
      const n = statementsFor(pool).length;
      const p = POOLS.find((x) => x.id === pool);
      note.textContent = n ? `${p.name}の○×(${n.toLocaleString(`ja-JP`)}文)から出題します` : `出題できる文がありません`;
      startBtn.disabled = !n;
      wrap.querySelectorAll(`[data-pool]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.pool === pool)));
    };
    paintPool();
    wrap.querySelector(`[data-role="pool"]`).addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-pool]`);
      if (!b || b.dataset.pool === pool) return;
      pool = b.dataset.pool;
      savePool(pool);
      paintPool();
    });
    startBtn.addEventListener(`click`, () => start(wrap, pool));
  }

  // ===== 出題 =====
  function start(wrap, pool) {
    const items = ordered(statementsFor(pool));
    if (!items.length) return;
    run = { pool, items, i: 0, answers: [], elapsed: 0, last: Date.now(), lock: false, timeUp: false, done: false, warned: {}, timer: null, wrap };
    wrap.classList.add(`is-run`);
    renderRun(wrap);
    window.scrollTo(0, 0);
  }

  function renderRun(wrap) {
    const r = run;
    wrap.innerHTML = `
      <h2 class="sr-only">今日のチャレンジ</h2>
      <div class="quiz-stepbar ch-bar" data-role="bar">
        <button type="button" class="btn btn-icon quiz-step-btn" data-role="quit" aria-label="終了する">${ic(`x`, 24)}</button>
        <div class="quiz-step-track ch-track" aria-hidden="true"><span class="quiz-step-fill ch-fill" data-role="time-bar" style="width:100%"></span></div>
        <span class="ch-score num" data-role="score"><span class="sr-only">正解 </span>${markSvg(`o`)}<b>0</b></span>
        <span class="quiz-step-count ch-time num" role="timer" aria-label="残り時間" data-role="time">${clock(duration)}</span>
      </div>
      <div class="ox-stage ch-stage" data-role="stage">
        <div class="ox-card">
          <p class="ox-context" data-role="context"></p>
          <p class="ox-statement" tabindex="-1" data-role="statement"></p>
        </div>
        <div class="ox-answer-row" role="group" aria-label="この文は正しいか、誤りか">
          <button type="button" class="ox-btn ox-btn-o" data-answer="o" aria-keyshortcuts="O 1 ArrowLeft">${markSvg(`o`)}<span class="ox-btn-label">正しい</span></button>
          <button type="button" class="ox-btn ox-btn-x" data-answer="x" aria-keyshortcuts="X 2 ArrowRight">${markSvg(`x`)}<span class="ox-btn-label">誤り</span></button>
        </div>
      </div>
      <div class="sr-only" role="status" aria-live="polite" data-role="live"></div>
      <p class="ox-keys">キーボード: <kbd>O</kbd>・<kbd>1</kbd>・<kbd>←</kbd> で○ / <kbd>X</kbd>・<kbd>2</kbd>・<kbd>→</kbd> で×</p>`;
    const el = (role) => wrap.querySelector(`[data-role="${role}"]`);
    r.el = { stage: el(`stage`), ctx: el(`context`), text: el(`statement`), score: wrap.querySelector(`[data-role="score"] b`), time: el(`time`), bar: el(`time-bar`), live: el(`live`), o: wrap.querySelector(`[data-answer="o"]`), x: wrap.querySelector(`[data-answer="x"]`) };
    r.el.o.addEventListener(`click`, () => answer(true));
    r.el.x.addEventListener(`click`, () => answer(false));
    el(`quit`).addEventListener(`click`, () => finish(true));
    // キーボード(O・1・← で○、X・2・→ で×)。画面を移ったら外す
    const onKey = (e) => {
      if (!wrap.isConnected || !run || run !== r) { document.removeEventListener(`keydown`, onKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      const k = e.key;
      if (k === `o` || k === `O` || k === `1` || k === `ArrowLeft`) { e.preventDefault(); answer(true); }
      else if (k === `x` || k === `X` || k === `2` || k === `ArrowRight`) { e.preventDefault(); answer(false); }
    };
    document.addEventListener(`keydown`, onKey);
    // 画面を移ったら(戻る・ほかのタブ)この回は捨てる(記録も経験値も残さない)
    UI.onLeave(wrap, () => { document.removeEventListener(`keydown`, onKey); if (run === r) stop(r); });
    showItem();
    r.last = Date.now();
    r.timer = setInterval(tick, 100);
  }

  function stop(r) {
    clearInterval(r.timer);
    r.timer = null;
    r.done = true;
    if (run === r) run = null;
  }

  // 時間を進める(画面が裏にある間は止める。1回に足すのは1秒まで: 端末のスリープなどで一度に減らないように)
  function tick() {
    const r = run;
    if (!r || r.done) return;
    if (!r.wrap.isConnected) { stop(r); return; }
    const now = Date.now();
    const dt = Math.min(1000, Math.max(0, now - r.last));
    r.last = now;
    if (document.visibilityState === `hidden`) return;
    r.elapsed += dt;
    const left = Math.max(0, duration - r.elapsed);
    r.el.time.textContent = clock(left);
    r.el.bar.style.width = `${(left / duration) * 100}%`;
    r.el.bar.classList.toggle(`is-low`, left <= 30000);
    // 残り時間の読み上げ(1分・30秒・10秒)
    [[60000, `残り1分`], [30000, `残り30秒`], [10000, `残り10秒`]].forEach(([ms, text]) => {
      if (duration > ms && left <= ms && !r.warned[ms]) { r.warned[ms] = true; say(text); }
    });
    if (left <= 0) {
      r.timeUp = true;
      if (!r.lock) finish(false);
    }
  }

  function say(text) {
    const live = run && run.el && run.el.live;
    if (!live) return;
    live.textContent = ``;
    setTimeout(() => { live.textContent = text; }, 40);
  }

  function showItem() {
    const r = run;
    if (r.i >= r.items.length) {
      // 用意した文を使い切ったら、もう一度並べ直して続ける
      r.items = r.items.concat(ordered(statementsFor(r.pool)));
    }
    const s = r.items[r.i];
    shownIds.add(s.id);
    const ctx = contextOf(s);
    r.el.ctx.textContent = ctx;
    r.el.ctx.hidden = !ctx;
    r.el.text.innerHTML = `${s.sub && s.label ? `<span class="stmt-label ox-stmt-label"><span class="sr-only">記述</span>${esc(s.label)}<span class="sr-only">、</span></span>` : ``}<span class="ox-statement-text">${esc(s.text)}</span>`;
    r.el.text.classList.toggle(`has-label`, !!(s.sub && s.label));
    [r.el.o, r.el.x].forEach((b) => {
      b.classList.remove(`is-answer`, `is-wrong`, `is-chosen`);
      b.removeAttribute(`aria-disabled`);
    });
    r.el.stage.classList.remove(`ch-flash-ok`, `ch-flash-ng`);
    // 読み上げ・キーボードの人が次の文をすぐ聞けるよう、文にフォーカスを移す(画面は動かさない)
    r.el.text.focus({ preventScroll: true });
  }

  function answer(saidTrue) {
    const r = run;
    if (!r || r.lock || r.done) return;
    const s = r.items[r.i];
    const ok = s.truth === !!saidTrue;
    r.answers.push({ s, ok });
    r.lock = true;
    const right = s.truth ? r.el.o : r.el.x;
    const chosen = saidTrue ? r.el.o : r.el.x;
    right.classList.add(`is-answer`);
    if (!ok) chosen.classList.add(`is-wrong`);
    [r.el.o, r.el.x].forEach((b) => b.setAttribute(`aria-disabled`, `true`));
    if (!UI.prefersReducedMotion()) r.el.stage.classList.add(ok ? `ch-flash-ok` : `ch-flash-ng`);
    const score = r.answers.filter((a) => a.ok).length;
    r.el.score.textContent = String(score);
    say(ok ? `正解` : `不正解。この文は${s.truth ? `正しい` : `誤り`}`);
    setTimeout(() => {
      if (run !== r || r.done) return;
      r.lock = false;
      if (r.timeUp) { finish(false); return; }
      r.i += 1;
      showItem();
    }, ok ? FEEDBACK_OK_MS : FEEDBACK_NG_MS);
  }

  // ===== 結果 =====
  // quit: 終了ボタンで途中で終えた(ベスト・回数には入れない。正解した分の経験値は付ける)
  function finish(quit) {
    const r = run;
    if (!r || r.done) return;
    const wrap = r.wrap;
    stop(r);
    const answered = r.answers.length;
    const correct = r.answers.filter((a) => a.ok).length;
    const before = LevelUi.readChallenge();
    const hadRuns = Object.keys(before.days).length > 0;
    const t = DateUtil.today();
    const prevToday = before.days[t] ? before.days[t].best : null;
    if (!quit) save(correct);
    const after = LevelUi.readChallenge();
    // 今日はじめて最後までやったボーナス(js/xp.js と同じ判定)
    const bonus = !quit && !!window.Xp && Xp._read().ch !== t;
    let gained = 0;
    try { if (window.Xp) gained = Xp.award(`challenge`, { ids: r.answers.filter((a) => a.ok).map((a) => a.s.id), finished: !quit }); } catch (e) { console.error(`[今日のチャレンジ] 経験値を記録できませんでした`, e); }
    // 答えた数を学習の回数に入れる(連続日数・1日の目標)
    if (window.Streak) for (let i = 0; i < answered; i++) Streak.recordToday();
    const newBest = !quit && correct > 0 && correct > before.best;
    renderResult(wrap, { quit, answered, correct, gained, bonus: bonus && gained >= 30, newBest, first: !quit && !hadRuns, todayBest: after.days[t] ? after.days[t].best : prevToday, best: Object.keys(after.days).length ? after.best : null, wrong: r.answers.filter((a) => !a.ok).map((a) => a.s) });
  }

  function renderResult(wrap, res) {
    wrap.classList.remove(`is-run`);
    const pct = res.answered ? Math.round((res.correct / res.answered) * 100) : 0;
    const face = res.quit ? `normal` : res.newBest ? `cheer` : `happy`;
    const mascot = window.Mascot && Mascot.svg ? Mascot.svg(face, 104, { className: `quiz-finish-mascot` }) : ``;
    const title = res.quit ? `途中で終了しました` : res.first ? `はじめての記録!` : res.newBest ? `自己ベスト更新!` : `タイムアップ!`;
    wrap.innerHTML = `
      <h2 class="sr-only">今日のチャレンジ</h2>
      <section class="card ch-result" aria-labelledby="ch-result-title" data-role="result">
        <div class="quiz-finish-hero" data-role="hero">${mascot}<h3 class="quiz-finish-title" id="ch-result-title" tabindex="-1">${title}</h3></div>
        <p class="quiz-finish-score ch-score-big"><span class="big-num">${res.correct}</span><span class="quiz-finish-of">問正解</span></p>
        <p class="ch-result-sub">${res.answered ? `${res.answered}問に答えて、正答率 ${pct}%` : `答えた文はありません`}</p>
        <ul class="ch-result-stats">
          <li class="is-xp"><span>経験値</span><b class="num" data-role="gained">+${res.gained} XP</b>${res.bonus ? `<small>今日はじめてのボーナス +30 を含む</small>` : ``}</li>
          <li><span>今日のベスト</span><b class="num">${res.todayBest == null ? `-` : `${res.todayBest}問`}</b></li>
          <li><span>自己ベスト</span><b class="num">${res.best == null ? `-` : `${res.best}問`}</b></li>
        </ul>
        ${res.quit ? `<p class="ox-summary-note">途中で終了した回は、ベストと回数に入りません(正解した分の経験値は付きます)。</p>` : ``}
        <div class="ox-summary-actions">
          <button type="button" class="btn btn-gold btn-lg" data-role="again">${ic(`refresh`, 20)}もう一度</button>
          <a class="btn btn-ghost" href="#home">${ic(`home`, 20)}ホームへ</a>
        </div>
      </section>
      <section class="ox-section" aria-labelledby="ch-wrong-title">
        <h3 id="ch-wrong-title">間違えた文${res.wrong.length ? `(${res.wrong.length})` : ``}</h3>
        ${res.wrong.length ? `<ol class="ox-wrong-list" data-role="wrong-list">${res.wrong.map((s) => {
          const ctx = contextOf(s);
          const note = noteOf(s);
          return `<li class="card ox-wrong-item">
            <div class="ox-wrong-head"><span class="ox-wrong-answer ${s.truth ? `is-true` : `is-false`}">正しくは<span class="ox-truth-mark">${markSvg(s.truth ? `o` : `x`).replace(`class="ox-glyph `, `class="ox-glyph ox-glyph-inline `)}<strong>${s.truth ? `正しい` : `誤り`}</strong></span></span></div>
            ${ctx ? `<p class="ox-wrong-context">${esc(ctx)}</p>` : ``}
            <p class="ox-wrong-text${s.sub && s.label ? ` has-label` : ``}">${s.sub && s.label ? `<span class="stmt-label ox-stmt-label"><span class="sr-only">記述</span>${esc(s.label)}<span class="sr-only">、</span></span>` : ``}<span>${esc(s.text)}</span></p>
            ${note ? `<p class="ox-wrong-note">${esc(note)}</p>` : ``}
            <div class="ox-wrong-links"><a class="link-btn" href="#quiz/q/${encodeURIComponent(s.quizId)}">${ic(`list`, 14)}元の4択問題</a></div>
          </li>`;
        }).join(``)}</ol>` : `<p class="ox-all-correct"><span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`trophy-fill`, 18)}</span>${res.answered ? `全問正解です。すごい!` : `答えた文はありません。`}</p>`}
      </section>`;
    wrap.querySelector(`[data-role="again"]`).addEventListener(`click`, () => {
      const pool = poolId();
      if (statementsFor(pool).length) start(wrap, pool); else renderStart(wrap);
    });
    window.scrollTo(0, 0);
    const head = wrap.querySelector(`#ch-result-title`);
    if (head) head.focus({ preventScroll: true });
    if (window.Motion && Motion.countIn) Motion.countIn(wrap.querySelector(`.ch-score-big`));
    // 自己ベストを更新したら紙吹雪(動きを減らす設定では出ない)
    if (res.newBest && window.Mascot && Mascot.confetti) {
      try { Mascot.confetti(wrap.querySelector(`[data-role="hero"]`)); } catch (e) { /* 飾りなので失敗しても続ける */ }
    }
    // レベルが上がっていれば、結果を見せたあとにお祝い
    if (window.LevelUi) LevelUi.celebrate(900);
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view ox-view ch-view`;
    root.appendChild(wrap);
    // 前の回が残っていれば捨てる(画面を移ってから戻ってきたとき)
    if (run) stop(run);
    renderStart(wrap);
  }

  return {
    render,
    // テスト用
    _internal: {
      setDuration: (ms) => { duration = Math.max(1000, Number(ms) || 180000); },
      getRun: () => run,
      statementsFor, defaultPool, poolId, POOLS,
    },
  };
})();
