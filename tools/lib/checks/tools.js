// 数字まとめ(APP_DATA.numbers)・比較表(APP_DATA.compareTables)・条文穴埋め(APP_DATA.joubun)のデータの確認(v14。tools/check.js の 9. から呼ばれる)
//   module.exports = function (ctx, info) → { errors: [文字列], warnings: [文字列] }
//   形の確認はいつも行う。条文の照合(つなげた文 = e-Gov の本文)は、リポジトリに置いた e-Gov の消費税法の JSON
//   (tools/fixtures/law/shohiho.json。出典と時点は同じフォルダの README.txt)で行う。CI(tools/check.js)でも照合し、違えばエラー。
//   JSON の場所: 環境変数 SHOHIHO_JSON(別の時点の JSON で試すとき)、なければ LAW_JSON。条文穴埋めの項目があるのに JSON が
//   見つからないときもエラー(照合しないまま公開しない)。info.lawJson に null を渡したときだけ照合を省く(単体テストの形の確認用)
//   JSON の形: { asOf, articles: { '30': { paragraphs: { '1': { sentence, items: { '8': 文 }, subitems: { '1': { 'イ': 文 } } } } } } }
//   条文の項目の ref: { art: '30', para: '1', item?: '8', sub?: 'イ' }。ref がなければ article('第30条第1項' など)から読む
'use strict';
const fs = require('fs');
const path = require('path');

