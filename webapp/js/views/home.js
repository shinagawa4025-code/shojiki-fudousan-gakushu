// ホーム: 学ぶ目的(learnerProfile)と試験日で2種類の表示にする
//  どちらも一番上に「今日のメニュー(約15分)」(Recommend.todayMenu: 復習 → 解き直し → 苦手の○× → 新しい基礎知識)
//  試験向け(宅建士・税理士の目的、または試験日を登録済み): 今日の学習リング・残り日数・次にやること・分野別の習熟度
//  暮らし・仕事向け: 今日の1テーマ・目的から選ぶ・続きから・次にやること(気になるテーマの基礎知識)
// 「次にやること」は弱点分析(Analysis)の優先順を基準にし、同じリンク先のボタンは画面の中で1回だけ出す
// (今日のメニューに出したリンクは、ヒーロー・次にやることでは重ねない。メニューが終わるまではヒーローの主ボタンも出さない)
window.Views = window.Views || {};
window.Views.home = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  // 表示名の候補(このアプリの範囲に合う試験だけ。簿記論・財務諸表論はこのアプリの分野と合わないため出さない)
  const NAME_SUGGESTIONS = [`宅建士試験`, `税理士試験(消費税法)`];
  const SEC_PER_CARD = 15; // 復習カード1枚あたりの目安(秒)
  const BACKUP_REMIND_DAYS = 30;
  const BACKUP_REMIND_DAYS_IOS = 7; // iPhone・iPad の Safari は長く開かないと記録が消えることがあるため早めに
  const INSTALL_REMIND_DAYS = 30;
  const DAY_MS = 86400000;
  const DAILY_GOAL = 10; // 今日の学習リングの目標(解いた・評価した回数)
  const WEEKDAYS = [`日`, `月`, `火`, `水`, `木`, `金`, `土`];
  // 暮らし・仕事向けの「目的から選ぶ」(宅建士をめざすは試験日の登録へ)
  const PURPOSES = [
    { label: `部屋を借りる`, icon: `key`, topicId: `topicA` },
    { label: `家を買う・売る`, icon: `handshake`, topicId: `topicB` },
    { label: `ローン・お金`, icon: `yen`, topicId: `topicC` },
    { label: `税金・相続`, icon: `receipt`, topicId: `topicH` },
    { label: `トラブル対策`, icon: `shield`, topicId: `topicG` },
    { label: `宅建士をめざす`, icon: `scale`, action: `takken` },
  ];
  // 計算機のタイルの補足(気になるテーマの先頭に合わせる)
  const CALC_SUB = { rent: `初期費用・家賃`, buy: `ローン・諸費用`, sell: `売却の税金・費用`, inherit: `相続税の土地評価`, landlord: `固定資産税など`, trouble: `初期費用・ローン` };

  function rerender() {
    if (window.Router) Router.navigate(`#home`);
  }

  // 試験目標の登録・編集フォーム(シート)。設定画面・初回ガイドからも使う
  // existing を渡すと、その目標の編集になる。opts.examTypeId: 新しく登録するときに選んでおく試験
  function openTargetForm(onSaved, existing, opts) {
    opts = opts || {};
    const editing = !!(existing && typeof existing.id === `string`);
    const types = Stats.examTypes();
    const minDefault = DateUtil.addDays(DateUtil.today(), -365);
    // 1年以上前の試験を編集するときも、そのまま保存できるように
    const minDate = editing && DateUtil.isValid(existing.date) && existing.date < minDefault ? existing.date : minDefault;
    const preset = opts.examTypeId && Stats.examType(opts.examTypeId) ? opts.examTypeId : null;
    const curType = editing ? existing.examTypeId : (preset || (types[0] && types[0].id));
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
      <div class="chip-row target-official" data-role="officials" hidden></div>
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
    const dateInput = form.querySelector(`[name="date"]`);
    const officialsEl = form.querySelector(`[data-role="officials"]`);
    // 編集時は付けてある名前を勝手に書き換えない
    if (editing) nameInput.dataset.touched = `1`;
    function suggestName() {
      if (nameInput.dataset.touched) return;
      const t = Stats.examType(typeSel.value);
      nameInput.value = t && t.id !== `other` ? (t.id === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`) : ``;
    }
    // 公式の試験日(まだ来ていないもの)をワンタップで入れる
    function paintOfficials() {
      const list = Stats.officialDates ? Stats.officialDates(typeSel.value) : [];
      officialsEl.hidden = !list.length;
      officialsEl.innerHTML = list.map((o) => {
        const d = DateUtil.parse(o.date);
        const md = d ? `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})` : o.date;
        return `<button type="button" class="chip chip-small" data-date="${o.date}" aria-pressed="${dateInput.value === o.date}">${ic(`calendar`, 14)}${esc(o.label)} ${md}</button>`;
      }).join(``);
      officialsEl.querySelectorAll(`[data-date]`).forEach((b) => b.addEventListener(`click`, () => {
        dateInput.value = b.dataset.date;
        officialsEl.querySelectorAll(`[data-date]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
      }));
    }
    nameInput.addEventListener(`input`, () => { nameInput.dataset.touched = `1`; });
    typeSel.addEventListener(`change`, () => { suggestName(); paintOfficials(); });
    dateInput.addEventListener(`input`, () => officialsEl.querySelectorAll(`[data-date]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x.dataset.date === dateInput.value))));
    suggestName();
    paintOfficials();

    const sheet = UI.sheet({ title: editing ? `試験日を編集` : `試験日を登録`, content: form });
    form.addEventListener(`submit`, (e) => {
      e.preventDefault();
      const date = dateInput.value;
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

  // 10月12日(月)
  function shortDate(s, withWeekday) {
    const d = DateUtil.parse(s);
    if (!d) return ``;
    return `${d.getMonth() + 1}月${d.getDate()}日${withWeekday ? `(${WEEKDAYS[d.getDay()]})` : ``}`;
  }

  function validTs(v) {
    return typeof v === `number` && Number.isFinite(v) && v > 0 && v <= 8.64e15;
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // ---- 画面全体で1回だけ集計する ----
  function buildContext() {
    const profile = Stats.getProfile ? Stats.getProfile() : null;
    const target = Stats.primaryTarget();
    const type = target ? Stats.examType(target.examTypeId) : null;
    const goalTypeId = Stats.goalExamTypeId ? Stats.goalExamTypeId(profile) : null;
    // 試験として扱う種類: 主目標の試験 > 学ぶ目的の試験(暮らし・仕事で試験日がなければ null)
    const typeId = type ? type.id : goalTypeId;
    // 弱点分析に使う試験: 分野がある試験(主目標 > 目的)。なければ分析側の既定(宅建士)
    const analysisTypeId = type && Array.isArray(type.categories) ? type.id : goalTypeId || undefined;
    let snap = null;
    let actions = [];
    let summary = null;
    if (window.Analysis) {
      try {
        if (typeof Analysis.analyze === `function`) snap = Analysis.analyze(analysisTypeId);
      } catch (e) { snap = null; }
      if (snap && Array.isArray(snap.actions)) {
        actions = snap.actions;
        summary = snap.summary || null;
      } else {
        try { actions = Analysis.nextActions(analysisTypeId, 6) || []; } catch (e) { actions = []; }
        try { summary = Analysis.summary(analysisTypeId); } catch (e) { summary = null; }
      }
    }
    const activeDays = Streak.totalActiveDays();
    return {
      profile,
      target,
      type,
      goalTypeId,
      typeId,
      variant: target || goalTypeId ? `exam` : `general`,
      interests: Stats.interestTopicIds ? Stats.interestTopicIds(profile) : [],
      snap,
      actions,
      summary,
      due: Stats.dueReviewCount(),
      newAvail: Stats.newAvailableToday(),
      limit: Stats.newLimit(),
      newLeft: Stats.newCount(),
      cards: Object.keys(Srs.getAllCards()).length,
      activeDays,
      newcomer: activeDays === 0,
      streak: Streak.getCurrentStreak(),
      todayCount: Streak.todayCount ? Streak.todayCount() : Streak.countOf(Storage.get(`activityLog`, {})[DateUtil.today()]),
    };
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
    const typeId = (ctx.summary && ctx.summary.examTypeId) || ctx.typeId || `takken`;
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

  // 次にやることの見出し: 「〜する(件数)」の形にそろえる
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

  // ヒーローの小さいタイル用: 短い動詞 + 対象(分野名・件数)。タイルは幅が狭いので動詞は短く
  function shortAction(ctx, a) {
    const cat = categoryName(ctx, a.categoryId);
    const c = snapCtx(ctx);
    switch (a.kind) {
      case `read`: return { label: `基礎を読む`, scope: cat };
      case `ox`: {
        const n = oxCountOf(a);
        return { label: `○×で${n || 10}問`, scope: cat };
      }
      case `quiz`: return { label: a.icon === `target` ? `苦手を解き直す` : `用語クイズ`, scope: cat };
      case `auto-weak`: {
        const n = weakTermTotal(ctx);
        return { label: `苦手を解き直す`, scope: n ? `用語${n}語` : `` };
      }
      case `ox-weak`: return { label: `間違いを解き直す`, scope: c.oxEverWrong ? `○×${c.oxEverWrong}問` : `` };
      case `exam`: return { label: `模擬試験`, scope: `ショート` };
      case `ox-try`: return { label: `○×で腕試し`, scope: `1問数秒` };
      default: return { label: a.title, scope: `` };
    }
  }

  function isWeakKind(a) {
    return a.kind === `auto-weak` || a.kind === `ox-weak` || (a.kind === `quiz` && a.icon === `target`);
  }

  // ヒーローの「○×で10問」: 税理士は不動産と消費税、宅建士(または未登録)は優先して伸ばしたい分野
  function oxLink(ctx) {
    const typeId = ctx.typeId;
    const c = snapCtx(ctx);
    const byCat = c.statementsByCat && typeof c.statementsByCat === `object` ? c.statementsByCat : null;
    const have = (id, min) => !byCat || (byCat[id] || 0) >= min;
    const sized = (id) => {
      const n = byCat ? Math.min(10, byCat[id] || 0) : 10;
      return n || 10;
    };
    if (typeId === `zeirishi`) {
      if (!have(`shohi`, 1)) return { nav: `#ox`, label: `○×一問一答`, scope: `1問数秒` };
      return { nav: `#ox/cat/shohi/10`, label: `○×で${sized(`shohi`)}問`, scope: categoryName(ctx, `shohi`) || `不動産と消費税` };
    }
    if (typeId && typeId !== `takken`) return { nav: `#ox`, label: `○×一問一答`, scope: `1問数秒` };
    const takken = Stats.examType(`takken`);
    const cats = takken && Array.isArray(takken.categories) ? takken.categories : [];
    const sameType = !ctx.summary || ctx.summary.examTypeId === `takken`;
    const focusId = sameType && ctx.summary && ctx.summary.focus ? ctx.summary.focus.id : null;
    let cat = cats.find((x) => x.id === focusId && have(x.id, 5)) || null;
    if (!cat && byCat) cat = cats.slice().sort((a, b) => (byCat[b.id] || 0) - (byCat[a.id] || 0)).find((x) => have(x.id, 5)) || null;
    if (!cat && !byCat) cat = cats.find((x) => x.id === `gyoho`) || null;
    if (!cat) return { nav: `#ox`, label: `○×一問一答`, scope: `1問数秒` };
    return { nav: `#ox/cat/${cat.id}/10`, label: `○×で${sized(cat.id)}問`, scope: cat.name };
  }

  function minutesFor(cards) {
    return Math.max(1, Math.ceil((cards * SEC_PER_CARD) / 60));
  }

  // ---- 部品 ----
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function quickHtml(nav, icon, label, scope) {
    return `<a class="quick" href="${esc(nav)}">${ic(icon || `lightbulb`, 22)}<span><b>${esc(label)}</b>${scope ? `<small>${esc(scope)}</small>` : ``}</span></a>`;
  }

  function ctaHtml(p) {
    return `
      <a class="btn btn-lg hero2-cta" href="${esc(p.nav)}">
        <span class="cta-text"><span class="cta-title">${esc(p.title)}</span>${p.sub ? `<small>${esc(p.sub)}</small>` : ``}</span>
        ${ic(`arrow-right`, 22)}
      </a>`;
  }

  function listRowHtml(it) {
    return `
      <a class="list-row" href="${esc(it.nav)}">
        <span class="list-row-icon${it.warn ? ` is-warn` : ``}">${ic(it.icon || `lightbulb`)}</span>
        <span class="list-row-main"><span class="list-row-title">${esc(it.title)}</span>${it.sub ? `<span class="list-row-sub">${esc(it.sub)}</span>` : ``}</span>
        ${ic(`chevron-right`, 18)}
      </a>`;
  }

  function sectionEl(title, link, inner, cls) {
    return el(`section`, `home-section${cls ? ` ${cls}` : ``}`, `
      <div class="section-head"><h3>${esc(title)}</h3>${link ? `<a class="link-btn" href="${esc(link.nav)}">${esc(link.label)}${ic(`chevron-right`, 16)}</a>` : ``}</div>
      ${inner}`);
  }

  // 今日の学習リング(今日の学習記録の回数 / 10)
  function ringHtml(n) {
    const count = Math.max(0, Math.floor(num(n)));
    const C = 2 * Math.PI * 36;
    const shown = Math.min(count, DAILY_GOAL);
    const reached = count >= DAILY_GOAL;
    const fill = shown ? `<circle class="ring-fill" cx="42" cy="42" r="36" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - shown / DAILY_GOAL)).toFixed(1)}"/>` : ``;
    return `
      <div class="ring${reached ? ` is-done` : ``}" role="img" aria-label="今日の学習 ${count}/${DAILY_GOAL}">
        <svg viewBox="0 0 84 84" aria-hidden="true"><circle class="ring-track" cx="42" cy="42" r="36"/>${fill}</svg>
        <div class="ring-label" aria-hidden="true"><div>${reached ? `<strong>達成</strong>` : `<strong>${shown}<small>/${DAILY_GOAL}</small></strong>`}<small>今日</small></div></div>
      </div>`;
  }

  function topHtml(ctx) {
    const today = DateUtil.today();
    let pill = ``;
    if (!ctx.newcomer) {
      const n = ctx.streak;
      const text = n >= 2 ? `${n}日連続` : n === 1 ? (ctx.todayCount ? `1日目` : `1日連続`) : `今日から`;
      pill = `<span class="streak-pill" aria-label="連続学習 ${n}日">${ic(`flame`, 18)}<span>${text}</span></span>`;
    }
    return `
      <div class="home-top">
        <div class="home-top-text"><p class="home-date">${shortDate(today, true)}</p><h2 class="home-title">${greeting()}</h2></div>
        ${pill}
      </div>`;
  }

  // ---- 試験向けのヒーロー ----
  function examHero(ctx, used) {
    const card = el(`section`, `card hero2 home-hero2`);
    card.setAttribute(`aria-label`, `今日の学習`);
    const target = ctx.target;
    const notes = [];
    let p = null;
    let meta;
    let afterMeta = ``;
    if (target) {
      p = Stats.pace(target);
      const date = shortDate(target.date, true);
      if (p.daysLeft > 0) {
        // paceLine はアプリが作る数値と定型文だけ(利用者の入力を含まない)なので、句切りで折り返すよう HTML で組む
        let paceLine = ``;
        if (p.remaining > 0) paceLine = `<span class="nowrap">残り${p.remaining}項目</span>・<span class="nowrap">1日${p.perDay}項目ペース</span>${p.buffer ? `<span class="nowrap">(直前${p.buffer}日は総復習用)</span>` : ``}`;
        else if (p.total > 0) paceLine = `範囲はすべて学習済み。復習と解き直しで仕上げましょう`;
        meta = `
          <p class="hero2-eyebrow">${ic(`target`, 14)}<span>${esc(target.name)}まで</span></p>
          <p class="hero2-days"><strong class="num">${p.daysLeft}</strong>日</p>
          <p class="hero2-sub"><span class="nowrap">${date}</span>${paceLine ? `・${paceLine}` : ``}</p>`;
      } else if (p.daysLeft === 0) {
        meta = `
          <p class="hero2-eyebrow">${ic(`target`, 14)}<span>${esc(target.name)}</span></p>
          <p class="hero2-days"><strong>今日</strong></p>
          <p class="hero2-sub">今日が試験日です。落ち着いて、がんばってください</p>`;
      } else {
        meta = `
          <p class="hero2-eyebrow">${ic(`target`, 14)}<span>${esc(target.name)}</span></p>
          <p class="hero2-days is-ended"><strong>終了</strong></p>
          <p class="hero2-sub">${date}・${-p.daysLeft}日前に終了</p>`;
        afterMeta = `<button type="button" class="link-btn hero2-link" data-role="add-target">${ic(`calendar`, 16)}次の目標を登録</button>`;
      }
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
    } else {
      // 目的は試験だが、試験日が未登録
      const t = Stats.examType(ctx.typeId);
      const officials = Stats.officialDates ? Stats.officialDates(ctx.typeId) : [];
      const o = officials[0] || null;
      meta = `
        <p class="hero2-eyebrow">${ic(`target`, 14)}<span>${esc(t ? `${t.shortName}試験` : `試験`)}の対策</span></p>
        <p class="hero2-sub hero2-sub-lead">試験日を登録すると、残り日数と1日の学習量の目安を表示します</p>`;
      afterMeta = `
        <div class="hero2-target-actions">
          ${o ? `<button type="button" class="chip chip-small" data-role="official" data-date="${o.date}">${ic(`calendar`, 14)}${esc(o.label)} ${shortDate(o.date, true)}で登録</button>` : ``}
          <button type="button" class="link-btn hero2-link" data-role="add-target">${ic(`calendar`, 16)}${o ? `別の日付で登録` : `試験日を登録`}</button>
        </div>`;
    }

    // 主ボタンは今日の復習(はじめての人は最初の用語)、残っていなければ弱点分析の最優先。小さいタイルは○×と次の学習
    // 今日のメニューを出しているときは、メニューが終わるまで主ボタンを出さない(メニューの手順と重ねない)
    const ox = oxLink(ctx);
    const acts = studyActions(ctx);
    const work = ctx.due + ctx.newAvail;
    const withMenu = used.has(`menu`);
    let primary = null;
    let doneLine = ``;
    if (ctx.cards === 0 && ctx.newAvail > 0) {
      const n = Math.min(ctx.newAvail, 10);
      primary = { nav: `#review`, title: `最初の${n}語を覚える`, sub: `カードをめくって意味を確認・約${minutesFor(n)}分` };
    } else if (work > 0) {
      primary = { nav: `#review`, title: `今日の復習をはじめる`, sub: `${work}枚・約${minutesFor(work)}分` };
    } else {
      if (!withMenu) doneLine = `<p class="hero-done">${ic(`check-circle`, 16)}<span>今日の復習は完了${ctx.newLeft && ctx.limit === 0 ? `(新しい用語は出さない設定)` : ``}</span></p>`;
      const first = acts.find((a) => a.nav !== ox.nav && !used.has(a.nav)) || null;
      if (first) primary = { nav: first.nav, title: verbTitle(ctx, first), sub: first.detail || `` };
      else primary = { nav: ox.nav, title: `○×一問一答で確認`, sub: `1問数秒。間違えた文だけ解き直せます` };
    }
    if (primary && (used.has(primary.nav) || used.has(`menu-open`))) primary = null;
    if (primary) used.add(primary.nav);
    const tiles = [];
    if ((!primary || primary.nav !== ox.nav) && !used.has(ox.nav)) {
      tiles.push(quickHtml(ox.nav, `o-x`, ox.label, ox.scope));
      used.add(ox.nav);
      // ○×のタイルを出したら、次にやることの「○×で腕試し」は重ねない
      used.add(`kind:ox`);
    }
    const urgent = p && p.daysLeft > 0 && p.daysLeft <= 14;
    const typeObj = Stats.examType(ctx.typeId);
    if (urgent && typeObj && typeObj.mockExam && !used.has(`#exam`)) {
      tiles.push(quickHtml(`#exam`, `timer`, `模擬試験`, typeObj.shortName));
      used.add(`#exam`);
      // 次にやることの「模擬試験(ショート)」(#exam/short)は重ねない
      used.add(`kind:exam`);
    } else {
      // 直前期は解き直しを優先。それ以外は弱点分析の優先順(すでに出したリンクは除く)
      const pool = acts.filter((a) => !used.has(a.nav));
      const pick = (urgent && pool.find(isWeakKind)) || pool.find((a) => a.kind !== `ox`) || pool[0] || null;
      if (pick) {
        const s = shortAction(ctx, pick);
        tiles.push(quickHtml(pick.nav, pick.icon, s.label, s.scope));
        used.add(pick.nav);
        if (pick.kind === `exam`) used.add(`kind:exam`);
      }
    }

    const today = DateUtil.today();
    const others = Stats.listTargets().filter((t) => !target || t.id !== target.id);
    card.innerHTML = `
      <div class="hero2-head">
        ${ringHtml(ctx.todayCount)}
        <div class="hero2-meta">${meta}</div>
      </div>
      ${afterMeta}
      ${doneLine}
      ${primary ? ctaHtml(primary) : ``}
      ${tiles.length ? `<div class="hero2-quick${tiles.length === 1 ? ` is-single` : ``}">${tiles.join(``)}</div>` : ``}
      ${notes.length ? `<div class="hero2-notes">${notes.join(``)}</div>` : ``}
      ${others.length ? `<div class="chip-row hero-others">${others.map((t) => {
        const d = DateUtil.diffDays(today, t.date);
        const left = Number.isFinite(d) && d >= 0 ? `あと${d}日` : `終了`;
        return `<a class="chip chip-small chip-muted" href="#settings/targets" aria-label="${esc(t.name)} ${left}(設定でホームに表示する試験を切り替え)">${esc(t.name)} ${left}</a>`;
      }).join(``)}</div>` : ``}`;
    card.querySelectorAll(`[data-role="add-target"]`).forEach((b) => b.addEventListener(`click`, () => openTargetForm(rerender, null, { examTypeId: ctx.typeId })));
    const official = card.querySelector(`[data-role="official"]`);
    if (official) {
      official.addEventListener(`click`, () => {
        const typeId = ctx.typeId || `takken`;
        Stats.addTarget({ name: typeId === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`, examTypeId: typeId, date: official.dataset.date, primary: true });
        UI.toast(`試験日を登録しました`, `success`);
        rerender();
      });
    }
    return card;
  }

  // ---- 暮らし・仕事向けのヒーロー(今日の1テーマ) ----
  function interestLabels(ctx) {
    const opts = Stats.INTEREST_OPTIONS || [];
    const ids = ctx.profile ? ctx.profile.interests : [];
    return ids.map((id) => (opts.find((o) => o.id === id) || {}).short).filter(Boolean);
  }

  // ○×のタイル: 気になるテーマ(なければ今日のテーマ)のトピックで、○×の文が5問以上あるもの
  function generalOx(ctx, theme) {
    const byTopic = snapCtx(ctx).statementsByTopic || {};
    const cands = ctx.interests.concat(theme ? [theme.topic.id] : []);
    const id = cands.find((tid) => (byTopic[tid] || 0) >= 5) || null;
    const topic = id ? AppIndex.topicsById[id] : null;
    const label = ctx.interests.length ? `○×で腕試し` : `暮らしの○×`;
    if (!topic) return { nav: `#ox`, label, scope: `1問数秒` };
    return { nav: `#ox/topic/${topic.id}/10`, label, scope: `${topic.name}・1問数秒`, name: topic.name };
  }

  function generalHero(ctx, plan, used) {
    const card = el(`section`, `card hero2 home-hero2`);
    card.setAttribute(`aria-label`, `今日の1テーマ`);
    const theme = plan.theme;
    const labels = interestLabels(ctx);
    let body = ``;
    let primary = null;
    if (theme && used.has(`#topics/${theme.topic.id}/${theme.basicId}`)) {
      // 今日の1テーマは今日のメニューの「新しい基礎知識」で案内しているので、ここでは○×・計算機のタイルだけにする
      card.setAttribute(`aria-label`, `すぐに使える機能`);
      card.classList.add(`is-compact`);
    } else if (theme) {
      const topic = theme.topic;
      body = `
        <div class="theme-card">
          <div class="theme-art" aria-hidden="true">${ic(topic.icon || `book-open`, 34)}</div>
          <div class="theme-main">
            <p class="theme-eyebrow">今日の1テーマ・約3分</p>
            <p class="theme-title">${esc(theme.basic ? theme.basic.name : topic.name)}</p>
            <p class="theme-sub">${esc(topic.name)}・学習済み ${theme.done}/${theme.total}</p>
          </div>
        </div>`;
      primary = { nav: `#topics/${topic.id}/${theme.basicId}`, title: `読んでみる`, sub: `読んだら「学習済み」にチェック` };
    } else {
      body = `
        <div class="theme-card">
          <div class="theme-art" aria-hidden="true">${ic(`trophy`, 34)}</div>
          <div class="theme-main">
            <p class="theme-eyebrow">今日の1テーマ</p>
            <p class="theme-title">暮らしの基礎知識はすべて学習済みです</p>
            <p class="theme-sub">○×や4択で、覚えたことを確かめましょう</p>
          </div>
        </div>`;
      primary = { nav: `#quiz`, title: `4択問題で確かめる`, sub: `選択肢ごとの解説つき` };
    }
    // 今日のメニューで案内しているリンク・メニューが終わっていない間の主ボタンは重ねない
    if (primary && (used.has(primary.nav) || (used.has(`menu-open`) && !theme))) primary = null;
    if (primary) used.add(primary.nav);
    const ox = generalOx(ctx, theme);
    const tiles = [];
    if (!used.has(ox.nav)) { tiles.push(quickHtml(ox.nav, `o-x`, ox.label, ox.scope)); used.add(ox.nav); }
    const firstInterest = ctx.profile && ctx.profile.interests[0];
    tiles.push(quickHtml(`#calculators`, `calculator`, `費用を計算`, CALC_SUB[firstInterest] || `初期費用・ローン`));
    used.add(`#calculators`);
    card.innerHTML = `
      ${labels.length ? `<p class="hero2-interests"><span>気になるテーマ: <strong>${esc(labels.join(`・`))}</strong></span><a class="link-btn" href="#settings/profile">変更${ic(`chevron-right`, 14)}</a></p>` : ``}
      ${body}
      ${primary ? ctaHtml(primary) : ``}
      <div class="hero2-quick${tiles.length === 1 ? ` is-single` : ``}">${tiles.join(``)}</div>`;
    return card;
  }

  // ---- 目的から選ぶ(暮らし・仕事向け) ----
  function purposeSection() {
    const items = PURPOSES.filter((p) => p.action || AppIndex.topicsById[p.topicId]);
    const sec = sectionEl(`目的から選ぶ`, null, `
      <div class="purpose">
        ${items.map((p, i) => (p.action
          ? `<button type="button" class="purpose-item" data-purpose="${i}"><span class="p-ic">${ic(p.icon)}</span><span>${esc(p.label)}</span></button>`
          : `<a class="purpose-item" href="#topics/${p.topicId}"><span class="p-ic">${ic(p.icon)}</span><span>${esc(p.label)}</span></a>`)).join(``)}
      </div>
      <button type="button" class="link-btn purpose-note" data-role="add-target">${ic(`calendar`, 16)}<span>試験日を登録すると、残り日数と学習ペースを表示します</span></button>`, `home-purpose`);
    sec.querySelectorAll(`[data-purpose]`).forEach((b) => b.addEventListener(`click`, () => openTargetForm(rerender, null, { examTypeId: `takken` })));
    sec.querySelector(`[data-role="add-target"]`).addEventListener(`click`, () => openTargetForm(rerender));
    return sec;
  }

  // ---- 続きから(暮らし・仕事向け。最後に開いたトピック) ----
  function continueSection(ctx, plan, used) {
    const b = plan.cont;
    if (!b) return null;
    const nav = b.nextId ? `#topics/${b.topic.id}/${b.nextId}` : `#topics/${b.topic.id}`;
    if (used.has(nav)) return null;
    used.add(nav);
    const sub = b.next ? `${b.done}/${b.total}項目・次は「${b.next.name}」` : `${b.total}項目すべて学習済み`;
    return sectionEl(`続きから`, null, `<div class="list-group">${listRowHtml({ nav, icon: b.topic.icon || `book-open`, title: b.topic.name, sub })}</div>`, `home-continue`);
  }

  // ---- 次にやること ----
  function reviewRow(ctx) {
    if (ctx.cards === 0 && ctx.newAvail > 0) {
      const n = Math.min(ctx.newAvail, 10);
      return { nav: `#review`, icon: `layers`, title: `最初の${n}語を覚える`, sub: `カードをめくって意味を確認・約${minutesFor(n)}分` };
    }
    if (ctx.due > 0) return { nav: `#review`, icon: `repeat`, warn: true, title: `今日の復習(${ctx.due}枚)`, sub: `忘れかけた用語をカードで確認・約${minutesFor(ctx.due + ctx.newAvail)}分` };
    if (ctx.newAvail > 0) return { nav: `#review`, icon: `sparkles`, title: `新しい用語を覚える(${ctx.newAvail}語)`, sub: `今日の復習で、まだ学んでいない用語をカードで` };
    return null;
  }

  function nextSectionExam(ctx, used, withLink) {
    const rows = studyActions(ctx).filter((a) => !used.has(a.nav) && !(a.kind === `ox-try` && used.has(`kind:ox`)) && !(a.kind === `exam` && used.has(`kind:exam`))).slice(0, 3).map((a) => {
      used.add(a.nav);
      if (a.kind === `exam`) used.add(`kind:exam`);
      return { nav: a.nav, icon: a.icon, warn: isWeakKind(a), title: verbTitle(ctx, a), sub: a.detail || `` };
    });
    if (!rows.length) return null;
    return sectionEl(`次にやること`, withLink ? { nav: `#progress/weak`, label: `弱点分析` } : null, `<div class="list-group">${rows.map(listRowHtml).join(``)}</div>`, `home-next`);
  }

  function nextSectionGeneral(ctx, plan, used) {
    const rows = [];
    const r = reviewRow(ctx);
    if (r && !used.has(r.nav)) { rows.push(r); used.add(r.nav); }
    const skip = [plan.theme && plan.theme.topic.id, plan.cont && plan.cont.topic.id].filter(Boolean);
    for (const id of plan.order) {
      if (rows.length >= 4) break;
      if (skip.includes(id)) continue;
      const b = Recommend.topicBasics(id);
      if (!b || !b.nextId) continue;
      const nav = `#topics/${id}/${b.nextId}`;
      if (used.has(nav)) continue;
      used.add(nav);
      rows.push({ nav, icon: b.topic.icon || `book-open`, title: `${b.topic.name}の基礎知識を読む`, sub: `学習済み ${b.done}/${b.total}` });
    }
    if (!rows.length) return null;
    return sectionEl(`次にやること`, { nav: `#progress`, label: `進捗` }, `<div class="list-group">${rows.map(listRowHtml).join(``)}</div>`, `home-next`);
  }

  // ---- 今週の学習(日〜土の7日) ----
  function weekCard(ctx) {
    if (ctx.newcomer) return null;
    const week = Streak.getWeek();
    const n = ctx.streak;
    const longest = Streak.getLongestStreak();
    let msg;
    if (ctx.todayCount > 0) msg = `<strong>${n}日連続</strong>中・最長${Math.max(longest, n)}日`;
    else if (n > 0) msg = `今日も1問解くと <strong>${n + 1}日連続</strong>`;
    else msg = `1問解くと、今日から記録がはじまります`;
    const active = week.filter((d) => d.active).length;
    const card = el(`section`, `card week-card`);
    card.setAttribute(`aria-label`, `今週の学習`);
    card.innerHTML = `
      <div class="week" role="img" aria-label="今週の学習 7日のうち${active}日">
        ${week.map((d) => {
          const cls = [`week-dot`, d.active ? `done` : ``, d.isToday ? `today` : ``, d.isFuture ? `future` : ``].filter(Boolean).join(` `);
          const inner = d.active ? ic(`check`, 16) : d.isToday ? ic(`flame`, 16) : ``;
          const wd = DateUtil.parse(d.date);
          return `<div class="week-day" aria-hidden="true"><span>${wd ? WEEKDAYS[wd.getDay()] : ``}</span><span class="${cls}">${inner}</span></div>`;
        }).join(``)}
      </div>
      <p class="week-msg">${msg}</p>`;
    return card;
  }

  // ---- 分野別の習熟度(試験向け) ----
  function analysisSection(ctx) {
    if (ctx.newcomer) return null;
    const s = ctx.summary;
    if (s && s.hasData && Number.isFinite(Number(s.mastery)) && s.mastery != null) {
      let rows = ctx.snap && Array.isArray(ctx.snap.categories) ? ctx.snap.categories : null;
      if (!rows) {
        try { rows = Analysis.byCategory(s.examTypeId); } catch (e) { rows = []; }
      }
      rows = rows.filter((r) => r && r.available && Number.isFinite(Number(r.mastery)));
      const withData = rows.filter((r) => num(r.attempts) > 0);
      const focusId = s.focus ? s.focus.id : null;
      // いま伸ばしたい分野(暖色)と、回答がある分野のうち習熟度の低いものを合わせて3つ(習熟度の低い順)
      const focusRow = rows.find((r) => r.id === focusId) || null;
      const lowest = (withData.length ? withData : rows).filter((r) => r !== focusRow).slice()
        .sort((a, b) => (num(a.mastery) - num(b.mastery)) || (num(b.questions) - num(a.questions)));
      const pool = (focusRow ? [focusRow] : []).concat(lowest).slice(0, 3)
        .sort((a, b) => (num(a.mastery) - num(b.mastery)) || (num(b.questions) - num(a.questions)));
      const bars = pool.map((r) => {
        const m = Math.max(0, Math.min(100, Math.round(num(r.mastery))));
        return `
          <div class="mini-bar${r.id === focusId ? ` is-focus` : ``}">
            <div class="mini-bar-head"><b>${esc(r.name)}</b><span>${m}</span></div>
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${m}%"></div></div>
          </div>`;
      }).join(``);
      return sectionEl(`分野別の習熟度`, { nav: `#progress/weak`, label: `すべて` }, `
        <div class="card home-mastery-card">
          <div class="home-mastery"><strong class="num">${Math.round(num(s.mastery))}</strong><span>/100</span><span class="home-mastery-label">${esc(s.examName || ``)}の総合</span></div>
          ${s.focus ? `<p class="home-card-note">いま伸ばしたい分野: <strong>${esc(s.focus.name)}</strong></p>` : ``}
          ${bars ? `<div class="mini-bars">${bars}</div>` : ``}
        </div>`, `home-analysis`);
    }
    // まだ回答がない: 学習済み・記憶済みの割合
    let typeId = ctx.typeId && Stats.examType(ctx.typeId) && Array.isArray(Stats.examType(ctx.typeId).categories) ? ctx.typeId : `takken`;
    const type = Stats.examType(typeId);
    if (!type) return null;
    const rows = Stats.byCategory(typeId, { compact: true }).filter((r) => r.total > 0);
    if (!rows.length) return null;
    return sectionEl(`分野別の進捗`, { nav: `#progress`, label: `すべて` }, `
      <div class="card home-mastery-card">
        <p class="home-card-note">${esc(type.shortName)}の範囲ごとの、学習済み・記憶済みの割合です。問題を解くと習熟度に切り替わります。</p>
        <div class="mini-bars">
          ${rows.map((r) => `
            <div class="mini-bar">
              <div class="mini-bar-head"><b>${esc(r.name)}</b><span>${r.done}/${r.total}</span></div>
              <div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.max(0, Math.min(100, num(r.pct)))}%"></div></div>
            </div>`).join(``)}
        </div>
      </div>`, `home-analysis`);
  }

  // ---- テーマ別の進捗(暮らし・仕事向け) ----
  function topicProgressSection(ctx, plan) {
    if (ctx.newcomer) return null;
    const all = Stats.byTopic();
    const byId = {};
    all.forEach((r) => { byId[r.topic.id] = r; });
    // 気になるテーマを選んでいればそのトピック、なければ手をつけた暮らしのトピック
    let ids = ctx.interests.slice();
    if (!ids.length) ids = plan.order.filter((id) => byId[id] && byId[id].done > 0);
    const rows = ids.map((id) => byId[id]).filter((r) => r && r.total > 0).slice(0, 4);
    if (!rows.length) return null;
    return sectionEl(`テーマ別の進捗`, { nav: `#topics`, label: `トピック` }, `
      <div class="card home-mastery-card">
        <div class="mini-bars">
          ${rows.map((r) => `
            <div class="mini-bar">
              <div class="mini-bar-head"><b>${esc(r.topic.name)}</b><span>${r.done}/${r.total}</span></div>
              <div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.max(0, Math.min(100, num(r.pct)))}%"></div></div>
            </div>`).join(``)}
        </div>
      </div>`, `home-analysis`);
  }

  // ---- 模擬試験(模擬試験がある試験・受けたことがあるときだけ) ----
  function examCard(ctx, used) {
    const history = Stats.examHistory().filter((e) => e && typeof e.score === `number` && Number.isFinite(e.score) && typeof e.total === `number` && e.total > 0);
    const session = Storage.get(`examSession`, null);
    const hasSession = !!(session && typeof session === `object`);
    // ヒーローのタイル・次にやることに模擬試験を出していれば、カードは重ねない(中断中の試験があるときは出す)
    if (used && !hasSession && (used.has(`#exam`) || used.has(`kind:exam`))) return null;
    const typeObj = Stats.examType(ctx.typeId);
    const mockType = !ctx.typeId || !!(typeObj && typeObj.mockExam);
    if (!mockType && !history.length && !hasSession) return null;
    // はじめたばかりの人には、宅建士を目指しているときだけ出す
    if (ctx.newcomer && ctx.typeId !== `takken` && !hasSession) return null;
    const card = el(`section`, `card home-exam`);
    const last = history[0];
    const best = history.reduce((m, e) => (!m || e.score / e.total > m.score / m.total ? e : m), null);
    card.innerHTML = `
      <div class="home-exam-head">
        <h3 class="card-title">${ic(`timer`)}模擬試験</h3>
        ${last ? `<p class="home-exam-scores"><span>前回 <strong class="num">${last.score}</strong>/${last.total}</span><span>最高 <strong class="num">${best.score}</strong>/${best.total}</span></p>` : ``}
      </div>
      ${last ? `` : `<p class="home-card-note">本番と同じ問題数・時間・分野配分で実力を確認できます(宅建士)。</p>`}
      <a class="btn ${hasSession ? `` : `btn-secondary`} btn-block" href="#exam">${ic(hasSession ? `play` : `timer`, 18)}${hasSession ? `中断中の試験を再開` : `模擬試験へ`}</a>`;
    return card;
  }

  // ---- アプリが新しくなりました(既存の利用者に1度だけ) ----
  function whatsNewCard() {
    const version = (window.Onboarding && Onboarding.WHATS_NEW) || `v10`;
    if (Storage.get(`seenWhatsNew`, null) === version || !Storage.get(`onboardingDone`, null)) return null;
    const name = window.SITE && typeof SITE.name === `string` ? SITE.name : ``;
    const log = window.APP_DATA && Array.isArray(APP_DATA.changelog) && APP_DATA.changelog[0] && typeof APP_DATA.changelog[0] === `object` ? APP_DATA.changelog[0] : null;
    const isMc = (q) => !!q && (window.QuizEngine && QuizEngine.isMcItem ? QuizEngine.isMcItem(q) : q.format === `mc`);
    const mcCount = window.APP_DATA && Array.isArray(APP_DATA.quiz) ? APP_DATA.quiz.filter(isMc).length : 0;
    // 以前から使っている人は学ぶ目的が未設定(ホームは暮らし向けの表示になる)ので、設定の場所を案内する
    const profileHint = Stats.getProfile && !Stats.getProfile() ? `<a href="#settings/profile">学ぶ目的</a>(宅建士試験・暮らし・仕事・税理士試験)を選ぶと、ホームのおすすめが目的に合わせて変わります` : ``;
    // v11 以降(onboarding.js の WHATS_NEW を上げたとき)は、苦手を自動で潰す仕組みを中心に案内する
    const items = version !== `v10` ? [
      name ? `アプリの名前を「${esc(name)}」に変えました(商標の確認によるものです)。URL・学習の記録はそのままです` : ``,
      `ホームの一番上に<strong>今日のメニュー(約15分)</strong>を追加しました。復習・解き直し・苦手の○×・新しい基礎知識を順に案内し、終わった手順にチェックが付きます`,
      `間違えた4択を1→3→7→21日後に出し直す<a href="#quiz/due">解き直し</a>を追加しました(4択・模擬試験・○×で間違えた問題が対象)`,
      `模擬試験の結果から、間違えた問題の論点を○×で確認できるようになりました`,
      // 枚数は図解の一覧の「全n点」(学習内容の図。アプリの使い方の図は除く)と合わせる
      `<a href="#figures">図解</a>を15枚追加しました(全26枚)。4択の解答後に「図解で確認」から開けます`,
      `<a href="#topics/topicO">不動産と消費税</a>に基礎知識12項目・4択25問を追加しました`,
      profileHint,
    ].filter(Boolean) : [
      name ? `アプリの名前を「${esc(name)}」に変えました。URL・学習の記録はそのままです` : ``,
      `<a href="#about">このアプリについて</a>(運営者・プライバシー・免責事項・更新履歴)を追加`,
      profileHint,
      window.Report && typeof Report.enabled === `function` && Report.enabled() ? `問題や解説の<a href="#about/report">誤りを報告</a>できるようになりました` : ``,
      `これまでの動画一覧は<a href="#works">作品で学ぶ</a>コーナーにまとめました`,
      // 問題数はデータから数える(約50問単位)
      mcCount >= 300 ? `4択問題を約${Math.round(mcCount / 50) * 50}問に増やしました` : ``,
      `デザインを新しくしました`,
    ].filter(Boolean);
    const card = el(`section`, `card home-news`);
    card.innerHTML = `
      <div class="home-news-head">
        <h3 class="card-title">${ic(`sparkles`)}アプリが新しくなりました</h3>
        <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="お知らせを閉じる">${ic(`x`)}</button>
      </div>
      <ul class="home-news-list">${items.map((t) => `<li>${t}</li>`).join(``)}</ul>
      ${log ? `<a class="link-btn" href="#about/changelog">更新履歴を見る${ic(`chevron-right`, 16)}</a>` : ``}`;
    card.querySelector(`[data-role="dismiss"]`).addEventListener(`click`, () => {
      Storage.set(`seenWhatsNew`, version);
      card.remove();
    });
    return card;
  }

  // ---- ホーム画面に追加(iPhone・iPad の Safari / Chromium のインストール) ----
  function isIosBrowserTab() {
    if (typeof Storage.isIosBrowserTab === `function`) {
      try { return !!Storage.isIosBrowserTab(); } catch (e) { /* 下の判定を使う */ }
    }
    const ua = navigator.userAgent || ``;
    const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === `MacIntel` && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || !!(window.matchMedia && window.matchMedia(`(display-mode: standalone)`).matches);
    return ios && !standalone;
  }

  // app.js が受け取っておいた beforeinstallprompt(イベントそのもの、または {event} の形)
  function installPromptEvent() {
    const p = window.InstallPrompt;
    if (!p) return null;
    if (typeof p.prompt === `function`) return p;
    if (p.event && typeof p.event.prompt === `function`) return p.event;
    return null;
  }

  function dismissInstall(card) {
    Storage.set(`installNoteDismissedAt`, Date.now());
    if (card) card.remove();
  }

  function installCard(ctx) {
    if (ctx.activeDays < 1) return null;
    const dismissed = Storage.get(`installNoteDismissedAt`, 0);
    if (validTs(dismissed) && Date.now() - dismissed < INSTALL_REMIND_DAYS * DAY_MS) return null;
    const ios = isIosBrowserTab();
    const ev = ios ? null : installPromptEvent();
    if (!ios && !ev) return null;
    const card = el(`section`, `card card-compact home-note home-install`);
    card.dataset.kind = ios ? `ios` : `prompt`;
    if (ios) {
      card.innerHTML = `
        <span class="home-note-icon">${ic(`download`)}</span>
        <div class="home-note-main">
          <strong>ホーム画面に追加すると、記録が消えにくくなります</strong>
          <span>Safariでしばらく開かないと、このアプリの学習記録が消えることがあります。ホーム画面に追加すると、アプリのように全画面で開けて、記録も保たれやすくなります。</span>
          <span class="home-install-steps">① 共有ボタン(□↑)をタップ(見当たらないときは「…」の中) <span class="nowrap">② 「ホーム画面に追加」</span> <span class="nowrap">③ 「追加」</span></span>
          <span class="home-install-sub">ホーム画面から開くと、Safariとは別に記録されることがあります。いまの記録を引き継ぐときは、先にバックアップを取り、アプリ側の設定で読み込んでください。</span>
        </div>
        <div class="home-note-actions">
          <a class="btn btn-sm btn-secondary" href="#about/install">方法をくわしく</a>
          <a class="btn btn-sm btn-ghost" href="#settings/backup">${ic(`download`, 16)}バックアップ</a>
          <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="ホーム画面への追加のお知らせを閉じる">${ic(`x`)}</button>
        </div>`;
    } else {
      card.innerHTML = `
        <span class="home-note-icon">${ic(`download`)}</span>
        <div class="home-note-main">
          <strong>アプリとしてインストールできます</strong>
          <span>ホーム画面やデスクトップから、すぐに開けるようになります。</span>
        </div>
        <div class="home-note-actions">
          <button type="button" class="btn btn-sm" data-role="install">${ic(`download`, 16)}インストール</button>
          <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="インストールのお知らせを閉じる">${ic(`x`)}</button>
        </div>`;
      card.querySelector(`[data-role="install"]`).addEventListener(`click`, () => {
        const e = installPromptEvent();
        // 同じイベントでは1度しか確認を出せない(このアプリについての「インストール」にも知らせる)
        window.InstallPrompt = null;
        card.remove();
        try { window.dispatchEvent(new CustomEvent(`installprompt:change`)); } catch (err) { /* 古いブラウザでは知らせなくてよい */ }
        if (!e) return;
        try {
          const r = e.prompt();
          const choice = e.userChoice && typeof e.userChoice.then === `function` ? e.userChoice : (r && typeof r.then === `function` ? r : null);
          if (choice) choice.then((c) => { if (!c || c.outcome !== `accepted`) dismissInstall(null); }).catch(() => {});
        } catch (err) { /* 確認を出せなくても学習は続けられる */ }
      });
    }
    card.querySelector(`[data-role="dismiss"]`).addEventListener(`click`, () => dismissInstall(card));
    return card;
  }

  // ---- バックアップのお知らせ(学習記録があり、しばらくバックアップしていないとき) ----
  function backupNote() {
    const now = Date.now();
    const remindDays = isIosBrowserTab() ? BACKUP_REMIND_DAYS_IOS : BACKUP_REMIND_DAYS;
    const dismissed = Storage.get(`backupNoteDismissedAt`, 0);
    if (validTs(dismissed) && now - dismissed < remindDays * DAY_MS) return null;
    const log = Storage.get(`activityLog`, {});
    const days = Object.keys(log).filter((d) => DateUtil.isValid(d) && Streak.countOf(log[d])).sort();
    if (!days.length && !Object.keys(Srs.getAllCards()).length) return null;
    const last = Storage.get(`lastBackupAt`, 0);
    let text;
    if (validTs(last)) {
      const ago = Math.floor((now - last) / DAY_MS);
      if (ago <= remindDays) return null;
      text = `最後のバックアップから${ago}日たっています`;
    } else {
      // まだ一度もバックアップしていない: 学習を始めてから一定の日数を過ぎたら知らせる
      const first = days[0];
      if (!first || DateUtil.diffDays(first, DateUtil.today()) <= remindDays) return null;
      text = `学習データのバックアップがまだありません`;
    }
    const card = el(`section`, `card card-compact home-note home-backup`);
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

  function notices(ctx) {
    const install = installCard(ctx);
    // ホーム画面への追加のお知らせにはバックアップのボタンもあるので、同時には出さない
    return [whatsNewCard(), install, install ? null : backupNote()].filter(Boolean);
  }

  // 暮らし・仕事向け: 今日の1テーマ・続きから・次にやることで使うトピックの並び(Recommend.generalPlan と同じ)
  function generalPlan(ctx) {
    return Recommend.generalPlan(ctx.profile);
  }

  // ---- 今日のメニュー(約15分。両方のホームの一番上) ----
  // 手順と完了の判定は Recommend.todayMenu。各手順のリンクは used に入れ、下のヒーロー・次にやることでは重ねない
  function menuOptions(ctx, plan) {
    const s = ctx.summary;
    // 分析した試験とホームの試験が同じときだけ、伸ばしたい分野を基礎知識の選び方に使う(違えば使わない)
    const focusId = s && s.focus && s.examTypeId === ctx.typeId ? s.focus.id : null;
    const o = { variant: ctx.variant, typeId: ctx.typeId, focusId };
    // ○×の手順(間違えた文がないとき)の行き先と、手順の補足に出す範囲の名前(「1問数秒」などの補足は付けない)
    if (ctx.variant === `exam`) {
      const x = oxLink(ctx);
      o.oxFallback = { nav: x.nav, scope: x.nav === `#ox` ? `` : x.scope };
    } else {
      o.theme = plan ? plan.theme : null;
      const x = generalOx(ctx, o.theme);
      o.oxFallback = { nav: x.nav, scope: x.name || `` };
    }
    return o;
  }

  function menuStepHtml(s, isNext) {
    const label = `${s.no}. ${s.title}(${s.done ? `完了` : `約${s.minutes}分`})`;
    return `
      <li>
        <a class="menu-step${s.done ? ` is-done` : ``}${isNext ? ` is-next` : ``}" href="${esc(s.nav)}" data-step="${esc(s.id)}"${isNext ? ` aria-current="step"` : ``} aria-label="${esc(`${label}・${s.sub || ``}`)}">
          <span class="menu-step-mark" aria-hidden="true">${s.done ? ic(`check`, 16) : `<span class="num">${s.no}</span>`}</span>
          <span class="menu-step-main" aria-hidden="true"><span class="menu-step-title">${esc(s.title)}</span>${s.sub ? `<span class="menu-step-sub">${esc(s.sub)}</span>` : ``}</span>
          <span class="menu-step-meta" aria-hidden="true">${s.done ? `<span class="menu-step-tag">完了</span>` : `<span class="num">約${s.minutes}分</span>`}</span>
          ${ic(`chevron-right`, 18)}
        </a>
      </li>`;
  }

  function menuCard(ctx, plan, used) {
    if (!window.Recommend || typeof Recommend.todayMenu !== `function`) return null;
    let steps;
    try { steps = Recommend.todayMenu(menuOptions(ctx, plan)); } catch (e) {
      console.error(`[ホーム] 今日のメニューを作れませんでした`, e);
      return null;
    }
    if (!Array.isArray(steps) || !steps.length) return null;
    const st = Recommend.menuStatus(steps);
    used.add(`menu`);
    if (!st.allDone) used.add(`menu-open`);
    steps.forEach((s) => {
      used.add(s.nav);
      // 同じ画面への別の入口(問題数の有無)も重ねない
      if (s.nav.startsWith(`#ox/weak`)) used.add(`#ox/weak`);
      if (s.nav.startsWith(`#quiz/due`)) used.add(`#quiz/due`);
      if (s.id === `ox`) used.add(`kind:ox`);
      // 基礎知識の手順と同じトピックの「基礎を読む」(#topics/<id>)も重ねない
      const m = s.id === `basic` ? /^#topics\/([^/]+)\//.exec(s.nav) : null;
      if (m) used.add(`#topics/${m[1]}`);
    });
    const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    const time = st.allDone ? `${ic(`check-circle`, 16)}<span>完了</span>` : `<span class="num">${st.done ? `残り約${st.minutes}分` : `約${st.minutes}分`}</span>`;
    const card = el(`section`, `card home-menu${st.allDone ? ` is-done` : ``}`);
    card.setAttribute(`aria-labelledby`, `home-menu-title`);
    card.innerHTML = `
      <div class="home-menu-head">
        <h3 class="card-title" id="home-menu-title">${ic(`list`, 20)}<span>今日のメニュー</span></h3>
        <span class="home-menu-time">${time}</span>
      </div>
      <div class="home-menu-progress">
        <div class="progress-bar" role="progressbar" aria-label="今日のメニューの進み具合" aria-valuemin="0" aria-valuemax="${st.total}" aria-valuenow="${st.done}" aria-valuetext="${st.total}手順中${st.done}手順完了">
          <div class="progress-bar-fill${st.allDone ? ` fill-success` : ``}" style="width:${pct}%"></div>
        </div>
        <span class="home-menu-count num" aria-hidden="true">${st.done}/${st.total}</span>
      </div>
      <ol class="home-menu-list">${steps.map((s) => menuStepHtml(s, s === st.next)).join(``)}</ol>
      ${st.allDone ? `<p class="home-menu-done">${ic(`trophy`, 16)}<span>今日のメニューはすべて完了です。おつかれさまでした</span></p>` : ``}`;
    return card;
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view home-view`;
    wrap.dataset.docTitle = `ホーム`;
    const ctx = buildContext();
    wrap.innerHTML = `
      ${topHtml(ctx)}
      <div class="home-layout is-${ctx.variant}">
        <div class="home-col home-col-main" data-role="main"></div>
        <div class="home-col home-col-side" data-role="side"></div>
      </div>`;
    root.appendChild(wrap);
    const main = wrap.querySelector(`[data-role="main"]`);
    const side = wrap.querySelector(`[data-role="side"]`);
    // スマホ(1列)では order で並べ、PC(2列)では左右の列に分ける
    const place = (col, node, order) => {
      if (!node) return;
      node.style.order = String(order);
      col.appendChild(node);
    };
    const used = new Set();
    const news = notices(ctx);
    if (ctx.variant === `exam`) {
      const analysis = analysisSection(ctx);
      place(main, menuCard(ctx, null, used), 0);
      place(main, examHero(ctx, used), 1);
      news.forEach((n) => place(main, n, 2));
      place(side, weekCard(ctx), 3);
      place(main, nextSectionExam(ctx, used, !analysis), 4);
      place(side, analysis, 5);
      place(side, examCard(ctx, used), 6);
    } else {
      const plan = generalPlan(ctx);
      place(main, menuCard(ctx, plan, used), 0);
      place(main, generalHero(ctx, plan, used), 1);
      news.forEach((n) => place(main, n, 2));
      // 気になるテーマを選んだ人は「続きから・次にやること」を先に、まだの人は「目的から選ぶ」を先に
      const picked = ctx.interests.length > 0;
      place(main, continueSection(ctx, plan, used), picked ? 3 : 4);
      place(main, nextSectionGeneral(ctx, plan, used), picked ? 4 : 5);
      place(main, purposeSection(), picked ? 5 : 3);
      place(side, weekCard(ctx), 6);
      place(side, topicProgressSection(ctx, plan), 7);
    }
    if (!side.children.length) wrap.querySelector(`.home-layout`).classList.add(`is-single`);
    live = { wrap, main, ctx, day: DateUtil.today() };
    watchInstallPrompt();
    watchDay();
  }

  // iPhone のホーム画面アプリなどは、翌日に開いても前の日のホームのまま戻ることがある。
  // 日付が変わっていたら、その日の内容(今日のメニュー・復習の枚数・連続日数)で描き直す(シート・確認を開いている間は待つ)
  let watchingDay = false;
  function watchDay() {
    if (watchingDay) return;
    watchingDay = true;
    const onWake = () => {
      if (!live || !live.wrap.isConnected || document.visibilityState === `hidden` || live.day === DateUtil.today()) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      live.day = DateUtil.today();
      if (window.Router) Router.navigate(`#home`);
    };
    document.addEventListener(`visibilitychange`, onWake);
    window.addEventListener(`pageshow`, onWake);
    window.addEventListener(`focus`, onWake);
  }

  // Chrome・Edge の「インストールできる」(beforeinstallprompt)は表示のあとに届くことが多いので、届いたらお知らせを差し込む
  let live = null;
  let watching = false;
  function watchInstallPrompt() {
    if (watching) return;
    watching = true;
    window.addEventListener(`installprompt:change`, () => {
      if (!live || !live.wrap.isConnected) { live = null; return; }
      const cur = live.main.querySelector(`.home-install`);
      if (!installPromptEvent()) {
        // インストールが済んだ・使えなくなった(iPhone の案内はそのまま)
        if (cur && cur.dataset.kind === `prompt`) cur.remove();
        return;
      }
      if (cur) return;
      const card = installCard(live.ctx);
      if (!card) return;
      card.style.order = `2`;
      // ホーム画面への追加のお知らせとバックアップのお知らせは同時に出さない
      const backup = live.main.querySelector(`.home-backup`);
      if (backup) backup.remove();
      live.main.appendChild(card);
    });
  }

  // 今日の復習の完了画面などから使う: ホームの「○×で10問」と同じリンク { nav, label, scope }
  function oxLinkNow() {
    try { return oxLink(buildContext()); } catch (e) { return { nav: `#ox`, label: `○×一問一答`, scope: `` }; }
  }

  // 解き直しの結果などの「次のメニュー」から使う: ホームの今日のメニューと同じ条件(Recommend.todayMenu の opts)。作れなければ undefined
  function menuOptionsNow() {
    try {
      const ctx = buildContext();
      return menuOptions(ctx, ctx.variant === `exam` ? null : generalPlan(ctx));
    } catch (e) { return undefined; }
  }

  return { render, openTargetForm, oxLink: oxLinkNow, menuOptions: menuOptionsNow };
})();
