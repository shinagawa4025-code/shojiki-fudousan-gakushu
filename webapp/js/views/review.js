// 今日の復習ビュー: 間隔反復学習(SRS)で復習期限が来た用語のみを出題
window.Views = window.Views || {};
window.Views.review = (function () {
  function render(root) {
    Srs.migrateIfNeeded();
    const known = Storage.get(`flashcards`, {});
    const allTerms = AppIndex.allTerms;
    const dueIds = Srs.getDueTermIds(allTerms.map((t) => t.id));
    let queue = dueIds.map((id) => AppIndex.termsById[id]).filter(Boolean);
    // シャッフル
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    const wrap = document.createElement(`div`);
    wrap.className = `view review-view`;
    wrap.innerHTML = `
      <h2>今日の復習</h2>
      <p class="view-desc">間隔反復学習(SRS)の仕組みで、復習のタイミングが来た用語だけを出題します。カードをめくって「もう一度/難しい/普通/簡単」のいずれかで自己評価すると、次の出題タイミングが自動調整されます。</p>
      <p class="progress-text" data-role="counter"></p>
      <div class="card-grid single-col" data-role="review-area"></div>
    `;
    root.appendChild(wrap);

    const counter = wrap.querySelector(`[data-role="counter"]`);
    const area = wrap.querySelector(`[data-role="review-area"]`);

    function renderQueue() {
      counter.textContent = queue.length ? `残り ${queue.length} 件` : ``;
      area.innerHTML = ``;
      if (!queue.length) {
        area.innerHTML = `<div class="card review-empty"><p>本日復習対象の用語はありません。お疲れ様でした。</p><button type="button" class="btn" data-role="goto-glossary">用語集を見る</button></div>`;
        area.querySelector(`[data-role="goto-glossary"]`).addEventListener(`click`, () => Router.navigate(`#glossary`));
        return;
      }
      const term = queue[0];
      const card = CardUi.buildFlipCard(term, {
        known,
        showGrading: true,
        onToggleKnown: () => { /* 評価ボタンで進捗するため見た目のみ更新は card 内部で完結 */ },
        onGrade: (t, grade) => {
          Srs.grade(t.id, grade);
          if (grade >= 3) known[t.id] = true;
          Storage.set(`flashcards`, known);
          queue.shift();
          renderQueue();
        },
      });
      card.classList.add(`flipped`);
      area.appendChild(card);
    }

    renderQueue();
  }

  return { render };
})();
