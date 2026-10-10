// 学習の連続日数(ストリーク)管理
// activityLog: { "YYYY-MM-DD": 学習アクション回数 } (旧形式の true は 1 回として扱う)
window.Streak = (function () {
  function getLog() {
    const log = Storage.get(`activityLog`, {});
    return log && typeof log === `object` && !Array.isArray(log) ? log : {};
  }

  function countOf(v) {
    if (v === true) return 1;
    return typeof v === `number` && v > 0 ? v : 0;
  }

  function recordToday() {
    const today = DateUtil.today();
    const log = getLog();
    log[today] = countOf(log[today]) + 1;
    Storage.set(`activityLog`, log);
  }

  function getCurrentStreak() {
    const log = getLog();
    const today = DateUtil.today();
    // 今日まだ学習していなくても、昨日まで続いていれば途切れていない扱い
    let cursor = countOf(log[today]) ? today : DateUtil.addDays(today, -1);
    let count = 0;
    while (countOf(log[cursor])) {
      count += 1;
      cursor = DateUtil.addDays(cursor, -1);
    }
    return count;
  }

  function getLongestStreak() {
    const log = getLog();
    const dates = Object.keys(log).filter((d) => countOf(log[d]) && DateUtil.isValid(d)).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    dates.forEach((d) => {
      run = prev && DateUtil.diffDays(prev, d) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    return best;
  }

  // 古い順の n 日分 [{date, count, active}]
  function getLastNDays(n) {
    const log = getLog();
    const today = DateUtil.today();
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = DateUtil.addDays(today, -i);
      const count = countOf(log[date]);
      days.push({ date, count, active: count > 0 });
    }
    return days;
  }

  function getLast14Days() {
    return getLastNDays(14);
  }

  function totalActiveDays() {
    const log = getLog();
    return Object.keys(log).filter((d) => countOf(log[d])).length;
  }

  return { recordToday, getCurrentStreak, getLongestStreak, getLastNDays, getLast14Days, totalActiveDays, countOf };
})();
