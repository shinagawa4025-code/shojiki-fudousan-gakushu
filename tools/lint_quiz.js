// 4択問題・基礎知識の機械チェック(公開する webapp の外に置く。GitHub Pages は webapp だけを公開する)
// 使い方: node tools/lint_quiz.js [--pack q2_gyoho_a.js ...] [--prefix quiz-K2-] [--all] [--strict] [--webapp <dir>] [--today YYYY-MM-DD]
//   --pack:   そのパック(data/content/ のファイル名・webapp からの相対パス・絶対パス)の問題だけを詳しくチェックする(複数指定可)。
//             index.html にまだ載っていないパックは、追加パックの最後(js/dataIndex.js の前)に読み込む。載っていれば二重に読まない
//   --prefix: そのIDで始まる問題だけを詳しくチェック(既定: --pack がなければ新規の quiz-*2-*〜quiz-*9-* すべて)
//   --all:    既存の問題も含めて全件チェック(既存の傾向の確認用)
//   --strict: 警告(WARN)もエラー扱いにして終了コード1を返す
//   --webapp: アプリのフォルダ(既定: このファイルの隣の ../webapp)
//   --today:  見直し時期(reviewBy)の判定に使う日付(既定: 今日)
// アプリのデータは index.html の順に vm で読み込む(webapp は一切書き換えない)。index.html にあってまだ無いファイルは読み飛ばして知らせる
// 統合の前には、全パックを同時に読み込んで実行する(他のパックとの選択肢の重複も検出される):
//   node tools/lint_quiz.js --pack q2_gyoho_a.js --pack q2_gyoho_b.js --pack q2_kenri.js --pack q2_horei.js --pack q2_zei_menjo.js --pack q2_life.js
// 個数・組合せの問題(style: 'count' | 'combo'。形は tools/fixtures/q4_example.js)は、記述ア〜エ(stmts)・正誤(stmtTruths)・
// 注(stmtNotes)・固定の選択肢・答えの整合を確かめる。記述ア〜エは選択肢の文と同じく、同文・よく似た文の検出の対象にする
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptList } = require('./lib/appload.js');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] || true) : null; };
const optAll = (k) => args.map((a, i) => (a === k ? args[i + 1] : null)).filter(Boolean);
const WEBAPP = path.resolve(opt('--webapp') || process.env.WEBAPP_DIR || path.join(__dirname, '..', 'webapp'));
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = typeof opt('--today') === 'string' ? opt('--today') : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// --pack の解決: そのままのパス → webapp からの相対 → data/content/ のファイル名
function resolvePack(p) {
  const cands = [path.resolve(p), path.join(WEBAPP, p), path.join(WEBAPP, 'data', 'content', p), path.join(WEBAPP, 'data', 'content', p.endsWith('.js') ? p : `${p}.js`)];
  const hit = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!hit) { console.error(`パックが見つかりません: ${p}`); process.exit(2); }
  return path.resolve(hit);
}
const packFiles = optAll('--pack').map(resolvePack);

// ---- 読み込み ----
const html = fs.readFileSync(path.join(WEBAPP, 'index.html'), 'utf8');
// <script src="…"> の読み取りはアプリの読み込み(tools/lib/appload.js)と同じ(src の前に別の属性があっても読み落とさない)
const srcs = scriptList(html);
const ENGINE = ['js/storage.js', 'js/dates.js', 'js/dataIndex.js', 'js/stats.js', 'js/quizEngine.js', 'js/search.js'];
let files = srcs.filter((s) => s.startsWith('data/') || s === 'js/siteConfig.js' || ENGINE.includes(s)).map((s) => path.resolve(WEBAPP, s));
const listed = new Set(files);
const extra = packFiles.filter((f) => !listed.has(f));
if (extra.length) {
  // 追加パックの最後(最初の js/ の前。q2_fix.js があればその前)に差し込む
  const fixAt = files.findIndex((f) => /[\\/]q2_fix\.js$/.test(f));
  const jsAt = files.findIndex((f) => /[\\/]js[\\/]/.test(f) && !/siteConfig\.js$/.test(f));
  const at = fixAt >= 0 ? fixAt : (jsAt >= 0 ? jsAt : files.length);
  files.splice(at, 0, ...extra);
}
const store = {};
const appWarns = [];
const ctx = {
  console: { log() {}, info() {}, warn: (...a) => appWarns.push(a.join(' ')), error: console.error },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
  location: { hostname: 'localhost', protocol: 'file:', hash: '' },
};
ctx.window = ctx;
vm.createContext(ctx);
const skipped = [];
const addedBy = new Map(); // ファイル → そのファイルで追加された問題ID
for (const f of files) {
  if (!fs.existsSync(f)) { skipped.push(path.relative(WEBAPP, f)); continue; }
  const before = new Set(((ctx.APP_DATA && ctx.APP_DATA.quiz) || []).map((q) => q.id));
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.relative(WEBAPP, f) });
  if (/[\\/]dates\.js$/.test(f) && ctx.DateUtil) ctx.DateUtil.today = () => TODAY;
  const after = ((ctx.APP_DATA && ctx.APP_DATA.quiz) || []).map((q) => q.id).filter((id) => !before.has(id));
  addedBy.set(f, after);
}
if (skipped.length) console.log(`(index.html にあるがまだ無いファイルを読み飛ばしました: ${skipped.join(', ')})`);

