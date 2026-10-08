// 学習トピックビュー: トピック一覧 + トピック詳細(基礎知識/用語/正直不動産の具体例/法律/クイズ)
window.Views = window.Views || {};
window.Views.topics = (function () {
  function render(root, param) {
    if (param) {
      const topic = AppIndex.topicsById[param];
      if (topic) { renderDetail(root, topic); return; }
    }
    renderList(root);
  }

  function topicLevelBadgeClass(level) {
    if (level.includes(`超入門`)) return `超入門`;
    if (level.includes(`上`)) return `上級`;
    if (level.includes(`中`)) return `中級`;
    return `初級`;
  }

  function computePct(ids, store, flagKey) {
    if (!ids.length) return { done: 0, total: 0, pct: 0 };
    const done = ids.filter((id) => store[id] && store[id][flagKey]).length;
    return { done, total: ids.length, pct: Math.round((done / ids.length) * 100) };
  }

  function renderList(root) {
    const basicsProgress = Storage.get(`basicsProgress`, {});
    const roadmap = Storage.get(`roadmap`, {});
    const known = Storage.get(`flashcards`, {});

    const wrap = document.createElement(`div`);
    wrap.className = `view topics-view`;
    wrap.innerHTML = `
      <h2>学習トピック</h2>
      <p class="view-desc">不動産学習の基本をトピック別に学べます。「正直不動産」のエピソードは各トピックの具体例として埋め込まれています。まずはここから始めるのがおすすめです。</p>
      <div class="dashboard-card" data-role="dashboard"></div>
      <div class="topic-grid" data-role="topic-grid"></div>
    `;
    root.appendChild(wrap);

    // 全体進捗サマリー(全トピック横断、重複を除いた実数で集計)
    const allBasicIds = [...new Set(window.APP_DATA.topics.flatMap((t) => t.basicIds))];
    const allEpisodeIds = window.APP_DATA.episodes.map((e) => e.id);
    const allTermIds = AppIndex.allTerms.map((t) => t.id);
    const overallBasics = computePct(allBasicIds, basicsProgress, `learned`);
    const overallEpisodes = computePct(allEpisodeIds, roadmap, `watched`);
    const knownTermCount = allTermIds.filter((id) => known[id]).length;

    const dashboard = wrap.querySelector(`[data-role="dashboard"]`);
    dashboard.innerHTML = `
      <div class="dashboard-stat"><span class="dashboard-num">${overallBasics.done}/${overallBasics.total}</span><span class="dashboard-label">基礎知識を学習済み</span></div>
      <div class="dashboard-stat"><span class="dashboard-num">${knownTermCount}/${allTermIds.length}</span><span class="dashboard-label">用語を記憶済み</span></div>
      <div class="dashboard-stat"><span class="dashboard-num">${overallEpisodes.done}/${overallEpisodes.total}</span><span class="dashboard-label">動画を視聴済み</span></div>
    `;

    const grid = wrap.querySelector(`[data-role="topic-grid"]`);
    window.APP_DATA.topics.forEach((topic) => {
      const basicsStat = computePct(topic.basicIds, basicsProgress, `learned`);
      const termIds = AppIndex.topicTermIndex[topic.id] || [];
      const knownCount = termIds.filter((id) => known[id]).length;
      const termPct = termIds.length ? Math.round((knownCount / termIds.length) * 100) : 0;
      const epStat = computePct(topic.episodes, roadmap, `watched`);

      const card = document.createElement(`div`);
      card.className = `card topic-card`;
      card.innerHTML = `
        <div class="card-header">
          <span class="episode-theme">${topic.name}</span>
          <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${topic.level}</span>
        </div>
        <p class="episode-summary">${topic.description}</p>
        <div class="topic-progress-row"><span>基礎知識</span><div class="progress-bar"><div class="progress-bar-fill" style="width:${basicsStat.pct}%"></div></div><span>${basicsStat.done}/${basicsStat.total}</span></div>
        <div class="topic-progress-row"><span>用語暗記</span><div class="progress-bar"><div class="progress-bar-fill fill-understood" style="width:${termPct}%"></div></div><span>${knownCount}/${termIds.length}</span></div>
        <div class="topic-progress-row"><span>動画視聴</span><div class="progress-bar"><div class="progress-bar-fill fill-video" style="width:${epStat.pct}%"></div></div><span>${epStat.done}/${epStat.total}</span></div>
        <button type="button" class="btn topic-open-btn">トピックを開く</button>
      `;
      card.querySelector(`.topic-open-btn`).addEventListener(`click`, () => Router.navigate(`#topics/${topic.id}`));
      grid.appendChild(card);
    });
  }

  function renderDetail(root, topic) {
    const basicsProgress = Storage.get(`basicsProgress`, {});
    const roadmap = Storage.get(`roadmap`, {});
    const known = Storage.get(`flashcards`, {});

    const wrap = document.createElement(`div`);
    wrap.className = `view topic-detail-view`;
    wrap.innerHTML = `
      <button type="button" class="btn back-btn" data-role="back">← トピック一覧</button>
      <div class="card-header">
        <span class="episode-theme">${topic.name}</span>
        <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${topic.level}</span>
      </div>
      <p class="view-desc">${topic.description}</p>

      <h3>基礎知識</h3>
      <ul class="basics-checklist" data-role="basics-list"></ul>

      <h3>用語</h3>
      <div class="card-grid" data-role="term-grid"></div>

      <h3>正直不動産の具体例</h3>
      <p class="view-desc">このトラブルが描かれる回:</p>
      <ul class="episode-checklist" data-role="episode-list"></ul>

      <div data-role="law-section"></div>

      <h3>トピック別クイズ</h3>
      <div class="quiz-list" data-role="quiz-list"></div>
      <button type="button" class="btn" data-role="auto-quiz-link">このトピックの自動生成クイズに挑戦</button>
    `;
    root.appendChild(wrap);

    wrap.querySelector(`[data-role="back"]`).addEventListener(`click`, () => Router.navigate(`#topics`));
    wrap.querySelector(`[data-role="auto-quiz-link"]`).addEventListener(`click`, () => Router.navigate(`#quiz/auto/${topic.id}`));

    // 基礎知識チェックリスト
    const basicsList = wrap.querySelector(`[data-role="basics-list"]`);
    topic.basicIds.forEach((conceptId) => {
      const concept = AppIndex.termsById[conceptId];
      if (!concept) return;
      const li = document.createElement(`li`);
      const isLearned = !!(basicsProgress[conceptId] && basicsProgress[conceptId].learned);
      li.className = `basics-item`;
      li.innerHTML = `
        <details>
          <summary>
            <label class="check-label" data-role="learned-label">
              <input type="checkbox" data-role="learned-checkbox" ${isLearned ? `checked` : ``}>
              ${concept.name}
            </label>
          </summary>
          <p class="term-simple">${concept.simpleExplanation}</p>
          <p class="term-deep"><strong>もう一歩踏み込むと:</strong> ${concept.deepDive}</p>
          ${buildLawRefHtml(concept)}
          ${buildSourceCitationHtml(concept)}
        </details>
      `;
      const checkbox = li.querySelector(`[data-role="learned-checkbox"]`);
      checkbox.addEventListener(`click`, (e) => e.stopPropagation());
      checkbox.addEventListener(`change`, (e) => {
        if (!basicsProgress[conceptId]) basicsProgress[conceptId] = {};
        basicsProgress[conceptId].learned = e.target.checked;
        Storage.set(`basicsProgress`, basicsProgress);
      });
      basicsList.appendChild(li);
    });

    // 用語フリップカード(作品由来+基礎知識)
    const termGrid = wrap.querySelector(`[data-role="term-grid"]`);
    const termIds = AppIndex.topicTermIndex[topic.id] || [];
    termIds.forEach((termId) => {
      const term = AppIndex.termsById[termId];
      if (term) termGrid.appendChild(buildTermCard(term, known));
    });

    // 正直不動産の具体例(エピソード一覧)
    const episodeList = wrap.querySelector(`[data-role="episode-list"]`);
    if (!topic.episodes.length) {
      const hasSourcedContent = (AppIndex.topicTermIndex[topic.id] || []).some((id) => (AppIndex.termsById[id].sources || []).length);
      const emptyLi = document.createElement(`li`);
      emptyLi.className = `episode-empty-state`;
      emptyLi.innerHTML = hasSourcedContent
        ? `このトピックは「正直不動産」に該当エピソードがありません。<button type="button" class="link-btn" data-nav="#sources">情報源タブ</button>の一次情報で確認してください。`
        : `このトピックは「正直不動産」に該当エピソードがありません。`;
      const navBtn = emptyLi.querySelector(`[data-nav]`);
      if (navBtn) navBtn.addEventListener(`click`, () => Router.navigate(`#sources`));
      episodeList.appendChild(emptyLi);
    }
    topic.episodes.forEach((epId) => {
      const ep = AppIndex.episodesById[epId];
      if (!ep) return;
      const li = document.createElement(`li`);
      const st = roadmap[epId] || { watched: false, understood: false };
      li.innerHTML = `
        <button type="button" class="ep-link" data-nav="#summary/${epId}">${ep.displayLabel} ${ep.theme}</button>
        <label class="check-label"><input type="checkbox" data-role="watched" ${st.watched ? `checked` : ``}> 視聴済み</label>
        <label class="check-label"><input type="checkbox" data-role="understood" ${st.understood ? `checked` : ``}> 理解済み</label>
      `;
      li.querySelector(`[data-nav]`).addEventListener(`click`, () => Router.navigate(`#summary/${epId}`));
      li.querySelector(`[data-role="watched"]`).addEventListener(`change`, (e) => {
        if (!roadmap[epId]) roadmap[epId] = { watched: false, understood: false };
        roadmap[epId].watched = e.target.checked;
        Storage.set(`roadmap`, roadmap);
      });
      li.querySelector(`[data-role="understood"]`).addEventListener(`change`, (e) => {
        if (!roadmap[epId]) roadmap[epId] = { watched: false, understood: false };
        roadmap[epId].understood = e.target.checked;
        Storage.set(`roadmap`, roadmap);
      });
      episodeList.appendChild(li);
    });

    // 関連法律(あれば表示)
    const lawIds = AppIndex.topicLawIndex[topic.id] || [];
    if (lawIds.length) {
      const lawSection = wrap.querySelector(`[data-role="law-section"]`);
      lawSection.innerHTML = `<h3>関連法律・制度</h3><div class="law-row-grid" data-role="rows"></div>`;
      const lawRowsEl = lawSection.querySelector(`[data-role="rows"]`);
      lawIds.forEach((lawId) => {
        const law = window.APP_DATA.laws.laws.find((l) => l.id === lawId);
        if (!law) return;
        const row = document.createElement(`div`);
        row.className = `law-row`;
        row.innerHTML = `<div class="law-name">${law.name}</div><div class="law-desc">${law.description}</div>`;
        lawRowsEl.appendChild(row);
      });
    }

    // トピック別クイズ(固定問題)
    const quizList = wrap.querySelector(`[data-role="quiz-list"]`);
    const quizIds = AppIndex.topicQuizIndex[topic.id] || [];
    quizIds.forEach((quizId) => {
      const q = window.APP_DATA.quiz.find((item) => item.id === quizId);
      if (q) quizList.appendChild(buildQuizCard(q));
    });

    function buildQuizCard(q) {
      const card = document.createElement(`div`);
      card.className = `card quiz-card`;
      card.innerHTML = `
        <span class="badge badge-${q.level}">${q.level}</span>
        <p class="quiz-question"><strong>Q.</strong> ${q.question}</p>
        <button type="button" class="btn" data-role="reveal">答えを見る</button>
        <p class="quiz-answer" data-role="answer" hidden><strong>A.</strong> ${q.answer}</p>
      `;
      card.querySelector(`[data-role="reveal"]`).addEventListener(`click`, (e) => {
        card.querySelector(`[data-role="answer"]`).hidden = false;
        e.target.hidden = true;
      });
      return card;
    }
  }

  function buildSourceCitationHtml(term) {
    return CardUi.buildSourceCitationHtml(term);
  }

  function buildLawRefHtml(term) {
    return CardUi.buildLawRefHtml(term);
  }

  function buildTermCard(term, known) {
    return CardUi.buildFlipCard(term, { known });
  }

  return { render };
})();
