// 学習統計: ホーム・進捗・復習バッジ・模擬試験が共通で使う集計処理
// 試験目標(examTargets)の保存・取得もここで扱う
window.Stats = (function () {
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

  function newCount() {
    const cards = Srs.getAllCards();
    return AppIndex.allTerms.filter((t) => !cards[t.id]).length;
  }

  // 新規 / 学習中(間隔7日未満) / 定着しはじめ(21日未満) / 定着(21日以上)
  function srsBuckets() {
    const cards = Srs.getAllCards();
    const b = { new: 0, learning: 0, young: 0, mature: 0 };
    AppIndex.allTerms.forEach((t) => {
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
        r.quizCorrect += s.correct || 0;
        r.quizAttempted += (s.correct || 0) + (s.wrong || 0);
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
        r.quizCorrect += v.correct || 0;
        r.quizAttempted += v.total || 0;
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
      const ids = AppIndex.topicTermIndex[topic.id] || [];
      const done = ids.filter((id) => isDone(id, known, bp)).length;
      return { topic, total: ids.length, done, pct: ids.length ? Math.round((done / ids.length) * 100) : 0 };
    });
  }

  function overall() {
    const known = obj(`flashcards`);
    const bp = obj(`basicsProgress`);
    const total = AppIndex.allTerms.length;
    const done = AppIndex.allTerms.filter((t) => isDone(t.id, known, bp)).length;
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
    return arr(`examTargets`).filter((t) => t && typeof t.name === `string` && DateUtil.isValid(t.date));
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

  // 主目標: primary 指定 > 直近の未来の試験 > 最後の過去の試験
  function primaryTarget() {
    const list = listTargets();
    if (!list.length) return null;
    const flagged = list.find((t) => t.primary);
    if (flagged) return flagged;
    const today = DateUtil.today();
    const upcoming = list.filter((t) => t.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (upcoming.length) return upcoming[0];
    return list.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }

  // 学習ペース: 残り日数から最終復習用の予備日を引き、1日あたりに必要な新規学習数を出す
  function pace(target) {
    const today = DateUtil.today();
    const daysLeft = DateUtil.diffDays(today, target.date);
    const type = examType(target.examTypeId);
    let pool = AppIndex.allTerms;
    if (type && Array.isArray(type.categories)) pool = pool.filter((t) => categoryOf(t, type.id));
    const known = obj(`flashcards`);
    const bp = obj(`basicsProgress`);
    const remaining = pool.filter((t) => !isDone(t.id, known, bp)).length;
    const buffer = Math.min(14, Math.floor(Math.max(daysLeft, 0) * 0.2));
    const studyDays = Math.max(1, daysLeft - buffer);
    const perDay = daysLeft > 0 ? Math.ceil(remaining / studyDays) : 0;
    return {
      daysLeft,
      remaining,
      total: pool.length,
      perDay,
      buffer,
      dueToday: dueReviewCount(),
      suggestMock: daysLeft > 0 && daysLeft <= 60 && !!(type && type.mockExam),
    };
  }

  return {
    examTypes, examType, dueReviewCount, newCount, srsBuckets, termStatus, categoryOf, termsInCategory,
    byCategory, byTopic, overall, heatmap, levelOf, weakTerms, examHistory,
    listTargets, addTarget, removeTarget, setPrimary, primaryTarget, pace,
  };
})();