const D = ctx.APP_DATA;
const QE = ctx.QuizEngine;
const ALL = args.includes('--all');
const STRICT = args.includes('--strict');
const PREFIX = opt('--prefix');
// 第2弾(quiz-K2-001 など)以降の新しい形式の問題(examCats 必須・作品に触れない)
const isNew = (id) => /^quiz-[A-Z][2-9]-\d{3}$/.test(id);
// v12(第4弾)以降の問題: よく似た文の検出の対象(既存の問題の結果は変えない)
const isNew4 = (id) => /^quiz-[A-Z][4-9]-\d{3}$/.test(id);
const packIds = new Set(packFiles.flatMap((f) => addedBy.get(f) || []));
const inScope = (id) => (ALL ? true : PREFIX ? id.startsWith(PREFIX) : packFiles.length ? packIds.has(id) : isNew(id));
const target = D.quiz.filter((q) => inScope(q.id));

const LEVELS = ['超入門', '初級', '中級', '上級'];
const takken = ((D.exams && D.exams.types) || []).find((t) => t.id === 'takken');
const CATS = takken && Array.isArray(takken.categories) ? takken.categories.map((c) => c.id) : ['kenri', 'horei', 'zei', 'gyoho', 'menjo'];
const termsById = {};
[...D.terms, ...D.basics].forEach((t) => { termsById[t.id] = t; });
const errors = [];
const warns = [];
const E = (id, m) => errors.push(`${id}: ${m}`);
const W = (id, m) => warns.push(`${id}: ${m}`);

// 根拠の書き方: 条文・告示・通達・ガイドライン・判例・公的機関の資料のいずれかを含むこと
const REF = /(\d+条|条の\d|告示|通達|ガイドライン|規約|規則|施行令|最判|最高裁|大判|判例|No\.\d|国税庁|国土交通省|法務省|総務省|金融支援機構|消費者庁|財務省|国土地理院|鑑定評価基準|都道府県|市区町村)/;
const VERDICT = /^\s*([○〇×✕]|正しい[。:：、]|誤り[。:：、]|正解[。:：、]|不正解[。:：、])/;
const FORBIDDEN = /(TAC|LEC|日建学院|ユーキャン|フォーサイト|スタディング|過去問|本試験問題|出る順|みやざき|らくらく宅建)/;
// 個数・組合せの問題の記述ごとの注(stmtNotes)の長さの目安
const STMT_NOTE_MIN = 40;
const STMT_NOTE_MAX = 130;
// 個数・組合せの問題の解説・要点の冒頭の答え(「正しいのはア・ウ・エの三つ。」「誤りはイとエ。」)
const STYLED_LEAD = /^(正しいのは|正しいものは|誤っているのは|誤っているものは|誤りは)([アイウエ](?:[・、と][アイウエ])*)(?:の(一つ|二つ|三つ|四つ)|だけ|のみ)?/;
const COUNT_WORD = { 一つ: 1, 二つ: 2, 三つ: 3, 四つ: 4 };

