// 用語集・フラッシュカードビュー(用語集の用語+基礎知識を統合)
window.Views = window.Views || {};
window.Views.glossary = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  // `全て` は「すべて」を表す内部の値(履歴に保存した絞り込みと合わせるため値は変えない。表示は「すべて」)
  const LEVELS = [`全て`, `超入門`, `初級`, `中級`, `上級`];
  const levelLabel = (lvl) => (lvl === `全て` ? `すべて` : lvl);
  const TITLE = `用語集・フラッシュカード`;
  const INTRO = `タップでカードをめくって意味を確認。★で「記憶済み」、しおりでブックマークできます。根拠条文(例: 96条、借地借家法)でも検索できます。`;

  // 全角半角・カタカナひらがなの違いを無視して検索(検索用の文字列は用語ごとに一度だけ作る)
  const norm = (s) => ((window.GlobalSearch && GlobalSearch.norm) ? GlobalSearch.norm(s) : String(s || ``).toLowerCase());
  const normCache = new Map();
  function normFields(term) {
    let f = normCache.get(term.id);
    if (!f) {
      f = {
        name: norm(term.name),
        aliases: (term.aliases || []).map(norm),
        simple: norm(term.simpleExplanation),
        law: norm(term.lawRef || ``),
        deep: norm(term.deepDive || ``),
      };
      normCache.set(term.id, f);
    }
    return f;
  }

  // 検索の関連度(小さいほど上): 名前の一致・前方一致 > 名前の部分一致 > 別名 > 説明文 > 根拠条文 > 深掘り。-1 は不一致
  function rankOf(term, q) {
    const f = normFields(term);
    if (f.name === q) return 0;
    if (f.name.startsWith(q)) return 1;
    if (f.name.includes(q)) return 2;
    if (f.aliases.some((a) => a === q || a.startsWith(q))) return 3;
    if (f.aliases.some((a) => a.includes(q))) return 4;
    if (f.simple.includes(q)) return 5;
    if (f.law.includes(q)) return 6;
    if (f.deep.includes(q)) return 7;
    return -1;
  }

  function render(root, param) {
    const known = Storage.get(`flashcards`, {});
    let topicParam = null;
    let scrollTermId = null;
    if (param) {
      if (param.startsWith(`topic/`)) topicParam = param.slice(`topic/`.length);
      // 統合した古い用語ID(保存済みのリンク)は引き継ぎ先の用語を開く
      else scrollTermId = AppIndex.retiredTermId ? AppIndex.retiredTermId(param) : param;
    }
    if (topicParam && !AppIndex.topicsById[topicParam]) topicParam = null;
    // 一覧に出す用語: 作品由来の俗語(worksOnly)は「作品で学ぶ」コーナー用なので除く。
    // ただし直リンク(#glossary/<id>)で開いた用語は、戻る・再読み込みでも同じURLなので一覧に残す
    const linkedId = scrollTermId;
    const allTerms = AppIndex.allTerms.filter((t) => t.worksOnly !== true || t.id === linkedId);
    const STATUSES = [
      { id: `all`, label: `すべて` },
      { id: `untouched`, label: `未着手` },
      { id: `learning`, label: `学習中` },
      { id: `known`, label: `記憶済み` },
      { id: `bookmark`, label: `保存` },
    ];
    const DEFAULTS = { search: ``, level: `全て`, topic: `全て`, status: `all` };
    let state = Object.assign({}, DEFAULTS, { topic: topicParam || `全て` });
    // 最初に描くカードの数(残りは「もっと見る」で末尾に追加。全件を一度に描くと端末によっては重い)
    const PAGE_SIZE = 30;
    let visibleCount = PAGE_SIZE;
    // 戻るで帰ってきたときは、絞り込み・表示件数・めくったカードを元に戻す(履歴エントリごとに保存)
    // 直リンク(#glossary/<id>)の履歴へ戻ってきたとき(この履歴に保存した状態がある)も、対象へ飛ばずに保存した状態を使う
    // (スクロール位置で判定すると、画面の一番上で操作してから離れたときに、戻ると直リンクの最初の表示に戻ってしまう。
    //  リンクで新しく開いたとき・同じ直リンクを開き直したとき(Router.navigate)は、履歴に状態がないので直リンクとして開く)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const savedG = hs.gState && typeof hs.gState === `object` ? hs.gState : null;
    // めくったカード(裏返したカードは背が伸びるため、戻ったときに表に戻すと位置がずれる)
    const flippedIds = new Set();
    let restoringFlips = false;
    if (savedG) {
      [`search`, `level`, `topic`, `status`].forEach((k) => { if (typeof savedG[k] === `string`) state[k] = savedG[k]; });
      if (Number(savedG.visible) > 0) visibleCount = Number(savedG.visible);
      if (Array.isArray(savedG.flipped)) savedG.flipped.forEach((id) => { if (typeof id === `string` && AppIndex.termsById[id]) flippedIds.add(id); });
      restoringFlips = true;
      scrollTermId = null;
    }
    // 直リンク(#glossary/<id>)は、その用語の名前で検索した状態で開き、カードの裏(意味)を出す(名前が一致する用語が先頭に来る)
    // (全件の並びの中の位置まで描くと、後ろのほうの用語では百枚以上になり端末によっては重い。検索欄を空にすれば全件に戻る)
    const deepTerm = scrollTermId ? AppIndex.termsById[scrollTermId] : null;
    if (deepTerm) state.search = String(deepTerm.name);
    if (!LEVELS.includes(state.level)) state.level = `全て`;
    if (!STATUSES.some((s) => s.id === state.status)) state.status = `all`;
    if (state.topic !== `全て` && !AppIndex.topicsById[state.topic]) state.topic = `全て`;
    const myHash = location.hash;
    function saveState() {
      // 別の画面へ移ったあと(検索の入力待ちの後など)に書き込むと、移動先の履歴エントリに混ざるため
      if (location.hash !== myHash || !wrap.isConnected) return;
      try {
        const st = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
        window.history.replaceState(Object.assign({}, st, { gState: { search: state.search, level: state.level, topic: state.topic, status: state.status, visible: Math.max(visibleCount, shownCount), flipped: Array.from(flippedIds).slice(-200) } }), ``);
      } catch (e) { /* 履歴の保存に失敗しても表示には影響しない */ }
    }

    const wrap = document.createElement(`div`);
    wrap.className = `view glossary-view`;
    wrap.innerHTML = `
      <div class="learn-head">
        <h2>用語集・<span class="nowrap">フラッシュカード</span></h2>
        <button type="button" class="btn btn-icon learn-info-btn" data-role="info" aria-label="${TITLE}について">${ic(`info`)}</button>
      </div>
      <div class="toolbar gl-toolbar">
        <div class="gl-search-row">
          <input type="search" class="search-input" placeholder="用語・条文を検索…" aria-label="用語検索" enterkeyhint="search">
          <button type="button" class="btn btn-secondary gl-filter-btn" data-role="filter-btn" aria-haspopup="dialog">${ic(`list`, 18)}<span>絞り込み</span><span class="gl-filter-badge num" data-role="filter-badge" hidden></span></button>
        </div>
        <div class="chip-row gl-active-filters" data-role="active-filters" hidden></div>
        <div class="segmented seg-bold glossary-status" data-role="status-seg" role="group" aria-label="学習状況で絞り込み"></div>
      </div>
      <p class="progress-text" data-role="progress-text" aria-live="polite"></p>
      <div class="card-grid" data-role="card-grid"></div>
    `;
    root.appendChild(wrap);

    const searchInput = wrap.querySelector(`.search-input`);
    if (state.search) searchInput.value = state.search;
    const filterBtn = wrap.querySelector(`[data-role="filter-btn"]`);
    const filterBadge = wrap.querySelector(`[data-role="filter-badge"]`);
    const activeRow = wrap.querySelector(`[data-role="active-filters"]`);
    const statusSeg = wrap.querySelector(`[data-role="status-seg"]`);
    const progressText = wrap.querySelector(`[data-role="progress-text"]`);
    const grid = wrap.querySelector(`[data-role="card-grid"]`);

    wrap.querySelector(`[data-role="info"]`).addEventListener(`click`, () => {
      UI.sheet({ title: `${TITLE}について`, content: `<p class="learn-info-text">${INTRO}</p>` });
    });

    const topicName = (id) => (AppIndex.topicsById[id] ? AppIndex.topicsById[id].name : id);

    // ---- レベル・トピックの絞り込み(シートで選び、選んだ条件はツールバーの下に外せるチップで出す) ----
    function paintActiveFilters() {
      const items = [];
      if (state.level !== `全て`) items.push({ key: `level`, label: levelLabel(state.level) });
      if (state.topic !== `全て`) items.push({ key: `topic`, label: topicName(state.topic) });
      filterBadge.hidden = !items.length;
      filterBadge.textContent = items.length ? String(items.length) : ``;
      filterBtn.setAttribute(`aria-label`, items.length ? `絞り込み(${items.length}件の条件)` : `絞り込み`);
      activeRow.hidden = !items.length;
      activeRow.innerHTML = items.map((it) => `<button type="button" class="chip chip-small active gl-active-chip" data-clear="${it.key}" aria-label="「${UI.escapeHtml(it.label)}」の絞り込みを外す"><span>${UI.escapeHtml(it.label)}</span>${ic(`x`, 14)}</button>`).join(``);
    }
    activeRow.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-clear]`);
      if (!b) return;
      state[b.dataset.clear] = `全て`;
      visibleCount = PAGE_SIZE;
      renderGrid();
      // 外したチップは消えるので、フォーカスを絞り込みボタンへ移す
      filterBtn.focus({ preventScroll: true });
    });

    function openFilterSheet() {
      const pending = { level: state.level, topic: state.topic };
      const topicOptions = [{ id: `全て`, name: `すべてのトピック` }, ...window.APP_DATA.topics.map((t) => ({ id: t.id, name: t.name }))];
      const el = document.createElement(`div`);
      el.className = `gl-filter-sheet`;
      el.innerHTML = `
        <p class="gl-filter-label" id="gl-f-level">レベル</p>
        <div class="chip-row" data-role="level-chips" role="group" aria-labelledby="gl-f-level">
          ${LEVELS.map((lvl) => `<button type="button" class="chip chip-small" data-value="${lvl}">${levelLabel(lvl)}</button>`).join(``)}
        </div>
        <p class="gl-filter-label" id="gl-f-topic">トピック</p>
        <div class="chip-row" data-role="topic-chips" role="group" aria-labelledby="gl-f-topic">
          ${topicOptions.map((o) => `<button type="button" class="chip chip-small" data-value="${o.id}">${UI.escapeHtml(o.name)}</button>`).join(``)}
        </div>`;
      // 適用ボタンはシートの下に固定する(UI.sheet の footer)
      const foot = document.createElement(`div`);
      foot.className = `gl-filter-actions`;
      foot.innerHTML = `
        <button type="button" class="btn btn-lg btn-block" data-role="apply"></button>
        <button type="button" class="link-btn" data-role="clear">条件をクリア</button>`;
      const levelRow = el.querySelector(`[data-role="level-chips"]`);
      const topicRow = el.querySelector(`[data-role="topic-chips"]`);
      const applyBtn = foot.querySelector(`[data-role="apply"]`);
      function paint() {
        paintChips(levelRow, pending.level);
        paintChips(topicRow, pending.topic);
        computeStatuses();
        const n = baseList(pending).filter(matchesStatus).length;
        applyBtn.textContent = `この条件で表示(${n}語)`;
      }
      levelRow.addEventListener(`click`, (e) => { const c = e.target.closest(`[data-value]`); if (c) { pending.level = c.dataset.value; paint(); } });
      topicRow.addEventListener(`click`, (e) => { const c = e.target.closest(`[data-value]`); if (c) { pending.topic = c.dataset.value; paint(); } });
      foot.querySelector(`[data-role="clear"]`).addEventListener(`click`, () => { pending.level = `全て`; pending.topic = `全て`; paint(); });
      paint();
      const sheet = UI.sheet({ title: `用語を絞り込む`, content: el, footer: foot });
      // footer に対応していない UI.sheet では本文の最後に置く
      if (!foot.isConnected) {
        foot.classList.add(`sheet-foot`);
        el.appendChild(foot);
      }
      applyBtn.addEventListener(`click`, () => {
        const changed = pending.level !== state.level || pending.topic !== state.topic;
        sheet.close();
        if (!changed) return;
        state.level = pending.level;
        state.topic = pending.topic;
        visibleCount = PAGE_SIZE;
        renderGrid();
      });
    }
    filterBtn.addEventListener(`click`, openFilterSheet);

    function paintChips(row, value) {
      row.querySelectorAll(`.chip`).forEach((c) => {
        const on = c.dataset.value === value;
        c.classList.toggle(`active`, on);
        c.setAttribute(`aria-pressed`, String(on));
      });
    }

    let searchDebounceTimer = null;
    searchInput.addEventListener(`input`, (e) => {
      const value = e.target.value;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.search = value.trim();
        visibleCount = PAGE_SIZE;
        renderGrid();
      }, 180);
    });

    STATUSES.forEach((s) => {
      const btn = document.createElement(`button`);
      btn.type = `button`;
      btn.className = `segmented-item`;
      btn.dataset.status = s.id;
      btn.setAttribute(`aria-pressed`, String(s.id === state.status));
      btn.addEventListener(`click`, () => {
        state.status = s.id;
        statusSeg.querySelectorAll(`.segmented-item`).forEach((b) => b.setAttribute(`aria-pressed`, String(b === btn)));
        visibleCount = PAGE_SIZE;
        renderGrid();
      });
      statusSeg.appendChild(btn);
    });

    // 絞り込みをすべて解除(空の結果から戻る)
    function resetFilters() {
      state = Object.assign({}, DEFAULTS);
      searchInput.value = ``;
      clearTimeout(searchDebounceTimer);
      statusSeg.querySelectorAll(`.segmented-item`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.status === `all`)));
      visibleCount = PAGE_SIZE;
      renderGrid();
    }

    // 用語ごとの学習状況としおり(描画のたびに1回だけ読む)
    let statusMap = {};
    let bmAll = {};
    function computeStatuses() {
      const bp = Storage.get(`basicsProgress`, {}) || {};
      const cards = Srs.getAllCards();
      const auto = Storage.get(`autoQuizStats`, {}) || {};
      bmAll = Storage.get(`bookmarks`, {}) || {};
      statusMap = {};
      allTerms.forEach((t) => {
        if (known[t.id]) statusMap[t.id] = `known`;
        else if (cards[t.id] || auto[t.id] || (bp[t.id] && bp[t.id].learned)) statusMap[t.id] = `learning`;
        else statusMap[t.id] = `untouched`;
      });
    }
    const isBookmarked = (term) => !!bmAll[`term:${term.id}`];

    function matchesStatus(term) {
      if (state.status === `all`) return true;
      if (state.status === `bookmark`) return isBookmarked(term);
      return statusMap[term.id] === state.status;
    }

    // 状態以外の条件で絞った件数を各ボタンに表示
    function updateStatusCounts(baseTerms) {
      const counts = { all: baseTerms.length, untouched: 0, learning: 0, known: 0, bookmark: 0 };
      baseTerms.forEach((t) => {
        counts[statusMap[t.id]] += 1;
        if (isBookmarked(t)) counts.bookmark += 1;
      });
      statusSeg.querySelectorAll(`.segmented-item`).forEach((b) => {
        const s = STATUSES.find((x) => x.id === b.dataset.status);
        b.innerHTML = `${s.label}<span class="segmented-count">${counts[s.id]}</span>`;
      });
    }

    // 学習状況以外の条件(レベル・トピック・検索語)で絞り、並べ替えた一覧
    // 並び順: 検索中は関連度順、トピック選択中はそのトピックの基礎知識の順(小見出し順)→ほかの用語、それ以外はデータ順
    // cond: { level, topic }(省略時は今の条件。シートで選んでいる途中の件数にも使う)
    function baseList(cond) {
      const level = cond ? cond.level : state.level;
      const topic = cond ? cond.topic : state.topic;
      const q = state.search ? norm(state.search) : ``;
      const topicOrder = topic !== `全て` && AppIndex.topicBasicOrder ? (AppIndex.topicBasicOrder[topic] || []) : [];
      const pos = new Map();
      topicOrder.forEach((id, i) => pos.set(id, i));
      const rows = [];
      allTerms.forEach((term, i) => {
        if (level !== `全て` && term.level !== level) return;
        if (topic !== `全て` && !(term.topicIds || []).includes(topic)) return;
        const rank = q ? rankOf(term, q) : 0;
        if (rank < 0) return;
        rows.push({ term, rank, order: pos.has(term.id) ? pos.get(term.id) : topicOrder.length + i });
      });
      rows.sort((a, b) => (a.rank - b.rank) || (a.order - b.order));
      return rows.map((r) => r.term);
    }

    let currentTerms = [];
    let shownCount = 0;

    // 「表示中 n件・★記憶済み n/全体語」(記憶済みはごほうびの金色の星。星は飾りなので読み上げない)
    function progressLabel() {
      const knownCount = allTerms.filter((t) => known[t.id]).length;
      return `<span>表示中 <b>${currentTerms.length}</b>件・</span><span>${ic(`star-fill`, 14)}記憶済み <b>${knownCount}</b>/${allTerms.length}語</span>`;
    }

    // 件数と記憶済み数だけ更新する(カードは作り直さない)
    function refreshMeta() {
      computeStatuses();
      updateStatusCounts(baseList());
      progressText.innerHTML = progressLabel();
    }

    // 絞り込みの条件から外れたカードは、その場では消さずに薄く表示する(消すと一覧がずれて位置が飛ぶため)
    function markStale(card, term) {
      card.classList.toggle(`filter-stale`, !matchesStatus(term));
    }

    function renderLoadMore() {
      const existing = grid.nextElementSibling;
      if (existing && existing.classList.contains(`load-more-btn`)) existing.remove();
      if (shownCount >= currentTerms.length) return;
      const loadMoreBtn = document.createElement(`button`);
      loadMoreBtn.type = `button`;
      loadMoreBtn.className = `btn load-more-btn`;
      loadMoreBtn.textContent = `もっと見る(残り${currentTerms.length - shownCount}件)`;
      loadMoreBtn.addEventListener(`click`, () => {
        // 作り直さずに続きを末尾へ追加する(スクロール位置を保つ)
        const next = currentTerms.slice(shownCount, shownCount + PAGE_SIZE);
        const fragment = document.createDocumentFragment();
        next.forEach((term) => fragment.appendChild(buildCard(term)));
        grid.appendChild(fragment);
        shownCount += next.length;
        visibleCount = shownCount;
        // ボタンは作り直さず文言だけ更新する(キーボード操作のフォーカスを保つ)
        if (shownCount >= currentTerms.length) loadMoreBtn.remove();
        else loadMoreBtn.textContent = `もっと見る(残り${currentTerms.length - shownCount}件)`;
        saveState();
      });
      grid.insertAdjacentElement(`afterend`, loadMoreBtn);
    }

    function emptyStateEl() {
      const onlyBookmark = state.status === `bookmark` && !state.search && state.level === `全て` && state.topic === `全て`;
      const el = UI.emptyState({
        icon: onlyBookmark ? `bookmark` : `search`,
        title: onlyBookmark ? `保存した用語はありません` : `該当する用語がありません`,
        body: onlyBookmark ? `用語カードの右上にあるしおりマークを押すと、ここに表示されます。` : `検索語や絞り込みを変えてみてください。`,
        cta: { label: `条件をクリア`, onClick: resetFilters },
      });
      el.classList.add(`glossary-empty`);
      return el;
    }

    function renderGrid() {
      computeStatuses();
      paintActiveFilters();
      const baseTerms = baseList();
      updateStatusCounts(baseTerms);
      currentTerms = baseTerms.filter(matchesStatus);
      progressText.innerHTML = progressLabel();

      const targetIdx = scrollTermId ? currentTerms.findIndex((t) => t.id === scrollTermId) : -1;
      // 直リンクの対象が最初のページより後ろにあるときは、その用語まで描く
      let needCount = visibleCount;
      if (targetIdx >= 0) needCount = Math.max(visibleCount, targetIdx + 6);
      shownCount = Math.min(needCount, currentTerms.length);
      // 作り直したカードはすべて表向き(戻ったときの最初の描画だけ、保存しておいた裏返しを再現する)
      if (!restoringFlips) flippedIds.clear();
      restoringFlips = false;
      // 直リンクの対象は最初から裏(意味)を出して作る(作ってからめくると動きが出る)
      if (targetIdx >= 0) flippedIds.add(scrollTermId);

      grid.innerHTML = ``;
      if (!currentTerms.length) {
        grid.appendChild(emptyStateEl());
      } else {
        const fragment = document.createDocumentFragment();
        currentTerms.slice(0, shownCount).forEach((term) => fragment.appendChild(buildCard(term)));
        grid.appendChild(fragment);
      }
      renderLoadMore();
      saveState();

      if (scrollTermId) {
        const target = targetIdx >= 0 ? grid.querySelector(`[data-term-id="${window.CSS && CSS.escape ? CSS.escape(scrollTermId) : scrollTermId}"]`) : null;
        // 直リンクの対象は最初の1回だけ開く(星やフィルタ操作のたびに戻らないように)
        scrollTermId = null;
        if (target) requestAnimationFrame(() => UI.scrollIntoView(target));
      }
    }

    function buildCard(term) {
      const card = CardUi.buildFlipCard(term, {
        known,
        bookmarked: isBookmarked(term),
        flipped: flippedIds.has(term.id),
        onFlip: (t, on) => {
          if (on) flippedIds.add(t.id); else flippedIds.delete(t.id);
          saveState();
        },
        onToggleKnown: () => { refreshMeta(); markStale(card, term); },
        onToggleBookmark: () => { refreshMeta(); markStale(card, term); },
      });
      return card;
    }

    renderGrid();
  }

  return { render };
})();
