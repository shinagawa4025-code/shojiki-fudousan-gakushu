// 図解: 一覧(#figures)と詳細(#figures/<図解ID>)
window.Views = window.Views || {};
window.Views.figures = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 18 });

  // 学習内容ではなくアプリの使い方を説明する図(一覧の最後に別の見出しで並べる)
  const APP_HELP_IDS = [`srs-cycle`];

  // 学習内容の図 → アプリの使い方の図 の順(詳細画面の前後移動も同じ順)
  function diagramIds() {
    const D = window.Diagrams;
    if (!D || !D.defs) return [];
    const ids = Object.keys(D.defs).filter((id) => D.defs[id] && typeof D.defs[id].render === `function`);
    return ids.filter((id) => !APP_HELP_IDS.includes(id)).concat(ids.filter((id) => APP_HELP_IDS.includes(id)));
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

  // 用語が基礎知識として載っているトピック
  function topicOfTerm(termId) {
    return window.APP_DATA.topics.find((t) => (t.basicIds || []).includes(termId)) || null;
  }

  function render(root, param) {
    const ids = diagramIds();
    if (param) {
      const id = param.split(`/`)[0];
      if (ids.includes(id)) renderDetail(root, id, ids);
      else renderMissing(root);
      return;
    }
    renderGallery(root, ids);
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

  function renderGallery(root, ids) {
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
    const cardHtml = (id) => {
      const def = D.defs[id];
      const terms = rel[id] || [];
      const shown = terms.slice(0, 3);
      return `
        <a class="card card-interactive fig-card" href="#figures/${id}">
          <div class="fig-preview" aria-hidden="true" data-fig="${id}"></div>
          <div class="fig-card-body">
            <p class="fig-card-title">${def.title}</p>
            ${terms.length ? `<div class="fig-card-terms">${shown.map((t) => `<span class="chip chip-small chip-muted">${t.name}</span>`).join(``)}${terms.length > shown.length ? `<span class="fig-more">ほか${terms.length - shown.length}語</span>` : ``}</div>` : ``}
          </div>
        </a>`;
    };
    const contentIds = ids.filter((id) => !APP_HELP_IDS.includes(id));
    const helpIds = ids.filter((id) => APP_HELP_IDS.includes(id));
    if (contentIds.length) {
      const grid = document.createElement(`div`);
      grid.className = `fig-grid`;
      grid.innerHTML = contentIds.map(cardHtml).join(``);
      wrap.appendChild(grid);
      wrap.insertAdjacentHTML(`beforeend`, `<p class="fig-count">全${contentIds.length}点</p>`);
    }
    if (helpIds.length) {
      const sec = document.createElement(`section`);
      sec.className = `fig-help`;
      sec.innerHTML = `<div class="section-head"><h3>アプリの使い方</h3></div><div class="fig-grid">${helpIds.map(cardHtml).join(``)}</div>`;
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
              const topic = topicOfTerm(t.id);
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