// 文の末尾の括弧書きの中身(入れ子の括弧も含む: 「…(表示規約施行規則9条(17))。」→「表示規約施行規則9条(17)」)。なければ null
function tailParen(s) {
  const t = String(s).replace(/。$/, '');
  if (!/[)）]$/.test(t)) return null;
  let depth = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    const c = t[i];
    if (c === ')' || c === '）') depth += 1;
    else if (c === '(' || c === '（') {
      depth -= 1;
      if (depth === 0) return t.slice(i + 1, -1);
    }
  }
  return null;
}

// 全体の重複検出用(選択肢の文と、個数・組合せの問題の記述ア〜エ。個数・組合せの選択肢「一つ」「ア、イ」などは文ではないので入れない)
const choiceIndex = new Map();
const addChoiceIndex = (text, key) => {
  const k = String(text).replace(/[\s、。]/g, '');
  if (!choiceIndex.has(k)) choiceIndex.set(k, []);
  choiceIndex.get(k).push(key);
};
D.quiz.forEach((q) => {
  if (q.style != null) { (Array.isArray(q.stmts) ? q.stmts : []).forEach((s, i) => addChoiceIndex(s, `${q.id}#s${i}`)); return; }
  (q.choices || []).forEach((c, i) => addChoiceIndex(c, `${q.id}#${i}`));
});

// よく似た文の検出用(○×の文すべて: 正誤判定型の選択肢と記述ア〜エ)。8文字ずつの断片(8-gram)の重なりで比べる
const GRAM = 8;
const SIMILAR = 0.6; // 共通の断片 ÷ 多い方の断片の数(言い回しを少し変えただけの文を見つける。片方が長い文に含まれるだけなら出ない)
const gramsOf = (s) => {
  const t = String(s).normalize('NFKC').replace(/[\s、。,.「」『』()（）・]/g, '');
  const set = new Set();
  for (let i = 0; i + GRAM <= t.length; i++) set.add(t.slice(i, i + GRAM));
  return set;
};
let simIndex = null;
function similarStatements(quizId, text, truth) {
  if (!simIndex) {
    const list = QE.allStatements().map((s) => ({ id: s.id, quizId: s.quizId, truth: s.truth, grams: gramsOf(s.text) }));
    const byGram = new Map();
    list.forEach((s, k) => s.grams.forEach((g) => { if (!byGram.has(g)) byGram.set(g, []); byGram.get(g).push(k); }));
    simIndex = { list, byGram };
  }
  const mine = gramsOf(text);
  if (mine.size < 4) return [];
  const shared = new Map();
  mine.forEach((g) => (simIndex.byGram.get(g) || []).forEach((k) => shared.set(k, (shared.get(k) || 0) + 1)));
  const out = [];
  shared.forEach((n, k) => {
    const s = simIndex.list[k];
    if (s.quizId === quizId || s.truth !== truth) return; // 正誤が逆の言い換え(ひっかけの元の文)は問題にしない
    const r = n / Math.max(mine.size, s.grams.size);
    if (r >= SIMILAR) out.push(`${s.id}(${Math.round(r * 100)}%)`);
  });
  return out;
}

// 同じ配列を2つの問題で使い回していないか(公開用ビルドの tools/lib/split.js が拒むため、先に知らせる)
const arrayOwner = new Map();
D.quiz.forEach((q) => Object.keys(q).forEach((k) => {
  const v = q[k];
  if (Array.isArray(v) && !arrayOwner.has(v)) arrayOwner.set(v, `${q.id}.${k}`);
}));

const seen = new Set();
D.quiz.forEach((q) => { if (seen.has(q.id)) E(q.id, 'IDが重複'); seen.add(q.id); });

// ask のない(○×に分解しない)単一解答の4択として残すもの(SPEC A-4: 計算・用語の当てはめ。quiz-I-05r は I-05 の差し替え)
// (それ以外で ask がない問題は、下の検査で「ask は 'correct' か 'incorrect'」のエラーになる。--all で既存の問題を確かめる)
const SINGLE_ANSWER = /^quiz-(beg-07|int-03|I-01|I-05r?|A-03|B-06)$/;

