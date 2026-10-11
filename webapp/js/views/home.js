// ホーム: 今日の学習(試験までの残り日数・今日の復習)・今日やること・学習の記録・弱点分析・模擬試験・続きから
// 「次にやること」は弱点分析(Analysis)の優先順を唯一の基準にし、ホームのどのカードも同じ並びを使う
window.Views = window.Views || {};
window.Views.home = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  // 表示名の候補(このアプリの範囲に合う試験だけ。簿記論・財務諸表論はこのアプリの分野と合わないため出さない)
  const NAME_SUGGESTIONS = [`宅建士試験`, `税理士試験(消費税法)`];
  const SEC_PER_CARD = 15; // 復習カード1枚あたりの目安(秒)
  const BACKUP_REMIND_DAYS = 30;
  const DAY_MS = 86400000;

  // 試験目標の登録・編集フォーム(シート)。設定画面・初回ガイドからも使う
  // existing を渡すと、その目標の編集になる
  function openTargetForm(onSaved, existing) {
    const editing = !!(existing && typeof existing.id === `string`);
    const types = Stats.examTypes();
    const minDefault = DateUtil.addDays(DateUtil.today(), -365);
    // 1年以上前の試験を編集するときも、そのまま保存できるように
    const minDate = editing && DateUtil.isValid(existing.date) && existing.date < minDefault ? existing.date : minDefault;
    const curType = editing ? existing.examTypeId : (types[0] && types[0].id);
    const form = document.createElement(`form`);
    form.className = `target-form`;
    form.innerHTML = `
      <p class="view-desc">試験日を登録すると、ホームに残り日数と1日あたりの学習量の目安が表示されます。</p>
      <div class="field-row">
        <label class="field">試験の種類
          <select class="field-select" name="examTypeId">
            ${types.map((t) => `<option value="${t.id}"${t.id === curType ? ` selected` : ``}>${esc(t.name)}</option>`).join(``)}
          </select>
        </label>
        <label class="field">試験日
          <input class="field-input" type="date" name="date" required min="${minDate}" value="${editing && DateUtil.isValid(existing.date) ? existing.date : ``}">
        </label>
      </div>
      <label class="field target-form-name">表示名
        <input class="field-input" type="text" name="name" list="exam-name-suggestions" maxlength="40" placeholder="例: 宅建士試験" required value="${editing ? esc(existing.name) : ``}">
        <datalist id="exam-name-suggestions">${NAME_SUGGESTIONS.map((n) => `<option value="${esc(n)}">`).join(``)}</datalist>
      </label>
      <p class="calc-note">試験日は受験する年の公式発表(試験実施機関のサイト)で確認してください。</p>
      <div class="card-actions">
        <button type="submit" class="btn">${ic(`check`)}${editing ? `保存する` : `登録する`}</button>
      </div>
    `;
    const typeSel = form.querySelector(`[name="examTypeId"]`);
    const nameInput = form.querySelector(`[name="name"]`);
    // 編集時は付けてある名前を勝手に書き換えない
    if (editing) nameInput.dataset.touched = `1`;
    function suggestName() {
      if (nameInput.dataset.touched) return;
      const t = Stats.examType(typeSel.value);
      nameInput.value = t && t.id !== `other` ? (t.id === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`) : ``;
    }
    nameInput.addEventListener(`input`, () => { nameInput.dataset.touched = `1`; });
    typeSel.addEventListener(`change`, suggestName);
    suggestName();

    const sheet = UI.sheet({ title: editing ? `試験日を編集` : `試験日を登録`, content: form });
    form.addEventListener(`submit`, (e) => {
      e.preventDefault();
      const date = form.querySelector(`[name="date"]`).value;
      if (!DateUtil.isValid(date)) return;
      if (editing) {
        Stats.updateTarget(existing.id, { name: nameInput.value, examTypeId: typeSel.value, date });
      } else {
        Stats.addTarget({ name: nameInput.value, examTypeId: typeSel.value, date });
      }
      sheet.close();
      UI.toast(editing ? `試験日を更新しました` : `試験日を登録しました`, `success`);
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

  // ---- 画面全体で1回だけ集計する ----
  function buildContext() {
    const target = Stats.primaryTarget();
    const type = target ? Stats.examType(target.examTypeId) : null;
    let snap = null;
    let actions = [];
    let summary = null;
    if (window.Analysis) {
      try {
        if (typeof Analysis.analyze === `function`) snap = Analysis.analyze();
      } catch (e) { snap = null; }
      if (snap && Array.isArray(snap.actions)) {
        actions = snap.actions;
        summary = snap.summary || null;
      } else {
        try { actions = Analysis.nextActions(undefined, 6) || []; } catch (e) { actions = []; }
        try { summary = Analysis.summary(); } catch (e) { summary = null; }
      }
    }
    const due = Stats.dueReviewCount();
    const newAvail = Stats.newAvailableToday();
    return { target, type, snap, actions, summary, due, newAvail, limit: Stats.newLimit(), newLeft: Stats.newCount() };
  }

  function snapCtx(ctx) {
    return ctx.snap && ctx.snap.ctx && typeof ctx.snap.ctx === `object` ? ctx.snap.ctx : {};
  }

  // 分析に使った試験(主目標の試験。分野がなければ宅建士)の分野名
  function categoryName(ctx, catId) {
    if (!catId) return ``;
    const rows = ctx.snap && Array.isArray(ctx.snap.categories) ? ctx.snap.categories : [];
    const row = rows.find((r) => r.id === catId);
    if (row) return row.name;
    const typeId = (ctx.summary && ctx.summary.examTypeId) || (ctx.type && ctx.type.id) || `takken`;
    const type = Stats.examType(typeId);
    const c = type && Array.isArray(type.categories) ? type.categories.find((x) => x.id === catId) : null;
    return c ? c.name : ``;
  }

  // 復習以外の「次にやること」(弱点分析の優先順)。リンク先が同じものは1つに
  function studyActions(ctx) {
    const seen = new Set([`#review`]);
    const out = [];
    ctx.actions.forEach((a) => {
      if (!a || typeof a.nav !== `string` || a.kind === `review` || seen.has(a.nav)) return;
      seen.add(a.nav);
      out.push(a);
    });
    if (!out.length && window.Recommend) {
      // 分析が使えないときは従来のおすすめ
      try {
        const r = Recommend.getNext({ skipReview: true });
        if (r && r.nav && r.nav !== `#review`) out.push({ kind: `recommend`, title: r.title, detail: r.detail, nav: r.nav, icon: r.icon });
      } catch (e) { /* おすすめなしで表示する */ }
    }
    return out;
  }

  function countIn(text, re) {
    const m = String(text || ``).match(re);
    return m ? Number(m[1]) : null;
  }

  function oxCountOf(a) {
    return countIn(a.title, /(\d+)問/) || countIn(a.nav, /\/(\d+)$/);
  }

  function weakTermTotal(ctx) {
    const c = snapCtx(ctx);
    if (typeof c.autoWeak === `number`) return c.autoWeak;
    try { return window.Analysis && Analysis.weakTermCount ? Analysis.weakTermCount() : null; } catch (e) { return null; }
  }

  // 今日やることの見出し: 「〜する(件数)」の形にそろえる
  function verbTitle(ctx, a) {
    const cat = categoryName(ctx, a.categoryId);
    const c = snapCtx(ctx);
    switch (a.kind) {
      case `ox`: {
        const n = oxCountOf(a);
        if (!cat) return a.title;
        return `${cat}を○×で${/仕上げ/.test(a.title) ? `仕上げる` : `確認`}${n ? `(${n}問)` : ``}`;
      }
      case `quiz`:
        if (!cat) return a.title;
        return a.icon === `target` ? `${cat}の苦手な用語を解き直す` : `${cat}の用語をクイズで確認`;
      case `auto-weak`: {
        const n = weakTermTotal(ctx);
        return `苦手な用語を解き直す${n ? `(${n}語)` : ``}`;
      }
      case `ox-weak`:
        return `間違えた○×を解き直す${typeof c.oxEverWrong === `number` && c.oxEverWrong ? `(${c.oxEverWrong}問)` : ``}`;
      case `ox-try`:
        return `○×一問一答で腕試し`;
      default:
        return a.title;
    }
  }

  // ヒーローの小さいボタン用: 短い動詞 + 対象(分野名・件数)
  function shortAction(ctx, a) {
    const cat = categoryName(ctx, a.categoryId);
    const c = snapCtx(ctx);
    switch (a.kind) {
      case `read`: return { label: `基礎知識を読む`, scope: cat };
      case `ox`: {
        const n = oxCountOf(a);
        return { label: `○×で${n || 10}問`, scope: cat };
      }
      case `quiz`: return { label: a.icon === `target` ? `苦手な用語を解き直す` : `用語クイズ`, scope: cat };
      case `auto-weak`: {
        const n = weakTermTotal(ctx);
        return { label: `苦手な用語を解き直す`, scope: n ? `${n}語` : `` };
      }
      case `ox-weak`: return { label: `間違えた○×を解き直す`, scope: c.oxEverWrong ? `${c.oxEverWrong}問` : `` };
      case `exam`: return { label: `模擬試験で確認`, scope: `宅建士` };
      case `ox-try`: return { label: `○×で腕試し`, scope: `1問数秒` };
      default: return { label: a.title, scope: `` };
    }
  }

  // ヒーローの「○×で10問」: 税理士は不動産と消費税、宅建士(または未登録)は優先して伸ばしたい分野
  function oxLink(ctx) {
    const typeId = ctx.type ? ctx.type.id : null;
    const c = snapCtx(ctx);
    const byCat = c.statementsByCat && typeof c.statementsByCat === `object` ? c.statementsByCat : null;
    const have = (id, min) => !byCat || (byCat[id] || 0) >= min;
    const sized = (id) => {
      const n = byCat ? Math.min(10, byCat[id] || 0) : 10;
      return n || 10;
    };
    if (typeId === `zeirishi`) {
      if (!have(`shohi`, 1)) return { nav: `#ox`, label: `○×一問一答`, scope: `` };
      return { nav: `#ox/cat/shohi/10`, label: `○×で${sized(`shohi`)}問`, scope: categoryName(ctx, `shohi`) || `不動産と消費税` };
    }
    if (typeId && typeId !== `takken`) return { nav: `#ox`, label: `○×一問一答`, scope: `` };
    const takken = Stats.examType(`takken`);
    const cats = takken && Array.isArray(takken.categories) ? takken.categories : [];
    const sameType = !ctx.summary || ctx.summary.examTypeId === `takken`;
    const focusId = sameType && ctx.summary && ctx.summary.focus ? ctx.summary.focus.id : null;
    let cat = cats.find((x) => x.id === focusId && have(x.id, 5)) || null;
    if (!cat && byCat) cat = cats.slice().sort((a, b) => (byCat[b.id] || 0) - (byCat[a.id] || 0)).find((x) => have(x.id, 5)) || null;
    if (!cat && !byCat) cat = cats.find((x) => x.id === `gyoho`) || null;
    if (!cat) return { nav: `#ox`, label: `○×一問一答`, scope: `` };
    return { nav: `#ox/cat/${cat.id}/10`, label: `○×で${sized(cat.id)}問`, scope: cat.name };
  }

  function minutesFor(cards) {
    return Math.max(1, Math.ceil((cards * SEC_PER_CARD) / 60));
  }

  // 新しい用語が出ない理由(上限0・上限に達した・すべて着手済み)
  function newDoneText(ctx) {
    if (!ctx.newLeft) return `すべての用語に着手済みです`;
    if (ctx.limit === 0) return `新しい用語は出さない設定です(設定で変更できます)`;
    return `今日の新しい用語の上限(${ctx.limit}語)に達しました(設定で変更できます)`;
  }

  function secButton(nav, icon, label, scope) {
    return `
      <a class="btn btn-secondary hero-sec" href="${esc(nav)}">
        ${ic(icon || `lightbulb`)}
        <span class="hero-sec-text"><span class="hero-sec-label">${esc(label)}</span>${scope ? `<small>${esc(scope)}</small>` : ``}</span>
      </a>`;
  }

  // ---- 今日の学習(ヒーロー) ----
  function heroCard(ctx) {
    const card = document.createElement(`section`);
    card.className = `card card-hero span-2 home-hero`;
    card.setAttribute(`aria-label`, `今日の学習`);
    const target = ctx.target;
    const today = DateUtil.today();
    let top = ``;
    const notes = [];
    let p = null;
    if (!target) {
      top = `
        <div class="hero-top">
          <span class="hero-name">${ic(`calendar`, 18)}試験日を登録しましょう</span>
          <button type="button" class="link-btn hero-top-link" data-role="add-target">登録する${ic(`chevron-right`, 16)}</button>
        </div>
        <p class="hero-sub">登録すると、残り日数と1日あたりの学習量の目安を表示します。</p>`;
    } else {
      p = Stats.pace(target);
      let days = ``;
      const date = DateUtil.toJapanese(target.date, true);
      // paceLine はアプリが作る数値と定型文だけ(利用者の入力を含まない)なので、句切りで折り返すよう HTML で組む
      let paceLine = ``;
      if (p.daysLeft > 0) {
        days = `<span class="hero-days"><span>あと</span><strong class="num">${p.daysLeft}</strong><span>日</span></span>`;
        // 予備日(直前の総復習用)はペースの計算に含めていないことを、同じ行で短く添える
        if (p.remaining > 0) {
          paceLine = `<span class="nowrap">残り${p.remaining}項目</span>・<span class="nowrap">1日${p.perDay}項目ペース</span>${p.buffer ? `<span class="nowrap">(直前${p.buffer}日は総復習用)</span>` : ``}`;
        } else if (p.total > 0) {
          paceLine = `このアプリの範囲はすべて学習済み。復習と解き直しで仕上げましょう`;
        }
      } else if (p.daysLeft === 0) {
        days = `<span class="hero-days"><strong>今日</strong></span>`;
        paceLine = `今日が試験日です。落ち着いて、がんばってください`;
      } else {
        days = `<span class="hero-days is-ended">終了</span>`;
        paceLine = `${-p.daysLeft}日前に終了`;
      }
      top = `
        <div class="hero-top">
          <span class="hero-name">${ic(`target`, 18)}<span>${esc(target.name)}</span></span>
          ${days}
        </div>
        <p class="hero-sub"><span class="nowrap">${date}</span>${paceLine ? `<span class="hero-pace">・${paceLine}</span>` : ``}</p>
        ${p.daysLeft < 0 ? `<button type="button" class="link-btn" data-role="add-target">${ic(`calendar`, 16)}次の目標を登録</button>` : ``}`;
      if (p.daysLeft > 0) {
        if (p.overLimit && p.remaining > 0) {
          notes.push(`<a class="hero-note is-warn" href="#settings/limit">${ic(`alert`, 16)}<span>今の設定(${p.newLimit ? `1日${p.newLimit}語` : `新しい用語を出さない`})では間に合いません</span>${ic(`chevron-right`, 16)}</a>`);
        }
        if (p.daysLeft <= 14) {
          notes.push(`<p class="hero-note">${ic(`flag`, 16)}<span>直前期: 新しい範囲より復習と弱点の解き直しを優先</span></p>`);
        } else if (p.suggestMock) {
          const span = p.daysLeft <= 30 ? `1か月` : `2か月`;
          notes.push(`<p class="hero-note">${ic(`timer`, 16)}<span>試験まで${span}を切りました。週1回の模擬試験で時間配分を確認しましょう</span></p>`);
        }
      }
    }

    // ボタン: 主ボタンは今日の復習(残っていなければ弱点分析の最優先)、小さいボタンは○×と次の学習
    const ox = oxLink(ctx);
    const acts = studyActions(ctx);
    const work = ctx.due + ctx.newAvail;
    let primary;
    let doneLine = ``;
    let rest = acts;
    if (work > 0) {
      const parts = [ctx.due ? `${ctx.due}件` : ``, ctx.newAvail ? `新規${ctx.newAvail}語` : ``].filter(Boolean).join(`+`);
      primary = { nav: `#review`, icon: `repeat`, title: `今日の復習をはじめる`, sub: `${parts}・約${minutesFor(work)}分` };
    } else {
      doneLine = `<p class="hero-done">${ic(`check-circle`, 16)}<span>今日の復習は完了${ctx.newLeft && ctx.limit === 0 ? `(新しい用語は出さない設定)` : ``}</span></p>`;
      const first = acts.find((a) => a.nav !== ox.nav) || null;
      if (first) {
        primary = { nav: first.nav, icon: first.icon || `lightbulb`, title: verbTitle(ctx, first), sub: first.detail || `` };
        rest = acts.filter((a) => a !== first);
      } else {
        primary = { nav: ox.nav, icon: `o-x`, title: `○×一問一答で確認`, sub: `1問数秒。間違えた文だけ解き直せます` };
      }
    }
    const secs = [];
    const urgent = p && p.daysLeft > 0 && p.daysLeft <= 14;
    if (primary.nav !== ox.nav) secs.push(secButton(ox.nav, `o-x`, ox.label, ox.scope));
    if (urgent && ctx.type && ctx.type.mockExam) {
      secs.push(secButton(`#exam`, `timer`, `模擬試験で確認`, ctx.type.shortName));
    } else {
      // 直前期は解き直しを優先。それ以外は弱点分析の優先順(○×と同じリンクは除く)
      const pool = rest.filter((a) => a.nav !== ox.nav && a.nav !== primary.nav);
      const pick = (urgent && pool.find((a) => a.kind === `ox-weak` || a.kind === `auto-weak` || (a.kind === `quiz` && a.icon === `target`)))
        || pool.find((a) => a.kind !== `ox`) || pool[0] || null;
      if (pick) {
        const s = shortAction(ctx, pick);
        secs.push(secButton(pick.nav, pick.icon, s.label, s.scope));
      }
    }

    const others = Stats.listTargets().filter((t) => !target || t.id !== target.id);
    card.innerHTML = `
      ${top}
      ${notes.join(``)}
      ${doneLine}
      <div class="hero-cta">
        <a class="btn btn-lg hero-primary" href="${esc(primary.nav)}">
          <span class="hero-primary-icon">${ic(primary.icon, 22)}</span>
          <span class="hero-primary-text"><span class="hero-primary-title">${esc(primary.title)}</span>${primary.sub ? `<span class="hero-primary-sub">${esc(primary.sub)}</span>` : ``}</span>
          ${ic(`chevron-right`, 20)}
        </a>
        ${secs.length ? `<div class="hero-row">${secs.join(``)}</div>` : ``}
      </div>
      ${others.length ? `<div class="chip-row hero-others">${others.map((t) => {
        const d = DateUtil.diffDays(today, t.date);
        return `<a class="chip chip-small chip-muted" href="#settings/targets" aria-label="${esc(t.name)} ${d >= 0 ? `あと${d}日` : `終了`}(設定でホームに表示する試験を切り替え)">${esc(t.name)} ${d >= 0 ? `あと${d}日` : `終了`}</a>`;
      }).join(``)}</div>` : ``}`;
    card.querySelectorAll(`[data-role="add-target"]`).forEach((b) => b.addEventListener(`click`, () => openTargetForm(() => Router.navigate(`#home`))));
    return card;
  }

  // ---- 今日やること: 今日の復習 + 弱点分析の「次にやること」上位3件 ----
  function todoCard(ctx) {
    const card = document.createElement(`section`);
    card.className = `card home-todo`;
    const items = [];
    if (ctx.due > 0) {
      items.push({ nav: `#review`, icon: `repeat`, tone: `is-warn`, title: `今日の復習をする(${ctx.due}件)`, sub: `復習のタイミングが来た用語があります${ctx.newAvail ? `。新しい用語も${ctx.newAvail}語` : ``}` });
    } else if (ctx.newAvail > 0) {
      items.push({ nav: `#review`, icon: `sparkles`, tone: ``, title: `新しい用語を覚える(${ctx.newAvail}語)`, sub: `今日の復習で、まだ学んでいない用語をカードで覚えましょう` });
    } else {
      items.push({ nav: `#review`, icon: `check-circle`, tone: `is-ok`, title: `今日の復習は完了`, sub: newDoneText(ctx) });
    }
    studyActions(ctx).slice(0, 3).forEach((a) => {
      const warn = a.kind === `auto-weak` || a.kind === `ox-weak` || (a.kind === `quiz` && a.icon === `target`);
      items.push({ nav: a.nav, icon: a.icon || `lightbulb`, tone: warn ? `is-warn` : ``, title: verbTitle(ctx, a), sub: a.detail || `` });
    });
    card.innerHTML = `
      <h3 class="card-title">今日やること</h3>
      <div class="todo-list">
        ${items.map((it) => `
          <a class="todo-item" href="${esc(it.nav)}">
            <span class="todo-icon ${it.tone}">${ic(it.icon)}</span>
            <span class="todo-main"><span class="todo-title">${esc(it.title)}</span>${it.sub ? `<span class="todo-sub">${esc(it.sub)}</span>` : ``}</span>
            ${ic(`chevron-right`, 18)}
          </a>`).join(``)}
      </div>`;
    return card;
  }

  // ---- 学習の記録: 曜日をそろえた7列(スマホ4週・PC8週) ----
  function streakCard() {
    const card = document.createElement(`section`);
    card.className = `card`;
    const weeks = window.matchMedia && window.matchMedia(`(min-width: 1024px)`).matches ? 8 : 4;
    const today = DateUtil.today();
    const dow = DateUtil.parse(today).getDay();
    const heat = Stats.heatmap((weeks - 1) * 7 + dow + 1);
    const current = Streak.getCurrentStreak();
    const longest = Streak.getLongestStreak();
    const total = Streak.totalActiveDays();
    const todayCount = heat.length ? heat[heat.length - 1].count : 0;
    let message;
    if (!total) message = `今日から記録をつけましょう。1問解くと、その日が記録されます。`;
    else if (!todayCount && current > 0) message = `今日はまだ記録がありません。1問解けば${current + 1}日連続になります。`;
    else message = `最長${longest}日連続・学習した日は合計${total}日です。`;
    const future = Array.from({ length: 6 - dow }, () => `<span class="streak-day is-future"></span>`).join(``);
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title">学習の記録</h3>
        <span class="streak-chip">${ic(`flame`, 16)}${current}日連続</span>
      </div>
      <div class="streak-week" aria-hidden="true">${[`日`, `月`, `火`, `水`, `木`, `金`, `土`].map((w) => `<span>${w}</span>`).join(``)}</div>
      <div class="streak-grid streak-weeks-${weeks}" role="img" aria-label="直近${weeks}週間の学習記録。学習した日は${heat.filter((d) => d.active).length}日">
        ${heat.map((d) => `<span class="streak-day${d.date === today ? ` today` : ``}" data-level="${d.level}" title="${DateUtil.toJapanese(d.date)}: ${d.count}回"></span>`).join(``)}${future}
      </div>
      <p class="calc-note streak-msg${!todayCount && current > 0 ? ` is-warn` : ``}">${esc(message)}</p>
      <div class="streak-legend" aria-hidden="true">少<span class="streak-day" data-level="0"></span><span class="streak-day" data-level="1"></span><span class="streak-day" data-level="2"></span><span class="streak-day" data-level="3"></span><span class="streak-day" data-level="4"></span>多</div>`;
    return card;
  }

  // ---- 弱点分析のまとめ(回答があるとき) / 分野別の進捗(まだ回答がないとき) ----
  function analysisCard(ctx) {
    const s = ctx.summary;
    if (s && s.hasData && s.mastery != null) {
      let rows = ctx.snap && Array.isArray(ctx.snap.categories) ? ctx.snap.categories : null;
      if (!rows) {
        try { rows = Analysis.byCategory(); } catch (e) { rows = []; }
      }
      rows = rows.filter((r) => r && r.available);
      const focusId = s.focus ? s.focus.id : null;
      const card = document.createElement(`section`);
      card.className = `card`;
      card.innerHTML = `
        <div class="recommend-head">
          <h3 class="card-title">弱点分析</h3>
          <a class="link-btn" href="#progress/weak">詳しく${ic(`chevron-right`, 16)}</a>
        </div>
        <div class="home-mastery"><strong class="num">${s.mastery}</strong><span>/100</span><span class="home-mastery-label">${esc(s.examName)}の総合習熟度</span></div>
        ${s.focus ? `<p class="calc-note home-card-note">いま伸ばしたい分野は<strong>${esc(s.focus.name)}</strong>(習熟度${s.focus.mastery}${s.focus.accuracy != null ? `・正答率${s.focus.accuracy}%` : ``})${s.focus.reason ? `。理由: ${esc(s.focus.reason)}` : ``}</p>` : ``}
        <div class="cat-bars home-cat-bars">
          ${rows.map((r) => `
            <div class="${r.id === focusId ? `is-focus` : ``}">
              <div class="cat-bar-head"><span class="cat-bar-name">${esc(r.name)}</span><span class="cat-bar-meta">習熟度${r.mastery}${r.accuracy != null ? `・正答率${r.accuracy}%` : ``}</span></div>
              <div class="progress-bar"><div class="progress-bar-fill${r.id === focusId ? ` fill-accent` : ``}" style="width:${Math.max(0, Math.min(100, Number(r.mastery) || 0))}%"></div></div>
            </div>`).join(``)}
        </div>`;
      return card;
    }
    // まだ回答がない: 学習済み・記憶済みの割合
    let typeId = ctx.type && Array.isArray(ctx.type.categories) ? ctx.type.id : `takken`;
    let type = Stats.examType(typeId);
    if (!type || !Array.isArray(type.categories)) { typeId = `takken`; type = Stats.examType(`takken`); }
    if (!type) return null;
    const rows = Stats.byCategory(typeId, { compact: true });
    const card = document.createElement(`section`);
    card.className = `card`;
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title">分野別の進捗</h3>
        <a class="link-btn" href="#progress">詳しく${ic(`chevron-right`, 16)}</a>
      </div>
      <p class="calc-note home-card-note">このアプリの${esc(type.shortName)}向けの範囲ごとに、学習済み・記憶済みにした項目の割合です。問題を解くと弱点分析に切り替わります。</p>
      <div class="cat-bars home-cat-bars">
        ${rows.map((r) => `
          <div>
            <div class="cat-bar-head"><span class="cat-bar-name">${esc(r.name)}${r.questions ? `<span class="topic-group-meta">(例年${r.questions}問)</span>` : ``}</span><span class="cat-bar-meta">${r.done}/${r.total}</span></div>
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${r.pct}%"></div></div>
          </div>`).join(``)}
      </div>`;
    return card;
  }

  // ---- 模擬試験(模擬試験がある試験・受けたことがあるときだけ) ----
  function examCard(ctx) {
    const history = Stats.examHistory().filter((e) => e && typeof e.score === `number` && typeof e.total === `number` && e.total > 0);
    const session = Storage.get(`examSession`, null);
    const hasSession = !!(session && typeof session === `object`);
    const mockType = !ctx.type || !!ctx.type.mockExam;
    if (!mockType && !history.length && !hasSession) return null;
    const card = document.createElement(`section`);
    card.className = `card`;
    const last = history[0];
    const best = history.reduce((m, e) => (!m || e.score / e.total > m.score / m.total ? e : m), null);
    card.innerHTML = `
      <h3 class="card-title">模擬試験</h3>
      ${last ? `
        <div class="stat-grid home-exam-stats">
          <div class="stat-tile"><span class="stat-value">${last.score}<small>/${last.total}</small></span><span class="stat-label">前回のスコア</span></div>
          <div class="stat-tile"><span class="stat-value">${best.score}<small>/${best.total}</small></span><span class="stat-label">最高スコア</span></div>
        </div>` : `<p class="view-desc">本番と同じ問題数・時間・分野配分で実力を確認できます(宅建士)。</p>`}
      <div class="card-actions home-card-actions">
        <a class="btn ${hasSession ? `` : `btn-secondary`}" href="#exam">${ic(hasSession ? `play` : `timer`)}${hasSession ? `中断中の試験を再開` : `模擬試験へ`}</a>
      </div>`;
    return card;
  }

  // ---- 税理士(消費税法)向け: 不動産と消費税の○× ----
  function oxShohiCard(ctx) {
    const c = snapCtx(ctx);
    const count = c.statementsByCat && typeof c.statementsByCat.shohi === `number` ? c.statementsByCat.shohi : null;
    if (count === 0) return null;
    const rows = ctx.snap && Array.isArray(ctx.snap.categories) ? ctx.snap.categories : [];
    const row = rows.find((r) => r.id === `shohi`) || null;
    const name = categoryName(ctx, `shohi`) || `不動産と消費税`;
    const card = document.createElement(`section`);
    card.className = `card`;
    card.innerHTML = `
      <h3 class="card-title">${esc(name)}の○×</h3>
      <p class="view-desc">1問数秒の○×一問一答で、${esc(name)}の論点を確認できます。間違えた文は○×画面の「間違えた文」から解き直せます。</p>
      ${row && row.attempts ? `<p class="calc-note home-card-note">この分野の回答 ${row.attempts}問${row.accuracy != null ? `・正答率${row.accuracy}%` : ``}${count ? `(○×の文は${count}問)` : ``}</p>` : count ? `<p class="calc-note home-card-note">○×の文は${count}問あります。</p>` : ``}
      <div class="card-actions home-card-actions">
        <a class="btn" href="#ox/cat/shohi/10">${ic(`o-x`)}10問はじめる</a>
        <a class="btn btn-secondary" href="#ox/cat/shohi/20">20問</a>
        <a class="btn btn-ghost" href="#topics/topicO">${ic(`book-open`)}トピックを読む</a>
      </div>`;
    return card;
  }

  // ---- 続きから(最後に開いたトピック。なければ目標の試験に合わせた最初のトピック) ----
  function continueCard(ctx) {
    const card = document.createElement(`section`);
    card.className = `card`;
    const lastId = Storage.get(`lastTopic`, null);
    const topic = typeof lastId === `string` ? AppIndex.topicsById[lastId] : null;
    const row = topic ? Stats.byTopic().find((r) => r.topic.id === topic.id) : null;
    const typeId = ctx.type ? ctx.type.id : null;
    const startId = typeId === `zeirishi` ? `topicO` : typeId === `takken` ? `topicK` : `topicI`;
    const start = AppIndex.topicsById[startId] || AppIndex.topicsById.topicI || null;
    const startNote = startId === `topicI` ? `まずはここから始めるのがおすすめ` : `${ctx.type.shortName}の学習はここから始めるのがおすすめ`;
    card.innerHTML = `
      <h3 class="card-title">${topic ? `続きから` : `学習をはじめる`}</h3>
      ${topic ? `
        <a class="todo-item" href="#topics/${topic.id}">
          <span class="todo-icon">${ic(topic.icon || `book-open`)}</span>
          <span class="todo-main"><span class="todo-title">${esc(topic.name)}</span><span class="todo-sub">進捗 ${row ? row.pct : 0}%</span></span>
          ${ic(`chevron-right`, 18)}
        </a>` : start ? `
        <a class="todo-item" href="#topics/${start.id}">
          <span class="todo-icon">${ic(start.icon || `sprout`)}</span>
          <span class="todo-main"><span class="todo-title">${esc(start.name)}</span><span class="todo-sub">${esc(startNote)}</span></span>
          ${ic(`chevron-right`, 18)}
        </a>` : ``}
      <div class="chip-row home-continue-chips">
        <a class="chip chip-small" href="#glossary">${ic(`layers`, 16)}用語集</a>
        <a class="chip chip-small" href="#quiz">${ic(`pencil-check`, 16)}クイズ</a>
        <a class="chip chip-small" href="#calculators">${ic(`calculator`, 16)}計算機</a>
      </div>`;
    return card;
  }

  // ---- サイトが新しくなりました(既存の利用者に1度だけ) ----
  function whatsNewCard() {
    const version = (window.Onboarding && Onboarding.WHATS_NEW) || `tier6`;
    if (Storage.get(`seenWhatsNew`, null) === version || !Storage.get(`onboardingDone`, null)) return null;
    const card = document.createElement(`section`);
    card.className = `card span-3 home-news`;
    card.innerHTML = `
      <div class="recommend-head">
        <h3 class="card-title">${ic(`sparkles`)} サイトが新しくなりました</h3>
        <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="お知らせを閉じる">${ic(`x`)}</button>
      </div>
      <ul class="view-desc home-news-list">
        <li><a href="#ox">○×一問一答</a>(1問数秒・間違えた文だけ解き直し)</li>
        <li>権利関係(民法等)・5問免除・不動産と消費税のトピックと4択問題を追加</li>
        <li><a href="#progress/weak">弱点分析</a>: 分野ごとの習熟度と次にやることを表示</li>
      </ul>`;
    card.querySelector(`[data-role="dismiss"]`).addEventListener(`click`, () => {
      Storage.set(`seenWhatsNew`, version);
      card.remove();
    });
    return card;
  }

  // ---- バックアップのお知らせ(学習記録があり、30日以上バックアップしていないとき) ----
  function validTs(v) {
    return typeof v === `number` && Number.isFinite(v) && v > 0 && v <= 8.64e15;
  }

  function backupNote() {
    const now = Date.now();
    const dismissed = Storage.get(`backupNoteDismissedAt`, 0);
    if (validTs(dismissed) && now - dismissed < BACKUP_REMIND_DAYS * DAY_MS) return null;
    const log = Storage.get(`activityLog`, {});
    const days = Object.keys(log).filter((d) => DateUtil.isValid(d) && Streak.countOf(log[d])).sort();
    if (!days.length && !Object.keys(Srs.getAllCards()).length) return null;
    const last = Storage.get(`lastBackupAt`, 0);
    let text;
    if (validTs(last)) {
      const ago = Math.floor((now - last) / DAY_MS);
      if (ago <= BACKUP_REMIND_DAYS) return null;
      text = `最後のバックアップから${ago}日たっています`;
    } else {
      // まだ一度もバックアップしていない: 学習を始めてから30日を過ぎたら知らせる
      const first = days[0];
      if (!first || DateUtil.diffDays(first, DateUtil.today()) <= BACKUP_REMIND_DAYS) return null;
      text = `学習データのバックアップがまだありません`;
    }
    const card = document.createElement(`section`);
    card.className = `card card-compact span-3 home-note`;
    card.innerHTML = `
      <span class="home-note-icon">${ic(`shield`)}</span>
      <div class="home-note-main">
        <strong>${esc(text)}</strong>
        <span>記録はこの端末のブラウザにだけ保存されています。設定からバックアップ(JSON)を取っておきましょう。</span>
      </div>
      <div class="home-note-actions">
        <a class="btn btn-sm btn-secondary" href="#settings/backup">${ic(`download`, 16)}バックアップ</a>
        <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="バックアップのお知らせを閉じる">${ic(`x`)}</button>
      </div>`;
    card.querySelector(`[data-role="dismiss"]`).addEventListener(`click`, () => {
      Storage.set(`backupNoteDismissedAt`, Date.now());
      card.remove();
    });
    return card;
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view home-view`;
    wrap.dataset.docTitle = `ホーム`;
    wrap.innerHTML = `
      <div class="home-greeting">
        <h2>${greeting()}</h2>
        <p class="view-desc">${DateUtil.toJapanese(DateUtil.today(), true)}</p>
      </div>
      <div class="home-grid" data-role="grid"></div>
    `;
    root.appendChild(wrap);
    const grid = wrap.querySelector(`[data-role="grid"]`);
    const ctx = buildContext();
    const zeirishi = !!(ctx.type && ctx.type.id === `zeirishi`);
    [
      heroCard(ctx),
      todoCard(ctx),
      whatsNewCard(),
      backupNote(),
      streakCard(),
      analysisCard(ctx),
      zeirishi ? oxShohiCard(ctx) : null,
      examCard(ctx),
      continueCard(ctx),
    ].filter(Boolean).forEach((c) => grid.appendChild(c));
  }

  return { render, openTargetForm };
})();
