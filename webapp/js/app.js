// 初期化: 画面の登録・ナビ・検索・テーマ・Service Worker
(function () {
  [`home`, `topics`, `glossary`, `bookmarks`, `figures`, `review`, `quiz`, `ox`, `exam`, `progress`,
    `summary`, `calculators`, `sources`, `settings`, `more`].forEach((name) => {
    if (window.Views[name]) Router.register(name, window.Views[name]);
    else console.warn(`[app] 画面 ${name} が見つかりません`);
  });

  function initThemeToggle() {
    const btn = document.getElementById(`theme-toggle-btn`);
    if (!btn) return;
    function paint(theme) {
      const dark = theme === `dark`;
      btn.innerHTML = UI.icon(dark ? `sun` : `moon`);
      btn.setAttribute(`aria-label`, dark ? `ライトモードに切り替え` : `ダークモードに切り替え`);
    }
    btn.addEventListener(`click`, () => ThemeManager.toggle());
    ThemeManager.onChange(paint);
    paint(ThemeManager.getResolved());
  }

  function initGlobalSearch() {
    const header = document.getElementById(`app-header`);
    const field = document.getElementById(`global-search-field`);
    const input = document.getElementById(`global-search-input`);
    const resultsEl = document.getElementById(`global-search-results`);
    const toggleBtn = document.getElementById(`search-toggle-btn`);
    if (!input || !resultsEl) return;
    field.insertAdjacentHTML(`afterbegin`, UI.icon(`search`, { size: 18 }));
    let items = [];
    let activeIdx = -1;

    function isDesktop() {
      return window.matchMedia && window.matchMedia(`(min-width: 1024px)`).matches;
    }

    function setOpen(open) {
      header.classList.toggle(`search-open`, open);
      toggleBtn.setAttribute(`aria-expanded`, String(open));
      toggleBtn.setAttribute(`aria-label`, open ? `検索を閉じる` : `検索を開く`);
      toggleBtn.innerHTML = UI.icon(open ? `x` : `search`);
      if (open) setTimeout(() => input.focus(), 0);
      else { input.value = ``; closeResults(); }
    }

    function closeResults() {
      resultsEl.hidden = true;
      resultsEl.innerHTML = ``;
      items = [];
      activeIdx = -1;
      input.removeAttribute(`aria-activedescendant`);
    }

    function positionResults() {
      const rect = input.getBoundingClientRect();
      const width = isDesktop() ? Math.max(rect.width, 360) : rect.width;
      resultsEl.style.top = `${rect.bottom + 6}px`;
      resultsEl.style.left = `${rect.left}px`;
      resultsEl.style.width = `${width}px`;
    }

    function go(item) {
      input.value = ``;
      closeResults();
      if (!isDesktop()) setOpen(false);
      Router.navigate(item.nav);
    }

    function paintActive() {
      resultsEl.querySelectorAll(`.global-search-item`).forEach((el, i) => {
        const on = i === activeIdx;
        el.classList.toggle(`is-active`, on);
        el.setAttribute(`aria-selected`, String(on));
        if (on) {
          input.setAttribute(`aria-activedescendant`, el.id);
          el.scrollIntoView({ block: `nearest` });
        }
      });
    }

    function renderResults(list) {
      items = list;
      activeIdx = -1;
      if (!list.length) {
        resultsEl.innerHTML = `<div class="global-search-empty">一致する結果が見つかりません</div>`;
      } else {
        resultsEl.innerHTML = list.map((item, i) => `
          <button type="button" class="global-search-item" id="gs-item-${i}" role="option" aria-selected="false" data-idx="${i}">
            <span class="global-search-type">${UI.escapeHtml(item.type)}</span>
            <span class="global-search-title">${UI.escapeHtml(item.title)}</span>
            <span class="global-search-snippet">${UI.escapeHtml(item.snippet)}</span>
          </button>
        `).join(``);
        resultsEl.querySelectorAll(`[data-idx]`).forEach((btn) => {
          btn.addEventListener(`click`, () => go(items[Number(btn.dataset.idx)]));
        });
      }
      resultsEl.hidden = false;
      positionResults();
    }

    input.addEventListener(`input`, () => {
      const q = input.value.trim();
      if (!q) { closeResults(); return; }
      renderResults(window.GlobalSearch.search(q, 8));
    });

    input.addEventListener(`keydown`, (e) => {
      if (e.key === `Escape`) {
        e.preventDefault();
        if (!resultsEl.hidden) closeResults();
        else if (!isDesktop()) setOpen(false);
        else input.blur();
      } else if (e.key === `ArrowDown` && items.length) {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % items.length;
        paintActive();
      } else if (e.key === `ArrowUp` && items.length) {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + items.length) % items.length;
        paintActive();
      } else if (e.key === `Enter` && items.length) {
        e.preventDefault();
        go(items[activeIdx >= 0 ? activeIdx : 0]);
      }
    });

    toggleBtn.innerHTML = UI.icon(`search`);
    toggleBtn.addEventListener(`click`, () => setOpen(!header.classList.contains(`search-open`)));

    // 「/」キーで検索欄へ(入力中は除く)
    document.addEventListener(`keydown`, (e) => {
      if (e.key !== `/` || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || ``;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || document.activeElement.isContentEditable) return;
      if (document.body.classList.contains(`exam-active`)) return;
      e.preventDefault();
      if (isDesktop()) input.focus();
      else setOpen(true);
    });

    document.addEventListener(`click`, (e) => {
      if (e.target !== input && !resultsEl.contains(e.target)) closeResults();
    });

    window.addEventListener(`hashchange`, () => {
      closeResults();
      if (!isDesktop() && header.classList.contains(`search-open`)) setOpen(false);
    });
    window.addEventListener(`resize`, () => { if (!resultsEl.hidden) positionResults(); });
  }

  function initServiceWorker() {
    if (!(`serviceWorker` in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener(`controllerchange`, () => {
      // 初回インストール時は通知しない。更新(新しいSWに切り替わった)時だけ再読み込みを促す
      if (!hadController || refreshing) return;
      UI.toast(`新しいバージョンがあります`, `default`, {
        duration: 0,
        action: { label: `再読み込み`, onClick: () => { refreshing = true; location.reload(); } },
      });
    });
    navigator.serviceWorker.register(`./sw.js`).catch(() => { /* オフライン対応は任意機能のため失敗しても無視 */ });
  }

  document.addEventListener(`DOMContentLoaded`, () => {
    Srs.migrateIfNeeded();
    Nav.mount();
    initThemeToggle();
    initGlobalSearch();
    // 既存ユーザー判定(onboardingDone の記録)をホーム描画より先に行い、初回から「新しくなりました」カードを出す
    if (window.Onboarding && Onboarding.maybeShow) Onboarding.maybeShow();
    Router.init(document.getElementById(`view-root`));
    initServiceWorker();
    const D = window.Diagrams;
    console.log(`[データ整合性チェック] 図解=${D && D.defs ? Object.keys(D.defs).length : 0}件`);
  });
})();