target.forEach((q) => {
  const id = q.id;
  const styled = q.style != null; // 個数・組合せの問題(style の値の誤りは lintStyled が知らせる)
  if (q.format !== 'mc') E(id, "format は 'mc'");
  Object.keys(q).forEach((k) => {
    const v = q[k];
    if (Array.isArray(v) && arrayOwner.get(v) !== `${id}.${k}`) E(id, `${k} の配列が ${arrayOwner.get(v)} と同じもの(定数の使い回し)。問題ごとに配列を書く(公開用ビルドが失敗する)`);
  });
  if (!Array.isArray(q.choices) || q.choices.length !== 4) { E(id, '選択肢は4つ'); return; }
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) E(id, 'correctIndex は0〜3');
  if (q.ask == null && SINGLE_ANSWER.test(id) && !styled) {
    // 単一解答の問題: 選択肢は単独の文でなくてよい(○×に出ないため)。基本の欄だけ確かめる
    if (!Array.isArray(q.choiceNotes) || q.choiceNotes.length !== 4 || q.choiceNotes.some((n) => typeof n !== 'string' || !n.trim())) E(id, 'choiceNotes は空でない文字列4つ');
    if (!q.explanation) E(id, 'explanation がない');
    if (!q.relatedTermId || !termsById[q.relatedTermId]) E(id, `relatedTermId ${q.relatedTermId} が存在しない`);
    return;
  }
  if (q.ask !== 'correct' && q.ask !== 'incorrect') E(id, "ask は 'correct' か 'incorrect'(○×一問一答に使うため必須)");
  if (!LEVELS.includes(q.level)) E(id, `level は ${LEVELS.join('/')}`);
  if (!Array.isArray(q.topicIds) || !q.topicIds.length) E(id, 'topicIds が空');
  (q.topicIds || []).forEach((t) => { if (!D.topics.find((x) => x.id === t)) E(id, `存在しないトピック ${t}`); });
  if (!q.relatedTermId || !termsById[q.relatedTermId]) E(id, `relatedTermId ${q.relatedTermId} が存在しない`);
  // 既存の問題(examCats なし)は、トピックから分野を推定する(js/stats.js の categoryOf)。新規の問題は必須
  if (!q.examCats || !Object.prototype.hasOwnProperty.call(q.examCats, 'takken')) { if (isNew(id) || q.examCats) E(id, "examCats: { takken: 'gyoho' など or null } が必要"); }
  else if (q.examCats.takken !== null && !CATS.includes(q.examCats.takken)) E(id, `examCats.takken は ${CATS.join('/')} か null`);
  if (styled) { if (q.choiceNotes != null) E(id, 'choiceNotes は書かない(個数・組合せの問題は記述ごとの注を stmtNotes に書く)'); }
  else if (!Array.isArray(q.choiceNotes) || q.choiceNotes.length !== 4 || q.choiceNotes.some((n) => typeof n !== 'string' || !n.trim())) E(id, 'choiceNotes は空でない文字列4つ');
  if (!q.explanation || q.explanation.length < 80) W(id, `explanation が短い(${(q.explanation || '').length}字。目安120〜260字)`);
  if (q.explanation && q.explanation.length > 320) W(id, `explanation が長い(${q.explanation.length}字)`);
  if (!q.answer || q.answer.length > 70) W(id, 'answer(要点1行・70字以内)がない/長い');
  if (!Array.isArray(q.episodes)) E(id, 'episodes: [] を入れる');
  else if (isNew(id) && q.episodes.length) E(id, '新規の問題は episodes: [](作品への言及をしない)');

  const stem = String(q.question || '');
  if (!/次の記述のうち/.test(stem)) E(id, '問いかけは「〜に関する次の記述のうち、(〇〇によれば、)正しい/誤っているものはどれか。」の形');
  if (q.ask === 'correct' && !/正しいもの|最も適当なもの/.test(stem)) E(id, "ask=correct なのに問いかけが「正しいもの」でない");
  if (q.ask === 'incorrect' && !/誤っているもの|最も不適当なもの/.test(stem)) E(id, "ask=incorrect なのに問いかけが「誤っているもの」でない");
  if (QE.stemContext && !QE.stemContext(stem)) E(id, '○×の前提文を取り出せない(問いかけの形を確認)');
  // 個数・組合せの問題は選択肢が記号なので、記述ア〜エと注の表記を見る(data/content/q2_fix.js の「ヶ月」→「か月」の
  // 置き換えのあとのデータを見るので、置き換えが stmts・stmtNotes に効いていなければここで知らせる)
  const texts = styled ? [].concat(Array.isArray(q.stmts) ? q.stmts : [], Array.isArray(q.stmtNotes) ? q.stmtNotes : []).map(String) : q.choices;
  if (/[（）]/.test(stem + texts.join(''))) W(id, '全角括弧（）→ 半角( )に統一');
  if (/ヶ月|カ月|ケ月/.test(stem + texts.join(''))) W(id, '「ヶ月」→「か月」に統一');
  if (FORBIDDEN.test(JSON.stringify(q))) E(id, '禁止された出典名・語(市販教材・過去問)を含む');
  if (styled) { lintStyled(q, stem); return; }
  if (/個数|組合せ|いくつあるか/.test(stem)) E(id, '個数問題・組合せ問題は style: count / combo で書く(style のない問題は○×に分解できないため使わない)');

  const plainTruths = QE.statementTruths(q);
  q.choices.forEach((c, i) => {
    if (!/。$/.test(c)) E(id, `選択肢${i + 1}が「。」で終わっていない`);
    if (c.length < 15) W(id, `選択肢${i + 1}が短すぎる(単独の○×文として成立するか確認)`);
    if (/^(この|その|上記|前記|同)/.test(c)) W(id, `選択肢${i + 1}が指示語で始まる(○×で単独表示されても意味が通るように)`);
    const key = c.replace(/[\s、。]/g, '');
    const dup = (choiceIndex.get(key) || []).filter((x) => !x.startsWith(id + '#'));
    if (dup.length) W(id, `選択肢${i + 1}が他の問題と同文: ${dup.join(',')}`);
    else if (isNew4(id) && plainTruths) {
      const sim = similarStatements(id, c, plainTruths[i]);
      if (sim.length) W(id, `選択肢${i + 1}が他の問題の文(正誤も同じ)とよく似ている: ${sim.slice(0, 3).join(',')}(言い換えだけの文は新しい問題にならない)`);
    }
  });
  (q.choiceNotes || []).forEach((n, i) => {
    if (VERDICT.test(n)) E(id, `choiceNotes${i + 1}の先頭に判定語(○×・正しい・誤り)を書かない(画面が付ける)`);
    const ex = q.examCats && q.examCats.takken;
    if (ex && !REF.test(n)) E(id, `choiceNotes${i + 1}に根拠(条文番号・告示・判例・公的資料名)がない`);
    if (!ex && !REF.test(n)) W(id, `choiceNotes${i + 1}に根拠がない(一般向けでも出典を示す)`);
  });

  // 長さの手がかり(正解だけが極端に長い/短いと、読まずに当てられる)
  const L = q.choices.map((c) => c.length);
  const ans = L[q.correctIndex];
  const others = L.filter((_, i) => i !== q.correctIndex);
  if (q.ask === 'correct' && ans >= 1.25 * Math.max(...others)) E(id, `正しい選択肢だけが長い(${ans}字 vs 他の最長${Math.max(...others)}字)`);
  if (q.ask === 'incorrect' && ans * 1.25 <= Math.min(...others)) E(id, `誤りの選択肢だけが短い(${ans}字 vs 他の最短${Math.min(...others)}字)`);
});

