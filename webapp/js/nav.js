// ナビゲーション: スマホの下部タブバーとPCの左サイドバーを1つの設定から組み立てる
window.Nav = (function () {
  // mobile: 下部タブバーのどのタブに属するか / section: サイドバーの見出し
  const ITEMS = [
    { view: `home`, label: `ホーム`, icon: `home`, mobile: `home`, section: `top` },
    { view: `progress`, label: `学習の進捗`, icon: `chart`, mobile: `more`, section: `top` },
    { view: `topics`, label: `学習トピック`, short: `トピック`, icon: `book-open`, mobile: `learn`, section: `learn` },
    { view: `glossary`, label: `用語集`, icon: `layers`, mobile: `learn`, section: `learn` },
    { view: `figures`, label: `図解`, icon: `diagram`, mobile: `learn`, section: `learn` },
    { view: `bookmarks`, label: `ブックマーク`, icon: `bookmark`, mobile: `learn`, section: `learn` },
    { view: `summary`, label: `動画一覧`, icon: `play-square`, mobile: `more`, section: `learn` },
    { view: `review`, label: `今日の復習`, icon: `repeat`, mobile: `review`, section: `practice`, badge: true },
    { view: `quiz`, label: `クイズ`, icon: `pencil-check`, mobile: `practice`, section: `practice` },
    { view: `exam`, label: `模擬試験`, icon: `timer`, mobile: `practice`, section: `practice` },
    { view: `calculators`, label: `計算機`, icon: `calculator`, mobile: `more`, section: `tools` },
    { view: `sources`, label: `情報源`, icon: `library`, mobile: `more`, section: `tools` },
    { view: `settings`, label: `設定`, icon: `settings`, mobile: `more`, section: `bottom` },
    { view: `more`, label: `その他`, icon: `grid`, mobile: `more`, section: null },
  ];

  const TABS = [
    { id: `home`, label: `ホーム`, icon: `home`, nav: `#home` },
    { id: `learn`, label: `学習`, icon: `book-open`, nav: `#topics` },
    { id: `review`, label: `復習`, icon: `repeat`, nav: `#review`, badge: true },
    { id: `practice`, label: `演習`, icon: `pencil-check`, nav: `#quiz` },
    { id: `more`, label: `その他`, icon: `grid`, nav: `#more` },
  ];

  const SECTIONS = [
    { id: `top`, heading: null },
    { id: `learn`, heading: `学ぶ` },
    { id: `practice`, heading: `演習` },
    { id: `tools`, heading: `ツール` },
  ];

  // スマホでタブ内を切り替えるサブナビ
  const SUBNAVS = {
    learn: [`topics`, `glossary`, `figures`, `bookmarks`],
    practice: [`quiz`, `exam`],
  };

  function ic(name, size) {
    return window.Icons ? Icons.get(name, { size: size || 20 }) : ``;
  }

  function itemOf(view) {
    return ITEMS.find((it) => it.view === view) || null;
  }

  function sideItemHtml(it) {
    return `<a class="side-nav-item" href="#${it.view}" data-view="${it.view}">${ic(it.icon)}<span>${it.label}</span>${it.badge ? `<span class="badge-count" data-role="review-badge" hidden></span>` : ``}</a>`;
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
      const guideBtn = side.querySelector(`[data-role="show-guide"]`);
      guideBtn.addEventListener(`click`, () => { if (window.Onboarding) Onboarding.show(); });
    }

    const bottomNav = document.getElementById(`bottom-nav`);
    if (bottomNav) {
      bottomNav.innerHTML = TABS.map((t) => `
        <a class="bottom-nav-item" href="${t.nav}" data-tab="${t.id}">
          <span class="bottom-nav-icon">${ic(t.icon, 22)}</span>
          <span class="bottom-nav-label">${t.label}</span>
          ${t.badge ? `<span class="badge-count" data-role="review-badge" hidden></span>` : ``}
        </a>`).join(``);
    }

    window.addEventListener(`srs:change`, refreshBadge);
    refreshBadge();
  }

  function update(activeView) {
    const it = itemOf(activeView);
    const tab = it ? it.mobile : null;
    document.querySelectorAll(`.side-nav-item[data-view]`).forEach((el) => {
      if (el.dataset.view === activeView) el.setAttribute(`aria-current`, `page`);
      else el.removeAttribute(`aria-current`);
    });
    document.querySelectorAll(`.bottom-nav-item`).forEach((el) => {
      if (el.dataset.tab === tab) el.setAttribute(`aria-current`, `page`);
      else el.removeAttribute(`aria-current`);
    });
  }

  // スマホ時に画面上部へ差し込むサブナビ(PCではCSSで非表示)
  function subnavFor(view) {
    const it = itemOf(view);
    if (!it) return null;
    const list = SUBNAVS[it.mobile];
    if (!list || !list.includes(view)) return null;
    const nav = document.createElement(`nav`);
    nav.className = `subnav`;
    nav.setAttribute(`aria-label`, `${it.mobile === `learn` ? `学習` : `演習`}メニュー`);
    nav.innerHTML = list.map((v) => {
      const sub = itemOf(v);
      return `<a class="subnav-item" href="#${v}"${v === view ? ` aria-current="page"` : ``}>${ic(sub.icon, 16)}${sub.short || sub.label}</a>`;
    }).join(``);
    return nav;
  }

  function dueCount() {
    if (window.Stats && Stats.dueReviewCount) return Stats.dueReviewCount();
    if (!window.Srs || !Srs.getReviewDueIds) return 0;
    return Srs.getReviewDueIds().filter((id) => AppIndex.termsById[id]).length;
  }

  function refreshBadge() {
    const n = dueCount();
    document.querySelectorAll(`[data-role="review-badge"]`).forEach((el) => {
      el.hidden = n <= 0;
      el.textContent = n > 99 ? `99+` : String(n);
      const link = el.closest(`a`);
      if (link) link.setAttribute(`aria-label`, n > 0 ? `今日の復習(${n}件)` : `今日の復習`);
    });
  }

  return { ITEMS, mount, update, subnavFor, refreshBadge, itemOf };
})();
