// クイズビュー: 確認問題(本試験と同じ4択。選択肢ごとの○×の理由・SRS連携) + 自動生成クイズ(トピック絞り込み・苦手優先・根拠法令問題)
// ルート: #quiz / #quiz/<topicId> / #quiz/q/<問題ID> / #quiz/auto / #quiz/auto/<topicId> / #quiz/auto/weak / #quiz/auto/<topicId>/weak
// 戻る・再読み込みで回答の途中から続けられるよう、画面の状態を履歴エントリの state に保存する
//   qState:    { level, topic, status, shown, answered: { 問題ID: 選んだ番号 } }(確認問題)
//   autoState: { level, topic, weak, count, lawOnly, condOpen, weakOpen,
//                questions: [{ termId, type, stem, choices: [{ text, correct }], picked }] }(自動生成クイズ)
// 確認問題の絞り込みと自動生成クイズの問題数は Storage `quizPrefs` にも保存する(タブから開き直しても同じ条件で表示)
window.Views = window.Views || {};
window.Views.quiz = (function () {
  const ALL = `全て`; // 「すべて」を表す内部ID(保存済みの履歴・QuizEngine と合わせるため値は変えない。表示は「すべて」)
  const LEVELS = [ALL, `超入門`, `初級`, `中級`, `上級`];
  const STATUSES = [`all`, `unanswered`, `ng`, `bookmark`];
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

    const wrap = document.createElement(`div`);
    wrap.className = `view quiz-view`;
    wrap.innerHTML = `
      <h2>クイズ</h2>
      <p class="view-desc">確認問題は本試験と同じ4択で、選択肢ごとに○×の理由と根拠条文を確認できます。自動生成クイズは用語集から毎回ちがう4択を出題します。間違えた用語は「今日の復習」に自動で追加されます。</p>
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
        const next = card && card.isConnected ? card.querySelector(`[data-role="next-q"]`) : null;
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
      ${term.deepDive ? `<p class="term-deep"><strong>${window.CardUi && CardUi.deepDiveLabel ? CardUi.deepDiveLabel(term, topic ? topic.id : null) : `もう一歩踏み込むと`}:</strong> ${term.deepDive}</p>` : ``}
      ${window.CardUi ? CardUi.buildLawRefHtml(term) + CardUi.buildSourceCitationHtml(term) : ``}
      ${diagrams.length ? `
        <div class="term-sheet-figure">
          <button type="button" class="btn btn-secondary btn-sm" data-role="figure" aria-expanded="false">${ic(`diagram`, 16)}<span>図解を見る</span></button>
          <div data-role="figure-area" hidden></div>
        </div>` : ``}
      <div class="term-sheet-links">
        ${topic ? `<a class="btn btn-secondary btn-sm" href="#topics/${topic.id}/${term.id}">${ic(`book-open`, 16)}トピックで開く</a>` : ``}
        <a class="btn btn-secondary btn-sm" href="#glossary/${term.id}">${ic(`layers`, 16)}用語集で開く</a>
      </div>
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

  // 選択肢のすぐ下に出す判定(正解 / 不正解 — あなたの回答 1/正解 3)と、復習に追加した用語
  function verdictHtml(ok, picked, correctIdx, term) {
    const head = ok
      ? `<p class="quiz-verdict is-ok">${ic(`check-circle`, 20)}<strong>正解</strong></p>`
      : `<p class="quiz-verdict is-ng">${ic(`x-circle`, 20)}<strong>不正解</strong><span class="quiz-verdict-detail">— あなたの回答 ${picked + 1}/正解 ${correctIdx + 1}</span></p>`;
    return head + (!ok && term ? reviewAddedHtml(term.name) : ``);
  }

  function nextBtnHtml(label) {
    return `<button type="button" class="btn btn-secondary btn-block quiz-next" data-role="next-q" data-label="${label}">${nextBtnInner(label)}</button>`;
  }

  function nextBtnInner(label) {
    return `<span>${label}</span>${ic(label === `結果を見る` ? `flag` : `chevron-down`, 18)}`;
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

  function flashCard(card, ok) {
    if (UI.prefersReducedMotion()) return;
    card.classList.add(ok ? `flash-ok` : `flash-ng`);
    setTimeout(() => card.classList.remove(`flash-ok`, `flash-ng`), 700);
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
    return {
      level: LEVELS.includes(raw.level) ? raw.level : ALL,
      topic: validTopic(raw.topic) ? raw.topic : ALL,
      status: STATUSES.includes(raw.status) ? raw.status : `all`,
      shown: Number.isInteger(shown) && shown > 0 ? Math.min(shown, total) : 0,
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
    // この一覧で回答したカード(問題ID → 選んだ番号)。戻るで解説ごと再現するために state に保存する
    let answeredMap = saved ? saved.answered : {};
    const doFocus = !!focusQuizId && !saved;

    body.innerHTML = `
      <div class="toolbar toolbar-stack">
        <div class="chip-row" data-role="level-chips" role="group" aria-label="レベル"></div>
        <div class="chip-row chip-row-scroll" data-role="topic-chips" role="group" aria-label="トピック"></div>
        <div class="segmented" role="group" aria-label="表示する問題" data-role="status">
          <button type="button" class="segmented-item" data-status="all" aria-pressed="true">すべて</button>
          <button type="button" class="segmented-item" data-status="unanswered" aria-pressed="false">未回答</button>
          <button type="button" class="segmented-item" data-status="ng" aria-pressed="false">${ic(`x-circle`, 14)}苦手</button>
          <button type="button" class="segmented-item" data-status="bookmark" aria-pressed="false">${ic(`bookmark`, 14)}保存</button>
        </div>
      </div>
      <p class="progress-text" data-role="summary"></p>
      <div class="quiz-list" data-role="quiz-list"></div>
    `;
    const list = body.querySelector(`[data-role="quiz-list"]`);
    const summary = body.querySelector(`[data-role="summary"]`);
    const statusGroup = body.querySelector(`[data-role="status"]`);
    const paintStatus = () => statusGroup.querySelectorAll(`[data-status]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.status === statusFilter)));
    paintStatus();

    // 一覧は絞り込みを変えるまで作り直さないので、PAGE と shownCount は先に用意しておく
    const PAGE = 30;
    let currentQuestions = [];
    let shownCount = 0;
    let firstList = true;

    function saveState() {
      patchHistoryState({ qState: { level: levelState.value, topic: topicState.value, status: statusFilter, shown: shownCount, answered: answeredMap } });
    }

    // 選択状態の塗り直しは renderList の中で行う
    const paintLevel = buildChips(body.querySelector(`[data-role="level-chips"]`), levelOptions(), () => levelState.value, (v) => {
      levelState.value = v;
      savePrefs({ level: v });
      renderList();
    });
    const paintTopic = buildChips(body.querySelector(`[data-role="topic-chips"]`), topicOptions(), () => topicState.value, (v) => {
      topicState.value = v;
      savePrefs({ topic: v });
      renderList();
    });

    function setStatus(s) {
      statusFilter = s;
      paintStatus();
      savePrefs({ status: s });
      renderList();
    }
    statusGroup.querySelectorAll(`[data-status]`).forEach((b) => b.addEventListener(`click`, () => {
      if (b.dataset.status !== statusFilter) setStatus(b.dataset.status);
    }));

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

    // 「苦手な問題だけ表示」: 絞り込み後、一覧の先頭が見える位置へ戻す
    function gotoNg() {
      setStatus(`ng`);
      const top = statusGroup.getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
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

    // restoring: 戻る・再読み込みで、保存しておいた回答済みのカードを元の位置に出す
    function renderList(restoring) {
      if (!restoring) answeredMap = {};
      paintLevel();
      paintTopic();
      list.innerHTML = ``;
      updateSummary();
      const questions = window.APP_DATA.quiz.filter((q) => {
        if (levelState.value !== ALL && q.level !== levelState.value) return false;
        if (topicState.value !== ALL && !(q.topicIds || []).includes(topicState.value)) return false;
        if (restoring && answeredMap[q.id] != null) return true;
        if (statusFilter === `ng` && qHistory[q.id] !== `ng`) return false;
        if (statusFilter === `unanswered` && (qHistory[q.id] === `ok` || qHistory[q.id] === `ng`)) return false;
        if (statusFilter === `bookmark` && !(window.Bookmarks && Bookmarks.has(`quiz:${q.id}`))) return false;
        return true;
      });
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
        saveState();
        return;
      }
      currentQuestions = questions;
      // 直リンク(#quiz/q/<id>)の初回は、その問題まで表示する
      let need = PAGE;
      if (firstList && doFocus) {
        const idx = questions.findIndex((q) => q.id === focusQuizId);
        if (idx >= 0) need = Math.max(PAGE, idx + 5);
      }
      firstList = false;
      if (restoreShown) { need = Math.max(need, restoreShown); restoreShown = 0; }
      shownCount = Math.min(questions.length, need);
      appendCards(0, shownCount);
      renderMore();
      saveState();
    }

    renderList(true);

    if (doFocus) {
      const target = list.querySelector(`[data-quiz-id="${CSS.escape(focusQuizId)}"]`);
      if (target) {
        target.classList.add(`highlighted`);
        requestAnimationFrame(() => UI.scrollIntoView(target));
        // スクロールに時間がかかる端末でも目に入るよう、強調は長めに残す
        setTimeout(() => target.classList.remove(`highlighted`), 5000);
      } else {
        UI.toast(`指定された問題が見つかりませんでした`, `default`);
      }
    }
  }

  function recordFixedResult(q, result, qHistory) {
    // 別のタブでの回答を消さないよう、最新の記録を読み直してから書き込む
    Object.assign(qHistory, getHistory());
    qHistory[q.id] = result;
    Storage.set(`quizHistory`, qHistory);
    if (window.Streak) Streak.recordToday();
    if (result === `ng` && q.relatedTermId && AppIndex.termsById[q.relatedTermId]) Srs.grade(q.relatedTermId, 1, { silent: true });
  }

  // 「次の問題へ」: 同じ一覧の後ろに問題があるカードだけに付ける(トピック詳細・ブックマークの一覧でも同じ)
  function ensureNextButton(card) {
    const box = card.querySelector(`[data-role="explain"]`);
    if (!box || !card.isConnected || box.querySelector(`[data-role="next-q"]`) || !followingCard(card)) return;
    box.insertAdjacentHTML(`beforeend`, nextBtnHtml(`次の問題へ`));
  }

  // 確認問題のカード。topics.js(トピック詳細)・bookmarks.js からも使う
  // opts: { history, onResult(result, card, picked, restored), onGotoNg, onBookmark(on, card), restoreChoice }
  // restoreChoice: 戻る・再読み込みのとき、回答済みの表示(解説つき)を記録し直さずに再現する(4択は選んだ番号、記述は 'ok'/'ng')
  function buildFixedCard(q, opts) {
    opts = opts || {};
    const qHistory = opts.history || getHistory();
    const isMc = QuizEngine.isMcItem(q);
    const term = q.relatedTermId && AppIndex.termsById[q.relatedTermId] ? AppIndex.termsById[q.relatedTermId] : null;
    const card = document.createElement(`div`);
    card.className = `card quiz-card`;
    card.dataset.quizId = q.id;
    const episodeChips = (q.episodes || []).map((epId) => {
      const ep = AppIndex.episodesById[epId];
      return `<a class="chip chip-small" href="#summary/${epId}">${ic(`play-square`, 14)}${esc(ep ? ep.displayLabel : epId)}</a>`;
    }).join(``);
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
    card.addEventListener(`click`, (e) => {
      const nb = e.target.closest ? e.target.closest(`[data-role="next-q"]`) : null;
      if (!nb) return;
      const target = nextUnansweredAfter(card) || followingCard(card);
      if (target) focusCard(target);
      else nb.remove();
    });
    const bodyEl = card.querySelector(`[data-role="body"]`);

    function afterLinksHtml(ok) {
      const links = `${termLinkHtml(q.relatedTermId)}${!ok && opts.onGotoNg ? `<button type="button" class="link-btn" data-role="goto-ng">苦手な問題だけ表示</button>` : ``}`;
      return links ? `<div class="quiz-after-links">${links}</div>` : ``;
    }

    function wireGotoNg(container) {
      const btn = container.querySelector(`[data-role="goto-ng"]`);
      if (btn) btn.addEventListener(`click`, () => opts.onGotoNg());
    }

    // 戻るで復元したカードは一覧に入ってから「次の問題へ」の要否を決める
    function placeNext(restored) {
      if (restored) requestAnimationFrame(() => ensureNextButton(card));
      else ensureNextButton(card);
    }

    if (isMc) {
      const mq = QuizEngine.fromFixedMc(q, { keepOrder: true });
      const correctIdx = mq.choices.findIndex((c) => c.correct);
      bodyEl.innerHTML = `
        <div class="choice-list" role="group" aria-label="選択肢"></div>
        <div class="quiz-feedback" data-role="verdict" role="status" aria-live="polite"></div>
        <div class="quiz-after" data-role="explain"></div>
      `;
      const choiceList = bodyEl.querySelector(`.choice-list`);
      const verdictEl = bodyEl.querySelector(`[data-role="verdict"]`);
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
        verdictEl.innerHTML = verdictHtml(ok, picked, correctIdx, term);
        explainEl.innerHTML = `
          ${mq.explanation ? `<div class="quiz-explain"><p class="quiz-explain-title">全体の解説</p><p class="quiz-explain-text">${esc(mq.explanation)}</p></div>` : ``}
          ${afterLinksHtml(ok)}
        `;
        wireGotoNg(explainEl);
        if (!restored) {
          recordFixedResult(q, result, qHistory);
          flashCard(card, ok);
        }
        if (opts.onResult) opts.onResult(result, card, picked, !!restored);
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
          ${episodeChips ? `<div class="episode-chip-row">${episodeChips}</div>` : ``}
          <p class="quiz-self-ask">思い出せましたか?</p>
          <div class="self-report">
            <button type="button" class="btn btn-success" data-result="ok">${ic(`check`)}わかった</button>
            <button type="button" class="btn btn-secondary" data-result="ng">${ic(`x`)}わからなかった</button>
          </div>
        </div>
        <div class="quiz-feedback" data-role="verdict" role="status" aria-live="polite"></div>
        <div class="quiz-after" data-role="explain"></div>
      `;
      const revealBtn = bodyEl.querySelector(`[data-role="reveal"]`);
      const answerArea = bodyEl.querySelector(`[data-role="answer-area"]`);
      const verdictEl = bodyEl.querySelector(`[data-role="verdict"]`);
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
        verdictEl.innerHTML = `<p class="quiz-verdict ${ok ? `is-ok` : `is-ng`}">${ic(ok ? `check-circle` : `x-circle`, 20)}<strong>${ok ? `わかった` : `わからなかった`}</strong></p>${!ok && term ? reviewAddedHtml(term.name) : ``}`;
        explainEl.innerHTML = afterLinksHtml(ok);
        wireGotoNg(explainEl);
        if (!restored) {
          recordFixedResult(q, result, qHistory);
          flashCard(card, ok);
        }
        if (opts.onResult) opts.onResult(result, card, result, !!restored);
        placeNext(restored);
      }
      bodyEl.querySelectorAll(`[data-result]`).forEach((btn) => btn.addEventListener(`click`, () => showResult(btn.dataset.result, false)));
      if (opts.restoreChoice === `ok` || opts.restoreChoice === `ng`) showResult(opts.restoreChoice, true);
    }
    return card;
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

    body.innerHTML = `
      <div class="auto-top">
        <details class="auto-cond" data-role="cond">
          <summary class="auto-cond-summary">
            <span class="auto-cond-key">条件</span>
            <span class="auto-cond-text" data-role="cond-text"></span>
            ${ic(`chevron-down`, 16)}
          </summary>
          <div class="auto-cond-body">
            <p class="auto-cond-label" id="auto-level-label">レベル</p>
            <div class="chip-row" data-role="level-chips" role="group" aria-labelledby="auto-level-label"></div>
            <p class="auto-cond-label" id="auto-topic-label">トピック</p>
            <div class="chip-row chip-row-scroll" data-role="topic-chips" role="group" aria-labelledby="auto-topic-label"></div>
            <p class="auto-cond-label" id="auto-count-label">問題数・出題形式</p>
            <div class="chip-row" role="group" aria-labelledby="auto-count-label">
              <span class="chip-row" data-role="count-chips"></span>
              <button type="button" class="chip chip-small" data-role="law-only" aria-pressed="false">${ic(`library`, 14)}根拠法令だけ</button>
            </div>
            <label class="memorize-toggle"><input type="checkbox" data-role="weak-first"> 苦手な用語を優先して出題</label>
          </div>
        </details>
        <details class="weak-terms-panel" data-role="weak-terms" hidden></details>
        <div class="auto-score-row">
          <p class="progress-text" data-role="score"></p>
          <button type="button" class="btn btn-secondary btn-sm" data-role="retry">${ic(`refresh`, 16)}新しい問題</button>
        </div>
      </div>
      <div class="quiz-list" data-role="auto-list"></div>
      <div class="card quiz-summary" data-role="summary" tabindex="-1" hidden></div>
    `;
    const condEl = body.querySelector(`[data-role="cond"]`);
    const condText = body.querySelector(`[data-role="cond-text"]`);
    const list = body.querySelector(`[data-role="auto-list"]`);
    const scoreText = body.querySelector(`[data-role="score"]`);
    const weakPanel = body.querySelector(`[data-role="weak-terms"]`);
    const summaryEl = body.querySelector(`[data-role="summary"]`);
    const weakBox = body.querySelector(`[data-role="weak-first"]`);
    const lawBtn = body.querySelector(`[data-role="law-only"]`);

    // スマホでは条件を1行にたたむ(PCは最初から開いておく)
    condEl.open = saved ? saved.condOpen : !!(window.matchMedia && window.matchMedia(`(min-width: 768px)`).matches);
    weakPanel.open = saved ? saved.weakOpen : false;
    condEl.addEventListener(`toggle`, saveAuto);
    weakPanel.addEventListener(`toggle`, saveAuto);

    const painters = [
      buildChips(body.querySelector(`[data-role="level-chips"]`), levelOptions(), () => cond.level, (v) => changeCond(() => { cond.level = v; })),
      buildChips(body.querySelector(`[data-role="topic-chips"]`), topicOptions(), () => cond.topic, (v) => changeCond(() => { cond.topic = v; })),
      buildChips(body.querySelector(`[data-role="count-chips"]`), AUTO_COUNTS.map((n) => ({ id: String(n), label: `${n}問` })), () => cond.count, (v) => changeCond(() => {
        cond.count = Number(v);
        savePrefs({ autoCount: cond.count });
      })),
    ];

    function paintConds() {
      painters.forEach((p) => p());
      weakBox.checked = cond.weak;
      lawBtn.setAttribute(`aria-pressed`, String(cond.lawOnly));
      lawBtn.classList.toggle(`active`, cond.lawOnly);
      condText.textContent = `${levelLabel(cond.level)}・${topicLabel(cond.topic)}・${cond.count}問${cond.weak ? `・苦手優先` : ``}${cond.lawOnly ? `・根拠法令だけ` : ``}`;
    }

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

    weakBox.addEventListener(`change`, () => {
      const v = weakBox.checked;
      changeCond(() => { cond.weak = v; });
    });
    lawBtn.addEventListener(`click`, () => changeCond(() => { cond.lawOnly = !cond.lawOnly; }));
    body.querySelector(`[data-role="retry"]`).addEventListener(`click`, () => changeCond(() => {}));

    // 開くと上位3語を表示し、残りは「ほか n語」で出す(長い一覧で問題が下に押し出されないように)
    // fixedIds: 戻る・再読み込みでは、問題を作ったときと同じ用語を出す(その後の回答で出たり増えたりすると一覧がずれるため)
    let weakShownIds = [];
    function renderWeakPanel(fixedIds) {
      const weakIds = Array.isArray(fixedIds)
        ? fixedIds.filter((id) => AppIndex.termsById[id] && stats[id])
        : Object.keys(stats)
          .filter((id) => stats[id].wrong > 0 && stats[id].wrong >= stats[id].correct && AppIndex.termsById[id])
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
          condOpen: condEl.open, weakOpen: weakPanel.open, weakIds: weakShownIds.slice(),
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

    // 回答済みのカードの「次の問題へ」の表示を、今の回答状況に合わせる(後ろに未回答がなければ「未回答の問題へ」「結果を見る」)
    function refreshNextButtons() {
      const cards = Array.from(list.querySelectorAll(`.quiz-card`));
      const anyLeft = cards.some((c) => !c.classList.contains(`is-answered`));
      cards.forEach((c) => {
        const b = c.querySelector(`[data-role="next-q"]`);
        if (!b) return;
        const label = nextUnansweredAfter(c) ? `次の問題へ` : anyLeft ? `未回答の問題へ` : `結果を見る`;
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
        <div class="quiz-feedback" data-role="verdict" role="status" aria-live="polite"></div>
        <div class="quiz-after" data-role="after"></div>
      `;
      const choiceList = card.querySelector(`[data-role="choices"]`);
      const verdictEl = card.querySelector(`[data-role="verdict"]`);
      const afterEl = card.querySelector(`[data-role="after"]`);

      function paint(restored) {
        const ok = it.picked === correctIdx;
        card.classList.add(`is-answered`);
        if (restored) card.classList.add(`is-restored`);
        paintChoices(choiceList, q.choices, it.picked);
        verdictEl.innerHTML = verdictHtml(ok, it.picked, correctIdx, q.term);
        // 根拠法令・意味を選ぶ問題は、用語の意味も1行で確認できるように
        const meaning = q.type === `law-ref` || q.type === `def-from-name`
          ? `<p class="quiz-meaning"><strong>${esc(q.term.name)}</strong>: ${esc(QuizEngine.truncate(String(q.term.simpleExplanation || ``), 60))}</p>` : ``;
        afterEl.innerHTML = `${meaning}<div class="quiz-after-links">${termLinkHtml(q.term.id)}</div>${nextBtnHtml(`次の問題へ`)}`;
      }

      q.choices.forEach((choice, i) => {
        const btn = choiceButton(i, choice.text);
        btn.addEventListener(`click`, () => {
          if (it.picked != null) return;
          it.picked = i;
          const ok = i === correctIdx;
          recordStat(q.term.id, ok);
          paint(false);
          flashCard(card, ok);
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

  return { render, buildFixedCard, openTermSheet, streakLineHtml, PASS_PCT };
})();