// 個数・組合せの問題(style: 'count' | 'combo')の検査。共通の項目(ask・level・examCats・explanation など)は上で見たあとに呼ぶ
// 形: tools/fixtures/q4_example.js。答えの決まりは js/quizEngine.js の styledAnswer(js/dataIndex.js も同じ決まりで確かめる)
// (この関数は上の問題ごとの検査から呼ばれるので、使う定数はそれより前に置く: STMT_NOTE_MIN・STMT_NOTE_MAX)
function lintStyled(q, stem) {
  const id = q.id;
  const style = q.style;
  if (style !== 'count' && style !== 'combo') { E(id, "style は 'count'(個数)か 'combo'(組合せ)"); return; }
  const kind = style === 'count' ? '個数問題' : '組合せ問題';
  const L = QE.STMT_LABELS;

  // 問いかけ: 「…正しいものはいくつあるか。」/「…正しいものの組合せはどれか。」(誤っているもの… は ask: 'incorrect')
  if (!/いくつあるか|組合せ/.test(stem)) E(id, `${kind}の問いかけは「…正しいものはいくつあるか。」か「…正しいものの組合せはどれか。」の形`);
  else if (style === 'count' && !/いくつあるか/.test(stem)) E(id, '個数問題(style: count)なのに問いかけが「いくつあるか」でない');
  else if (style === 'combo' && !/組合せ/.test(stem)) E(id, '組合せ問題(style: combo)なのに問いかけが「組合せはどれか」でない');

  // 記述ア〜エ
  let stmtsOk = Array.isArray(q.stmts) && q.stmts.length === 4 && q.stmts.every((s) => typeof s === 'string' && s.trim());
  if (!stmtsOk) E(id, 'stmts(記述ア〜エ)は空でない文字列4つ');
  const truthsOk = Array.isArray(q.stmtTruths) && q.stmtTruths.length === 4 && q.stmtTruths.every((t) => typeof t === 'boolean');
  if (!truthsOk) E(id, 'stmtTruths は true / false を4つ(記述そのものの正誤。ask に関係なく)');
  if (stmtsOk) {
    const keys = q.stmts.map((s) => s.replace(/[\s、。]/g, ''));
    if (new Set(keys).size !== 4) { E(id, '記述ア〜エに同じ文がある'); stmtsOk = false; }
    q.stmts.forEach((s, i) => {
      const lab = `記述${L[i]}`;
      if (!/。$/.test(s)) E(id, `${lab}が「。」で終わっていない`);
      if (s.length < 15) E(id, `${lab}が短すぎる(${s.length}字。○×で単独に出ても正誤が決まる完結した文にする)`);
      if (/^(この|その|上記|前記|同)/.test(s)) W(id, `${lab}が指示語で始まる(○×で単独表示されても意味が通るように)`);
      if (/^[(（]?[アイウエ][\s.:：、.)）]/.test(s)) E(id, `${lab}の先頭に記号を書かない(画面が「${L[i]}」を付ける)`);
      const dup = (choiceIndex.get(keys[i]) || []).filter((x) => !x.startsWith(id + '#'));
      if (dup.length) W(id, `${lab}が他の問題と同文: ${dup.join(',')}`);
      else if (truthsOk) {
        const sim = similarStatements(id, s, q.stmtTruths[i]);
        if (sim.length) W(id, `${lab}が他の問題の文(正誤も同じ)とよく似ている: ${sim.slice(0, 3).join(',')}(言い換えだけの文は新しい問題にならない)`);
      }
    });
  }

  // 記述ごとの注(根拠つき・判定語で始めない・40〜130字・末尾の括弧に条文)
  const notes = q.stmtNotes;
  if (!Array.isArray(notes) || notes.length !== 4 || notes.some((n) => typeof n !== 'string' || !n.trim())) E(id, 'stmtNotes(記述ごとの注)は空でない文字列4つ');
  else {
    const ex = q.examCats && q.examCats.takken;
    notes.forEach((n, i) => {
      const lab = `stmtNotes(${L[i]})`;
      if (VERDICT.test(n)) E(id, `${lab}の先頭に判定語(○×・正しい・誤り)を書かない(画面が付ける)`);
      if (ex && !REF.test(n)) E(id, `${lab}に根拠(条文番号・告示・判例・公的資料名)がない`);
      if (!ex && !REF.test(n)) W(id, `${lab}に根拠がない(一般向けでも出典を示す)`);
      if (n.length < STMT_NOTE_MIN || n.length > STMT_NOTE_MAX) W(id, `${lab}が${n.length}字(目安${STMT_NOTE_MIN}〜${STMT_NOTE_MAX}字)`);
      const tail = tailParen(n);
      if (tail === null || !REF.test(tail)) W(id, `${lab}の末尾の括弧に根拠の条文を書く(例: 「…(宅建業法22条の2第2項)。」)`);
    });
  }

  // 解説・要点の冒頭に書いた答え(「正しいのはア・ウ・エの三つ。」など)が、記述の正誤(stmtTruths)と合っているか。
  // 「正しいのは」なら正しい記述、「誤っているのは/誤りは」なら誤っている記述をすべて挙げていること(ask に関係なく)。
  // 解説の冒頭にこの形がなければ警告(要点は形が自由なので、この形で始まるときだけ確かめる)
  if (truthsOk) {
    [['explanation', '解説'], ['answer', '要点']].forEach(([field, name]) => {
      const m = String(q[field] || '').match(STYLED_LEAD);
      if (!m) {
        if (field === 'explanation') W(id, `${name}(explanation)の冒頭に答えを書く(例: 「正しいのはア・ウ・エの三つ。」「誤っているのはイとエ。」)`);
        return;
      }
      const said = [...new Set(m[2].split(/[・、と]/))].map((x) => L.indexOf(x)).sort((a, b) => a - b);
      const sideTrue = /^正しい/.test(m[1]);
      const actual = q.stmtTruths.map((t, i) => (t === sideTrue ? i : -1)).filter((i) => i >= 0);
      if (said.join(',') !== actual.join(',')) E(id, `${name}(${field})の冒頭の答え「${m[0]}」が記述の正誤と合わない(${sideTrue ? '正しい' : '誤っている'}記述は ${actual.map((i) => L[i]).join('・') || 'なし'})`);
      else if (m[3] && COUNT_WORD[m[3]] !== said.length) E(id, `${name}(${field})の冒頭の答え「${m[0]}」の数が、挙げた記述の数(${said.length})と合わない`);
    });
  }

  // 選択肢(個数: 一つ〜四つで固定 / 組合せ: 2つの記号の組を4つ、すべて別の組)
  let choicesOk = true;
  if (style === 'count') {
    if (q.choices.some((c, i) => c !== QE.COUNT_CHOICES[i])) { E(id, `個数問題の選択肢は「${QE.COUNT_CHOICES.join('」「')}」(この順)で固定`); choicesOk = false; }
  } else {
    const sets = q.choices.map((c) => QE.parseCombo(c));
    sets.forEach((p, i) => {
      if (p.length !== 2) { E(id, `組合せ問題の選択肢${i + 1}「${q.choices[i]}」は「ア、イ」のような2つの記号(ア〜エ)の組にする`); choicesOk = false; }
      else if (q.choices[i] !== `${L[p[0]]}、${L[p[1]]}`) W(id, `組合せ問題の選択肢${i + 1}「${q.choices[i]}」は「${L[p[0]]}、${L[p[1]]}」の書き方にそろえる`);
    });
    if (choicesOk && new Set(sets.map((p) => p.join(','))).size !== 4) { E(id, '組合せ問題の選択肢に同じ組がある'); choicesOk = false; }
  }

  // 答えの整合(問われている側の記述の数・組と correctIndex)
  if (truthsOk && stmtsOk && choicesOk && (q.ask === 'correct' || q.ask === 'incorrect')) {
    const r = QE.styledAnswer(q);
    const side = q.ask === 'correct' ? '正しい' : '誤っている';
    if (r.problem) E(id, `答えが合わない: ${r.problem}(${side}記述: ${r.matching.map((i) => L[i]).join('・') || 'なし'})`);
    else if (!r.ok) E(id, `答えが合わない: ${side}記述は ${r.matching.map((i) => L[i]).join('・')} なので correctIndex は ${r.expected}(今は ${q.correctIndex})`);
  }
}