const CATS = ['gyoho', 'kenri', 'horei', 'zei', 'menjo'];
const CMP_CATS = CATS.concat(['shohiho']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CELL_MAX = 28;
// リポジトリに置いた e-Gov の消費税法(2026-10-01 時点。tools/fixtures/law/README.txt)
const LAW_JSON = path.join(__dirname, '..', '..', 'fixtures', 'law', 'shohiho.json');

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const len = (s) => Array.from(String(s)).length;

// 参照の表(ctx の AppIndex があれば使う。なければ APP_DATA から作る)
function lookups(ctx) {
  const D = ctx.APP_DATA || {};
  const AI = ctx.AppIndex || {};
  const has = (dict, list) => {
    if (dict) return (id) => Object.prototype.hasOwnProperty.call(dict, id);
    const s = new Set((Array.isArray(list) ? list : []).map((x) => x && x.id));
    return (id) => s.has(id);
  };
  return {
    source: has(AI.sourcesById, D.sources),
    term: has(AI.termsById, [].concat(D.terms || [], D.basics || [])),
    topic: has(AI.topicsById, D.topics),
  };
}

function checkRefs(where, it, L, errors, opts) {
  opts = opts || {};
  if (!Array.isArray(it.sources) || !it.sources.length) {
    if (opts.needSources !== false) errors.push(`${where}: sources(出典)がありません`);
  } else {
    it.sources.forEach((s) => { if (!L.source(s)) errors.push(`${where}: 存在しない出典 ${s}`); });
  }
  if (it.basicIds != null && !Array.isArray(it.basicIds)) errors.push(`${where}: basicIds が配列ではありません`);
  (Array.isArray(it.basicIds) ? it.basicIds : []).forEach((b) => { if (!L.term(b)) errors.push(`${where}: 存在しない基礎知識・用語 ${b}`); });
  if (it.topicId != null && !L.topic(it.topicId)) errors.push(`${where}: 存在しないトピック ${it.topicId}`);
}

function checkReviewBy(where, it, today, warnings, errors) {
  if (it.reviewBy == null) return;
  if (typeof it.reviewBy !== 'string' || !DATE_RE.test(it.reviewBy)) errors.push(`${where}: reviewBy は YYYY-MM-DD で書きます(${it.reviewBy})`);
  else if (today && it.reviewBy <= today) warnings.push(`${where}: 見直す日(reviewBy ${it.reviewBy})を過ぎています`);
}

// 誤りの選択肢: ちょうど3つ・空でない・正解と違う・互いに違う
function checkAlts(where, a, alts, errors) {
  if (!Array.isArray(alts) || alts.length !== 3) { errors.push(`${where}: alts(誤りの選択肢)はちょうど3つです(${Array.isArray(alts) ? alts.length : typeof alts})`); return; }
  const t = alts.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (t.some((x) => !x)) errors.push(`${where}: alts に空の選択肢があります`);
  if (t.includes(String(a).trim())) errors.push(`${where}: alts に正解(${a})と同じものがあります`);
  if (new Set(t).size !== t.length) errors.push(`${where}: alts に同じ選択肢が2回あります`);
}

function validateNumbers(list, L, out, today) {
  const { errors, warnings } = out;
  if (list == null) return;
  if (!Array.isArray(list)) { errors.push('APP_DATA.numbers が配列ではありません'); return; }
  const ids = new Set();
  list.forEach((it, i) => {
    const where = `numbers[${i}]${it && it.id ? ` ${it.id}` : ''}`;
    if (!isObj(it)) { errors.push(`${where}: 項目がオブジェクトではありません`); return; }
    if (!isStr(it.id)) errors.push(`${where}: id がありません`);
    else if (ids.has(it.id)) errors.push(`${where}: id が重複しています`);
    else ids.add(it.id);
    if (!CATS.includes(it.cat)) errors.push(`${where}: cat は ${CATS.join('|')} のどれか(${it.cat})`);
    if (!isStr(it.group)) errors.push(`${where}: group(まとまりの名前)がありません`);
    if (typeof it.q !== 'string') errors.push(`${where}: q(文)がありません`);
    else {
      const n = it.q.split('{}').length - 1;
      if (n !== 1) errors.push(`${where}: q には空欄 {} をちょうど1つ入れます(${n}個)`);
      if (/[{}]/.test(it.q.replace('{}', ''))) errors.push(`${where}: q に {} 以外の波かっこがあります`);
    }
    if (!isStr(it.a)) errors.push(`${where}: a(正解)がありません`);
    else checkAlts(where, it.a, it.alts, errors);
    if (!isStr(it.note)) errors.push(`${where}: note(根拠の一文)がありません`);
    if (!isStr(it.lawRef)) warnings.push(`${where}: lawRef(根拠の条文)がありません`);
    checkRefs(where, it, L, errors);
    checkReviewBy(where, it, today, warnings, errors);
  });
}

function validateCompare(list, L, out, today) {
  const { errors, warnings } = out;
  if (list == null) return;
  if (!Array.isArray(list)) { errors.push('APP_DATA.compareTables が配列ではありません'); return; }
  const ids = new Set();
  list.forEach((t, i) => {
    const where = `compareTables[${i}]${t && t.id ? ` ${t.id}` : ''}`;
    if (!isObj(t)) { errors.push(`${where}: 表がオブジェクトではありません`); return; }
    if (!isStr(t.id)) errors.push(`${where}: id がありません`);
    else if (ids.has(t.id)) errors.push(`${where}: id が重複しています`);
    else ids.add(t.id);
    if (!isStr(t.title)) errors.push(`${where}: title がありません`);
    if (!CMP_CATS.includes(t.cat)) errors.push(`${where}: cat は ${CMP_CATS.join('|')} のどれか(${t.cat})`);
    if (!isStr(t.topicId)) errors.push(`${where}: topicId がありません`);
    if (!isStr(t.intro)) warnings.push(`${where}: intro(1〜2文の説明)がありません`);
    if (!Array.isArray(t.cols) || t.cols.length < 1 || t.cols.some((c) => !isStr(c))) { errors.push(`${where}: cols(列の名前)は空でない文字列の配列です`); return; }
    if (t.cols.length < 2 || t.cols.length > 5) warnings.push(`${where}: 列は2〜5個が目安です(${t.cols.length}個)`);
    if (new Set(t.cols).size !== t.cols.length) errors.push(`${where}: 同じ名前の列があります`);
    if (!Array.isArray(t.rows) || !t.rows.length) { errors.push(`${where}: rows(行)がありません`); return; }
    if (t.rows.length < 2 || t.rows.length > 6) warnings.push(`${where}: 行は2〜6個が目安です(${t.rows.length}個)`);
    const labels = new Set();
    let shapeOk = true;
    t.rows.forEach((r, ri) => {
      const rw = `${where} 行${ri}`;
      if (!isObj(r) || !isStr(r.label)) { errors.push(`${rw}: label(行の見出し)がありません`); shapeOk = false; return; }
      if (labels.has(r.label)) errors.push(`${rw}: 同じ見出しの行があります(${r.label})`);
      labels.add(r.label);
      if (!Array.isArray(r.cells) || r.cells.length !== t.cols.length) { errors.push(`${rw}: cells の数(${Array.isArray(r.cells) ? r.cells.length : '-'})が列の数(${t.cols.length})と違います`); shapeOk = false; return; }
      r.cells.forEach((c, ci) => {
        if (!isStr(c)) errors.push(`${rw} 列${ci}: マスが空です(該当しないときは「—」などを書きます)`);
        else if (len(c) > CELL_MAX) warnings.push(`${rw} 列${ci}: マスの文字が${CELL_MAX}字を超えています(${len(c)}字)`);
      });
    });
    if (!Array.isArray(t.keys) || !t.keys.length) errors.push(`${where}: keys(穴埋めで隠すマス)がありません`);
    else if (shapeOk) {
      const seen = new Set();
      t.keys.forEach((k, ki) => {
        const kw = `${where} keys[${ki}]`;
        if (!Array.isArray(k) || k.length !== 2 || !Number.isInteger(k[0]) || !Number.isInteger(k[1])) { errors.push(`${kw}: [行, 列] の整数2つで書きます`); return; }
        const [r, c] = k;
        if (r < 0 || r >= t.rows.length || c < 0 || c >= t.cols.length) { errors.push(`${kw}: [${r}, ${c}] は表の外です`); return; }
        const id = `${r},${c}`;
        if (seen.has(id)) errors.push(`${kw}: [${r}, ${c}] が重複しています`);
        seen.add(id);
        const v = String(t.rows[r].cells[c]).trim();
        const same = t.rows.map((row, i) => (i !== r && String(row.cells[c]).trim() === v ? i : -1)).filter((i) => i >= 0);
        if (same.length) errors.push(`${kw}: 隠すマス「${v}」と同じ値が同じ列の行${same.join('・')}にあります(穴埋めで区別できません)`);
      });
    }
    if (t.notes != null && (!Array.isArray(t.notes) || t.notes.some((n) => typeof n !== 'string'))) errors.push(`${where}: notes は文字列の配列です`);
    if (!isStr(t.lawRef)) warnings.push(`${where}: lawRef(根拠の条文)がありません`);
    checkRefs(where, t, L, errors);
    checkReviewBy(where, t, today, warnings, errors);
  });
}

// parts をつなげた文(空欄は正解、括弧書きはその文)
function reconstruct(it) {
  return (Array.isArray(it.parts) ? it.parts : []).map((p) => {
    if (typeof p === 'string') return p;
    if (isObj(p) && Number.isInteger(p.b)) return it.blanks && it.blanks[p.b] ? String(it.blanks[p.b].a) : '';
    if (isObj(p) && typeof p.omit === 'string') return p.omit;
    return '';
  }).join('');
}

// '第30条第1項'・'第57条の4第1項第2号'・'第2条第1項第8号の2' → { art: '57_4', para: '1', item: '2' }
function refFromArticle(a) {
  const m = /^第(\d+)条(?:の(\d+))?(?:第(\d+)項)?(?:第(\d+)号(?:の(\d+))?)?/.exec(String(a || ''));
  if (!m) return null;
  const ref = { art: m[2] ? `${m[1]}_${m[2]}` : m[1], para: m[3] || '1' };
  if (m[4]) ref.item = m[5] ? `${m[4]}_${m[5]}` : m[4];
  return ref;
}

// e-Gov の JSON の、ref の所の本文(なければ null と理由)
function lawText(json, ref) {
  const art = json && json.articles && json.articles[String(ref.art)];
  if (!art) return { text: null, why: `第${ref.art}条が JSON にありません` };
  const para = art.paragraphs && art.paragraphs[String(ref.para || '1')];
  if (!para) return { text: null, why: `第${ref.art}条第${ref.para}項が JSON にありません` };
  if (ref.item == null) return { text: para.sentence, why: null };
  if (ref.sub != null) {
    const s = para.subitems && para.subitems[String(ref.item)] && para.subitems[String(ref.item)][String(ref.sub)];
    return s == null ? { text: null, why: `第${ref.art}条第${ref.para}項第${ref.item}号${ref.sub}が JSON にありません` } : { text: s, why: null };
  }
  const t = para.items && para.items[String(ref.item)];
  return t == null ? { text: null, why: `第${ref.art}条第${ref.para}項第${ref.item}号が JSON にありません` } : { text: t, why: null };
}

// 最初に違う所の前後(短く)
function diffAt(a, b) {
  const A = Array.from(a);
  const Bc = Array.from(b);
  let i = 0;
  while (i < A.length && i < Bc.length && A[i] === Bc[i]) i++;
  const cut = (arr) => arr.slice(Math.max(0, i - 8), i + 12).join('');
  return `${i + 1}字目から違います。データ「…${cut(A)}…」/ e-Gov「…${cut(Bc)}…」(長さ ${A.length} / ${Bc.length})`;
}

function findLawJson() {
  const env = process.env.SHOHIHO_JSON;
  if (env) return fs.existsSync(env) ? env : null;
  return fs.existsSync(LAW_JSON) ? LAW_JSON : null;
}

function validateJoubun(data, L, out, opts) {
  const { errors, warnings } = out;
  if (data == null) return;
  if (!isObj(data)) { errors.push('APP_DATA.joubun がオブジェクトではありません'); return; }
  const law = data.law;
  if (!isObj(law) || !isStr(law.name)) errors.push('joubun.law.name(法令の名前)がありません');
  else {
    if (!isStr(law.url) || !/^https:\/\/laws\.e-gov\.go\.jp\//.test(law.url)) errors.push(`joubun.law.url は e-Gov 法令検索の URL にします(${law.url})`);
    if (!isStr(law.asOf) || !DATE_RE.test(law.asOf)) errors.push(`joubun.law.asOf は YYYY-MM-DD で書きます(${law.asOf})`);
    if (!isStr(law.num)) warnings.push('joubun.law.num(法令番号)がありません');
  }
  const items = data.items;
  if (!Array.isArray(items)) { errors.push('joubun.items が配列ではありません'); return; }
  let json = null;
  if (opts.lawJson) {
    try { json = JSON.parse(fs.readFileSync(opts.lawJson, 'utf8')); } catch (e) { errors.push(`e-Gov の JSON を読めません(${opts.lawJson}): ${e.message}`); }
    if (json && isObj(law) && json.asOf && law.asOf && json.asOf !== law.asOf) warnings.push(`joubun.law.asOf(${law.asOf})と e-Gov の JSON の時点(${json.asOf})が違います`);
  }
  out.joubunChecked = 0;
  const ids = new Set();
  items.forEach((it, i) => {
    const where = `joubun.items[${i}]${it && it.id ? ` ${it.id}` : ''}`;
    if (!isObj(it)) { errors.push(`${where}: 項目がオブジェクトではありません`); return; }
    if (!isStr(it.id)) errors.push(`${where}: id がありません`);
    else if (ids.has(it.id)) errors.push(`${where}: id が重複しています`);
    else ids.add(it.id);
    if (!isStr(it.article)) errors.push(`${where}: article(第30条第1項 など)がありません`);
    if (!isStr(it.title)) errors.push(`${where}: title(見出し)がありません`);
    if (!isStr(it.group)) errors.push(`${where}: group(まとまり)がありません`);
    if (!isStr(it.topicId)) errors.push(`${where}: topicId がありません`);
    checkRefs(where, it, L, errors, { needSources: false });
    (Array.isArray(it.sources) ? it.sources : []).forEach((s) => { if (!L.source(s)) errors.push(`${where}: 存在しない出典 ${s}`); });
    if (it.note != null && typeof it.note !== 'string') errors.push(`${where}: note は文字列です`);
    if (it.caption != null && !isStr(it.caption)) errors.push(`${where}: caption(条の見出し)は文字列です`);
    checkReviewBy(where, it, opts.today, warnings, errors);
    // 空欄: parts の { b: n } と blanks の番号がそろっている(どの空欄もちょうど1回使う)
    if (!Array.isArray(it.parts) || !it.parts.length) { errors.push(`${where}: parts がありません`); return; }
    if (!Array.isArray(it.blanks)) { errors.push(`${where}: blanks がありません`); return; }
    const used = [];
    let partsOk = true;
    it.parts.forEach((p, pi) => {
      if (typeof p === 'string') { if (!p.length) warnings.push(`${where} parts[${pi}]: 空の文字列`); return; }
      if (isObj(p) && Number.isInteger(p.b) && Object.keys(p).length === 1) {
        if (p.b < 0 || p.b >= it.blanks.length) { errors.push(`${where} parts[${pi}]: 空欄 ${p.b} が blanks(${it.blanks.length}個)の外です`); partsOk = false; }
        used.push(p.b);
        return;
      }
      if (isObj(p) && typeof p.omit === 'string' && Object.keys(p).length === 1) { if (!p.omit) errors.push(`${where} parts[${pi}]: omit が空です`); return; }
      errors.push(`${where} parts[${pi}]: 文字列・{ b: 番号 }・{ omit: 文 } のどれでもありません`);
      partsOk = false;
    });
    const dup = used.filter((n, k) => used.indexOf(n) !== k);
    if (dup.length) errors.push(`${where}: 空欄 ${[...new Set(dup)].join('・')} が2回以上あります`);
    it.blanks.forEach((b, bi) => {
      if (!used.includes(bi)) errors.push(`${where}: blanks[${bi}] が parts で使われていません`);
      if (!isObj(b) || !isStr(b.a)) { errors.push(`${where} blanks[${bi}]: a(正解)がありません`); return; }
      checkAlts(`${where} blanks[${bi}]`, b.a, b.alts, errors);
    });
    if (it.blanks.length && used.length && used.some((n, k) => k > 0 && n < used[k - 1])) warnings.push(`${where}: 空欄の番号が文の順になっていません(${used.join(',')})`);
    if (!it.blanks.length) warnings.push(`${where}: 空欄がありません`);
    // ref
    let ref = null;
    if (it.ref != null) {
      if (!isObj(it.ref) || !isStr(String(it.ref.art || '')) || it.ref.art == null) errors.push(`${where}: ref は { art, para, item? } の形です`);
      else {
        ref = { art: String(it.ref.art), para: String(it.ref.para == null ? '1' : it.ref.para) };
        if (it.ref.item != null) ref.item = String(it.ref.item);
        if (it.ref.sub != null) ref.sub = String(it.ref.sub);
        const fromArt = refFromArticle(it.article);
        if (fromArt && (fromArt.art !== ref.art || fromArt.para !== ref.para || (fromArt.item || null) !== (ref.item || null))) {
          warnings.push(`${where}: article(${it.article})と ref(${JSON.stringify(it.ref)})が合っていません`);
        }
      }
    } else ref = refFromArticle(it.article);
    // 条文の照合(JSON があるときだけ)
    if (json && partsOk) {
      if (!ref) { errors.push(`${where}: ref がなく、article(${it.article})からも条文の場所が分かりません`); return; }
      const got = lawText(json, ref);
      if (got.text == null) { errors.push(`${where}: ${got.why}`); return; }
      const mine = reconstruct(it);
      if (mine !== got.text) errors.push(`${where}: つなげた文が e-Gov の本文と違います。${diffAt(mine, got.text)}`);
      else out.joubunChecked += 1;
      it.parts.forEach((p, pi) => {
        if (isObj(p) && typeof p.omit === 'string' && !got.text.includes(p.omit)) errors.push(`${where} parts[${pi}]: omit の文が e-Gov の本文にありません`);
      });
      // 条の見出し(画面の見出しに出す)は e-Gov の見出しそのまま(（）・「なつた」なども)
      const art = json.articles && json.articles[String(ref.art)];
      if (isStr(it.caption) && art && typeof art.caption === 'string' && it.caption !== art.caption) errors.push(`${where}: caption「${it.caption}」が e-Gov の見出し「${art.caption}」と違います`);
    }
  });
}

function run(ctx, info) {
  const out = { errors: [], warnings: [] };
  const D = (ctx && ctx.APP_DATA) || {};
  const L = lookups(ctx || {});
  let today = null;
  try { today = ctx && ctx.DateUtil ? ctx.DateUtil.today() : null; } catch (e) { today = null; }
  validateNumbers(D.numbers, L, out, today);
  validateCompare(D.compareTables, L, out, today);
  const skip = !!info && Object.prototype.hasOwnProperty.call(info, 'lawJson') && info.lawJson == null;
  const lawJson = info && info.lawJson ? info.lawJson : skip ? null : findLawJson();
  validateJoubun(D.joubun, L, out, { lawJson, today });
  // 照合を省くと決めていないのに JSON がない(消した・SHOHIHO_JSON の場所にない)ときは、照合しないまま公開しない
  const items = isObj(D.joubun) && Array.isArray(D.joubun.items) ? D.joubun.items.length : 0;
  if (!lawJson && !skip && items) {
    out.errors.push(`条文穴埋めの ${items}項目を照合する e-Gov の JSON がありません(${process.env.SHOHIHO_JSON ? `SHOHIHO_JSON=${process.env.SHOHIHO_JSON}` : path.relative(process.cwd(), LAW_JSON)})。tools/fixtures/law/README.txt を見てください`);
  }
  // tools/check.js から呼ばれたときは、条文を照合したかを1行で知らせる
  if (info && info.webapp && !info.quiet) {
    console.log(lawJson ? `tools.js: 条文穴埋めの ${out.joubunChecked || 0}項目を e-Gov の本文と照合しました(${path.basename(lawJson)})` : 'tools.js: e-Gov の JSON がないため、条文の照合はできませんでした');
  }
  return { errors: out.errors, warnings: out.warnings, joubunChecked: out.joubunChecked || 0, lawJson: lawJson || null };
}

module.exports = run;
module.exports.reconstruct = reconstruct;
module.exports.refFromArticle = refFromArticle;
module.exports.lawText = lawText;
module.exports.findLawJson = findLawJson;
module.exports.LAW_JSON = LAW_JSON;
