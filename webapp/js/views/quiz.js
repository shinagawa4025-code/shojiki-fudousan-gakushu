// クイズビュー: 確認問題(本試験と同じ4択。選択肢ごとの○×の理由・SRS連携) + 自動生成クイズ(トピック絞り込み・苦手優先・根拠法令問題)
// ルート: #quiz / #quiz/<topicId> / #quiz/q/<問題ID> / #quiz/auto / #quiz/auto/<topicId> / #quiz/auto/weak / #quiz/auto/<topicId>/weak
// 戻る・再読み込みで回答の途中から続けられるよう、画面の状態を履歴エントリの state に保存する
//   qState:    { level, topic, status, shown, answered: { 問題ID: 選んだ番号 } }(確認問題)
//   autoState: { level, topic, weak, count, lawOnly, weakOpen, weakIds,
//                questions: [{ termId, type, stem, choices: [{ text, correct }], picked }] }(自動生成クイズ)
// 確認問題の絞り込みと自動生成クイズの問題数は Storage `quizPrefs` にも保存する(タブから開き直しても同じ条件で表示)
// 絞り込み・出題の条件は1行のボタンからシートで選ぶ。回答すると、判定と「次の問題」をカードの最後の回答バー
// (画面の下に固定。スマホでは下部タブの上)に出す
window.Views = window.Views || {};
window.Views.quiz = (function () {
  const ALL = `全て`; // 「すべて」を表す内部ID(保存済みの履歴・QuizEngine と合わせるため値は変えない。表示は「すべて」)
  const LEVELS = [ALL, `超入門`, `初級`, `中級`, `上級`];
  const STATUSES = [`all`, `unanswered`, `ng`, `bookmark`];
  const STATUS_LABELS = { all: `すべて`, unanswered: `未回答`, ng: `苦手`, bookmark: `保存` };
  const STATUS_ICONS = { ng: `x-circle`, bookmark: `bookmark` };
  const AUTO_COUNTS = [5, 10, 20];
  const DEFAULT_AUTO_COUNT = 10;
  const PASS_PCT = 70; // 合格の目安(○×一問一答と共通)
  const PREFS_KEY = `quizPrefs`;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  function getHistory() {
    const h = Storage.get(`quizHistory`, {});
    return h && typeof h === `object` && !Array.isArray(h) ? h : {};
  }

  // ===== 保存する条件(quizPrefs) =====

  function validTopic(id) {
    return id === ALL || (typeof id === `string` && !!AppIndex.topicsById[id]);
  }

  function loadPrefs() {
    const p = Storage.get(PREFS_KEY, {});
    return {
      level: LEVELS.includes(p.level) ? p.level : ALL,
      topic: validTopic(p.topic) ? p.topic : ALL,
      status: STATUSES.includes(p.status) ? p.status : `all`,
      autoCount: AUTO_COUNTS.includes(p.autoCount) ? p.autoCount : DEFAULT_AUTO_COUNT,
    };
  }

  function savePrefs(patch) {
    Storage.set(PREFS_KEY, Object.assign(loadPrefs(), patch));
  }

  // ===== 履歴エントリの state(ここでは window.history を明示する) =====

  function historyState() {
    const st = window.history.state;
    return st && typeof st === `object` ? st : {};
  }

  function patchHistoryState(patch) {
    try {
      window.history.replaceState(Object.assign({}, historyState(), patch), ``);
    } catch (e) { /* Safari の回数制限など。保存できなくても表示には影響しない */ }
  }

  function levelLabel(id) {
    return id === ALL ? `すべて` : id;
  }

  function topicLabel(id) {
    const t = AppIndex.topicsById[id];
    return id === ALL || !t ? `全トピック` : t.name;
  }

  // ===== 入口 =====

  function render(root, param) {
    if (param === `due` || (param && param.startsWith(`due/`))) { renderDue(root, param); return; }
    let startMode = `fixed`;
    let topicParam = null;
    let initialWeak = false;
    let focusQuizId = null;
    if (param === `auto` || (param && param.startsWith(`auto/`))) {
      startMode = `auto`;
      const parts = param === `auto` ? [] : param.slice(`auto/`.length).split(`/`);
      if (parts[0] === `weak`) initialWeak = true;
      else {
        topicParam = parts[0] || null;
        if (parts[1] === `weak`) initialWeak = true;
      }
    } else if (param && param.startsWith(`q/`)) {
      focusQuizId = param.slice(`q/`.length);
    } else if (param) {
      topicParam = param;
    }
    const initialTopic = topicParam && AppIndex.topicsById[topicParam] ? topicParam : ALL;
    const fixedCount = window.APP_DATA.quiz.length;
    // 期限が来た解き直しがあれば、見出しの右に入口を出す
    let dueNow = 0;
    try { dueNow = window.Drill ? Drill.dueCount() : 0; } catch (e) { dueNow = 0; }

    const wrap = document.createElement(`div`);
    wrap.className = `view quiz-view`;
    wrap.innerHTML = `
      <div class="view-head">
        <h2>4択問題</h2>
        ${infoBtnHtml(`4択問題について`)}
        ${dueNow ? `<a class="chip chip-small quiz-due-chip" href="#quiz/due" aria-label="解き直し ${dueNow}問">${ic(`repeat`, 14)}<span>解き直し</span><span class="num">${dueNow}</span></a>` : ``}
      </div>
      <div class="segmented quiz-mode" role="group" aria-label="出題モード" data-role="mode-chips">
        <button type="button" class="segmented-item" data-mode="fixed" aria-pressed="${startMode === `fixed`}">${ic(`list`, 16)}確認問題(${fixedCount}問)</button>
        <button type="button" class="segmented-item" data-mode="auto" aria-pressed="${startMode === `auto`}">${ic(`sparkles`, 16)}自動生成クイズ</button>
      </div>
      <p class="quiz-keys">キーボード: <kbd>1</kbd>〜<kbd>4</kbd> で画面内の問題に回答 / <kbd>Enter</kbd> で次の問題へ</p>
      <div data-role="quiz-body"></div>
    `;
    root.appendChild(wrap);

    const body = wrap.querySelector(`[data-role="quiz-body"]`);
    const ctx = { lastAnswered: null };
    // 画面の説明は ⓘ のシートで(問題を画面の上の方から始めるため)
    wireInfo(wrap, `4択問題について`, `
      <p>確認問題は本試験と同じ4択で、選択肢ごとに○×の理由と根拠条文を確認できます。</p>
      <p>自動生成クイズは用語集から毎回ちがう4択を出題します。</p>
      <p>間違えた問題の用語は「<a href="#review">今日の復習</a>」に自動で追加されます。</p>
      <p>間違えた確認問題は翌日から「<a href="#quiz/due">解き直し</a>」に出ます(1→3→7→21日後。4回続けて正解すると卒業)。</p>
      <p class="view-info-keys">キーボード: <kbd>1</kbd>〜<kbd>4</kbd> で画面内の問題に回答 / <kbd>Enter</kbd> で次の問題へ</p>`);
    // 用語のリンクは画面を離れずにシートで開く(長押し・新しいタブ用に href は残す)
    wrap.addEventListener(`click`, onTermLinkClick);
    bindKeys(wrap, body, ctx);

    wrap.querySelectorAll(`[data-mode]`).forEach((btn) => {
      btn.addEventListener(`click`, () => {
        if (btn.getAttribute(`aria-pressed`) === `true`) return;
        const mode = btn.dataset.mode;
        wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b === btn)));
        // 戻る・再読み込みで同じモードが開くよう、履歴を増やさずにURLを合わせる(state は保ったまま)
        const t = initialTopic !== ALL ? `/${initialTopic}` : ``;
        try { window.history.replaceState(historyState(), ``, mode === `auto` ? `#quiz/auto${t}` : `#quiz${t}`); } catch (e) { /* 無視 */ }
        ctx.lastAnswered = null;
        if (mode === `fixed`) renderFixed(body, initialTopic, null, ctx);
        else renderAuto(body, initialTopic, false, ctx);
      });
    });

    if (startMode === `auto`) renderAuto(body, initialTopic, initialWeak, ctx);
    else renderFixed(body, initialTopic, focusQuizId, ctx);
  }

  // デスクトップのキーボード操作: 1〜4 で画面内の最初の未回答の問題に回答、Enter で次の問題へ
  function bindKeys(wrap, body, ctx) {
    function onKey(e) {
      if (!wrap.isConnected) { document.removeEventListener(`keydown`, onKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      const ae = document.activeElement;
      if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
      if (/^[1-4]$/.test(e.key)) {
        const card = firstUnansweredInView(body);
        const btn = card ? card.querySelectorAll(`.choice-list .choice-btn`)[Number(e.key) - 1] : null;
        if (!btn || btn.disabled) return;
        e.preventDefault();
        btn.click();
        return;
      }
      if (e.key === `Enter`) {
        // ボタンやリンクの上ではブラウザ標準の動作(クリック)に任せる
        if (e.target && e.target.closest && e.target.closest(`button, a, summary, input, select, textarea, [role="button"]`)) return;
        const card = ctx.lastAnswered;
        const next = card && card.isConnected ? card.querySelector(`[data-role="next-q"], [data-role="due-next"]`) : null;
        if (!next) return;
        e.preventDefault();
        next.click();
      }
    }
    document.addEventListener(`keydown`, onKey);
  }

  function firstUnansweredInView(root) {
    const cards = root.querySelectorAll(`.quiz-card:not(.is-answered)`);
    for (const card of cards) {
      const list = card.querySelector(`.choice-list`);
      if (!list) continue;
      const r = list.getBoundingClientRect();
      if (r.top >= window.innerHeight) break;
      if (r.bottom > 0) return card;
    }
    return null;
  }

  // ===== 用語のシート =====

  function topicForTerm(term) {
    const has = (t) => !!t && Array.isArray(t.basicIds) && t.basicIds.includes(term.id);
    return (term.topicIds || []).map((id) => AppIndex.topicsById[id]).find(has) || (window.APP_DATA.topics || []).find(has) || null;
  }

  // 用語の説明をシートで開く(回答した問題の画面を離れずに確認できるように)。開けなければ false
  function openTermSheet(termId) {
    const term = termId ? AppIndex.termsById[termId] : null;
    if (!term || !window.UI || typeof UI.sheet !== `function`) return false;
    const topic = topicForTerm(term);
    const diagrams = window.CardUi ? CardUi.diagramsFor(term.id) : [];
    const content = document.createElement(`div`);
    content.className = `term-sheet`;
    content.innerHTML = `
      <div class="term-sheet-tags">
        <span class="badge badge-${term.level}">${term.level}</span>
        ${topic ? `<span class="source-tag">${esc(topic.name)}</span>` : ``}
      </div>
      <p class="term-simple">${term.simpleExplanation}</p>
      ${window.CardUi && CardUi.deepHtml ? CardUi.deepHtml(term, topic ? topic.id : null)
        : (term.deepDive ? `<p class="term-deep"><strong>${window.CardUi && CardUi.deepDiveLabel ? CardUi.deepDiveLabel(term, topic ? topic.id : null) : `もう一歩踏み込むと`}:</strong> ${term.deepDive}</p>` : ``)}
      ${window.CardUi ? CardUi.buildLawRefHtml(term) + (CardUi.practiceNoteHtml ? CardUi.practiceNoteHtml(term) : ``) + CardUi.buildSourceCitationHtml(term) : ``}
      ${diagrams.length ? `
        <div class="term-sheet-figure">
          <button type="button" class="btn btn-secondary btn-sm" data-role="figure" aria-expanded="false">${ic(`diagram`, 16)}<span>図解を見る</span></button>
          <div data-role="figure-area" hidden></div>
        </div>` : ``}
      <div class="term-sheet-links">
        ${topic ? `<a class="btn btn-secondary btn-sm" href="#topics/${topic.id}/${term.id}">${ic(`book-open`, 16)}トピックで開く</a>` : ``}
        <a class="btn btn-secondary btn-sm" href="#glossary/${term.id}">${ic(`layers`, 16)}用語集で開く</a>
      </div>
      ${window.CardUi && CardUi.itemMetaHtml ? CardUi.itemMetaHtml(term, `#glossary/${encodeURIComponent(term.id)}`) : ``}
    `;
    const figBtn = content.querySelector(`[data-role="figure"]`);
    if (figBtn) {
      // 図解は別のシートを重ねずに、このシートの中に広げる
      figBtn.addEventListener(`click`, () => {
        const area = content.querySelector(`[data-role="figure-area"]`);
        if (!area.innerHTML) area.innerHTML = CardUi.figureHtml(diagrams[0]);
        area.hidden = !area.hidden;
        figBtn.setAttribute(`aria-expanded`, String(!area.hidden));
        figBtn.querySelector(`span`).textContent = area.hidden ? `図解を見る` : `図解を閉じる`;
      });
    }
    UI.sheet({ title: term.name, content });
    return true;
  }

  function termLinkHtml(termId, labelHtml) {
    const term = termId ? AppIndex.termsById[termId] : null;
    if (!term) return ``;
    return `<a class="chip chip-small chip-muted" href="#glossary/${term.id}" data-term-sheet="${term.id}">${ic(`layers`, 14)}${labelHtml || `用語を確認: ${esc(term.name)}`}</a>`;
  }

  function onTermLinkClick(e) {
    const a = e.target && e.target.closest ? e.target.closest(`a[data-term-sheet]`) : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (openTermSheet(a.dataset.termSheet)) e.preventDefault();
  }

  // ===== 共通の部品 =====

  // アイコン名の候補から、定義のある最初のものを使う(未定義のアイコンは警告が出るため)
  function icAny(names, size) {
    const has = (n) => !!(window.Icons && typeof Icons.has === `function` && Icons.has(n));
    const name = names.find(has) || names[names.length - 1];
    return ic(name, size);
  }

  // 見出し横の ⓘ(画面の説明をシートで開く)
  function infoBtnHtml(label) {
    return `<button type="button" class="btn btn-icon view-info-btn" data-role="view-info" aria-label="${esc(label)}" aria-haspopup="dialog">${ic(`info`, 20)}</button>`;
  }

  function wireInfo(root, title, html) {
    const btn = root.querySelector(`[data-role="view-info"]`);
    if (!btn) return;
    btn.addEventListener(`click`, () => UI.sheet({ title, content: `<div class="view-info">${html}</div>` }));
  }

  // 「2026年10月時点の法令に基づく」+「誤りを報告」の1行(報告フォームが未設定なら出さない)
  function reportMetaHtml(o, asOf) {
    const R = window.Report;
    try {
      if (!R || typeof R.enabled !== `function` || !R.enabled()) return ``;
      if (typeof R.metaHtml === `function`) return R.metaHtml(o, { asOf });
      const link = typeof R.linkHtml === `function` ? R.linkHtml(o) : ``;
      return link ? `<p class="item-meta"><span>${esc(typeof R.asOfText === `function` ? R.asOfText(asOf) : ``)}</span>${link}</p>` : ``;
    } catch (e) { return ``; }
  }

  // セッションの終わりに出す「今日 n問・連続 n日目」(n は今日の学習の記録数)
  function streakLineHtml() {
    if (!window.Streak) return ``;
    const log = Storage.get(`activityLog`, {});
    const today = Streak.countOf(log[DateUtil.today()]);
    const days = Streak.getCurrentStreak();
    if (!today && !days) return ``;
    return `<p class="streak-line">${ic(`flame`, 16)}<span>今日 <strong class="num">${today}</strong>問・連続 <strong class="num">${days}</strong>日目</span></p>`;
  }

  function reviewAddedHtml(name) {
    return `<p class="review-added">${ic(`repeat`, 14)}<span>「${esc(name)}」を<a href="#review">今日の復習</a>に追加しました</span></p>`;
  }

  function bookmarkBtnHtml(key) {
    const on = window.Bookmarks && Bookmarks.has(key);
    return `<button type="button" class="btn btn-icon bookmark-toggle${on ? ` is-bookmarked` : ``}" data-role="bookmark" aria-pressed="${!!on}" aria-label="${on ? `ブックマークを外す` : `ブックマークする`}">${ic(on ? `bookmark-fill` : `bookmark`, 20)}</button>`;
  }

  function wireBookmark(card, key, onToggle) {
    const btn = card.querySelector(`[data-role="bookmark"]`);
    if (!btn || !window.Bookmarks) return;
    btn.addEventListener(`click`, (e) => {
      e.stopPropagation();
      const on = Bookmarks.toggle(key);
      btn.classList.toggle(`is-bookmarked`, on);
      btn.setAttribute(`aria-pressed`, String(on));
      btn.setAttribute(`aria-label`, on ? `ブックマークを外す` : `ブックマークする`);
      btn.innerHTML = ic(on ? `bookmark-fill` : `bookmark`, 20);
      if (onToggle) onToggle(on, card);
    });
  }

  // チップの列(aria-pressed で選択状態を表す)。戻り値は選択状態を塗り直す関数
  function buildChips(container, options, getValue, onPick) {
    container.innerHTML = options.map((o) => `<button type="button" class="chip chip-small" data-value="${esc(o.id)}" aria-pressed="false">${o.icon ? ic(o.icon, 14) : ``}${esc(o.label)}</button>`).join(``);
    function paint() {
      container.querySelectorAll(`[data-value]`).forEach((b) => {
        const on = b.dataset.value === String(getValue());
        b.classList.toggle(`active`, on);
        b.setAttribute(`aria-pressed`, String(on));
      });
    }
    container.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-value]`);
      if (!b || b.dataset.value === String(getValue())) return;
      onPick(b.dataset.value);
    });
    paint();
    return paint;
  }

  const levelOptions = () => LEVELS.map((id) => ({ id, label: levelLabel(id) }));
  const topicOptions = () => [{ id: ALL, label: `全トピック` }].concat(window.APP_DATA.topics.map((t) => ({ id: t.id, label: t.name, icon: t.icon })));

  function choiceButton(i, text) {
    const btn = document.createElement(`button`);
    btn.type = `button`;
    btn.className = `btn choice-btn`;
    btn.innerHTML = `<span class="choice-key">${i + 1}</span><span class="choice-body"><span class="choice-text">${esc(text)}</span></span>`;
    return btn;
  }

  // 回答後の選択肢: 正解・あなたの回答の印と、選択肢ごとの解説をボタンの中に足す(ボタンは作り直さない)
  function paintChoices(choiceList, choices, picked) {
    Array.from(choiceList.querySelectorAll(`.choice-btn`)).forEach((btn, i) => {
      const c = choices[i];
      if (!c) return;
      btn.disabled = true;
      btn.classList.add(`is-done`);
      if (c.correct) btn.classList.add(`correct`);
      else if (i === picked) btn.classList.add(`incorrect`);
      if (i === picked) btn.classList.add(`is-picked`);
      const tags = [];
      if (c.correct) tags.push(`<span class="choice-tag is-answer">正解</span>`);
      if (i === picked) tags.push(`<span class="choice-tag is-mine">あなたの回答</span>`);
      const mark = c.truth === true ? `<span class="ox-mark ox-o" aria-hidden="true">○</span><span class="sr-only">正しい。</span>`
        : c.truth === false ? `<span class="ox-mark ox-x" aria-hidden="true">×</span><span class="sr-only">誤り。</span>` : ``;
      const note = c.note ? `<span class="choice-note">${mark}<span>${esc(c.note)}</span></span>` : ``;
      btn.querySelector(`.choice-body`).insertAdjacentHTML(`beforeend`, `${tags.length ? `<span class="choice-tags">${tags.join(``)}</span>` : ``}${note}`);
    });
  }

  // 回答バー(カードの最後。画面の下・親指の届く位置に固定して出す)の判定。
  // 1行目は「正解!」「不正解」、2行目は短い補足(長いときは … で切る。全文は解説の中の .review-added)
  // ok: true / false、title: 1行目(省略時は 正解! / 不正解)、sub: 2行目
  function verdictHtml(ok, sub, title) {
    return `<p class="quiz-verdict ${ok ? `is-ok` : `is-ng`}">${ic(ok ? `check-circle` : `x-circle`, 28)}<span class="quiz-verdict-text"><strong>${esc(title || (ok ? `正解!` : `不正解`))}</strong>${sub ? `<small>${esc(sub)}</small>` : ``}</span></p>`;
  }

  // 4択の判定の補足: 「正解は 3・「〇〇」を復習に追加」
  function mcVerdictSub(ok, correctIdx, term, okSub) {
    if (ok) return okSub || ``;
    return `正解は ${correctIdx + 1}${term ? `・「${term.name}」を復習に追加` : ``}`;
  }

  // 回答した直後の判定を回答バーとして出す(以前の回答バーの「次の問題」は消える)
  function showVerdict(el, ok, sub, title) {
    el.classList.add(`quiz-answer-bar`);
    el.classList.toggle(`is-ok`, !!ok);
    el.classList.toggle(`is-ng`, !ok);
    el.innerHTML = verdictHtml(ok, sub, title);
  }

  function nextBtnHtml(label) {
    return `<button type="button" class="btn quiz-next" data-role="next-q" data-label="${label}">${nextBtnInner(label)}</button>`;
  }

  function nextBtnInner(label) {
    return `<span>${label}</span>${ic(label === `結果を見る` ? `flag` : `arrow-right`, 18)}`;
  }

  function followingCard(card) {
    let el = card.nextElementSibling;
    while (el && !el.classList.contains(`quiz-card`)) el = el.nextElementSibling;
    return el;
  }

  function nextUnansweredAfter(card) {
    let el = followingCard(card);
    while (el && el.classList.contains(`is-answered`)) el = followingCard(el);
    return el;
  }

  // 次の問題を画面の上端へ(固定ヘッダーの分は html の scroll-padding-top、余白は CSS の scroll-margin-top)。フォーカスは問題文へ
  // (選択肢のボタンに移すと、続けて Enter を押したときに1番を選んでしまうため)
  function focusCard(target) {
    target.scrollIntoView({ behavior: UI.prefersReducedMotion() ? `auto` : `smooth`, block: `start` });
    const qEl = target.querySelector(`.quiz-question`);
    if (qEl) {
      qEl.setAttribute(`tabindex`, `-1`);
      qEl.focus({ preventScroll: true });
    }
  }

  // ===== 確認問題 =====

  // 履歴に保存した確認問題の状態(壊れていれば null)
  function parseQState(raw) {
    if (!Storage.isPlainObject(raw)) return null;
    const total = window.APP_DATA.quiz.length;
    const answered = {};
    if (Storage.isPlainObject(raw.answered)) {
      const ids = new Set(window.APP_DATA.quiz.map((q) => q.id));
      Object.keys(raw.answered).forEach((id) => {
        const v = raw.answered[id];
        if (ids.has(id) && ((Number.isInteger(v) && v >= 0 && v < 4) || v === `ok` || v === `ng`)) answered[id] = v;
      });
    }
    const shown = Number(raw.shown);
    const start = Number(raw.start);
    return {
      level: LEVELS.includes(raw.level) ? raw.level : ALL,
      topic: validTopic(raw.topic) ? raw.topic : ALL,
      status: STATUSES.includes(raw.status) ? raw.status : `all`,
      shown: Number.isInteger(shown) && shown > 0 ? Math.min(shown, total) : 0,
      // 直リンクで途中から表示した一覧の先頭の位置(0 = 最初から)
      start: Number.isInteger(start) && start > 0 ? Math.min(start, total - 1) : 0,
      answered,
    };
  }

  function renderFixed(body, initialTopic, focusQuizId, ctx) {
    const qHistory = getHistory();
    const saved = parseQState(historyState().qState);
    const levelState = { value: ALL };
    const topicState = { value: ALL };
    let statusFilter = `all`;
    if (saved) {
      // 戻る・再読み込み: 絞り込み・表示件数・回答済みのカードを元に戻す
      levelState.value = saved.level;
      topicState.value = saved.topic;
      statusFilter = saved.status;
    } else if (focusQuizId) {
      // 直リンクは全問の中から探す
    } else if (initialTopic && initialTopic !== ALL) {
      topicState.value = initialTopic;
    } else {
      const prefs = loadPrefs();
      levelState.value = prefs.level;
      topicState.value = prefs.topic;
      statusFilter = prefs.status;
    }
    let restoreShown = saved ? saved.shown : 0;
    let restoreStart = saved ? saved.start : 0;
    // この一覧で回答したカード(問題ID → 選んだ番号)。戻るで解説ごと再現するために state に保存する
    let answeredMap = saved ? saved.answered : {};
    const doFocus = !!focusQuizId && !saved;

    // 絞り込みは1行(「絞り込み」ボタン + 選んでいる条件のチップ)にまとめ、条件はシートで選ぶ
    body.innerHTML = `
      <div class="quiz-filter-row" data-role="filter-row">
        <button type="button" class="btn btn-secondary btn-sm quiz-filter-btn" data-role="filter-open" aria-haspopup="dialog">
          ${icAny([`filter`, `sliders`, `list`], 16)}<span>絞り込み</span><span class="quiz-filter-count num" data-role="filter-count" hidden></span>
        </button>
        <div class="quiz-filter-chips" data-role="filter-chips"></div>
      </div>
      <p class="progress-text quiz-progress" data-role="summary"></p>
      <div class="quiz-list" data-role="quiz-list"></div>
    `;
    const list = body.querySelector(`[data-role="quiz-list"]`);
    const summary = body.querySelector(`[data-role="summary"]`);
    const filterRow = body.querySelector(`[data-role="filter-row"]`);
    const filterBtn = body.querySelector(`[data-role="filter-open"]`);
    const filterCount = body.querySelector(`[data-role="filter-count"]`);
    const filterChips = body.querySelector(`[data-role="filter-chips"]`);

    // 一覧は絞り込みを変えるまで作り直さないので、PAGE と shownCount は先に用意しておく
    // 表示しているのは currentQuestions の startIdx 〜 shownCount の手前まで。直リンク(#quiz/q/<id>)で後ろのほうの問題を開いたときは
    // その問題から表示し(手前の数百問を描くと重いため)、上の「前の問題を表示」で手前を足す
    const PAGE = 30;
    let currentQuestions = [];
    let shownCount = 0;
    let startIdx = 0;
    let firstList = true;

    function saveState() {
      patchHistoryState({ qState: { level: levelState.value, topic: topicState.value, status: statusFilter, shown: shownCount, start: startIdx, answered: answeredMap } });
    }

    const cond = () => ({ level: levelState.value, topic: topicState.value, status: statusFilter });

    // 条件に合う問題(restoring: 戻るで再現する回答済みのカードは、条件から外れていても残す)
    function filterQuestions(c, restoring) {
      return window.APP_DATA.quiz.filter((q) => {
        if (c.level !== ALL && q.level !== c.level) return false;
        if (c.topic !== ALL && !(q.topicIds || []).includes(c.topic)) return false;
        if (restoring && answeredMap[q.id] != null) return true;
        if (c.status === `ng` && qHistory[q.id] !== `ng`) return false;
        if (c.status === `unanswered` && (qHistory[q.id] === `ok` || qHistory[q.id] === `ng`)) return false;
        if (c.status === `bookmark` && !(window.Bookmarks && Bookmarks.has(`quiz:${q.id}`))) return false;
        return true;
      });
    }

    // 選んでいる条件: ボタンの件数と、外せるチップ(「宅建業法 ×」)
    function paintFilterRow() {
      const parts = [];
      if (levelState.value !== ALL) parts.push({ key: `level`, label: levelLabel(levelState.value) });
      if (topicState.value !== ALL) parts.push({ key: `topic`, label: topicLabel(topicState.value) });
      if (statusFilter !== `all`) parts.push({ key: `status`, label: STATUS_LABELS[statusFilter] });
      filterCount.hidden = !parts.length;
      filterCount.textContent = parts.length ? String(parts.length) : ``;
      filterBtn.setAttribute(`aria-label`, parts.length ? `絞り込み(${parts.length}件の条件)` : `絞り込み`);
      filterChips.innerHTML = parts.map((p) => `<button type="button" class="chip chip-small quiz-filter-chip" data-clear="${p.key}" aria-label="「${esc(p.label)}」の条件を外す"><span>${esc(p.label)}</span>${ic(`x`, 14)}</button>`).join(``);
    }

    // 条件を変える(保存して一覧を作り直す)。一覧の途中にいたら、新しい一覧の先頭が見える位置へ戻す
    function applyFilter(next) {
      levelState.value = next.level;
      topicState.value = next.topic;
      statusFilter = next.status;
      savePrefs({ level: next.level, topic: next.topic, status: next.status });
      renderList();
      const top = filterRow.getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
    }

    function setStatus(s) {
      applyFilter(Object.assign(cond(), { status: s }));
    }

    filterChips.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-clear]`);
      if (!b) return;
      const next = cond();
      if (b.dataset.clear === `level`) next.level = ALL;
      else if (b.dataset.clear === `topic`) next.topic = ALL;
      else next.status = `all`;
      applyFilter(next);
      // 外したチップが消えるので、フォーカスは「絞り込み」ボタンへ
      filterBtn.focus({ preventScroll: true });
    });

    // 条件のシート: チップを選んでも、「この条件で表示」を押すまで一覧は変えない
    filterBtn.addEventListener(`click`, () => {
      const draft = cond();
      const content = document.createElement(`div`);
      content.className = `filter-sheet`;
      content.innerHTML = `
        <p class="filter-sheet-label" id="qf-level-label">レベル</p>
        <div class="chip-row" data-role="level-chips" role="group" aria-labelledby="qf-level-label"></div>
        <p class="filter-sheet-label" id="qf-topic-label">トピック</p>
        <div class="chip-row filter-sheet-topics" data-role="topic-chips" role="group" aria-labelledby="qf-topic-label"></div>
        <p class="filter-sheet-label" id="qf-status-label">表示する問題</p>
        <div class="segmented filter-sheet-status" role="group" aria-labelledby="qf-status-label" data-role="status">
          ${STATUSES.map((s) => `<button type="button" class="segmented-item" data-status="${s}" aria-pressed="false">${STATUS_ICONS[s] ? ic(STATUS_ICONS[s], 14) : ``}${STATUS_LABELS[s]}</button>`).join(``)}
        </div>
        <div class="filter-sheet-foot">
          <button type="button" class="btn btn-lg btn-block" data-role="filter-apply"></button>
          <button type="button" class="link-btn" data-role="filter-clear">条件をクリア</button>
        </div>
      `;
      const applyBtn = content.querySelector(`[data-role="filter-apply"]`);
      const statusEl = content.querySelector(`[data-role="status"]`);
      const paints = [];
      function paint() {
        paints.forEach((p) => p());
        statusEl.querySelectorAll(`[data-status]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.status === draft.status)));
        applyBtn.textContent = `この条件で表示(${filterQuestions(draft, false).length}問)`;
      }
      paints.push(buildChips(content.querySelector(`[data-role="level-chips"]`), levelOptions(), () => draft.level, (v) => { draft.level = v; paint(); }));
      paints.push(buildChips(content.querySelector(`[data-role="topic-chips"]`), topicOptions(), () => draft.topic, (v) => { draft.topic = v; paint(); }));
      statusEl.addEventListener(`click`, (e) => {
        const b = e.target.closest(`[data-status]`);
        if (!b || b.dataset.status === draft.status) return;
        draft.status = b.dataset.status;
        paint();
      });
      content.querySelector(`[data-role="filter-clear"]`).addEventListener(`click`, () => {
        draft.level = ALL;
        draft.topic = ALL;
        draft.status = `all`;
        paint();
      });
      paint();
      const sh = UI.sheet({ title: `問題を絞り込む`, content });
      applyBtn.addEventListener(`click`, () => {
        sh.close(false);
        applyFilter(Object.assign({}, draft));
        filterBtn.focus({ preventScroll: true });
      });
    });

    function updateSummary() {
      const all = window.APP_DATA.quiz;
      const answered = all.filter((q) => qHistory[q.id] === `ok` || qHistory[q.id] === `ng`).length;
      const ok = all.filter((q) => qHistory[q.id] === `ok`).length;
      summary.textContent = answered
        ? `回答済み ${answered} / ${all.length}問・正解 ${ok}問(正答率 ${Math.round((ok / answered) * 100)}%)`
        : `回答済み 0 / ${all.length}問`;
    }

    // 回答したカードは作り直さない(解説が消えたり別の問題に入れ替わったりしないように)。
    // 条件から外れたカードは見出しに「条件外」の印を付けるだけにして、次に絞り込んだときに一覧から外す
    function setStale(card, on) {
      card.classList.toggle(`filter-stale`, on);
      const tag = card.querySelector(`[data-role="stale-tag"]`);
      if (on && !tag) {
        const tools = card.querySelector(`.quiz-card-tools`);
        if (tools) tools.insertAdjacentHTML(`beforebegin`, `<span class="stale-tag" data-role="stale-tag">条件外(次に絞り込むと消えます)</span>`);
      } else if (!on && tag) {
        tag.remove();
      }
    }

    function isStale(card, result) {
      if (statusFilter === `unanswered`) return true;
      if (statusFilter === `ng`) return result !== `ng`;
      if (statusFilter === `bookmark`) return !(window.Bookmarks && Bookmarks.has(`quiz:${card.dataset.quizId}`));
      return false;
    }

    function handleResult(result, card, picked, restored) {
      if (!restored) {
        answeredMap[card.dataset.quizId] = picked;
        updateSummary();
        saveState();
        ctx.lastAnswered = card;
      }
      setStale(card, isStale(card, result));
    }

    function handleBookmark(on, card) {
      if (statusFilter === `bookmark`) setStale(card, !on);
    }

    // 「苦手な問題だけ表示」: 絞り込み後、一覧の先頭が見える位置へ戻す(applyFilter)
    function gotoNg() {
      setStatus(`ng`);
    }

    // 一度に全問を描画すると端末によっては数秒かかるため、30問ずつ表示して「もっと見る」で末尾に追加する
    function appendCards(from, to) {
      const fragment = document.createDocumentFragment();
      currentQuestions.slice(from, to).forEach((q) => fragment.appendChild(buildFixedCard(q, {
        history: qHistory, onResult: handleResult, onGotoNg: gotoNg, onBookmark: handleBookmark, restoreChoice: answeredMap[q.id],
      })));
      list.appendChild(fragment);
      // 前のページの最後に回答済みのカードがあれば、追加した問題へ進むボタンを付ける
      list.querySelectorAll(`.quiz-card.is-answered`).forEach(ensureNextButton);
    }

    function renderMore() {
      const existing = list.nextElementSibling;
      if (existing && existing.classList.contains(`load-more-btn`)) existing.remove();
      if (shownCount >= currentQuestions.length) return;
      const btn = document.createElement(`button`);
      btn.type = `button`;
      btn.className = `btn load-more-btn`;
      btn.textContent = `もっと見る(残り${currentQuestions.length - shownCount}問)`;
      btn.addEventListener(`click`, () => {
        const next = Math.min(currentQuestions.length, shownCount + PAGE);
        appendCards(shownCount, next);
        shownCount = next;
        if (shownCount >= currentQuestions.length) btn.remove();
        else btn.textContent = `もっと見る(残り${currentQuestions.length - shownCount}問)`;
        saveState();
      });
      list.insertAdjacentElement(`afterend`, btn);
    }

    // 「前の問題を表示」(直リンクで途中から表示したとき、一覧の上に置く)。押すと手前の問題をボタンのすぐ下に足す
    function renderPrev() {
      const existing = list.previousElementSibling;
      if (existing && existing.classList.contains(`load-prev-btn`)) existing.remove();
      if (startIdx <= 0) return;
      const btn = document.createElement(`button`);
      btn.type = `button`;
      btn.className = `btn load-more-btn load-prev-btn`;
      btn.textContent = `前の問題を表示(残り${startIdx}問)`;
      btn.addEventListener(`click`, () => {
        const from = Math.max(0, startIdx - PAGE);
        const fragment = document.createDocumentFragment();
        currentQuestions.slice(from, startIdx).forEach((q) => fragment.appendChild(buildFixedCard(q, {
          history: qHistory, onResult: handleResult, onGotoNg: gotoNg, onBookmark: handleBookmark, restoreChoice: answeredMap[q.id],
        })));
        list.insertBefore(fragment, list.firstChild);
        startIdx = from;
        list.querySelectorAll(`.quiz-card.is-answered`).forEach(ensureNextButton);
        if (startIdx <= 0) {
          btn.remove();
          filterBtn.focus({ preventScroll: true });
        } else {
          btn.textContent = `前の問題を表示(残り${startIdx}問)`;
        }
        saveState();
      });
      list.insertAdjacentElement(`beforebegin`, btn);
    }

    // restoring: 戻る・再読み込みで、保存しておいた回答済みのカードを元の位置に出す
    function renderList(restoring) {
      if (!restoring) answeredMap = {};
      paintFilterRow();
      list.innerHTML = ``;
      startIdx = 0;
      updateSummary();
      const questions = filterQuestions(cond(), restoring);
      if (!questions.length) {
        const map = {
          ng: { icon: `check-circle`, title: `苦手な問題はありません`, body: `4択で間違えた問題がここに集まります。` },
          unanswered: { icon: `trophy`, title: `すべて回答済みです`, body: `条件に合う未回答の問題はありません。` },
          bookmark: { icon: `bookmark`, title: `保存した問題はありません`, body: `問題カード右上のブックマークで保存できます。` },
        };
        list.appendChild(UI.emptyState(map[statusFilter] || { icon: `search`, title: `該当する問題がありません`, body: `レベルやトピックの絞り込みを変えてみてください。` }));
        currentQuestions = [];
        shownCount = 0;
        renderMore();
        renderPrev();
        saveState();
        return;
      }
      currentQuestions = questions;
      // 直リンク(#quiz/q/<id>)の初回は、その問題まで表示する(最初のページより後ろの問題は、その問題から表示する)
      let need = PAGE;
      if (firstList && doFocus) {
        const idx = questions.findIndex((q) => q.id === focusQuizId);
        if (idx >= PAGE) { startIdx = idx; need = idx + PAGE; }
        else if (idx >= 0) need = Math.max(PAGE, idx + 5);
      }
      firstList = false;
      if (restoreShown) { need = Math.max(need, restoreShown); restoreShown = 0; }
      if (restoreStart) { startIdx = restoreStart; restoreStart = 0; }
      shownCount = Math.min(questions.length, need);
      // 保存した先頭が一覧の範囲外(問題データが変わった等)なら最初から
      if (startIdx >= shownCount) startIdx = 0;
      appendCards(startIdx, shownCount);
      renderMore();
      renderPrev();
      saveState();
    }

    renderList(true);

    if (doFocus) {
      const target = list.querySelector(`[data-quiz-id="${CSS.escape(focusQuizId)}"]`);
      if (target) {
        target.classList.add(`highlighted`);
        // 遠いとき(画面2枚分より先)はすぐに移す(長い距離をなめらかに動かすと着くまで時間がかかるため)
        requestAnimationFrame(() => {
          if (Math.abs(target.getBoundingClientRect().top) > window.innerHeight * 2) target.scrollIntoView({ block: `center`, behavior: `auto` });
          else UI.scrollIntoView(target);
        });
        // スクロールに時間がかかる端末でも目に入るよう、強調は長めに残す
        setTimeout(() => target.classList.remove(`highlighted`), 5000);
      } else {
        UI.toast(`指定された問題が見つかりませんでした`, `default`);
      }
    }
  }

  // 戻り値: 解き直しの予定(Drill)の変化(4択の確認問題だけ。Drill.noteRight / noteWrong の戻り値)
  function recordFixedResult(q, result, qHistory) {
    // 別のタブでの回答を消さないよう、最新の記録を読み直してから書き込む
    Object.assign(qHistory, getHistory());
    qHistory[q.id] = result;
    Storage.set(`quizHistory`, qHistory);
    if (window.Streak) Streak.recordToday();
    if (result === `ng` && q.relatedTermId && AppIndex.termsById[q.relatedTermId]) Srs.grade(q.relatedTermId, 1, { silent: true });
    // 解き直しの予定: 間違えたら翌日から出し直し、期限が来た問題に正解したら次の段階へ(記述式は対象外)
    if (window.Drill && QuizEngine.isMcItem(q)) {
      try { return Drill.note(q.id, result === `ok`, `quiz`); } catch (e) { console.error(`[解き直し] 記録できませんでした`, e); }
    }
    return null;
  }

  // 用語に図解があれば、その最初の図解ID(なければ null)
  function figureIdFor(termId) {
    if (!termId || !window.CardUi || typeof CardUi.diagramsFor !== `function`) return null;
    const ids = CardUi.diagramsFor(termId);
    return ids.length ? ids[0] : null;
  }

  // 「図解で確認」のチップ(押すと図解をシートで開く)
  function figureChipHtml(termId) {
    const id = figureIdFor(termId);
    return id ? `<button type="button" class="chip chip-small chip-muted" data-figure="${esc(id)}">${ic(`diagram`, 14)}図解で確認</button>` : ``;
  }

  function onFigureClick(e) {
    const b = e.target && e.target.closest ? e.target.closest(`[data-figure]`) : null;
    if (!b || !window.CardUi || typeof CardUi.openFigure !== `function`) return;
    e.preventDefault();
    CardUi.openFigure(b.dataset.figure);
  }

  // 「次の問題」: 同じ一覧の後ろに問題があるカードだけ、回答バーに付ける(トピック詳細・ブックマークの一覧でも同じ)
  function ensureNextButton(card) {
    const bar = card.querySelector(`.quiz-answer-bar[data-role="verdict"]`);
    if (!bar || !card.isConnected || bar.querySelector(`[data-role="next-q"]`) || !followingCard(card)) return;
    bar.insertAdjacentHTML(`beforeend`, nextBtnHtml(`次の問題`));
  }

  // 一覧に問題を書き足したあと(トピック詳細・ブックマークの「もっと見る」)、回答済みのカードに「次の問題」を付け直す
  function ensureNextButtons(root) {
    if (root) root.querySelectorAll(`.quiz-card.is-answered`).forEach(ensureNextButton);
  }

  // 回答バー(判定)の要素。カードの最後の子にする(画面の下に固定して出すため)
  function verdictElement() {
    const el = document.createElement(`div`);
    el.className = `quiz-feedback`;
    el.dataset.role = `verdict`;
    el.setAttribute(`role`, `status`);
    el.setAttribute(`aria-live`, `polite`);
    return el;
  }

  // 確認問題のカード。topics.js(トピック詳細)・bookmarks.js からも使う
  // opts: { history, onResult(result, card, picked, restored, drill), onGotoNg, onBookmark(on, card), restoreChoice }
  // restoreChoice: 戻る・再読み込みのとき、回答済みの表示(解説つき)を記録し直さずに再現する(4択は選んだ番号、記述は 'ok'/'ng')
  // onResult の drill: その回答で解き直しの予定がどう変わったか(Drill.note の戻り値。戻るで再現したときは undefined)
  function buildFixedCard(q, opts) {
    opts = opts || {};
    const qHistory = opts.history || getHistory();
    const isMc = QuizEngine.isMcItem(q);
    const term = q.relatedTermId && AppIndex.termsById[q.relatedTermId] ? AppIndex.termsById[q.relatedTermId] : null;
    const card = document.createElement(`div`);
    card.className = `card quiz-card`;
    card.dataset.quizId = q.id;
    const prior = qHistory[q.id];
    const priorTag = prior === `ng` ? `<span class="review-status review-status-ng">${ic(`x-circle`, 12)}前回: 不正解</span>`
      : prior === `ok` ? `<span class="review-status review-status-ok">${ic(`check-circle`, 12)}前回: 正解</span>` : ``;

    card.innerHTML = `
      <div class="quiz-card-head">
        <span class="badge badge-${q.level}">${q.level}</span>
        <span class="source-tag">${isMc ? `4択` : `記述`}</span>
        ${priorTag}
        <span class="quiz-card-tools">${bookmarkBtnHtml(`quiz:${q.id}`)}</span>
      </div>
      <p class="quiz-question"><strong>Q.</strong> ${esc(q.question)}</p>
      <div data-role="body"></div>
    `;
    wireBookmark(card, `quiz:${q.id}`, opts.onBookmark);
    // 画面(クイズ)側にも同じ処理があるが、トピック詳細などから使う場合のためにカード自身でも受ける
    card.addEventListener(`click`, onTermLinkClick);
    card.addEventListener(`click`, onFigureClick);
    card.addEventListener(`click`, (e) => {
      const nb = e.target.closest ? e.target.closest(`[data-role="next-q"]`) : null;
      if (!nb) return;
      const target = nextUnansweredAfter(card) || followingCard(card);
      if (target) focusCard(target);
      else nb.remove();
    });
    const bodyEl = card.querySelector(`[data-role="body"]`);

    function afterLinksHtml(ok) {
      const links = `${termLinkHtml(q.relatedTermId)}${figureChipHtml(q.relatedTermId)}${!ok && opts.onGotoNg ? `<button type="button" class="link-btn" data-role="goto-ng">苦手な問題だけ表示</button>` : ``}`;
      return links ? `<div class="quiz-after-links">${links}</div>` : ``;
    }

    function wireGotoNg(container) {
      const btn = container.querySelector(`[data-role="goto-ng"]`);
      if (btn) btn.addEventListener(`click`, () => opts.onGotoNg());
    }

    // 戻るで復元したカードは一覧に入ってから「次の問題」の要否を決める
    function placeNext(restored) {
      if (restored) requestAnimationFrame(() => ensureNextButton(card));
      else ensureNextButton(card);
    }

    // 誤りの報告(解説の最後。報告フォームが未設定なら出さない)
    const metaHtml = () => reportMetaHtml({ kind: `quiz`, id: q.id, title: q.question, location: `#quiz/q/${q.id}` }, q.asOf);

    // 判定は回答バーとしてカードの最後に置く(解説の後ろ)
    const verdictEl = verdictElement();
    card.appendChild(verdictEl);

    if (isMc) {
      const mq = QuizEngine.fromFixedMc(q, { keepOrder: true });
      const correctIdx = mq.choices.findIndex((c) => c.correct);
      bodyEl.innerHTML = `
        <div class="choice-list" role="group" aria-label="選択肢"></div>
        <div class="quiz-after" data-role="explain"></div>
      `;
      const choiceList = bodyEl.querySelector(`.choice-list`);
      const explainEl = bodyEl.querySelector(`[data-role="explain"]`);
      let done = false;

      function showAnswer(picked, restored) {
        if (done) return;
        done = true;
        const ok = picked === correctIdx;
        const result = ok ? `ok` : `ng`;
        card.classList.add(`is-answered`);
        if (restored) card.classList.add(`is-restored`);
        paintChoices(choiceList, mq.choices, picked);
        const hasExplain = !!mq.explanation || mq.choices.some((c) => c.note);
        showVerdict(verdictEl, ok, mcVerdictSub(ok, correctIdx, term, hasExplain ? `解説はこの下にあります` : ``));
        explainEl.innerHTML = `
          ${!ok && term ? reviewAddedHtml(term.name) : ``}
          ${mq.explanation ? `<div class="quiz-explain"><p class="quiz-explain-title">全体の解説</p><p class="quiz-explain-text">${esc(mq.explanation)}</p></div>` : ``}
          ${afterLinksHtml(ok)}
          ${metaHtml()}
        `;
        wireGotoNg(explainEl);
        const drill = restored ? undefined : recordFixedResult(q, result, qHistory);
        if (opts.onResult) opts.onResult(result, card, picked, !!restored, drill);
        placeNext(restored);
      }

      mq.choices.forEach((choice, i) => {
        const btn = choiceButton(i, choice.text);
        btn.addEventListener(`click`, () => showAnswer(i, false));
        choiceList.appendChild(btn);
      });
      const rc = opts.restoreChoice;
      if (Number.isInteger(rc) && rc >= 0 && rc < mq.choices.length) showAnswer(rc, true);
    } else {
      bodyEl.innerHTML = `
        <button type="button" class="btn btn-secondary" data-role="reveal">${ic(`eye`)}答えを見る</button>
        <div data-role="answer-area" hidden>
          <p class="quiz-answer"><strong>A.</strong> ${esc(q.answer)}</p>
          <p class="quiz-self-ask">思い出せましたか?</p>
          <div class="self-report">
            <button type="button" class="btn btn-success" data-result="ok">${ic(`check`)}わかった</button>
            <button type="button" class="btn btn-secondary" data-result="ng">${ic(`x`)}わからなかった</button>
          </div>
        </div>
        <div class="quiz-after" data-role="explain"></div>
      `;
      const revealBtn = bodyEl.querySelector(`[data-role="reveal"]`);
      const answerArea = bodyEl.querySelector(`[data-role="answer-area"]`);
      const explainEl = bodyEl.querySelector(`[data-role="explain"]`);
      revealBtn.addEventListener(`click`, () => {
        answerArea.hidden = false;
        revealBtn.hidden = true;
      });
      let lastResult = null;
      function showResult(result, restored) {
        // 同じボタンの連打で記録・復習登録が重複しないように(答えの変更は可)
        if (result === lastResult) return;
        lastResult = result;
        answerArea.hidden = false;
        revealBtn.hidden = true;
        card.classList.add(`is-answered`);
        bodyEl.querySelectorAll(`[data-result]`).forEach((b) => b.classList.toggle(`active`, b.dataset.result === result));
        const ok = result === `ok`;
        showVerdict(verdictEl, ok, !ok && term ? `「${term.name}」を復習に追加` : ``, ok ? `わかった` : `わからなかった`);
        explainEl.innerHTML = `${!ok && term ? reviewAddedHtml(term.name) : ``}${afterLinksHtml(ok)}${metaHtml()}`;
        wireGotoNg(explainEl);
        if (!restored) recordFixedResult(q, result, qHistory);
        if (opts.onResult) opts.onResult(result, card, result, !!restored);
        placeNext(restored);
      }
      bodyEl.querySelectorAll(`[data-result]`).forEach((btn) => btn.addEventListener(`click`, () => showResult(btn.dataset.result, false)));
      if (opts.restoreChoice === `ok` || opts.restoreChoice === `ng`) showResult(opts.restoreChoice, true);
    }
    return card;
  }

  // ===== 解き直し(#quiz/due・#quiz/due/<問題数>) =====
  // 期限が来た解き直しの問題(Drill)を、確認問題と同じカードで出す(見出し「解き直し n問」)。
  // 答えると予定が進む(正解: 次の段階へ・4回目の正解で卒業 / 不正解: 翌日から最初の段階)。
  // 表示は DUE_PAGE 問ずつ(#quiz/due/<n> なら最初の n 問)。残りは結果の「残りの問題も解く」で足す
  // 戻る・再読み込みで同じ問題・同じ回答を出せるよう(記録は1回だけ)、履歴エントリの state に保存する
  //   dueState: { day: 開いた日, ids: [開いたときに期限が来ていた問題ID], shown: 表示している数, answered: { 問題ID: 選んだ番号 },
  //               outcome: { 問題ID: 'up:<日数>:<卒業までの残り回数>' | 'grad' | 'reset' }, rem: { 問題ID: 開いたときの卒業までの残り回数 } }
  const DUE_PAGE = 10;
  const DUE_MAX = 50;
  const OUTCOME_RE = /^(grad|reset|up:\d{1,2}:\d)$/;

  function parseDueState(raw) {
    // 開いた日と違う日(ホーム画面のアプリを翌日に開いた・再読み込みした)は、その日の期限で出し直す
    if (!window.Drill || !Storage.isPlainObject(raw) || !Array.isArray(raw.ids) || raw.day !== DateUtil.today()) return null;
    const ids = raw.ids.filter((id, i, a) => typeof id === `string` && a.indexOf(id) === i && Drill.isEligible(id)).slice(0, DUE_MAX);
    if (!ids.length) return null;
    const pick = (src, ok) => {
      const out = {};
      if (Storage.isPlainObject(src)) ids.forEach((id) => { if (ok(src[id])) out[id] = src[id]; });
      return out;
    };
    const shown = Number(raw.shown);
    return {
      ids,
      shown: Number.isInteger(shown) && shown > 0 ? Math.min(shown, ids.length) : Math.min(DUE_PAGE, ids.length),
      answered: pick(raw.answered, (v) => Number.isInteger(v) && v >= 0 && v < 4),
      outcome: pick(raw.outcome, (v) => typeof v === `string` && OUTCOME_RE.test(v)),
      rem: pick(raw.rem, (v) => Number.isInteger(v) && v >= 1 && v <= 4),
    };
  }

  // 回答で予定がどう変わったかの1行(解説の先頭に出す)
  function drillOutcomeHtml(code) {
    if (code === `grad`) return `<p class="drill-result is-grad">${ic(`trophy`, 16)}<span>卒業です。この問題は解き直しの予定から外れました</span></p>`;
    if (code === `reset`) return `<p class="drill-result is-reset">${ic(`repeat`, 16)}<span>明日もう一度出します(1→3→7→21日後の最初からやり直し)</span></p>`;
    const m = /^up:(\d+):(\d)$/.exec(code || ``);
    if (m) return `<p class="drill-result">${ic(`calendar`, 16)}<span>次は${m[1]}日後にもう一度出します(卒業まであと${m[2]}回)</span></p>`;
    return ``;
  }

  function drillOutcomeCode(result, drill) {
    if (result !== `ok`) return `reset`;
    if (!drill) return ``;
    if (drill.graduated) return `grad`;
    const left = window.Drill ? Drill.INTERVALS.length - drill.step : 0;
    return Number.isInteger(drill.days) && left > 0 ? `up:${drill.days}:${left}` : ``;
  }

  // 今日のメニューの手順(ホームと同じ条件で作る。ホームの関数がなければ既定の条件)。作れなければ []
  function menuSteps() {
    try {
      const H = window.Views && window.Views.home;
      const opts = H && typeof H.menuOptions === `function` ? H.menuOptions() : undefined;
      const steps = window.Recommend && typeof Recommend.todayMenu === `function` ? Recommend.todayMenu(opts) : [];
      return Array.isArray(steps) ? steps.filter((s) => s && typeof s.nav === `string`) : [];
    } catch (e) { return []; }
  }

  // 今日のメニューで、まだ終わっていない最初の手順(exceptId の手順は除く)。なければ null
  function nextMenuStep(exceptId, steps) {
    return (steps || menuSteps()).find((s) => !s.done && s.id !== exceptId) || null;
  }

  function renderDue(root, param) {
    const qHistory = getHistory();
    const byId = {};
    window.APP_DATA.quiz.forEach((q) => { byId[q.id] = q; });
    const saved = parseDueState(historyState().dueState);
    const day = DateUtil.today();
    let ids;
    let shown;
    let answered;
    let outcome;
    let rem;
    if (saved) {
      ({ ids, shown, answered, outcome, rem } = saved);
    } else {
      ids = window.Drill ? Drill.dueIds().slice(0, DUE_MAX) : [];
      const n = Number(String(param || ``).split(`/`)[1]);
      shown = Math.min(ids.length, Number.isInteger(n) && n > 0 ? n : DUE_PAGE);
      answered = {};
      outcome = {};
      rem = {};
      ids.forEach((id) => { const e = Drill.get(id); if (e) rem[id] = Drill.remaining(e); });
    }

    const wrap = document.createElement(`div`);
    wrap.className = `view quiz-view quiz-due-view`;
    wrap.dataset.docTitle = `解き直し`;
    wrap.innerHTML = `
      <div class="view-head">
        <h2>解き直し${ids.length ? ` <span class="num">${ids.length}</span>問` : ``}</h2>
        ${infoBtnHtml(`解き直しについて`)}
      </div>
      <div data-role="due-body"></div>
    `;
    root.appendChild(wrap);
    wireInfo(wrap, `解き直しについて`, `
      <p>4択の確認問題・模擬試験・○×一問一答で間違えた問題を、1日後 → 3日後 → 7日後 → 21日後に出し直します。</p>
      <p>期限が来た問題に正解すると次の段階へ進み、4回続けて正解すると「卒業」して出なくなります。間違えたときは翌日から最初の段階に戻ります。</p>
      <p class="view-info-keys">キーボード: <kbd>1</kbd>〜<kbd>4</kbd> で画面内の問題に回答 / <kbd>Enter</kbd> で次の問題へ</p>`);
    wrap.addEventListener(`click`, onTermLinkClick);
    const body = wrap.querySelector(`[data-role="due-body"]`);

    if (!ids.length) {
      const next = window.Drill ? Drill.nextDue() : null;
      const total = window.Drill ? Drill.count() : 0;
      const menu = nextMenuStep(`retry`);
      const nextText = next ? `次は${next.days === 1 ? `明日` : `${next.days}日後`}(${esc(DateUtil.toJapanese(next.date))})に${next.count}問です。` : ``;
      body.appendChild(UI.emptyState({
        icon: `check-circle`,
        title: `今日の解き直しはありません`,
        body: total
          ? `${nextText}予定に入っている問題は全部で${total}問です。`
          : `4択の確認問題・模擬試験・○×で間違えた問題は、翌日からここで解き直せます(1→3→7→21日後に出し直し、4回続けて正解すると卒業)。`,
        cta: menu ? { label: `次のメニュー: ${esc(menu.title)}`, nav: menu.nav } : { label: `4択問題へ`, nav: `#quiz` },
      }));
      return;
    }

    body.innerHTML = `
      <p class="progress-text quiz-progress" data-role="due-progress"></p>
      <div class="quiz-list" data-role="due-list"></div>
      <div class="card quiz-summary drill-summary" data-role="due-summary" tabindex="-1" hidden></div>
    `;
    const list = body.querySelector(`[data-role="due-list"]`);
    const progressEl = body.querySelector(`[data-role="due-progress"]`);
    const summaryEl = body.querySelector(`[data-role="due-summary"]`);
    const ctx = { lastAnswered: null };
    bindKeys(wrap, list, ctx);

    function saveState() {
      patchHistoryState({ dueState: { day, ids: ids.slice(), shown, answered, outcome, rem } });
    }

    const isOk = (id) => !!byId[id] && answered[id] === byId[id].correctIndex;

    function paintProgress() {
      const shownIds = ids.slice(0, shown);
      const done = shownIds.filter((id) => answered[id] != null).length;
      const ok = shownIds.filter(isOk).length;
      progressEl.textContent = `${done} / ${shownIds.length}問回答・正解 ${ok}問${ids.length > shown ? `(ほかに${ids.length - shown}問)` : ``}`;
    }

    // 最後のカード(後ろに問題がない)には「未回答の問題へ」「結果を見る」を付ける
    function paintTail() {
      const cards = Array.from(list.querySelectorAll(`.quiz-card`));
      const last = cards[cards.length - 1];
      cards.forEach((c) => { if (c !== last) { const b = c.querySelector(`[data-role="due-next"]`); if (b) b.remove(); } });
      if (!last || !last.classList.contains(`is-answered`)) return;
      const bar = last.querySelector(`.quiz-answer-bar[data-role="verdict"]`);
      if (!bar) return;
      const label = cards.some((c) => !c.classList.contains(`is-answered`)) ? `未回答の問題へ` : `結果を見る`;
      let b = bar.querySelector(`[data-role="due-next"]`);
      if (!b) {
        bar.insertAdjacentHTML(`beforeend`, `<button type="button" class="btn quiz-next" data-role="due-next" data-label=""></button>`);
        b = bar.querySelector(`[data-role="due-next"]`);
      }
      if (b.dataset.label !== label) {
        b.dataset.label = label;
        b.innerHTML = nextBtnInner(label);
      }
    }

    list.addEventListener(`click`, (e) => {
      const b = e.target.closest ? e.target.closest(`[data-role="due-next"]`) : null;
      if (!b) return;
      const target = list.querySelector(`.quiz-card:not(.is-answered)`);
      if (target) { focusCard(target); return; }
      if (!summaryEl.hidden) {
        summaryEl.scrollIntoView({ behavior: UI.prefersReducedMotion() ? `auto` : `smooth`, block: `start` });
        summaryEl.focus({ preventScroll: true });
      }
    });

    function handleResult(result, card, picked, restored, drill) {
      const id = card.dataset.quizId;
      if (!restored) {
        answered[id] = picked;
        outcome[id] = drillOutcomeCode(result, drill);
        if (!outcome[id]) delete outcome[id];
        ctx.lastAnswered = card;
      }
      const line = drillOutcomeHtml(outcome[id]);
      const explain = card.querySelector(`[data-role="explain"]`);
      if (line && explain) explain.insertAdjacentHTML(`afterbegin`, line);
      if (!restored) {
        saveState();
        paintProgress();
        paintTail();
        renderSummary();
      }
    }

    function buildCard(id) {
      const card = buildFixedCard(byId[id], { history: qHistory, onResult: handleResult, restoreChoice: answered[id] });
      const tools = card.querySelector(`.quiz-card-tools`);
      if (tools && rem[id]) tools.insertAdjacentHTML(`beforebegin`, `<span class="drill-tag">${ic(`repeat`, 12)}卒業まであと${rem[id]}回</span>`);
      return card;
    }

    function appendCards(from, to) {
      const fragment = document.createDocumentFragment();
      ids.slice(from, to).forEach((id) => { if (byId[id]) fragment.appendChild(buildCard(id)); });
      list.appendChild(fragment);
      list.querySelectorAll(`.quiz-card.is-answered`).forEach(ensureNextButton);
      // 戻るで再現したカードの「次の問題」は次のフレームで付くので、最後のカードのボタンもそのあとで決める
      requestAnimationFrame(paintTail);
    }

    function renderSummary() {
      const shownIds = ids.slice(0, shown);
      const total = shownIds.length;
      if (!total || shownIds.some((id) => answered[id] == null)) {
        summaryEl.hidden = true;
        summaryEl.innerHTML = ``;
        return;
      }
      const ok = shownIds.filter(isOk).length;
      const pct = Math.round((ok / total) * 100);
      const count = (pred) => shownIds.filter((id) => pred(outcome[id] || ``)).length;
      const grad = count((c) => c === `grad`);
      const up = count((c) => c.startsWith(`up:`));
      const reset = count((c) => c === `reset`);
      const rest = ids.length - shown;
      const wrongIds = shownIds.filter((id) => !isOk(id));
      const oxNav = wrongIds.length && window.Views.ox && typeof Views.ox.quizNav === `function` ? Views.ox.quizNav(wrongIds) : null;
      // 今日のメニューの次の手順: 残りの問題があっても、メニューの解き直し(今日の分)が終わっていれば案内する
      const steps = menuSteps();
      const retryStep = steps.find((s) => s.id === `retry`);
      const menu = !rest || !retryStep || retryStep.done ? nextMenuStep(`retry`, steps) : null;
      summaryEl.hidden = false;
      summaryEl.innerHTML = `
        <div class="recommend-head">
          <h3 class="card-title">${ic(pct >= PASS_PCT ? `trophy` : `flag`, 20)} 解き直しの結果</h3>
          <span class="stat-value">${ok}<small>/${total}問</small></span>
        </div>
        <div class="quiz-summary-bar">
          <div class="progress-bar progress-bar-lg" aria-hidden="true"><div class="progress-bar-fill ${pct >= PASS_PCT ? `fill-success` : ``}" style="width:${pct}%"></div></div>
          <span class="quiz-summary-pct num">正答率 ${pct}%</span>
        </div>
        <ul class="drill-summary-list">
          ${grad ? `<li>${ic(`trophy`, 16)}<span>卒業 <b class="num">${grad}</b>問</span></li>` : ``}
          ${up ? `<li>${ic(`calendar`, 16)}<span>次の段階へ <b class="num">${up}</b>問</span></li>` : ``}
          ${reset ? `<li>${ic(`repeat`, 16)}<span>明日もう一度 <b class="num">${reset}</b>問</span></li>` : ``}
        </ul>
        ${streakLineHtml()}
        <div class="card-actions">
          ${menu ? `<a class="btn" href="${esc(menu.nav)}" data-role="menu-next">${ic(`arrow-right`)}次のメニュー: ${esc(menu.title)}</a>` : ``}
          ${rest ? `<button type="button" class="btn${menu ? ` btn-secondary` : ``}" data-role="due-more">${ic(`repeat`)}残りの${rest}問も解く</button>` : ``}
          ${oxNav ? `<a class="btn btn-secondary" href="${esc(oxNav)}">${ic(`o-x`)}間違えた問題を○×で確認</a>` : ``}
          <a class="btn btn-ghost" href="#home">${ic(`home`)}ホームへ</a>
        </div>
      `;
      const more = summaryEl.querySelector(`[data-role="due-more"]`);
      if (more) {
        more.addEventListener(`click`, () => {
          const from = shown;
          shown = Math.min(ids.length, shown + DUE_PAGE);
          appendCards(from, shown);
          saveState();
          paintProgress();
          renderSummary();
          const first = list.querySelectorAll(`.quiz-card`)[from];
          if (first) focusCard(first);
        });
      }
    }

    appendCards(0, shown);
    paintProgress();
    renderSummary();
    saveState();
  }

  // ===== 自動生成クイズ =====

  // 履歴に保存した自動生成クイズ(問題と回答)を問題オブジェクトに戻す。壊れていれば null
  function parseAutoState(raw) {
    if (!Storage.isPlainObject(raw) || !Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 50) return null;
    const items = [];
    for (const x of raw.questions) {
      if (!Storage.isPlainObject(x)) return null;
      const term = AppIndex.termsById[x.termId];
      if (!term || !QuizEngine.QUESTION_TYPES.includes(x.type) || typeof x.stem !== `string` || !Array.isArray(x.choices) || x.choices.length !== 4) return null;
      const choices = x.choices.map((c) => (Storage.isPlainObject(c) && typeof c.text === `string` ? { text: c.text, correct: c.correct === true } : null));
      if (choices.some((c) => !c) || choices.filter((c) => c.correct).length !== 1) return null;
      const picked = Number.isInteger(x.picked) && x.picked >= 0 && x.picked < 4 ? x.picked : null;
      items.push({
        q: { key: `term:${term.id}`, kind: `term`, refId: term.id, termId: term.id, level: term.level, type: x.type, stem: x.stem, choices, explanation: term.simpleExplanation, term },
        picked,
      });
    }
    return {
      cond: {
        level: LEVELS.includes(raw.level) ? raw.level : ALL,
        topic: validTopic(raw.topic) ? raw.topic : ALL,
        weak: raw.weak === true,
        count: AUTO_COUNTS.includes(raw.count) ? raw.count : DEFAULT_AUTO_COUNT,
        lawOnly: raw.lawOnly === true,
      },
      condOpen: raw.condOpen === true,
      weakOpen: raw.weakOpen === true,
      // 古い保存データ(weakIds なし)は null: 今の成績から作り直す
      weakIds: Array.isArray(raw.weakIds) ? raw.weakIds.filter((id) => typeof id === `string`).slice(0, 8) : null,
      items,
    };
  }

  function renderAuto(body, initialTopic, initialWeak, ctx) {
    const cond = { level: ALL, topic: initialTopic || ALL, weak: !!initialWeak, count: loadPrefs().autoCount, lawOnly: false };
    let items = []; // [{ q: 問題オブジェクト, picked: 選んだ番号 | null }]
    const stats = Storage.get(`autoQuizStats`, {});
    // 壊れたデータ(null等)の項目は除外
    Object.keys(stats).forEach((k) => { if (!Storage.isPlainObject(stats[k])) delete stats[k]; });
    const saved = parseAutoState(historyState().autoState);
    if (saved) Object.assign(cond, saved.cond);

    // 条件は1行(タップでシート)。問題を画面の上の方から始めるため、チップの列は画面に並べない
    body.innerHTML = `
      <div class="auto-top">
        <button type="button" class="auto-cond-btn" data-role="cond" aria-haspopup="dialog">
          <span class="auto-cond-key">条件</span>
          <span class="auto-cond-text" data-role="cond-text"></span>
          ${ic(`chevron-right`, 16)}
        </button>
        <details class="weak-terms-panel" data-role="weak-terms" hidden></details>
        <div class="auto-score-row">
          <p class="progress-text" data-role="score"></p>
          <button type="button" class="btn btn-secondary btn-sm" data-role="retry">${ic(`refresh`, 16)}新しい問題</button>
        </div>
      </div>
      <div class="quiz-list" data-role="auto-list"></div>
      <div class="card quiz-summary" data-role="summary" tabindex="-1" hidden></div>
    `;
    const condBtn = body.querySelector(`[data-role="cond"]`);
    const condText = body.querySelector(`[data-role="cond-text"]`);
    const list = body.querySelector(`[data-role="auto-list"]`);
    const scoreText = body.querySelector(`[data-role="score"]`);
    const weakPanel = body.querySelector(`[data-role="weak-terms"]`);
    const summaryEl = body.querySelector(`[data-role="summary"]`);

    weakPanel.open = saved ? saved.weakOpen : false;
    weakPanel.addEventListener(`toggle`, saveAuto);

    function condLabel(c) {
      return `${levelLabel(c.level)}・${topicLabel(c.topic)}・${c.count}問${c.weak ? `・苦手優先` : ``}${c.lawOnly ? `・根拠法令だけ` : ``}`;
    }

    function paintConds() {
      condText.textContent = condLabel(cond);
      condBtn.setAttribute(`aria-label`, `出題の条件: ${condLabel(cond)}(タップで変更)`);
    }

    // 条件のシート: 選んでから「この条件で出題」で作り直す(チップを押すたびに問題が入れ替わらないように)
    condBtn.addEventListener(`click`, () => {
      const draft = Object.assign({}, cond);
      const content = document.createElement(`div`);
      content.className = `filter-sheet`;
      content.innerHTML = `
        <p class="filter-sheet-label" id="auto-level-label">レベル</p>
        <div class="chip-row" data-role="level-chips" role="group" aria-labelledby="auto-level-label"></div>
        <p class="filter-sheet-label" id="auto-topic-label">トピック</p>
        <div class="chip-row filter-sheet-topics" data-role="topic-chips" role="group" aria-labelledby="auto-topic-label"></div>
        <p class="filter-sheet-label" id="auto-count-label">問題数・出題形式</p>
        <div class="chip-row" role="group" aria-labelledby="auto-count-label">
          <span class="chip-row" data-role="count-chips"></span>
          <button type="button" class="chip chip-small" data-role="law-only" aria-pressed="false">${ic(`library`, 14)}根拠法令だけ</button>
        </div>
        <label class="memorize-toggle filter-sheet-check"><input type="checkbox" data-role="weak-first"> 苦手な用語を優先して出題</label>
        <div class="filter-sheet-foot">
          <button type="button" class="btn btn-lg btn-block" data-role="filter-apply">この条件で出題</button>
          <button type="button" class="link-btn" data-role="filter-clear">条件をクリア</button>
        </div>
      `;
      const weakBox = content.querySelector(`[data-role="weak-first"]`);
      const lawBtn = content.querySelector(`[data-role="law-only"]`);
      const painters = [
        buildChips(content.querySelector(`[data-role="level-chips"]`), levelOptions(), () => draft.level, (v) => { draft.level = v; paint(); }),
        buildChips(content.querySelector(`[data-role="topic-chips"]`), topicOptions(), () => draft.topic, (v) => { draft.topic = v; paint(); }),
        buildChips(content.querySelector(`[data-role="count-chips"]`), AUTO_COUNTS.map((n) => ({ id: String(n), label: `${n}問` })), () => draft.count, (v) => { draft.count = Number(v); paint(); }),
      ];
      function paint() {
        painters.forEach((p) => p());
        weakBox.checked = draft.weak;
        lawBtn.setAttribute(`aria-pressed`, String(draft.lawOnly));
        lawBtn.classList.toggle(`active`, draft.lawOnly);
      }
      weakBox.addEventListener(`change`, () => { draft.weak = weakBox.checked; });
      lawBtn.addEventListener(`click`, () => { draft.lawOnly = !draft.lawOnly; paint(); });
      content.querySelector(`[data-role="filter-clear"]`).addEventListener(`click`, () => {
        Object.assign(draft, { level: ALL, topic: ALL, weak: false, lawOnly: false });
        paint();
      });
      paint();
      const sh = UI.sheet({ title: `出題の条件`, content });
      content.querySelector(`[data-role="filter-apply"]`).addEventListener(`click`, () => {
        sh.close(false);
        condBtn.focus({ preventScroll: true });
        const same = [`level`, `topic`, `count`, `weak`, `lawOnly`].every((k) => draft[k] === cond[k]);
        if (same) return;
        changeCond(() => {
          Object.assign(cond, draft);
          savePrefs({ autoCount: cond.count });
        });
      });
    });

    function answeredCount() {
      return items.filter((it) => it.picked != null).length;
    }

    function inProgress() {
      const n = answeredCount();
      return n > 0 && n < items.length;
    }

    // 条件の変更・新しい問題: 回答の途中なら確かめてから作り直す(取りやめたら表示を元の条件に戻す)
    function changeCond(apply) {
      const go = () => {
        apply();
        paintConds();
        generate();
      };
      if (!inProgress()) { go(); return; }
      UI.confirm(`回答の途中です。新しい問題に切り替えますか?(ここまでの回答の記録は残ります)`, { confirmLabel: `切り替える`, cancelLabel: `このまま続ける` })
        .then((ok) => { if (ok) go(); else paintConds(); });
    }

    body.querySelector(`[data-role="retry"]`).addEventListener(`click`, () => changeCond(() => {}));

    // 開くと上位3語を表示し、残りは「ほか n語」で出す(長い一覧で問題が下に押し出されないように)
    // fixedIds: 戻る・再読み込みでは、問題を作ったときと同じ用語を出す(その後の回答で出たり増えたりすると一覧がずれるため)
    let weakShownIds = [];
    function renderWeakPanel(fixedIds) {
      const weakIds = Array.isArray(fixedIds)
        ? fixedIds.filter((id) => AppIndex.termsById[id] && stats[id])
        : Object.keys(stats)
          // 作品由来の俗語(worksOnly)は出題しないので、以前の成績があっても出さない
          .filter((id) => stats[id].wrong > 0 && stats[id].wrong >= stats[id].correct && AppIndex.termsById[id] && AppIndex.termsById[id].worksOnly !== true)
          .sort((a, b) => (stats[b].wrong - stats[b].correct) - (stats[a].wrong - stats[a].correct))
          .slice(0, 8);
      weakShownIds = weakIds;
      if (!weakIds.length) { weakPanel.hidden = true; weakPanel.innerHTML = ``; return; }
      weakPanel.hidden = false;
      const chip = (id) => termLinkHtml(id, `${esc(AppIndex.termsById[id].name)}(${stats[id].wrong}回不正解)`);
      const rest = weakIds.slice(3);
      weakPanel.innerHTML = `
        <summary class="weak-terms-summary">${ic(`target`, 14)}<span class="weak-terms-label">苦手な用語(自動生成クイズの成績)</span><span class="weak-terms-count num">${weakIds.length}語</span>${ic(`chevron-down`, 16)}</summary>
        <div class="weak-terms-chips">
          ${weakIds.slice(0, 3).map(chip).join(``)}
          ${rest.length ? `<span class="weak-terms-rest" data-role="weak-rest" hidden>${rest.map(chip).join(``)}</span><button type="button" class="link-btn" data-role="weak-more" aria-expanded="false">ほか${rest.length}語</button>` : ``}
        </div>
      `;
      const more = weakPanel.querySelector(`[data-role="weak-more"]`);
      if (more) {
        more.addEventListener(`click`, () => {
          weakPanel.querySelector(`[data-role="weak-rest"]`).hidden = false;
          more.remove();
        });
      }
    }

    function saveAuto() {
      patchHistoryState({
        autoState: {
          level: cond.level, topic: cond.topic, weak: cond.weak, count: cond.count, lawOnly: cond.lawOnly,
          weakOpen: weakPanel.open, weakIds: weakShownIds.slice(),
          questions: items.map((it) => ({
            termId: it.q.term.id, type: it.q.type, stem: it.q.stem,
            choices: it.q.choices.map((c) => ({ text: c.text, correct: !!c.correct })), picked: it.picked,
          })),
        },
      });
    }

    function generate(missedOnly) {
      const missed = missedTerms();
      const opts = cond.lawOnly ? { types: [`law-ref`] } : undefined;
      const questions = (missedOnly && missed.length)
        ? QuizEngine.buildQuestionsFromTerms(missed, opts)
        : QuizEngine.generateAutoQuiz(cond.level, cond.topic, cond.count, cond.weak ? stats : null, opts);
      items = questions.map((q) => ({ q, picked: null }));
      ctx.lastAnswered = null;
      // 苦手な用語パネル(一覧の上)は新しい問題を作ったときだけ更新する。回答のたびに伸びると一覧がずれるため
      renderWeakPanel();
      renderItems();
      saveAuto();
    }

    function missedTerms() {
      const seen = new Set();
      return items.filter((it) => it.picked != null && !it.q.choices[it.picked].correct)
        .map((it) => it.q.term)
        .filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
    }

    function updateScore() {
      const score = items.filter((it) => it.picked != null && it.q.choices[it.picked].correct).length;
      scoreText.textContent = items.length ? `${answeredCount()} / ${items.length}問回答・正解 ${score}問` : ``;
    }

    function renderItems() {
      list.innerHTML = ``;
      summaryEl.hidden = true;
      summaryEl.innerHTML = ``;
      updateScore();
      if (!items.length) {
        list.appendChild(UI.emptyState(cond.lawOnly
          ? { icon: `library`, title: `根拠法令の問題を出せる用語がありません`, body: `レベルやトピックを変えるか、「根拠法令だけ」を外してみてください。` }
          : { icon: `search`, title: `出題できる用語がありません`, body: `レベルやトピックの絞り込みを変えてみてください。` }));
        return;
      }
      const fragment = document.createDocumentFragment();
      items.forEach((it, i) => fragment.appendChild(buildAutoCard(it, i + 1)));
      list.appendChild(fragment);
      refreshNextButtons();
      if (answeredCount() === items.length) renderSummary();
    }

    // 回答済みのカードの「次の問題」の表示を、今の回答状況に合わせる(後ろに未回答がなければ「未回答の問題へ」「結果を見る」)
    function refreshNextButtons() {
      const cards = Array.from(list.querySelectorAll(`.quiz-card`));
      const anyLeft = cards.some((c) => !c.classList.contains(`is-answered`));
      cards.forEach((c) => {
        const b = c.querySelector(`[data-role="next-q"]`);
        if (!b) return;
        const label = nextUnansweredAfter(c) ? `次の問題` : anyLeft ? `未回答の問題へ` : `結果を見る`;
        if (b.dataset.label !== label) {
          b.dataset.label = label;
          b.innerHTML = nextBtnInner(label);
        }
      });
    }

    list.addEventListener(`click`, (e) => {
      const b = e.target.closest ? e.target.closest(`[data-role="next-q"]`) : null;
      if (!b) return;
      const card = b.closest(`.quiz-card`);
      const target = nextUnansweredAfter(card) || list.querySelector(`.quiz-card:not(.is-answered)`);
      if (target) { focusCard(target); return; }
      if (!summaryEl.hidden) {
        summaryEl.scrollIntoView({ behavior: UI.prefersReducedMotion() ? `auto` : `smooth`, block: `start` });
        summaryEl.focus({ preventScroll: true });
      }
    });

    function renderSummary() {
      const total = items.length;
      const score = items.filter((it) => it.q.choices[it.picked].correct).length;
      const pct = Math.round((score / total) * 100);
      const passed = pct >= PASS_PCT;
      const missed = missedTerms();
      summaryEl.hidden = false;
      summaryEl.innerHTML = `
        <div class="recommend-head">
          <h3 class="card-title">${ic(passed ? `trophy` : `flag`, 20)} 今回の結果</h3>
          <span class="stat-value">${score}<small>/${total}問</small></span>
        </div>
        <div class="quiz-summary-bar">
          <div class="progress-bar progress-bar-lg" aria-hidden="true"><div class="progress-bar-fill ${passed ? `fill-success` : ``}" style="width:${pct}%"></div></div>
          <span class="quiz-summary-pct num">正答率 ${pct}%</span>
        </div>
        ${missed.length ? `
          <p class="quiz-summary-label">間違えた用語(${missed.length}語)— タップで説明を確認できます</p>
          <div class="chip-row quiz-missed">${missed.map((t) => termLinkHtml(t.id, esc(t.name))).join(``)}</div>
          <p class="quiz-summary-note">間違えた用語は「今日の復習」にも追加済みです。</p>`
        : `<p class="quiz-summary-note">全問正解です。お疲れさまでした。</p>`}
        ${streakLineHtml()}
        <div class="card-actions">
          ${missed.length ? `<button type="button" class="btn" data-role="redo-missed">${ic(`repeat`)}間違えた問題だけもう一度(${missed.length}問)</button>` : ``}
          <button type="button" class="btn ${missed.length ? `btn-secondary` : ``}" data-role="new-set">${ic(`refresh`)}新しい問題</button>
        </div>
      `;
      const redoBtn = summaryEl.querySelector(`[data-role="redo-missed"]`);
      if (redoBtn) redoBtn.addEventListener(`click`, () => { generate(true); UI.scrollIntoView(list, `start`); });
      summaryEl.querySelector(`[data-role="new-set"]`).addEventListener(`click`, () => { generate(); UI.scrollIntoView(list, `start`); });
    }

    function recordStat(termId, correct) {
      // 別のタブでの記録を消さないよう、最新の値を読み直してから加算する
      const latest = Storage.get(`autoQuizStats`, {});
      Object.keys(latest).forEach((k) => { if (Storage.isPlainObject(latest[k])) stats[k] = latest[k]; });
      if (!stats[termId]) stats[termId] = { wrong: 0, correct: 0 };
      stats[termId][correct ? `correct` : `wrong`] = (Number(stats[termId][correct ? `correct` : `wrong`]) || 0) + 1;
      Storage.set(`autoQuizStats`, stats);
      if (window.Streak) Streak.recordToday();
      if (!correct) Srs.grade(termId, 1, { silent: true });
    }

    function buildAutoCard(it, num) {
      const q = it.q;
      const correctIdx = q.choices.findIndex((c) => c.correct);
      const card = document.createElement(`div`);
      card.className = `card quiz-card`;
      card.dataset.termId = q.term.id;
      const typeLabel = q.type === `law-ref` ? `<span class="source-tag">${ic(`library`, 12)} 根拠法令</span>`
        : q.type === `name-from-def` ? `<span class="source-tag">用語を選ぶ</span>` : `<span class="source-tag">意味を選ぶ</span>`;
      card.innerHTML = `
        <div class="quiz-card-head">
          <span class="badge badge-${q.term.level}">${q.term.level}</span>
          ${typeLabel}
          <span class="quiz-num">Q${num}</span>
        </div>
        <p class="quiz-question">${esc(q.stem)}</p>
        <div class="choice-list" role="group" aria-label="選択肢" data-role="choices"></div>
        <div class="quiz-after" data-role="after"></div>
      `;
      const choiceList = card.querySelector(`[data-role="choices"]`);
      const afterEl = card.querySelector(`[data-role="after"]`);
      // 判定は回答バーとしてカードの最後に置く
      const verdictEl = verdictElement();
      card.appendChild(verdictEl);

      function paint(restored) {
        const ok = it.picked === correctIdx;
        card.classList.add(`is-answered`);
        if (restored) card.classList.add(`is-restored`);
        paintChoices(choiceList, q.choices, it.picked);
        showVerdict(verdictEl, ok, mcVerdictSub(ok, correctIdx, q.term, `用語の説明はこの下から開けます`));
        verdictEl.insertAdjacentHTML(`beforeend`, nextBtnHtml(`次の問題`));
        // 根拠法令・意味を選ぶ問題は、用語の意味も1行で確認できるように
        const meaning = q.type === `law-ref` || q.type === `def-from-name`
          ? `<p class="quiz-meaning"><strong>${esc(q.term.name)}</strong>: ${esc(QuizEngine.truncate(String(q.term.simpleExplanation || ``), 60))}</p>` : ``;
        // 自動生成の問題は用語の説明から作るので、誤りの報告は「用語」として送る
        const meta = reportMetaHtml({ kind: `term`, id: q.term.id, title: q.term.name, location: `#glossary/${q.term.id}` }, q.term.asOf);
        afterEl.innerHTML = `${!ok ? reviewAddedHtml(q.term.name) : ``}${meaning}<div class="quiz-after-links">${termLinkHtml(q.term.id)}</div>${meta}`;
      }

      q.choices.forEach((choice, i) => {
        const btn = choiceButton(i, choice.text);
        btn.addEventListener(`click`, () => {
          if (it.picked != null) return;
          it.picked = i;
          const ok = i === correctIdx;
          recordStat(q.term.id, ok);
          paint(false);
          ctx.lastAnswered = card;
          updateScore();
          refreshNextButtons();
          saveAuto();
          // 結果は「結果を見る」で見に行く(最後の問題の解説を読み終える前に画面が動かないように)
          if (answeredCount() === items.length) renderSummary();
        });
        choiceList.appendChild(btn);
      });
      if (it.picked != null) paint(true);
      return card;
    }

    paintConds();
    if (saved) {
      items = saved.items;
      renderWeakPanel(saved.weakIds);
      weakPanel.open = saved.weakOpen;
      renderItems();
    } else {
      generate();
    }
  }

  return { render, buildFixedCard, ensureNextButtons, openTermSheet, streakLineHtml, PASS_PCT };
})();
