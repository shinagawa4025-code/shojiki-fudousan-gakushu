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
    let state = { search: ``, level: `全て`, topic: topicParam || `全て`, memorizeMode: false };

    const wrap = document.createElement(`div`);
    wrap.className = `view glossary-view`;
    wrap.innerHTML = `
      <h2>用語集・フラッシュカード</h2>
      <p class="view-desc">タップでカードをめくって意味を確認。右上の★で「記憶済み」を記録できます。「基礎知識」タグは作中に登場しない一般的な不動産知識です。</p>
      <div class="toolbar">
        <input type="search" class="search-input" placeholder="用語を検索…" aria-label="用語検索">
        <div class="chip-row" data-role="level-chips"></div>
        <div class="chip-row" data-role="topic-chips"></div>
        <label class="memorize-toggle">
          <input type="checkbox" data-role="memorize-mode">
          暗記モード(未記憶のみ表示)
        </label>
      </div>
      <p class="progress-text" data-role="progress-text"></p>
      <div class="card-grid" data-role="card-grid"></div>
    `;
    root.appendChild(wrap);

    const searchInput = wrap.querySelector(`.search-input`);
    const chipRow = wrap.querySelector(`[data-role="level-chips"]`);
    const topicChipRow = wrap.querySelector(`[data-role="topic-chips"]`);
    const memorizeCheckbox = wrap.querySelector(`[data-role="memorize-mode"]`);
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
        renderGrid();
      });
      topicChipRow.appendChild(chip);
    });

    searchInput.addEventListener(`input`, (e) => {
      state.search = e.target.value.trim();
      renderGrid();
    });

    memorizeCheckbox.addEventListener(`change`, (e) => {
      state.memorizeMode = e.target.checked;
      renderGrid();
    });

    function matches(term) {
      if (state.level !== `全て` && term.level !== state.level) return false;
      if (state.topic !== `全て` && !(term.topicIds || []).includes(state.topic)) return false;
      if (state.memorizeMode && known[term.id]) return false;
      if (!state.search) return true;
      const q = state.search.toLowerCase();
      const haystack = [term.name, ...term.aliases, term.simpleExplanation].join(` `).toLowerCase();
      return haystack.includes(q);
    }

    function renderGrid() {
      const allTerms = AppIndex.allTerms;
      const terms = allTerms.filter(matches);
      const total = allTerms.length;
      const knownCount = allTerms.filter((t) => known[t.id]).length;
      progressText.textContent = `記憶済み: ${knownCount} / ${total} 語(表示中: ${terms.length}件)`;

      grid.innerHTML = ``;
      terms.forEach((term) => grid.appendChild(buildCard(term)));

      if (scrollTermId && !state.search && state.level === `全て` && state.topic === `全て` && !state.memorizeMode) {
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
      });
    }

    renderGrid();
  }

  return { render };
})();