// 期限付きの情報(reviewBy)の見直し時期: 4択・基礎知識・用語のすべて(対象の絞り込みに関係なく一覧にする)
const reviewItems = [...D.quiz, ...D.terms, ...D.basics].filter((x) => x && x.reviewBy != null);
reviewItems.forEach((x) => {
  if (typeof x.reviewBy !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.reviewBy)) { E(x.id, 'reviewBy は YYYY-MM-DD'); return; }
  if (x.reviewBy < TODAY) W(x.id, `reviewBy(${x.reviewBy})を過ぎている。法改正・統計の更新を確認して、内容と reviewBy を直す`);
});

// パック単位の偏り(--pack のときはパックごと、それ以外は対象全体)
function dist(list, f) { const m = {}; list.forEach((q) => { const k = f(q); m[k] = (m[k] || 0) + 1; }); return m; }
function packStats(label, list) {
  if (!list.length) return;
  const n = list.length;
  const ci = dist(list, (q) => q.correctIndex);
  [0, 1, 2, 3].forEach((k) => { const r = (ci[k] || 0) / n; if (n >= 20 && (r < 0.15 || r > 0.35)) W(label, `正解位置${k + 1}の割合が${Math.round(r * 100)}%(15〜35%に)`); });
  const ask = dist(list, (q) => q.ask);
  const rc = (ask.correct || 0) / n;
  if (n >= 20 && (rc < 0.35 || rc > 0.65)) W(label, `ask=correct の割合が${Math.round(rc * 100)}%(35〜65%に)`);
  // 正解の長さの手がかりは、選択肢が文の問題だけで数える(個数・組合せの選択肢は記号)
  const corrAsk = list.filter((q) => q.ask === 'correct' && q.style == null && Array.isArray(q.choices));
  const longest = corrAsk.filter((q) => { const L = q.choices.map((c) => c.length); return L[q.correctIndex] === Math.max(...L); }).length;
  if (corrAsk.length >= 10 && longest / corrAsk.length > 0.35) W(label, `正しいものを選ぶ問題で正解が最長の選択肢になっている割合が${Math.round((longest / corrAsk.length) * 100)}%(35%以下に)`);
  const counts = list.filter((q) => q.style === 'count');
  const combos = list.filter((q) => q.style === 'combo');
  const countAns = dist(counts, (q) => (QE.COUNT_CHOICES[q.correctIndex] || q.correctIndex));
  const styledNote = counts.length || combos.length ? `  個数 ${counts.length}問(答え ${JSON.stringify(countAns)})・組合せ ${combos.length}問` : '';
  console.log(`${label}: ${n}問  正解位置 ${JSON.stringify(ci)}  ask ${JSON.stringify(ask)}  正解が最長 ${longest}/${corrAsk.length}  レベル ${JSON.stringify(dist(list, (q) => q.level))}  試験分野 ${JSON.stringify(dist(list, (q) => (q.examCats ? q.examCats.takken : 'なし')))}${styledNote}`);
}

