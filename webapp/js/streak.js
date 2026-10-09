// 学習の連続日数(ストリーク)管理
window.Streak = (function () {
  function recordToday() {
    const today = Srs.todayStr();
    const log = Storage.get(`activityLog`, {});
    if (log[today]) return;
    log[today] = true;
    Storage.set(`activityLog`, log);
  }

  function getCurrentStreak() {
    const log = Storage.get(`activityLog`, {});
    const today = Srs.todayStr();
    let cursor = log[today] ? today : Srs.addDays(today, -1);
    if (!log[cursor]) return 0;
    let count = 0;
    while (log[cursor]) {
      count += 1;
      cursor = Srs.addDays(cursor, -1);
    }
    return count;
  }

  function getLast14Days() {
    const log = Storage.get(`activityLog`, {});
    const today = Srs.todayStr();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = Srs.addDays(today, -i);
      days.push({ date, active: !!log[date] });
    }
    return days;
  }

  return { recordToday, getCurrentStreak, getLast14Days };
})();
