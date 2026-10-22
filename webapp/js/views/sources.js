// 情報源ビュー: 解説の根拠にしている一次情報源(公的機関・公的団体の資料)をカテゴリ別に一覧表示
window.Views = window.Views || {};
window.Views.sources = (function () {
  // 表示するカテゴリの順番(データにない名前のカテゴリは最後に、出てきた順で並べる)
  // v14: 宅建士試験(過去の試験問題。出題頻度ランクの集計に使った data/frequency.js の src230)は、宅建業法・取引ルールのすぐ後
  const CATEGORY_ORDER = [
    `法令検索`, `宅建業法・取引ルール`, `宅建士試験`, `登記・権利関係`, `都市計画・建築`,
    `税務(国税)`, `税務(消費税)`, `税務(地方税)`,
    `地価・評価`, `住宅金融・統計・土地建物`, `相場・取引価格`, `紛争・消費者保護・判例`, `業界実務`,
  ];
  // データのカテゴリを表示用に分け直す(データ側の category は他の画面の検索にも使うので変えない)
  const CATEGORY_OF = {
    src05: `税務(国税)`, src06: `税務(国税)`, src18: `税務(国税)`, src19: `税務(国税)`, src40: `税務(国税)`, src41: `税務(国税)`, src44: `税務(国税)`,
    src50: `税務(消費税)`, src51: `税務(消費税)`, src52: `税務(消費税)`, src53: `税務(消費税)`, src54: `税務(消費税)`,
    src21: `税務(地方税)`, src22: `税務(地方税)`,
    src45: `住宅金融・統計・土地建物`, src47: `住宅金融・統計・土地建物`, src49: `住宅金融・統計・土地建物`,
    src02: `相場・取引価格`,
  };
  const categoryOf = (src) => (Object.prototype.hasOwnProperty.call(CATEGORY_OF, src.id) ? CATEGORY_OF[src.id] : src.category);

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view sources-view`;
    wrap.innerHTML = `
      <h2>情報源</h2>
      <p class="view-desc">このアプリが解説の根拠にしている、公的機関・公的団体の一次情報源です。各用語・基礎知識の「出典」のリンク先もここに挙げた資料です。内容を確認した時点や考え方は<a href="#about/sources">このアプリについて</a>にまとめています。</p>
      <div data-role="source-groups"></div>
    `;
    root.appendChild(wrap);

    // 情報源ごとに、出典として参照している用語・基礎知識の数
    const useCount = {};
    AppIndex.allTerms.forEach((t) => (t.sources || []).forEach((id) => { useCount[id] = (useCount[id] || 0) + 1; }));

    // 同じURL・同じ名前の情報源は1つにまとめる(パックごとに同じ情報源を登録していた場合)
    const seen = new Set();
    const sources = window.APP_DATA.sources.filter((src) => {
      const key = `${src.url}|${src.orgName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const categories = CATEGORY_ORDER.slice();
    sources.forEach((src) => {
      const c = categoryOf(src);
      if (!categories.includes(c)) categories.push(c);
    });

    const groupsEl = wrap.querySelector(`[data-role="source-groups"]`);
    categories.forEach((category) => {
      const list = sources.filter((src) => categoryOf(src) === category);
      if (!list.length) return;
      const section = document.createElement(`section`);
      section.className = `source-group`;
      section.innerHTML = `<h3 class="source-category">${UI.escapeHtml(category)}</h3><div class="source-row-grid" data-role="rows"></div>`;
      const rowsEl = section.querySelector(`[data-role="rows"]`);
      list.forEach((src) => {
        const n = useCount[src.id] || 0;
        const row = document.createElement(`div`);
        row.className = `card card-compact law-row source-row`;
        row.innerHTML = `
          <div class="law-name"><a href="${UI.escapeHtml(src.url)}" target="_blank" rel="noopener">${UI.escapeHtml(src.orgName)}${UI.icon(`external`, { size: 14 })}</a></div>
          <div class="law-desc">${UI.escapeHtml(src.description)}</div>
          ${n ? `<div class="source-use">参照している項目 <span class="num">${n}</span>件</div>` : ``}
        `;
        rowsEl.appendChild(row);
      });
      groupsEl.appendChild(section);
    });
  }

  return { render };
})();
