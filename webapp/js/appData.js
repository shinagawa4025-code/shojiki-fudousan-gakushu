// 公開版の「詳細」(解説などのデータと、ホーム以外の画面のコードと CSS)を、ホームを描いたあとに読み込む(初回の表示を速くするため)
//
// 公開時(tools/build.js)は、データと画面のコードと CSS を2つの束に分ける:
//   本体(assets/data.*.js・assets/app.*.js・assets/app.*.css): ホーム・一覧・集計に必要な項目とコード。詳細の項目は同じ場所に
//     仮の値(PENDING)を置く(4択の選択肢は「…」「……」のような別々の仮の値。件数・○×の文の数・正誤・分野はそのまま数えられる)。
//     CSS は、詳細が届く前に出る要素(ホーム・初回ガイド・検索・お知らせなど)に当たりうる規則だけ(tools/lib/cssplit.js)
//   詳細(assets/detail.*.js・assets/detail.*.css): 4択の解説・選択肢・選択肢ごとの解説、基礎知識と用語の深掘り・根拠法令、
//     作品・情報源の本文など と、index.html で data-bundle="detail" を付けたファイル(ホーム以外の画面・図解など)。
//     CSS は元の CSS の全部(本体の CSS のあとに置くと、元のファイルとまったく同じカスケードになる)
// 本体のデータの束が window.__APP_DETAIL__ = { src, css, id } を書く。読み込むときは CSS と JS を同時に取りに行き(JS は preload)、
// CSS が効いてから JS を実行する(画面のコードが CSS より先に動いて、見た目のない画面を描かないように)。
// 詳細の束は実行されると AppData._merge で仮の値を本物に置き換え(オブジェクトはそのまま。索引 AppIndex もそのまま使える)、
// 画面のコードを定義してから AppData._done を呼ぶ。
// ローカル開発・元のファイルのままの公開(予備)では __APP_DETAIL__ がないので、最初から「詳細あり」(hasDetail() が true)。
//
// API:
//   hasDetail()   詳細(データ・画面のコード・CSS)がそろっているか
//   whenDetail()  そろったら解決する Promise(元のファイルのままなら即座に解決)。まだ読み込んでいなければ読み込みを始める。
//                 CSS・JS それぞれ3回試して読み込めなければ reject(次に呼ばれたときにもう一度読み込む)
//   start()       ホームを描いたあとに Router が呼ぶ。ホームが画面に出たらすぐ読み込みを始める
//   version()     詳細を取り込むたびに増える数(問題エンジン・検索の作り置きの目印)
//   onDetail(fn)  詳細を取り込んだ直後に呼ぶ関数を登録する
//   lazyView(name) 公開版で詳細の側に回した画面の代わり(ビルドが本体に入れる)。描画は Router が詳細を待ってから行う
//   note(where)   詳細が必要な処理が、詳細より先に呼ばれたことを記録する(確認用。info().premature に入る)
//   info()        計測・確認用 { mode, state, attempts, startedAt, cssAt, loadedAt, premature }
window.AppData = (function () {
  const cfg = window.__APP_DETAIL__ && typeof window.__APP_DETAIL__.src === `string` ? window.__APP_DETAIL__ : null;
  const CSS = cfg && typeof cfg.css === `string` && cfg.css ? cfg.css : null; // 詳細の CSS(古いビルドの本体にはない)
  const PENDING = `…`; // 詳細が届くまでの仮の値(build.js と同じ)
  const RETRY_DELAYS = [1500, 4000]; // 読み込みに失敗したときの再試行までの待ち時間
  // 詳細より先に呼ばれることがある、DOM 要素を返す関数(読み込み中の表示を返し、届いたら差し替える)
  //   quiz.buildFixedCard: 初回ガイドの「まずは1問」(js/onboarding.js)
  const ELEMENT_METHODS = { quiz: [`buildFixedCard`] };
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const now = () => (typeof performance !== `undefined` && performance.now ? Math.round(performance.now()) : 0);

  let state = cfg ? `idle` : `ready`; // idle | loading | ready | failed
  let broken = false; // 詳細の束は届いたが取り込めなかった(読み込み直しても直らない)
  let merged = false;
  let ver = 0;
  let attempts = 0; // 今の段階(CSS か JS)で試した回数(CSS が届いたとき・失敗のあとにもう一度読み込むときは 0 に戻す)
  let tries = 0; // JS をこれまでに試した回数の合計(再試行の URL の番号)
  let cssTries = 0; // CSS をこれまでに試した回数の合計
  let cssState = CSS ? `idle` : `ready`; // idle | loading | ready
  let cssLink = null; // 読み込み中の CSS の <link>
  let startedAt = null;
  let cssAt = null;
  let loadedAt = null;
  let retryTimer = null;
  let scheduled = false;
  let background = false; // ホームを描いたあとの読み込み(低い優先度で取りに行き、ホームの書体・画像より先にしない)
  let toasted = false;
  let waiters = [];
  const hooks = [];
  const premature = [];

  function hasDetail() {
    return state === `ready`;
  }

  function version() {
    return ver;
  }

  function settle(err) {
    const list = waiters;
    waiters = [];
    list.forEach((w) => { try { if (err) w.reject(err); else w.resolve(); } catch (e) { /* 呼び出し側の失敗は無視 */ } });
  }

  function whenDetail() {
    if (state === `ready`) return Promise.resolve();
    if (broken) return Promise.reject(new Error(`詳細データを取り込めませんでした`));
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
      if (state === `failed`) { attempts = 0; state = `idle`; }
      // ここから読み込み始めるときは、待っている画面があるので優先度を下げない
      if (state === `idle`) background = false;
      load();
    });
  }

  // 今の段階を試す: CSS がまだなら CSS、効いていれば JS
  function inject() {
    if (typeof document === `undefined`) return;
    if (cssState !== `ready`) injectCss();
    else injectJs();
  }

  function injectJs() {
    attempts += 1;
    tries += 1;
    const s = document.createElement(`script`);
    // 再試行のときは毎回別の URL にして、失敗した応答(ブラウザが覚えた 404 など)を使い回さないようにする
    // (番号は読み込み直しのたびにも増やし続ける。Service Worker はクエリを無視して保存済みのものを返す)
    s.src = tries > 1 ? `${cfg.src}?r=${tries}` : cfg.src;
    s.async = true;
    if (background) s.fetchPriority = `low`;
    // index.html の起動の見張りに数えさせない(失敗は下で再試行し、だめなら案内を出す。起動の失敗の画面で上書きしない)
    s.setAttribute(`data-lazy`, ``);
    s.onerror = () => fail(new Error(`詳細データを読み込めませんでした(${cfg.src})`), true);
    // 読み込めたのに取り込まれていない(別のファイルが返ったなど)
    s.onload = () => { if (state === `loading`) fail(new Error(`詳細データを取り込めませんでした(${cfg.src})`), false); };
    (document.head || document.documentElement).appendChild(s);
  }

  // 詳細の CSS は <head> の最後に置く(本体の CSS より後。元の CSS の全部なので、届くと元のファイルと同じカスケードになる)
  function injectCss() {
    attempts += 1;
    cssTries += 1;
    cssState = `loading`;
    const l = document.createElement(`link`);
    l.rel = `stylesheet`;
    l.href = cssTries > 1 ? `${CSS}?r=${cssTries}` : CSS;
    l.setAttribute(`data-lazy`, ``);
    if (background) l.fetchPriority = `low`;
    l.onload = () => {
      if (cssLink !== l) return;
      cssLink = null;
      cssState = `ready`;
      cssAt = now();
      attempts = 0;
      if (state === `loading`) injectJs();
    };
    l.onerror = () => {
      if (cssLink !== l) return;
      cssLink = null;
      cssState = `idle`;
      l.remove();
      fail(new Error(`詳細データを読み込めませんでした(${CSS})`), true);
    };
    cssLink = l;
    (document.head || document.documentElement).appendChild(l);
  }

  // JS を CSS と同時に取りに行く(実行は CSS が効いてから。injectJs が同じ URL の <script> を入れたときに使われる)
  function preloadJs() {
    try {
      const has = Array.prototype.some.call(document.querySelectorAll(`link[rel="preload"]`), (l) => l.getAttribute(`href`) === cfg.src);
      if (has) return;
      const l = document.createElement(`link`);
      l.rel = `preload`;
      l.as = `script`;
      l.href = cfg.src;
      if (background) l.fetchPriority = `low`;
      (document.head || document.documentElement).appendChild(l);
    } catch (e) { /* preload できなくても、CSS のあとに読み込む */ }
  }

  function load() {
    if (!cfg || state === `loading` || state === `ready` || broken) return;
    state = `loading`;
    if (startedAt == null) startedAt = now();
    if (cssState !== `ready` && tries === 0 && typeof document !== `undefined`) preloadJs();
    inject();
  }

  function fail(err, retryable) {
    if (state !== `loading`) return;
    console.warn(`[AppData] ${err.message}`);
    if (retryable && attempts <= RETRY_DELAYS.length) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if (state === `loading`) inject(); }, RETRY_DELAYS[attempts - 1]);
      return;
    }
    if (!retryable) broken = true;
    state = `failed`;
    settle(err);
    showFailure();
  }

  // 失敗したことを1回だけ知らせる(ホームはそのまま使える。ほかの画面を開くとエラー画面になり、もう一度読み込む)
  // 読み込み中の画面がエラー画面に変わったとき(Router が待っていた)は、その画面が同じことを案内するので通知は出さない
  // (Router の処理は Promise のあとで動くため、次のタスクで確かめる)
  function showFailure() {
    if (toasted || !window.UI || typeof UI.toast !== `function`) return;
    setTimeout(() => {
      if (toasted || state === `ready`) return;
      if (typeof document !== `undefined` && document.querySelector(`#view-root .error-view`)) return;
      toasted = true;
      UI.toast(`データの一部を読み込めませんでした。通信状態を確認して、再読み込みしてください`, `error`, {
        duration: 8000,
        dismissible: true,
        action: { label: `再読み込み`, onClick: () => location.reload() },
      });
    }, 0);
  }

  // ホームを描いたあと(Router から)。ホームが画面に出たら(次の描画のあと)すぐ読み込みを始める。
  // ページの読み込み(load)は待たない(見出しの書体の漢字の部分が load を遅らせ、ほかの画面が使えるまでが遅くなるため。
  // そのかわり、詳細が届くまでブラウザの「読み込み中」の表示が続く)。描画の合図が来ない(裏のタブなど)ときもタイマーで始める
  function start() {
    if (!cfg || scheduled || state !== `idle`) return;
    scheduled = true;
    let done = false;
    const go = () => { if (!done) { done = true; if (state === `idle`) background = true; load(); } };
    if (typeof window.requestAnimationFrame === `function`) window.requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 1000);
  }

  function onDetail(fn) {
    if (typeof fn === `function`) hooks.push(fn);
  }

  function note(where) {
    if (state === `ready` || !cfg) return;
    if (premature.length < 20 && !premature.includes(where)) premature.push(where);
  }

  // ---- 詳細の束から呼ばれる ----
  // 仮の値か(文字列は PENDING、配列は PENDING を1つずつ増やしたもの)
  function isStandIn(v) {
    if (typeof v === `string`) return v === PENDING;
    return Array.isArray(v) && v.length > 0 && v.every((x, i) => x === PENDING.repeat(i + 1));
  }

  // data: { 集まりの名前: { f: [項目名…], r: [[id, 値…], …] } }。値 0 は「その項目は本体のまま」
  // 先にすべて確かめてから置き換える(途中で食い違いが見つかったら何も変えずに false)
  function mergeDetail(id, data) {
    if (!cfg || id !== cfg.id) throw new Error(`詳細データの版が本体と違います(${id} / ${cfg ? cfg.id : `なし`})`);
    if (merged) return false;
    const D = window.APP_DATA || {};
    const ops = [];
    Object.keys(data).forEach((key) => {
      const part = data[key];
      const list = Array.isArray(D[key]) ? D[key] : null;
      if (!list) throw new Error(`詳細データの ${key} が本体にありません`);
      const byId = Object.create(null);
      list.forEach((o) => { if (o && typeof o.id === `string`) byId[o.id] = o; });
      part.r.forEach((row) => {
        const obj = byId[row[0]];
        if (!obj) throw new Error(`詳細データの ${key} ${row[0]} が本体にありません`);
        part.f.forEach((f, i) => {
          const v = row[i + 1];
          if (v === 0) return;
          if (!hasOwn(obj, f) || !isStandIn(obj[f])) throw new Error(`詳細データの ${key} ${row[0]}.${f} が仮の値ではありません`);
          ops.push([obj, f, v]);
        });
      });
    });
    ops.forEach(([obj, f, v]) => { obj[f] = v; });
    merged = true;
    ver += 1;
    return true;
  }

  function done(id, ok) {
    if (state === `ready`) return;
    if (!ok || !merged || !cfg || id !== cfg.id) {
      fail(new Error(`詳細データを取り込めませんでした`), false);
      return;
    }
    state = `ready`;
    loadedAt = now();
    if (retryTimer) clearTimeout(retryTimer);
    hooks.forEach((fn) => { try { fn(); } catch (e) { console.error(`[AppData] 詳細を取り込んだあとの処理`, e); } });
    if (typeof window.dispatchEvent === `function` && typeof CustomEvent === `function`) window.dispatchEvent(new CustomEvent(`appdata:detail`));
    settle(null);
  }

  // ---- 詳細の側に回した画面の代わり ----
  function realOf(name, stub) {
    const v = window.Views && window.Views[name];
    return v && v !== stub ? v : null;
  }

  function pendingElement(name, method, args, stub) {
    const box = document.createElement(`div`);
    box.className = `lazy-pending`;
    box.innerHTML = `<p class="boot-status" role="status">読み込み中…</p>`;
    whenDetail().then(() => {
      // 閉じた画面(初回ガイドを閉じたなど)には作らない
      if (!box.isConnected) return;
      const real = realOf(name, stub);
      if (!real || typeof real[method] !== `function`) throw new Error(`${name}.${method} を読み込めませんでした`);
      const el = real[method].apply(real, args);
      if (el && el.nodeType) box.replaceWith(el);
    }).catch((err) => {
      console.error(`[AppData] ${name}.${method}`, err);
      if (box.isConnected) box.innerHTML = `<p class="boot-status" role="alert">読み込めませんでした。通信状態を確認して、再読み込みしてください。</p>`;
    });
    return box;
  }

  function lazyView(name) {
    const stub = {
      render(root, param) {
        const real = realOf(name, stub);
        if (!real || typeof real.render !== `function`) throw new Error(`画面「${name}」を読み込めませんでした`);
        return real.render(root, param);
      },
    };
    (ELEMENT_METHODS[name] || []).forEach((m) => { stub[m] = function () { return pendingElement(name, m, Array.prototype.slice.call(arguments), stub); }; });
    Object.defineProperty(stub, `lazyView`, { value: name });
    return stub;
  }

  function info() {
    return { mode: cfg ? `split` : `raw`, state, css: CSS ? cssState : null, attempts, startedAt, cssAt, loadedAt, version: ver, premature: premature.slice() };
  }

  // 最初からホーム以外の画面を開いたとき(共有されたリンクなど)は、待たずにすぐ読み込み始める
  // (このファイルは本体のコードの束の中にあり、詳細の束はこの束を実行し終えてから実行される)
  if (cfg && typeof location !== `undefined`) {
    const head = String(location.hash || ``).replace(/^#/, ``).split(`/`)[0];
    if (head && head !== `home`) load();
  }

  return { PENDING, hasDetail, whenDetail, start, version, onDetail, note, lazyView, info, _merge: mergeDetail, _done: done };
})();
