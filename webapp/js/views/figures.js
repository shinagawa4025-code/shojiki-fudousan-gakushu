// 図解: 一覧(#figures)と詳細(#figures/<図解ID>)
window.Views = window.Views || {};
window.Views.figures = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 18 });

  // 学習内容ではなくアプリの使い方を説明する図(一覧の最後に別の見出しで並べる)。Diagrams.groups の id `app` と、その中の図
  const APP_GROUP = `app`;
  const APP_HELP_IDS = [`srs-cycle`];
  // 一覧の見出しのステッカーの色(Diagrams.groups の id → 分野の色。css/style.css の .cat-*)。ないものは緑
  const GROUP_CAT = { takken: `cat-gyoho`, gyoho: `cat-gyoho`, kenri: `cat-kenri`, horei: `cat-horei`, zei: `cat-zei`, menjo: `cat-menjo`, shohi: `cat-shohi`, shohiho: `cat-shohi`, life: `cat-life` };

  // 一覧の見出しごとの図: [{ id, label, ids }](学習内容の分野 → その他 → アプリの使い方。詳細画面の前後移動も同じ順)
  // Diagrams.groups がなければ、学習内容の図をまとめて1つ・アプリの使い方の図を1つ
  function sections() {
    const D = window.Diagrams;
    if (!D || !D.defs) return [];
    const ok = (id) => !!D.defs[id] && typeof D.defs[id].render === `function`;
    const all = Object.keys(D.defs).filter(ok);
    const groups = Array.isArray(D.groups) ? D.groups.filter((g) => g && Array.isArray(g.ids)) : [];
    const used = new Set();
    const pick = (ids) => ids.filter((id) => ok(id) && !used.has(id) && used.add(id));
    const content = [];
    let help = null;
    groups.forEach((g) => {
      const ids = pick(g.ids);
      if (!ids.length) return;
      if (g.id === APP_GROUP) help = { id: g.id, label: String(g.label || `アプリの使い方`), ids };
      else content.push({ id: g.id, label: String(g.label || ``), ids });
    });
    const helpRest = pick(all.filter((id) => APP_HELP_IDS.includes(id)));
    if (helpRest.length) help = help ? Object.assign(help, { ids: help.ids.concat(helpRest) }) : { id: APP_GROUP, label: `アプリの使い方`, ids: helpRest };
    const rest = pick(all);
    if (rest.length) content.push({ id: `other`, label: groups.length ? `その他` : ``, ids: rest });
    return help ? content.concat([help]) : content;
  }

  // byTerm の逆引き: 図解ID → [用語]
  function termsByDiagram() {
    const D = window.Diagrams;
    const map = {};
    if (!D || !D.byTerm) return map;
    Object.keys(D.byTerm).forEach((termId) => {
      const term = AppIndex.termsById[termId];
      if (!term || !Array.isArray(D.byTerm[termId])) return;
      D.byTerm[termId].forEach((dId) => {
        (map[dId] = map[dId] || []).push(term);
      });
    });
    return map;
  }

  function safeSvg(id) {
    try { return window.Diagrams.defs[id].render(); } catch (e) { return ``; }
  }

  // 用語が基礎知識として載っているトピック(基礎知識の一覧 basicIds か、小見出し sections[].ids に入っているもの)
  // 複数のトピックに載っているときは、検索(search.js)の案内先と同じ考え方で選ぶ:
  // ①主目標の試験でその項目が属する分野のトピック ②宅建士・税理士の分野で個別指定(termIds)されたトピック ③試験向けトピック ④データの先頭
  const TOPIC_RANK = [`topicO`, `topicR`, `topicS`, `topicT`, `topicN`, `topicL`, `topicK`, `topicJ`, `topicH`];
  function topicHas(topic, termId) {
    if (Array.isArray(topic.basicIds) && topic.basicIds.includes(termId)) return true;
    return Array.isArray(topic.sections) && topic.sections.some((s) => s && Array.isArray(s.ids) && s.ids.includes(termId));
  }
  function primaryTypeId() {
    try {
      const p = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
      const type = p && Stats.examType ? Stats.examType(p.examTypeId) : null;
      return type && Array.isArray(type.categories) ? type.id : null;
    } catch (e) { return null; }
  }
  function topicOfTerm(term, primaryId) {
    const cands = window.APP_DATA.topics.filter((t) => topicHas(t, term.id));
    if (cands.length <= 1) return cands[0] || null;
    const pickFrom = (topicIds) => (topicIds || []).map((id) => cands.find((c) => c.id === id)).find(Boolean) || null;
    try {
      if (primaryId && window.Stats && Stats.categoryOf) {
        const cat = Stats.categoryOf(term, primaryId);
        const hit = cat ? pickFrom(cat.topicIds) : null;
        if (hit) return hit;
      }
      const types = window.APP_DATA.exams && Array.isArray(window.APP_DATA.exams.types) ? window.APP_DATA.exams.types : [];
      const order = [primaryId, `takken`, `zeirishi`].filter((id, i, a) => id && a.indexOf(id) === i);
      for (const typeId of order) {
        const type = types.find((t) => t.id === typeId);
        const cat = type && Array.isArray(type.categories) ? type.categories.find((c) => (c.termIds || []).includes(term.id)) : null;
        const hit = cat ? pickFrom(cat.topicIds) : null;
        if (hit) return hit;
      }
    } catch (e) { /* 試験の分野が読めなくても、下の順で選ぶ */ }
    return pickFrom(TOPIC_RANK) || cands[0];
  }

  function render(root, param) {
    const secs = sections();
    const ids = secs.flatMap((s) => s.ids);
    if (param) {
      const id = param.split(`/`)[0];
      if (ids.includes(id)) renderDetail(root, id, ids);
      else renderMissing(root);
      return;
    }
    renderGallery(root, secs);
  }

  // 一覧の図(SVG)は画面に近づいてから描く(枠の高さは CSS で決まっているので、後から描いても位置はずれない)
  function fillPreviews(wrap) {
    const boxes = Array.from(wrap.querySelectorAll(`.fig-preview[data-fig]`));
    const fill = (box) => {
      if (!box.hasAttribute(`data-fig`)) return;
      const id = box.getAttribute(`data-fig`);
      box.removeAttribute(`data-fig`);
      box.innerHTML = safeSvg(id);
    };
    // 最初に見える数枚はすぐ描く(開いた直後に空の枠が見えないように)
    boxes.slice(0, 6).forEach(fill);
    if (!(`IntersectionObserver` in window)) { boxes.forEach(fill); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        fill(en.target);
      });
    }, { rootMargin: `600px 0px` });
    boxes.forEach((b) => io.observe(b));
    // 画面を離れたら監視をやめる
    const stop = () => { if (!wrap.isConnected) { io.disconnect(); window.removeEventListener(`hashchange`, stop); } };
    window.addEventListener(`hashchange`, stop);
  }

  function renderGallery(root, secs) {
    const ids = secs.flatMap((s) => s.ids);
    const wrap = document.createElement(`div`);
    wrap.className = `view figures-view`;
    wrap.innerHTML = `
      <div class="learn-head">
        <h2>図解</h2>
        <button type="button" class="btn btn-icon learn-info-btn" data-role="info" aria-label="図解について">${ic(`info`, 20)}</button>
      </div>`;
    root.appendChild(wrap);
    wrap.querySelector(`[data-role="info"]`).addEventListener(`click`, () => {
      UI.sheet({ title: `図解について`, content: `<p class="learn-info-text">文章だけではつかみにくい論点を図で整理しました。図をタップすると大きく表示され、この図の説明と関連する用語を確認できます。</p>` });
    });

    if (!ids.length) {
      wrap.appendChild(UI.emptyState({
        icon: `diagram`,
        title: `図解は準備中です`,
        body: `重要な論点の図解を順次追加しています。それまでは用語集で内容を確認できます。`,
        cta: { label: `用語集を見る`, nav: `#glossary` },
      }));
      return;
    }

    const rel = termsByDiagram();
    const D = window.Diagrams;
    // タイル: 図・題名・関連する用語(札にせず「・」でつないだ1〜2行の文字)
    const cardHtml = (id) => {
      const def = D.defs[id];
      const terms = rel[id] || [];
      const shown = terms.slice(0, 3);
      const more = terms.length > shown.length ? ` ほか${terms.length - shown.length}語` : ``;
      return `
        <a class="card card-interactive fig-card" href="#figures/${id}">
          <div class="fig-preview" aria-hidden="true" data-fig="${id}"></div>
          <div class="fig-card-body">
            <p class="fig-card-title">${def.title}</p>
            ${terms.length ? `<p class="fig-card-terms-text"><span class="sr-only">関連する用語: </span>${shown.map((t) => t.name).join(`・`)}${more}</p>` : ``}
          </div>
        </a>`;
    };
    // 見出し: 分野の色の小さなステッカー+名前+件数
    const headHtml = (s, count) => `<div class="section-head fig-group-head"><h3><span class="sticker sticker-sm${GROUP_CAT[s.id] ? ` ${GROUP_CAT[s.id]}` : ``}" aria-hidden="true">${ic(s.id === APP_GROUP ? `lightbulb` : `diagram`, 18)}</span>${UI.escapeHtml(s.label)}</h3>${count ? `<span class="fig-group-count num">${s.ids.length}点</span>` : ``}</div>`;
    // 学習内容の図は分野ごとの見出しで並べる(見出しのない1グループだけなら、見出しなしの一覧)
    const contentSecs = secs.filter((s) => s.id !== APP_GROUP);
    const help = secs.find((s) => s.id === APP_GROUP);
    const contentCount = contentSecs.reduce((n, s) => n + s.ids.length, 0);
    contentSecs.forEach((s) => {
      const sec = document.createElement(`section`);
      sec.className = `fig-group`;
      sec.innerHTML = `${s.label ? headHtml(s, true) : ``}<div class="fig-grid">${s.ids.map(cardHtml).join(``)}</div>`;
      wrap.appendChild(sec);
    });
    if (contentCount) wrap.insertAdjacentHTML(`beforeend`, `<p class="fig-count">全${contentCount}点</p>`);
    if (help) {
      const sec = document.createElement(`section`);
      sec.className = `fig-help`;
      sec.innerHTML = `${headHtml(help, false)}<div class="fig-grid">${help.ids.map(cardHtml).join(``)}</div>`;
      wrap.appendChild(sec);
    }
    fillPreviews(wrap);
  }

  // 「誤りを報告」(報告フォームが未設定なら出さない)
  function reportHtml(id, def) {
    if (!window.Report || typeof Report.linkHtml !== `function`) return ``;
    try {
      const link = Report.linkHtml({ kind: `fig`, id, title: def.title, location: `#figures/${id}` });
      return link ? `<p class="item-meta fig-report">${link}</p>` : ``;
    } catch (e) { return ``; }
  }

  function renderDetail(root, id, ids) {
    const D = window.Diagrams;
    const def = D.defs[id];
    const terms = termsByDiagram()[id] || [];
    const idx = ids.indexOf(id);
    const prev = idx > 0 ? ids[idx - 1] : null;
    const next = idx < ids.length - 1 ? ids[idx + 1] : null;
    const primaryId = terms.length ? primaryTypeId() : null;

    const wrap = document.createElement(`div`);
    wrap.className = `view figures-view fig-detail`;
    wrap.innerHTML = `
      <a class="btn back-btn" href="#figures">${ic(`chevron-left`)}図解の一覧</a>
      <h2>${def.title}</h2>
      <div class="fig-detail-figure">${CardUi.figureHtml(id)}</div>
      ${def.alt ? `
        <section class="card fig-desc-card">
          <h3 class="card-title">${ic(`info`)}この図の説明</h3>
          <p class="fig-desc">${def.alt}</p>
        </section>` : ``}
      ${reportHtml(id, def)}
      ${terms.length ? `
        <section class="fig-related">
          <div class="section-head"><h3>関連する用語</h3></div>
          <div class="fig-term-list">
            ${terms.map((t) => {
              const topic = topicOfTerm(t, primaryId);
              return `
                <div class="card fig-term">
                  <div class="fig-term-head"><span class="badge badge-${t.level}">${t.level}</span><span class="fig-term-name">${t.name}</span></div>
                  <p class="fig-term-simple">${t.simpleExplanation}</p>
                  <div class="chip-row">
                    <a class="chip chip-small" href="#glossary/${t.id}">${ic(`layers`, 14)}用語集で見る</a>
                    ${topic ? `<a class="chip chip-small" href="#topics/${topic.id}/${t.id}">${ic(`book-open`, 14)}トピックで学ぶ</a>` : ``}
                  </div>
                </div>`;
            }).join(``)}
          </div>
        </section>` : ``}
      <nav class="fig-pager" aria-label="ほかの図解">
        ${prev ? `<a class="fig-pager-link" href="#figures/${prev}">${ic(`chevron-left`)}<span><small>前の図解</small>${D.defs[prev].title}</span></a>` : `<span></span>`}
        ${next ? `<a class="fig-pager-link fig-pager-next" href="#figures/${next}"><span><small>次の図解</small>${D.defs[next].title}</span>${ic(`chevron-right`)}</a>` : `<span></span>`}
      </nav>`;
    root.appendChild(wrap);
  }

  function renderMissing(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view figures-view`;
    wrap.innerHTML = `<h2>図解</h2>`;
    wrap.appendChild(UI.emptyState({
      icon: `diagram`,
      title: `図解が見つかりません`,
      body: `指定された図解はありません。名前が変わったか、削除された可能性があります。`,
      cta: { label: `図解の一覧へ`, nav: `#figures` },
    }));
    root.appendChild(wrap);
  }

  return { render };
})();
