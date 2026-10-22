// ナビゲーション: スマホの下部タブバーとPCの左サイドバーを1つの設定から組み立てる
window.Nav = (function () {
  // mobile: 下部タブバーのどのタブに属するか / section: サイドバーの見出し
  const ITEMS = [
    { view: `home`, label: `ホーム`, icon: `home`, mobile: `home`, section: `top` },
    { view: `topics`, label: `学習トピック`, short: `トピック`, icon: `book-open`, mobile: `learn`, section: `learn` },
    { view: `glossary`, label: `用語集`, icon: `layers`, mobile: `learn`, section: `learn` },
    { view: `figures`, label: `図解`, icon: `diagram`, mobile: `learn`, section: `learn` },
    { view: `calculators`, label: `計算機`, icon: `calculator`, mobile: `learn`, section: `learn` },
    { view: `review`, label: `今日の復習`, icon: `repeat`, mobile: `review`, section: `practice`, badge: true },
    { view: `quiz`, label: `4択問題`, short: `4択`, icon: `pencil-check`, mobile: `practice`, section: `practice` },
    // サブナビは ○× の記号のアイコンと並ぶので、文字は「一問一答」(「○× ○×」と重ねない)
    { view: `ox`, label: `○×一問一答`, short: `一問一答`, icon: `o-x`, mobile: `practice`, section: `practice` },
    { view: `exam`, label: `模擬試験`, icon: `timer`, mobile: `practice`, section: `practice` },
    { view: `progress`, label: `学習の進捗`, icon: `chart`, mobile: `more`, section: `record` },
    { view: `plan`, label: `学習計画`, icon: `calendar`, mobile: `more`, section: `record` },
    { view: `bookmarks`, label: `ブックマーク`, icon: `bookmark`, mobile: `more`, section: `record` },
    { view: `sources`, label: `情報源`, icon: `library`, mobile: `more`, section: `other` },
    { view: `works`, label: `作品で学ぶ`, icon: `play-square`, mobile: `more`, section: `other` },
    { view: `about`, label: `このアプリについて`, icon: `info`, mobile: `more`, section: `other` },
    { view: `settings`, label: `設定`, icon: `settings`, mobile: `more`, section: `bottom` },
    { view: `more`, label: `メニュー`, icon: `menu`, mobile: `more`, section: null },
    // v14: 新しい練習と暗記のツール。PC はサイドバーの「問題」「学ぶ」の最後、スマホ・タブレットは「問題」「学ぶ」の画面の入口のタイル
    // (tilesHtml)とメニューから開く(開いたときは下部タブの「問題」「学ぶ」を選んだ状態にする)。
    // short: タイルの名前(なければ label)/ desc: タイルの小さな説明(広い画面では省く)/ tag: 名前の横の札 / tone: ステッカーの色(既定は緑)
    { view: `challenge`, label: `今日のチャレンジ`, icon: `bolt`, mobile: `practice`, section: `practice`, desc: `3分で○×に挑戦`, tone: `sticker-gold` },
    { view: `freq`, label: `出題頻度ランク`, icon: `star`, mobile: `practice`, section: `practice`, desc: `よく出る論点から` },
    { view: `numbers`, label: `数字まとめドリル`, short: `数字まとめ`, icon: `percent`, mobile: `practice`, section: `practice`, desc: `期間・金額など` },
    { view: `compare`, label: `比較表で覚える`, short: `比較表`, icon: `grid`, mobile: `learn`, section: `learn`, desc: `制度を見比べる` },
    { view: `joubun`, label: `条文穴埋め(消費税法)`, short: `条文穴埋め`, icon: `scale`, mobile: `practice`, section: `practice`, desc: `消費税法の理論`, tag: `税理士` },
  ];

  const TABS = [
    { id: `home`, label: `ホーム`, icon: `home`, nav: `#home` },
    { id: `learn`, label: `学ぶ`, icon: `book-open`, nav: `#topics` },
    { id: `review`, label: `復習`, icon: `repeat`, nav: `#review`, badge: true },
    { id: `practice`, label: `問題`, icon: `pencil-check`, nav: `#quiz` },
    { id: `more`, label: `メニュー`, icon: `menu`, nav: `#more` },
  ];

  const SECTIONS = [
    { id: `top`, heading: null },
    { id: `learn`, heading: `学ぶ` },
    { id: `practice`, heading: `問題` },
    { id: `record`, heading: `記録` },
    { id: `other`, heading: `その他` },
  ];

  // スマホでタブ内を切り替えるサブナビ
  const SUBNAVS = {
    learn: [`topics`, `glossary`, `figures`, `calculators`],
    practice: [`quiz`, `ox`, `exam`],
  };
  const SUBNAV_LABELS = { learn: `学ぶメニュー`, practice: `問題メニュー` };

  function ic(name, size) {
    return window.Icons ? Icons.get(name, { size: size || 20 }) : ``;
  }

  function itemOf(view) {
    return ITEMS.find((it) => it.view === view) || null;
  }

  // 画面が属する下部タブ(home / learn / review / practice / more)。知らない画面は null
  function tabOf(view) {
    const it = itemOf(view);
    return it ? it.mobile : null;
  }

  // 画面がサブナビ(学ぶ・問題のタブ内の切替)に入っていれば、そのタブの id
  function subnavOf(view) {
    const tab = tabOf(view);
    return tab && SUBNAVS[tab] && SUBNAVS[tab].includes(view) ? tab : null;
  }

  function sideItemHtml(it) {
    return `<a class="side-nav-item" href="#${it.view}" data-view="${it.view}">${ic(it.icon)}<span>${it.label}</span>${it.badge ? `<span class="badge-count" data-role="review-badge" hidden></span>` : ``}</a>`;
  }

  function showGuide() {
    if (!window.Onboarding) return;
    if (Onboarding.showGuide) Onboarding.showGuide();
    else if (Onboarding.show) Onboarding.show();
  }

  function mount() {
    const side = document.getElementById(`side-nav`);
    if (side) {
      const groups = SECTIONS.map((sec) => {
        const items = ITEMS.filter((it) => it.section === sec.id);
        if (!items.length) return ``;
        return `<div class="side-nav-group">${sec.heading ? `<div class="side-nav-heading">${sec.heading}</div>` : ``}${items.map(sideItemHtml).join(``)}</div>`;
      }).join(``);
      const bottom = ITEMS.filter((it) => it.section === `bottom`).map(sideItemHtml).join(``);
      side.innerHTML = `${groups}
        <div class="side-nav-group side-nav-bottom">
          ${bottom}
          <button type="button" class="side-nav-item" data-role="show-guide">${ic(`help`)}<span>使い方</span></button>
        </div>`;
      side.querySelector(`[data-role="show-guide"]`).addEventListener(`click`, showGuide);
    }

    const bottomNav = document.getElementById(`bottom-nav`);
    if (bottomNav) {
      bottomNav.innerHTML = TABS.map((t) => `
        <a class="bottom-nav-item" href="${tabHref(t)}" data-tab="${t.id}">
          <span class="bottom-nav-icon">${ic(t.icon, 22)}</span>
          <span class="bottom-nav-label">${t.label}</span>
          ${t.badge ? `<span class="badge-count" data-role="review-badge" hidden></span>` : ``}
        </a>`).join(``);
      // 表示中のタブをもう一度押したら先頭へ戻る(同じURLへの移動は何も起きないため)
      bottomNav.addEventListener(`click`, (e) => {
        const a = e.target.closest(`.bottom-nav-item`);
        if (!a || a.getAttribute(`aria-current`) !== `page` || location.hash !== a.getAttribute(`href`)) return;
        e.preventDefault();
        const smooth = !(window.UI && UI.prefersReducedMotion());
        window.scrollTo({ top: 0, behavior: smooth ? `smooth` : `auto` });
      });
    }

    window.addEventListener(`srs:change`, refreshBadge);
    refreshBadge();
  }

  // タブ内で最後に開いたサブ画面(学ぶ→用語集、問題→○×など)。このタブ(セッション)の間だけ覚える
  function lastSubview(tabId) {
    const list = SUBNAVS[tabId];
    if (!list) return null;
    try {
      const v = sessionStorage.getItem(`navLast.${tabId}`);
      return list.includes(v) ? v : null;
    } catch (e) { return null; }
  }

  function rememberSubview(view) {
    const tab = subnavOf(view);
    if (!tab) return;
    try { sessionStorage.setItem(`navLast.${tab}`, view); } catch (e) { /* 保存できなくても既定の画面を開く */ }
  }

  function tabHref(t) {
    const last = lastSubview(t.id);
    return last ? `#${last}` : t.nav;
  }

  function update(activeView) {
    const tab = tabOf(activeView);
    rememberSubview(activeView);
    document.querySelectorAll(`.side-nav-item[data-view]`).forEach((el) => {
      if (el.dataset.view === activeView) el.setAttribute(`aria-current`, `page`);
      else el.removeAttribute(`aria-current`);
    });
    document.querySelectorAll(`.bottom-nav-item`).forEach((el) => {
      if (el.dataset.tab === tab) el.setAttribute(`aria-current`, `page`);
      else el.removeAttribute(`aria-current`);
      const t = TABS.find((x) => x.id === el.dataset.tab);
      if (t) el.setAttribute(`href`, tabHref(t));
    });
  }

  // スマホ時に画面上部へ差し込むサブナビ(PCではCSSで非表示)
  function subnavFor(view) {
    const tab = subnavOf(view);
    if (!tab) return null;
    const nav = document.createElement(`nav`);
    nav.className = `subnav`;
    nav.setAttribute(`aria-label`, SUBNAV_LABELS[tab]);
    nav.innerHTML = SUBNAVS[tab].map((v) => {
      const sub = itemOf(v);
      return `<a class="subnav-item" href="#${v}"${v === view ? ` aria-current="page"` : ``}>${ic(sub.icon, 16)}${sub.short || sub.label}</a>`;
    }).join(``);
    return nav;
  }

  // v14: 「問題」「学ぶ」の画面の上に出す入口のタイル(押せる白いタイル+丸いステッカー。ホームの .quick と同じ形)。
  // views: 画面名の並び(ITEMS にあるもの)、label: まとまりの名前(読み上げ用)。スマホでは1行で横にすべらせ、広い画面では折り返す(css/practice.css)
  function tilesHtml(views, label) {
    const tiles = views.map(itemOf).filter(Boolean).map((it) => `
      <a class="quick hub-tile" href="#${it.view}" data-hub="${it.view}">
        <span class="sticker sticker-sm${it.tone ? ` ${it.tone}` : ``}" aria-hidden="true">${ic(it.icon, 18)}</span>
        <span><b>${it.short || it.label}${it.tag ? `<span class="hub-tile-badge">${it.tag}</span>` : ``}</b>${it.desc ? `<small>${it.desc}</small>` : ``}</span>
      </a>`);
    return tiles.length ? `<nav class="hub-tiles${tiles.length <= 2 ? ` is-few` : ``}" aria-label="${label}" data-role="hub-tiles">${tiles.join(``)}</nav>` : ``;
  }

  function dueCount() {
    if (window.Stats && Stats.dueReviewCount) return Stats.dueReviewCount();
    if (!window.Srs || !Srs.getReviewDueIds) return 0;
    return Srs.getReviewDueIds().filter((id) => AppIndex.termsById[id]).length;
  }

  function refreshBadge() {
    let n = 0;
    try { n = dueCount(); } catch (e) { console.error(`[ナビ] 復習の件数を数えられませんでした`, e); }
    document.querySelectorAll(`[data-role="review-badge"]`).forEach((el) => {
      const prev = Number(el.dataset.count || 0);
      el.dataset.count = String(n);
      el.hidden = n <= 0;
      el.textContent = n > 99 ? `99+` : String(n);
      // 増えたときだけ弾ませる(0→1 は表示されるときに CSS のアニメーションが動く)
      if (n > prev && prev > 0 && !(window.UI && UI.prefersReducedMotion())) { el.style.animation = `none`; void el.offsetWidth; el.style.animation = ``; }
      const link = el.closest(`a`);
      if (link) link.setAttribute(`aria-label`, n > 0 ? `今日の復習(${n}件)` : `今日の復習`);
    });
  }

  return { ITEMS, TABS, SUBNAVS, mount, update, subnavFor, refreshBadge, itemOf, tabOf, subnavOf, showGuide, tilesHtml };
})();
