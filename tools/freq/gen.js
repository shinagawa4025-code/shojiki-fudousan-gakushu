// 出題頻度ランク(v14)の webapp/data/frequency.js を作る(毎年の見直し用。手で直さず、このフォルダの入力を直して作り直す)
// 入力(このフォルダの JSON。過去問の文章は含まない。回の id・問題番号・テーマの id と、このアプリが書いたテーマの名前・範囲だけ):
//   exams.json      数えた本試験 [{ id, label, date }](古い順でも新しい順でもよい。出力は新しい順)
//   themes.json     論点(テーマ) [{ id, name, cat, topicId, section, basicIds, scope }](scope はテーマの範囲のメモ。出力ではコメント)
//   past.json       過去問の分類 [{ exam, no, primary, secondary: [], low? }](1回50問。primary = 主な論点、secondary = ほかの選択肢で
//                   問われた論点。low = 分類に迷った印(集計には使わない))
//   quizTheme.json  アプリの4択 → テーマ [{ quizId, themeId }](宅建の分野が付いた4択はすべて)
//   config.json     { asOf, rankRule: { A, B }, method, source }(source は frequency.js の先頭で足す情報源)
// 使い方(どこからでも。既定のリポジトリはこのファイルの2つ上):
//   node tools/freq/gen.js            確かめるだけ。作った内容が今の webapp/data/frequency.js と同じかを出す(違えば終了コード 1)
//   node tools/freq/gen.js --write    webapp/data/frequency.js を書く
//   node tools/freq/gen.js --stats    ランクの境目の候補ごとの A/B/C の数と、回数の分布も出す
//   --repo <リポジトリ>  別の場所のリポジトリ / --appeared  テーマに appeared(出た回)も足す(tools/lib/checks/freq.js が警告するので既定では出さない)
// 次の年の追加のしかたは README.txt。tools/check.js(tools/lib/checks/freqgen.js)と単体テストは、frequency.js がここから作った内容と
// 同じかを確かめる(違えばエラー)
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const CAT_ORDER = ['gyoho', 'kenri', 'horei', 'zei', 'menjo'];
const CATS = CAT_ORDER;
const CAT_TOPIC = { gyoho: 'topicK', kenri: 'topicL', horei: 'topicJ', zei: 'topicH', menjo: 'topicN' };
const CAT_NAME = { gyoho: '宅建業法', kenri: '権利関係', horei: '法令上の制限', zei: '税・価格の評定', menjo: '5問免除科目' };
const QUESTIONS_PER_EXAM = 50;
// 回ごとの分野の問題数(宅建士試験は 業法20・権利14・法令8・税3・免除5)
const EXPECT = { gyoho: 20, kenri: 14, horei: 8, zei: 3, menjo: 5 };

function rankOf(hits, total, rule) {
  const share = hits / total;
  if (share >= rule.A - 1e-9) return 'A';
  if (share >= rule.B - 1e-9) return 'B';
  return 'C';
}

