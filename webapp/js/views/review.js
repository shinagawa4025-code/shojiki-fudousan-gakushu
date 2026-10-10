// 今日の復習ビュー: 間隔反復学習(SRS)
// 出題順: ①期限が来た復習カード → ②新しい用語(1日あたりの上限は設定の reviewNewLimit)
window.Views = window.Views || {};
window.Views.review = (function () {
  const DEFAULT_NEW_LIMIT = 10;
  const LEVEL_ORDER = { 超入門: 0, 初級: 1, 中級: 2, 上級: 3 };

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function newLimit() {
    const n = Number(Storage.get(`reviewNewLimit`, DEFAULT_NEW_LIMIT));
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_NEW_LIMIT;
  }

  // 今日すでに学んだ新規カードの数 { date, ids[] }
  function newToday() {
    const rec = Storage.get(`reviewNewToday`, null);
    if (!rec || rec.date !== Srs.todayStr() || !Array.isArray(rec.ids)) return { date: Srs.todayStr(), ids: [] };
    return rec;
  }

  // 新規の候補: SRSカード未作成の用語。主目標の試験分野に含まれる用語→レベルの易しい順
  function newCandidates() {
    const cards = Srs.getAllCards();
    const target = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
    const examTypeId = target ? target.examTypeId : null;
    const inExam = (t) => {
      if (!examTypeId || !window.Stats || !Stats.categoryOf) return 0;
      return Stats.categoryOf(t, examTypeId) ? 0 : 1;
    };
    return AppIndex.allTerms
      .filter((t) => !cards[t.id])
      .map((t, i) => ({ t, i }))
      .sort((a, b) => inExam(a.t) - inExam(b.t) || (LEVEL_ORDER[a.t.level] ?? 9) - (LEVEL_ORDER[b.t.level] ?? 9) || a.i - b.i)
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

  function render(root) {
    Srs.migrateIfNeeded();
    const known = Storage.get(`flashcards`, {});

    const reviewQueue = shuffle(Srs.getReviewDueIds().map((id) => AppIndex.termsById[id]).filter(Boolean));
    const todayNew = newToday();
    const newRemaining = Math.max(0, newLimit() - todayNew.ids.length);
    const candidates = newCandidates();
    let queue = reviewQueue.map((t) => ({ term: t, isNew: false }))
      .concat(candidates.slice(0, newRemaining).map((t) => ({ term: t, isNew: true })));

    const session = { done: 0, again: 0, total: queue.length };
    let undoStack = [];
    let lastToast = null;

    const wrap = document.createElement(`div`);
    wrap.className = `view review-view`;
    wrap.innerHTML = `
      <h2>今日の復習</h2>
      <p class="view-desc">忘れかけたころに出題する「間隔反復学習」です。カードをめくって意味を思い出せたかを4段階で評価すると、次に出題する日が自動で決まります。期限が来た復習を先に出し、そのあと新しい用語を1日${newLimit()}語まで出します(<a href="#settings" class="link-inline">設定</a>で変更可)。</p>
      <div class="review-meta" data-role="meta"></div>
      <div class="progress-bar review-progress" data-role="bar" aria-hidden="true"><span class="progress-bar-fill"></span></div>
      <div class="card-grid single-col" data-role="review-area"></div>
      <p class="review-keys" data-role="keys">キーボード: Space でめくる / 1〜4 で評価 / U で元に戻す</p>
    `;
    root.appendChild(wrap);

    const meta = wrap.querySelector(`[data-role="meta"]`);
    const bar = wrap.querySelector(`[data-role="bar"]`);
    const area = wrap.querySelector(`[data-role="review-area"]`);
    const keysHint = wrap.querySelector(`[data-role="keys"]`);

    function renderMeta() {
      const rev = queue.filter((q) => !q.isNew).length;
      const nw = queue.filter((q) => q.isNew).length;
      meta.innerHTML = queue.length
        ? `<span class="review-counts"><span class="badge badge-review">復習 ${rev}</span><span class="badge badge-new">新規 ${nw}</span></span><span class="review-done">完了 ${session.done}</span>`
        : ``;
      const pct = session.total ? Math.round((session.done / Math.max(session.total, session.done + queue.length)) * 100) : 0;
      bar.firstElementChild.style.width = `${pct}%`;
      bar.hidden = !queue.length && !session.done;
    }

    function renderEmpty() {
      keysHint.hidden = true;
      area.innerHTML = ``;
      const next = nextDueInfo();
      const nextText = next ? `次の復習は${next.days === 1 ? `明日` : `${next.days}日後`}(${next.count}件)です。` : ``;
      const moreNew = newCandidates().length > 0;
      let el;
      if (session.done) {
        el = UI.emptyState({
          icon: `check-circle`,
          title: `今日の分は完了です。お疲れさまでした`,
          body: `${session.done}件を評価しました(うち「もう一度」${session.again}件)。${nextText}`,
          cta: { label: `クイズで力試し`, nav: `#quiz/auto` },
        });
      } else if (!Object.keys(Srs.getAllCards()).length && !candidates.length) {
        el = UI.emptyState({ icon: `layers`, title: `出題できる用語がありません`, cta: { label: `用語集を見る`, nav: `#glossary` } });
      } else {
        el = UI.emptyState({
          icon: `check-circle`,
          title: `今日の復習はありません`,
          body: `${nextText}新しい用語の上限(1日${newLimit()}語)にも達しています。`,
          cta: { label: `用語集を見る`, nav: `#glossary` },
        });
      }
      if (moreNew) {
        const extra = document.createElement(`button`);
        extra.type = `button`;
        extra.className = `btn btn-secondary`;
        extra.innerHTML = `${UI.icon(`sparkles`, { size: 18 })}新しい用語をあと5語学ぶ`;
        extra.addEventListener(`click`, () => {
          const more = newCandidates().slice(0, 5);
          if (!more.length) return;
          queue = more.map((t) => ({ term: t, isNew: true }));
          session.total += queue.length;
          renderQueue();
        });
        el.appendChild(extra);
      }
      area.appendChild(el);
    }

    function renderQueue() {
      renderMeta();
      area.innerHTML = ``;
      if (!queue.length) { renderEmpty(); return; }
      keysHint.hidden = false;
      const { term, isNew } = queue[0];
      const hints = {};
      const pv = Srs.preview(term.id);
      [1, 2, 3, 4].forEach((g) => { hints[g] = Srs.intervalLabel(pv[g]); });
      const card = CardUi.buildFlipCard(term, {
        known,
        showGrading: true,
        gradeHints: hints,
        onGrade: (t, g) => doGrade(t, g, isNew),
      });
      if (isNew) {
        const head = card.querySelector(`.flip-face-tags`);
        if (head) head.insertAdjacentHTML(`afterbegin`, `<span class="badge badge-new">新規</span>`);
      }
      area.appendChild(card);
      const flipBtn = card.querySelector(`.flip-card-front [data-role="flip"]`);
      if (flipBtn) flipBtn.focus({ preventScroll: true });
    }

    function doGrade(term, g, isNew) {
      const prevCard = Srs.getCard(term.id);
      const prevKnown = !!known[term.id];
      const item = queue[0];
      Srs.grade(term.id, g);
      if (g >= 3) known[term.id] = true;
      Storage.set(`flashcards`, known);
      if (isNew && !todayNew.ids.includes(term.id)) {
        todayNew.ids.push(term.id);
        Storage.set(`reviewNewToday`, todayNew);
      }
      queue.shift();
      // 「もう一度」は数枚後にもう一度出す
      if (g === 1) {
        queue.splice(Math.min(3, queue.length), 0, { term, isNew: false });
        session.again += 1;
      } else {
        session.done += 1;
      }
      undoStack.push({ term, prevCard, prevKnown, item, g, isNew });
      if (undoStack.length > 20) undoStack.shift();
      renderQueue();
      const shortName = term.name.length > 14 ? `${term.name.slice(0, 13)}…` : term.name;
      // 前のトーストは閉じる(古いトーストの「元に戻す」で別の評価が取り消されないように)
      if (lastToast) lastToast.dismiss();
      lastToast = UI.toast(`「${shortName}」は${Srs.intervalLabel(Srs.getCard(term.id).interval)}に出題`, `default`, { action: { label: `元に戻す`, onClick: undo }, duration: 3200 });
    }

    function undo() {
      const last = undoStack.pop();
      if (!last || !document.body.contains(wrap)) return;
      Srs.restore(last.term.id, last.prevCard);
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
      } else {
        session.done = Math.max(0, session.done - 1);
      }
      queue.unshift(last.item);
      renderQueue();
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
        const btn = card.querySelector(`[data-grade="${e.key}"]`);
        if (btn) btn.click();
      } else if (e.key === ` ` && !e.target.closest(`button, a`)) {
        e.preventDefault();
        if (card.flip) card.flip(true); else card.click();
      }
    }
    document.addEventListener(`keydown`, onKey);

    renderQueue();
  }

  return { render, DEFAULT_NEW_LIMIT };
})();
