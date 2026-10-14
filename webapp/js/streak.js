// 学習の連続日数(ストリーク)管理
// activityLog: { "YYYY-MM-DD": 学習アクション回数 } (旧形式の true は 1 回として扱う)
// 記録するたびに window へ 'study:action' を送る(goals.js・badges.js が聞く)
window.Streak = (function () {
  function getLog() {
    const log = Storage.get(`activityLog`, {});
    return log && typeof log === `object` && !Array.isArray(log) ? log : {};
  }

  function countOf(v) {
    if (v === true) return 1;
    // 壊れたバックアップの 1e400(=Infinity)などは数えない
    return typeof v === `number` && Number.isFinite(v) && v > 0 ? v : 0;
  }

  function recordToday() {
    const today = DateUtil.today();
    const log = getLog();
    log[today] = countOf(log[today]) + 1;
    Storage.set(`activityLog`, log);
    // 学習した操作のあとの処理(目標の達成・バッジ)に知らせる。v12
    try { window.dispatchEvent(new CustomEvent(`study:action`)); } catch (e) { /* 古いブラウザ・テスト環境では知らせない */ }
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
    // 最長記録(getLongestStreak)と同じく、日付として正しいキーだけを数える
    return Object.keys(log).filter((d) => countOf(log[d]) && DateUtil.isValid(d)).length;
  }

  // 今日の学習アクション回数
  function todayCount() {
    return countOf(getLog()[DateUtil.today()]);
  }

  // 今週(日曜はじまり)の7日分 [{date, count, active, isToday, isFuture}]
  function getWeek() {
    const log = getLog();
    const today = DateUtil.today();
    const d = DateUtil.parse(today);
    const start = DateUtil.addDays(today, -(d ? d.getDay() : 0));
    return Array.from({ length: 7 }, (_, i) => {
      const date = DateUtil.addDays(start, i);
      const count = date > today ? 0 : countOf(log[date]);
      return { date, count, active: count > 0, isToday: date === today, isFuture: date > today };
    });
  }

  return { recordToday, getCurrentStreak, getLongestStreak, getLastNDays, getLast14Days, totalActiveDays, todayCount, getWeek, countOf };
})();
