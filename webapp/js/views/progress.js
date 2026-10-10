// 学習の進捗: 全体の数値・試験分野別・記憶の定着度・学習カレンダー・模擬試験の推移・トピック別・苦手
window.Views = window.Views || {};
window.Views.progress = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);
  const WEEKS = 12;
  const GUIDE_PCT = 70;

  // 画面内で選んだ試験(再描画しても保持)
  let selectedType = null;

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  // ---- 試験の切替 ----
  function examTypeOptions() {
    const ids = [];
    Stats.listTargets().forEach((t) => {
      if (Stats.examType(t.examTypeId) && !ids.includes(t.examTypeId)) ids.push(t.examTypeId);
    });
    if (!ids.includes(`takken`) && Stats.examType(`takken`)) ids.push(`takken`);
    return ids.map((id) => Stats.examType(id));
  }

  function defaultType(options) {
    const ids = options.map((t) => t.id);
    if (selectedType && ids.includes(selectedType)) return selectedType;
    const p = Stats.primaryTarget();
    if (p && ids.includes(p.examTypeId)) return p.examTypeId;
    return ids[0] || `takken`;
  }

  function summaryCard() {
    const card = document.createElement(`section`);
    card.className = `prog-summary span-all`;
    card.setAttribute(`aria-label`, `学習のまとめ`);
    const ov = Stats.overall();
    const known = obj(`flashcards`);
    const knownCount = AppIndex.allTerms.filter((t) => known[t.id]).length;
    const current = Streak.getCurrentStreak();
    const longest = Streak.getLongestStreak();
    const due = Stats.dueReviewCount();
    card.innerHTML = `
      <div class="stat-grid prog-stat-grid">
        <div class="stat-tile prog-tile-main">
          <span class="stat-label">${ic(`check-circle`, 16)}全体の学習済み</span>
          <span class="stat-value">${ov.pct}<small>%</small></span>
          <div class="progress-bar"><div class="progress-bar-fill" style="width:${ov.pct}%"></div></div>
          <span class="stat-label num">${ov.done} / ${ov.total} 項目</span>
        </div>
        <div class="stat-tile">
          <span class="stat-label">${ic(`star`, 16)}記憶済みの用語</span>
          <span class="stat-value">${knownCount}<small>語</small></span>
        </div>
        <div class="stat-tile">
          <span class="stat-label">${ic(`flame`, 16)}連続学習</span>
          <span class="stat-value">${current}<small>日</small></span>
          <span class="stat-label">最長 ${longest}日</span>
        </div>
        <div class="stat-tile">
          <span class="stat-label">${ic(`calendar`, 16)}学習した日</span>
          <span class="stat-value">${Streak.totalActiveDays()}<small>日</small></span>
        </div>
        <a class="stat-tile prog-tile-link" href="#review">
          <span class="stat-label">${ic(`repeat`, 16)}今日の復習</span>
          <span class="stat-value">${due}<small>件</small></span>
          <span class="stat-label">${due ? `復習する` : `今日はなし`}${ic(`chevron-right`, 14)}</span>
        </a>
      </div>`;
    return card;
  }

  function categoryCard() {
    const card = document.createElement(`section`);
    card.className = `card span-all`;
    const options = examTypeOptions();
    let typeId = defaultType(options);
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">試験分野別の進捗</h3>
      </div>
      ${options.length > 1 ? `
        <div class="segmented prog-segmented" role="group" aria-label="試験の種類" data-role="types">
          ${options.map((t) => `<button type="button" class="segmented-item" data-type="${t.id}" aria-pressed="${t.id === typeId}">${esc(t.shortName || t.name)}</button>`).join(``)}
        </div>` : ``}
      <div data-role="cat-body"></div>`;
    const body = card.querySelector(`[data-role="cat-body"]`);

    function paint() {
      const type = Stats.examType(typeId);
      if (!type) { body.innerHTML = ``; return; }
      if (!Array.isArray(type.categories)) {
        const ov = Stats.overall();
        body.innerHTML = `
          <p class="calc-note prog-note">${esc(type.name)}には分野の区分がないため、サイト全体の用語・基礎知識の進捗を表示しています。</p>
          <div class="cat-bars">
            <div>
              <div class="cat-bar-head"><span class="cat-bar-name">全体</span><span class="cat-bar-meta">${ov.done}/${ov.total}・${ov.pct}%</span></div>
              <div class="progress-bar progress-bar-lg"><div class="progress-bar-fill" style="width:${ov.pct}%"></div></div>
            </div>
          </div>`;
        return;
      }
      const rows = Stats.byCategory(typeId, { compact: false });
      body.innerHTML = `
        <p class="calc-note prog-note">${esc(type.shortName || type.name)}の出題分野ごとに、学習済み・記憶済みにした項目の割合です。正答率はクイズ・模擬試験の結果から計算しています。</p>
        <div class="cat-bars">
          ${rows.map((r) => `
            <div>
              <div class="cat-bar-head">
                <span class="cat-bar-name">${esc(r.name)}${r.questions ? `<span class="topic-group-meta">(例年${r.questions}問)</span>` : ``}</span>
                <span class="cat-bar-meta">${r.done}/${r.total}・<strong>${r.pct}%</strong></span>
              </div>
              <div class="progress-bar progress-bar-lg"><div class="progress-bar-fill" style="width:${r.pct}%"></div></div>
              <div class="prog-cat-acc">${r.accuracy != null
                ? `${ic(`pencil-check`, 14)}正答率 <strong>${r.accuracy}%</strong><span class="text-muted">(${r.quizCorrect}/${r.quizAttempted}問)</span>`
                : `<span class="text-muted">${ic(`pencil-check`, 14)}まだ解いた問題がありません</span>`}</div>
            </div>`).join(``)}
        </div>`;
    }

    card.querySelectorAll(`[data-type]`).forEach((btn) => {
      btn.addEventListener(`click`, () => {
        typeId = btn.dataset.type;
        selectedType = typeId;
        card.querySelectorAll(`[data-type]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b === btn)));
        paint();
      });
    });
    paint();
    return card;
  }

  // ---- 記憶の定着度 ----
  const SRS_PARTS = [
    { key: `new`, label: `新規`, desc: `まだ復習カードで学習していない用語` },
    { key: `learning`, label: `学習中`, desc: `復習の間隔が7日未満。まだ忘れやすい段階` },
    { key: `young`, label: `定着しはじめ`, desc: `間隔が7〜20日。覚えはじめている段階` },
    { key: `mature`, label: `定着`, desc: `間隔が21日以上。長く覚えていられる段階` },
  ];

  function srsCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const b = Stats.srsBuckets();
    const total = SRS_PARTS.reduce((s, p) => s + (b[p.key] || 0), 0) || 1;
    card.innerHTML = `
      <h3 class="card-title">記憶の定着度</h3>
      <p class="calc-note prog-note">「今日の復習」で答えた結果から、次に復習するまでの間隔が長い用語ほど定着しています。</p>
      <div class="srs-bar" role="img" aria-label="${SRS_PARTS.map((p) => `${p.label}${b[p.key] || 0}語`).join(`、`)}">
        ${SRS_PARTS.map((p) => (b[p.key] ? `<span class="srs-seg srs-${p.key}" style="flex-grow:${b[p.key]}" title="${p.label}: ${b[p.key]}語"></span>` : ``)).join(``)}
      </div>
      <ul class="srs-legend">
        ${SRS_PARTS.map((p) => `
          <li>
            <span class="srs-swatch srs-${p.key}" aria-hidden="true"></span>
            <span class="srs-legend-main"><span class="srs-legend-name">${p.label}</span><span class="srs-legend-desc">${p.desc}</span></span>
            <span class="srs-legend-count num"><strong>${b[p.key] || 0}</strong>語<small>${Math.round(((b[p.key] || 0) / total) * 100)}%</small></span>
          </li>`).join(``)}
      </ul>`;
    return card;
  }

  // ---- 学習カレンダー(直近12週・日曜はじまり) ----
  function heatmapCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const today = DateUtil.today();
    const wd = DateUtil.parse(today).getDay();
    // 最終列に今日が入るよう、11週前の日曜から今日までを取る
    const days = Stats.heatmap((WEEKS - 1) * 7 + wd + 1);
    const active = days.filter((d) => d.count > 0).length;
    const total = days.reduce((s, d) => s + d.count, 0);

    const monthCells = [];
    let lastLabelCol = -3;
    for (let c = 0; c < WEEKS; c++) {
      const first = days[c * 7];
      let label = ``;
      if (first) {
        const d = DateUtil.parse(first.date);
        // その週に1日が含まれる列(先頭列は常に)に月を表示
        const weekDates = days.slice(c * 7, c * 7 + 7).map((x) => DateUtil.parse(x.date));
        const hasFirst = weekDates.some((x) => x.getDate() === 1);
        if ((c === 0 || hasFirst) && c - lastLabelCol >= 3) {
          const m = hasFirst ? weekDates.find((x) => x.getDate() === 1).getMonth() + 1 : d.getMonth() + 1;
          label = `${m}月`;
          lastLabelCol = c;
        }
      }
      monthCells.push(`<span class="heat-month">${label}</span>`);
    }

    const WD = [`日`, `月`, `火`, `水`, `木`, `金`, `土`];
    const rows = [];
    for (let r = 0; r < 7; r++) {
      rows.push(`<span class="heat-wd">${r % 2 === 1 ? WD[r] : ``}</span>`);
      for (let c = 0; c < WEEKS; c++) {
        const d = days[c * 7 + r];
        if (!d) { rows.push(`<span class="heat-cell is-future" aria-hidden="true"></span>`); continue; }
        rows.push(`<span class="streak-day heat-cell${d.date === today ? ` today` : ``}" data-level="${d.level}" role="img" aria-label="${DateUtil.toJapanese(d.date, true)}: ${d.count ? `${d.count}回` : `記録なし`}" title="${DateUtil.toJapanese(d.date, true)}: ${d.count ? `${d.count}回` : `記録なし`}"></span>`);
      }
    }

    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">学習カレンダー</h3>
        <span class="streak-chip">${ic(`flame`, 16)}${Streak.getCurrentStreak()}日連続</span>
      </div>
      <p class="calc-note prog-note">${active
        ? `直近${WEEKS}週間で${active}日・合計${total}回学習しました。`
        : `まだ学習の記録がありません。カードやクイズで学習すると、その日のマスに色が付きます。`}マスにカーソルを合わせる(またはタップする)と日付と回数が出ます。</p>
      <div class="heat-wrap">
        <div class="heat-grid" role="img" aria-label="直近${WEEKS}週間の学習記録。学習した日は${active}日です。">
          <span class="heat-month"></span>${monthCells.join(``)}
          ${rows.join(``)}
        </div>
        <div class="heat-legend" aria-hidden="true">
          <span>少ない</span>
          ${[0, 1, 2, 3, 4].map((l) => `<span class="streak-day heat-cell" data-level="${l}"></span>`).join(``)}
          <span>多い</span>
        </div>
      </div>`;
    return card;
  }

  // ---- 模擬試験の推移 ----
  function pad2(n) {
    return String(n).padStart(2, `0`);
  }

  function entryDate(e) {
    if (typeof e.date === `string` && DateUtil.isValid(e.date)) return e.date;
    const ts = [e.finishedAt, e.at, e.endedAt, e.startedAt].find((v) => typeof v === `number` && v > 0);
    if (!ts) return null;
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function entryTime(e, i, len) {
    const ts = [e.finishedAt, e.at, e.endedAt, e.startedAt].find((v) => typeof v === `number` && v > 0);
    if (ts) return ts;
    const d = entryDate(e);
    if (d) return DateUtil.parse(d).getTime();
    return len - i; // 日時がなければ「新しい順に保存されている」とみなす
  }

  function examPoints() {
    const list = Stats.examHistory()
      .map((e, i, all) => ({ e, i, len: all.length }))
      .filter(({ e }) => e && typeof e.score === `number` && typeof e.total === `number` && e.total > 0);
    return list
      .map(({ e, i, len }) => ({ e, t: entryTime(e, i, len), date: entryDate(e), pct: Math.max(0, Math.min(100, Math.round((e.score / e.total) * 100))) }))
      .sort((a, b) => a.t - b.t)
      .slice(-10);
  }

  function chartSvg(points) {
    const W = 340;
    const H = 190;
    const L = 34;
    const R = 14;
    const T = 14;
    const B = 30;
    const iw = W - L - R;
    const ih = H - T - B;
    const x = (i) => (points.length === 1 ? L + iw / 2 : L + (iw * i) / (points.length - 1));
    const y = (pct) => T + ih * (1 - pct / 100);
    const grid = [0, 50, 100].map((v) => `
      <line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line>
      <text class="chart-axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join(``);
    const guide = `
      <line class="chart-guide" x1="${L}" x2="${W - R}" y1="${y(GUIDE_PCT)}" y2="${y(GUIDE_PCT)}"></line>
      <text class="chart-guide-label" x="${L + 10}" y="${points[0].pct >= GUIDE_PCT ? y(GUIDE_PCT) + 13 : y(GUIDE_PCT) - 5}" text-anchor="start">目安 ${GUIDE_PCT}%</text>`;
    const path = points.map((p, i) => `${i ? `L` : `M`}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(` `);
    const area = points.length > 1 ? `<path class="chart-area" d="${path} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z"></path>` : ``;
    const step = points.length > 6 ? 2 : 1;
    const xLabels = points.map((p, i) => {
      const show = i === points.length - 1 || (i % step === 0 && !(step === 2 && i === points.length - 2));
      if (!show || !p.date) return ``;
      const d = DateUtil.parse(p.date);
      return `<text class="chart-axis" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>`;
    }).join(``);
    const dots = points.map((p, i) => `
      <circle class="chart-dot${p.pct >= GUIDE_PCT ? ` is-pass` : ``}" cx="${x(i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="4"><title>${p.date ? DateUtil.toJapanese(p.date) : `${i + 1}回目`}: ${p.e.score}/${p.e.total}(${p.pct}%)</title></circle>`).join(``);
    const last = points[points.length - 1];
    const lastLabel = `<text class="chart-value" x="${x(points.length - 1).toFixed(1)}" y="${(y(last.pct) - 9).toFixed(1)}" text-anchor="${points.length === 1 ? `middle` : `end`}">${last.pct}%</text>`;
    const desc = points.map((p, i) => `${p.date ? DateUtil.toJapanese(p.date) : `${i + 1}回目`} ${p.pct}%`).join(`、`);
    return `
      <svg class="prog-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="模擬試験の得点率の推移(古い順): ${desc}">
        ${grid}${guide}${area}
        <path class="chart-line" d="${path}"></path>
        ${dots}${lastLabel}${xLabels}
      </svg>`;
  }

  function examCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const points = examPoints();
    if (!points.length) {
      card.innerHTML = `<h3 class="card-title">模擬試験の得点推移</h3>`;
      card.appendChild(UI.emptyState({
        icon: `timer`,
        title: `まだ模擬試験の記録がありません`,
        body: `本番と同じ問題数・時間で解くと、ここに得点率の推移がグラフで表示されます。`,
        cta: { label: `模擬試験へ`, nav: `#exam` },
      }));
      card.querySelector(`.empty-state`).classList.add(`empty-state-compact`);
      return card;
    }
    const best = points.reduce((m, p) => (p.pct > m.pct ? p : m), points[0]);
    const last = points[points.length - 1];
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">模擬試験の得点推移</h3>
        <a class="link-btn" href="#exam">模擬試験へ${ic(`chevron-right`, 16)}</a>
      </div>
      <p class="calc-note prog-note">直近${points.length}回の得点率です。前回 <strong>${last.pct}%</strong>(${last.e.score}/${last.e.total})・最高 <strong>${best.pct}%</strong>。点線の${GUIDE_PCT}%はこのアプリ独自の目安で、実際の合格点は毎年変わります。</p>
      <div class="chart-wrap">${chartSvg(points)}</div>`;
    return card;
  }

  // ---- トピック別 ----
  function topicCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    card.className = `card span-all`;
    const rows = Stats.byTopic();
    card.innerHTML = `
      <h3 class="card-title">トピック別の進捗</h3>
      <div class="prog-topic-list">
        ${rows.map((r) => `
          <a class="prog-topic" href="#topics/${r.topic.id}">
            <span class="topic-icon">${ic(r.topic.icon || `book-open`)}</span>
            <span class="prog-topic-main">
              <span class="prog-topic-head"><span class="prog-topic-name">${esc(r.topic.name)}</span><span class="cat-bar-meta">${r.done}/${r.total}</span></span>
              <span class="progress-bar"><span class="progress-bar-fill${r.pct === 100 ? ` fill-success` : ``}" style="width:${r.pct}%"></span></span>
            </span>
            ${ic(`chevron-right`, 18)}
          </a>`).join(``)}
      </div>`;
    return card;
  }

  // ---- 苦手な用語 ----
  function weakCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const weak = Stats.weakTerms(8);
    card.innerHTML = `
      <h3 class="card-title">苦手な用語</h3>
      ${weak.length ? `
        <p class="calc-note prog-note">クイズで間違えた回数が多い用語です。用語集で意味を確認してから、苦手優先のクイズで解き直しましょう。</p>
        <div class="chip-row">
          ${weak.map((w) => `<a class="chip chip-small" href="#glossary/${w.term.id}">${esc(w.term.name)}</a>`).join(``)}
        </div>
        <div class="card-actions">
          <a class="btn" href="#quiz/auto/weak">${ic(`pencil-check`)}苦手を優先してクイズ</a>
        </div>` : `
        <p class="calc-note prog-note" style="margin:0;">今のところ苦手な用語はありません。クイズで間違えた用語がここに集まります。</p>
        <div class="card-actions"><a class="btn btn-secondary" href="#quiz">${ic(`pencil-check`)}クイズに挑戦</a></div>`}`;
    return card;
  }

  function dataNote() {
    const p = document.createElement(`p`);
    p.className = `prog-data-note span-all`;
    p.innerHTML = `${ic(`shield`, 16)}<span>学習の記録はこの端末のブラウザの中だけに保存され、外部には送信されません。ブラウザのデータを消すと記録も消えるため、<a href="#settings">設定</a>からバックアップ(書き出し)しておくと安心です。</span>`;
    return p;
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view progress-view`;
    wrap.innerHTML = `
      <h2>学習の進捗</h2>
      <p class="view-desc">これまでの学習の積み重ねを、分野・記憶の定着度・日ごとの記録で確認できます。</p>
      <div class="prog-grid" data-role="grid"></div>`;
    root.appendChild(wrap);
    const grid = wrap.querySelector(`[data-role="grid"]`);
    [summaryCard(), categoryCard(), srsCard(), heatmapCard(), examCard(), weakCard(), topicCard(), dataNote()]
      .forEach((el) => grid.appendChild(el));
  }

  return { render };
})();
