// 用語フリップカードと図解表示の共通部品(glossary / topics / review / bookmarks で共用)
window.CardUi = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });

  // 試験対策のトピック(深掘りの見出しを「試験のポイント」にする)
  const EXAM_TOPIC_IDS = [`topicH`, `topicJ`, `topicK`, `topicL`, `topicN`, `topicO`, `topicR`, `topicS`, `topicT`];

  // ---- 分野の色(ステッカー・カードの上の帯・進捗バー。css/style.css の .cat-*) ----
  // 宅建士の分野(業法・権利・法令・税・免除)→ 税理士の分野(消費税。消費税法も同じ色、不動産税務は税の色)→ どれでもなければ暮らし(緑)
  const CAT_IDS = [`gyoho`, `kenri`, `horei`, `zei`, `menjo`, `shohi`];
  const CAT_TYPES = [`takken`, `zeirishi`];
  function catIdOf(id) {
    if (id === `shisan`) return `zei`;
    if (id === `shohiho`) return `shohi`;
    return CAT_IDS.includes(id) ? id : null;
  }
  // 用語・基礎知識の分野の id(gyoho など。分からなければ life)
  function catOf(term) {
    const S = window.Stats;
    if (!term || !S || typeof S.categoryOf !== `function`) return `life`;
    try {
      for (const typeId of CAT_TYPES) {
        const c = S.categoryOf(term, typeId);
        const id = c ? catIdOf(c.id) : null;
        if (id) return id;
      }
    } catch (e) { /* 分野が読めなければ既定の色 */ }
    return `life`;
  }
  // トピックの分野: { id, name }(name は試験の分野名。暮らしのトピックは null)
  function topicCategory(topicId) {
    const S = window.Stats;
    if (S && typeof S.examType === `function`) {
      try {
        for (const typeId of CAT_TYPES) {
          const type = S.examType(typeId);
          const cats = type && Array.isArray(type.categories) ? type.categories : [];
          const c = cats.find((x) => (x.topicIds || []).includes(topicId));
          const id = c ? catIdOf(c.id) : null;
          if (id) return { id, name: c.name || null };
        }
      } catch (e) { /* 分野が読めなければ既定の色 */ }
    }
    return { id: `life`, name: null };
  }

  // topicId を渡したときはそのトピックで判定、なければ用語のトピックで判定
  function deepDiveLabel(term, topicId) {
    if (topicId) return EXAM_TOPIC_IDS.includes(topicId) ? `試験のポイント` : `もう一歩踏み込むと`;
    return (term.topicIds || []).some((id) => EXAM_TOPIC_IDS.includes(id)) ? `試験のポイント` : `もう一歩踏み込むと`;
  }

  // 深掘り(試験のポイント / もう一歩踏み込むと)の囲み。見出しはコロンを付けずに1行目に置く(読み上げ用に区切りだけ入れる)
  function deepHtml(term, topicId) {
    if (!term.deepDive) return ``;
    const label = deepDiveLabel(term, topicId);
    return `<p class="term-deep"><strong>${ic(label === `試験のポイント` ? `target` : `lightbulb`, 14)}${label}<span class="sr-only">:</span></strong>${term.deepDive}</p>`;
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
      const esc = (s) => UI.escapeHtml(s);
      return `<li><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(chars.join(``))}<span class="cite-tail">${esc(tail)}${ic(`external`, 12)}</span></a></li>`;
    }).filter(Boolean);
    return items.length ? `<div class="term-citation"><span class="term-citation-label">出典:</span><ul class="term-citation-list">${items.join(``)}</ul></div>` : ``;
  }

  // 根拠条文を法令ごとのチップに分ける(括弧・かぎ括弧の中の「、」では分けない)
  const OPEN = [`(`, `（`, `「`];
  const CLOSE = [`)`, `）`, `」`];
  function splitLawRef(ref) {
    const parts = [];
    let depth = 0;
    let cur = ``;
    Array.from(String(ref || ``)).forEach((ch) => {
      if (OPEN.includes(ch)) depth += 1;
      else if (CLOSE.includes(ch) && depth > 0) depth -= 1;
      if (ch === `、` && depth === 0) {
        if (cur.trim()) parts.push(cur.trim());
        cur = ``;
        return;
      }
      cur += ch;
    });
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  // 根拠: 法令ごとのチップ(コピーしたときに区切りが残るよう、見えない「、」を挟む)
  function buildLawRefHtml(term) {
    if (!term.lawRef) return ``;
    const chips = splitLawRef(term.lawRef).map((p) => `<span class="law-chip">${p}</span>`).join(`<span class="sr-only">、</span>`);
    return `<p class="law-ref">${ic(`library`, 14)}<span class="law-ref-label">根拠<span class="sr-only">:</span></span>${chips}</p>`;
  }

  // 法令上の決まりではない目安(相場・一般的な手順など)の注記
  function practiceNoteHtml(term) {
    return term.kind === `practice` && !term.lawRef ? `<p class="practice-note">${ic(`info`, 14)}<span>実務上の目安です(法令上の決まりではありません)</span></p>` : ``;
  }

  // 「◯年◯月時点の法令に基づく」+「誤りを報告」(報告フォームが未設定なら報告リンクは出さない)
  // loc: 報告フォームに入れる画面の場所(省略時は今のハッシュ)
  function itemMetaHtml(term, loc) {
    if (!window.Report) return ``;
    let asOf = ``;
    let link = ``;
    try {
      if (term.lawRef && typeof Report.asOfText === `function`) asOf = Report.asOfText(term.asOf);
      if (typeof Report.linkHtml === `function`) link = Report.linkHtml({ kind: term.source === `general` ? `basic` : `term`, id: term.id, title: term.name, location: loc || location.hash });
    } catch (e) { return ``; }
    if (!asOf && !link) return ``;
    return `<p class="item-meta">${asOf ? `<span>${asOf}</span>` : ``}${link || ``}</p>`;
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
  // on: 保存済みかどうか(呼び出し側で分かっていれば渡す。省略時は保存内容を読む)
  function bookmarkBtnHtml(termId, on) {
    if (!window.Bookmarks) return ``;
    if (typeof on !== `boolean`) on = Bookmarks.has(`term:${termId}`);
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

  // 裏面の中身(初めてめくるときに作る。一覧に並ぶカードの大半は裏を見ないため)
  function backHtml(term, opts, isKnown, bmOn) {
    const diagrams = diagramsFor(term.id);
    const ttsSupported = window.TTS && window.TTS.supported;
    return `
      <div class="flip-face-head">
        <div class="flip-face-tags"><span class="badge badge-${term.level}">${term.level}</span></div>
        <div class="flip-face-actions">
          <button type="button" class="btn btn-icon flip-toggle" data-role="flip" aria-expanded="true" aria-label="表に戻す">${ic(`refresh`)}</button>
          ${ttsSupported ? `<button type="button" class="btn btn-icon tts-btn" aria-label="読み上げ" data-role="tts-btn">${ic(`volume`)}</button>` : ``}
          ${bookmarkBtnHtml(term.id, bmOn)}${knownBtnHtml(isKnown)}
        </div>
      </div>
      <p class="flip-back-title">${term.name}</p>
      <p class="term-simple">${term.simpleExplanation}</p>
      ${deepHtml(term, opts.topicId)}
      ${buildLawRefHtml(term)}
      ${practiceNoteHtml(term)}
      ${buildSourceCitationHtml(term)}
      ${diagrams.length ? `<div><button type="button" class="btn btn-secondary btn-sm figure-btn" data-role="figure" data-diagram="${diagrams[0]}">${ic(`diagram`, 16)}図解を見る</button></div>` : ``}
      ${calcLinksHtml(term.id)}
      ${itemMetaHtml(term, opts.reportLocation || `#glossary/${encodeURIComponent(term.id)}`)}`;
  }

  // opts: { known, bookmarked(保存済みか。省略時は保存内容を読む), onToggleKnown(term), onToggleBookmark(term, on),
  //         topicId(深掘りの見出しの判定用), flipped(最初から裏面を出す: 戻るで復元するとき), onFlip(term, flipped)(タップ・キーでめくったとき),
  //         reportLocation(誤りの報告に入れる画面。省略時はその用語を開く #glossary/<id>) }
  // (今日の復習の評価ボタンはカードの外のトレイ。review.js が作る)
  // 戻り値の要素には card.flip(viaKeyboard)(めくる)と card.setFlipped(on)(表裏を指定。onFlip は呼ばない)がある
  function buildFlipCard(term, opts) {
    opts = opts || {};
    const known = opts.known || {};
    const card = document.createElement(`div`);
    // 分野の色(カードの上の帯)は .cat-* で
    card.className = `flip-card cat-${catOf(term)}` + (opts.flipped ? ` flipped` : ``);
    card.dataset.termId = term.id;
    const isKnown = !!known[term.id];
    const bmOn = typeof opts.bookmarked === `boolean` ? opts.bookmarked : (window.Bookmarks ? Bookmarks.has(`term:${term.id}`) : false);
    const hasDiagram = diagramsFor(term.id).length > 0;

    card.innerHTML = `
      <div class="flip-card-inner">
        <div class="flip-card-front card">
          <div class="flip-face-head">
            <div class="flip-face-tags">
              <span class="badge badge-${term.level}">${term.level}</span>
              ${hasDiagram ? `<span class="flip-fig" title="図解あり">${ic(`diagram`, 16)}<span class="sr-only">図解あり</span></span>` : ``}
            </div>
            <div class="flip-face-actions">${bookmarkBtnHtml(term.id, bmOn)}${knownBtnHtml(isKnown)}</div>
          </div>
          <div class="term-name">${term.name}</div>
          <button type="button" class="flip-hint flip-toggle" data-role="flip" aria-expanded="false" aria-label="「${term.name}」の意味を見る">${ic(`refresh`, 14)}タップで意味を見る</button>
        </div>
        <div class="flip-card-back card"></div>
      </div>
    `;

    const inner = card.querySelector(`.flip-card-inner`);
    const front = card.querySelector(`.flip-card-front`);
    const back = card.querySelector(`.flip-card-back`);
    let backBuilt = false;
    function ensureBack() {
      if (backBuilt) return;
      backBuilt = true;
      const bmNow = window.Bookmarks ? Bookmarks.has(`term:${term.id}`) : false;
      back.innerHTML = backHtml(term, opts, !!known[term.id], bmNow);
    }
    if (opts.flipped) ensureBack();

    // 見えていない面は inert にして、Tabで裏側のボタンに移動しないようにする
    // (外部から .flipped を付け外ししても同期されるよう、class属性の変化を監視)
    function syncFaces() {
      const flipped = card.classList.contains(`flipped`);
      if (flipped) ensureBack();
      front.inert = flipped;
      back.inert = !flipped;
      card.querySelectorAll(`[data-role="flip"]`).forEach((b) => b.setAttribute(`aria-expanded`, String(flipped)));
    }
    // めくる動き: 動いている間だけ立体表示(is-turning)にする。止まっているカードは平面で描く
    // (一覧の全カードを立体のまま置くと、描画の層が増えて重くなるため。立体にする瞬間は動きを止めて切り替える)
    let turnTimer = null;
    function endTurn() {
      clearTimeout(turnTimer);
      turnTimer = null;
      card.classList.remove(`is-turning`);
    }
    function setFlipped(on) {
      on = !!on;
      if (on === card.classList.contains(`flipped`)) return;
      if (on) ensureBack();
      if (!UI.prefersReducedMotion() && card.isConnected) {
        if (!card.classList.contains(`is-turning`)) {
          inner.style.transition = `none`;
          card.classList.add(`is-turning`);
          // いまの向き(表/裏)を確定させてから動きを戻す
          void getComputedStyle(inner).transform;
          inner.style.transition = ``;
        }
        clearTimeout(turnTimer);
        turnTimer = setTimeout(endTurn, 450);
      }
      card.classList.toggle(`flipped`, on);
      syncFaces();
    }
    inner.addEventListener(`transitionend`, (e) => { if (e.target === inner && e.propertyName === `transform` && turnTimer) endTurn(); });
    function toggleFlip(viaKeyboard) {
      setFlipped(!card.classList.contains(`flipped`));
      if (opts.onFlip) opts.onFlip(term, card.classList.contains(`flipped`));
      if (viaKeyboard) {
        const face = card.classList.contains(`flipped`) ? back : front;
        const btn = face.querySelector(`[data-role="flip"]`);
        if (btn) btn.focus({ preventScroll: true });
      }
    }
    syncFaces();
    if (window.MutationObserver) new MutationObserver(syncFaces).observe(card, { attributes: true, attributeFilter: [`class`] });

    function toggleKnown() {
      // 別のタブでの変更を消さないよう、最新の値に反映してから保存する
      const latest = Storage.get(`flashcards`, {});
      latest[term.id] = !known[term.id];
      if (!latest[term.id]) delete latest[term.id];
      Object.keys(known).forEach((k) => { if (!(k in latest)) delete known[k]; });
      Object.assign(known, latest);
      if (!latest[term.id]) delete known[term.id];
      Storage.set(`flashcards`, latest);
      const on = !!known[term.id];
      // 学習記録は記憶済みにしたときだけ(星を外したのは学習ではないので数えない)
      if (on && window.Streak) Streak.recordToday();
      // 星はその場で塗り替える(一覧を作り直すとスクロール位置が飛ぶため、呼び出し側には通知だけする)
      card.querySelectorAll(`[data-role="known-toggle"]`).forEach((b) => {
        b.classList.toggle(`is-known`, on);
        b.setAttribute(`aria-pressed`, String(on));
        b.setAttribute(`aria-label`, on ? `記憶済みを取り消す` : `記憶済みにする`);
        // 記憶済みにしたときは金色の星が「ぽん」と出る(動きを減らす設定では CSS で止まる)
        b.innerHTML = on ? UI.icon(`star-fill`, { size: 20, className: `anim-pop` }) : ic(`star`);
      });
      if (opts.onToggleKnown) opts.onToggleKnown(term, on);
    }

    // ボタンの操作はカードでまとめて受ける(裏面はあとから作るため。しおり・星は表と裏の両方にある)
    const interactive = `[data-role="known-toggle"], [data-role="tts-btn"], [data-role="bookmark"], [data-role="figure"], [data-nav], a, button`;
    // 作った直後のタップは裏返さない(前のカードの評価ボタンを2回押したとき、次のカードの答えが見えてしまうため)
    const createdAt = Date.now();
    card.addEventListener(`click`, (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const flipBtn = t.closest(`[data-role="flip"]`);
      if (flipBtn) {
        e.stopPropagation();
        if (Date.now() - createdAt >= 400) toggleFlip(e.detail === 0);
        return;
      }
      if (t.closest(`[data-role="known-toggle"]`)) { e.stopPropagation(); toggleKnown(); return; }
      if (t.closest(`[data-role="bookmark"]`)) {
        e.stopPropagation();
        const on = Bookmarks.toggle(`term:${term.id}`);
        paintBookmarkButtons(card, on);
        if (opts.onToggleBookmark) opts.onToggleBookmark(term, on);
        return;
      }
      if (t.closest(`[data-role="tts-btn"]`)) { e.stopPropagation(); window.TTS.speak(`${term.name}。${term.simpleExplanation}`); return; }
      const figBtn = t.closest(`[data-role="figure"]`);
      if (figBtn) { e.stopPropagation(); openFigure(figBtn.dataset.diagram); return; }
      const navBtn = t.closest(`[data-nav]`);
      if (navBtn) { e.stopPropagation(); Router.navigate(navBtn.dataset.nav); return; }
      if (t.closest(interactive)) return;
      if (Date.now() - createdAt < 400) return;
      toggleFlip(false);
    });
    card.flip = toggleFlip;
    card.setFlipped = setFlipped;

    return card;
  }

  return {
    buildSourceCitationHtml, buildLawRefHtml, buildFlipCard, diagramsFor, figureHtml, openFigure, deepDiveLabel, deepHtml, practiceNoteHtml, itemMetaHtml,
    splitLawRef, calcLinksHtml, bookmarkBtnHtml, paintBookmarkButtons, EXAM_TOPIC_IDS, catOf, topicCategory,
  };
})();
