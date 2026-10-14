// 模擬試験(宅建士・本番形式): 問題数・制限時間・分野配分を本試験に合わせ、アプリ内の問題から出題する
// ルート: #exam(受験メニュー・履歴) / #exam/short・#exam/full(形式を選んだ状態でメニュー) / #exam/run(受験中) / #exam/result/<id>(結果)
// 保存キー: examSession(受験中の状態) / examHistory(結果の履歴、新しい順・最大30件) / examRetryResult(直近の解き直し結果)
// 古い形式の保存データ(activeMs・asked・flagged・truths・style などが無いもの)もそのまま読めるようにしている
// v12: 個数・組合せの問題(style と記述ア〜エ statements を持つ。並べ替えない)を分野ごとの枠で出題する。
//      採点時に解答を AnswerLog に記録し、見直し印を付けて正解した問題は「自信なし」として扱う(結果の unsure にその数)
// 履歴の容量: 問題文・選択肢まで残すのは新しい5回分だけ。それより古い回の4択問題は ID と解答(と選択肢の並び)だけにし
// (compact: true)、結果を開いたときに今のデータから問題文を復元する。データから消えた問題は「現在のデータにありません」と出す
window.Views = window.Views || {};
window.Views.exam = (function () {
  const TYPE_ID = `takken`;
  const SESSION_KEY = `examSession`;
  const HISTORY_KEY = `examHistory`;
  const RETRY_RESULT_KEY = `examRetryResult`;
  const HISTORY_MAX = 30;
  const HISTORY_FULL = 5; // 問題文まで残す新しい回数(それより古い回は ID だけにする)
  const HISTORY_SHOW = 5; // 受験メニューで最初に見せる履歴の件数
  const RECENT_EXAMS = 2; // 直近この回数に出した問題は後回しにする
  const STORAGE_PREFIX = `shojikiLearn.v1.`;
  const SHORT_QUOTAS = { kenri: 6, horei: 3, zei: 1, gyoho: 8, menjo: 2 };
  const SHORT_TOTAL = 20;
  // 個数問題・組合せ問題(style: count / combo)を各分野に入れる数(このアプリの目安。上限も兼ねる)。
  // 本試験でも業法を中心に出るので、フルは業法4・権利関係1・法令上の制限1、ショートは業法2。ほかの分野には入れない
  // (直近の模擬試験に出した問題を後回しにする決まりのほうを優先するので、収録数が少ないうちは枠より少なくなることがある)
  const STYLED_QUOTAS = { full: { gyoho: 4, kenri: 1, horei: 1 }, short: { gyoho: 2 } };
  const ANNOUNCE_MINUTES = [10, 5, 1];
  const PACE_INTERVAL = 15000; // ペース表示の更新間隔
  const GOOD_PCT = 70; // 分野の正答率がこれ未満なら「次にやること」に挙げる
  const SUBMIT_CHIP_MAX = 12; // 提出前の確認で番号を並べる上限
  const WRONG_SHOW = 10; // 結果の「間違えた問題」で最初に見せる数
  const LEVELS = [`超入門`, `初級`, `中級`, `上級`];
  const RETIO_URL = `https://www.retio.or.jp/exam/exam_detail/`;
  const COUNT_UP_MS = 600; // 採点直後の得点のカウントアップ
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  // 受験メニューで選んだ設定(画面を行き来しても保持)
  const pref = { mode: `full`, timed: true };
  // 採点した直後に開く結果(この結果だけ得点をカウントアップする。履歴から開いたとき・戻る/再読み込みでは動かさない)
  let freshResult = null;

  // 受験中のタイマー・キー操作・経過時間の記録(画面を離れたら必ず解除する)
  let tickTimer = null;
  let keyHandler = null;
  let runCleanup = null;
  function cleanupRun() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (keyHandler) { document.removeEventListener(`keydown`, keyHandler); keyHandler = null; }
    if (runCleanup) { const f = runCleanup; runCleanup = null; f(); }
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
      return { id: `short`, label: `ショート`, total: SHORT_TOTAL, minutes: Math.round((fullMinutes * SHORT_TOTAL) / fullTotal), quotas: SHORT_QUOTAS, styled: STYLED_QUOTAS.short };
    }
    if (mode === `retry`) return { id: `retry`, label: `解き直し`, total: null, minutes: null, quotas: null, styled: null };
    const quotas = {};
    categories().forEach((c) => { quotas[c.id] = c.questions || 0; });
    return { id: `full`, label: `フル`, total: fullTotal, minutes: fullMinutes, quotas, styled: STYLED_QUOTAS.full };
  }

  // 目安のペース(1問あたりの秒数)。解き直しにはない
  function guideSecPerQuestion(mode) {
    const def = modeDef(mode);
    return def.minutes && def.total ? (def.minutes * 60) / def.total : null;
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

  // ===== 個数問題・組合せ問題(記述ア〜エを持つ問題) =====
  // 保存した問題は style と statements: [{ key, label, text, truth, note }] を持つ(通常の4択は持たない)。
  // 選択肢も記述も並べ替えない(「一つ〜四つ」「ア、イ」は順番そのものが意味を持つため)

  // 保存した問題の形式(知らない値は通常の4択として扱う)
  function styleOfQ(q) {
    return q && (q.style === `count` || q.style === `combo`) ? q.style : null;
  }

  // 記述ア〜エが使える形か(インポートされたデータも来るので型を確かめる)
  function validStatements(list) {
    return Array.isArray(list) && list.length >= 2 && list.length <= 6 && list.every((x) => !!x && typeof x === `object`
      && typeof x.label === `string` && !!x.label && typeof x.text === `string` && !!x.text && typeof x.truth === `boolean`
      && (x.note === undefined || x.note === null || typeof x.note === `string`));
  }

  // 保存用の形に写す(問題エンジンの note は getter のことがあるので、値として持たせる)
  function packStatements(list) {
    return list.map((x) => ({ key: typeof x.key === `string` ? x.key : ``, label: x.label, text: x.text, truth: x.truth, note: typeof x.note === `string` ? x.note : `` }));
  }

  // 個数・組合せの問題なら { style, statements } を返す(問題に足す用)。記述が壊れていれば null
  function styledPart(q) {
    const style = styleOfQ(q);
    return style && validStatements(q.statements) ? { style, statements: packStatements(q.statements) } : null;
  }

  // 問題IDから今のデータの4択問題を引く(データは読み込み後に変わらないので1回だけ作る)
  let quizMap = null;
  function quizItem(id) {
    if (!quizMap) {
      quizMap = Object.create(null);
      (window.APP_DATA.quiz || []).forEach((q) => { if (q && typeof q.id === `string`) quizMap[q.id] = q; });
    }
    return typeof id === `string` && quizMap[id] ? quizMap[id] : null;
  }

  // order: 出題したときの選択肢の並び(i 番目に表示した選択肢 = データの order[i] 番目)。0〜n−1 を1回ずつ含むものだけ使う
  function isPermutation(order, n) {
    if (!Array.isArray(order) || order.length !== n || !n) return false;
    const seen = new Set();
    return order.every((x) => Number.isInteger(x) && x >= 0 && x < n && !seen.has(x) && seen.add(x));
  }

  // 4択問題の選択肢の並びを、データの選択肢の文と突き合わせて求める(求められなければ null)
  function orderFromTexts(texts, item) {
    if (!QuizEngine.isMcItem(item) || !Array.isArray(texts)) return null;
    const order = texts.map((t) => item.choices.indexOf(t));
    return isPermutation(order, item.choices.length) ? order : null;
  }

  // ===== 出題 =====

  function promptFor(type) {
    if (type === `name-from-def`) return `次の説明にあてはまる用語はどれか。`;
    if (type === `def-from-name`) return `次の用語の説明として最も適切なものはどれか。`;
    return ``;
  }

  // 問題オブジェクトを保存用の形に固定する(再開しても同じ問題・同じ選択肢順になるように)
  // 4択の確認問題には選択肢の並び(order)も残す(古い履歴で問題文を省いても、今のデータから同じ並びで復元できるように)
  // 個数・組合せの問題は style と記述ア〜エ(statements)も持たせる
  function packQuestion(q, catId) {
    const order = q.kind === `fixed` ? orderFromTexts(q.choices.map((c) => c.text), quizItem(q.refId)) : null;
    const styled = q.kind === `fixed` ? styledPart(q) : null;
    return Object.assign({
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
      // 選択肢ごとの記述の正誤(「正しいもの/誤っているものはどれか」型のみ)。結果で○×を付けるのに使う
      truths: q.choices.length && q.choices.every((c) => typeof c.truth === `boolean`) ? q.choices.map((c) => c.truth) : null,
    }, order ? { order } : null, styled);
  }

  // 直近の模擬試験で出した問題: refId → 2(前回) / 1(前々回)。asked を持たない古い記録は使わない
  function recentAsked() {
    const map = Object.create(null);
    readHistory().slice(0, RECENT_EXAMS).forEach((e, k) => {
      if (!Array.isArray(e.asked)) return;
      const rank = RECENT_EXAMS - k;
      e.asked.forEach((id) => { if (typeof id === `string` && !(map[id] >= rank)) map[id] = rank; });
    });
    return map;
  }

  // 分野ごとに 4択の確認問題 → 用語からの自動生成 の順で配分どおりに選ぶ。
  // 足りない分野は、残りの多い分野から順番に1問ずつ補充する。
  // recent(省略可): 直近に出した問題。シャッフルしたうえで、出していない問題 → 前々回 → 前回 の順に並べ替える
  // 個数・組合せの問題は分野ごとの枠(STYLED_QUOTAS)の数だけ先に選び、枠を超える分は最後に回す
  function buildExam(mode, recent) {
    const def = modeDef(mode);
    const cats = categories();
    const styledQuota = def.styled || {};
    const seen = recent || Object.create(null);
    const rankOf = (id) => seen[id] || 0;
    const later = (list, idOf) => list.map((x, i) => ({ x, i, r: rankOf(idOf(x)) }))
      .sort((a, b) => (a.r - b.r) || (a.i - b.i)).map((o) => o.x);
    // list は later で並べた後のもの。枠に入れる個数・組合せの問題(直近に出していない順に quota 問)は、
    // 同じ順位(出していない/前々回/前回)の通常の問題より前に置く(直近に出した問題を後回しにする決まりは崩さない)。
    // 枠に入らなかった個数・組合せの問題は最後に回し、通常の問題が尽きたときだけ使う
    const styledFirst = (list, quota) => {
      const styled = list.filter((q) => QuizEngine.styleOf(q));
      if (!styled.length) return list;
      const pick = new Set(styled.slice(0, quota));
      const head = list.filter((q) => !QuizEngine.styleOf(q) || pick.has(q))
        .map((q, i) => ({ q, i, r: rankOf(q.id), g: pick.has(q) ? 0 : 1 }))
        .sort((a, b) => (a.r - b.r) || (a.g - b.g) || (a.i - b.i)).map((o) => o.q);
      return head.concat(styled.filter((q) => !pick.has(q)));
    };
    const usedTerms = new Set();
    const pools = {};
    const repeats = {};
    cats.forEach((c) => {
      pools[c.id] = {
        fixed: styledFirst(later(QuizEngine.shuffle(mcItemsIn(c.id)), (q) => q.id), styledQuota[c.id] || 0),
        terms: later(QuizEngine.shuffle(Stats.termsInCategory(TYPE_ID, c.id)), (t) => t.id),
      };
    });

    function picked(q, catId) {
      const r = rankOf(q.refId);
      if (r) {
        if (!repeats[catId]) repeats[catId] = { 1: 0, 2: 0 };
        repeats[catId][r] += 1;
      }
      return packQuestion(q, catId);
    }

    function draw(catId) {
      const p = pools[catId];
      while (p.fixed.length) {
        const item = p.fixed.shift();
        const q = QuizEngine.fromFixedMc(item);
        if (!q || q.choices.findIndex((c) => c.correct) < 0) continue;
        // 記述ア〜エが読めない個数・組合せの問題は出さない(問題文だけでは答えられないため)
        if (QuizEngine.styleOf(q) && !validStatements(q.statements)) continue;
        if (item.relatedTermId) usedTerms.add(item.relatedTermId);
        return picked(q, catId);
      }
      while (p.terms.length) {
        const t = p.terms.shift();
        if (usedTerms.has(t.id)) continue;
        const q = QuizEngine.buildQuestionForTerm(t);
        if (!q) continue;
        usedTerms.add(t.id);
        return picked(q, catId);
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
    // 収録問題が少なく、直近の模擬試験と同じ問題を出すしかなかった分野
    cats.forEach((c) => {
      const r = repeats[c.id];
      if (!r) return;
      const parts = [r[2] ? `前回と同じ問題が${r[2]}問` : ``, r[1] ? `前々回と同じ問題が${r[1]}問` : ``].filter(Boolean);
      notices.push(`「${c.name}」は収録問題が${mcItemsIn(c.id).length}問のため、${parts.join(`・`)}含まれます。`);
    });

    // 個数・組合せの問題は枠のぶん先に選ぶので、そのままだと分野の最初にかたまる。分野の中で確認問題の順を混ぜ直す
    // (用語から作った問題は従来どおり分野の最後)
    cats.forEach((c) => {
      const list = byCat[c.id];
      if (!list.some((q) => styleOfQ(q))) return;
      byCat[c.id] = QuizEngine.shuffle(list.filter((q) => q.kind === `fixed`)).concat(list.filter((q) => q.kind !== `fixed`));
    });
    const questions = [];
    cats.forEach((c) => { byCat[c.id].forEach((q) => questions.push(q)); });
    return { questions, notices };
  }

  function createSession(mode, timed) {
    const now = Date.now();
    const def = modeDef(mode);
    const built = buildExam(mode, recentAsked());
    return {
      v: 1,
      id: `ex_${now}`,
      examTypeId: TYPE_ID,
      mode,
      timed: !!timed,
      startedAt: now,
      deadline: timed ? now + def.minutes * 60000 : null,
      // 受験画面を開いていた時間の合計(中断中は数えない)。時間制限なしの「経過」に使う
      activeMs: 0,
      current: 0,
      questions: built.questions,
      answers: built.questions.map(() => null),
      flags: built.questions.map(() => false),
      notices: built.notices,
    };
  }

  function validTruths(q) {
    return Array.isArray(q.truths) && q.truths.length === q.choices.length && q.truths.every((b) => typeof b === `boolean`);
  }

  function validNotes(q) {
    return Array.isArray(q.notes) && q.notes.length === q.choices.length;
  }

  // 選択肢の並びを入れ替える(選択肢ごとの解説・正誤も一緒に動かし、正解の位置を付け直す)
  // 個数・組合せの問題は並べ替えない(同じ形に写すだけ。記述ア〜エもそのまま)
  function reshuffleQuestion(w) {
    const styled = styledPart(w);
    const ids = w.choices.map((_, i) => i);
    const order = styled ? ids : QuizEngine.shuffle(ids);
    const notes = validNotes(w) ? w.notes : null;
    const truths = validTruths(w) ? w.truths : null;
    const dataOrder = isPermutation(w.order, w.choices.length) ? w.order : null;
    return Object.assign({
      kind: w.kind, refId: w.refId, termId: w.termId || null, categoryId: w.categoryId || null,
      level: w.level || ``, type: w.type || ``, prompt: w.prompt || ``, stem: w.stem,
      choices: order.map((i) => w.choices[i]),
      correctIndex: order.indexOf(w.correctIndex),
      explanation: w.explanation || ``,
      notes: notes ? order.map((i) => String(notes[i] || ``)) : null,
      truths: truths ? order.map((i) => truths[i]) : null,
    }, dataOrder ? { order: order.map((i) => dataOrder[i]) } : null, styled);
  }

  // 結果の「間違えた問題」(と、選べば見直し印を付けて正解した問題)から、時間制限なしの解き直しセッションを作る(履歴には残さない)
  function createRetrySession(entry, opts) {
    opts = opts || {};
    const now = Date.now();
    const extra = opts.includeFlagged && Array.isArray(entry.flaggedOk) ? entry.flaggedOk : [];
    const src = (entry.wrong || []).concat(extra).filter(validQuestion)
      .map((w, i) => ({ w, i, no: Number.isInteger(w.no) ? w.no : Infinity }))
      .sort((a, b) => (a.no - b.no) || (a.i - b.i))
      .map((o) => o.w);
    const questions = src.map(reshuffleQuestion);
    return {
      v: 1,
      id: `ex_${now}`,
      examTypeId: TYPE_ID,
      mode: `retry`,
      timed: false,
      startedAt: now,
      deadline: null,
      activeMs: 0,
      current: 0,
      questions,
      answers: questions.map(() => null),
      flags: questions.map(() => false),
      notices: [],
      retryOf: entry.id,
    };
  }

  // ===== 保存・読み込み(インポートされたデータも来るので型を必ず確認) =====

  // 個数・組合せの問題(style あり)は記述ア〜エもそろっていること(記述がないと問題文だけでは答えられない)
  function validQuestion(q) {
    return !!q && typeof q === `object` && typeof q.stem === `string` && Array.isArray(q.choices) && q.choices.length >= 2
      && q.choices.every((c) => typeof c === `string`) && Number.isInteger(q.correctIndex)
      && q.correctIndex >= 0 && q.correctIndex < q.choices.length
      && (!styleOfQ(q) || validStatements(q.statements));
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
    // 以前の版で始めた試験には activeMs がない(その場合は従来どおり開始時刻からの経過で数える)
    s.activeMs = typeof s.activeMs === `number` && Number.isFinite(s.activeMs) && s.activeMs >= 0 ? s.activeMs : null;
    s.examTypeId = TYPE_ID;
    return s;
  }

  function saveSession(s) {
    Storage.set(SESSION_KEY, s);
  }

  function clearSession() {
    // Storage.remove があればそれで消す(保存できなかった受験中のデータを「古い記録を整理」で書き戻さないように)
    if (typeof Storage.remove === `function`) { Storage.remove(SESSION_KEY); return; }
    try { localStorage.removeItem(STORAGE_PREFIX + SESSION_KEY); } catch (e) { Storage.set(SESSION_KEY, null); }
  }

  function isExpired(s, now) {
    return !!(s && s.timed && typeof s.deadline === `number` && s.deadline <= (now || Date.now()));
  }

  // 得点は 0〜問題数の整数だけを使う(壊れたバックアップの 60/50 や −3/20 で、割合が100%を超えたり棒がはみ出したりしないように)
  function validEntry(e) {
    return !!e && typeof e === `object` && typeof e.id === `string` && Number.isInteger(e.total) && e.total > 0
      && Number.isInteger(e.score) && e.score >= 0 && e.score <= e.total;
  }

  function readHistory() {
    return Stats.examHistory().filter(validEntry);
  }

  // ===== 採点 =====

  // 結果に残す問題の形(間違えた問題・見直し印を付けて正解した問題)
  function snapshot(q, i, chosen, flagged) {
    // flagged は付けたときだけ持たせる(履歴の容量を抑える)
    return Object.assign({
      no: i + 1, kind: q.kind, refId: q.refId, termId: q.termId || null, categoryId: q.categoryId || null,
      level: q.level || ``, type: q.type || ``, prompt: q.prompt || ``, stem: q.stem, choices: q.choices.slice(),
      correctIndex: q.correctIndex, chosen, explanation: q.explanation || ``,
      notes: validNotes(q) ? q.notes.slice() : null,
      truths: validTruths(q) ? q.truths.slice() : null,
    }, isPermutation(q.order, q.choices.length) ? { order: q.order.slice() } : null, styledPart(q), flagged ? { flagged: true } : null);
  }

  // ===== 履歴の容量を抑える(古い回は問題文を省き、ID と解答だけにする) =====

  // 省いた問題: 選択肢の文(choices)を持たず、問題ID(refId)がある
  function isCompactItem(w) {
    return !!w && typeof w === `object` && !Array.isArray(w) && !Array.isArray(w.choices) && typeof w.refId === `string`;
  }

  // 1問を省いた形にする。今のデータから同じ問題・同じ並びに戻せる4択の確認問題だけを省き、
  // 戻せないもの(用語から作った問題・データの文や正解が変わった問題)は全文のまま残す
  // 個数・組合せの問題は、今のデータも同じ形式で記述ア〜エが読めるときだけ省く(記述は開いたときに今のデータから戻す)
  function compactQuestion(w) {
    if (!validQuestion(w) || w.kind !== `fixed`) return w;
    const item = quizItem(w.refId);
    if (!QuizEngine.isMcItem(item) || item.choices.length !== w.choices.length) return w;
    const style = styleOfQ(w);
    if (style !== QuizEngine.styleOf(item) || (style && !QuizEngine.hasStatements(item))) return w;
    const order = isPermutation(w.order, w.choices.length) ? w.order : orderFromTexts(w.choices, item);
    if (!order || order[w.correctIndex] !== item.correctIndex) return w;
    const c = {
      no: Number.isInteger(w.no) ? w.no : null, kind: `fixed`, refId: w.refId, termId: w.termId || null, categoryId: w.categoryId || null,
      chosen: Number.isInteger(w.chosen) && w.chosen >= 0 && w.chosen < w.choices.length ? w.chosen : null,
      correctIndex: w.correctIndex, order: order.slice(),
    };
    // 形式は残す(戻すときに、今のデータの形式と食い違っていないか確かめるため)
    if (style) c.style = style;
    if (w.flagged === true) c.flagged = true;
    return c;
  }

  // 1回分の記録を省いた形にする(点数・分野別・出題記録などはそのまま)。失敗したら元のまま返す
  function compactEntry(e) {
    try {
      if (!validEntry(e)) return e;
      const conv = (list) => (Array.isArray(list) ? list.map(compactQuestion) : list);
      return Object.assign({}, e, { wrong: conv(e.wrong), flaggedOk: conv(e.flaggedOk), compact: true });
    } catch (err) {
      console.warn(`[exam] 履歴の整理に失敗しました`, err);
      return e;
    }
  }

  // 新しい keepFull 回分は全文のまま、それより古い回を省いた形にする
  function trimHistory(list, keepFull) {
    // 省いた形の記録をもう一度通しても変わらない(全文のまま残した問題も、毎回同じ判定で残る)
    return list.map((e, i) => (i < keepFull ? e : compactEntry(e)));
  }

  // 履歴を整理して保存する(容量不足のときなどに外から呼ぶ。Storage の「古い記録を整理」)
  // keepFull: 全文を残す新しい回数(省略時は5)。pending: 保存できなかった履歴(渡されたらそれを整理して保存する)
  // 戻り値: { ok: 保存できたか, saved: 減らした文字数 }
  function compactHistory(keepFull, pending) {
    const keep = Number.isInteger(keepFull) && keepFull >= 0 ? keepFull : HISTORY_FULL;
    const raw = Array.isArray(pending) ? pending : Storage.get(HISTORY_KEY, []);
    if (!Array.isArray(raw)) return { ok: true, saved: 0 };
    const before = JSON.stringify(raw).length;
    const list = trimHistory(raw.filter(validEntry).slice(0, HISTORY_MAX), keep);
    const after = JSON.stringify(list).length;
    // 保存済みの履歴が小さくならないときは書き直さない(保存できなかった履歴は必ず書き直す)
    if (!Array.isArray(pending) && after >= before) return { ok: true, saved: 0 };
    const ok = Storage.set(HISTORY_KEY, list);
    return { ok: !!ok, saved: ok ? Math.max(0, before - after) : 0 };
  }

  // 結果に表示する形に戻す。省いた問題は今のデータから問題文・選択肢・解説を復元する
  // 戻せないとき(データから消えた・正解が変わった)は missing: true の印だけを返す
  function expandQuestion(w) {
    if (validQuestion(w)) return w;
    if (!isCompactItem(w)) return null;
    const item = quizItem(w.refId);
    const base = w.kind === `fixed` && item ? QuizEngine.fromFixedMc(item, { keepOrder: true }) : null;
    const n = base ? base.choices.length : 0;
    const okIndex = (x) => Number.isInteger(x) && x >= 0 && x < n;
    const head = {
      no: Number.isInteger(w.no) ? w.no : null, kind: w.kind === `term` ? `term` : `fixed`, refId: w.refId,
      termId: typeof w.termId === `string` ? w.termId : null, categoryId: typeof w.categoryId === `string` ? w.categoryId : null,
    };
    if (w.flagged === true) head.flagged = true;
    // 個数・組合せの問題は、記録の形式(以前の版の記録は通常の4択)と今のデータの形式が同じで、記述ア〜エが読めるときだけ戻す
    const styled = base ? styledPart(base) : null;
    const styleOk = !!base && styleOfQ(w) === (base.style || null) && (!base.style || !!styled);
    if (!base || !styleOk || !isPermutation(w.order, n) || !okIndex(w.correctIndex) || w.order[w.correctIndex] !== item.correctIndex) {
      return Object.assign(head, { missing: true, chosen: Number.isInteger(w.chosen) ? w.chosen : null, correctIndex: Number.isInteger(w.correctIndex) ? w.correctIndex : null });
    }
    const list = w.order.map((i) => base.choices[i]);
    return Object.assign(head, styled, {
      termId: head.termId || base.termId || null,
      level: base.level || ``, type: `mc`, prompt: ``, stem: base.stem,
      choices: list.map((c) => c.text),
      correctIndex: w.correctIndex,
      chosen: okIndex(w.chosen) ? w.chosen : null,
      explanation: base.explanation || ``,
      notes: list.some((c) => c.note) ? list.map((c) => c.note || ``) : null,
      truths: list.every((c) => typeof c.truth === `boolean`) ? list.map((c) => c.truth) : null,
      order: w.order.slice(),
      restored: true,
    });
  }

  function gradeSession(s, finishedAt) {
    const end = s.timed && typeof s.deadline === `number` ? Math.min(finishedAt, s.deadline) : finishedAt;
    const byCategory = {};
    const wrong = [];
    const flagged = [];
    const flaggedOk = [];
    let score = 0;
    s.questions.forEach((q, i) => {
      const cid = q.categoryId || `other`;
      if (!byCategory[cid]) byCategory[cid] = { correct: 0, total: 0 };
      byCategory[cid].total += 1;
      const chosen = Number.isInteger(s.answers[i]) ? s.answers[i] : null;
      const flag = !!(Array.isArray(s.flags) && s.flags[i] === true);
      if (flag) flagged.push(i + 1);
      if (chosen === q.correctIndex) {
        byCategory[cid].correct += 1;
        score += 1;
        if (flag) flaggedOk.push(snapshot(q, i, chosen, true));
      } else {
        wrong.push(snapshot(q, i, chosen, flag));
      }
    });
    const def = modeDef(s.mode);
    // 時間制限なしは、受験画面を開いていた時間だけを数える(中断していた時間は含めない)
    const useActive = !s.timed && typeof s.activeMs === `number` && Number.isFinite(s.activeMs) && s.activeMs >= 0;
    const durationMs = useActive ? s.activeMs : end - s.startedAt;
    return {
      id: s.id,
      examTypeId: TYPE_ID,
      mode: s.mode,
      timed: !!s.timed,
      startedAt: s.startedAt,
      finishedAt: end,
      durationSec: Math.max(0, Math.round(durationMs / 1000)),
      limitMin: s.timed ? def.minutes : null,
      score,
      total: s.questions.length,
      byCategory,
      wrong,
      notices: s.notices || [],
      flagged,
      flaggedOk,
      // 次回以降、同じ問題を後回しにするための出題記録
      asked: s.questions.map((q) => q.refId).filter((x) => typeof x === `string`),
    };
  }

  // 解き直しの予定(Drill): 4択の確認問題を間違えたら翌日から出し直し、期限が来ていた問題に正解したら次の段階へ
  // 未回答は登録しない(解けなかったとは限らないため)。用語から作った問題は対象外
  // 見直し印を付けて正解した問題は進めない(期限が来た問題を当て推量の正解で次の段階・卒業に進めないように)。
  // その問題は続く noteAnswers → AnswerLog.recordMany → Drill.noteUnsure が「自信なし」として扱う
  function noteDrill(s) {
    if (!window.Drill) return;
    const unsureLater = !!(window.AnswerLog && typeof AnswerLog.recordMany === `function`);
    try {
      s.questions.forEach((q, i) => {
        if (!q || q.kind !== `fixed` || typeof q.refId !== `string`) return;
        const chosen = Number.isInteger(s.answers[i]) ? s.answers[i] : null;
        if (chosen === null) return;
        const ok = chosen === q.correctIndex;
        if (ok && unsureLater && Array.isArray(s.flags) && s.flags[i] === true) return;
        Drill.note(q.refId, ok, `exam`);
      });
    } catch (e) { console.error(`[解き直し] 模擬試験の結果を記録できませんでした`, e); }
  }

  // 結果に出す: 解き直しの予定に入れた(入れる)問題ID(間違えて回答した4択の確認問題。今のデータにあるものだけ)
  function drillIdsOf(wrong) {
    const out = [];
    if (!window.Drill) return out;
    wrong.forEach((w) => {
      if (w && w.kind === `fixed` && Number.isInteger(w.chosen) && typeof w.refId === `string` && !out.includes(w.refId) && Drill.isEligible(w.refId)) out.push(w.refId);
    });
    return out;
  }

  // v12: 日付つきの解答の記録(合格予測・バッジ用)。見直し印を付けて正解した問題は「自信なし」として記録し、
  // AnswerLog が解き直しの予定(3日後)にも入れる。noteDrill のあとに呼ぶ(Drill の3日後への前倒しが効くように)
  // 戻り値: 「自信なし」として記録した数(記録できる仕組みがない・失敗したときは null)
  function noteAnswers(s) {
    if (!window.AnswerLog || typeof AnswerLog.recordMany !== `function`) return null;
    try {
      const items = [];
      s.questions.forEach((q, i) => {
        if (!q || q.kind !== `fixed` || typeof q.refId !== `string`) return;
        const chosen = Number.isInteger(s.answers[i]) ? s.answers[i] : null;
        if (chosen === null) return;
        const ok = chosen === q.correctIndex;
        items.push({ quizId: q.refId, ok, unsure: ok && !!(Array.isArray(s.flags) && s.flags[i] === true) });
      });
      if (!items.length || !AnswerLog.recordMany(items, `exam`)) return 0;
      // AnswerLog が記録するのは今のデータにある4択の問題だけなので、同じ条件で数える
      return items.filter((it) => it.unsure && QuizEngine.isMcItem(quizItem(it.quizId))).length;
    } catch (e) {
      console.error(`[解答の記録] 模擬試験の結果を記録できませんでした`, e);
      return null;
    }
  }

  // 記録(解き直しの予定・解答の記録・復習・ストリーク)を済ませた試験: 試験ID → 「自信なし」の数。
  // 履歴を保存できずに受験中のデータが残った試験を、もう一度提出・自動採点したときに数え直さないようにする
  // (受験中のデータにも logged として残す。それも保存できないときは、このページを開いている間だけこの表で防ぐ)
  const loggedRuns = new Map();
  function loggedOf(s) {
    if (loggedRuns.has(s.id)) return { unsure: loggedRuns.get(s.id) };
    return Storage.isPlainObject(s.logged) ? s.logged : null;
  }
  function markLogged(s, entry, unsure) {
    const n = Number.isInteger(unsure) && unsure >= 0 ? unsure : null;
    loggedRuns.set(s.id, n);
    s.logged = { unsure: n };
    if (n !== null) entry.unsure = n;
  }

  // 採点して記録する。副作用(SRS・解き直しの予定・解答の記録・ストリーク・履歴)は同じ試験IDにつき1回だけ
  // entry.unsure: 見直し印を付けて正解し「自信なし」として記録した数(v12 以降の記録だけが持つ)
  function finalizeSession(s, finishedAt) {
    const entry = gradeSession(s, finishedAt);
    const done = loggedOf(s);
    if (done && Number.isInteger(done.unsure) && done.unsure >= 0) entry.unsure = done.unsure;
    if (s.mode === `retry`) {
      entry.retryOf = s.retryOf || null;
      // 解き直しは何度でも受けられる。同じ日に同じ問題を何度間違えても、解き直しの予定は1回だけ登録される(Drill)
      if (!done) {
        noteDrill(s);
        markLogged(s, entry, noteAnswers(s));
        if (window.Streak) Streak.recordToday();
      }
      Storage.set(RETRY_RESULT_KEY, entry);
      clearSession();
      return entry;
    }
    const hist = readHistory();
    const existing = hist.find((e) => e.id === entry.id);
    if (existing) {
      clearSession();
      return existing;
    }
    if (!done) {
      noteDrill(s);
      markLogged(s, entry, noteAnswers(s));
      const graded = new Set();
      entry.wrong.forEach((w) => {
        // 未回答は「もう一度」にしない(解けなかったとは限らず、長い復習間隔を消してしまうため)
        if (w.chosen === null || !w.termId || graded.has(w.termId) || !AppIndex.termsById[w.termId]) return;
        graded.add(w.termId);
        // silent: 学習カレンダーへの記録は下で1回だけにする(問題数ぶん数えない)
        Srs.grade(w.termId, 1, { silent: true });
      });
      if (window.Streak) Streak.recordToday();
    }
    hist.unshift(entry);
    // 新しい5回分だけ問題文まで残す(以前の版の記録もここで少しずつ省いた形に移す)
    const list = trimHistory(hist.slice(0, HISTORY_MAX), HISTORY_FULL);
    // 保存できなければ(容量不足など)今回分以外をすべて省いてもう一度試す。
    // それでも保存できなかったときは、結果を失わないよう受験中のデータを残しておく(記録済みの印 logged も一緒に)
    if (Storage.set(HISTORY_KEY, list) || Storage.set(HISTORY_KEY, trimHistory(list, 1))) clearSession();
    else saveSession(s);
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

  // 秒数が壊れていても(読み込んだバックアップの文字列など)「NaN秒」と出さない
  function fmtDuration(raw) {
    const n = Number(raw);
    const sec = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m >= 60) return `${Math.floor(m / 60)}時間${m % 60}分`;
    if (m > 0) return `${m}分${s ? `${s}秒` : ``}`;
    return `${s}秒`;
  }

  // 1問あたりの時間(2分24秒 など)
  function fmtPer(sec) {
    const t = Math.max(0, Math.round(sec));
    const m = Math.floor(t / 60);
    const s = t % 60;
    if (!m) return `${s}秒`;
    return s ? `${m}分${s}秒` : `${m}分`;
  }

  // 今年の日付は年を省く(結果・履歴の行を短くする)
  function fmtDateTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ``;
    const wd = [`日`, `月`, `火`, `水`, `木`, `金`, `土`][d.getDay()];
    const date = d.getFullYear() === new Date().getFullYear()
      ? `${d.getMonth() + 1}月${d.getDate()}日(${wd})`
      : DateUtil.toJapanese(DateUtil.format(d), true);
    return `${date} ${String(d.getHours()).padStart(2, `0`)}:${String(d.getMinutes()).padStart(2, `0`)}`;
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

  // 個数・組合せの問題の記述ア〜エ(試験中: 正誤は出さない。本試験の問題用紙と同じく、記号のあとに文を並べる)
  function statementsHtml(q) {
    if (!styleOfQ(q) || !validStatements(q.statements)) return ``;
    return `
      <ol class="exam-stmts" role="list" aria-label="記述ア〜エ">
        ${q.statements.map((st) => `<li class="exam-stmt"><span class="exam-stmt-label">${esc(st.label)}<span class="sr-only">、</span></span><span class="exam-stmt-text">${esc(st.text)}</span></li>`).join(``)}
      </ol>`;
  }

  // AIに聞く(AskAi)に渡す「選んだ選択肢」: データの選択肢の番号(出題時に並べ替えていても元の番号に直す)。未回答・求められないときは null
  function pickedDataIndex(w) {
    const chosen = Number.isInteger(w.chosen) && w.chosen >= 0 && w.chosen < w.choices.length ? w.chosen : null;
    if (chosen === null) return null;
    const order = isPermutation(w.order, w.choices.length) ? w.order : orderFromTexts(w.choices, quizItem(w.refId));
    return order ? order[chosen] : null;
  }

  function modeText(mode, total) {
    const def = modeDef(mode);
    return mode === `retry` ? `解き直し(${total}問)` : `${def.label}(${total}問)`;
  }

  function answeredCount(s) {
    return s.answers.filter((a) => a !== null).length;
  }

  function signed(d, unit) {
    return d > 0 ? `+${d}${unit}` : d < 0 ? `−${Math.abs(d)}${unit}` : `±0${unit}`;
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
    else {
      // #exam/short・#exam/full: 弱点分析などから形式を選んだ状態で開く
      if (parts[0] === `short` || parts[0] === `full`) pref.mode = parts[0];
      renderLanding(root);
    }
  }

  // 期限切れのセッションをその場で採点し、URLを結果ページに差し替えて表示する
  function showAutoGraded(root, s) {
    const entry = finalizeSession(s, s.deadline);
    history.replaceState(null, ``, `#exam/result/${entry.id}`);
    renderResult(root, entry.id, { autoGraded: true, fresh: true });
  }

  // ===== 受験メニュー =====

  function renderLanding(root) {
    const session = loadSession();
    if (session && isExpired(session)) { showAutoGraded(root, session); return; }

    const type = examTypeData() || {};
    const cats = categories();
    const mcByCat = {};
    cats.forEach((c) => { mcByCat[c.id] = mcItemsIn(c.id); });
    const mcTotal = cats.reduce((n, c) => n + mcByCat[c.id].length, 0);
    const hist = readHistory();
    // 個数・組合せの問題を出す数(分野ごとに 枠と収録数の小さいほう。多い順): 「宅建業法4問・権利関係1問」など。出さなければ ``
    const styledCount = {};
    cats.forEach((c) => { styledCount[c.id] = mcByCat[c.id].filter((q) => QuizEngine.styleOf(q)).length; });
    function styledParts(mode) {
      const quota = modeDef(mode).styled || {};
      return cats.map((c, i) => ({ c, i, n: Math.min(quota[c.id] || 0, styledCount[c.id] || 0) })).filter((x) => x.n > 0)
        .sort((a, b) => (b.n - a.n) || (a.i - b.i));
    }
    function styledText(mode) {
      return styledParts(mode).map((x) => `${x.c.name}${x.n}問`).join(`・`);
    }

    const wrap = document.createElement(`div`);
    wrap.className = `view exam-view`;
    wrap.innerHTML = `
      <h2>模擬試験</h2>
      <p class="view-desc">宅建士試験の本番形式(問題数・制限時間・分野配分)で出題します。試験中は正誤を表示せず、提出後にまとめて採点します。</p>
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

      <section aria-labelledby="exam-history-title" class="exam-history">
        <div class="section-head"><h3 id="exam-history-title">${ic(`clock`, 20)} 受験履歴</h3></div>
        <div data-role="history"></div>
      </section>

      <details class="card exam-about"${hist.length ? `` : ` open`}>
        <summary>${ic(`info`, 18)}<span>この模擬試験について</span>${ic(`chevron-down`, 18)}</summary>
        <ul class="exam-about-list">
          <li>本試験は<strong>四肢択一式・50問・2時間</strong>です。宅建業に従事していて登録講習を修了した人は5問が免除され、45問・1時間50分になります。<a href="${RETIO_URL}" target="_blank" rel="noopener">不動産適正取引推進機構(RETIO)「試験概要」${ic(`external`, 14)}</a></li>
          <li>分野ごとの問題数(権利関係14・法令上の制限8・税・価格評定3・宅建業法20・5問免除科目5)は例年の出題数の目安で、公式に固定された配分ではありません。</li>
          <li>${mcTotal
            ? `出題は確認問題の4択(現在${mcTotal}問)からです。分野の問題が足りないときだけ、用語集から自動生成した定義問題(本試験の文章問題とは形式が異なります)で補います。`
            : `宅建士の分野に該当する確認問題は準備中のため、用語集から自動生成した定義問題(本試験の文章問題とは形式が異なります)で出題します。`}</li>
          ${styledText(`full`) ? `<li>本試験と同じように、記述ア〜エのうち当てはまるものの数を答える「個数問題」と、組合せを答える「組合せ問題」も出題します(フルは${esc(styledText(`full`))}${styledText(`short`) ? `、ショートは${esc(styledText(`short`))}` : ``}まで)。</li>` : ``}
          <li>直近${RECENT_EXAMS}回の模擬試験で出した問題は、なるべく後回しにして出題します(収録問題が少ない分野では同じ問題が含まれることがあります)。</li>
          <li>合否の目安${type.targetScore || 35}点は、このアプリ独自の目安です。本試験の合格点は毎年変わります。</li>
          <li>間違えた問題の用語は「今日の復習」に自動で追加されます(未回答の問題は追加しません)。</li>
          <li>見直し印を付けて正解した問題は、まぐれ当たりかもしれないので「自信なし」として記録し、3日後の解き直しの予定に入れます。</li>
        </ul>
      </details>
    `;
    root.appendChild(wrap);

    renderResumeBanner(wrap.querySelector(`[data-role="resume"]`), session);
    renderHistoryList(wrap.querySelector(`[data-role="history"]`), hist);

    const breakdown = wrap.querySelector(`[data-role="breakdown"]`);
    const timedInput = wrap.querySelector(`[data-role="timed"]`);
    const timedNote = wrap.querySelector(`[data-role="timed-note"]`);

    function paintSetup() {
      const def = modeDef(pref.mode);
      wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.mode === pref.mode)));
      timedNote.textContent = pref.timed
        ? `制限時間 ${def.minutes}分。途中で中断しても時計は止まりません(本番と同じ扱い)。時間切れになると自動で提出されます。`
        : `時間を気にせず解けます。中断していた時間を除いた経過時間が記録されます。`;
      const styled = styledParts(pref.mode);
      const styledSum = styled.reduce((n, x) => n + x.n, 0);
      breakdown.innerHTML = `
        <p class="exam-breakdown-title">分野別の問題数(${def.total}問)</p>
        <ul class="exam-breakdown-list">
          ${cats.map((c) => `<li><span>${esc(c.name)}</span><span class="num">${def.quotas[c.id] || 0}問</span></li>`).join(``)}
        </ul>
        ${styledSum ? `<p class="exam-pace-note exam-styled-note">${ic(`list`, 16)}<span>うち個数・組合せの問題 最大${styledSum}問(${esc(styled.map((x) => `${x.c.name}${x.n}`).join(`・`))})</span></p>` : ``}
        <p class="exam-pace-note">${ic(`clock`, 16)}<span>1問あたり約${fmtPer(guideSecPerQuestion(pref.mode))}(${def.minutes}分÷${def.total}問)</span></p>`;
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

  async function startRetry(entry, opts) {
    const existing = loadSession();
    if (existing) {
      const ok = await UI.confirm(`中断中の試験があります。破棄して解き直しを始めますか?`, { confirmLabel: `破棄して始める`, danger: true });
      if (!ok) return;
    }
    const s = createRetrySession(entry, opts);
    if (!s.questions.length) return;
    saveSession(s);
    Router.navigate(`#exam/run`);
  }

  function renderResumeBanner(container, s) {
    if (!s) { container.innerHTML = ``; return; }
    const n = s.questions.length;
    const answered = answeredCount(s);
    const elapsed = typeof s.activeMs === `number` ? s.activeMs : Date.now() - s.startedAt;
    const timeText = s.timed ? `残り ${fmtClock(s.deadline - Date.now())}` : `時間制限なし・経過 ${fmtClock(elapsed)}`;
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
          freshResult = entry.id;
          Router.navigate(`#exam/result/${entry.id}`);
          return;
        }
        timeEl.textContent = `残り ${fmtClock(rem)}`;
      }, 1000);
    }
  }

  function renderHistoryList(container, hist) {
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
        ${hist.map((e, i) => {
          const passed = e.score >= passLine(e.total);
          const isBest = (best[e.mode] && best[e.mode].id === e.id);
          const p = Math.round((e.score / e.total) * 100);
          return `
          <a class="todo-item exam-history-item" href="#exam/result/${encodeURIComponent(e.id)}"${i >= HISTORY_SHOW ? ` hidden` : ``}>
            <span class="todo-icon ${passed ? `is-ok` : ``}">${ic(passed ? `trophy` : `clock`, 20)}</span>
            <span class="todo-main">
              <span class="todo-title num">${e.score}/${e.total}問<span class="exam-history-pct">${p}%</span>・${esc(modeDef(e.mode).label)}${isBest ? `<span class="badge badge-accent exam-best-badge">最高</span>` : ``}</span>
              <span class="todo-sub">${esc(fmtDateTime(e.finishedAt || e.startedAt))}・${fmtDuration(e.durationSec || 0)}${e.timed ? `` : `・時間制限なし`}</span>
            </span>
            ${ic(`chevron-right`, 18)}
          </a>`;
        }).join(``)}
      </div>
      ${hist.length > HISTORY_SHOW ? `<button type="button" class="btn btn-ghost btn-block exam-history-more" data-role="history-more">${ic(`chevron-down`)}すべて表示(${hist.length}回)</button>` : ``}`;
    const more = container.querySelector(`[data-role="history-more"]`);
    if (more) {
      more.addEventListener(`click`, () => {
        // 作り直さず、隠していた行を出すだけ(スクロール位置が動かないように)
        const hidden = Array.from(container.querySelectorAll(`.exam-history-item[hidden]`));
        hidden.forEach((el) => { el.hidden = false; });
        more.remove();
        if (hidden[0]) hidden[0].focus({ preventScroll: true });
      });
    }
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
            <button type="button" class="btn btn-sm exam-submit-btn" data-role="submit">${ic(`check-circle`, 18)}提出</button>
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
            <button type="button" class="btn btn-secondary exam-flag-btn" data-role="flag" aria-pressed="false">${ic(`flag`, 18)}見直し</button>
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
    const flagBtn = wrap.querySelector(`[data-role="flag"]`);
    let navSheet = null;
    let submitSheet = null;
    let finished = false;
    // 別のタブで同じ試験が進められた(このタブの古い状態で上書きしないよう、以後は保存しない)
    let detached = false;
    let lastPaceAt = 0;

    // ---- 経過時間(画面を開いている間だけ数える。中断・別アプリに切り替えている間は数えない) ----
    const tracksActive = typeof s.activeMs === `number`;
    let paused = document.visibilityState === `hidden`;
    let segStart = Date.now();
    function flushActive() {
      if (!tracksActive || finished) return;
      const now = Date.now();
      if (!paused) s.activeMs += Math.max(0, now - segStart);
      segStart = now;
    }
    function activeElapsed(now) {
      return s.activeMs + (paused ? 0 : Math.max(0, now - segStart));
    }
    function onVisibility() {
      if (finished || detached || !wrap.isConnected) return;
      if (document.visibilityState === `hidden`) {
        flushActive();
        paused = true;
        saveSession(s);
      } else {
        paused = false;
        segStart = Date.now();
        tick();
      }
    }
    function onPageHide() {
      if (finished || detached || !wrap.isConnected) return;
      flushActive();
      paused = true;
      saveSession(s);
    }
    function onPageShow() {
      if (finished || detached || !wrap.isConnected) return;
      paused = document.visibilityState === `hidden`;
      segStart = Date.now();
    }

    // ---- 別のタブ(同じ端末で2つ開いている)で同じ試験が進められたとき ----
    // storage イベントは書き込んだタブ以外にだけ届く。保存された試験が消えた・別の試験になった・
    // 回答か見直し印が食い違うときは、このタブの古い状態で上書きしないよう保存をやめ、最新の状態を開くか尋ねる
    const sameList = (a, b, norm) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => norm(x) === norm(b[i]));
    const normAnswer = (x) => (Number.isInteger(x) ? x : null);
    const normFlag = (x) => x === true;
    function isConflict(stored) {
      if (!stored || typeof stored !== `object` || stored.id !== s.id) return true;
      return !sameList(stored.answers, s.answers, normAnswer) || !sameList(stored.flags, s.flags, normFlag);
    }
    async function onStorage(e) {
      if (finished || detached || !wrap.isConnected) return;
      // e.key が null: 別のタブで保存データがすべて消された
      if (e.key !== null && e.key !== STORAGE_PREFIX + SESSION_KEY) return;
      let stored = null;
      try { stored = e.key === null ? Storage.get(SESSION_KEY, null) : (e.newValue ? JSON.parse(e.newValue) : null); } catch (err) { stored = null; }
      if (!isConflict(stored)) return;
      detached = true;
      cleanupRun();
      if (navSheet) navSheet.close();
      if (submitSheet) submitSheet.close();
      const ok = await UI.confirm(`別のタブで模擬試験が進められました。このタブでの解答は保存されません。最新の状態を開きますか?`, { confirmLabel: `最新の状態を開く`, cancelLabel: `メニューへ` });
      // 別のタブで提出済みなら、その結果を開く
      const done = !loadSession() && readHistory().some((x) => x.id === s.id);
      if (!ok) Router.navigate(`#exam`);
      else Router.navigate(done ? `#exam/result/${s.id}` : `#exam/run`);
    }

    document.addEventListener(`visibilitychange`, onVisibility);
    window.addEventListener(`pagehide`, onPageHide);
    window.addEventListener(`pageshow`, onPageShow);
    window.addEventListener(`storage`, onStorage);
    runCleanup = () => {
      document.removeEventListener(`visibilitychange`, onVisibility);
      window.removeEventListener(`pagehide`, onPageHide);
      window.removeEventListener(`pageshow`, onPageShow);
      window.removeEventListener(`storage`, onStorage);
      // 画面を離れる(中断・別画面へ移動)ときは、それまでの経過時間を保存しておく
      if (!finished && !detached) { flushActive(); saveSession(s); }
    };

    function persist() {
      if (detached) return;
      flushActive();
      saveSession(s);
    }

    // ---- ペース(時間制限ありのみ): 回答済みの数 − 経過時間から見た目安の数 ----
    const perSec = s.timed && s.deadline > s.startedAt ? (s.deadline - s.startedAt) / 1000 / n : null;
    function paceInfo(now) {
      if (!perSec) return null;
      const elapsedSec = Math.max(0, Math.min(now - s.startedAt, s.deadline - s.startedAt)) / 1000;
      const expected = Math.min(n, Math.floor(elapsedSec / perSec));
      const diff = answeredCount(s) - expected;
      const title = diff > 0 ? `目安のペース(1問あたり${fmtPer(perSec)})より${diff}問先行しています`
        : diff < 0 ? `目安のペース(1問あたり${fmtPer(perSec)})より${-diff}問遅れています`
          : `目安のペース(1問あたり${fmtPer(perSec)})どおりです`;
      return { diff, text: signed(diff, `問`), title };
    }

    function paintProgress() {
      const a = answeredCount(s);
      const p = paceInfo(Date.now());
      progressText.innerHTML = `回答済み ${a}/${n}${p ? `<span class="exam-pace${p.diff < 0 ? ` is-behind` : ``}" title="${esc(p.title)}">・ペース ${p.text}<span class="sr-only">(${esc(p.title)})</span></span>` : ``}`;
      progressFill.style.width = `${Math.round((a / n) * 100)}%`;
      lastPaceAt = Date.now();
    }

    function paintQuestion() {
      const i = s.current;
      const q = s.questions[i];
      const chosen = s.answers[i];
      const flagged = s.flags[i];
      // 試験中はレベル・出題形式を出さない(本番と同じく、問題文だけで判断する)
      qcard.innerHTML = `
        <div class="exam-q-head">
          <span class="exam-q-num num">問${i + 1}<small> / ${n}</small></span>
          <span class="badge badge-soft">${esc(catName(q.categoryId))}</span>
        </div>
        ${q.prompt ? `<p class="exam-q-prompt">${esc(q.prompt)}</p>` : ``}
        <p class="quiz-question exam-stem">${esc(q.stem)}</p>
        ${statementsHtml(q)}
        <div class="choice-list" role="group" aria-label="問${i + 1}の選択肢">
          ${q.choices.map((text, ci) => `<button type="button" class="btn choice-btn exam-choice${chosen === ci ? ` is-selected` : ``}" data-choice="${ci}" aria-pressed="${chosen === ci}"><span class="choice-key">${ci + 1}</span><span>${esc(text)}</span></button>`).join(``)}
        </div>
      `;
      qcard.querySelectorAll(`[data-choice]`).forEach((b) => b.addEventListener(`click`, () => choose(Number(b.dataset.choice))));
      flagBtn.setAttribute(`aria-pressed`, String(flagged));
      flagBtn.classList.toggle(`is-on`, flagged);
      prevBtn.disabled = i === 0;
      nextBtn.innerHTML = i === n - 1 ? `${ic(`check-circle`)}提出へ` : `次へ${ic(`chevron-right`)}`;
    }

    function navSummaryText() {
      const unanswered = s.answers.filter((a) => a === null).length;
      const flagged = s.flags.filter(Boolean).length;
      const p = paceInfo(Date.now());
      return `未回答 ${unanswered}問・見直し ${flagged}問${p ? `・ペース ${p.text}` : ``}`;
    }

    function navGridHtml() {
      const groups = [];
      s.questions.forEach((q, i) => {
        const last = groups[groups.length - 1];
        if (last && last.cid === q.categoryId) last.items.push(i);
        else groups.push({ cid: q.categoryId, items: [i] });
      });
      return `
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
          </div>`).join(``)}`;
    }

    // opts.submit: 一覧シートの最後に「提出へ」を付ける
    function navHtml(opts) {
      opts = opts || {};
      const unanswered = s.answers.filter((a) => a === null).length;
      const flagged = s.flags.filter(Boolean).length;
      return `
        <p class="exam-nav-summary num">${navSummaryText()}</p>
        ${navGridHtml()}
        <div class="exam-nav-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-role="next-unanswered" ${unanswered ? `` : `disabled`}>次の未回答へ</button>
          <button type="button" class="btn btn-secondary btn-sm" data-role="next-flagged" ${flagged ? `` : `disabled`}>${ic(`flag`, 16)}次の見直しへ</button>
        </div>
        ${opts.submit ? `<button type="button" class="btn btn-block exam-nav-submit" data-role="nav-submit">${ic(`check-circle`)}提出へ</button>` : ``}`;
    }

    function wireNav(container, onPick) {
      container.addEventListener(`click`, (e) => {
        const cell = e.target.closest(`[data-go]`);
        if (cell) { go(Number(cell.dataset.go)); if (onPick) onPick(); return; }
        if (e.target.closest(`[data-role="next-unanswered"]`)) { jumpTo((i) => s.answers[i] === null); if (onPick) onPick(); return; }
        if (e.target.closest(`[data-role="next-flagged"]`)) { jumpTo((i) => s.flags[i]); if (onPick) onPick(); return; }
        if (e.target.closest(`[data-role="nav-submit"]`)) { if (onPick) onPick(); submit(); }
      });
    }

    function paintNav() {
      sideNav.innerHTML = navHtml();
      if (navSheet) navSheet.body.innerHTML = navHtml({ submit: true });
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

    let lastChoose = { i: -1, ci: -1, at: 0 };
    function choose(ci) {
      const i = s.current;
      // 同じ選択肢をすぐに2回押した(ダブルタップ)ときは取り消さない
      const now = Date.now();
      if (s.answers[i] === ci && lastChoose.i === i && lastChoose.ci === ci && now - lastChoose.at < 450) return;
      lastChoose = { i, ci, at: now };
      s.answers[i] = s.answers[i] === ci ? null : ci;
      // 作り直す前に、フォーカスが問題カード内にあったかを覚えておく(作り直すと元のボタンは消える)
      const ae = document.activeElement;
      const hadFocus = !!(ae && ae.closest && ae.closest(`.exam-q-card`));
      persist();
      paintAll();
      const btn = qcard.querySelector(`[data-choice="${ci}"]`);
      if (btn && hadFocus) btn.focus({ preventScroll: true });
    }

    // 見直しボタンは作り直さない(押したボタンにフォーカスが残る)
    function toggleFlag() {
      const i = s.current;
      s.flags[i] = !s.flags[i];
      persist();
      flagBtn.setAttribute(`aria-pressed`, String(s.flags[i]));
      flagBtn.classList.toggle(`is-on`, s.flags[i]);
      paintNav();
    }

    function finish(finishedAt, message) {
      if (finished || detached) return;
      flushActive();
      finished = true;
      cleanupRun();
      if (navSheet) navSheet.close();
      if (submitSheet) submitSheet.close();
      const entry = finalizeSession(s, finishedAt);
      if (message) UI.toast(message);
      const resultId = s.mode === `retry` ? `retry` : entry.id;
      freshResult = resultId;
      // 受験画面の履歴を結果で置き換える(戻るで「受験中の試験はありません」に戻らないように)
      location.replace(`#exam/result/${resultId}`);
    }

    // ---- 提出前の確認(未回答・見直しの番号から戻れる) ----
    function submitHtml() {
      const un = [];
      const fl = [];
      s.answers.forEach((a, i) => { if (a === null) un.push(i); if (s.flags[i]) fl.push(i); });
      const chips = (list) => list.slice(0, SUBMIT_CHIP_MAX).map((i) => `<button type="button" class="chip chip-small num" data-go="${i}" aria-label="問${i + 1}に戻る">問${i + 1}</button>`).join(``)
        + (list.length > SUBMIT_CHIP_MAX ? `<span class="exam-submit-more">ほか${list.length - SUBMIT_CHIP_MAX}問</span>` : ``);
      return `
        <div class="exam-submit">
          <p class="exam-submit-status num">回答済み ${n - un.length}/${n}問${s.timed ? `・残り <span data-role="submit-time">${fmtClock(s.deadline - Date.now())}</span>` : ``}</p>
          ${!un.length ? `<p class="exam-submit-ok">${ic(`check-circle`, 18)}すべての問題に回答済みです。</p>` : ``}
          ${un.length ? `
            <div class="exam-submit-group is-warn">
              <p class="exam-submit-label">${ic(`alert`, 16)}未回答 ${un.length}問<small>(不正解として採点します)</small></p>
              <div class="chip-row">${chips(un)}</div>
            </div>` : ``}
          ${fl.length ? `
            <div class="exam-submit-group">
              <p class="exam-submit-label">${ic(`flag`, 16)}見直し ${fl.length}問</p>
              <div class="chip-row">${chips(fl)}</div>
            </div>` : ``}
          <p class="exam-submit-hint">番号を押すと、その問題に戻ります。</p>
          <div class="exam-submit-grid">${navGridHtml()}</div>
          <div class="exam-submit-actions">
            <button type="button" class="btn btn-secondary" data-role="back">${ic(`chevron-left`)}問題に戻る</button>
            <button type="button" class="btn" data-role="do-submit">${ic(`check-circle`)}提出して採点する</button>
          </div>
        </div>`;
    }

    function submit() {
      // 二重に開かない(連打・自動提出と重なったときも1回だけ)
      if (finished || detached || submitSheet || !wrap.isConnected) return;
      if (navSheet) navSheet.close();
      submitSheet = UI.sheet({ title: `提出前の確認`, content: submitHtml(), onClose: () => { submitSheet = null; } });
      submitSheet.el.classList.add(`exam-submit-sheet`);
      submitSheet.body.addEventListener(`click`, (e) => {
        const cell = e.target.closest(`[data-go]`);
        if (cell) {
          if (submitSheet) submitSheet.close();
          go(Number(cell.dataset.go));
          return;
        }
        if (e.target.closest(`[data-role="back"]`)) { if (submitSheet) submitSheet.close(); return; }
        if (e.target.closest(`[data-role="do-submit"]`)) finish(Date.now());
      });
    }

    prevBtn.addEventListener(`click`, () => go(s.current - 1));
    nextBtn.addEventListener(`click`, () => { if (s.current === n - 1) submit(); else go(s.current + 1); });
    flagBtn.addEventListener(`click`, toggleFlag);
    wrap.querySelector(`[data-role="submit"]`).addEventListener(`click`, submit);
    wrap.querySelector(`[data-role="suspend"]`).addEventListener(`click`, () => {
      persist();
      UI.toast(s.timed ? `保存して中断しました(時計は止まりません)` : `保存して中断しました`, `success`);
      Router.navigate(`#exam`);
    });
    wrap.querySelector(`[data-role="open-nav"]`).addEventListener(`click`, () => {
      if (navSheet) return;
      navSheet = UI.sheet({ title: `問題一覧`, content: navHtml({ submit: true }), onClose: () => { navSheet = null; } });
      navSheet.el.classList.add(`exam-nav-sheet`);
      wireNav(navSheet.body, () => { if (navSheet) navSheet.close(); });
      const currentCell = navSheet.body.querySelector(`[aria-current="true"]`);
      if (currentCell) currentCell.focus({ preventScroll: true });
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
      if (finished || detached) return;
      const now = Date.now();
      if (s.timed) {
        const rem = s.deadline - now;
        if (rem <= 0) { finish(s.deadline, `時間になりました。自動で提出して採点しました`); return; }
        timerValue.textContent = fmtClock(rem);
        timerEl.classList.toggle(`is-warn`, rem <= 10 * 60000 && rem > 5 * 60000);
        timerEl.classList.toggle(`is-danger`, rem <= 5 * 60000);
        // 別のアプリから戻ったときなどに複数の区切りを一度に過ぎていたら、いちばん近い区切りだけ知らせる
        const crossed = ANNOUNCE_MINUTES.filter((m) => rem <= m * 60000 && !announced.has(m));
        if (crossed.length) {
          crossed.forEach((m) => announced.add(m));
          const m = Math.min(...crossed);
          live.textContent = `残り${m}分です`;
          // 画面の上に出す(下の「前へ・次へ」と重ならないように)
          UI.toast(`残り${m}分です`, `default`, { position: `top`, dismissible: true, duration: 6000 });
        }
        if (submitSheet) {
          const t = submitSheet.body.querySelector(`[data-role="submit-time"]`);
          if (t) t.textContent = fmtClock(rem);
        }
        if (now - lastPaceAt >= PACE_INTERVAL) paintProgress();
      } else {
        timerValue.textContent = fmtClock(tracksActive ? activeElapsed(now) : now - s.startedAt);
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

  // 前回(同じ形式・同じ問題数)との比較と最高点
  function compareHtml(entry, hist) {
    if (entry.mode !== `full` && entry.mode !== `short`) return ``;
    const same = hist.filter((e) => e.mode === entry.mode && e.total === entry.total);
    const idx = same.findIndex((e) => e.id === entry.id);
    if (idx < 0 || same.length < 2) return ``;
    const prev = same[idx + 1] || null;
    const best = Math.max(...same.map((e) => e.score));
    const others = same.filter((e) => e.id !== entry.id);
    const isNewBest = entry.score === best && others.every((e) => e.score < best);
    const label = modeDef(entry.mode).label;
    const parts = [];
    if (prev) parts.push(`前回(${esc(label)})比 <strong>${signed(entry.score - prev.score, `問`)}</strong>`);
    // 最高点の更新はお祝いの色(暖色)で示す
    parts.push(isNewBest ? `<strong class="exam-newbest">${ic(`sparkles`, 14)}${label}の最高点</strong>` : `最高 ${best}問`);
    return `<p class="exam-result-sub num">${ic(`chart`, 16)}<span>${parts.join(`・`)}</span></p>`;
  }

  // 採点直後の得点を 0 から数え上げる(600ms・だんだん遅く)。動きを減らす設定では何もしない
  function countUp(el, to) {
    if (!el || !(to > 0) || UI.prefersReducedMotion() || typeof requestAnimationFrame !== `function`) return;
    // 桁が増えても「/ 20問」が動かないよう、最終の桁数ぶんの幅を先に取る
    el.style.minWidth = `${String(to).length}ch`;
    el.textContent = `0`;
    const t0 = (window.performance && performance.now()) || Date.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const p = Math.min(1, Math.max(0, (now - t0) / COUNT_UP_MS));
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // 誤りの報告リンク(報告フォームが設定されているときだけ)
  function reportHtml(w) {
    if (!window.Report || typeof Report.linkHtml !== `function` || !w || !w.refId) return ``;
    const fixed = w.kind === `fixed`;
    const id = fixed ? w.refId : (w.termId || w.refId);
    let link = ``;
    try {
      link = Report.linkHtml({ kind: fixed ? `quiz` : `term`, id, title: w.stem || ``, location: fixed ? `#quiz/q/${id}` : `#glossary/${id}` });
    } catch (e) { link = ``; }
    return link ? `<p class="item-meta exam-item-meta">${link}</p>` : ``;
  }

  function renderResult(root, id, opts) {
    opts = opts || {};
    const isRetry = id === `retry`;
    let entry = null;
    let hist = [];
    if (isRetry) {
      const r = Storage.get(RETRY_RESULT_KEY, null);
      entry = validEntry(r) ? r : null;
    } else {
      hist = readHistory();
      entry = hist.find((e) => e.id === id) || null;
    }

    const wrap = document.createElement(`div`);
    wrap.className = `view exam-view exam-result`;
    if (!entry) {
      wrap.innerHTML = `<h2>模擬試験の結果</h2>`;
      wrap.appendChild(UI.emptyState({ icon: `search`, title: `結果が見つかりません`, body: `履歴は直近${HISTORY_MAX}回分まで保存されます。`, cta: { label: `模擬試験のメニューへ`, nav: `#exam` } }));
      root.appendChild(wrap);
      return;
    }

    const fresh = !!opts.fresh || (freshResult !== null && freshResult === id);
    freshResult = null;
    const cats = categories();
    // 古い回は問題文を省いて保存しているので、今のデータから復元する(復元できない問題は missing の印だけ)
    const wrong = Array.isArray(entry.wrong) ? entry.wrong.map(expandQuestion).filter(Boolean) : [];
    const flaggedOk = Array.isArray(entry.flaggedOk) ? entry.flaggedOk.map(expandQuestion).filter(Boolean) : [];
    // 解き直しに使えるのは、問題文・選択肢がそろっているものだけ
    const retryWrong = wrong.filter(validQuestion);
    const retryFlagged = flaggedOk.filter(validQuestion);
    const flaggedNos = Array.isArray(entry.flagged) ? entry.flagged.filter((x) => Number.isInteger(x)) : null;
    const isFlagged = (w) => w.flagged === true || (!!flaggedNos && flaggedNos.includes(w.no));
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
    catRows.forEach((r) => { r.pct = Math.round((r.correct / r.total) * 100); });
    const weakest = catRows.filter((r) => catById(r.id)).slice().sort((a, b) => (a.correct / a.total - b.correct / b.total) || (b.total - a.total))[0];
    let weakHtml = ``;
    if (weakest && weakest.correct < weakest.total) {
      // 全体で7割以上取れているときは、責めるような言い方にしない
      weakHtml = pct >= GOOD_PCT
        ? `<p class="exam-weak">${ic(`target`, 18)} 比較的低かったのは<strong>「${esc(weakest.name)}」(${weakest.correct}/${weakest.total}問・${weakest.pct}%)</strong>です。</p>`
        : `<p class="exam-weak">${ic(`target`, 18)} いちばん正答率が低かったのは<strong>「${esc(weakest.name)}」(${weakest.correct}/${weakest.total}問・${weakest.pct}%)</strong>です。まずはこの分野の基礎を見直しましょう。</p>`;
    } else if (catRows.length) {
      weakHtml = `<p class="exam-weak">${ic(`check-circle`, 18)} すべての分野で全問正解でした。</p>`;
    }

    // 次にやること: 正答率が7割に届かなかった分野(低い順)
    const lowRows = catRows.filter((r) => catById(r.id) && r.pct < GOOD_PCT).sort((a, b) => (a.pct - b.pct) || (b.total - a.total));
    const retryCount = retryWrong.length || retryFlagged.length;
    // 間違えた4択の確認問題: 解き直しの予定に入れたこと(今日受けた試験だけ「明日から」と伝える)と、その問題の○×
    const drillIds = drillIdsOf(wrong);
    const doneDay = DateUtil.format(new Date(entry.finishedAt || entry.startedAt));
    const oxNav = drillIds.length && window.Views.ox && typeof Views.ox.quizNav === `function` ? Views.ox.quizNav(drillIds) : null;
    const isToday = doneDay === DateUtil.today();
    // 見直し印を付けて正解した問題は「自信なし」として記録済み(v12 以降の記録だけが数を持つ。以前の記録では出さない)
    const unsureN = Number.isInteger(entry.unsure) && entry.unsure > 0 ? entry.unsure : 0;
    const unsureHtml = unsureN
      ? `<p class="exam-drill-note">${ic(`flag`, 16)}<span>見直し印を付けて正解した${unsureN}問は「自信なし」として記録し、<a href="#quiz/due">解き直しの予定</a>に入れました${isToday ? `(3日以内に出ます)` : ``}</span></p>`
      : ``;
    const drillHtml = (drillIds.length && (isToday || oxNav)) || unsureHtml ? `
      <div class="exam-drill">
        ${drillIds.length && isToday ? `<p class="exam-drill-note">${ic(`calendar`, 16)}<span>間違えた${drillIds.length}問を<a href="#quiz/due">解き直しの予定</a>に追加しました(明日から)</span></p>` : ``}
        ${unsureHtml}
        ${oxNav ? `<a class="btn btn-secondary btn-block" href="${esc(oxNav)}" data-role="drill-ox">${ic(`o-x`)}<span>この論点を○×で確認</span></a>` : ``}
      </div>` : ``;
    const nextHtml = `
      <section class="card exam-next" aria-labelledby="exam-next-title">
        <h3 class="card-title" id="exam-next-title">${ic(`flag`, 20)} 次にやること</h3>
        ${retryCount ? `
          <div class="exam-next-retry">
            <button type="button" class="btn btn-block" data-role="retry">${ic(`repeat`)}<span>${retryWrong.length ? `間違えた問題を解き直す` : `見直し印の問題を解き直す`}(<span data-role="retry-count">${retryCount}</span>問)</span></button>
            ${retryWrong.length && retryFlagged.length ? `<label class="check-inline exam-retry-flag"><input type="checkbox" data-role="retry-flagged"> 見直し印を付けて正解した${retryFlagged.length}問も含める</label>` : ``}
          </div>` : ``}
        ${drillHtml}
        ${lowRows.length ? `
          <p class="exam-next-lead">正答率が7割に届かなかった分野</p>
          <ul class="exam-next-list">
            ${lowRows.map((r) => {
              const topic = topicForCategory(r.id);
              return `
              <li class="exam-next-item">
                <div class="exam-next-head"><span class="exam-next-name">${esc(r.name)}</span><span class="exam-next-meta num">${r.correct}/${r.total}問・${r.pct}%</span></div>
                <div class="chip-row">
                  <a class="chip chip-small" href="#ox/cat/${encodeURIComponent(r.id)}/10">${ic(`o-x`, 14)}○×で10問</a>
                  ${topic ? `<a class="chip chip-small" href="#topics/${encodeURIComponent(topic.id)}">${ic(topic.icon || `book-open`, 14)}基礎を読む</a>` : ``}
                </div>
              </li>`;
            }).join(``)}
          </ul>`
          : `<p class="exam-next-lead">${catRows.length ? `すべての分野で正答率7割以上でした。` : ``}${isRetry ? `模擬試験でも確かめてみましょう。` : entry.mode === `short` ? `次はフル(50問)で、時間配分も含めて試してみましょう。` : `この調子で、間隔をあけてもう一度受けてみましょう。`}</p>`}
      </section>`;

    const timeText = entry.timed && Number.isInteger(entry.limitMin) && entry.limitMin > 0
      ? `${fmtDuration(entry.durationSec || 0)}(制限${entry.limitMin}分)`
      : `${fmtDuration(entry.durationSec || 0)}(時間制限なし)`;
    const guide = isRetry ? null : guideSecPerQuestion(entry.mode);
    const perQ = entry.durationSec >= entry.total ? entry.durationSec / entry.total : null;
    const flagCount = flaggedNos ? flaggedNos.length : 0;
    const flagWrong = wrong.filter(isFlagged).length;
    const answeredWrong = wrong.filter((w) => Number.isInteger(w.chosen)).length;

    wrap.innerHTML = `
      <h2>${isRetry ? `解き直しの結果` : `模擬試験の結果`}</h2>
      ${opts.autoGraded ? `<p class="exam-notice">${ic(`alert`, 18)}<span>制限時間を過ぎていたため、保存されていた回答で自動的に採点しました。</span></p>` : ``}
      <section class="card exam-result-hero ${isRetry ? `` : passed ? `is-pass` : `is-fail`}">
        <div class="exam-result-top">
          <p class="exam-score" aria-label="${entry.total}問中${entry.score}問正解"><span class="exam-score-value num">${entry.score}</span><span class="exam-score-total num">/ ${entry.total}問</span></p>
          ${isRetry ? `` : `<p class="exam-verdict">${ic(passed ? `trophy` : `target`, 20)}${passed ? `目安ライン到達` : `目安まであと${line - entry.score}問`}</p>`}
        </div>
        <div class="progress-bar progress-bar-lg exam-score-bar" aria-hidden="true">
          <div class="progress-bar-fill ${passed ? `fill-success` : ``}" data-role="score-fill" style="width:${pct}%"></div>
          ${isRetry ? `` : `<span class="exam-score-line" style="left:${Math.round((line / entry.total) * 100)}%"></span>`}
        </div>
        ${isRetry
          ? `<p class="exam-result-note">解き直しの結果は、受験履歴と最高スコアには記録されません。</p>`
          : `<p class="exam-result-note">目安ライン: ${line}問(${entry.total}問中)。${esc(lineNote)}</p>`}
        ${isRetry ? `` : compareHtml(entry, hist)}
        ${flagCount ? `<p class="exam-result-sub num">${ic(`flag`, 16)}<span>見直し印 ${flagCount}問(うち正解 ${flagCount - flagWrong}問)</span></p>` : ``}
        <dl class="exam-result-meta">
          <div><dt>実施</dt><dd>${esc(fmtDateTime(entry.finishedAt || entry.startedAt))}</dd></div>
          <div><dt>形式</dt><dd>${esc(modeText(entry.mode, entry.total))}</dd></div>
          <div><dt>時間</dt><dd>${esc(timeText)}</dd></div>
          <div><dt>正答率</dt><dd class="num">${pct}%</dd></div>
          ${perQ ? `<div><dt>1問あたり</dt><dd class="num">${fmtPer(perQ)}${guide ? `<small>(目安${fmtPer(guide)})</small>` : ``}</dd></div>` : ``}
        </dl>
      </section>
      ${nextHtml}
      ${catRows.length ? `
      <section class="card" aria-labelledby="exam-cat-title">
        <h3 class="card-title" id="exam-cat-title">分野別の正答</h3>
        <div class="cat-bars exam-cat-bars">
          ${catRows.map((r) => {
            const fill = r.pct >= GOOD_PCT ? `fill-success` : r.pct < 50 ? `exam-fill-low` : ``;
            return `
            <div>
              <div class="cat-bar-head"><span class="cat-bar-name">${esc(r.name)}</span><span class="cat-bar-meta">${r.correct}/${r.total}問・${r.pct}%</span></div>
              <div class="progress-bar"><div class="progress-bar-fill ${fill}" style="width:${r.pct}%"></div></div>
            </div>`;
          }).join(``)}
        </div>
        ${weakHtml}
      </section>` : ``}
      ${notices.length ? `<div class="exam-notice">${ic(`info`, 18)}<div>${notices.map((x) => `<p>${esc(x)}</p>`).join(``)}</div></div>` : ``}
      <div class="exam-result-actions">
        ${isRetry ? `<a class="btn btn-secondary" href="#exam">${ic(`timer`)}模擬試験のメニューへ</a>` : `<button type="button" class="btn btn-secondary" data-role="again">${ic(`refresh`)}もう一度受ける</button>`}
        <a class="btn btn-ghost" href="#home">${ic(`home`)}ホームへ</a>
      </div>
      <section aria-labelledby="exam-wrong-title" class="exam-wrong">
        <div class="section-head"><h3 id="exam-wrong-title">${wrong.length ? `間違えた問題・未回答(${wrong.length}問)` : `間違えた問題`}</h3></div>
        ${answeredWrong && !isRetry
          ? `<p class="view-desc">${Array.isArray(entry.asked)
            ? `間違えた問題の用語は「今日の復習」に追加済みです(未回答の問題は追加しません)。`
            : `用語集にある用語は「今日の復習」に追加済みです。`}</p>` : ``}
        <div data-role="wrong-filters"></div>
        <div class="exam-wrong-list" data-role="wrong-list"></div>
      </section>
    `;
    root.appendChild(wrap);

    // 採点した直後だけ、得点を数え上げ、棒を伸ばす(履歴から開いたときは止まった表示)
    if (fresh && !UI.prefersReducedMotion()) {
      countUp(wrap.querySelector(`.exam-score-value`), entry.score);
      const fill = wrap.querySelector(`[data-role="score-fill"]`);
      if (fill && typeof requestAnimationFrame === `function`) {
        fill.classList.add(`is-growing`);
        fill.style.width = `0%`;
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
      }
    }

    renderWrongList(wrap, wrong, flaggedOk, isFlagged);
    // 間違えた問題の「図解で確認」
    wrap.addEventListener(`click`, (e) => {
      const b = e.target && e.target.closest ? e.target.closest(`[data-figure]`) : null;
      if (!b || !window.CardUi || typeof CardUi.openFigure !== `function`) return;
      e.preventDefault();
      CardUi.openFigure(b.dataset.figure);
    });

    const retryBtn = wrap.querySelector(`[data-role="retry"]`);
    const retryFlag = wrap.querySelector(`[data-role="retry-flagged"]`);
    if (retryFlag) {
      retryFlag.addEventListener(`change`, () => {
        wrap.querySelector(`[data-role="retry-count"]`).textContent = String(retryWrong.length + (retryFlag.checked ? retryFlagged.length : 0));
      });
    }
    if (retryBtn) {
      retryBtn.addEventListener(`click`, () => startRetry(Object.assign({}, entry, { wrong: retryWrong, flaggedOk: retryFlagged }), { includeFlagged: !retryWrong.length || !!(retryFlag && retryFlag.checked) }));
    }
    const againBtn = wrap.querySelector(`[data-role="again"]`);
    if (againBtn) {
      againBtn.addEventListener(`click`, () => {
        pref.mode = entry.mode === `short` ? `short` : `full`;
        pref.timed = !!entry.timed;
        startNew(pref.mode, pref.timed);
      });
    }
  }

  // 間違えた問題の一覧と絞り込み(絞り込みは表示・非表示の切り替えだけで、一覧は作り直さない)
  function renderWrongList(wrap, wrong, flaggedOk, isFlagged) {
    const list = wrap.querySelector(`[data-role="wrong-list"]`);
    const filterBox = wrap.querySelector(`[data-role="wrong-filters"]`);
    if (!wrong.length && !flaggedOk.length) {
      list.appendChild(UI.emptyState({ icon: `trophy`, title: `間違えた問題はありません`, body: `この調子で、別の形式やフルでも試してみましょう。` }));
      return;
    }
    const items = wrong.map((w) => ({ w, status: Number.isInteger(w.chosen) ? `ng` : `skip` }))
      .concat(flaggedOk.map((w) => ({ w, status: `ok` })))
      .map((x, i) => Object.assign(x, { i, no: Number.isInteger(x.w.no) ? x.w.no : Infinity }))
      .sort((a, b) => (a.no - b.no) || (a.i - b.i));
    const ng = items.filter((x) => x.status === `ng`).length;
    const skip = items.filter((x) => x.status === `skip`).length;
    const flag = items.filter((x) => isFlagged(x.w)).length;
    const catCounts = {};
    items.forEach((x) => { if (x.status !== `ok` && x.w.categoryId) catCounts[x.w.categoryId] = (catCounts[x.w.categoryId] || 0) + 1; });
    const catIds = categories().map((c) => c.id).filter((cid) => catCounts[cid]);
    // 全問正解(見直し印の問題だけ表示)のときは「すべて 0」を出さない(押すと何も表示されなくなるため)
    const filters = wrong.length ? [{ id: `all`, label: `すべて`, count: wrong.length }] : [];
    if (ng && skip) filters.push({ id: `ng`, label: `不正解`, count: ng }, { id: `skip`, label: `未回答`, count: skip });
    if (flag) filters.push({ id: `flag`, label: `見直し印`, count: flag });
    if (catIds.length > 1) catIds.forEach((cid) => filters.push({ id: `cat:${cid}`, label: catName(cid), count: catCounts[cid] }));
    const initial = wrong.length ? `all` : `flag`;

    filterBox.innerHTML = `
      ${filters.length > 1 ? `
        <div class="chip-row chip-row-scroll exam-wrong-filters" role="group" aria-label="表示する問題">
          ${filters.map((f) => `<button type="button" class="chip chip-small" data-filter="${esc(f.id)}" aria-pressed="${f.id === initial}">${esc(f.label)}<span class="exam-filter-count num">${f.count}</span></button>`).join(``)}
        </div>` : ``}
      <p class="exam-wrong-count" aria-live="polite" data-role="wrong-count"></p>`;
    list.innerHTML = `
      ${!wrong.length ? `<p class="exam-wrong-none">${ic(`trophy`, 18)}間違えた問題はありません。見直し印を付けた問題を表示しています。</p>` : ``}
      ${items.map((x) => wrongItemHtml(x.w, x.status, isFlagged(x.w))).join(``)}`;
    // AIに聞く: ボタン(イベントつき)は AskAi が作る。使わない設定のとき(null)は置き場所ごと消す
    list.querySelectorAll(`[data-ask]`).forEach((slot) => {
      let b = null;
      try {
        b = window.AskAi && typeof AskAi.button === `function`
          ? AskAi.button({ kind: `exam`, quizId: slot.dataset.ask, picked: slot.dataset.picked === `` ? null : Number(slot.dataset.picked) })
          : null;
      } catch (e) { console.error(`[AIに聞く] ボタンを作れませんでした`, e); }
      if (b) {
        if (slot.dataset.no) b.setAttribute(`aria-label`, `問${slot.dataset.no}についてAIに聞く`);
        slot.appendChild(b);
      } else slot.remove();
    });
    // 最初は先頭の10問だけ。「残りを表示」は隠していた行を出すだけ(作り直さないのでスクロール位置が動かない)
    const more = document.createElement(`button`);
    more.type = `button`;
    more.className = `btn btn-secondary btn-block exam-wrong-more`;
    more.hidden = true;
    list.after(more);

    const countEl = filterBox.querySelector(`[data-role="wrong-count"]`);
    let current = initial;
    let expanded = false;
    function matches(el, f) {
      const st = el.dataset.status;
      if (f === `all`) return st !== `ok`;
      if (f === `ng` || f === `skip`) return st === f;
      if (f === `flag`) return el.dataset.flag === `1`;
      if (f.indexOf(`cat:`) === 0) return st !== `ok` && el.dataset.cat === f.slice(4);
      return true;
    }
    function apply(f) {
      current = f;
      let matched = 0;
      let shown = 0;
      list.querySelectorAll(`[data-item]`).forEach((el) => {
        const ok = matches(el, f);
        if (ok) matched += 1;
        const visible = ok && (expanded || matched <= WRONG_SHOW);
        el.hidden = !visible;
        if (visible) shown += 1;
      });
      countEl.textContent = matched > shown ? `${matched}問のうち${shown}問を表示しています` : `${shown}問を表示しています`;
      more.hidden = matched <= shown;
      more.innerHTML = `${ic(`chevron-down`)}残り${matched - shown}問を表示`;
    }
    apply(initial);
    filterBox.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-filter]`);
      if (!b) return;
      filterBox.querySelectorAll(`[data-filter]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
      apply(b.dataset.filter);
    });
    more.addEventListener(`click`, () => {
      const before = new Set(Array.from(list.querySelectorAll(`[data-item]:not([hidden])`)));
      expanded = true;
      apply(current);
      // ボタンが消えるので、新しく出た最初の問題にフォーカスを移す
      const first = Array.from(list.querySelectorAll(`[data-item]:not([hidden])`)).find((el) => !before.has(el));
      if (first) { first.setAttribute(`tabindex`, `-1`); first.focus({ preventScroll: true }); }
    });
  }

  // 今のデータに見つからない問題(古い記録で問題文を省いたもの): 番号・正誤・分野だけ出す
  function missingItemHtml(w, status, flagged) {
    const statusHtml = status === `skip` ? `<span class="review-status exam-status-skip">未回答</span>`
      : status === `ok` ? `<span class="review-status review-status-ok">${ic(`check-circle`, 12)}正解</span>`
        : `<span class="review-status review-status-ng">${ic(`x-circle`, 12)}不正解</span>`;
    return `
      <article class="card exam-wrong-item is-missing" data-item data-status="${status}" data-cat="${esc(w.categoryId || ``)}" data-flag="${flagged ? 1 : 0}">
        <div class="exam-q-head exam-wrong-head">
          ${Number.isInteger(w.no) ? `<span class="exam-q-num num">問${w.no}</span>` : ``}
          ${statusHtml}
          ${w.categoryId ? `<span class="badge badge-soft">${esc(catName(w.categoryId))}</span>` : ``}
          ${flagged ? `<span class="exam-flag-tag">${ic(`flag`, 14)}見直し印</span>` : ``}
        </div>
        <p class="exam-missing">${ic(`info`, 16)}<span>この問題は現在のデータにありません(問題の見直し・削除などのため)。</span></p>
      </article>`;
  }

  function wrongItemHtml(w, status, flagged) {
    if (!validQuestion(w)) return missingItemHtml(w, status, flagged);
    const chosen = Number.isInteger(w.chosen) && w.chosen >= 0 && w.chosen < w.choices.length ? w.chosen : null;
    const term = w.termId ? AppIndex.termsById[w.termId] : null;
    const truths = validTruths(w) ? w.truths : null;
    const notes = validNotes(w) ? w.notes : null;
    // 「用語を選ぶ」問題は解説=問題文になるので重ねて出さない
    const showExplain = w.explanation && w.explanation !== w.stem;
    const links = [];
    if (w.kind === `fixed` && w.refId) links.push(`<a class="chip chip-small chip-muted" href="#quiz/q/${encodeURIComponent(w.refId)}">${ic(`pencil-check`, 14)}確認問題を開く</a>`);
    if (term) links.push(`<a class="chip chip-small chip-muted" href="#glossary/${encodeURIComponent(term.id)}">${ic(`layers`, 14)}用語集: ${esc(term.name)}</a>`);
    // 関連する用語に図解があれば、その図をシートで開く
    const figId = term && window.CardUi && typeof CardUi.diagramsFor === `function` ? CardUi.diagramsFor(term.id)[0] : null;
    if (figId) links.push(`<button type="button" class="chip chip-small chip-muted" data-figure="${esc(figId)}">${ic(`diagram`, 14)}図解で確認</button>`);
    const statusHtml = status === `skip` ? `<span class="review-status exam-status-skip">未回答</span>`
      : status === `ok` ? `<span class="review-status review-status-ok">${ic(`check-circle`, 12)}正解</span>`
        : `<span class="review-status review-status-ng">${ic(`x-circle`, 12)}不正解</span>`;
    const compare = status === `ok`
      ? `<div class="exam-compare-row is-correct"><dt>${ic(`check-circle`, 14)}正解</dt><dd>${w.correctIndex + 1}. ${esc(w.choices[w.correctIndex])}</dd></div>`
      : `<div class="exam-compare-row is-yours"><dt>${ic(chosen === null ? `info` : `x-circle`, 14)}あなた</dt><dd>${chosen === null ? `未回答` : `${chosen + 1}. ${esc(w.choices[chosen])}`}</dd></div>
        <div class="exam-compare-row is-correct"><dt>${ic(`check-circle`, 14)}正解</dt><dd>${w.correctIndex + 1}. ${esc(w.choices[w.correctIndex])}</dd></div>`;
    // 個数・組合せの問題: 記述ア〜エそれぞれの正誤(○=正しい記述・×=誤った記述)と注
    const style = styleOfQ(w);
    const stmtRows = style ? w.statements.map((st) => `
        <li class="exam-review-choice">
          <span class="exam-mark ${st.truth ? `is-true` : `is-false`}" aria-hidden="true">${st.truth ? `○` : `×`}</span>
          <div class="exam-review-main">
            <p class="exam-review-text"><span class="exam-stmt-tag">${esc(st.label)}</span><span class="sr-only">、${st.truth ? `正しい記述。` : `誤った記述。`}</span>${esc(st.text)}</p>
            ${st.note ? `<p class="exam-choice-note">${esc(st.note)}</p>` : ``}
          </div>
        </li>`).join(``) : ``;
    // AIに聞く(4択の確認問題だけ。ボタンは結果を描いたあとで AskAi に作ってもらう)
    const picked = w.kind === `fixed` && w.refId ? pickedDataIndex(w) : null;
    // data-no: 結果の一覧には同じ「AIに聞く」が問題の数だけ並ぶので、読み上げではどの問題のボタンかを付ける
    const askSlot = w.kind === `fixed` && w.refId ? `<div class="exam-ask" data-ask="${esc(w.refId)}" data-picked="${picked === null ? `` : picked}" data-no="${Number.isInteger(w.no) ? w.no : ``}"></div>` : ``;
    // 全選択肢: 正誤判定型は記述の正誤(○=正しい記述・×=誤った記述)、それ以外は正解の選択肢に○
    const choiceRows = w.choices.map((text, ci) => {
      const good = truths ? truths[ci] : ci === w.correctIndex;
      const tags = [
        ci === w.correctIndex ? `<span class="exam-tag is-answer">正解</span>` : ``,
        ci === chosen ? `<span class="exam-tag is-chosen">あなたの解答</span>` : ``,
      ].join(``);
      return `
        <li class="exam-review-choice${ci === w.correctIndex ? ` is-answer` : ``}">
          <span class="exam-mark ${good ? `is-true` : `is-false`}" aria-hidden="true">${good ? `○` : `×`}</span>
          <div class="exam-review-main">
            <p class="exam-review-text"><span class="sr-only">${truths ? (good ? `正しい記述。` : `誤った記述。`) : (good ? `正解の選択肢。` : ``)}</span>${ci + 1}. ${esc(text)}${tags}</p>
            ${notes && notes[ci] ? `<p class="exam-choice-note">${esc(notes[ci])}</p>` : ``}
          </div>
        </li>`;
    }).join(``);
    return `
      <article class="card exam-wrong-item" data-item data-status="${status}" data-cat="${esc(w.categoryId || ``)}" data-flag="${flagged ? 1 : 0}">
        <div class="exam-q-head exam-wrong-head">
          ${Number.isInteger(w.no) ? `<span class="exam-q-num num">問${w.no}</span>` : ``}
          ${statusHtml}
          ${w.categoryId ? `<span class="badge badge-soft">${esc(catName(w.categoryId))}</span>` : ``}
          ${levelBadge(w.level)}
          ${w.kind !== `fixed` ? `<span class="source-tag">${typeLabel(w)}</span>` : ``}
          ${style ? `<span class="source-tag">${style === `count` ? `個数` : `組合せ`}</span>` : ``}
          ${flagged ? `<span class="exam-flag-tag">${ic(`flag`, 14)}見直し印</span>` : ``}
        </div>
        ${w.prompt ? `<p class="exam-q-prompt">${esc(w.prompt)}</p>` : ``}
        <p class="exam-stem">${esc(w.stem)}</p>
        <dl class="exam-compare">${compare}</dl>
        <details class="exam-more">
          <summary>${ic(`list`, 16)}<span>${style ? `解説と記述ア〜エ` : `解説と全選択肢`}</span>${ic(`chevron-down`, 16)}</summary>
          ${style ? `
            <p class="exam-review-legend">記述(○=正しい記述、×=誤った記述)</p>
            <ol class="exam-review-list exam-stmt-review" role="list">${stmtRows}</ol>
            <p class="exam-review-legend">選択肢</p>` : truths ? `<p class="exam-review-legend">○=正しい記述、×=誤った記述</p>` : ``}
          <ol class="exam-review-list">${choiceRows}</ol>
          ${showExplain ? `<p class="quiz-explanation"><strong>解説</strong> ${esc(w.explanation)}</p>` : ``}
          ${links.length ? `<div class="chip-row exam-wrong-links">${links.join(``)}</div>` : ``}
          ${askSlot}
          ${reportHtml(w)}
        </details>
      </article>`;
  }

  return {
    render,
    // 保存容量が足りないときの「古い記録を整理」(Storage)から呼ぶ
    compactHistory,
    // テスト・他画面からの参照用
    _internal: { buildExam, createSession, createRetrySession, gradeSession, finalizeSession, loadSession, passLine, modeDef, isExpired, recentAsked, reshuffleQuestion, compactEntry, compactQuestion, expandQuestion, trimHistory, validQuestion, noteAnswers, HISTORY_FULL, STYLED_QUOTAS },
  };
})();
