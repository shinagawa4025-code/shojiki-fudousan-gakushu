// hashベースのSPAルーティング: #view/param
window.Router = (function () {
  let viewRoot = null;
  const views = {};
  const DEFAULT_VIEW = `home`;
  let firstRender = true;
  let currentView = null;

  function register(name, view) {
    views[name] = view;
  }

  function parseHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ``));
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
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function current() {
    return currentView;
  }

  return { register, init, navigate, current, DEFAULT_VIEW };
})();
