// 合格予測(v12): 最近の4択・模擬試験の分野別の正答率から、宅建士試験(50問)の得点の見込みを幅つきで出す(アプリ独自の推定)
// 保存: Storage `predictPrefs` = { exempt: boolean }(5問免除。登録講習修了者)
// 保存値だけから計算する(弱点分析 Analysis の集計はしない。ホームの最初の表示でも軽いように)
//
// ■ 使う記録と重み(分野ごとに 正解 S・回答 N を重み付きで足す)
//   1. 日付つきの解答の記録 answerDaily(js/answerLog.js。4択・模擬試験の解答。120日分)
//      重み = 0.5^(経過日数 ÷ 30)(30日で半分)。自信なしの正解は 0.5問の正解
//   2. 日付のない4択の記録 quizHistory(問題ごとに最後の ok/ng だけ。v12 より前の記録もここにある)
//      重み 0.3。answerDaily は問題IDを持たないため、「日付つきの記録がない問題」だけを数えるのは近似で行う:
//      分野ごとに「quizHistory の問題数 H − answerDaily の4択画面の解答数 D」(0未満は0)を日付つきの記録がない問題の数とみなし、
//      その数だけ quizHistory のその分野の正答率で足す(4択で解くと quizHistory と answerDaily の両方に入るため、
//      D 問は日付つきの記録で数え済み。同じ問題を何度も解いた分 D が多めになるので、二重に数えない側に倒れる)
//   3. 模擬試験 examHistory(宅建士・フル/ショート。分野別の正解数/問題数)
//      重み = 直近 2・その前 1.5・それ以前 1(新しい順)×(30日で半分)。120日より前の回・日時のない回は使わない。
//      v12 以降の回(entry.unsure が整数 = 解答を answerDaily にも記録済み)は、answerDaily で重み1(×経過)の分を数え済みなので、
//      残り(重み − 1)だけ足す(同じ解答を二重に数えない)。そのぶん 2. の D からも引く
// ■ 計算
//   分野ごとの正答率 p = (S + 2) ÷ (N + 4)(答えが少ないうちは5割に寄せる)
//   見込みの点 = Σ 出題数 n × p(権利14・法令8・税3・業法20・免除5)
//   分散 = Σ [ n p(1−p) + n² p(1−p) ÷ (N + 5) ](当日の出来のばらつき + 正答率の推定の不確かさ)
//   80%の幅 = 見込み ± 1.28 × √分散(0〜50点に収める)
//   5問免除: 免除科目は5問とも正解(5点・ばらつきなし)として数える
// ■ データ不足(status: 'insufficient'): 重み付きの回答数の合計が40未満、または出題5問以上の分野で8未満
//   need = あと何問(今日の解答は重み1。日付のない記録の問題を解き直すと 0.7問分しか増えないため、その分を多めに見込む)、needWhere = どの分野で何問
window.Predict = (function () {
  const HALF_LIFE = 30;
  const WINDOW_DAYS = 120;
  const HISTORY_WEIGHT = 0.3;
  const EXAM_WEIGHTS = [2, 1.5]; // 直近・その前(それ以前は1)
  const UNSURE_CREDIT = 0.5;
  const PRIOR_S = 2;
  const PRIOR_N = 4;
  const MIN_TOTAL = 40;
  const MIN_CAT = 8;
  const MIN_CAT_QUESTIONS = 5; // この出題数以上の分野は、それぞれ MIN_CAT 問ほしい
  const Z80 = 1.28;
  const TOTAL = 50;
  const EXEMPT_CAT = `menjo`;
  const EXEMPT_QUESTIONS = 5;
  const PREFS_KEY = `predictPrefs`;
  // 試験データが読めないときの予備(data/exams.js の例年の出題数と同じ)
  const FALLBACK_CATS = [
    { id: `kenri`, name: `権利関係`, questions: 14 },
    { id: `horei`, name: `法令上の制限`, questions: 8 },
    { id: `zei`, name: `税・価格評定`, questions: 3 },
    { id: `gyoho`, name: `宅建業法`, questions: 20 },
    { id: `menjo`, name: `5問免除科目`, questions: 5 },
  ];
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function isObj(v) {
    return !!v && typeof v === `object` && !Array.isArray(v);
  }

  function cnt(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e6) : 0;
  }

  function validTs(v) {
    return typeof v === `number` && Number.isFinite(v) && v > 0 && v <= 8.64e15;
  }

  function takkenType() {
    return window.Stats && Stats.examType ? Stats.examType(`takken`) : null;
  }

  // 宅建士の分野 [{ id, name, questions }](出題数が数でない分野は除く)
  function categories() {
    const t = takkenType();
    const list = t && Array.isArray(t.categories)
      ? t.categories.filter((c) => c && typeof c.id === `string` && Number.isFinite(c.questions) && c.questions > 0).map((c) => ({ id: c.id, name: c.name, questions: c.questions }))
      : [];
    return list.length ? list : FALLBACK_CATS.map((c) => Object.assign({}, c));
  }

  // ---- 設定(5問免除) ----
  function prefs() {
    const v = Storage.get(PREFS_KEY, {});
    return { exempt: isObj(v) && v.exempt === true };
  }

  // 書く直前に読み直して、ほかの項目を消さない
  function setExempt(on) {
    const v = Storage.get(PREFS_KEY, {});
    const next = Object.assign({}, isObj(v) ? v : {}, { exempt: !!on });
    Storage.set(PREFS_KEY, next);
    return next.exempt;
  }

  // ---- 過去の合格点(data/exams.js の passHistory。RETIO で確かめた値だけ) ----
  function passHistory() {
    const t = takkenType();
    const rows = t && Array.isArray(t.passHistory) ? t.passHistory : [];
    return rows.filter((r) => isObj(r) && typeof r.label === `string` && Number.isInteger(r.score) && r.score > 0 && r.score <= TOTAL)
      .map((r) => ({
        fy: Number.isInteger(r.fy) ? r.fy : null,
        label: r.label,
        score: r.score,
        exemptScore: Number.isInteger(r.exemptScore) && r.exemptScore > 0 && r.exemptScore <= TOTAL - EXEMPT_QUESTIONS ? r.exemptScore : null,
        src: typeof r.src === `string` ? r.src : null,
      }));
  }

  // 比べる合格点の範囲。exempt のときは登録講習修了者の合格点(45問中)を使い、50点満点に直した値(+5点)も付ける
  // { min, max, n, latest: { label, raw, value }, raw: { min, max }, exempt, of: 50|45 }(値がなければ null)
  function passRange(rows, exempt) {
    const list = rows.map((r) => ({ label: r.label, raw: exempt ? r.exemptScore : r.score })).filter((r) => r.raw != null);
    if (!list.length) return null;
    const add = exempt ? EXEMPT_QUESTIONS : 0;
    const raws = list.map((r) => r.raw);
    const last = list[list.length - 1];
    return {
      min: Math.min(...raws) + add,
      max: Math.max(...raws) + add,
      raw: { min: Math.min(...raws), max: Math.max(...raws) },
      n: list.length,
      latest: { label: last.label, raw: last.raw, value: last.raw + add },
      exempt: !!exempt,
      of: exempt ? TOTAL - EXEMPT_QUESTIONS : TOTAL,
    };
  }

  // ---- 4択の分野(問題データが差し替わったら作り直す) ----
  let catCache = null;
  function quizCats() {
    const list = window.APP_DATA && Array.isArray(APP_DATA.quiz) ? APP_DATA.quiz : [];
    if (catCache && catCache.src === list && catCache.n === list.length) return catCache.map;
    const isMc = (q) => (window.QuizEngine && QuizEngine.isMcItem ? QuizEngine.isMcItem(q) : q.format === `mc`);
    const map = Object.create(null);
    list.forEach((q) => {
      if (!q || typeof q.id !== `string` || !isMc(q)) return;
      let c = null;
      try { c = Stats.categoryOf(q, `takken`); } catch (e) { c = null; }
      if (c && typeof c.id === `string`) map[q.id] = c.id;
    });
    catCache = { src: list, n: list.length, map };
    return map;
  }

  function decay(age) {
    return Math.pow(0.5, Math.max(0, age) / HALF_LIFE);
  }

  // 模擬試験の日付(終了 > 開始の日時)
  function examDate(e) {
    const ts = [e.finishedAt, e.startedAt].find(validTs);
    return ts ? DateUtil.format(new Date(ts)) : null;
  }

  // ---- 集計(分野ごとの S・N。出典ごとの N も) ----
  function collect(cats, today) {
    const acc = Object.create(null);
    cats.forEach((c) => { acc[c.id] = { S: 0, N: 0, dated: 0, history: 0, exam: 0, rawDated: 0, undated: 0 }; });
    // 1. 日付つきの記録
    const daily = window.AnswerLog && AnswerLog.daily ? AnswerLog.daily() : {};
    Object.keys(daily).forEach((d) => {
      const age = DateUtil.diffDays(d, today);
      if (!Number.isFinite(age) || age > WINDOW_DAYS) return;
      const w = decay(age);
      const day = daily[d];
      Object.keys(day).forEach((cid) => {
        const a = acc[cid];
        const tr = day[cid];
        if (!a || !Array.isArray(tr)) return;
        const sure = cnt(tr[0]);
        const unsure = cnt(tr[1]);
        const wrong = cnt(tr[2]);
        const n = sure + unsure + wrong;
        a.S += w * (sure + UNSURE_CREDIT * unsure);
        a.N += w * n;
        a.dated += w * n;
        a.rawDated += n;
      });
    });
    // 3. 模擬試験(新しい順)
    const hist = Storage.get(`examHistory`, []);
    const exams = (Array.isArray(hist) ? hist : [])
      .filter((e) => isObj(e) && e.examTypeId === `takken` && isObj(e.byCategory) && examDate(e))
      .map((e) => ({ e, date: examDate(e), t: [e.finishedAt, e.startedAt].find(validTs) }))
      .sort((a, b) => b.t - a.t);
    exams.forEach((x, rank) => {
      const age = DateUtil.diffDays(x.date, today);
      if (!Number.isFinite(age) || age > WINDOW_DAYS) return;
      const w0 = decay(age);
      const recorded = Number.isInteger(x.e.unsure) && x.e.unsure >= 0;
      const w = Math.max(0, (EXAM_WEIGHTS[rank] || 1) - (recorded ? 1 : 0)) * w0;
      // 誤答の一覧(回答したもの)から、分野ごとの「回答した数」を出す(answerDaily に入った数を 2. の D から引くため)
      const wrongAnswered = Object.create(null);
      if (recorded && Array.isArray(x.e.wrong)) {
        x.e.wrong.forEach((wr) => {
          if (isObj(wr) && wr.kind !== `term` && Number.isInteger(wr.chosen) && typeof wr.categoryId === `string`) wrongAnswered[wr.categoryId] = (wrongAnswered[wr.categoryId] || 0) + 1;
        });
      }
      Object.keys(x.e.byCategory).forEach((cid) => {
        const a = acc[cid];
        const v = x.e.byCategory[cid];
        if (!a || !isObj(v)) return;
        const total = cnt(v.total);
        const correct = Math.min(cnt(v.correct), total);
        if (!total) return;
        if (recorded) a.rawDated = Math.max(0, a.rawDated - (correct + (wrongAnswered[cid] || 0)));
        if (!w) return;
        a.S += w * correct;
        a.N += w * total;
        a.exam += w * total;
      });
    });
    // 2. 日付のない4択の記録(日付つきの記録で数えていない分だけ)
    const qh = Storage.get(`quizHistory`, {});
    const unsure = Storage.get(`quizUnsure`, {});
    const map = quizCats();
    const h = Object.create(null);
    if (isObj(qh)) {
      Object.keys(qh).forEach((id) => {
        const r = qh[id];
        if (r !== `ok` && r !== `ng`) return;
        const cid = map[id];
        if (!cid || !acc[cid]) return;
        const b = h[cid] || (h[cid] = { n: 0, s: 0 });
        b.n += 1;
        if (r === `ok`) b.s += isObj(unsure) && hasOwn(unsure, id) && DateUtil.isValid(unsure[id]) ? UNSURE_CREDIT : 1;
      });
    }
    Object.keys(h).forEach((cid) => {
      const a = acc[cid];
      const undated = Math.max(0, h[cid].n - a.rawDated);
      if (!undated) return;
      const rate = h[cid].s / h[cid].n;
      a.S += HISTORY_WEIGHT * undated * rate;
      a.N += HISTORY_WEIGHT * undated;
      a.history += HISTORY_WEIGHT * undated;
      a.undated = undated;
    });
    return acc;
  }

  // あと何問で足りるか(deficit = 足りない重み付きの回答数、undated = 日付のない記録として数えている問題の数)。
  // 日付のない記録がある問題を解き直すと、その問題は日付つきの記録(重み1)に移るだけなので、増えるのは 1 − 0.3 = 0.7問分。
  // どの問題を解くか分からないため、少なく見積もらないよう、まずその分を解き直したとみなして数える
  function answersFor(deficit, undated) {
    if (!(deficit > 1e-9)) return 0;
    const gain = 1 - HISTORY_WEIGHT;
    const u = Math.max(0, Math.floor(undated) || 0);
    if (deficit <= u * gain + 1e-9) return Math.max(1, Math.ceil(deficit / gain - 1e-9));
    return u + Math.max(1, Math.ceil(deficit - u * gain - 1e-9));
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // { status, expected, low, high, sd, need, needWhere, exempt, max, answers, byCat, passHistory, passRange, sources, constants }
  // byCat: [{ cat, label, n, p, expected, low, high, answers, need, fixed }](p は 0〜1、点は出題数 n のうち)
  function estimate(opts) {
    opts = opts || {};
    const today = DateUtil.today();
    const exempt = typeof opts.exempt === `boolean` ? opts.exempt : prefs().exempt;
    const cats = categories();
    const acc = collect(cats, today);
    let expected = 0;
    let variance = 0;
    let answers = 0;
    let need = 0;
    let undatedAll = 0;
    const needWhere = [];
    const sources = { dated: 0, history: 0, exam: 0 };
    const byCat = cats.map((c) => {
      const a = acc[c.id];
      const n = c.questions;
      if (exempt && c.id === EXEMPT_CAT) {
        expected += n;
        return { cat: c.id, label: c.name, n, p: 1, expected: n, low: n, high: n, answers: r1(a.N), need: 0, fixed: true };
      }
      const p = (a.S + PRIOR_S) / (a.N + PRIOR_N);
      const v = n * p * (1 - p) + (n * n * p * (1 - p)) / (a.N + 5);
      expected += n * p;
      variance += v;
      answers += a.N;
      sources.dated += a.dated;
      sources.history += a.history;
      sources.exam += a.exam;
      undatedAll += a.undated;
      const sd = Math.sqrt(v);
      let catNeed = 0;
      if (n >= MIN_CAT_QUESTIONS && a.N < MIN_CAT) {
        catNeed = answersFor(MIN_CAT - a.N, a.undated);
        needWhere.push({ cat: c.id, label: c.name, need: catNeed });
        need += catNeed;
      }
      return {
        cat: c.id, label: c.name, n, p: Math.round(p * 1000) / 1000,
        expected: r1(n * p), low: Math.round(clip(n * p - Z80 * sd, 0, n)), high: Math.round(clip(n * p + Z80 * sd, 0, n)),
        answers: r1(a.N), need: catNeed, fixed: false,
      };
    });
    const totalShort = answers < MIN_TOTAL ? answersFor(MIN_TOTAL - answers, undatedAll) : 0;
    need = Math.max(need, totalShort);
    const sd = Math.sqrt(variance);
    const floor = exempt ? EXEMPT_QUESTIONS : 0;
    let low = Math.round(clip(expected - Z80 * sd, floor, TOTAL));
    let high = Math.round(clip(expected + Z80 * sd, floor, TOTAL));
    const exp1 = r1(clip(expected, floor, TOTAL));
    if (low > exp1) low = Math.floor(exp1);
    if (high < exp1) high = Math.ceil(exp1);
    const ph = passHistory();
    return {
      status: need > 0 ? `insufficient` : `ok`,
      expected: exp1,
      low,
      high,
      sd: r1(sd),
      need,
      needWhere,
      exempt,
      max: TOTAL,
      answers: r1(answers),
      byCat,
      passHistory: ph,
      passRange: passRange(ph, exempt),
      sources: { dated: r1(sources.dated), history: r1(sources.history), exam: r1(sources.exam) },
      constants: { HALF_LIFE, WINDOW_DAYS, HISTORY_WEIGHT, EXAM_WEIGHTS: EXAM_WEIGHTS.slice(), UNSURE_CREDIT, MIN_TOTAL, MIN_CAT, MIN_CAT_QUESTIONS, Z80, EXEMPT_QUESTIONS },
    };
  }

  return { estimate, prefs, setExempt, passHistory, _internal: { collect, categories, passRange, decay } };
})();
