// 間隔反復学習(SM-2簡易版)
window.Srs = (function () {
  const DEFAULT_CARD = () => ({ ease: 2.5, interval: 0, reps: 0, dueDate: todayStr(), lastGrade: null });

  // 日付計算はローカル日付基準のDateUtilに委譲(関数名は既存呼び出しとの互換のため維持)
  function todayStr() {
    return DateUtil.today();
  }

  function addDays(dateStr, days) {
    return DateUtil.addDays(dateStr, days);
  }

  function getAllCards() {
    const cards = Storage.get(`srsCards`, {});
    return cards && typeof cards === `object` && !Array.isArray(cards) ? cards : {};
  }

  function migrateIfNeeded() {
    const migrated = Storage.get(`srsMigrated`, false);
    if (migrated) return;
    const cards = getAllCards();
    const known = Storage.get(`flashcards`, {});
    Object.keys(known).forEach((termId) => {
      if (known[termId] && !cards[termId]) {
        cards[termId] = { ease: 2.5, interval: 4, reps: 2, dueDate: addDays(todayStr(), 4), lastGrade: 3 };
      }
    });
    Storage.set(`srsCards`, cards);
    Storage.set(`srsMigrated`, true);
  }

  function getCard(termId) {
    return getAllCards()[termId] || null;
  }

  function isDue(termId) {
    const card = getCard(termId);
    if (!card) return true; // 未学習(新規)は常に復習対象
    return card.dueDate <= todayStr();
  }

  function getDueTermIds(allTermIds) {
    return allTermIds.filter(isDue);
  }

  // 作成済みカードのうち期限到来分のみ(未学習の新規は含まない)
  function getReviewDueIds() {
    const cards = getAllCards();
    const today = todayStr();
    return Object.keys(cards).filter((id) => cards[id] && cards[id].dueDate <= today);
  }

  // 評価gを付けた後のカードを返す(元のカードは変更しない純粋関数)
  function nextCard(prev, g) {
    const card = Object.assign(DEFAULT_CARD(), Storage.isPlainObject(prev) ? prev : {});
    // 壊れたインポートで文字列になっていても計算できるよう数値に揃える
    card.ease = Number(card.ease) || 2.5;
    card.interval = Number(card.interval) || 0;
    card.reps = Number(card.reps) || 0;
    if (g === 1) { // もう一度
      card.reps = 0;
      card.interval = 0;
      card.ease = Math.max(1.3, card.ease - 0.2);
      card.dueDate = todayStr();
    } else if (g === 2) { // 難しい
      card.interval = Math.max(1, Math.round((card.interval || 1) * 1.2));
      card.ease = Math.max(1.3, card.ease - 0.15);
      card.reps += 1;
      card.dueDate = addDays(todayStr(), card.interval);
    } else if (g === 3) { // 普通
      if (card.reps === 0) card.interval = 1;
      else if (card.reps === 1) card.interval = 6;
      else card.interval = Math.round(card.interval * card.ease);
      card.reps += 1;
      card.dueDate = addDays(todayStr(), card.interval);
    } else { // 簡単
      card.interval = Math.round((card.interval || 1) * card.ease * 1.3) + 1;
      card.ease += 0.15;
      card.reps += 1;
      card.dueDate = addDays(todayStr(), card.interval);
    }
    card.lastGrade = g;
    return card;
  }

  // 各評価を付けた場合の次回までの日数 { 1: 0, 2: n, 3: n, 4: n }
  function preview(termId) {
    const prev = getCard(termId);
    const out = {};
    [1, 2, 3, 4].forEach((g) => { out[g] = nextCard(prev, g).interval; });
    return out;
  }

  function intervalLabel(days) {
    if (days <= 0) return `今日`;
    if (days < 30) return `${days}日後`;
    if (days < 365) return `${Math.round(days / 30)}か月後`;
    return `${Math.round(days / 36.5) / 10}年後`;
  }

  // opts.silent: 呼び出し側で学習記録(ストリーク)を付けている場合は二重に数えない
  function grade(termId, g, opts) {
    const cards = getAllCards();
    const card = nextCard(cards[termId], g);
    cards[termId] = card;
    Storage.set(`srsCards`, cards);
    if (window.Streak && !(opts && opts.silent)) window.Streak.recordToday();
    window.dispatchEvent(new CustomEvent(`srs:change`, { detail: { termId, grade: g } }));
    return card;
  }

  // 元に戻す用: カードを指定状態に戻す(null なら削除)
  function restore(termId, prevCard) {
    const cards = getAllCards();
    if (prevCard) cards[termId] = prevCard;
    else delete cards[termId];
    Storage.set(`srsCards`, cards);
    window.dispatchEvent(new CustomEvent(`srs:change`, { detail: { termId, restored: true } }));
  }

  return { migrateIfNeeded, getCard, getAllCards, isDue, getDueTermIds, getReviewDueIds, grade, nextCard, preview, intervalLabel, restore, todayStr, addDays };
})();
