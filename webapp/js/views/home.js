// ホーム: 試験までのカウントダウン・今日やること・ストリーク・分野別の進捗・模擬試験・続きから
window.Views = window.Views || {};
window.Views.home = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  const NAME_SUGGESTIONS = [`宅建士試験`, `税理士試験(消費税法)`, `税理士試験(簿記論)`, `税理士試験(財務諸表論)`];

  // 試験目標の登録フォーム(シート)。設定画面からも使う
  function openTargetForm(onSaved) {
    const types = Stats.examTypes();
    const form = document.createElement(`form`);
    form.className = `target-form`;
    form.innerHTML = `
      <p class="view-desc">試験日を登録すると、ホームに残り日数と1日あたりの学習量の目安が表示されます。</p>
      <div class="field-row">
        <label class="field">試験の種類
          <select class="field-select" name="examTypeId">
            ${types.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join(``)}
          </select>
        </label>
        <label class="field">試験日
          <input class="field-input" type="date" name="date" required min="${DateUtil.addDays(DateUtil.today(), -365)}">
        </label>
      </div>
      <label class="field" style="margin-top: var(--sp-3);">表示名
        <input class="field-input" type="text" name="name" list="exam-name-suggestions" maxlength="40" placeholder="例: 宅建士試験" required>
        <datalist id="exam-name-suggestions">${NAME_SUGGESTIONS.map((n) => `<option value="${esc(n)}">`).join(``)}</datalist>
      </label>
      <p class="calc-note" style="margin-top: var(--sp-2);">試験日は受験する年の公式発表(試験実施機関のサイト)で確認してください。</p>
      <div class="card-actions">
        <button type="submit" class="btn">${ic(`check`)}登録する</button>
      </div>
    `;
    const typeSel = form.querySelector(`[name="examTypeId"]`);
    const nameInput = form.querySelector(`[name="name"]`);
    function suggestName() {
      if (nameInput.dataset.touched) return;
      const t = Stats.examType(typeSel.value);
      nameInput.value = t && t.id !== `other` ? (t.id === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`) : ``;
    }
    nameInput.addEventListener(`input`, () => { nameInput.dataset.touched = `1`; });
    typeSel.addEventListener(`change`, suggestName);
    suggestName();

    const sheet = UI.sheet({ title: `試験日を登録`, content: form });
    form.addEventListener(`submit`, (e) => {
      e.preventDefault();
      const date = form.querySelector(`[name="date"]`).value;
      if (!DateUtil.isValid(date)) return;
      Stats.addTarget({ name: nameInput.value, examTypeId: typeSel.value, date });
      sheet.close();
      UI.toast(`試験日を登録しました`, `success`);
      if (onSaved) onSaved();
    });
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return `夜遅くまでお疲れさまです`;
    if (h < 11) return `おはようございます`;
    if (h < 18) return `こんにちは`;
    return `こんばんは`;
  }

  function countdownCard() {
    const card = document.createElement(`section`);
    card.className = `card card-hero span-2`;
    const target = Stats.primaryTarget();
    if (!target) {
      card.innerHTML = `
        <div class="countdown">
          <div class="countdown-label">${ic(`calendar`, 18)}試験までのカウントダウン</div>
          <div class="countdown-exam">試験日を登録しましょう</div>
          <p class="view-desc" style="margin:0;">宅建士・税理士など目標の試験日を登録すると、残り日数と1日あたりの学習量の目安を表示します。</p>
          <div class="card-actions"><button type="button" class="btn" data-role="add-target">${ic(`calendar`)}試験日を登録</button></div>
        </div>`;
      card.querySelector(`[data-role="add-target"]`).addEventListener(`click`, () => openTargetForm(() => Router.navigate(`#home`)));
      return card;
    }

    const p = Stats.pace(target);
    const others = Stats.listTargets().filter((t) => t.id !== target.id);
    let main;
    if (p.daysLeft > 0) {
      main = `
        <div class="countdown-days"><span>あと</span><strong>${p.daysLeft}</strong><span>日</span></div>
        <div class="countdown-date">${DateUtil.toJapanese(target.date, true)}</div>
        <div class="countdown-pace">
          <span class="pace-pill">${ic(`book-open`, 16)}新規 <strong>${p.perDay}</strong>件/日</span>
          <span class="pace-pill">${ic(`repeat`, 16)}今日の復習 <strong>${p.dueToday}</strong>件</span>
          <span class="pace-pill">${ic(`check-circle`, 16)}未学習 <strong>${p.remaining}</strong>/${p.total}</span>
        </div>
        ${p.suggestMock ? `<p class="calc-note" style="margin:var(--sp-2) 0 0;">試験まで2か月を切りました。週1回の模擬試験で時間配分を確認しましょう。</p>` : ``}
        ${p.buffer ? `<p class="calc-note" style="margin:var(--sp-1) 0 0;">直前の${p.buffer}日は総復習用の予備日として、新規学習量の計算から除いています。</p>` : ``}`;
    } else if (p.daysLeft === 0) {
      main = `<div class="countdown-days"><strong>今日</strong><span>が試験日です。落ち着いて、がんばってください。</span></div>`;
    } else {
      main = `
        <div class="countdown-date">${DateUtil.toJapanese(target.date, true)}(${-p.daysLeft}日前に終了)</div>
        <div class="card-actions"><button type="button" class="btn btn-secondary" data-role="add-target">${ic(`calendar`)}次の目標を登録</button></div>`;
    }
    card.innerHTML = `
      <div class="countdown">
        <div class="countdown-label">${ic(`target`, 18)}目標の試験</div>
        <div class="countdown-exam">${esc(target.name)}</div>
        ${main}
        ${others.length ? `<div class="chip-row" style="margin-top:var(--sp-2);">${others.map((t) => {
          const d = DateUtil.diffDays(DateUtil.today(), t.date);
          return `<span class="chip chip-small chip-muted" style="cursor:default;">${esc(t.name)} ${d >= 0 ? `あと${d}日` : `終了`}</span>`;
        }).join(``)}</div>` : ``}
      </div>`;
    const addBtn = card.querySelector(`[data-role="add-target"]`);
    if (addBtn) addBtn.addEventListener(`click`, () => openTargetForm(() => Router.navigate(`#home`)));
    return card;
  }

  function todoCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const due = Stats.dueReviewCount();
    const rec = Recommend.getNext({ skipReview: true });
    const items = [];
    if (due > 0) {
      items.push({ nav: `#review`, icon: `repeat`, tone: `is-warn`, title: `今日の復習 ${due}件`, sub: `復習のタイミングが来た用語があります` });
    } else {
      items.push({ nav: `#review`, icon: `check-circle`, tone: `is-ok`, title: `今日の復習は完了`, sub: Stats.newCount() ? `新しい用語を学ぶこともできます` : `すべての用語に着手済みです` });
    }
    items.push({ nav: rec.nav, icon: rec.icon || `lightbulb`, tone: rec.tone === `warn` ? `is-warn` : rec.tone === `ok` ? `is-ok` : ``, title: rec.title, sub: rec.detail });
    card.innerHTML = `
      <h3 class="card-title">今日やること</h3>
      <div class="todo-list">
        ${items.map((it) => `
          <a class="todo-item" href="${it.nav}">
            <span class="todo-icon ${it.tone}">${ic(it.icon)}</span>
            <span class="todo-main"><span class="todo-title">${esc(it.title)}</span><span class="todo-sub">${esc(it.sub)}</span></span>
            ${ic(`chevron-right`, 18)}
          </a>`).join(``)}
      </div>`;
    return card;
  }

  function streakCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const days = window.matchMedia && window.matchMedia(`(min-width: 1024px)`).matches ? 28 : 14;
    const current = Streak.getCurrentStreak();
    const longest = Streak.getLongestStreak();
    const heat = Stats.heatmap(days);
    const today = DateUtil.today();
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">学習の記録</h3>
        <span class="streak-chip">${ic(`flame`, 16)}${current}日連続</span>
      </div>
      <div class="streak-heatmap" role="img" aria-label="直近${days}日の学習記録">
        ${heat.map((d) => `<span class="streak-day${d.date === today ? ` today` : ``}" data-level="${d.level}" title="${DateUtil.toJapanese(d.date)}: ${d.count}回"></span>`).join(``)}
      </div>
      <p class="calc-note" style="margin: var(--sp-2) 0 0;">最長 ${longest}日連続・学習した日 合計${Streak.totalActiveDays()}日。色が濃いほどその日の学習量が多い日です。</p>`;
    return card;
  }

  function categoryCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const target = Stats.primaryTarget();
    let typeId = target ? target.examTypeId : `takken`;
    let type = Stats.examType(typeId);
    if (!type || !Array.isArray(type.categories)) { typeId = `takken`; type = Stats.examType(`takken`); }
    const rows = Stats.byCategory(typeId, { compact: true });
    // 正答率は弱点分析(○×・模擬試験を含む)と同じ数え方にそろえる。統合表示の分野(税・その他)は合算
    const merge = type.compactMerge || {};
    const totals = {};
    try {
      if (window.Analysis && Analysis.byCategory) {
        Analysis.byCategory(typeId).forEach((r) => {
          const key = merge[r.id] || r.id;
          totals[key] = totals[key] || { correct: 0, attempts: 0 };
          totals[key].correct += r.correct || 0;
          totals[key].attempts += r.attempts || 0;
        });
      }
    } catch (e) { /* 分析に失敗しても進捗バーは表示する */ }
    const accuracyOf = (r) => (totals[r.id] ? (totals[r.id].attempts ? Math.round((totals[r.id].correct / totals[r.id].attempts) * 100) : null) : r.accuracy);
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">分野別の進捗</h3>
        <a class="link-btn" href="#progress">詳しく${ic(`chevron-right`, 16)}</a>
      </div>
      <p class="calc-note" style="margin:0 0 var(--sp-3);">${esc(type.shortName)}の出題分野ごとに、学習済み・記憶済みにした項目の割合です。</p>
      <div class="cat-bars">
        ${rows.map((r) => `
          <div>
            <div class="cat-bar-head"><span class="cat-bar-name">${esc(r.name)}${r.questions ? `<span class="topic-group-meta">(例年${r.questions}問)</span>` : ``}</span><span class="cat-bar-meta">${r.done}/${r.total}${accuracyOf(r) != null ? `・正答率${accuracyOf(r)}%` : ``}</span></div>
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${r.pct}%"></div></div>
          </div>`).join(``)}
      </div>`;
    return card;
  }

  // 弱点分析のまとめ(js/analysis.js)。回答がまだなければ出さない
  function analysisCard() {
    if (!window.Analysis || typeof Analysis.summary !== `function`) return null;
    let s = null;
    try { s = Analysis.summary(); } catch (e) { return null; }
    if (!s || !s.hasData || s.mastery == null) return null;
    const a = s.topStudyAction;
    const card = document.createElement(`section`);
    card.className = `card`;
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">弱点分析</h3>
        <a class="link-btn" href="#progress/weak">詳しく${ic(`chevron-right`, 16)}</a>
      </div>
      <p class="calc-note" style="margin:0 0 var(--sp-3);">${esc(s.examName)}の総合習熟度 <strong>${s.mastery}</strong>/100${s.focus ? `。いま伸ばしたい分野は<strong>${esc(s.focus.name)}</strong>(習熟度${s.focus.mastery}${s.focus.accuracy != null ? `・正答率${s.focus.accuracy}%` : ``})` : ``}</p>
      ${a ? `
        <a class="todo-item" href="${esc(a.nav)}">
          <span class="todo-icon">${ic(a.icon || `lightbulb`)}</span>
          <span class="todo-main"><span class="todo-title">${esc(a.title)}</span><span class="todo-sub">${esc(a.detail)}</span></span>
          ${ic(`chevron-right`, 18)}
        </a>` : ``}`;
    return card;
  }

  function examCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const history = Stats.examHistory().filter((e) => e && typeof e.score === `number` && typeof e.total === `number` && e.total > 0);
    const last = history[0];
    const best = history.reduce((m, e) => (!m || e.score / e.total > m.score / m.total ? e : m), null);
    const session = Storage.get(`examSession`, null);
    card.innerHTML = `
      <h3 class="card-title">模擬試験</h3>
      ${last ? `
        <div class="stat-grid" style="margin-bottom: var(--sp-3);">
          <div class="stat-tile"><span class="stat-value">${last.score}<small>/${last.total}</small></span><span class="stat-label">前回のスコア</span></div>
          <div class="stat-tile"><span class="stat-value">${best.score}<small>/${best.total}</small></span><span class="stat-label">最高スコア</span></div>
        </div>` : `<p class="view-desc">本番と同じ問題数・時間・分野配分で実力を確認できます(宅建士)。</p>`}
      <div class="card-actions" style="margin-top:0;">
        <a class="btn ${session ? `` : `btn-secondary`}" href="#exam">${ic(session ? `play` : `timer`)}${session ? `中断中の試験を再開` : `模擬試験へ`}</a>
      </div>`;
    return card;
  }

  function continueCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const lastId = Storage.get(`lastTopic`, null);
    const topic = typeof lastId === `string` ? AppIndex.topicsById[lastId] : null;
    const row = topic ? Stats.byTopic().find((r) => r.topic.id === topic.id) : null;
    card.innerHTML = `
      <h3 class="card-title">${topic ? `続きから` : `学習をはじめる`}</h3>
      ${topic ? `
        <a class="todo-item" href="#topics/${topic.id}">
          <span class="todo-icon">${ic(topic.icon || `book-open`)}</span>
          <span class="todo-main"><span class="todo-title">${esc(topic.name)}</span><span class="todo-sub">進捗 ${row ? row.pct : 0}%</span></span>
          ${ic(`chevron-right`, 18)}
        </a>` : `
        <a class="todo-item" href="#topics/topicI">
          <span class="todo-icon">${ic(`sprout`)}</span>
          <span class="todo-main"><span class="todo-title">初めての一人暮らし実践ガイド</span><span class="todo-sub">まずはここから始めるのがおすすめ</span></span>
          ${ic(`chevron-right`, 18)}
        </a>`}
      <div class="chip-row" style="margin-top: var(--sp-3);">
        <a class="chip chip-small" href="#glossary">${ic(`layers`, 16)}用語集</a>
        <a class="chip chip-small" href="#quiz">${ic(`pencil-check`, 16)}クイズ</a>
        <a class="chip chip-small" href="#calculators">${ic(`calculator`, 16)}計算機</a>
      </div>`;
    return card;
  }

  function whatsNewCard() {
    if (Storage.get(`seenWhatsNew`, null) === `tier5` || !Storage.get(`onboardingDone`, null)) return null;
    const card = document.createElement(`section`);
    card.className = `card span-3`;
    card.style.borderColor = `var(--color-primary)`;
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title" style="margin:0;">${ic(`sparkles`)} サイトが新しくなりました</h3>
        <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="閉じる">${ic(`x`)}</button>
      </div>
      <ul class="view-desc" style="margin:0; padding-left: 1.2em;">
        <li>このホーム画面で、試験までの残り日数と今日やることを確認できます</li>
        <li>宅建士試験の約4割を占める「宅建業法」のトピックを追加しました</li>
        <li>本番形式の模擬試験、図解、ブックマーク、計算機の追加など</li>
      </ul>`;
    card.querySelector(`[data-role="dismiss"]`).addEventListener(`click`, () => {
      Storage.set(`seenWhatsNew`, `tier5`);
      card.remove();
    });
    return card;
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view home-view`;
    wrap.innerHTML = `
      <div class="home-greeting">
        <h2>${greeting()}</h2>
        <p class="view-desc" style="margin:0;">${DateUtil.toJapanese(DateUtil.today(), true)}</p>
      </div>
      <div class="home-grid" data-role="grid"></div>
    `;
    root.appendChild(wrap);
    const grid = wrap.querySelector(`[data-role="grid"]`);
    const news = whatsNewCard();
    if (news) grid.appendChild(news);
    [countdownCard(), todoCard(), streakCard(), analysisCard(), categoryCard(), examCard(), continueCard()].filter(Boolean).forEach((c) => grid.appendChild(c));
  }

  return { render, openTargetForm };
})();
