// hashベースのSPAルーティング: #view/param
window.Router = (function () {
  let viewRoot = null;
  const views = {};
  // 古いURLの画面名 → 今の画面名(#summary/… は #works/… として開き、URLも付け替える)
  const aliases = {};
  const DEFAULT_VIEW = `home`;
  let firstRender = true;
  let currentView = null;
  let renderSeq = 0;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // アプリ名(タブ名用)。siteConfig.js が読めなかったときは index.html の名前を使う
  const metaTitle = document.querySelector(`meta[name="apple-mobile-web-app-title"]`);
  const FALLBACK_NAME = (metaTitle && metaTitle.getAttribute(`content`)) || ``;
  const FALLBACK_HOME_TITLE = document.title;
  function appName() {
    return (window.SITE && SITE.name) || FALLBACK_NAME;
  }

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

  function alias(from, to) {
    aliases[from] = to;
  }

  function isRegistered(name) {
    return hasOwn(views, name);
  }

  function parseHash() {
    let hash = location.hash.replace(/^#/, ``);
    try { hash = decodeURIComponent(hash); } catch (e) { /* 不正な%表記はそのまま使う */ }
    const [view, ...rest] = hash.split(`/`);
    return { view: view || DEFAULT_VIEW, param: rest.join(`/`) || null };
  }

  // 別名を今の画面名に直す(別名の先が登録されていなければそのまま)
  function canonical(v) {
    return hasOwn(aliases, v) && hasOwn(views, aliases[v]) ? aliases[v] : v;
  }

  function viewOfHash(h) {
    return canonical(String(h || ``).replace(/^#/, ``).split(`/`)[0]);
  }

  function render() {
    const seq = ++renderSeq;
    let { view, param } = parseHash();
    // 古いURL(#summary/…)は、履歴を増やさずに今のURL(#works/…)へ付け替える(state はそのまま)
    if (canonical(view) !== view) {
      const to = canonical(view);
      try { history.replaceState(history.state, ``, location.hash.replace(/^#[^/]*/, `#${to}`)); } catch (e) { /* 表示は続ける */ }
      view = to;
    }
    // #constructor・#toString などの組み込みの名前も「知らない画面」としてホームを出す
    const unknown = !hasOwn(views, view);
    const name = unknown ? DEFAULT_VIEW : view;
    if (unknown) {
      try { history.replaceState(null, ``, `#${DEFAULT_VIEW}`); } catch (e) { /* 無視 */ }
      param = null;
    }
    const prevView = currentView;
    currentView = name;

    // 別の画面で保存した位置・状態(yh の画面が違う)がこの履歴に入っていたら使わない(画面側の qState・gState なども読ませない)
    // 同じ画面内の URL の付け替え(#quiz → #quiz/auto など)は画面名が同じなのでそのまま使う
    const st0 = history.state;
    if (st0 && typeof st0 === `object` && typeof st0.yh === `string` && viewOfHash(st0.yh) !== viewOfHash(location.hash)) {
      try { history.replaceState(null, ``); } catch (e) { /* 無視 */ }
    }
    // 戻る/進む・再読み込み(この履歴を前に表示したことがある)か。y・yh はこの画面を表示したあとにだけ書かれる
    const st = history.state && typeof history.state === `object` ? history.state : null;
    const savedY = st && typeof st.y === `number` && Number.isFinite(st.y) ? st.y : 0;
    const returning = !!(st && typeof st.yh === `string`);

    document.body.classList.remove(`exam-active`);
    // 前の画面の読み上げは止める(画面を離れても読み続けないように)
    if (window.TTS && TTS.stop) TTS.stop();
    viewRoot.innerHTML = ``;
    window.scrollTo(0, 0);

    const subnav = window.Nav ? Nav.subnavFor(name) : null;
    if (subnav) viewRoot.appendChild(subnav);

    // 画面の表示に失敗しても、ナビ・タイトル・他の画面への移動は使えるよう、エラー画面に差し替える
    let failed = false;
    try {
      views[name].render(viewRoot, param);
    } catch (err) {
      failed = true;
      console.error(`[router] 画面「${name}」の表示に失敗しました`, err);
      document.body.classList.remove(`exam-active`);
      viewRoot.innerHTML = ``;
      if (subnav) viewRoot.appendChild(subnav);
      if (window.ErrorScreen) viewRoot.appendChild(ErrorScreen.build(err, { view: name }));
      else viewRoot.insertAdjacentHTML(`beforeend`, `<div class="view error-view" data-doc-title="エラー"><h2>画面を表示できませんでした</h2><p>再読み込みしてください。</p></div>`);
    }

    // 戻る/進む・再読み込みのときは保存しておいた位置へ。描画の直後に同期で戻し(最初の描画フレームから正しい位置)、
    // 画面側があとから動かした場合(次のフレーム・少しあと)だけ、ずれていれば直す
    if (savedY > 0) {
      window.scrollTo(0, savedY);
      const fix = () => {
        if (seq !== renderSeq) return;
        if (Math.abs(window.scrollY - savedY) > 2) window.scrollTo(0, savedY);
      };
      requestAnimationFrame(fix);
      setTimeout(fix, 50);
    }

    // 画面に入るアニメーションは、同じタブ内で奥へ進むときだけ(タブ・サブナビの切替、戻る/進む・再読み込みでは動かさない)
    const viewEl = Array.from(viewRoot.children).find((el) => el.classList.contains(`view`));
    if (viewEl && !failed && !unknown && isDrillIn(prevView, name) && !returning && !(savedY > 0) && !(window.UI && UI.prefersReducedMotion())) {
      viewEl.classList.add(`view-enter`);
    }

    if (window.Nav) {
      Nav.update(name);
      Nav.refreshBadge();
    }

    const heading = viewRoot.querySelector(`h2`);
    // 見出しが画面名でない画面(ホームのあいさつ)は data-doc-title の名前をタブ名にする
    const docTitle = (viewEl && viewEl.dataset.docTitle) || (heading ? heading.textContent.trim() : ``);
    const app = appName();
    if (name === DEFAULT_VIEW && !failed) document.title = window.SITE && SITE.titleSuffix ? `${SITE.name}|${SITE.titleSuffix}` : FALLBACK_HOME_TITLE;
    else document.title = docTitle && app ? `${docTitle}|${app}` : docTitle || app;
    // 画面遷移後は見出しにフォーカスを移し、スクリーンリーダーに新しい画面を伝える
    if (!firstRender && heading) {
      heading.setAttribute(`tabindex`, `-1`);
      heading.focus({ preventScroll: true });
    }
    firstRender = false;

    if (unknown && window.UI) UI.toast(`ページが見つからなかったため、ホームを表示しました`, `default`, { duration: 4000 });
  }

  // 同じタブの中で奥へ進む移動か(#topics → #topics/topicK、メニュー → 設定 など)
  // PC は左のサイドバーの項目がそれぞれ入口なので、別の画面への移動はすべて切替として扱う(同じ画面の中で奥へ進むときだけ)
  function isDrillIn(prev, next) {
    if (!prev || !window.Nav || !Nav.tabOf) return false;
    if (prev !== next && window.matchMedia && window.matchMedia(`(min-width: 1024px)`).matches) return false;
    if (Nav.tabOf(prev) !== Nav.tabOf(next)) return false;
    // サブナビでの横の切替(トピック ⇔ 用語集、4択 ⇔ ○× など)は除く
    if (prev !== next && Nav.subnavOf && Nav.subnavOf(prev) && Nav.subnavOf(next)) return false;
    return true;
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

  return { register, alias, isRegistered, init, navigate, current, DEFAULT_VIEW };
})();
