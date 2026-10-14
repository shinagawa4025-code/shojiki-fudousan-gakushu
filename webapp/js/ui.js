// UI共通部品: 確認モーダル・トースト・シート(下から出るパネル)・空状態
window.UI = (function () {
  function ic(name, opts) {
    return window.Icons ? window.Icons.get(name, opts) : ``;
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia(`(prefers-reduced-motion: reduce)`).matches);
  }

  function escapeHtml(s) {
    return String(s == null ? `` : s)
      .replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`)
      .replace(/"/g, `&quot;`).replace(/'/g, `&#39;`);
  }

  const FOCUSABLE = `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`;

  // ダイアログ内でTabキーのフォーカスを閉じ込める。戻り値は解除関数
  function trapFocus(container, onEscape) {
    const previouslyFocused = document.activeElement;
    function onKeydown(e) {
      if (e.key === `Escape` && onEscape) {
        // 上に別のダイアログ(シートの上の確認など)が開いているときは、いちばん上のものだけを閉じる
        const open = document.querySelectorAll(`.sheet-backdrop:not(.is-closing), .modal-overlay, .onb-overlay`);
        if (open.length && open[open.length - 1] !== container && container.isConnected) return;
        e.preventDefault(); onEscape(); return;
      }
      if (e.key !== `Tab`) return;
      const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener(`keydown`, onKeydown);
    // restoreFocus=false: 画面遷移で閉じるときは、新しい画面の見出しに移したフォーカスを奪わない
    return function release(restoreFocus) {
      document.removeEventListener(`keydown`, onKeydown);
      if (restoreFocus === false) return;
      if (previouslyFocused && previouslyFocused.focus && previouslyFocused.isConnected !== false) previouslyFocused.focus({ preventScroll: true });
    };
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement(`div`);
      overlay.className = `modal-overlay`;
      const msgId = `modal-msg-${++confirmSeq}`;
      overlay.innerHTML = `
        <div class="modal-box" role="alertdialog" aria-modal="true" aria-label="確認" aria-describedby="${msgId}">
          <p class="modal-message" id="${msgId}">${message}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-role="cancel">${opts.cancelLabel || `キャンセル`}</button>
            <button type="button" class="btn ${opts.danger ? `btn-danger` : ``}" data-role="confirm">${opts.confirmLabel || `OK`}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const release = trapFocus(overlay, () => close(false));
      let closed = false;

      function close(result, restoreFocus) {
        if (closed) return;
        closed = true;
        window.removeEventListener(`hashchange`, onHashChange);
        release(restoreFocus);
        overlay.remove();
        resolve(result);
      }
      // 画面が切り替わったら(時間切れの自動提出・戻る操作など)、元の画面の確認は取り消し扱いで閉じる
      function onHashChange() { close(false, false); }
      window.addEventListener(`hashchange`, onHashChange);

      overlay.addEventListener(`click`, (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector(`[data-role="cancel"]`).addEventListener(`click`, () => close(false));
      overlay.querySelector(`[data-role="confirm"]`).addEventListener(`click`, () => close(true));
      // 削除・上書きなど取り消せない操作は、Enter の押し間違いで実行しないよう「キャンセル」を先に選んでおく
      overlay.querySelector(opts.danger ? `[data-role="cancel"]` : `[data-role="confirm"]`).focus();
    });
  }
  let confirmSeq = 0;

  // 読み上げ用の領域は1つだけ置き、トーストの文言をそこで知らせる(トーストごとに role=status を作らない)
  let liveRegion = null;
  function announce(text) {
    if (!liveRegion || !liveRegion.isConnected) {
      liveRegion = document.createElement(`div`);
      liveRegion.className = `sr-only`;
      liveRegion.setAttribute(`role`, `status`);
      liveRegion.setAttribute(`aria-live`, `polite`);
      document.body.appendChild(liveRegion);
    }
    // 同じ文言が続いても読み上げられるよう、いったん空にしてから入れる
    liveRegion.textContent = ``;
    setTimeout(() => { liveRegion.textContent = text; }, 50);
  }

  // 表示中のトースト。複数出たときは重ならないよう、新しいものを基準位置に、古いものを順に外側へずらす
  const activeToasts = [];
  const TOAST_GAP = 8;
  function layoutToasts() {
    [false, true].forEach((top) => {
      let offset = 0;
      activeToasts.filter((el) => el.classList.contains(`toast-top`) === top).reverse().forEach((el) => {
        // 下に出るものは上へ、上に出るものは下へずらす
        el.style.setProperty(`--toast-shift`, `${top ? offset : -offset}px`);
        offset += el.offsetHeight + TOAST_GAP;
      });
    });
  }

  // opts: { action: { label, onClick }, duration, position: 'top', dismissible }
  function toast(message, type, opts) {
    opts = opts || {};
    const el = document.createElement(`div`);
    el.className = `toast toast-${type || `default`}${opts.position === `top` ? ` toast-top` : ``}`;
    announce(message);
    const icon = type === `success` ? ic(`check-circle`, { size: 18 }) : type === `error` ? ic(`alert`, { size: 18 }) : ``;
    el.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    if (opts.action) {
      const btn = document.createElement(`button`);
      btn.type = `button`;
      btn.className = `btn`;
      btn.textContent = opts.action.label;
      btn.addEventListener(`click`, () => { opts.action.onClick(); dismiss(); });
      el.appendChild(btn);
    }
    if (opts.dismissible) {
      const x = document.createElement(`button`);
      x.type = `button`;
      x.className = `btn btn-icon toast-close`;
      x.setAttribute(`aria-label`, `閉じる`);
      x.innerHTML = ic(`x`, { size: 18 });
      x.addEventListener(`click`, () => dismiss());
      el.appendChild(x);
    }
    document.body.appendChild(el);
    activeToasts.push(el);
    layoutToasts();
    requestAnimationFrame(() => el.classList.add(`toast-show`));
    let timer = null;
    let gone = false;
    // 操作ボタン付き(復習の「元に戻す」など)は、その画面での操作なので画面を移ったら閉じる(×で閉じる通知は残す)
    const closeOnNav = !!opts.action && !opts.dismissible;
    function onHashChange() { dismiss(); }
    function dismiss() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      if (closeOnNav) window.removeEventListener(`hashchange`, onHashChange);
      el.classList.remove(`toast-show`);
      const i = activeToasts.indexOf(el);
      if (i >= 0) activeToasts.splice(i, 1);
      layoutToasts();
      setTimeout(() => el.remove(), 300);
    }
    if (closeOnNav) window.addEventListener(`hashchange`, onHashChange);
    if (opts.duration !== 0) timer = setTimeout(dismiss, opts.duration || 2600);
    return { dismiss };
  }

  // 開いているシートの数(重ねて開いたときに、下のシートが開いたまま背景のスクロール止めを外さないように)
  let openSheets = 0;

  // 下から出るパネル(PCでは中央のダイアログ)。content は HTML文字列 か Element
  // opts.footer: 下端に固定する操作ボタンの欄(HTML文字列 か Element。フォームの送信ボタンなど)
  // 戻り値 { el, body, foot, close }
  function sheet(opts) {
    opts = opts || {};
    const backdrop = document.createElement(`div`);
    backdrop.className = `sheet-backdrop`;
    backdrop.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(opts.title || ``)}">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-head">
          <h2 class="sheet-title">${opts.titleHtml || escapeHtml(opts.title || ``)}</h2>
          <button type="button" class="btn btn-icon" data-role="sheet-close" aria-label="閉じる">${ic(`x`)}</button>
        </div>
        <div class="sheet-body"></div>
        ${opts.footer ? `<div class="sheet-foot"></div>` : ``}
      </div>
    `;
    const panel = backdrop.querySelector(`.sheet`);
    const body = panel.querySelector(`:scope > .sheet-body`);
    const closeBtn = panel.querySelector(`:scope > .sheet-head [data-role="sheet-close"]`);
    if (typeof opts.content === `string`) body.innerHTML = opts.content;
    else if (opts.content) body.appendChild(opts.content);
    // 本文の中の同じクラスと取り違えないよう、パネル直下の要素だけを探す
    const foot = opts.footer ? panel.querySelector(`:scope > .sheet-foot`) : null;
    if (foot) {
      if (typeof opts.footer === `string`) foot.innerHTML = opts.footer;
      else foot.appendChild(opts.footer);
    }
    document.body.appendChild(backdrop);
    document.body.style.overflow = `hidden`;
    openSheets += 1;
    let closed = false;
    const release = trapFocus(backdrop, () => close());

    // 閉じるときは下へ消えるアニメーション(画面の移動・動きを減らす設定のときはすぐ消す)
    function close(restoreFocus, instant) {
      if (closed) return;
      closed = true;
      release(restoreFocus === false ? false : undefined);
      // シートを重ねて開いていたときは、最後の1枚を閉じるまで背景のスクロールを止めたままにする
      openSheets = Math.max(0, openSheets - 1);
      if (!openSheets) document.body.style.overflow = ``;
      window.removeEventListener(`hashchange`, onHashChange);
      if (instant || prefersReducedMotion()) backdrop.remove();
      else {
        backdrop.classList.add(`is-closing`);
        // 指で下へ引いている途中なら、その位置から下へ動かす
        if (panel.classList.contains(`is-dragged`)) {
          panel.style.transition = `transform 180ms var(--ease-std), opacity 180ms var(--ease-std)`;
          panel.style.transform = `translateY(${dragY + 80}px)`;
          panel.style.opacity = `0`;
        }
        setTimeout(() => backdrop.remove(), 180);
      }
      if (opts.onClose) opts.onClose();
    }
    function onHashChange() { close(false, true); }

    backdrop.addEventListener(`click`, (e) => { if (e.target === backdrop) close(); });
    closeBtn.addEventListener(`click`, () => close());
    window.addEventListener(`hashchange`, onHashChange);

    // スマホの下からのパネルは、つまみ(と見出し)を下へ引いて閉じられる。80px 以上か、素早く引いたら閉じる
    let dragY = 0;
    let drag = null;
    const isBottomSheet = () => !(window.matchMedia && window.matchMedia(`(min-width: 768px)`).matches);
    function onDown(e) {
      if (closed || drag || !isBottomSheet() || (e.pointerType === `mouse` && e.button !== 0)) return;
      if (e.target.closest(`button, a, input, select, textarea`)) return;
      drag = { id: e.pointerId, y0: e.clientY, t0: performance.now(), lastY: e.clientY, lastT: performance.now(), v: 0 };
      dragY = 0;
      panel.style.transition = `none`;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      dragY = Math.max(0, e.clientY - drag.y0);
      const now = performance.now();
      if (now > drag.lastT) drag.v = (e.clientY - drag.lastY) / (now - drag.lastT);
      drag.lastY = e.clientY;
      drag.lastT = now;
      panel.style.transform = dragY ? `translateY(${dragY}px)` : ``;
      panel.classList.toggle(`is-dragged`, dragY > 0);
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const fast = drag.v > 0.6 && dragY > 24;
      drag = null;
      if (e.type === `pointerup` && (dragY > 80 || fast)) { close(); return; }
      // 戻す
      panel.style.transition = `transform 160ms var(--ease-out)`;
      panel.style.transform = ``;
      panel.classList.remove(`is-dragged`);
      dragY = 0;
      setTimeout(() => { if (!closed) panel.style.transition = ``; }, 170);
    }
    panel.querySelectorAll(`:scope > .sheet-grip, :scope > .sheet-head`).forEach((h) => {
      h.addEventListener(`pointerdown`, onDown);
      h.addEventListener(`pointermove`, onMove);
      h.addEventListener(`pointerup`, onUp);
      h.addEventListener(`pointercancel`, onUp);
    });

    // 最初のフォーカスは閉じるボタンへ(本文末尾のリンクにフォーカスするとシートが下までスクロールしてしまうため)
    const firstFocusable = closeBtn || body.querySelector(FOCUSABLE);
    if (firstFocusable) firstFocusable.focus({ preventScroll: true });
    return { el: backdrop, body, foot, close: (restoreFocus) => close(restoreFocus) };
  }

  // 空状態: { icon, title, body, cta: { label, nav | onClick } } → Element
  function emptyState(opts) {
    opts = opts || {};
    const el = document.createElement(`div`);
    el.className = `empty-state`;
    el.innerHTML = `
      <div class="empty-state-icon">${ic(opts.icon || `info`, { size: 28 })}</div>
      ${opts.title ? `<p class="empty-state-title">${opts.title}</p>` : ``}
      ${opts.body ? `<p class="empty-state-body">${opts.body}</p>` : ``}
      ${opts.cta ? `<button type="button" class="btn" data-role="empty-cta">${opts.cta.label}</button>` : ``}
    `;
    const cta = el.querySelector(`[data-role="empty-cta"]`);
    if (cta) {
      cta.addEventListener(`click`, () => {
        if (opts.cta.onClick) opts.cta.onClick();
        else if (opts.cta.nav) Router.navigate(opts.cta.nav);
      });
    }
    return el;
  }

  function scrollIntoView(el, block) {
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? `auto` : `smooth`, block: block || `center` });
  }

  // 画面を離れたとき(el が画面から外れたあとの最初の画面移動)に後片付けを呼ぶ。
  // document・window・ThemeManager に付けた監視を、次にそのイベントが起きるまで残さないために使う(長く使うと監視と古い画面が溜まるため)
  function onLeave(el, fn) {
    const check = () => {
      if (el.isConnected) return;
      window.removeEventListener(`hashchange`, check);
      try { fn(); } catch (e) { /* 後片付けの失敗は無視 */ }
    };
    window.addEventListener(`hashchange`, check);
  }

  return { confirm, toast, sheet, emptyState, trapFocus, escapeHtml, prefersReducedMotion, scrollIntoView, onLeave, icon: ic };
})();
