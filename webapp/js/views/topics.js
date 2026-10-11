// 学習トピックビュー: 試験分野ごとのトピック一覧 + トピック詳細(基礎知識/問題/用語/具体例/法律)
// ルート: #topics / #topics/<topicId> / #topics/<topicId>/<基礎知識ID>
window.Views = window.Views || {};
window.Views.topics = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  function render(root, param) {
    if (param) {
      const [topicId, basicId] = param.split(`/`);
      const topic = AppIndex.topicsById[topicId];
      // 統合した古い基礎知識ID(保存済みのリンク)は引き継ぎ先の項目を開く
      const focusId = basicId && AppIndex.retiredTermId ? AppIndex.retiredTermId(basicId) : basicId;
      if (topic) { renderDetail(root, topic, focusId || null); return; }
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

  function isLearned(progress, id) {
    return !!(Storage.isPlainObject(progress[id]) && progress[id].learned);
  }

  // 宅建士の出題分野でトピックをまとめる(はじめに / 各分野 / 税理士試験 / 実務・トラブル)
  // 目標が税理士試験のときは、税理士試験のまとまりを「はじめに」の次に出す
  function groupTopics() {
    const type = Stats.examType(`takken`);
    const cats = type && Array.isArray(type.categories) ? type.categories : [];
    const groups = [{ id: `start`, name: `はじめに`, meta: `一人暮らし未経験ならここから`, topics: [] }];
    cats.forEach((c) => groups.push({ id: c.id, name: c.name, meta: c.questions ? `宅建士試験 例年${c.questions}問` : ``, topics: [] }));
    // 宅建士の範囲外で税理士試験向けのトピック(不動産と消費税など)
    const zei = Stats.examType(`zeirishi`);
    const zeiTopicIds = zei && Array.isArray(zei.categories) ? zei.categories.flatMap((c) => c.topicIds || []) : [];
    const zeiGroup = { id: `zeirishi`, name: `税理士試験`, meta: `宅建士の範囲外・税理士試験向け`, topics: [] };
    const target = Stats.primaryTarget ? Stats.primaryTarget() : null;
    if (target && target.examTypeId === `zeirishi`) groups.splice(1, 0, zeiGroup);
    else groups.push(zeiGroup);
    groups.push({ id: `practice`, name: `実務・トラブル対応`, meta: `試験範囲外の実務知識`, topics: [] });
    window.APP_DATA.topics.forEach((topic) => {
      if (topic.id === `topicI`) { groups[0].topics.push(topic); return; }
      const cat = cats.find((c) => (c.topicIds || []).includes(topic.id));
      let g = cat ? groups.find((x) => x.id === cat.id) : null;
      if (!g && zeiTopicIds.includes(topic.id)) g = zeiGroup;
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

  // すべてのトピックの基礎知識チェックリスト(重複を除く)と、そのうち学習済みの数
  function basicsTotals(basicsProgress) {
    const ids = new Set();
    window.APP_DATA.topics.forEach((t) => t.basicIds.forEach((id) => { if (AppIndex.termsById[id]) ids.add(id); }));
    let done = 0;
    ids.forEach((id) => { if (isLearned(basicsProgress, id)) done += 1; });
    return { done, total: ids.size };
  }

  function renderList(root) {
    const basicsProgress = obj(`basicsProgress`);
    const roadmap = obj(`roadmap`);
    const byTopic = {};
    Stats.byTopic().forEach((r) => { byTopic[r.topic.id] = r; });
    const overall = Stats.overall();
    const bt = basicsTotals(basicsProgress);

    const wrap = document.createElement(`div`);
    wrap.className = `view topics-view`;
    wrap.innerHTML = `
      <h2>学習トピック</h2>
      <p class="view-desc">不動産の基本をトピック別に学べます。宅建士試験の出題分野ごとに並べています。「正直不動産」のエピソードは各トピックの具体例として入っています。</p>
      <div class="stat-grid topics-stat-grid">
        <div class="stat-tile"><span class="stat-value">${overall.pct}<small>%</small></span><span class="stat-label" title="★記憶済み+✓学習済み">全体の進捗(★+✓) <span class="nowrap">${overall.done}/${overall.total}項目</span></span></div>
        <div class="stat-tile"><span class="stat-value">${bt.done}<small>/${bt.total}</small></span><span class="stat-label">基礎知識 <span class="nowrap">✓学習済み</span></span></div>
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
        const basicsDone = topic.basicIds.filter((id) => isLearned(basicsProgress, id)).length;
        const epDone = topic.episodes.filter((id) => roadmap[id] && roadmap[id].watched).length;
        const quizCount = (AppIndex.topicQuizIndex[topic.id] || []).length;
        const card = document.createElement(`a`);
        card.className = `card card-interactive topic-card`;
        card.href = `#topics/${topic.id}`;
        card.innerHTML = `
          <div class="topic-card-head">
            <span class="topic-icon">${ic(topic.icon || `book-open`, 22)}</span>
            <div class="topic-card-main">
              <div class="topic-card-title">${esc(topic.name)}</div>
              <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${esc(topic.level)}</span>
            </div>
          </div>
          <p class="episode-summary">${esc(topic.description)}</p>
          <div class="topic-progress-row" title="★記憶済み+✓学習済み"><span>進捗</span><div class="progress-bar"><div class="progress-bar-fill" style="width:${stat.pct}%"></div></div><span>${stat.done}/${stat.total}</span></div>
          <div class="topic-progress-row" title="基礎知識の✓学習済み"><span>基礎知識</span><div class="progress-bar"><div class="progress-bar-fill fill-accent" style="width:${topic.basicIds.length ? Math.round((basicsDone / topic.basicIds.length) * 100) : 0}%"></div></div><span>${basicsDone}/${topic.basicIds.length}</span></div>
          ${topic.episodes.length ? `<div class="topic-progress-row"><span>動画視聴</span><div class="progress-bar"><div class="progress-bar-fill fill-video" style="width:${Math.round((epDone / topic.episodes.length) * 100)}%"></div></div><span>${epDone}/${topic.episodes.length}</span></div>` : ``}
          <div class="chip-row topic-card-tags">
            <span class="source-tag">${ic(`layers`, 12)} 用語${stat.total}</span>
            ${quizCount ? `<span class="source-tag">${ic(`pencil-check`, 12)} 問題${quizCount}</span>` : ``}
          </div>`;
        grid.appendChild(card);
      });
      groupsEl.appendChild(section);
    });
  }

  // 件数の多い一覧は一定数ずつ表示して「もっと見る」で末尾に追加する(作り直さないのでスクロール位置が飛ばない)
  // initial: 戻るで帰ってきたときに最初から表示しておく件数
  function renderPaged(container, items, build, page, unit, initial, onMore) {
    let shown = 0;
    let btn = null;
    function more(count) {
      const next = Math.min(items.length, shown + (count || page));
      const fragment = document.createDocumentFragment();
      items.slice(shown, next).forEach((it) => { const el = build(it); if (el) fragment.appendChild(el); });
      container.appendChild(fragment);
      shown = next;
      if (shown >= items.length) { if (btn) { btn.remove(); btn = null; } return; }
      if (!btn) {
        btn = document.createElement(`button`);
        btn.type = `button`;
        btn.className = `btn load-more-btn`;
        btn.addEventListener(`click`, () => { more(); if (onMore) onMore(); });
        container.insertAdjacentElement(`afterend`, btn);
      }
      btn.textContent = `もっと見る(残り${items.length - shown}${unit})`;
    }
    more(Math.max(page, Number(initial) || 0));
    return { shown: () => shown };
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
    const sections = (AppIndex.topicSections && AppIndex.topicSections[topic.id]) || null;
    const order = ((AppIndex.topicBasicOrder && AppIndex.topicBasicOrder[topic.id]) || topic.basicIds).filter((id) => AppIndex.termsById[id]);
    const episodes = topic.episodes.filter((id) => AppIndex.episodesById[id]);
    const laws = lawIds.map((id) => window.APP_DATA.laws.laws.find((l) => l.id === id)).filter(Boolean);
    const quizById = {};
    window.APP_DATA.quiz.forEach((item) => { quizById[item.id] = item; });
    const quizzes = quizIds.map((id) => quizById[id]).filter(Boolean);
    const allMc = quizzes.length > 0 && quizzes.every((q) => q.format === `mc`);
    const quizLabel = allMc ? `4択問題` : `確認問題`;
    const oxCount = window.QuizEngine && QuizEngine.statementsFrom ? quizzes.reduce((n, q) => n + QuizEngine.statementsFrom(q).length, 0) : 0;
    // 用語カードは基礎知識チェックリストにない用語だけ(同じ内容を2回並べない)
    const extraTerms = termIds.filter((id) => !topic.basicIds.includes(id)).map((id) => AppIndex.termsById[id]).filter(Boolean);

    // 戻る/再読み込みで帰ってきたときは、開いていた項目・表示件数・絞り込みを元に戻す(履歴エントリごとに保存)
    // (Router が保存位置へスクロールするのは描画の50ms後なので、ここで同期的に元の高さまで作っておく)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const returning = Number(hs.y) > 0;
    const saved = hs.tState && typeof hs.tState === `object` && hs.tState.topic === topic.id && (!focusBasicId || returning) ? hs.tState : null;
    const myHash = location.hash;

    const wrap = document.createElement(`div`);
    wrap.className = `view topic-detail-view`;
    const navItems = [
      [`sec-basics`, `基礎知識`, `check-circle`],
      [`sec-quiz`, `問題`, `pencil-check`],
      [`sec-terms`, `用語カード`, `layers`],
      episodes.length ? [`sec-episodes`, `具体例`, `play-square`] : null,
      laws.length ? [`sec-laws`, `関連法律`, `library`] : null,
    ].filter(Boolean);
    wrap.innerHTML = `
      <a class="btn back-btn" href="#topics">${ic(`chevron-left`, 18)}トピック一覧</a>
      <div class="topic-hero">
        <span class="topic-icon">${ic(topic.icon || `book-open`, 28)}</span>
        <div class="topic-hero-main">
          <h2>${esc(topic.name)}</h2>
          <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${esc(topic.level)}</span>
        </div>
      </div>
      <p class="view-desc">${esc(topic.description)}</p>
      <div class="topic-practice">
        ${quizzes.length ? `<a class="btn" href="#quiz/${topic.id}">${ic(`pencil-check`, 18)}<span>${quizLabel}</span><span class="topic-practice-count">${quizzes.length}問</span></a>` : ``}
        ${oxCount ? `<a class="btn btn-secondary" href="#ox/topic/${topic.id}">${ic(`o-x`, 18)}<span><span class="sr-only">○×</span>一問一答</span><span class="topic-practice-count">${oxCount}問</span></a>` : ``}
        ${!quizzes.length ? `<a class="btn btn-secondary" href="#quiz/auto/${topic.id}">${ic(`sparkles`, 18)}自動生成クイズ</a>` : ``}
      </div>
      <div class="topic-detail-layout">
        <div class="topic-main">
          <section id="sec-basics" class="topic-sec">
            <div class="section-head"><h3>基礎知識</h3><span class="topic-group-meta" data-role="basics-count"></span></div>
            <div class="basics-progress" data-role="basics-progress" hidden>
              <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill fill-success" data-role="basics-bar"></div></div>
              <div class="basics-tools">
                <button type="button" class="btn btn-secondary btn-sm basics-next" data-role="next-unlearned"></button>
                <div class="segmented basics-filter" role="group" aria-label="表示する基礎知識" data-role="basics-filter">
                  <button type="button" class="segmented-item" data-filter="all" aria-pressed="true">すべて</button>
                  <button type="button" class="segmented-item" data-filter="unlearned" aria-pressed="false">未学習のみ</button>
                </div>
              </div>
            </div>
            <ul class="${sections ? `basics-sections` : `basics-checklist`}" data-role="basics-list"></ul>
          </section>
          <section id="sec-quiz" class="topic-sec">
            <div class="section-head"><h3>このトピックの問題</h3>${quizzes.length ? `<a class="link-btn" href="#quiz/${topic.id}">${quizLabel}(${quizzes.length}問)を解く${ic(`chevron-right`, 16)}</a>` : ``}</div>
            <div class="quiz-list" data-role="quiz-list"></div>
            <div class="card-actions"><a class="btn" href="#quiz/auto/${topic.id}">${ic(`sparkles`)}自動生成クイズに挑戦</a></div>
          </section>
          <section id="sec-terms" class="topic-sec">
            <div class="section-head"><h3>用語カード</h3><a class="link-btn" href="#glossary/topic/${topic.id}">用語集で見る${ic(`chevron-right`, 16)}</a></div>
            ${order.length ? `<a class="card card-interactive basics-card-hint" href="#glossary/topic/${topic.id}">${ic(`layers`, 18)}<span>基礎知識(${order.length}項目)もカードで暗記チェック</span>${ic(`chevron-right`, 16)}</a>` : ``}
            <div class="card-grid" data-role="term-grid"></div>
          </section>
          ${episodes.length ? `
          <section id="sec-episodes" class="topic-sec">
            <div class="section-head"><h3>正直不動産の具体例</h3></div>
            <ul class="episode-checklist" data-role="episode-list"></ul>
          </section>` : ``}
          ${laws.length ? `
          <section id="sec-laws" class="topic-sec">
            <div class="section-head"><h3>関連法律・制度</h3></div>
            <div class="law-row-grid">${laws.map((law) => `<div class="card card-compact law-row"><div class="law-name">${ic(`library`, 18)}${esc(law.name)}</div><div class="law-desc">${esc(law.description)}</div></div>`).join(``)}</div>
          </section>` : ``}
        </div>
        <aside class="topic-rail" aria-label="このトピックの進捗">
          <div class="card topic-rail-card">
            <div class="stat-value" data-role="rail-pct">${stat.pct}<small>%</small></div>
            <div class="stat-label">このトピックの進捗(★記憶済み+✓学習済み)</div>
            <div class="stat-label num" data-role="rail-label">${stat.done}/${stat.total}項目</div>
            <div class="progress-bar topic-rail-bar"><div class="progress-bar-fill" data-role="rail-bar" style="width:${stat.pct}%"></div></div>
          </div>
          <div class="card card-compact topic-rail-card">
            <div class="side-nav-heading topic-rail-heading">このページの内容</div>
            ${navItems.map(([id, label, icon]) => `<button type="button" class="side-nav-item" data-jump="${id}">${ic(icon, 18)}${label}</button>`).join(``)}
          </div>
        </aside>
      </div>
    `;
    root.appendChild(wrap);

    wrap.querySelectorAll(`[data-jump]`).forEach((b) => b.addEventListener(`click`, () => UI.scrollIntoView(wrap.querySelector(`#${b.dataset.jump}`), `start`)));

    // ---- 状態の保存(戻るで復元する) ----
    let termsPager = null;
    let quizPager = null;
    let filterUnlearned = !!(saved && saved.unlearned);
    // 回答した問題(問題ID → 選んだ番号 / 記述は 'ok'・'ng')と、めくった用語カード。
    // 回答・裏返しでカードの背が伸びるため、戻ったときに元の表示にしないと位置がずれる
    const answeredMap = {};
    if (saved && Storage.isPlainObject(saved.answered)) {
      quizzes.forEach((q) => {
        const v = saved.answered[q.id];
        if ((Number.isInteger(v) && v >= 0 && v < 4) || v === `ok` || v === `ng`) answeredMap[q.id] = v;
      });
    }
    const flippedIds = new Set(saved && Array.isArray(saved.flipped) ? saved.flipped.filter((id) => typeof id === `string` && extraTerms.some((t) => t.id === id)) : []);
    let saveTimer = null;
    function saveState() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        // 別の画面へ移ったあとに書き込むと、移動先の履歴エントリに混ざるため
        if (location.hash !== myHash || !document.body.contains(wrap)) return;
        try {
          const st = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
          const open = Array.from(wrap.querySelectorAll(`.basics-item > details[open]`)).map((d) => d.parentNode.dataset.id);
          const secs = Array.from(wrap.querySelectorAll(`.basics-section > details[open]`)).map((d) => d.parentNode.dataset.sec);
          // 「未学習のみ」の表示中にチェックしてその場に残した項目・小見出し
          const keep = Array.from(wrap.querySelectorAll(`.basics-item.keep-visible`)).map((li) => li.dataset.id);
          const keepSecs = Array.from(wrap.querySelectorAll(`.basics-section.keep-visible`)).map((li) => li.dataset.sec);
          window.history.replaceState(Object.assign({}, st, {
            tState: {
              topic: topic.id, open, secs, terms: termsPager ? termsPager.shown() : 0, quiz: quizPager ? quizPager.shown() : 0, unlearned: filterUnlearned,
              keep, keepSecs, answered: Object.assign({}, answeredMap), flipped: Array.from(flippedIds),
            },
          }), ``);
        } catch (e) { /* 履歴の保存に失敗しても表示には影響しない */ }
      }, 120);
    }

    // ---- 基礎知識チェックリスト ----
    const basicsList = wrap.querySelector(`[data-role="basics-list"]`);
    const basicsCount = wrap.querySelector(`[data-role="basics-count"]`);
    const progressBox = wrap.querySelector(`[data-role="basics-progress"]`);
    const bar = wrap.querySelector(`[data-role="basics-bar"]`);
    const nextBtn = wrap.querySelector(`[data-role="next-unlearned"]`);
    const filterSeg = wrap.querySelector(`[data-role="basics-filter"]`);
    const itemEls = new Map();
    const secOf = new Map();
    const secEls = [];

    function learned(id) { return isLearned(basicsProgress, id); }

    function updateRail() {
      const st = Stats.byTopic().find((r) => r.topic.id === topic.id);
      if (!st) return;
      const pctEl = wrap.querySelector(`[data-role="rail-pct"]`);
      const labelEl = wrap.querySelector(`[data-role="rail-label"]`);
      const barEl = wrap.querySelector(`[data-role="rail-bar"]`);
      if (pctEl) pctEl.innerHTML = `${st.pct}<small>%</small>`;
      if (labelEl) labelEl.textContent = `${st.done}/${st.total}項目`;
      if (barEl) barEl.style.width = `${st.pct}%`;
    }

    function paintSection(sec) {
      const done = sec.ids.filter(learned).length;
      const complete = done === sec.ids.length;
      sec.li.classList.toggle(`is-complete`, complete);
      sec.countEl.classList.toggle(`is-done`, complete);
      sec.countEl.innerHTML = `${complete ? ic(`check`, 14) : ``}<span class="sr-only">学習済み</span>${done}/${sec.ids.length}`;
    }

    function firstUnlearned() {
      return order.find((id) => !learned(id)) || null;
    }

    function updateBasicsHead() {
      const done = order.filter(learned).length;
      basicsCount.textContent = `学習済み ${done}/${order.length}`;
      if (!order.length) return;
      bar.style.width = `${Math.round((done / order.length) * 100)}%`;
      const next = firstUnlearned();
      nextBtn.disabled = !next;
      nextBtn.innerHTML = next
        ? `${ic(`arrow-right`, 16)}<span class="basics-next-label">次の未学習へ: ${AppIndex.termsById[next].name}</span>`
        : `${ic(`check-circle`, 16)}<span class="basics-next-label">すべて学習済み</span>`;
    }

    function setLearned(id, value) {
      // 別のタブでの記録を消さないよう、最新の値を読み直してから書き込む
      Object.assign(basicsProgress, Storage.get(`basicsProgress`, {}));
      if (!Storage.isPlainObject(basicsProgress[id])) basicsProgress[id] = {};
      basicsProgress[id].learned = value;
      Storage.set(`basicsProgress`, basicsProgress);
      Streak.recordToday();
      const li = itemEls.get(id);
      if (li) {
        li.classList.toggle(`is-learned`, value);
        const cb = li.querySelector(`[data-role="learned-checkbox"]`);
        if (cb.checked !== value) cb.checked = value;
        paintCloseBtn(li, value);
        // 「未学習のみ」の表示中にチェックした項目は、その場では消さない(一覧が詰まって位置が飛ぶため)
        if (filterUnlearned && value) li.classList.add(`keep-visible`);
      }
      const sec = secOf.get(id);
      if (sec) {
        paintSection(sec);
        if (filterUnlearned && value) sec.li.classList.add(`keep-visible`);
      }
      updateBasicsHead();
      updateRail();
      // その場に残した項目を戻るでも残す(消えると下の内容が詰まって位置がずれる)
      if (filterUnlearned) saveState();
    }

    function paintCloseBtn(li, value) {
      const btn = li.querySelector(`[data-role="learn-close"]`);
      if (!btn) return;
      btn.className = `btn btn-sm ${value ? `btn-secondary` : `btn-success`}`;
      btn.innerHTML = value ? `閉じる` : `${ic(`check`, 16)}学習済みにして閉じる`;
    }

    function buildItem(concept) {
      const id = concept.id;
      const done = learned(id);
      const diagrams = CardUi.diagramsFor(id);
      const relQuiz = (AppIndex.termQuizIndex && AppIndex.termQuizIndex[id]) || [];
      const bmOn = window.Bookmarks ? Bookmarks.has(`term:${id}`) : false;
      const deepLabel = CardUi.deepDiveLabel ? CardUi.deepDiveLabel(concept, topic.id) : `もう一歩踏み込むと`;
      const li = document.createElement(`li`);
      li.className = `basics-item` + (done ? ` is-learned` : ``);
      li.id = `basic-${id}`;
      li.dataset.id = id;
      li.innerHTML = `
        <label class="basics-check-wrap" title="学習済みにする"><input type="checkbox" class="basics-check" data-role="learned-checkbox" aria-label="「${esc(concept.name)}」を学習済みにする" ${done ? `checked` : ``}></label>
        <details>
          <summary>
            <span class="basics-name">${concept.name}</span>
            ${diagrams.length ? `<span class="source-tag">${ic(`diagram`, 12)} 図解</span>` : ``}
            <span class="chevron">${ic(`chevron-down`, 18)}</span>
          </summary>
          <div class="basics-body">
            <p class="term-simple">${concept.simpleExplanation}</p>
            <p class="term-deep"><strong>${deepLabel}:</strong> ${concept.deepDive}</p>
            ${CardUi.buildLawRefHtml(concept)}
            ${CardUi.buildSourceCitationHtml(concept)}
            ${diagrams.map((dId) => CardUi.figureHtml(dId)).join(``)}
            ${CardUi.calcLinksHtml ? CardUi.calcLinksHtml(id) : ``}
            <div class="basics-actions">
              <button type="button" data-role="learn-close"></button>
              ${relQuiz.length ? `<a class="btn btn-sm btn-secondary" href="#quiz/q/${encodeURIComponent(relQuiz[0])}">${ic(`pencil-check`, 16)}確認問題(${relQuiz.length}問)</a>` : ``}
              ${window.Bookmarks ? `<button type="button" class="btn btn-sm btn-ghost bookmark-toggle${bmOn ? ` is-bookmarked` : ``}" data-role="bookmark" data-label="ブックマーク" aria-pressed="${bmOn}">${ic(bmOn ? `bookmark-fill` : `bookmark`, 16)}<span>ブックマーク</span></button>` : ``}
            </div>
          </div>
        </details>
      `;
      paintCloseBtn(li, done);
      const details = li.querySelector(`details`);
      li.querySelector(`[data-role="learned-checkbox"]`).addEventListener(`change`, (e) => setLearned(id, e.target.checked));
      li.querySelector(`[data-role="learn-close"]`).addEventListener(`click`, () => {
        if (!learned(id)) setLearned(id, true);
        details.open = false;
        // 閉じると下の内容が詰まるので、閉じた項目の見出しを画面の上端に合わせる
        UI.scrollIntoView(li, `start`);
      });
      const bm = li.querySelector(`[data-role="bookmark"]`);
      if (bm) {
        bm.addEventListener(`click`, () => {
          const on = Bookmarks.toggle(`term:${id}`);
          if (CardUi.paintBookmarkButtons) CardUi.paintBookmarkButtons(li, on);
        });
      }
      details.addEventListener(`toggle`, saveState);
      itemEls.set(id, li);
      return li;
    }

    if (!order.length) {
      const li = document.createElement(`li`);
      li.appendChild(UI.emptyState({ icon: `book-open`, title: `準備中です`, body: `このトピックの基礎知識は順次追加します。` }));
      basicsList.appendChild(li);
    } else if (sections) {
      sections.forEach((s, i) => {
        const li = document.createElement(`li`);
        li.className = `basics-section`;
        li.dataset.sec = String(i);
        li.innerHTML = `
          <details>
            <summary class="basics-section-head"><span class="chevron">${ic(`chevron-down`, 18)}</span><span class="basics-section-name">${esc(s.name)}</span><span class="basics-section-count num" data-role="sec-count"></span></summary>
            <ul class="basics-checklist"></ul>
          </details>`;
        const ul = li.querySelector(`ul`);
        const sec = { li, details: li.querySelector(`details`), countEl: li.querySelector(`[data-role="sec-count"]`), ids: s.ids.filter((id) => AppIndex.termsById[id]) };
        sec.ids.forEach((id) => { ul.appendChild(buildItem(AppIndex.termsById[id])); secOf.set(id, sec); });
        paintSection(sec);
        sec.details.addEventListener(`toggle`, saveState);
        secEls.push(sec);
        basicsList.appendChild(li);
      });
    } else {
      order.forEach((id) => basicsList.appendChild(buildItem(AppIndex.termsById[id])));
    }

    if (order.length) {
      progressBox.hidden = false;
      updateBasicsHead();
      nextBtn.addEventListener(`click`, () => {
        const id = firstUnlearned();
        if (id) openItem(id, `start`);
      });
      const applyFilter = () => {
        basicsList.classList.toggle(`basics-only-unlearned`, filterUnlearned);
        filterSeg.querySelectorAll(`[data-filter]`).forEach((b) => b.setAttribute(`aria-pressed`, String((b.dataset.filter === `unlearned`) === filterUnlearned)));
      };
      filterSeg.querySelectorAll(`[data-filter]`).forEach((b) => b.addEventListener(`click`, () => {
        const v = b.dataset.filter === `unlearned`;
        if (v === filterUnlearned) return;
        filterUnlearned = v;
        wrap.querySelectorAll(`.keep-visible`).forEach((el) => el.classList.remove(`keep-visible`));
        applyFilter();
        saveState();
      }));
      applyFilter();
    }

    // 項目を開いて(小見出しも開く)画面内へ
    function openItem(id, block) {
      const li = itemEls.get(id);
      if (!li) return null;
      const sec = secOf.get(id);
      if (sec) sec.details.open = true;
      li.querySelector(`details`).open = true;
      li.classList.add(`highlighted`);
      setTimeout(() => li.classList.remove(`highlighted`), 2400);
      requestAnimationFrame(() => UI.scrollIntoView(li, block || (li.offsetHeight > window.innerHeight * 0.6 ? `start` : `center`)));
      return li;
    }

    // 開く小見出し・項目: 戻ってきたときは保存した状態、初めて開いたときは「未学習のある最初の小見出し」
    if (saved) {
      const openSecs = Array.isArray(saved.secs) ? saved.secs.map(String) : [];
      secEls.forEach((sec) => { sec.details.open = openSecs.includes(sec.li.dataset.sec); });
      (Array.isArray(saved.open) ? saved.open : []).forEach((id) => {
        const li = typeof id === `string` ? itemEls.get(id) : null;
        if (li) li.querySelector(`details`).open = true;
      });
      if (filterUnlearned) {
        (Array.isArray(saved.keep) ? saved.keep : []).forEach((id) => {
          const li = typeof id === `string` ? itemEls.get(id) : null;
          if (li) li.classList.add(`keep-visible`);
        });
        const keepSecs = Array.isArray(saved.keepSecs) ? saved.keepSecs.map(String) : [];
        secEls.forEach((sec) => { if (keepSecs.includes(sec.li.dataset.sec)) sec.li.classList.add(`keep-visible`); });
      }
    } else if (secEls.length) {
      const first = secEls.find((sec) => sec.ids.some((id) => !learned(id)));
      if (first) first.details.open = true;
    }

    // ---- このトピックの問題(確認問題のカードを再利用) ----
    const quizList = wrap.querySelector(`[data-role="quiz-list"]`);
    const quizHistory = obj(`quizHistory`);
    if (quizzes.length) {
      const onResult = (result, card, picked, restored) => {
        if (restored) return;
        answeredMap[card.dataset.quizId] = picked;
        saveState();
      };
      quizPager = renderPaged(quizList, quizzes, (q) => Views.quiz.buildFixedCard(q, { history: quizHistory, restoreChoice: answeredMap[q.id], onResult }), 10, `問`, saved && saved.quiz, saveState);
    } else {
      quizList.appendChild(UI.emptyState({ icon: `pencil-check`, title: `確認問題は準備中です`, body: `自動生成クイズで用語の理解を確認できます。` }));
    }

    // ---- 用語フリップカード(基礎知識チェックリストにない用語) ----
    const termGrid = wrap.querySelector(`[data-role="term-grid"]`);
    if (extraTerms.length) {
      const onFlip = (t, on) => {
        if (on) flippedIds.add(t.id); else flippedIds.delete(t.id);
        saveState();
      };
      termsPager = renderPaged(termGrid, extraTerms, (term) => CardUi.buildFlipCard(term, { known, topicId: topic.id, flipped: flippedIds.has(term.id), onFlip, onToggleKnown: () => updateRail() }), 12, `語`, saved && saved.terms, saveState);
    } else if (!order.length) {
      termGrid.appendChild(UI.emptyState({ icon: `layers`, title: `用語は準備中です` }));
    } else {
      termGrid.hidden = true;
    }

    // ---- 正直不動産の具体例 ----
    const episodeList = wrap.querySelector(`[data-role="episode-list"]`);
    episodes.forEach((epId) => {
      const ep = AppIndex.episodesById[epId];
      const st = roadmap[epId] || { watched: false, understood: false };
      const li = document.createElement(`li`);
      li.innerHTML = `
        <a class="ep-link" href="#summary/${epId}">${ic(`play-square`, 18)}${esc(ep.displayLabel)} ${esc(ep.theme)}</a>
        <label class="check-label ep-check"><input type="checkbox" data-role="watched" ${st.watched ? `checked` : ``}> 視聴済み</label>
        <label class="check-label ep-check"><input type="checkbox" data-role="understood" ${st.understood ? `checked` : ``}> 理解済み</label>
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

    // #topics/<topicId>/<basicId> で開いた場合は該当の基礎知識を開いて強調(戻るで帰ってきたときは保存位置を優先)
    if (focusBasicId && !saved) openItem(focusBasicId);
  }

  return { render };
})();
