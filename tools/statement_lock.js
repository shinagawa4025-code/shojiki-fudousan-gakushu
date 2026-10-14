// ○×一問一答の文の固定(statement lock)。利用者の ○× の記録(oxStats)は「問題ID#選択肢の番号」で保存されるため、
// 公開済みの問題の選択肢の順番や正誤が変わると、記録が別の文に付いてしまう。それを CI で止める。
//
// ルール(問題を直すとき):
//   ・公開済みの問題の、選択肢の順番と正誤は変えない(言い回しの修正はよい。CI は警告だけ出す)
//   ・内容(正誤)が変わる修正は、新しいIDの問題として追加し、古いIDを廃止する(data/content/q2_fix.js などの APP_DATA.retiredQuizIds に入れる)
//
// 使い方(リポジトリの直下で):
//   node tools/statement_lock.js            確認だけ(CI と同じ。エラーがあれば終了コード1)
//   node tools/statement_lock.js --update   新しい文を追記し、言い回しだけ直した文の目印を更新する(正誤・削除は変えない)。結果をコミットする
//   node tools/statement_lock.js --write    今のデータで作り直す(基準の取り直し)。公開する直前に1回だけ使う。結果をコミットする
//   --webapp <dir> でアプリのフォルダを指定(既定: ../webapp)
//
// 判定:
//   エラー: 固定済みの文の正誤が変わった / 選択肢の順番が入れ替わった(同じ問題の別の番号に同じ文がある) / 文が消えた(廃止の登録がない)
//           文のキーの形が「問題ID#0〜3」(選択肢)・「問題ID#s0〜s3」(個数・組合せの問題の記述ア〜エ)でない
//   警告:   文の言い回しが変わった(正誤は同じ)
//   お知らせ: まだ固定していない新しい文(--update で追記する)
// 個数・組合せの問題の記述ア〜エも同じ決まり(記述の順番と正誤は変えない。問題の style も変えない。変えるなら新しいID)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadApp } = require('./lib/appload.js');

const LOCK_FILE = path.join(__dirname, 'statement_lock.json');
// 文のキー: 「問題ID#選択肢の番号(0〜3)」か「問題ID#s記述の番号(0〜3。ア = s0)」(利用者の ○× の記録 oxStats のキーと同じ)
const KEY_RE = /^[^#]+#(?:[0-3]|s[0-3])$/;

// 文の正規化: NFKC、空白をすべて除く、末尾の「。」を除く
const normalize = (s) => String(s).normalize('NFKC').replace(/\s+/g, '').replace(/。$/, '');
const textHash = (s) => crypto.createHash('sha1').update(normalize(s)).digest('hex').slice(0, 12);
const fingerprint = (st) => `${textHash(st.text)}:${st.truth ? 'T' : 'F'}`;

function currentStatements(webappDir) {
  const { ctx } = loadApp(webappDir, { hostname: 'localhost' });
  const stmts = ctx.QuizEngine.allStatements();
  const retired = new Set((Array.isArray(ctx.APP_DATA.retiredQuizIds) ? ctx.APP_DATA.retiredQuizIds : []).filter((x) => typeof x === 'string'));
  return { stmts, retired };
}

function readLock() {
  if (!fs.existsSync(LOCK_FILE)) return null;
  return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
}

function writeLock(lock) {
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 1).replace(/\n {2,}/g, '\n ') + '\n');
}

function baseLock(entries, retired) {
  return {
    _note: '○×一問一答の文の固定(tools/statement_lock.js)。公開済みの問題の選択肢の順番と正誤は変えない。正誤が変わる修正は新しいIDで追加し、古いIDを APP_DATA.retiredQuizIds に入れる。',
    baselineAt: new Date().toISOString().slice(0, 10),
    count: Object.keys(entries).length,
    // 文単位・問題単位で廃止を登録するとき用(通常は APP_DATA.retiredQuizIds を使う)
    retired: retired || [],
    statements: entries,
  };
}

