// ○×一問一答: 正誤判定型の4択問題(ask: correct / incorrect)の選択肢を1文ずつ「正しい/誤り」で判定する
// ルート: #ox(条件を選ぶトップ) / #ox/cat/<分野ID>(宅建士の分野ID または shohi) / #ox/topic/<topicId> / #ox/weak(間違えた文)
//         末尾に /<問題数>(10・20・50)を付けると、その問題数で出題する(例: #ox/cat/gyoho/20)
//         #ox/weak/<文ID>(例: quiz-K-01%232)は、間違えた文のうちその文を最初に出題する
//         #ox/quiz/<問題ID,問題ID,…>(模擬試験・解き直しの結果から)は、その4択問題の文だけを出題する(問題は12問まで・文は40問まで)
//         #ox/run(出題中・結果。セッションはメモリ上のみ。再読み込みするとトップに戻る)
// 間違えた文の元の4択は、解き直しの予定(Drill)にも入れる(翌日から #quiz/due に出る)
// ディープリンク(cat/topic/weak)は条件を選んだ状態ですぐ出題を始め、URLを #ox/run に置き換える
// 個数・組合せの問題(v12)は記述ア〜エが「問題ID#s0」〜「#s3」の文として出る(文の前に「ア」などの記号を付ける)
// 記録: Storage `oxStats` = { [文ID 'quiz-K-01#2']: { c: 正解回数, w: 不正解回数, last: 'YYYY-MM-DD', lastOk: 直近の正誤, u?: 「たぶん」で正解した回数 } }
//       (弱点分析でも読むため、この形を変えないこと。u は v12 で追加。1以上のときだけ持ち、c を超えない)
//       Storage `oxPrefs` = { scope, filter, count, autoNext, confidence }(最後に出題を始めた条件と「正解したら自動で次へ」・
//       「自信度も答える」(もちろん○/たぶん○/たぶん×/もちろん× の4つで答える。初期値はオフ))
// 「たぶん」で正解した文の元の4択は、解き直しの予定(Drill.noteUnsure)に3日後で入れる(○×は AnswerLog には記録しない)
window.Views = window.Views || {};
window.Views.ox = (function () {
  const STATS_KEY = `oxStats`;
  const PREFS_KEY = `oxPrefs`;
  const COUNTS = [10, 20, 50];
  const FILTERS = [
    { id: `unanswered`, label: `未回答` },
    { id: `wrong`, label: `間違えたことがある` },
    { id: `all`, label: `すべて` },
  ];
  const SHOHI = `shohi`;
  const PASS_PCT = 70; // 合格の目安(自動生成クイズと共通)
  const AUTO_NEXT_MS = 1200;
  const QUIZ_SCOPE_MAX = 12; // #ox/quiz/<問題ID,…> で受け付ける問題の数
  const QUIZ_SCOPE_ITEMS = 40; // そこから出題する文の数の上限
  // 自信度つきの4つの答え(キー 1〜4)。もちろん○ → たぶん○ → たぶん× → もちろん× の順(キーの 1〜4 と同じ)。
  // 幅のある画面(600px〜)では左からこの順に1列(キーボードの数字の並び・← が○/→ が× と同じ向き)、
  // スマホでは 2×2(左の列に○・右の列に×、上に「もちろん」・下に「たぶん」。ox.css の grid-template-areas)。
  // 読み上げ・Tab の順はどちらもこの順
  const CONF_LEVELS = [
    { level: 1, said: true, sure: true, label: `もちろん` },
    { level: 2, said: true, sure: false, label: `たぶん` },
    { level: 3, said: false, sure: false, label: `たぶん` },
    { level: 4, said: false, sure: true, label: `もちろん` },
  ];
  const CONF_GRID_ORDER = [1, 2, 3, 4];
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  // 画面の再描画をまたいで保持する条件と、進行中のセッション(ページを再読み込みすると消える)
  // 条件は最初の表示のときに oxPrefs から読み込む
  const prefs = { scope: { type: `all`, id: null }, filter: `all`, count: 10, autoNext: false, confidence: false };
  let prefsLoaded = false;
  let session = null;

  // ===== 分野 =====

  function categoriesOf(examTypeId) {
    const t = Stats.examType(examTypeId);
    return t && Array.isArray(t.categories) ? t.categories : [];
  }

  // 分野チップの並び: 宅建士の分野 + 不動産と消費税(税理士試験)
  function scopeCategories() {
    const list = categoriesOf(`takken`).map((c) => ({ id: c.id, name: c.name }));
    const shohi = categoriesOf(`zeirishi`).find((c) => c.id === SHOHI);
    if (shohi) list.push({ id: shohi.id, name: shohi.name });
    return list;
  }

  function categoryName(id) {
    const c = scopeCategories().find((x) => x.id === id);
    return c ? c.name : `その他`;
  }

  // 文に分野を付ける。cats: 該当する分野ID(宅建士の分野と shohi の両方に入ることもある) / cat: 表示・集計用の代表分野
  // quiz: 文の元の4択問題(試験分野が明示されていれば examCats を優先する。null は「その試験の範囲外」)
  function withCategory(s, quiz) {
    const probe = { relatedTermId: s.termId, topicIds: s.topicIds };
    if (quiz && quiz.examCats) probe.examCats = quiz.examCats;
    const t = Stats.categoryOf(probe, `takken`);
    const z = Stats.categoryOf(probe, `zeirishi`);
    const cats = [];
    if (t) cats.push(t.id);
    if (z && z.id === SHOHI) cats.push(SHOHI);
    return Object.assign({}, s, { cats, cat: cats.includes(SHOHI) ? SHOHI : (t ? t.id : null) });
  }

  // 分野を付けた文の一覧(画面を開くたびに何度も使うので覚えておく)。
  // QuizEngine.allStatements() は同じ文のオブジェクトを返すので、先頭・末尾・件数が同じなら作り直さない
  let catCache = null;
  function loadStatements() {
    const src = QuizEngine.allStatements();
    const first = src[0] || null;
    const last = src[src.length - 1] || null;
    if (!catCache || catCache.n !== src.length || catCache.first !== first || catCache.last !== last) {
      const byId = {};
      ((window.APP_DATA && window.APP_DATA.quiz) || []).forEach((q) => { byId[q.id] = q; });
      catCache = { n: src.length, first, last, list: src.map((s) => withCategory(s, byId[s.quizId] || null)) };
    }
    return catCache.list.slice();
  }

  // ===== 記録 =====

  // 壊れた項目(インポートした古いデータ等)は null。回数の上限は弱点分析(Analysis)と揃える
  function cleanEntry(v) {
    if (!Storage.isPlainObject(v)) return null;
    const c = Number.isFinite(v.c) && v.c > 0 ? Math.min(Math.floor(v.c), 100000) : 0;
    const w = Number.isFinite(v.w) && v.w > 0 ? Math.min(Math.floor(v.w), 100000) : 0;
    if (!c && !w) return null;
    const out = {
      c,
      w,
      last: DateUtil.isValid(v.last) ? v.last : ``,
      lastOk: typeof v.lastOk === `boolean` ? v.lastOk : w === 0,
    };
    // 「たぶん」で正解した回数(v12)。正解回数を超えない。0 のときは持たない(それまでの記録の形を変えないため)
    const u = Number.isFinite(v.u) && v.u > 0 ? Math.min(Math.floor(v.u), c) : 0;
    if (u) out.u = u;
    return out;
  }

  function loadStats() {
    const raw = Storage.get(STATS_KEY, {});
    const out = {};
    Object.keys(raw).forEach((id) => {
      const e = cleanEntry(raw[id]);
      if (e) out[id] = e;
    });
    return out;
  }

  // unsure: 自信度つきで「たぶん」と答えた(正解のときだけ u に数える)
  function recordAnswer(statementId, ok, unsure) {
    const all = loadStats();
    const prev = all[statementId] || { c: 0, w: 0 };
    const entry = { c: prev.c + (ok ? 1 : 0), w: prev.w + (ok ? 0 : 1), last: DateUtil.today(), lastOk: !!ok };
    const u = (prev.u || 0) + (ok && unsure ? 1 : 0);
    if (u) entry.u = u;
    all[statementId] = entry;
    Storage.set(STATS_KEY, all);
    return all[statementId];
  }

  // ===== 保存する条件(oxPrefs) =====

  function validScope(sc) {
    if (!Storage.isPlainObject(sc)) return null;
    if (sc.type === `all`) return { type: `all`, id: null };
    if (sc.type === `cat` && scopeCategories().some((c) => c.id === sc.id)) return { type: `cat`, id: sc.id };
    if (sc.type === `topic` && typeof sc.id === `string` && AppIndex.topicsById[sc.id]) return { type: `topic`, id: sc.id };
    return null;
  }

  // 保存した条件(インポートした古い・壊れた値は使わない)
  function loadSavedPrefs() {
    const raw = Storage.get(PREFS_KEY, {});
    return {
      scope: validScope(raw.scope),
      filter: FILTERS.some((f) => f.id === raw.filter) ? raw.filter : null,
      count: COUNTS.includes(raw.count) ? raw.count : null,
      autoNext: raw.autoNext === true,
      confidence: raw.confidence === true,
    };
  }

  function ensurePrefs() {
    if (prefsLoaded) return;
    prefsLoaded = true;
    const s = loadSavedPrefs();
    if (s.scope) prefs.scope = s.scope;
    if (s.filter) prefs.filter = s.filter;
    if (s.count) prefs.count = s.count;
    prefs.autoNext = s.autoNext;
    prefs.confidence = s.confidence;
  }

  // 前回出題を始めた条件(「前回の条件で開始」用)。なければ null
  function lastStarted() {
    const s = loadSavedPrefs();
    return s.scope && s.filter && s.count ? s : null;
  }

  function saveStartedPrefs() {
    Storage.set(PREFS_KEY, { scope: Object.assign({}, prefs.scope), filter: prefs.filter, count: prefs.count, autoNext: prefs.autoNext, confidence: prefs.confidence });
  }

  function saveAutoNext(on) {
    prefs.autoNext = !!on;
    Storage.set(PREFS_KEY, Object.assign({}, Storage.get(PREFS_KEY, {}), { autoNext: prefs.autoNext }));
  }

  function saveConfidence(on) {
    prefs.confidence = !!on;
    Storage.set(PREFS_KEY, Object.assign({}, Storage.get(PREFS_KEY, {}), { confidence: prefs.confidence }));
  }

  // ===== 出題の組み立て =====

  function inScope(s, scope) {
    if (!scope || scope.type === `all`) return true;
    if (scope.type === `cat`) return s.cats.includes(scope.id);
    if (scope.type === `topic`) return (s.topicIds || []).includes(scope.id);
    if (scope.type === `quiz`) return Array.isArray(scope.ids) && scope.ids.includes(s.quizId);
    return false;
  }

  // #ox/quiz/<問題ID,…> の問題ID: ○×の文を作れる(正誤判定型の4択・個数・組合せの)ものだけ、重複なし・上限まで
  function quizScopeIds(list) {
    const src = Array.isArray(list) ? list : String(list || ``).split(`,`);
    const out = [];
    src.forEach((raw) => {
      const id = typeof raw === `string` ? raw.trim() : ``;
      if (!id || out.includes(id) || out.length >= QUIZ_SCOPE_MAX) return;
      const q = quizById(id);
      if (q && QuizEngine.hasStatements(q)) out.push(id);
    });
    return out;
  }

  // ほかの画面から: その4択問題の○×へのリンク(出せる文がなければ null)
  function quizNav(ids) {
    const ok = quizScopeIds(ids);
    return ok.length ? `#ox/quiz/${ok.map(encodeURIComponent).join(`,`)}` : null;
  }

  // 指定した4択問題の文だけでセッションを作る(条件 prefs は変えない)。出せる文がなければ false
  function startQuizScope(ids, fromLanding) {
    const set = new Set(ids);
    const pool = loadStatements().filter((s) => set.has(s.quizId));
    if (!pool.length) return false;
    const items = spreadByQuiz(QuizEngine.shuffle(pool).slice(0, QUIZ_SCOPE_ITEMS));
    session = createSession(items, { scope: { type: `quiz`, id: null, ids: ids.slice() }, filter: `all`, count: items.length, label: `間違えた問題の論点(${ids.length}問分)`, fromLanding: !!fromLanding });
    return true;
  }

  function matchesFilter(s, filter, stats) {
    const e = stats[s.id];
    if (filter === `unanswered`) return !e;
    if (filter === `wrong`) return !!e && e.w > 0;
    return true;
  }

  function buildPool(statements, scope, filter, stats) {
    return statements.filter((s) => inScope(s, scope) && matchesFilter(s, filter, stats));
  }

  // 「間違えたことがある」の出題順: 前回まちがえた文 → (不正解 − 正解)の多い順 → ランダム
  function weakOrder(list, stats) {
    return list
      .map((s) => {
        const e = stats[s.id];
        return { s, ng: e && !e.lastOk ? 1 : 0, d: e ? e.w - e.c : 0, r: Math.random() };
      })
      .sort((a, b) => (b.ng - a.ng) || (b.d - a.d) || (a.r - b.r))
      .map((x) => x.s);
  }

  // 同じ4択問題の文が連続すると正誤を推測しやすいため、できるだけ離す
  // (元の並びをなるべく保つ: 前から順に「直前と別の問題」の文を取り、残りが同じ問題だけなら前方の隙間に差し込む)
  function spreadByQuiz(list) {
    const rest = list.slice();
    const out = [];
    while (rest.length) {
      const last = out.length ? out[out.length - 1].quizId : null;
      let k = rest.findIndex((x) => x.quizId !== last);
      if (k < 0) k = 0;
      const x = rest.splice(k, 1)[0];
      if (out.length && x.quizId === last) {
        const p = out.findIndex((y, i) => i > 0 && out[i - 1].quizId !== x.quizId && y.quizId !== x.quizId);
        if (p > 0) { out.splice(p, 0, x); continue; }
        if (out[0].quizId !== x.quizId) { out.unshift(x); continue; }
      }
      out.push(x);
    }
    return out;
  }

  // avoidIds: 直前のセッションで出た文(「同じ条件で続ける」で後回しにする)
  // first: 最初に出題する文(弱点分析で選んだ文。#ox/weak/<文ID>)
  function pickQuestions(pool, filter, count, stats, avoidIds, first) {
    let ordered = filter === `wrong` ? weakOrder(pool, stats) : QuizEngine.shuffle(pool);
    if (avoidIds && avoidIds.size) {
      ordered = ordered.filter((s) => !avoidIds.has(s.id)).concat(ordered.filter((s) => avoidIds.has(s.id)));
    }
    if (first) ordered = [first].concat(ordered.filter((s) => s.id !== first.id));
    const picked = spreadByQuiz(ordered.slice(0, count));
    if (first && picked[0] !== first) {
      picked.splice(picked.indexOf(first), 1);
      picked.unshift(first);
    }
    return picked;
  }

  // ===== ルート =====

  // 問題数の指定(10・20・50 以外は無視して、選んである問題数で出題する)
  function countParam(s) {
    const n = Number(s);
    return COUNTS.includes(n) ? n : null;
  }

  function parseParam(param) {
    if (!param) return { kind: `landing` };
    const parts = String(param).split(`/`);
    const head = parts[0];
    const id = parts[1] || ``;
    if (head === `run`) return { kind: `run` };
    if (head === `weak`) {
      const count = countParam(id);
      return { kind: `start`, scope: { type: `all`, id: null }, filter: `wrong`, count, first: !count && id ? id : null };
    }
    if (head === `cat` && scopeCategories().some((c) => c.id === id)) return { kind: `start`, scope: { type: `cat`, id }, filter: `all`, count: countParam(parts[2]) };
    if (head === `topic` && AppIndex.topicsById[id]) return { kind: `start`, scope: { type: `topic`, id }, filter: `all`, count: countParam(parts[2]) };
    if (head === `quiz`) {
      const ids = quizScopeIds(id);
      if (ids.length) return { kind: `quiz`, ids };
    }
    return { kind: `landing`, invalid: true };
  }

  function scopeLabel(scope) {
    if (!scope || scope.type === `all`) return `すべての分野`;
    if (scope.type === `cat`) return categoryName(scope.id);
    if (scope.type === `quiz`) return `間違えた問題の論点`;
    const t = AppIndex.topicsById[scope.id];
    return t ? t.name : `トピック`;
  }

  function filterLabel(filter) {
    const f = FILTERS.find((x) => x.id === filter);
    return f ? f.label : ``;
  }

  function conditionLabel(scope, filter) {
    return `${scopeLabel(scope)}・${filterLabel(filter)}`;
  }

  // ===== セッション =====

  function createSession(items, opts) {
    return {
      items,
      index: 0,
      answers: [], // [{ id, said: true(○)/false(×), ok }]
      graded: {}, // 「もう一度」を付けた用語(1セッション1回まで)
      scope: Object.assign({}, opts.scope),
      filter: opts.filter,
      count: opts.count,
      label: opts.label || conditionLabel(opts.scope, opts.filter),
      retry: !!opts.retry,
      // トップの「開始」から始めたか(1つ前の履歴がトップ。1問も答えずに終了したら履歴を戻る)
      fromLanding: !!opts.fromLanding,
      finished: false,
      quit: false,
      prior: loadStats(), // 開始時点の記録(「前回」表示用)
    };
  }

  // 現在の条件(prefs)でセッションを作る。条件に合う文が無ければ false
  // firstId: 最初に出題する文のID(条件に合わなくても、存在する文なら先頭に入れる)
  function startFromPrefs(avoidIds, firstId) {
    const stats = loadStats();
    const statements = loadStatements();
    const pool = buildPool(statements, prefs.scope, prefs.filter, stats);
    const first = firstId ? statements.find((s) => s.id === firstId) || null : null;
    if (!pool.length && !first) return false;
    session = createSession(pickQuestions(pool, prefs.filter, prefs.count, stats, avoidIds, first), { scope: prefs.scope, filter: prefs.filter, count: prefs.count });
    return true;
  }

  // 現在の文に回答する(記録・ストリーク・間違えたら用語をSRSの「もう一度」へ)。戻り値 { ok, review, unsure, drillAdded }
  // level: 自信度つきで答えたときの 1〜4(もちろん○・たぶん○・たぶん×・もちろん×)。通常の○×では省略
  function answerCurrent(sess, saidTrue, level) {
    const s = sess.items[sess.index];
    if (!s || sess.answers[sess.index]) return null;
    const conf = CONF_LEVELS.find((x) => x.level === level) || null;
    if (conf) saidTrue = conf.said;
    const ok = s.truth === !!saidTrue;
    const unsure = !!conf && !conf.sure;
    // 「たぶん」で正解した文は、元の4択を3日後の解き直しに入れる(1日の上限に達していれば入れない)
    let drillAdded = false;
    if (ok && unsure && window.Drill && typeof Drill.noteUnsure === `function`) {
      try { drillAdded = Drill.noteUnsure(s.quizId, `ox`) === true; } catch (e) { console.error(`[解き直し] 記録できませんでした`, e); }
    }
    sess.answers[sess.index] = { id: s.id, said: !!saidTrue, ok, level: conf ? conf.level : null, unsure, drillAdded };
    recordAnswer(s.id, ok, unsure);
    if (window.Streak) Streak.recordToday();
    const termOk = !!(s.termId && AppIndex.termsById[s.termId]);
    if (!ok && termOk && !sess.graded[s.termId]) {
      sess.graded[s.termId] = true;
      // 学習記録(ストリーク)は上で付けているので、ここでは数えない
      Srs.grade(s.termId, 1, { silent: true });
    }
    // 解き直しの予定: 間違えた文の元の4択を翌日から出し直す(同じ日に何度間違えても登録は1回)
    if (!ok && window.Drill) {
      try { Drill.noteWrong(s.quizId, `ox`); } catch (e) { console.error(`[解き直し] 記録できませんでした`, e); }
    }
    return { ok, review: !ok && termOk, unsure, drillAdded };
  }

  function answeredCount(sess) {
    return sess.answers.filter(Boolean).length;
  }

  function summarize(sess) {
    let answered = 0;
    let correct = 0;
    let unsure = 0; // 「たぶん」で正解した数(自信度つきで答えたときだけ)
    let unsureAdded = 0; // そのうち元の4択を解き直しに入れた数
    const byCat = {};
    const cats = [];
    const wrong = [];
    sess.items.forEach((s, i) => {
      const a = sess.answers[i];
      if (!a) return;
      answered += 1;
      if (a.ok) correct += 1;
      else wrong.push(s);
      if (a.ok && a.unsure) unsure += 1;
      if (a.drillAdded) unsureAdded += 1;
      const key = s.cat || `other`;
      if (!byCat[key]) {
        byCat[key] = { id: key, name: s.cat ? categoryName(s.cat) : `その他`, total: 0, correct: 0 };
        cats.push(byCat[key]);
      }
      byCat[key].total += 1;
      if (a.ok) byCat[key].correct += 1;
    });
    const order = scopeCategories().map((c) => c.id);
    const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
    cats.sort((a, b) => rank(a.id) - rank(b.id));
    return { total: sess.items.length, answered, correct, unsure, unsureAdded, cats, wrong };
  }

  // ===== 表示用の補助 =====

  function quizById(id) {
    return (window.APP_DATA.quiz || []).find((q) => q.id === id) || null;
  }

  // 元の4択問題の問いかけから「〜に関する記述(民法の規定によれば)」の形で前提を取り出す(QuizEngine と共通)
  function contextOf(question) {
    return QuizEngine.stemContext(question);
  }

  function contextFor(s) {
    if (typeof s.context === `string`) return s.context;
    const quiz = quizById(s.quizId);
    return contextOf(quiz && quiz.question);
  }

  // 用語へのリンク: トピックの基礎知識チェックリストにあればトピック内へ、なければ用語集へ
  function termLink(termId, topicIds) {
    const term = termId ? AppIndex.termsById[termId] : null;
    if (!term) return null;
    const has = (t) => !!t && Array.isArray(t.basicIds) && t.basicIds.includes(term.id);
    const topic = (topicIds || []).map((id) => AppIndex.topicsById[id]).find(has) || (window.APP_DATA.topics || []).find(has);
    return { href: topic ? `#topics/${topic.id}/${term.id}` : `#glossary/${term.id}`, name: term.name, id: term.id };
  }

  // 用語のリンクは出題画面を離れずにシートで開く(href は長押し・新しいタブ用に残す)
  function onTermLinkClick(e) {
    const a = e.target && e.target.closest ? e.target.closest(`a[data-term-sheet]`) : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.Views.quiz && Views.quiz.openTermSheet && Views.quiz.openTermSheet(a.dataset.termSheet)) e.preventDefault();
  }

  function streakLineHtml() {
    return window.Views.quiz && Views.quiz.streakLineHtml ? Views.quiz.streakLineHtml() : ``;
  }

  // 「誤りを報告」(○×の文ごと。報告フォームが未設定なら出さない)
  function reportMetaHtml(s, quiz) {
    const R = window.Report;
    try {
      if (!R || typeof R.enabled !== `function` || !R.enabled()) return ``;
      const o = { kind: `ox`, id: s.id, title: s.text, location: `#quiz/q/${s.quizId}` };
      const asOf = quiz && quiz.asOf;
      if (typeof R.metaHtml === `function`) return R.metaHtml(o, { asOf });
      const linkHtml = typeof R.linkHtml === `function` ? R.linkHtml(o) : ``;
      return linkHtml ? `<p class="item-meta"><span>${esc(typeof R.asOfText === `function` ? R.asOfText(asOf) : ``)}</span>${linkHtml}</p>` : ``;
    } catch (e) { return ``; }
  }

  function termLinkBtnHtml(s) {
    const link = termLink(s.termId, s.topicIds);
    return link ? `<a class="link-btn" href="${link.href}" data-term-sheet="${link.id}">${ic(`layers`, 14)}用語を確認</a>` : ``;
  }

  function markSvg(kind, cls) {
    const body = kind === `o`
      ? `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/>`
      : `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`;
    return `<svg class="ox-glyph ox-glyph-${kind}${cls ? ` ${cls}` : ``}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function truthHtml(truth) {
    return `<span class="ox-truth-mark">${markSvg(truth ? `o` : `x`, `ox-glyph-inline`)}<strong>${truth ? `正しい` : `誤り`}</strong></span>`;
  }

  // 個数・組合せの問題の記述(s.sub)は、文の前に「ア」などの記号を付ける(読み上げは「記述ア」)
  function stmtLabelHtml(s) {
    return s && s.sub && s.label ? `<span class="stmt-label ox-stmt-label"><span class="sr-only">記述</span>${esc(s.label)}<span class="sr-only">、</span></span>` : ``;
  }

  function keysHintHtml(confidence) {
    if (confidence) {
      return `<p class="ox-keys">キーボード: <kbd>1</kbd>〜<kbd>4</kbd> でもちろん○・たぶん○・たぶん×・もちろん× / <kbd>O</kbd>・<kbd>←</kbd> でもちろん○ / <kbd>X</kbd>・<kbd>→</kbd> でもちろん× / <kbd>Enter</kbd> で次へ</p>`;
    }
    return `<p class="ox-keys">キーボード: <kbd>O</kbd>・<kbd>1</kbd>・<kbd>←</kbd> で○ / <kbd>X</kbd>・<kbd>2</kbd>・<kbd>→</kbd> で× / <kbd>Enter</kbd> で次へ</p>`;
  }

  // 答えのボタン。自信度つきは 1 もちろん○・2 たぶん○・3 たぶん×・4 もちろん× の4つ(並べ方は CONF_LEVELS の説明と ox.css)
  function answerRowHtml(confidence) {
    if (!confidence) {
      return `<div class="ox-answer-row" role="group" aria-label="この文は正しいか、誤りか">
          <button type="button" class="ox-btn ox-btn-o" data-answer="o" aria-keyshortcuts="O 1 ArrowLeft">${markSvg(`o`)}<span class="ox-btn-label">正しい</span></button>
          <button type="button" class="ox-btn ox-btn-x" data-answer="x" aria-keyshortcuts="X 2 ArrowRight">${markSvg(`x`)}<span class="ox-btn-label">誤り</span></button>
        </div>`;
    }
    const btn = (lv) => {
      const c = CONF_LEVELS.find((x) => x.level === lv);
      const keys = lv === 1 ? `1 O ArrowLeft` : lv === 4 ? `4 X ArrowRight` : String(lv);
      return `<button type="button" class="ox-btn ox-btn-conf ${c.said ? `ox-btn-o` : `ox-btn-x`} ${c.sure ? `is-sure` : `is-maybe`}" data-level="${lv}" aria-keyshortcuts="${keys}">
          <span class="ox-btn-key" aria-hidden="true">${lv}</span>${markSvg(c.said ? `o` : `x`)}<span class="ox-btn-label">${c.label}<span class="sr-only">${c.said ? `正しい` : `誤り`}</span></span>
        </button>`;
    };
    return `<div class="ox-answer-row is-conf" role="group" aria-label="この文は正しいか、誤りか(自信の度合いも選ぶ)">
        ${CONF_GRID_ORDER.map(btn).join(``)}
      </div>`;
  }

  function focusEl(el) {
    if (!el) return;
    if (!el.hasAttribute(`tabindex`) && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute(`tabindex`, `-1`);
    el.focus({ preventScroll: true });
  }

  // ===== キーボード =====

  // ctx.run: 出題中だけ { answered(), answer(saidTrue), next() } が入る
  function bindKeys(wrap, ctx) {
    function cleanup() {
      document.removeEventListener(`keydown`, onKey);
      window.removeEventListener(`hashchange`, onHash);
    }
    function onHash() {
      if (!wrap.isConnected) cleanup();
    }
    function onKey(e) {
      if (!wrap.isConnected) { cleanup(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      const ae = document.activeElement;
      if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
      const run = ctx.run;
      if (!run) return;
      const k = e.key;
      if (!run.answered()) {
        if (run.confidence) {
          // 自信度つき: 1〜4 で4つのどれか。O・← / X・→ は「もちろん」の○ / ×
          if (/^[1-4]$/.test(k)) { e.preventDefault(); run.answer(null, Number(k)); }
          else if (k === `o` || k === `O` || k === `ArrowLeft`) { e.preventDefault(); run.answer(null, 1); }
          else if (k === `x` || k === `X` || k === `ArrowRight`) { e.preventDefault(); run.answer(null, 4); }
          return;
        }
        if (k === `o` || k === `O` || k === `1` || k === `ArrowLeft`) { e.preventDefault(); run.answer(true); }
        else if (k === `x` || k === `X` || k === `2` || k === `ArrowRight`) { e.preventDefault(); run.answer(false); }
        return;
      }
      if (k === `Enter` || k === ` ` || k === `Spacebar`) {
        // ボタンやリンクの上ではブラウザ標準の動作(クリック)に任せる
        if (e.target && e.target.closest && e.target.closest(`button, a, summary, [role="button"]`)) return;
        e.preventDefault();
        run.next();
      }
    }
    document.addEventListener(`keydown`, onKey);
    window.addEventListener(`hashchange`, onHash);
  }

  // ===== 描画: 入口 =====

  function render(root, param) {
    ensurePrefs();
    const wrap = document.createElement(`div`);
    wrap.className = `view ox-view`;
    root.appendChild(wrap);
    const ctx = { run: null };
    bindKeys(wrap, ctx);
    wrap.addEventListener(`click`, onTermLinkClick);

    const route = parseParam(param);
    if (route.kind === `run`) {
      if (session) {
        if (session.finished) renderSummary(wrap, ctx);
        else renderRun(wrap, ctx);
        return;
      }
      history.replaceState(null, ``, `#ox`);
      renderLanding(wrap, ctx);
      return;
    }
    if (route.kind === `quiz`) {
      // 4択問題を指定した出題: 条件(prefs)は変えずに始め、URLを #ox/run に置き換える(戻るでリンク元へ)
      if (startQuizScope(route.ids, false)) {
        history.replaceState(null, ``, `#ox/run`);
        renderRun(wrap, ctx);
        return;
      }
      history.replaceState(null, ``, `#ox`);
      renderLanding(wrap, ctx, { notice: `指定された問題の○×がまだないため、出題を始められませんでした。` });
      return;
    }
    if (route.kind === `start`) {
      prefs.scope = route.scope;
      prefs.filter = route.filter;
      if (route.count) prefs.count = route.count;
      if (startFromPrefs(null, route.first)) {
        // 戻る操作でリンク元に戻れるよう、履歴を増やさずに出題中のURLへ置き換える
        history.replaceState(null, ``, `#ox/run`);
        renderRun(wrap, ctx);
        return;
      }
      history.replaceState(null, ``, `#ox`);
      renderLanding(wrap, ctx, { notice: emptyNotice(route) });
      return;
    }
    if (route.invalid) history.replaceState(null, ``, `#ox`);
    renderLanding(wrap, ctx, { notice: route.invalid ? `リンク先の分野・トピックが見つかりませんでした。条件を選んで始めてください。` : `` });
  }

  function emptyNotice(route) {
    if (!loadStatements().length) return ``;
    if (route.filter === `wrong`) return `間違えた文がまだないため、出題を始められませんでした。「すべて」か「未回答」を選んで解いてみましょう。`;
    return `「${scopeLabel(route.scope)}」の○×問題がまだないため、出題を始められませんでした。`;
  }

  // ===== 描画: トップ(条件の選択) =====

  function renderLanding(wrap, ctx, opts) {
    opts = opts || {};
    ctx.run = null;
    const statements = loadStatements();
    const stats = loadStats();
    const total = statements.length;
    let answered = 0;
    let c = 0;
    let w = 0;
    statements.forEach((s) => {
      const e = stats[s.id];
      if (!e) return;
      answered += 1;
      c += e.c;
      w += e.w;
    });
    const acc = c + w ? Math.round((c / (c + w)) * 100) : null;
    // 最後の文に答えたあと結果を見ずに離れた場合も、ここから結果を開けるようにする
    const resumable = !!session && !session.finished;
    const allAnswered = resumable && answeredCount(session) >= session.items.length;
    // 前回出題を始めた条件(1タップで始められるよう、条件の選択より上に出す)
    const last = lastStarted();
    const lastPool = last ? buildPool(statements, last.scope, last.filter, stats).length : 0;

    wrap.innerHTML = `
      <div class="view-head">
        <h2>○×一問一答</h2>
        <button type="button" class="btn btn-icon view-info-btn" data-role="view-info" aria-label="○×一問一答について" aria-haspopup="dialog">${ic(`info`, 20)}</button>
      </div>
      ${resumable ? `
        <div class="card ox-resume">
          <span class="ox-resume-icon">${ic(`o-x`, 22)}</span>
          <div class="ox-resume-main">
            <p class="ox-resume-title">${allAnswered ? `解き終わったセッション` : `続きから`}</p>
            <p class="ox-resume-meta">${esc(session.label)}・${allAnswered
              ? `<span class="num">${session.items.length}</span>問すべて回答済み`
              : `<span class="num">${session.index + 1} / ${session.items.length}</span>問目`}</p>
          </div>
          ${allAnswered
            ? `<button type="button" class="btn" data-role="show-result">${ic(`flag`)}結果を見る</button>`
            : `<a class="btn" href="#ox/run">${ic(`play`)}再開</a>`}
        </div>` : ``}
      ${total && last && lastPool && !resumable ? `
        <button type="button" class="btn btn-lg btn-block ox-quick" data-role="quick" aria-label="前回の条件で開始(${esc(scopeLabel(last.scope))}・${esc(filterLabel(last.filter))}・${Math.min(lastPool, last.count)}問)">
          ${ic(`play`)}<span class="ox-quick-text"><span>前回の条件で開始</span><span class="ox-quick-meta">${esc(scopeLabel(last.scope))}・${esc(filterLabel(last.filter))}・${Math.min(lastPool, last.count)}問</span></span>
        </button>` : ``}
      ${opts.notice ? `<p class="ox-notice" role="status">${ic(`info`)}<span>${esc(opts.notice)}</span></p>` : ``}
      ${total ? `
        <section class="card ox-setup" aria-labelledby="ox-setup-title">
          <h3 class="ox-setup-title" id="ox-setup-title">出題の条件</h3>
          <p class="ox-label" id="ox-scope-label">分野</p>
          <div class="chip-row ox-scope" role="group" aria-labelledby="ox-scope-label" data-role="scope"></div>
          <p class="ox-label" id="ox-filter-label">出題する文</p>
          <div class="segmented ox-filter" role="group" aria-labelledby="ox-filter-label" data-role="filter"></div>
          <p class="ox-label" id="ox-count-label">問題数</p>
          <div class="segmented ox-count" role="group" aria-labelledby="ox-count-label" data-role="count"></div>
          <p class="ox-setup-note" data-role="note" aria-live="polite"></p>
          <button type="button" class="btn btn-lg btn-block" data-role="start"></button>
          <label class="check-inline ox-auto-next"><input type="checkbox" data-role="auto-next"${prefs.autoNext ? ` checked` : ``}>正解したら自動で次へ(約1秒後)</label>
          <label class="check-inline ox-auto-next ox-confidence-toggle"><input type="checkbox" data-role="confidence" aria-describedby="ox-confidence-help"${prefs.confidence ? ` checked` : ``}>自信度も答える(もちろん/たぶん)</label>
          <p class="ox-confidence-help" id="ox-confidence-help">「たぶん」で正解した文の元の4択は、3日後の解き直しに出します。</p>
        </section>
        <div class="stat-grid ox-stats">
          <div class="stat-tile"><span class="stat-value num">${total}<small>文</small></span><span class="stat-label">収録</span></div>
          <div class="stat-tile"><span class="stat-value num">${answered}<small>文</small></span><span class="stat-label">回答済み</span></div>
          <div class="stat-tile"><span class="stat-value num">${acc == null ? `—` : `${acc}<small>%</small>`}</span><span class="stat-label">正答率</span></div>
        </div>
        <div data-role="keys">${keysHintHtml(prefs.confidence)}</div>` : ``}
    `;

    // 画面の説明は ⓘ のシートで(「開始」を最初の画面に収めるため)
    wrap.querySelector(`[data-role="view-info"]`).addEventListener(`click`, () => UI.sheet({
      title: `○×一問一答について`,
      content: `<div class="view-info">
        <p>4択問題の選択肢を1文ずつ、正しい(○)か誤り(×)かで判定します。個数問題・組合せ問題の記述ア〜エも出題します。</p>
        <p>間違えた文の用語は「<a href="#review">今日の復習</a>」に自動で追加されます。「間違えたことがある」を選ぶと、前回間違えた文から順に解き直せます。</p>
        <p>「自信度も答える」をオンにすると、もちろん○・たぶん○・たぶん×・もちろん× の4つで答えます。「たぶん」で正解した文の元の4択は、3日後の解き直しに出ます。</p>
        <p class="view-info-keys">キーボード: <kbd>O</kbd>・<kbd>1</kbd>・<kbd>←</kbd> で○ / <kbd>X</kbd>・<kbd>2</kbd>・<kbd>→</kbd> で× / <kbd>Enter</kbd> で次へ(自信度つきは <kbd>1</kbd>〜<kbd>4</kbd>)</p>
      </div>`,
    }));

    const resultBtn = wrap.querySelector(`[data-role="show-result"]`);
    if (resultBtn) {
      resultBtn.addEventListener(`click`, () => {
        if (!session) return;
        session.finished = true;
        Router.navigate(`#ox/run`);
      });
    }

    if (!total) {
      wrap.appendChild(UI.emptyState({
        icon: `o-x`,
        title: `○×で出題できる文はまだありません`,
        body: `「正しいもの/誤っているものはどれか」形式の4択問題が追加されると、その選択肢がここで1文ずつ出題されます。それまでは4択の確認問題で練習できます。`,
        cta: { label: `クイズへ`, nav: `#quiz` },
      }));
      return;
    }

    // トピック指定で来た場合だけ、そのトピックのチップを追加する
    const topicScope = prefs.scope.type === `topic` && AppIndex.topicsById[prefs.scope.id] ? prefs.scope.id : null;
    if (prefs.scope.type === `topic` && !topicScope) prefs.scope = { type: `all`, id: null };
    const scopeOptions = [{ key: `all`, scope: { type: `all`, id: null }, label: `すべて` }]
      .concat(scopeCategories().map((cat) => ({ key: `cat:${cat.id}`, scope: { type: `cat`, id: cat.id }, label: cat.name })))
      .concat(topicScope ? [{ key: `topic:${topicScope}`, scope: { type: `topic`, id: topicScope }, label: `トピック: ${AppIndex.topicsById[topicScope].name}` }] : []);
    scopeOptions.forEach((o) => { o.count = statements.filter((s) => inScope(s, o.scope)).length; });
    const keyOf = (scope) => (scope.type === `all` ? `all` : `${scope.type}:${scope.id}`);

    const scopeEl = wrap.querySelector(`[data-role="scope"]`);
    const filterEl = wrap.querySelector(`[data-role="filter"]`);
    const countEl = wrap.querySelector(`[data-role="count"]`);
    const noteEl = wrap.querySelector(`[data-role="note"]`);
    const startBtn = wrap.querySelector(`[data-role="start"]`);

    scopeEl.innerHTML = scopeOptions.map((o) => `
      <button type="button" class="chip ox-scope-chip" data-scope="${esc(o.key)}" aria-pressed="false">
        <span>${esc(o.label)}</span><span class="ox-chip-count num">${o.count}<span class="sr-only">文</span></span>
      </button>`).join(``);
    filterEl.innerHTML = FILTERS.map((f) => `
      <button type="button" class="segmented-item" data-filter="${f.id}" aria-pressed="false">
        <span>${f.label}</span><span class="segmented-count num" data-role="fcount"></span>
      </button>`).join(``);
    countEl.innerHTML = COUNTS.map((n) => `<button type="button" class="segmented-item" data-count="${n}" aria-pressed="false">${n}問</button>`).join(``);

    function paint() {
      const curKey = keyOf(prefs.scope);
      scopeEl.querySelectorAll(`[data-scope]`).forEach((b) => {
        const o = scopeOptions.find((x) => x.key === b.dataset.scope);
        const on = b.dataset.scope === curKey;
        b.setAttribute(`aria-pressed`, String(on));
        b.disabled = !on && o.count === 0;
      });
      const inScopeList = statements.filter((s) => inScope(s, prefs.scope));
      filterEl.querySelectorAll(`[data-filter]`).forEach((b) => {
        b.setAttribute(`aria-pressed`, String(b.dataset.filter === prefs.filter));
        b.querySelector(`[data-role="fcount"]`).textContent = `${inScopeList.filter((s) => matchesFilter(s, b.dataset.filter, stats)).length}文`;
      });
      countEl.querySelectorAll(`[data-count]`).forEach((b) => b.setAttribute(`aria-pressed`, String(Number(b.dataset.count) === prefs.count)));

      const poolSize = inScopeList.filter((s) => matchesFilter(s, prefs.filter, stats)).length;
      const n = Math.min(poolSize, prefs.count);
      startBtn.disabled = poolSize === 0;
      startBtn.innerHTML = `${ic(`play`)}${poolSize ? `開始(${n}問)` : `開始`}`;
      noteEl.classList.toggle(`is-empty`, poolSize === 0);
      const where = prefs.scope.type === `all` ? `` : `この分野の`;
      if (!inScopeList.length) noteEl.textContent = `この分野の○×問題はまだありません。ほかの分野を選んでください。`;
      else if (!poolSize && prefs.filter === `unanswered`) noteEl.textContent = `${where}文はすべて回答済みです。「すべて」か「間違えたことがある」を選んでください。`;
      else if (!poolSize) noteEl.textContent = `${where || `まだ`}間違えた文はありません。`;
      else noteEl.textContent = `条件に合う${poolSize}文から${n}問を${prefs.filter === `wrong` ? `、前回間違えた文から順に` : `ランダムに`}出題します。`;
    }

    function begin() {
      if (!startFromPrefs()) return false;
      session.fromLanding = true;
      saveStartedPrefs();
      Router.navigate(`#ox/run`);
      return true;
    }

    const quickBtn = wrap.querySelector(`[data-role="quick"]`);
    if (quickBtn) {
      quickBtn.addEventListener(`click`, () => {
        prefs.scope = Object.assign({}, last.scope);
        prefs.filter = last.filter;
        prefs.count = last.count;
        if (!begin()) paint();
      });
    }
    wrap.querySelector(`[data-role="auto-next"]`).addEventListener(`change`, (e) => saveAutoNext(e.target.checked));
    wrap.querySelector(`[data-role="confidence"]`).addEventListener(`change`, (e) => {
      saveConfidence(e.target.checked);
      const keys = wrap.querySelector(`[data-role="keys"]`);
      if (keys) keys.innerHTML = keysHintHtml(prefs.confidence);
    });

    scopeEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-scope]`);
      if (!b || b.disabled) return;
      const o = scopeOptions.find((x) => x.key === b.dataset.scope);
      if (o) prefs.scope = Object.assign({}, o.scope);
      paint();
    });
    filterEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-filter]`);
      if (!b) return;
      prefs.filter = b.dataset.filter;
      paint();
    });
    countEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-count]`);
      if (!b) return;
      prefs.count = Number(b.dataset.count);
      paint();
    });
    startBtn.addEventListener(`click`, () => {
      if (!begin()) paint();
    });

    paint();
  }

  // ===== 描画: 出題中 =====

  function renderRun(wrap, ctx) {
    const sess = session;
    const n = sess.items.length;
    const s = sess.items[sess.index];
    const prior = sess.prior[s.id];
    const quiz = quizById(s.quizId);
    const context = contextFor(s);
    const done = answeredCount(sess);
    const isLast = sess.index >= n - 1;
    // 回答済みの文に戻ってきたときは、答えたときの形(自信度つきか)で出す
    const prevAnswer = sess.answers[sess.index];
    const confidence = prevAnswer ? !!prevAnswer.level : prefs.confidence;

    wrap.innerHTML = `
      <h2>○×一問一答</h2>
      <p class="ox-run-label">${esc(sess.label)}</p>
      <div class="card ox-stage" data-role="stage">
        <div class="ox-run-head">
          <span class="ox-run-count num"><span class="sr-only">${n}問中</span>${sess.index + 1}<small> / ${n}</small><span class="sr-only">問目</span></span>
          <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill" data-role="bar" style="width:${Math.round((done / n) * 100)}%"></div></div>
          <button type="button" class="btn btn-ghost btn-sm ox-quit" data-role="quit">${ic(`x`, 16)}終了</button>
        </div>
        <div class="ox-q-meta">
          ${s.cat ? `<span class="badge badge-soft">${esc(categoryName(s.cat))}</span>` : ``}
          ${s.level ? `<span class="badge badge-${esc(s.level)}">${esc(s.level)}</span>` : ``}
          ${prior ? `<span class="review-status ${prior.lastOk ? `review-status-ok` : `review-status-ng`}">前回 ${prior.lastOk ? `正解` : `不正解`}</span>` : ``}
        </div>
        ${context ? `<p class="ox-context">${esc(context)}</p>` : ``}
        <p class="ox-statement${s.sub ? ` has-label` : ``}" tabindex="-1" data-role="statement">${stmtLabelHtml(s)}<span class="ox-statement-text">${esc(s.text)}</span></p>
        ${answerRowHtml(confidence)}
        <div data-role="result" aria-live="polite"></div>
      </div>
      ${keysHintHtml(confidence)}
    `;

    const stage = wrap.querySelector(`[data-role="stage"]`);
    const resultEl = wrap.querySelector(`[data-role="result"]`);
    const btnO = wrap.querySelector(`[data-answer="o"]`);
    const btnX = wrap.querySelector(`[data-answer="x"]`);
    const confBtns = Array.from(wrap.querySelectorAll(`[data-level]`));
    const levelBtn = (lv) => confBtns.find((b) => Number(b.dataset.level) === lv) || null;

    // 答えのボタンの印: 正解のボタンに「正解」、間違えたら選んだボタンに「あなたの回答」
    // 自信度つき: 正解したら選んだボタンに「正解」。間違えたら正しい側の「もちろん」に「正解」
    function markButtons(a) {
      let answerBtn;
      let chosenBtn;
      if (confBtns.length) {
        chosenBtn = levelBtn(a.level) || levelBtn(a.said ? 1 : 4);
        answerBtn = a.ok ? chosenBtn : levelBtn(s.truth ? 1 : 4);
        confBtns.forEach((b) => { b.disabled = true; });
      } else {
        answerBtn = s.truth ? btnO : btnX;
        chosenBtn = a.said ? btnO : btnX;
        [btnO, btnX].forEach((b) => { b.disabled = true; });
      }
      answerBtn.classList.add(`is-answer`);
      answerBtn.insertAdjacentHTML(`beforeend`, `<span class="ox-btn-tag">正解</span>`);
      chosenBtn.classList.add(`is-chosen`);
      if (!a.ok) {
        chosenBtn.classList.add(`is-wrong`);
        chosenBtn.insertAdjacentHTML(`beforeend`, `<span class="ox-btn-tag">あなたの回答</span>`);
      }
    }

    // 「たぶん」で正解したときの1行(元の4択を解き直しに入れたかどうか)
    function unsureLineHtml(a) {
      if (!a.ok || !a.unsure) return ``;
      return `<p class="review-added ox-unsure-line">${ic(`repeat`, 14)}<span>${a.drillAdded
        ? `「たぶん」で正解。元の4択を3日後の<a href="#quiz/due">解き直し</a>に入れました`
        : `「たぶん」で正解しました`}</span></p>`;
    }

    function paintAnswered(review, animate) {
      const a = sess.answers[sess.index];
      markButtons(a);
      wrap.querySelector(`[data-role="bar"]`).style.width = `${Math.round((answeredCount(sess) / n) * 100)}%`;

      const link = termLink(s.termId, s.topicIds);
      const note = s.note || (quiz ? (quiz.explanation || quiz.answer || ``) : ``);
      resultEl.innerHTML = `
        <div class="ox-result ${a.ok ? `is-ok` : `is-ng`}">
          <p class="ox-result-head">
            <span class="ox-verdict">${ic(a.ok ? `check-circle` : `x-circle`, 22)}${a.ok ? `正解` : `不正解`}</span>
            <span class="ox-truth">この文は${truthHtml(s.truth)}</span>
          </p>
          ${unsureLineHtml(a)}
          ${review && link ? `<p class="review-added ox-review">${ic(`repeat`, 14)}<span>「${esc(link.name)}」を<a href="#review">今日の復習</a>に追加しました</span></p>` : ``}
          ${note ? `<p class="ox-note">${s.note ? `` : `<span class="ox-note-label">4択問題全体の解説: </span>`}${esc(note)}</p>` : ``}
          <div class="ox-links">
            <a class="chip chip-small chip-muted" href="#quiz/q/${encodeURIComponent(s.quizId)}">${ic(`list`, 14)}元の4択問題</a>
            ${link ? `<a class="chip chip-small chip-muted" href="${link.href}" data-term-sheet="${link.id}">${ic(`layers`, 14)}用語を確認: ${esc(link.name)}</a>` : ``}
          </div>
          <div class="ox-ask-ai" data-role="ask-ai"></div>
          ${reportMetaHtml(s, quiz)}
        </div>
        <div class="ox-next-wrap">
          <button type="button" class="btn btn-lg btn-block ox-next" data-role="next">${isLast ? `結果を見る` : `次へ`}${ic(`arrow-right`)}</button>
        </div>
      `;
      resultEl.querySelector(`[data-role="next"]`).addEventListener(`click`, next);
      // 「AIに聞く」(js/askAi.js。使わない設定・読み込めないときは何も置かない)。picked: ○と答えたら true
      const aiBox = resultEl.querySelector(`[data-role="ask-ai"]`);
      let aiBtn = null;
      try { aiBtn = window.AskAi && typeof AskAi.button === `function` ? AskAi.button({ kind: `ox`, quizId: s.quizId, stmtKey: s.id, picked: a.said }) : null; } catch (e) { console.error(`[AIに聞く] ボタンを作れませんでした`, e); }
      if (aiBtn) aiBox.appendChild(aiBtn);
      else aiBox.remove();
      if (animate && !UI.prefersReducedMotion()) {
        stage.classList.add(a.ok ? `ox-flash-ok` : `ox-flash-ng`);
        setTimeout(() => stage.classList.remove(`ox-flash-ok`, `ox-flash-ng`), 700);
      }
    }

    // level: 自信度つきの 1〜4(このときは saidTrue を使わない)
    function answer(saidTrue, level) {
      const res = answerCurrent(sess, saidTrue, confidence ? level : undefined);
      if (!res) return;
      paintAnswered(res.review, true);
      focusEl(resultEl.querySelector(`[data-role="next"]`));
      // 解説が画面外(スマホの下部タブの裏)に出たら見える位置までスクロール(余白は CSS の scroll-margin)
      // 記録を保存できなかったときのお知らせ(Storage が次のタスクで出す)の分も空けられるよう、そのあとで動かす
      setTimeout(() => requestAnimationFrame(() => { if (resultEl.isConnected) UI.scrollIntoView(resultEl, `nearest`); }), 0);
      // 「正解したら自動で次へ」: 間違えたとき・「たぶん」で正解したときは解説を読めるよう止まる
      if (res.ok && !res.unsure && prefs.autoNext) startAutoNext();
    }

    // 自動で次へ: 細いバーで残り時間を見せ、画面に触れる・キーを押すと取りやめる
    // (動きを減らす設定ではバーを出さずに、同じ時間で進む)
    let autoTimer = null;
    function cancelAutoNext() {
      if (!autoTimer) return;
      clearTimeout(autoTimer);
      autoTimer = null;
      document.removeEventListener(`pointerdown`, cancelAutoNext, true);
      document.removeEventListener(`keydown`, cancelAutoNext, true);
      window.removeEventListener(`hashchange`, cancelAutoNext);
      const bar = resultEl.querySelector(`[data-role="auto-bar"]`);
      if (bar) bar.remove();
    }
    function startAutoNext() {
      const nextWrap = resultEl.querySelector(`.ox-next-wrap`);
      if (!nextWrap) return;
      // バーの長さが縮む時間(CSS の ox-countdown)は AUTO_NEXT_MS と同じ 1.2秒
      nextWrap.insertAdjacentHTML(`afterbegin`, `<div class="ox-auto-bar" data-role="auto-bar" aria-hidden="true"><span></span></div>`);
      autoTimer = setTimeout(() => {
        cancelAutoNext();
        if (session !== sess || !wrap.isConnected || document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
        next();
      }, AUTO_NEXT_MS);
      document.addEventListener(`pointerdown`, cancelAutoNext, true);
      document.addEventListener(`keydown`, cancelAutoNext, true);
      window.addEventListener(`hashchange`, cancelAutoNext);
    }

    function next() {
      cancelAutoNext();
      if (!sess.answers[sess.index] || session !== sess) return;
      if (sess.index >= n - 1) {
        sess.finished = true;
        renderSummary(wrap, ctx);
        window.scrollTo(0, 0);
        focusEl(wrap.querySelector(`h2`));
        return;
      }
      sess.index += 1;
      renderRun(wrap, ctx);
      window.scrollTo(0, 0);
      focusEl(wrap.querySelector(`[data-role="statement"]`));
    }

    function quit() {
      cancelAutoNext();
      if (!answeredCount(sess)) {
        // 1問も答えずに終了: 履歴を増やさずにトップへ(増やすと「戻る」で出題画面→トップに飛ばされ、何も起きないように見える)
        session = null;
        if (sess.fromLanding) history.back();
        else location.replace(`#ox`);
        return;
      }
      sess.finished = true;
      sess.quit = true;
      renderSummary(wrap, ctx);
      window.scrollTo(0, 0);
      focusEl(wrap.querySelector(`h2`));
    }

    if (confidence) {
      confBtns.forEach((b) => b.addEventListener(`click`, () => answer(null, Number(b.dataset.level))));
    } else {
      btnO.addEventListener(`click`, () => answer(true));
      btnX.addEventListener(`click`, () => answer(false));
    }
    wrap.querySelector(`[data-role="quit"]`).addEventListener(`click`, quit);

    ctx.run = { answered: () => !!sess.answers[sess.index], answer, next, confidence };

    // 再描画(戻る操作など)で回答済みの文に戻ってきた場合は結果を表示したままにする
    if (sess.answers[sess.index]) {
      const a = sess.answers[sess.index];
      paintAnswered(!a.ok && !!(s.termId && AppIndex.termsById[s.termId]), false);
    }
  }

  // ===== 描画: 結果 =====

  function renderSummary(wrap, ctx) {
    ctx.run = null;
    const sess = session;
    const sum = summarize(sess);
    const pct = sum.answered ? Math.round((sum.correct / sum.answered) * 100) : 0;
    const stats = loadStats();
    const nextPool = buildPool(loadStatements(), sess.scope, sess.filter, stats);
    const continueReason = nextPool.length ? ``
      : sess.filter === `unanswered` ? `この条件の未回答の文はもうありません。`
      : sess.filter === `wrong` ? `この条件で間違えた文はもうありません。`
      : `この条件の文がありません。`;

    wrap.innerHTML = `
      <h2>○×一問一答</h2>
      <p class="ox-run-label">${esc(sess.label)}</p>
      <section class="card ox-summary" aria-labelledby="ox-summary-title">
        <h3 class="ox-summary-title" id="ox-summary-title">${ic(pct >= PASS_PCT ? `trophy` : `flag`, 20)}今回の結果</h3>
        <p class="ox-score">
          <span class="ox-score-value num">${sum.correct}</span>
          <span class="ox-score-of num">/ ${sum.answered}問 正解</span>
          <span class="ox-score-pct num">${pct}%</span>
        </p>
        <div class="progress-bar progress-bar-lg" aria-hidden="true"><div class="progress-bar-fill ${pct >= PASS_PCT ? `fill-success` : ``}" style="width:${pct}%"></div></div>
        ${sess.quit && sum.answered < sum.total ? `<p class="ox-summary-note">${sum.total}問中${sum.answered}問で終了しました。</p>` : ``}
        ${sum.unsure ? `<p class="ox-summary-note">正解のうち <span class="num">${sum.unsure}</span>問は「たぶん」でした。${sum.unsureAdded ? `元の4択(<span class="num">${sum.unsureAdded}</span>問)を3日後の<a href="#quiz/due">解き直し</a>に入れました。` : ``}</p>` : ``}
        ${streakLineHtml()}
        <div class="ox-summary-actions">
          ${sum.wrong.length ? `<button type="button" class="btn btn-lg" data-role="retry-wrong">${ic(`repeat`)}間違えた文だけもう一度(${sum.wrong.length}問)</button>` : ``}
          <button type="button" class="btn btn-lg ${sum.wrong.length ? `btn-secondary` : ``}" data-role="continue"${nextPool.length ? `` : ` disabled`}>${ic(`refresh`)}同じ条件で続ける</button>
          <a class="btn btn-ghost" href="#ox">${ic(`arrow-left`)}○×トップへ</a>
        </div>
        ${continueReason ? `<p class="ox-summary-note">${continueReason}</p>` : ``}
      </section>
      ${sum.cats.length ? `
        <section class="ox-section" aria-labelledby="ox-cat-title">
          <h3 id="ox-cat-title">分野別</h3>
          <div class="card cat-bars ox-cat-bars">
            ${sum.cats.map((c) => {
              const p = Math.round((c.correct / c.total) * 100);
              return `<div>
                <div class="cat-bar-head"><span class="cat-bar-name">${esc(c.name)}</span><span class="cat-bar-meta">${c.correct} / ${c.total}問(${p}%)</span></div>
                <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill ${p >= PASS_PCT ? `fill-success` : ``}" style="width:${p}%"></div></div>
              </div>`;
            }).join(``)}
          </div>
        </section>` : ``}
      <section class="ox-section" aria-labelledby="ox-wrong-title">
        <h3 id="ox-wrong-title">間違えた文${sum.wrong.length ? `(${sum.wrong.length})` : ``}</h3>
        ${sum.wrong.length ? `
          <ol class="ox-wrong-list">
            ${sum.wrong.map((s) => `
              <li class="card ox-wrong-item">
                <div class="ox-wrong-head">
                  ${s.cat ? `<span class="badge badge-soft">${esc(categoryName(s.cat))}</span>` : ``}
                  <span class="ox-wrong-answer">正解は${truthHtml(s.truth)}</span>
                </div>
                ${contextFor(s) ? `<p class="ox-wrong-context">${esc(contextFor(s))}</p>` : ``}
                <p class="ox-wrong-text${s.sub ? ` has-label` : ``}">${stmtLabelHtml(s)}<span>${esc(s.text)}</span></p>
                ${s.note ? `<p class="ox-wrong-note">${esc(s.note)}</p>` : ``}
                <div class="ox-wrong-links">
                  <a class="link-btn" href="#quiz/q/${encodeURIComponent(s.quizId)}">${ic(`list`, 14)}元の4択問題</a>
                  ${termLinkBtnHtml(s)}
                </div>
              </li>`).join(``)}
          </ol>` : `<p class="ox-all-correct">${ic(`check-circle`)}${sum.answered ? `全問正解です。` : `回答した文はありません。`}</p>`}
      </section>
    `;

    const retryBtn = wrap.querySelector(`[data-role="retry-wrong"]`);
    if (retryBtn) {
      retryBtn.addEventListener(`click`, () => {
        session = createSession(QuizEngine.shuffle(sum.wrong), { scope: sess.scope, filter: sess.filter, count: sess.count, label: `間違えた文をもう一度(${scopeLabel(sess.scope)})`, retry: true, fromLanding: sess.fromLanding });
        Router.navigate(`#ox/run`);
      });
    }
    wrap.querySelector(`[data-role="continue"]`).addEventListener(`click`, () => {
      // 4択問題を指定した出題は、同じ問題の文でもう一度(条件 prefs は変えない)
      if (sess.scope.type === `quiz`) {
        if (startQuizScope(sess.scope.ids || [], sess.fromLanding)) Router.navigate(`#ox/run`);
        return;
      }
      prefs.scope = Object.assign({}, sess.scope);
      prefs.filter = sess.filter;
      prefs.count = sess.count;
      if (startFromPrefs(new Set(sess.items.map((s) => s.id)))) {
        // 同じ履歴エントリ(#ox/run)のまま続けるので、1つ前の履歴は元のセッションと同じ
        session.fromLanding = sess.fromLanding;
        saveStartedPrefs();
        Router.navigate(`#ox/run`);
      }
    });
  }

  return {
    render,
    // 模擬試験・解き直しの結果から: その4択問題の○×へのリンク(#ox/quiz/<問題ID,…>。出せる文がなければ null)
    quizNav,
    // テスト用
    _internal: {
      STATS_KEY, PREFS_KEY, COUNTS, CONF_LEVELS, prefs, parseParam, saveConfidence, scopeCategories, withCategory, loadStatements, cleanEntry, loadStats, recordAnswer,
      inScope, matchesFilter, buildPool, weakOrder, spreadByQuiz, pickQuestions, createSession, startFromPrefs,
      answerCurrent, summarize, contextOf, termLink, conditionLabel, loadSavedPrefs, lastStarted, validScope, quizScopeIds, startQuizScope,
      getSession: () => session,
      setSession: (s) => { session = s; },
    },
  };
})();
