// 模擬試験(宅建士・本番形式): 問題数・制限時間・分野配分を本試験に合わせ、アプリ内の問題から出題する
// ルート: #exam(受験メニュー・履歴) / #exam/run(受験中) / #exam/result/<id>(結果)
// 保存キー: examSession(受験中の状態) / examHistory(結果の履歴、新しい順・最大30件) / examRetryResult(直近の解き直し結果)
window.Views = window.Views || {};
window.Views.exam = (function () {
  const TYPE_ID = `takken`;
  const SESSION_KEY = `examSession`;
  const HISTORY_KEY = `examHistory`;
  const RETRY_RESULT_KEY = `examRetryResult`;
  const HISTORY_MAX = 30;
  const STORAGE_PREFIX = `shojikiLearn.v1.`;
  const SHORT_QUOTAS = { kenri: 6, horei: 3, zei: 1, gyoho: 8, menjo: 2 };
  const SHORT_TOTAL = 20;
  const ANNOUNCE_MINUTES = [10, 5, 1];
  const LEVELS = [`超入門`, `初級`, `中級`, `上級`];
  const RETIO_URL = `https://www.retio.or.jp/exam/exam_detail/`;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  // 受験メニューで選んだ設定(画面を行き来しても保持)
  const pref = { mode: `full`, timed: true };

  // 受験中のタイマー・キー操作(画面を離れたら必ず解除する)
  let tickTimer = null;
  let keyHandler = null;
  function cleanupRun() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (keyHandler) { document.removeEventListener(`keydown`, keyHandler); keyHandler = null; }
  }
  window.addEventListener(`hashchange`, cleanupRun);

  // ===== データ =====

  function examTypeData() {
    return Stats.examType(TYPE_ID);
  }

  function categories() {
    const t = examTypeData();
    return t && Array.isArray(t.categories) ? t.categories : [];
  }

  function catById(id) {
    return categories().find((c) => c.id === id) || null;
  }

  function catName(id) {
    const c = catById(id);
    return c ? c.name : `その他`;
  }

  function catIdOf(item) {
    const c = Stats.categoryOf(item, TYPE_ID);
    return c ? c.id : null;
  }

  function modeDef(mode) {
    const type = examTypeData() || {};
    const fullTotal = type.totalQuestions || 50;
    const fullMinutes = type.minutes || 120;
    if (mode === `short`) {
      return { id: `short`, label: `ショート`, total: SHORT_TOTAL, minutes: Math.round((fullMinutes * SHORT_TOTAL) / fullTotal), quotas: SHORT_QUOTAS };
    }
    if (mode === `retry`) return { id: `retry`, label: `解き直し`, total: null, minutes: null, quotas: null };
    const quotas = {};
    categories().forEach((c) => { quotas[c.id] = c.questions || 0; });
    return { id: `full`, label: `フル`, total: fullTotal, minutes: fullMinutes, quotas };
  }

  // 目安点: 50問で35点(アプリ独自)を問題数に比例させる
  function passLine(total) {
    const type = examTypeData() || {};
    const target = type.targetScore || 35;
    const base = type.totalQuestions || 50;
    return Math.ceil((target / base) * total);
  }

  function mcItemsIn(catId) {
    return window.APP_DATA.quiz.filter((q) => QuizEngine.isMcItem(q) && catIdOf(q) === catId);
  }

  // ===== 出題 =====

  function promptFor(type) {
    if (type === `name-from-def`) return `次の説明にあてはまる用語はどれか。`;
    if (type === `def-from-name`) return `次の用語の説明として最も適切なものはどれか。`;
    return ``;
  }

  // 問題オブジェクトを保存用の形に固定する(再開しても同じ問題・同じ選択肢順になるように)
  function packQuestion(q, catId) {
    return {
      kind: q.kind,
      refId: q.refId,
      termId: q.termId || null,
      categoryId: catId,
      level: q.level || ``,
      type: q.type,
      prompt: promptFor(q.type),
      stem: q.stem,
      choices: q.choices.map((c) => c.text),
      correctIndex: q.choices.findIndex((c) => c.correct),
      explanation: q.explanation || ``,
      // 選択肢ごとの解説(4択の確認問題に choiceNotes がある場合のみ)
      notes: q.choices.some((c) => c.note) ? q.choices.map((c) => c.note || ``) : null,
    };
  }

  // 分野ごとに 4択の確認問題 → 用語からの自動生成 の順で配分どおりに選ぶ。
  // 足りない分野は、残りの多い分野から順番に1問ずつ補充する。
  function buildExam(mode) {
    const def = modeDef(mode);
    const cats = categories();
    const usedTerms = new Set();
    const pools = {};
    cats.forEach((c) => {
      pools[c.id] = {
        fixed: QuizEngine.shuffle(mcItemsIn(c.id)),
        terms: QuizEngine.shuffle(Stats.termsInCategory(TYPE_ID, c.id)),
      };
    });

    function draw(catId) {
      const p = pools[catId];
      while (p.fixed.length) {
        const item = p.fixed.shift();
        const q = QuizEngine.fromFixedMc(item);
        if (!q || q.choices.findIndex((c) => c.correct) < 0) continue;
        if (item.relatedTermId) usedTerms.add(item.relatedTermId);
        return packQuestion(q, catId);
      }
      while (p.terms.length) {
        const t = p.terms.shift();
        if (usedTerms.has(t.id)) continue;
        const q = QuizEngine.buildQuestionForTerm(t);
        if (!q) continue;
        usedTerms.add(t.id);
        return packQuestion(q, catId);
      }
      return null;
    }

    function leftover(catId) {
      const p = pools[catId];
      return p.fixed.length + p.terms.filter((t) => !usedTerms.has(t.id)).length;
    }

    const byCat = {};
    const shortage = {};
    cats.forEach((c) => {
      const want = def.quotas[c.id] || 0;
      byCat[c.id] = [];
      while (byCat[c.id].length < want) {
        const q = draw(c.id);
        if (!q) break;
        byCat[c.id].push(q);
      }
      if (byCat[c.id].length < want) shortage[c.id] = want - byCat[c.id].length;
    });

    // 補充は本来の配分に比例させる(配分の大きい分野ほど多く引き受ける)
    const notices = [];
    const extra = {};
    let unfilled = 0;
    cats.forEach((c) => {
      let need = shortage[c.id] || 0;
      if (!need) return;
      const donated = {};
      while (need > 0) {
        const weight = (d) => ((extra[d.id] || 0) + 1) / Math.max(def.quotas[d.id] || 0, 0.5);
        const donors = cats.filter((d) => d.id !== c.id && !shortage[d.id] && leftover(d.id) > 0)
          .sort((a, b) => (weight(a) - weight(b)) || (leftover(b.id) - leftover(a.id)));
        if (!donors.length) break;
        const donor = donors[0];
        const q = draw(donor.id);
        if (!q) continue;
        extra[donor.id] = (extra[donor.id] || 0) + 1;
        byCat[donor.id].push(q);
        donated[donor.id] = (donated[donor.id] || 0) + 1;
        need -= 1;
      }
      const filled = shortage[c.id] - need;
      unfilled += need;
      if (filled > 0) {
        const detail = Object.keys(donated).map((id) => `${catName(id)}${donated[id]}問`).join(`・`);
        notices.push(`「${c.name}」は収録している問題・用語が少ないため、他分野から${filled}問補充しました(${detail})。`);
      }
    });
    if (unfilled > 0) notices.push(`出題できる問題が不足したため、本来より${unfilled}問少ない問題数で出題しています。`);

    const questions = [];
    cats.forEach((c) => { byCat[c.id].forEach((q) => questions.push(q)); });
    return { questions, notices };
  }

  function createSession(mode, timed) {
    const now = Date.now();
    const def = modeDef(mode);
    const built = buildExam(mode);
    return {
      v: 1,
      id: `ex_${now}`,
      examTypeId: TYPE_ID,
      mode,
      timed: !!timed,
      startedAt: now,
      deadline: timed ? now + def.minutes * 60000 : null,
      current: 0,
      questions: built.questions,
      answers: built.questions.map(() => null),
      flags: built.questions.map(() => false),
      notices: built.notices,
    };
  }

  // 結果の「間違えた問題」から、時間制限なしの解き直しセッションを作る(履歴には残さない)
  function createRetrySession(entry) {
    const now = Date.now();
    const questions = (entry.wrong || []).filter(validQuestion).map((w) => ({
      kind: w.kind, refId: w.refId, termId: w.termId || null, categoryId: w.categoryId || null,
      level: w.level || ``, type: w.type || ``, prompt: w.prompt || ``, stem: w.stem,
      choices: w.choices.slice(), correctIndex: w.correctIndex, explanation: w.explanation || ``,
      notes: Array.isArray(w.notes) && w.notes.length === w.choices.length ? w.notes.slice() : null,
    }));
    return {
      v: 1,
      id: `ex_${now}`,
      examTypeId: TYPE_ID,
      mode: `retry`,
      timed: false,
      startedAt: now,
      deadline: null,
      current: 0,
      questions,
      answers: questions.map(() => null),
      flags: questions.map(() => false),
      notices: [],
      retryOf: entry.id,
    };
  }

  // ===== 保存・読み込み(インポートされたデータも来るので型を必ず確認) =====

  function validQuestion(q) {
    return !!q && typeof q === `object` && typeof q.stem === `string` && Array.isArray(q.choices) && q.choices.length >= 2
      && q.choices.every((c) => typeof c === `string`) && Number.isInteger(q.correctIndex)
      && q.correctIndex >= 0 && q.correctIndex < q.choices.length;
  }

  function loadSession() {
    const s = Storage.get(SESSION_KEY, null);
    if (!s || typeof s !== `object` || Array.isArray(s) || s.v !== 1 || typeof s.id !== `string`) return null;
    if (!Array.isArray(s.questions) || !s.questions.length || !s.questions.every(validQuestion)) return null;
    if (typeof s.startedAt !== `number`) return null;
    const n = s.questions.length;
    const answers = Array.isArray(s.answers) ? s.answers : [];
    const flags = Array.isArray(s.flags) ? s.flags : [];
    s.answers = s.questions.map((q, i) => (Number.isInteger(answers[i]) && answers[i] >= 0 && answers[i] < q.choices.length ? answers[i] : null));
    s.flags = s.questions.map((q, i) => flags[i] === true);
    s.current = Number.isInteger(s.current) ? Math.min(Math.max(s.current, 0), n - 1) : 0;
    s.mode = [`full`, `short`, `retry`].includes(s.mode) ? s.mode : `full`;
    s.timed = !!s.timed && typeof s.deadline === `number`;
    if (!s.timed) s.deadline = null;
    s.notices = Array.isArray(s.notices) ? s.notices.filter((x) => typeof x === `string`) : [];
    s.examTypeId = TYPE_ID;
    return s;
  }

  function saveSession(s) {
    Storage.set(SESSION_KEY, s);
  }

  function clearSession() {
    // Storage には削除関数がないため直接消す(失敗時は null で上書き)
    try { localStorage.removeItem(STORAGE_PREFIX + SESSION_KEY); } catch (e) { Storage.set(SESSION_KEY, null); }
  }

  function isExpired(s, now) {
    return !!(s && s.timed && typeof s.deadline === `number` && s.deadline <= (now || Date.now()));
  }

  function validEntry(e) {
    return !!e && typeof e === `object` && typeof e.id === `string` && typeof e.score === `number` && typeof e.total === `number` && e.total > 0;
  }

  function readHistory() {
    return Stats.examHistory().filter(validEntry);
  }

  // ===== 採点 =====

  function gradeSession(s, finishedAt) {
    const end = s.timed && typeof s.deadline === `number` ? Math.min(finishedAt, s.deadline) : finishedAt;
    const byCategory = {};
    const wrong = [];
    let score = 0;
    s.questions.forEach((q, i) => {
      const cid = q.categoryId || `other`;
      if (!byCategory[cid]) byCategory[cid] = { correct: 0, total: 0 };
      byCategory[cid].total += 1;
      const chosen = Number.isInteger(s.answers[i]) ? s.answers[i] : null;
      if (chosen === q.correctIndex) {
        byCategory[cid].correct += 1;
        score += 1;
      } else {
        wrong.push({
          no: i + 1, kind: q.kind, refId: q.refId, termId: q.termId || null, categoryId: q.categoryId || null,
          level: q.level || ``, type: q.type || ``, prompt: q.prompt || ``, stem: q.stem, choices: q.choices.slice(),
          correctIndex: q.correctIndex, chosen, explanation: q.explanation || ``,
          notes: Array.isArray(q.notes) && q.notes.length === q.choices.length ? q.notes.slice() : null,
        });
      }
    });
    const def = modeDef(s.mode);
    return {
      id: s.id,
      examTypeId: TYPE_ID,
      mode: s.mode,
      timed: !!s.timed,
      startedAt: s.startedAt,
      finishedAt: end,
      durationSec: Math.max(0, Math.round((end - s.startedAt) / 1000)),
      limitMin: s.timed ? def.minutes : null,
      score,
      total: s.questions.length,
      byCategory,
      wrong,
      notices: s.notices || [],
    };
  }

  // 採点して記録する。副作用(SRS・ストリーク・履歴)は同じ試験IDにつき1回だけ
  function finalizeSession(s, finishedAt) {
    const entry = gradeSession(s, finishedAt);
    if (s.mode === `retry`) {
      entry.retryOf = s.retryOf || null;
      Storage.set(RETRY_RESULT_KEY, entry);
      if (window.Streak) Streak.recordToday();
      clearSession();
      return entry;
    }
    const hist = readHistory();
    const existing = hist.find((e) => e.id === entry.id);
    if (existing) {
      clearSession();
      return existing;
    }
    const graded = new Set();
    entry.wrong.forEach((w) => {
      if (!w.termId || graded.has(w.termId) || !AppIndex.termsById[w.termId]) return;
      graded.add(w.termId);
      Srs.grade(w.termId, 1);
    });
    if (window.Streak) Streak.recordToday();
    hist.unshift(entry);
    Storage.set(HISTORY_KEY, hist.slice(0, HISTORY_MAX));
    clearSession();
    return entry;
  }

  // ===== 表示用の小物 =====

  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const mm = String(m).padStart(2, `0`);
    const ss = String(sec).padStart(2, `0`);
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m >= 60) return `${Math.floor(m / 60)}時間${m % 60}分`;
    if (m > 0) return `${m}分${s ? `${s}秒` : ``}`;
    return `${s}秒`;
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ``;
    return `${DateUtil.toJapanese(DateUtil.format(d), true)} ${String(d.getHours()).padStart(2, `0`)}:${String(d.getMinutes()).padStart(2, `0`)}`;
  }

  function typeLabel(q) {
    if (q.kind === `fixed`) return `確認問題`;
    if (q.type === `name-from-def`) return `用語を選ぶ`;
    if (q.type === `def-from-name`) return `意味を選ぶ`;
    if (q.type === `law-ref`) return `根拠法令`;
    return `4択`;
  }

  function levelBadge(level) {
    return LEVELS.includes(level) ? `<span class="badge badge-${level}">${level}</span>` : ``;
  }

  function modeText(mode, total) {
    const def = modeDef(mode);
    return mode === `retry` ? `解き直し(${total}問)` : `${def.label}(${total}問)`;
  }

  function answeredCount(s) {
    return s.answers.filter((a) => a !== null).length;
  }

  // 分野の復習先トピック: 分野のtopicIdsの先頭 → 個別指定の用語が属するトピック
  function topicForCategory(catId) {
    const c = catById(catId);
    if (!c) return null;
    const direct = (c.topicIds || []).find((id) => AppIndex.topicsById[id]);
    if (direct) return AppIndex.topicsById[direct];
    for (const tid of c.termIds || []) {
      const term = AppIndex.termsById[tid];
      const topicId = term && (term.topicIds || []).find((id) => AppIndex.topicsById[id]);
      if (topicId) return AppIndex.topicsById[topicId];
    }
    return null;
  }

  // ===== ルーティング =====

  function render(root, param) {
    cleanupRun();
    const parts = (param || ``).split(`/`);
    if (parts[0] === `run`) renderRun(root);
    else if (parts[0] === `result`) renderResult(root, parts.slice(1).join(`/`));
    else renderLanding(root);
  }

  // 期限切れのセッションをその場で採点し、URLを結果ページに差し替えて表示する
  function showAutoGraded(root, s) {
    const entry = finalizeSession(s, s.deadline);
    history.replaceState(null, ``, `#exam/result/${entry.id}`);
    renderResult(root, entry.id, { autoGraded: true });
  }

  // ===== 受験メニュー =====

  function renderLanding(root) {
    const session = loadSession();
    if (session && isExpired(session)) { showAutoGraded(root, session); return; }

    const type = examTypeData() || {};
    const cats = categories();
    const mcTotal = cats.reduce((n, c) => n + mcItemsIn(c.id).length, 0);
    const termTotal = cats.reduce((n, c) => n + Stats.termsInCategory(TYPE_ID, c.id).length, 0);

    const wrap = document.createElement(`div`);
    wrap.className = `view exam-view`;
    wrap.innerHTML = `
      <h2>模擬試験</h2>
      <p class="view-desc">宅建士試験の本番形式(問題数・制限時間・分野配分)で、このアプリに収録した問題から出題します。試験中は正誤を表示せず、提出後にまとめて採点します。</p>
      <div data-role="resume"></div>
      <section class="card exam-setup" aria-labelledby="exam-setup-title">
        <h3 class="card-title" id="exam-setup-title">${ic(`timer`, 20)} 試験を始める</h3>
        <div class="segmented exam-mode-switch" role="group" aria-label="試験の長さ" data-role="modes">
          <button type="button" class="segmented-item" data-mode="full" aria-pressed="${pref.mode === `full`}">フル ${modeDef(`full`).total}問・${modeDef(`full`).minutes}分</button>
          <button type="button" class="segmented-item" data-mode="short" aria-pressed="${pref.mode === `short`}">ショート ${SHORT_TOTAL}問・${modeDef(`short`).minutes}分</button>
        </div>
        <label class="check-inline exam-timed-toggle"><input type="checkbox" data-role="timed" ${pref.timed ? `checked` : ``}> 時間制限あり</label>
        <p class="calc-note exam-timed-note" data-role="timed-note"></p>
        <div class="exam-breakdown" data-role="breakdown"></div>
        <button type="button" class="btn btn-lg btn-block" data-role="start">${ic(`play`, 20)}試験を開始する</button>
      </section>

      <section class="card" aria-labelledby="exam-about-title">
        <h3 class="card-title" id="exam-about-title">${ic(`info`, 20)} この模擬試験について</h3>
        <ul class="exam-about-list">
          <li>本試験は<strong>四肢択一式・50問・2時間</strong>です。宅建業に従事していて登録講習を修了した人は5問が免除され、45問・1時間50分になります。<a href="${RETIO_URL}" target="_blank" rel="noopener">不動産適正取引推進機構(RETIO)「試験概要」${ic(`external`, 14)}</a></li>
          <li>分野ごとの問題数(権利関係14・法令上の制限8・税・価格評定3・宅建業法20・5問免除科目5)は例年の出題数の目安で、公式に固定された配分ではありません。</li>
          <li>出題元は、確認問題の4択${mcTotal ? `(現在${mcTotal}問)` : `(宅建士の分野に該当する問題は準備中)`}と、用語集${termTotal}語から自動生成した4択です。用語の自動生成問題は<strong>定義を問う形式</strong>で、本試験の「正しいものはどれか/誤っているものはどれか」という文章問題とは異なります。</li>
          <li>合否の目安${type.targetScore || 35}点は、このアプリ独自の目安です。本試験の合格点は毎年変わります。</li>
          <li>間違えた用語は「今日の復習」に自動で追加されます。</li>
        </ul>
      </section>

      <section aria-labelledby="exam-history-title" class="exam-history">
        <div class="section-head"><h3 id="exam-history-title">${ic(`clock`, 20)} 受験履歴</h3></div>
        <div data-role="history"></div>
      </section>
    `;
    root.appendChild(wrap);

    renderResumeBanner(wrap.querySelector(`[data-role="resume"]`), session);
    renderHistoryList(wrap.querySelector(`[data-role="history"]`));

    const breakdown = wrap.querySelector(`[data-role="breakdown"]`);
    const timedInput = wrap.querySelector(`[data-role="timed"]`);
    const timedNote = wrap.querySelector(`[data-role="timed-note"]`);

    function paintSetup() {
      const def = modeDef(pref.mode);
      wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.mode === pref.mode)));
      timedNote.textContent = pref.timed
        ? `制限時間 ${def.minutes}分。途中で中断しても時計は止まりません(本番と同じ扱い)。時間切れになると自動で提出されます。`
        : `時間を気にせず解けます。経過時間は記録されます。`;
      breakdown.innerHTML = `
        <p class="exam-breakdown-title">分野別の問題数(${def.total}問)</p>
        <ul class="exam-breakdown-list">
          ${cats.map((c) => `<li><span>${esc(c.name)}</span><span class="num">${def.quotas[c.id] || 0}問</span></li>`).join(``)}
        </ul>`;
    }
    paintSetup();

    wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.addEventListener(`click`, () => { pref.mode = b.dataset.mode; paintSetup(); }));
    timedInput.addEventListener(`change`, () => { pref.timed = timedInput.checked; paintSetup(); });
    wrap.querySelector(`[data-role="start"]`).addEventListener(`click`, () => startNew(pref.mode, pref.timed));
  }

  async function startNew(mode, timed) {
    const existing = loadSession();
    if (existing) {
      const ok = await UI.confirm(`中断中の試験があります。破棄して新しい試験を始めますか?`, { confirmLabel: `破棄して始める`, danger: true });
      if (!ok) return;
    }
    const s = createSession(mode, timed);
    if (!s.questions.length) {
      UI.toast(`出題できる問題がありません`, `error`);
      return;
    }
    saveSession(s);
    Router.navigate(`#exam/run`);
  }

  async function startRetry(entry) {
    const existing = loadSession();
    if (existing) {
      const ok = await UI.confirm(`中断中の試験があります。破棄して解き直しを始めますか?`, { confirmLabel: `破棄して始める`, danger: true });
      if (!ok) return;
    }
    const s = createRetrySession(entry);
    if (!s.questions.length) return;
    saveSession(s);
    Router.navigate(`#exam/run`);
  }

  function renderResumeBanner(container, s) {
    if (!s) { container.innerHTML = ``; return; }
    const n = s.questions.length;
    const answered = answeredCount(s);
    const timeText = s.timed ? `残り ${fmtClock(s.deadline - Date.now())}` : `時間制限なし・経過 ${fmtClock(Date.now() - s.startedAt)}`;
    container.innerHTML = `
      <section class="card exam-resume" aria-labelledby="exam-resume-title">
        <div class="exam-resume-icon" aria-hidden="true">${ic(`timer`, 24)}</div>
        <div class="exam-resume-main">
          <h3 class="exam-resume-title" id="exam-resume-title">${s.mode === `retry` ? `解き直しの途中です` : `中断中の試験があります`}</h3>
          <p class="exam-resume-meta num">${esc(modeText(s.mode, n))}・回答 ${answered}/${n}・<span data-role="resume-time">${timeText}</span></p>
          ${s.timed ? `<p class="exam-resume-warn">${ic(`alert`, 14)}時間制限ありのため、中断中も残り時間は減っています。</p>` : ``}
        </div>
        <div class="exam-resume-actions">
          <button type="button" class="btn" data-role="resume">${ic(`play`)}再開する</button>
          <button type="button" class="btn btn-secondary" data-role="discard">${ic(`trash`)}破棄</button>
        </div>
      </section>`;
    container.querySelector(`[data-role="resume"]`).addEventListener(`click`, () => Router.navigate(`#exam/run`));
    container.querySelector(`[data-role="discard"]`).addEventListener(`click`, async () => {
      const ok = await UI.confirm(`中断中の試験を破棄しますか?<br>回答内容は保存されず、履歴にも残りません。`, { confirmLabel: `破棄する`, danger: true });
      if (!ok) return;
      clearSession();
      UI.toast(`中断中の試験を破棄しました`);
      Router.navigate(`#exam`);
    });
    // 残り時間の表示を更新し、時間切れになったら採点して結果へ
    if (s.timed) {
      const timeEl = container.querySelector(`[data-role="resume-time"]`);
      tickTimer = setInterval(() => {
        if (!container.isConnected) { cleanupRun(); return; }
        const rem = s.deadline - Date.now();
        if (rem <= 0) {
          cleanupRun();
          const entry = finalizeSession(s, s.deadline);
          UI.toast(`制限時間を過ぎたため、自動で採点しました`);
          Router.navigate(`#exam/result/${entry.id}`);
          return;
        }
        timeEl.textContent = `残り ${fmtClock(rem)}`;
      }, 1000);
    }
  }

  function renderHistoryList(container) {
    const hist = readHistory();
    if (!hist.length) {
      container.appendChild(UI.emptyState({ icon: `trophy`, title: `まだ受験記録がありません`, body: `ショート(20問)から気軽に試してみましょう。結果はここに残ります。` }));
      return;
    }
    const best = {};
    hist.forEach((e) => {
      if (e.mode !== `full` && e.mode !== `short`) return;
      if (!best[e.mode] || e.score / e.total > best[e.mode].score / best[e.mode].total) best[e.mode] = e;
    });
    container.innerHTML = `
      <div class="stat-grid exam-best">
        <div class="stat-tile"><span class="stat-value">${hist.length}<small>回</small></span><span class="stat-label">受験回数${hist.length >= HISTORY_MAX ? `(直近${HISTORY_MAX}回)` : ``}</span></div>
        <div class="stat-tile"><span class="stat-value">${best.full ? `${best.full.score}<small>/${best.full.total}</small>` : `—`}</span><span class="stat-label"><span class="nowrap">フル最高</span></span></div>
        <div class="stat-tile"><span class="stat-value">${best.short ? `${best.short.score}<small>/${best.short.total}</small>` : `—`}</span><span class="stat-label"><span class="nowrap">ショート最高</span></span></div>
      </div>
      <div class="todo-list exam-history-list">
        ${hist.map((e) => {
          const passed = e.score >= passLine(e.total);
          const isBest = (best[e.mode] && best[e.mode].id === e.id);
          return `
          <a class="todo-item exam-history-item" href="#exam/result/${encodeURIComponent(e.id)}">
            <span class="todo-icon ${passed ? `is-ok` : ``}">${ic(passed ? `trophy` : `clock`, 20)}</span>
            <span class="todo-main">
              <span class="todo-title num">${e.score}/${e.total}問・${esc(modeDef(e.mode).label)}${isBest ? `<span class="badge badge-accent exam-best-badge">最高</span>` : ``}</span>
              <span class="todo-sub">${esc(fmtDateTime(e.finishedAt || e.startedAt))}・${fmtDuration(e.durationSec || 0)}${e.timed ? `` : `・時間制限なし`}</span>
            </span>
            ${ic(`chevron-right`, 18)}
          </a>`;
        }).join(``)}
      </div>`;
  }

  // ===== 受験中 =====

  function renderRun(root) {
    const s = loadSession();
    if (!s) {
      const wrap = document.createElement(`div`);
      wrap.className = `view exam-view`;
      wrap.innerHTML = `<h2>模擬試験</h2>`;
      wrap.appendChild(UI.emptyState({ icon: `timer`, title: `受験中の試験はありません`, body: `模擬試験のメニューから開始してください。`, cta: { label: `模擬試験のメニューへ`, nav: `#exam` } }));
      root.appendChild(wrap);
      return;
    }
    if (isExpired(s)) { showAutoGraded(root, s); return; }

    document.body.classList.add(`exam-active`);
    const n = s.questions.length;
    const def = modeDef(s.mode);
    const wrap = document.createElement(`div`);
    wrap.className = `view exam-view exam-run`;
    wrap.innerHTML = `
      <div class="exam-topbar">
        <div class="exam-topbar-row">
          <div class="exam-timer" data-role="timer">
            ${ic(s.timed ? `timer` : `clock`, 20)}
            <span class="exam-timer-label" data-role="timer-label">${s.timed ? `残り` : `経過`}</span>
            <span class="exam-timer-value num" data-role="timer-value">--:--</span>
          </div>
          <div class="exam-topbar-actions">
            <button type="button" class="btn btn-secondary btn-sm exam-nav-toggle" data-role="open-nav" aria-label="問題一覧を開く">${ic(`grid`, 18)}<span>一覧</span></button>
            <button type="button" class="btn btn-secondary btn-sm" data-role="suspend" aria-label="保存して中断する">中断</button>
            <button type="button" class="btn btn-sm" data-role="submit">${ic(`check-circle`, 18)}提出</button>
          </div>
        </div>
        <div class="exam-progress">
          <span class="exam-progress-text num" data-role="progress-text"></span>
          <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill" data-role="progress-fill"></div></div>
        </div>
      </div>
      <h2 class="exam-run-title">模擬試験 ${esc(def.label)}${s.timed ? `` : `(時間制限なし)`}</h2>
      <div class="exam-layout">
        <div class="exam-main">
          <article class="card exam-q-card" data-role="qcard"></article>
          <div class="exam-pager">
            <button type="button" class="btn btn-secondary" data-role="prev">${ic(`chevron-left`)}前へ</button>
            <button type="button" class="btn" data-role="next">次へ${ic(`chevron-right`)}</button>
          </div>
          <p class="exam-kbd-hint">キーボード: 1〜4 で選択/← → で移動/F で見直し</p>
        </div>
        <aside class="exam-side" aria-label="問題一覧">
          <div class="card exam-side-card">
            <p class="exam-side-title">${ic(`grid`, 18)}問題一覧</p>
            <div data-role="side-nav"></div>
          </div>
        </aside>
      </div>
      <div class="sr-only" aria-live="polite" data-role="live"></div>
    `;
    root.appendChild(wrap);

    const qcard = wrap.querySelector(`[data-role="qcard"]`);
    const sideNav = wrap.querySelector(`[data-role="side-nav"]`);
    const live = wrap.querySelector(`[data-role="live"]`);
    const timerEl = wrap.querySelector(`[data-role="timer"]`);
    const timerValue = wrap.querySelector(`[data-role="timer-value"]`);
    const progressText = wrap.querySelector(`[data-role="progress-text"]`);
    const progressFill = wrap.querySelector(`[data-role="progress-fill"]`);
    const prevBtn = wrap.querySelector(`[data-role="prev"]`);
    const nextBtn = wrap.querySelector(`[data-role="next"]`);
    let navSheet = null;
    let finished = false;

    function persist() { saveSession(s); }

    function paintProgress() {
      const a = answeredCount(s);
      progressText.textContent = `回答済み ${a}/${n}`;
      progressFill.style.width = `${Math.round((a / n) * 100)}%`;
    }

    function paintQuestion() {
      const i = s.current;
      const q = s.questions[i];
      const chosen = s.answers[i];
      const flagged = s.flags[i];
      qcard.innerHTML = `
        <div class="exam-q-head">
          <span class="exam-q-num num">問${i + 1}<small> / ${n}</small></span>
          <span class="badge badge-soft">${esc(catName(q.categoryId))}</span>
          ${levelBadge(q.level)}
          <span class="source-tag">${typeLabel(q)}</span>
          <button type="button" class="btn btn-secondary btn-sm exam-flag-btn${flagged ? ` is-on` : ``}" data-role="flag" aria-pressed="${flagged}">${ic(`flag`, 16)}見直し</button>
        </div>
        ${q.prompt ? `<p class="exam-q-prompt">${esc(q.prompt)}</p>` : ``}
        <p class="quiz-question exam-stem">${esc(q.stem)}</p>
        <div class="choice-list" role="group" aria-label="問${i + 1}の選択肢">
          ${q.choices.map((text, ci) => `<button type="button" class="btn choice-btn exam-choice${chosen === ci ? ` is-selected` : ``}" data-choice="${ci}" aria-pressed="${chosen === ci}"><span class="choice-key">${ci + 1}</span><span>${esc(text)}</span></button>`).join(``)}
        </div>
      `;
      qcard.querySelectorAll(`[data-choice]`).forEach((b) => b.addEventListener(`click`, () => choose(Number(b.dataset.choice))));
      qcard.querySelector(`[data-role="flag"]`).addEventListener(`click`, toggleFlag);
      prevBtn.disabled = i === 0;
      nextBtn.innerHTML = i === n - 1 ? `${ic(`check-circle`)}提出へ` : `次へ${ic(`chevron-right`)}`;
    }

    function navHtml() {
      const unanswered = s.answers.filter((a) => a === null).length;
      const flagged = s.flags.filter(Boolean).length;
      const groups = [];
      s.questions.forEach((q, i) => {
        const last = groups[groups.length - 1];
        if (last && last.cid === q.categoryId) last.items.push(i);
        else groups.push({ cid: q.categoryId, items: [i] });
      });
      return `
        <p class="exam-nav-summary num">未回答 ${unanswered}問・見直し ${flagged}問</p>
        <div class="exam-nav-legend" aria-hidden="true">
          <span><i class="exam-nav-swatch is-answered"></i>回答済み</span>
          <span><i class="exam-nav-swatch"></i>未回答</span>
          <span><i class="exam-nav-swatch is-flagged"></i>見直し</span>
        </div>
        ${groups.map((g) => `
          <p class="exam-nav-group">${esc(catName(g.cid))}<span class="num">問${g.items[0] + 1}${g.items.length > 1 ? `〜${g.items[g.items.length - 1] + 1}` : ``}</span></p>
          <div class="exam-nav-grid">
            ${g.items.map((i) => {
              const answered = s.answers[i] !== null;
              const flag = s.flags[i];
              const label = `問${i + 1}(${answered ? `回答済み` : `未回答`}${flag ? `・見直し` : ``})`;
              return `<button type="button" class="exam-nav-cell num${answered ? ` is-answered` : ``}${flag ? ` is-flagged` : ``}" data-go="${i}" aria-label="${label}"${i === s.current ? ` aria-current="true"` : ``}>${i + 1}</button>`;
            }).join(``)}
          </div>`).join(``)}
        <div class="exam-nav-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-role="next-unanswered" ${unanswered ? `` : `disabled`}>次の未回答へ</button>
          <button type="button" class="btn btn-secondary btn-sm" data-role="next-flagged" ${flagged ? `` : `disabled`}>${ic(`flag`, 16)}次の見直しへ</button>
        </div>`;
    }

    function wireNav(container, onPick) {
      container.addEventListener(`click`, (e) => {
        const cell = e.target.closest(`[data-go]`);
        if (cell) { go(Number(cell.dataset.go)); if (onPick) onPick(); return; }
        if (e.target.closest(`[data-role="next-unanswered"]`)) { jumpTo((i) => s.answers[i] === null); if (onPick) onPick(); return; }
        if (e.target.closest(`[data-role="next-flagged"]`)) { jumpTo((i) => s.flags[i]); if (onPick) onPick(); }
      });
    }

    function paintNav() {
      sideNav.innerHTML = navHtml();
      if (navSheet) navSheet.body.innerHTML = navHtml();
    }

    function paintAll() {
      paintQuestion();
      paintProgress();
      paintNav();
    }

    // 現在の問題の次から順に条件に合う問題を探す(最後まで行ったら先頭へ戻る)
    function jumpTo(pred) {
      for (let k = 1; k <= n; k++) {
        const i = (s.current + k) % n;
        if (pred(i)) { go(i); return; }
      }
    }

    function go(i) {
      if (i < 0 || i >= n) return;
      s.current = i;
      persist();
      paintAll();
      const top = qcard.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) window.scrollTo(0, 0);
    }

    function choose(ci) {
      const i = s.current;
      s.answers[i] = s.answers[i] === ci ? null : ci;
      persist();
      paintAll();
      const btn = qcard.querySelector(`[data-choice="${ci}"]`);
      if (btn && document.activeElement !== btn && document.activeElement && document.activeElement.closest && document.activeElement.closest(`.exam-q-card`)) btn.focus();
    }

    function toggleFlag() {
      const i = s.current;
      s.flags[i] = !s.flags[i];
      persist();
      paintAll();
      const flagBtn = qcard.querySelector(`[data-role="flag"]`);
      if (flagBtn) flagBtn.focus();
    }

    function finish(finishedAt, message) {
      if (finished) return;
      finished = true;
      cleanupRun();
      if (navSheet) navSheet.close();
      const entry = finalizeSession(s, finishedAt);
      if (message) UI.toast(message);
      Router.navigate(`#exam/result/${s.mode === `retry` ? `retry` : entry.id}`);
    }

    async function submit() {
      const unanswered = s.answers.filter((a) => a === null).length;
      const flagged = s.flags.filter(Boolean).length;
      const lines = [];
      if (unanswered) lines.push(`未回答が<strong>${unanswered}問</strong>あります(未回答は不正解として採点します)。`);
      if (flagged) lines.push(`見直しの印が${flagged}問に付いています。`);
      if (!lines.length) lines.push(`すべての問題に回答済みです。`);
      const ok = await UI.confirm(`${lines.join(`<br>`)}<br>提出して採点しますか?`, { confirmLabel: `提出する`, cancelLabel: `問題に戻る` });
      if (!ok || finished || !wrap.isConnected) return;
      finish(Date.now());
    }

    prevBtn.addEventListener(`click`, () => go(s.current - 1));
    nextBtn.addEventListener(`click`, () => { if (s.current === n - 1) submit(); else go(s.current + 1); });
    wrap.querySelector(`[data-role="submit"]`).addEventListener(`click`, submit);
    wrap.querySelector(`[data-role="suspend"]`).addEventListener(`click`, () => {
      persist();
      UI.toast(s.timed ? `保存して中断しました(時計は止まりません)` : `保存して中断しました`, `success`);
      Router.navigate(`#exam`);
    });
    wrap.querySelector(`[data-role="open-nav"]`).addEventListener(`click`, () => {
      navSheet = UI.sheet({ title: `問題一覧`, content: navHtml(), onClose: () => { navSheet = null; } });
      navSheet.el.classList.add(`exam-nav-sheet`);
      wireNav(navSheet.body, () => { if (navSheet) navSheet.close(); });
      const currentCell = navSheet.body.querySelector(`[aria-current="true"]`);
      if (currentCell) currentCell.focus();
    });
    wireNav(sideNav);

    // ---- タイマー(バックグラウンドで間引かれても、毎回 期限−現在時刻 から計算し直す) ----
    const announced = new Set();
    if (s.timed) {
      const rem0 = s.deadline - Date.now();
      ANNOUNCE_MINUTES.forEach((m) => { if (rem0 <= m * 60000) announced.add(m); });
    }
    function tick() {
      if (!wrap.isConnected) { cleanupRun(); return; }
      const now = Date.now();
      if (s.timed) {
        const rem = s.deadline - now;
        if (rem <= 0) { finish(s.deadline, `時間になりました。自動で提出して採点しました`); return; }
        timerValue.textContent = fmtClock(rem);
        timerEl.classList.toggle(`is-warn`, rem <= 10 * 60000 && rem > 5 * 60000);
        timerEl.classList.toggle(`is-danger`, rem <= 5 * 60000);
        ANNOUNCE_MINUTES.forEach((m) => {
          if (rem <= m * 60000 && !announced.has(m)) {
            announced.add(m);
            live.textContent = `残り${m}分です`;
          }
        });
      } else {
        timerValue.textContent = fmtClock(now - s.startedAt);
      }
    }
    tick();
    tickTimer = setInterval(tick, 1000);

    // ---- キーボード操作 ----
    keyHandler = (e) => {
      if (!wrap.isConnected) { cleanupRun(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ae = document.activeElement;
      const tag = (ae && ae.tagName) || ``;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (ae && ae.isContentEditable)) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      const q = s.questions[s.current];
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= q.choices.length) {
        e.preventDefault();
        choose(Number(e.key) - 1);
      } else if (e.key === `ArrowRight`) {
        if (s.current < n - 1) { e.preventDefault(); go(s.current + 1); }
      } else if (e.key === `ArrowLeft`) {
        if (s.current > 0) { e.preventDefault(); go(s.current - 1); }
      } else if (e.key === `f` || e.key === `F`) {
        e.preventDefault();
        toggleFlag();
      }
    };
    document.addEventListener(`keydown`, keyHandler);

    paintAll();
  }

  // ===== 結果 =====

  function renderResult(root, id, opts) {
    opts = opts || {};
    const isRetry = id === `retry`;
    let entry = null;
    if (isRetry) {
      const r = Storage.get(RETRY_RESULT_KEY, null);
      entry = validEntry(r) ? r : null;
    } else {
      entry = readHistory().find((e) => e.id === id) || null;
    }

    const wrap = document.createElement(`div`);
    wrap.className = `view exam-view exam-result`;
    if (!entry) {
      wrap.innerHTML = `<h2>模擬試験の結果</h2>`;
      wrap.appendChild(UI.emptyState({ icon: `search`, title: `結果が見つかりません`, body: `履歴は直近${HISTORY_MAX}回分まで保存されます。`, cta: { label: `模擬試験のメニューへ`, nav: `#exam` } }));
      root.appendChild(wrap);
      return;
    }

    const cats = categories();
    const wrong = Array.isArray(entry.wrong) ? entry.wrong.filter(validQuestion) : [];
    const byCat = entry.byCategory && typeof entry.byCategory === `object` ? entry.byCategory : {};
    const line = passLine(entry.total);
    const passed = entry.score >= line;
    const pct = Math.round((entry.score / entry.total) * 100);
    const type = examTypeData() || {};
    const lineNote = entry.mode === `full` && entry.total === (type.totalQuestions || 50)
      ? (type.targetNote || `35点はこのアプリ独自の目安です(合格点は毎年変わります)`)
      : `目安${line}問は、このアプリ独自の目安${type.targetScore || 35}点(${type.totalQuestions || 50}問中)を${entry.total}問に換算したものです。本試験の合格点は毎年変わります。`;
    const notices = Array.isArray(entry.notices) ? entry.notices.filter((x) => typeof x === `string`) : [];

    // 分野別(カテゴリの並び順。分野外の問題があれば最後に)
    const catRows = cats.filter((c) => byCat[c.id] && byCat[c.id].total > 0).map((c) => ({ id: c.id, name: c.name, correct: byCat[c.id].correct || 0, total: byCat[c.id].total }));
    Object.keys(byCat).forEach((cid) => {
      if (!catById(cid) && byCat[cid] && byCat[cid].total > 0) catRows.push({ id: cid, name: `その他`, correct: byCat[cid].correct || 0, total: byCat[cid].total });
    });
    const weakest = catRows.filter((r) => catById(r.id)).slice().sort((a, b) => (a.correct / a.total - b.correct / b.total) || (b.total - a.total))[0];
    const weakTopic = weakest ? topicForCategory(weakest.id) : null;
    let weakHtml = ``;
    if (weakest && weakest.correct < weakest.total) {
      const wpct = Math.round((weakest.correct / weakest.total) * 100);
      weakHtml = `
        <div class="exam-weak">
          <p>${ic(`target`, 18)} いちばん正答率が低かったのは<strong>「${esc(weakest.name)}」(${weakest.correct}/${weakest.total}問・${wpct}%)</strong>です。まずはこの分野の基礎を見直しましょう。</p>
          <div class="chip-row">
            ${weakTopic ? `<a class="chip chip-small" href="#topics/${weakTopic.id}">${ic(weakTopic.icon || `book-open`, 14)}${esc(weakTopic.name)}を学ぶ</a>` : ``}
            <a class="chip chip-small" href="#quiz">${ic(`pencil-check`, 14)}クイズで練習</a>
          </div>
        </div>`;
    } else if (catRows.length) {
      weakHtml = `<p class="exam-weak">${ic(`check-circle`, 18)} すべての分野で全問正解でした。</p>`;
    }

    const timeText = entry.timed && entry.limitMin
      ? `${fmtDuration(entry.durationSec || 0)}(制限${entry.limitMin}分)`
      : `${fmtDuration(entry.durationSec || 0)}(時間制限なし)`;

    wrap.innerHTML = `
      <h2>${isRetry ? `解き直しの結果` : `模擬試験の結果`}</h2>
      ${opts.autoGraded ? `<p class="exam-notice">${ic(`alert`, 18)}<span>制限時間を過ぎていたため、保存されていた回答で自動的に採点しました。</span></p>` : ``}
      <section class="card exam-result-hero ${isRetry ? `` : passed ? `is-pass` : `is-fail`}">
        <div class="exam-result-top">
          <p class="exam-score" aria-label="${entry.total}問中${entry.score}問正解"><span class="exam-score-value num">${entry.score}</span><span class="exam-score-total num">/ ${entry.total}問</span></p>
          ${isRetry ? `` : `<p class="exam-verdict">${ic(passed ? `trophy` : `target`, 20)}${passed ? `目安ライン到達` : `目安まであと${line - entry.score}問`}</p>`}
        </div>
        <div class="progress-bar progress-bar-lg exam-score-bar" aria-hidden="true">
          <div class="progress-bar-fill ${passed ? `fill-success` : ``}" style="width:${pct}%"></div>
          ${isRetry ? `` : `<span class="exam-score-line" style="left:${Math.round((line / entry.total) * 100)}%"></span>`}
        </div>
        ${isRetry
          ? `<p class="exam-result-note">解き直しの結果は、受験履歴と最高スコアには記録されません。</p>`
          : `<p class="exam-result-note">目安ライン: ${line}問(${entry.total}問中)。${esc(lineNote)}</p>`}
        <dl class="exam-result-meta">
          <div><dt>実施</dt><dd>${esc(fmtDateTime(entry.finishedAt || entry.startedAt))}</dd></div>
          <div><dt>形式</dt><dd>${esc(modeText(entry.mode, entry.total))}</dd></div>
          <div><dt>時間</dt><dd>${esc(timeText)}</dd></div>
          <div><dt>正答率</dt><dd class="num">${pct}%</dd></div>
        </dl>
      </section>
      ${notices.length ? `<div class="exam-notice">${ic(`info`, 18)}<div>${notices.map((x) => `<p>${esc(x)}</p>`).join(``)}</div></div>` : ``}
      ${catRows.length ? `
      <section class="card" aria-labelledby="exam-cat-title">
        <h3 class="card-title" id="exam-cat-title">分野別の正答</h3>
        <div class="cat-bars exam-cat-bars">
          ${catRows.map((r) => {
            const p = Math.round((r.correct / r.total) * 100);
            const fill = p >= 70 ? `fill-success` : p < 50 ? `exam-fill-low` : ``;
            return `
            <div>
              <div class="cat-bar-head"><span class="cat-bar-name">${esc(r.name)}</span><span class="cat-bar-meta">${r.correct}/${r.total}問・${p}%</span></div>
              <div class="progress-bar"><div class="progress-bar-fill ${fill}" style="width:${p}%"></div></div>
            </div>`;
          }).join(``)}
        </div>
        ${weakHtml}
      </section>` : ``}
      <div class="exam-result-actions">
        ${wrong.length ? `<button type="button" class="btn" data-role="retry">${ic(`repeat`)}間違えた問題だけ解き直す(${wrong.length}問)</button>` : ``}
        ${isRetry ? `<a class="btn btn-secondary" href="#exam">${ic(`timer`)}模擬試験のメニューへ</a>` : `<button type="button" class="btn btn-secondary" data-role="again">${ic(`refresh`)}もう一度受ける</button>`}
        <a class="btn btn-ghost" href="#home">${ic(`home`)}ホームへ</a>
      </div>
      <section aria-labelledby="exam-wrong-title" class="exam-wrong">
        <div class="section-head"><h3 id="exam-wrong-title">${wrong.length ? `間違えた問題・未回答(${wrong.length}問)` : `間違えた問題`}</h3></div>
        ${wrong.length && !isRetry ? `<p class="view-desc">用語集にある用語は「今日の復習」に追加済みです。</p>` : ``}
        <div class="exam-wrong-list" data-role="wrong-list"></div>
      </section>
    `;
    root.appendChild(wrap);

    const list = wrap.querySelector(`[data-role="wrong-list"]`);
    if (!wrong.length) {
      list.appendChild(UI.emptyState({ icon: `trophy`, title: `間違えた問題はありません`, body: `この調子で、別の形式やフルでも試してみましょう。` }));
    } else {
      list.innerHTML = wrong.map((w) => wrongItemHtml(w)).join(``);
    }

    const retryBtn = wrap.querySelector(`[data-role="retry"]`);
    if (retryBtn) retryBtn.addEventListener(`click`, () => startRetry(Object.assign({}, entry, { wrong })));
    const againBtn = wrap.querySelector(`[data-role="again"]`);
    if (againBtn) {
      againBtn.addEventListener(`click`, () => {
        pref.mode = entry.mode === `short` ? `short` : `full`;
        pref.timed = !!entry.timed;
        startNew(pref.mode, pref.timed);
      });
    }
  }

  // 選択肢ごとの解説(あれば)
  function noteOf(w, i) {
    const n = Array.isArray(w.notes) ? w.notes[i] : ``;
    return n ? `<span class="exam-choice-note">${esc(n)}</span>` : ``;
  }

  function wrongItemHtml(w) {
    const chosen = Number.isInteger(w.chosen) && w.chosen >= 0 && w.chosen < w.choices.length ? w.chosen : null;
    const term = w.termId ? AppIndex.termsById[w.termId] : null;
    // 「用語を選ぶ」問題は解説=問題文になるので重ねて出さない
    const showExplain = w.explanation && w.explanation !== w.stem;
    const links = [];
    if (w.kind === `fixed` && w.refId) links.push(`<a class="chip chip-small chip-muted" href="#quiz/q/${encodeURIComponent(w.refId)}">${ic(`pencil-check`, 14)}確認問題を開く</a>`);
    if (term) links.push(`<a class="chip chip-small chip-muted" href="#glossary/${encodeURIComponent(term.id)}">${ic(`layers`, 14)}用語集: ${esc(term.name)}</a>`);
    return `
      <article class="card exam-wrong-item">
        <div class="exam-q-head">
          ${Number.isInteger(w.no) ? `<span class="exam-q-num num">問${w.no}</span>` : ``}
          ${w.categoryId ? `<span class="badge badge-soft">${esc(catName(w.categoryId))}</span>` : ``}
          ${chosen === null ? `<span class="review-status exam-status-skip">未回答</span>` : `<span class="review-status review-status-ng">${ic(`x-circle`, 12)}不正解</span>`}
        </div>
        ${w.prompt ? `<p class="exam-q-prompt">${esc(w.prompt)}</p>` : ``}
        <p class="exam-stem">${esc(w.stem)}</p>
        <dl class="exam-compare">
          <div class="exam-compare-row is-yours"><dt>${ic(chosen === null ? `info` : `x-circle`, 16)}あなたの解答</dt><dd>${chosen === null ? `未回答` : `${chosen + 1}. ${esc(w.choices[chosen])}${noteOf(w, chosen)}`}</dd></div>
          <div class="exam-compare-row is-correct"><dt>${ic(`check-circle`, 16)}正解</dt><dd>${w.correctIndex + 1}. ${esc(w.choices[w.correctIndex])}${noteOf(w, w.correctIndex)}</dd></div>
        </dl>
        ${showExplain ? `<p class="quiz-explanation"><strong>解説</strong> ${esc(w.explanation)}</p>` : ``}
        ${links.length ? `<div class="chip-row exam-wrong-links">${links.join(``)}</div>` : ``}
      </article>`;
  }

  return {
    render,
    // テスト・他画面からの参照用
    _internal: { buildExam, createSession, createRetrySession, gradeSession, finalizeSession, loadSession, passLine, modeDef, isExpired },
  };
})();