// 個数問題の答え(一つ〜四つ)の偏り: パック(ファイル)ごとに、同じ答えが40%を超えたら警告(3問以上のとき)
function countAnswerBias(label, list) {
  const counts = list.filter((q) => q.style === 'count' && Number.isInteger(q.correctIndex));
  if (counts.length < 3) return;
  const d = dist(counts, (q) => q.correctIndex);
  Object.keys(d).forEach((k) => {
    const r = d[k] / counts.length;
    if (r > 0.4) W(label, `個数問題の答え「${QE.COUNT_CHOICES[k] || k}」が${d[k]}/${counts.length}問(${Math.round(r * 100)}%。どの答えも40%以下に)`);
  });
}
const quizById = {};
D.quiz.forEach((q) => { quizById[q.id] = q; });
if (packFiles.length && !ALL && !PREFIX) {
  packFiles.forEach((f) => packStats(`PACK ${path.basename(f)}`, (addedBy.get(f) || []).map((id) => quizById[id]).filter(Boolean)));
} else {
  packStats('PACK', target);
}
// 個数問題の答えの偏りは、どの指定でもパック(ファイル)ごとに見る(対象の問題だけ)
const targetIds = new Set(target.map((q) => q.id));
addedBy.forEach((ids, f) => countAnswerBias(`PACK ${path.basename(f)}`, ids.filter((id) => targetIds.has(id)).map((id) => quizById[id]).filter(Boolean)));

// アプリ側の整合性チェック(js/dataIndex.js)の警告もエラーとして数える
((ctx.AppIndex && ctx.AppIndex.issues) || []).forEach((m) => errors.push(`dataIndex: ${m}`));
appWarns.filter((m) => /^\[ContentPack\]/.test(m)).forEach((m) => errors.push(m));

console.log(`\n対象 ${target.length}問(全${D.quiz.length}問)  基準日 ${TODAY}`);
console.log(`ERROR ${errors.length}件`);
errors.forEach((m) => console.log('  E ' + m));
console.log(`WARN ${warns.length}件`);
warns.forEach((m) => console.log('  W ' + m));
process.exit(errors.length || (STRICT && warns.length) ? 1 : 0);
