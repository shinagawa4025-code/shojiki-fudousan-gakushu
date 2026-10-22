// 出題頻度ランク(v14): data/frequency.js(APP_DATA.frequency)を引く道具・ランクの札・テーマ(論点)ごとの成績(詳細の束)
// APP_DATA.frequency は公開版では詳細の束で届く(本体では null)。届く前・データがないときは空の結果を返す(札も出さない)。
// 件数・テーマの数はデータから数える(ここに決め打ちしない)。テーマのない問題・基礎知識(宅建士試験の範囲外など)には札を付けない
// API:
//   ready()                    データがあるか / info() { asOf, exams, method, rankRule, total, first, last }(なければ null)
//   themes() / theme(id)        テーマの一覧(データの順のコピー)/ 1つのテーマ(なければ null)
//   themeOfQuiz(id) / rankOfQuiz(id)    4択問題(○×の文の id 'quiz-…#2' でもよい)のテーマ / ランク('A'|'B'|'C'。なければ null)
//   themeOfBasic(id) / rankOfBasic(id)  基礎知識のテーマ / ランク
//   themesBySection(topicId, section)   トピックの小見出しのテーマ(section を省くとトピックのすべて)
//   sectionBest(topicId, section, basicIds)  小見出しの中でいちばん高いランクのテーマ(小見出しの名前か、基礎知識が重なるテーマから)
//   chipHtml(rank, { hits, total })     ランクの札「頻出A」(読み上げは「出題頻度A(令和7年度までの12回中11回)」)/ chipFor(theme) 回数つきの札
//   mastery(themeId) / masteryAll()     テーマの成績 { answered, correct, rate, mc: { answered, correct }, ox: { answered, correct } }
//                              (4択は quizHistory の最後の結果、○×は oxStats の文ごとの最後の結果。1問・1文を1と数える)
//   quizIdsOf(themeId) / statementCountOf(themeId)  テーマの4択問題(今ある問題だけ・データの順)/ ○×で出せる文の数
//   matchLevel(quizId, level)  出題頻度の絞り込み(LEVELS: 'all' | 'A' | 'AB')に合うか
//   weakThemes(opts) / freshThemes(opts)  頻出Aで正解率の低いテーマ / まだあまり解いていないよく出るテーマ
//   forTakken()                学ぶ目的・目標が宅建士試験か(絞り込みを出すかどうか。未設定も含む)
//   menuPick(kind, opts)       今日のメニュー(js/recommend.js)から: 'basic' → 次に読む基礎知識 { topicId, basicId, theme } /
//                              'ox' → 頻出Aの○× { nav, name, theme }(どちらも、なければ null)。
//                              opts: { cat(伸ばしたい分野), topics(読む順のトピック。'basic' で使う), min・count('ox' の文の数・問題数) }
window.Freq = (function () {
  const RANKS = [`A`, `B`, `C`];
  // 分野(#freq のタブの順・短い名前)。cat は data/exams.js の宅建士の分野の id
  const CATS = [
    { id: `gyoho`, name: `業法`, full: `宅建業法` },
    { id: `kenri`, name: `権利`, full: `権利関係` },
    { id: `horei`, name: `法令`, full: `法令上の制限` },
    { id: `zei`, name: `税・価格`, full: `税・価格評定` },
    { id: `menjo`, name: `免除`, full: `5問免除科目` },
  ];
  // 出題頻度の絞り込み(4択・○×の条件)。値はランクの並び
  const LEVELS = [`all`, `A`, `AB`];
  const LEVEL_RANKS = { A: [`A`], AB: [`A`, `B`] };
  const LEVEL_LABELS = { all: `すべて`, A: `Aだけ`, AB: `AとB` };
  const MIN_ANSWERED = 3; // 「伸ばしたい論点」に出す、解いた数の下限(4択1問・○×1文をそれぞれ1と数える)
  const GOOD_RATE = 0.8; // これ以上の正解率は「できている」(今日のメニューで後回しにする)
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const plain = (v) => !!v && typeof v === `object` && !Array.isArray(v);

  let cache = null;

  function data() {
    const f = window.APP_DATA && window.APP_DATA.frequency;
    return plain(f) && Array.isArray(f.themes) ? f : null;
  }

  // 引くための索引(データのオブジェクトが同じあいだは作り直さない)
  function index() {
    const f = data();
    if (!f) return null;
    if (cache && cache.f === f && cache.n === f.themes.length) return cache;
    const byId = Object.create(null);
    const byBasic = Object.create(null);
    const list = [];
    f.themes.forEach((t) => {
      if (!plain(t) || typeof t.id !== `string` || byId[t.id]) return;
      byId[t.id] = t;
      list.push(t);
      (Array.isArray(t.basicIds) ? t.basicIds : []).forEach((b) => { if (typeof b === `string` && !byBasic[b]) byBasic[b] = t; });
    });
    const qt = plain(f.quizTheme) ? f.quizTheme : {};
    const quizzes = Object.create(null);
    const quizOf = Object.create(null);
    ((window.APP_DATA && Array.isArray(window.APP_DATA.quiz)) ? window.APP_DATA.quiz : []).forEach((q) => {
      if (!q || typeof q.id !== `string` || !hasOwn(qt, q.id)) return;
      const t = byId[qt[q.id]];
      if (!t) return;
      quizOf[q.id] = t;
      (quizzes[t.id] = quizzes[t.id] || []).push(q.id);
    });
    const exams = Array.isArray(f.exams) ? f.exams.filter(plain) : [];
    cache = { f, n: f.themes.length, byId, byBasic, list, quizzes, quizOf, exams, stmts: null };
    return cache;
  }

  function ready() {
    const ix = index();
    return !!(ix && ix.list.length);
  }

  // 集計の説明(#freq の見出し)。exams は新しい順なので、first が最も古い回・last が最も新しい回
  function info() {
    const ix = index();
    if (!ix) return null;
    const rule = plain(ix.f.rankRule) ? ix.f.rankRule : {};
    return {
      asOf: typeof ix.f.asOf === `string` ? ix.f.asOf : ``,
      method: typeof ix.f.method === `string` ? ix.f.method : ``,
      rankRule: { A: Number(rule.A) || 0, B: Number(rule.B) || 0 },
      exams: ix.exams.slice(),
      total: ix.exams.length,
      last: ix.exams[0] || null,
      first: ix.exams[ix.exams.length - 1] || null,
    };
  }

  function total() {
    const ix = index();
    return ix ? ix.exams.length : 0;
  }

  // ランクの境目を回数にしたもの(「12回中9回以上」)。割合が決まっていなければ null
  function minHits(rank) {
    const i = info();
    if (!i || !i.total) return null;
    const r = i.rankRule[rank];
    return r > 0 ? Math.ceil(r * i.total - 1e-9) : null;
  }

  function examLabel(id) {
    const ix = index();
    const e = ix && typeof id === `string` ? ix.exams.find((x) => x.id === id) : null;
    return e ? String(e.label || e.id) : ``;
  }

  function themes() {
    const ix = index();
    return ix ? ix.list.slice() : [];
  }

  function theme(id) {
    const ix = index();
    return ix && typeof id === `string` && ix.byId[id] ? ix.byId[id] : null;
  }

  // 4択問題のテーマ(○×の文の id は # の前が元の4択)
  function themeOfQuiz(id) {
    const ix = index();
    if (!ix || typeof id === `undefined` || id === null) return null;
    const qid = String(id).split(`#`)[0];
    return ix.quizOf[qid] || null;
  }

  function rankOfQuiz(id) {
    const t = themeOfQuiz(id);
    return t ? t.rank : null;
  }

  function themeOfBasic(id) {
    const ix = index();
    return ix && typeof id === `string` && ix.byBasic[id] ? ix.byBasic[id] : null;
  }

  function rankOfBasic(id) {
    const t = themeOfBasic(id);
    return t ? t.rank : null;
  }

  function themesBySection(topicId, section) {
    return themes().filter((t) => t.topicId === topicId && (section == null || t.section === section));
  }

  const rankNo = (r) => (RANKS.includes(r) ? RANKS.indexOf(r) : RANKS.length);
  // 並び: ランクの高い順 → 出た回数の多い順 → 主な論点の問題数の多い順 → データの順
  function byRank(a, b) {
    return (rankNo(a.rank) - rankNo(b.rank)) || ((Number(b.hits) || 0) - (Number(a.hits) || 0)) || ((Number(b.questions) || 0) - (Number(a.questions) || 0));
  }

  // 小見出しの中でいちばん高いランクのテーマ(小見出しの名前が同じテーマと、小見出しの基礎知識を含むテーマから)
  function sectionBest(topicId, section, basicIds) {
    const ix = index();
    if (!ix) return null;
    const set = new Set();
    ix.list.forEach((t) => { if (t.topicId === topicId && t.section === section) set.add(t); });
    (Array.isArray(basicIds) ? basicIds : []).forEach((b) => { if (ix.byBasic[b]) set.add(ix.byBasic[b]); });
    const list = Array.from(set).filter((t) => RANKS.includes(t.rank)).sort(byRank);
    return list[0] || null;
  }

  // ランクの札。見た目は「頻出A」「頻出B」(C は出ることが少ない論点なので「頻度C」)、読み上げは「出題頻度A(令和7年度までの12回中11回)」
  // (回数が分かるときだけ回数も)
  // opts: { hits, total, cls(足すクラス), prefix(読み上げの前置き。例「この中で最も高いランクは」)}
  function chipHtml(rank, opts) {
    if (!RANKS.includes(rank)) return ``;
    const o = opts || {};
    const tot = Number(o.total);
    const hits = Number(o.hits);
    // 数えた回のうち最も新しい回の名前(令和8年度の試験はまだ数えていないので「直近」とは言わない)
    const i = tot > 0 && Number.isFinite(hits) ? info() : null;
    const upto = i && i.last && i.last.label ? `${i.last.label}までの` : ``;
    const label = `出題頻度${rank}${tot > 0 && Number.isFinite(hits) ? `(${upto}${tot}回中${hits}回)` : ``}`;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<span class="freq-chip is-${rank.toLowerCase()}${o.cls ? ` ${esc(o.cls)}` : ``}" data-rank="${rank}" title="${label}"><span aria-hidden="true">${rank === `C` ? `頻度` : `頻出`}${rank}</span><span class="sr-only">${o.prefix ? esc(o.prefix) : ``}${label}</span></span>`;
  }

  function chipFor(t, opts) {
    if (!t) return ``;
    return chipHtml(t.rank, Object.assign({ hits: t.hits, total: total() }, opts || {}));
  }

  // テーマの4択問題(今ある問題だけ)
  function quizIdsOf(themeId) {
    const ix = index();
    return ix && ix.quizzes[themeId] ? ix.quizzes[themeId].slice() : [];
  }

  // ○×で出せる文(QuizEngine.allStatements)のテーマごとの数と、文の id の集まり
  function statementInfo() {
    const ix = index();
    if (!ix) return null;
    const QE = window.QuizEngine;
    const all = QE && typeof QE.allStatements === `function` ? QE.allStatements() : null;
    if (!Array.isArray(all)) return null;
    if (ix.stmts && ix.stmts.n === all.length && ix.stmts.first === all[0]) return ix.stmts;
    const count = Object.create(null);
    const ids = new Set();
    all.forEach((s) => {
      if (!s || typeof s.id !== `string`) return;
      ids.add(s.id);
      const t = ix.quizOf[s.quizId];
      if (t) count[t.id] = (count[t.id] || 0) + 1;
    });
    ix.stmts = { n: all.length, first: all[0], count, ids };
    return ix.stmts;
  }

  function statementCountOf(themeId) {
    const si = statementInfo();
    return si && si.count[themeId] ? si.count[themeId] : 0;
  }

  function matchLevel(quizId, level) {
    const ranks = LEVEL_RANKS[level];
    if (!ranks) return true;
    return ranks.includes(rankOfQuiz(quizId));
  }

  // ---- 成績 ----
  const cnt = (v) => (typeof v === `number` && Number.isFinite(v) && v > 0 ? v : 0);
  const blank = () => ({ answered: 0, correct: 0, rate: 0, mc: { answered: 0, correct: 0 }, ox: { answered: 0, correct: 0 } });

  function masteryAll() {
    const ix = index();
    const out = Object.create(null);
    if (!ix) return out;
    ix.list.forEach((t) => { out[t.id] = blank(); });
    const read = (k) => {
      try { const v = Storage.get(k, {}); return plain(v) ? v : {}; } catch (e) { return {}; }
    };
    const hist = read(`quizHistory`);
    Object.keys(ix.quizzes).forEach((tid) => {
      const m = out[tid];
      ix.quizzes[tid].forEach((qid) => {
        const v = hasOwn(hist, qid) ? hist[qid] : null;
        if (v !== `ok` && v !== `ng`) return;
        m.mc.answered += 1;
        if (v === `ok`) m.mc.correct += 1;
      });
    });
    // ○×は、いま出せる文の記録だけ(○×の画面・弱点分析と同じ。回数が数値のものだけ)
    const ox = read(`oxStats`);
    const si = statementInfo();
    Object.keys(ox).forEach((sid) => {
      const v = ox[sid];
      if (!plain(v)) return;
      const c = cnt(v.c);
      const w = cnt(v.w);
      if (!(c + w) || (si && !si.ids.has(sid))) return;
      const t = ix.quizOf[sid.split(`#`)[0]];
      if (!t) return;
      const m = out[t.id];
      m.ox.answered += 1;
      if (typeof v.lastOk === `boolean` ? v.lastOk : w === 0) m.ox.correct += 1;
    });
    Object.keys(out).forEach((id) => {
      const m = out[id];
      m.answered = m.mc.answered + m.ox.answered;
      m.correct = m.mc.correct + m.ox.correct;
      m.rate = m.answered ? m.correct / m.answered : 0;
    });
    return out;
  }

  function mastery(themeId) {
    const all = masteryAll();
    return all[themeId] || blank();
  }

  // 頻出A(opts.rank)で、解いた数が下限以上のテーマを正解率の低い順に { theme, m }
  function weakThemes(opts) {
    const o = opts || {};
    const rank = o.rank || `A`;
    const min = Number.isFinite(o.min) ? o.min : MIN_ANSWERED;
    const all = o.mastery || masteryAll();
    const list = themes()
      .filter((t) => t.rank === rank && (!o.cat || t.cat === o.cat))
      .map((t) => ({ theme: t, m: all[t.id] || blank() }))
      .filter((x) => x.m.answered >= min && (x.m.answered > 0))
      .sort((a, b) => (a.m.rate - b.m.rate) || byRank(a.theme, b.theme));
    return typeof o.limit === `number` ? list.slice(0, o.limit) : list;
  }

  // まだあまり解いていない(解いた数が下限未満)、よく出るテーマ(ランク → 出た回数の順)
  function freshThemes(opts) {
    const o = opts || {};
    const min = Number.isFinite(o.min) ? o.min : MIN_ANSWERED;
    const all = o.mastery || masteryAll();
    const list = themes()
      .filter((t) => (!o.rank || t.rank === o.rank) && (!o.cat || t.cat === o.cat) && (all[t.id] || blank()).answered < min)
      .sort(byRank)
      .map((t) => ({ theme: t, m: all[t.id] || blank() }));
    return typeof o.limit === `number` ? list.slice(0, o.limit) : list;
  }

  // 学ぶ目的・目標の試験が宅建士試験か(目標の試験 → 学ぶ目的の順に見る。どちらもなければ true)
  function forTakken() {
    try {
      const S = window.Stats;
      const t = S && S.primaryTarget ? S.primaryTarget() : null;
      if (t && S.examType && S.examType(t.examTypeId)) return t.examTypeId === `takken`;
      const p = S && S.getProfile ? S.getProfile() : null;
      return !p || p.goal === `takken`;
    } catch (e) { return true; }
  }

  // ---- 今日のメニュー(js/recommend.js)から ----
  // 頻出Aのテーマの優先の順: (opts.cat の分野)→ 解いた数が下限以上で正解率が低い(正解率の低い順)→
  // まだあまり解いていない → できている(正解率8割以上。正解率の低い順)。
  // まだあまり解いていないテーマの中は、opts.topics(読む順のトピック)があればトピック → 基礎知識の読む順
  // (はじめての人に、トピックの途中の項目から勧めないため)、なければ出た回数の多い順
  function menuOrder(opts) {
    const o = opts || {};
    const all = masteryAll();
    const I = window.AppIndex;
    const group = (m) => (m.answered >= MIN_ANSWERED ? (m.rate < GOOD_RATE ? 0 : 2) : 1);
    const topics = Array.isArray(o.topics) ? o.topics : null;
    const pos = (t) => {
      const ti = topics.indexOf(t.topicId);
      const order = I && I.topicBasicOrder && Array.isArray(I.topicBasicOrder[t.topicId]) ? I.topicBasicOrder[t.topicId] : [];
      const bi = Math.min.apply(null, (Array.isArray(t.basicIds) ? t.basicIds : []).map((b) => order.indexOf(b)).filter((x) => x >= 0).concat([1e6]));
      return (ti < 0 ? 1e3 : ti) * 1e7 + bi;
    };
    const fresh = (a, b) => (topics ? pos(a) - pos(b) : 0) || byRank(a, b);
    return themes()
      .filter((t) => t.rank === `A`)
      .map((t, i) => ({ t, m: all[t.id] || blank(), i }))
      .sort((a, b) => ((o.cat ? (a.t.cat === o.cat ? 0 : 1) - (b.t.cat === o.cat ? 0 : 1) : 0))
        || (group(a.m) - group(b.m))
        || (group(a.m) === 1 ? fresh(a.t, b.t) : a.m.rate - b.m.rate)
        || (a.i - b.i));
  }

  function isLearned(bp, id) {
    return !!(plain(bp[id]) && bp[id].learned);
  }

  function menuPick(kind, opts) {
    if (!ready()) return null;
    const o = opts || {};
    const order = menuOrder(o);
    if (kind === `basic`) {
      let bp = {};
      try { bp = Storage.get(`basicsProgress`, {}); } catch (e) { bp = {}; }
      if (!plain(bp)) bp = {};
      const I = window.AppIndex;
      for (const x of order) {
        const t = x.t;
        const ids = Array.isArray(t.basicIds) ? t.basicIds : [];
        // トピックの読む順(小見出しの順)にそろえる
        const topicOrder = I && I.topicBasicOrder && Array.isArray(I.topicBasicOrder[t.topicId]) ? I.topicBasicOrder[t.topicId] : [];
        const sorted = ids.slice().sort((a, b) => {
          const ia = topicOrder.indexOf(a);
          const ib = topicOrder.indexOf(b);
          return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
        });
        const next = sorted.find((id) => !isLearned(bp, id) && I && I.termsById && I.termsById[id] && I.topicsById && I.topicsById[t.topicId]);
        if (next) return { topicId: t.topicId, basicId: next, theme: t };
      }
      return null;
    }
    if (kind === `ox`) {
      const min = Number(o.min) || 1;
      const x = order.find((y) => statementCountOf(y.t.id) >= min);
      return x ? { nav: `#ox/freq/${encodeURIComponent(x.t.id)}/${o.count || 10}`, name: x.t.name, theme: x.t } : null;
    }
    return null;
  }

  return {
    RANKS, CATS, LEVELS, LEVEL_LABELS, MIN_ANSWERED,
    ready, info, total, minHits, examLabel, themes, theme, themeOfQuiz, rankOfQuiz, themeOfBasic, rankOfBasic, themesBySection, sectionBest, byRank,
    chipHtml, chipFor, quizIdsOf, statementCountOf, matchLevel, mastery, masteryAll, weakThemes, freshThemes, forTakken, menuPick,
  };
})();
