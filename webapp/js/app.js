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
      // iPhone はタップの処理中に直接 focus しないとキーボードが出ないため、遅らせずにその場で focus する
      // (search-open で検索欄が表示された直後なので、同期的に focus できる)
      if (open) input.focus({ preventScroll: true });
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
      // スマホでキーボードが出ているときは、見えている範囲(visualViewport)に収まる高さにする
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const room = Math.floor(visibleBottom - rect.bottom - 6 - 8);
      resultsEl.style.maxHeight = `${Math.max(120, Math.min(room, Math.round(window.innerHeight * 0.6)))}px`;
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

    // 日本語入力の変換中は検索せず、入力が落ち着いてから検索する(打鍵ごとの検索で重くならないように)
    let searchTimer = null;
    function runSearch() {
      searchTimer = null;
      const q = input.value.trim();
      if (!q) { closeResults(); return; }
      renderResults(window.GlobalSearch.search(q, 8));
    }
    input.addEventListener(`input`, (e) => {
      if (e.isComposing) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 120);
    });
    input.addEventListener(`compositionend`, () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 120);
    });
    // 入力欄に文字が残ったまま戻ってきたら(Escで結果だけ閉じたあとのタップも)、結果をもう一度出す
    function reshow() {
      if (input.value.trim() && resultsEl.hidden) runSearch();
    }
    input.addEventListener(`focus`, reshow);
    input.addEventListener(`click`, reshow);

    // タッチ端末(キーボードの「検索」)では、矢印で選んでいない Enter はキーボードを閉じるだけにする
    function isTouch() {
      return !!(window.matchMedia && window.matchMedia(`(hover: none) and (pointer: coarse)`).matches);
    }

    input.addEventListener(`keydown`, (e) => {
      // 日本語入力の変換確定の Enter では移動しない
      if (e.isComposing || e.keyCode === 229) return;
      // 検索待ちの間に Enter が押されたら、先に検索を済ませる
      if (e.key === `Enter` && searchTimer) { clearTimeout(searchTimer); searchTimer = null; runSearch(); }
      if (e.key === `Enter` && activeIdx < 0 && isTouch()) {
        e.preventDefault();
        input.blur();
        return;
      }
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
    if (window.visualViewport) window.visualViewport.addEventListener(`resize`, () => { if (!resultsEl.hidden) positionResults(); });
  }

  // iPhone のホーム画面アプリは、翌日に開いても再読み込みせず前の画面のまま戻ることがある。
  // 日付が変わっていたら復習バッジを更新し、日付で内容が変わる画面(ホーム・進捗)を描き直す
  function initDayRollover() {
    let lastDay = DateUtil.today();
    let waitTimer = null;
    const hasOverlay = () => !!document.querySelector(`.sheet-backdrop, .modal-overlay, .onb-overlay`);
    function check() {
      const today = DateUtil.today();
      if (today === lastDay) return;
      lastDay = today;
      if (window.Nav) Nav.refreshBadge();
      const cur = Router.current();
      if (cur !== `home` && cur !== `progress`) return;
      const hash = location.hash || `#home`;
      if (!hasOverlay()) { Router.navigate(hash); return; }
      // シートや確認を開いている間は描き直さない(入力中の内容が消えるため)。閉じたら、見ていた位置のまま描き直す
      clearInterval(waitTimer);
      waitTimer = setInterval(() => {
        // 別の画面へ移ったら、その画面は新しい日付で描かれるので何もしない
        if (location.hash !== hash || Router.current() !== cur) { clearInterval(waitTimer); return; }
        if (hasOverlay()) return;
        clearInterval(waitTimer);
        const y = window.scrollY;
        Router.navigate(hash);
        window.scrollTo(0, y);
      }, 500);
    }
    document.addEventListener(`visibilitychange`, () => { if (document.visibilityState === `visible`) check(); });
    window.addEventListener(`pageshow`, check);
    window.addEventListener(`focus`, check);
  }

  // 記録が消えにくいよう、ブラウザに保存領域の保護(persist)を頼む。
  // Firefox は確認を出すため、利用者の操作(初回ガイドの完了・最初の復習)のあとにだけ呼ぶ
  function initPersistOnFirstGrade() {
    if (!window.Onboarding || !Onboarding.requestPersist) return;
    function onGrade() {
      window.removeEventListener(`srs:change`, onGrade);
      Onboarding.requestPersist();
    }
    window.addEventListener(`srs:change`, onGrade);
  }

  // 設定でインポートしたあと再読み込みした直後に、完了を知らせる
  function showImportDoneToast() {
    let flag = null;
    try { flag = sessionStorage.getItem(`importDone`); sessionStorage.removeItem(`importDone`); } catch (e) { /* 無視 */ }
    if (flag) UI.toast(`バックアップの学習データを読み込みました`, `success`, { duration: 4000 });
  }

  function initServiceWorker() {
    if (!(`serviceWorker` in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener(`controllerchange`, () => {
      // 初回インストール時は通知しない。更新(新しいSWに切り替わった)時だけ再読み込みを促す
      if (!hadController || refreshing) return;
      // 出しっぱなしの通知なので、解答ボタンや他の通知(下部)に重ならないよう常に画面上部に出す。×で閉じられる
      UI.toast(`新しいバージョンがあります`, `default`, {
        duration: 0,
        position: `top`,
        dismissible: true,
        action: { label: `再読み込み`, onClick: () => { refreshing = true; location.reload(); } },
      });
    });
    navigator.serviceWorker.register(`./sw.js`).then((reg) => {
      // ホーム画面から開いたアプリが背景から戻ったときにも更新を確認する
      document.addEventListener(`visibilitychange`, () => { if (document.visibilityState === `visible` && reg.update) reg.update().catch(() => {}); });
    }).catch(() => { /* オフライン対応は任意機能のため失敗しても無視 */ });
  }

  // iPhone の Safari はタッチの監視がないと :active(押したときの見た目)を付けないため、空の監視を登録する
  document.addEventListener(`touchstart`, () => {}, { passive: true });

  document.addEventListener(`DOMContentLoaded`, () => {
    Srs.migrateIfNeeded();
    Nav.mount();
    initThemeToggle();
    initGlobalSearch();
    // 既存ユーザー判定(onboardingDone の記録)をホーム描画より先に行い、初回から「新しくなりました」カードを出す
    if (window.Onboarding && Onboarding.maybeShow) Onboarding.maybeShow();
    Router.init(document.getElementById(`view-root`));
    initDayRollover();
    initPersistOnFirstGrade();
    showImportDoneToast();
    initServiceWorker();
    const D = window.Diagrams;
    console.log(`[データ整合性チェック] 図解=${D && D.defs ? Object.keys(D.defs).length : 0}件`);
  });
})();
