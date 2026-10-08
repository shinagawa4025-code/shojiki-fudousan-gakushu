// 用語フリップカードの共通生成ロジック(glossary/topics/review で共用)
window.CardUi = (function () {
  function buildSourceCitationHtml(term) {
    const sourceIds = term.sources || [];
    if (!sourceIds.length) return ``;
    const links = sourceIds.map((srcId) => {
      const src = AppIndex.sourcesById[srcId];
      if (!src) return ``;
      return `<a href="${src.url}" target="_blank" rel="noopener">${src.orgName}</a>`;
    }).filter(Boolean).join(`、`);
    return links ? `<p class="term-citation">出典: ${links}</p>` : ``;
  }

  function buildLawRefHtml(term) {
    return term.lawRef ? `<p class="law-ref">根拠法令: ${term.lawRef}</p>` : ``;
  }

  // opts: { known, onToggleKnown(term), episodeChips(html), showGrading, onGrade(term, grade) }
  function buildFlipCard(term, opts) {
    opts = opts || {};
    const known = opts.known || {};
    const card = document.createElement(`div`);
    card.className = `flip-card` + (opts.showGrading ? ` flip-card-tall` : ``);
    card.dataset.termId = term.id;
    const isKnown = !!known[term.id];
    const sourceLabel = term.source === `general` ? `基礎知識` : `作品より`;
    const ttsSupported = window.TTS && window.TTS.supported;

    card.innerHTML = `
      <div class="flip-card-inner">
        <div class="flip-card-front">
          <button type="button" class="known-toggle ${isKnown ? `is-known` : ``}" aria-label="記憶済みにする" data-role="known-toggle">${isKnown ? `★` : `☆`}</button>
          <span class="badge badge-${term.level}">${term.level}</span>
          <span class="source-tag source-tag-${term.source}">${sourceLabel}</span>
          <div class="term-name">${term.name}</div>
          <div class="flip-hint">タップで意味を見る</div>
        </div>
        <div class="flip-card-back">
          <button type="button" class="known-toggle ${isKnown ? `is-known` : ``}" aria-label="記憶済みにする" data-role="known-toggle">${isKnown ? `★` : `☆`}</button>
          ${ttsSupported ? `<button type="button" class="tts-btn" aria-label="読み上げ" data-role="tts-btn">🔊</button>` : ``}
          <div class="term-simple">${term.simpleExplanation}</div>
          <div class="term-deep"><strong>もう一歩踏み込むと:</strong> ${term.deepDive}</div>
          ${buildLawRefHtml(term)}
          ${buildSourceCitationHtml(term)}
          ${opts.episodeChips ? `<div class="episode-chip-row">${opts.episodeChips}</div>` : ``}
          ${opts.showGrading ? `
            <div class="grade-row" data-role="grade-row">
              <button type="button" class="btn grade-btn grade-again" data-grade="1">もう一度</button>
              <button type="button" class="btn grade-btn grade-hard" data-grade="2">難しい</button>
              <button type="button" class="btn grade-btn grade-good" data-grade="3">普通</button>
              <button type="button" class="btn grade-btn grade-easy" data-grade="4">簡単</button>
            </div>
          ` : ``}
        </div>
      </div>
    `;

    card.addEventListener(`click`, (e) => {
      if (e.target.closest(`[data-role="known-toggle"]`) || e.target.closest(`[data-role="tts-btn"]`) || e.target.closest(`[data-grade]`) || e.target.closest(`[data-nav]`) || e.target.closest(`a`)) return;
      card.classList.toggle(`flipped`);
    });

    card.querySelectorAll(`[data-role="known-toggle"]`).forEach((btn) => {
      btn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        known[term.id] = !known[term.id];
        Storage.set(`flashcards`, known);
        if (opts.onToggleKnown) {
          opts.onToggleKnown(term);
        } else {
          card.querySelectorAll(`[data-role="known-toggle"]`).forEach((b) => {
            b.classList.toggle(`is-known`, !!known[term.id]);
            b.textContent = known[term.id] ? `★` : `☆`;
          });
        }
      });
    });

    const ttsBtn = card.querySelector(`[data-role="tts-btn"]`);
    if (ttsBtn) {
      ttsBtn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        window.TTS.speak(`${term.name}。${term.simpleExplanation}`);
      });
    }

    if (opts.showGrading) {
      card.querySelectorAll(`[data-grade]`).forEach((btn) => {
        btn.addEventListener(`click`, (e) => {
          e.stopPropagation();
          if (opts.onGrade) opts.onGrade(term, Number(btn.dataset.grade));
        });
      });
    }

    card.querySelectorAll(`[data-nav]`).forEach((btn) => {
      btn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        Router.navigate(btn.dataset.nav);
      });
    });

    return card;
  }

  return { buildSourceCitationHtml, buildLawRefHtml, buildFlipCard };
})();
