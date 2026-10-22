// 出題頻度ランク(v14。data/frequency.js の APP_DATA.frequency)の形の確認。tools/check.js の 9. から呼ばれる
//   module.exports = function (ctx, info) → { errors: [...], warnings: [...] }(ctx は check.js の 3. で読み込んだアプリの vm)
// エラー(公開を止める):
//   - frequency がない・形が違う(exams・themes・quizTheme・rankRule・asOf)
//   - exams: 1件以上・id は重ならない・label と日付(YYYY-MM-DD)がある・新しい順
//   - themes: id は重ならない(fq-… の形)・name がある・cat は gyoho|kenri|horei|zei|menjo・topicId は今あるトピック・
//     basicIds は今ある基礎知識で、1つの基礎知識は1つのテーマだけ・hits は 0〜exams の数の整数・questions は0以上の整数・
//     rank は rankRule と hits / exams の数から決まるランクと同じ・last は null か exams の id(hits が 0 なら null、1以上なら id)
//   - quizTheme: キーは今ある宅建士の分野つきの4択(examCats.takken が null でない)・値は themes の id
// 警告(知らせるだけ): テーマのない宅建士の4択がある・section がトピックの小見出しの名前にない・問題も基礎知識もないテーマ・
//   問題のテーマの分野と問題の分野(examCats.takken)が違う・名前や説明が長い(過去問の文を写していないかを見直すため)・知らない項目
'use strict';

const CATS = ['gyoho', 'kenri', 'horei', 'zei', 'menjo'];
const RANKS = ['A', 'B', 'C'];
const THEME_KEYS = ['id', 'name', 'cat', 'topicId', 'section', 'basicIds', 'hits', 'questions', 'rank', 'last'];
const TOP_KEYS = ['asOf', 'exams', 'method', 'rankRule', 'themes', 'quizTheme'];
const NAME_MAX = 40; // テーマの名前の長さの目安
const METHOD_MAX = 300; // 説明の長さの目安
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

// hits と回数と境目から決まるランク
function rankOf(hits, total, rule) {
  const share = total > 0 ? hits / total : 0;
  if (share >= rule.A - 1e-9) return 'A';
  if (share >= rule.B - 1e-9) return 'B';
  return 'C';
}

