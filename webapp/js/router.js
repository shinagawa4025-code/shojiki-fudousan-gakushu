// hashベースのSPAルーティング: #view/param
window.Router = (function () {
  let viewRoot = null;
  const views = {};
  const DEFAULT_VIEW = `topics`;

  function register(name, view) {
    views[name] = view;
  }

  function parseHash() {
    const hash = location.hash.replace(/^#/, ``);
    const [view, ...rest] = hash.split(`/`);
    return { view: view || DEFAULT_VIEW, param: rest.join(`/`) || null };
  }

  function updateNav(activeView) {
    document.querySelectorAll(`.tab-bar [data-view]`).forEach((btn) => {
      const isActive = btn.dataset.view === activeView;
      btn.classList.toggle(`active`, isActive);
      if (isActive) btn.setAttribute(`aria-current`, `page`); else btn.removeAttribute(`aria-current`);
    });
  }

  function render() {
    const { view, param } = parseHash();
    const viewFn = views[view] || views[DEFAULT_VIEW];
    updateNav(views[view] ? view : DEFAULT_VIEW);
    viewRoot.innerHTML = ``;
    window.scrollTo(0, 0);
    viewFn.render(viewRoot, param);
  }

  function init(rootEl) {
    viewRoot = rootEl;
    window.addEventListener(`hashchange`, render);
    if (!location.hash) location.hash = `#${DEFAULT_VIEW}`;
    render();
  }

  function navigate(hash) {
    location.hash = hash;
  }

  return { register, init, navigate };
})();
