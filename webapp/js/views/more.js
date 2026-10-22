// メニュー(スマホの下部タブ「メニュー」): 記録・設定・このアプリについて・コーナーへの一覧とテーマの切替
window.Views = window.Views || {};
window.Views.more = (function () {
  // tone: 行のステッカーの色(既定は緑。記録・バッジの行はごほうびの金色)
  const ROWS = [
    { nav: `#progress`, icon: `chart`, tone: `sticker-gold`, title: `学習の進捗`, desc: `分野別の達成度・弱点分析・合格予測・学習時間・バッジ` },
    { nav: `#plan`, icon: `calendar`, title: `学習計画`, desc: `試験日から逆算した時期と今週やること` },
    { nav: `#bookmarks`, icon: `bookmark`, title: `ブックマーク`, desc: `保存した用語・問題` },
    { nav: `#sources`, icon: `library`, title: `情報源`, desc: `解説の根拠にしている公的機関の一次情報` },
    { nav: `#settings`, icon: `settings`, title: `設定`, desc: `学ぶ目的・試験日・1日の目標・今日の復習・バックアップ` },
    { action: `guide`, icon: `help`, title: `使い方`, desc: `学び方と復習のしくみ` },
    { nav: `#about`, icon: `info`, title: `このアプリについて`, desc: `運営者・プライバシー・免責事項・更新履歴` },
    { report: true, icon: `flag`, title: `誤り・ご意見を送る`, desc: `報告フォームが開きます` },
  ];
  // v14: 練習と暗記のツール(「問題」「学ぶ」の画面の入口のタイルと同じ行き先)
  const TOOL_ROWS = [
    { nav: `#challenge`, icon: `bolt`, tone: `sticker-gold`, title: `今日のチャレンジ`, desc: `3分間の○×タイムアタック。自己ベストと経験値` },
    { nav: `#freq`, icon: `star`, title: `出題頻度ランク`, desc: `宅建士試験の論点ごとの出題頻度(A・B・C)` },
    { nav: `#numbers`, icon: `percent`, title: `数字まとめドリル`, desc: `期間・金額・面積・割合などの数字をカードと4択で` },
    { nav: `#compare`, icon: `grid`, title: `比較表で覚える`, desc: `似た制度を表で見比べて、穴埋めで確かめる` },
    { nav: `#joubun`, icon: `scale`, title: `条文穴埋め(消費税法)`, badge: `税理士`, desc: `理論の条文の大事な語句を穴埋めで覚える` },
  ];
  const CORNER_ROWS = [
    { nav: `#works`, icon: `play-square`, title: `作品で学ぶ`, badge: `任意`, desc: `公式チャンネルの動画をテーマ別に紹介` },
  ];

  // 報告フォーム(Googleフォーム)の URL。未設定なら null(行を出さない)
  function reportUrl() {
    if (!window.Report || typeof Report.enabled !== `function` || !Report.enabled()) return null;
    try { return Report.url({ kind: `page`, title: `メニューから`, location: `#more` }); } catch (e) { return null; }
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view more-view`;
    const ic = (n, s) => UI.icon(n, { size: s || 20 });
    const inner = (r, trailing) => `<span class="more-row-icon${r.tone ? ` ${r.tone}` : ``}" aria-hidden="true">${ic(r.icon)}</span><span class="more-row-main"><span class="more-row-title">${r.title}${r.badge ? `<span class="more-row-badge">${r.badge}</span>` : ``}</span><span class="more-row-desc">${r.desc}</span></span>${trailing || ic(`chevron-right`, 18)}`;
    const rowHtml = (r) => {
      if (r.nav) return `<a class="more-row" href="${r.nav}">${inner(r)}</a>`;
      if (r.report) {
        const url = reportUrl();
        return url ? `<a class="more-row" href="${UI.escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${r.title}(Googleフォームが開きます)">${inner(r, `<span class="more-row-ext">${ic(`external`, 16)}</span>`)}</a>` : ``;
      }
      return `<button type="button" class="more-row" data-action="${r.action}">${inner(r)}</button>`;
    };
    // 見出しの下の説明は置かない。行は丸いステッカー+名前+短い説明(押せる行のまとまり)
    wrap.innerHTML = `
      <h2>メニュー</h2>
      <nav class="more-list" aria-label="メニュー">
        ${ROWS.map(rowHtml).join(``)}
      </nav>
      <h3 class="more-group-title" id="more-tools-title">練習と暗記のツール</h3>
      <nav class="more-list" aria-labelledby="more-tools-title" data-role="more-tools">
        ${TOOL_ROWS.map(rowHtml).join(``)}
      </nav>
      <h3 class="more-group-title" id="more-corner-title">コーナー</h3>
      <nav class="more-list" aria-labelledby="more-corner-title">
        ${CORNER_ROWS.map(rowHtml).join(``)}
      </nav>
      <div class="card card-compact more-theme-row">
        <span class="more-theme-label"><span class="sticker sticker-sm" aria-hidden="true">${ic(`moon`, 18)}</span>テーマ</span>
        <div class="segmented" role="group" aria-label="テーマ" data-role="theme"></div>
      </div>
    `;
    root.appendChild(wrap);

    const guide = wrap.querySelector(`[data-action="guide"]`);
    guide.addEventListener(`click`, () => {
      if (window.Nav && Nav.showGuide) Nav.showGuide();
      else if (window.Onboarding) (Onboarding.showGuide || Onboarding.show)();
    });

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
    // 画面を離れたら監視を外す(テーマを切り替えるまで古い画面が残らないように)
    if (UI.onLeave) UI.onLeave(wrap, () => { if (off) off(); });
  }

  return { render };
})();
