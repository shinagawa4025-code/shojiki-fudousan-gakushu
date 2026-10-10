// その他メニュー(スマホの下部タブ「その他」): 進捗・計算機・動画一覧・情報源・設定などへのタイル
window.Views = window.Views || {};
window.Views.more = (function () {
  const TILES = [
    { nav: `#progress`, icon: `chart`, title: `学習の進捗`, desc: `分野別の達成度・苦手・記録` },
    { nav: `#calculators`, icon: `calculator`, title: `計算機`, desc: `ローン・税金の概算` },
    { nav: `#summary`, icon: `play-square`, title: `動画一覧`, desc: `「正直不動産」のエピソード` },
    { nav: `#sources`, icon: `library`, title: `情報源`, desc: `公的機関の一次情報` },
    { nav: `#figures`, icon: `diagram`, title: `図解`, desc: `図で理解する重要論点` },
    { nav: `#bookmarks`, icon: `bookmark`, title: `ブックマーク`, desc: `保存した用語・問題` },
    { nav: `#settings`, icon: `settings`, title: `設定`, desc: `試験日・テーマ・バックアップ` },
    { action: `guide`, icon: `help`, title: `使い方を見る`, desc: `このサイトの使い方` },
  ];

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view more-view`;
    const ic = (n) => UI.icon(n, { size: 22 });
    wrap.innerHTML = `
      <h2>その他</h2>
      <p class="view-desc">学習を支える機能や設定はこちらから。</p>
      <div class="tile-grid">
        ${TILES.map((t) => t.nav
          ? `<a class="tile" href="${t.nav}"><span class="tile-icon">${ic(t.icon)}</span><span class="tile-title">${t.title}</span><span class="tile-desc">${t.desc}</span></a>`
          : `<button type="button" class="tile" data-action="${t.action}"><span class="tile-icon">${ic(t.icon)}</span><span class="tile-title">${t.title}</span><span class="tile-desc">${t.desc}</span></button>`
        ).join(``)}
      </div>
      <div class="card card-compact" style="margin-top: var(--sp-4); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap: var(--sp-3);">
        <span style="display:flex; align-items:center; gap: var(--sp-2); font-weight:700; white-space:nowrap;">${ic(`moon`)}テーマ</span>
        <div class="segmented" role="group" aria-label="テーマ" data-role="theme"></div>
      </div>
    `;
    root.appendChild(wrap);

    const guide = wrap.querySelector(`[data-action="guide"]`);
    guide.addEventListener(`click`, () => { if (window.Onboarding) Onboarding.show(); });

    const themeGroup = wrap.querySelector(`[data-role="theme"]`);
    const options = [{ id: `system`, label: `端末に合わせる` }, { id: `light`, label: `ライト` }, { id: `dark`, label: `ダーク` }];
    function paint() {
      const cur = ThemeManager.getPreference();
      themeGroup.innerHTML = options.map((o) => `<button type="button" class="segmented-item" data-theme-pref="${o.id}" aria-pressed="${o.id === cur}">${o.label}</button>`).join(``);
      themeGroup.querySelectorAll(`[data-theme-pref]`).forEach((b) => b.addEventListener(`click`, () => {
        ThemeManager.setPreference(b.dataset.themePref);
        paint();
      }));
    }
    paint();
  }

  return { render };
})();