function validate(D) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);
  const f = D && D.frequency;
  if (!plain(f)) {
    E('APP_DATA.frequency がありません(data/frequency.js)');
    return { errors, warnings };
  }
  Object.keys(f).forEach((k) => { if (!TOP_KEYS.includes(k)) W(`frequency に知らない項目 ${k} があります`); });
  if (typeof f.asOf !== 'string' || !DATE_RE.test(f.asOf)) E(`frequency.asOf が YYYY-MM-DD ではありません(${JSON.stringify(f.asOf)})`);
  if (typeof f.method !== 'string' || !f.method.trim()) E('frequency.method(#freq に出す数え方の説明)がありません');
  else if (f.method.length > METHOD_MAX) W(`frequency.method が長すぎます(${f.method.length}字。${METHOD_MAX}字まで)`);

  // 回(新しい順)
  const exams = Array.isArray(f.exams) ? f.exams : null;
  const examIds = new Set();
  if (!exams || !exams.length) E('frequency.exams がありません(数えた本試験の一覧)');
  else {
    let prev = null;
    exams.forEach((e, i) => {
      if (!plain(e) || typeof e.id !== 'string' || !e.id) { E(`frequency.exams[${i}] に id がありません`); return; }
      if (examIds.has(e.id)) E(`frequency.exams の id ${e.id} が重なっています`);
      examIds.add(e.id);
      if (typeof e.label !== 'string' || !e.label) E(`frequency.exams ${e.id} に label がありません`);
      if (typeof e.date !== 'string' || !DATE_RE.test(e.date)) E(`frequency.exams ${e.id} の date が YYYY-MM-DD ではありません`);
      else {
        if (prev && e.date > prev) E(`frequency.exams が新しい順ではありません(${e.id})`);
        prev = e.date;
      }
    });
  }
  const total = exams ? exams.length : 0;

  const rule = plain(f.rankRule) ? f.rankRule : null;
  const ruleOk = rule && typeof rule.A === 'number' && typeof rule.B === 'number' && rule.A > 0 && rule.A <= 1 && rule.B > 0 && rule.B < rule.A;
  if (!ruleOk) E(`frequency.rankRule は { A, B }(0 < B < A ≦ 1)の形にしてください(${JSON.stringify(f.rankRule)})`);

  // 照らし合わせる元のデータ
  const quizById = new Map();
  (Array.isArray(D.quiz) ? D.quiz : []).forEach((q) => { if (q && typeof q.id === 'string') quizById.set(q.id, q); });
  // 基礎知識: data/basics.js の項目と、トピックの基礎知識チェックリスト(topic.basicIds)に入っている用語
  const basicIds = new Set((Array.isArray(D.basics) ? D.basics : []).map((b) => b && b.id).filter(Boolean));
  const termIds = new Set((Array.isArray(D.terms) ? D.terms : []).map((x) => x && x.id).filter(Boolean));
  const topics = new Map((Array.isArray(D.topics) ? D.topics : []).filter((t) => t && t.id).map((t) => [t.id, t]));
  topics.forEach((t) => (Array.isArray(t.basicIds) ? t.basicIds : []).forEach((id) => { if (termIds.has(id)) basicIds.add(id); }));
  const takkenCat = (q) => (q && plain(q.examCats) && typeof q.examCats.takken === 'string' && q.examCats.takken ? q.examCats.takken : null);

  // テーマ
  const themes = Array.isArray(f.themes) ? f.themes : null;
  const themeById = new Map();
  const basicOwner = new Map();
  if (!themes || !themes.length) E('frequency.themes がありません');
  (themes || []).forEach((t, i) => {
    if (!plain(t) || typeof t.id !== 'string' || !t.id) { E(`frequency.themes[${i}] に id がありません`); return; }
    const where = `テーマ ${t.id}`;
    if (themeById.has(t.id)) E(`${where}: id が重なっています`);
    themeById.set(t.id, t);
    if (!/^fq-[a-z]+-[0-9a-z-]+$/.test(t.id)) W(`${where}: id は fq-<分野>-<番号> の形にしてください`);
    Object.keys(t).forEach((k) => { if (!THEME_KEYS.includes(k)) W(`${where}: 知らない項目 ${k}`); });
    if (typeof t.name !== 'string' || !t.name.trim()) E(`${where}: name がありません`);
    else if (t.name.length > NAME_MAX) W(`${where}: name が長すぎます(${t.name.length}字。${NAME_MAX}字まで)`);
    if (!CATS.includes(t.cat)) E(`${where}: cat が ${CATS.join('|')} ではありません(${JSON.stringify(t.cat)})`);
    const topic = typeof t.topicId === 'string' ? topics.get(t.topicId) : null;
    if (!topic) E(`${where}: topicId ${JSON.stringify(t.topicId)} のトピックがありません`);
    if (t.section != null && typeof t.section !== 'string') E(`${where}: section は文字列にしてください`);
    else if (topic && typeof t.section === 'string' && Array.isArray(topic.sections) && !topic.sections.some((s) => s && s.name === t.section)) {
      W(`${where}: section「${t.section}」は ${topic.id} の小見出しにありません`);
    }
    if (!Array.isArray(t.basicIds)) E(`${where}: basicIds が配列ではありません`);
    else {
      t.basicIds.forEach((b) => {
        if (typeof b !== 'string' || !basicIds.has(b)) { E(`${where}: 基礎知識 ${JSON.stringify(b)} がありません`); return; }
        if (basicOwner.has(b) && basicOwner.get(b) !== t.id) E(`${where}: 基礎知識 ${b} は ${basicOwner.get(b)} にも入っています(1つの基礎知識は1つのテーマだけ)`);
        else if (basicOwner.get(b) === t.id) E(`${where}: 基礎知識 ${b} が2回入っています`);
        basicOwner.set(b, t.id);
      });
    }
    if (!isInt(t.hits) || t.hits < 0 || (total && t.hits > total)) E(`${where}: hits は 0〜${total} の整数にしてください(${JSON.stringify(t.hits)})`);
    if (!isInt(t.questions) || t.questions < 0) E(`${where}: questions は0以上の整数にしてください(${JSON.stringify(t.questions)})`);
    if (!RANKS.includes(t.rank)) E(`${where}: rank が A・B・C ではありません(${JSON.stringify(t.rank)})`);
    else if (ruleOk && total && isInt(t.hits)) {
      const want = rankOf(t.hits, total, rule);
      if (want !== t.rank) E(`${where}: rank ${t.rank} が hits ${t.hits}/${total} と rankRule から決まるランク ${want} と違います`);
    }
    if (t.last === null || t.last === undefined) {
      if (isInt(t.hits) && t.hits > 0) E(`${where}: hits が ${t.hits} なのに last(最後に出た回)がありません`);
    } else if (typeof t.last !== 'string' || !examIds.has(t.last)) E(`${where}: last ${JSON.stringify(t.last)} は exams の id ではありません`);
    else if (t.hits === 0) E(`${where}: hits が 0 なのに last があります`);
  });

  // 問題 → テーマ
  const qt = plain(f.quizTheme) ? f.quizTheme : null;
  const used = new Map();
  if (!qt) E('frequency.quizTheme がありません');
  else {
    let catMismatch = 0;
    const catSamples = [];
    Object.keys(qt).forEach((qid) => {
      const tid = qt[qid];
      const q = quizById.get(qid);
      if (!q) { E(`quizTheme: 問題 ${qid} がありません`); return; }
      if (!takkenCat(q)) { E(`quizTheme: 問題 ${qid} は宅建士の分野(examCats.takken)が付いていません`); return; }
      if (typeof tid !== 'string' || !themeById.has(tid)) { E(`quizTheme: 問題 ${qid} のテーマ ${JSON.stringify(tid)} がありません`); return; }
      used.set(tid, (used.get(tid) || 0) + 1);
      if (themeById.get(tid).cat !== takkenCat(q)) {
        catMismatch += 1;
        if (catSamples.length < 3) catSamples.push(`${qid}(${takkenCat(q)}→${tid})`);
      }
    });
    if (catMismatch) W(`quizTheme: テーマの分野と問題の分野が違う問題が${catMismatch}問あります(例: ${catSamples.join('・')})`);
    const missing = Array.from(quizById.values()).filter((q) => takkenCat(q) && !hasOwn(qt, q.id));
    if (missing.length) W(`宅建士の分野が付いた4択のうち${missing.length}問にテーマがありません(例: ${missing.slice(0, 5).map((q) => q.id).join('・')})`);
  }
  themeById.forEach((t, id) => {
    if (!used.get(id) && !(Array.isArray(t.basicIds) && t.basicIds.length)) W(`テーマ ${id}: 問題も基礎知識もありません`);
  });
  return { errors, warnings, stats: { themes: themeById.size, exams: total, quizzes: qt ? Object.keys(qt).length : 0 } };
}

module.exports = function (ctx) {
  return validate(ctx && ctx.APP_DATA);
};
module.exports.validate = validate;
module.exports.rankOf = rankOf;
