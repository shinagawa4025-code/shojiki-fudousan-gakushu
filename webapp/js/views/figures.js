// 図解(Tier5 フェーズ2で実装)
window.Views = window.Views || {};
window.Views.figures = (function () {
  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view figures-view`;
    wrap.innerHTML = `<h2>図解</h2>`;
    wrap.appendChild(UI.emptyState({ icon: `diagram`, title: `準備中です`, body: `この機能はまもなく公開予定です。` }));
    root.appendChild(wrap);
  }
  return { render };
})();
