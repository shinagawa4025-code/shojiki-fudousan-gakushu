// その他メニュー(スマホの下部タブ「その他」): 進捗・ブックマーク・図解・計算機・動画一覧・情報源・設定・使い方への一覧
window.Views = window.Views || {};
window.Views.more = (function () {
  const ROWS = [
    { nav: `#progress`, icon: `chart`, title: `学習の進捗`, desc: `分野別の達成度・弱点分析・学習の記録` },
    { nav: `#bookmarks`, icon: `bookmark`, title: `ブックマーク`, desc: `保存した用語・問題` },
    { nav: `#figures`, icon: `diagram`, title: `図解`, desc: `図で理解する重要論点` },
    { nav: `#calculators`, icon: `calculator`, title: `計算機`, desc: `ローン・税金・諸費用の概算` },
    { nav: `#summary`, icon: `play-square`, title: `動画一覧`, desc: `「正直不動産」のエピソード` },
    { nav: `#sources`, icon: `library`, title: `情報源`, desc: `公的機関の一次情報` },
    { nav: `#settings`, icon: `settings`, title: `設定`, desc: `試験日・今日の復習・バックアップ` },
    { action: `guide`, icon: `help`, title: `使い方`, desc: `このサイトの使い方をもう一度見る` },
  ];

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view more-view`;
    const ic = (n, s) => UI.icon(n, { size: s || 20 });
    const inner = (r) => `<span class="more-row-icon">${ic(r.icon)}</span><span class="more-row-main"><span class="more-row-title">${r.title}</span><span class="more-row-desc">${r.desc}</span></span>${ic(`chevron-right`, 18)}`;
    wrap.innerHTML = `
      <h2>その他</h2>
      <p class="view-desc">学習を支える機能や設定はこちらから。</p>
      <nav class="more-list" aria-label="その他のメニュー">
        ${ROWS.map((r) => r.nav
          ? `<a class="more-row" href="${r.nav}">${inner(r)}</a>`
          : `<button type="button" class="more-row" data-action="${r.action}">${inner(r)}</button>`
        ).join(``)}
      </nav>
      <div class="card card-compact more-theme-row">
        <span class="more-theme-label">${ic(`moon`)}テーマ</span>
        <div class="segmented" role="group" aria-label="テーマ" data-role="theme"></div>
      </div>
    `;
    root.appendChild(wrap);

    const guide = wrap.querySelector(`[data-action="guide"]`);
    guide.addEventListener(`click`, () => { if (window.Onboarding) Onboarding.show(); });

    const themeGroup = wrap.querySelector(`[data-role="theme"]`);
    const options = [{ id: `system`, label: `端末に合わせる` }, { id: `light`, label: `ライト` }, { id: `dark`, label: `ダーク` }];
    // ボタンは1度だけ作り、押下状態だけ塗り替える(作り直すとフォーカスが外れるため)。ヘッダーの切替ボタンにも追従する
    themeGroup.innerHTML = options.map((o) => `<button type="button" class="segmented-item" data-theme-pref="${o.id}">${o.label}</button>`).join(``);
    function paint() {
      const cur = ThemeManager.getPreference();
      themeGroup.querySelectorAll(`[data-theme-pref]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.themePref === cur)));
    }
    themeGroup.querySelectorAll(`[data-theme-pref]`).forEach((b) => b.addEventListener(`click`, () => {
      ThemeManager.setPreference(b.dataset.themePref);
      paint();
    }));
    paint();
    const off = ThemeManager.onChange(() => { if (!wrap.isConnected) { if (off) off(); return; } paint(); });
  }

  return { render };
})();