// 戻り値: { errors: [], warns: [], added: [], textChanged: [] }
function compare(lock, stmts, dataRetired) {
  const errors = [];
  const warns = [];
  const added = [];
  const textChanged = [];
  const locked = lock.statements || {};
  const retiredList = new Set([...(lock.retired || []), ...dataRetired]);
  const isRetired = (id) => retiredList.has(id) || retiredList.has(id.split('#')[0]);
  const now = new Map(stmts.map((s) => [s.id, s]));
  // キーの形(固定済みのもの・今のデータのもの)。形の違うキーがあれば --update もしない
  Object.keys(locked).forEach((id) => { if (!KEY_RE.test(id)) errors.push(`${id}: 固定済みの文のキーの形が違います(問題ID#0〜3 か 問題ID#s0〜s3)`); });
  stmts.forEach((st) => { if (!KEY_RE.test(String(st.id))) errors.push(`${st.id}: 文のキーの形が違います(問題ID#0〜3 か 問題ID#s0〜s3。js/quizEngine.js の statementsFrom を確認)`); });
  // 今の文がある問題(選択肢の文「#n」か記述ア〜エ「#sn」か。消えた文の理由の説明に使う)
  const nowKinds = new Map();
  stmts.forEach((st) => {
    const q = String(st.id).split('#')[0];
    const k = /#s\d$/.test(st.id) ? 's' : 'n';
    if (!nowKinds.has(q)) nowKinds.set(q, new Set());
    nowKinds.get(q).add(k);
  });
  // 問題ごとの固定済みの文の目印(並べ替えの検出用)
  const lockedByQuiz = new Map();
  Object.keys(locked).forEach((id) => {
    const q = id.split('#')[0];
    if (!lockedByQuiz.has(q)) lockedByQuiz.set(q, []);
    lockedByQuiz.get(q).push([id, String(locked[id]).split(':')[0]]);
  });
  Object.keys(locked).forEach((id) => {
    const [lh, lt] = String(locked[id]).split(':');
    const st = now.get(id);
    if (!st) {
      if (isRetired(id)) return;
      // 同じ問題の文が、選択肢の文(#n)と記述ア〜エ(#sn)の間で入れ替わった = 問題の形(個数・組合せかどうか)を変えた
      const kinds = nowKinds.get(id.split('#')[0]);
      const wasStyled = /#s\d$/.test(id);
      if (kinds && kinds.has(wasStyled ? 'n' : 's')) errors.push(`${id}: 問題の形(個数・組合せの style)が変わり、固定済みの文が消えました。公開した問題の形は変えない(新しいIDの問題にして、古いIDを APP_DATA.retiredQuizIds に入れる)`);
      else errors.push(`${id}: 固定済みの文が消えました(問題を廃止したなら APP_DATA.retiredQuizIds に問題IDを入れる)`);
      return;
    }
    const h = textHash(st.text);
    const t = st.truth ? 'T' : 'F';
    if (h !== lh) {
      // 同じ問題の別の番号に固定されていた文と同じ → 選択肢の順番が入れ替わった
      const moved = (lockedByQuiz.get(st.quizId) || []).find(([otherId, oh]) => otherId !== id && oh === h);
      if (moved) { errors.push(`${id}: 選択肢の順番が変わりました(今の ${id} は、以前の ${moved[0]} の文です)。公開済みの問題の選択肢は並べ替えない`); return; }
    }
    if (t !== lt) { errors.push(`${id}: 正誤が変わりました(${lt === 'T' ? '○' : '×'} → ${t === 'T' ? '○' : '×'})。正誤が変わる修正は新しいIDの問題にする「${String(st.text).slice(0, 40)}…」`); return; }
    if (h !== lh) { warns.push(`${id}: 文の言い回しが変わりました(正誤は同じ)「${String(st.text).slice(0, 40)}…」`); textChanged.push(id); }
  });
  stmts.forEach((st) => { if (!Object.prototype.hasOwnProperty.call(locked, st.id)) added.push(st.id); });
  return { errors, warns, added, textChanged };
}

function run(opts) {
  const webappDir = path.resolve(opts.webapp || path.join(__dirname, '..', 'webapp'));
  const { stmts, retired } = currentStatements(webappDir);
  const out = { errors: [], warns: [], info: [], count: stmts.length };
  if (opts.mode === 'write') {
    const badKeys = stmts.filter((st) => !KEY_RE.test(String(st.id)));
    if (badKeys.length) {
      badKeys.forEach((st) => out.errors.push(`${st.id}: 文のキーの形が違います(問題ID#0〜3 か 問題ID#s0〜s3)`));
      out.info.push('エラーがあるため --write はしませんでした');
      return out;
    }
    const entries = {};
    stmts.forEach((st) => { entries[st.id] = fingerprint(st); });
    const prev = readLock();
    writeLock(baseLock(entries, prev && prev.retired));
    out.info.push(`statement_lock.json を作り直しました(${stmts.length}文)`);
    return out;
  }
  const lock = readLock();
  if (!lock) { out.errors.push('tools/statement_lock.json がありません(node tools/statement_lock.js --write で作る)'); return out; }
  const r = compare(lock, stmts, retired);
  out.errors.push(...r.errors);
  out.warns.push(...r.warns);
  if (opts.mode === 'update') {
    if (r.errors.length) { out.info.push('エラーがあるため --update はしませんでした'); return out; }
    const byId = new Map(stmts.map((s) => [s.id, s]));
    r.textChanged.forEach((id) => { lock.statements[id] = fingerprint(byId.get(id)); });
    r.added.forEach((id) => { lock.statements[id] = fingerprint(byId.get(id)); });
    lock.count = Object.keys(lock.statements).length;
    writeLock(lock);
    out.info.push(`statement_lock.json を更新しました(追加 ${r.added.length}文・言い回しの更新 ${r.textChanged.length}文。合計 ${lock.count}文)`);
    return out;
  }
  if (r.added.length) out.info.push(`まだ固定していない新しい文 ${r.added.length}件(node tools/statement_lock.js --update で追記してコミットする): ${r.added.slice(0, 8).join(', ')}${r.added.length > 8 ? ' …' : ''}`);
  out.info.push(`固定済み ${Object.keys(lock.statements).length}文 / 現在 ${stmts.length}文`);
  return out;
}

module.exports = { run, compare, normalize, textHash, fingerprint, LOCK_FILE, KEY_RE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const wi = args.indexOf('--webapp');
  const mode = args.includes('--write') ? 'write' : args.includes('--update') ? 'update' : 'check';
  const r = run({ mode, webapp: wi >= 0 ? args[wi + 1] : null });
  r.info.forEach((m) => console.log(m));
  r.warns.forEach((m) => console.log(`WARN ${m}`));
  r.errors.forEach((m) => console.log(`ERROR ${m}`));
  console.log(`○×の文 ${r.count}件  エラー ${r.errors.length}件  警告 ${r.warns.length}件`);
  process.exit(r.errors.length ? 1 : 0);
}
