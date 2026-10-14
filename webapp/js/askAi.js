// AIに聞く(v12): 問題・自分の答え・解説・根拠条文をまとめた質問文をクリップボードにコピーし、ChatGPT・Claude・Gemini を開くリンクを出す
// アプリからは何も送信しない(リンクは各サービスのトップページを開くだけ。URLに問題文や記録を入れない)
// 置き場所: 4択の解説(views/quiz.js)・○×の結果(views/ox.js)・模擬試験の結果の問題一覧(views/exam.js)。設定で消せる(answerPrefs.aiButton)
// iPhone の Safari は、タップの処理の中ですぐにコピーしないと許可されないため、質問文はボタンを押したときにその場で作り、
// 何も待たずに navigator.clipboard.writeText を呼ぶ(だめなら選択してコピーする方法、それもだめなら選択できる文章を出す)
window.AskAi = (function () {
  // 開くだけのリンク(問い合わせの文字列などは付けない)
  const SERVICES = [
    { name: `ChatGPT`, url: `https://chatgpt.com/` },
    { name: `Claude`, url: `https://claude.ai/` },
    { name: `Gemini`, url: `https://gemini.google.com/` },
  ];
  const EGOV_URL = `https://laws.e-gov.go.jp/`;
  const PREFS_KEY = `answerPrefs`;
  // 根拠条文の欄に並べる数の上限(長すぎる質問文にしない)
  const MAX_CITES = 10;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  // 設定(answerPrefs.aiButton)。初期値は表示する
  function enabled() {
    const p = Storage.get(PREFS_KEY, null);
    return !(Storage.isPlainObject(p) && p.aiButton === false);
  }

  function setEnabled(on) {
    // 別のタブで書いた値を消さないよう、最新の値を読んでから書く
    const p = Storage.get(PREFS_KEY, null);
    Storage.set(PREFS_KEY, Object.assign({}, Storage.isPlainObject(p) ? p : {}, { aiButton: !!on }));
  }

  // 問題データの取り出し(模擬試験の結果では1画面に何十個もボタンを作るので、ID の表を作っておく)
  let quizMap = null;
  let quizMapOf = null;
  function quizItem(id) {
    const list = window.APP_DATA && Array.isArray(APP_DATA.quiz) ? APP_DATA.quiz : [];
    if (quizMapOf !== list || !quizMap || quizMap.size !== list.length) {
      quizMap = new Map();
      list.forEach((q) => { if (q && typeof q.id === `string` && !quizMap.has(q.id)) quizMap.set(q.id, q); });
      quizMapOf = list;
    }
    return quizMap.get(id) || null;
  }

  // ===== 質問文 =====

  // 問題の試験(分野の決め方は進捗・模擬試験と同じ Stats.categoryOf。模擬試験は宅建士試験だけ)
  function examName(q, kind) {
    if (kind === `exam`) return `宅建士試験`;
    const inExam = (id) => {
      try { return !!(window.Stats && typeof Stats.categoryOf === `function` && Stats.categoryOf(q, id)); } catch (e) { return false; }
    };
    if (inExam(`takken`)) return `宅建士試験`;
    if (inExam(`zeirishi`)) return `税理士試験(消費税法)`;
    return ``;
  }

  // 「2026年10月10日」(内容の確認日)
  function asOfText() {
    const s = window.SITE && typeof SITE.contentAsOf === `string` ? SITE.contentAsOf : ``;
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : ``;
  }

  function introLine(q, what, kind) {
    const exam = examName(q, kind);
    const name = window.SITE && typeof SITE.name === `string` && SITE.name ? `学習アプリ「${SITE.name}」` : `学習アプリ`;
    const asOf = asOfText();
    return `${exam ? `${exam}の勉強をしています。` : `不動産の基礎を勉強しています。`}${name}の${what}について教えてください。`
      + `(アプリ独自の問題です。${asOf ? `${asOf}時点の法令・制度で作られています。` : ``})`;
  }

  // 解説の文末などの括弧書きから、条文・判例・通達の参照を拾う(「(宅建業法35条1項)」など)
  // (法令名のない「46条2項」だけのものは、どの法令か分からないので入れない)
  const CITE_RE = /[(（]([^()（）]*?(?:\d+条|最判|最決|大判|高判|地判|判決|通達|告示|別表)[^()（）]*)[)）]/g;
  const NAMED_RE = /法|令|規則|告示|通達|判|条例|基準/;
  function addCitations(text, out) {
    const s = String(text || ``);
    let m;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(s))) {
      const c = m[1].replace(/\s+/g, ` `).trim();
      if (c && NAMED_RE.test(c) && !out.includes(c)) out.push(c);
    }
  }

  function lawLines(q, texts) {
    const lines = [];
    const term = q.relatedTermId && window.AppIndex && AppIndex.termsById ? AppIndex.termsById[q.relatedTermId] : null;
    if (term && typeof term.lawRef === `string` && term.lawRef.trim()) lines.push(`・${term.name}: ${term.lawRef.trim()}`);
    const cites = [];
    texts.forEach((t) => addCitations(t, cites));
    cites.slice(0, MAX_CITES).forEach((c) => lines.push(`・${c}`));
    return lines;
  }

  function section(title, body) {
    const text = Array.isArray(body) ? body.filter(Boolean).join(`\n`) : String(body || ``);
    return text.trim() ? `【${title}】\n${text.trim()}` : ``;
  }

  // 正誤の書き方(○×の記号だけだと読み違えることがあるので言葉も添える)
  const truthText = (t) => (t ? `○(正しい)` : `×(誤り)`);

  // 4択(4択の画面・模擬試験の結果)。picked はデータの順の選択肢の番号(未回答は null)
  function mcPrompt(q, picked, kind) {
    const mq = QuizEngine.fromFixedMc(q, { keepOrder: true });
    if (!mq) return ``;
    const correct = mq.choices.findIndex((c) => c.correct);
    const has = Number.isInteger(picked) && picked >= 0 && picked < mq.choices.length;
    const choiceLine = (i) => `${i + 1}. ${mq.choices[i].text}`;
    const statements = Array.isArray(mq.statements) && mq.statements.length ? mq.statements : null;
    const notes = [];
    if (statements) {
      statements.forEach((s) => notes.push(`${s.label}: ${truthText(s.truth)}${s.note ? ` ${s.note}` : ``}`));
    } else {
      mq.choices.forEach((c, i) => {
        if (!c.note && c.truth === null) return;
        const mark = c.truth === null ? `` : `${c.truth ? `○(正しい記述)` : `×(誤った記述)`} `;
        notes.push(`${i + 1}: ${mark}${c.note || ``}`.trim());
      });
    }
    const ask = !has ? `なぜその答えになるのか、初学者向けに条文を示して説明してください。`
      : picked === correct ? `なぜその答えになるのか、初学者向けに条文を示して説明してください。ほかの選択肢が正解にならない理由も教えてください。`
        : `なぜその答えになるのか、初学者向けに条文を示して説明してください。私の解答の誤解も指摘してください。`;
    return [
      introLine(q, kind === `exam` ? `模擬試験で解いた4択問題` : `4択問題`, kind),
      section(`問題`, mq.stem),
      statements ? section(`記述`, statements.map((s) => `${s.label} ${s.text}`)) : ``,
      section(`選択肢`, mq.choices.map((c, i) => choiceLine(i))),
      section(`私の解答`, has ? choiceLine(picked) : `未回答(答えられませんでした)`),
      section(`正解`, correct >= 0 ? choiceLine(correct) : ``),
      section(`アプリの解説`, [mq.explanation, notes.length ? `${statements ? `記述ごとの正誤` : `選択肢ごとの解説`}:\n${notes.join(`\n`)}` : ``].filter(Boolean).join(`\n\n`)),
      section(`根拠条文(アプリの表示)`, lawLines(q, statements ? statements.map((s) => s.note) : mq.choices.map((c) => c.note).concat(mq.explanation))),
      section(`お願い`, `${ask}アプリの解説に誤りや古い内容があると思うときは、その点も指摘してください。`),
    ].filter(Boolean).join(`\n\n`);
  }

  // ○×一問一答。picked: ○と答えたら true、×なら false(未回答は null)
  function oxPrompt(q, stmtKey, picked) {
    const s = QuizEngine.statementsFrom(q).find((x) => x.id === stmtKey);
    if (!s) return mcPrompt(q, null, `quiz`);
    const has = typeof picked === `boolean`;
    const note = s.note || ``;
    const overall = q.explanation || q.answer || ``;
    const ask = !has ? `この文がなぜ${truthText(s.truth)}なのか、初学者向けに条文を示して説明してください。`
      : picked === s.truth ? `この文がなぜ${truthText(s.truth)}なのか、初学者向けに条文を示して説明してください。似た論点で間違えやすい点も教えてください。`
        : `この文がなぜ${truthText(s.truth)}なのか、初学者向けに条文を示して説明してください。私の解答の誤解も指摘してください。`;
    return [
      introLine(q, `○×問題(文が正しいか誤りかを答える問題)`, `ox`),
      s.context ? section(`前提`, s.context) : ``,
      section(`問題文`, `${s.sub && s.label ? `記述${s.label}: ` : ``}${s.text}`),
      section(`私の解答`, has ? truthText(picked) : `未回答`),
      section(`正解`, truthText(s.truth)),
      section(`アプリの解説`, note || overall),
      note && overall && overall !== note ? section(`元の4択問題の全体の解説`, overall) : ``,
      section(`根拠条文(アプリの表示)`, lawLines(q, [note])),
      section(`お願い`, `${ask}アプリの解説に誤りや古い内容があると思うときは、その点も指摘してください。`),
    ].filter(Boolean).join(`\n\n`);
  }

  function buildPrompt(opts) {
    const q = quizItem(opts.quizId);
    if (!q || !QuizEngine.isMcItem(q)) return ``;
    if (opts.kind === `ox` && typeof opts.stmtKey === `string`) return oxPrompt(q, opts.stmtKey, opts.picked);
    return mcPrompt(q, Number.isInteger(opts.picked) ? opts.picked : null, opts.kind);
  }

  // ===== コピー =====

  // 選択してコピーする方法(古いブラウザ・クリップボードの API が使えないとき)。成功したら true
  function execCopy(text) {
    const active = document.activeElement;
    const ta = document.createElement(`textarea`);
    ta.value = text;
    // 読み取り専用にしてキーボードを出さない。画面の外に置いて見せない(文字を16px以上にして iPhone の拡大を防ぐ)
    ta.setAttribute(`readonly`, ``);
    ta.setAttribute(`aria-hidden`, `true`);
    ta.tabIndex = -1;
    ta.className = `ask-ai-buffer`;
    document.body.appendChild(ta);
    let ok = false;
    try {
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = typeof document.execCommand === `function` && document.execCommand(`copy`) === true;
    } catch (e) { ok = false; }
    ta.remove();
    try { if (active && active.isConnected && typeof active.focus === `function`) active.focus({ preventScroll: true }); } catch (e) { /* 戻せなくてもよい */ }
    return ok;
  }

  // 戻り値: Promise<boolean>(コピーできたか)。writeText はこの関数の中で、何も待たずに呼ぶ
  function copyText(text) {
    let p = null;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === `function`) p = navigator.clipboard.writeText(text);
    } catch (e) { p = null; }
    if (p && typeof p.then === `function`) return p.then(() => true, () => execCopy(text));
    return Promise.resolve(execCopy(text));
  }

  // ===== コピーしたあとのシート =====

  function sheetHtml() {
    return `
      <div class="ask-ai-sheet">
        <p class="ask-ai-status" data-role="status" role="status"><span class="ask-ai-status-icon" data-role="status-icon">${ic(`copy`)}</span><span data-role="status-text">質問文をコピーしています…</span></p>
        <p class="ask-ai-lead" data-role="lead">使うAIを開いて、入力欄に貼り付けて送ってください。</p>
        <div class="ask-ai-links">
          ${SERVICES.map((s) => `<a class="btn btn-secondary ask-ai-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}を開く${ic(`external`, 16)}</a>`).join(``)}
        </div>
        <p class="ask-ai-caution">${ic(`alert`)}<span>AIの答えは誤ることがあります。根拠の条文は<a href="${EGOV_URL}" target="_blank" rel="noopener noreferrer">e-Gov法令検索</a>で確かめてください。</span></p>
        <details class="ask-ai-preview" data-role="preview">
          <summary>質問文を見る</summary>
          <textarea class="field-input ask-ai-text" data-role="text" readonly rows="10" aria-label="質問文"></textarea>
        </details>
        <div class="ask-ai-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-role="recopy">${ic(`copy`, 16)}もう一度コピー</button>
        </div>
        <p class="ask-ai-privacy">このアプリからAIのサービスには何も送信しません。リンクは各サービスのトップページを開くだけです(使うときは各サービスの利用規約・プライバシーポリシーが適用されます)。</p>
      </div>`;
  }

  // コピーできなかったとき: 質問文を開いて選択しておく(長押しでコピーできるように)
  function showManual(body) {
    const preview = body.querySelector(`[data-role="preview"]`);
    const ta = body.querySelector(`[data-role="text"]`);
    preview.open = true;
    try {
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
    } catch (e) { /* 選択できなくても文章は表示されている */ }
  }

  function paintStatus(body, copied) {
    const status = body.querySelector(`[data-role="status"]`);
    const text = body.querySelector(`[data-role="status-text"]`);
    const lead = body.querySelector(`[data-role="lead"]`);
    status.classList.toggle(`is-ok`, copied);
    status.classList.toggle(`is-ng`, !copied);
    status.querySelector(`[data-role="status-icon"]`).innerHTML = ic(copied ? `check-circle` : `alert`);
    text.textContent = copied ? `質問文をコピーしました` : `自動でコピーできませんでした`;
    lead.textContent = copied ? `使うAIを開いて、入力欄に貼り付けて送ってください。`
      : `下の質問文を選択してコピーしてから、使うAIを開いて入力欄に貼り付けてください。`;
  }

  function onClick(opts) {
    let text = ``;
    try { text = buildPrompt(opts); } catch (e) { console.error(`[AIに聞く] 質問文を作れませんでした`, e); }
    if (!text) { UI.toast(`この問題の質問文を作れませんでした`, `error`); return; }
    // iPhone のためにタップの処理の中ですぐコピーする(シートを開くより先に)
    const copying = copyText(text);
    const sh = UI.sheet({ title: `AIに聞く`, content: sheetHtml() });
    const body = sh.body;
    body.querySelector(`[data-role="text"]`).value = text;
    const done = (copied) => {
      if (!body.isConnected) return;
      paintStatus(body, copied);
      if (!copied) showManual(body);
    };
    copying.then(done, () => done(false));
    body.querySelector(`[data-role="recopy"]`).addEventListener(`click`, () => {
      copyText(text).then((copied) => {
        done(copied);
        if (copied) UI.toast(`質問文をコピーしました`, `success`);
      }, () => done(false));
    });
  }

  // 4択・○×・模擬試験の結果に置くボタンを返す。opts: { kind: 'quiz'|'ox'|'exam', quizId, stmtKey?, picked? }
  // 使わない設定のとき・問題が見つからないときは null(呼び出し側は置き場所ごと消す)
  function button(opts) {
    if (!opts || typeof opts !== `object` || !enabled()) return null;
    if (![`quiz`, `ox`, `exam`].includes(opts.kind) || typeof opts.quizId !== `string`) return null;
    if (!quizItem(opts.quizId)) return null;
    const o = { kind: opts.kind, quizId: opts.quizId, stmtKey: typeof opts.stmtKey === `string` ? opts.stmtKey : null, picked: opts.picked };
    const b = document.createElement(`button`);
    b.type = `button`;
    b.className = `btn btn-secondary btn-sm ask-ai-btn`;
    b.setAttribute(`aria-haspopup`, `dialog`);
    b.innerHTML = `${ic(`sparkles`, 16)}<span>AIに聞く</span>`;
    b.title = `問題と解説をコピーして、AIに質問できます`;
    b.addEventListener(`click`, () => onClick(o));
    return b;
  }

  return { button, enabled, setEnabled, buildPrompt, SERVICES, EGOV_URL };
})();
