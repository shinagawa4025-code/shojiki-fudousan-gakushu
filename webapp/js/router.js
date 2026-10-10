// hashベースのSPAルーティング: #view/param
window.Router = (function () {
  let viewRoot = null;
  const views = {};
  const DEFAULT_VIEW = `home`;
  let firstRender = true;
  let currentView = null;

  // 戻る/進むで元のスクロール位置に戻すため、各履歴エントリの state に位置を保存する
  // (ブラウザ任せだと画面を作り直す前に復元されて位置がずれるため manual にする)
  if (`scrollRestoration` in history) history.scrollRestoration = `manual`;
  function saveScroll() {
    try {
      const st = history.state && typeof history.state === `object` ? history.state : {};
      if (st.y === window.scrollY) return;
      history.replaceState(Object.assign({}, st, { y: window.scrollY }), ``);
    } catch (e) { /* Safari の replaceState 回数制限などは無視 */ }
  }
  let scrollTimer = null;
  window.addEventListener(`scroll`, () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(saveScroll, 300);
  }, { passive: true });
  // 画面内リンクで移動する直前にも保存する
  document.addEventListener(`click`, (e) => {
    const a = e.target.closest && e.target.closest(`a[href^="#"]`);
    if (a) saveScroll();
  }, true);

  function register(name, view) {
    views[name] = view;
  }

  function parseHash() {
    let hash = location.hash.replace(/^#/, ``);
    try { hash = decodeURIComponent(hash); } catch (e) { /* 不正な%表記はそのまま使う */ }
    const [view, ...rest] = hash.split(`/`);
    return { view: view || DEFAULT_VIEW, param: rest.join(`/`) || null };
  }

  function render() {
    const { view, param } = parseHash();
    const name = views[view] ? view : DEFAULT_VIEW;
    currentView = name;

    document.body.classList.remove(`exam-active`);
    viewRoot.innerHTML = ``;
    window.scrollTo(0, 0);

    const subnav = window.Nav ? Nav.subnavFor(name) : null;
    if (subnav) viewRoot.appendChild(subnav);

    views[name].render(viewRoot, param);

    // 戻る/進む・再読み込みのときは保存しておいた位置へ(画面側のスクロールより後に適用)
    const savedY = history.state && typeof history.state === `object` ? Number(history.state.y) : 0;
    if (savedY > 0) setTimeout(() => window.scrollTo(0, savedY), 50);

    const viewEl = Array.from(viewRoot.children).find((el) => el.classList.contains(`view`));
    if (viewEl && !UI.prefersReducedMotion()) viewEl.classList.add(`view-enter`);

    if (window.Nav) {
      Nav.update(name);
      Nav.refreshBadge();
    }

    const heading = viewRoot.querySelector(`h2`);
    document.title = heading ? `${heading.textContent.trim()} | 不動産学習` : `不動産学習`;
    // 画面遷移後は見出しにフォーカスを移し、スクリーンリーダーに新しい画面を伝える
    if (!firstRender && heading) {
      heading.setAttribute(`tabindex`, `-1`);
      heading.focus({ preventScroll: true });
    }
    firstRender = false;
  }

  function init(rootEl) {
    viewRoot = rootEl;
    window.addEventListener(`hashchange`, render);
    if (!location.hash) history.replaceState(null, ``, `#${DEFAULT_VIEW}`);
    render();
  }

  function navigate(hash) {
    if (location.hash === hash) {
      // 同じ画面をもう一度開くとき(検索結果など)は、保存位置ではなく画面側のスクロール(対象の項目へ)を優先する
      try { history.replaceState(Object.assign({}, history.state, { y: 0 }), ``); } catch (e) { /* 無視 */ }
      render();
    } else {
      saveScroll();
      location.hash = hash;
    }
  }

  function current() {
    return currentView;
  }

  return { register, init, navigate, current, DEFAULT_VIEW };
})();
