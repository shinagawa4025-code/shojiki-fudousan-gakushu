// バッジ(v12): 学習の記録から自動で付く達成の印。初めて使うときは取得済みのものを通知せずに反映し、以後は新しく取ったときだけ知らせる
// 保存: Storage `badges` = { seeded: true, at: { [バッジID]: 'YYYY-MM-DD' } }
// 判定に使うのは既存の記録だけ(activityLog・quizHistory・quizUnsure・oxStats・examHistory・srsCards・flashcards・basicsProgress・
// studyTime・goalDays・drillStats)。新しい記録は作らない
// 確かめるのは、学習の操作('study:action')・学習時間の保存・目標の達成のあと2秒以上たってから、手の空いたとき(最初の表示を遅らせない)
window.Badges = (function () {
  const KEY = `badges`;
  const DEBOUNCE_MS = 2000;
  const FIRST_CHECK_MS = 4000; // 起動直後は画面の表示を優先して、少し待ってから確かめる
  const BUSY_RETRY_MS = 5000;
  const STMT_KEY_RE = /^[^#]+#(?:[0-3]|s[0-3])$/;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function cnt(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e7) : 0;
  }

  function obj(key) {
    const v = Storage.get(key, {});
    return Storage.isPlainObject(v) ? v : {};
  }

  // 今の4択の一覧 [{ id, styled, cat }](問題データが差し替わったら作り直す。分野の判定は重めなので覚えておく)
  let quizCache = null;
  function mcList() {
    const list = (window.APP_DATA && Array.isArray(APP_DATA.quiz)) ? APP_DATA.quiz : [];
    if (!window.QuizEngine || typeof QuizEngine.isMcItem !== `function`) return [];
    if (!quizCache || quizCache.src !== list || quizCache.n !== list.length) {
      const out = [];
      list.forEach((q) => {
        if (!q || typeof q.id !== `string` || !QuizEngine.isMcItem(q)) return;
        let cat = null;
        try { const ct = window.Stats ? Stats.categoryOf(q, `takken`) : null; cat = ct ? ct.id : null; } catch (e) { cat = null; }
        out.push({ id: q.id, styled: !!q.style, cat });
      });
      quizCache = { src: list, n: list.length, out };
    }
    return quizCache.out;
  }

  // ---- 判定に使う数(1回の判定の中だけ覚えておく。使わないものは読まない) ----
  function makeCtx() {
    const memo = Object.create(null);
    const once = (name, fn) => () => {
      if (!(name in memo)) {
        try { memo[name] = fn(); } catch (e) { console.error(`[バッジ] ${name} を数えられませんでした`, e); memo[name] = null; }
      }
      return memo[name];
    };
    const c = {};
    c.activeDays = once(`activeDays`, () => (window.Streak ? Streak.totalActiveDays() : 0));
    c.longestStreak = once(`longestStreak`, () => (window.Streak ? Streak.getLongestStreak() : 0));
    c.quizHistory = once(`quizHistory`, () => obj(`quizHistory`));
    c.unsure = once(`unsure`, () => (window.AnswerLog && AnswerLog.unsureMap ? AnswerLog.unsureMap() : {}));
    // 4択: 今のデータにある問題のうち答えたもの(同じ問題は1回)・正解(業法の正答率では自信なしを0.5問。分析と同じ)
    c.mc = once(`mc`, () => {
      const qh = c.quizHistory();
      const unsure = c.unsure();
      const list = mcList();
      let answered = 0;
      let styledOk = 0;
      let gyohoN = 0;
      let gyohoOk = 0;
      list.forEach((q) => {
        const r = hasOwn(qh, q.id) ? qh[q.id] : null;
        if (r !== `ok` && r !== `ng`) return;
        answered += 1;
        const ok = r === `ok`;
        // 個数・組合せ(style のある問題)の正解。勘の正解も正解として数える
        if (ok && q.styled) styledOk += 1;
        if (q.cat === `gyoho`) {
          gyohoN += 1;
          if (ok) gyohoOk += hasOwn(unsure, q.id) ? 0.5 : 1;
        }
      });
      return { answered, total: list.length, styledOk, gyohoN, gyohoOk };
    });
    // ○×: 答えたことのある文の数(同じ文は1回)
    c.oxAnswered = once(`oxAnswered`, () => {
      const ox = obj(`oxStats`);
      return Object.keys(ox).filter((k) => STMT_KEY_RE.test(k) && Storage.isPlainObject(ox[k]) && (cnt(ox[k].c) + cnt(ox[k].w)) > 0).length;
    });
    c.exams = once(`exams`, () => {
      const v = Storage.get(`examHistory`, []);
      return Array.isArray(v) ? v.filter((e) => Storage.isPlainObject(e)) : [];
    });
    c.fullTakken = once(`fullTakken`, () => c.exams().filter((e) => e.examTypeId === `takken` && e.mode === `full` && cnt(e.total) > 0));
    c.bestFullScore = once(`bestFullScore`, () => c.fullTakken().reduce((m, e) => Math.max(m, Math.min(cnt(e.score), cnt(e.total))), 0));
    // フルの模試で、最も低い分野の正答率が一番高かった回のその値(%)
    c.bestMinCat = once(`bestMinCat`, () => c.fullTakken().reduce((m, e) => {
      const bc = Storage.isPlainObject(e.byCategory) ? e.byCategory : {};
      const pcts = Object.keys(bc).filter((k) => k !== `other` && Storage.isPlainObject(bc[k]) && cnt(bc[k].total) > 0)
        .map((k) => Math.min(cnt(bc[k].correct), cnt(bc[k].total)) / cnt(bc[k].total) * 100);
      return pcts.length ? Math.max(m, Math.floor(Math.min(...pcts))) : m;
    }, 0));
    c.mature = once(`mature`, () => (window.Stats && Stats.srsBuckets ? Stats.srsBuckets().mature : 0));
    // 最も進んだトピック { done, total }
    c.bestTopic = once(`bestTopic`, () => {
      const rows = window.Stats && Stats.byTopic ? Stats.byTopic() : [];
      let best = { done: 0, total: 1, pct: 0 };
      rows.forEach((r) => {
        if (!r || !(r.total > 0)) return;
        const p = r.done / r.total;
        if (p > best.pct || (p === best.pct && r.total < best.total)) best = { done: r.done, total: r.total, pct: p };
      });
      return best;
    });
    c.studySec = once(`studySec`, () => (window.StudyTime ? StudyTime.totalSeconds() : 0));
    c.goalDays = once(`goalDays`, () => (window.Goals ? Goals.metDaysCount() : 0));
    c.graduated = once(`graduated`, () => (window.Drill && Drill.stats ? Drill.stats().graduated : cnt(obj(`drillStats`).graduated)));
    return c;
  }

  // ---- バッジの一覧 ----
  // progress(c) → { now, goal, unit }。now >= goal で取得
  const p = (now, goal, unit) => ({ now: Math.max(0, Math.min(Math.floor(now), goal)), goal, unit });
  const DEFS = [
    { id: `first`, name: `初めての学習`, desc: `1日目の学習を記録する`, icon: `sprout`, progress: (c) => p(c.activeDays(), 1, `日`) },
    { id: `streak3`, name: `3日連続`, desc: `3日続けて学習する`, icon: `flame`, progress: (c) => p(c.longestStreak(), 3, `日`) },
    { id: `streak7`, name: `7日連続`, desc: `7日続けて学習する`, icon: `flame`, progress: (c) => p(c.longestStreak(), 7, `日`) },
    { id: `streak30`, name: `30日連続`, desc: `30日続けて学習する`, icon: `flame`, progress: (c) => p(c.longestStreak(), 30, `日`) },
    { id: `days50`, name: `学習50日`, desc: `学習した日が合計50日になる`, icon: `calendar`, progress: (c) => p(c.activeDays(), 50, `日`) },
    { id: `mc100`, name: `4択100問`, desc: `4択問題で100問解く(模擬試験は含みません。同じ問題は1問と数えます)`, icon: `pencil-check`, progress: (c) => p(c.mc().answered, 100, `問`) },
    { id: `mc300`, name: `4択300問`, desc: `4択問題で300問解く(模擬試験は含みません。同じ問題は1問と数えます)`, icon: `pencil-check`, progress: (c) => p(c.mc().answered, 300, `問`) },
    { id: `mcAll`, name: `4択を全問`, desc: `4択問題をすべて1回以上解く(模擬試験は含みません)`, icon: `trophy`, progress: (c) => p(c.mc().answered, Math.max(1, c.mc().total), `問`) },
    { id: `ox500`, name: `○×500文`, desc: `○×一問一答で500文に答える(同じ文は1文と数えます)`, icon: `o-x`, progress: (c) => p(c.oxAnswered(), 500, `文`) },
    { id: `ox1000`, name: `○×1000文`, desc: `○×一問一答で1000文に答える(同じ文は1文と数えます)`, icon: `o-x`, progress: (c) => p(c.oxAnswered(), 1000, `文`) },
    { id: `drill10`, name: `解き直し卒業10問`, desc: `解き直しで4回続けて正解し、卒業した問題が10問になる`, icon: `repeat`, progress: (c) => p(c.graduated(), 10, `問`) },
    { id: `examFirst`, name: `模試デビュー`, desc: `模擬試験を1回受ける`, icon: `timer`, progress: (c) => p(c.exams().length, 1, `回`) },
    { id: `exam35`, name: `模試35点`, desc: `フルの模擬試験(50問)で35点以上を取る`, icon: `trophy`, progress: (c) => p(c.bestFullScore(), 35, `点`) },
    { id: `examAll70`, name: `全分野7割`, desc: `フルの模擬試験で、すべての分野の正答率が70%以上になる`, icon: `target`, progress: (c) => p(c.bestMinCat(), 70, `%`) },
    {
      id: `gyoho80`, name: `業法8割`, desc: `宅建業法の4択を100問以上解き、正答率80%以上(自信なしの正解は0.5問)`, icon: `briefcase`,
      // 100問に届くまでは解いた数、届いたら正答率で進み具合を出す
      progress: (c) => {
        const m = c.mc();
        if (m.gyohoN < 100) return p(m.gyohoN, 100, `問`);
        return p((m.gyohoOk / m.gyohoN) * 100, 80, `%`);
      },
    },
    { id: `srs100`, name: `定着100語`, desc: `復習カードで、次の復習まで21日以上あく(定着した)用語が100語になる`, icon: `layers`, progress: (c) => p(c.mature(), 100, `語`) },
    { id: `topic1`, name: `トピック制覇`, desc: `1つのトピックの用語・基礎知識をすべて記憶済み・学習済みにする`, icon: `book-open`, progress: (c) => p(c.bestTopic().done, c.bestTopic().total, `項目`) },
    { id: `hours10`, name: `学習10時間`, desc: `学習時間の合計が10時間になる(操作している時間だけを数えます)`, icon: `clock`, progress: (c) => p(c.studySec() / 3600, 10, `時間`) },
    { id: `hours50`, name: `学習50時間`, desc: `学習時間の合計が50時間になる(操作している時間だけを数えます)`, icon: `clock`, progress: (c) => p(c.studySec() / 3600, 50, `時間`) },
    { id: `goal7`, name: `目標達成7日`, desc: `1日の目標を達成した日が合計7日になる`, icon: `star`, progress: (c) => p(c.goalDays(), 7, `日`) },
    { id: `styled10`, name: `個数・組合せ10問`, desc: `4択問題で、個数問題・組合せ問題に10問正解する(模擬試験は含みません。同じ問題は1問と数えます)`, icon: `grid`, progress: (c) => p(c.mc().styledOk, 10, `問`) },
  ];

  function isMet(pr) {
    return !!pr && pr.goal > 0 && pr.now >= pr.goal;
  }

  // ---- 保存 ----
  function readStore() {
    const v = Storage.get(KEY, {});
    const at = {};
    if (Storage.isPlainObject(v) && Storage.isPlainObject(v.at)) {
      Object.keys(v.at).forEach((id) => { if (DEFS.some((d) => d.id === id) && DateUtil.isValid(v.at[id])) at[id] = v.at[id]; });
    }
    return { seeded: !!(Storage.isPlainObject(v) && v.seeded === true), at };
  }

  // 新しく取ったバッジを保存する。戻り値: 本当に新しかったもの(別のタブが先に保存していたものは除く)
  function commit(ids) {
    const store = readStore(); // 書く直前に読み直す
    const wasSeeded = store.seeded;
    const t = DateUtil.today();
    const fresh = ids.filter((id) => !store.at[id]);
    fresh.forEach((id) => { store.at[id] = t; });
    if (!fresh.length && wasSeeded) return { fresh: [], silent: true };
    Storage.set(KEY, { seeded: true, at: store.at });
    // ホームのバッジ数をその場で更新する(初回の起動では、表示のあとにバッジを確かめるため)
    try { window.dispatchEvent(new CustomEvent(`badges:change`)); } catch (e) { /* 知らせなくても次の表示で反映される */ }
    return { fresh, silent: !wasSeeded };
  }

  // ---- 獲得の知らせ(v12.2): メダルがぽんと出る小さなダイアログ(css/motion.css の .fd-badge) ----
  // 一度に複数取ったときは順に(「次へ」)。模擬試験の解答中・初回ガイド・ほかのダイアログ・4択/○×/復習の途中は、
  // 落ち着くまで待ってから出す(Motion.busy。画面の移動のたびと数秒ごとに確かめる)。「次へ」「OK」で順に、Esc・外側のタップで全部閉じ、
  // 閉じたら開く前にフォーカスしていた所へ戻す(画面が移ったときは新しい画面の見出しのまま)
  const shown = [];
  let showing = false;
  let waitTimer = null;
  let waitHash = false;
  function announce(fresh) {
    if (!fresh.length || !window.UI) return;
    // ダイアログを出せない環境(UI の一部が無いとき)は、前と同じ画面の上の通知1つ(複数は「n個」にまとめる)
    if (typeof UI.trapFocus !== `function`) {
      if (typeof UI.toast !== `function`) return;
      const names = fresh.map((id) => (DEFS.find((d) => d.id === id) || {}).name).filter(Boolean);
      const msg = names.length === 1
        ? `バッジ「${names[0]}」を獲得しました`
        : `バッジを${names.length}個獲得しました(${names.slice(0, 3).map((n) => `「${n}」`).join(``)}${names.length > 3 ? `ほか` : ``})`;
      UI.toast(msg, `success`, { duration: 4000, position: `top` });
      return;
    }
    fresh.forEach((id) => { const d = DEFS.find((x) => x.id === id); if (d && !shown.includes(d)) shown.push(d); });
    present();
  }

  function quietNow() {
    if (window.Motion && typeof Motion.busy === `function`) return !Motion.busy(true);
    return !busy() && !document.querySelector(`.modal-overlay, .sheet-backdrop`);
  }

  function present() {
    if (showing || !shown.length || !document.body) return;
    if (!quietNow()) {
      clearTimeout(waitTimer);
      waitTimer = setTimeout(present, 2500);
      if (!waitHash) { waitHash = true; window.addEventListener(`hashchange`, () => setTimeout(present, 600)); }
      return;
    }
    clearTimeout(waitTimer);
    showing = true;
    const back = document.activeElement;
    let i = 0;
    let overlay = null;
    let release = null;
    function open() {
      const d = shown[0];
      const last = shown.length === 1;
      const total = i + shown.length;
      overlay = document.createElement(`div`);
      overlay.className = `modal-overlay fd-badge-overlay`;
      overlay.innerHTML = `
        <div class="modal-box fd-badge" role="dialog" aria-modal="true" aria-labelledby="fd-badge-kicker fd-badge-name" aria-describedby="fd-badge-desc">
          <p class="fd-badge-kicker" id="fd-badge-kicker">バッジを獲得!</p>
          <div class="fd-medal" aria-hidden="true">
            <span class="fd-medal-face">${UI.icon(d.icon, { size: 56 })}</span>
            <span class="fd-spark s1">${UI.icon(`sparkles`, { size: 28 })}</span><span class="fd-spark s2">${UI.icon(`sparkles`, { size: 22 })}</span>
          </div>
          <p class="fd-badge-name" id="fd-badge-name">${UI.escapeHtml(d.name)}</p>
          <p class="fd-badge-desc" id="fd-badge-desc">${UI.escapeHtml(d.desc)}</p>
          ${total > 1 ? `<p class="fd-badge-count">${i + 1} / ${total}</p>` : ``}
          <button type="button" class="btn btn-gold btn-lg btn-block" data-role="ok">${last ? `OK` : `次へ`}</button>
        </div>`;
      document.body.appendChild(overlay);
      // Esc・外側のタップは残りもまとめて閉じる(バッジは獲得済み。一覧は 進捗 › バッジ で見られる)
      release = UI.trapFocus(overlay, () => next(true));
      overlay.addEventListener(`click`, (e) => { if (e.target === overlay) next(true); });
      overlay.querySelector(`[data-role="ok"]`).addEventListener(`click`, () => next());
      overlay.querySelector(`[data-role="ok"]`).focus({ preventScroll: true });
      if (window.Motion && Motion.burst) setTimeout(() => { if (overlay && overlay.isConnected) Motion.burst(overlay.querySelector(`.fd-medal`), 14); }, 380);
    }
    function shut() {
      if (release) release(false);
      release = null;
      if (overlay) overlay.remove();
      overlay = null;
    }
    // 次のバッジへ(最後・all のときは閉じて、開く前にフォーカスしていた所へ戻す)
    function next(all) {
      if (!overlay) return;
      shut();
      if (all) shown.length = 0; else shown.shift();
      i += 1;
      if (shown.length) { open(); return; }
      window.removeEventListener(`hashchange`, onNav);
      showing = false;
      if (back && back.focus && back.isConnected) back.focus({ preventScroll: true });
    }
    // 画面が移ったら(戻る操作など)閉じる。フォーカスは新しい画面の見出しのまま。残りは落ち着いてから出す
    function onNav() {
      window.removeEventListener(`hashchange`, onNav);
      shut();
      shown.shift();
      showing = false;
      if (shown.length) setTimeout(present, 600);
    }
    window.addEventListener(`hashchange`, onNav);
    open();
  }

  // 取得済みでないバッジだけ判定し、新しく取ったものを保存して知らせる(初回は知らせずに反映)
  // 戻り値: 新しく取ったバッジID
  function check() {
    const store = readStore();
    const c = makeCtx();
    const met = [];
    DEFS.forEach((d) => {
      if (store.at[d.id]) return;
      let pr = null;
      try { pr = d.progress(c); } catch (e) { console.error(`[バッジ] ${d.id} を判定できませんでした`, e); }
      if (isMet(pr)) met.push(d.id);
    });
    if (!met.length && store.seeded) return [];
    const res = commit(met);
    if (!res.silent) announce(res.fresh);
    return res.fresh;
  }

  // [{ id, name, desc, icon, earnedAt: 'YYYY-MM-DD'|null, progress: { now, goal, unit }|null }](定義の順)
  // 条件を満たしているのにまだ保存していないもの(判定の待ち時間の間)は、ここで保存して知らせる
  function list() {
    const store = readStore();
    const c = makeCtx();
    const met = [];
    const rows = DEFS.map((d) => {
      let pr = null;
      try { pr = d.progress(c); } catch (e) { pr = null; }
      if (!store.at[d.id] && isMet(pr)) met.push(d.id);
      return { id: d.id, name: d.name, desc: d.desc, icon: d.icon, earnedAt: store.at[d.id] || null, progress: pr };
    });
    if (met.length || !store.seeded) {
      const res = commit(met);
      const t = DateUtil.today();
      rows.forEach((r) => { if (!r.earnedAt && met.includes(r.id)) r.earnedAt = t; });
      if (!res.silent) announce(res.fresh);
    }
    return rows;
  }

  function earnedCount() {
    return Object.keys(readStore().at).length;
  }

  // ---- 起動・間をおいた判定 ----
  let started = false;
  let timer = null;
  let idleHandle = null;

  // 初回ガイドの表示中・模擬試験の解答中は知らせない(終わってから確かめる)
  function busy() {
    try {
      return typeof document !== `undefined` && !!(document.querySelector(`.onb-overlay`) || (document.body && document.body.classList.contains(`exam-active`)));
    } catch (e) { return false; }
  }

  function runSoon(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const run = () => {
        idleHandle = null;
        if (busy() && readStore().seeded) { runSoon(BUSY_RETRY_MS); return; }
        try { check(); } catch (e) { console.error(`[バッジ] 判定に失敗しました`, e); }
      };
      // 手の空いたときに(Safari には requestIdleCallback が無いため、そのまま実行)
      if (typeof window.requestIdleCallback === `function`) {
        if (idleHandle == null) idleHandle = window.requestIdleCallback(run, { timeout: 3000 });
      } else {
        run();
      }
    }, delay);
  }

  function start() {
    if (started || typeof window.addEventListener !== `function`) return;
    started = true;
    // 目標の達成日の記録(バッジ「目標達成7日」が使う)も、ここで始める
    if (window.Goals && typeof Goals.start === `function`) Goals.start();
    const later = () => runSoon(DEBOUNCE_MS);
    window.addEventListener(`study:action`, later);
    // 学習時間は30秒ごとに保存されるため、合計の「時間」が変わったときだけ確かめる(学習10時間・50時間)
    let lastHours = null;
    window.addEventListener(`studytime:change`, () => {
      const h = window.StudyTime ? Math.floor(StudyTime.totalSeconds() / 3600) : 0;
      if (h === lastHours) return;
      lastHours = h;
      later();
    });
    window.addEventListener(`goal:met`, later);
    window.addEventListener(`drill:change`, (e) => { if (e && e.detail && e.detail.kind === `graduated`) later(); });
    // 起動時: 初回は取得済みのものを黙って反映。以後は前回からの変化(日付が変わって連続日数が伸びたなど)を確かめる
    runSoon(FIRST_CHECK_MS);
  }

  return { list, check, start, earnedCount, DEFS, _internal: { makeCtx, readStore, commit } };
})();
