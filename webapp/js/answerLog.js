// 4択の解答の記録(日付つき)と「自信なし」の扱い(v12)。合格予測(predict.js)・バッジ(badges.js)が使う
// 保存: Storage `answerDaily` = { 'YYYY-MM-DD': { [宅建の分野 kenri|horei|zei|gyoho|menjo|other]: [自信あり正解, 自信なし正解, 不正解] } }(120日より古い日は消す)
//       Storage `quizUnsure` = { [問題ID]: 'YYYY-MM-DD'(自信なしで正解した日) }(自信ありで正解したら消す)
//       sessionStorage `shojikiLearn.v1.answerLogRecent` = 「勘で当たった」の付け外し用の、このタブの今日の記録(下の recent)
// 分野は模擬試験と同じ Stats.categoryOf(問題, 'takken')(examCats.takken を優先。範囲外・不明は other)
// ○×は記録しない(文ごとの記録は oxStats)。書き込みは毎回、最新の保存値を読み直してから行う(別のタブの記録を消さないように)
window.AnswerLog = (function () {
  const DAILY_KEY = `answerDaily`;
  const UNSURE_KEY = `quizUnsure`;
  const KEEP_DAYS = 120;
  const OTHER = `other`;
  const SOURCES = [`quiz`, `exam`, `ox`];
  const SURE = 0;
  const UNSURE = 1;
  const WRONG = 2;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // 「勘で当たった」を付け外しできるのは、このタブで今日自信ありの正解として記録した分だけ
  // (日ごとの記録は分野ごとの合計しかないため、どの問題の分かは覚えておく)。{ 問題ID: { date, sure: 付け替えられる数, moved: 付け替えた数 } }
  // タブごとの sessionStorage にも置く(再読み込みのあとで外したときも、付け替えた数を自信ありに戻せるように)。
  // localStorage には置かない(バックアップに入れず、別のタブとも分けるため)。sessionStorage が使えなければ、このページの間だけ覚える
  const RECENT_KEY = `shojikiLearn.v1.answerLogRecent`;
  let recent = null;

  function today() {
    return DateUtil.today();
  }

  function quizOf(id) {
    if (typeof id !== `string`) return null;
    if (window.Drill && typeof Drill.quizOf === `function`) return Drill.quizOf(id);
    const list = (window.APP_DATA && Array.isArray(window.APP_DATA.quiz)) ? window.APP_DATA.quiz : [];
    return list.find((q) => q && q.id === id) || null;
  }

  function isMc(q) {
    return !!q && (window.QuizEngine && QuizEngine.isMcItem ? QuizEngine.isMcItem(q) : q.format === `mc`);
  }

  // 宅建士の分野(kenri など)。範囲外・判定できない問題は other
  function categoryIdOf(q) {
    try {
      const c = window.Stats && Stats.categoryOf ? Stats.categoryOf(q, `takken`) : null;
      if (c && typeof c.id === `string`) return c.id;
    } catch (e) { /* 分野が引けなければ other */ }
    return OTHER;
  }

  // 記録に使う分野ID(試験データから。読めないときも今の5分野の記録を消さないよう、既定の一覧を足す)
  const DEFAULT_CATS = [`kenri`, `horei`, `zei`, `gyoho`, `menjo`];
  function categoryIds() {
    const t = window.Stats && Stats.examType ? Stats.examType(`takken`) : null;
    const ids = t && Array.isArray(t.categories) ? t.categories.map((c) => c.id).filter((id) => typeof id === `string`) : [];
    return ids.concat(DEFAULT_CATS.filter((id) => !ids.includes(id)), OTHER);
  }

  function cnt(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e6) : 0;
  }

  // [自信あり正解, 自信なし正解, 不正解](壊れていれば null)
  function cleanTriple(v) {
    if (!Array.isArray(v)) return null;
    const out = [cnt(v[0]), cnt(v[1]), cnt(v[2])];
    return out[0] + out[1] + out[2] > 0 ? out : null;
  }

  // 保存値を整える: 日付として正しいキーで、残す期間内(今日から120日前まで。時計のずれを考えて翌日まで)のものだけ
  function cleanDaily(raw, t) {
    const out = {};
    if (!Storage.isPlainObject(raw)) return out;
    const oldest = DateUtil.addDays(t, -KEEP_DAYS);
    const newest = DateUtil.addDays(t, 1);
    const cats = categoryIds();
    Object.keys(raw).forEach((d) => {
      if (!DateUtil.isValid(d) || d < oldest || d > newest || !Storage.isPlainObject(raw[d])) return;
      const day = {};
      Object.keys(raw[d]).forEach((c) => {
        if (!cats.includes(c)) return;
        const tr = cleanTriple(raw[d][c]);
        if (tr) day[c] = tr;
      });
      if (Object.keys(day).length) out[d] = day;
    });
    return out;
  }

  // 今日の分野の数を変える(fn が配列を書き換える)
  function bump(cat, fn) {
    const t = today();
    const daily = cleanDaily(Storage.get(DAILY_KEY, {}), t);
    const day = daily[t] || (daily[t] = {});
    const tr = day[cat] || [0, 0, 0];
    if (fn(tr) === false) return false;
    day[cat] = tr;
    return Storage.set(DAILY_KEY, daily);
  }

  function readUnsure() {
    return Storage.get(UNSURE_KEY, {});
  }

  function setUnsure(id, on) {
    const map = readUnsure();
    if (on) {
      map[id] = today();
    } else {
      if (!hasOwn(map, id)) return;
      delete map[id];
    }
    Storage.set(UNSURE_KEY, map);
  }

  function noteDrill(id, src) {
    if (!window.Drill || typeof Drill.noteUnsure !== `function`) return;
    try { Drill.noteUnsure(id, SOURCES.includes(src) ? src : `quiz`); } catch (e) { console.error(`[解き直し] 自信なしの正解を登録できませんでした`, e); }
  }

  function notify(quizId, kind) {
    try { window.dispatchEvent(new CustomEvent(`answerlog:change`, { detail: { quizId, kind } })); } catch (e) { /* 古いブラウザでは知らせない */ }
  }

  // このタブの記録(初めて使うときに sessionStorage から読む。今日の分だけ。壊れた値は捨てる)
  function recentMap() {
    if (recent) return recent;
    recent = Object.create(null);
    const t = today();
    try {
      const raw = JSON.parse(sessionStorage.getItem(RECENT_KEY) || `null`);
      if (Storage.isPlainObject(raw)) {
        Object.keys(raw).forEach((id) => {
          const r = raw[id];
          if (!Storage.isPlainObject(r) || r.date !== t) return;
          const sure = cnt(r.sure);
          const moved = cnt(r.moved);
          if (sure + moved > 0) recent[id] = { date: t, sure, moved };
        });
      }
    } catch (e) { /* 読めなければ、このページの間だけ覚える */ }
    return recent;
  }

  // 今日の分だけ sessionStorage に書く(日付が変わった分は捨てる)
  function saveRecent() {
    const map = recentMap();
    const t = today();
    const out = {};
    Object.keys(map).forEach((id) => {
      const r = map[id];
      if (r.date !== t) { delete map[id]; return; }
      if (r.sure > 0 || r.moved > 0) out[id] = r;
    });
    try {
      if (Object.keys(out).length) sessionStorage.setItem(RECENT_KEY, JSON.stringify(out));
      else sessionStorage.removeItem(RECENT_KEY);
    } catch (e) { /* 書けなければ、このページの間だけ覚える */ }
  }

  function recentOf(id) {
    const map = recentMap();
    const t = today();
    let r = map[id];
    if (!r || r.date !== t) r = map[id] = { date: t, sure: 0, moved: 0 };
    return r;
  }

  // ---- 公開API ----

  // 4択・模擬試験の1回の解答を記録する。opts: { ok: boolean, unsure: boolean, src: 'quiz'|'exam'|'ox' }
  // 戻り値: 記録したら true(今のデータにない問題・4択でない問題は記録しない)
  function record(quizId, opts) {
    opts = opts || {};
    const q = quizOf(quizId);
    if (!isMc(q)) return false;
    const ok = opts.ok === true;
    const unsure = ok && opts.unsure === true;
    const slot = !ok ? WRONG : unsure ? UNSURE : SURE;
    bump(categoryIdOf(q), (tr) => { tr[slot] += 1; });
    if (unsure) {
      setUnsure(quizId, true);
      noteDrill(quizId, opts.src);
    } else if (ok) {
      // 自信をもって正解できたら「自信なし」を外す(不正解では外さない。分析の 0.5 扱いが 1 に戻らないように)
      setUnsure(quizId, false);
      recentOf(quizId).sure += 1;
      saveRecent();
    }
    // v14: 経験値(4択の解答はここで1回だけ数える。確認問題・解き直し・トピック詳細・ブックマークのカード)
    awardXp(q.id, ok, unsure, opts.src);
    notify(quizId, `record`);
    return true;
  }

  // v14: 経験値を足す(js/xp.js。なくても記録は続ける)。src: quiz | exam(模擬試験の採点)
  function awardXp(id, correct, unsure, src) {
    try { if (window.Xp) Xp.award(`mc`, { id, correct, unsure, src: SOURCES.includes(src) ? src : `quiz` }); } catch (e) { console.error(`[解答の記録] 経験値を記録できませんでした`, e); }
  }

  // まとめて記録する(模擬試験の採点時など。日ごとの記録の読み書きは1回だけ)
  // items: [{ quizId, ok, unsure }]、src: 'exam' など。戻り値: 記録した数
  function recordMany(items, src) {
    if (!Array.isArray(items) || !items.length) return 0;
    const rows = [];
    items.forEach((it) => {
      if (!it || typeof it !== `object`) return;
      const q = quizOf(it.quizId);
      if (!isMc(q)) return;
      const ok = it.ok === true;
      rows.push({ id: q.id, cat: categoryIdOf(q), ok, unsure: ok && it.unsure === true });
    });
    if (!rows.length) return 0;
    const t = today();
    const daily = cleanDaily(Storage.get(DAILY_KEY, {}), t);
    const day = daily[t] || (daily[t] = {});
    rows.forEach((r) => {
      const tr = day[r.cat] || (day[r.cat] = [0, 0, 0]);
      tr[!r.ok ? WRONG : r.unsure ? UNSURE : SURE] += 1;
    });
    Storage.set(DAILY_KEY, daily);
    // 自信なし: 印を付けて解き直しへ / 自信ありの正解: 印を外す(読み書きは1回)
    const map = readUnsure();
    let changed = false;
    rows.forEach((r) => {
      if (r.unsure) { map[r.id] = t; changed = true; } else if (r.ok && hasOwn(map, r.id)) { delete map[r.id]; changed = true; }
    });
    if (changed) Storage.set(UNSURE_KEY, map);
    rows.forEach((r) => { if (r.unsure) noteDrill(r.id, src); });
    // v14: 経験値(模擬試験の採点。記録した問題ごとに1回)
    rows.forEach((r) => awardXp(r.id, r.ok, r.unsure, src));
    notify(null, `record`);
    return rows.length;
  }

  // 正解したあとで「勘で当たった」を付ける: 今日の記録を自信なしに付け替え、解き直しに3日後で登録する
  // 戻り値: 変えたら true
  function markUnsure(quizId, src) {
    const q = quizOf(quizId);
    if (!isMc(q)) return false;
    const r = recentOf(quizId);
    // 今日すでに自信なしになっている(付けたあと・自信なしで記録したあと)なら何もしない
    if (readUnsure()[quizId] === r.date) return false;
    if (r.sure > 0) {
      r.sure -= 1;
      r.moved += 1;
      saveRecent();
      bump(categoryIdOf(q), (tr) => {
        if (tr[SURE] <= 0) return false;
        tr[SURE] -= 1;
        tr[UNSURE] += 1;
        return true;
      });
    }
    setUnsure(quizId, true);
    noteDrill(quizId, src);
    notify(quizId, `unsure`);
    return true;
  }

  // 「勘で当たった」を外す: 付け替えた今日の記録を自信ありに戻す(解き直しの予定はそのまま。3日後にもう一度出るだけ)
  function unmarkUnsure(quizId) {
    const q = quizOf(quizId);
    if (!q) return false;
    const r = recentOf(quizId);
    let changed = false;
    if (r.moved > 0) {
      r.moved -= 1;
      r.sure += 1;
      saveRecent();
      changed = bump(categoryIdOf(q), (tr) => {
        if (tr[UNSURE] <= 0) return false;
        tr[UNSURE] -= 1;
        tr[SURE] += 1;
        return true;
      });
    }
    if (hasOwn(readUnsure(), quizId)) {
      setUnsure(quizId, false);
      changed = true;
    }
    if (changed) notify(quizId, `sure`);
    return changed;
  }

  function isUnsure(quizId) {
    const map = readUnsure();
    return typeof quizId === `string` && hasOwn(map, quizId) && DateUtil.isValid(map[quizId]);
  }

  // { 問題ID: 'YYYY-MM-DD' }(日付として正しいものだけ。分析・バッジでまとめて使う)
  function unsureMap() {
    const map = readUnsure();
    const out = Object.create(null);
    Object.keys(map).forEach((id) => { if (DateUtil.isValid(map[id])) out[id] = map[id]; });
    return out;
  }

  // { 'YYYY-MM-DD': { 分野: [自信あり正解, 自信なし正解, 不正解] } }(整えた写し。古い日・壊れた値は除く)
  function daily() {
    return cleanDaily(Storage.get(DAILY_KEY, {}), today());
  }

  return { record, recordMany, markUnsure, unmarkUnsure, isUnsure, unsureMap, daily, categoryIds, KEEP_DAYS, _internal: { cleanDaily, categoryIdOf } };
})();
