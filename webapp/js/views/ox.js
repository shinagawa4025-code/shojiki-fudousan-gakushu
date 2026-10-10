// ○×一問一答: 正誤判定型の4択問題(ask: correct / incorrect)の選択肢を1文ずつ「正しい/誤り」で判定する
// ルート: #ox(条件を選ぶトップ) / #ox/cat/<分野ID>(宅建士の分野ID または shohi) / #ox/topic/<topicId> / #ox/weak(間違えた文)
//         末尾に /<問題数>(10・20・50)を付けると、その問題数で出題する(例: #ox/cat/gyoho/20)
//         #ox/weak/<文ID>(例: quiz-K-01%232)は、間違えた文のうちその文を最初に出題する
//         #ox/run(出題中・結果。セッションはメモリ上のみ。再読み込みするとトップに戻る)
// ディープリンク(cat/topic/weak)は条件を選んだ状態ですぐ出題を始め、URLを #ox/run に置き換える
// 記録: Storage `oxStats` = { [文ID 'quiz-K-01#2']: { c: 正解回数, w: 不正解回数, last: 'YYYY-MM-DD', lastOk: 直近の正誤 } }
//       (弱点分析でも読むため、この形を変えないこと)
window.Views = window.Views || {};
window.Views.ox = (function () {
  const STATS_KEY = `oxStats`;
  const COUNTS = [10, 20, 50];
  const FILTERS = [
    { id: `unanswered`, label: `未回答` },
    { id: `wrong`, label: `間違えたことがある` },
    { id: `all`, label: `すべて` },
  ];
  const SHOHI = `shohi`;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  // 画面の再描画をまたいで保持する条件と、進行中のセッション(ページを再読み込みすると消える)
  const prefs = { scope: { type: `all`, id: null }, filter: `all`, count: 10 };
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
  function withCategory(s) {
    const probe = { relatedTermId: s.termId, topicIds: s.topicIds };
    const t = Stats.categoryOf(probe, `takken`);
    const z = Stats.categoryOf(probe, `zeirishi`);
    const cats = [];
    if (t) cats.push(t.id);
    if (z && z.id === SHOHI) cats.push(SHOHI);
    return Object.assign({}, s, { cats, cat: cats.includes(SHOHI) ? SHOHI : (t ? t.id : null) });
  }

  function loadStatements() {
    return QuizEngine.allStatements().map(withCategory);
  }

  // ===== 記録 =====

  // 壊れた項目(インポートした古いデータ等)は null。回数の上限は弱点分析(Analysis)と揃える
  function cleanEntry(v) {
    if (!Storage.isPlainObject(v)) return null;
    const c = Number.isFinite(v.c) && v.c > 0 ? Math.min(Math.floor(v.c), 100000) : 0;
    const w = Number.isFinite(v.w) && v.w > 0 ? Math.min(Math.floor(v.w), 100000) : 0;
    if (!c && !w) return null;
    return {
      c,
      w,
      last: DateUtil.isValid(v.last) ? v.last : ``,
      lastOk: typeof v.lastOk === `boolean` ? v.lastOk : w === 0,
    };
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

  function recordAnswer(statementId, ok) {
    const all = loadStats();
    const prev = all[statementId] || { c: 0, w: 0 };
    all[statementId] = { c: prev.c + (ok ? 1 : 0), w: prev.w + (ok ? 0 : 1), last: DateUtil.today(), lastOk: !!ok };
    Storage.set(STATS_KEY, all);
    return all[statementId];
  }

  // ===== 出題の組み立て =====

  function inScope(s, scope) {
    if (!scope || scope.type === `all`) return true;
    if (scope.type === `cat`) return s.cats.includes(scope.id);
    if (scope.type === `topic`) return (s.topicIds || []).includes(scope.id);
    return false;
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

  // 間違えた回数が多い順(同数なら直近で間違えたもの → ランダム)
  function weakOrder(list, stats) {
    return list
      .map((s) => {
        const e = stats[s.id];
        return { s, w: e ? e.w : 0, ng: e && !e.lastOk ? 1 : 0, r: Math.random() };
      })
      .sort((a, b) => (b.w - a.w) || (b.ng - a.ng) || (a.r - b.r))
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
    return { kind: `landing`, invalid: true };
  }

  function scopeLabel(scope) {
    if (!scope || scope.type === `all`) return `すべての分野`;
    if (scope.type === `cat`) return categoryName(scope.id);
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

  // 現在の文に回答する(記録・ストリーク・間違えたら用語をSRSの「もう一度」へ)。戻り値 { ok, review }
  function answerCurrent(sess, saidTrue) {
    const s = sess.items[sess.index];
    if (!s || sess.answers[sess.index]) return null;
    const ok = s.truth === !!saidTrue;
    sess.answers[sess.index] = { id: s.id, said: !!saidTrue, ok };
    recordAnswer(s.id, ok);
    if (window.Streak) Streak.recordToday();
    const termOk = !!(s.termId && AppIndex.termsById[s.termId]);
    if (!ok && termOk && !sess.graded[s.termId]) {
      sess.graded[s.termId] = true;
      Srs.grade(s.termId, 1);
    }
    return { ok, review: !ok && termOk };
  }

  function answeredCount(sess) {
    return sess.answers.filter(Boolean).length;
  }

  function summarize(sess) {
    let answered = 0;
    let correct = 0;
    const byCat = {};
    const cats = [];
    const wrong = [];
    sess.items.forEach((s, i) => {
      const a = sess.answers[i];
      if (!a) return;
      answered += 1;
      if (a.ok) correct += 1;
      else wrong.push(s);
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
    return { total: sess.items.length, answered, correct, cats, wrong };
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
    return { href: topic ? `#topics/${topic.id}/${term.id}` : `#glossary/${term.id}`, name: term.name };
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

  function keysHintHtml() {
    return `<p class="ox-keys">キーボード: <kbd>O</kbd>・<kbd>1</kbd>・<kbd>←</kbd> で○ / <kbd>X</kbd>・<kbd>2</kbd>・<kbd>→</kbd> で× / <kbd>Enter</kbd> で次へ</p>`;
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
    const wrap = document.createElement(`div`);
    wrap.className = `view ox-view`;
    root.appendChild(wrap);
    const ctx = { run: null };
    bindKeys(wrap, ctx);

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

    wrap.innerHTML = `
      <h2>○×一問一答</h2>
      <p class="view-desc">4択問題の選択肢を1文ずつ取り出し、正しい(○)か誤り(×)かを判定します。本試験の「正しいもの/誤っているものはどれか」は、1つ1つの記述の正誤を根拠とともに判断できれば解けます。間違えた文の用語は「今日の復習」に追加されます。</p>
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
      ${opts.notice ? `<p class="ox-notice" role="status">${ic(`info`)}<span>${esc(opts.notice)}</span></p>` : ``}
      ${total ? `
        <div class="stat-grid ox-stats">
          <div class="stat-tile"><span class="stat-value num">${total}<small>文</small></span><span class="stat-label">収録</span></div>
          <div class="stat-tile"><span class="stat-value num">${answered}<small>文</small></span><span class="stat-label">回答済み</span></div>
          <div class="stat-tile"><span class="stat-value num">${acc == null ? `—` : `${acc}<small>%</small>`}</span><span class="stat-label">正答率</span></div>
        </div>
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
        </section>
        ${keysHintHtml()}` : ``}
    `;

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
      else noteEl.textContent = `条件に合う${poolSize}文から${n}問を${prefs.filter === `wrong` ? `、間違えた回数が多い順に` : `ランダムに`}出題します。`;
    }

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
      if (startFromPrefs()) {
        session.fromLanding = true;
        Router.navigate(`#ox/run`);
      } else {
        paint();
      }
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
        <p class="ox-statement" tabindex="-1" data-role="statement">${esc(s.text)}</p>
        <div class="ox-answer-row" role="group" aria-label="この文は正しいか、誤りか">
          <button type="button" class="ox-btn ox-btn-o" data-answer="o" aria-keyshortcuts="O 1 ArrowLeft">${markSvg(`o`)}<span class="ox-btn-label">正しい</span></button>
          <button type="button" class="ox-btn ox-btn-x" data-answer="x" aria-keyshortcuts="X 2 ArrowRight">${markSvg(`x`)}<span class="ox-btn-label">誤り</span></button>
        </div>
        <div data-role="result" aria-live="polite"></div>
      </div>
      ${keysHintHtml()}
    `;

    const stage = wrap.querySelector(`[data-role="stage"]`);
    const resultEl = wrap.querySelector(`[data-role="result"]`);
    const btnO = wrap.querySelector(`[data-answer="o"]`);
    const btnX = wrap.querySelector(`[data-answer="x"]`);

    function paintAnswered(review, animate) {
      const a = sess.answers[sess.index];
      const answerBtn = s.truth ? btnO : btnX;
      const chosenBtn = a.said ? btnO : btnX;
      [btnO, btnX].forEach((b) => { b.disabled = true; });
      answerBtn.classList.add(`is-answer`);
      answerBtn.insertAdjacentHTML(`beforeend`, `<span class="ox-btn-tag">正解</span>`);
      chosenBtn.classList.add(`is-chosen`);
      if (!a.ok) {
        chosenBtn.classList.add(`is-wrong`);
        chosenBtn.insertAdjacentHTML(`beforeend`, `<span class="ox-btn-tag">あなたの回答</span>`);
      }
      wrap.querySelector(`[data-role="bar"]`).style.width = `${Math.round((answeredCount(sess) / n) * 100)}%`;

      const link = termLink(s.termId, s.topicIds);
      const note = s.note || (quiz ? (quiz.explanation || quiz.answer || ``) : ``);
      resultEl.innerHTML = `
        <div class="ox-result ${a.ok ? `is-ok` : `is-ng`}">
          <p class="ox-result-head">
            <span class="ox-verdict">${ic(a.ok ? `check-circle` : `x-circle`, 22)}${a.ok ? `正解` : `不正解`}</span>
            <span class="ox-truth">この文は${truthHtml(s.truth)}</span>
          </p>
          ${note ? `<p class="ox-note">${s.note ? `` : `<span class="ox-note-label">4択問題全体の解説: </span>`}${esc(note)}</p>` : ``}
          ${review ? `<p class="ox-review">${ic(`repeat`, 14)}関連する用語を「今日の復習」に追加しました</p>` : ``}
          <div class="ox-links">
            <a class="chip chip-small chip-muted" href="#quiz/q/${encodeURIComponent(s.quizId)}">${ic(`list`, 14)}元の4択問題</a>
            ${link ? `<a class="chip chip-small chip-muted" href="${link.href}">${ic(`layers`, 14)}用語を確認: ${esc(link.name)}</a>` : ``}
          </div>
        </div>
        <button type="button" class="btn btn-lg btn-block ox-next" data-role="next">${isLast ? `結果を見る` : `次へ`}${ic(`arrow-right`)}</button>
      `;
      resultEl.querySelector(`[data-role="next"]`).addEventListener(`click`, next);
      if (animate && !UI.prefersReducedMotion()) {
        stage.classList.add(a.ok ? `ox-flash-ok` : `ox-flash-ng`);
        setTimeout(() => stage.classList.remove(`ox-flash-ok`, `ox-flash-ng`), 700);
      }
    }

    function answer(saidTrue) {
      const res = answerCurrent(sess, saidTrue);
      if (!res) return;
      paintAnswered(res.review, true);
      focusEl(resultEl.querySelector(`[data-role="next"]`));
      // 解説が画面外(スマホの下部タブの裏)に出たら見える位置までスクロール(余白は CSS の scroll-margin)
      requestAnimationFrame(() => UI.scrollIntoView(resultEl, `nearest`));
    }

    function next() {
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

    btnO.addEventListener(`click`, () => answer(true));
    btnX.addEventListener(`click`, () => answer(false));
    wrap.querySelector(`[data-role="quit"]`).addEventListener(`click`, quit);

    ctx.run = { answered: () => !!sess.answers[sess.index], answer, next };

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
        <h3 class="ox-summary-title" id="ox-summary-title">${ic(pct >= 80 ? `trophy` : `flag`, 20)}今回の結果</h3>
        <p class="ox-score">
          <span class="ox-score-value num">${sum.correct}</span>
          <span class="ox-score-of num">/ ${sum.answered}問 正解</span>
          <span class="ox-score-pct num">${pct}%</span>
        </p>
        <div class="progress-bar progress-bar-lg" aria-hidden="true"><div class="progress-bar-fill ${pct >= 80 ? `fill-success` : ``}" style="width:${pct}%"></div></div>
        ${sess.quit && sum.answered < sum.total ? `<p class="ox-summary-note">${sum.total}問中${sum.answered}問で終了しました。</p>` : ``}
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
                <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill ${p >= 80 ? `fill-success` : ``}" style="width:${p}%"></div></div>
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
                <p class="ox-wrong-text">${esc(s.text)}</p>
                ${s.note ? `<p class="ox-wrong-note">${esc(s.note)}</p>` : ``}
                <a class="link-btn" href="#quiz/q/${encodeURIComponent(s.quizId)}">${ic(`list`, 14)}元の4択問題</a>
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
      prefs.scope = Object.assign({}, sess.scope);
      prefs.filter = sess.filter;
      prefs.count = sess.count;
      if (startFromPrefs(new Set(sess.items.map((s) => s.id)))) {
        // 同じ履歴エントリ(#ox/run)のまま続けるので、1つ前の履歴は元のセッションと同じ
        session.fromLanding = sess.fromLanding;
        Router.navigate(`#ox/run`);
      }
    });
  }

  return {
    render,
    // テスト用
    _internal: {
      STATS_KEY, COUNTS, prefs, parseParam, scopeCategories, withCategory, loadStatements, cleanEntry, loadStats, recordAnswer,
      inScope, matchesFilter, buildPool, weakOrder, spreadByQuiz, pickQuestions, createSession, startFromPrefs,
      answerCurrent, summarize, contextOf, termLink, conditionLabel,
      getSession: () => session,
      setSession: (s) => { session = s; },
    },
  };
})();
