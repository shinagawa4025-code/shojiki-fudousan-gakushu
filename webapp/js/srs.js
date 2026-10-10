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

  function grade(termId, g) {
    const cards = getAllCards();
    const card = cards[termId] || DEFAULT_CARD();

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
    cards[termId] = card;
    Storage.set(`srsCards`, cards);
    if (window.Streak) window.Streak.recordToday();
    window.dispatchEvent(new CustomEvent(`srs:change`, { detail: { termId, grade: g } }));
    return card;
  }

  return { migrateIfNeeded, getCard, getAllCards, isDue, getDueTermIds, getReviewDueIds, grade, todayStr, addDays };
})();
