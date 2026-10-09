// UI共通部品: 確認モーダル・トースト通知(ネイティブのconfirm/alertを置き換える)
window.UI = (function () {
  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement(`div`);
      overlay.className = `modal-overlay`;
      overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true">
          <p class="modal-message">${message}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-role="cancel">${opts.cancelLabel || `キャンセル`}</button>
            <button type="button" class="btn" data-role="confirm">${opts.confirmLabel || `OK`}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      function close(result) {
        document.removeEventListener(`keydown`, onKeydown);
        overlay.remove();
        resolve(result);
      }

      function onKeydown(e) {
        if (e.key === `Escape`) close(false);
      }

      overlay.addEventListener(`click`, (e) => {
        if (e.target === overlay) close(false);
      });
      overlay.querySelector(`[data-role="cancel"]`).addEventListener(`click`, () => close(false));
      overlay.querySelector(`[data-role="confirm"]`).addEventListener(`click`, () => close(true));
      document.addEventListener(`keydown`, onKeydown);
      overlay.querySelector(`[data-role="confirm"]`).focus();
    });
  }

  function toast(message, type) {
    const el = document.createElement(`div`);
    el.className = `toast toast-${type || `default`}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add(`toast-show`));
    setTimeout(() => {
      el.classList.remove(`toast-show`);
      setTimeout(() => el.remove(), 300);
    }, 2400);
  }

  return { confirm, toast };
})();
