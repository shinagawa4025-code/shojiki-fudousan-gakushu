// 初回ガイド: はじめて開いた人に4ステップでサイトの使い方を案内する
// 「使い方」ボタン(サイドバー・その他)からいつでも再表示できる
window.Onboarding = (function () {
  const PREFIX = `shojikiLearn.v1.`;
  // 起動時に自動で書き込まれる・ガイド自身が使うキーは「既存ユーザー」の判定に含めない
  const IGNORE_KEYS = [`themePreference`, `srsMigrated`, `onboardingDone`, `seenWhatsNew`];
  const ic = (name, size) => UI.icon(name, { size: size || 20 });

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
      // 以前から使っている人にはガイドを出さず、ホームの「サイトが新しくなりました」で案内する
      Storage.set(`onboardingDone`, { v: 1, at: Date.now(), silent: true });
      return;
    }
    show();
  }

  function reset() {
    try { localStorage.removeItem(`${PREFIX}onboardingDone`); } catch (e) { /* 無視 */ }
  }

  function markDone() {
    Storage.set(`onboardingDone`, { v: 1, at: Date.now() });
    Storage.set(`seenWhatsNew`, `tier5`);
  }

  // ---- 各ステップの中身 ----
  function stepWelcome() {
    return `
      <div class="onb-hero">
        <img class="onb-logo" src="icons/logo.svg" alt="" width="56" height="56">
      </div>
      <h2 class="onb-title" id="onb-title" tabindex="-1">ようこそ「不動産学習」へ</h2>
      <p class="onb-lead">不動産の基礎知識から、宅建士試験・税理士試験の学習までを、用語カード・クイズ・模擬試験で少しずつ身につけるサイトです。</p>
      <ul class="onb-points">
        <li><span class="onb-point-icon">${ic(`info`)}</span><span>個人が学習用に作った<strong>非公式サイト</strong>です。「正直不動産」の作品・公式チャンネルとは関係ありません。</span></li>
        <li><span class="onb-point-icon">${ic(`shield`)}</span><span>学習の記録は<strong>このブラウザの中だけ</strong>に保存され、外部には送信されません。設定からバックアップできます。</span></li>
      </ul>`;
  }

  function stepHowTo() {
    const flow = [
      { icon: `book-open`, title: `トピック`, desc: `テーマごとに基礎から読んで全体像をつかむ` },
      { icon: `layers`, title: `用語カード`, desc: `タップで裏返して意味を確認。覚えたら★で記憶済みに` },
      { icon: `pencil-check`, title: `クイズ`, desc: `確認問題と自動生成の4択で理解度をチェック` },
      { icon: `timer`, title: `模擬試験`, desc: `本番と同じ問題数・時間で実力を確認(宅建士)` },
    ];
    return `
      <h2 class="onb-title" id="onb-title" tabindex="-1">学び方</h2>
      <p class="onb-lead">次の順に進めると、知識が自然とつながります。どこから始めてもかまいません。</p>
      <ol class="onb-flow">
        ${flow.map((f, i) => `
          <li class="onb-flow-item">
            <span class="onb-flow-icon">${ic(f.icon, 22)}<span class="onb-flow-num">${i + 1}</span></span>
            <span class="onb-flow-main"><span class="onb-flow-title">${f.title}</span><span class="onb-flow-desc">${f.desc}</span></span>
          </li>`).join(``)}
      </ol>`;
  }

  function stepReview() {
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
        <li><span class="onb-point-icon">${ic(`repeat`)}</span><span>用語カードで「もう一度・難しい・普通・簡単」を選ぶと、次に復習する日が自動で決まり、その日になると<strong>「今日の復習」</strong>に並びます。</span></li>
        <li><span class="onb-point-icon">${ic(`x-circle`)}</span><span>クイズで<strong>間違えた用語は自動で</strong>今日の復習に追加されます。</span></li>
        <li><span class="onb-point-icon">${ic(`flame`)}</span><span>1日1問でも続けると<strong>連続学習日数</strong>が伸びます。ホームで記録を確認できます。</span></li>
      </ul>`;
  }

  function stepGoal() {
    const target = window.Stats ? Stats.primaryTarget() : null;
    const canForm = !!(window.Views && Views.home && Views.home.openTargetForm);
    let status = ``;
    if (target) {
      const d = DateUtil.diffDays(DateUtil.today(), target.date);
      status = `<p class="onb-status">${ic(`check-circle`, 18)}<span>登録済み: <strong>${UI.escapeHtml(target.name)}</strong>${d >= 0 ? `(あと${d}日)` : ``}</span></p>`;
    }
    return `
      <div class="onb-hero"><span class="onb-hero-icon">${ic(`target`, 30)}</span></div>
      <h2 class="onb-title" id="onb-title" tabindex="-1">目標を決めよう</h2>
      <p class="onb-lead">受ける試験の日付を登録すると、ホームに<strong>残り日数</strong>と<strong>1日あたりの学習量の目安</strong>が表示されます。</p>
      ${status}
      ${canForm ? `
        <div class="onb-goal-actions">
          <button type="button" class="btn btn-lg" data-role="goal">${ic(`calendar`)}${target ? `ほかの試験日を登録する` : `試験日を登録する`}</button>
          <button type="button" class="btn btn-ghost" data-role="later">あとで設定する</button>
        </div>` : ``}
      <p class="onb-small">試験日はあとから「設定」でいつでも登録・変更できます。</p>`;
  }

  const STEPS = [stepWelcome, stepHowTo, stepReview, stepGoal];

  function show() {
    if (openState) return;
    const overlay = document.createElement(`div`);
    overlay.className = `onb-overlay`;
    overlay.innerHTML = `
      <div class="onb-dialog" role="dialog" aria-modal="true" aria-labelledby="onb-title">
        <div class="onb-top">
          <span class="onb-step-label num" data-role="label"></span>
          <button type="button" class="onb-skip" data-role="skip">スキップ</button>
        </div>
        <div class="onb-body" data-role="body"></div>
        <div class="onb-foot">
          <div class="onb-dots" data-role="dots" aria-hidden="true">${STEPS.map(() => `<span class="onb-dot"></span>`).join(``)}</div>
          <div class="onb-nav">
            <button type="button" class="btn btn-secondary" data-role="prev">${ic(`chevron-left`, 18)}戻る</button>
            <button type="button" class="btn" data-role="next"></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = `hidden`;

    const body = overlay.querySelector(`[data-role="body"]`);
    const label = overlay.querySelector(`[data-role="label"]`);
    const prevBtn = overlay.querySelector(`[data-role="prev"]`);
    const nextBtn = overlay.querySelector(`[data-role="next"]`);
    const dots = Array.from(overlay.querySelectorAll(`.onb-dot`));
    let step = 0;

    function paint(dir) {
      body.innerHTML = `<div class="onb-step${dir ? ` onb-enter-${dir}` : ``}">${STEPS[step]()}</div>`;
      body.scrollTop = 0;
      label.textContent = `${step + 1} / ${STEPS.length}`;
      dots.forEach((d, i) => d.classList.toggle(`is-active`, i === step));
      prevBtn.style.visibility = step === 0 ? `hidden` : ``;
      const last = step === STEPS.length - 1;
      nextBtn.innerHTML = last ? `${ic(`check`, 18)}はじめる` : `次へ${ic(`chevron-right`, 18)}`;
      const goal = body.querySelector(`[data-role="goal"]`);
      if (goal) {
        goal.addEventListener(`click`, () => {
          close(true);
          Views.home.openTargetForm(() => Router.navigate(`#home`));
        });
      }
      const later = body.querySelector(`[data-role="later"]`);
      if (later) later.addEventListener(`click`, () => close(true));
    }

    function go(delta) {
      const n = step + delta;
      if (n < 0) return;
      if (n >= STEPS.length) { close(true); return; }
      step = n;
      paint(delta > 0 ? `next` : `prev`);
    }

    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName) || ``;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.key === `ArrowRight`) { e.preventDefault(); go(1); }
      else if (e.key === `ArrowLeft`) { e.preventDefault(); go(-1); }
    }

    const release = UI.trapFocus(overlay, () => close(true));
    document.addEventListener(`keydown`, onKey);

    function close(done) {
      if (!openState) return;
      openState = null;
      document.removeEventListener(`keydown`, onKey);
      release();
      document.body.style.overflow = prevOverflow;
      overlay.remove();
      if (done) markDone();
    }

    prevBtn.addEventListener(`click`, () => go(-1));
    nextBtn.addEventListener(`click`, () => go(1));
    overlay.querySelector(`[data-role="skip"]`).addEventListener(`click`, () => close(true));

    openState = { close };
    paint(null);
    nextBtn.focus();
  }

  return { maybeShow, show, reset };
})();
