// 設定ビュー: 学習データのエクスポート/インポート(バックアップ・端末間の手動移行)
window.Views = window.Views || {};
window.Views.settings = (function () {
  const PREFIX = `shojikiLearn.v1.`;

  function collectAllData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        try {
          data[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key));
        } catch (e) { /* 壊れた値はスキップ */ }
      }
    }
    return data;
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view settings-view`;
    wrap.innerHTML = `
      <h2>設定</h2>
      <p class="view-desc">学習の進捗(記憶済み用語・視聴チェック・クイズ履歴・復習スケジュール等)はこの端末のブラウザにのみ保存されています。別の端末に移したり、バックアップを取っておきたい場合はエクスポート・インポートを使ってください。</p>

      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`target`)}目標の試験</h3>
        <p class="view-desc">登録した試験日までの残り日数と1日あたりの学習量の目安がホームに表示されます。星マークを付けた試験がホームに大きく表示されます。</p>
        <div class="target-list" data-role="target-list"></div>
        <button type="button" class="btn" data-role="add-target">${UI.icon(`calendar`)}試験日を登録</button>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`repeat`)}今日の復習</h3>
        <p class="view-desc">「今日の復習」で1日に出す新しい用語の数です。期限が来た復習はこの数に関係なくすべて出題されます。</p>
        <div class="chip-row" data-role="new-limit-chips" role="group" aria-label="1日の新しい用語の数"></div>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`download`)}エクスポート(バックアップ)</h3>
        <p class="view-desc">現在の学習データを1つのJSONファイルとしてダウンロードします。</p>
        <button type="button" class="btn" data-role="export">${UI.icon(`download`)}学習データをエクスポート</button>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`upload`)}インポート(復元・移行)</h3>
        <p class="view-desc">エクスポートしたJSONファイルを選択すると、現在のデータを上書きして復元します。</p>
        <input type="file" accept="application/json" data-role="import-file" class="settings-file-input">
        <p class="settings-import-status" data-role="import-status" hidden></p>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">テーマ</h3>
        <p class="view-desc">配色を手動で切り替えられます(既定は端末の設定に追従します)。</p>
        <div class="chip-row" data-role="theme-chips"></div>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">読み上げ</h3>
        <p class="view-desc">用語カードの読み上げ速度を調整できます。</p>
        <label class="settings-range-label">
          速度: <span data-role="rate-value">1.0</span>倍
          <input type="range" min="0.6" max="1.4" step="0.1" data-role="rate-input" class="settings-range">
        </label>
      </div>
    `;
    root.appendChild(wrap);

    // 目標の試験
    const targetList = wrap.querySelector(`[data-role="target-list"]`);
    function renderTargets() {
      const targets = Stats.listTargets().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!targets.length) {
        targetList.innerHTML = `<p class="calc-note" style="margin:0;">まだ登録されていません。</p>`;
        return;
      }
      const today = DateUtil.today();
      targetList.innerHTML = targets.map((t) => {
        const d = DateUtil.diffDays(today, t.date);
        const type = Stats.examType(t.examTypeId);
        return `
          <div class="target-row">
            <button type="button" class="btn btn-icon known-toggle${t.primary ? ` is-known` : ``}" data-primary="${t.id}" aria-pressed="${!!t.primary}" aria-label="${t.primary ? `ホームに表示中` : `ホームに表示する`}">${UI.icon(t.primary ? `star-fill` : `star`)}</button>
            <div class="target-row-main">
              <div class="target-row-name">${UI.escapeHtml(t.name)}<span class="source-tag">${UI.escapeHtml(type ? type.shortName : `その他`)}</span></div>
              <div class="target-row-date">${DateUtil.toJapanese(t.date, true)}・${d > 0 ? `あと${d}日` : d === 0 ? `今日` : `終了`}</div>
            </div>
            <button type="button" class="btn btn-icon" data-remove="${t.id}" aria-label="「${UI.escapeHtml(t.name)}」を削除">${UI.icon(`trash`)}</button>
          </div>`;
      }).join(``);
      targetList.querySelectorAll(`[data-primary]`).forEach((b) => b.addEventListener(`click`, () => {
        Stats.setPrimary(b.dataset.primary);
        renderTargets();
      }));
      targetList.querySelectorAll(`[data-remove]`).forEach((b) => b.addEventListener(`click`, async () => {
        const ok = await UI.confirm(`この試験目標を削除しますか?`, { confirmLabel: `削除する`, danger: true });
        if (!ok) return;
        Stats.removeTarget(b.dataset.remove);
        renderTargets();
      }));
    }
    renderTargets();
    wrap.querySelector(`[data-role="add-target"]`).addEventListener(`click`, () => Views.home.openTargetForm(renderTargets));

    // 1日の新規用語数
    const limitRow = wrap.querySelector(`[data-role="new-limit-chips"]`);
    const defaultLimit = (Views.review && Views.review.DEFAULT_NEW_LIMIT) || 10;
    const currentLimit = Number(Storage.get(`reviewNewLimit`, defaultLimit));
    [0, 5, 10, 20, 30].forEach((n) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (n === currentLimit ? ` active` : ``);
      chip.setAttribute(`aria-pressed`, String(n === currentLimit));
      chip.textContent = n === 0 ? `出さない` : `${n}語${n === defaultLimit ? `(標準)` : ``}`;
      chip.addEventListener(`click`, () => {
        Storage.set(`reviewNewLimit`, n);
        limitRow.querySelectorAll(`.chip`).forEach((c) => {
          c.classList.toggle(`active`, c === chip);
          c.setAttribute(`aria-pressed`, String(c === chip));
        });
        if (window.Nav) Nav.refreshBadge();
      });
      limitRow.appendChild(chip);
    });

    wrap.querySelector(`[data-role="export"]`).addEventListener(`click`, () => {
      const data = collectAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: `application/json` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement(`a`);
      const today = DateUtil.today();
      a.href = url;
      a.download = `shojiki-fudousan-gakushu-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      UI.toast(`バックアップをダウンロードしました`, `success`);
    });

    const importInput = wrap.querySelector(`[data-role="import-file"]`);
    const importStatus = wrap.querySelector(`[data-role="import-status"]`);
    importInput.addEventListener(`change`, async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== `object` || Array.isArray(parsed)) throw new Error(`invalid`);
          const keys = Object.keys(parsed);
          if (!keys.length) throw new Error(`empty`);
          const ok = await UI.confirm(`${keys.length}件のデータ(${keys.join(`, `)})で現在のデータを上書きします。よろしいですか?`, { confirmLabel: `上書きする`, danger: true });
          if (!ok) { importInput.value = ``; return; }
          keys.forEach((k) => Storage.set(k, parsed[k]));
          importStatus.hidden = false;
          importStatus.textContent = `インポートが完了しました。再読み込みすると反映されます。`;
          importStatus.className = `settings-import-status settings-import-ok`;
          UI.toast(`インポートが完了しました`, `success`, { action: { label: `再読み込み`, onClick: () => location.reload() }, duration: 8000 });
        } catch (err) {
          importStatus.hidden = false;
          importStatus.textContent = `インポートに失敗しました。正しいバックアップファイルか確認してください。`;
          importStatus.className = `settings-import-status settings-import-ng`;
          UI.toast(`インポートに失敗しました`, `error`);
        }
        importInput.value = ``;
      };
      reader.readAsText(file);
    });

    // テーマ切替
    const themeChipRow = wrap.querySelector(`[data-role="theme-chips"]`);
    const themeOptions = [{ id: `system`, label: `端末設定に従う` }, { id: `light`, label: `ライト` }, { id: `dark`, label: `ダーク` }];
    const currentTheme = ThemeManager.getPreference();
    themeOptions.forEach((opt) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (opt.id === currentTheme ? ` active` : ``);
      chip.setAttribute(`aria-pressed`, String(opt.id === currentTheme));
      chip.textContent = opt.label;
      chip.addEventListener(`click`, () => {
        ThemeManager.setPreference(opt.id);
        themeChipRow.querySelectorAll(`.chip`).forEach((c) => {
          c.classList.toggle(`active`, c === chip);
          c.setAttribute(`aria-pressed`, String(c === chip));
        });
      });
      themeChipRow.appendChild(chip);
    });

    // 読み上げ速度
    const rateInput = wrap.querySelector(`[data-role="rate-input"]`);
    const rateValue = wrap.querySelector(`[data-role="rate-value"]`);
    const currentRate = Storage.get(`ttsRate`, 0.95);
    rateInput.value = currentRate;
    rateValue.textContent = Number(currentRate).toFixed(1);
    rateInput.addEventListener(`input`, (e) => {
      const v = Number(e.target.value);
      rateValue.textContent = v.toFixed(1);
      Storage.set(`ttsRate`, v);
    });
  }

  return { render };
})();
