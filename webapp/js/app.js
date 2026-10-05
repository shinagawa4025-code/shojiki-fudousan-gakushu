// 初期化
(function () {
  Router.register(`topics`, window.Views.topics);
  Router.register(`glossary`, window.Views.glossary);
  Router.register(`quiz`, window.Views.quiz);
  Router.register(`sources`, window.Views.sources);
  Router.register(`summary`, window.Views.summary);

  function initGlobalSearch() {
    const input = document.getElementById(`global-search-input`);
    const resultsEl = document.getElementById(`global-search-results`);
    if (!input || !resultsEl) return;

    function closeResults() {
      resultsEl.hidden = true;
      resultsEl.innerHTML = ``;
    }

    function positionResults() {
      const rect = input.getBoundingClientRect();
      resultsEl.style.top = `${rect.bottom + 6}px`;
      resultsEl.style.left = `${rect.left}px`;
      resultsEl.style.width = `${rect.width}px`;
    }

    function renderResults(items) {
      if (!items.length) {
        resultsEl.innerHTML = `<div class="global-search-empty">一致する結果が見つかりません</div>`;
        resultsEl.hidden = false;
        positionResults();
        return;
      }
      resultsEl.innerHTML = items.map((item, i) => `
        <button type="button" class="global-search-item" data-idx="${i}">
          <span class="global-search-type">${item.type}</span>
          <span class="global-search-title">${item.title}</span>
          <span class="global-search-snippet">${item.snippet}</span>
        </button>
      `).join(``);
      resultsEl.querySelectorAll(`[data-idx]`).forEach((btn) => {
        btn.addEventListener(`click`, () => {
          const item = items[Number(btn.dataset.idx)];
          input.value = ``;
          closeResults();
          Router.navigate(item.nav);
        });
      });
      resultsEl.hidden = false;
      positionResults();
    }

    input.addEventListener(`input`, () => {
      const q = input.value.trim();
      if (!q) { closeResults(); return; }
      renderResults(window.GlobalSearch.search(q, 8));
    });

    input.addEventListener(`keydown`, (e) => {
      if (e.key === `Escape`) { input.blur(); closeResults(); }
    });

    document.addEventListener(`click`, (e) => {
      if (e.target !== input && !resultsEl.contains(e.target)) closeResults();
    });

    window.addEventListener(`hashchange`, closeResults);
    window.addEventListener(`resize`, () => { if (!resultsEl.hidden) positionResults(); });
  }

  document.addEventListener(`DOMContentLoaded`, () => {
    Router.init(document.getElementById(`view-root`));
    initGlobalSearch();
  });
})();
