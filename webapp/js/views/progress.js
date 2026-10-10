// 学習の進捗(Tier5 フェーズ2で実装)
window.Views = window.Views || {};
window.Views.progress = (function () {
  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view progress-view`;
    wrap.innerHTML = `<h2>学習の進捗</h2>`;
    wrap.appendChild(UI.emptyState({ icon: `chart`, title: `準備中です`, body: `この機能はまもなく公開予定です。` }));
    root.appendChild(wrap);
  }
  return { render };
})();
