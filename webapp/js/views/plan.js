// 学習計画の画面 #plan(v12): 試験日からの逆算計画(js/plan.js)を表示する
// 目標なし: 試験日の登録へ / 試験の前: 残り日数・いまの時期・試験までの流れ・今週やること・分野の配分 /
// 試験日: 応援の一言 / 試験の後: お疲れさまでした・合格発表の案内・次の目標の登録(ホームと同じ部品 Views.home.afterHtml)
// 計画はアプリ独自の目安。弱点分析(Analysis.analyze)はこの画面で1回だけ計算して Plan.current に渡す
window.Views = window.Views || {};
window.Views.plan = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);
  const ICONS = { exam: `timer`, drill: `repeat`, 'ox-weak': `o-x`, review: `layers`, basic: `book-open`, quiz: `pencil-check`, ox: `o-x` };

  function rerender() {
    if (window.Router) Router.navigate(`#plan`);
  }

  function home() {
    return window.Views && Views.home ? Views.home : null;
  }

  function hours(min) {
    const h = home();
    if (h && h.hoursText) return h.hoursText(min);
    return `${Math.round(min)}分`;
  }

  function mdw(s) {
    const d = DateUtil.parse(s);
    if (!d) return ``;
    return `${d.getMonth() + 1}月${d.getDate()}日(${[`日`, `月`, `火`, `水`, `木`, `金`, `土`][d.getDay()]})`;
  }

  function card(cls, html, label) {
    const el = document.createElement(`section`);
    el.className = `card ${cls}`;
    if (label) el.setAttribute(`aria-label`, label);
    el.innerHTML = html;
    return el;
  }

  function tentTag(t) {
    const h = home();
    return t && t.tentative === true ? (h && h.tentativeTag ? h.tentativeTag() : `<span class="tag-tentative">見込み</span>`) : ``;
  }

  function analyzeFor(typeId) {
    if (!window.Analysis || typeof Analysis.analyze !== `function`) return null;
    const type = Stats.examType(typeId);
    if (!type || !Array.isArray(type.categories)) return null;
    try { return Analysis.analyze(typeId); } catch (e) {
      console.warn(`[学習計画] 弱点分析に失敗しました`, e);
      return null;
    }
  }

  // ---- 目標なし ----
  // ワンタップの候補は、学ぶ目的の試験(税理士なら税理士)の日付だけ。目的が暮らし・仕事・未設定なら宅建士
  function noneCard() {
    let goalType = null;
    try { goalType = Stats.goalExamTypeId ? Stats.goalExamTypeId() : null; } catch (e) { goalType = null; }
    const typeId = goalType || `takken`;
    const official = Stats.officialDates ? Stats.officialDates(typeId) : [];
    const expected = !official.length && Stats.expectedDates ? Stats.expectedDates(typeId) : [];
    const picks = official.concat(expected).slice(0, 2);
    const el = card(`plan-none`, `
      <h3 class="card-title">${ic(`calendar`)}試験日を登録してください</h3>
      <p class="prog-note">試験日を登録すると、残り日数から学習の時期(基礎固め → 演習 → 実戦 → 直前)と、今週やることの目安を作ります。</p>
      ${picks.length ? `<div class="plan-picks">${picks.map((o, i) => `
        <button type="button" class="btn btn-secondary after-next" data-pick="${i}">
          ${ic(`calendar`, 18)}
          <span class="after-next-text"><span class="after-next-title">${esc(o.label)}で登録</span><small>${DateUtil.toJapanese(o.date, true)}${o.tentative ? `・${esc(o.note || `見込み・未発表`)}` : ``}</small></span>
        </button>`).join(``)}</div>` : ``}
      ${picks.some((o) => o.tentative) ? `<p class="calc-note">見込みの日付で登録すると「見込み」と表示します。公式の試験日が発表されたら、設定で日付を確かめてください。</p>` : ``}
      <div class="card-actions">
        <button type="button" class="btn" data-role="add">${ic(`calendar`)}試験日を登録</button>
        <a class="link-btn" href="#settings/targets">設定で管理する${ic(`chevron-right`, 16)}</a>
      </div>`);
    el.querySelectorAll(`[data-pick]`).forEach((b) => b.addEventListener(`click`, () => {
      const o = picks[Number(b.dataset.pick)];
      if (!o) return;
      Stats.addTarget({ name: o.examTypeId === `zeirishi` ? `税理士試験(消費税法)` : `宅建士試験`, examTypeId: o.examTypeId, date: o.date, primary: true, tentative: o.tentative === true });
      UI.toast(o.tentative ? `見込みの試験日で登録しました` : `試験日を登録しました`, `success`);
      rerender();
    }));
    el.querySelector(`[data-role="add"]`).addEventListener(`click`, () => { if (home()) home().openTargetForm(rerender, null, { examTypeId: typeId }); });
    return el;
  }

  // ---- 見出しのカード(残り日数・いまの時期) ----
  function headCard(plan) {
    const t = plan.target;
    let days = ``;
    if (plan.state === `before`) days = `<p class="plan-days"><span>あと</span><strong class="num">${plan.daysLeft}</strong><span>日</span></p>`;
    else if (plan.state === `today`) days = `<p class="plan-days"><strong>今日が試験日</strong></p>`;
    const notes = [];
    if (t.tentative === true) {
      notes.push(`<p class="hero-note">${ic(`info`, 16)}<span>試験日は見込み(公式発表の前)です。発表されたら<a href="#settings/targets">設定</a>で日付を確かめてください。</span></p>`);
    }
    if (plan.compressed && plan.state === `before`) {
      notes.push(`<p class="hero-note">${ic(`timer`, 16)}<span>試験日の${plan.runway}日前に登録したため、各時期を短くしています。</span></p>`);
    }
    return card(`plan-head`, `
      <p class="hero2-eyebrow">${ic(`target`, 14)}<span>${esc(t.name)}</span>${tentTag(t)}</p>
      ${days}
      <p class="hero2-sub">${DateUtil.toJapanese(t.date, true)}${t.tentative === true ? `(見込み)` : ``}</p>
      ${plan.phase ? `
        <div class="plan-phase">
          <span class="plan-phase-tag">${ic(plan.phase.icon || `flag`, 16)}いまは<strong>${esc(plan.phase.name)}</strong>${plan.phase.id === `day` ? `` : `の時期`}</span>
          <p>${esc(plan.phase.desc)}</p>
        </div>` : ``}
      ${notes.length ? `<div class="hero2-notes">${notes.join(``)}</div>` : ``}`, `目標の試験`);
  }

  // ---- 試験までの流れ ----
  function stepsCard(plan) {
    const rows = plan.phases.filter((p) => p.id !== `day`);
    return card(`plan-steps-card`, `
      <h3 class="card-title">${ic(`flag`)}試験までの流れ</h3>
      <ol class="plan-steps">
        ${rows.map((p) => {
          const range = p.startDate ? `${mdw(p.startDate)}〜${mdw(p.endDate)}` : `〜${mdw(p.endDate)}`;
          const cls = [`plan-step`, p.current ? `is-current` : ``, p.past ? `is-past` : ``].filter(Boolean).join(` `);
          return `
            <li class="${cls}"${p.current ? ` aria-current="step"` : ``}>
              <span class="plan-step-mark" aria-hidden="true">${p.past ? ic(`check`, 14) : ic(p.icon || `flag`, 14)}</span>
              <span class="plan-step-main">
                <span class="plan-step-name">${esc(p.name)}${p.current ? `<span class="plan-step-now">いまここ</span>` : ``}${p.past ? `<span class="sr-only">(終了)</span>` : ``}</span>
                <span class="plan-step-date">${range}${p.days ? `・${p.days}日` : ``}</span>
                <span class="plan-step-desc">${esc(p.desc)}</span>
              </span>
            </li>`;
        }).join(``)}
        <li class="plan-step is-exam">
          <span class="plan-step-mark" aria-hidden="true">${ic(`target`, 14)}</span>
          <span class="plan-step-main"><span class="plan-step-name">試験日</span><span class="plan-step-date">${mdw(plan.examDate)}${plan.tentative ? `(見込み)` : ``}</span></span>
        </li>
      </ol>`);
  }

  // ---- 今週やること ----
  function weekCard(plan) {
    const b = plan.budget || { week: 0, perDay: 0, days: 7, source: `actions`, goal: { value: 10 } };
    const goalText = b.source === `minutes` ? `1日の目標 ${b.goal.value}分` : `1日の目標 ${b.goal.value}回(1回 約1分として計算)`;
    const items = plan.week;
    const total = items.reduce((s, x) => s + x.minutes, 0);
    return card(`plan-week span-all`, `
      <div class="recommend-head">
        <h3 class="card-title">${ic(`list`)}今週やること</h3>
        ${total > 0 ? `<span class="plan-budget num">約${esc(hours(total))}</span>` : ``}
      </div>
      <p class="prog-note">${b.days < 7 ? `試験日までの${b.days}日分` : `1週間`}の目安: 約${esc(hours(b.week))}(${esc(goalText)} × ${b.days}日)。<a href="#settings/goal">1日の目標を変える</a></p>
      ${items.length ? `
        <ul class="plan-items">
          ${items.map((it) => `
            <li>
              <a class="plan-item" href="${esc(it.href)}">
                <span class="plan-item-icon" aria-hidden="true">${ic(ICONS[it.kind] || `lightbulb`, 18)}</span>
                <span class="plan-item-main"><span class="plan-item-title">${esc(it.label)}</span>${it.sub ? `<span class="plan-item-sub">${esc(it.sub)}</span>` : ``}</span>
                <span class="plan-item-min num">約${esc(hours(it.minutes))}</span>
                ${ic(`chevron-right`, 18)}
              </a>
            </li>`).join(``)}
        </ul>` : `<p class="prog-note prog-note-flush">今週の目安の時間が少ないため、作業を割り当てられませんでした。<a href="#settings/goal">1日の目標</a>を増やすと表示されます。</p>`}`);
  }

  // ---- 分野の配分 ----
  function allocCard(plan, snap) {
    if (!plan.alloc.length) return null;
    const max = Math.max(...plan.alloc.map((a) => a.weight)) || 1;
    return card(`plan-alloc`, `
      <h3 class="card-title">${ic(`chart`)}分野の配分</h3>
      <p class="prog-note">配点が大きく、習熟度が低い分野ほど多く時間を回します。${snap ? `` : `(弱点分析を使えないため、習熟度は50として計算しています)`}</p>
      <ul class="plan-alloc-list">
        ${plan.alloc.slice().sort((x, y) => y.weight - x.weight).map((a) => `
          <li class="plan-alloc-row">
            <div class="mini-bar-head"><b>${esc(a.label)}</b><span class="num">${Math.round(a.weight * 100)}%${a.minutes ? `・今週 約${esc(hours(a.minutes))}` : ``}</span></div>
            <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill" style="width:${Math.max(2, Math.round((a.weight / max) * 100))}%"></div></div>
            <p class="plan-alloc-meta">配点の割合 ${Math.round(a.share * 100)}%・習熟度 ${a.mastery}/100</p>
          </li>`).join(``)}
      </ul>
      <details class="ana-how">
        <summary>${ic(`info`, 16)}<span>計画の決め方</span>${ic(`chevron-down`, 16)}</summary>
        <ul>
          <li><strong>時期</strong>: 試験日まで121日以上は基礎固め、120〜46日は演習、45〜15日は実戦(週1回の模擬試験)、14〜1日は直前(解き直しと弱点)。試験日の180日前より後に登録したときは、直前の14日はそのままにして、それより前の時期を登録した日からの日数に合わせて同じ割合で短くします。</li>
          <li><strong>1週間の時間</strong> = 1日の目標(分)× 7日。目標が「回数」のときは1回を約1分として計算します。</li>
          <li><strong>分野の配分</strong> = 配点の割合 ×(1.5 − 習熟度 ÷ 100)。習熟度は<a href="#progress/weak">弱点分析</a>の値です。出題数の目安がない試験は、分野を同じ割合にします。</li>
          <li><strong>作業の時間の目安</strong>: 4択 1問90秒・○× 1問12秒・基礎知識 1項目3分・解き直し 1問40秒・復習カード 1枚15秒。</li>
        </ul>
      </details>`);
  }

  function noteEl() {
    const p = document.createElement(`p`);
    p.className = `prog-data-note span-all`;
    p.innerHTML = `${ic(`info`, 16)}<span>計画はこのアプリ独自の目安です。進み具合に合わせて、無理のない範囲で調整してください。</span>`;
    return p;
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view plan-view`;
    wrap.innerHTML = `
      <h2>学習計画</h2>
      <p class="view-desc">試験日までの残り日数から、いまの時期と今週やることの目安を出します。</p>
      <div class="prog-grid plan-grid" data-role="grid"></div>`;
    root.appendChild(wrap);
    const grid = wrap.querySelector(`[data-role="grid"]`);
    const target = Stats.primaryTarget();
    const snap = target ? analyzeFor(target.examTypeId) : null;
    let plan;
    try { plan = Plan.current({ snap }); } catch (e) {
      console.error(`[学習計画] 計画を作れませんでした`, e);
      plan = { state: `none` };
    }
    const cards = [];
    if (plan.state === `none`) {
      cards.push(noneCard());
    } else if (plan.state === `after`) {
      const h = home();
      const t = plan.target;
      const el = card(`plan-after span-all`, `
        <p class="hero2-eyebrow">${ic(`target`, 14)}<span>${esc(t.name)}</span>${tentTag(t)}</p>
        <p class="plan-days"><strong>お疲れさまでした</strong></p>
        <p class="hero2-sub">${DateUtil.toJapanese(t.date, true)}の試験から${plan.after ? plan.after.daysSince : -plan.daysLeft}日</p>
        ${h && h.afterHtml ? h.afterHtml(plan) : ``}
        <a class="link-btn" href="#progress">${ic(`chart`, 16)}これまでの学習の記録を見る${ic(`chevron-right`, 16)}</a>`, `試験の後`);
      if (h && h.wireAfter) h.wireAfter(el, plan, rerender);
      cards.push(el);
    } else {
      cards.push(headCard(plan));
      if (plan.state === `before`) {
        cards.push(stepsCard(plan));
        cards.push(weekCard(plan));
        const alloc = allocCard(plan, snap);
        if (alloc) cards.push(alloc);
      }
    }
    cards.push(noteEl());
    cards.forEach((c) => grid.appendChild(c));
  }

  return { render };
})();
