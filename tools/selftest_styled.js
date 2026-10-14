// 個数問題・組合せ問題(style: 'count' | 'combo')の自己テスト(tools/check.js の最後の段階。単独でも動く)
// 使い方: node tools/selftest_styled.js [webapp]      (リポジトリの直下で。既定は webapp)
//
// tools/fixtures/q4_example.js の見本2問(アプリは読み込まない)をデータの最後に足して、本物のコードに通す:
//   1. 問題エンジン(js/quizEngine.js): 記述ア〜エの○×の文(キー #s0〜#s3・ラベル・正誤・注・前提)、組合せの読み取り、
//      答えの決まり(個数・組合せ、ask が correct / incorrect)、選択肢と記述を並べ替えないこと、返す形
//   2. 整合性チェック(js/dataIndex.js): 見本は警告0件。答えの合わない問題・形の誤った問題は警告になり、エンジンも落ちない
//   3. 検索(js/search.js): 記述ア〜エの文で問題が見つかる。新しい画面(学習計画・合格予測・バッジ)の言葉
//   4. lint(tools/lint_quiz.js --pack): 見本はエラー0件(警告は他の問題との同文・よく似た文だけ。データしだいで出る)。誤った問題はエラーになる
//   5. 公開用ビルドの分割(tools/lib/split.js): stmts・stmtNotes は詳細、style・stmtTruths・correctIndex・ask・選択肢は本体。
//      戻すと元と同じ。本体だけ(仮の値)の状態でも、○×の文の id と正誤・整合性チェックが元と同じ
//   6. ○×の文の固定(tools/statement_lock.js): #sN のキーを受け付け、正誤の変更・並べ替え・削除・形の変更・形の違うキーはエラー
// webapp・tools のファイルは書き換えない(lint 用の誤った問題だけ、OS の一時フォルダに書いて消す)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { loadApp, scriptList } = require('./lib/appload.js');
const split = require('./lib/split.js');
const lock = require('./statement_lock.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'q4_example.js');
const COUNT_ID = 'quiz-X9-001';
const COMBO_ID = 'quiz-X9-002';
const BASE_CTX = '宅地建物取引業者A(甲県知事免許)に関する記述(宅地建物取引業法の規定によれば)';
const COMBO_CTX = '宅地建物取引士証に関する記述(宅地建物取引業法の規定によれば)';

// 見本のパック(ContentPack.add に渡すオブジェクト)を取り出す
function readFixturePack(code) {
  let pack = null;
  const sandbox = { ContentPack: { add: (p) => { pack = p; } } };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'tools/fixtures/q4_example.js' });
  if (!pack) throw new Error('見本(tools/fixtures/q4_example.js)が ContentPack.add を呼んでいません');
  return JSON.parse(JSON.stringify(pack));
}

// データの最後(index.html の最後の data/ のファイルの後ろ)に packCode を足して読み込む。dataOnly ならデータだけ(ビルドの分割と同じ範囲)
function loadWith(webappDir, packCode, dataOnly) {
  const html = fs.readFileSync(path.join(webappDir, 'index.html'), 'utf8');
  const dataFiles = scriptList(html).filter((s) => s.startsWith('data/'));
  const last = dataFiles[dataFiles.length - 1];
  return loadApp(webappDir, {
    hostname: 'localhost',
    transform: (rel, code) => {
      if (dataOnly && !rel.startsWith('data/') && rel !== 'js/siteConfig.js') return '';
      return rel === last ? `${code}\n;${packCode}\n` : code;
    },
  });
}

