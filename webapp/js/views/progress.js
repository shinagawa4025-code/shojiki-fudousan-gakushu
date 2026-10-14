// 学習の進捗: 弱点分析(次にやること・苦手なポイント・分野別の習熟度)を先頭に、模擬試験の推移・
// 学習のまとめ(学習済み・連続・復習)・記憶の定着度・学習カレンダー・トピック別
// 学ぶ目的が「暮らし・仕事」(learnerProfile の goal が life / work)で試験日の登録がない人には、宅建の分野ではなく
// 「テーマ別の進捗」(気になるテーマごとの学習済み・次に読む基礎知識・○×)を先頭に出す(テーマ表示)
// ルート: #progress / #progress/weak(弱点分析までスクロール) / #progress/exam(テーマ表示の人も試験の分野別の分析を見る)
//        v12: #progress/predict(合格予測) / #progress/time(学習時間) / #progress/badges(バッジ)までスクロール
// v12: 合格予測(js/predict.js。アプリ独自の推定)・直近7日の学習時間(StudyTime)・バッジ(Badges)のカード。
//      自信なしの正解は0.5問として数えるため、正解数は「12.5」のように小数になることがある
// 言葉の使い分け: 「学習済み」= 記憶済み(★)・学習済み(✓)にしたもの / 「着手」= 一度でも学習・出題したもの
window.Views = window.Views || {};
window.Views.progress = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);
  const WEEKS = 12;
  const GUIDE_PCT = 70;
  const ACTION_LIMIT = 4;
  const WEAK_LIMIT = 8;
  const THEME_WEAK_LIMIT = 5;
  // 暮らし・取引のテーマの並び(トピック一覧の「暮らし・取引」と同じ順。まだないトピックは飛ばす)
  const LIFE_ORDER = [`topicI`, `topicA`, `topicB`, `topicC`, `topicD`, `topicP`, `topicQ`, `topicE`, `topicH`, `topicG`, `topicF`];
  // Stats.interestTopicIds がないときの予備(Stats.INTEREST_TOPICS と同じ対応)
  const INTEREST_FALLBACK = {
    rent: [`topicI`, `topicA`], buy: [`topicB`, `topicC`, `topicD`], sell: [`topicP`, `topicB`, `topicH`],
    inherit: [`topicQ`, `topicH`, `topicE`], landlord: [`topicA`, `topicH`], trouble: [`topicG`, `topicF`],
  };

  // 画面内で選んだ試験(再描画しても保持)
  let selectedType = null;

  // ---- 学ぶ目的(learnerProfile。Stats.getProfile がない版では使わない) ----
  function learnerProfile() {
    try {
      const p = window.Stats && typeof Stats.getProfile === `function` ? Stats.getProfile() : null;
      return p && typeof p === `object` && typeof p.goal === `string` ? p : null;
    } catch (e) { return null; }
  }

  function topicExists(id) {
    return typeof id === `string` && !!AppIndex.topicsById && Object.prototype.hasOwnProperty.call(AppIndex.topicsById, id);
  }

  // 気になるテーマのトピック(選んだ順・重複なし)
  function interestTopicIds(profile) {
    let ids = [];
    try {
      if (typeof Stats.interestTopicIds === `function`) ids = Stats.interestTopicIds(profile) || [];
      else {
        (Array.isArray(profile.interests) ? profile.interests : []).forEach((k) => {
          (INTEREST_FALLBACK[k] || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); });
        });
      }
    } catch (e) { ids = []; }
    return (Array.isArray(ids) ? ids : []).filter((id, i, a) => topicExists(id) && a.indexOf(id) === i);
  }

  function hasExamTargets() {
    try { return Stats.listTargets().length > 0; } catch (e) { return false; }
  }

  // テーマ表示にするか: 暮らし・仕事のために学ぶ人で、試験日を登録していない(#progress/exam・#progress/predict のときは試験の表示)
  function useThemeView(profile, param) {
    if (param === `exam` || param === `predict` || !profile) return false;
    return (profile.goal === `life` || profile.goal === `work`) && !hasExamTargets();
  }

  // ---- 試験の切替 ----
  function examTypeOptions() {
    const ids = [];
    Stats.listTargets().forEach((t) => {
      if (Stats.examType(t.examTypeId) && !ids.includes(t.examTypeId)) ids.push(t.examTypeId);
    });
    // 税理士試験の対策として学ぶ人は、試験日を登録していなくても税理士の分析を選べるようにする
    const profile = learnerProfile();
    if (profile && profile.goal === `zeirishi` && !ids.includes(`zeirishi`) && Stats.examType(`zeirishi`)) ids.push(`zeirishi`);
    if (!ids.includes(`takken`) && Stats.examType(`takken`)) ids.push(`takken`);
    return ids.map((id) => Stats.examType(id));
  }

  // 最初に表示する試験: ホーム(Analysis の既定)と同じく、主目標の試験に分野の区分があればそれ、なければ宅建士
  // (主目標がなく、学ぶ目的が税理士試験なら税理士)
  function defaultType(options) {
    const ids = options.map((t) => t.id);
    if (selectedType && ids.includes(selectedType)) return selectedType;
    const p = Stats.primaryTarget();
    const pt = p ? Stats.examType(p.examTypeId) : null;
    if (pt && Array.isArray(pt.categories) && ids.includes(pt.id)) return pt.id;
    const profile = learnerProfile();
    if (!p && profile && profile.goal === `zeirishi` && ids.includes(`zeirishi`)) return `zeirishi`;
    if (ids.includes(`takken`)) return `takken`;
    return ids[0] || `takken`;
  }

  // ---- 学習のまとめ(1行) ----
  // scope: テーマ表示では、選んだテーマの項目だけで「学習済み」を数える({done, total, pct})
  function summaryCard(scope) {
    const card = document.createElement(`section`);
    card.className = `prog-summary`;
    card.setAttribute(`aria-label`, `学習のまとめ`);
    const ov = scope || Stats.overall();
    const current = Streak.getCurrentStreak();
    const longest = Streak.getLongestStreak();
    const due = Stats.dueReviewCount();
    card.innerHTML = `
      <div class="prog-strip">
        <div class="prog-strip-item">
          <span class="prog-strip-label">${ic(`check-circle`, 14)}学習済み</span>
          <span class="prog-strip-value num">${ov.pct}<small>%</small></span>
          <span class="prog-strip-sub num">${ov.done}/${ov.total}項目</span>
        </div>
        <div class="prog-strip-item is-streak">
          <span class="prog-strip-label">${ic(`flame`, 14)}連続学習</span>
          <span class="prog-strip-value num">${current}<small>日</small></span>
          <span class="prog-strip-sub num">最長 ${longest}日</span>
        </div>
        <a class="prog-strip-item prog-strip-link" href="#review">
          <span class="prog-strip-label">${ic(`repeat`, 14)}今日の復習</span>
          <span class="prog-strip-value num">${due}<small>件</small></span>
          <span class="prog-strip-sub">${due ? `復習する` : `今日はなし`}${ic(`chevron-right`, 14)}</span>
        </a>
      </div>`;
    return card;
  }

  // ---- 弱点分析 ----
  function createTypeState() {
    const options = examTypeOptions();
    const state = { options, typeId: defaultType(options), snap: null, listeners: [] };
    state.set = (id) => {
      state.typeId = id;
      selectedType = id;
      state.listeners.forEach((fn) => fn());
    };
    return state;
  }

  function safeAnalyze(typeId) {
    if (!window.Analysis || typeof Analysis.analyze !== `function`) return null;
    try {
      return Analysis.analyze(typeId);
    } catch (e) {
      console.warn(`[progress] 弱点分析に失敗しました`, e);
      return null;
    }
  }

  function masteryTone(r) {
    if (r.confidence === `none`) return `none`;
    // データ不足のうちは色で良し悪しを判定しない
    if (r.confidence === `low`) return `tentative`;
    if (r.mastery < 40) return `low`;
    if (r.mastery < 70) return `mid`;
    return `high`;
  }

  const MODE_LABEL = { full: `フル`, short: `ショート` };

  function trendHtml(t) {
    if (!t) return ``;
    const sign = t.delta > 0 ? `+${t.delta}` : t.delta < 0 ? `−${Math.abs(t.delta)}` : `±0`;
    const words = t.direction === `up` ? `上昇` : t.direction === `down` ? `低下` : `横ばい`;
    const mode = MODE_LABEL[t.mode] || ``;
    const title = `前回の${mode ? `${mode}の` : ``}模擬試験から: ${t.prev}% → ${t.last}%`;
    return `<span class="ana-trend is-${t.direction}" title="${esc(title)}">${ic(`arrow-right`, 14)}<span class="sr-only">模擬試験${mode ? `(${mode})` : ``}の正答率が前回から${words}、</span>模試${sign}</span>`;
  }

  // opts.noAttempts: 分野全体でまだ1問も解いていない(各行の「未回答」は出さず、上に1行だけ書く)
  function catRowHtml(r, opts) {
    if (!r.available) {
      return `
        <li class="ana-cat is-empty">
          <div class="ana-cat-top">
            <span class="ana-rank num"><span class="sr-only">優先</span>${r.rank}<span class="sr-only">位</span></span>
            <span class="ana-cat-name">${esc(r.name)}${r.questions ? `<span class="topic-group-meta">例年${r.questions}問</span>` : ``}</span>
            <span class="ana-score num">—</span>
          </div>
          <div class="ana-cat-meta"><span class="text-muted">この分野の用語・問題はまだありません</span></div>
        </li>`;
    }
    const tone = masteryTone(r);
    const width = Math.max(r.mastery, tone === `none` ? 0 : 2);
    const flag = r.confidence === `none` ? (opts.noAttempts ? `` : `<span class="ana-flag">未回答</span>`)
      : r.confidence === `low` ? `<span class="ana-flag">データ不足</span>` : ``;
    return `
      <li class="ana-cat">
        <div class="ana-cat-top">
          <span class="ana-rank num"><span class="sr-only">優先</span>${r.rank}<span class="sr-only">位</span></span>
          <span class="ana-cat-name">${esc(r.name)}${r.questions ? `<span class="topic-group-meta">例年${r.questions}問</span>` : ``}</span>
          <span class="ana-score num"><span class="sr-only">習熟度</span><strong>${r.mastery}</strong><small>/100</small></span>
        </div>
        <div class="progress-bar ana-bar" aria-hidden="true"><div class="progress-bar-fill ana-fill-${tone}" style="width:${width}%"></div></div>
        <div class="ana-cat-meta">
          ${r.attempts ? `<span>正答率 <strong>${r.accuracy}%</strong><span class="text-muted">(${r.attempts}問)</span></span>` : ``}
          ${r.total ? `<span class="text-muted" title="一度でも学習・出題した項目(記憶済み・学習済み・復習カード・クイズ・○×)">着手 ${r.studied}/${r.total}</span>` : ``}
          ${r.total ? `<span class="text-muted" title="記憶済み(★)・学習済み(✓)にした項目">学習済み ${r.learned || 0}/${r.total}</span>` : ``}
          ${trendHtml(r.trend)}
          ${flag}
        </div>
      </li>`;
  }

  // 正解数の表示: 自信なしの正解(0.5問)があると小数になるので、小数第1位まで(12.5)。整数はそのまま
  function fmtNum(v) {
    const n = Math.round((Number(v) || 0) * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  // 正答率の内訳(4択 3/5・自動クイズ 10/14 …)
  function sourceBreakdown(row) {
    return (row.sources || []).filter((s) => s.total > 0).map((s) => `${s.label} ${fmtNum(s.correct)}/${s.total}`).join(`・`);
  }

  function breakdownHtml(rows) {
    const withData = rows.filter((r) => r.attempts > 0 && sourceBreakdown(r));
    if (!withData.length) return ``;
    return `
      <details class="ana-how ana-breakdown">
        <summary>${ic(`list`, 16)}<span>正答率の内訳</span>${ic(`chevron-down`, 16)}</summary>
        <p class="prog-note">確認問題(4択・記述)・自動生成クイズ・○×・模擬試験の結果の合計です(正解数/回答数)。自信なしの正解は0.5問として数えます。</p>
        <ul>
          ${withData.map((r) => `<li><strong>${esc(r.name)}</strong> ${r.accuracy}%(${fmtNum(r.correct)}/${r.attempts}問): ${esc(sourceBreakdown(r))}</li>`).join(``)}
        </ul>
      </details>`;
  }

  function actionsHtml(actions, snap, weakCount) {
    if (!actions.length) {
      const hasCats = !!(snap.type && Array.isArray(snap.type.categories));
      // 分野の区分がない試験(その他)は分野別の提案が出ないため、苦手なポイントへ案内する
      if (!hasCats && weakCount) return `<p class="prog-note prog-note-flush">分野の区分がないため、下の「苦手なポイント」から解き直すのがおすすめです。</p>`;
      return `<p class="prog-note prog-note-flush">今のところ特におすすめはありません。この調子で続けましょう。</p>`;
    }
    return `
      <div class="todo-list ana-actions">
        ${actions.map((a) => `
          <a class="todo-item" href="${esc(a.nav)}">
            <span class="todo-icon${a.kind === `review` ? ` is-warn` : ``}">${ic(a.icon || `lightbulb`)}</span>
            <span class="todo-main"><span class="todo-title">${esc(a.title)}</span><span class="todo-sub">${esc(a.detail)}</span></span>
            ${ic(`chevron-right`, 18)}
          </a>`).join(``)}
      </div>`;
  }

  const WEAK_KIND = { term: `用語`, quiz: `問題`, statement: `○×` };

  // 「宅建業法・○×で2回不正解・正解は×」を区切りごとに折り返す(語の途中で改行しない)
  function weakSubHtml(w) {
    const parts = [w.category ? w.category.name : ``].concat(Array.isArray(w.reasons) ? w.reasons : []).filter(Boolean);
    if (!parts.length) return esc(w.sub || ``);
    return parts.map((p) => `<span class="ana-seg">${esc(p)}</span>`).join(`・`);
  }

  // scope: ボタンに添える範囲の注記(宅建士以外の試験では「(全分野)」。テーマ表示では付けない)
  function weakHtml(items, scope) {
    if (!items.length) {
      return `<p class="prog-note prog-note-flush">今のところ苦手なポイントはありません。4択・○×で間違えた問題・用語がここに集まります。</p>`;
    }
    const hasTerm = items.some((w) => w.kind === `term`);
    const hasStmt = items.some((w) => w.kind === `statement`);
    const all = scope || ``;
    return `
      <ul class="ana-weak">
        ${items.map((w) => `
          <li>
            <a class="ana-weak-item" href="${esc(w.nav)}">
              <span class="ana-weak-icon">${ic(w.icon || `target`, 18)}</span>
              <span class="ana-weak-main">
                ${w.context ? `<span class="ana-weak-context">${esc(w.context)}</span>` : ``}
                <span class="ana-weak-title">${esc(w.title)}</span>
                <span class="ana-weak-sub"><span class="ana-weak-kind">${WEAK_KIND[w.kind] || ``}</span>${weakSubHtml(w)}</span>
              </span>
              ${ic(`chevron-right`, 18)}
            </a>
          </li>`).join(``)}
      </ul>
      ${hasTerm || hasStmt ? `
        <div class="card-actions ana-weak-actions">
          ${hasTerm ? `<a class="btn btn-secondary" href="#quiz/auto/weak">${ic(`pencil-check`)}苦手な用語を優先してクイズ${all}</a>` : ``}
          ${hasStmt ? `<a class="btn btn-secondary" href="#ox/weak">${ic(`o-x`)}○×の苦手を解き直す${all}</a>` : ``}
        </div>` : ``}`;
  }

  function howHtml() {
    return `
      <details class="ana-how">
        <summary>${ic(`info`, 16)}<span>習熟度と並び順の決め方</span>${ic(`chevron-down`, 16)}</summary>
        <ul>
          <li><strong>習熟度(100点満点)</strong> = 正答率(直近重視)× 70点 + 着手率 × 30点。</li>
          <li>回答が${Analysis.MIN_CONFIDENT}問未満の分野は「データ不足」として、正答率の点を「回答数 ÷ ${Analysis.MIN_CONFIDENT}」の割合に割り引きます。</li>
          <li>正答率は確認問題(4択・記述)・自動生成クイズ・○×・模擬試験の合計です。習熟度の計算では、直近の模擬試験(2倍)・その前の回(1.5倍)・○×の最後の回答を重めに、記述の自己採点を半分の重さで数えます。</li>
          <li>自信なしの正解は0.5問として数えます(4択の「勘で当たった」・模擬試験で見直し印を付けて正解した問題)。</li>
          <li><strong>着手</strong>は、分野の用語・基礎知識のうち、記憶済み・学習済みにしたものや、復習カード・クイズ・○×で一度でも出題されたものです(着手率 = 着手 ÷ 項目数。分野に用語がまだないときは正答率だけで計算)。<strong>学習済み</strong>は、記憶済み(★)・学習済み(✓)にしたものだけを数えます。</li>
          <li>並び順は「例年の出題数 × 習熟度の低さ」で、伸ばすと点につながりやすい分野ほど上に来ます。</li>
          <li>「模試+8」などの表示は、その分野が4問以上出た模擬試験のうち、同じ形式(フル/ショート)の直近2回の正答率の差(ポイント)です。</li>
        </ul>
      </details>`;
  }

  // 回答がまだないとき。下の「次にやること」と同じリンクのボタンは重ねて出さない
  function emptyHtml(type, actions) {
    const mock = !!(type && type.mockExam);
    const base = (nav) => String(nav || ``).split(`/`)[0];
    const used = new Set(actions.map((a) => base(a.nav)));
    const buttons = [
      { nav: `#ox`, html: `<a class="btn" href="#ox">${ic(`o-x`)}○×一問一答</a>` },
      { nav: `#quiz`, html: `<a class="btn btn-secondary" href="#quiz">${ic(`pencil-check`)}4択問題</a>` },
      mock ? { nav: `#exam`, html: `<a class="btn btn-secondary" href="#exam/short">${ic(`timer`)}模擬試験</a>` } : null,
    ].filter((b) => b && !used.has(b.nav));
    return `
      <div class="empty-state empty-state-compact ana-empty">
        <div class="empty-state-icon">${UI.icon(`target`, { size: 28 })}</div>
        <p class="empty-state-title">まだ分析できる回答がありません</p>
        <p class="empty-state-body">○×一問一答・4択問題${mock ? `・模擬試験` : ``}で問題を解くと、分野ごとの得意・苦手がここに表示されます。</p>
        ${buttons.length ? `<div class="ana-empty-actions">${buttons.map((b) => b.html).join(``)}</div>` : ``}
      </div>`;
  }

  function focusHtml(f) {
    if (!f) return ``;
    const why = Array.isArray(f.reasons) && f.reasons.length ? f.reasons.join(`、`) : (f.reason || ``);
    return `<p class="ana-focus">${ic(`lightbulb`, 16)}<span>いま伸ばすと効果が大きいのは<strong>${esc(f.name)}</strong>です。${why ? `<span class="ana-focus-why">理由: ${esc(why)}</span>` : ``}</span></p>`;
  }

  function analysisCard(state) {
    const card = document.createElement(`section`);
    card.className = `card span-all ana-card`;
    card.id = `progress-weak`;
    card.setAttribute(`aria-labelledby`, `ana-title`);
    card.innerHTML = `
      <div class="recommend-head ana-head">
        <h3 class="card-title ana-title" id="ana-title">${ic(`target`)}弱点分析</h3>
        <span class="ana-overall" data-role="overall"></span>
      </div>
      <p class="prog-note ana-formula">習熟度(100点)= 正答率×70点 + 着手率×30点。回答${Analysis.MIN_CONFIDENT}問未満の分野は正答率の点を割り引きます。自信なしの正解は0.5問として数えます。</p>
      ${state.options.length > 1 ? `
        <div class="segmented prog-segmented" role="group" aria-label="分析する試験" data-role="types">
          ${state.options.map((t) => `<button type="button" class="segmented-item" data-type="${t.id}" aria-pressed="${t.id === state.typeId}">${esc(t.shortName || t.name)}</button>`).join(``)}
        </div>` : ``}
      <p class="sr-only" role="status" data-role="ana-status"></p>
      <div data-role="ana-body"></div>`;
    const body = card.querySelector(`[data-role="ana-body"]`);
    const overall = card.querySelector(`[data-role="overall"]`);
    // 試験を切り替えたときだけ、短い一文で読み上げる(分析全体をライブリージョンにすると長文が丸ごと読まれる)
    const status = card.querySelector(`[data-role="ana-status"]`);
    const formula = card.querySelector(`.ana-formula`);

    function paint() {
      const snap = safeAnalyze(state.typeId);
      state.snap = snap;
      if (!snap) {
        overall.innerHTML = ``;
        body.innerHTML = `<p class="prog-note prog-note-flush">弱点分析を表示できませんでした。</p>`;
        return;
      }
      const type = snap.type;
      const name = type ? (type.shortName || type.name) : ``;
      const s = snap.summary;
      // 習熟度の式は分野別の習熟度を出す試験でだけ見せる
      formula.hidden = !(type && Array.isArray(type.categories));
      overall.innerHTML = snap.hasData && s.mastery != null
        ? `総合 <strong class="num">${s.mastery}</strong><small>/100</small>`
        : ``;
      const actions = snap.actions.slice(0, ACTION_LIMIT);
      const weak = snap.weakPoints.slice(0, WEAK_LIMIT);
      const rows = snap.categories.slice().sort((a, b) => a.rank - b.rank);
      const noAttempts = rows.length > 0 && rows.every((r) => !r.attempts);
      const anyStudied = rows.some((r) => r.studied > 0 || r.learned > 0);

      const catBlock = rows.length ? `
        <h4 class="ana-sub">${ic(`chart`, 18)}分野別の習熟度<span class="ana-sub-note">伸ばしたい順</span></h4>
        ${noAttempts ? `<p class="prog-note">この試験の分野では、まだ解いた問題がありません(習熟度は着手率だけで計算しています)。</p>` : ``}
        <ol class="ana-cats">${rows.map((r) => catRowHtml(r, { noAttempts })).join(``)}</ol>
        ${snap.hasData ? focusHtml(s.focus) : ``}
        ${breakdownHtml(rows)}`
        : `<p class="prog-note ana-nocat">${esc(name)}には分野の区分がないため、分野別の習熟度は表示していません。宅建士・税理士を選ぶと分野ごとに分析できます。</p>`;

      if (!snap.hasData) {
        body.innerHTML = `
          ${emptyHtml(type, actions)}
          <h4 class="ana-sub">${ic(`flag`, 18)}まずはここから</h4>
          ${actionsHtml(actions, snap, 0)}
          ${rows.length && anyStudied ? `<div class="ana-empty-cats">${catBlock}</div>` : ``}`;
        return;
      }

      body.innerHTML = `
        <div class="ana-layout">
          <div class="ana-col">
            <h4 class="ana-sub">${ic(`flag`, 18)}次にやること</h4>
            ${actionsHtml(actions, snap, weak.length)}
            <h4 class="ana-sub ana-sub-weak">${ic(`alert`, 18)}苦手なポイント</h4>
            ${weakHtml(weak, snap.examTypeId !== `takken` ? `(全分野)` : ``)}
          </div>
          <div class="ana-col">${catBlock}</div>
        </div>
        ${howHtml()}`;
    }

    card.querySelectorAll(`[data-type]`).forEach((btn) => {
      btn.addEventListener(`click`, () => {
        card.querySelectorAll(`[data-type]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b === btn)));
        state.set(btn.dataset.type);
        const snap = state.snap;
        const s = snap && snap.summary;
        status.textContent = `${btn.textContent.trim()}の弱点分析を表示しています${s && snap.hasData && s.mastery != null ? `。総合${s.mastery}点` : ``}`;
      });
    });
    state.listeners.unshift(paint);
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

  // 1つ選んだマス・点に印を付け、下の行に内容を出す(iPhone では title のツールチップが出ないため)
  function wireReadout(container, selector, readout, onPick) {
    let picked = null;
    container.addEventListener(`click`, (e) => {
      const el = e.target.closest(selector);
      if (!el || !container.contains(el)) return;
      if (picked) picked.classList.remove(`is-picked`);
      picked = onPick ? onPick(el) : el;
      if (picked) picked.classList.add(`is-picked`);
      readout.textContent = el.getAttribute(`data-label`) || el.getAttribute(`aria-label`) || ``;
    });
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
        const label = `${DateUtil.toJapanese(d.date, true)}: ${d.count ? `${d.count}回` : `記録なし`}`;
        rows.push(`<span class="streak-day heat-cell${d.date === today ? ` today` : ``}" data-level="${d.level}" role="img" aria-label="${label}" title="${label}"></span>`);
      }
    }

    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title">学習カレンダー</h3>
        <span class="streak-chip">${ic(`flame`, 16)}${Streak.getCurrentStreak()}日連続</span>
      </div>
      <p class="calc-note prog-note">${active
        ? `直近${WEEKS}週間で${active}日・合計${total}回学習しました(これまでに学習した日は${Streak.totalActiveDays()}日)。`
        : `まだ学習の記録がありません。カードや問題で学習すると、その日のマスに色が付きます。`}</p>
      <div class="heat-wrap">
        <div class="heat-grid" role="img" aria-label="直近${WEEKS}週間の学習記録。学習した日は${active}日です。" data-role="heat-grid">
          <span class="heat-month"></span>${monthCells.join(``)}
          ${rows.join(``)}
        </div>
        <p class="heat-readout" aria-live="polite" data-role="heat-detail">マスをタップすると、その日の回数が下に表示されます。</p>
        <div class="heat-legend" aria-hidden="true">
          <span>少ない</span>
          ${[0, 1, 2, 3, 4].map((l) => `<span class="streak-day heat-cell" data-level="${l}"></span>`).join(``)}
          <span>多い</span>
        </div>
      </div>`;
    wireReadout(card.querySelector(`[data-role="heat-grid"]`), `.heat-cell[aria-label]`, card.querySelector(`[data-role="heat-detail"]`));
    return card;
  }

  // ---- 模擬試験の推移 ----
  function pad2(n) {
    return String(n).padStart(2, `0`);
  }

  // 日時(ミリ秒)として使える値だけを使う。Infinity や Date で表せない値(1e20 など。壊れたバックアップ由来)は無視する
  // 使える日時が1つもない記録は「日時なし」として扱い、保存順で並べる(弱点分析の並べ方と同じ)
  function entryTs(e) {
    return [e.finishedAt, e.at, e.endedAt, e.startedAt].find((v) => typeof v === `number` && Number.isFinite(v) && v > 0 && v <= 8.64e15) || null;
  }

  function entryDate(e) {
    if (typeof e.date === `string` && DateUtil.isValid(e.date)) return e.date;
    const ts = entryTs(e);
    if (!ts) return null;
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function entryTime(e, i, len) {
    const ts = entryTs(e);
    if (ts) return ts;
    const d = entryDate(e);
    if (d) return DateUtil.parse(d).getTime();
    return len - i; // 日時がなければ「新しい順に保存されている」とみなす
  }

  // 形式: 記録の mode を優先し、なければ問題数から推定(50問=フル)
  function entryMode(e) {
    if (e.mode === `full` || e.mode === `short`) return e.mode;
    return e.total >= 50 ? `full` : `short`;
  }

  function examPoints() {
    const list = Stats.examHistory()
      .map((e, i, all) => ({ e, i, len: all.length }))
      .filter(({ e }) => e && Number.isFinite(e.score) && Number.isFinite(e.total) && e.total > 0);
    return list
      .map(({ e, i, len }) => ({ e, t: entryTime(e, i, len), date: entryDate(e), mode: entryMode(e), pct: Math.max(0, Math.min(100, Math.round((e.score / e.total) * 100))) }))
      .sort((a, b) => a.t - b.t)
      .slice(-10);
  }

  function pointLabel(p, i) {
    const when = p.date ? DateUtil.toJapanese(p.date) : `${i + 1}回目`;
    return `${when} ${MODE_LABEL[p.mode]} ${p.e.score}/${p.e.total}問(${p.pct}%)`;
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
    const last = points[points.length - 1];
    const lastX = x(points.length - 1);
    const near = Math.abs(last.pct - GUIDE_PCT) < 8;
    const grid = [0, 50, 100].map((v) => `
      <line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line>
      <text class="chart-axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join(``);
    // 目安のラベルは右端・線の上。最後の点が線の近くにあるときは、点と重ならないよう少し左へずらす
    const guideX = Math.abs(last.pct - GUIDE_PCT) <= 12 && lastX > W - R - 60 ? lastX - 10 : W - R;
    const guide = `
      <line class="chart-guide" x1="${L}" x2="${W - R}" y1="${y(GUIDE_PCT)}" y2="${y(GUIDE_PCT)}"></line>
      <text class="chart-guide-label" x="${guideX.toFixed(1)}" y="${(y(GUIDE_PCT) - 5).toFixed(1)}" text-anchor="end">目安 ${GUIDE_PCT}%</text>`;
    const path = points.map((p, i) => `${i ? `L` : `M`}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(` `);
    const area = points.length > 1 ? `<path class="chart-area" d="${path} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z"></path>` : ``;
    const step = points.length > 6 ? 2 : 1;
    const xLabels = points.map((p, i) => {
      const show = i === points.length - 1 || (i % step === 0 && !(step === 2 && i === points.length - 2));
      if (!show || !p.date) return ``;
      const d = DateUtil.parse(p.date);
      if (!d) return ``;
      return `<text class="chart-axis" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>`;
    }).join(``);
    // フル=塗りつぶしの点、ショート=白抜きの輪
    const dots = points.map((p, i) => `<circle class="chart-dot is-${p.mode}" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="4.5"></circle>`).join(``);
    // タップしやすいよう、点より大きい透明の当たり判定を重ねる
    const hits = points.map((p, i) => `<circle class="chart-hit" data-i="${i}" data-label="${esc(pointLabel(p, i))}" cx="${x(i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="14"><title>${esc(pointLabel(p, i))}</title></circle>`).join(``);
    // 最後の点の値: 目安の線の近く(±8)にあるときは線の下に出す(右端の「目安」の文字と重ねない)
    let lastY = y(last.pct) - 9;
    if (last.pct < GUIDE_PCT && last.pct >= 10) lastY = y(last.pct) + 16;
    else if (near) lastY = Math.max(y(last.pct), y(GUIDE_PCT)) + 15;
    const lastLabel = `<text class="chart-value" x="${lastX.toFixed(1)}" y="${lastY.toFixed(1)}" text-anchor="${points.length === 1 ? `middle` : `end`}">${last.pct}%</text>`;
    const desc = points.map((p, i) => pointLabel(p, i)).join(`、`);
    return `
      <svg class="prog-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="模擬試験の得点率の推移(古い順): ${esc(desc)}" data-role="chart">
        ${grid}${guide}${area}
        <path class="chart-line" d="${path}"></path>
        ${dots}${lastLabel}${xLabels}${hits}
      </svg>`;
  }

  // 「直近3回の平均 58%(その前の3回より+6pt)・目安まであとフル換算6問」
  function trendSentence(points) {
    const recent = points.slice(-3);
    const before = points.slice(-6, -3);
    const avg = (list) => Math.round(list.reduce((s, p) => s + p.pct, 0) / list.length);
    const a = avg(recent);
    const d = before.length ? a - avg(before) : null;
    const diff = d == null ? `` : `(その前の${before.length}回より${d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : `±0`}pt)`;
    // 1回だけのときは平均を出さない(下の「前回」と同じ数になるため)
    const parts = recent.length > 1 ? [`直近${recent.length}回の平均 <strong>${a}%</strong>${diff}`] : [];
    const full = 50;
    const need = Math.ceil((GUIDE_PCT / 100) * full);
    const have = Math.round((a / 100) * full);
    parts.push(have >= need ? `目安(${GUIDE_PCT}%)に届いています` : `目安まであとフル換算${need - have}問`);
    return parts.join(`・`);
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
    const modes = new Set(points.map((p) => p.mode));
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title">模擬試験の得点推移</h3>
        <a class="link-btn" href="#exam">模擬試験へ${ic(`chevron-right`, 16)}</a>
      </div>
      <p class="prog-note prog-trend">${trendSentence(points)}</p>
      <p class="calc-note prog-note">前回 <strong>${last.pct}%</strong>(${MODE_LABEL[last.mode]} ${last.e.score}/${last.e.total})${points.length > 1 ? `・直近${points.length}回の最高 <strong>${best.pct}%</strong>` : ``}。点線の${GUIDE_PCT}%はこのアプリ独自の目安で、実際の合格点は毎年変わります。</p>
      <div class="chart-wrap">${chartSvg(points)}</div>
      <div class="chart-legend" aria-hidden="true">
        ${modes.has(`full`) ? `<span><i class="chart-key is-full"></i>フル(50問)</span>` : ``}
        ${modes.has(`short`) ? `<span><i class="chart-key is-short"></i>ショート(20問)</span>` : ``}
        <span><i class="chart-key is-guide"></i>目安${GUIDE_PCT}%</span>
      </div>
      <p class="chart-readout" aria-live="polite" data-role="chart-detail">点をタップすると、その回の得点が表示されます。</p>`;
    const svg = card.querySelector(`[data-role="chart"]`);
    wireReadout(svg, `.chart-hit`, card.querySelector(`[data-role="chart-detail"]`), (hit) => svg.querySelector(`.chart-dot[data-i="${hit.getAttribute(`data-i`)}"]`));
    return card;
  }

  // ---- 合格予測(宅建士・js/predict.js) ----
  // 宅建士の分野で、4択の問題が一番多いトピック(「あと n 問」の行き先)
  function quizTopicOf(catId) {
    const type = Stats.examType(`takken`);
    const c = type && Array.isArray(type.categories) ? type.categories.find((x) => x.id === catId) : null;
    const idx = AppIndex.topicQuizIndex || {};
    let best = null;
    ((c && c.topicIds) || []).forEach((tid) => {
      if (!topicExists(tid)) return;
      const n = Array.isArray(idx[tid]) ? idx[tid].length : 0;
      if (n && (!best || n > best.n)) best = { id: tid, n };
    });
    return best ? best.id : null;
  }

  const pctOf = (v, max) => Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2);

  // 0〜50点の横棒: 予測の幅(主色)・見込み(縦線)・過去の合格点の範囲(注意色の帯)
  function rangeBarHtml(r) {
    const max = r.max || 50;
    const pr = r.passRange;
    const label = `予測 ${r.low}〜${r.high}点(見込み${r.expected}点)${pr ? `、過去の合格点 ${pr.min}〜${pr.max}点` : ``}(${max}点満点)`;
    return `
      <div class="pred-bar" role="img" aria-label="${esc(label)}">
        <div class="pred-track">
          ${pr ? `<span class="pred-pass" style="left:${pctOf(pr.min, max)}%;width:${pctOf(Math.max(0.6, pr.max - pr.min), max)}%"></span>` : ``}
          <span class="pred-range" style="left:${pctOf(r.low, max)}%;width:${pctOf(Math.max(0.6, r.high - r.low), max)}%"></span>
          <span class="pred-mark" style="left:${pctOf(r.expected, max)}%"></span>
        </div>
        <div class="pred-axis" aria-hidden="true"><span>0</span><span>${max / 2}</span><span>${max}点</span></div>
      </div>
      <div class="chart-legend pred-legend" aria-hidden="true">
        <span><i class="pred-key is-range"></i>予測の幅(80%)</span>
        ${pr ? `<span><i class="pred-key is-pass"></i>過去の合格点</span>` : ``}
      </div>`;
  }

  function compareSentence(r) {
    const pr = r.passRange;
    if (!pr) return ``;
    if (r.low >= pr.max) return `予測の幅は、過去の合格点の最高(${pr.max}点)以上です。`;
    if (r.high < pr.min) return `予測の幅は、過去の合格点の最低(${pr.min}点)に届いていません。`;
    return `予測の幅は、過去の合格点の範囲(${pr.min}〜${pr.max}点)と重なっています。`;
  }

  function passHistoryHtml(r) {
    const pr = r.passRange;
    if (!pr) return ``;
    const rows = r.passHistory.filter((x) => (r.exempt ? x.exemptScore != null : true));
    const first = rows[0];
    const last = rows[rows.length - 1];
    const span = first && last && first.label !== last.label ? `${first.label.replace(/[((].*$/, ``)}〜${last.label.replace(/[((].*$/, ``)}` : (last ? last.label : ``);
    const src = (r.passHistory.find((x) => x.src) || {}).src;
    return `
      <p class="prog-note pred-pass-note">
        ${r.exempt
          ? `登録講習修了者(5問免除)の過去の合格点: <strong>45問中${pr.raw.min}〜${pr.raw.max}点</strong>(${esc(span)}。免除の5点を足すと${pr.min}〜${pr.max}点)`
          : `過去の合格点: <strong>${pr.min}〜${pr.max}点</strong>(${esc(span)}・50点満点)`}。
        ${compareSentence(r)}
      </p>
      <details class="ana-how pred-history">
        <summary>${ic(`list`, 16)}<span>年度ごとの合格点</span>${ic(`chevron-down`, 16)}</summary>
        <ul>
          ${rows.map((x) => `<li>${esc(x.label)}: ${r.exempt ? `45問中${x.exemptScore}点` : `50問中${x.score}点`}</li>`).join(``)}
        </ul>
        ${src ? `<p class="prog-note">出典: <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">不動産適正取引推進機構(RETIO)「試験実施概況」${ic(`external`, 14)}<span class="sr-only">(新しいタブで開きます)</span></a></p>` : ``}
      </details>`;
  }

  function catRangesHtml(r) {
    return `
      <ul class="pred-cats">
        ${r.byCat.map((c) => `
          <li class="pred-cat">
            <div class="mini-bar-head"><b>${esc(c.label)}</b><span class="num">${c.fixed ? `免除(${c.n}点)` : `${c.low}〜${c.high}点`}<small> / ${c.n}問</small></span></div>
            <div class="pred-track is-small" aria-hidden="true">
              <span class="pred-range" style="left:${pctOf(c.low, c.n)}%;width:${pctOf(Math.max(c.n * 0.02, c.high - c.low), c.n)}%"></span>
              <span class="pred-mark" style="left:${pctOf(c.expected, c.n)}%"></span>
            </div>
            ${c.fixed ? `` : `<p class="pred-cat-meta num">解答 ${fmtNum(c.answers)}問分(重み付き)・正答率の推定 ${Math.round(c.p * 100)}%</p>`}
          </li>`).join(``)}
      </ul>`;
  }

  function predictHowHtml(r) {
    const k = r.constants;
    // 出題数は計算に使った分野(data/exams.js の例年の出題数)から書く(数字を二重に持たない)
    const counts = (Array.isArray(r.byCat) ? r.byCat : []).map((c) => `${c.label}${c.n}`).join(`・`);
    return `
      <details class="ana-how">
        <summary>${ic(`info`, 16)}<span>予測の計算のしかた</span>${ic(`chevron-down`, 16)}</summary>
        <ul>
          <li>使う記録: 4択の解答(直近${k.WINDOW_DAYS}日・日付つき)、日付のない以前の4択の記録(重み${k.HISTORY_WEIGHT})、宅建士の模擬試験(直近${k.WINDOW_DAYS}日の回。直近の回 ${k.EXAM_WEIGHTS[0]}倍・その前 ${k.EXAM_WEIGHTS[1]}倍・それ以前 1倍)。○×一問一答は使いません。</li>
          <li>新しい記録ほど重く数えます(${k.HALF_LIFE}日前の解答は半分の重さ)。自信なしの正解は${k.UNSURE_CREDIT}問として数えます。</li>
          <li>分野ごとの正答率 = (正解 + 2)÷(解答 + 4)。解答が少ないうちは5割に寄せます。</li>
          <li>見込みの点 = 分野ごとの「例年の出題数 × 正答率」の合計${counts ? `(${esc(counts)})` : ``}。</li>
          <li>幅 = 見込み ± ${k.Z80} × √分散(80%の範囲の目安)。分散は、当日の出来のばらつきと、正答率の推定の不確かさ(解答が少ない分野ほど大きい)の合計です。</li>
          <li>5問免除をオンにすると、5問免除科目は5問とも正解(5点)として計算し、登録講習修了者の合格点と比べます。</li>
          <li>解答の合計が${k.MIN_TOTAL}問分に満たないとき、または出題${k.MIN_CAT_QUESTIONS}問以上の分野で${k.MIN_CAT}問分に満たないときは「データ不足」とします。</li>
        </ul>
      </details>`;
  }

  function predictCard() {
    const card = document.createElement(`section`);
    card.className = `card span-all pred-card`;
    card.id = `progress-predict`;
    card.setAttribute(`aria-labelledby`, `pred-title`);
    function paint() {
      let r = null;
      try { r = window.Predict ? Predict.estimate() : null; } catch (e) {
        console.error(`[合格予測] 計算できませんでした`, e);
        r = null;
      }
      if (!r) {
        card.innerHTML = `<h3 class="card-title" id="pred-title">${ic(`chart`)}合格予測(宅建士)</h3><p class="prog-note prog-note-flush">合格予測を表示できませんでした。</p>`;
        return;
      }
      const toggle = `
        <button type="button" class="pred-toggle" role="switch" aria-checked="${r.exempt}" data-role="exempt">
          <span class="pred-switch" aria-hidden="true"></span><span>5問免除(登録講習修了者)</span>
        </button>`;
      let body;
      if (r.status === `ok`) {
        body = `
          <p class="pred-main"><strong class="num">${r.low}〜${r.high}</strong><span>点</span><small class="num">見込み ${fmtNum(r.expected)}点・50点満点${r.exempt ? `(免除の5点を含む)` : ``}</small></p>
          ${rangeBarHtml(r)}
          ${passHistoryHtml(r)}
          <h4 class="ana-sub">${ic(`chart`, 18)}分野ごとの予測</h4>
          ${catRangesHtml(r)}`;
      } else {
        const links = r.needWhere.map((w) => {
          const tid = quizTopicOf(w.cat);
          return `<a class="chip chip-small" href="${tid ? `#quiz/${tid}` : `#quiz`}">${esc(w.label)} あと${w.need}問</a>`;
        });
        body = `
          <div class="pred-empty">
            <p class="pred-need"><span>データ不足:</span> 4択・模擬試験をあと<strong class="num">${r.need}</strong>問解くと、予測を表示します。</p>
            ${links.length ? `<p class="prog-note">分野ごとに足りない数: </p><div class="chip-row pred-need-links">${links.join(``)}</div>` : ``}
            <div class="card-actions">
              <a class="btn btn-secondary" href="#quiz">${ic(`pencil-check`)}4択問題</a>
              <a class="btn btn-secondary" href="#exam/short">${ic(`timer`)}模擬試験(ショート)</a>
            </div>
          </div>`;
      }
      card.innerHTML = `
        <div class="recommend-head">
          <h3 class="card-title" id="pred-title">${ic(`chart`)}合格予測(宅建士)</h3>
          <span class="pred-badge">アプリ独自の推定</span>
        </div>
        ${toggle}
        ${body}
        <p class="pred-caution">${ic(`alert`, 16)}<span>アプリ独自の推定です。実際の試験の難しさや合格点とは異なります。</span></p>
        ${predictHowHtml(r)}`;
      card.querySelector(`[data-role="exempt"]`).addEventListener(`click`, () => {
        Predict.setExempt(!r.exempt);
        paint();
        const b = card.querySelector(`[data-role="exempt"]`);
        if (b) b.focus();
      });
    }
    paint();
    return card;
  }

  // ---- 学習時間(直近7日。StudyTime) ----
  function durText(sec) {
    const m = Math.floor(Math.max(0, Number(sec) || 0) / 60);
    if (m < 60) return `${m}分`;
    return `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ``}`;
  }

  function studyTimeCard() {
    if (!window.StudyTime || typeof StudyTime.lastNDays !== `function`) return null;
    let days = [];
    let total = 0;
    try {
      days = StudyTime.lastNDays(7);
      total = StudyTime.totalSeconds();
    } catch (e) { return null; }
    const card = document.createElement(`section`);
    card.className = `card st-card`;
    card.id = `progress-time`;
    card.setAttribute(`aria-labelledby`, `st-title`);
    const week = days.reduce((s, d) => s + d.sec, 0);
    const max = Math.max(...days.map((d) => d.sec), 60);
    const today = DateUtil.today();
    const WD = [`日`, `月`, `火`, `水`, `木`, `金`, `土`];
    const label = (d) => `${DateUtil.toJapanese(d.date, true)}: ${d.sec >= 60 ? durText(d.sec) : d.sec > 0 ? `1分未満` : `記録なし`}`;
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" id="st-title">${ic(`clock`)}学習時間</h3>
        <span class="st-total num">直近7日 <strong>${durText(week)}</strong></span>
      </div>
      <div class="st-chart" role="img" aria-label="${esc(`直近7日の学習時間(古い順): ${days.map(label).join(`、`)}`)}" data-role="st-chart">
        ${days.map((d) => {
          const dt = DateUtil.parse(d.date);
          const h = d.sec > 0 ? Math.max(4, Math.round((d.sec / max) * 100)) : 0;
          return `
            <span class="st-col${d.date === today ? ` is-today` : ``}" data-label="${esc(label(d))}">
              <span class="st-val num" aria-hidden="true">${d.sec >= 60 ? Math.floor(d.sec / 60) : ``}</span>
              <span class="st-bar-wrap" aria-hidden="true"><span class="st-bar" style="height:${h}%"></span></span>
              <span class="st-day" aria-hidden="true">${dt ? WD[dt.getDay()] : ``}</span>
            </span>`;
        }).join(``)}
      </div>
      <p class="chart-readout" aria-live="polite" data-role="st-detail">棒をタップすると、その日の学習時間が表示されます(棒の上の数字は分)。</p>
      <p class="calc-note prog-note">これまでの合計 <strong>${durText(total)}</strong>。画面を操作している間だけを数えます(最後の操作から90秒まで。模擬試験の解答中は5分まで)。</p>`;
    wireReadout(card.querySelector(`[data-role="st-chart"]`), `.st-col`, card.querySelector(`[data-role="st-detail"]`));
    return card;
  }

  // ---- バッジ(Badges) ----
  function badgeCard() {
    if (!window.Badges || typeof Badges.list !== `function`) return null;
    let list = [];
    try { list = Badges.list(); } catch (e) {
      console.error(`[バッジ] 一覧を作れませんでした`, e);
      return null;
    }
    if (!Array.isArray(list) || !list.length) return null;
    const earned = list.filter((b) => b.earnedAt).length;
    const card = document.createElement(`section`);
    card.className = `card span-all badge-card`;
    card.id = `progress-badges`;
    card.setAttribute(`aria-labelledby`, `badge-title`);
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" id="badge-title">${ic(`trophy`)}バッジ</h3>
        <span class="badge-total num">${list.length}個中 <strong>${earned}</strong>個</span>
      </div>
      <ul class="badge-grid">
        ${list.map((b) => {
          const pr = b.progress;
          const unit = pr && pr.unit ? pr.unit : ``;
          const got = !!b.earnedAt;
          const status = got ? `${DateUtil.toJapanese(b.earnedAt)}に獲得` : pr ? `${pr.now}/${pr.goal}${unit}` : `未獲得`;
          const pct = pr && pr.goal > 0 ? Math.round((Math.min(pr.now, pr.goal) / pr.goal) * 100) : 0;
          return `
            <li class="badge-item${got ? ` is-earned` : ` is-locked`}">
              <span class="badge-icon" aria-hidden="true">${ic(b.icon || `star`, 22)}</span>
              <span class="badge-main">
                <span class="badge-name">${esc(b.name)}<span class="sr-only">${got ? `(獲得済み)` : `(未獲得)`}</span></span>
                <span class="badge-desc">${esc(b.desc)}</span>
                ${got ? `<span class="badge-status">${ic(`check-circle`, 14)}${esc(status)}</span>` : `
                  <span class="badge-progress">
                    <span class="progress-bar" role="progressbar" aria-label="${esc(`${b.name}の進み具合`)}" aria-valuemin="0" aria-valuemax="${pr ? pr.goal : 1}" aria-valuenow="${pr ? Math.min(pr.now, pr.goal) : 0}" aria-valuetext="${esc(status)}"><span class="progress-bar-fill" style="width:${pct}%"></span></span>
                    <span class="badge-status num" aria-hidden="true">${esc(status)}</span>
                  </span>`}
              </span>
            </li>`;
        }).join(``)}
      </ul>`;
    return card;
  }

  // ---- テーマ別の進捗(テーマ表示) ----
  function readObj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  // 学習済み(記憶済み★・学習済み✓)か
  function learnedFn() {
    const known = readObj(`flashcards`);
    const bp = readObj(`basicsProgress`);
    return (id) => !!known[id] || !!(bp[id] && typeof bp[id] === `object` && bp[id].learned);
  }

  // トピックで次に読む基礎知識(トピック画面の並び順で、まだ学習済みにしていない最初のもの)
  function nextBasic(topic, isLearned) {
    const order = (AppIndex.topicBasicOrder && AppIndex.topicBasicOrder[topic.id]) || topic.basicIds || [];
    const id = order.find((x) => AppIndex.termsById[x] && !isLearned(x));
    return id ? AppIndex.termsById[id] : null;
  }

  // テーマの項目数と学習済みの数(Analysis の集計がなければ用語の一覧から数える)
  function topicRowFor(snap, id, isLearned) {
    const fromSnap = snap && Array.isArray(snap.topics) ? snap.topics.find((t) => t.id === id) : null;
    if (fromSnap) return fromSnap;
    const ids = (AppIndex.topicTermIndex && AppIndex.topicTermIndex[id]) || [];
    return { id, total: ids.length, learned: ids.filter(isLearned).length, attempts: 0, accuracy: null };
  }

  // 選んだテーマの項目(重複なし)で数えた学習済み
  function themeScope(ids, isLearned) {
    const set = new Set();
    ids.forEach((id) => ((AppIndex.topicTermIndex && AppIndex.topicTermIndex[id]) || []).forEach((t) => set.add(t)));
    const total = set.size;
    const done = Array.from(set).filter(isLearned).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function themeRowHtml(topic, r, next, stmtCount) {
    const pct = r.total ? Math.round(((r.learned || 0) / r.total) * 100) : 0;
    const href = next ? `#topics/${encodeURIComponent(topic.id)}/${encodeURIComponent(next.id)}` : `#topics/${encodeURIComponent(topic.id)}`;
    const ox = stmtCount >= 10 ? { nav: `#ox/topic/${encodeURIComponent(topic.id)}/10`, label: `○×で10問` }
      : stmtCount > 0 ? { nav: `#ox/topic/${encodeURIComponent(topic.id)}`, label: `○×で腕試し` } : null;
    return `
      <li class="prog-theme">
        <a class="prog-theme-main" href="${href}">
          <span class="topic-icon">${ic(topic.icon || `book-open`)}</span>
          <span class="prog-theme-body">
            <span class="prog-theme-head"><span class="prog-theme-name">${esc(topic.name)}</span><span class="cat-bar-meta num"><span class="sr-only">学習済み</span>${r.learned || 0}/${r.total}</span></span>
            <span class="progress-bar" aria-hidden="true"><span class="progress-bar-fill${pct === 100 ? ` fill-success` : ``}" style="width:${pct}%"></span></span>
            <span class="prog-theme-next">${next ? `次に読む: <strong>${esc(next.name)}</strong>` : `基礎知識はすべて学習済みです`}</span>
          </span>
          ${ic(`chevron-right`, 18)}
        </a>
        <div class="prog-theme-meta">
          ${r.attempts ? `<span class="num">正答率 <strong>${r.accuracy}%</strong><span class="text-muted">(${r.attempts}問)</span></span>` : `<span class="text-muted">まだ問題を解いていません</span>`}
          ${ox ? `<a class="link-btn prog-theme-ox" href="${ox.nav}">${ox.label}${ic(`chevron-right`, 14)}</a>` : ``}
        </div>
      </li>`;
  }

  function themeCard(snap, ids, hasInterests, isLearned) {
    const card = document.createElement(`section`);
    card.className = `card span-all prog-theme-card`;
    card.id = `progress-themes`;
    card.setAttribute(`aria-labelledby`, `prog-theme-title`);
    const byTopic = (snap && snap.ctx && snap.ctx.statementsByTopic) || {};
    const rows = ids.map((id) => {
      const topic = AppIndex.topicsById[id];
      return themeRowHtml(topic, topicRowFor(snap, id, isLearned), nextBasic(topic, isLearned), byTopic[id] || 0);
    });
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title prog-theme-title" id="prog-theme-title">${ic(`target`)}テーマ別の進捗</h3>
        <a class="link-btn" href="#settings/profile">${hasInterests ? `テーマを変更` : `テーマを選ぶ`}</a>
      </div>
      <p class="prog-note">${hasInterests
        ? `設定で選んだ「気になるテーマ」ごとの学習済みの数です。「次に読む」から続きを読めます。`
        : `暮らし・取引の基本テーマごとの学習済みの数です。気になるテーマを選ぶと、そのテーマだけを表示します。`}</p>
      <ul class="prog-theme-list">${rows.join(``)}</ul>`;
    return card;
  }

  // 苦手なポイント(テーマ表示。分野で絞らず、間違えた問題・用語をそのまま出す)
  function themeWeakCard(snap) {
    const items = snap && Array.isArray(snap.weakPoints) ? snap.weakPoints.slice(0, THEME_WEAK_LIMIT) : [];
    if (!items.length) return null;
    const card = document.createElement(`section`);
    card.className = `card prog-weak-card`;
    card.id = `progress-weak`;
    card.setAttribute(`aria-labelledby`, `prog-weak-title`);
    card.innerHTML = `
      <h3 class="card-title ana-title" id="prog-weak-title">${ic(`alert`)}苦手なポイント</h3>
      <p class="prog-note">間違えた問題・用語です。タップすると解き直し・読み直しができます。</p>
      ${weakHtml(items, ``)}`;
    return card;
  }

  // テーマ表示の下: ほかの暮らし・取引のテーマと、試験向けの表示への入口
  function otherThemesCard(excluded) {
    const ids = LIFE_ORDER.filter((id) => topicExists(id) && !excluded.includes(id));
    const card = document.createElement(`section`);
    card.className = `card span-all prog-other-card`;
    card.innerHTML = `
      ${ids.length ? `<h3 class="card-title">ほかの暮らし・取引のテーマ</h3>` : ``}
      <div data-role="list"></div>
      <div class="prog-more-links">
        <a class="link-btn" href="#topics">${ic(`book-open`, 16)}すべてのトピック(宅建士・税理士試験も)${ic(`chevron-right`, 16)}</a>
        <a class="link-btn" href="#progress/exam">${ic(`chart`, 16)}試験の分野別の分析を見る${ic(`chevron-right`, 16)}</a>
      </div>`;
    if (ids.length) card.querySelector(`[data-role="list"]`).appendChild(topicListEl(ids));
    return card;
  }

  // ---- トピック別 ----
  // only: このトピックだけを出す(テーマ表示の「ほかのテーマ」)
  function topicListEl(only) {
    const wrapEl = document.createElement(`div`);
    wrapEl.className = `prog-topic-list`;
    const rows = Stats.byTopic().filter((r) => !only || only.includes(r.topic.id));
    if (only) rows.sort((a, b) => only.indexOf(a.topic.id) - only.indexOf(b.topic.id));
    wrapEl.innerHTML = rows.map((r) => `
          <a class="prog-topic" href="#topics/${r.topic.id}">
            <span class="topic-icon">${ic(r.topic.icon || `book-open`)}</span>
            <span class="prog-topic-main">
              <span class="prog-topic-head"><span class="prog-topic-name">${esc(r.topic.name)}</span><span class="cat-bar-meta">${r.done}/${r.total}</span></span>
              <span class="progress-bar"><span class="progress-bar-fill${r.pct === 100 ? ` fill-success` : ``}" style="width:${r.pct}%"></span></span>
            </span>
            ${ic(`chevron-right`, 18)}
          </a>`).join(``);
    return wrapEl;
  }

  function topicCard() {
    const card = document.createElement(`section`);
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

  function dataNote() {
    const p = document.createElement(`p`);
    p.className = `prog-data-note span-all`;
    p.innerHTML = `${ic(`shield`, 16)}<span>学習の記録はこの端末のブラウザの中だけに保存され、外部には送信されません。ブラウザのデータを消すと記録も消えるため、<a href="#settings">設定</a>からバックアップ(書き出し)しておくと安心です。</span>`;
    return p;
  }

  // テーマ表示: テーマ別の進捗 → まとめ → 苦手なポイント → 定着度 → カレンダー → (模擬試験を受けていれば)推移 → ほかのテーマ
  function renderThemes(wrap, grid, profile, param) {
    const chosen = interestTopicIds(profile);
    const ids = chosen.length ? chosen : LIFE_ORDER.filter(topicExists);
    const isLearned = learnedFn();
    const snap = safeAnalyze(`other`);
    const theme = themeCard(snap, ids, chosen.length > 0, isLearned);
    const weak = themeWeakCard(snap);
    const time = safeCard(studyTimeCard);
    const badges = safeCard(badgeCard);
    const cards = [theme, summaryCard(themeScope(ids, isLearned)), weak, time, srsCard(), heatmapCard()];
    if (examPoints().length) cards.push(examCard());
    cards.push(badges, otherThemesCard(chosen.length ? ids : LIFE_ORDER), dataNote());
    cards.filter(Boolean).forEach((el) => grid.appendChild(el));
    const jump = param === `weak` ? weak || theme : param === `time` ? time : param === `badges` ? badges : null;
    if (jump) requestAnimationFrame(() => jump.scrollIntoView({ block: `start`, behavior: `auto` }));
  }

  // v12 の新しいカードは、作れなくても進捗の画面はこれまでどおり出す
  function safeCard(fn) {
    try { return fn(); } catch (e) {
      console.error(`[progress] カードを作れませんでした`, e);
      return null;
    }
  }

  function render(root, param) {
    const profile = learnerProfile();
    const themes = useThemeView(profile, param);
    const wrap = document.createElement(`div`);
    wrap.className = `view progress-view${themes ? ` is-themes` : ``}`;
    wrap.innerHTML = `
      <h2>学習の進捗</h2>
      <p class="view-desc">${themes ? `気になるテーマごとの進み具合と、次に読むところを確認できます。` : `分野ごとの得意・苦手と、次にやることを確認できます。`}</p>
      <div class="prog-grid" data-role="grid"></div>`;
    root.appendChild(wrap);
    const grid = wrap.querySelector(`[data-role="grid"]`);
    if (themes) { renderThemes(wrap, grid, profile, param); return; }
    const state = createTypeState();
    const analysis = analysisCard(state);
    // 合格予測は宅建士の予測なので、最初に表示する試験が宅建士のときは先頭、ほかの試験のときは弱点分析のあと
    const predict = safeCard(predictCard);
    const time = safeCard(studyTimeCard);
    const badges = safeCard(badgeCard);
    const predictFirst = state.typeId === `takken`;
    // 並び: (合格予測) → 弱点分析 → (合格予測) → 模擬試験の推移 → まとめ → 学習時間 → 定着度 → カレンダー → バッジ → トピック別
    [predictFirst ? predict : null, analysis, predictFirst ? null : predict, examCard(), summaryCard(), time, srsCard(), heatmapCard(), badges, topicCard(), dataNote()]
      .filter(Boolean).forEach((el) => grid.appendChild(el));
    const jumps = { weak: analysis, predict, time, badges };
    const jump = param && Object.prototype.hasOwnProperty.call(jumps, param) ? jumps[param] : null;
    if (jump) {
      requestAnimationFrame(() => jump.scrollIntoView({ block: `start`, behavior: `auto` }));
    }
  }

  return { render };
})();
