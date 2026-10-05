// 要約ビュー: 56テーマ + 特別編7本
window.Views = window.Views || {};
window.Views.summary = (function () {
  function render(root, param) {
    const wrap = document.createElement(`div`);
    wrap.className = `view summary-view`;
    wrap.innerHTML = `
      <h2>動画一覧(アーカイブ)</h2>
      <p class="view-desc">「正直不動産」全56話を話数順に見られる参照用のアーカイブです(2026年10月4日時点)。体系的に学ぶなら<button type="button" class="link-btn" data-nav="#topics">学習トピック</button>から始めるのがおすすめです。用語をタップすると用語集にジャンプします。</p>
      <input type="search" class="search-input" placeholder="テーマ・要点・用語を検索…" aria-label="話を検索">
      <div class="card-list" data-role="episode-list"></div>
      <details class="specials-section">
        <summary>特別編・総集編(7本)</summary>
        <div class="card-list" data-role="specials-list"></div>
      </details>
    `;
    root.appendChild(wrap);

    const searchInput = wrap.querySelector(`.search-input`);
    const list = wrap.querySelector(`[data-role="episode-list"]`);
    const specialsList = wrap.querySelector(`[data-role="specials-list"]`);

    wrap.querySelectorAll(`[data-nav]`).forEach((btn) => {
      btn.addEventListener(`click`, () => Router.navigate(btn.dataset.nav));
    });

    const episodeTopicIndex = {};
    window.APP_DATA.topics.forEach((topic) => {
      topic.episodes.forEach((epId) => { episodeTopicIndex[epId] = topic; });
    });

    window.APP_DATA.specials.forEach((sp) => specialsList.appendChild(buildSpecialCard(sp)));

    function matches(ep, q) {
      if (!q) return true;
      const haystack = [ep.theme, ep.summary, ...ep.terms.map((t) => t.term), ep.termsNote || ``].join(` `).toLowerCase();
      return haystack.includes(q);
    }

    function renderList() {
      const q = searchInput.value.trim().toLowerCase();
      list.innerHTML = ``;
      window.APP_DATA.episodes.filter((ep) => matches(ep, q)).forEach((ep) => list.appendChild(buildEpisodeCard(ep)));
    }

    searchInput.addEventListener(`input`, renderList);
    renderList();

    if (param) {
      const target = list.querySelector(`[data-episode-id="${param}"]`);
      if (target) requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: `smooth`, block: `center` });
        target.classList.add(`highlighted`);
        setTimeout(() => target.classList.remove(`highlighted`), 1500);
      });
    }

    function buildEpisodeCard(ep) {
      const card = document.createElement(`div`);
      card.className = `card episode-card`;
      card.dataset.episodeId = ep.id;

      const termChips = AppIndex.episodeTermIndex[ep.id] || [];
      const chipsHtml = termChips.map((termId) => {
        const t = AppIndex.termsById[termId];
        return `<button type="button" class="chip chip-small" data-nav="#glossary/${termId}">${t.name}</button>`;
      }).join(``);

      const topic = episodeTopicIndex[ep.id];

      card.innerHTML = `
        <div class="card-header">
          <span class="episode-label">${ep.displayLabel}</span>
          <span class="episode-theme">${ep.theme}</span>
          ${topic ? `<button type="button" class="chip chip-small chip-topic" data-nav="#topics/${topic.id}">${topic.name}</button>` : ``}
        </div>
        <p class="episode-summary">${ep.summary}</p>
        ${ep.termsNote ? `<p class="terms-note">${ep.termsNote}</p>` : ``}
        ${chipsHtml ? `<div class="episode-chip-row">${chipsHtml}</div>` : ``}
        <div class="video-links">
          <a href="${ep.videos.zenpen.url}" target="_blank" rel="noopener" class="btn">▶ ${ep.videos.zenpen.label}</a>
          <a href="${ep.videos.kouhen.url}" target="_blank" rel="noopener" class="btn">▶ ${ep.videos.kouhen.label}</a>
        </div>
      `;

      card.querySelectorAll(`[data-nav]`).forEach((btn) => {
        btn.addEventListener(`click`, () => Router.navigate(btn.dataset.nav));
      });

      return card;
    }

    function buildSpecialCard(sp) {
      const card = document.createElement(`div`);
      card.className = `card special-card`;
      card.innerHTML = `
        <div class="card-header"><span class="episode-theme">${sp.title}</span></div>
        <p class="episode-summary">${sp.description}</p>
        <p class="special-duration">${sp.duration}</p>
        <div class="video-links"><a href="${sp.url}" target="_blank" rel="noopener" class="btn">▶ 視聴</a></div>
      `;
      return card;
    }
  }

  return { render };
})();
