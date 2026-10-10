// 模擬試験(Tier5 フェーズ2で実装)
window.Views = window.Views || {};
window.Views.exam = (function () {
  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view exam-view`;
    wrap.innerHTML = `<h2>模擬試験</h2>`;
    wrap.appendChild(UI.emptyState({ icon: `timer`, title: `準備中です`, body: `この機能はまもなく公開予定です。` }));
    root.appendChild(wrap);
  }
  return { render };
})();
