// hashベースのSPAルーティング: #view/param
// 公開版では、ホーム以外の画面のコードと詳細データを、ホームを描いたあとに読み込む(js/appData.js)。
// まだ届いていないときにホーム以外の画面を開いたら(最初からその画面のリンクを開いたときも)、起動画面と同じ「読み込み中」を出して待ち、
// 届いたらその画面を描く。待っている間は、履歴の state(y・yh: 戻る/進むで使うスクロール位置)を書き換えない
window.Router = (function () {
  let viewRoot = null;
  const views = {};
  // 古いURLの画面名 → 今の画面名(#summary/… は #works/… として開き、URLも付け替える)
  const aliases = {};
  const DEFAULT_VIEW = `home`;
  let firstRender = true;
  let currentView = null;
  let pending = false; // 詳細を待って「読み込み中」を出している間
  const SLOW_MS = 15000; // 読み込み中がこれより長く続いたら、時間がかかっていることを知らせる
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
    // 読み込み中の表示の間は書かない(まだ描いていない画面の位置を 0 で上書きしないように)
    if (pending) return;
    try {
      const st = history.state && typeof history.state === `object` ? history.state : {};
      if (st.y === window.scrollY && st.yh === location.hash) return;
      history.replaceState(Object.assign({}, st, { y: window.scrollY, yh: location.hash }), ``);
    } catch (e) { /* Safari の replaceState 回数制限などは無視 */ }
  }
  let scrollTimer = null;
  let scrollHash = null;
  window.addEventListener(`scroll`, () => {
    if (pending) return;
    // スクロールしてから300ms以内に「戻る」と、戻り先の履歴(popstate の後・描画の前)に前の画面の位置を書いてしまう。
    // スクロールした画面と今のハッシュが違えば保存しない
    scrollHash = location.hash;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { if (location.hash === scrollHash) saveScroll(); }, 300);
  }, { passive: true });
  // 画面内リンクで移動する直前にも保存する。どこのリンクか(下部タブ・サイドバー・サブナビ・ロゴ)は画面の切り替えの動きに使う
  let tapped = null;
  document.addEventListener(`click`, (e) => {
    const a = e.target.closest && e.target.closest(`a[href^="#"]`);
    if (!a) return;
    saveScroll();
    tapped = { href: a.getAttribute(`href`), tab: !!a.closest(`#bottom-nav, #side-nav, .subnav, .brand`), at: Date.now() };
  }, true);
  // 移動の種類。Navigation API があれば 'traverse'(戻る/進む)か。iPhone のスワイプで戻るなど、ブラウザ自身が動きを付けたときは重ねない
  // (popstate は # だけの移動でも来るので、戻る/進むの判定には使わない。Navigation API が無いときは history.state の印 vn で決める)
  let navInfo = null;
  let uaAt = 0;
  const NAV_API = !!(window.navigation && window.navigation.currentEntry && typeof window.navigation.currentEntry.index === `number` && typeof window.navigation.addEventListener === `function`);
  if (NAV_API) window.navigation.addEventListener(`navigate`, (e) => { navInfo = { traverse: e.navigationType === `traverse`, ua: !!e.hasUAVisualTransition, at: Date.now() }; });
  window.addEventListener(`popstate`, (e) => { if (e && e.hasUAVisualTransition) uaAt = Date.now(); });

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

  // ---- 画面の切り替えの動き(v12.2。js/motion.js と css/motion.css) ----
  // 進む(奥へ・別の画面へ)は右から、戻る(同じタブの上の階層・ホーム・履歴の戻る)は左から少しスライド、
  // 下部タブ・サイドバー・サブナビ・ロゴでの切替は重ねて薄く。最初の表示・同じ画面の描き直し(同じ # や同じ画面の同じ深さ)・
  // 模擬試験の解答中(#exam/run)・初回ガイド・読み込み中は動かさない
  let lastHash = null;
  let lastIdx = null;
  let lastVn = 0;
  // 履歴の中の位置(戻る/進むの向きを決める)。Navigation API が無いブラウザでは、初めて描いたときに history.state へ印(vn: 時刻)を付ける
  function entryIndex() {
    try { if (NAV_API && navigation.currentEntry.index >= 0) return navigation.currentEntry.index; } catch (e) { /* 下の印を使う */ }
    const st = history.state;
    return st && typeof st === `object` && typeof st.vn === `number` ? st.vn : null;
  }
  function markEntry() {
    if (!NAV_API) {
      const st = history.state;
      if (!(st && typeof st === `object` && typeof st.vn === `number`)) {
        lastVn = Math.max(Date.now(), lastVn + 1);
        try { history.replaceState(Object.assign({}, st && typeof st === `object` ? st : {}, { vn: lastVn }), ``); } catch (e) { /* 向きは深さで決める */ }
      }
    }
    lastHash = location.hash;
    lastIdx = entryIndex();
  }
  const depthOf = (h) => {
    const p = String(h || ``).replace(/^#/, ``).split(`/`).filter(Boolean);
    return !p.length || canonical(p[0]) === DEFAULT_VIEW ? 0 : p.length;
  };
  const isExamRun = (h) => /^#?exam\/run/.test(String(h || ``));
  function pageDir(trav, tab) {
    const prev = lastHash;
    const next = location.hash;
    if (firstRender || pending || prev == null || prev === next || isExamRun(prev) || isExamRun(next)) return null;
    const pv = viewOfHash(prev);
    const nv = viewOfHash(next);
    if (!hasOwn(views, nv) || needsDetail(nv) || document.body.classList.contains(`exam-active`) || document.querySelector(`.onb-overlay`)) return null;
    const pd = depthOf(prev);
    const nd = depthOf(next);
    if (trav) {
      const idx = entryIndex();
      if (idx != null && lastIdx != null && idx !== lastIdx) return idx < lastIdx ? `back` : `forward`;
      return nd < pd ? `back` : `forward`;
    }
    if (pv === nv && pd === nd) return null;
    if (tab) return `fade`;
    const sameTab = window.Nav && Nav.tabOf ? Nav.tabOf(pv) === Nav.tabOf(nv) : pv === nv;
    return nv === DEFAULT_VIEW || (sameTab && nd < pd) ? `back` : `forward`;
  }

  // 動きを付けるとき(View Transitions)は、今の画面を写し取ってから描くため、描画が hashchange の後になる。
  // 画面側の「離れたら後片付け」(UI.onLeave など。hashchange のときに古い画面が外れているかを見る)が描画より先に動いてしまうので、
  // 古い画面を外してから hashchange をもう一度送り(fdResent。Router 自身は無視する)、そのあとで新しい画面を描く
  // (動きのないときと同じ順: 後片付け → 描画。描いたあとに送ると、新しい画面のタイマー・ダイアログまで片付けてしまう)。
  // 外してから描くまでは同じ処理の中なので、空の画面は表示されない。描画中の例外は、動きの約束(Promise)に飲まれないよう投げ直す
  let deferSeq = 0;
  function onHashChange(e) {
    if (e && e.fdResent) return;
    const now = Date.now();
    const nav = navInfo && now - navInfo.at < 1000 ? navInfo : null;
    const tap = tapped && now - tapped.at < 1000 && tapped.href === location.hash ? tapped : null;
    navInfo = null;
    tapped = null;
    // 戻る/進む: Navigation API の種類。無いときは、前に描いた印(vn)のある履歴へ移ったか
    const trav = NAV_API ? !!(nav && nav.traverse) : entryIndex() != null;
    const ua = (nav && nav.ua) || now - uaAt < 1000;
    const dir = ua ? null : pageDir(trav, !!(tap && tap.tab));
    if (!dir || !window.Motion || typeof Motion.page !== `function`) { render(); return; }
    const seq = ++deferSeq;
    let sync = true;
    Motion.page(dir, () => {
      if (seq !== deferSeq) return; // 待っている間に別の移動・描画があった
      try {
        if (!sync) {
          viewRoot.innerHTML = ``;
          let ev = null;
          try { ev = new HashChangeEvent(`hashchange`); } catch (err) { ev = null; }
          if (ev) {
            ev.fdResent = true;
            window.dispatchEvent(ev);
          }
          if (seq !== deferSeq) return; // 後片付けの中で別の描画があった
        }
        render();
      } catch (err) {
        if (sync) throw err;
        setTimeout(() => { throw err; }, 0);
      }
    });
    sync = false;
  }

  function render() {
    deferSeq++;
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
    // 公開版で詳細がまだ届いていなければ、読み込み中を出して待つ(届いたらこの関数をもう一度呼ぶ)
    if (needsDetail(name)) {
      showPending(name, seq);
      return;
    }
    pending = false;
    currentView = name;

    // 別の画面で保存した位置・状態(yh の画面が違う)がこの履歴に入っていたら使わない(画面側の qState・gState なども読ませない)
    // 同じ画面内の URL の付け替え(#quiz → #quiz/auto など)は画面名が同じなのでそのまま使う
    const st0 = history.state;
    if (st0 && typeof st0 === `object` && typeof st0.yh === `string` && viewOfHash(st0.yh) !== viewOfHash(location.hash)) {
      try { history.replaceState(null, ``); } catch (e) { /* 無視 */ }
    }
    // 戻る/進む・再読み込み(この履歴を前に表示したことがある)ときの位置。y・yh はこの画面を表示したあとにだけ書かれる
    const st = history.state && typeof history.state === `object` ? history.state : null;
    const savedY = st && typeof st.y === `number` && Number.isFinite(st.y) ? st.y : 0;

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

    // 画面の切り替えの動きは onHashChange(js/motion.js)。ここでは付けない
    const viewEl = Array.from(viewRoot.children).find((el) => el.classList.contains(`view`));

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
    markEntry();

    if (unknown && window.UI) UI.toast(`ページが見つからなかったため、ホームを表示しました`, `default`, { duration: 4000 });
    // 公開版: 最初の画面を描いたら、手の空いたときに詳細の読み込みを始める
    if (window.AppData && AppData.start) AppData.start();
  }

  // ホーム以外の画面は、公開版では詳細(データと画面のコード)がそろってから描く
  function needsDetail(name) {
    return name !== DEFAULT_VIEW && !!window.AppData && typeof AppData.hasDetail === `function` && !AppData.hasDetail();
  }

  // 読み込み中の表示(起動画面と同じ見た目)。少し待ってから「読み込み中…」を出す(.boot-status のアニメーション)
  function pendingEl() {
    const el = document.createElement(`div`);
    el.className = `view view-pending`;
    el.dataset.docTitle = `読み込み中`;
    const name = appName();
    const tagline = (window.SITE && SITE.tagline) || ``;
    // どの画面にも見出し(h2)が1つあるように、読み上げ用の見出しを置く(見た目は起動画面と同じ)
    el.innerHTML = `
      <h2 class="sr-only">読み込み中</h2>
      <div class="boot">
        <img class="boot-logo" src="icons/logo.svg" alt="" width="64" height="64">
        ${name ? `<p class="boot-name">${name.replace(/[<>&"]/g, ``)}</p>` : ``}
        ${tagline ? `<p class="boot-tagline">${tagline.replace(/[<>&"]/g, ``)}</p>` : ``}
        <p class="boot-status" role="status">読み込み中…</p>
      </div>`;
    return el;
  }

  function showPending(name, seq) {
    pending = true;
    currentView = name;
    clearTimeout(scrollTimer);
    document.body.classList.remove(`exam-active`);
    if (window.TTS && TTS.stop) TTS.stop();
    viewRoot.innerHTML = ``;
    const subnav = window.Nav ? Nav.subnavFor(name) : null;
    if (subnav) viewRoot.appendChild(subnav);
    viewRoot.appendChild(pendingEl());
    window.scrollTo(0, 0);
    // 押したリンク(画面の中)が消えてフォーカスが <body> に落ちないよう、読み込み中の見出しへ(描けたら新しい画面の見出しへ移る)
    if (!firstRender) {
      const h = viewRoot.querySelector(`.view-pending h2`);
      if (h) { h.setAttribute(`tabindex`, `-1`); h.focus({ preventScroll: true }); }
    }
    if (window.Nav) Nav.update(name);
    const app = appName();
    document.title = app ? `読み込み中|${app}` : `読み込み中`;
    // 通信が止まって届かないまま(失敗にもならない)のときは、しばらくしたら案内と再読み込みのボタンを出す
    const slowTimer = setTimeout(() => {
      if (seq !== renderSeq || !pending) return;
      const box = viewRoot.querySelector(`.view-pending .boot`);
      const status = box && box.querySelector(`.boot-status`);
      if (!status) return;
      status.innerHTML = `<span class="nowrap">読み込みに時間がかかっています。</span><span class="nowrap">通信状態を確認してください。</span>`;
      const btn = document.createElement(`button`);
      btn.type = `button`;
      btn.className = `btn btn-sm btn-secondary boot-reload`;
      btn.textContent = `再読み込み`;
      btn.addEventListener(`click`, () => location.reload());
      box.appendChild(btn);
    }, SLOW_MS);
    AppData.whenDetail().then(() => {
      clearTimeout(slowTimer);
      if (seq === renderSeq) render();
    }, (err) => {
      clearTimeout(slowTimer);
      if (seq !== renderSeq) return;
      // 読み込めなかった: エラー画面(再読み込み・ホームへ)。ナビは使える
      pending = false;
      viewRoot.innerHTML = ``;
      const sub = window.Nav ? Nav.subnavFor(name) : null;
      if (sub) viewRoot.appendChild(sub);
      if (window.ErrorScreen) viewRoot.appendChild(ErrorScreen.build(err, { view: name, network: true }));
      else viewRoot.insertAdjacentHTML(`beforeend`, `<div class="view error-view" data-doc-title="エラー"><h2>画面を表示できませんでした</h2><p>通信状態を確認して、再読み込みしてください。</p></div>`);
      document.title = app ? `エラー|${app}` : `エラー`;
    });
  }

  // 詳細の画面のコードを読み込むと、画面側の hashchange の処理(模擬試験の後片付けなど)が Router より後に登録される。
  // 元のファイルのまま(先に登録される)と同じ順になるよう、Router の処理を最後に付け直す
  if (window.AppData && AppData.onDetail) {
    AppData.onDetail(() => {
      if (!viewRoot) return;
      window.removeEventListener(`hashchange`, onHashChange);
      window.addEventListener(`hashchange`, onHashChange);
    });
  }

  function init(rootEl) {
    viewRoot = rootEl;
    window.addEventListener(`hashchange`, onHashChange);
    if (!location.hash) history.replaceState(null, ``, `#${DEFAULT_VIEW}`);
    // 初回ガイド(画面全体を覆うダイアログ)を開いているときは、その下の最初の画面を次のタスクで描く
    // (ガイドの表示と最初の画面の描画・レイアウトを1つの長いタスクにしない。起動直後の操作の待ちを短くする)。
    // それまでは起動画面と同じ表示を置く(app.js は起動の最後に .view があるかを確かめる)
    if (document.querySelector(`.onb-overlay`)) {
      const seq = renderSeq;
      currentView = viewOfHash(location.hash) || DEFAULT_VIEW;
      viewRoot.innerHTML = ``;
      viewRoot.appendChild(pendingEl());
      setTimeout(() => { if (seq === renderSeq) render(); }, 0);
      return;
    }
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
