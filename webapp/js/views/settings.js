// 設定ビュー: 学ぶ目的・目標の試験・1日の目標・今日の復習・問題の解き方・テーマ・読み上げ・学習データのエクスポート/インポート(バックアップ・端末間の手動移行)
// #settings/profile・#settings/backup・#settings/limit・#settings/targets・#settings/goal・#settings/answer で該当のカードへ移動する
// (ホームのお知らせ・学習計画などから使う)
window.Views = window.Views || {};
window.Views.settings = (function () {
  const PREFIX = `shojikiLearn.v1.`;

  // このアプリが使う保存キーと、読み込むときに確かめる値の形
  // (これ以外のキーは読み込まない。別のJSONを選んでも学習データが消えないように。形が違う値は読み込まずに知らせる)
  // object: {…} / array: […] / number: 数値 / boolean: true・false / string: 文字列 / null を許すものは |null
  const KEY_TYPES = {
    activityLog: `object`, autoQuizStats: `object`, basicsProgress: `object`, bookmarks: `object`, calcInputs: `object`,
    flashcards: `object`, oxStats: `object`, quizHistory: `object`, srsCards: `object`, roadmap: `object`,
    oxPrefs: `object`, quizPrefs: `object`, reviewNewToday: `object`, onboardingDone: `object`, learnerProfile: `object`,
    quizRetry: `object`, quizRetryToday: `object`,
    // v12: 解答の記録・自信なし・学習時間・目標・バッジ・各機能の設定
    answerDaily: `object`, quizUnsure: `object`, studyTime: `object`, dailyGoal: `object`, goalDays: `object`, badges: `object`,
    drillStats: `object`, answerPrefs: `object`, predictPrefs: `object`, planPrefs: `object`,
    examSession: `object|null`, examRetryResult: `object|null`,
    examHistory: `array`, examTargets: `array`,
    reviewNewLimit: `number`, ttsRate: `number`, lastBackupAt: `number`, backupNoteDismissedAt: `number`,
    installNoteDismissedAt: `number`, schemaVersion: `number`,
    srsMigrated: `boolean`, seenReviewTip: `boolean|number|string`,
    lastTopic: `string`, themePreference: `string`, seenWhatsNew: `string`, glossaryMode: `string`, audience: `string`,
  };
  const KNOWN_KEYS = new Set(Object.keys(KEY_TYPES));
  // バックアップに入れないキー(学習時間を数えているタブの印。別の端末・あとで読み込んでも意味がない)
  const NO_BACKUP = new Set([`studyTimeLock`]);
  const esc = (s) => UI.escapeHtml(s);

  // カードの見出し(v3): 左に丸いステッカー(色の面+白いアイコン。飾りなので読み上げない)。cls: sticker-gold など
  function cardTitle(icon, text, cls) {
    return `<h3 class="settings-card-title"><span class="sticker sticker-sm${cls ? ` ${cls}` : ``}" aria-hidden="true">${UI.icon(icon, { size: 18 })}</span><span>${text}</span></h3>`;
  }

  function typeOk(key, v) {
    const types = (KEY_TYPES[key] || ``).split(`|`);
    return types.some((t) => {
      if (t === `null`) return v === null;
      if (t === `object`) return Storage.isPlainObject(v);
      if (t === `array`) return Array.isArray(v);
      if (t === `number`) return typeof v === `number` && Number.isFinite(v);
      if (t === `boolean`) return typeof v === `boolean`;
      if (t === `string`) return typeof v === `string`;
      return false;
    });
  }

  // ===== 学ぶ目的(初回ガイドで選んだもの。ホームのおすすめ・トピックの並びに使う) =====
  const GOALS = [
    { id: `takken`, icon: `target`, title: `宅建士試験に合格したい`, desc: `4択・○×・本番形式の模擬試験で対策` },
    { id: `life`, icon: `home`, title: `暮らしや取引に役立てたい`, desc: `部屋を借りる・家を買う・売る・相続する前に` },
    { id: `work`, icon: `briefcase`, title: `仕事で使いたい`, desc: `不動産・金融・保険・士業などの基礎として` },
    { id: `zeirishi`, icon: `receipt`, title: `税理士試験(消費税法など)の対策`, desc: `不動産と消費税・不動産の税金` },
  ];
  const INTERESTS = [
    { id: `rent`, label: `借りる(賃貸)` },
    { id: `buy`, label: `買う(購入・ローン)` },
    { id: `sell`, label: `売る` },
    { id: `inherit`, label: `相続する` },
    { id: `landlord`, label: `貸す(大家)` },
    { id: `trouble`, label: `トラブルを避けたい` },
  ];
  // 気になるテーマを選べる目的
  const INTEREST_GOALS = [`life`, `work`];

  function interestOptions() {
    const map = window.Stats && Stats.INTEREST_TOPICS;
    return map && typeof map === `object` ? INTERESTS.filter((i) => Object.prototype.hasOwnProperty.call(map, i.id)) : INTERESTS;
  }

  function readProfile() {
    if (window.Stats && typeof Stats.getProfile === `function`) {
      try { return Stats.getProfile(); } catch (e) { /* 下で直接読む */ }
    }
    const p = Storage.get(`learnerProfile`, null);
    if (!Storage.isPlainObject(p) || !GOALS.some((g) => g.id === p.goal)) return null;
    const ids = INTERESTS.map((i) => i.id);
    return { goal: p.goal, interests: Array.isArray(p.interests) ? p.interests.filter((x, i, a) => ids.includes(x) && a.indexOf(x) === i) : [], at: Number(p.at) || 0 };
  }

  function saveProfile(goal, interests) {
    Storage.set(`learnerProfile`, { goal, interests: interests.slice(), at: Date.now() });
    window.dispatchEvent(new CustomEvent(`profile:change`, { detail: { goal, interests: interests.slice() } }));
  }

  function profileCardHtml(profile) {
    const goal = profile ? profile.goal : null;
    const interests = profile ? profile.interests || [] : [];
    return `
      <div class="card settings-card" data-role="profile-card">
        ${cardTitle(`target`, `学ぶ目的`)}
        <p class="view-desc">選んだ目的に合わせて、ホームのおすすめとトピックの並びが変わります。</p>
        <fieldset class="profile-goals" data-role="goals">
          <legend class="sr-only">何のために学びますか</legend>
          ${GOALS.map((g) => `
          <label class="profile-option">
            <input type="radio" name="settings-goal" value="${g.id}"${g.id === goal ? ` checked` : ``}>
            <span class="profile-option-icon">${UI.icon(g.icon)}</span>
            <span class="profile-option-main"><span class="profile-option-title">${g.title}</span><span class="profile-option-desc">${g.desc}</span></span>
            <span class="profile-option-check" aria-hidden="true">${UI.icon(`check`)}</span>
          </label>`).join(``)}
        </fieldset>
        <div class="profile-interests" data-role="interests"${INTEREST_GOALS.includes(goal) ? `` : ` hidden`}>
          <p class="profile-interests-title" id="settings-interests-title">気になるテーマ</p>
          <p class="profile-interests-desc">いくつでも選べます。選んだテーマから先に出題します。</p>
          <div class="chip-row" role="group" aria-labelledby="settings-interests-title">
            ${interestOptions().map((it) => `<button type="button" class="chip" data-interest="${it.id}" aria-pressed="${interests.includes(it.id)}">${it.label}</button>`).join(``)}
          </div>
        </div>
        <p class="profile-note" data-role="profile-note">${goal ? `` : `まだ選ばれていません。選ぶと、ホームのおすすめが目的に合わせて変わります。`}</p>
      </div>`;
  }

  function bindProfileCard(card) {
    const interestsBox = card.querySelector(`[data-role="interests"]`);
    const note = card.querySelector(`[data-role="profile-note"]`);
    const current = () => readProfile() || { goal: null, interests: [] };
    function paintNote(goal) {
      const needsDate = (goal === `takken` || goal === `zeirishi`) && window.Stats && Stats.listTargets && !Stats.listTargets().length;
      note.textContent = !goal ? `まだ選ばれていません。選ぶと、ホームのおすすめが目的に合わせて変わります。`
        : needsDate ? `下の「目標の試験」で試験日を登録すると、ホームに残り日数と学習ペースが表示されます。` : ``;
      note.hidden = !note.textContent;
    }
    card.querySelectorAll(`input[name="settings-goal"]`).forEach((input) => {
      input.addEventListener(`change`, () => {
        if (!input.checked) return;
        const p = current();
        saveProfile(input.value, p.interests || []);
        interestsBox.hidden = !INTEREST_GOALS.includes(input.value);
        paintNote(input.value);
      });
    });
    interestsBox.addEventListener(`click`, (e) => {
      const chip = e.target.closest(`[data-interest]`);
      if (!chip) return;
      const p = current();
      if (!p.goal) return;
      const on = chip.getAttribute(`aria-pressed`) !== `true`;
      const set = new Set(p.interests || []);
      if (on) set.add(chip.dataset.interest); else set.delete(chip.dataset.interest);
      // 選んだ順ではなく、表示の順で保存する(おすすめの順番がタップの順で変わらないように)
      saveProfile(p.goal, INTERESTS.map((i) => i.id).filter((id) => set.has(id)));
      chip.setAttribute(`aria-pressed`, String(on));
    });
    paintNote(current().goal);
    // 試験日の登録・削除のあとに案内を合わせる
    return { refresh: () => paintNote(current().goal) };
  }

  // forBackup: バックアップに書き出すとき(NO_BACKUP のキーは入れない)。読み込みに失敗したときの戻し用には全部控える
  function collectAllData(forBackup) {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && !(forBackup && NO_BACKUP.has(key.slice(PREFIX.length)))) {
        try {
          data[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key));
        } catch (e) { /* 壊れた値はスキップ */ }
      }
    }
    // 容量がいっぱいで保存できていない記録も、バックアップには入れる(画面下のお知らせの「バックアップ」から取ったときに欠けないように)
    if (forBackup && typeof Storage.unsaved === `function`) {
      const pending = Storage.unsaved();
      Object.keys(pending).forEach((k) => { if (!NO_BACKUP.has(k) && KNOWN_KEYS.has(k)) data[k] = pending[k]; });
    }
    return data;
  }

  // 「最終バックアップ: 10/1(10日前)」
  function backupStatusText() {
    const ts = Storage.get(`lastBackupAt`, 0);
    if (typeof ts !== `number` || !Number.isFinite(ts) || ts <= 0 || ts > 8.64e15) return `まだバックアップしていません`;
    const d = new Date(ts);
    const now = new Date();
    const ago = DateUtil.diffDays(DateUtil.format(d), DateUtil.format(now));
    const md = `${d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}/` : ``}${d.getMonth() + 1}/${d.getDate()}`;
    return `最終バックアップ: ${md}(${ago <= 0 ? `今日` : `${ago}日前`})`;
  }

  // 「保存している記録: 約 120 KB」
  function usageText() {
    if (!Storage.usageBytes) return ``;
    const kb = Storage.usageBytes() / 1024;
    return `保存している記録: 約 ${kb < 10 ? Math.max(0.1, Math.round(kb * 10) / 10) : Math.round(kb).toLocaleString(`ja-JP`)} KB`;
  }

  // バックアップのファイル名・目印に使う名前(以前のファイルも読み込める)
  function backupSlug() {
    return (window.SITE && SITE.backupSlug) || `fudomana`;
  }

  // 読み上げ速度の表示(0.95 → 0.95、1 → 1.0)
  function rateLabel(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return `1.0`;
    const s = n.toFixed(2);
    return s.endsWith(`0`) ? s.slice(0, -1) : s;
  }

  // ボタンの組(.segmented)。押下状態は aria-pressed で表す
  function segmentedHtml(label, items) {
    return `<div class="segmented settings-seg" role="group" aria-label="${esc(label)}">${items.map((it) => `
      <button type="button" class="segmented-item" data-value="${esc(it.value)}" aria-pressed="${it.pressed ? `true` : `false`}">${it.html}</button>`).join(``)}</div>`;
  }

  function paintSegmented(group, value) {
    group.querySelectorAll(`.segmented-item`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.value === String(value))));
  }

  // ===== 1日の目標(js/goals.js。ホームの「今日の学習」のリングの目標) =====
  // 回数 = 4択・○×・用語カードなどの学習の回数(今までのリングと同じ数え方)、分 = 学習時間
  const GOAL_KINDS = [
    { id: `actions`, label: `回数`, unit: `回`, def: 10 },
    { id: `minutes`, label: `学習時間(分)`, unit: `分`, def: 30 },
  ];
  const goalKind = (id) => GOAL_KINDS.find((k) => k.id === id) || GOAL_KINDS[0];

  function goalCardHtml() {
    return `
      <div class="card settings-card" data-role="goal-card">
        ${cardTitle(`flame-fill`, `1日の目標`, `sticker-gold`)}
        <p class="view-desc">ホームの「今日の学習」のリングの目標です。学習の回数(4択・○×・用語カードなど)か、学習時間(分)で決められます。達成した日は記録され、バッジにも数えます。</p>
        <div data-role="goal-kind"></div>
        <form class="settings-goal-form" data-role="goal-form" novalidate>
          <div class="field settings-goal-field">
            <label for="settings-goal-value">1日の目標</label>
            <span class="settings-goal-input">
              <input class="field-input" type="number" id="settings-goal-value" data-role="goal-value" inputmode="numeric" step="1" required aria-describedby="settings-goal-range settings-goal-msg">
              <span data-role="goal-unit" aria-hidden="true">回</span>
            </span>
          </div>
          <button type="submit" class="btn">${UI.icon(`check`, { size: 18 })}保存する</button>
        </form>
        <p class="settings-goal-range" id="settings-goal-range" data-role="goal-range"></p>
        <p class="settings-goal-msg" id="settings-goal-msg" data-role="goal-msg" role="status"></p>
        <p class="settings-goal-now" data-role="goal-now"></p>
      </div>`;
  }

  function bindGoalCard(card) {
    if (!card) return;
    if (!window.Goals || typeof Goals.get !== `function` || !Goals.RANGE) { card.remove(); return; }
    const kindBox = card.querySelector(`[data-role="goal-kind"]`);
    const form = card.querySelector(`[data-role="goal-form"]`);
    const input = card.querySelector(`[data-role="goal-value"]`);
    const unitEl = card.querySelector(`[data-role="goal-unit"]`);
    const rangeEl = card.querySelector(`[data-role="goal-range"]`);
    const msgEl = card.querySelector(`[data-role="goal-msg"]`);
    const nowEl = card.querySelector(`[data-role="goal-now"]`);
    let kind = Goals.get().kind;
    kindBox.innerHTML = segmentedHtml(`目標の決め方`, GOAL_KINDS.map((k) => ({ value: k.id, pressed: k.id === kind, html: k.label })));
    const group = kindBox.querySelector(`.segmented`);
    group.classList.add(`settings-goal-kind`);

    function setMsg(text, state) {
      msgEl.textContent = text || ``;
      msgEl.classList.toggle(`is-ng`, state === `ng`);
      msgEl.classList.toggle(`is-ok`, state === `ok`);
      if (state === `ng`) input.setAttribute(`aria-invalid`, `true`);
      else input.removeAttribute(`aria-invalid`);
    }
    // 決め方を切り替えたら、その決め方の保存済みの値(なければ標準の値)を入れる
    function paintKind() {
      const k = goalKind(kind);
      const r = Goals.RANGE[kind];
      const g = Goals.get();
      input.min = String(r.min);
      input.max = String(r.max);
      input.value = String(g.kind === kind ? g.value : k.def);
      unitEl.textContent = k.unit;
      rangeEl.textContent = `${r.min}〜${r.max}${k.unit}の整数で決められます(単位: ${k.unit})`;
      paintSegmented(group, kind);
    }
    function paintNow() {
      let t = null;
      try { t = Goals.today(); } catch (e) { t = null; }
      if (!t) { nowEl.textContent = ``; return; }
      const u = goalKind(t.kind).unit;
      nowEl.textContent = `今の目標: 1日${t.value}${u}・今日は${t.done}${u}${t.met ? `(達成)` : ``}`;
    }
    group.addEventListener(`click`, (e) => {
      const b = e.target.closest(`.segmented-item`);
      if (!b || b.dataset.value === kind) return;
      kind = b.dataset.value;
      paintKind();
      setMsg(kind === Goals.get().kind ? `` : `「保存する」を押すと目標が変わります`, null);
    });
    input.addEventListener(`input`, () => { if (input.getAttribute(`aria-invalid`) === `true`) setMsg(``, null); });
    form.addEventListener(`submit`, (e) => {
      e.preventDefault();
      const k = goalKind(kind);
      const r = Goals.RANGE[kind];
      const raw = String(input.value || ``).trim();
      const n = Number(raw);
      const range = `${r.min}〜${r.max}${k.unit}`;
      let err = ``;
      if (input.validity && input.validity.badInput) err = `数字で入力してください(${range})`;
      else if (!raw) err = `目標を入力してください(${range})`;
      else if (!Number.isInteger(n)) err = `整数で入力してください(${range})`;
      else if (n < r.min || n > r.max) err = `${range}の範囲で入力してください`;
      if (err) { setMsg(err, `ng`); input.focus(); return; }
      const saved = Goals.set({ kind, value: n });
      if (!saved) { setMsg(`保存できませんでした。もう一度お試しください`, `ng`); return; }
      input.value = String(saved.value);
      setMsg(`保存しました。ホームのリングは「1日${saved.value}${goalKind(saved.kind).unit}」になります`, `ok`);
      paintNow();
    });
    paintKind();
    paintNow();
  }

  // ===== 問題の解き方(answerPrefs: AIに聞く) =====
  function aiButtonOn() {
    if (window.AskAi && typeof AskAi.enabled === `function`) return AskAi.enabled();
    const p = Storage.get(`answerPrefs`, null);
    return !(Storage.isPlainObject(p) && p.aiButton === false);
  }

  function answerCardHtml() {
    return `
      <div class="card settings-card" data-role="answer-card">
        ${cardTitle(`pencil-check`, `問題の解き方`)}
        <div class="settings-answer-opts">
          <label class="check-inline"><input type="checkbox" data-role="ai-button" aria-describedby="settings-ai-help"${aiButtonOn() ? ` checked` : ``}>解説に「AIに聞く」ボタンを出す</label>
          <p class="settings-answer-help" id="settings-ai-help">4択・○×・模擬試験の結果で、問題・自分の答え・解説をまとめた質問文をコピーし、ChatGPT・Claude・Gemini に貼り付けて質問できます。アプリからAIのサービスには何も送信しません。</p>
        </div>
        <p class="settings-answer-help settings-answer-note">○×一問一答で「自信度も答える(もちろん/たぶん)」は、<a href="#ox">○×一問一答</a>の出題の条件で切り替えられます。</p>
      </div>`;
  }

  function bindAnswerCard(card) {
    if (!card) return;
    const cb = card.querySelector(`[data-role="ai-button"]`);
    cb.addEventListener(`change`, () => {
      if (window.AskAi && typeof AskAi.setEnabled === `function`) AskAi.setEnabled(cb.checked);
      else {
        const p = Storage.get(`answerPrefs`, null);
        Storage.set(`answerPrefs`, Object.assign({}, Storage.isPlainObject(p) ? p : {}, { aiButton: cb.checked }));
      }
      UI.toast(cb.checked ? `「AIに聞く」ボタンを表示します` : `「AIに聞く」ボタンを表示しません`, `success`);
    });
  }

  function render(root, param) {
    const ttsSupported = !!(window.TTS && TTS.supported);
    const wrap = document.createElement(`div`);
    wrap.className = `view settings-view`;
    wrap.innerHTML = `
      <h2>設定</h2>
      <p class="view-desc settings-intro"><span class="sticker sticker-sm" aria-hidden="true">${UI.icon(`shield`, { size: 18 })}</span><span>学習の記録(記憶済みの用語・解いた問題・復習の予定など)は、この端末のブラウザの中にだけ保存されています。Safariで長期間開かないと記録が消えることがあります。ホーム画面に追加するか、定期的にバックアップを取ってください。</span></p>

      ${profileCardHtml(readProfile())}

      <div class="card settings-card" data-role="targets-card">
        ${cardTitle(`calendar`, `目標の試験`)}
        <p class="view-desc">登録した試験日までの残り日数と1日あたりの学習量の目安がホームに表示されます。★を付けた試験がホームに大きく表示されます(終了した試験は、次の試験に切り替わります)。試験名をタップすると編集できます。</p>
        <div class="target-list" data-role="target-list"></div>
        <button type="button" class="btn" data-role="add-target">${UI.icon(`calendar`)}試験日を登録</button>
      </div>

      ${goalCardHtml()}

      <div class="card settings-card" data-role="limit-card">
        ${cardTitle(`repeat`, `今日の復習`)}
        <p class="view-desc">「今日の復習」で1日に出す新しい用語の数です。期限が来た復習はこの数に関係なくすべて出題されます。</p>
        <div data-role="new-limit"></div>
      </div>

      ${answerCardHtml()}

      <div class="card settings-card">
        ${cardTitle(`moon`, `テーマ`)}
        <p class="view-desc">配色を手動で切り替えられます(既定は端末の設定に追従します)。</p>
        <div data-role="theme"></div>
      </div>

      ${ttsSupported ? `
      <div class="card settings-card">
        ${cardTitle(`volume`, `読み上げ`)}
        <p class="view-desc">用語カードの読み上げ速度を調整できます。</p>
        <label class="settings-range-label">
          <span>速度: <span data-role="rate-value">1.0</span>倍</span>
          <input type="range" min="${TTS.MIN_RATE || 0.6}" max="${TTS.MAX_RATE || 1.4}" step="0.05" data-role="rate-input" class="settings-range">
        </label>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary" data-role="rate-test">${UI.icon(`play`)}試しに聞く</button>
        </div>
      </div>` : ``}

      <div class="card settings-card" data-role="backup-card">
        ${cardTitle(`download`, `エクスポート(バックアップ)`)}
        <p class="view-desc">現在の学習データを1つのJSONファイルとして保存します。別の端末への移行や、記録が消えたときの復元に使えます。</p>
        <p class="settings-backup-status" data-role="backup-status">${esc(backupStatusText())}</p>
        <p class="settings-protect" data-role="protect" hidden>
          <span class="settings-protect-text" data-role="protect-text"></span>
          <button type="button" class="link-btn" data-role="protect-btn" hidden>保護を有効にする</button>
        </p>
        <button type="button" class="btn" data-role="export">${UI.icon(`download`)}学習データをエクスポート</button>
        <p class="settings-usage" data-role="usage">${esc(usageText())}</p>
      </div>

      <div class="card settings-card">
        ${cardTitle(`upload`, `インポート(復元・移行)`)}
        <p class="view-desc">エクスポートしたJSONファイルを選択すると、現在のデータを上書きして復元します。読み込んだあとは自動で再読み込みします。</p>
        <input type="file" accept="application/json,.json" data-role="import-file" id="settings-import-file" class="settings-file-input sr-only">
        <label for="settings-import-file" class="btn btn-secondary settings-file-label">${UI.icon(`upload`)}バックアップ(JSON)を選択</label>
        <div class="settings-import-status" data-role="import-status" hidden></div>
      </div>
    `;
    root.appendChild(wrap);

    // ---- 学ぶ目的 ----
    const profileCard = bindProfileCard(wrap.querySelector(`[data-role="profile-card"]`));

    // ---- 目標の試験 ----
    const targetList = wrap.querySelector(`[data-role="target-list"]`);
    const addBtn = wrap.querySelector(`[data-role="add-target"]`);
    function renderTargets(focusSel) {
      const targets = Stats.listTargets().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!targets.length) {
        targetList.innerHTML = `<p class="calc-note target-empty">まだ登録されていません。</p>`;
      } else {
        const today = DateUtil.today();
        const shown = Stats.primaryTarget();
        const flagged = targets.find((t) => t.primary) || null;
        targetList.innerHTML = targets.map((t) => {
          const d = DateUtil.diffDays(today, t.date);
          const type = Stats.examType(t.examTypeId);
          const onHome = !!(shown && shown.id === t.id);
          // 公式発表の前の試験日(令和9年度など)は、日付に必ず「見込み」と添える
          const tentative = t.tentative === true;
          const starLabel = t.primary ? (onHome ? `ホームに表示中` : `ホームに表示に指定(終了したため、ホームには次の試験を表示中)`) : `ホームに表示する`;
          return `
            <div class="target-row${onHome ? ` is-home` : ``}">
              <button type="button" class="btn btn-icon known-toggle${t.primary ? ` is-known` : ``}" data-primary="${esc(t.id)}" aria-pressed="${!!t.primary}" aria-label="${esc(`${t.name}: ${starLabel}`)}">${UI.icon(t.primary ? `star-fill` : `star`)}</button>
              <button type="button" class="target-row-main target-row-edit" data-edit="${esc(t.id)}" aria-label="${esc(`「${t.name}」を編集${tentative ? `(試験日は見込み)` : ``}`)}">
                <span class="target-row-name">${esc(t.name)}</span>
                <span class="target-row-tags"><span class="source-tag">${esc(type ? type.shortName : `その他`)}</span>${tentative ? `<span class="source-tag target-tentative-tag">見込み</span>` : ``}${onHome ? `<span class="source-tag target-home-tag">ホームに表示中</span>` : ``}</span>
                <span class="target-row-date"><span class="nowrap">${DateUtil.toJapanese(t.date, true)}</span>${tentative ? `<span class="nowrap">(見込み)</span>` : ``}・<span class="nowrap">${d > 0 ? `あと${d}日` : d === 0 ? `今日` : `終了`}</span></span>
                <span class="target-row-hint" aria-hidden="true">${UI.icon(`chevron-right`, { size: 18 })}</span>
              </button>
              <button type="button" class="btn btn-icon" data-remove="${esc(t.id)}" aria-label="${esc(`「${t.name}」を削除`)}">${UI.icon(`trash`)}</button>
            </div>`;
        }).join(``) + (flagged && shown && flagged.id !== shown.id
          ? `<p class="calc-note target-empty">★の「${esc(flagged.name)}」は終了したため、ホームには次の「${esc(shown.name)}」を表示しています。</p>`
          : ``);
      }
      if (focusSel) {
        const el = focusSel === `add` ? addBtn : targetList.querySelector(focusSel);
        if (el) el.focus({ preventScroll: true });
      }
      // 試験日の登録の有無で「学ぶ目的」の案内が変わる
      profileCard.refresh();
    }
    // 行は作り直すため、操作した行のボタンにフォーカスを戻す(イベントは一覧にまとめて付ける)
    targetList.addEventListener(`click`, async (e) => {
      const star = e.target.closest(`[data-primary]`);
      const edit = e.target.closest(`[data-edit]`);
      const del = e.target.closest(`[data-remove]`);
      if (star) {
        const id = star.dataset.primary;
        Stats.setPrimary(id);
        renderTargets(`[data-primary="${CSS.escape(id)}"]`);
      } else if (edit) {
        const id = edit.dataset.edit;
        const t = Stats.listTargets().find((x) => x.id === id);
        if (t) Views.home.openTargetForm(() => renderTargets(`[data-edit="${CSS.escape(id)}"]`), t);
      } else if (del) {
        const ok = await UI.confirm(`この試験目標を削除しますか?`, { confirmLabel: `削除する`, danger: true });
        if (!ok || !wrap.isConnected) return;
        Stats.removeTarget(del.dataset.remove);
        renderTargets(`add`);
      }
    });
    renderTargets();
    addBtn.addEventListener(`click`, () => Views.home.openTargetForm(() => renderTargets()));

    // ---- 1日の目標・問題の解き方 ----
    bindGoalCard(wrap.querySelector(`[data-role="goal-card"]`));
    bindAnswerCard(wrap.querySelector(`[data-role="answer-card"]`));

    // ---- 1日の新規用語数 ----
    const limitBox = wrap.querySelector(`[data-role="new-limit"]`);
    const defaultLimit = (Views.review && Views.review.DEFAULT_NEW_LIMIT) || 10;
    const currentLimit = Stats.newLimit ? Stats.newLimit() : defaultLimit;
    const presets = [0, 5, 10, 20, 30];
    const limitItems = presets.map((n) => ({
      value: n,
      pressed: n === currentLimit,
      html: n === 0 ? `出さない` : `${n}語${n === defaultLimit ? `<span class="segmented-count">標準</span>` : ``}`,
    }));
    // 読み込んだバックアップなどで選択肢にない値(15語など)のときも、今の設定が分かるように
    if (!presets.includes(currentLimit)) limitItems.push({ value: currentLimit, pressed: true, html: `${currentLimit}語<span class="segmented-count">現在</span>`, custom: true });
    limitBox.innerHTML = segmentedHtml(`1日の新しい用語の数`, limitItems);
    const limitGroup = limitBox.querySelector(`.segmented`);
    limitGroup.classList.add(`settings-limit-seg`);
    limitGroup.addEventListener(`click`, (e) => {
      const b = e.target.closest(`.segmented-item`);
      if (!b) return;
      const n = Number(b.dataset.value);
      Storage.set(`reviewNewLimit`, n);
      // 選択肢にない値を選び直したら、その「現在」ボタンは外す(押したボタン以外なのでフォーカスは動かない)
      if (!presets.includes(n)) return paintSegmented(limitGroup, n);
      limitGroup.querySelectorAll(`.segmented-item`).forEach((x) => { if (!presets.includes(Number(x.dataset.value))) x.remove(); });
      paintSegmented(limitGroup, n);
      if (window.Nav) Nav.refreshBadge();
    });

    // ---- テーマ ----
    const themeBox = wrap.querySelector(`[data-role="theme"]`);
    const themeOptions = [{ id: `system`, label: `端末に合わせる` }, { id: `light`, label: `ライト` }, { id: `dark`, label: `ダーク` }];
    themeBox.innerHTML = segmentedHtml(`テーマ`, themeOptions.map((o) => ({ value: o.id, pressed: o.id === ThemeManager.getPreference(), html: o.label })));
    const themeGroup = themeBox.querySelector(`.segmented`);
    themeGroup.addEventListener(`click`, (e) => {
      const b = e.target.closest(`.segmented-item`);
      if (!b) return;
      ThemeManager.setPreference(b.dataset.value);
      paintSegmented(themeGroup, ThemeManager.getPreference());
    });
    // ヘッダーの切替ボタンで変えたときも押下状態を合わせる
    const offTheme = ThemeManager.onChange(() => {
      if (!wrap.isConnected) { if (offTheme) offTheme(); return; }
      paintSegmented(themeGroup, ThemeManager.getPreference());
    });
    // 画面を離れたら監視を外す(テーマを切り替えるまで古い画面が残らないように)
    if (UI.onLeave) UI.onLeave(wrap, () => { if (offTheme) offTheme(); });

    // ---- 読み上げ速度 ----
    if (ttsSupported) {
      const rateInput = wrap.querySelector(`[data-role="rate-input"]`);
      const rateValue = wrap.querySelector(`[data-role="rate-value"]`);
      const rate = TTS.getRate ? TTS.getRate() : 1;
      rateInput.value = typeof rate === `number` && Number.isFinite(rate) ? String(rate) : `1`;
      // スライダーは刻みに丸められるため、表示は丸めたあとの値から作る
      rateValue.textContent = rateLabel(rateInput.value);
      rateInput.addEventListener(`input`, () => {
        const v = Number(rateInput.value);
        rateValue.textContent = rateLabel(v);
        Storage.set(`ttsRate`, v);
      });
      wrap.querySelector(`[data-role="rate-test"]`).addEventListener(`click`, () => {
        TTS.speak(`この速さで読み上げます。用語カードの説明も同じ速さになります。`);
      });
    }

    // ---- 記録の保護(ブラウザが自動で消さない設定になっているか) ----
    const protectEl = wrap.querySelector(`[data-role="protect"]`);
    const protectText = wrap.querySelector(`[data-role="protect-text"]`);
    const protectBtn = wrap.querySelector(`[data-role="protect-btn"]`);
    const sm = navigator.storage;
    function paintProtect() {
      if (!sm || typeof sm.persisted !== `function`) return;
      sm.persisted().then((on) => {
        if (!wrap.isConnected) return;
        protectEl.hidden = false;
        protectEl.classList.toggle(`is-on`, !!on);
        protectText.innerHTML = `${UI.icon(on ? `shield` : `info`, { size: 16 })}<span>記録の保護: ${on ? `有効(ブラウザが自動で消さない設定です)` : `未設定(長く開かないと消えることがあります)`}</span>`;
        protectBtn.hidden = !!on || typeof sm.persist !== `function`;
      }).catch(() => { /* 分からなければ表示しない */ });
    }
    protectBtn.addEventListener(`click`, () => {
      sm.persist().then((ok) => {
        paintProtect();
        if (ok) UI.toast(`記録の保護を有効にしました`, `success`);
        else UI.toast(`ブラウザが保護を許可しませんでした。ホーム画面に追加するか、定期的にバックアップを取ってください`, `default`, { duration: 6000 });
      }).catch(() => UI.toast(`記録の保護を設定できませんでした`, `error`));
    });
    paintProtect();

    // ---- エクスポート ----
    const backupStatus = wrap.querySelector(`[data-role="backup-status"]`);
    const usageEl = wrap.querySelector(`[data-role="usage"]`);
    function afterBackup(msg) {
      if (!wrap.isConnected) return;
      backupStatus.textContent = backupStatusText();
      usageEl.textContent = usageText();
      UI.toast(msg, `success`);
    }
    function download(json, name) {
      const blob = new Blob([json], { type: `application/json` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement(`a`);
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // iPhoneのSafariではすぐに解放するとダウンロードが失敗することがあるため、少し待ってから解放する
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    // iPhone・iPad では共有シートで保存する(「ファイルに保存」でファイルアプリへ。ホーム画面のアプリでも使える)
    function tryShare(json, name, prevBackupAt) {
      if (!Storage.isIos || !Storage.isIos() || typeof File !== `function` || !navigator.canShare || !navigator.share) return false;
      let file = null;
      try {
        file = new File([json], name, { type: `application/json` });
        if (!navigator.canShare({ files: [file] })) return false;
      } catch (e) { return false; }
      navigator.share({ files: [file], title: `学習データのバックアップ` })
        .then(() => afterBackup(`バックアップを保存しました`))
        .catch((err) => {
          if (err && err.name === `AbortError`) {
            // 利用者が閉じた: バックアップしたことにしない
            if (typeof prevBackupAt === `number`) Storage.set(`lastBackupAt`, prevBackupAt);
            else Storage.remove(`lastBackupAt`);
            return;
          }
          download(json, name);
          afterBackup(`バックアップをダウンロードしました`);
        });
      return true;
    }
    wrap.querySelector(`[data-role="export"]`).addEventListener(`click`, () => {
      // バックアップした日時もファイルに含める(読み込んだ端末でも「最終バックアップ」が正しく出るように)
      const prevBackupAt = Storage.get(`lastBackupAt`, null);
      Storage.set(`lastBackupAt`, Date.now());
      // __app: このアプリのバックアップであることの目印と、データの版(読み込み時に新しすぎる版を断る)
      const app = { name: backupSlug(), schema: Storage.SCHEMA || 1, exportedAt: new Date().toISOString() };
      if (window.SITE && SITE.version) app.version = SITE.version;
      const json = JSON.stringify(Object.assign({ __app: app }, collectAllData(true)), null, 2);
      const name = `${backupSlug()}-backup-${DateUtil.today()}.json`;
      if (tryShare(json, name, prevBackupAt)) return;
      download(json, name);
      afterBackup(`バックアップをダウンロードしました`);
    });

    // ---- インポート ----
    const importInput = wrap.querySelector(`[data-role="import-file"]`);
    const importStatus = wrap.querySelector(`[data-role="import-status"]`);
    function showImportStatus(ok, text) {
      importStatus.hidden = false;
      importStatus.className = `settings-import-status ${ok ? `settings-import-ok` : `settings-import-ng`}`;
      importStatus.textContent = text;
    }
    const IMPORT_ERRORS = {
      notbackup: `このアプリのバックアップファイルではないため、読み込みませんでした(データは変更していません)。`,
      newer: `このバックアップは新しい版のアプリで作られています。ページを再読み込みして最新版にしてから、もう一度読み込んでください。`,
      broken: `バックアップファイルの内容が壊れているため、読み込みませんでした(データは変更していません)。`,
      write: `保存に失敗したため、元のデータに戻しました。このサイト用の保存容量がいっぱいの可能性があります。`,
    };
    importInput.addEventListener(`change`, (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Storage.isPlainObject(parsed)) throw new Error(`invalid`);
          // 新しい版のアプリで作ったバックアップは、形が変わっているかもしれないため読み込まない
          const app = Storage.isPlainObject(parsed.__app) ? parsed.__app : null;
          if (app && Number(app.schema) > (Storage.SCHEMA || 1)) throw new Error(`newer`);
          const known = Object.keys(parsed).filter((k) => KNOWN_KEYS.has(k));
          // このアプリのバックアップでなければ何も変更しない
          if (!known.length) throw new Error(`notbackup`);
          // 値が null のキーは「記録なし」として扱う。形が違う値は読み込まない(画面が壊れないように)
          const keys = known.filter((k) => parsed[k] !== null && typeOk(k, parsed[k]));
          const invalid = known.filter((k) => parsed[k] !== null && !typeOk(k, parsed[k])).length;
          if (!keys.length) throw new Error(`broken`);
          const skipped = Object.keys(parsed).length - known.length - (`__app` in parsed ? 1 : 0);
          const notes = `${skipped > 0 ? `(このアプリのものではない${skipped}項目は読み込みません)` : ``}${invalid > 0 ? `(形式が合わない${invalid}項目は読み込みません)` : ``}`;
          const ok = await UI.confirm(`バックアップの${keys.length}項目で、現在の学習データを置き換えます。現在のデータは消えます。よろしいですか?${notes}`, { confirmLabel: `置き換える`, danger: true });
          if (!ok) { importInput.value = ``; return; }
          // 失敗したら元に戻せるよう、現在のデータを控えてから置き換える(テーマ設定は残す)
          const before = collectAllData();
          Object.keys(localStorage)
            .filter((k) => k.startsWith(PREFIX) && k !== `${PREFIX}themePreference` && !keys.includes(k.slice(PREFIX.length)))
            .forEach((k) => Storage.remove(k.slice(PREFIX.length)));
          const failed = keys.filter((k) => !Storage.set(k, parsed[k]));
          if (failed.length) {
            Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => Storage.remove(k.slice(PREFIX.length)));
            Object.keys(before).forEach((k) => Storage.set(k, before[k]));
            keys.forEach((k) => { if (!(k in before)) Storage.remove(k); });
            throw new Error(`write`);
          }
          // 画面・集計・検索の索引をすべて読み込んだデータで作り直すため、自動で再読み込みする(保存データの移行も起動時に行う)
          showImportStatus(true, `インポートが完了しました。再読み込みしています…`);
          const reloadBtn = document.createElement(`button`);
          reloadBtn.type = `button`;
          reloadBtn.className = `btn btn-sm`;
          reloadBtn.textContent = `今すぐ再読み込み`;
          reloadBtn.addEventListener(`click`, () => location.reload());
          importStatus.appendChild(reloadBtn);
          try { sessionStorage.setItem(`importDone`, JSON.stringify({ invalid })); } catch (err) { /* 通知が出ないだけ */ }
          importInput.value = ``;
          setTimeout(() => location.reload(), 900);
        } catch (err) {
          const code = err && err.message;
          showImportStatus(false, IMPORT_ERRORS[code] || `インポートに失敗しました。正しいバックアップファイルか確認してください。`);
          UI.toast(`インポートに失敗しました`, `error`);
          importInput.value = ``;
        }
      };
      reader.readAsText(file);
    });

    // ---- ホームのお知らせなどから: 該当のカードへ ----
    const JUMPS = { profile: `profile-card`, backup: `backup-card`, limit: `limit-card`, targets: `targets-card`, goal: `goal-card`, answer: `answer-card` };
    const jumpEl = param && Object.prototype.hasOwnProperty.call(JUMPS, param) ? wrap.querySelector(`[data-role="${JUMPS[param]}"]`) : null;
    if (jumpEl) {
      requestAnimationFrame(() => {
        jumpEl.scrollIntoView({ block: `start`, behavior: `auto` });
        jumpEl.classList.add(`highlighted`);
        setTimeout(() => jumpEl.classList.remove(`highlighted`), 2400);
      });
    }
  }

  return { render, KNOWN_KEYS };
})();
