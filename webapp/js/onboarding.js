// 初回ガイド: はじめて開いた人に、ようこそ → 学ぶ目的 → 試験日・気になるテーマ → 実際の1問 の4ステップ(スマホは全画面)
// 1問目を解くと、その日が学習の記録(1日目)になる。開いてから5タップ以内で1問解き終わるように組んでいる
// 「使い方」(サイドバー・メニュー)からは showGuide(): 学び方と復習のしくみ(学ぶ目的は変えない)
window.Onboarding = (function () {
  const PREFIX = `shojikiLearn.v1.`;
  // ホームの「アプリが新しくなりました」の版。内容を変えたらここを変えると、既存の利用者に1度だけ表示される
  const WHATS_NEW = `v11`;
  // 起動時に自動で書き込まれる・ガイド自身が使うキー、学習記録ではないキーは「既存ユーザー」の判定に含めない
  const IGNORE_KEYS = [`themePreference`, `ttsRate`, `oxPrefs`, `quizPrefs`, `srsMigrated`, `schemaVersion`, `onboardingDone`, `seenWhatsNew`,
    `lastBackupAt`, `backupNoteDismissedAt`, `installNoteDismissedAt`, `learnerProfile`, `seenReviewTip`, `glossaryMode`, `audience`];
  // 目的ごとの最初の1問(なければ最初の4択)
  const FIRST_QUESTION = { takken: `quiz-K-01`, life: `quiz-beg-01`, work: `quiz-beg-03`, zeirishi: `quiz-O-01` };
  // 試験日を登録するときの表示名
  const TARGET_NAMES = { takken: `宅建士試験`, zeirishi: `税理士試験(消費税法)` };
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  // ブラウザに保存領域の保護を頼む(Safari などで長期間開かないと記録が消えるのを防ぐ)。対応していなければ何もしない
  let persistAsked = false;
  function requestPersist() {
    if (persistAsked) return;
    persistAsked = true;
    try {
      const s = navigator.storage;
      if (!s || typeof s.persist !== `function`) return;
      const ask = () => s.persist().catch(() => false);
      if (typeof s.persisted === `function`) s.persisted().then((done) => { if (!done) ask(); }).catch(() => {});
      else ask();
    } catch (e) { /* 保護できなくても学習は続けられる */ }
  }

  let openState = null;

  function isEmptyValue(raw) {
    let v;
    try { v = JSON.parse(raw); } catch (e) { return !raw; }
    if (v == null || v === false || v === ``) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === `object`) return Object.keys(v).length === 0;
    return false;
  }

  function hasExistingData() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(PREFIX) !== 0) continue;
        if (IGNORE_KEYS.includes(k.slice(PREFIX.length))) continue;
        if (!isEmptyValue(localStorage.getItem(k))) return true;
      }
    } catch (e) { /* localStorage が使えない環境では新規扱い */ }
    return false;
  }

  function maybeShow() {
    if (Storage.get(`onboardingDone`, null)) return;
    if (hasExistingData()) {
      // 以前から使っている人にはガイドを出さず、ホームの「アプリが新しくなりました」で案内する
      Storage.set(`onboardingDone`, { v: 1, at: Date.now(), silent: true });
      return;
    }
    start();
  }

  function reset() {
    try { localStorage.removeItem(`${PREFIX}onboardingDone`); } catch (e) { /* 無視 */ }
  }

  function markDone() {
    Storage.set(`onboardingDone`, { v: 2, at: Date.now() });
    Storage.set(`seenWhatsNew`, WHATS_NEW);
    requestPersist();
  }

  function appName() {
    return (window.SITE && typeof SITE.name === `string` && SITE.name) || ``;
  }

  // 「2026年10月時点」(内容の確認日から)
  function asOfMonth() {
    const s = window.SITE && typeof SITE.contentAsOf === `string` ? SITE.contentAsOf : `2026-10`;
    const m = s.match(/^(\d{4})-(\d{1,2})/);
    return m ? `${m[1]}年${Number(m[2])}月時点` : `2026年10月時点`;
  }

  // ---- ステップの枠(初回ガイド・使い方で共通) ----
  // cfg: { kind, steps: [{ render(state), wire(body, ctl, state), next(state) → {label, icon, disabled, secondary}, onNext(state) → false で止める, hideSkip }],
  //        state, skipLabel, onFinish(reason, state), arrows }
  function openDialog(cfg) {
    if (openState) return null;
    const steps = cfg.steps;
    const state = cfg.state || {};
    const overlay = document.createElement(`div`);
    overlay.className = `onb-overlay onb-${cfg.kind}`;
    overlay.innerHTML = `
      <div class="onb-dialog" role="dialog" aria-modal="true" aria-labelledby="onb-title">
        <div class="onb-top">
          <span class="onb-step-label num" data-role="label"></span>
          <button type="button" class="onb-skip" data-role="skip">${esc(cfg.skipLabel)}</button>
        </div>
        <div class="onb-body" data-role="body"></div>
        <div class="onb-foot">
          <button type="button" class="btn btn-ghost onb-prev" data-role="prev" aria-label="戻る">${ic(`chevron-left`, 18)}<span class="onb-prev-text">戻る</span></button>
          <div class="onb-dots" data-role="dots" aria-hidden="true">${steps.map(() => `<span class="onb-dot"></span>`).join(``)}</div>
          <button type="button" class="btn onb-next" data-role="next"></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add(`onb-open`);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = `hidden`;

    const body = overlay.querySelector(`[data-role="body"]`);
    const label = overlay.querySelector(`[data-role="label"]`);
    const skipBtn = overlay.querySelector(`[data-role="skip"]`);
    const prevBtn = overlay.querySelector(`[data-role="prev"]`);
    const nextBtn = overlay.querySelector(`[data-role="next"]`);
    const dots = Array.from(overlay.querySelectorAll(`.onb-dot`));
    let step = 0;

    function paintFoot() {
      const s = steps[step];
      const n = (s.next && s.next(state)) || { label: `次へ` };
      nextBtn.innerHTML = `<span>${esc(n.label)}</span>${n.icon === false ? `` : ic(n.icon || `chevron-right`, 18)}`;
      nextBtn.disabled = !!n.disabled;
      nextBtn.classList.toggle(`btn-secondary`, !!n.secondary);
      prevBtn.style.visibility = step === 0 ? `hidden` : ``;
      skipBtn.hidden = !!s.hideSkip;
    }

    const ctl = {
      go,
      refresh: paintFoot,
      finish: (reason) => close(reason),
      get step() { return step; },
    };

    function paint(dir) {
      body.innerHTML = `<div class="onb-step onb-step-${steps[step].id || step}${dir ? ` onb-enter-${dir}` : ``}">${steps[step].render(state)}</div>`;
      // 「まず1問」は回答バーをスクロール領域の下端にぴったり付けるため、下の余白をカードの側に持たせる
      // (スクロール領域の下の余白があると、固定した回答バーの下に問題の文字がのぞく)
      body.classList.toggle(`onb-body-flush`, steps[step].id === `question`);
      // 最初の表示ではスクロール位置の取り直し(強制レイアウト)をしない
      if (dir) body.scrollTop = 0;
      label.textContent = `${step + 1} / ${steps.length}`;
      dots.forEach((d, i) => d.classList.toggle(`is-active`, i === step));
      if (steps[step].wire) steps[step].wire(body, ctl, state);
      paintFoot();
      // 見出しにフォーカス(スクリーンリーダーが新しいステップを最初から読む。Tab で中の操作へ進める)
      const title = body.querySelector(`#onb-title`);
      if (title) title.focus({ preventScroll: true });
      else nextBtn.focus({ preventScroll: true });
    }

    function go(delta) {
      const n = step + delta;
      if (n < 0) return;
      if (delta > 0 && steps[step].onNext && steps[step].onNext(state) === false) return;
      if (n >= steps.length) { close(`done`); return; }
      step = n;
      paint(delta > 0 ? `next` : `prev`);
    }

    function onKey(e) {
      if (!cfg.arrows || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName) || ``;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.key === `ArrowRight`) { e.preventDefault(); go(1); }
      else if (e.key === `ArrowLeft`) { e.preventDefault(); go(-1); }
    }

    // 1問目の解説の中のリンク(今日の復習など)で画面が移ったら、ガイドは完了として閉じる
    function onHashChange() { close(`navigate`); }

    // 用語のシートを開いているときの Esc はシートだけを閉じる
    const release = UI.trapFocus(overlay, () => { if (!document.querySelector(`.sheet-backdrop`)) close(`skip`); });
    document.addEventListener(`keydown`, onKey);
    window.addEventListener(`hashchange`, onHashChange);
    // 用語のシートは閉じるときに本文のスクロール止めを外すので、ガイドを開いている間は止め直す
    const bodyWatch = typeof MutationObserver === `function` ? new MutationObserver(() => {
      if (openState && document.body.style.overflow !== `hidden` && !document.querySelector(`.sheet-backdrop`)) document.body.style.overflow = `hidden`;
    }) : null;
    if (bodyWatch) bodyWatch.observe(document.body, { childList: true });

    function close(reason) {
      if (!openState) return;
      openState = null;
      if (bodyWatch) bodyWatch.disconnect();
      document.removeEventListener(`keydown`, onKey);
      window.removeEventListener(`hashchange`, onHashChange);
      release(reason !== `navigate`);
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove(`onb-open`);
      overlay.remove();
      if (cfg.onFinish) cfg.onFinish(reason, state);
    }

    prevBtn.addEventListener(`click`, () => go(-1));
    nextBtn.addEventListener(`click`, () => go(1));
    skipBtn.addEventListener(`click`, () => close(`skip`));

    openState = { close };
    paint(null);
    return openState;
  }

  // ---- 初回ガイドの各ステップ ----
  function stepWelcome() {
    return {
      id: `welcome`,
      render: () => {
        const name = appName();
        return `
          <div class="onb-hero"><img class="onb-logo" src="icons/logo.svg" alt="" width="72" height="72"></div>
          <h2 class="onb-title" id="onb-title" tabindex="-1">${name ? `${esc(name)}へ` : ``}ようこそ</h2>
          <p class="onb-lead">借りる・買う・売る・相続する。暮らしの中の不動産から宅建士試験の合格まで、基礎知識・問題・計算機で少しずつ身につける無料の学習アプリです。</p>
          <ul class="onb-points">
            <li><span class="onb-point-icon">${ic(`shield`)}</span><span>登録不要・広告なし。学習の記録は<strong>この端末の中だけ</strong>に保存され、外部には送信されません。</span></li>
            <li><span class="onb-point-icon">${ic(`library`)}</span><span>解説は、法令の条文や国土交通省・国税庁などの一次情報をもとに作っています(${asOfMonth()}。誤りが残っていることもあります)。</span></li>
            <li><span class="onb-point-icon">${ic(`info`)}</span><span>個人が運営する非公式の学習アプリです。法律・税務の個別相談には対応していません。</span></li>
          </ul>`;
      },
      next: () => ({ label: `はじめる`, icon: `arrow-right` }),
    };
  }

  function stepGoal() {
    const goals = () => (window.Stats && Array.isArray(Stats.GOAL_OPTIONS) ? Stats.GOAL_OPTIONS : []);
    return {
      id: `goal`,
      render: (state) => {
        const list = goals();
        const focusId = state.goal || (list[0] && list[0].id);
        return `
          <h2 class="onb-title" id="onb-title" tabindex="-1">何のために学びますか?</h2>
          <p class="onb-lead">おすすめの順番やホームの表示を合わせます。あとから設定で変えられます。</p>
          <div class="onb-choices" role="radiogroup" aria-labelledby="onb-title">
            ${list.map((g) => `
              <button type="button" class="onb-choice" role="radio" aria-checked="${state.goal === g.id}" tabindex="${g.id === focusId ? 0 : -1}" data-goal="${g.id}">
                <span class="onb-choice-icon">${ic(g.icon, 22)}</span>
                <span class="onb-choice-main"><span class="onb-choice-title">${esc(g.title)}</span><span class="onb-choice-desc">${esc(g.desc)}</span></span>
                <span class="onb-choice-mark" aria-hidden="true">${ic(`check`, 16)}</span>
              </button>`).join(``)}
          </div>`;
      },
      wire: (body, ctl, state) => {
        const btns = Array.from(body.querySelectorAll(`[data-goal]`));
        function select(btn, focus) {
          state.goal = btn.dataset.goal;
          // 目的を変えたら、前の目的で選んだテーマは持ち越さない
          if (state.goal === `takken` || state.goal === `zeirishi`) state.interests = [];
          btns.forEach((b) => {
            const on = b === btn;
            b.setAttribute(`aria-checked`, String(on));
            b.tabIndex = on ? 0 : -1;
          });
          if (focus) btn.focus();
          ctl.refresh();
        }
        btns.forEach((b, i) => {
          b.addEventListener(`click`, () => select(b, false));
          // ラジオボタンと同じく、矢印キーで選択を移す
          b.addEventListener(`keydown`, (e) => {
            const d = e.key === `ArrowDown` || e.key === `ArrowRight` ? 1 : e.key === `ArrowUp` || e.key === `ArrowLeft` ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            select(btns[(i + d + btns.length) % btns.length], true);
          });
        });
      },
      next: (state) => ({ label: `次へ`, disabled: !state.goal }),
      onNext: (state) => { if (!state.goal) return false; saveProfile(state); return true; },
    };
  }

  function isExamGoal(goal) {
    return goal === `takken` || goal === `zeirishi`;
  }

  // 「令和8年度試験 2026年10月18日(日)で登録」(折り返しは名前と日付の間で)
  function officialChipHtml(o) {
    const era = (String(o.label || ``).match(/^(令和\d+年度)/) || [])[1];
    return `<span class="nowrap">${esc(era ? `${era}試験` : o.label)}</span> <span class="nowrap">${esc(DateUtil.toJapanese(o.date, true))}で登録</span>`;
  }

  function stepSetup() {
    return {
      id: `setup`,
      render: (state) => (isExamGoal(state.goal) ? renderExamSetup(state) : renderInterestSetup(state)),
      wire: (body, ctl, state) => {
        if (isExamGoal(state.goal)) wireExamSetup(body, ctl, state);
        else wireInterestSetup(body, ctl, state);
      },
      next: (state) => (isExamGoal(state.goal) && !state.targetDate ? { label: `あとで設定する`, secondary: true } : { label: `次へ` }),
      onNext: (state) => { if (!isExamGoal(state.goal)) saveProfile(state); return true; },
    };
  }

  function renderExamSetup(state) {
    const typeId = state.goal;
    const officials = window.Stats && Stats.officialDates ? Stats.officialDates(typeId) : [];
    const today = DateUtil.today();
    const registered = state.targetDate
      ? `<p class="onb-status">${ic(`check-circle`, 18)}<span>登録しました: <strong>${esc(DateUtil.toJapanese(state.targetDate, true))}</strong></span></p>` : ``;
    return `
      <div class="onb-hero"><span class="onb-hero-icon">${ic(`calendar`, 30)}</span></div>
      <h2 class="onb-title" id="onb-title" tabindex="-1">試験日を登録しましょう</h2>
      <p class="onb-lead">ホームに残り日数と1日あたりの学習量の目安を表示します。</p>
      ${registered}
      <div class="onb-date-actions">
        ${officials.map((o) => `<button type="button" class="btn btn-lg btn-block onb-official" data-date="${o.date}">${ic(`calendar`)}<span>${officialChipHtml(o)}</span></button>`).join(``)}
        ${officials.length ? `<button type="button" class="btn btn-secondary btn-block" data-role="other-date" aria-expanded="false">${ic(`pencil-check`, 18)}別の日付を入力</button>` : ``}
        <form class="onb-date-form" data-role="date-form"${officials.length ? ` hidden` : ``}>
          <label class="field">試験日
            <input class="field-input" type="date" name="date" required min="${today}">
          </label>
          <button type="submit" class="btn">${ic(`check`, 18)}登録する</button>
        </form>
      </div>
      <p class="onb-small">試験日は試験実施機関の発表で確認してください。</p>`;
  }

  function wireExamSetup(body, ctl, state) {
    const typeId = state.goal;
    function register(date) {
      if (!DateUtil.isValid(date) || date < DateUtil.today()) return false;
      const exists = Stats.listTargets().some((t) => t.examTypeId === typeId && t.date === date);
      if (!exists) Stats.addTarget({ name: TARGET_NAMES[typeId] || `試験`, examTypeId: typeId, date, primary: true });
      state.targetDate = date;
      return true;
    }
    body.querySelectorAll(`.onb-official`).forEach((b) => b.addEventListener(`click`, () => {
      if (register(b.dataset.date)) ctl.go(1);
    }));
    const form = body.querySelector(`[data-role="date-form"]`);
    const other = body.querySelector(`[data-role="other-date"]`);
    if (other) {
      other.addEventListener(`click`, () => {
        form.hidden = !form.hidden;
        other.setAttribute(`aria-expanded`, String(!form.hidden));
        if (!form.hidden) form.querySelector(`input`).focus();
      });
    }
    form.addEventListener(`submit`, (e) => {
      e.preventDefault();
      const input = form.querySelector(`input`);
      if (register(input.value)) ctl.go(1);
      else input.reportValidity && input.reportValidity();
    });
  }

  function renderInterestSetup(state) {
    const opts = window.Stats && Array.isArray(Stats.INTEREST_OPTIONS) ? Stats.INTEREST_OPTIONS : [];
    const map = window.Stats ? Stats.INTEREST_TOPICS : {};
    const list = opts.filter((o) => map[o.id] && map[o.id].length);
    const sel = state.interests || [];
    return `
      <div class="onb-hero"><span class="onb-hero-icon">${ic(`sparkles`, 30)}</span></div>
      <h2 class="onb-title" id="onb-title" tabindex="-1">気になるテーマを選んでください</h2>
      <p class="onb-lead">いくつでも選べます。選んだテーマから先に出題します。</p>
      <div class="onb-interests" role="group" aria-labelledby="onb-title">
        ${list.map((o) => {
          // 「買う(購入・ローン)」は、かっこの中を2行目に小さく
          const m = String(o.label).match(/^(.+?)\((.+)\)$/);
          const text = m ? `<b>${esc(m[1])}</b><small>${esc(m[2])}</small>` : `<b>${esc(o.label)}</b>`;
          return `<button type="button" class="onb-interest" aria-pressed="${sel.includes(o.id)}" data-interest="${o.id}" aria-label="${esc(o.label)}">${ic(o.icon, 20)}<span class="onb-interest-text">${text}</span><span class="onb-interest-mark" aria-hidden="true">${ic(`check`, 14)}</span></button>`;
        }).join(``)}
      </div>`;
  }

  function wireInterestSetup(body, ctl, state) {
    body.querySelectorAll(`[data-interest]`).forEach((b) => b.addEventListener(`click`, () => {
      const id = b.dataset.interest;
      const cur = state.interests || [];
      state.interests = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id);
      b.setAttribute(`aria-pressed`, String(state.interests.includes(id)));
    }));
  }

  function firstQuestion(goal) {
    const quiz = (window.APP_DATA && Array.isArray(APP_DATA.quiz)) ? APP_DATA.quiz : [];
    const isMc = (q) => !!q && (window.QuizEngine && QuizEngine.isMcItem ? QuizEngine.isMcItem(q) : q.format === `mc`);
    const want = FIRST_QUESTION[goal] || FIRST_QUESTION.life;
    const q = quiz.find((x) => x && x.id === want);
    return isMc(q) ? q : quiz.find(isMc) || null;
  }

  function canAsk() {
    return !!(window.Views && Views.quiz && typeof Views.quiz.buildFixedCard === `function` && firstQuestion(null));
  }

  function stepQuestion() {
    return {
      id: `question`,
      hideSkip: true,
      render: () => `
        <h2 class="onb-title" id="onb-title" tabindex="-1">まずは1問、解いてみましょう</h2>
        <p class="onb-lead">選択肢をタップすると、正解と選択肢ごとの解説が出ます。</p>
        <div class="onb-question" data-role="question"></div>`,
      wire: (body, ctl, state) => {
        const q = firstQuestion(state.goal);
        const box = body.querySelector(`[data-role="question"]`);
        if (!q || !box) return;
        let card = null;
        try {
          // 戻ってから開き直したときは、答えた状態を記録し直さずに再現する
          const restore = state.answered && state.picked != null ? { restoreChoice: state.picked } : {};
          card = Views.quiz.buildFixedCard(q, Object.assign({
            onResult: (result, c, picked, restored) => {
              if (restored) return;
              state.answered = true;
              state.picked = picked;
              ctl.refresh();
            },
          }, restore));
        } catch (e) {
          console.error(`[初回ガイド] 問題を表示できませんでした`, e);
        }
        if (card) box.appendChild(card);
        else box.innerHTML = `<p class="onb-small">問題を表示できませんでした。ホームの「問題」からいつでも解けます。</p>`;
      },
      next: (state) => ({ label: `ホームへ`, icon: `home`, secondary: !state.answered }),
    };
  }

  function saveProfile(state) {
    if (!state.goal || !window.Stats || !Stats.setProfile) return;
    Stats.setProfile({ goal: state.goal, interests: isExamGoal(state.goal) ? [] : (state.interests || []) });
  }

  // 初回ガイド(はじめて開いたとき)
  function start() {
    const steps = [stepWelcome(), stepGoal(), stepSetup()];
    if (canAsk()) steps.push(stepQuestion());
    return openDialog({
      kind: `first`,
      steps,
      state: { goal: null, interests: [], targetDate: null, answered: false },
      skipLabel: `スキップ`,
      arrows: false,
      onFinish: (reason, state) => {
        saveProfile(state);
        markDone();
        // 画面の移動(解説のリンク)のときは移動先の画面がそのまま描かれる
        if (reason === `navigate` || !window.Router) return;
        // 最後まで進んだときはホームへ。ただし、ホーム以外の画面のリンク(検索から来た静的ページの「アプリで学ぶ」・共有されたリンク)
        // で開いたときは、その画面に戻る。スキップのときも今の画面のまま。どちらも目的に合わせて描き直す
        const cur = Router.current ? Router.current() : null;
        if (reason === `done` && (!cur || cur === `home`)) Router.navigate(`#home`);
        else Router.navigate(location.hash || `#home`);
      },
    });
  }

  // ---- 使い方(学び方・復習のしくみ) ----
  function guideHowTo() {
    const flow = [
      { icon: `book-open`, title: `基礎知識`, desc: `テーマごとに基礎から読んで全体像をつかむ` },
      { icon: `layers`, title: `用語カード`, desc: `タップで裏返して意味を確認。覚えたら★で記憶済みに` },
      { icon: `pencil-check`, title: `4択問題`, desc: `選択肢ごとの解説つき。理解度をチェック` },
      { icon: `o-x`, title: `○×一問一答`, desc: `1問数秒。スキマ時間に。間違えた文だけ解き直せる` },
      { icon: `timer`, title: `模擬試験`, desc: `本番と同じ問題数・時間で実力を確認(宅建士)` },
    ];
    return {
      id: `howto`,
      render: () => `
        <h2 class="onb-title" id="onb-title" tabindex="-1">学び方</h2>
        <p class="onb-lead">毎日まず「今日の復習」から。そのあと次の順に進めると、知識が自然とつながります。どこから始めてもかまいません。</p>
        <ol class="onb-flow">
          ${flow.map((f, i) => `
            <li class="onb-flow-item">
              <span class="onb-flow-icon">${ic(f.icon, 22)}<span class="onb-flow-num">${i + 1}</span></span>
              <span class="onb-flow-main"><span class="onb-flow-title">${f.title}</span><span class="onb-flow-desc">${f.desc}</span></span>
            </li>`).join(``)}
        </ol>`,
      next: () => ({ label: `次へ` }),
    };
  }

  function guideReview() {
    return {
      id: `review`,
      render: () => {
        const hasFig = !!(window.Diagrams && window.Diagrams.defs && window.Diagrams.defs[`srs-cycle`] && window.CardUi);
        const fig = hasFig ? CardUi.figureHtml(`srs-cycle`) : ``;
        return `
          <h2 class="onb-title" id="onb-title" tabindex="-1">復習のしくみ</h2>
          <p class="onb-lead">人は覚えたことを時間とともに忘れていきます。忘れかけたころに復習すると、記憶が長持ちします。</p>
          ${fig ? `<div class="onb-figure">${fig}</div>` : `
            <div class="onb-cycle" aria-hidden="true">
              <span class="onb-cycle-step">${ic(`layers`)}覚える</span>
              ${ic(`arrow-right`, 18)}
              <span class="onb-cycle-step">${ic(`clock`)}間をあける</span>
              ${ic(`arrow-right`, 18)}
              <span class="onb-cycle-step">${ic(`repeat`)}思い出す</span>
            </div>`}
          <ul class="onb-points">
            <li><span class="onb-point-icon">${ic(`repeat`)}</span><span>毎日まず<strong>「今日の復習」</strong>を開きましょう(下のタブの「復習」)。用語カードで「もう一度・難しい・普通・簡単」を選ぶと、次に復習する日が自動で決まり、その日になると今日の復習に並びます。</span></li>
            <li><span class="onb-point-icon">${ic(`x-circle`)}</span><span>問題で<strong>間違えた用語は自動で</strong>今日の復習に追加されます。</span></li>
            <li><span class="onb-point-icon">${ic(`flame`)}</span><span>1日1問でも続けると<strong>連続学習日数</strong>が伸びます。ホームで記録を確認できます。</span></li>
          </ul>`;
      },
      next: () => ({ label: `閉じる`, icon: `check` }),
    };
  }

  function showGuide() {
    return openDialog({
      kind: `guide`,
      steps: [guideHowTo(), guideReview()],
      state: {},
      skipLabel: `閉じる`,
      arrows: true,
    });
  }

  // show: 以前からの呼び出し(使い方ボタン)との互換のため、使い方を開く
  return { maybeShow, start, show: showGuide, showGuide, reset, requestPersist, hasExistingData, WHATS_NEW, IGNORE_KEYS };
})();
