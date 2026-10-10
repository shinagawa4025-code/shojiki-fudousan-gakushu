// 用語集・フラッシュカードビュー(作中用語+基礎知識を統合)
window.Views = window.Views || {};
window.Views.glossary = (function () {
  const LEVELS = [`全て`, `超入門`, `初級`, `中級`, `上級`];

  function render(root, param) {
    const known = Storage.get(`flashcards`, {});
    let topicParam = null;
    let scrollTermId = null;
    if (param) {
      if (param.startsWith(`topic/`)) topicParam = param.slice(`topic/`.length);
      else scrollTermId = param;
    }
    const STATUSES = [
      { id: `all`, label: `全て` },
      { id: `untouched`, label: `未着手` },
      { id: `learning`, label: `学習中` },
      { id: `known`, label: `記憶済み` },
      { id: `bookmark`, label: `保存` },
    ];
    let state = { search: ``, level: `全て`, topic: topicParam || `全て`, status: `all` };
    const PAGE_SIZE = 60;
    let visibleCount = PAGE_SIZE;

    const wrap = document.createElement(`div`);
    wrap.className = `view glossary-view`;
    wrap.innerHTML = `
      <h2>用語集・フラッシュカード</h2>
      <p class="view-desc">タップでカードをめくって意味を確認。右上の星マークで「記憶済み」、しおりマークでブックマークできます。「基礎知識」タグは作中に登場しない一般的な不動産知識です。</p>
      <div class="toolbar">
        <input type="search" class="search-input" placeholder="用語を検索…" aria-label="用語検索">
        <div class="chip-row" data-role="level-chips"></div>
        <div class="chip-row chip-row-scroll" data-role="topic-chips"></div>
        <div class="segmented glossary-status" data-role="status-seg" role="group" aria-label="学習状況で絞り込み"></div>
      </div>
      <p class="progress-text" data-role="progress-text"></p>
      <div class="card-grid" data-role="card-grid"></div>
    `;
    root.appendChild(wrap);

    const searchInput = wrap.querySelector(`.search-input`);
    const chipRow = wrap.querySelector(`[data-role="level-chips"]`);
    const topicChipRow = wrap.querySelector(`[data-role="topic-chips"]`);
    const statusSeg = wrap.querySelector(`[data-role="status-seg"]`);
    const progressText = wrap.querySelector(`[data-role="progress-text"]`);
    const grid = wrap.querySelector(`[data-role="card-grid"]`);

    LEVELS.forEach((lvl) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (lvl === state.level ? ` active` : ``);
      chip.textContent = lvl;
      chip.addEventListener(`click`, () => {
        state.level = lvl;
        chipRow.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === lvl));
        visibleCount = PAGE_SIZE;
        renderGrid();
      });
      chipRow.appendChild(chip);
    });

    const topicOptions = [{ id: `全て`, name: `全トピック` }, ...window.APP_DATA.topics.map((t) => ({ id: t.id, name: t.name }))];
    topicOptions.forEach((opt) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip chip-small` + (opt.id === state.topic ? ` active` : ``);
      chip.textContent = opt.name;
      chip.addEventListener(`click`, () => {
        state.topic = opt.id;
        topicChipRow.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === opt.name));
        visibleCount = PAGE_SIZE;
        renderGrid();
      });
      topicChipRow.appendChild(chip);
    });

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

    function matchesBase(term) {
      if (state.level !== `全て` && term.level !== state.level) return false;
      if (state.topic !== `全て` && !(term.topicIds || []).includes(state.topic)) return false;
      if (!state.search) return true;
      // 全角半角・カタカナひらがなの違いを無視して検索
      const norm = (window.GlobalSearch && GlobalSearch.norm) || ((s) => s.toLowerCase());
      const q = norm(state.search);
      const haystack = norm([term.name, ...(term.aliases || []), term.simpleExplanation].join(` `));
      return haystack.includes(q);
    }

    function renderGrid() {
      const allTerms = AppIndex.allTerms;
      computeStatuses();
      const baseTerms = allTerms.filter(matchesBase);
      updateStatusCounts(baseTerms);
      const terms = baseTerms.filter(matchesStatus);
      const total = allTerms.length;
      const knownCount = allTerms.filter((t) => known[t.id]).length;
      progressText.textContent = `記憶済み: ${knownCount} / ${total} 語(表示中: ${terms.length}件)`;

      const noFilters = !state.search && state.level === `全て` && state.topic === `全て` && state.status === `all`;
      const needsFullRenderForScroll = scrollTermId && noFilters;
      const shown = needsFullRenderForScroll ? terms.length : Math.min(visibleCount, terms.length);

      const existingLoadMoreBtn = grid.nextElementSibling;
      if (existingLoadMoreBtn && existingLoadMoreBtn.classList.contains(`load-more-btn`)) {
        existingLoadMoreBtn.remove();
      }

      grid.innerHTML = ``;
      const fragment = document.createDocumentFragment();
      terms.slice(0, shown).forEach((term) => fragment.appendChild(buildCard(term)));
      grid.appendChild(fragment);

      if (shown < terms.length) {
        const loadMoreBtn = document.createElement(`button`);
        loadMoreBtn.type = `button`;
        loadMoreBtn.className = `btn load-more-btn`;
        loadMoreBtn.textContent = `もっと見る(残り${terms.length - shown}件)`;
        loadMoreBtn.addEventListener(`click`, () => {
          visibleCount += PAGE_SIZE;
          renderGrid();
        });
        grid.insertAdjacentElement(`afterend`, loadMoreBtn);
      }

      if (needsFullRenderForScroll) {
        const target = grid.querySelector(`[data-term-id="${scrollTermId}"]`);
        if (target) {
          target.classList.add(`flipped`);
          requestAnimationFrame(() => target.scrollIntoView({ behavior: `smooth`, block: `center` }));
        }
      }
    }

    function buildCard(term) {
      const episodeChips = (term.relatedEpisodes || []).map((epId) => {
        const ep = AppIndex.episodesById[epId];
        const label = ep ? ep.displayLabel : epId;
        return `<button type="button" class="chip chip-small" data-nav="#summary/${epId}">${label}</button>`;
      }).join(``);

      return CardUi.buildFlipCard(term, {
        known,
        episodeChips,
        onToggleKnown: () => renderGrid(),
        onToggleBookmark: () => { if (state.status === `bookmark`) renderGrid(); else updateStatusCounts(AppIndex.allTerms.filter(matchesBase)); },
      });
    }

    renderGrid();
  }

  return { render };
})();
