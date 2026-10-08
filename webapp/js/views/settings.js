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
      <h2>設定・データ管理</h2>
      <p class="view-desc">学習の進捗(記憶済み用語・視聴チェック・クイズ履歴・復習スケジュール等)はこの端末のブラウザにのみ保存されています。別の端末に移したり、バックアップを取っておきたい場合はここからJSONファイルとして書き出し・読み込みができます。</p>

      <div class="card settings-card">
        <h3 class="settings-card-title">エクスポート(バックアップ)</h3>
        <p class="view-desc">現在の学習データを1つのJSONファイルとしてダウンロードします。</p>
        <button type="button" class="btn" data-role="export">学習データをエクスポート</button>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">インポート(復元・移行)</h3>
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

    wrap.querySelector(`[data-role="export"]`).addEventListener(`click`, () => {
      const data = collectAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: `application/json` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement(`a`);
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `shojiki-fudousan-gakushu-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    const importInput = wrap.querySelector(`[data-role="import-file"]`);
    const importStatus = wrap.querySelector(`[data-role="import-status"]`);
    importInput.addEventListener(`change`, (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const keys = Object.keys(parsed);
          if (!keys.length) throw new Error(`empty`);
          const ok = window.confirm(`${keys.length}件のデータ(${keys.join(`, `)})で現在のデータを上書きします。よろしいですか?`);
          if (!ok) { importInput.value = ``; return; }
          keys.forEach((k) => Storage.set(k, parsed[k]));
          importStatus.hidden = false;
          importStatus.textContent = `インポートが完了しました。ページを再読み込みすると反映されます。`;
          importStatus.className = `settings-import-status settings-import-ok`;
        } catch (err) {
          importStatus.hidden = false;
          importStatus.textContent = `インポートに失敗しました。正しいバックアップファイルか確認してください。`;
          importStatus.className = `settings-import-status settings-import-ng`;
        }
        importInput.value = ``;
      };
      reader.readAsText(file);
    });

    // テーマ切替
    const themeChipRow = wrap.querySelector(`[data-role="theme-chips"]`);
    const themeOptions = [{ id: `system`, label: `端末設定に従う` }, { id: `light`, label: `ライト` }, { id: `dark`, label: `ダーク` }];
    const currentTheme = Storage.get(`themePreference`, `system`);
    themeOptions.forEach((opt) => {
      const chip = document.createElement(`button`);
      chip.type = `button`;
      chip.className = `chip` + (opt.id === currentTheme ? ` active` : ``);
      chip.textContent = opt.label;
      chip.addEventListener(`click`, () => {
        window.ThemeManager.setPreference(opt.id);
        themeChipRow.querySelectorAll(`.chip`).forEach((c) => c.classList.toggle(`active`, c.textContent === opt.label));
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