function run(webappDir) {
  webappDir = path.resolve(webappDir || path.join(__dirname, '..', 'webapp'));
  const errors = [];
  let passed = 0;
  const t = (cond, msg) => { if (cond) passed += 1; else errors.push(msg); };
  const eq = (a, b, msg) => t(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} / 期待 ${JSON.stringify(b)}`);
  const safe = (name, fn) => { try { fn(); } catch (e) { errors.push(`${name}: ${e.stack || e.message}`); } };

  const fixtureCode = fs.readFileSync(FIXTURE, 'utf8');
  const pack = readFixturePack(fixtureCode);
  const fixIds = pack.quiz.map((q) => q.id);
  eq(fixIds, [COUNT_ID, COMBO_ID], '見本の問題ID');

  const base = loadApp(webappDir, { hostname: 'localhost' });
  const inApp = base.ctx.APP_DATA.quiz.filter((q) => /^quiz-X9-/.test(q.id)).map((q) => q.id);
  if (inApp.length) {
    errors.push(`アプリのデータに見本・テスト専用の問題ID(quiz-X9-*)があります: ${inApp.join(', ')}(tools/fixtures の見本は index.html に載せない)`);
    return { errors, passed };
  }
  const baseStatements = base.ctx.QuizEngine.allStatements().length;
  const baseIssues = base.ctx.AppIndex.issues.slice();
  const full = loadWith(webappDir, fixtureCode, false);
  const C = full.ctx;
  const QE = C.QuizEngine;
  const byId = (id) => C.APP_DATA.quiz.find((q) => q.id === id);
  const qc = byId(COUNT_ID);
  const qb = byId(COMBO_ID);

  // ---- 1. 問題エンジン ----
  safe('問題エンジン', () => {
    t(!!qc && !!qb, '見本の問題が読み込まれていない');
    eq(Array.from(QE.STMT_LABELS), ['ア', 'イ', 'ウ', 'エ'], 'STMT_LABELS');
    eq(Array.from(QE.COUNT_CHOICES), ['一つ', '二つ', '三つ', '四つ'], 'COUNT_CHOICES');
    eq([QE.styleOf(qc), QE.styleOf(qb), QE.styleOf(C.APP_DATA.quiz[0]), QE.styleOf(null), QE.styleOf({ style: 'multi' })], ['count', 'combo', null, null, null], 'styleOf');
    const plain = C.APP_DATA.quiz.find((q) => q.style == null && q.ask === 'correct' && QE.isMcItem(q));
    eq([QE.statementTruths(qc), QE.statementTruths(qb)], [null, null], '個数・組合せの statementTruths は null');
    eq([QE.hasStatements(qc), QE.hasStatements(qb), QE.hasStatements(plain), QE.hasStatements({ format: 'mc' })], [true, true, true, false], 'hasStatements');
    // 組合せの読み取り
    const pc = (s) => Array.from(QE.parseCombo(s));
    eq(['ア、イ', 'ウ・エ', 'イ、ア', 'アとエ', 'ｱ､ｳ', ' イ , ウ ', 'ア、ア', 'ア、オ', '一つ', '', null, 'ア'].map(pc),
      [[0, 1], [2, 3], [0, 1], [0, 3], [0, 2], [1, 2], [], [], [], [], [], [0]], 'parseCombo');

    // 記述ア〜エの○×の文
    [[qc, [true, false, true, true], BASE_CTX], [qb, [true, true, false, false], COMBO_CTX]].forEach(([q, truths, context]) => {
      const st = QE.statementsFrom(q);
      eq(st.map((s) => s.id), [0, 1, 2, 3].map((i) => `${q.id}#s${i}`), `${q.id} の文のキー`);
      eq(st.map((s) => [s.quizId, s.index, s.label, s.sub]), [0, 1, 2, 3].map((i) => [q.id, i, QE.STMT_LABELS[i], true]), `${q.id} の quizId・index・label・sub`);
      eq(st.map((s) => s.truth), truths, `${q.id} の正誤`);
      eq(st.map((s) => s.text), q.stmts, `${q.id} の文`);
      eq(st.map((s) => s.note), q.stmtNotes, `${q.id} の注`);
      eq(st.map((s) => s.context), [context, context, context, context], `${q.id} の前提`);
      eq(st.map((s) => [s.termId, s.level, s.topicIds]), st.map(() => [q.relatedTermId, q.level, q.topicIds]), `${q.id} の用語・レベル・トピック`);
      eq(Object.keys(st[0]), ['id', 'quizId', 'index', 'label', 'sub', 'text', 'truth', 'note', 'context', 'termId', 'level', 'topicIds'], `${q.id} の文の項目`);
      t(st.every((s) => lock.KEY_RE.test(s.id)), `${q.id} の文のキーが statement_lock の形に合わない`);
    });
    // 判定語で始まる注は、画面が○×を付けるので外す(choiceNotes と同じ)
    const withVerdict = Object.assign({}, qc, { stmtNotes: qc.stmtNotes.map((n, i) => (i === 1 ? `× ${n}` : n)) });
    eq(QE.statementsFrom(withVerdict)[1].note, qc.stmtNotes[1], '注の先頭の判定語を外す');
    // 問いかけの前提(誤っているもの・組合せの言い方の違い)
    eq([
      QE.stemContext('宅地建物取引業者Aに関する次の記述のうち、宅地建物取引業法の規定によれば、誤っているものはいくつあるか。'),
      QE.stemContext('借地権に関する次の記述のうち、借地借家法の規定によれば、誤っているものの組合せはどれか。'),
      QE.stemContext('次の記述のうち、正しいものの組み合わせはどれか。なお、Aは宅地建物取引業者ではないものとする。'),
    ], ['宅地建物取引業者Aに関する記述(宅地建物取引業法の規定によれば)', '借地権に関する記述(借地借家法の規定によれば)', ''], 'stemContext(個数・組合せ)');

    // 全体の○×の文: 見本の8文が増える(キーはすべて正しい形)
    const all = QE.allStatements();
    eq(all.length, baseStatements + 8, '全体の○×の文の数');
    t(fixIds.every((id) => [0, 1, 2, 3].every((i) => all.some((s) => s.id === `${id}#s${i}`))), '全体の○×の文に見本の記述がない');
    t(all.every((s) => lock.KEY_RE.test(s.id)), '全体の○×の文に形の違うキーがある');

    // 答えの決まり
    const ans = (q) => { const r = QE.styledAnswer(q); return [r.ok, r.expected, Array.from(r.matching)]; };
    eq(ans(qc), [true, 2, [0, 2, 3]], '個数問題の答え(正しいもの)');
    eq(ans(qb), [true, 0, [0, 1]], '組合せ問題の答え(正しいもの)');
    eq(ans(Object.assign({}, qc, { ask: 'incorrect', correctIndex: 0 })), [true, 0, [1]], '個数問題の答え(誤っているもの)');
    eq(ans(Object.assign({}, qb, { ask: 'incorrect', correctIndex: 3 })), [true, 3, [2, 3]], '組合せ問題の答え(誤っているもの)');
    eq(ans(Object.assign({}, qc, { correctIndex: 1 })), [false, 2, [0, 2, 3]], '個数問題の答えの誤りを見つける');
    t(!!QE.styledAnswer(Object.assign({}, qb, { stmtTruths: [true, true, true, false] })).problem, '組合せ問題で当てはまる記述が3つのときを見つける');
    t(!!QE.styledAnswer(Object.assign({}, qc, { stmtTruths: [false, false, false, false] })).problem, '個数問題で当てはまる記述が0個のときを見つける');

    // 4択の問題オブジェクト: 並べ替えない(何度作っても同じ順)。返す形
    for (let k = 0; k < 40; k++) {
      [qc, qb].forEach((q) => {
        const m = QE.fromFixedMc(q);
        if (m.choices.map((c) => c.text).join('|') !== q.choices.join('|')) throw new Error(`${q.id}: 選択肢が並べ替えられた`);
        if (m.statements.map((s) => s.label).join('') !== 'アイウエ') throw new Error(`${q.id}: 記述が並べ替えられた`);
      });
    }
    passed += 1;
    const mc = QE.fromFixedMc(qc);
    eq(Object.keys(mc), ['key', 'kind', 'refId', 'termId', 'level', 'type', 'stem', 'choices', 'explanation', 'term', 'ask', 'style', 'statements'], 'fromFixedMc の項目');
    eq([mc.style, mc.ask, mc.choices.findIndex((c) => c.correct)], ['count', 'correct', 2], 'fromFixedMc の style・ask・正解');
    eq(mc.choices.map((c) => [c.note, c.truth]), [['', null], ['', null], ['', null], ['', null]], 'fromFixedMc の選択肢の注・正誤(個数・組合せは空)');
    eq(mc.statements.map((s) => Object.keys(s)), mc.statements.map(() => ['key', 'label', 'text', 'truth', 'note']), 'fromFixedMc の statements の項目');
    eq(mc.statements.map((s) => [s.key, s.label, s.truth]), [[`${COUNT_ID}#s0`, 'ア', true], [`${COUNT_ID}#s1`, 'イ', false], [`${COUNT_ID}#s2`, 'ウ', true], [`${COUNT_ID}#s3`, 'エ', true]], 'fromFixedMc の statements');
    eq(mc.statements.map((s) => s.note), qc.stmtNotes, 'fromFixedMc の statements の注');
    const pm = QE.fromFixedMc(plain);
    eq([pm.style, pm.statements], [null, null], '正誤判定型の fromFixedMc は style・statements が null');
  });

  // ---- 2. 整合性チェック ----
  safe('整合性チェック', () => {
    eq(C.AppIndex.issues.filter((m) => /quiz-X9-/.test(m)), [], '見本の整合性チェックの警告');
    eq(C.AppIndex.issues.length, baseIssues.length, '見本を足しても整合性チェックの警告の数は同じ');
    const broken = brokenPack(pack);
    const b = loadWith(webappDir, broken.code, false);
    const issues = b.ctx.AppIndex.issues;
    broken.items.forEach((x) => {
      const mine = issues.filter((m) => m.startsWith(`${x.q.id}: `));
      if (x.idx) t(mine.some((m) => m.includes(x.idx)), `整合性チェック: ${x.q.id}(${x.why})の警告がない(「${x.idx}」を含むもの): ${mine.join(' / ') || 'なし'}`);
      else t(!mine.length, `整合性チェック: ${x.q.id}(${x.why})に、詳細が届く前と違う結果になりうる警告が出た: ${mine.join(' / ')}`);
    });
    // 形の誤った問題でもエンジンは落ちない(○×の文を作らない・statements は null)
    // style のある問題は、知らない style(データの誤り)でも選択肢を並べ替えない(keepOrder なしの模擬試験の作り方でも)
    const BQ = b.ctx.QuizEngine;
    broken.items.forEach((x) => {
      const item = b.ctx.APP_DATA.quiz.find((q) => q.id === x.q.id);
      const st = BQ.statementsFrom(item);
      const m = BQ.fromFixedMc(item, { keepOrder: true });
      BQ.styledAnswer(item);
      if (x.noStatements) t(st.length === 0 && (!m || m.statements === null), `${x.q.id}(${x.why})で○×の文を作ってしまう`);
      if (BQ.isMcItem(item)) {
        let moved = false;
        for (let k = 0; k < 20 && !moved; k++) moved = BQ.fromFixedMc(item).choices.map((c) => c.text).join('|') !== item.choices.join('|');
        t(!moved, `${x.q.id}(${x.why})の選択肢が並べ替えられた`);
      }
    });
    t(Array.isArray(BQ.allStatements()), '形の誤った問題があると allStatements が落ちる');
  });

  // ---- 3. 検索 ----
  safe('検索', () => {
    C.Nav = { ITEMS: [{ view: 'progress', label: '学習の進捗' }] };
    C.GlobalSearch.reset();
    const navOf = (q) => C.GlobalSearch.search(q, 20).map((r) => r.nav);
    t(navOf('5人に1人以上の割合で、成年者').includes(`#quiz/q/${COUNT_ID}`), '記述ア〜エの文で個数問題が見つからない');
    t(navOf('申請前1年以内に行われる').includes(`#quiz/q/${COMBO_ID}`), '記述ア〜エの文で組合せ問題が見つからない');
    t(navOf('学習計画').includes('#plan'), '「学習計画」で #plan が見つからない');
    t(navOf('合格予測').includes('#progress'), '「合格予測」で #progress が見つからない');
    t(navOf('バッジ').includes('#progress'), '「バッジ」で #progress が見つからない');
  });

  // ---- 4. lint ----
  safe('lint', () => {
    const lint = (file) => {
      const r = spawnSync(process.execPath, [path.join(__dirname, 'lint_quiz.js'), '--pack', file, '--webapp', webappDir], { encoding: 'utf8' });
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      const m = out.match(/^ERROR (\d+)件/m);
      return { status: r.status, out, errors: m ? Number(m[1]) : NaN, lines: out.split('\n') };
    };
    const r = lint(FIXTURE);
    t(r.status === 0 && r.errors === 0, `lint で見本にエラー(終了コード ${r.status}): ${r.lines.filter((l) => /^ {2}E /.test(l)).join(' / ')}`);
    // 見本についての警告は、他の問題との同文・よく似た文だけ(既存の問題しだいで出る)。それ以外の警告は見本の誤り
    const other = r.lines.filter((l) => /^ {2}W quiz-X9-/.test(l) && !/同文|よく似ている/.test(l));
    eq(other, [], 'lint の見本への警告(同文・よく似た文以外)');
    t(/個数 1問\(答え \{"三つ":1\}\)・組合せ 1問/.test(r.out), 'lint のパックの集計に個数・組合せの数が出ない');
    // 誤った問題: エラーになる
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styled-selftest-'));
    try {
      const file = path.join(dir, 'q4_example_broken.js');
      const broken = brokenPack(pack);
      fs.writeFileSync(file, `${broken.code}\n`);
      const rb = lint(file);
      t(rb.status === 1 && rb.errors > 0, `lint が誤った問題をエラーにしない(終了コード ${rb.status})`);
      broken.items.filter((x) => x.lint).forEach((x) => t(rb.lines.some((l) => l.startsWith(`  E ${x.q.id}: `) && l.includes(x.lint)),
        `lint: ${x.q.id}(${x.why})のエラー(「${x.lint}」を含むもの)がない: ${rb.lines.filter((l) => l.startsWith(`  E ${x.q.id}: `)).join(' / ') || 'なし'}`));
      // 誤りではないもの: エラーも、指定した警告も出ない
      broken.items.filter((x) => x.clean).forEach((x) => t(!rb.lines.some((l) => (l.startsWith(`  E ${x.q.id}: `) || (l.startsWith(`  W ${x.q.id}: `) && l.includes(x.clean)))),
        `lint: ${x.q.id}(${x.why})に誤ったエラー・警告(「${x.clean}」)が出た: ${rb.lines.filter((l) => l.includes(` ${x.q.id}: `)).join(' / ')}`));
      t(!rb.lines.some((l) => l.startsWith('  E quiz-X9-111: ') && l.includes('配列が')), 'lint: 配列の使い回しで、最初に使った問題までエラーにしている');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---- 5. 公開用ビルドの分割 ----
  safe('ビルドの分割', () => {
    const snap = loadWith(webappDir, fixtureCode, true);
    split.assertJsonSafe(snap.ctx.APP_DATA, 'APP_DATA');
    const data = JSON.parse(JSON.stringify(snap.ctx.APP_DATA));
    const { core, detail } = split.splitData(data);
    eq(split.firstDifference(split.mergeForCheck(core, detail), data, 'APP_DATA'), null, '本体と詳細を戻すと元と同じ');
    const f = detail.quiz.f;
    t(f.includes('stmts') && f.includes('stmtNotes'), 'stmts・stmtNotes が詳細の項目にない');
    pack.quiz.forEach((src) => {
      const c = core.quiz.find((q) => q.id === src.id);
      eq(c.stmts, ['…', '……', '………', '…………'], `${src.id}: 本体の stmts は仮の値`);
      eq(c.stmtNotes, ['…', '……', '………', '…………'], `${src.id}: 本体の stmtNotes は仮の値`);
      eq([c.style, c.stmtTruths, c.correctIndex, c.ask, c.choices], [src.style, src.stmtTruths, src.correctIndex, src.ask, src.choices], `${src.id}: 本体に残る項目(style・stmtTruths・correctIndex・ask・選択肢)`);
      eq([c.explanation, c.answer], ['…', '…'], `${src.id}: 本体の解説は仮の値`);
      const row = detail.quiz.r.find((r) => r[0] === src.id);
      eq([row[f.indexOf('stmts') + 1], row[f.indexOf('stmtNotes') + 1], row[f.indexOf('choices') + 1]], [src.stmts, src.stmtNotes, 0], `${src.id}: 詳細の行(stmts・stmtNotes あり、選択肢は本体のまま = 0)`);
    });
    // 既存の問題(style なし)の選択肢は今までどおり詳細に回る
    const plain = data.quiz.find((q) => q.style == null && Array.isArray(q.choices) && q.choices.length === 4);
    t(core.quiz.find((q) => q.id === plain.id).choices[0] === '…', '既存の問題の選択肢が詳細に回っていない');

    // 本体だけ(仮の値)の状態でも、○×の文の id・正誤など(ビルドの skeletonHash と同じ項目)と整合性チェックが元と同じ
    const corePack = Object.assign({}, pack, { quiz: pack.quiz.map((q) => core.quiz.find((x) => x.id === q.id)) });
    const coreLoad = loadWith(webappDir, `ContentPack.add(${JSON.stringify(corePack)});`, false);
    const skel = (ctx) => ctx.QuizEngine.allStatements().filter((s) => /^quiz-X9-/.test(s.id)).map((s) => [s.id, s.quizId, s.index, s.truth, s.termId, s.level, s.topicIds]);
    eq(skel(coreLoad.ctx), skel(C), '本体だけの状態の○×の文(id・正誤など)');
    eq(coreLoad.ctx.AppIndex.issues, C.AppIndex.issues, '本体だけの状態の整合性チェック');
    const ansOf = (ctx) => fixIds.map((id) => { const r = ctx.QuizEngine.styledAnswer(ctx.APP_DATA.quiz.find((q) => q.id === id)); return [r.ok, r.expected]; });
    eq(ansOf(coreLoad.ctx), ansOf(C), '本体だけの状態の答えの検算');
  });

  // ---- 6. ○×の文の固定 ----
  safe('○×の文の固定', () => {
    const K = lock.KEY_RE;
    eq(['quiz-X9-001#s0', 'quiz-X9-001#s3', 'quiz-K-01#0', 'quiz-K-01#3', 'quiz-X9-001#s4', 'quiz-X9-001#4', 'quiz-X9-001', 'quiz#X9#s0', 'quiz-X9-001#S0', '#s0'].map((k) => K.test(k)),
      [true, true, true, true, false, false, false, false, false, false], 'statement_lock のキーの形');
    const stmts = QE.allStatements().filter((s) => /^quiz-X9-/.test(s.id)).map((s) => ({ id: s.id, quizId: s.quizId, text: s.text, truth: s.truth }));
    const entries = {};
    stmts.forEach((s) => { entries[s.id] = lock.fingerprint(s); });
    const L = (extra) => ({ statements: Object.assign({}, entries, extra || {}), retired: [] });
    const cmp = (lk, list) => lock.compare(lk, list, []);
    const ok = cmp(L(), stmts);
    eq([ok.errors.length, ok.added.length, ok.warns.length], [0, 0, 0], '固定どおりならエラーなし');
    const fresh = cmp({ statements: {}, retired: [] }, stmts);
    eq(fresh.added, stmts.map((s) => s.id), '新しい #sN の文は追記の対象');
    const flipped = cmp(L(), stmts.map((s) => (s.id === `${COUNT_ID}#s1` ? Object.assign({}, s, { truth: !s.truth }) : s)));
    t(flipped.errors.some((m) => m.startsWith(`${COUNT_ID}#s1: 正誤が変わりました`)), '記述の正誤の変更がエラーにならない');
    const swapped = cmp(L(), stmts.map((s) => (s.id === `${COMBO_ID}#s0` ? Object.assign({}, s, { text: stmts.find((x) => x.id === `${COMBO_ID}#s2`).text, truth: true }) : s)));
    t(swapped.errors.some((m) => m.startsWith(`${COMBO_ID}#s0: 選択肢の順番が変わりました`)), '記述の並べ替えがエラーにならない');
    const removed = cmp(L(), stmts.filter((s) => s.id !== `${COMBO_ID}#s3`));
    t(removed.errors.some((m) => m.startsWith(`${COMBO_ID}#s3: 固定済みの文が消えました`)), '記述の削除がエラーにならない');
    const reshaped = cmp(L({ [`${COUNT_ID}#0`]: entries[`${COUNT_ID}#s0`] }), stmts);
    t(reshaped.errors.some((m) => m.startsWith(`${COUNT_ID}#0: 問題の形`)), '問題の形(style)の変更がエラーにならない');
    const badKey = cmp(L({ [`${COUNT_ID}#s7`]: entries[`${COUNT_ID}#s0`] }), stmts);
    t(badKey.errors.some((m) => m.startsWith(`${COUNT_ID}#s7: 固定済みの文のキーの形`)), '形の違う固定済みのキーがエラーにならない');
    const badNow = cmp(L(), stmts.concat([{ id: `${COUNT_ID}#x1`, quizId: COUNT_ID, text: 'あいうえおかきくけこさしすせそ。', truth: true }]));
    t(badNow.errors.some((m) => m.startsWith(`${COUNT_ID}#x1: 文のキーの形`)), '形の違う今の文のキーがエラーにならない');
  });

  return { errors, passed };
}

// 整合性チェック・lint が見つけるべき誤った問題(見本を少しずつ壊したもの)
//   idx: 整合性チェック(js/dataIndex.js)の警告に含まれる言葉(null = 文の中身の誤りなので lint だけが見つける)
//   lint: lint のエラーに含まれる言葉 / noStatements: ○×の文を作らないこと
//   clean: 誤りではない書き方(lint がエラーも、この言葉を含む警告も出さないこと)
// 戻り値の code は ContentPack.add を呼ぶパックのコード(最後の2問は stmtTruths の配列を使い回す。JSON では書けないのでコードで作る。
// ほかの配列は make が問題ごとに複製するので共有にならない)
function brokenPack(pack) {
  const [count, combo] = pack.quiz;
  const make = (src, id, patch) => Object.assign(JSON.parse(JSON.stringify(src)), { id }, patch);
  const items = [
    { why: '個数の答えが違う', idx: '答えが合わない', lint: '答えが合わない', q: make(count, 'quiz-X9-101', { correctIndex: 1 }) },
    { why: 'choiceNotes がある', idx: 'choiceNotes は書かない', lint: 'choiceNotes は書かない', q: make(combo, 'quiz-X9-102', { choiceNotes: ['a', 'b', 'c', 'd'] }) },
    { why: '個数の選択肢が固定でない', idx: '選択肢は「一つ」', lint: '「一つ」', q: make(count, 'quiz-X9-103', { choices: ['1つ', '2つ', '3つ', '4つ'] }) },
    { why: '組合せの選択肢に同じ組', idx: '同じ組', lint: '同じ組', q: make(combo, 'quiz-X9-104', { choices: ['ア、イ', 'イ、ア', 'イ、エ', 'ウ、エ'] }) },
    { why: 'stmtTruths が3つ', idx: 'stmtTruths', lint: 'stmtTruths', noStatements: true, q: make(count, 'quiz-X9-105', { stmtTruths: [true, false, true] }) },
    { why: '知らない style', idx: 'style は count', lint: "style は 'count'", noStatements: true, q: make(count, 'quiz-X9-106', { style: 'multi' }) },
    { why: '記述が「。」で終わらない', idx: null, lint: '「。」で終わっていない', q: make(count, 'quiz-X9-107', { stmts: count.stmts.map((s, i) => (i === 0 ? s.replace(/。$/, '') : s)) }) },
    { why: '組合せで当てはまる記述が3つ・問いかけが個数の形', idx: '組合せ問題はちょうど2つ', lint: '組合せはどれか', q: make(combo, 'quiz-X9-108', { question: count.question, stmtTruths: [true, true, true, false] }) },
    { why: '記述が空', idx: 'stmts(記述ア〜エ)は空でない文字列4つ', lint: 'stmts(記述ア〜エ)は空でない文字列4つ', noStatements: true, q: make(count, 'quiz-X9-110', { stmts: ['', 'あ。', 'い。', 'う。'] }) },
    { why: '解説の冒頭の答えが記述の正誤と違う', idx: null, lint: '冒頭の答え', q: make(count, 'quiz-X9-113', { explanation: count.explanation.replace('ア・ウ・エの三つ', 'ア・ウの三つ') }) },
    { why: '要点の冒頭の答えの数が違う', idx: null, lint: '冒頭の答え', q: make(count, 'quiz-X9-114', { answer: count.answer.replace('ア・ウ・エの三つ', 'ア・ウ・エの二つ') }) },
    { why: '記述の先頭に括弧つきの記号', idx: null, lint: '先頭に記号', q: make(count, 'quiz-X9-115', { stmts: count.stmts.map((s, i) => (i === 0 ? `(ア)${s}` : s)) }) },
    { why: '注の末尾の括弧が入れ子', idx: null, lint: null, clean: '末尾の括弧', q: make(combo, 'quiz-X9-116', { stmtNotes: combo.stmtNotes.map((n, i) => (i === 1 ? n.replace(/\)。$/, '(1))。') : n)) }) },
    { why: '配列の使い回し(1問目)', idx: null, lint: null, q: make(count, 'quiz-X9-111', {}) },
    { why: '配列の使い回し(2問目)', idx: null, lint: 'stmtTruths の配列が', q: make(count, 'quiz-X9-112', {}) },
  ];
  const data = { id: 'q4_example_broken', topicId: 'topicK', quiz: items.map((x) => x.q) };
  const code = `(function () { var P = ${JSON.stringify(data)}; var SHARED = P.quiz[P.quiz.length - 2].stmtTruths;`
    + ` P.quiz[P.quiz.length - 1].stmtTruths = SHARED; ContentPack.add(P); })();`;
  return { items, code };
}

module.exports = { run, FIXTURE };

if (require.main === module) {
  const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  const r = run(arg);
  r.errors.forEach((m) => console.log(`ERROR ${m}`));
  console.log(`個数・組合せの自己テスト: 成功 ${r.passed}件・失敗 ${r.errors.length}件`);
  process.exit(r.errors.length ? 1 : 0);
}
