// 設定ビュー: 目標の試験・今日の復習・テーマ・読み上げ・学習データのエクスポート/インポート(バックアップ・端末間の手動移行)
// #settings/backup・#settings/limit で該当のカードへ移動する(ホームのお知らせから使う)
window.Views = window.Views || {};
window.Views.settings = (function () {
  const PREFIX = `shojikiLearn.v1.`;
  const DAY_MS = 86400000;

  // このアプリが使う保存キー(これ以外のキーは読み込まない。別のJSONを選んでも学習データが消えないように)
  const KNOWN_KEYS = new Set([`activityLog`, `autoQuizStats`, `backupNoteDismissedAt`, `basicsProgress`, `bookmarks`, `calcInputs`, `examHistory`, `examRetryResult`, `examSession`, `examTargets`, `flashcards`, `lastBackupAt`, `lastTopic`, `onboardingDone`, `oxPrefs`, `oxStats`, `quizHistory`, `quizPrefs`, `reviewNewLimit`, `reviewNewToday`, `roadmap`, `seenWhatsNew`, `srsCards`, `srsMigrated`, `themePreference`, `ttsRate`]);
  const esc = (s) => UI.escapeHtml(s);

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

  // 「最終バックアップ: 10/1(10日前)」
  function backupStatusText() {
    const ts = Storage.get(`lastBackupAt`, 0);
    if (typeof ts !== `number` || !Number.isFinite(ts) || ts <= 0 || ts > 8.64e15) return `まだバックアップしていません`;
    const d = new Date(ts);
    const now = new Date();
    const ago = DateUtil.diffDays(DateUtil.format(d), DateUtil.format(now));
    const md = `${d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}/` : ``}${d.getMonth() + 1}/${d.getDate()}`;
    return `最終バックアップ: ${md}(${ago <= 0 ? `今日` : `${ago}日前`})`;
  }

  // 読み上げ速度の表示(0.95 → 0.95、1 → 1.0)
  function rateLabel(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return `1.0`;
    const s = n.toFixed(2);
    return s.endsWith(`0`) ? s.slice(0, -1) : s;
  }

  // ボタンの組(.segmented)。押下状態は aria-pressed で表す
  function segmentedHtml(label, items) {
    return `<div class="segmented settings-seg" role="group" aria-label="${esc(label)}">${items.map((it) => `
      <button type="button" class="segmented-item" data-value="${esc(it.value)}" aria-pressed="${it.pressed ? `true` : `false`}">${it.html}</button>`).join(``)}</div>`;
  }

  function paintSegmented(group, value) {
    group.querySelectorAll(`.segmented-item`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.value === String(value))));
  }

  function render(root, param) {
    const ttsSupported = !!(window.TTS && TTS.supported);
    const wrap = document.createElement(`div`);
    wrap.className = `view settings-view`;
    wrap.innerHTML = `
      <h2>設定</h2>
      <p class="view-desc">学習の記録(記憶済みの用語・クイズの履歴・復習の予定など)は、この端末のブラウザの中にだけ保存されています。Safariで長期間開かないと記録が消えることがあります。ホーム画面に追加するか、定期的にバックアップを取ってください。</p>

      <div class="card settings-card" data-role="targets-card">
        <h3 class="settings-card-title">${UI.icon(`target`)}目標の試験</h3>
        <p class="view-desc">登録した試験日までの残り日数と1日あたりの学習量の目安がホームに表示されます。★を付けた試験がホームに大きく表示されます(終了した試験は、次の試験に切り替わります)。試験名をタップすると編集できます。</p>
        <div class="target-list" data-role="target-list"></div>
        <button type="button" class="btn" data-role="add-target">${UI.icon(`calendar`)}試験日を登録</button>
      </div>

      <div class="card settings-card" data-role="limit-card">
        <h3 class="settings-card-title">${UI.icon(`repeat`)}今日の復習</h3>
        <p class="view-desc">「今日の復習」で1日に出す新しい用語の数です。期限が来た復習はこの数に関係なくすべて出題されます。</p>
        <div data-role="new-limit"></div>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`moon`)}テーマ</h3>
        <p class="view-desc">配色を手動で切り替えられます(既定は端末の設定に追従します)。</p>
        <div data-role="theme"></div>
      </div>

      ${ttsSupported ? `
      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`volume`)}読み上げ</h3>
        <p class="view-desc">用語カードの読み上げ速度を調整できます。</p>
        <label class="settings-range-label">
          <span>速度: <span data-role="rate-value">1.0</span>倍</span>
          <input type="range" min="${TTS.MIN_RATE || 0.6}" max="${TTS.MAX_RATE || 1.4}" step="0.05" data-role="rate-input" class="settings-range">
        </label>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary" data-role="rate-test">${UI.icon(`play`)}試しに聞く</button>
        </div>
      </div>` : ``}

      <div class="card settings-card" data-role="backup-card">
        <h3 class="settings-card-title">${UI.icon(`download`)}エクスポート(バックアップ)</h3>
        <p class="view-desc">現在の学習データを1つのJSONファイルとしてダウンロードします。別の端末への移行や、記録が消えたときの復元に使えます。</p>
        <p class="settings-backup-status" data-role="backup-status">${esc(backupStatusText())}</p>
        <button type="button" class="btn" data-role="export">${UI.icon(`download`)}学習データをエクスポート</button>
      </div>

      <div class="card settings-card">
        <h3 class="settings-card-title">${UI.icon(`upload`)}インポート(復元・移行)</h3>
        <p class="view-desc">エクスポートしたJSONファイルを選択すると、現在のデータを上書きして復元します。読み込んだあとは自動で再読み込みします。</p>
        <input type="file" accept="application/json,.json" data-role="import-file" id="settings-import-file" class="settings-file-input sr-only">
        <label for="settings-import-file" class="btn btn-secondary settings-file-label">${UI.icon(`upload`)}バックアップ(JSON)を選択</label>
        <div class="settings-import-status" data-role="import-status" hidden></div>
      </div>
    `;
    root.appendChild(wrap);

    // ---- 目標の試験 ----
    const targetList = wrap.querySelector(`[data-role="target-list"]`);
    const addBtn = wrap.querySelector(`[data-role="add-target"]`);
    function renderTargets(focusSel) {
      const targets = Stats.listTargets().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!targets.length) {
        targetList.innerHTML = `<p class="calc-note target-empty">まだ登録されていません。</p>`;
      } else {
        const today = DateUtil.today();
        const shown = Stats.primaryTarget();
        const flagged = targets.find((t) => t.primary) || null;
        targetList.innerHTML = targets.map((t) => {
          const d = DateUtil.diffDays(today, t.date);
          const type = Stats.examType(t.examTypeId);
          const onHome = !!(shown && shown.id === t.id);
          const starLabel = t.primary ? (onHome ? `ホームに表示中` : `ホームに表示に指定(終了したため、ホームには次の試験を表示中)`) : `ホームに表示する`;
          return `
            <div class="target-row${onHome ? ` is-home` : ``}">
              <button type="button" class="btn btn-icon known-toggle${t.primary ? ` is-known` : ``}" data-primary="${esc(t.id)}" aria-pressed="${!!t.primary}" aria-label="${esc(`${t.name}: ${starLabel}`)}">${UI.icon(t.primary ? `star-fill` : `star`)}</button>
              <button type="button" class="target-row-main target-row-edit" data-edit="${esc(t.id)}" aria-label="${esc(`「${t.name}」を編集`)}">
                <span class="target-row-name">${esc(t.name)}<span class="source-tag">${esc(type ? type.shortName : `その他`)}</span>${onHome ? `<span class="source-tag target-home-tag">ホームに表示中</span>` : ``}</span>
                <span class="target-row-date">${DateUtil.toJapanese(t.date, true)}・<span class="nowrap">${d > 0 ? `あと${d}日` : d === 0 ? `今日` : `終了`}</span></span>
                <span class="target-row-hint" aria-hidden="true">${UI.icon(`chevron-right`, { size: 18 })}</span>
              </button>
              <button type="button" class="btn btn-icon" data-remove="${esc(t.id)}" aria-label="${esc(`「${t.name}」を削除`)}">${UI.icon(`trash`)}</button>
            </div>`;
        }).join(``) + (flagged && shown && flagged.id !== shown.id
          ? `<p class="calc-note target-empty">★の「${esc(flagged.name)}」は終了したため、ホームには次の「${esc(shown.name)}」を表示しています。</p>`
          : ``);
      }
      if (focusSel) {
        const el = focusSel === `add` ? addBtn : targetList.querySelector(focusSel);
        if (el) el.focus({ preventScroll: true });
      }
    }
    // 行は作り直すため、操作した行のボタンにフォーカスを戻す(イベントは一覧にまとめて付ける)
    targetList.addEventListener(`click`, async (e) => {
      const star = e.target.closest(`[data-primary]`);
      const edit = e.target.closest(`[data-edit]`);
      const del = e.target.closest(`[data-remove]`);
      if (star) {
        const id = star.dataset.primary;
        Stats.setPrimary(id);
        renderTargets(`[data-primary="${CSS.escape(id)}"]`);
      } else if (edit) {
        const id = edit.dataset.edit;
        const t = Stats.listTargets().find((x) => x.id === id);
        if (t) Views.home.openTargetForm(() => renderTargets(`[data-edit="${CSS.escape(id)}"]`), t);
      } else if (del) {
        const ok = await UI.confirm(`この試験目標を削除しますか?`, { confirmLabel: `削除する`, danger: true });
        if (!ok || !wrap.isConnected) return;
        Stats.removeTarget(del.dataset.remove);
        renderTargets(`add`);
      }
    });
    renderTargets();
    addBtn.addEventListener(`click`, () => Views.home.openTargetForm(() => renderTargets()));

    // ---- 1日の新規用語数 ----
    const limitBox = wrap.querySelector(`[data-role="new-limit"]`);
    const defaultLimit = (Views.review && Views.review.DEFAULT_NEW_LIMIT) || 10;
    const currentLimit = Stats.newLimit ? Stats.newLimit() : defaultLimit;
    const presets = [0, 5, 10, 20, 30];
    const limitItems = presets.map((n) => ({
      value: n,
      pressed: n === currentLimit,
      html: n === 0 ? `出さない` : `${n}語${n === defaultLimit ? `<span class="segmented-count">標準</span>` : ``}`,
    }));
    // 読み込んだバックアップなどで選択肢にない値(15語など)のときも、今の設定が分かるように
    if (!presets.includes(currentLimit)) limitItems.push({ value: currentLimit, pressed: true, html: `${currentLimit}語<span class="segmented-count">現在</span>`, custom: true });
    limitBox.innerHTML = segmentedHtml(`1日の新しい用語の数`, limitItems);
    const limitGroup = limitBox.querySelector(`.segmented`);
    limitGroup.classList.add(`settings-limit-seg`);
    limitGroup.addEventListener(`click`, (e) => {
      const b = e.target.closest(`.segmented-item`);
      if (!b) return;
      const n = Number(b.dataset.value);
      Storage.set(`reviewNewLimit`, n);
      // 選択肢にない値を選び直したら、その「現在」ボタンは外す(押したボタン以外なのでフォーカスは動かない)
      if (!presets.includes(n)) return paintSegmented(limitGroup, n);
      limitGroup.querySelectorAll(`.segmented-item`).forEach((x) => { if (!presets.includes(Number(x.dataset.value))) x.remove(); });
      paintSegmented(limitGroup, n);
      if (window.Nav) Nav.refreshBadge();
    });

    // ---- テーマ ----
    const themeBox = wrap.querySelector(`[data-role="theme"]`);
    const themeOptions = [{ id: `system`, label: `端末に合わせる` }, { id: `light`, label: `ライト` }, { id: `dark`, label: `ダーク` }];
    themeBox.innerHTML = segmentedHtml(`テーマ`, themeOptions.map((o) => ({ value: o.id, pressed: o.id === ThemeManager.getPreference(), html: o.label })));
    const themeGroup = themeBox.querySelector(`.segmented`);
    themeGroup.addEventListener(`click`, (e) => {
      const b = e.target.closest(`.segmented-item`);
      if (!b) return;
      ThemeManager.setPreference(b.dataset.value);
      paintSegmented(themeGroup, ThemeManager.getPreference());
    });
    // ヘッダーの切替ボタンで変えたときも押下状態を合わせる
    const offTheme = ThemeManager.onChange(() => {
      if (!wrap.isConnected) { if (offTheme) offTheme(); return; }
      paintSegmented(themeGroup, ThemeManager.getPreference());
    });

    // ---- 読み上げ速度 ----
    if (ttsSupported) {
      const rateInput = wrap.querySelector(`[data-role="rate-input"]`);
      const rateValue = wrap.querySelector(`[data-role="rate-value"]`);
      rateInput.value = String(TTS.getRate ? TTS.getRate() : 1);
      // スライダーは刻みに丸められるため、表示は丸めたあとの値から作る
      rateValue.textContent = rateLabel(rateInput.value);
      rateInput.addEventListener(`input`, () => {
        const v = Number(rateInput.value);
        rateValue.textContent = rateLabel(v);
        Storage.set(`ttsRate`, v);
      });
      wrap.querySelector(`[data-role="rate-test"]`).addEventListener(`click`, () => {
        TTS.speak(`この速さで読み上げます。用語カードの説明も同じ速さになります。`);
      });
    }

    // ---- エクスポート ----
    const backupStatus = wrap.querySelector(`[data-role="backup-status"]`);
    wrap.querySelector(`[data-role="export"]`).addEventListener(`click`, () => {
      // バックアップした日時もファイルに含める(読み込んだ端末でも「最終バックアップ」が正しく出るように)
      Storage.set(`lastBackupAt`, Date.now());
      // __app: このアプリのバックアップであることの目印(読み込み時は無視する)
      const data = Object.assign({ __app: { name: `shojiki-fudousan-gakushu`, exportedAt: new Date().toISOString() } }, collectAllData());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: `application/json` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement(`a`);
      const today = DateUtil.today();
      a.href = url;
      a.download = `shojiki-fudousan-gakushu-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // iPhoneのSafariではすぐに解放するとダウンロードが失敗することがあるため、少し待ってから解放する
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      backupStatus.textContent = backupStatusText();
      UI.toast(`バックアップをダウンロードしました`, `success`);
    });

    // ---- インポート ----
    const importInput = wrap.querySelector(`[data-role="import-file"]`);
    const importStatus = wrap.querySelector(`[data-role="import-status"]`);
    function showImportStatus(ok, text) {
      importStatus.hidden = false;
      importStatus.className = `settings-import-status ${ok ? `settings-import-ok` : `settings-import-ng`}`;
      importStatus.textContent = text;
    }
    importInput.addEventListener(`change`, (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== `object` || Array.isArray(parsed)) throw new Error(`invalid`);
          const keys = Object.keys(parsed).filter((k) => KNOWN_KEYS.has(k));
          // このアプリのバックアップでなければ何も変更しない
          if (!keys.length) throw new Error(`notbackup`);
          const skipped = Object.keys(parsed).length - keys.length - (parsed.__app ? 1 : 0);
          const ok = await UI.confirm(`バックアップの${keys.length}項目で、現在の学習データを置き換えます。現在のデータは消えます。よろしいですか?${skipped > 0 ? `(このアプリのものではない${skipped}項目は読み込みません)` : ``}`, { confirmLabel: `置き換える`, danger: true });
          if (!ok) { importInput.value = ``; return; }
          // 失敗したら元に戻せるよう、現在のデータを控えてから置き換える(テーマ設定は残す)
          const before = collectAllData();
          Object.keys(localStorage)
            .filter((k) => k.startsWith(PREFIX) && k !== `${PREFIX}themePreference` && !keys.includes(k.slice(PREFIX.length)))
            .forEach((k) => localStorage.removeItem(k));
          const failed = keys.filter((k) => !Storage.set(k, parsed[k]));
          if (failed.length) {
            Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
            Object.keys(before).forEach((k) => Storage.set(k, before[k]));
            throw new Error(`write`);
          }
          // 画面・集計・検索の索引をすべて読み込んだデータで作り直すため、自動で再読み込みする
          showImportStatus(true, `インポートが完了しました。再読み込みしています…`);
          const reloadBtn = document.createElement(`button`);
          reloadBtn.type = `button`;
          reloadBtn.className = `btn btn-sm`;
          reloadBtn.textContent = `今すぐ再読み込み`;
          reloadBtn.addEventListener(`click`, () => location.reload());
          importStatus.appendChild(reloadBtn);
          try { sessionStorage.setItem(`importDone`, `1`); } catch (err) { /* 通知が出ないだけ */ }
          importInput.value = ``;
          setTimeout(() => location.reload(), 900);
        } catch (err) {
          showImportStatus(false, err && err.message === `notbackup`
            ? `このアプリのバックアップファイルではないため、読み込みませんでした(データは変更していません)。`
            : err && err.message === `write`
              ? `保存に失敗したため、元のデータに戻しました。端末の空き容量を確認してください。`
              : `インポートに失敗しました。正しいバックアップファイルか確認してください。`);
          UI.toast(`インポートに失敗しました`, `error`);
          importInput.value = ``;
        }
      };
      reader.readAsText(file);
    });

    // ---- ホームのお知らせなどから: 該当のカードへ ----
    const jump = param === `backup` ? `[data-role="backup-card"]` : param === `limit` ? `[data-role="limit-card"]` : param === `targets` ? `[data-role="targets-card"]` : null;
    const jumpEl = jump ? wrap.querySelector(jump) : null;
    if (jumpEl) {
      requestAnimationFrame(() => {
        jumpEl.scrollIntoView({ block: `start`, behavior: `auto` });
        jumpEl.classList.add(`highlighted`);
        setTimeout(() => jumpEl.classList.remove(`highlighted`), 2400);
      });
    }
  }

  return { render };
})();
