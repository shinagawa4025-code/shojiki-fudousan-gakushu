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
      if (e.key === `Escape` && onEscape) { e.preventDefault(); onEscape(); return; }
      if (e.key !== `Tab`) return;
      const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener(`keydown`, onKeydown);
    return function release() {
      document.removeEventListener(`keydown`, onKeydown);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true });
    };
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement(`div`);
      overlay.className = `modal-overlay`;
      overlay.innerHTML = `
        <div class="modal-box" role="alertdialog" aria-modal="true" aria-label="確認">
          <p class="modal-message">${message}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-role="cancel">${opts.cancelLabel || `キャンセル`}</button>
            <button type="button" class="btn ${opts.danger ? `btn-danger` : ``}" data-role="confirm">${opts.confirmLabel || `OK`}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const release = trapFocus(overlay, () => close(false));

      function close(result) {
        release();
        overlay.remove();
        resolve(result);
      }

      overlay.addEventListener(`click`, (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector(`[data-role="cancel"]`).addEventListener(`click`, () => close(false));
      overlay.querySelector(`[data-role="confirm"]`).addEventListener(`click`, () => close(true));
      overlay.querySelector(`[data-role="confirm"]`).focus();
    });
  }

  // opts: { action: { label, onClick }, duration }
  function toast(message, type, opts) {
    opts = opts || {};
    const el = document.createElement(`div`);
    el.className = `toast toast-${type || `default`}`;
    el.setAttribute(`role`, `status`);
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
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add(`toast-show`));
    let timer = null;
    function dismiss() {
      clearTimeout(timer);
      el.classList.remove(`toast-show`);
      setTimeout(() => el.remove(), 300);
    }
    if (opts.duration !== 0) timer = setTimeout(dismiss, opts.duration || 2600);
    return { dismiss };
  }

  // 下から出るパネル(PCでは中央のダイアログ)。content は HTML文字列 か Element
  // 戻り値 { el, body, close }
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
      </div>
    `;
    const body = backdrop.querySelector(`.sheet-body`);
    if (typeof opts.content === `string`) body.innerHTML = opts.content;
    else if (opts.content) body.appendChild(opts.content);
    document.body.appendChild(backdrop);
    document.body.style.overflow = `hidden`;
    let closed = false;
    const release = trapFocus(backdrop, () => close());

    function close() {
      if (closed) return;
      closed = true;
      release();
      document.body.style.overflow = ``;
      backdrop.remove();
      window.removeEventListener(`hashchange`, close);
      if (opts.onClose) opts.onClose();
    }

    backdrop.addEventListener(`click`, (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector(`[data-role="sheet-close"]`).addEventListener(`click`, close);
    window.addEventListener(`hashchange`, close);
    // 最初のフォーカスは閉じるボタンへ(本文末尾のリンクにフォーカスするとシートが下までスクロールしてしまうため)
    const firstFocusable = backdrop.querySelector(`[data-role="sheet-close"]`) || body.querySelector(FOCUSABLE);
    if (firstFocusable) firstFocusable.focus({ preventScroll: true });
    return { el: backdrop, body, close };
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

  return { confirm, toast, sheet, emptyState, trapFocus, escapeHtml, prefersReducedMotion, scrollIntoView, icon: ic };
})();