// テンプレートリテラル(バッククォート)。中にバッククォート・${・\ があれば逃がす
function lit(s) {
  return '`' + String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

// opts: { dir(入力のフォルダ), repo, app(読み込み済みのアプリの vm。なければ repo の webapp を読む), appeared }
// 戻り値: { text(frequency.js の中身。エラーがあれば null), errors, warns, info: [要約の行], rows, exams, rule }
function generate(opts) {
  opts = opts || {};
  const dir = opts.dir || HERE;
  const repo = path.resolve(opts.repo || path.join(HERE, '..', '..'));
  const EXTRA = !!opts.appeared;
  const errors = [];
  const warns = [];
  const E = (m) => errors.push(m);
  const W = (m) => warns.push(m);
  const readJson = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

  const exams = readJson('exams.json').slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 新しい順
  // テーマは #freq の分野のタブの順(業法・権利・法令・税・免除)、同じ分野の中は id の順に並べる
  const themes = readJson('themes.json').slice().sort((a, b) => (CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const past = readJson('past.json');
  const pairs = readJson('quizTheme.json');
  const cfgFile = path.join(dir, 'config.json');
  const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
  const ASOF = cfg.asOf || '2026-10-22';
  const RULE = cfg.rankRule || { A: 0.75, B: 0.4 };

  // ---- 入力の形
  const examIds = exams.map((e) => e.id);
  const examIndex = new Map(examIds.map((id, i) => [id, i])); // 0 が最も新しい
  if (new Set(examIds).size !== examIds.length) E('exams.json: id が重複しています');
  exams.forEach((e) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) E(`exams.json: ${e.id} の date が YYYY-MM-DD ではありません`); });
  const themeById = new Map();
  themes.forEach((t) => {
    if (themeById.has(t.id)) E(`themes.json: id ${t.id} が重複しています`);
    themeById.set(t.id, t);
    if (!CATS.includes(t.cat)) E(`themes.json: ${t.id} の cat ${t.cat} が不正です`);
    if (!/^fq-(gyoho|kenri|horei|zei|menjo)-\d{2}$/.test(t.id) || t.id.split('-')[1] !== t.cat) E(`themes.json: ${t.id} の id と cat が合いません`);
    if (CAT_TOPIC[t.cat] !== t.topicId) E(`themes.json: ${t.id} の topicId ${t.topicId} が分野 ${t.cat} のトピックではありません`);
    if (!Array.isArray(t.basicIds)) E(`themes.json: ${t.id} の basicIds が配列ではありません`);
  });
  const seenQ = new Set();
  const perExam = new Map(examIds.map((id) => [id, 0]));
  past.forEach((r) => {
    const key = `${r.exam}#${r.no}`;
    if (seenQ.has(key)) E(`past.json: ${key} が重複しています`);
    seenQ.add(key);
    if (!examIndex.has(r.exam)) { E(`past.json: ${key} の回 ${r.exam} が exams.json にありません`); return; }
    perExam.set(r.exam, perExam.get(r.exam) + 1);
    if (!Number.isInteger(r.no) || r.no < 1 || r.no > QUESTIONS_PER_EXAM) E(`past.json: ${key} の問題番号が 1〜${QUESTIONS_PER_EXAM} ではありません`);
    if (!themeById.has(r.primary)) E(`past.json: ${key} の primary ${r.primary} がテーマにありません`);
    (r.secondary || []).forEach((s) => {
      if (!themeById.has(s)) E(`past.json: ${key} の secondary ${s} がテーマにありません`);
      if (s === r.primary) W(`past.json: ${key} の secondary に primary と同じ ${s} があります`);
    });
    if (new Set(r.secondary || []).size !== (r.secondary || []).length) W(`past.json: ${key} の secondary に重複があります`);
  });
  perExam.forEach((n, id) => { if (n !== QUESTIONS_PER_EXAM) E(`past.json: ${id} の問題が ${n} 問です(${QUESTIONS_PER_EXAM} 問のはず)`); });

  // ---- 集計: hits = その論点が出た回の数(主な論点か、ほかに問われた論点として)、questions = 主な論点の問題数
  const stat = new Map(themes.map((t) => [t.id, { appeared: new Set(), questions: 0, secondaryOnly: new Set(), crossCat: 0 }]));
  past.forEach((r) => {
    const p = stat.get(r.primary);
    if (!p) return;
    p.questions += 1;
    p.appeared.add(r.exam);
    const pcat = themeById.get(r.primary).cat;
    (r.secondary || []).forEach((s) => {
      const st = stat.get(s);
      if (!st) return;
      st.appeared.add(r.exam);
      if (themeById.get(s).cat !== pcat) st.crossCat += 1;
    });
  });
  // 主な論点としては出ていない回(ほかに問われた論点としてだけ数えた回)
  past.forEach((r) => { (r.secondary || []).forEach((s) => { const st = stat.get(s); if (st) st.secondaryOnly.add(r.exam); }); });
  past.forEach((r) => { const st = stat.get(r.primary); if (st) st.secondaryOnly.delete(r.exam); });

  const total = exams.length;
  const rows = themes.map((t) => {
    const st = stat.get(t.id);
    const appeared = examIds.filter((id) => st.appeared.has(id)); // 新しい順
    return { t, hits: appeared.length, questions: st.questions, last: appeared[0] || null, appeared, secondaryOnly: examIds.filter((id) => st.secondaryOnly.has(id)), crossCat: st.crossCat };
  });
  // 主な論点の問題数の合計は分類した問題の数と同じ。回数は 0〜回の数
  const qSum = rows.reduce((s, r) => s + r.questions, 0);
  if (qSum !== past.length) E(`questions の合計 ${qSum} が分類した問題の数 ${past.length} と違います`);
  rows.forEach((r) => { if (r.hits < 0 || r.hits > total) E(`${r.t.id}: hits ${r.hits} が 0〜${total} ではありません`); if (r.questions && !r.hits) E(`${r.t.id}: 主な論点の問題があるのに hits が 0 です`); });
  examIds.forEach((id) => {
    const c = {};
    past.filter((r) => r.exam === id && themeById.has(r.primary)).forEach((r) => { const k = themeById.get(r.primary).cat; c[k] = (c[k] || 0) + 1; });
    CATS.forEach((k) => { if ((c[k] || 0) !== EXPECT[k]) W(`${id}: 主な論点が ${k} の問題が ${c[k] || 0} 問(ふつうは ${EXPECT[k]} 問)`); });
  });

  // ---- アプリのデータと突き合わせる
  let app = opts.app || null;
  if (!app) {
    try {
      const { loadApp } = require(path.join(repo, 'tools', 'lib', 'appload.js'));
      app = loadApp(path.join(repo, 'webapp')).ctx;
    } catch (e) {
      E(`アプリのデータを読み込めませんでした(${repo}): ${e.message}`);
    }
  }
  const quizThemeOut = []; // [quizId, themeId](アプリの問題の順)
  if (app) {
    const D = app.APP_DATA;
    const basicIds = new Set(D.basics.map((b) => b.id));
    const topics = new Map(D.topics.map((tp) => [tp.id, tp]));
    const basicOwner = new Map();
    themes.forEach((t) => {
      const tp = topics.get(t.topicId);
      if (!tp) { E(`${t.id}: トピック ${t.topicId} がありません`); return; }
      const secs = (tp.sections || []);
      const sec = secs.find((s) => s.name === t.section);
      if (!sec) W(`${t.id}: 小見出し「${t.section}」が ${t.topicId} にありません`);
      const inTopic = new Set(secs.flatMap((s) => s.ids || []));
      t.basicIds.forEach((b) => {
        if (!basicIds.has(b)) E(`${t.id}: 基礎知識 ${b} がありません`);
        if (basicOwner.has(b)) E(`${t.id}: 基礎知識 ${b} は ${basicOwner.get(b)} にもあります(1つのテーマだけ)`);
        basicOwner.set(b, t.id);
        if (!inTopic.has(b)) W(`${t.id}: 基礎知識 ${b} は ${t.topicId} の小見出しにありません`);
        else if (sec && !(sec.ids || []).includes(b)) W(`${t.id}: 基礎知識 ${b} は小見出し「${t.section}」ではなく別の小見出しにあります`);
      });
    });
    // 宅建の5トピックの基礎知識で、どのテーマにも入っていないもの
    Object.values(CAT_TOPIC).forEach((tid) => {
      const tp = topics.get(tid);
      (tp ? tp.sections || [] : []).forEach((s) => (s.ids || []).forEach((b) => { if (!basicOwner.has(b)) W(`基礎知識 ${b}(${tid}「${s.name}」)はどのテーマにも入っていません`); }));
    });
    const pairMap = new Map();
    pairs.forEach((p) => {
      if (pairMap.has(p.quizId)) E(`quizTheme.json: ${p.quizId} が重複しています`);
      pairMap.set(p.quizId, p.themeId);
      if (!themeById.has(p.themeId)) E(`quizTheme.json: ${p.quizId} のテーマ ${p.themeId} がありません`);
    });
    const quizById = new Map(D.quiz.map((q) => [q.id, q]));
    pairMap.forEach((tid, qid) => {
      const q = quizById.get(qid);
      if (!q) { E(`quizTheme.json: 問題 ${qid} がありません`); return; }
      const cat = q.examCats && q.examCats.takken;
      if (!cat) E(`quizTheme.json: ${qid} は宅建の分野が付いていません`);
      else if (themeById.has(tid) && themeById.get(tid).cat !== cat) W(`${qid}: 宅建の分野 ${cat} とテーマ ${tid} の分野が違います`);
    });
    D.quiz.forEach((q) => {
      const cat = q.examCats && q.examCats.takken;
      if (!cat) return;
      if (!pairMap.has(q.id)) { E(`宅建の4択 ${q.id}(${cat})にテーマがありません`); return; }
      quizThemeOut.push([q.id, pairMap.get(q.id)]);
    });
  }

  // ---- 出力
  function build() {
    const out = [];
    out.push('// 出題頻度ランク(v14): 論点(テーマ)ごとに、宅建士試験の過去の本試験で何回出たかを数えた A/B/C のランク');
    out.push('// 不動産適正取引推進機構(RETIO)が公開している過去の試験問題を論点ごとに分類し、その論点が出た回を数えた集計(手で直さない。');
    out.push('// 直すときは分類からやり直して作り直す)。過去問の文章は使わず、数えた回数だけを載せる');
    out.push('// 形:');
    out.push('//   asOf      集計した日');
    out.push('//   exams     数えた本試験(新しい順。令和2年度・3年度は10月と12月の2回: id R3-12, R3-10 …)');
    out.push('//   method    #freq の画面に出す説明(数え方と、目安であること)');
    out.push(`//   rankRule  数えた本試験のうち、そのテーマが出た回の割合の境目(A 以上 → A、B 以上 → B、それ未満 → C)。${total}回なら A は${Math.ceil(RULE.A * total - 1e-9)}回以上・B は${Math.ceil(RULE.B * total - 1e-9)}回以上`);
    out.push('//   themes    [{ id, name, cat(gyoho|kenri|horei|zei|menjo), topicId, section(トピックの小見出し), basicIds(1つの基礎知識は1つのテーマだけ),');
    out.push('//               hits(出た回数。主な論点としてか、1問の中のほかの選択肢で問われた論点として), questions(そのテーマが主な論点の問題数),');
    out.push('//               rank, last(最後に出た回の id。出ていなければ null) }]');
    out.push('//   quizTheme { 問題ID: テーマID }(宅建の分野が付いた4択はすべていずれかのテーマへ。○×の文は元の4択のテーマに従う)');
    out.push('// テーマの id は公開後は変えない(成績の集計と絞り込みが id で引くため)');
    out.push('window.APP_DATA = window.APP_DATA || {};');
    if (cfg.source) {
      const s = cfg.source;
      out.push('// 情報源(data/sources.js は書き換えず、ここで足す。id は src230〜234)');
      out.push('window.APP_DATA.sources = window.APP_DATA.sources || [];');
      out.push(`window.APP_DATA.sources.push({ id: ${lit(s.id)}, category: ${lit(s.category)}, orgName: ${lit(s.orgName)},`);
      out.push(`  url: ${lit(s.url)},`);
      out.push(`  description: ${lit(s.description)} });`);
    }
    out.push('window.APP_DATA.frequency = {');
    out.push(`  asOf: ${lit(ASOF)},`);
    out.push('  exams: [');
    exams.forEach((e) => out.push(`    { id: ${lit(e.id)}, label: ${lit(e.label)}, date: ${lit(e.date)} },`));
    out.push('  ],');
    out.push(`  method: ${lit(cfg.method || '')},`);
    if (EXTRA && cfg.source) out.push(`  sources: [${lit(cfg.source.id)}],`);
    out.push(`  rankRule: { A: ${RULE.A}, B: ${RULE.B} },`);
    out.push('  themes: [');
    let cat = null;
    rows.forEach((r) => {
      const t = r.t;
      if (t.cat !== cat) { cat = t.cat; out.push(`    // ---- ${CAT_NAME[cat]}`); }
      if (t.scope) out.push(`    // ${t.scope.replace(/\s+/g, ' ')}`);
      out.push(`    { id: ${lit(t.id)}, name: ${lit(t.name)}, cat: ${lit(t.cat)}, topicId: ${lit(t.topicId)}, section: ${lit(t.section)},`);
      out.push(`      basicIds: [${t.basicIds.map(lit).join(', ')}],`);
      out.push(`      hits: ${r.hits}, questions: ${r.questions}, rank: ${lit(rankOf(r.hits, total, RULE))}, last: ${r.last ? lit(r.last) : 'null'}${EXTRA ? `, appeared: [${r.appeared.map(lit).join(', ')}]` : ''} },`);
    });
    out.push('  ],');
    out.push('  quizTheme: {');
    const byTheme = new Map(themes.map((t) => [t.id, []]));
    quizThemeOut.forEach(([q, t]) => byTheme.get(t).push(q));
    themes.forEach((t) => {
      const qs = byTheme.get(t.id);
      if (!qs.length) return;
      out.push(`    // ${t.id} ${t.name}`);
      for (let i = 0; i < qs.length; i += 4) out.push('    ' + qs.slice(i, i + 4).map((q) => `'${q}': ${lit(t.id)},`).join(' '));
    });
    out.push('  },');
    out.push('};');
    return out.join('\n') + '\n';
  }

  // ---- 要約
  const info = [];
  if (total) {
    const counts = {};
    CATS.forEach((c) => { counts[c] = { A: 0, B: 0, C: 0 }; });
    rows.forEach((r) => { counts[r.t.cat][rankOf(r.hits, total, RULE)] += 1; });
    const all = { A: 0, B: 0, C: 0 };
    CATS.forEach((c) => ['A', 'B', 'C'].forEach((k) => { all[k] += counts[c][k]; }));
    info.push(`本試験 ${total}回(${exams[exams.length - 1].id}〜${exams[0].id})・分類した問題 ${past.length}・テーマ ${themes.length}・4択の対応 ${quizThemeOut.length}`);
    info.push(`境目: A ≥ ${RULE.A}(${Math.ceil(RULE.A * total - 1e-9)}回以上)・B ≥ ${RULE.B}(${Math.ceil(RULE.B * total - 1e-9)}回以上)`);
    info.push(`A ${all.A}・B ${all.B}・C ${all.C} | ` + CATS.map((c) => `${c} A${counts[c].A}/B${counts[c].B}/C${counts[c].C}`).join(' '));
    const rankById = new Map(rows.map((r) => [r.t.id, rankOf(r.hits, total, RULE)]));
    const qByRank = { A: 0, B: 0, C: 0 };
    quizThemeOut.forEach(([, t]) => { qByRank[rankById.get(t)] += 1; });
    info.push(`4択の数(ランク別): A ${qByRank.A}・B ${qByRank.B}・C ${qByRank.C}(計 ${quizThemeOut.length})`);
    const zero = rows.filter((r) => !r.hits);
    info.push(`出ていないテーマ: ${zero.length ? zero.map((r) => `${r.t.id} ${r.t.name}`).join('、') : 'なし'}`);
    const noQuiz = themes.filter((t) => !quizThemeOut.some(([, th]) => th === t.id));
    info.push(`4択が1問もないテーマ: ${noQuiz.length ? noQuiz.map((t) => `${t.id} ${t.name}`).join('、') : 'なし'}`);
  } else E('exams.json に本試験がありません');

  return { text: errors.length ? null : build(), errors, warns, info, rows, exams, rule: RULE, total, repo };
}

// ---- コマンドとして使うとき
function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const WRITE = args.includes('--write');
  const STATS = args.includes('--stats');
  const r = generate({ repo: opt('--repo') || undefined, appeared: args.includes('--appeared') });
  if (STATS && r.total) {
    const fmt = (x) => `${x.t.id} ${x.t.name}: ${x.hits}/${r.total}回・主に${x.questions}問・最後 ${x.last || '-'}`;
    const hist = {};
    r.rows.forEach((x) => { hist[x.hits] = (hist[x.hits] || 0) + 1; });
    console.log('回数の分布(回数: テーマ数):', Object.keys(hist).sort((a, b) => b - a).map((k) => `${k}:${hist[k]}`).join(' '));
    CATS.forEach((c) => {
      const h = {};
      r.rows.filter((x) => x.t.cat === c).forEach((x) => { h[x.hits] = (h[x.hits] || 0) + 1; });
      console.log(`  ${c}:`, Object.keys(h).sort((a, b) => b - a).map((k) => `${k}:${h[k]}`).join(' '));
    });
    const cands = [[0.75, 0.4], [0.75, 1 / 3], [0.75, 0.5], [2 / 3, 1 / 3], [0.8, 0.4], [0.9, 0.5], [11 / 12, 0.5]];
    cands.forEach(([a, b]) => {
      const c = { A: 0, B: 0, C: 0 };
      const byCat = {};
      r.rows.forEach((x) => { const k = rankOf(x.hits, r.total, { A: a, B: b }); c[k] += 1; byCat[x.t.cat] = byCat[x.t.cat] || { A: 0, B: 0, C: 0 }; byCat[x.t.cat][k] += 1; });
      console.log(`A≥${a.toFixed(3)} B≥${b.toFixed(3)}: A ${c.A}・B ${c.B}・C ${c.C} | ` + CATS.map((k) => `${k} ${byCat[k].A}/${byCat[k].B}/${byCat[k].C}`).join(' '));
    });
    console.log('\n回数の多い順:');
    r.rows.slice().sort((a, b) => b.hits - a.hits || b.questions - a.questions).forEach((x) => console.log('  ' + fmt(x) + (x.secondaryOnly.length ? `(うち主でない回 ${x.secondaryOnly.length})` : '')));
  }
  console.log('');
  r.info.forEach((m) => console.log(m));
  r.warns.forEach((m) => console.log(`WARN  ${m}`));
  r.errors.forEach((m) => console.log(`ERROR ${m}`));
  if (r.errors.length) { console.log(`エラー ${r.errors.length}件のため作れません`); process.exit(1); }
  const file = path.join(r.repo, 'webapp', 'data', 'frequency.js');
  if (WRITE) {
    fs.writeFileSync(file, r.text);
    console.log(`書きました: ${file}(${fs.statSync(file).size} バイト)`);
    return;
  }
  // Windows の git(autocrlf)で改行が CRLF になっていても同じとみなす
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (cur === r.text) console.log(`確かめるだけ: 作った内容は今の ${path.relative(r.repo, file)} と同じです(${Buffer.byteLength(r.text)} バイト)`);
  else {
    console.log(`確かめるだけ: 作った内容が今の ${path.relative(r.repo, file)} と違います。書くときは --write を付けて実行してください`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { generate, rankOf, lit };
