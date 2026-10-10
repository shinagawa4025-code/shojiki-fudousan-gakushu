// 分野別の弱点分析: 確認問題・自動生成クイズ・○×・模擬試験・復習カードの記録から
// 試験分野ごとの習熟度、苦手なポイント、次にやることを出す(DOMは触らない純粋な集計)
// QuizEngine はこのファイルより後に読み込まれるため、関数の中でだけ使う
//
// ■ 習熟度(0〜100)
//   習熟度 = 100 ×(0.7 × 重み付き正答率 × 回答量係数 + 0.3 × 学習カバー率)
//   ・回答量係数 = min(1, 回答数 ÷ 10)。回答が10問に満たないうちは正答率の点を割り引く
//   ・学習カバー率 = 分野の用語・基礎知識のうち一度でも学習したものの割合
//     (記憶済み・学習済み・復習カードあり・クイズや○×で出題済み)。分野に用語がないときは正答率だけで計算する
//   ・重み: 4択 1 / 記述(自己採点) 0.5 / 自動生成クイズ 1 / ○× 1(直近の1回をもう1回分) /
//           模擬試験 直近×2・その前×1.5・それ以前×1
// ■ 優先度 = (分野の例年出題数 ÷ その試験で最大の出題数)×(100 − 習熟度)÷ 100
// 画面に出す「正答率」は重みなしの単純な正答率(正解数 ÷ 回答数)
window.Analysis = (function () {
  const MIN_CONFIDENT = 10; // これ未満は「データ不足」
  const MID_CONFIDENT = 30;
  const ACC_WEIGHT = 0.7;
  const COVER_WEIGHT = 0.3;
  const EXAM_WEIGHTS = [2, 1.5]; // 直近・その前(それ以前は1)
  const OX_RECENT_BONUS = 1;
  const TREND_STEP = 5; // ±5ポイント以上で上昇・下降
  const WEAK_EXAM_WINDOW = 3; // 苦手判定に使う直近の模擬試験の回数
  const GOOD_ACC = 70;
  const SOURCE_DEFS = [
    { id: `mc`, label: `4択`, weight: 1 },
    { id: `self`, label: `記述`, weight: 0.5 },
    { id: `auto`, label: `自動クイズ`, weight: 1 },
    { id: `ox`, label: `○×`, weight: 1 },
    { id: `exam`, label: `模擬試験`, weight: 1 },
  ];
  const CONFIDENCE_LABELS = { none: `未回答`, low: `データ不足`, mid: `目安`, high: `十分` };

  // ---- 小物 ----
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const own = (o, k) => (o && hasOwn(o, k) ? o[k] : undefined);
  const dict = () => Object.create(null);

  function isObj(v) {
    return !!v && typeof v === `object` && !Array.isArray(v);
  }

  function readObj(key) {
    const v = Storage.get(key, {});
    return isObj(v) ? v : {};
  }

  function readArr(key) {
    const v = Storage.get(key, []);
    return Array.isArray(v) ? v : [];
  }

  // 回数として使える数(負・NaN・巨大値は弾く)
  function count(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100000) : 0;
  }

  function pct(c, t) {
    return t > 0 ? Math.round((c / t) * 100) : null;
  }

  function join(parts) {
    return parts.filter(Boolean).join(`・`);
  }

  function isMc(item) {
    return !!item && item.format === `mc` && Array.isArray(item.choices) && item.choices.length === 4
      && Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < 4;
  }

  function termById(id) {
    return typeof id === `string` ? own(AppIndex.termsById, id) || null : null;
  }

  function topicById(id) {
    return typeof id === `string` ? own(AppIndex.topicsById, id) || null : null;
  }

  function quizIndex() {
    const map = dict();
    (window.APP_DATA.quiz || []).forEach((q) => { if (q && typeof q.id === `string`) map[q.id] = q; });
    return map;
  }

  function statementsOf(item) {
    if (!window.QuizEngine || typeof QuizEngine.statementsFrom !== `function`) return [];
    try { return QuizEngine.statementsFrom(item) || []; } catch (e) { return []; }
  }

  function allStatements() {
    if (!window.QuizEngine || typeof QuizEngine.allStatements !== `function`) return [];
    try { return QuizEngine.allStatements() || []; } catch (e) { return []; }
  }

  function dateOfTs(t) {
    return t > 0 ? DateUtil.format(new Date(t)) : null;
  }

  function examTypeOf(id) {
    return window.Stats ? Stats.examType(id) : null;
  }

  // 試験の指定がなければ: 主目標の試験(分野があるもの) > 宅建士
  function resolveType(examTypeId) {
    if (examTypeId && examTypeOf(examTypeId)) return examTypeId;
    const p = window.Stats ? Stats.primaryTarget() : null;
    const pt = p ? examTypeOf(p.examTypeId) : null;
    if (pt && Array.isArray(pt.categories)) return pt.id;
    return `takken`;
  }

  // ---- 保存データの読み込み(型を確かめて正規化) ----
  function normalizeExam(e, i) {
    if (!isObj(e)) return null;
    const byCategory = dict();
    if (isObj(e.byCategory)) {
      Object.keys(e.byCategory).forEach((cid) => {
        const v = e.byCategory[cid];
        if (!isObj(v)) return;
        const total = count(v.total);
        if (!total) return;
        byCategory[cid] = { correct: Math.min(count(v.correct), total), total };
      });
    }
    const wrong = Array.isArray(e.wrong) ? e.wrong.filter(isObj).map((w) => ({
      kind: w.kind === `fixed` ? `fixed` : `term`,
      refId: typeof w.refId === `string` ? w.refId : null,
      termId: typeof w.termId === `string` ? w.termId : null,
    })) : [];
    const ts = [e.finishedAt, e.startedAt].find((v) => typeof v === `number` && Number.isFinite(v) && v > 0) || 0;
    const total = count(e.total);
    const score = Math.min(count(e.score), total);
    return { examTypeId: typeof e.examTypeId === `string` ? e.examTypeId : null, byCategory, wrong, t: ts, i, score, total };
  }

  function load() {
    const qhRaw = readObj(`quizHistory`);
    const quizHistory = dict();
    Object.keys(qhRaw).forEach((id) => { if (qhRaw[id] === `ok` || qhRaw[id] === `ng`) quizHistory[id] = qhRaw[id]; });

    const autoRaw = readObj(`autoQuizStats`);
    const auto = dict();
    Object.keys(autoRaw).forEach((id) => {
      const s = autoRaw[id];
      if (!isObj(s)) return;
      const correct = count(s.correct);
      const wrong = count(s.wrong);
      if (correct + wrong > 0) auto[id] = { correct, wrong };
    });

    const oxRaw = readObj(`oxStats`);
    const ox = dict();
    Object.keys(oxRaw).forEach((sid) => {
      const s = oxRaw[sid];
      if (!isObj(s)) return;
      const c = count(s.c);
      const w = count(s.w);
      if (c + w === 0) return;
      const hash = sid.indexOf(`#`);
      ox[sid] = {
        c, w,
        quizId: hash >= 0 ? sid.slice(0, hash) : sid,
        index: hash >= 0 ? parseInt(sid.slice(hash + 1), 10) : NaN,
        lastOk: typeof s.lastOk === `boolean` ? s.lastOk : null,
        last: typeof s.last === `string` && DateUtil.isValid(s.last) ? s.last : null,
      };
    });

    // 新しい順(日時がなければ保存順=新しい順とみなす)
    const exams = readArr(`examHistory`).map(normalizeExam).filter(Boolean)
      .sort((a, b) => ((b.t || 0) - (a.t || 0)) || (a.i - b.i));

    const srsRaw = readObj(`srsCards`);
    const srs = dict();
    Object.keys(srsRaw).forEach((id) => { if (isObj(srsRaw[id])) srs[id] = srsRaw[id]; });

    const known = readObj(`flashcards`);
    const bp = readObj(`basicsProgress`);
    return { quizHistory, auto, ox, exams, srs, known, bp };
  }

  // ---- 集計の器 ----
  function newBucket() {
    const sources = {};
    SOURCE_DEFS.forEach((s) => { sources[s.id] = { correct: 0, total: 0, wCorrect: 0, wTotal: 0 }; });
    return { sources, total: 0, studied: 0, trend: null };
  }

  function addTo(bucket, src, correct, total, weight) {
    const s = bucket.sources[src];
    s.correct += correct;
    s.total += total;
    s.wCorrect += correct * weight;
    s.wTotal += total * weight;
  }

  function confidenceOf(attempts) {
    if (attempts <= 0) return `none`;
    if (attempts < MIN_CONFIDENT) return `low`;
    if (attempts < MID_CONFIDENT) return `mid`;
    return `high`;
  }

  // weightedAcc, coverage は 0〜1(データがなければ null)
  function masteryScore(weightedAcc, attempts, coverage) {
    const reliability = Math.min(1, Math.max(0, attempts) / MIN_CONFIDENT);
    const acc = weightedAcc == null ? 0 : weightedAcc;
    if (coverage == null) return Math.round(100 * acc * reliability);
    return Math.round(100 * (ACC_WEIGHT * acc * reliability + COVER_WEIGHT * coverage));
  }

  function trendOf(lastPct, prevPct) {
    if (lastPct == null || prevPct == null) return null;
    const delta = lastPct - prevPct;
    return { last: lastPct, prev: prevPct, delta, direction: delta >= TREND_STEP ? `up` : delta <= -TREND_STEP ? `down` : `flat` };
  }

  function finalize(b) {
    let correct = 0;
    let total = 0;
    let wC = 0;
    let wT = 0;
    const sources = SOURCE_DEFS.map((def) => {
      const s = b.sources[def.id];
      correct += s.correct;
      total += s.total;
      wC += s.wCorrect;
      wT += s.wTotal;
      return { id: def.id, label: def.label, correct: s.correct, total: s.total, accuracy: pct(s.correct, s.total) };
    });
    const weighted = wT > 0 ? wC / wT : null;
    const coverage = b.total > 0 ? b.studied / b.total : null;
    const confidence = confidenceOf(total);
    return {
      total: b.total,
      studied: b.studied,
      coverage,
      coveragePct: coverage == null ? null : Math.round(coverage * 100),
      attempts: total,
      correct,
      accuracy: pct(correct, total),
      weightedAccuracy: weighted == null ? null : Math.round(weighted * 100),
      mastery: masteryScore(weighted, total, coverage),
      confidence,
      confidenceLabel: CONFIDENCE_LABELS[confidence],
      sources,
      trend: b.trend,
    };
  }

  // 学習した用語(カバー率の分子): 記憶済み・学習済み・復習カード・自動クイズ・確認問題・○×
  function studiedSet(d, quizById) {
    const set = dict();
    const mark = (id) => { if (termById(id)) set[id] = true; };
    Object.keys(d.known).forEach((id) => { if (d.known[id]) mark(id); });
    Object.keys(d.bp).forEach((id) => { if (isObj(d.bp[id]) && d.bp[id].learned) mark(id); });
    Object.keys(d.srs).forEach(mark);
    Object.keys(d.auto).forEach(mark);
    Object.keys(d.quizHistory).forEach((qid) => { const q = quizById[qid]; if (q) mark(q.relatedTermId); });
    Object.keys(d.ox).forEach((sid) => { const q = quizById[d.ox[sid].quizId]; if (q) mark(q.relatedTermId); });
    return set;
  }

  // 4択・記述・自動・○× を buckets に振り分ける(mapTerm / mapQuiz は所属先キーの配列を返す)
  function accumulate(d, quizById, buckets, mapTerm, mapQuiz) {
    Object.keys(d.quizHistory).forEach((qid) => {
      const q = quizById[qid];
      if (!q) return;
      const src = isMc(q) ? `mc` : `self`;
      const ok = d.quizHistory[qid] === `ok` ? 1 : 0;
      mapQuiz(q).forEach((k) => { if (buckets[k]) addTo(buckets[k], src, ok, 1, src === `self` ? 0.5 : 1); });
    });
    Object.keys(d.auto).forEach((tid) => {
      if (!termById(tid)) return;
      const s = d.auto[tid];
      mapTerm(tid).forEach((k) => { if (buckets[k]) addTo(buckets[k], `auto`, s.correct, s.correct + s.wrong, 1); });
    });
    Object.keys(d.ox).forEach((sid) => {
      const s = d.ox[sid];
      const q = quizById[s.quizId];
      if (!q) return;
      mapQuiz(q).forEach((k) => {
        const b = buckets[k];
        if (!b) return;
        addTo(b, `ox`, s.c, s.c + s.w, 1);
        // 直近の1回はもう1回分の重みで数える(最近の理解度を反映)
        if (s.lastOk !== null) {
          b.sources.ox.wCorrect += s.lastOk ? OX_RECENT_BONUS : 0;
          b.sources.ox.wTotal += OX_RECENT_BONUS;
        }
      });
    });
  }

  // ---- 分野別 ----
  function categoryRows(typeId, d, quizById, studied) {
    const type = examTypeOf(typeId);
    if (!type || !Array.isArray(type.categories) || !type.categories.length) return [];
    const cats = type.categories;
    const buckets = dict();
    cats.forEach((c) => { buckets[c.id] = newBucket(); });

    const termCat = dict();
    const catOfTerm = (id) => {
      if (!(id in termCat)) {
        const t = termById(id);
        const c = t ? Stats.categoryOf(t, typeId) : null;
        termCat[id] = c ? c.id : null;
      }
      return termCat[id];
    };
    const quizCat = dict();
    const catOfQuiz = (q) => {
      if (!(q.id in quizCat)) {
        const c = Stats.categoryOf(q, typeId);
        quizCat[q.id] = c ? c.id : null;
      }
      return quizCat[q.id];
    };

    AppIndex.allTerms.forEach((t) => {
      const cid = catOfTerm(t.id);
      if (!cid || !buckets[cid]) return;
      buckets[cid].total += 1;
      if (studied[t.id]) buckets[cid].studied += 1;
    });
    accumulate(d, quizById, buckets, (tid) => { const c = catOfTerm(tid); return c ? [c] : []; }, (q) => { const c = catOfQuiz(q); return c ? [c] : []; });

    // 模擬試験: 新しい回ほど重く数える
    const typeExams = d.exams.filter((e) => e.examTypeId === typeId);
    typeExams.forEach((e, rank) => {
      const weight = EXAM_WEIGHTS[rank] || 1;
      Object.keys(e.byCategory).forEach((cid) => {
        const v = e.byCategory[cid];
        if (buckets[cid]) addTo(buckets[cid], `exam`, v.correct, v.total, weight);
      });
    });
    cats.forEach((c) => {
      const withCat = typeExams.filter((e) => e.byCategory[c.id]);
      if (withCat.length >= 2) {
        const a = withCat[0].byCategory[c.id];
        const b = withCat[1].byCategory[c.id];
        buckets[c.id].trend = trendOf(pct(a.correct, a.total), pct(b.correct, b.total));
      }
    });

    const qs = cats.map((c) => (typeof c.questions === `number` && c.questions > 0 ? c.questions : 0));
    const maxQ = Math.max(0, ...qs);
    const rows = cats.map((c, i) => {
      const r = finalize(buckets[c.id]);
      const importance = maxQ > 0 ? (qs[i] || 0) / maxQ : 1;
      // 用語も回答もない分野(コンテンツ準備中など)は、順位・総合の計算から外す
      const available = r.total > 0 || r.attempts > 0;
      return Object.assign({
        id: c.id,
        name: c.name,
        questions: qs[i] || null,
        topicIds: Array.isArray(c.topicIds) ? c.topicIds.slice() : [],
        importance,
        available,
      }, r, { priority: available ? Math.round(importance * (100 - r.mastery)) / 100 : 0 });
    });
    rows.slice().sort((a, b) => (Number(b.available) - Number(a.available)) || (b.priority - a.priority) || ((b.questions || 0) - (a.questions || 0)))
      .forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  // ---- トピック別(模擬試験は分野単位の記録しかないため含めない) ----
  function topicRows(d, quizById, studied) {
    const topics = (window.APP_DATA.topics || []).filter((t) => t && typeof t.id === `string`);
    const buckets = dict();
    topics.forEach((t) => { buckets[t.id] = newBucket(); });
    topics.forEach((t) => {
      (own(AppIndex.topicTermIndex, t.id) || []).forEach((id) => {
        buckets[t.id].total += 1;
        if (studied[id]) buckets[t.id].studied += 1;
      });
    });
    const topicsOf = (ids) => (Array.isArray(ids) ? ids.filter((id) => typeof id === `string` && buckets[id]) : []);
    accumulate(d, quizById, buckets,
      (tid) => topicsOf((termById(tid) || {}).topicIds),
      (q) => topicsOf(q.topicIds));
    return topics.map((t) => Object.assign({ id: t.id, name: t.name, icon: t.icon || `book-open`, topic: t }, finalize(buckets[t.id])));
  }

  // ---- 苦手なポイント ----
  function weakItems(d, quizById, typeId) {
    const type = examTypeOf(typeId);
    const hasCats = !!(type && Array.isArray(type.categories));
    const catInfo = (item) => {
      if (!hasCats || !item) return null;
      const c = Stats.categoryOf(item, typeId);
      return c ? { id: c.id, name: c.name, questions: c.questions || 0 } : null;
    };
    const recentExams = d.exams.slice(0, WEAK_EXAM_WINDOW);
    const examTermWrong = dict();
    const examQuizWrong = dict();
    recentExams.forEach((e) => {
      e.wrong.forEach((w) => {
        if (w.kind === `fixed` && w.refId && quizById[w.refId]) examQuizWrong[w.refId] = (examQuizWrong[w.refId] || 0) + 1;
        else {
          const tid = w.kind === `term` ? (w.refId || w.termId) : w.termId;
          if (termById(tid)) examTermWrong[tid] = (examTermWrong[tid] || 0) + 1;
        }
      });
    });

    const items = [];
    const coveredTerms = dict(); // 問題・○×として既に挙がった用語(復習カードだけの用語は重複させない)

    // 確認問題(4択・記述)
    const quizIds = dict();
    Object.keys(d.quizHistory).forEach((id) => { if (d.quizHistory[id] === `ng` && quizById[id]) quizIds[id] = true; });
    Object.keys(examQuizWrong).forEach((id) => { quizIds[id] = true; });
    Object.keys(quizIds).forEach((id) => {
      const q = quizById[id];
      const mc = isMc(q);
      const ng = d.quizHistory[id] === `ng`;
      const ex = examQuizWrong[id] || 0;
      const score = (ng ? (mc ? 2 : 1.5) : 0) + ex * 1.5;
      const reasons = [ng ? (mc ? `4択で不正解` : `記述で「わからなかった」`) : ``, ex ? `模擬試験で${ex}回不正解` : ``];
      if (q.relatedTermId) coveredTerms[q.relatedTermId] = true;
      items.push({ kind: `quiz`, id, title: String(q.question || ``), reasons: reasons.filter(Boolean), nav: `#quiz/q/${id}`, icon: `pencil-check`, score, termId: q.relatedTermId || null, category: catInfo(q) });
    });

    // ○×: 2回以上間違えた文(直近で正解し、正解数が上回っていれば外す)
    Object.keys(d.ox).forEach((sid) => {
      const s = d.ox[sid];
      if (s.w < 2 || (s.lastOk === true && s.c >= s.w)) return;
      const q = quizById[s.quizId];
      if (!q) return;
      const st = statementsOf(q).find((x) => x.id === sid || x.index === s.index) || null;
      const score = Math.max(0.5, s.w - 0.5 * s.c + (s.lastOk === false ? 1 : 0));
      if (q.relatedTermId) coveredTerms[q.relatedTermId] = true;
      items.push({
        kind: `statement`, id: sid,
        title: st ? String(st.text) : String(q.question || ``),
        reasons: [`○×で${s.w}回不正解`, st ? `正解は${st.truth ? `○` : `×`}` : ``].filter(Boolean),
        nav: `#ox/weak`, icon: `o-x`, score, termId: q.relatedTermId || null, category: catInfo(q),
      });
    });

    // 用語: 自動クイズで間違いが多い・模擬試験で間違えた・復習で「もう一度」
    const termIds = dict();
    Object.keys(d.auto).forEach((id) => { termIds[id] = true; });
    Object.keys(examTermWrong).forEach((id) => { termIds[id] = true; });
    Object.keys(d.srs).forEach((id) => { termIds[id] = true; });
    Object.keys(termIds).forEach((id) => {
      const t = termById(id);
      if (!t) return;
      const a = d.auto[id];
      const autoNet = a && a.wrong > 0 && a.wrong >= a.correct ? a.wrong - a.correct + 1 : 0;
      const ex = examTermWrong[id] || 0;
      const card = d.srs[id];
      const again = !!card && Number(card.lastGrade) === 1;
      const lowEase = !!card && Number(card.ease) > 0 && Number(card.ease) <= 1.9;
      if (!autoNet && !ex && !again) return;
      if (!autoNet && !ex && coveredTerms[id]) return;
      const score = autoNet + ex * 1.5 + (again ? 1 : 0) + (lowEase ? 0.5 : 0);
      const reasons = [
        autoNet ? `自動クイズで${a.wrong}回不正解` : ``,
        ex ? `模擬試験で${ex}回不正解` : ``,
        again ? `復習で「もう一度」` : ``,
      ].filter(Boolean);
      items.push({ kind: `term`, id, title: t.name, reasons, nav: `#glossary/${id}`, icon: `layers`, score, termId: id, category: catInfo(t) });
    });

    // 選んだ試験の分野に入るものを先に、その中は苦手度順(同点なら出題数の多い分野を先に)
    items.forEach((it) => { it.sub = join([it.category ? it.category.name : ``].concat(it.reasons)); });
    const inCat = (it) => (hasCats && it.category ? 1 : 0);
    return items.sort((a, b) => (inCat(b) - inCat(a)) || (b.score - a.score)
      || (((b.category && b.category.questions) || 0) - ((a.category && a.category.questions) || 0)));
  }

  // ---- 次にやること ----
  // 分野内のどのトピックへ案内するか
  // read: 分野の主なトピック(topicIds の先頭側)から順に、まだ学習が6割未満のもの。なければカバー率が最も低いもの
  // quiz: 苦手な用語が多いトピック > 正答率が低いトピック > 習熟度が低いトピック(自動クイズには用語4つ以上が必要)
  function pickTopic(row, ctx, mode) {
    const minTerms = mode === `quiz` ? 4 : 1;
    const cands = row.topicIds.map((id) => ctx.topicMap[id]).filter((t) => t && t.total >= minTerms);
    if (!cands.length) return null;
    const lowest = (list, key) => list.reduce((best, t) => (key(t) < key(best) ? t : best), list[0]);
    if (mode === `read`) {
      return cands.find((t) => t.coverage != null && t.coverage < 0.6) || lowest(cands, (t) => (t.coverage == null ? 1 : t.coverage));
    }
    const weakOf = (t) => (ctx.weakTermsByTopic && ctx.weakTermsByTopic[t.id]) || 0;
    const withWeak = cands.filter((t) => weakOf(t) > 0);
    if (withWeak.length) return lowest(withWeak, (t) => -weakOf(t));
    const tried = cands.filter((t) => t.accuracy != null);
    if (tried.length) return lowest(tried, (t) => t.accuracy);
    return lowest(cands, (t) => t.mastery);
  }

  function categoryAction(r, ctx) {
    const q = r.questions ? `例年${r.questions}問` : ``;
    // ○×の分野リンク(#ox/cat/…)は宅建士の分野と shohi だけ。それ以外はトピック単位(#ox/topic/…)で案内する
    let oxCount = 0;
    let oxNav = ``;
    if (ctx.examTypeId === `takken` || r.id === `shohi`) {
      oxCount = ctx.statementsByCat[r.id] || 0;
      oxNav = `#ox/cat/${r.id}`;
    } else {
      const best = r.topicIds.reduce((m, id) => ((ctx.statementsByTopic[id] || 0) > (m ? ctx.statementsByTopic[m] || 0 : 0) ? id : m), null);
      if (best) { oxCount = ctx.statementsByTopic[best] || 0; oxNav = `#ox/topic/${best}`; }
    }
    if (r.total === 0 && r.attempts === 0 && !oxCount) return null;
    const readTopic = pickTopic(r, ctx, `read`);
    const quizTopic = pickTopic(r, ctx, `quiz`);
    const practice = () => {
      if (oxCount >= 5) return { kind: `ox`, title: `${r.name}の○×を${Math.min(20, oxCount)}問`, nav: oxNav, icon: `o-x` };
      if (quizTopic) return { kind: `quiz`, title: `${r.name}の用語クイズ`, nav: `#quiz/auto/${quizTopic.id}`, icon: `sparkles` };
      return null;
    };
    const readAction = (lead) => ({
      kind: `read`,
      title: `${r.name}の基礎知識を読む`,
      nav: `#topics/${readTopic.id}`,
      icon: readTopic.icon || `book-open`,
      detail: join([readTopic.name !== r.name ? `「${readTopic.name}」から` : ``, lead, q]),
    });
    let a = null;
    if (r.attempts < MIN_CONFIDENT && (r.coverage == null || r.coverage < 0.3) && readTopic) {
      a = readAction(`学習済み ${r.studied}/${r.total}項目`);
    } else if (r.attempts < MIN_CONFIDENT) {
      a = practice();
      if (a) a.detail = join([r.attempts ? `まだ${r.attempts}問しか解いていません` : `まだ問題を解いていません`, `まず実力を確認`, q]);
    } else if (r.accuracy < GOOD_ACC) {
      if ((ctx.weakTermsByCat[r.id] || 0) >= 3 && quizTopic) {
        a = { kind: `quiz`, title: `${r.name}の苦手な用語クイズ`, nav: `#quiz/auto/${quizTopic.id}`, icon: `target` };
      } else {
        a = practice();
      }
      if (a) a.detail = join([`正答率${r.accuracy}%`, q]);
    } else if (r.coverage != null && r.coverage < 0.6 && readTopic) {
      a = readAction(`正答率${r.accuracy}%・未学習が${r.total - r.studied}項目`);
    } else {
      a = practice();
      if (a) {
        a.title = a.kind === `ox` ? `${r.name}を○×で仕上げる` : `${r.name}の用語クイズで仕上げる`;
        a.detail = join([`正答率${r.accuracy}%`, `この調子を維持`, q]);
      }
    }
    if (!a) return null;
    return Object.assign(a, { priority: r.priority, categoryId: r.id });
  }

  function dueCount() {
    try { return window.Stats ? Stats.dueReviewCount() : 0; } catch (e) { return 0; }
  }

  function buildActions(snap) {
    const cands = [];
    const due = dueCount();
    if (due > 0) {
      cands.push({ kind: `review`, title: `今日の復習(${due}件)`, detail: `復習のタイミングが来た用語があります。忘れかけた今が覚え直しどき`, nav: `#review`, icon: `repeat`, priority: 0.55 + Math.min(due, 40) / 100 });
    }
    snap.categories.forEach((r) => {
      const a = categoryAction(r, snap.ctx);
      if (a) cands.push(a);
    });
    if (snap.ctx.oxLastWrong >= 3) {
      cands.push({ kind: `ox-weak`, title: `○×で間違えた文を解き直す`, detail: `直近の回答が×だった文が${snap.ctx.oxLastWrong}問あります`, nav: `#ox/weak`, icon: `o-x`, priority: 0.5 });
    }
    // 分野別の「苦手な用語クイズ」が出ているときは、全体の苦手クイズは重ねて出さない
    const hasCatWeakQuiz = cands.some((c) => c.kind === `quiz` && c.icon === `target`);
    if (snap.ctx.autoWeak >= 3 && !hasCatWeakQuiz) {
      cands.push({ kind: `auto-weak`, title: `苦手な用語を優先してクイズ`, detail: `自動生成クイズで間違いが多い用語が${snap.ctx.autoWeak}語あります`, nav: `#quiz/auto/weak`, icon: `target`, priority: 0.45 });
    }
    const type = snap.type;
    if (type && type.mockExam) {
      const last = snap.typeExams[0];
      if (!last) {
        cands.push({ kind: `exam`, title: `模擬試験(ショート)で実力を確認`, detail: `まだ受けていません。分野ごとの正答率がまとめてわかります`, nav: `#exam`, icon: `timer`, priority: snap.totalAttempts >= MID_CONFIDENT ? 0.5 : 0.2 });
      } else {
        const lastDate = dateOfTs(last.t);
        const days = lastDate ? DateUtil.diffDays(lastDate, DateUtil.today()) : null;
        if (days == null || days >= 14) {
          cands.push({ kind: `exam`, title: `模擬試験(ショート)で確認`, detail: join([days != null ? `前回から${days}日` : ``, last.total ? `前回${pct(last.score, last.total)}%` : ``, `分野ごとの伸びを確認`]), nav: `#exam`, icon: `timer`, priority: 0.35 });
        }
      }
    }
    if (snap.ctx.oxAttempts === 0 && snap.ctx.statementTotal >= 10) {
      cands.push({ kind: `ox-try`, title: `○×一問一答で腕試し`, detail: `1問数秒で解けます。結果がこの分析に反映されます`, nav: `#ox`, icon: `o-x`, priority: 0.3 });
    }

    // 優先度順。同じ種類は2件まで(足りなければ後から補う)・同じリンク先は1件
    cands.sort((a, b) => b.priority - a.priority);
    const out = [];
    const navs = dict();
    const perKind = dict();
    const rest = [];
    cands.forEach((c) => {
      if (navs[c.nav]) return;
      if ((perKind[c.kind] || 0) >= 2) { rest.push(c); return; }
      perKind[c.kind] = (perKind[c.kind] || 0) + 1;
      navs[c.nav] = true;
      out.push(c);
    });
    rest.forEach((c) => {
      if (navs[c.nav]) return;
      navs[c.nav] = true;
      out.push(c);
    });
    return out.map((c) => ({ title: c.title, detail: c.detail, nav: c.nav, icon: c.icon, kind: c.kind, priority: Math.round(c.priority * 100) / 100, categoryId: c.categoryId || null }));
  }

  // ---- まとめて分析(画面ではこれを1回だけ呼ぶ) ----
  function analyze(examTypeId) {
    const typeId = resolveType(examTypeId);
    const type = examTypeOf(typeId);
    const d = load();
    const quizById = quizIndex();
    const studied = studiedSet(d, quizById);
    const categories = categoryRows(typeId, d, quizById, studied);
    const topics = topicRows(d, quizById, studied);
    const weak = weakItems(d, quizById, typeId);

    const topicMap = dict();
    topics.forEach((t) => { topicMap[t.id] = t; });
    const statementsByCat = dict();
    const statementsByTopic = dict();
    let statementTotal = 0;
    const hasCats = !!(type && Array.isArray(type.categories));
    const memo = dict();
    allStatements().forEach((s) => {
      statementTotal += 1;
      (Array.isArray(s.topicIds) ? s.topicIds : []).forEach((tid) => { statementsByTopic[tid] = (statementsByTopic[tid] || 0) + 1; });
      if (!hasCats) return;
      if (!(s.quizId in memo)) {
        const q = quizById[s.quizId];
        const c = q ? Stats.categoryOf(q, typeId) : null;
        memo[s.quizId] = c ? c.id : null;
      }
      const cid = memo[s.quizId];
      if (cid) statementsByCat[cid] = (statementsByCat[cid] || 0) + 1;
    });
    const weakTermsByCat = dict();
    const weakTermsByTopic = dict();
    weak.forEach((w) => {
      if (w.kind !== `term`) return;
      if (w.category) weakTermsByCat[w.category.id] = (weakTermsByCat[w.category.id] || 0) + 1;
      const t = termById(w.id);
      (t && Array.isArray(t.topicIds) ? t.topicIds : []).forEach((tid) => { weakTermsByTopic[tid] = (weakTermsByTopic[tid] || 0) + 1; });
    });
    let oxAttempts = 0;
    let oxLastWrong = 0;
    Object.keys(d.ox).forEach((sid) => {
      const s = d.ox[sid];
      if (!quizById[s.quizId]) return;
      oxAttempts += s.c + s.w;
      if (s.lastOk === false) oxLastWrong += 1;
    });
    const autoWeak = Object.keys(d.auto).filter((id) => {
      const s = d.auto[id];
      return termById(id) && s.wrong > 0 && s.wrong >= s.correct;
    }).length;

    // サイト全体の回答数(分野に属さない問題も含む)
    let totalAttempts = oxAttempts;
    Object.keys(d.quizHistory).forEach((id) => { if (quizById[id]) totalAttempts += 1; });
    Object.keys(d.auto).forEach((id) => { if (termById(id)) totalAttempts += d.auto[id].correct + d.auto[id].wrong; });
    d.exams.forEach((e) => { totalAttempts += e.total; });

    const typeExams = d.exams.filter((e) => e.examTypeId === typeId);
    const snap = {
      examTypeId: typeId,
      type,
      categories,
      topics,
      weakPoints: weak,
      typeExams,
      totalAttempts,
      hasData: totalAttempts > 0,
      ctx: { examTypeId: typeId, topicMap, statementsByCat, statementsByTopic, statementTotal, weakTermsByCat, weakTermsByTopic, oxAttempts, oxLastWrong, autoWeak },
    };
    snap.actions = buildActions(snap);
    snap.summary = summarize(snap);
    return snap;
  }

  function summarize(snap) {
    const rows = snap.categories.filter((r) => r.available);
    let mastery = null;
    let weakest = null;
    if (rows.length) {
      // 総合 = 分野の習熟度を例年の出題数で重み付けした平均(出題数の目安がない試験は単純平均)
      const wsum = rows.reduce((s, r) => s + (r.questions || 1), 0);
      mastery = Math.round(rows.reduce((s, r) => s + r.mastery * (r.questions || 1), 0) / wsum);
      // 回答数が十分な分野を優先して比べる(データ不足の分野は、十分な分野がないときだけ)
      const confident = rows.filter((r) => r.attempts >= MIN_CONFIDENT);
      const pool = confident.length ? confident : rows.filter((r) => r.total > 0 || r.attempts > 0);
      weakest = pool.length ? pool.reduce((m, r) => ((r.mastery < m.mastery || (r.mastery === m.mastery && (r.questions || 0) > (m.questions || 0))) ? r : m), pool[0]) : null;
    }
    const focus = rows.length ? rows.find((r) => r.rank === 1) || null : null;
    const attempts = rows.reduce((s, r) => s + r.attempts, 0);
    const pick = (r) => (r ? { id: r.id, name: r.name, mastery: r.mastery, accuracy: r.accuracy, attempts: r.attempts, confidence: r.confidence, questions: r.questions } : null);
    return {
      examTypeId: snap.examTypeId,
      examName: snap.type ? (snap.type.shortName || snap.type.name) : ``,
      hasData: snap.hasData,
      attempts,
      confidence: confidenceOf(attempts),
      mastery,
      weakest: pick(weakest),
      focus: pick(focus),
      topAction: snap.actions[0] || null,
      // ホームの「今日やること」と重ならないよう、復習以外で最上位のもの
      topStudyAction: snap.actions.find((a) => a.kind !== `review`) || null,
      weakCount: snap.weakPoints.length,
    };
  }

  // ---- 公開API ----
  function byCategory(examTypeId) {
    return analyze(examTypeId).categories;
  }

  function byTopic() {
    const d = load();
    const quizById = quizIndex();
    return topicRows(d, quizById, studiedSet(d, quizById));
  }

  function weakPoints(limit, examTypeId) {
    const d = load();
    const quizById = quizIndex();
    return weakItems(d, quizById, resolveType(examTypeId)).slice(0, limit || 8);
  }

  function nextActions(examTypeId, limit) {
    return analyze(examTypeId).actions.slice(0, limit || 4);
  }

  function summary(examTypeId) {
    return analyze(examTypeId).summary;
  }

  return {
    analyze, byCategory, byTopic, weakPoints, nextActions, summary,
    SOURCE_DEFS, CONFIDENCE_LABELS, MIN_CONFIDENT,
    _internal: { load, normalizeExam, masteryScore, confidenceOf, trendOf, pickTopic, categoryAction, buildActions, resolveType, count, isMc, constants: { MIN_CONFIDENT, MID_CONFIDENT, ACC_WEIGHT, COVER_WEIGHT, EXAM_WEIGHTS, OX_RECENT_BONUS, TREND_STEP, WEAK_EXAM_WINDOW, GOOD_ACC } },
  };
})();
