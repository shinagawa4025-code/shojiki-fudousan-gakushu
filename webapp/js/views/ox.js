// ○×一問一答(準備中)
window.Views = window.Views || {};
window.Views.ox = (function () {
  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view ox-view`;
    wrap.innerHTML = `<h2>○×一問一答</h2>`;
    wrap.appendChild(UI.emptyState({ icon: `o-x`, title: `準備中です`, body: `もうすぐ使えるようになります。` }));
    root.appendChild(wrap);
  }
  return { render };
})();
