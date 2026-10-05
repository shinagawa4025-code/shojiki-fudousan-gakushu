// 情報源ビュー: 不動産学習における一次情報源をカテゴリ別に一覧表示
window.Views = window.Views || {};
window.Views.sources = (function () {
  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view sources-view`;
    wrap.innerHTML = `
      <h2>情報源</h2>
      <p class="view-desc">不動産学習で「正しい知識」を確認したいときに参照すべき公式・公的な一次情報源です。各用語・基礎知識カードの出典リンクもここに紐づいています。</p>
      <div data-role="source-groups"></div>
    `;
    root.appendChild(wrap);

    const groupsEl = wrap.querySelector(`[data-role="source-groups"]`);
    const categories = [];
    window.APP_DATA.sources.forEach((src) => {
      if (!categories.includes(src.category)) categories.push(src.category);
    });

    categories.forEach((category) => {
      const section = document.createElement(`div`);
      section.className = `source-category`;
      section.innerHTML = `<h3>${category}</h3><div class="source-row-grid" data-role="rows"></div>`;
      const rowsEl = section.querySelector(`[data-role="rows"]`);
      window.APP_DATA.sources.filter((src) => src.category === category).forEach((src) => {
        const row = document.createElement(`div`);
        row.className = `law-row source-row`;
        row.innerHTML = `
          <div class="law-name"><a href="${src.url}" target="_blank" rel="noopener">${src.orgName} ↗</a></div>
          <div class="law-desc">${src.description}</div>
        `;
        rowsEl.appendChild(row);
      });
      groupsEl.appendChild(section);
    });
  }

  return { render };
})();
