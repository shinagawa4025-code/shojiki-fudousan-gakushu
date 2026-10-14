// 1日の目標(v12): 「回数」(4択・○×・カードなどの学習の回数)か「分」(学習時間)で決める。初期値は今までのリングと同じ 10回
// 保存: Storage `dailyGoal` = { kind: 'actions'|'minutes', value: number }、`goalDays` = { 'YYYY-MM-DD': true }(目標を達成した日)
// 回数はホームのリングと同じ数(Streak.todayCount = 今日の学習記録 activityLog の回数)、分は StudyTime.todaySeconds() から
// 達成した日は、学習の操作のあと('study:action')と学習時間の保存のあと('studytime:change')に確かめて記録する(一度記録したら目標を上げても消さない)
window.Goals = (function () {
  const KEY = `dailyGoal`;
  const DAYS_KEY = `goalDays`;
  const DEFAULT = Object.freeze({ kind: `actions`, value: 10 });
  const RANGE = { actions: { min: 1, max: 200 }, minutes: { min: 5, max: 600 } };

  // 種類と値を確かめる(範囲外は端に寄せる。種類が違う・数でないものは null)
  function normalize(goal) {
    if (!Storage.isPlainObject(goal) || !Object.prototype.hasOwnProperty.call(RANGE, goal.kind)) return null;
    const n = Number(goal.value);
    if (!Number.isFinite(n)) return null;
    const r = RANGE[goal.kind];
    return { kind: goal.kind, value: Math.min(r.max, Math.max(r.min, Math.round(n))) };
  }

  function get() {
    return normalize(Storage.get(KEY, null)) || { kind: DEFAULT.kind, value: DEFAULT.value };
  }

  // 戻り値: 保存した目標(形が違えば null で、保存しない)
  function set(goal) {
    const g = normalize(goal);
    if (!g) return null;
    Storage.set(KEY, g);
    try { window.dispatchEvent(new CustomEvent(`goal:change`, { detail: g })); } catch (e) { /* 古いブラウザでは知らせない */ }
    evaluate();
    return g;
  }

  // 今日の進み具合 { kind, value, done, pct(0〜100), met }
  // 回数: done = 今日の学習の回数(ホームのリングと同じ数え方)。分: done = 今日の学習時間(分、切り捨て)
  function today() {
    const g = get();
    let done = 0;
    let met = false;
    if (g.kind === `minutes`) {
      const s = window.StudyTime && StudyTime.todaySeconds ? Math.max(0, Math.floor(Number(StudyTime.todaySeconds()) || 0)) : 0;
      done = Math.floor(s / 60);
      met = s >= g.value * 60;
    } else {
      const n = window.Streak && Streak.todayCount ? Number(Streak.todayCount()) : 0;
      done = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      met = done >= g.value;
    }
    const pct = Math.min(100, Math.round((done / g.value) * 100));
    return { kind: g.kind, value: g.value, done, pct, met };
  }

  function readDays() {
    return Storage.get(DAYS_KEY, {});
  }

  // 目標を達成した日の数(今日まで。未来の日付・壊れた値は数えない)
  function metDaysCount() {
    const days = readDays();
    const t = DateUtil.today();
    return Object.keys(days).filter((d) => days[d] === true && DateUtil.isValid(d) && d <= t).length;
  }

  function isMetDay(d) {
    return readDays()[d] === true;
  }

  // 今日の目標を達成していれば記録する。戻り値: 今日新しく記録したら true
  let metFor = ``; // 記録済みの日(同じ日に何度も読み書きしないように)
  function evaluate() {
    const t = DateUtil.today();
    if (metFor === t) return false;
    if (!today().met) return false;
    // 別のタブの記録を消さないよう、書く直前に読み直す
    const days = readDays();
    metFor = t;
    if (days[t] === true) return false;
    days[t] = true;
    Storage.set(DAYS_KEY, days);
    try { window.dispatchEvent(new CustomEvent(`goal:met`, { detail: { date: t } })); } catch (e) { /* 知らせなくても記録は残る */ }
    return true;
  }

  let started = false;
  // 起動時に1回(Badges.start からも呼ぶ。何度呼んでもよい)
  function start() {
    if (started || typeof window.addEventListener !== `function`) return;
    started = true;
    const run = () => { try { evaluate(); } catch (e) { console.error(`[目標] 達成を記録できませんでした`, e); } };
    window.addEventListener(`study:action`, run);
    // 学習時間の保存(30秒ごと)は、目標が「分」のときだけ確かめる
    window.addEventListener(`studytime:change`, () => { if (metFor !== DateUtil.today() && get().kind === `minutes`) run(); });
  }

  return { get, set, today, metDaysCount, isMetDay, evaluate, start, DEFAULT, RANGE };
})();
