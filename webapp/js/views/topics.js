// 学習トピックビュー: 試験分野ごとのトピック一覧 + トピック詳細(基礎知識/図解/用語/具体例/法律/クイズ)
// ルート: #topics / #topics/<topicId> / #topics/<topicId>/<基礎知識ID>
window.Views = window.Views || {};
window.Views.topics = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  function render(root, param) {
    if (param) {
      const [topicId, basicId] = param.split(`/`);
      const topic = AppIndex.topicsById[topicId];
      if (topic) { renderDetail(root, topic, basicId || null); return; }
    }
    renderList(root);
  }

  function topicLevelBadgeClass(level) {
    if (level.includes(`超入門`)) return `超入門`;
    if (level.includes(`上`)) return `上級`;
    if (level.includes(`中`)) return `中級`;
    return `初級`;
  }

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  // 宅建士の出題分野でトピックをまとめる(はじめに / 各分野 / 実務・トラブル)
  function groupTopics() {
    const type = Stats.examType(`takken`);
    const cats = type && Array.isArray(type.categories) ? type.categories : [];
    const groups = [{ id: `start`, name: `はじめに`, meta: `一人暮らし未経験ならここから`, topics: [] }];
    cats.forEach((c) => groups.push({ id: c.id, name: c.name, meta: c.questions ? `宅建士試験 例年${c.questions}問` : ``, topics: [] }));
    // 宅建士の範囲外で税理士試験向けのトピック(不動産と消費税など)
    const zei = Stats.examType(`zeirishi`);
    const zeiTopicIds = zei && Array.isArray(zei.categories) ? zei.categories.flatMap((c) => c.topicIds || []) : [];
    groups.push({ id: `zeirishi`, name: `税理士試験`, meta: `宅建士の範囲外・税理士試験向け`, topics: [] });
    groups.push({ id: `practice`, name: `実務・トラブル対応`, meta: `試験範囲外の実務知識`, topics: [] });
    window.APP_DATA.topics.forEach((topic) => {
      if (topic.id === `topicI`) { groups[0].topics.push(topic); return; }
      const cat = cats.find((c) => (c.topicIds || []).includes(topic.id));
      let g = cat ? groups.find((x) => x.id === cat.id) : null;
      if (!g && zeiTopicIds.includes(topic.id)) g = groups.find((x) => x.id === `zeirishi`);
      if (!g) g = groups[groups.length - 1];
      g.topics.push(topic);
    });
    // 分野の中は試験設定(data/exams.js)の topicIds の順(主要なトピックを先頭に)
    groups.forEach((g) => {
      const c = cats.find((x) => x.id === g.id);
      if (c) g.topics.sort((a, b) => (c.topicIds || []).indexOf(a.id) - (c.topicIds || []).indexOf(b.id));
    });
    return groups.filter((g) => g.topics.length);
  }

  function renderList(root) {
    const basicsProgress = obj(`basicsProgress`);
    const roadmap = obj(`roadmap`);
    const byTopic = {};
    Stats.byTopic().forEach((r) => { byTopic[r.topic.id] = r; });
    const overall = Stats.overall();

    const wrap = document.createElement(`div`);
    wrap.className = `view topics-view`;
    wrap.innerHTML = `
      <h2>学習トピック</h2>
      <p class="view-desc">不動産の基本をトピック別に学べます。宅建士試験の出題分野ごとに並べています。「正直不動産」のエピソードは各トピックの具体例として入っています。</p>
      <div class="stat-grid" style="margin-bottom: var(--sp-2);">
        <div class="stat-tile"><span class="stat-value">${overall.pct}<small>%</small></span><span class="stat-label">全体の学習済み(${overall.done}/${overall.total}項目)</span></div>
        <div class="stat-tile"><span class="stat-value">${window.APP_DATA.topics.length}<small>トピック</small></span><span class="stat-label">基礎知識・用語・クイズ・具体例</span></div>
      </div>
      <div data-role="groups"></div>
    `;
    root.appendChild(wrap);
    const groupsEl = wrap.querySelector(`[data-role="groups"]`);

    groupTopics().forEach((g) => {
      const section = document.createElement(`section`);
      section.className = `topic-group`;
      section.innerHTML = `
        <div class="topic-group-head"><h3>${esc(g.name)}</h3>${g.meta ? `<span class="topic-group-meta">${esc(g.meta)}</span>` : ``}</div>
        <div class="topic-grid"></div>`;
      const grid = section.querySelector(`.topic-grid`);
      g.topics.forEach((topic) => {
        const stat = byTopic[topic.id] || { done: 0, total: 0, pct: 0 };
        const basicsDone = topic.basicIds.filter((id) => basicsProgress[id] && basicsProgress[id].learned).length;
        const epDone = topic.episodes.filter((id) => roadmap[id] && roadmap[id].watched).length;
        const quizCount = (AppIndex.topicQuizIndex[topic.id] || []).length;
        const card = document.createElement(`a`);
        card.className = `card card-interactive topic-card`;
        card.href = `#topics/${topic.id}`;
        card.innerHTML = `
          <div class="topic-card-head">
            <span class="topic-icon">${ic(topic.icon || `book-open`, 22)}</span>
            <div style="min-width:0;">
              <div class="topic-card-title">${esc(topic.name)}</div>
              <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${esc(topic.level)}</span>
            </div>
          </div>
          <p class="episode-summary">${esc(topic.description)}</p>
          <div class="topic-progress-row"><span>学習済み</span><div class="progress-bar"><div class="progress-bar-fill" style="width:${stat.pct}%"></div></div><span>${stat.done}/${stat.total}</span></div>
          <div class="topic-progress-row"><span>基礎知識</span><div class="progress-bar"><div class="progress-bar-fill fill-accent" style="width:${topic.basicIds.length ? Math.round((basicsDone / topic.basicIds.length) * 100) : 0}%"></div></div><span>${basicsDone}/${topic.basicIds.length}</span></div>
          ${topic.episodes.length ? `<div class="topic-progress-row"><span>動画視聴</span><div class="progress-bar"><div class="progress-bar-fill fill-video" style="width:${Math.round((epDone / topic.episodes.length) * 100)}%"></div></div><span>${epDone}/${topic.episodes.length}</span></div>` : ``}
          <div class="chip-row" style="margin-top: var(--sp-1);">
            <span class="source-tag">${ic(`layers`, 12)} 用語${stat.total}</span>
            ${quizCount ? `<span class="source-tag">${ic(`pencil-check`, 12)} 問題${quizCount}</span>` : ``}
          </div>`;
        grid.appendChild(card);
      });
      groupsEl.appendChild(section);
    });
  }

  function renderDetail(root, topic, focusBasicId) {
    const basicsProgress = obj(`basicsProgress`);
    const roadmap = obj(`roadmap`);
    const known = obj(`flashcards`);
    Storage.set(`lastTopic`, topic.id);
    const stat = Stats.byTopic().find((r) => r.topic.id === topic.id) || { done: 0, total: 0, pct: 0 };
    const termIds = AppIndex.topicTermIndex[topic.id] || [];
    const quizIds = AppIndex.topicQuizIndex[topic.id] || [];
    const lawIds = AppIndex.topicLawIndex[topic.id] || [];

    const wrap = document.createElement(`div`);
    wrap.className = `view topic-detail-view`;
    wrap.innerHTML = `
      <a class="btn back-btn" href="#topics">${ic(`chevron-left`, 18)}トピック一覧</a>
      <div class="topic-hero">
        <span class="topic-icon">${ic(topic.icon || `book-open`, 28)}</span>
        <div style="min-width:0;">
          <h2>${esc(topic.name)}</h2>
          <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${esc(topic.level)}</span>
        </div>
      </div>
      <p class="view-desc">${esc(topic.description)}</p>
      <div class="topic-detail-layout">
        <div class="topic-main">
          <section id="sec-basics">
            <div class="section-head"><h3>基礎知識</h3><span class="topic-group-meta" data-role="basics-count"></span></div>
            <ul class="basics-checklist" data-role="basics-list"></ul>
          </section>
          <section id="sec-terms">
            <div class="section-head"><h3>用語カード</h3><a class="link-btn" href="#glossary/topic/${topic.id}">用語集で見る${ic(`chevron-right`, 16)}</a></div>
            <div class="card-grid" data-role="term-grid"></div>
          </section>
          <section id="sec-episodes">
            <div class="section-head"><h3>正直不動産の具体例</h3></div>
            <ul class="episode-checklist" data-role="episode-list"></ul>
          </section>
          <section id="sec-laws" data-role="law-section"></section>
          <section id="sec-quiz">
            <div class="section-head"><h3>このトピックのクイズ</h3></div>
            <div class="quiz-list" data-role="quiz-list"></div>
            <div class="card-actions"><a class="btn" href="#quiz/auto/${topic.id}">${ic(`sparkles`)}自動生成クイズに挑戦</a></div>
          </section>
        </div>
        <aside class="topic-rail" aria-label="このトピックの進捗">
          <div class="card" style="margin:0;">
            <div class="stat-value" data-role="rail-pct">${stat.pct}<small>%</small></div>
            <div class="stat-label" data-role="rail-label">学習済み ${stat.done}/${stat.total}項目</div>
            <div class="progress-bar" style="margin-top: var(--sp-2);"><div class="progress-bar-fill" data-role="rail-bar" style="width:${stat.pct}%"></div></div>
          </div>
          <div class="card card-compact" style="margin:0;">
            <div class="side-nav-heading" style="padding:0 0 var(--sp-2);">このページの内容</div>
            ${[[`sec-basics`, `基礎知識`, `check-circle`], [`sec-terms`, `用語カード`, `layers`], [`sec-episodes`, `具体例`, `play-square`], lawIds.length ? [`sec-laws`, `関連法律`, `library`] : null, [`sec-quiz`, `クイズ`, `pencil-check`]]
              .filter(Boolean).map(([id, label, icon]) => `<button type="button" class="side-nav-item" data-jump="${id}">${ic(icon, 18)}${label}</button>`).join(``)}
          </div>
        </aside>
      </div>
    `;
    root.appendChild(wrap);

    wrap.querySelectorAll(`[data-jump]`).forEach((b) => b.addEventListener(`click`, () => UI.scrollIntoView(wrap.querySelector(`#${b.dataset.jump}`), `start`)));

    // 基礎知識チェックリスト(チェックボックス=学習済み、名前=開閉)
    const basicsList = wrap.querySelector(`[data-role="basics-list"]`);
    const basicsCount = wrap.querySelector(`[data-role="basics-count"]`);
    function updateBasicsCount() {
      const done = topic.basicIds.filter((id) => basicsProgress[id] && basicsProgress[id].learned).length;
      basicsCount.textContent = `学習済み ${done}/${topic.basicIds.length}`;
      // 右側の進捗(広い画面)も更新する
      const st = Stats.byTopic().find((r) => r.topic.id === topic.id);
      if (st) {
        const pctEl = wrap.querySelector(`[data-role="rail-pct"]`);
        const labelEl = wrap.querySelector(`[data-role="rail-label"]`);
        const barEl = wrap.querySelector(`[data-role="rail-bar"]`);
        if (pctEl) pctEl.innerHTML = `${st.pct}<small>%</small>`;
        if (labelEl) labelEl.textContent = `学習済み ${st.done}/${st.total}項目`;
        if (barEl) barEl.style.width = `${st.pct}%`;
      }
    }
    updateBasicsCount();
    if (!topic.basicIds.length) {
      const li = document.createElement(`li`);
      li.appendChild(UI.emptyState({ icon: `book-open`, title: `準備中です`, body: `このトピックの基礎知識は順次追加します。` }));
      basicsList.appendChild(li);
    }
    topic.basicIds.forEach((conceptId) => {
      const concept = AppIndex.termsById[conceptId];
      if (!concept) return;
      const isLearned = !!(basicsProgress[conceptId] && basicsProgress[conceptId].learned);
      const diagrams = CardUi.diagramsFor(conceptId);
      const li = document.createElement(`li`);
      li.className = `card card-compact basics-item`;
      li.id = `basic-${conceptId}`;
      li.innerHTML = `
        <details>
          <summary>
            <label class="basics-check-wrap" title="学習済みにする"><input type="checkbox" class="basics-check" data-role="learned-checkbox" aria-label="「${esc(concept.name)}」を学習済みにする" ${isLearned ? `checked` : ``}></label>
            <span class="basics-name">${concept.name}</span>
            ${diagrams.length ? `<span class="source-tag">${ic(`diagram`, 12)} 図解</span>` : ``}
            <span class="chevron">${ic(`chevron-down`, 18)}</span>
          </summary>
          <p class="term-simple">${concept.simpleExplanation}</p>
          <p class="term-deep"><strong>もう一歩踏み込むと:</strong> ${concept.deepDive}</p>
          ${CardUi.buildLawRefHtml(concept)}
          ${CardUi.buildSourceCitationHtml(concept)}
          ${diagrams.map((id) => CardUi.figureHtml(id)).join(``)}
        </details>
      `;
      const checkbox = li.querySelector(`[data-role="learned-checkbox"]`);
      checkbox.addEventListener(`change`, (e) => {
        // 別のタブでの記録を消さないよう、最新の値を読み直してから書き込む
        Object.assign(basicsProgress, Storage.get(`basicsProgress`, {}));
        if (!Storage.isPlainObject(basicsProgress[conceptId])) basicsProgress[conceptId] = {};
        basicsProgress[conceptId].learned = e.target.checked;
        Storage.set(`basicsProgress`, basicsProgress);
        Streak.recordToday();
        updateBasicsCount();
      });
      basicsList.appendChild(li);
    });

    // 件数の多いトピックで一度に全部を描画すると重いため、一定数ずつ表示して「もっと見る」で末尾に追加する
    function renderPaged(container, items, build, page, unit) {
      let shown = 0;
      let btn = null;
      function more() {
        const next = Math.min(items.length, shown + page);
        const fragment = document.createDocumentFragment();
        items.slice(shown, next).forEach((it) => { const el = build(it); if (el) fragment.appendChild(el); });
        container.appendChild(fragment);
        shown = next;
        if (shown >= items.length) { if (btn) btn.remove(); return; }
        if (!btn) {
          btn = document.createElement(`button`);
          btn.type = `button`;
          btn.className = `btn load-more-btn`;
          btn.addEventListener(`click`, more);
          container.insertAdjacentElement(`afterend`, btn);
        }
        btn.textContent = `もっと見る(残り${items.length - shown}${unit})`;
      }
      more();
    }

    // 用語フリップカード(作品由来+基礎知識)
    const termGrid = wrap.querySelector(`[data-role="term-grid"]`);
    const termsToShow = termIds.map((termId) => AppIndex.termsById[termId]).filter(Boolean);
    renderPaged(termGrid, termsToShow, (term) => CardUi.buildFlipCard(term, { known, onToggleKnown: () => updateBasicsCount() }), 12, `語`);
    if (!termIds.length) termGrid.appendChild(UI.emptyState({ icon: `layers`, title: `用語は準備中です` }));

    // 正直不動産の具体例
    const episodeList = wrap.querySelector(`[data-role="episode-list"]`);
    if (!topic.episodes.length) {
      const emptyLi = document.createElement(`li`);
      emptyLi.className = `episode-empty-state`;
      emptyLi.innerHTML = `このトピックは「正直不動産」に該当エピソードがありません。<a class="link-btn" href="#sources">情報源</a>の一次情報で確認してください。`;
      episodeList.appendChild(emptyLi);
    }
    topic.episodes.forEach((epId) => {
      const ep = AppIndex.episodesById[epId];
      if (!ep) return;
      const st = roadmap[epId] || { watched: false, understood: false };
      const li = document.createElement(`li`);
      li.innerHTML = `
        <a class="ep-link" href="#summary/${epId}">${ic(`play-square`, 18)}${esc(ep.displayLabel)} ${esc(ep.theme)}</a>
        <label class="check-label" style="flex:0 0 auto;"><input type="checkbox" data-role="watched" ${st.watched ? `checked` : ``}> 視聴済み</label>
        <label class="check-label" style="flex:0 0 auto;"><input type="checkbox" data-role="understood" ${st.understood ? `checked` : ``}> 理解済み</label>
      `;
      [`watched`, `understood`].forEach((key) => {
        li.querySelector(`[data-role="${key}"]`).addEventListener(`change`, (e) => {
          Object.assign(roadmap, Storage.get(`roadmap`, {}));
          if (!Storage.isPlainObject(roadmap[epId])) roadmap[epId] = { watched: false, understood: false };
          roadmap[epId][key] = e.target.checked;
          Storage.set(`roadmap`, roadmap);
          Streak.recordToday();
        });
      });
      episodeList.appendChild(li);
    });

    // 関連法律
    if (lawIds.length) {
      const lawSection = wrap.querySelector(`[data-role="law-section"]`);
      lawSection.innerHTML = `<div class="section-head"><h3>関連法律・制度</h3></div><div class="law-row-grid" data-role="rows"></div>`;
      const rows = lawSection.querySelector(`[data-role="rows"]`);
      lawIds.forEach((lawId) => {
        const law = window.APP_DATA.laws.laws.find((l) => l.id === lawId);
        if (!law) return;
        const row = document.createElement(`div`);
        row.className = `card card-compact law-row`;
        row.innerHTML = `<div class="law-name">${ic(`library`, 18)}${esc(law.name)}</div><div class="law-desc">${esc(law.description)}</div>`;
        rows.appendChild(row);
      });
    }

    // このトピックのクイズ(確認問題のカードを再利用)
    const quizList = wrap.querySelector(`[data-role="quiz-list"]`);
    const history = obj(`quizHistory`);
    const quizById = {};
    window.APP_DATA.quiz.forEach((item) => { quizById[item.id] = item; });
    const quizzesToShow = quizIds.map((id) => quizById[id]).filter(Boolean);
    renderPaged(quizList, quizzesToShow, (q) => Views.quiz.buildFixedCard(q, { history }), 10, `問`);
    if (!quizIds.length) quizList.appendChild(UI.emptyState({ icon: `pencil-check`, title: `確認問題は準備中です`, body: `自動生成クイズで用語の理解を確認できます。` }));

    // #topics/<topicId>/<basicId> で開いた場合は該当の基礎知識を開いて強調
    if (focusBasicId) {
      const li = wrap.querySelector(`#basic-${CSS.escape(focusBasicId)}`);
      if (li) {
        li.querySelector(`details`).open = true;
        li.classList.add(`highlighted`);
        requestAnimationFrame(() => UI.scrollIntoView(li));
        setTimeout(() => li.classList.remove(`highlighted`), 2400);
      }
    }
  }

  return { render };
})();
