// 解き直しの予定: 間違えた4択の確認問題を 1→3→7→21日後に出し直し、4回続けて正解したら卒業(予定から外す)
// 登録元: 4択の不正解(quiz.js)・模擬試験の誤答(exam.js)・○×の不正解(元の4択。ox.js)
// 保存: Storage `quizRetry` = { [問題ID]: { step: 0〜3, due: 'YYYY-MM-DD'(次に出す日), at: 'YYYY-MM-DD'(最後に登録・回答した日), src: 'quiz'|'exam'|'ox' } }
//       step は「次に正解したら何段階目に進むか」の手前の段階(0 = 間違えた直後。正解するたびに 1→3→7→21日後へ)
//       Storage `quizRetryToday` = { date: 'YYYY-MM-DD', ids: [今日、期限が来ていて答えた問題ID] }(今日のメニューの完了判定用)
// 間違えたら段階を最初に戻して翌日に出す。期限前の正解では進めない(期限が来た問題だけ進める)
// 同じ日に同じ問題を何度間違えても、登録し直さない(4択と○×で続けて間違えた場合など)
// 廃止・削除された問題、4択でない問題の記録は無視する(保存データからは消さない。データが戻ったときにまた使えるように)
// 書き込みは毎回、最新の保存値を読み直してから行う(別のタブの記録を消さないように)
window.Drill = (function () {
  const KEY = `quizRetry`;
  const TODAY_KEY = `quizRetryToday`;
  const INTERVALS = [1, 3, 7, 21]; // 段階ごとの次の出題までの日数
  const SOURCES = [`quiz`, `exam`, `ox`];
  const TODAY_MAX = 300;

  function today() {
    return DateUtil.today();
  }

  // 問題IDの索引(問題データが差し替わったら作り直す)
  let idx = null;
  function quizIndex() {
    const list = (window.APP_DATA && Array.isArray(window.APP_DATA.quiz)) ? window.APP_DATA.quiz : [];
    if (!idx || idx.src !== list || idx.n !== list.length) {
      const map = Object.create(null);
      list.forEach((q) => { if (q && typeof q.id === `string`) map[q.id] = q; });
      idx = { src: list, n: list.length, map };
    }
    return idx.map;
  }

  function quizOf(id) {
    return typeof id === `string` ? quizIndex()[id] || null : null;
  }

  // 解き直しに使える問題か(今のデータにある4択の確認問題)
  function isEligible(id) {
    const q = quizOf(id);
    return !!(q && window.QuizEngine && QuizEngine.isMcItem(q));
  }

  // 1件の記録を整える(壊れていれば null)
  function clean(v) {
    if (!Storage.isPlainObject(v) || !DateUtil.isValid(v.due)) return null;
    const step = Number(v.step);
    return {
      step: Number.isInteger(step) && step >= 0 && step < INTERVALS.length ? step : 0,
      due: v.due,
      at: DateUtil.isValid(v.at) ? v.at : ``,
      src: SOURCES.includes(v.src) ? v.src : ``,
    };
  }

  function readRaw() {
    return Storage.get(KEY, {});
  }

  // 使える記録だけ { 問題ID: 記録 }
  function entries() {
    const raw = readRaw();
    const out = {};
    Object.keys(raw).forEach((id) => {
      const e = clean(raw[id]);
      if (e && isEligible(id)) out[id] = e;
    });
    return out;
  }

  function get(id) {
    if (!isEligible(id)) return null;
    return clean(readRaw()[id]);
  }

  function notify(quizId, kind) {
    try { window.dispatchEvent(new CustomEvent(`drill:change`, { detail: { quizId, kind } })); } catch (e) { /* 古いブラウザでは知らせない */ }
  }

  // ---- 今日答えた(期限が来ていた)問題 ----
  function todayLog() {
    const rec = Storage.get(TODAY_KEY, null);
    if (!Storage.isPlainObject(rec) || rec.date !== today() || !Array.isArray(rec.ids)) return { date: today(), ids: [] };
    return { date: rec.date, ids: rec.ids.filter((x, i, a) => typeof x === `string` && a.indexOf(x) === i) };
  }

  function logToday(id) {
    const rec = todayLog();
    if (rec.ids.includes(id)) return;
    rec.ids.push(id);
    if (rec.ids.length > TODAY_MAX) rec.ids = rec.ids.slice(-TODAY_MAX);
    Storage.set(TODAY_KEY, rec);
  }

  // 今日、期限が来ていた解き直しに答えた数(卒業した問題も含む)
  function todayCount() {
    return todayLog().ids.length;
  }

  // ---- 登録・回答 ----

  // 間違えた: 段階を最初に戻し、翌日に出す。戻り値: 変えたら true
  function noteWrong(quizId, source) {
    if (!isEligible(quizId)) return false;
    const t = today();
    const raw = readRaw();
    const prev = clean(raw[quizId]);
    // 今日すでに間違いとして登録してある(段階0・明日以降に出す)なら何もしない
    if (prev && prev.at === t && prev.step === 0 && prev.due > t) return false;
    if (prev && prev.due <= t) logToday(quizId);
    raw[quizId] = { step: 0, due: DateUtil.addDays(t, INTERVALS[0]), at: t, src: SOURCES.includes(source) ? source : (prev && prev.src) || `quiz` };
    Storage.set(KEY, raw);
    notify(quizId, `wrong`);
    return true;
  }

  // 正解した: 期限が来ていれば次の段階へ(最後の段階なら卒業して予定から外す)
  // 戻り値: null(予定にない・まだ期限前) / { graduated: true } / { graduated: false, step, due, days }
  function noteRight(quizId) {
    if (!isEligible(quizId)) return null;
    const t = today();
    const raw = readRaw();
    const prev = clean(raw[quizId]);
    if (!prev || prev.due > t) return null;
    logToday(quizId);
    const step = prev.step + 1;
    if (step >= INTERVALS.length) {
      delete raw[quizId];
      Storage.set(KEY, raw);
      notify(quizId, `graduated`);
      return { graduated: true };
    }
    const days = INTERVALS[step];
    const due = DateUtil.addDays(t, days);
    raw[quizId] = { step, due, at: t, src: prev.src || `quiz` };
    Storage.set(KEY, raw);
    notify(quizId, `right`);
    return { graduated: false, step, due, days };
  }

  // 結果をまとめて反映する(4択・模擬試験から)。ok: 正解か
  function note(quizId, ok, source) {
    return ok ? noteRight(quizId) : noteWrong(quizId, source);
  }

  // ---- 一覧 ----

  // 期限が来た問題のID(期限の古い順 → 最後に答えた日の古い順)
  function dueIds(day) {
    const t = DateUtil.isValid(day) ? day : today();
    const all = entries();
    return Object.keys(all)
      .filter((id) => all[id].due <= t)
      .sort((a, b) => (all[a].due < all[b].due ? -1 : all[a].due > all[b].due ? 1 : 0) || (all[a].at < all[b].at ? -1 : all[a].at > all[b].at ? 1 : 0) || (a < b ? -1 : 1));
  }

  function dueCount(day) {
    return dueIds(day).length;
  }

  // 予定に入っている問題の数(期限前も含む)
  function count() {
    return Object.keys(entries()).length;
  }

  // 次に期限が来る日と件数(今日より後)。なければ null
  function nextDue(day) {
    const t = DateUtil.isValid(day) ? day : today();
    const all = entries();
    let min = null;
    Object.keys(all).forEach((id) => { if (all[id].due > t && (!min || all[id].due < min)) min = all[id].due; });
    if (!min) return null;
    return { date: min, days: DateUtil.diffDays(t, min), count: Object.keys(all).filter((id) => all[id].due === min).length };
  }

  // 卒業までの残りの正解回数
  function remaining(e) {
    return e ? INTERVALS.length - e.step : 0;
  }

  function remove(quizId) {
    const raw = readRaw();
    if (!Object.prototype.hasOwnProperty.call(raw, quizId)) return;
    delete raw[quizId];
    Storage.set(KEY, raw);
    notify(quizId, `remove`);
  }

  function clear() {
    Storage.remove(KEY);
    Storage.remove(TODAY_KEY);
    notify(null, `clear`);
  }

  return {
    KEY, TODAY_KEY, INTERVALS,
    isEligible, get, noteWrong, noteRight, note, dueIds, dueCount, count, nextDue, remaining, todayCount, remove, clear,
  };
})();
