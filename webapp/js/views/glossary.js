// 用語集・フラッシュカードビュー(作中用語+基礎知識を統合)
window.Views = window.Views || {};
window.Views.glossary = (function () {
  // `全て` は「すべて」を表す内部の値(履歴に保存した絞り込みと合わせるため値は変えない。表示は「すべて」)
  const LEVELS = [`全て`, `超入門`, `初級`, `中級`, `上級`];
  const levelLabel = (lvl) => (lvl === `全て` ? `すべて` : lvl);

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
    const STATUSES = [
      { id: `all`, label: `すべて` },
      { id: `untouched`, label: `未着手` },
      { id: `learning`, label: `学習中` },
      { id: `known`, label: `記憶済み` },
      { id: `bookmark`, label: `保存` },
    ];
    const DEFAULTS = { search: ``, level: `全て`, topic: `全て`, status: `all` };
    let state = Object.assign({}, DEFAULTS, { topic: topicParam || `全て` });
    const PAGE_SIZE = 60;
    let visibleCount = PAGE_SIZE;
    // 戻るで帰ってきたときは、絞り込み・表示件数・めくったカードを元に戻す(履歴エントリごとに保存)
    // 直リンク(#glossary/<id>)の履歴へ戻ってきたとき(スクロール位置の記録がある)も、対象へ飛ばずに保存した状態を使う
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const returning = Number(hs.y) > 0;
    const savedG = hs.gState && typeof hs.gState === `object` && (!scrollTermId || returning) ? hs.gState : null;
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
      <h2>用語集・フラッシュカード</h2>
      <p class="view-desc">タップでカードをめくって意味を確認。右上の星マークで「記憶済み」、しおりマークでブックマークできます。「基礎知識」タグは作中に登場しない一般的な不動産知識です。根拠条文(例: 96条、借地借家法)でも検索できます。</p>
      <div class="toolbar">
        <input type="search" class="search-input" placeholder="用語・条文を検索…" aria-label="用語検索" enterkeyhint="search">
        <div class="chip-row" data-role="level-chips" role="group" aria-label="レベルで絞り込み"></div>
        <div class="chip-row chip-row-scroll" data-role="topic-chips" role="group" aria-label="トピックで絞り込み"></div>
        <div class="segmented glossary-status" data-role="status-seg" role="group" aria-label="学習状況で絞り込み"></div>
      </div>
      <p class="progress-text" data-role="progress-text" aria-live="polite"></p>
      <div class="card-grid" data-role="card-grid"></div>
    `;
    root.appendChild(wrap);

    const searchInput = wrap.querySelector(`.search-input`);
    if (state.search) searchInput.value = state.search;
    const chipRow = wrap.querySelector(`[data-role="level-chips"]`);
    const topicChipRow = wrap.querySelector(`[data-role="topic-chips"]`);
    const statusSeg = wrap.querySelector(`[data-role="status-seg"]`);
    const progressText = wrap.querySelector(`[data-role="progress-text"]`);
    const grid = wrap.querySelector(`[data-role="card-grid"]`);

    function paintChips(row, value) {
      row.querySelectorAll(`.chip`).forEach((c) => {
        const on = c.dataset.value === value;
        c.classList.toggle(`active`, on);
        c.setAttribute(`aria-pressed`, String(on));
      });
    }

    LEVELS.forEach((lvl) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip chip-small`;
      chip.dataset.value = lvl;
      chip.textContent = levelLabel(lvl);
      chip.addEventListener(`click`, () => {
        state.level = lvl;
        paintChips(chipRow, lvl);
        visibleCount = PAGE_SIZE;
        renderGrid();
      });
      chipRow.appendChild(chip);
    });
    paintChips(chipRow, state.level);

    const topicOptions = [{ id: `全て`, name: `全トピック` }, ...window.APP_DATA.topics.map((t) => ({ id: t.id, name: t.name }))];
    topicOptions.forEach((opt) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip chip-small`;
      chip.dataset.value = opt.id;
      chip.textContent = opt.name;
      chip.addEventListener(`click`, () => {
        state.topic = opt.id;
        paintChips(topicChipRow, opt.id);
        visibleCount = PAGE_SIZE;
        renderGrid();
      });
      topicChipRow.appendChild(chip);
    });
    paintChips(topicChipRow, state.topic);

    // 横スクロールのチップ列で、選択中のトピックが画面外にあると絞り込みに気づけないため、見える位置まで送る
    // (scrollIntoView はページ全体も動かすことがあるので、チップ列だけを横に動かす)
    function revealActiveTopicChip() {
      const chip = topicChipRow.querySelector(`.chip.active`);
      if (!chip || topicChipRow.scrollWidth <= topicChipRow.clientWidth) return;
      const r = topicChipRow.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      topicChipRow.scrollLeft += (c.left - r.left) - Math.max(0, (r.width - c.width) / 2);
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
      paintChips(chipRow, state.level);
      paintChips(topicChipRow, state.topic);
      statusSeg.querySelectorAll(`.segmented-item`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.status === `all`)));
      topicChipRow.scrollLeft = 0;
      visibleCount = PAGE_SIZE;
      renderGrid();
    }

    // 用語ごとの学習状況(描画のたびに1回だけ計算)
    let statusMap = {};
    function computeStatuses() {
      const bp = Storage.get(`basicsProgress`, {}) || {};
      const cards = Srs.getAllCards();
      const auto = Storage.get(`autoQuizStats`, {}) || {};
      statusMap = {};
      AppIndex.allTerms.forEach((t) => {
        if (known[t.id]) statusMap[t.id] = `known`;
        else if (cards[t.id] || auto[t.id] || (bp[t.id] && bp[t.id].learned)) statusMap[t.id] = `learning`;
        else statusMap[t.id] = `untouched`;
      });
    }

    function matchesStatus(term) {
      if (state.status === `all`) return true;
      if (state.status === `bookmark`) return Bookmarks.has(`term:${term.id}`);
      return statusMap[term.id] === state.status;
    }

    // 状態以外の条件で絞った件数を各ボタンに表示
    function updateStatusCounts(baseTerms) {
      const counts = { all: baseTerms.length, untouched: 0, learning: 0, known: 0, bookmark: 0 };
      baseTerms.forEach((t) => {
        counts[statusMap[t.id]] += 1;
        if (Bookmarks.has(`term:${t.id}`)) counts.bookmark += 1;
      });
      statusSeg.querySelectorAll(`.segmented-item`).forEach((b) => {
        const s = STATUSES.find((x) => x.id === b.dataset.status);
        b.innerHTML = `${s.label}<span class="segmented-count">${counts[s.id]}</span>`;
      });
    }

    // 学習状況以外の条件(レベル・トピック・検索語)で絞り、並べ替えた一覧
    // 並び順: 検索中は関連度順、トピック選択中はそのトピックの基礎知識の順(小見出し順)→ほかの用語、それ以外はデータ順
    function baseList() {
      const q = state.search ? norm(state.search) : ``;
      const topicOrder = state.topic !== `全て` && AppIndex.topicBasicOrder ? (AppIndex.topicBasicOrder[state.topic] || []) : [];
      const pos = new Map();
      topicOrder.forEach((id, i) => pos.set(id, i));
      const rows = [];
      AppIndex.allTerms.forEach((term, i) => {
        if (state.level !== `全て` && term.level !== state.level) return;
        if (state.topic !== `全て` && !(term.topicIds || []).includes(state.topic)) return;
        const rank = q ? rankOf(term, q) : 0;
        if (rank < 0) return;
        rows.push({ term, rank, order: pos.has(term.id) ? pos.get(term.id) : topicOrder.length + i });
      });
      rows.sort((a, b) => (a.rank - b.rank) || (a.order - b.order));
      return rows.map((r) => r.term);
    }

    let currentTerms = [];
    let shownCount = 0;

    function progressLabel() {
      const knownCount = AppIndex.allTerms.filter((t) => known[t.id]).length;
      const topic = state.topic !== `全て` ? AppIndex.topicsById[state.topic] : null;
      return `記憶済み: ${knownCount} / ${AppIndex.allTerms.length} 語(表示中: ${currentTerms.length}件${topic ? `・トピック: ${topic.name}` : ``})`;
    }

    // 件数と記憶済み数だけ更新する(カードは作り直さない)
    function refreshMeta() {
      computeStatuses();
      updateStatusCounts(baseList());
      progressText.textContent = progressLabel();
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
      const baseTerms = baseList();
      updateStatusCounts(baseTerms);
      currentTerms = baseTerms.filter(matchesStatus);
      progressText.textContent = progressLabel();

      const noFilters = !state.search && state.level === `全て` && state.topic === `全て` && state.status === `all`;
      const needsFullRenderForScroll = scrollTermId && noFilters;
      // 直リンク(#glossary/<id>)は、全件ではなくその用語まで描画する(全件描画は端末によっては数秒かかる)
      let needCount = visibleCount;
      if (needsFullRenderForScroll) {
        const idx = currentTerms.findIndex((t) => t.id === scrollTermId);
        needCount = Math.max(visibleCount, idx + 6);
      }
      shownCount = Math.min(needCount, currentTerms.length);
      // 作り直したカードはすべて表向き(戻ったときの最初の描画だけ、保存しておいた裏返しを再現する)
      if (!restoringFlips) flippedIds.clear();
      restoringFlips = false;

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

      if (needsFullRenderForScroll) {
        const target = grid.querySelector(`[data-term-id="${window.CSS && CSS.escape ? CSS.escape(scrollTermId) : scrollTermId}"]`);
        // 直リンクの対象は最初の1回だけ開く(星やフィルタ操作のたびに戻らないように)
        scrollTermId = null;
        if (target) {
          target.classList.add(`flipped`);
          flippedIds.add(target.dataset.termId);
          saveState();
          requestAnimationFrame(() => UI.scrollIntoView(target));
        }
      }
    }

    function buildCard(term) {
      const episodeChips = (term.relatedEpisodes || []).map((epId) => {
        const ep = AppIndex.episodesById[epId];
        const label = ep ? ep.displayLabel : epId;
        return `<button type="button" class="chip chip-small" data-nav="#summary/${epId}">${label}</button>`;
      }).join(``);

      const card = CardUi.buildFlipCard(term, {
        known,
        episodeChips,
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
    revealActiveTopicChip();
  }

  return { render };
})();
