// localStorage ヘルパー(namespaced + versioned keys)
// 保存データの版(schemaVersion)と移行、保存できないときの案内(画面下のお知らせ)もここで扱う
window.Storage = (function () {
  const PREFIX = `shojikiLearn.v1.`;
  // 保存データの形の版。形を変えるときは SCHEMA を上げ、MIGRATIONS に移行処理を足す
  const SCHEMA = 2;

  function isPlainObject(v) {
    return !!v && typeof v === `object` && !Array.isArray(v);
  }

  // fallback がオブジェクト/配列/数値/真偽値/文字列のときは、保存値の型が違えば fallback を返す
  // (古い・壊れたバックアップや別のタブの書き込みで型が変わっていても、画面が落ちないように。null の fallback は型を問わない)
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
      if (isPlainObject(fallback) && !isPlainObject(value)) return fallback;
      if (typeof fallback === `number` && !(typeof value === `number` && Number.isFinite(value))) return fallback;
      if (typeof fallback === `boolean` && typeof value !== `boolean`) return fallback;
      if (typeof fallback === `string` && typeof value !== `string`) return fallback;
      return value;
    } catch (e) {
      return fallback;
    }
  }

  // 保存に失敗しているキーと、保存しようとした値(容量を空けたあとに書き直すため)
  const failing = new Map();

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      if (failing.delete(key) && !failing.size) hideBanner();
      return true;
    } catch (e) {
      // 容量不足など。黙って学習記録が消えないよう、画面下に出しっぱなしのお知らせを出す
      failing.set(key, value);
      showBanner();
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 無視 */ }
    if (failing.delete(key) && !failing.size) hideBanner();
  }

  // このアプリの保存データの大きさ(文字数 × 2 バイトの概算)
  function usageBytes() {
    let chars = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) chars += k.length + (localStorage.getItem(k) || ``).length;
      }
    } catch (e) { /* 読めなければ 0 */ }
    return chars * 2;
  }

  // ===== 保存できないときのお知らせ(画面下に固定。保存できるようになったら消える) =====
  let bannerEl = null;
  function showBanner() {
    if (typeof document === `undefined` || !document.body) return;
    if (bannerEl && bannerEl.isConnected) return;
    // 描画の途中(保存の呼び出し元の処理中)に DOM を差し込まないよう、次のタスクで出す
    setTimeout(() => {
      if (!failing.size || (bannerEl && bannerEl.isConnected)) return;
      bannerEl = document.createElement(`div`);
      bannerEl.id = `storage-banner`;
      bannerEl.className = `storage-banner`;
      bannerEl.setAttribute(`role`, `alert`);
      const ic = (n) => (window.UI ? UI.icon(n, { size: 18 }) : ``);
      bannerEl.innerHTML = `
        <p class="storage-banner-text">${ic(`alert`)}<span>学習の記録を保存できません。このサイト用の保存容量がいっぱいです。</span></p>
        <div class="storage-banner-actions">
          <button type="button" class="btn btn-sm" data-role="compact">古い記録を整理</button>
          <a class="btn btn-sm btn-secondary" href="#settings/backup">バックアップ</a>
        </div>`;
      bannerEl.querySelector(`[data-role="compact"]`).addEventListener(`click`, compactAndRetry);
      document.body.appendChild(bannerEl);
      document.body.classList.add(`has-storage-banner`);
      // お知らせの高さ(画面の向きなどで変わる)を、通知の位置とページ末尾の余白に使う
      const el = bannerEl;
      const measure = () => { if (el.isConnected) document.body.style.setProperty(`--storage-banner-h`, `${el.offsetHeight}px`); };
      measure();
      if (window.ResizeObserver) new ResizeObserver(measure).observe(el);
    }, 0);
  }

  function hideBanner() {
    if (bannerEl) bannerEl.remove();
    bannerEl = null;
    if (typeof document !== `undefined` && document.body) {
      document.body.classList.remove(`has-storage-banner`);
      document.body.style.removeProperty(`--storage-banner-h`);
    }
  }

  // 「古い記録を整理」: 解き直しの結果を消し、模擬試験の古い履歴を小さくしてから、保存できなかった記録を書き直す
  // (模擬試験の履歴そのものが保存できなかったときは、その保存しようとした履歴を小さくして保存してもらう)
  function compactAndRetry(e) {
    // 公開版では模擬試験の画面(Views.exam)が後から読み込まれるため、読み込みを待ってから整理する
    // (待っている間はボタンを押せなくして「整理しています…」と出す。読み込めなかったら元に戻す。失敗の知らせは AppData が出す)
    if (window.AppData && typeof AppData.hasDetail === `function` && !AppData.hasDetail()) {
      const btn = e && e.currentTarget && e.currentTarget.nodeType === 1 ? e.currentTarget : null;
      const label = btn ? btn.textContent : ``;
      if (btn) { btn.disabled = true; btn.textContent = `整理しています…`; }
      const restore = () => { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
      AppData.whenDetail().then(() => { restore(); compactAndRetry(); }, restore);
      return;
    }
    remove(`examRetryResult`);
    try {
      if (window.Views && Views.exam && typeof Views.exam.compactHistory === `function`) {
        const pending = failing.get(`examHistory`);
        Views.exam.compactHistory(0, Array.isArray(pending) ? pending : undefined);
      }
    } catch (e) { console.error(`[保存] 古い記録の整理に失敗しました`, e); }
    Array.from(failing.keys()).forEach((k) => set(k, failing.get(k)));
    if (!window.UI) return;
    if (!failing.size) UI.toast(`古い記録を整理して、保存できるようになりました`, `success`, { duration: 4000 });
    else UI.toast(`整理しても容量が足りませんでした。先にバックアップを取ってください`, `error`, { duration: 6000 });
  }

  // ===== 保存データの移行(起動時に1回) =====
  // to: 移行後の版。版の小さい順に並べる。失敗したら版を保存せず、次の起動でやり直す
  const MIGRATIONS = [
    {
      // 版2: 以前の「記憶済み」(flashcards)を復習の予定(srsCards)に移す。以前の印 srsMigrated があれば済んでいる
      to: 2,
      run() {
        if (get(`srsMigrated`, false)) return;
        const D = window.DateUtil;
        if (!D) throw new Error(`DateUtil がありません`);
        const cards = get(`srsCards`, {});
        const known = get(`flashcards`, {});
        const due = D.addDays(D.today(), 4);
        Object.keys(known).forEach((termId) => {
          if (known[termId] && !cards[termId]) cards[termId] = { ease: 2.5, interval: 4, reps: 2, dueDate: due, lastGrade: 3 };
        });
        if (!set(`srsCards`, cards) || !set(`srsMigrated`, true)) throw new Error(`保存できませんでした`);
      },
    },
  ];

  function schemaVersion() {
    const v = get(`schemaVersion`, 1);
    return v >= 1 ? Math.floor(v) : 1;
  }

  function migrate() {
    let current = schemaVersion();
    for (const m of MIGRATIONS) {
      if (m.to <= current) continue;
      try {
        m.run();
      } catch (e) {
        console.error(`[保存データの移行] 版${m.to}への移行に失敗しました(次の起動でやり直します)`, e);
        return false;
      }
      current = m.to;
      set(`schemaVersion`, current);
    }
    return true;
  }

  // ===== iPhone・iPad の Safari(ホーム画面に追加していない)か =====
  function isIos() {
    if (typeof navigator === `undefined`) return false;
    const ua = navigator.userAgent || ``;
    return /iP(hone|ad|od)/.test(ua) || (navigator.platform === `MacIntel` && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return navigator.standalone === true || !!(window.matchMedia && matchMedia(`(display-mode: standalone)`).matches);
  }
  // Safari のタブで開いている(7日ほど開かないと記録が消えることがある)
  function isIosBrowserTab() {
    try { return isIos() && !isStandalone(); } catch (e) { return false; }
  }

  return { get, set, remove, isPlainObject, PREFIX, SCHEMA, migrate, schemaVersion, usageBytes, isIos, isStandalone, isIosBrowserTab, isWriteFailing: () => failing.size > 0 };
})();
