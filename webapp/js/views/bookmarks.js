// ブックマーク(Tier5 フェーズ2で実装)
window.Views = window.Views || {};
window.Views.bookmarks = (function () {
  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view bookmarks-view`;
    wrap.innerHTML = `<h2>ブックマーク</h2>`;
    wrap.appendChild(UI.emptyState({ icon: `bookmark`, title: `準備中です`, body: `この機能はまもなく公開予定です。` }));
    root.appendChild(wrap);
  }
  return { render };
})();
