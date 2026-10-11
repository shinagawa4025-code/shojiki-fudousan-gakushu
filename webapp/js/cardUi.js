// 用語フリップカードと図解表示の共通部品(glossary / topics / review / bookmarks で共用)
window.CardUi = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });

  // 試験対策のトピック(深掘りの見出しを「試験のポイント」にする)
  const EXAM_TOPIC_IDS = [`topicH`, `topicJ`, `topicK`, `topicL`, `topicN`, `topicO`];

  // topicId を渡したときはそのトピックで判定、なければ用語のトピックで判定
  function deepDiveLabel(term, topicId) {
    if (topicId) return EXAM_TOPIC_IDS.includes(topicId) ? `試験のポイント` : `もう一歩踏み込むと`;
    return (term.topicIds || []).some((id) => EXAM_TOPIC_IDS.includes(id)) ? `試験のポイント` : `もう一歩踏み込むと`;
  }

  // 出典は1件ずつ改行して並べる(「、」区切りだと外部リンクのアイコンの後で改行され、行頭に「、」が来るため)
  function buildSourceCitationHtml(term) {
    const sourceIds = term.sources || [];
    if (!sourceIds.length) return ``;
    const items = sourceIds.map((srcId) => {
      const src = AppIndex.sourcesById[srcId];
      if (!src) return ``;
      // 最後の1文字とアイコンを改行させない(アイコンだけが次の行に送られないように)
      const chars = Array.from(String(src.orgName));
      const tail = chars.pop() || ``;
      return `<li><a href="${src.url}" target="_blank" rel="noopener">${chars.join(``)}<span class="cite-tail">${tail}${ic(`external`, 12)}</span></a></li>`;
    }).filter(Boolean);
    return items.length ? `<div class="term-citation"><span class="term-citation-label">出典:</span><ul class="term-citation-list">${items.join(``)}</ul></div>` : ``;
  }

  function buildLawRefHtml(term) {
    return term.lawRef ? `<p class="law-ref">${ic(`library`, 14)}<span>根拠: ${term.lawRef}</span></p>` : ``;
  }

  // 用語に関係する計算機(計算機ビューが対応表を持っていれば)へのリンク
  function calcLinks(termId) {
    const C = window.Views && window.Views.calculators;
    if (!C || typeof C.forTerm !== `function`) return [];
    try {
      const list = C.forTerm(termId);
      return Array.isArray(list) ? list.filter((c) => c && typeof c.id === `string` && c.id) : [];
    } catch (e) { return []; }
  }

  function calcLinksHtml(termId) {
    const links = calcLinks(termId);
    if (!links.length) return ``;
    return `<div class="calc-link-row"><span class="calc-link-label">計算機で試す</span>${links.map((c) => `<a class="chip chip-small" href="#calculators/${encodeURIComponent(c.id)}">${ic(`calculator`, 14)}${UI.escapeHtml(c.label || c.id)}</a>`).join(``)}</div>`;
  }

  // ---- 図解 ----
  function diagramsFor(termId) {
    const D = window.Diagrams;
    if (!D || !D.byTerm || !D.defs) return [];
    return (D.byTerm[termId] || []).filter((id) => D.defs[id] && typeof D.defs[id].render === `function`);
  }

  function figureHtml(diagramId) {
    const D = window.Diagrams;
    const def = D && D.defs && Object.prototype.hasOwnProperty.call(D.defs, diagramId) ? D.defs[diagramId] : null;
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
    const D = window.Diagrams;
    const def = D && D.defs && Object.prototype.hasOwnProperty.call(D.defs, diagramId) ? D.defs[diagramId] : null;
    if (!def) return;
    // シートの見出しに図のタイトルが出るので、図の中のタイトルは CSS で隠す(.fig-sheet)
    UI.sheet({
      title: def.title,
      content: `<div class="fig-sheet">${figureHtml(diagramId)}<a class="link-btn fig-sheet-link" href="#figures/${encodeURIComponent(diagramId)}">${ic(`diagram`, 16)}この図の説明と関連用語</a></div>`,
    });
  }

  // ---- ブックマーク ----
  function bookmarkBtnHtml(termId) {
    if (!window.Bookmarks) return ``;
    const on = Bookmarks.has(`term:${termId}`);
    return `<button type="button" class="btn btn-icon bookmark-toggle${on ? ` is-bookmarked` : ``}" data-role="bookmark" aria-pressed="${on}" aria-label="${on ? `ブックマークを外す` : `ブックマークする`}">${ic(on ? `bookmark-fill` : `bookmark`)}</button>`;
  }

  // しおりボタンの見た目をその場で塗り替える(カードの表裏・基礎知識の下部など同じ用語のボタンをまとめて)
  function paintBookmarkButtons(scope, on) {
    if (!scope) return;
    scope.querySelectorAll(`[data-role="bookmark"]`).forEach((b) => {
      b.classList.toggle(`is-bookmarked`, on);
      b.setAttribute(`aria-pressed`, String(on));
      // 文字つきのボタン(data-label)は名前を変えず、押された状態(aria-pressed)とアイコンで示す
      const label = b.dataset.label;
      if (!label) b.setAttribute(`aria-label`, on ? `ブックマークを外す` : `ブックマークする`);
      b.innerHTML = ic(on ? `bookmark-fill` : `bookmark`, label ? 16 : 20) + (label ? `<span>${label}</span>` : ``);
    });
  }

  function knownBtnHtml(isKnown) {
    return `<button type="button" class="btn btn-icon known-toggle${isKnown ? ` is-known` : ``}" data-role="known-toggle" aria-pressed="${isKnown}" aria-label="${isKnown ? `記憶済みを取り消す` : `記憶済みにする`}">${ic(isKnown ? `star-fill` : `star`)}</button>`;
  }

  // opts: { known, onToggleKnown(term), onToggleBookmark(term, on), episodeChips(html), showGrading, onGrade(term, grade), gradeHints, topicId(深掘りの見出しの判定用),
  //         flipped(最初から裏面を出す: 戻るで復元するとき), onFlip(term, flipped)(タップ・キーでめくったとき) }
  function buildFlipCard(term, opts) {
    opts = opts || {};
    const known = opts.known || {};
    const card = document.createElement(`div`);
    card.className = `flip-card` + (opts.showGrading ? ` flip-card-tall` : ``) + (opts.flipped ? ` flipped` : ``);
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
            <div class="flip-face-tags"><span class="badge badge-${term.level}">${term.level}</span></div>
            <div class="flip-face-actions">
              <button type="button" class="btn btn-icon flip-toggle" data-role="flip" aria-expanded="true" aria-label="表に戻す">${ic(`refresh`)}</button>
              ${ttsSupported ? `<button type="button" class="btn btn-icon tts-btn" aria-label="読み上げ" data-role="tts-btn">${ic(`volume`)}</button>` : ``}
              ${bookmarkBtnHtml(term.id)}${knownBtnHtml(isKnown)}
            </div>
          </div>
          <p class="flip-back-title">${term.name}</p>
          <p class="term-simple">${term.simpleExplanation}</p>
          <p class="term-deep"><strong>${deepDiveLabel(term, opts.topicId)}:</strong> ${term.deepDive}</p>
          ${buildLawRefHtml(term)}
          ${buildSourceCitationHtml(term)}
          ${diagrams.length ? `<div><button type="button" class="btn btn-secondary btn-sm figure-btn" data-role="figure" data-diagram="${diagrams[0]}">${ic(`diagram`, 16)}図解を見る</button></div>` : ``}
          ${calcLinksHtml(term.id)}
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
      if (opts.onFlip) opts.onFlip(term, card.classList.contains(`flipped`));
      if (viaKeyboard) {
        const face = card.classList.contains(`flipped`) ? back : front;
        const btn = face.querySelector(`[data-role="flip"]`);
        if (btn) btn.focus({ preventScroll: true });
      }
    }
    syncFaces();
    if (window.MutationObserver) new MutationObserver(syncFaces).observe(card, { attributes: true, attributeFilter: [`class`] });
    // 作った直後のタップは裏返さない(前のカードの評価ボタンを2回押したとき、次のカードの答えが見えてしまうため)
    const createdAt = Date.now();
    card.addEventListener(`click`, (e) => {
      if (Date.now() - createdAt < 400) return;
      const flipBtn = e.target.closest(`[data-role="flip"]`);
      if (flipBtn) { e.stopPropagation(); toggleFlip(e.detail === 0); return; }
      if (e.target.closest(interactive)) return;
      toggleFlip(false);
    });
    card.flip = toggleFlip;

    card.querySelectorAll(`[data-role="known-toggle"]`).forEach((btn) => {
      btn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        // 別のタブでの変更を消さないよう、最新の値に反映してから保存する
        const latest = Storage.get(`flashcards`, {});
        latest[term.id] = !known[term.id];
        if (!latest[term.id]) delete latest[term.id];
        Object.keys(known).forEach((k) => { if (!(k in latest)) delete known[k]; });
        Object.assign(known, latest);
        if (!latest[term.id]) delete known[term.id];
        Storage.set(`flashcards`, latest);
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

    // しおりは表と裏の両方にある(押したら両方を塗り替える)
    card.querySelectorAll(`[data-role="bookmark"]`).forEach((bmBtn) => {
      bmBtn.addEventListener(`click`, (e) => {
        e.stopPropagation();
        const on = Bookmarks.toggle(`term:${term.id}`);
        paintBookmarkButtons(card, on);
        if (opts.onToggleBookmark) opts.onToggleBookmark(term, on);
      });
    });

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

  return { buildSourceCitationHtml, buildLawRefHtml, buildFlipCard, diagramsFor, figureHtml, openFigure, deepDiveLabel, calcLinksHtml, bookmarkBtnHtml, paintBookmarkButtons, EXAM_TOPIC_IDS };
})();
