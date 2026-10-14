// 今日の復習ビュー: 間隔反復学習(SRS)
// 出題順: ①期限が来た復習カード → ②新しい用語(1日あたりの上限は設定の reviewNewLimit。作品由来の俗語 worksOnly は除く)
// 画面: 見出し「今日の復習 ⓘ  n / 全体」と細い進捗バー → カード → 画面の下のトレイ
//       (表のあいだは「答えを見る」、めくると4段階の評価。どちらも同じ位置に出して親指を動かさずに続けられるように)
// 全部終えたら完了の画面(チェックの輪・3つの数字・次の復習・今日のメニューの次の手順・○×で仕上げる)
// 今日の復習がないとき(開いた時点で0枚)も、今日のメニューに次の手順があればそれを案内する
// 初めての人には一度だけ「復習のしくみ」の図と説明を出す(Storage `seenReviewTip` = true で以後は出さない)
window.Views = window.Views || {};
window.Views.review = (function () {
  const DEFAULT_NEW_LIMIT = 10;
  const LEVEL_ORDER = { 超入門: 0, 初級: 1, 中級: 2, 上級: 3 };
  const TIP_KEY = `seenReviewTip`;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function newLimit() {
    const n = Number(Storage.get(`reviewNewLimit`, DEFAULT_NEW_LIMIT));
    return Number.isFinite(n) && n >= 0 ? Math.min(100, Math.floor(n)) : DEFAULT_NEW_LIMIT;
  }

  // 今日すでに学んだ新規カードの数 { date, ids[] }
  function newToday() {
    const rec = Storage.get(`reviewNewToday`, null);
    if (!rec || rec.date !== Srs.todayStr() || !Array.isArray(rec.ids)) return { date: Srs.todayStr(), ids: [] };
    return rec;
  }

  // 学ぶ目的(初回ガイド・設定で選ぶ)。stats.js に無ければ null
  function learnerProfile() {
    try {
      return window.Stats && typeof Stats.getProfile === `function` ? Stats.getProfile() : null;
    } catch (e) { return null; }
  }

  // 暮らし・仕事で学ぶ人が選んだ「気になるテーマ」のトピック(選んだ順)
  function interestTopicIds(profile) {
    if (!profile || (profile.goal !== `life` && profile.goal !== `work`)) return [];
    try {
      const ids = typeof Stats.interestTopicIds === `function` ? Stats.interestTopicIds(profile) : [];
      return Array.isArray(ids) ? ids.filter((id) => typeof id === `string` && AppIndex.topicsById[id]) : [];
    } catch (e) { return []; }
  }

  // 新規の候補: SRSカード未作成の用語。
  // 気になるテーマ(暮らし・仕事の人)の用語 → 主目標の試験分野に含まれる用語 → レベルの易しい順
  function newCandidates() {
    const cards = Srs.getAllCards();
    const target = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
    const examTypeId = target ? target.examTypeId : null;
    const inExam = (t) => {
      if (!examTypeId || !window.Stats || !Stats.categoryOf) return 0;
      return Stats.categoryOf(t, examTypeId) ? 0 : 1;
    };
    const interests = interestTopicIds(learnerProfile());
    const interestRank = (t) => {
      if (!interests.length) return 0;
      const ids = t.topicIds || [];
      const i = interests.findIndex((id) => ids.includes(id));
      return i >= 0 ? i : interests.length;
    };
    // 作品由来の俗語(worksOnly)は新しく出さない(すでにカードがあれば期限の復習としては出る)
    return AppIndex.allTerms
      .filter((t) => !cards[t.id] && t.worksOnly !== true)
      .map((t, i) => ({ t, i, r: interestRank(t) }))
      .sort((a, b) => a.r - b.r || inExam(a.t) - inExam(b.t) || (LEVEL_ORDER[a.t.level] ?? 9) - (LEVEL_ORDER[b.t.level] ?? 9) || a.i - b.i)
      .map((x) => x.t);
  }

  // 復習が済んだあと、次に期限が来る日と件数
  function nextDueInfo() {
    const cards = Srs.getAllCards();
    const today = Srs.todayStr();
    let minDate = null;
    Object.keys(cards).forEach((id) => {
      const d = cards[id] && cards[id].dueDate;
      if (d && d > today && (!minDate || d < minDate)) minDate = d;
    });
    if (!minDate) return null;
    const count = Object.keys(cards).filter((id) => cards[id] && cards[id].dueDate === minDate).length;
    return { date: minDate, days: DateUtil.diffDays(today, minDate), count };
  }

  // 完了の画面の「○×で仕上げる(10問)」の行き先(ホームの「○×で10問」と同じ考え方)
  // 暮らし・仕事(試験の登録なし)で気になるテーマがあれば → そのテーマ。それ以外はホーム側に関数があればそれを使い、なければ:
  // 税理士 → 不動産と消費税 / 宅建士・未登録 → 優先して伸ばしたい分野(なければ文の多い分野)。出せる文が少なければ ○× のトップ
  function oxFinishNav() {
    const O = window.Views && Views.ox && Views.ox._internal;
    let st = null;
    const statements = () => {
      if (!st) {
        try { st = O && typeof O.loadStatements === `function` ? O.loadStatements() : []; } catch (e) { st = []; }
      }
      return st;
    };
    const byTopic = (id) => statements().filter((s) => (s.topicIds || []).includes(id)).length;
    const target = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
    const typeId = target ? target.examTypeId : null;
    // 暮らし・仕事で学ぶ人(試験を登録していない)は、気になるテーマから(ホームの「○×で10問」は試験の分野で選ぶため先に決める)
    if (!typeId) {
      const topic = interestTopicIds(learnerProfile()).find((id) => byTopic(id) >= 5);
      if (topic) return `#ox/topic/${topic}/10`;
    }
    try {
      const H = window.Views && Views.home;
      if (H && typeof H.oxLink === `function`) {
        const l = H.oxLink();
        if (l && typeof l.nav === `string` && l.nav.startsWith(`#ox`)) return l.nav;
      }
    } catch (e) { /* 下の考え方で決める */ }
    if (!statements().length) return `#ox`;
    const byCat = (id) => statements().filter((s) => (s.cats || []).includes(id)).length;
    if (typeId === `zeirishi`) return byCat(`shohi`) ? `#ox/cat/shohi/10` : `#ox`;
    if (typeId && typeId !== `takken`) return `#ox`;
    const type = window.Stats && Stats.examType ? Stats.examType(`takken`) : null;
    const cats = type && Array.isArray(type.categories) ? type.categories : [];
    let focusId = null;
    try {
      const s = window.Analysis && typeof Analysis.summary === `function` ? Analysis.summary(`takken`) : null;
      focusId = s && s.focus ? s.focus.id : null;
    } catch (e) { focusId = null; }
    const cat = cats.find((c) => c.id === focusId && byCat(c.id) >= 5)
      || cats.slice().sort((a, b) => byCat(b.id) - byCat(a.id)).find((c) => byCat(c.id) >= 5);
    return cat ? `#ox/cat/${cat.id}/10` : `#ox`;
  }

  // 今日のメニュー(ホームの一番上)で、まだ終わっていない次の手順。復習と○×の手順は除く(○×は完了の画面の「○×で仕上げる」で案内する)
  function nextMenuStep(oxNav) {
    try {
      if (!window.Recommend || typeof Recommend.todayMenu !== `function`) return null;
      const steps = Recommend.todayMenu({ oxFallback: { nav: oxNav, scope: `` } });
      const next = (Array.isArray(steps) ? steps : []).find((s) => s && !s.done && s.id !== `review`) || null;
      return next && next.id !== `ox` && typeof next.nav === `string` ? next : null;
    } catch (e) { return null; }
  }

  // 今日のメニューで、まだ終わっていない次の手順(復習の手順は除く。○×の手順も含める)。ホームと同じ条件で作る。なければ null
  // (今日の復習がない日に、ホームの「今日の復習カード(完了)」から来たときの案内)
  function nextMenuStepAny() {
    try {
      if (!window.Recommend || typeof Recommend.todayMenu !== `function`) return null;
      const H = window.Views && Views.home;
      const steps = Recommend.todayMenu(H && typeof H.menuOptions === `function` ? H.menuOptions() : undefined);
      return (Array.isArray(steps) ? steps : []).find((s) => s && !s.done && s.id !== `review` && typeof s.nav === `string`) || null;
    } catch (e) { return null; }
  }

  // その日の学習記録の回数(activityLog。旧形式の true は1回)
  function activityCount(day) {
    const log = Storage.get(`activityLog`, {});
    const v = log[day];
    if (window.Streak && typeof Streak.countOf === `function`) return Streak.countOf(v);
    return v === true ? 1 : (typeof v === `number` && Number.isFinite(v) && v > 0 ? v : 0);
  }

  // 評価を元に戻したとき、その評価で付けた学習記録を1回分取り消す(0回になった日は記録から消す)
  function uncountActivity(day) {
    try {
      const n = activityCount(day);
      if (!n) return;
      const log = Storage.get(`activityLog`, {});
      if (n > 1) log[day] = n - 1; else delete log[day];
      Storage.set(`activityLog`, log);
    } catch (e) { /* 記録を戻せなくても復習は続けられる */ }
  }

  // 見出しの ⓘ で開く「復習のしくみ」
  function aboutHtml() {
    const lim = newLimit();
    return `<div class="view-info">
      <p>忘れかけたころに出題する「間隔反復学習」です。カードをめくって意味を思い出せたかを4段階で評価すると、次に出題する日が自動で決まります。</p>
      <p>期限が来た復習を先に出し、${lim ? `そのあと新しい用語を1日${lim}語まで出します` : `新しい用語は出さない設定です`}(<a href="#settings/limit" class="link-inline">設定</a>で変更できます)。</p>
      <p class="view-info-keys">キーボード: <kbd>Space</kbd> でめくる / <kbd>1</kbd>〜<kbd>4</kbd> で評価 / <kbd>U</kbd> で元に戻す</p>
    </div>`;
  }

  function render(root) {
    // 古い記録の移行(起動時の Storage.migrate に移っていれば何もしない)
    if (typeof Srs.migrateIfNeeded === `function`) Srs.migrateIfNeeded();
    const known = Storage.get(`flashcards`, {});

    const reviewQueue = shuffle(Srs.getReviewDueIds().map((id) => AppIndex.termsById[id]).filter(Boolean));
    const todayNew = newToday();
    const newRemaining = Math.max(0, newLimit() - todayNew.ids.length);
    const candidates = newCandidates();
    let queue = reviewQueue.map((t) => ({ term: t, isNew: false }))
      .concat(candidates.slice(0, newRemaining).map((t) => ({ term: t, isNew: true })));

    // again: 「もう一度」を押した回数 / againIds: 「もう一度」を押した用語(思い出せた割合の計算用。用語ID → 回数)
    const session = { done: 0, again: 0, againIds: {} };
    let undoStack = [];
    let lastToast = null;

    const wrap = document.createElement(`div`);
    wrap.className = `view review-view`;
    wrap.innerHTML = `
      <div class="view-head review-head">
        <h2>今日の復習</h2>
        <button type="button" class="btn btn-icon view-info-btn" data-role="view-info" aria-label="復習のしくみ" aria-haspopup="dialog">${ic(`info`, 20)}</button>
        <span class="review-count num" data-role="count"></span>
      </div>
      <div class="progress-bar review-progress" data-role="bar" aria-hidden="true"><div class="progress-bar-fill"></div></div>
      <div class="card-grid single-col" data-role="review-area"></div>
      <div data-role="tip"></div>
      <p class="review-keys" data-role="keys">キーボード: Space でめくる / 1〜4 で評価 / U で元に戻す</p>
    `;
    root.appendChild(wrap);

    const countEl = wrap.querySelector(`[data-role="count"]`);
    const bar = wrap.querySelector(`[data-role="bar"]`);
    const tipSlot = wrap.querySelector(`[data-role="tip"]`);
    const area = wrap.querySelector(`[data-role="review-area"]`);
    const keysHint = wrap.querySelector(`[data-role="keys"]`);
    const infoBtn = wrap.querySelector(`[data-role="view-info"]`);
    infoBtn.addEventListener(`click`, () => UI.sheet({ title: `復習のしくみ`, content: aboutHtml() }));

    // 「n / 全体」と進捗バー。全体 = 評価し終えた枚数 + 残り(「もう一度」で後ろに回したカードは数え直さない)
    function renderMeta() {
      const total = session.done + queue.length;
      const finished = !queue.length && session.done > 0;
      const cur = finished ? session.done : Math.min(session.done + 1, total);
      countEl.hidden = !total;
      countEl.textContent = total ? `${cur} / ${total}` : ``;
      countEl.setAttribute(`aria-label`, finished ? `${total}枚すべて評価しました` : total ? `${total}枚中 ${cur}枚目` : ``);
      const pct = total ? Math.round((session.done / total) * 100) : 0;
      const fill = bar.firstElementChild;
      fill.style.width = `${pct}%`;
      fill.classList.toggle(`fill-success`, finished);
      bar.hidden = !total;
    }

    // 初めての人に一度だけ出す「復習のしくみ」(カードの下に置く。上に置くと、スマホではカードの用語名が
    // 画面の下の「答えを見る」のトレイに隠れ、表を見ないまま答えを開くことになるため)
    function renderTip() {
      if (Storage.get(TIP_KEY, false) || !queue.length) { tipSlot.innerHTML = ``; return; }
      if (tipSlot.firstElementChild) return;
      const fig = window.CardUi && window.Diagrams && Diagrams.defs && Diagrams.defs[`srs-cycle`] ? CardUi.figureHtml(`srs-cycle`) : ``;
      tipSlot.innerHTML = `
        <section class="card review-tip" aria-label="復習のしくみ">
          ${fig}
          <p class="review-tip-text">忘れかけたころに復習すると記憶が長持ちします。カードをめくって、思い出せたかを4段階で選ぶと、次に出す日が自動で決まります。</p>
          <button type="button" class="btn btn-secondary btn-sm" data-role="tip-ok">わかった</button>
        </section>`;
      tipSlot.querySelector(`[data-role="tip-ok"]`).addEventListener(`click`, () => {
        Storage.set(TIP_KEY, true);
        tipSlot.innerHTML = ``;
        const front = area.querySelector(`.flip-card:not(.flipped) .flip-card-front [data-role="flip"]`);
        if (front) front.focus({ preventScroll: true });
      });
    }

    function renderEmpty() {
      keysHint.hidden = true;
      tipSlot.innerHTML = ``;
      area.innerHTML = ``;
      const moreNew = newCandidates().length > 0;
      if (session.done) {
        renderDone(moreNew);
        return;
      }
      infoBtn.hidden = false;
      const next = nextDueInfo();
      const nextText = next ? `次の復習は${next.days === 1 ? `明日` : `${next.days}日後`}(${next.count}件)です。` : ``;
      // 今日のメニューの次の手順があれば、それを主ボタンにする(ホームの「今日の復習カード(完了)」から来たときに行き止まりにしない)
      const menu = nextMenuStepAny();
      const menuCta = menu ? { label: `次のメニュー: ${esc(menu.title)}`, nav: menu.nav } : null;
      let el;
      if (!Object.keys(Srs.getAllCards()).length && !candidates.length) {
        el = UI.emptyState({ icon: `layers`, title: `出題できる用語がありません`, cta: { label: `用語集を見る`, nav: `#glossary` } });
      } else if (!moreNew) {
        // 新しい用語の候補が残っていない(すべての用語のカードがある)
        el = UI.emptyState({
          icon: `trophy`,
          title: `今日の復習はありません`,
          body: `${nextText}すべての用語を学習済みです。`,
          cta: menuCta || { label: `○×一問一答で演習`, nav: `#ox` },
        });
      } else {
        el = UI.emptyState({
          icon: `check-circle`,
          title: `今日の復習はありません`,
          body: `${nextText}${newLimit() ? `新しい用語の上限(1日${newLimit()}語)にも達しています。` : `新しい用語は出さない設定です。`}`,
          cta: menuCta || { label: `用語集を見る`, nav: `#glossary` },
        });
      }
      if (moreNew) el.appendChild(moreNewButton(`btn btn-secondary`));
      area.appendChild(el);
    }

    // 「新しい用語をあと5語学ぶ」
    function moreNewButton(cls) {
      const extra = document.createElement(`button`);
      extra.type = `button`;
      extra.className = cls;
      extra.dataset.role = `more-new`;
      extra.innerHTML = `${ic(`sparkles`)}新しい用語をあと5語学ぶ`;
      extra.addEventListener(`click`, () => {
        const more = newCandidates().slice(0, 5);
        if (!more.length) return;
        queue = more.map((t) => ({ term: t, isNew: true }));
        renderQueue();
        // 完了の画面から続けるときは、カードの先頭が見える位置へ
        showCardTop();
      });
      return extra;
    }

    // 完了の画面: チェックの輪・評価した枚数/思い出せた割合/連続日数・次の復習・次にやること
    // 次にやることは「今日のメニュー」のまだ終わっていない次の手順(○×の手順なら「○×で仕上げる」をそのまま使う)
    function renderDone(moreNew) {
      infoBtn.hidden = true;
      const finishNav = oxFinishNav();
      const menuNext = nextMenuStep(finishNav);
      const done = session.done;
      const missed = Math.min(done, Object.keys(session.againIds).filter((id) => session.againIds[id] > 0).length);
      const pct = done ? Math.max(0, Math.round(((done - missed) / done) * 100)) : 0;
      const streak = window.Streak && typeof Streak.getCurrentStreak === `function` ? Streak.getCurrentStreak() : null;
      const next = nextDueInfo();
      const el = document.createElement(`div`);
      el.className = `rv-done`;
      el.innerHTML = `
        <div class="rv-done-ring" aria-hidden="true">
          <svg viewBox="0 0 120 120" focusable="false"><circle cx="60" cy="60" r="56"></circle><path d="M38 62 L54 77 L84 45"></path></svg>
          <span class="rv-done-dot d1"></span><span class="rv-done-dot d2"></span><span class="rv-done-dot d3"></span><span class="rv-done-dot d4"></span>
        </div>
        <h3 class="rv-done-title" tabindex="-1">今日の復習、完了!</h3>
        <p class="rv-done-sub">お疲れさまでした。この調子で続けましょう。</p>
        <div class="rv-done-stats">
          <div class="rv-done-stat"><strong class="num">${done}</strong><span>評価した枚数</span></div>
          <div class="rv-done-stat"><strong class="num">${pct}<small>%</small></strong><span>思い出せた</span></div>
          ${streak != null ? `<div class="rv-done-stat is-warm"><strong class="num">${streak}</strong><span>日連続</span></div>` : ``}
        </div>
        ${next ? `<p class="rv-done-next">${ic(`calendar`)}<span>次の復習は <b>${next.days === 1 ? `明日` : `${next.days}日後`} ${next.count}枚</b></span></p>` : ``}
        <div class="rv-done-actions">
          ${menuNext ? `
            <a class="btn btn-lg btn-block rv-done-menu" href="${esc(menuNext.nav)}" data-role="menu-next">
              <span class="rv-done-menu-text"><span>次のメニュー: ${esc(menuNext.title)}</span>${menuNext.sub ? `<small>${esc(menuNext.sub)}</small>` : ``}</span>${ic(`arrow-right`, 20)}
            </a>` : ``}
          <a class="btn btn-lg btn-block${menuNext ? ` btn-secondary` : ``}" href="${esc(finishNav)}" data-role="ox-finish">${ic(`o-x`, 20)}○×で仕上げる(10問)</a>
        </div>
      `;
      if (moreNew) el.querySelector(`.rv-done-actions`).appendChild(moreNewButton(`btn btn-secondary btn-block`));
      area.appendChild(el);
      const title = el.querySelector(`.rv-done-title`);
      if (title) title.focus({ preventScroll: true });
    }

    function renderQueue() {
      renderMeta();
      area.innerHTML = ``;
      if (!queue.length) { renderEmpty(); return; }
      infoBtn.hidden = false;
      keysHint.hidden = false;
      renderTip();
      const { term, isNew } = queue[0];
      const hints = {};
      const pv = Srs.preview(term.id);
      [1, 2, 3, 4].forEach((g) => { hints[g] = Srs.intervalLabel(pv[g]); });
      // 評価ボタンはカードの外(下)のトレイに置く。裏面の説明が長い用語でもボタンが隠れないように
      const card = CardUi.buildFlipCard(term, { known });
      if (isNew) {
        const head = card.querySelector(`.flip-face-tags`);
        if (head) head.insertAdjacentHTML(`afterbegin`, `<span class="badge badge-new">新規</span>`);
      }
      area.appendChild(card);
      const tray = document.createElement(`div`);
      tray.className = `grade-row review-grade-row`;
      tray.setAttribute(`role`, `group`);
      const labels = { 1: [`grade-again`, `もう一度`], 2: [`grade-hard`, `難しい`], 3: [`grade-good`, `普通`], 4: [`grade-easy`, `簡単`] };
      tray.innerHTML = `<button type="button" class="btn btn-lg btn-block review-reveal" data-role="reveal">答えを見る</button>`
        + [1, 2, 3, 4].map((g) => `<button type="button" class="btn grade-btn ${labels[g][0]}" data-grade="${g}">${labels[g][1]}<small>${hints[g]}</small></button>`).join(``);
      tray.querySelectorAll(`[data-grade]`).forEach((b) => b.addEventListener(`click`, () => doGrade(term, Number(b.dataset.grade), isNew)));
      // 作った直後のタップは受けない(前のカードの評価ボタンを2回押したとき、次のカードの答えが見えてしまうため)
      const createdAt = Date.now();
      tray.querySelector(`[data-role="reveal"]`).addEventListener(`click`, () => {
        if (Date.now() - createdAt < 400 || card.classList.contains(`flipped`)) return;
        if (card.flip) card.flip(); else card.classList.add(`flipped`);
      });
      area.appendChild(tray);
      // 表のあいだは「答えを見る」、裏返したら評価ボタン(答えを見ずに評価できないように)
      const syncGrade = () => {
        const flipped = card.classList.contains(`flipped`);
        tray.classList.toggle(`is-front`, !flipped);
        tray.querySelector(`[data-role="reveal"]`).hidden = flipped;
        tray.querySelectorAll(`[data-grade]`).forEach((b) => { b.hidden = !flipped; });
        if (flipped) tray.setAttribute(`aria-label`, `覚えていたかを評価`);
        else tray.removeAttribute(`aria-label`);
      };
      if (window.MutationObserver) new MutationObserver(syncGrade).observe(card, { attributes: true, attributeFilter: [`class`] });
      syncGrade();
      const flipBtn = card.querySelector(`.flip-card-front [data-role="flip"]`);
      if (flipBtn) flipBtn.focus({ preventScroll: true });
    }

    function doGrade(term, g, isNew) {
      const prevCard = Srs.getCard(term.id);
      const prevKnown = !!known[term.id];
      const item = queue[0];
      // 評価で学習記録(activityLog)が1回増えたか(元に戻すときに取り消すため。保存できなかったときは増えない)
      const day = DateUtil.today();
      const actBefore = activityCount(day);
      // 評価後のカード(保存できなかったとき=容量不足でも、次に出す日を通知に出せるよう戻り値を使う)
      const graded = Srs.grade(term.id, g);
      const counted = activityCount(day) > actBefore;
      // 別のタブでの変更を消さないよう、保存前に最新の値を読み直してから反映する
      const latestKnown = Storage.get(`flashcards`, {});
      Object.keys(known).forEach((k) => { if (!(k in latestKnown)) delete known[k]; });
      Object.assign(known, latestKnown);
      if (g >= 3) known[term.id] = true;
      Storage.set(`flashcards`, known);
      // 日付が変わったら今日の新規カウントをやり直す(日をまたいで学習した場合)
      const today = Srs.todayStr();
      if (todayNew.date !== today) { todayNew.date = today; todayNew.ids = []; }
      if (isNew && !todayNew.ids.includes(term.id)) {
        todayNew.ids.push(term.id);
        Storage.set(`reviewNewToday`, todayNew);
      }
      queue.shift();
      // 「もう一度」は数枚後にもう一度出す
      if (g === 1) {
        queue.splice(Math.min(3, queue.length), 0, { term, isNew: false });
        session.again += 1;
        session.againIds[term.id] = (session.againIds[term.id] || 0) + 1;
      } else {
        session.done += 1;
      }
      undoStack.push({ term, prevCard, prevKnown, item, g, isNew, day, counted });
      if (undoStack.length > 20) undoStack.shift();
      renderQueue();
      showCardTop();
      const shortName = term.name.length > 14 ? `${term.name.slice(0, 13)}…` : term.name;
      // 前のトーストは閉じる(古いトーストの「元に戻す」で別の評価が取り消されないように)
      if (lastToast) lastToast.dismiss();
      const nextCard = (graded && typeof graded === `object` ? graded : null) || Srs.getCard(term.id);
      const when = g === 1 || !nextCard ? `このあともう一度出題します` : `${Srs.intervalLabel(nextCard.interval)}に出題します`;
      lastToast = UI.toast(`「${shortName}」は${when}`, `default`, { action: { label: `元に戻す`, onClick: undo }, duration: 3200 });
    }

    // 裏面の長いカードを下まで読んでから評価した場合、次のカードの先頭が見える位置に戻す
    // (固定ヘッダーの高さは html の scroll-padding-top、余白は CSS の scroll-margin-top で持つ)
    function showCardTop() {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const margin = parseFloat(getComputedStyle(area).scrollMarginTop) || 0;
      if (area.getBoundingClientRect().top < pad + margin - 1) area.scrollIntoView({ block: `start` });
    }

    function undo() {
      const last = undoStack.pop();
      if (!last || !document.body.contains(wrap)) return;
      Srs.restore(last.term.id, last.prevCard);
      // 評価で付けた学習記録も1回分取り消す(評価し直すと二重に数えるため)
      if (last.counted) uncountActivity(last.day);
      if (last.prevKnown) known[last.term.id] = true; else delete known[last.term.id];
      Storage.set(`flashcards`, known);
      if (last.isNew && !last.prevCard) {
        todayNew.ids = todayNew.ids.filter((id) => id !== last.term.id);
        Storage.set(`reviewNewToday`, todayNew);
      }
      if (last.g === 1) {
        const idx = queue.findIndex((q) => q.term.id === last.term.id);
        if (idx >= 0) queue.splice(idx, 1);
        session.again = Math.max(0, session.again - 1);
        const n = (session.againIds[last.term.id] || 0) - 1;
        if (n > 0) session.againIds[last.term.id] = n; else delete session.againIds[last.term.id];
      } else {
        session.done = Math.max(0, session.done - 1);
      }
      queue.unshift(last.item);
      renderQueue();
      showCardTop();
    }

    function onKey(e) {
      if (!document.body.contains(wrap)) { document.removeEventListener(`keydown`, onKey); return; }
      if (e.target.closest && e.target.closest(`input, textarea, select, [contenteditable]`)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 図解のシートやダイアログが開いている間は操作しない
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      const card = area.querySelector(`.flip-card`);
      if ((e.key === `u` || e.key === `U`) && undoStack.length) { e.preventDefault(); undo(); return; }
      if (!card) return;
      if (/^[1-4]$/.test(e.key) && card.classList.contains(`flipped`)) {
        e.preventDefault();
        const btn = area.querySelector(`.review-grade-row [data-grade="${e.key}"]`);
        if (btn) btn.click();
      } else if (e.key === ` ` && !e.target.closest(`button, a`)) {
        e.preventDefault();
        if (card.flip) card.flip(true); else card.click();
      }
    }
    document.addEventListener(`keydown`, onKey);
    // 画面を離れたら外す(次のキー入力まで残すと、開くたびに前の画面の要素とリスナーが残り続ける)
    const offKey = () => document.removeEventListener(`keydown`, onKey);
    if (window.UI && typeof UI.onLeave === `function`) UI.onLeave(wrap, offKey);
    else {
      const onKeyHash = () => { if (!document.body.contains(wrap)) { offKey(); window.removeEventListener(`hashchange`, onKeyHash); } };
      window.addEventListener(`hashchange`, onKeyHash);
    }

    // iPhone のホーム画面アプリは翌日に開いても前日の画面のまま戻ることがある。
    // 日付が変わっていたら、その日の期限・新規の上限で出題し直す(シート・確認を開いている間は待つ)
    const renderDay = Srs.todayStr();
    function onWake() {
      if (!document.body.contains(wrap)) { detachWake(); return; }
      if (document.visibilityState === `hidden` || Srs.todayStr() === renderDay) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      detachWake();
      Router.navigate(location.hash || `#review`);
    }
    function detachWake() {
      document.removeEventListener(`visibilitychange`, onWake);
      window.removeEventListener(`pageshow`, onWake);
      window.removeEventListener(`focus`, onWake);
      window.removeEventListener(`hashchange`, onWakeHash);
    }
    function onWakeHash() { if (!document.body.contains(wrap)) detachWake(); }
    document.addEventListener(`visibilitychange`, onWake);
    window.addEventListener(`pageshow`, onWake);
    window.addEventListener(`focus`, onWake);
    window.addEventListener(`hashchange`, onWakeHash);

    renderQueue();
  }

  return { render, DEFAULT_NEW_LIMIT, _internal: { newCandidates, nextDueInfo, oxFinishNav } };
})();
