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
  // yh: 位置を保存したときのハッシュ(別の画面の位置・状態が書き込まれていないかを描画時に確かめる)
  function saveScroll() {
    try {
      const st = history.state && typeof history.state === `object` ? history.state : {};
      if (st.y === window.scrollY && st.yh === location.hash) return;
      history.replaceState(Object.assign({}, st, { y: window.scrollY, yh: location.hash }), ``);
    } catch (e) { /* Safari の replaceState 回数制限などは無視 */ }
  }
  let scrollTimer = null;
  let scrollHash = null;
  window.addEventListener(`scroll`, () => {
    // スクロールしてから300ms以内に「戻る」と、戻り先の履歴(popstate の後・描画の前)に前の画面の位置を書いてしまう。
    // スクロールした画面と今のハッシュが違えば保存しない
    scrollHash = location.hash;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { if (location.hash === scrollHash) saveScroll(); }, 300);
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

  function viewOfHash(h) {
    return String(h || ``).replace(/^#/, ``).split(`/`)[0];
  }

  function render() {
    const { view, param } = parseHash();
    // #constructor・#toString などの組み込みの名前も「知らない画面」としてホームを出す
    const name = Object.prototype.hasOwnProperty.call(views, view) ? view : DEFAULT_VIEW;
    currentView = name;

    // 別の画面で保存した位置・状態(yh の画面が違う)がこの履歴に入っていたら使わない(画面側の qState・gState なども読ませない)
    // 同じ画面内の URL の付け替え(#quiz → #quiz/auto など)は画面名が同じなのでそのまま使う
    const st0 = history.state;
    if (st0 && typeof st0 === `object` && typeof st0.yh === `string` && viewOfHash(st0.yh) !== viewOfHash(location.hash)) {
      try { history.replaceState(null, ``); } catch (e) { /* 無視 */ }
    }

    document.body.classList.remove(`exam-active`);
    // 前の画面の読み上げは止める(画面を離れても読み続けないように)
    if (window.TTS && TTS.stop) TTS.stop();
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
    // 見出しが画面名でない画面(ホームのあいさつ)は data-doc-title の名前をタブ名にする
    const docTitle = (viewEl && viewEl.dataset.docTitle) || (heading ? heading.textContent.trim() : ``);
    document.title = docTitle ? `${docTitle} | 不動産学習` : `不動産学習`;
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
      // (画面ごとの戻る用の状態 qState・tState なども捨て、リンクで新しく開いたときと同じにする。
      //  残すと #quiz/q/<id> を開き直しても「戻ってきた」扱いになり、その問題へ移動しない)
      try { history.replaceState({ y: 0, yh: location.hash }, ``); } catch (e) { /* 無視 */ }
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
