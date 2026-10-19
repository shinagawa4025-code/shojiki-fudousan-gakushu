// ホーム: 学ぶ目的(learnerProfile)と試験日で2種類の表示にする
//  どちらも一番上に「今日のメニュー(約15分)」(Recommend.todayMenu: 復習 → 解き直し → 苦手の○× → 新しい基礎知識)
//  試験向け(宅建士・税理士の目的、または試験日を登録済み): 今日の学習リング・残り日数・次にやること・分野別の習熟度
//  暮らし・仕事向け: 今日の1テーマ・目的から選ぶ・続きから・次にやること(気になるテーマの基礎知識)
// 「次にやること」は弱点分析(Analysis)の優先順を基準にし、同じリンク先のボタンは画面の中で1回だけ出す
// (今日のメニューに出したリンクは、ヒーロー・次にやることでは重ねない。メニューが終わるまではヒーローの主ボタンも出さない)
// v12: 今日の学習リングは1日の目標(Goals: 回数か分)、宅建士のヒーローに合格予測の1行(Predict)、「今週やること」(Plan)、
//      試験日が過ぎて次の目標がないときは残り日数の代わりに「お疲れさまでした」と合格発表の案内(Plan の state 'after')
//      見込みの試験日(tentative)の目標は、日付を出すところに必ず「見込み」と添える
// v3 デザイン(ゲーム感のある学習アプリ): 上に記録のカウンター(連続日数・今日の目標・バッジ)、マスコットのあいさつと
//      大きな「つづける」ボタン、今日のメニューは丸い節を太い線でつないだ「道」。全部終わったら金色のゴールと紙吹雪(1日1回)
//      アイコンは丸いステッカーで、分野の色(.cat-*)をステッカーと習熟度のバーにそろえる。説明の小さい灰色の文は必要なものだけ
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
      <label class="target-tentative" data-role="tentative-row" hidden>
        <input type="checkbox" name="tentative">
        <span>見込みの試験日(公式発表の前)として登録する<small>ホームなどに「見込み」と表示します。発表されたら日付を確かめてください</small></span>
      </label>
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
    const tentRow = form.querySelector(`[data-role="tentative-row"]`);
    const tentBox = form.querySelector(`[name="tentative"]`);
    // 見込みの日付: 見込みの候補を選んだとき・見込みの目標を編集するときだけ、チェックを出す(日付を変えたら外す)
    let tentDate = editing && existing.tentative === true ? existing.date : ``;
    function syncTentative() {
      const on = !!tentDate && dateInput.value === tentDate;
      tentRow.hidden = !tentDate;
      if (!on) tentBox.checked = false;
    }
    if (tentDate) tentBox.checked = true;
    // 編集時は付けてある名前を勝手に書き換えない
    if (editing) nameInput.dataset.touched = `1`;
    function suggestName() {
      if (nameInput.dataset.touched) return;
      const t = Stats.examType(typeSel.value);
      nameInput.value = t && t.id !== `other` ? (t.id === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`) : ``;
    }
    // 公式の試験日(まだ来ていないもの)をワンタップで入れる。公式の日付がまだない試験は、見込みの日付(未発表と明記)も出す
    function paintOfficials() {
      const official = Stats.officialDates ? Stats.officialDates(typeSel.value) : [];
      const expected = Stats.expectedDates ? Stats.expectedDates(typeSel.value).filter((e) => !official.some((o) => o.date === e.date)) : [];
      const list = official.map((o) => Object.assign({ tentative: false }, o)).concat(expected);
      officialsEl.hidden = !list.length;
      officialsEl.innerHTML = list.map((o) => {
        const d = DateUtil.parse(o.date);
        const md = d ? `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})` : o.date;
        const label = o.tentative ? `${esc(o.label)}(見込み・未発表) ${md}` : `${esc(o.label)} ${md}`;
        return `<button type="button" class="chip chip-small${o.tentative ? ` chip-tentative` : ``}" data-date="${o.date}"${o.tentative ? ` data-tentative="1"` : ``} aria-pressed="${dateInput.value === o.date}"${o.tentative && o.note ? ` aria-describedby="target-tent-note"` : ``}>${ic(`calendar`, 14)}${label}</button>`;
      }).join(``) + (expected.length ? `<p class="calc-note target-tent-note" id="target-tent-note">${esc(expected[0].note)}。公式の試験日は発表後に実施機関のサイトで確認してください。</p>` : ``);
      officialsEl.querySelectorAll(`[data-date]`).forEach((b) => b.addEventListener(`click`, () => {
        dateInput.value = b.dataset.date;
        officialsEl.querySelectorAll(`[data-date]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
        if (b.dataset.tentative) { tentDate = b.dataset.date; tentBox.checked = true; }
        syncTentative();
      }));
    }
    nameInput.addEventListener(`input`, () => { nameInput.dataset.touched = `1`; });
    typeSel.addEventListener(`change`, () => { suggestName(); paintOfficials(); });
    dateInput.addEventListener(`input`, () => {
      officialsEl.querySelectorAll(`[data-date]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x.dataset.date === dateInput.value)));
      syncTentative();
    });
    suggestName();
    paintOfficials();
    syncTentative();

    const sheet = UI.sheet({ title: editing ? `試験日を編集` : `試験日を登録`, content: form });
    form.addEventListener(`submit`, (e) => {
      e.preventDefault();
      const date = dateInput.value;
      if (!DateUtil.isValid(date)) return;
      const tentative = !tentRow.hidden && tentBox.checked && date === tentDate;
      if (editing) {
        Stats.updateTarget(existing.id, { name: nameInput.value, examTypeId: typeSel.value, date, tentative });
      } else {
        Stats.addTarget({ name: nameInput.value, examTypeId: typeSel.value, date, tentative });
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
  function buildContext(light) {
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
    const allCards = Srs.getAllCards();
    const ctx = {
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
      cards: Object.keys(allCards).length,
      activeDays,
      newcomer: activeDays === 0,
      streak: Streak.getCurrentStreak(),
      todayCount: Streak.todayCount ? Streak.todayCount() : Streak.countOf(Storage.get(`activityLog`, {})[DateUtil.today()]),
    };
    // v12: 1日の目標・学習計画・合格予測(どれも保存値だけの軽い計算。計画には上で作った弱点分析をそのまま渡す)
    // ほかの画面から使うとき(oxLink・menuOptions)は要らないので作らない
    if (light) return ctx;
    ctx.goal = window.Goals && Goals.today ? safe(() => Goals.today(), null) : null;
    ctx.plan = window.Plan && Plan.current ? safe(() => Plan.current({ snap, cardsPerDay: ctx.due + ctx.newAvail }), null) : null;
    ctx.predict = ctx.variant === `exam` && ctx.typeId === `takken` && window.Predict && Predict.estimate ? safe(() => Predict.estimate(), null) : null;
    // v3: 記録のカウンター(バッジは保存済みの数だけ数える。Badges.list は判定・お知らせまでするのでホームでは呼ばない)と、
    //     マスコットのひとこと用の「期限を過ぎた復習カード」(昨日までに復習するはずだった枚数)
    ctx.badges = window.Badges && Badges.earnedCount ? safe(() => Badges.earnedCount(), 0) : 0;
    const today = DateUtil.today();
    ctx.overdue = Object.keys(allCards).filter((id) => {
      const c = allCards[id];
      return c && typeof c.dueDate === `string` && c.dueDate < today && AppIndex.termsById[id];
    }).length;
    return ctx;
  }

  // 新しい部品(目標・計画・予測)が失敗しても、ホームはこれまでどおり表示する
  function safe(fn, fallback) {
    try { return fn(); } catch (e) {
      console.error(`[ホーム] 表示の一部を作れませんでした`, e);
      return fallback;
    }
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

  // 分野の○×(#ox/cat/<分野>/<問題数>)の分野。問題数だけが違うリンクを同じものとして扱うために使う
  function oxCatOf(nav) {
    const m = /^#ox\/cat\/([^/]+)/.exec(String(nav || ``));
    return m ? m[1] : null;
  }

  // 同じ分野の○×(問題数だけ違うもの。ヒーローの「○×で10問」と次にやることの「〇〇を○×で確認(20問)」など)をもう出しているか
  function sameOxCatUsed(used, a) {
    const c = a && a.kind === `ox` ? oxCatOf(a.nav) : null;
    if (!c) return false;
    for (const n of used) if (oxCatOf(n) === c) return true;
    return false;
  }

  // ヒーローの「○×で10問」: 税理士は消費税法(文がなければ不動産と消費税)、宅建士(または未登録)は優先して伸ばしたい分野
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
      // 分析がまだない(文の数が分からない)ときは、これまでどおり不動産と消費税
      const zid = byCat ? [`shohiho`, `shohi`].find((id) => have(id, 1)) : `shohi`;
      if (!zid) return { nav: `#ox`, label: `○×一問一答`, scope: `1問数秒` };
      return { nav: `#ox/cat/${zid}/10`, label: `○×で${sized(zid)}問`, scope: categoryName(ctx, zid) || (zid === `shohi` ? `不動産と消費税` : `消費税法`) };
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

  // 分野の色(ステッカー・バー)。税理士の「不動産税務」は税の色、「消費税法」は消費税の色。分からない分野は既定の緑
  const CAT_IDS = [`gyoho`, `kenri`, `horei`, `zei`, `menjo`, `shohi`];
  function catCls(id) {
    if (id === `shisan`) return `cat-zei`;
    if (id === `shohiho`) return `cat-shohi`;
    return CAT_IDS.includes(id) ? `cat-${id}` : ``;
  }

  // 丸いステッカー(色の面+白いアイコン)。cls: sticker-sm / sticker-gold / cat-* など
  function sticker(icon, cls, size) {
    return `<span class="sticker${cls ? ` ${cls}` : ``}" aria-hidden="true">${ic(icon || `lightbulb`, size || 22)}</span>`;
  }

  // 押せるタイル(ステッカー+ラベル+範囲)。cat: 分野の色
  function quickHtml(nav, icon, label, scope, cat) {
    return `<a class="quick${cat ? ` ${cat}` : ``}" href="${esc(nav)}">${sticker(icon, `sticker-sm`, 18)}<span><b>${esc(label)}</b>${scope ? `<small>${esc(scope)}</small>` : ``}</span></a>`;
  }

  // 大きな主ボタン(マスコットの下)。title が大きな文字、sub がその下の小さな文字
  function goHtml(p) {
    return `
      <a class="btn btn-lg home-go${p.dup ? ` is-dup` : ``}" href="${esc(p.nav)}">
        <span class="home-go-text"><span class="home-go-title">${esc(p.title)}</span>${p.sub ? `<small>${esc(p.sub)}</small>` : ``}</span>
        <span class="home-go-arrow" aria-hidden="true">${ic(`arrow-right`, 22)}</span>
      </a>`;
  }

  // 1行の行(ステッカー+見出し+右の短い補足)。it.cat で分野の色、it.warn で要注意の色。it.sub は it.keepSub のときだけ出す
  function listRowHtml(it) {
    return `
      <a class="list-row${it.cat ? ` ${it.cat}` : ``}" href="${esc(it.nav)}">
        <span class="list-row-icon${it.warn ? ` is-warn` : ``}">${ic(it.icon || `lightbulb`)}</span>
        <span class="list-row-main"><span class="list-row-title">${esc(it.title)}</span>${it.sub && it.keepSub ? `<span class="list-row-sub">${esc(it.sub)}</span>` : ``}</span>
        ${it.meta ? `<span class="list-row-meta num">${esc(it.meta)}</span>` : ``}
        ${ic(`chevron-right`, 18)}
      </a>`;
  }

  function sectionEl(title, link, inner, cls) {
    return el(`section`, `home-section${cls ? ` ${cls}` : ``}`, `
      <div class="section-head"><h3>${esc(title)}</h3>${link ? `<a class="link-btn" href="${esc(link.nav)}">${esc(link.label)}${ic(`chevron-right`, 16)}</a>` : ``}</div>
      ${inner}`);
  }

  // 今日の目標: 1日の目標(Goals.today() = { kind: 回数|分, value, done, met })。目標の仕組みがなければ今日の学習回数 / 10
  function ringGoal(ctx) {
    if (ctx.goal && Number.isFinite(Number(ctx.goal.value)) && ctx.goal.value > 0) return ctx.goal;
    return { kind: `actions`, value: DAILY_GOAL, done: ctx.todayCount, met: ctx.todayCount >= DAILY_GOAL };
  }

  // ---- 記録のカウンター(連続日数・今日の目標・バッジ)。押すとそれぞれの記録・設定へ ----
  function statusEl(ctx) {
    const n = Math.max(0, Math.floor(num(ctx.streak)));
    // 今日まだ学習していない間は炎を消しておく(昨日までの連続はそのまま数える)
    const lit = ctx.todayCount > 0;
    const streakLabel = `連続学習 ${n}日${n && !lit ? `(今日はまだ)` : ``}`;
    const g = ringGoal(ctx);
    const goal = Math.max(1, Math.floor(num(g.value)));
    const done = Math.max(0, Math.floor(num(g.done)));
    const minutes = g.kind === `minutes`;
    const met = !!g.met;
    const R = 15;
    const C = 2 * Math.PI * R;
    const shown = Math.min(done, goal);
    const fill = shown ? `<circle class="ring-fill" cx="20" cy="20" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - shown / goal)).toFixed(1)}"/>` : ``;
    const goalLabel = `今日の目標 ${minutes ? `${done}分/${goal}分` : `${done}/${goal}回`}${met ? `(達成)` : ``}`;
    const badges = Math.max(0, Math.floor(num(ctx.badges)));
    const sec = el(`section`, `home-stats`);
    sec.setAttribute(`aria-label`, `学習の記録`);
    sec.innerHTML = `
      <a class="stat stat-streak${lit ? `` : ` is-off`}" href="#progress" aria-label="${streakLabel}">
        ${sticker(`flame-fill`, `sticker-sm sticker-gold`, 20)}
        <span class="stat-text" aria-hidden="true"><span class="stat-num"><b>${n}</b><small>日</small></span><span class="stat-label">連続</span></span>
      </a>
      <a class="stat stat-goal${met ? ` is-met` : ``}" href="#settings/goal" aria-label="${goalLabel}">
        <span class="stat-ring" aria-hidden="true"><svg class="ring-svg" viewBox="0 0 40 40"><circle class="ring-track" cx="20" cy="20" r="${R}"/>${fill}</svg>${ic(met ? `check` : `bolt`, 16)}</span>
        <span class="stat-text" aria-hidden="true"><span class="stat-num"><b>${done}</b><small><span class="stat-of">/${goal}</span>${minutes ? `分` : `回`}</small></span><span class="stat-label">今日の目標</span></span>
      </a>
      <a class="stat stat-badge" href="#progress/badges" aria-label="バッジ ${badges}個">
        ${sticker(`medal`, `sticker-sm sticker-gold`, 20)}
        <span class="stat-text" aria-hidden="true"><span class="stat-num"><b>${badges}</b><small>個</small></span><span class="stat-label">バッジ</span></span>
      </a>`;
    // 前に見せたときより増えた数だけ数え上げる(js/motion.js。このタブの中で覚える)
    if (window.Motion) {
      const b = sec.querySelectorAll(`.stat-num b`);
      Motion.countUp(b[0], n, `streak`);
      Motion.countUp(b[1], done, `goal-${g.kind}`);
      Motion.countUp(b[2], badges, `badges`);
    }
    return sec;
  }

  // ---- マスコットのあいさつ(表情とひとことは、いまの記録から1つだけ選ぶ)と大きな主ボタン ----
  function moodOf(ctx, st) {
    const plan = ctx.plan;
    const p = ctx.target ? safe(() => Stats.pace(ctx.target), null) : null;
    if (plan && plan.state === `after`) return { face: `happy`, text: `試験、おつかれさまでした!` };
    if (p && p.daysLeft === 0) return { face: `cheer`, text: `今日は試験日。落ち着いていこう!` };
    if (st && st.allDone) return { face: `cheer`, text: `今日のメニュー達成!よくがんばったね` };
    const g = ringGoal(ctx);
    if (g.met) return { face: `cheer`, text: `今日の目標を達成!この調子でいこう` };
    if (ctx.overdue > 0 && ctx.due > 0) return { face: `think`, text: `復習カードが${ctx.due}枚たまっています。先に片づけよう` };
    if (p && p.daysLeft > 0 && p.daysLeft <= 14) return { face: `normal`, text: `試験まであと${p.daysLeft}日。解き直しを優先しよう` };
    const left = Math.floor(num(g.value)) - Math.floor(num(g.done));
    if (g.done > 0 && left > 0 && left <= 5) return { face: `normal`, text: `あと${left}${g.kind === `minutes` ? `分` : `回`}で今日の目標!` };
    if (ctx.newcomer) return { face: `happy`, text: st && st.minutes ? `はじめまして!まずは約${st.minutes}分、いっしょにやろう` : `はじめまして!いっしょに学んでいこう` };
    if (ctx.streak >= 2 && !ctx.todayCount) return { face: `normal`, text: `今日も学ぶと${ctx.streak + 1}日連続!` };
    if (st && st.next) return { face: `normal`, text: st.done ? `残り約${st.minutes}分。この調子!` : `今日は約${st.minutes}分。いっしょにやろう!` };
    return { face: `normal`, text: `今日も少しずつ進めよう` };
  }

  function greetEl(ctx, st, go) {
    const m = moodOf(ctx, st);
    const art = window.Mascot && Mascot.svg ? Mascot.svg(m.face, 84, { className: `home-mascot` }) : ``;
    const sec = el(`section`, `home-greet${art ? `` : ` no-mascot`}`);
    sec.setAttribute(`aria-labelledby`, `home-hello`);
    sec.innerHTML = `
      <div class="home-greet-row">
        ${art}
        <div class="home-bubble">
          <h2 class="home-hello" id="home-hello">${greeting()}</h2>
          <p class="home-say">${esc(m.text)}</p>
        </div>
      </div>
      ${go ? goHtml(go) : ``}`;
    // タップすると跳ねて表情が変わる(js/motion.js。飾りなので読み上げない・フォーカスしない)
    if (art && window.Motion) Motion.tapMascot(sec.querySelector(`.home-mascot`));
    return sec;
  }

  // ---- 試験向けのヒーロー ----
  // 残り日数の大きな色のカード(合格予測の1行つき)+ ○×・次の学習の2つのタイル。
  // 主ボタン(メニューが終わった後の「次の学習」)はここには出さず out.primary で返し、マスコットの下の大きなボタンにする
  function examHero(ctx, used, out) {
    const sec = el(`section`, `home-hero2 is-exam`);
    sec.setAttribute(`aria-label`, `試験の目標`);
    const target = ctx.target;
    const notes = [];
    let p = null;
    let card;
    if (target) {
      p = Stats.pace(target);
      const date = shortDate(target.date, true);
      // 見込み(公式発表前)の試験日は、日付のそばに必ず「見込み」と出す
      const tent = target.tentative === true ? tentativeTag() : ``;
      const eyebrow = (suffix) => `<p class="hero2-eyebrow">${ic(`target`, 16)}<span>${esc(target.name)}${suffix}</span>${tent}</p>`;
      if (p.daysLeft > 0) {
        // 補足はアプリが作る数値と定型文だけ(利用者の入力を含まない)なので、句切りで折り返すよう HTML で組む
        let paceLine = ``;
        if (p.remaining > 0) paceLine = `<span class="nowrap">1日${p.perDay}項目ペース</span>`;
        else if (p.total > 0) paceLine = `<span class="nowrap">範囲はすべて学習済み</span>`;
        const phase = ctx.plan && ctx.plan.state === `before` && ctx.plan.phase ? ctx.plan.phase : null;
        card = `
          <div class="home-count is-count">
            <div class="count-top">
              ${eyebrow(`まで`)}
              ${phase ? `<span class="count-phase">${ic(phase.icon || `flag`, 14)}${esc(phase.name)}</span>` : ``}
            </div>
            <p class="hero2-days count-days"><strong class="num">${p.daysLeft}</strong><span>日</span></p>
            <p class="count-sub"><span class="nowrap">${date}${target.tentative === true ? `(見込み)` : ``}</span>${paceLine ? `・${paceLine}` : ``}</p>
            ${predictLine(ctx)}
          </div>`;
      } else if (p.daysLeft === 0) {
        card = `
          <div class="home-count is-today">
            ${eyebrow(``)}
            <p class="hero2-days count-days"><strong>今日が試験日</strong></p>
            <p class="count-sub">落ち着いて、がんばってください</p>
          </div>`;
      } else if (ctx.plan && ctx.plan.state === `after`) {
        // 試験の後(次の目標なし): 残り日数の代わりに、お疲れさまでした・合格発表の案内・次の目標の登録
        card = `
          <div class="home-count is-after">
            <div class="count-head">
              ${sticker(`trophy-fill`, `sticker-lg sticker-gold`, 28)}
              <div class="count-head-text">
                ${eyebrow(``)}
                <p class="hero2-days is-after"><strong>お疲れさまでした</strong></p>
                <p class="count-sub">${date}の試験から${-p.daysLeft}日</p>
              </div>
            </div>
            ${afterHtml(ctx.plan)}
          </div>`;
      } else {
        card = `
          <div class="home-count is-ended">
            <div class="count-head">
              ${sticker(`flag`, `sticker-lg`, 26)}
              <div class="count-head-text">
                ${eyebrow(``)}
                <p class="hero2-days is-ended"><strong>終了</strong></p>
                <p class="count-sub">${date}・${-p.daysLeft}日前に終了</p>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-block" data-role="add-target">${ic(`calendar`, 18)}次の目標を登録</button>
          </div>`;
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
      // 公式の試験日がまだ発表されていない(今年の試験が終わった)ときは、次の年度の見込みの日付を「見込み・未発表」と明記して出す
      const expected = !officials.length && Stats.expectedDates ? Stats.expectedDates(ctx.typeId) : [];
      const o = officials[0] || expected[0] || null;
      const oLabel = o ? `${esc(o.label)}${o.tentative ? `(見込み・未発表)` : ``} ${o.tentative ? DateUtil.toJapanese(o.date, true) : shortDate(o.date, true)}で登録` : ``;
      card = `
        <div class="home-count is-setup">
          <div class="count-head">
            ${sticker(`calendar`, `sticker-lg`, 26)}
            <div class="count-head-text">
              <p class="hero2-eyebrow"><span>${esc(t ? `${t.shortName}試験` : `試験`)}の対策</span></p>
              <p class="count-lead">試験日を登録すると、残り日数と1日の学習量の目安を表示します</p>
            </div>
          </div>
          <div class="hero2-target-actions">
            ${o ? `<button type="button" class="chip chip-small${o.tentative ? ` chip-tentative` : ``}" data-role="official" data-date="${o.date}"${o.tentative ? ` data-tentative="1"` : ``}>${ic(`calendar`, 14)}${oLabel}</button>` : ``}
            <button type="button" class="link-btn hero2-link" data-role="add-target">${ic(`calendar`, 16)}${o ? `別の日付で登録` : `試験日を登録`}</button>
          </div>
          ${o && o.tentative ? `<p class="calc-note hero2-tent-note">${esc(o.note || `見込み・未発表`)}。公式の試験日が発表されたら、設定で日付を確かめてください。</p>` : ``}
          ${predictLine(ctx)}
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
      const first = acts.find((a) => a.nav !== ox.nav && !used.has(a.nav) && !(a.kind === `ox` && oxCatOf(a.nav) && oxCatOf(a.nav) === oxCatOf(ox.nav)) && !sameOxCatUsed(used, a)) || null;
      if (first) primary = { nav: first.nav, title: verbTitle(ctx, first), sub: first.detail || `` };
      else primary = { nav: ox.nav, title: `○×一問一答で確認`, sub: `1問数秒。間違えた文だけ解き直せます` };
    }
    if (primary && (used.has(primary.nav) || used.has(`menu-open`))) primary = null;
    if (primary) used.add(primary.nav);
    if (out) out.primary = primary;
    const tiles = [];
    if ((!primary || primary.nav !== ox.nav) && !used.has(ox.nav)) {
      tiles.push(quickHtml(ox.nav, `o-x`, ox.label, ox.scope, catCls(oxCatOf(ox.nav))));
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
      const pool = acts.filter((a) => !used.has(a.nav) && !sameOxCatUsed(used, a));
      const pick = (urgent && pool.find(isWeakKind)) || pool.find((a) => a.kind !== `ox`) || pool[0] || null;
      if (pick) {
        const s = shortAction(ctx, pick);
        tiles.push(quickHtml(pick.nav, pick.icon, s.label, s.scope, isWeakKind(pick) ? `is-warn` : catCls(pick.categoryId)));
        used.add(pick.nav);
        if (pick.kind === `exam`) used.add(`kind:exam`);
      }
    }

    const today = DateUtil.today();
    const others = Stats.listTargets().filter((t) => !target || t.id !== target.id);
    sec.innerHTML = `
      ${card}
      ${doneLine}
      ${notes.length ? `<div class="hero2-notes">${notes.join(``)}</div>` : ``}
      ${tiles.length ? `<div class="hero2-quick${tiles.length === 1 ? ` is-single` : ``}">${tiles.join(``)}</div>` : ``}
      ${others.length ? `<div class="chip-row hero-others">${others.map((t) => {
        const d = DateUtil.diffDays(today, t.date);
        const left = Number.isFinite(d) && d >= 0 ? `あと${d}日` : `終了`;
        const name = `${t.name}${t.tentative === true ? `(見込み)` : ``}`;
        return `<a class="chip chip-small chip-muted" href="#settings/targets" aria-label="${esc(name)} ${left}(設定でホームに表示する試験を切り替え)">${esc(name)} ${left}</a>`;
      }).join(``)}</div>` : ``}`;
    sec.querySelectorAll(`[data-role="add-target"]`).forEach((b) => b.addEventListener(`click`, () => openTargetForm(rerender, null, { examTypeId: ctx.typeId })));
    const official = sec.querySelector(`[data-role="official"]`);
    if (official) {
      official.addEventListener(`click`, () => {
        const typeId = ctx.typeId || `takken`;
        const tentative = official.dataset.tentative === `1`;
        Stats.addTarget({ name: typeId === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`, examTypeId: typeId, date: official.dataset.date, primary: true, tentative });
        UI.toast(tentative ? `見込みの試験日で登録しました` : `試験日を登録しました`, `success`);
        rerender();
      });
    }
    if (ctx.plan && ctx.plan.state === `after`) wireAfter(sec, ctx.plan, rerender);
    return sec;
  }

  // 「見込み」の小さな札(公式発表前の試験日)
  function tentativeTag() {
    return `<span class="tag-tentative" title="公式発表前の見込みの試験日">見込み</span>`;
  }

  // ---- 合格予測の1行(宅建士。js/predict.js。数字はアプリ独自の推定と明記する) ----
  function predictLine(ctx) {
    const r = ctx.predict;
    if (!r) return ``;
    if (r.status === `ok`) {
      return `
        <a class="hero-predict" href="#progress/predict">${ic(`chart`, 16)}
          <span>合格予測<small>(アプリ独自の推定)</small> <strong class="num nowrap">${r.low}〜${r.high}点</strong>${r.exempt ? `<small class="nowrap">(5問免除)</small>` : ``}</span>
          ${ic(`chevron-right`, 16)}
        </a>`;
    }
    return `
      <a class="hero-predict is-pending" href="#progress/predict">${ic(`chart`, 16)}
        <span>合格予測: 4択をあと<strong class="num">${r.need}</strong>問解くと表示</span>
        ${ic(`chevron-right`, 16)}
      </a>`;
  }

  // ---- 試験の後(Plan.current().state === 'after'): 合格発表の案内・次の目標の登録 ----
  // ホームのヒーローと学習計画の画面(js/views/plan.js)で同じものを使う。wireAfter でボタンを動かす
  function afterHtml(plan) {
    const a = (plan && plan.after) || {};
    const res = a.results;
    const today = DateUtil.today();
    let resLine = ``;
    if (res && res.url) {
      const when = res.date ? `${shortDate(res.date, true)}${res.time ? ` ${res.time}` : ``}` : ``;
      // 発表日の当日は時刻の前後どちらでも読めるように「今日(…)」。年が変わってから見るときは年も付ける
      const text = res.date && res.date === today ? `合格発表は<strong class="nowrap">今日(${esc(when)})</strong>です。`
        : res.date && res.date > today ? `合格発表は<strong class="nowrap">${esc(when)}</strong><span class="nowrap">の予定です。</span>`
          : res.date ? `合格発表は${esc(res.date.slice(0, 4) === today.slice(0, 4) ? shortDate(res.date, true) : DateUtil.toJapanese(res.date, true))}に行われました。`
            : `合格発表の日程と結果は、実施機関のサイトで確認できます。`;
      resLine = `
        <p class="after-result">${ic(`calendar`, 16)}
          <span>${text}<a class="after-link" href="${esc(res.url)}" target="_blank" rel="noopener noreferrer">${esc(res.org || `実施機関`)}<span class="nowrap">のサイト${ic(`external`, 14)}</span><span class="sr-only">(新しいタブで開きます)</span></a></span>
        </p>`;
    }
    // 次の目標の候補: 公式の試験日 > 見込みの日付(「見込み・未発表」と明記)
    const next = a.official || a.next || null;
    const nextBtn = next ? `
      <button type="button" class="btn btn-secondary after-next" data-role="after-next" data-date="${esc(next.date)}" data-type="${esc(next.examTypeId)}"${next.tentative ? ` data-tentative="1"` : ``}>
        ${ic(`calendar`, 18)}
        <span class="after-next-text">
          <span class="after-next-title">${esc(next.label)}で次の目標を登録</span>
          <small>${DateUtil.toJapanese(next.date, true)}${next.tentative ? `・${esc(next.note || `見込み・未発表`)}` : ``}</small>
        </span>
      </button>` : ``;
    return `
      <div class="after-panel">
        ${resLine}
        ${nextBtn}
        ${next && next.tentative ? `<p class="calc-note after-note">見込みの日付で登録すると「見込み」と表示します。公式の試験日が発表されたら、設定で日付を確かめてください。</p>` : ``}
        <button type="button" class="link-btn hero2-link" data-role="after-add">${ic(`calendar`, 16)}${next ? `別の日付で次の目標を登録` : `次の目標を登録`}</button>
      </div>`;
  }

  function wireAfter(root, plan, onChange) {
    const btn = root.querySelector(`[data-role="after-next"]`);
    if (btn) {
      btn.addEventListener(`click`, () => {
        const typeId = btn.dataset.type && Stats.examType(btn.dataset.type) ? btn.dataset.type : plan.examTypeId;
        const tentative = btn.dataset.tentative === `1`;
        Stats.addTarget({ name: typeId === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`, examTypeId: typeId, date: btn.dataset.date, primary: true, tentative });
        UI.toast(tentative ? `見込みの試験日で登録しました` : `試験日を登録しました`, `success`);
        if (onChange) onChange();
      });
    }
    const add = root.querySelector(`[data-role="after-add"]`);
    if (add) add.addEventListener(`click`, () => openTargetForm(onChange, null, { examTypeId: plan.examTypeId }));
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

  function generalHero(ctx, plan, used, out) {
    const sec = el(`section`, `home-hero2 is-general`);
    sec.setAttribute(`aria-label`, `今日の1テーマ`);
    const theme = plan.theme;
    const labels = interestLabels(ctx);
    let body = ``;
    let primary = null;
    if (theme && used.has(`#topics/${theme.topic.id}/${theme.basicId}`)) {
      // 今日の1テーマは今日のメニューの「新しい基礎知識」で案内しているので、ここでは○×・計算機のタイルだけにする
      sec.setAttribute(`aria-label`, `すぐに使える機能`);
      sec.classList.add(`is-compact`);
    } else if (theme) {
      const topic = theme.topic;
      const nav = `#topics/${topic.id}/${theme.basicId}`;
      // カードそのものがテーマへのリンク(主ボタンはマスコットの下に出す)
      body = `
        <a class="theme-card" href="${esc(nav)}">
          ${sticker(topic.icon || `book-open`, `sticker-lg`, 28)}
          <span class="theme-main">
            <span class="theme-eyebrow">今日の1テーマ・約3分</span>
            <span class="theme-title">${esc(theme.basic ? theme.basic.name : topic.name)}</span>
            <span class="theme-sub">${esc(topic.name)}・<span class="num">${theme.done}/${theme.total}</span></span>
          </span>
          ${ic(`chevron-right`, 18)}
        </a>`;
      primary = { nav, title: `読んでみる`, sub: `読んだら「学習済み」にチェック` };
    } else {
      body = `
        <div class="theme-card is-static">
          ${sticker(`trophy-fill`, `sticker-lg sticker-gold`, 28)}
          <span class="theme-main">
            <span class="theme-eyebrow">今日の1テーマ</span>
            <span class="theme-title">暮らしの基礎知識はすべて学習済みです</span>
            <span class="theme-sub">○×や4択で、覚えたことを確かめましょう</span>
          </span>
        </div>`;
      primary = { nav: `#quiz`, title: `4択問題で確かめる`, sub: `選択肢ごとの解説つき` };
    }
    // 今日のメニューで案内しているリンク・メニューが終わっていない間の主ボタンは重ねない
    if (primary && (used.has(primary.nav) || (used.has(`menu-open`) && !theme))) primary = null;
    if (primary) used.add(primary.nav);
    if (out) out.primary = primary;
    const ox = generalOx(ctx, theme);
    const tiles = [];
    if (!used.has(ox.nav)) { tiles.push(quickHtml(ox.nav, `o-x`, ox.label, ox.scope)); used.add(ox.nav); }
    const firstInterest = ctx.profile && ctx.profile.interests[0];
    tiles.push(quickHtml(`#calculators`, `calculator`, `費用を計算`, CALC_SUB[firstInterest] || `初期費用・ローン`, `cat-kenri`));
    used.add(`#calculators`);
    sec.innerHTML = `
      ${labels.length ? `<p class="hero2-interests"><span>気になるテーマ: <strong>${esc(labels.join(`・`))}</strong></span><a class="link-btn" href="#settings/profile">変更${ic(`chevron-right`, 14)}</a></p>` : ``}
      ${body}
      <div class="hero2-quick${tiles.length === 1 ? ` is-single` : ``}">${tiles.join(``)}</div>`;
    return sec;
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
    const sub = b.next ? `次は「${b.next.name}」` : `${b.total}項目すべて学習済み`;
    const pct = b.total > 0 ? Math.max(0, Math.min(100, Math.round((num(b.done) / b.total) * 100))) : 0;
    // 大きな押せるカード: トピックのステッカー・名前・次の項目と、学習済みの割合のバー
    return sectionEl(`続きから`, null, `
      <a class="continue-card" href="${esc(nav)}" aria-label="${esc(`${b.topic.name}(学習済み ${b.done}/${b.total})・${sub}`)}">
        ${sticker(b.topic.icon || `book-open`, `sticker-lg`, 28)}
        <span class="continue-main" aria-hidden="true">
          <span class="continue-title">${esc(b.topic.name)}</span>
          <span class="continue-sub">${esc(sub)}</span>
          <span class="continue-bar"><span class="progress-bar"><span class="progress-bar-fill" style="width:${pct}%"></span></span><span class="num">${b.done}/${b.total}</span></span>
        </span>
        ${ic(`chevron-right`, 18)}
      </a>`, `home-continue`);
  }

  // ---- 次にやること ----
  function reviewRow(ctx) {
    if (ctx.cards === 0 && ctx.newAvail > 0) {
      const n = Math.min(ctx.newAvail, 10);
      return { nav: `#review`, icon: `layers`, title: `最初の${n}語を覚える`, meta: `約${minutesFor(n)}分` };
    }
    if (ctx.due > 0) return { nav: `#review`, icon: `repeat`, warn: true, title: `今日の復習(${ctx.due}枚)`, meta: `約${minutesFor(ctx.due + ctx.newAvail)}分` };
    if (ctx.newAvail > 0) return { nav: `#review`, icon: `sparkles`, title: `新しい用語を覚える(${ctx.newAvail}語)`, meta: `約${minutesFor(ctx.newAvail)}分` };
    return null;
  }

  // planNavs: 今週やること(下の planRows)に出す行き先。同じ行き先(問題数だけ違う分野の○×も)は次にやることに重ねない
  function nextSectionExam(ctx, used, withLink, planNavs) {
    const inPlan = (a) => !!planNavs && (planNavs.has(a.nav) || sameOxCatUsed(planNavs, a));
    const rows = studyActions(ctx).filter((a) => !used.has(a.nav) && !sameOxCatUsed(used, a) && !inPlan(a) && !(a.kind === `ox-try` && used.has(`kind:ox`)) && !(a.kind === `exam` && used.has(`kind:exam`))).slice(0, 3).map((a) => {
      used.add(a.nav);
      if (a.kind === `exam`) used.add(`kind:exam`);
      // 行は見出しだけ(理由の補足は弱点分析の画面で見られる)。アイコンは分野の色、解き直しは要注意の色
      return { nav: a.nav, icon: a.icon, warn: isWeakKind(a), cat: catCls(a.categoryId), title: verbTitle(ctx, a) };
    });
    if (!rows.length) return null;
    return sectionEl(`次にやること`, withLink ? { nav: `#progress/weak`, label: `弱点分析` } : null, `<div class="list-group">${rows.map(listRowHtml).join(``)}</div>`, `home-next`);
  }

  // ---- 今週やること(試験向け。js/plan.js の上位3つ) ----
  // 1週間の量(問題数・分)の目安。学習計画の画面の並びの上位3つを出す。
  // ただし毎日の習慣の作業(今日の復習・間違えた4択・間違えた○×の解き直し)で、今日のメニュー(またはヒーローの主ボタン)が
  // もう同じ行き先を案内しているものは、ホームでは重ねずに次の作業を出す(学習計画の画面にはすべて出る)。
  // 分野の作業は「今週の量」の案内なので、メニュー・ヒーローと行き先が近くても出す。ここでは used に足さない
  const PLAN_ICONS = { exam: `timer`, drill: `repeat`, 'ox-weak': `o-x`, review: `layers`, basic: `book-open`, quiz: `pencil-check`, ox: `o-x` };
  const PLAN_HABIT = { review: [`#review`], drill: [`#quiz/due`], 'ox-weak': [`#ox/weak`] };
  function planRows(ctx, used) {
    const plan = ctx.plan;
    if (!plan || plan.state !== `before` || !Array.isArray(plan.week) || !plan.week.length || !plan.phase) return [];
    const all = plan.week.filter((it) => it && typeof it.href === `string`);
    const shown = (it) => (PLAN_HABIT[it.kind] || []).some((nav) => used.has(nav) || used.has(it.href));
    let list = all.filter((it) => !shown(it));
    if (!list.length) list = all;
    // 試験日まで7日を切ったら、学習計画の画面と同じく「今週」ではなく試験日までの日数の目安
    const span = plan.budget && plan.budget.days < 7 ? `${plan.budget.days}日で` : `今週`;
    return list.slice(0, 3).map((it) => (
      { nav: it.href, icon: PLAN_ICONS[it.kind] || `lightbulb`, cat: catCls(it.cat), warn: it.kind === `drill` || it.kind === `ox-weak`, title: it.label, sub: it.sub || ``, time: `${span} 約${hoursText(it.minutes)}` }
    ));
  }

  function planSection(ctx, rows) {
    const plan = ctx.plan;
    if (!rows || !rows.length) return null;
    // 分野の色のステッカーを付けたタイル(数が奇数なら最初のタイルを横いっぱいに)。いまの時期は残り日数のカードに出す
    const tiles = rows.map((r) => `
      <a class="plan-tile${r.cat ? ` ${r.cat}` : ``}" href="${esc(r.nav)}">
        ${sticker(r.icon, `sticker-sm${r.warn ? ` sticker-warn` : ``}`, 18)}
        <span class="plan-tile-title">${esc(r.title)}</span>
        <span class="plan-tile-meta num">${r.sub ? `${esc(r.sub)}・` : ``}${esc(r.time)}</span>
      </a>`).join(``);
    const sec = sectionEl(`今週やること`, { nav: `#plan`, label: `学習計画` }, `
      <div class="plan-tiles${rows.length % 2 ? ` is-odd` : ``}">${tiles}</div>`, `home-plan`);
    if (plan.budget && plan.budget.days < 7) sec.querySelector(`.section-head`).insertAdjacentHTML(`afterend`, `<p class="home-plan-phase">試験日までの${plan.budget.days}日の目安です</p>`);
    return sec;
  }

  // 95分 → 1時間35分
  function hoursText(min) {
    const m = Math.max(0, Math.round(num(min)));
    if (m < 60) return `${m}分`;
    return `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ``}`;
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
      rows.push({ nav, icon: b.topic.icon || `book-open`, title: `${b.topic.name}の基礎知識を読む`, meta: `${b.done}/${b.total}` });
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
    const active = week.filter((d) => d.active).length;
    // 連続日数は上のカウンターに出しているので、ここは今週の日数と最長記録(今日まだなら、続けるとどうなるか)
    let msg;
    if (ctx.todayCount > 0) msg = `今週<strong>${active}日</strong>学習・最長${Math.max(longest, n)}日`;
    else if (n > 0) msg = `今日も1問解くと <strong>${n + 1}日連続</strong>`;
    else msg = `1問解くと、今日から記録がはじまります`;
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
          <div class="mini-bar ${catCls(r.id) || `cat-life`}${r.id === focusId ? ` is-focus` : ``}">
            <div class="mini-bar-head"><b>${esc(r.name)}${r.id === focusId ? `<span class="mini-bar-tag">伸ばしたい</span>` : ``}</b><span class="num">${m}</span></div>
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${m}%"></div></div>
          </div>`;
      }).join(``);
      return sectionEl(`分野別の習熟度`, { nav: `#progress/weak`, label: `すべて` }, `
        <div class="card home-mastery-card">
          <div class="home-mastery"><strong class="num">${Math.round(num(s.mastery))}</strong><span>/100</span><span class="home-mastery-label">${esc(s.examName || ``)}の総合</span></div>
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
        <p class="home-card-note">${esc(type.shortName)}の学習済み・記憶済みの割合(問題を解くと習熟度に切り替わります)</p>
        <div class="mini-bars">
          ${rows.map((r) => `
            <div class="mini-bar ${catCls(r.id) || `cat-life`}">
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
  // 中断中の模擬試験があるか(壊れた保存値では「再開」を出さない。模擬試験の画面でも再開できないため)
  function hasExamSession() {
    const s = Storage.get(`examSession`, null);
    return !!(s && typeof s === `object` && typeof s.id === `string` && Array.isArray(s.questions) && s.questions.length > 0);
  }

  function examCard(ctx, used) {
    // 得点は 0〜問題数の整数だけ(模擬試験の画面の履歴と同じ条件)
    const history = Stats.examHistory().filter((e) => e && Number.isInteger(e.total) && e.total > 0 && Number.isInteger(e.score) && e.score >= 0 && e.score <= e.total);
    const hasSession = hasExamSession();
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
        ${sticker(`timer`, `sticker-sm`, 18)}
        <h3 class="card-title">模擬試験</h3>
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
    const styledCount = window.APP_DATA && Array.isArray(APP_DATA.quiz) ? APP_DATA.quiz.filter((q) => isMc(q) && q.style).length : 0;
    // v12(onboarding.js の WHATS_NEW を v12 にしたとき): 合格予測・学習計画・学習時間と目標・バッジ・個数問題など
    const items = version === `v12` ? [
      mcCount >= 300 ? `4択問題を約${Math.round(mcCount / 50) * 50}問に増やしました${styledCount ? `(本試験と同じ形式の「個数問題」「組合せ問題」${styledCount}問を含む)` : ``}` : ``,
      `<a href="#progress/predict">合格予測</a>を追加しました。最近の4択・模擬試験の分野別の正答率から、得点の見込みを幅つきで表示します(アプリ独自の推定です)`,
      `試験日から逆算した<a href="#plan">学習計画</a>を追加しました。いまの時期と「今週やること」がホームにも出ます`,
      `1日の目標(回数か学習時間)と、<a href="#progress/time">学習時間</a>・<a href="#progress/badges">バッジ</a>を追加しました`,
      `4択で正解しても自信がなかったときは「勘で当たった」を押すと、3日後の解き直しに入ります`,
      profileHint,
    ].filter(Boolean) : version !== `v10` ? [
      // v11: 苦手を自動で潰す仕組みを中心に案内する
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
    // 小さく出す: 見出しと「新しくなった点」の開閉(中身はこれまでと同じ)
    const card = el(`section`, `card home-news`);
    card.innerHTML = `
      <div class="home-news-head">
        ${sticker(`sparkles`, `sticker-sm`, 18)}
        <h3 class="card-title">アプリが新しくなりました</h3>
        <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="お知らせを閉じる">${ic(`x`)}</button>
      </div>
      <details class="home-news-more">
        <summary>新しくなった点(${items.length}件)${ic(`chevron-down`, 16)}</summary>
        <ul class="home-news-list">${items.map((t) => `<li>${t}</li>`).join(``)}</ul>
        ${log ? `<a class="link-btn" href="#about/changelog">更新履歴を見る${ic(`chevron-right`, 16)}</a>` : ``}
      </details>`;
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
      // 小さく出す: 見出し・手順・ボタン。理由と記録の引き継ぎの注意は開閉の中(文はこれまでと同じ)
      card.innerHTML = `
        <span class="home-note-icon">${sticker(`download`, `sticker-sm`, 18)}</span>
        <div class="home-note-main">
          <strong>ホーム画面に追加すると、記録が消えにくくなります</strong>
          <span class="home-install-steps">① 共有ボタン(□↑)をタップ(見当たらないときは「…」の中) <span class="nowrap">② 「ホーム画面に追加」</span> <span class="nowrap">③ 「追加」</span></span>
          <details class="home-note-more">
            <summary>理由と記録の引き継ぎ${ic(`chevron-down`, 16)}</summary>
            <span>Safariでしばらく開かないと、このアプリの学習記録が消えることがあります。ホーム画面に追加すると、アプリのように全画面で開けて、記録も保たれやすくなります。</span>
            <span class="home-install-sub">ホーム画面から開くと、Safariとは別に記録されることがあります。いまの記録を引き継ぐときは、先にバックアップを取り、アプリ側の設定で読み込んでください。</span>
          </details>
        </div>
        <div class="home-note-actions">
          <a class="btn btn-sm btn-secondary" href="#about/install">方法をくわしく</a>
          <a class="btn btn-sm btn-ghost" href="#settings/backup">${ic(`download`, 16)}バックアップ</a>
          <button type="button" class="btn btn-icon" data-role="dismiss" aria-label="ホーム画面への追加のお知らせを閉じる">${ic(`x`)}</button>
        </div>`;
    } else {
      card.innerHTML = `
        <span class="home-note-icon">${sticker(`download`, `sticker-sm`, 18)}</span>
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
      <span class="home-note-icon">${sticker(`shield`, `sticker-sm sticker-warn`, 18)}</span>
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

  // 今日のメニューの1手順: 丸い節(終わった手順は金色のチェック、いまの手順は大きな緑の節と「スタート」、これからの手順は灰色)
  // 節は太い線でつながる(線は li の ::before)。読み上げは手順ごとのリンクの aria-label で1回だけ
  function menuStepHtml(s, isNext) {
    const label = `${s.no}. ${s.title}(${s.done ? `完了` : `約${s.minutes}分`})`;
    const state = s.done ? `is-done` : isNext ? `is-next` : `is-todo`;
    const node = s.done ? ic(`check`, 26) : ic(s.icon || `book-open`, isNext ? 28 : 22);
    const body = isNext ? `
          <span class="path-card" aria-hidden="true">
            <span class="menu-step-title">${esc(s.title)}</span>
            ${s.sub ? `<span class="menu-step-sub">${esc(s.sub)}</span>` : ``}
            <span class="path-go"><span class="path-go-time num">約${s.minutes}分</span><span class="path-go-btn">スタート</span></span>
          </span>` : `
          <span class="menu-step-main" aria-hidden="true"><span class="menu-step-title">${esc(s.title)}</span></span>
          <span class="menu-step-meta" aria-hidden="true">${s.done ? `<span class="menu-step-tag">完了</span>` : `<span class="num">約${s.minutes}分</span>`}</span>`;
    return `
      <li class="path-step ${state}">
        <a class="menu-step ${state}" href="${esc(s.nav)}" data-step="${esc(s.id)}"${isNext ? ` aria-current="step"` : ``} aria-label="${esc(`${label}・${s.sub || ``}`)}">
          <span class="path-node" aria-hidden="true">${node}</span>${body}
        </a>
      </li>`;
  }

  // info.st にメニューのまとめ(Recommend.menuStatus)を入れて返す(マスコットのひとこと・主ボタンに使う)
  function menuCard(ctx, plan, used, info) {
    if (!window.Recommend || typeof Recommend.todayMenu !== `function`) return null;
    let steps;
    try { steps = Recommend.todayMenu(menuOptions(ctx, plan)); } catch (e) {
      console.error(`[ホーム] 今日のメニューを作れませんでした`, e);
      return null;
    }
    if (!Array.isArray(steps) || !steps.length) return null;
    const st = Recommend.menuStatus(steps);
    if (info) info.st = st;
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
    const time = st.allDone ? `${ic(`check-circle-fill`, 18)}<span>完了</span>` : `${ic(`timer`, 16)}<span class="num">${st.done ? `残り約${st.minutes}分` : `約${st.minutes}分`}</span>`;
    const sec = el(`section`, `home-menu${st.allDone ? ` is-done` : ``}`);
    sec.setAttribute(`aria-labelledby`, `home-menu-title`);
    sec.innerHTML = `
      <div class="home-menu-head">
        <h3 class="home-menu-title" id="home-menu-title">今日のメニュー</h3>
        <span class="home-menu-time">${time}</span>
      </div>
      <p class="sr-only">${st.total}手順中${st.done}手順完了</p>
      <ol class="home-path">${steps.map((s) => menuStepHtml(s, s === st.next)).join(``)}</ol>
      <div class="path-goal${st.allDone ? ` is-done` : ``}">
        <span class="path-node" aria-hidden="true">${ic(`trophy-fill`, st.allDone ? 30 : 22)}</span>
        <p class="path-goal-text">${st.allDone ? `今日のメニュー達成!` : `ゴール`}</p>
      </div>`;
    return sec;
  }

  // メニューを全部終えた日は、ゴールの節(画面の外ならマスコット)から紙吹雪を1回だけ(このタブの中で1日1回。動きを減らす設定では出ない)
  const CONFETTI_KEY = `fudomana.menuConfetti`;
  function celebrate(wrap) {
    const today = DateUtil.today();
    try {
      if (window.sessionStorage.getItem(CONFETTI_KEY) === today) return;
      window.sessionStorage.setItem(CONFETTI_KEY, today);
    } catch (e) { return; }
    if (!window.Mascot || typeof Mascot.confetti !== `function`) return;
    setTimeout(() => {
      if (!wrap.isConnected || document.visibilityState === `hidden`) return;
      const node = wrap.querySelector(`.path-goal .path-node`);
      const r = node ? node.getBoundingClientRect() : null;
      const inView = r && r.top >= 0 && r.bottom <= (window.innerHeight || 0);
      const from = inView ? node : wrap.querySelector(`.home-mascot`) || node;
      if (!from) return;
      if (node) node.classList.add(`anim-pop`);
      Mascot.confetti(from);
    }, 300);
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view home-view`;
    wrap.dataset.docTitle = `ホーム`;
    const ctx = buildContext();
    // 上: 記録のカウンターとマスコットのあいさつ(PCでは横に並ぶ)。下: スマホは1列、PCは左右2列
    wrap.innerHTML = `
      <div class="home-head" data-role="head"></div>
      <div class="home-layout is-${ctx.variant}">
        <div class="home-col home-col-main" data-role="main"></div>
        <div class="home-col home-col-side" data-role="side"></div>
      </div>`;
    root.appendChild(wrap);
    const head = wrap.querySelector(`[data-role="head"]`);
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
    const menu = {};
    const hero = {};
    if (ctx.variant === `exam`) {
      const analysis = analysisSection(ctx);
      place(main, menuCard(ctx, null, used, menu), 0);
      place(main, examHero(ctx, used, hero), 1);
      news.forEach((n) => place(main, n, 2));
      place(side, weekCard(ctx), 3);
      // 今週やること: 次にやることのあと。PCでは右の列。行き先は次にやることより先に決め、次にやることでは重ねない
      const week = safe(() => planRows(ctx, used), []);
      place(main, nextSectionExam(ctx, used, !analysis, new Set(week.map((r) => r.nav))), 4);
      place(side, safe(() => planSection(ctx, week), null), 4);
      place(side, analysis, 5);
      place(side, examCard(ctx, used), 6);
    } else {
      const plan = generalPlan(ctx);
      place(main, menuCard(ctx, plan, used, menu), 0);
      place(main, generalHero(ctx, plan, used, hero), 1);
      news.forEach((n) => place(main, n, 2));
      // 気になるテーマを選んだ人は「続きから・次にやること」を先に、まだの人は「目的から選ぶ」を先に
      const picked = ctx.interests.length > 0;
      place(main, continueSection(ctx, plan, used), picked ? 3 : 4);
      place(main, nextSectionGeneral(ctx, plan, used), picked ? 4 : 5);
      place(main, purposeSection(), picked ? 5 : 3);
      place(side, weekCard(ctx), 6);
      place(side, topicProgressSection(ctx, plan), 7);
      // 暮らし・仕事向け(学ぶ目的が未設定の人も)でも、中断中の模擬試験があれば再開の入口を出す
      if (hasExamSession()) place(side, examCard(ctx, used), 8);
    }
    // 大きな主ボタン: メニューのいまの手順(PCでは道の「スタート」と同じなので隠す)。メニューが終わったらヒーローの次の学習
    const st = menu.st || null;
    let go = null;
    if (st && st.next) {
      go = { nav: st.next.nav, title: st.done || !ctx.newcomer ? `つづける` : `はじめる`, sub: `${st.next.title}・約${st.next.minutes}分`, dup: true };
    } else if (hero.primary) {
      go = hero.primary;
    }
    head.appendChild(statusEl(ctx));
    head.appendChild(greetEl(ctx, st, go));
    if (!side.children.length) wrap.querySelector(`.home-layout`).classList.add(`is-single`);
    live = { wrap, main, ctx, day: DateUtil.today() };
    if (st && st.allDone) celebrate(wrap);
    watchInstallPrompt();
    watchDay();
    watchBadges();
  }

  // バッジは起動の数秒後に判定される(js/badges.js)。判定でバッジが増えたら('badges:change')、表示中のカウンターの数だけ書き換える
  let watchingBadges = false;
  function watchBadges() {
    if (watchingBadges) return;
    watchingBadges = true;
    window.addEventListener(`badges:change`, () => {
      if (!live || !live.wrap.isConnected) return;
      const a = live.wrap.querySelector(`.stat-badge`);
      const b = a && a.querySelector(`.stat-num b`);
      if (!b) return;
      const n = Math.max(0, Math.floor(num(window.Badges && Badges.earnedCount ? safe(() => Badges.earnedCount(), 0) : 0)));
      b.textContent = String(n);
      if (window.Motion) Motion.countUp(b, n, `badges`);
      a.setAttribute(`aria-label`, `バッジ ${n}個`);
    });
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
    try { return oxLink(buildContext(true)); } catch (e) { return { nav: `#ox`, label: `○×一問一答`, scope: `` }; }
  }

  // 解き直しの結果などの「次のメニュー」から使う: ホームの今日のメニューと同じ条件(Recommend.todayMenu の opts)。作れなければ undefined
  function menuOptionsNow() {
    try {
      const ctx = buildContext(true);
      return menuOptions(ctx, ctx.variant === `exam` ? null : generalPlan(ctx));
    } catch (e) { return undefined; }
  }

  return { render, openTargetForm, oxLink: oxLinkNow, menuOptions: menuOptionsNow, afterHtml, wireAfter, tentativeTag, hoursText };
})();
