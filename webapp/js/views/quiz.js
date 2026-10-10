// クイズビュー: 確認問題(記述式の自己採点+4択、SRS連携) + 自動生成クイズ(トピック絞り込み・苦手優先・根拠法令問題)
// ルート: #quiz / #quiz/q/<問題ID> / #quiz/auto / #quiz/auto/<topicId> / #quiz/auto/weak
window.Views = window.Views || {};
window.Views.quiz = (function () {
  const LEVELS = [`全て`, `超入門`, `初級`, `中級`, `上級`];
  const AUTO_COUNT = 10;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  function getHistory() {
    const h = Storage.get(`quizHistory`, {});
    return h && typeof h === `object` && !Array.isArray(h) ? h : {};
  }

  function render(root, param) {
    let startMode = `fixed`;
    let topicParam = null;
    let initialWeak = false;
    let focusQuizId = null;
    if (param === `auto`) {
      startMode = `auto`;
    } else if (param && param.startsWith(`auto/`)) {
      startMode = `auto`;
      topicParam = param.slice(`auto/`.length);
      if (topicParam === `weak`) { initialWeak = true; topicParam = null; }
    } else if (param && param.startsWith(`q/`)) {
      focusQuizId = param.slice(`q/`.length);
    } else if (param) {
      topicParam = param;
    }
    const initialTopic = topicParam && AppIndex.topicsById[topicParam] ? topicParam : `全て`;
    const fixedCount = window.APP_DATA.quiz.length;

    const wrap = document.createElement(`div`);
    wrap.className = `view quiz-view`;
    wrap.innerHTML = `
      <h2>クイズ</h2>
      <p class="view-desc">確認問題は答えを思い出してから確かめる形式(一部4択)、自動生成クイズは用語集から毎回ちがう4択を出題します。間違えた用語は「今日の復習」に自動で追加されます。</p>
      <div class="segmented" role="group" aria-label="出題モード" data-role="mode-chips" style="margin-bottom: var(--sp-4);">
        <button type="button" class="segmented-item" data-mode="fixed" aria-pressed="${startMode === `fixed`}">${ic(`list`, 16)}確認問題(${fixedCount}問)</button>
        <button type="button" class="segmented-item" data-mode="auto" aria-pressed="${startMode === `auto`}">${ic(`sparkles`, 16)}自動生成クイズ</button>
      </div>
      <div data-role="quiz-body"></div>
    `;
    root.appendChild(wrap);

    const body = wrap.querySelector(`[data-role="quiz-body"]`);
    wrap.querySelectorAll(`[data-mode]`).forEach((btn) => {
      btn.addEventListener(`click`, () => {
        wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b === btn)));
        if (btn.dataset.mode === `fixed`) renderFixed(body, initialTopic); else renderAuto(body, initialTopic);
      });
    });

    if (startMode === `auto`) renderAuto(body, initialTopic, initialWeak);
    else renderFixed(body, initialTopic, focusQuizId);
  }

  function buildLevelChips(container, state, onChange) {
    LEVELS.forEach((lvl) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip chip-small` + (lvl === state.value ? ` active` : ``);
      chip.textContent = lvl;
      chip.addEventListener(`click`, () => {
        state.value = lvl;
        container.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c === chip));
        onChange();
      });
      container.appendChild(chip);
    });
  }

  function buildTopicChips(container, selected, onChange) {
    const topicOptions = [{ id: `全て`, name: `全トピック` }, ...window.APP_DATA.topics.map((t) => ({ id: t.id, name: t.name, icon: t.icon }))];
    topicOptions.forEach((opt) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip chip-small` + (opt.id === selected.value ? ` active` : ``);
      chip.innerHTML = `${opt.icon ? ic(opt.icon, 14) : ``}${esc(opt.name)}`;
      chip.addEventListener(`click`, () => {
        selected.value = opt.id;
        container.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c === chip));
        onChange();
      });
      container.appendChild(chip);
    });
  }

  function bookmarkBtnHtml(key) {
    const on = window.Bookmarks && Bookmarks.has(key);
    return `<button type="button" class="btn btn-icon bookmark-toggle${on ? ` is-bookmarked` : ``}" data-role="bookmark" aria-pressed="${!!on}" aria-label="${on ? `ブックマークを外す` : `ブックマークする`}">${ic(on ? `bookmark-fill` : `bookmark`, 20)}</button>`;
  }

  function wireBookmark(card, key) {
    const btn = card.querySelector(`[data-role="bookmark"]`);
    if (!btn || !window.Bookmarks) return;
    btn.addEventListener(`click`, (e) => {
      e.stopPropagation();
      const on = Bookmarks.toggle(key);
      btn.classList.toggle(`is-bookmarked`, on);
      btn.setAttribute(`aria-pressed`, String(on));
      btn.setAttribute(`aria-label`, on ? `ブックマークを外す` : `ブックマークする`);
      btn.innerHTML = ic(on ? `bookmark-fill` : `bookmark`, 20);
    });
  }

  function glossaryLinkHtml(termId) {
    const term = termId ? AppIndex.termsById[termId] : null;
    if (!term) return ``;
    return `<a class="chip chip-small chip-muted" href="#glossary/${term.id}">${ic(`layers`, 14)}用語集で確認: ${esc(term.name)}</a>`;
  }

  // ===== 確認問題 =====

  function renderFixed(body, initialTopic, focusQuizId) {
    const history = getHistory();
    const levelState = { value: `全て` };
    const topicState = { value: focusQuizId ? `全て` : (initialTopic || `全て`) };
    let statusFilter = `all`;

    body.innerHTML = `
      <div class="toolbar toolbar-stack">
        <div class="chip-row" data-role="level-chips"></div>
        <div class="chip-row chip-row-scroll" data-role="topic-chips"></div>
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

    buildLevelChips(body.querySelector(`[data-role="level-chips"]`), levelState, renderList);
    buildTopicChips(body.querySelector(`[data-role="topic-chips"]`), topicState, renderList);

    function setStatus(s) {
      statusFilter = s;
      statusGroup.querySelectorAll(`[data-status]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.status === s)));
      renderList();
    }
    statusGroup.querySelectorAll(`[data-status]`).forEach((b) => b.addEventListener(`click`, () => setStatus(b.dataset.status)));

    function updateSummary() {
      const all = window.APP_DATA.quiz;
      const answered = all.filter((q) => history[q.id] === `ok` || history[q.id] === `ng`).length;
      const ok = all.filter((q) => history[q.id] === `ok`).length;
      summary.textContent = `回答済み ${answered} / ${all.length}問・わかった ${ok}問`;
    }

    function handleResult() {
      updateSummary();
      if (statusFilter === `ng` || statusFilter === `unanswered`) setTimeout(renderList, 900);
    }

    function renderList() {
      list.innerHTML = ``;
      updateSummary();
      const questions = window.APP_DATA.quiz.filter((q) => {
        if (levelState.value !== `全て` && q.level !== levelState.value) return false;
        if (topicState.value !== `全て` && !(q.topicIds || []).includes(topicState.value)) return false;
        if (statusFilter === `ng` && history[q.id] !== `ng`) return false;
        if (statusFilter === `unanswered` && (history[q.id] === `ok` || history[q.id] === `ng`)) return false;
        if (statusFilter === `bookmark` && !(window.Bookmarks && Bookmarks.has(`quiz:${q.id}`))) return false;
        return true;
      });
      if (!questions.length) {
        const map = {
          ng: { icon: `check-circle`, title: `苦手な問題はありません`, body: `「わからなかった」を選んだ問題や4択で間違えた問題がここに集まります。` },
          unanswered: { icon: `trophy`, title: `すべて回答済みです`, body: `条件に合う未回答の問題はありません。` },
          bookmark: { icon: `bookmark`, title: `保存した問題はありません`, body: `問題カード右上のブックマークで保存できます。` },
        };
        list.appendChild(UI.emptyState(map[statusFilter] || { icon: `search`, title: `該当する問題がありません`, body: `レベルやトピックの絞り込みを変えてみてください。` }));
        return;
      }
      questions.forEach((q) => list.appendChild(buildFixedCard(q, { history, onResult: handleResult, onGotoNg: () => setStatus(`ng`) })));
    }

    renderList();

    if (focusQuizId) {
      const target = list.querySelector(`[data-quiz-id="${CSS.escape(focusQuizId)}"]`);
      if (target) {
        target.classList.add(`highlighted`);
        requestAnimationFrame(() => UI.scrollIntoView(target));
        setTimeout(() => target.classList.remove(`highlighted`), 2400);
      }
    }
  }

  function recordFixedResult(q, result, history) {
    history[q.id] = result;
    Storage.set(`quizHistory`, history);
    if (window.Streak) Streak.recordToday();
    if (result === `ng` && q.relatedTermId && AppIndex.termsById[q.relatedTermId]) Srs.grade(q.relatedTermId, 1);
  }

  // 確認問題のカード。opts: { history, onResult, onGotoNg }
  // topics.js のトピック詳細からも再利用する
  function buildFixedCard(q, opts) {
    opts = opts || {};
    const history = opts.history || getHistory();
    const isMc = QuizEngine.isMcItem(q);
    const card = document.createElement(`div`);
    card.className = `card quiz-card`;
    card.dataset.quizId = q.id;
    const episodeChips = (q.episodes || []).map((epId) => {
      const ep = AppIndex.episodesById[epId];
      return `<a class="chip chip-small" href="#summary/${epId}">${ic(`play-square`, 14)}${esc(ep ? ep.displayLabel : epId)}</a>`;
    }).join(``);
    const prior = history[q.id];
    const priorTag = prior === `ng` ? `<span class="review-status review-status-ng">${ic(`x-circle`, 12)}前回: 復習対象</span>`
      : prior === `ok` ? `<span class="review-status review-status-ok">${ic(`check-circle`, 12)}前回: 正解</span>` : ``;

    card.innerHTML = `
      <div class="quiz-card-head">
        <span class="badge badge-${q.level}">${q.level}</span>
        <span class="source-tag">${isMc ? `4択` : `記述`}</span>
        ${priorTag}
        <span style="margin-left:auto;">${bookmarkBtnHtml(`quiz:${q.id}`)}</span>
      </div>
      <p class="quiz-question"><strong>Q.</strong> ${esc(q.question)}</p>
      <div data-role="body"></div>
      <div class="result-badge-row" data-role="result-badge"></div>
    `;
    wireBookmark(card, `quiz:${q.id}`);
    const bodyEl = card.querySelector(`[data-role="body"]`);
    const badge = card.querySelector(`[data-role="result-badge"]`);

    function showResult(result) {
      badge.innerHTML = result === `ok`
        ? `<span class="review-status review-status-ok">${ic(`check-circle`, 12)}正解</span>${glossaryLinkHtml(q.relatedTermId)}`
        : `<span class="review-status review-status-ng">${ic(`repeat`, 12)}今日の復習に追加しました</span>${glossaryLinkHtml(q.relatedTermId)}${opts.onGotoNg ? `<button type="button" class="link-btn" data-role="goto-ng">苦手な問題だけ表示</button>` : ``}`;
      const gotoNg = badge.querySelector(`[data-role="goto-ng"]`);
      if (gotoNg) gotoNg.addEventListener(`click`, () => opts.onGotoNg());
      if (!UI.prefersReducedMotion()) {
        card.classList.add(result === `ok` ? `flash-ok` : `flash-ng`);
        setTimeout(() => card.classList.remove(`flash-ok`, `flash-ng`), 700);
      }
    }

    if (isMc) {
      const mq = QuizEngine.fromFixedMc(q, { keepOrder: true });
      bodyEl.innerHTML = `<div class="choice-list" role="group" aria-label="選択肢"></div><div data-role="explain"></div>`;
      const choiceList = bodyEl.querySelector(`.choice-list`);
      mq.choices.forEach((choice, i) => {
        const btn = document.createElement(`button`);
        btn.type = `button`;
        btn.className = `btn choice-btn`;
        btn.innerHTML = `<span class="choice-key">${i + 1}</span><span>${esc(choice.text)}</span>`;
        btn.addEventListener(`click`, () => {
          if (btn.disabled) return;
          choiceList.querySelectorAll(`button`).forEach((b) => { b.disabled = true; });
          const correctIdx = mq.choices.findIndex((c) => c.correct);
          if (choice.correct) btn.classList.add(`correct`);
          else {
            btn.classList.add(`incorrect`);
            choiceList.children[correctIdx].classList.add(`correct`);
          }
          bodyEl.querySelector(`[data-role="explain"]`).innerHTML = `<p class="quiz-answer"><strong>正解: ${correctIdx + 1}</strong> ${esc(mq.explanation)}</p>`;
          const result = choice.correct ? `ok` : `ng`;
          recordFixedResult(q, result, history);
          showResult(result);
          if (opts.onResult) opts.onResult(result);
        });
        choiceList.appendChild(btn);
      });
    } else {
      bodyEl.innerHTML = `
        <button type="button" class="btn btn-secondary" data-role="reveal">${ic(`eye`)}答えを見る</button>
        <div data-role="answer-area" hidden>
          <p class="quiz-answer"><strong>A.</strong> ${esc(q.answer)}</p>
          ${episodeChips ? `<div class="episode-chip-row">${episodeChips}</div>` : ``}
          <p class="calc-note" style="margin: var(--sp-2) 0 var(--sp-1);">思い出せましたか?</p>
          <div class="self-report">
            <button type="button" class="btn btn-success" data-result="ok">${ic(`check`)}わかった</button>
            <button type="button" class="btn btn-secondary" data-result="ng">${ic(`x`)}わからなかった</button>
          </div>
        </div>
      `;
      bodyEl.querySelector(`[data-role="reveal"]`).addEventListener(`click`, (e) => {
        bodyEl.querySelector(`[data-role="answer-area"]`).hidden = false;
        e.currentTarget.hidden = true;
      });
      bodyEl.querySelectorAll(`[data-result]`).forEach((btn) => {
        btn.addEventListener(`click`, () => {
          const result = btn.dataset.result;
          recordFixedResult(q, result, history);
          bodyEl.querySelectorAll(`[data-result]`).forEach((b) => b.classList.toggle(`active`, b === btn));
          showResult(result);
          if (opts.onResult) opts.onResult(result);
        });
      });
    }
    return card;
  }

  // ===== 自動生成クイズ =====

  function renderAuto(body, initialTopic, initialWeak) {
    const levelState = { value: `全て` };
    const topicState = { value: initialTopic || `全て` };
    let weakFirst = !!initialWeak;
    let score = 0;
    let answered = 0;
    let totalQuestions = 0;
    let missedTermIds = new Set();
    const stats = Storage.get(`autoQuizStats`, {});

    body.innerHTML = `
      <div class="toolbar toolbar-stack">
        <div class="chip-row" data-role="level-chips"></div>
        <div class="chip-row chip-row-scroll" data-role="topic-chips"></div>
        <div class="chip-row" style="align-items:center;">
          <label class="memorize-toggle"><input type="checkbox" data-role="weak-first" ${weakFirst ? `checked` : ``}> 苦手な用語を優先して出題</label>
          <button type="button" class="btn btn-secondary btn-sm" data-role="retry">${ic(`refresh`, 16)}新しい問題</button>
        </div>
      </div>
      <p class="progress-text" data-role="score"></p>
      <div class="weak-terms-panel" data-role="weak-terms"></div>
      <div class="quiz-list" data-role="auto-list"></div>
      <div class="card quiz-summary" data-role="summary" hidden></div>
    `;
    const list = body.querySelector(`[data-role="auto-list"]`);
    const scoreText = body.querySelector(`[data-role="score"]`);
    const weakPanel = body.querySelector(`[data-role="weak-terms"]`);
    const summaryEl = body.querySelector(`[data-role="summary"]`);

    buildLevelChips(body.querySelector(`[data-role="level-chips"]`), levelState, () => generate());
    buildTopicChips(body.querySelector(`[data-role="topic-chips"]`), topicState, () => generate());

    body.querySelector(`[data-role="weak-first"]`).addEventListener(`change`, (e) => {
      weakFirst = e.target.checked;
      generate();
    });
    body.querySelector(`[data-role="retry"]`).addEventListener(`click`, () => generate());

    function renderWeakPanel() {
      const weakIds = Object.keys(stats)
        .filter((id) => stats[id].wrong > 0 && stats[id].wrong >= stats[id].correct && AppIndex.termsById[id])
        .sort((a, b) => (stats[b].wrong - stats[b].correct) - (stats[a].wrong - stats[a].correct))
        .slice(0, 6);
      if (!weakIds.length) { weakPanel.innerHTML = ``; return; }
      weakPanel.innerHTML = `<span class="weak-terms-label">${ic(`target`, 14)} 苦手な用語:</span>` + weakIds.map((id) => {
        const t = AppIndex.termsById[id];
        return `<a class="chip chip-small chip-muted" href="#glossary/${id}">${esc(t.name)}(${stats[id].wrong}回不正解)</a>`;
      }).join(``);
    }

    function generate(missedOnly) {
      score = 0;
      answered = 0;
      updateScore();
      renderWeakPanel();
      summaryEl.hidden = true;
      summaryEl.innerHTML = ``;
      const priorMissed = missedTermIds;
      missedTermIds = new Set();
      const questions = (missedOnly && priorMissed.size)
        ? QuizEngine.buildQuestionsFromTerms(Array.from(priorMissed).map((id) => AppIndex.termsById[id]).filter(Boolean))
        : QuizEngine.generateAutoQuiz(levelState.value, topicState.value, AUTO_COUNT, weakFirst ? stats : null);
      totalQuestions = questions.length;
      list.innerHTML = ``;
      if (!questions.length) {
        list.appendChild(UI.emptyState({ icon: `search`, title: `出題できる用語がありません`, body: `レベルやトピックの絞り込みを変えてみてください。` }));
        return;
      }
      questions.forEach((q, i) => list.appendChild(buildAutoCard(q, i + 1)));
    }

    function updateScore() {
      scoreText.textContent = totalQuestions ? `${answered} / ${totalQuestions}問回答・正解 ${score}問` : ``;
    }

    function checkCompletion() {
      if (totalQuestions === 0 || answered < totalQuestions) return;
      const pct = Math.round((score / totalQuestions) * 100);
      summaryEl.hidden = false;
      summaryEl.innerHTML = `
        <div class="recommend-head">
          <h3 class="card-title" style="margin:0;">${ic(pct >= 70 ? `trophy` : `flag`, 20)} 今回の結果</h3>
          <span class="stat-value">${score}<small>/${totalQuestions}問</small></span>
        </div>
        <div class="progress-bar progress-bar-lg" style="margin: var(--sp-2) 0 var(--sp-3);"><div class="progress-bar-fill ${pct >= 70 ? `fill-success` : ``}" style="width:${pct}%"></div></div>
        ${missedTermIds.size
          ? `<p class="view-desc">間違えた${missedTermIds.size}問の用語は「今日の復習」にも追加済みです。</p>
             <div class="card-actions"><button type="button" class="btn" data-role="redo-missed">${ic(`repeat`)}間違えた問題だけもう一度(${missedTermIds.size}問)</button>
             <button type="button" class="btn btn-secondary" data-role="new-set">${ic(`refresh`)}新しい問題</button></div>`
          : `<p class="view-desc">全問正解です。お疲れさまでした。</p>
             <div class="card-actions"><button type="button" class="btn" data-role="new-set">${ic(`refresh`)}新しい問題</button></div>`}
      `;
      const redoBtn = summaryEl.querySelector(`[data-role="redo-missed"]`);
      if (redoBtn) redoBtn.addEventListener(`click`, () => { generate(true); UI.scrollIntoView(list, `start`); });
      summaryEl.querySelector(`[data-role="new-set"]`).addEventListener(`click`, () => { generate(); UI.scrollIntoView(list, `start`); });
      UI.scrollIntoView(summaryEl);
    }

    function recordStat(termId, correct) {
      if (!stats[termId]) stats[termId] = { wrong: 0, correct: 0 };
      stats[termId][correct ? `correct` : `wrong`]++;
      Storage.set(`autoQuizStats`, stats);
      if (window.Streak) Streak.recordToday();
      if (!correct) Srs.grade(termId, 1);
    }

    function buildAutoCard(q, num) {
      const card = document.createElement(`div`);
      card.className = `card quiz-card`;
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
        <div class="result-badge-row" data-role="after"></div>
      `;
      const choiceList = card.querySelector(`[data-role="choices"]`);
      const after = card.querySelector(`[data-role="after"]`);
      q.choices.forEach((choice, i) => {
        const btn = document.createElement(`button`);
        btn.type = `button`;
        btn.className = `btn choice-btn`;
        btn.innerHTML = `<span class="choice-key">${i + 1}</span><span>${esc(choice.text)}</span>`;
        btn.addEventListener(`click`, () => {
          if (btn.disabled) return;
          choiceList.querySelectorAll(`button`).forEach((b) => { b.disabled = true; });
          if (choice.correct) {
            btn.classList.add(`correct`);
            score++;
          } else {
            btn.classList.add(`incorrect`);
            const correctBtn = Array.from(choiceList.children).find((b, idx) => q.choices[idx].correct);
            if (correctBtn) correctBtn.classList.add(`correct`);
            missedTermIds.add(q.term.id);
          }
          after.innerHTML = glossaryLinkHtml(q.term.id);
          recordStat(q.term.id, choice.correct);
          renderWeakPanel();
          answered++;
          updateScore();
          checkCompletion();
        });
        choiceList.appendChild(btn);
      });
      return card;
    }

    generate();
  }

  return { render, buildFixedCard };
})();
