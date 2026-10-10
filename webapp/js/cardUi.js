// 用語フリップカードと図解表示の共通部品(glossary / topics / review / bookmarks で共用)
window.CardUi = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });

  function buildSourceCitationHtml(term) {
    const sourceIds = term.sources || [];
    if (!sourceIds.length) return ``;
    const links = sourceIds.map((srcId) => {
      const src = AppIndex.sourcesById[srcId];
      if (!src) return ``;
      return `<a href="${src.url}" target="_blank" rel="noopener">${src.orgName}${ic(`external`, 12)}</a>`;
    }).filter(Boolean).join(`、`);
    return links ? `<p class="term-citation">出典: ${links}</p>` : ``;
  }

  function buildLawRefHtml(term) {
    return term.lawRef ? `<p class="law-ref">${ic(`library`, 14)}<span>根拠: ${term.lawRef}</span></p>` : ``;
  }

  // ---- 図解 ----
  function diagramsFor(termId) {
    const D = window.Diagrams;
    if (!D || !D.byTerm || !D.defs) return [];
    return (D.byTerm[termId] || []).filter((id) => D.defs[id] && typeof D.defs[id].render === `function`);
  }

  function figureHtml(diagramId) {
    const def = window.Diagrams && window.Diagrams.defs[diagramId];
    if (!def) return ``;
    let svg = ``;
    try { svg = def.render(); } catch (e) { return ``; }
    return `
      <figure class="figure" data-diagram-id="${diagramId}">
        <p class="figure-title">${ic(`diagram`, 16)}${def.title}</p>
        ${svg}
        ${def.caption ? `<figcaption>${def.caption}</figcaption>` : ``}
      </figure>`;
  }

  function openFigure(diagramId) {
    const def = window.Diagrams && window.Diagrams.defs[diagramId];
    if (!def) return;
    UI.sheet({ title: def.title, content: figureHtml(diagramId) + `<a class="link-btn" href="#figures">${ic(`diagram`, 16)}図解の一覧へ</a>` });
  }

  // ---- ブックマーク ----
  function bookmarkBtnHtml(termId) {
    if (!window.Bookmarks) return ``;
    const on = Bookmarks.has(`term:${termId}`);
    return `<button type="button" class="btn btn-icon bookmark-toggle${on ? ` is-bookmarked` : ``}" data-role="bookmark" aria-pressed="${on}" aria-label="${on ? `ブックマークを外す` : `ブックマークする`}">${ic(on ? `bookmark-fill` : `bookmark`)}</button>`;
  }

  function knownBtnHtml(isKnown) {
    return `<button type="button" class="btn btn-icon known-toggle${isKnown ? ` is-known` : ``}" data-role="known-toggle" aria-pressed="${isKnown}" aria-label="${isKnown ? `記憶済みを取り消す` : `記憶済みにする`}">${ic(isKnown ? `star-fill` : `star`)}</button>`;
  }

  // opts: { known, onToggleKnown(term), episodeChips(html), showGrading, onGrade(term, grade), gradeHints }
  function buildFlipCard(term, opts) {
    opts = opts || {};
    const known = opts.known || {};
    const card = document.createElement(`div`);
    card.className = `flip-card` + (opts.showGrading ? ` flip-card-tall` : ``);
    card.dataset.termId = term.id;
    const isKnown = !!known[term.id];
    const sourceLabel = term.source === `general` ? `基礎知識` : `作品より`;
    const ttsSupported = window.TTS && window.TTS.supported;
    const diagrams = diagramsFor(term.id);
    const hints = opts.gradeHints || {};

    card.innerHTML = `
      <div class="flip-card-inner">
        <div class="flip-card-front card">
          <div class="flip-face-head">
            <div class="flip-face-tags">
              <span class="badge badge-${term.level}">${term.level}</span>
              <span class="source-tag source-tag-${term.source}">${sourceLabel}</span>
              ${diagrams.length ? `<span class="source-tag">${ic(`diagram`, 12)} 図解</span>` : ``}
            </div>
            <div class="flip-face-actions">${bookmarkBtnHtml(term.id)}${knownBtnHtml(isKnown)}</div>
          </div>
          <div class="term-name">${term.name}</div>
          <button type="button" class="flip-hint flip-toggle" data-role="flip" aria-expanded="false" aria-label="「${term.name}」の意味を見る">${ic(`refresh`, 14)}タップで意味を見る</button>
        </div>
        <div class="flip-card-back card">
          <div class="flip-face-head">
            <div class="flip-face-tags"><span class="badge badge-soft">${term.name}</span></div>
            <div class="flip-face-actions">
              <button type="button" class="btn btn-icon flip-toggle" data-role="flip" aria-expanded="true" aria-label="表に戻す">${ic(`refresh`)}</button>
              ${ttsSupported ? `<button type="button" class="btn btn-icon tts-btn" aria-label="読み上げ" data-role="tts-btn">${ic(`volume`)}</button>` : ``}
              ${knownBtnHtml(isKnown)}
            </div>
          </div>
          <p class="term-simple">${term.simpleExplanation}</p>
          <p class="term-deep"><strong>もう一歩踏み込むと:</strong> ${term.deepDive}</p>
          ${buildLawRefHtml(term)}
          ${buildSourceCitationHtml(term)}
          ${diagrams.length ? `<div><button type="button" class="btn btn-secondary btn-sm figure-btn" data-role="figure" data-diagram="${diagrams[0]}">${ic(`diagram`, 16)}図解を見る</button></div>` : ``}
          ${opts.episodeChips ? `<div class="episode-chip-row">${opts.episodeChips}</div>` : ``}
          ${opts.showGrading ? `
            <div class="grade-row" data-role="grade-row">
              <button type="button" class="btn grade-btn grade-again" data-grade="1">もう一度${hints[1] ? `<small>${hints[1]}</small>` : ``}</button>
              <button type="button" class="btn grade-btn grade-hard" data-grade="2">難しい${hints[2] ? `<small>${hints[2]}</small>` : ``}</button>
              <button type="button" class="btn grade-btn grade-good" data-grade="3">普通${hints[3] ? `<small>${hints[3]}</small>` : ``}</button>
              <button type="button" class="btn grade-btn grade-easy" data-grade="4">簡単${hints[4] ? `<small>${hints[4]}</small>` : ``}</button>
            </div>
          ` : ``}
        </div>
      </div>
    `;

    const interactive = `[data-role="known-toggle"], [data-role="tts-btn"], [data-role="bookmark"], [data-role="figure"], [data-grade], [data-nav], a, button`;
    // 見えていない面は inert にして、Tabで裏側のボタンに移動しないようにする
    // (外部から .flipped を付け外ししても同期されるよう、class属性の変化を監視)
    const front = card.querySelector(`.flip-card-front`);
    const back = card.querySelector(`.flip-card-back`);
    function syncFaces() {
      const flipped = card.classList.contains(`flipped`);
      front.inert = flipped;
      back.inert = !flipped;
      card.querySelectorAll(`[data-role="flip"]`).forEach((b) => b.setAttribute(`aria-expanded`, String(flipped)));
    }
    function toggleFlip(viaKeyboard) {
      card.classList.toggle(`flipped`);
      syncFaces();
      if (viaKeyboard) {
        const face = card.classList.contains(`flipped`) ? back : front;
        const btn = face.querySelector(`[data-role="flip"]`);
        if (btn) btn.focus({ preventScroll: true });
      }
    }
    syncFaces();
    if (window.MutationObserver) new MutationObserver(syncFaces).observe(card, { attributes: true, attributeFilter: [`class`] });
    card.addEventListener(`click`, (e) => {
      const flipBtn = e.target.closest(`[data-role="flip"]`);
      if (flipBtn) { e.stopPropagation(); toggleFlip(e.detail === 0); return; }
      if (e.target.closest(interactive)) return;
      toggleFlip(false);
    });
    card.flip = toggleFlip;

    card.querySelectorAll(`[data-role="known-toggle"]`).forEach((btn) => {
      btn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        known[term.id] = !known[term.id];
        Storage.set(`flashcards`, known);
        if (window.Streak) Streak.recordToday();
        // 星はその場で塗り替える(一覧を作り直すとスクロール位置が飛ぶため、呼び出し側には通知だけする)
        const on = !!known[term.id];
        card.querySelectorAll(`[data-role="known-toggle"]`).forEach((b) => {
          b.classList.toggle(`is-known`, on);
          b.setAttribute(`aria-pressed`, String(on));
          b.setAttribute(`aria-label`, on ? `記憶済みを取り消す` : `記憶済みにする`);
          b.innerHTML = ic(on ? `star-fill` : `star`);
        });
        if (opts.onToggleKnown) opts.onToggleKnown(term, on);
      });
    });

    const bmBtn = card.querySelector(`[data-role="bookmark"]`);
    if (bmBtn) {
      bmBtn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        const on = Bookmarks.toggle(`term:${term.id}`);
        bmBtn.classList.toggle(`is-bookmarked`, on);
        bmBtn.setAttribute(`aria-pressed`, String(on));
        bmBtn.setAttribute(`aria-label`, on ? `ブックマークを外す` : `ブックマークする`);
        bmBtn.innerHTML = ic(on ? `bookmark-fill` : `bookmark`);
        if (opts.onToggleBookmark) opts.onToggleBookmark(term, on);
      });
    }

    const ttsBtn = card.querySelector(`[data-role="tts-btn"]`);
    if (ttsBtn) {
      ttsBtn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        window.TTS.speak(`${term.name}。${term.simpleExplanation}`);
      });
    }

    const figBtn = card.querySelector(`[data-role="figure"]`);
    if (figBtn) {
      figBtn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        openFigure(figBtn.dataset.diagram);
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

  return { buildSourceCitationHtml, buildLawRefHtml, buildFlipCard, diagramsFor, figureHtml, openFigure };
})();
