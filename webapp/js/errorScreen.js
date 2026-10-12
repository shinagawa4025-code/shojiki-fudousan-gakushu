// 画面の表示に失敗したときのエラー画面と、報告用の情報
// build(err, ctx): 画面(.view)の要素を返す / showBootError(reason): 起動前(UI や Router が無い)でも出せる最小の画面
window.ErrorScreen = (function () {
  const recent = []; // 直近のエラー(報告用・最大5件)

  function appVersion() {
    const C = window.APP_CONFIG;
    // CI のビルドが書き込む版があればそれを、なければアプリの版を使う
    if (C && C.version && C.version !== `dev`) return String(C.version);
    return (window.SITE && SITE.version) || `dev`;
  }

  function info(err, ctx) {
    const msg = String((err && (err.message || err)) || `不明なエラー`).slice(0, 300);
    const i = { message: msg, view: (ctx && ctx.view) || ``, hash: location.hash || `#home`, version: appVersion(), at: new Date().toISOString() };
    recent.unshift(i);
    recent.length = Math.min(recent.length, 5);
    return i;
  }

  // 報告フォーム(Googleフォーム)の URL。フォームが未設定なら null(ボタンを出さない)
  function reportUrl(i) {
    if (!window.Report || typeof Report.url !== `function`) return null;
    try {
      return Report.url({ kind: `page`, id: `error`, title: `[エラー] ${i.message}`, location: i.hash });
    } catch (e) { return null; }
  }

  // ctx.network: 公開版で画面のデータを読み込めなかったとき(Router)。不具合ではなく通信の問題として案内する
  function build(err, ctx) {
    const i = info(err, ctx);
    const net = !!(ctx && ctx.network);
    const url = net ? null : reportUrl(i);
    const esc = (s) => (window.UI ? UI.escapeHtml(s) : String(s).replace(/[<>&"]/g, ``));
    const ic = (n) => (window.UI ? UI.icon(n, { size: 18 }) : ``);
    // ホームが表示できないときは、ホーム以外の入口を案内する
    const home = i.view === `home` ? { href: `#topics`, label: `トピック一覧へ` } : { href: `#home`, label: `ホームに戻る` };
    const el = document.createElement(`div`);
    el.className = `view error-view`;
    el.dataset.docTitle = `エラー`;
    el.innerHTML = `
      <h2>画面を表示できませんでした</h2>
      <div class="card error-card" role="alert">
        <p class="error-lead">${ic(`alert`)}<span>${net ? `この画面のデータを読み込めませんでした。` : `一時的な不具合が起きました。`}学習の記録はこの端末に保存されたままです。</span></p>
        <p class="error-desc">${net ? `通信状態を確認して、再読み込みしてください。ほかの画面に移ると、もう一度読み込みます。` : url ? `再読み込みしても直らないときは、お手数ですが不具合を報告してください。` : `再読み込みしても直らないときは、しばらくしてからもう一度開いてください。`}</p>
        <div class="error-actions">
          <button type="button" class="btn" data-role="reload">${window.UI ? UI.icon(`repeat`, { size: 18 }) : ``}再読み込み</button>
          <a class="btn btn-secondary" href="${home.href}">${home.label}</a>
          ${url ? `<a class="btn btn-secondary" href="${esc(url)}" target="_blank" rel="noopener">不具合を報告</a>` : ``}
        </div>
        <details class="error-details"><summary>詳しい情報(報告に使います)</summary>
          <pre>画面: ${esc(i.hash)}\n版: ${esc(i.version)}\n内容: ${esc(i.message)}</pre></details>
      </div>`;
    el.querySelector(`[data-role="reload"]`).addEventListener(`click`, () => location.reload());
    return el;
  }

  // 起動前(スクリプトの読み込み失敗など)に出す最小の画面。UI・Router が無くても動くように素の DOM だけで作る
  function showBootError(reason) {
    const root = document.getElementById(`view-root`);
    if (!root) return;
    const detail = String(reason || ``).replace(/[<>&"]/g, ``).slice(0, 600);
    root.innerHTML = `<div class="view error-view"><h2>読み込みに失敗しました</h2>
      <div class="card error-card" role="alert"><p class="error-lead"><span>通信状態を確認して、もう一度読み込んでください。学習の記録はこの端末に保存されたままです。</span></p>
      <div class="error-actions"><button type="button" class="btn" data-role="reload">再読み込み</button></div>
      ${detail ? `<details class="error-details"><summary>詳しい情報</summary><pre>${detail}</pre></details>` : ``}</div></div>`;
    root.querySelector(`[data-role="reload"]`).addEventListener(`click`, () => location.reload());
    document.body.classList.add(`app-ready`);
  }

  return { build, info, showBootError, recent };
})();
