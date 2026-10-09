// クイズビュー: 固定24問(苦手復習対応) + 自動生成クイズ(トピック絞り込み・苦手優先・根拠法令問題対応)
window.Views = window.Views || {};
window.Views.quiz = (function () {
  const LEVELS = [`全て`, `超入門`, `初級`, `中級`, `上級`];
  const AUTO_COUNT = 10;

  function render(root, param) {
    let startMode = `fixed`;
    let topicParam = param;
    let initialWeak = false;
    if (param && param.startsWith(`auto/`)) {
      startMode = `auto`;
      topicParam = param.slice(`auto/`.length);
      if (topicParam === `weak`) {
        initialWeak = true;
        topicParam = null;
      }
    }
    const initialTopic = topicParam && AppIndex.topicsById[topicParam] ? topicParam : `全て`;

    const wrap = document.createElement(`div`);
    wrap.className = `view quiz-view`;
    wrap.innerHTML = `
      <h2>クイズ</h2>
      <div class="chip-row" data-role="mode-chips">
        <button type="button" class="chip${startMode === `fixed` ? ` active` : ``}" data-mode="fixed">確認問題(24問)</button>
        <button type="button" class="chip${startMode === `auto` ? ` active` : ``}" data-mode="auto">自動生成クイズ</button>
      </div>
      <div data-role="quiz-body"></div>
    `;
    root.appendChild(wrap);

    const body = wrap.querySelector(`[data-role="quiz-body"]`);
    wrap.querySelectorAll(`[data-mode]`).forEach((btn) => {
      btn.addEventListener(`click`, () => {
        wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.classList.toggle(`active`, b === btn));
        if (btn.dataset.mode === `fixed`) renderFixed(body, initialTopic); else renderAuto(body, initialTopic);
      });
    });

    if (startMode === `auto`) renderAuto(body, initialTopic, initialWeak); else renderFixed(body, initialTopic);
  }

  function buildTopicChips(container, selected, onChange) {
    const topicOptions = [{ id: `全て`, name: `全トピック` }, ...window.APP_DATA.topics.map((t) => ({ id: t.id, name: t.name }))];
    topicOptions.forEach((opt) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip chip-small` + (opt.id === selected.value ? ` active` : ``);
      chip.textContent = opt.name;
      chip.addEventListener(`click`, () => {
        selected.value = opt.id;
        container.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === opt.name));
        onChange();
      });
      container.appendChild(chip);
    });
  }

  // ===== 確認問題(固定24問) =====

  function renderFixed(body, initialTopic) {
    const history = Storage.get(`quizHistory`, {});
    let level = `全て`;
    let reviewOnly = false;
    const topicState = { value: initialTopic || `全て` };

    body.innerHTML = `
      <div class="toolbar">
        <div class="chip-row" data-role="level-chips"></div>
        <div class="chip-row" data-role="topic-chips"></div>
        <label class="memorize-toggle"><input type="checkbox" data-role="review-only"> 苦手な問題だけ表示(「わからなかった」を選んだ問題)</label>
      </div>
      <div class="quiz-list" data-role="quiz-list"></div>
    `;
    const chipRow = body.querySelector(`[data-role="level-chips"]`);
    const topicChipRow = body.querySelector(`[data-role="topic-chips"]`);
    const list = body.querySelector(`[data-role="quiz-list"]`);

    LEVELS.forEach((lvl) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (lvl === level ? ` active` : ``);
      chip.textContent = lvl;
      chip.addEventListener(`click`, () => {
        level = lvl;
        chipRow.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === lvl));
        renderList();
      });
      chipRow.appendChild(chip);
    });

    buildTopicChips(topicChipRow, topicState, renderList);

    body.querySelector(`[data-role="review-only"]`).addEventListener(`change`, (e) => {
      reviewOnly = e.target.checked;
      renderList();
    });

    function handleResultChange() {
      if (reviewOnly) renderList();
    }

    function renderList() {
      list.innerHTML = ``;
      const questions = window.APP_DATA.quiz.filter((q) => {
        if (level !== `全て` && q.level !== level) return false;
        if (topicState.value !== `全て` && !(q.topicIds || []).includes(topicState.value)) return false;
        if (reviewOnly && history[q.id] !== `ng`) return false;
        return true;
      });
      if (!questions.length) {
        list.innerHTML = `<p class="view-desc">${reviewOnly ? `苦手な問題はありません。「わからなかった」を選んだ問題がここに表示されます。` : `該当する問題がありません。`}</p>`;
        return;
      }
      questions.forEach((q) => list.appendChild(buildQuestionCard(q, history, handleResultChange)));
    }

    renderList();
  }

  function buildQuestionCard(q, history, onResultChange) {
    const card = document.createElement(`div`);
    card.className = `card quiz-card`;
    const episodeChips = (q.episodes || []).map((epId) => {
      const ep = AppIndex.episodesById[epId];
      const label = ep ? ep.displayLabel : epId;
      return `<button type="button" class="chip chip-small" data-nav="#summary/${epId}">${label}</button>`;
    }).join(``);
    const priorResult = history[q.id];
    const reviewTag = priorResult === `ng` ? `<span class="review-status review-status-ng">前回: 復習対象</span>`
      : priorResult === `ok` ? `<span class="review-status review-status-ok">前回: わかった</span>` : ``;

    card.innerHTML = `
      <div class="quiz-card-head">
        <span class="badge badge-${q.level}">${q.level}</span>
        ${reviewTag}
      </div>
      <p class="quiz-question"><strong>Q.</strong> ${q.question}</p>
      <button type="button" class="btn" data-role="reveal">答えを見る</button>
      <p class="quiz-answer" data-role="answer" hidden><strong>A.</strong> ${q.answer}</p>
      <div class="episode-chip-row" data-role="chips" hidden>${episodeChips}</div>
      <div class="self-report" data-role="self-report" hidden>
        <button type="button" class="btn" data-result="ok">わかった</button>
        <button type="button" class="btn" data-result="ng">わからなかった</button>
      </div>
    `;

    card.querySelector(`[data-role="reveal"]`).addEventListener(`click`, (e) => {
      card.querySelector(`[data-role="answer"]`).hidden = false;
      card.querySelector(`[data-role="chips"]`).hidden = false;
      card.querySelector(`[data-role="self-report"]`).hidden = false;
      e.target.hidden = true;
    });

    card.querySelectorAll(`[data-nav]`).forEach((btn) => {
      btn.addEventListener(`click`, () => Router.navigate(btn.dataset.nav));
    });

    card.querySelectorAll(`[data-result]`).forEach((btn) => {
      btn.addEventListener(`click`, () => {
        history[q.id] = btn.dataset.result;
        Storage.set(`quizHistory`, history);
        if (window.Streak) window.Streak.recordToday();
        card.querySelectorAll(`[data-result]`).forEach((b) => b.classList.toggle(`active`, b === btn));
        if (onResultChange) onResultChange();
      });
    });

    return card;
  }

  // ===== 共通ユーティリティ =====

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 正解の用語が持つtopicIdsを基準に、関連性の高い順(同トピック×同レベル → 同トピック×他レベル →
  // トピック不問×同レベル → トピック不問×他レベル)にダミー候補を集める。必要数より多めに返し、
  // generateAutoQuiz側で選択肢テキストの重複を避けるためのバッファとして使う。
  function pickDistractors(allTerms, correctTerm, want) {
    const excludeId = correctTerm.id;
    const correctTopics = correctTerm.topicIds || [];
    const shareTopic = (t) => correctTopics.length > 0 && (t.topicIds || []).some((id) => correctTopics.includes(id));
    const tiers = [
      allTerms.filter((t) => t.id !== excludeId && shareTopic(t) && t.level === correctTerm.level),
      allTerms.filter((t) => t.id !== excludeId && shareTopic(t) && t.level !== correctTerm.level),
      allTerms.filter((t) => t.id !== excludeId && !shareTopic(t) && t.level === correctTerm.level),
      allTerms.filter((t) => t.id !== excludeId && !shareTopic(t) && t.level !== correctTerm.level),
    ];
    const picked = [];
    const usedIds = new Set([excludeId]);
    tiers.forEach((tier) => {
      shuffle(tier).forEach((t) => {
        if (picked.length >= want || usedIds.has(t.id)) return;
        usedIds.add(t.id);
        picked.push(t);
      });
    });
    return picked;
  }

  // 根拠法令クイズ用: 自分と異なるlawRefを持つ他の用語からダミー候補を集める
  function pickLawRefDistractors(allTerms, correctTerm, want) {
    const pool = allTerms.filter((t) => t.id !== correctTerm.id && t.lawRef && t.lawRef !== correctTerm.lawRef);
    return shuffle(pool).slice(0, want);
  }

  // 上限文字数の直前(手前15文字以内)に句読点があればそこで切り、不自然な文中カットを避ける
  function truncate(text, max) {
    if (text.length <= max) return text;
    const slice = text.slice(0, max);
    const windowStart = Math.max(0, max - 15);
    let cutAt = -1;
    for (let i = slice.length - 1; i >= windowStart; i--) {
      if (slice[i] === `、` || slice[i] === `。`) { cutAt = i + 1; break; }
    }
    return (cutAt > -1 ? text.slice(0, cutAt) : slice) + `…`;
  }

  function buildChoiceText(term, type) {
    if (type === `name-from-def`) return term.name;
    if (type === `law-ref`) return truncate(term.lawRef, 50);
    return truncate(term.simpleExplanation, 60);
  }

  // stats({termId:{wrong,correct}})がある場合、不正解が多い用語ほど先に来るよう並べ替える
  // (同程度の苦手度の中ではランダム性を保つ)
  function orderByWeakness(pool, stats) {
    const withScore = pool.map((t) => ({
      t,
      score: stats[t.id] ? (stats[t.id].wrong - stats[t.id].correct) : 0,
      rand: Math.random(),
    }));
    withScore.sort((a, b) => (b.score - a.score) || (b.rand - a.rand));
    return withScore.map((x) => x.t);
  }

  function generateAutoQuiz(level, topicId, count, weakStats) {
    let pool = AppIndex.allTerms.filter((t) => level === `全て` || t.level === level);
    if (topicId && topicId !== `全て`) pool = pool.filter((t) => (t.topicIds || []).includes(topicId));

    const orderedPool = weakStats ? orderByWeakness(pool, weakStats) : shuffle(pool);
    const questions = [];
    orderedPool.some((term) => {
      if (questions.length >= count) return true;

      const lawEligible = !!term.lawRef && AppIndex.allTerms.filter((t) => t.id !== term.id && t.lawRef && t.lawRef !== term.lawRef).length >= 3;
      const typeOptions = lawEligible ? [`name-from-def`, `def-from-name`, `law-ref`] : [`name-from-def`, `def-from-name`];
      const type = typeOptions[Math.floor(Math.random() * typeOptions.length)];

      const correctText = buildChoiceText(term, type);
      const usedTexts = new Set([correctText]);
      const candidates = type === `law-ref` ? pickLawRefDistractors(AppIndex.allTerms, term, 8) : pickDistractors(AppIndex.allTerms, term, 8);
      const distractors = [];
      candidates.forEach((cand) => {
        if (distractors.length >= 3) return;
        const text = buildChoiceText(cand, type);
        if (usedTexts.has(text)) return; // 選択肢テキストの重複(切り詰め後の偶然の一致含む)を回避
        usedTexts.add(text);
        distractors.push({ text, correct: false });
      });
      if (distractors.length < 3) return false; // 4択が揃わない用語は出題をスキップし次の候補へ

      const choices = shuffle([{ text: correctText, correct: true }, ...distractors]);
      const stem = type === `name-from-def` ? term.simpleExplanation
        : type === `law-ref` ? `${term.name} の根拠法令は?`
        : term.name;
      questions.push({ stem, choices, term, type });
      return false;
    });
    return questions;
  }

  // ===== 自動生成クイズ =====

  function renderAuto(body, initialTopic, initialWeak) {
    let level = `全て`;
    const topicState = { value: initialTopic || `全て` };
    let weakFirst = !!initialWeak;
    let score = 0;
    let answered = 0;
    const stats = Storage.get(`autoQuizStats`, {});

    body.innerHTML = `
      <div class="toolbar">
        <div class="chip-row" data-role="level-chips"></div>
        <div class="chip-row" data-role="topic-chips"></div>
        <label class="memorize-toggle"><input type="checkbox" data-role="weak-first" ${weakFirst ? `checked` : ``}> 苦手な用語を優先して出題</label>
        <button type="button" class="btn" data-role="retry">再挑戦</button>
      </div>
      <p class="progress-text" data-role="score"></p>
      <div class="weak-terms-panel" data-role="weak-terms"></div>
      <div class="quiz-list" data-role="auto-list"></div>
    `;
    const chipRow = body.querySelector(`[data-role="level-chips"]`);
    const topicChipRow = body.querySelector(`[data-role="topic-chips"]`);
    const list = body.querySelector(`[data-role="auto-list"]`);
    const scoreText = body.querySelector(`[data-role="score"]`);
    const weakPanel = body.querySelector(`[data-role="weak-terms"]`);

    LEVELS.forEach((lvl) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (lvl === level ? ` active` : ``);
      chip.textContent = lvl;
      chip.addEventListener(`click`, () => {
        level = lvl;
        chipRow.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === lvl));
        generate();
      });
      chipRow.appendChild(chip);
    });

    buildTopicChips(topicChipRow, topicState, generate);

    body.querySelector(`[data-role="weak-first"]`).addEventListener(`change`, (e) => {
      weakFirst = e.target.checked;
      generate();
    });

    body.querySelector(`[data-role="retry"]`).addEventListener(`click`, generate);

    function renderWeakPanel() {
      const weakIds = Object.keys(stats)
        .filter((id) => stats[id].wrong > 0 && stats[id].wrong >= stats[id].correct && AppIndex.termsById[id])
        .sort((a, b) => (stats[b].wrong - stats[b].correct) - (stats[a].wrong - stats[a].correct))
        .slice(0, 6);
      if (!weakIds.length) { weakPanel.innerHTML = ``; return; }
      weakPanel.innerHTML = `<span class="weak-terms-label">苦手な用語:</span>` + weakIds.map((id) => {
        const t = AppIndex.termsById[id];
        return `<button type="button" class="chip chip-small" data-nav="#glossary/${id}">${t.name}(${stats[id].wrong}回不正解)</button>`;
      }).join(``);
      weakPanel.querySelectorAll(`[data-nav]`).forEach((btn) => btn.addEventListener(`click`, () => Router.navigate(btn.dataset.nav)));
    }

    function generate() {
      score = 0;
      answered = 0;
      updateScore();
      renderWeakPanel();
      const questions = generateAutoQuiz(level, topicState.value, AUTO_COUNT, weakFirst ? stats : null);
      list.innerHTML = ``;
      if (!questions.length) {
        list.innerHTML = `<p class="view-desc">該当する用語がありません。フィルタを変更してください。</p>`;
        return;
      }
      questions.forEach((q) => list.appendChild(buildAutoCard(q)));
    }

    function updateScore() {
      scoreText.textContent = `スコア: ${score} / ${answered}`;
    }

    function recordStat(termId, correct) {
      if (!stats[termId]) stats[termId] = { wrong: 0, correct: 0 };
      stats[termId][correct ? `correct` : `wrong`]++;
      Storage.set(`autoQuizStats`, stats);
      if (window.Streak) window.Streak.recordToday();
    }

    function buildAutoCard(q) {
      const card = document.createElement(`div`);
      card.className = `card quiz-card`;
      const typeLabel = q.type === `law-ref` ? `<span class="chip chip-small chip-muted">根拠法令</span>` : ``;
      card.innerHTML = `
        <div class="quiz-card-head">
          <span class="badge badge-${q.term.level}">${q.term.level}</span>
          ${typeLabel}
        </div>
        <p class="quiz-question">${q.stem}</p>
        <div class="choice-list" data-role="choices"></div>
      `;
      const choiceList = card.querySelector(`[data-role="choices"]`);
      q.choices.forEach((choice) => {
        const btn = document.createElement(`button`);
        btn.type = `button`;
        btn.className = `btn choice-btn`;
        btn.textContent = choice.text;
        btn.addEventListener(`click`, () => {
          if (btn.disabled) return;
          choiceList.querySelectorAll(`button`).forEach((b) => b.disabled = true);
          if (choice.correct) {
            btn.classList.add(`correct`);
            score++;
          } else {
            btn.classList.add(`incorrect`);
            const correctBtn = Array.from(choiceList.children).find((b, i) => q.choices[i].correct);
            if (correctBtn) correctBtn.classList.add(`correct`);
          }
          recordStat(q.term.id, choice.correct);
          renderWeakPanel();
          answered++;
          updateScore();
        });
        choiceList.appendChild(btn);
      });
      return card;
    }

    generate();
  }

  return { render };
})();
