// 学習統計: ホーム・進捗・復習バッジ・模擬試験が共通で使う集計処理
// 試験目標(examTargets)の保存・取得もここで扱う
window.Stats = (function () {
  // 回数として使える0以上の整数に変換(壊れたデータ対策)
  function cnt(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  function arr(key) {
    const v = Storage.get(key, []);
    return Array.isArray(v) ? v : [];
  }

  function examTypes() {
    return (window.APP_DATA.exams && Array.isArray(window.APP_DATA.exams.types)) ? window.APP_DATA.exams.types : [];
  }

  function examType(id) {
    return examTypes().find((t) => t.id === id) || null;
  }

  // ---- 復習・カード ----
  function dueReviewCount() {
    return Srs.getReviewDueIds().filter((id) => AppIndex.termsById[id]).length;
  }

  // 学習対象の用語(「作品で学ぶ」専用の俗語 worksOnly は、用語集・復習と同じく数えない)
  function learnTerms() {
    return AppIndex.allTerms.filter((t) => t.worksOnly !== true);
  }

  function newCount() {
    const cards = Srs.getAllCards();
    return learnTerms().filter((t) => !cards[t.id]).length;
  }

  // 新規 / 学習中(間隔7日未満) / 定着しはじめ(21日未満) / 定着(21日以上)
  function srsBuckets() {
    const cards = Srs.getAllCards();
    const b = { new: 0, learning: 0, young: 0, mature: 0 };
    learnTerms().forEach((t) => {
      const c = cards[t.id];
      if (!c) b.new += 1;
      else if ((c.interval || 0) < 7) b.learning += 1;
      else if (c.interval < 21) b.young += 1;
      else b.mature += 1;
    });
    return b;
  }

  // ---- 学習済み判定 ----
  // 用語集で「記憶済み(★)」にした、またはトピックの基礎知識チェックリストで「学習済み」にしたもの
  function isDone(termId, known, basicsProgress) {
    return !!known[termId] || !!(basicsProgress[termId] && basicsProgress[termId].learned);
  }

  // 用語の状態: untouched(未着手) / learning(学習中) / known(記憶済み)
  function termStatus(termId) {
    const known = obj(`flashcards`);
    if (known[termId]) return `known`;
    const bp = obj(`basicsProgress`);
    const cards = Srs.getAllCards();
    const auto = obj(`autoQuizStats`);
    if (cards[termId] || auto[termId] || (bp[termId] && bp[termId].learned)) return `learning`;
    return `untouched`;
  }

  // ---- 試験分野 ----
  // item: 用語(terms/basics) か クイズ問題(relatedTermId を持つ)
  function categoryOf(item, examTypeId) {
    const type = examType(examTypeId);
    if (!type || !Array.isArray(type.categories)) return null;
    // 4択・基礎知識に試験分野が明示されていれば最優先(値が null なら「その試験の範囲外」)
    if (item && item.examCats && Object.prototype.hasOwnProperty.call(item.examCats, examTypeId)) {
      const cid = item.examCats[examTypeId];
      return cid ? type.categories.find((c) => c.id === cid) || null : null;
    }
    const termId = item.relatedTermId || (AppIndex.termsById[item.id] ? item.id : null);
    if (termId) {
      const byId = type.categories.find((c) => (c.termIds || []).includes(termId));
      if (byId) return byId;
    }
    const term = termId ? AppIndex.termsById[termId] : null;
    const lists = [term && term.topicIds, item.topicIds];
    for (const tids of lists) {
      if (!Array.isArray(tids)) continue;
      for (const tid of tids) {
        const cat = type.categories.find((c) => (c.topicIds || []).includes(tid));
        if (cat) return cat;
      }
    }
    return null;
  }

  function termsInCategory(examTypeId, categoryId) {
    return AppIndex.allTerms.filter((t) => {
      const cat = categoryOf(t, examTypeId);
      return cat && cat.id === categoryId;
    });
  }

  function examHistory() {
    return arr(`examHistory`);
  }

  // [{id, name, questions, total, done, pct, quizCorrect, quizAttempted, accuracy}]
  function byCategory(examTypeId, opts) {
    opts = opts || {};
    const type = examType(examTypeId);
    if (!type || !Array.isArray(type.categories)) return [];
    const known = obj(`flashcards`);
    const bp = obj(`basicsProgress`);
    const quizHistory = obj(`quizHistory`);
    const auto = obj(`autoQuizStats`);

    const rows = type.categories.map((c) => ({ id: c.id, name: c.name, questions: c.questions, total: 0, done: 0, quizCorrect: 0, quizAttempted: 0 }));
    const byId = {};
    rows.forEach((r) => { byId[r.id] = r; });

    AppIndex.allTerms.forEach((t) => {
      const cat = categoryOf(t, examTypeId);
      if (!cat) return;
      const r = byId[cat.id];
      r.total += 1;
      if (isDone(t.id, known, bp)) r.done += 1;
      const s = auto[t.id];
      if (s) {
        // 読み込んだデータが文字列や負の数でも計算が崩れないよう、0以上の数値にそろえる
        const c = cnt(s.correct);
        r.quizCorrect += c;
        r.quizAttempted += c + cnt(s.wrong);
      }
    });

    window.APP_DATA.quiz.forEach((q) => {
      const h = quizHistory[q.id];
      if (h !== `ok` && h !== `ng`) return;
      const cat = categoryOf(q, examTypeId);
      if (!cat) return;
      byId[cat.id].quizAttempted += 1;
      if (h === `ok`) byId[cat.id].quizCorrect += 1;
    });

    examHistory().filter((e) => e && e.examTypeId === examTypeId && e.byCategory).forEach((e) => {
      Object.keys(e.byCategory).forEach((cid) => {
        const r = byId[cid];
        const v = e.byCategory[cid];
        if (!r || !v) return;
        const total = cnt(v.total);
        r.quizCorrect += Math.min(cnt(v.correct), total);
        r.quizAttempted += total;
      });
    });

    let result = rows;
    if (opts.compact && type.compactMerge) {
      result = rows.filter((r) => !type.compactMerge[r.id]).map((r) => Object.assign({}, r));
      const out = {};
      result.forEach((r) => { out[r.id] = r; });
      Object.keys(type.compactMerge).forEach((from) => {
        const to = out[type.compactMerge[from]];
        const src = byId[from];
        if (!to || !src) return;
        to.total += src.total;
        to.done += src.done;
        to.quizCorrect += src.quizCorrect;
        to.quizAttempted += src.quizAttempted;
        if (to.questions != null && src.questions != null) to.questions += src.questions;
      });
      if (type.compactNames) result.forEach((r) => { if (type.compactNames[r.id]) r.name = type.compactNames[r.id]; });
    }
    result.forEach((r) => {
      r.pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
      r.accuracy = r.quizAttempted ? Math.round((r.quizCorrect / r.quizAttempted) * 100) : null;
    });
    return result;
  }

  // トピック別: [{topic, total, done, pct}]
  function byTopic() {
    const known = obj(`flashcards`);
    const bp = obj(`basicsProgress`);
    return window.APP_DATA.topics.map((topic) => {
      const ids = (AppIndex.topicTermIndex[topic.id] || []).filter((id) => AppIndex.termsById[id] && AppIndex.termsById[id].worksOnly !== true);
      const done = ids.filter((id) => isDone(id, known, bp)).length;
      return { topic, total: ids.length, done, pct: ids.length ? Math.round((done / ids.length) * 100) : 0 };
    });
  }

  function overall() {
    const known = obj(`flashcards`);
    const bp = obj(`basicsProgress`);
    const terms = learnTerms();
    const total = terms.length;
    const done = terms.filter((t) => isDone(t.id, known, bp)).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  // ---- ヒートマップ ----
  function levelOf(count) {
    if (!count) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
  }

  function heatmap(nDays) {
    return Streak.getLastNDays(nDays).map((d) => Object.assign({}, d, { level: levelOf(d.count) }));
  }

  // ---- 苦手 ----
  // 自動生成クイズで間違いが多い用語 + 固定問題で「わからなかった」用語
  function weakTerms(limit) {
    const auto = obj(`autoQuizStats`);
    const quizHistory = obj(`quizHistory`);
    const score = {};
    Object.keys(auto).forEach((id) => {
      const s = auto[id] || {};
      const diff = (s.wrong || 0) - (s.correct || 0);
      if ((s.wrong || 0) > 0 && diff >= 0) score[id] = (score[id] || 0) + diff + 1;
    });
    window.APP_DATA.quiz.forEach((q) => {
      if (quizHistory[q.id] === `ng` && q.relatedTermId) score[q.relatedTermId] = (score[q.relatedTermId] || 0) + 1;
    });
    return Object.keys(score)
      .filter((id) => AppIndex.termsById[id])
      .sort((a, b) => score[b] - score[a])
      .slice(0, limit || 10)
      .map((id) => ({ term: AppIndex.termsById[id], score: score[id] }));
  }

  // ---- 試験目標 ----
  function listTargets() {
    // id のない目標(壊れたバックアップなど)も、設定画面で編集・削除できるように仮の id を付ける
    return arr(`examTargets`).filter((t) => t && typeof t.name === `string` && DateUtil.isValid(t.date))
      .map((t, i) => (typeof t.id === `string` && t.id ? t : Object.assign({}, t, { id: `et_r${i}` })));
  }

  function saveTargets(list) {
    Storage.set(`examTargets`, list);
  }

  function addTarget(t) {
    const list = listTargets();
    const target = {
      id: `et_${Date.now().toString(36)}`,
      name: String(t.name || ``).trim() || `試験`,
      examTypeId: examType(t.examTypeId) ? t.examTypeId : `other`,
      date: t.date,
      primary: list.length === 0 || !!t.primary,
      createdAt: Date.now(),
    };
    if (target.primary) list.forEach((x) => { x.primary = false; });
    list.push(target);
    saveTargets(list);
    return target;
  }

  function removeTarget(id) {
    const list = listTargets().filter((t) => t.id !== id);
    if (list.length && !list.some((t) => t.primary)) list[0].primary = true;
    saveTargets(list);
  }

  function setPrimary(id) {
    const list = listTargets();
    list.forEach((t) => { t.primary = t.id === id; });
    saveTargets(list);
  }

  // 登録済みの目標を書き換える(設定画面の編集)。primary と id・作成日時は変えない
  function updateTarget(id, patch) {
    const list = listTargets();
    const t = list.find((x) => x.id === id);
    if (!t || !patch) return null;
    if (typeof patch.name === `string`) t.name = patch.name.trim() || `試験`;
    if (patch.examTypeId != null) t.examTypeId = examType(patch.examTypeId) ? patch.examTypeId : `other`;
    if (DateUtil.isValid(patch.date)) t.date = patch.date;
    saveTargets(list);
    return t;
  }

  // 主目標: ホームに表示する(★)指定が終わっていなければそれ > 直近の未来の試験 > ★の試験 > 最後の過去の試験
  // (★の試験が終わったあとも、次の試験があればそちらを表示する。設定画面の行は「終了」と表示される)
  function primaryTarget() {
    const list = listTargets();
    if (!list.length) return null;
    const today = DateUtil.today();
    const upcoming = list.filter((t) => t.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
    const flagged = list.find((t) => t.primary);
    if (flagged && (flagged.date >= today || !upcoming.length)) return flagged;
    if (upcoming.length) return upcoming[0];
    return list.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }

  // 「今日の復習」で1日に出す新しい用語の上限(review.js と同じ解釈。壊れた値は標準の10語)
  function newLimit() {
    const def = (window.Views && Views.review && Views.review.DEFAULT_NEW_LIMIT) || 10;
    const n = Number(Storage.get(`reviewNewLimit`, def));
    return Number.isFinite(n) && n >= 0 ? Math.min(100, Math.floor(n)) : def;
  }

  // 今日の復習で、これから出せる新しい用語の数(1日の上限 − 今日すでに出した数、未学習の数まで)
  function newAvailableToday() {
    const nt = Storage.get(`reviewNewToday`, {});
    const usedToday = nt && nt.date === DateUtil.today() && Array.isArray(nt.ids) ? nt.ids.length : 0;
    return Math.min(Math.max(0, newLimit() - usedToday), newCount());
  }

  // 学習ペース: 残り日数から最終復習用の予備日を引き、1日あたりに必要な新規学習数を出す
  // overLimit: 1日に必要な数が「今日の復習」の新しい用語の上限を超えている(今の設定では間に合わない)
  function pace(target) {
    const today = DateUtil.today();
    const daysLeft = DateUtil.diffDays(today, target.date);
    const type = examType(target.examTypeId);
    let pool = learnTerms();
    if (type && Array.isArray(type.categories)) pool = pool.filter((t) => categoryOf(t, type.id));
    const known = obj(`flashcards`);
    const bp = obj(`basicsProgress`);
    const remaining = pool.filter((t) => !isDone(t.id, known, bp)).length;
    const buffer = Math.min(14, Math.floor(Math.max(daysLeft, 0) * 0.2));
    const studyDays = Math.max(1, daysLeft - buffer);
    const perDay = daysLeft > 0 ? Math.ceil(remaining / studyDays) : 0;
    const limit = newLimit();
    return {
      daysLeft,
      remaining,
      total: pool.length,
      perDay,
      buffer,
      dueToday: dueReviewCount(),
      newLimit: limit,
      overLimit: daysLeft > 0 && perDay > limit,
      suggestMock: daysLeft > 0 && daysLeft <= 60 && !!(type && type.mockExam),
    };
  }

  // ---- 試験の公式日程(試験日の登録フォーム・初回ガイドのワンタップ登録) ----
  // データ(APP_DATA.exams.officialDates または各試験の officialDates)を優先し、なければ下の既定値を使う
  // 既定値は 2026-10-18 を過ぎると表示されなくなる(日付が過ぎたものは出さないため)
  const FALLBACK_OFFICIAL_DATES = [{ date: `2026-10-18`, label: `令和8年度 宅建士試験`, examTypeId: `takken` }];
  function officialDates(examTypeId) {
    const exams = window.APP_DATA && window.APP_DATA.exams;
    const list = [];
    const add = (o, typeId) => {
      if (!o || typeof o !== `object` || !DateUtil.isValid(o.date)) return;
      const tid = typeof o.examTypeId === `string` ? o.examTypeId : typeId;
      if (!examType(tid)) return;
      list.push({ date: o.date, label: typeof o.label === `string` && o.label ? o.label : `${examType(tid).shortName}試験`, examTypeId: tid });
    };
    if (exams && Array.isArray(exams.officialDates)) exams.officialDates.forEach((o) => add(o, `takken`));
    examTypes().forEach((t) => { if (Array.isArray(t.officialDates)) t.officialDates.forEach((o) => add(o, t.id)); });
    if (!list.length) FALLBACK_OFFICIAL_DATES.forEach((o) => add(o, o.examTypeId));
    const today = DateUtil.today();
    const seen = new Set();
    // 試験日の当日以降は出さない(前日まで)
    return list.filter((o) => o.date > today && (!examTypeId || o.examTypeId === examTypeId))
      .filter((o) => { const k = `${o.examTypeId}|${o.date}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // ---- 学ぶ目的(learnerProfile) ----
  // { goal: 'takken'|'life'|'work'|'zeirishi', interests: string[], at: number }
  // 初回ガイド・設定(学ぶ目的)で保存し、ホーム・トピック一覧・今日の復習の並びに使う
  const GOAL_OPTIONS = [
    { id: `takken`, icon: `target`, title: `宅建士試験に合格したい`, desc: `4択・○×・本番形式の模擬試験で対策`, examTypeId: `takken` },
    { id: `life`, icon: `home`, title: `暮らしや取引に役立てたい`, desc: `部屋を借りる・家を買う・売る・相続する前に`, examTypeId: null },
    { id: `work`, icon: `briefcase`, title: `仕事で使いたい`, desc: `不動産・金融・保険・士業などの基礎として`, examTypeId: null },
    { id: `zeirishi`, icon: `receipt`, title: `税理士試験(消費税法など)の対策`, desc: `不動産と消費税・不動産の税金`, examTypeId: `zeirishi` },
  ];
  // 気になるテーマ → トピック(先頭ほど優先。まだないトピックは使うときに除く)
  const INTEREST_TOPIC_MAP = Object.freeze({
    rent: Object.freeze([`topicI`, `topicA`]),
    buy: Object.freeze([`topicB`, `topicC`, `topicD`]),
    sell: Object.freeze([`topicP`, `topicB`, `topicH`]),
    inherit: Object.freeze([`topicQ`, `topicH`, `topicE`]),
    landlord: Object.freeze([`topicA`, `topicH`]),
    trouble: Object.freeze([`topicG`, `topicF`]),
  });
  const INTEREST_OPTIONS = [
    { id: `rent`, label: `借りる(賃貸)`, short: `借りる`, icon: `key` },
    { id: `buy`, label: `買う(購入・ローン)`, short: `買う`, icon: `home` },
    { id: `sell`, label: `売る`, short: `売る`, icon: `handshake` },
    { id: `inherit`, label: `相続する`, short: `相続`, icon: `receipt` },
    { id: `landlord`, label: `貸す(大家)`, short: `貸す`, icon: `building` },
    { id: `trouble`, label: `トラブルを避けたい`, short: `トラブル対策`, icon: `shield` },
  ];
  const GOAL_IDS = GOAL_OPTIONS.map((g) => g.id);
  const INTEREST_IDS = INTEREST_OPTIONS.map((o) => o.id);

  function topicExists(id) {
    return !!(window.AppIndex && AppIndex.topicsById && AppIndex.topicsById[id]);
  }

  // いま存在するトピックだけに絞った対応表(topicP・topicQ はデータに入ってから使われる)
  function interestTopicsMap() {
    const out = {};
    INTEREST_IDS.forEach((k) => { out[k] = INTEREST_TOPIC_MAP[k].filter(topicExists); });
    return out;
  }

  function normalizeProfile(v) {
    if (!v || typeof v !== `object` || Array.isArray(v) || !GOAL_IDS.includes(v.goal)) return null;
    const interests = Array.isArray(v.interests)
      ? v.interests.filter((k, i, a) => typeof k === `string` && INTEREST_IDS.includes(k) && a.indexOf(k) === i)
      : [];
    const at = typeof v.at === `number` && Number.isFinite(v.at) && v.at > 0 ? v.at : null;
    return { goal: v.goal, interests, at };
  }

  // 保存されている学ぶ目的(壊れていれば null)
  function getProfile() {
    return normalizeProfile(Storage.get(`learnerProfile`, null));
  }

  // 学ぶ目的を保存する。goal が不正なら保存しない。戻り値は保存した内容(または null)
  function setProfile(p) {
    const n = normalizeProfile(Object.assign({}, p, { at: Date.now() }));
    if (!n) return null;
    Storage.set(`learnerProfile`, n);
    return n;
  }

  // 気になるテーマのトピック(選んだ順・重複なし・存在するものだけ)
  // 気になるテーマは暮らし・仕事の目的のときだけ使う(設定で目的を試験に変えても、選んだテーマは残してあるため)
  const INTEREST_GOALS = [`life`, `work`];
  function interestTopicIds(profile) {
    const p = profile === undefined ? getProfile() : normalizeProfile(profile);
    if (!p || !INTEREST_GOALS.includes(p.goal)) return [];
    const out = [];
    p.interests.forEach((k) => (INTEREST_TOPIC_MAP[k] || []).forEach((tid) => {
      if (topicExists(tid) && !out.includes(tid)) out.push(tid);
    }));
    return out;
  }

  // 目的に対応する試験(宅建士・税理士)。暮らし・仕事は null
  function goalExamTypeId(profile) {
    const p = profile === undefined ? getProfile() : normalizeProfile(profile);
    const g = p ? GOAL_OPTIONS.find((x) => x.id === p.goal) : null;
    return g && g.examTypeId && examType(g.examTypeId) ? g.examTypeId : null;
  }

  return {
    examTypes, examType, dueReviewCount, newCount, srsBuckets, termStatus, categoryOf, termsInCategory,
    byCategory, byTopic, overall, heatmap, levelOf, weakTerms, examHistory,
    listTargets, addTarget, updateTarget, removeTarget, setPrimary, primaryTarget, pace, newLimit, newAvailableToday,
    officialDates,
    getProfile, setProfile, normalizeProfile, interestTopicIds, goalExamTypeId,
    GOAL_OPTIONS, INTEREST_OPTIONS,
    // 存在するトピックだけに絞った {rent:[...], buy:[...], ...}(読むたびに作り直す)
    get INTEREST_TOPICS() { return interestTopicsMap(); },
  };
})();
