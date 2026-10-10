// 起動時に相互参照インデックスを構築
window.AppIndex = (function () {
  const data = window.APP_DATA;

  const episodesById = {};
  data.episodes.forEach((ep) => { episodesById[ep.id] = ep; });

  const topicsById = {};
  data.topics.forEach((tp) => { topicsById[tp.id] = tp; });

  const sourcesById = {};
  data.sources.forEach((src) => { sourcesById[src.id] = src; });

  // 用語は「作中用語(terms)」と「基礎知識(basics)」を統合した1つのプールとして扱う
  const allTerms = [...data.terms, ...data.basics];
  const termsById = {};
  allTerms.forEach((t) => { termsById[t.id] = t; });

  // エピソードID -> [termId, ...] (terms/basics の relatedEpisodes を単一の正として逆引きを構築)
  const episodeTermIndex = {};
  allTerms.forEach((t) => {
    (t.relatedEpisodes || []).forEach((epId) => {
      if (!episodeTermIndex[epId]) episodeTermIndex[epId] = [];
      episodeTermIndex[epId].push(t.id);
    });
  });

  // トピックID -> [termId, ...] (作中用語+基礎知識、term.topicIds を単一の正として逆引きを構築)
  const topicTermIndex = {};
  allTerms.forEach((t) => {
    (t.topicIds || []).forEach((topicId) => {
      if (!topicTermIndex[topicId]) topicTermIndex[topicId] = [];
      topicTermIndex[topicId].push(t.id);
    });
  });

  // トピックID -> [quizId, ...]
  const topicQuizIndex = {};
  data.quiz.forEach((q) => {
    (q.topicIds || []).forEach((topicId) => {
      if (!topicQuizIndex[topicId]) topicQuizIndex[topicId] = [];
      topicQuizIndex[topicId].push(q.id);
    });
  });

  // トピックID -> [lawId, ...]
  const topicLawIndex = {};
  data.laws.laws.forEach((law) => {
    (law.topicIds || []).forEach((topicId) => {
      if (!topicLawIndex[topicId]) topicLawIndex[topicId] = [];
      topicLawIndex[topicId].push(law.id);
    });
  });

  // 用語名/エイリアス -> termId (要約ビューでの本文ハイライト用)
  const termByName = {};
  allTerms.forEach((t) => {
    termByName[t.name] = t.id;
    (t.aliases || []).forEach((alias) => { termByName[alias] = t.id; });
  });

  // ---- データ整合性チェック(問題があれば console.warn で列挙) ----
  const issues = [];
  function dupCheck(label, ids) {
    const seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) issues.push(`${label}のIDが重複: ${id}`);
      seen.add(id);
    });
  }
  dupCheck(`用語・基礎知識`, allTerms.map((t) => t.id));
  dupCheck(`クイズ`, data.quiz.map((q) => q.id));
  dupCheck(`トピック`, data.topics.map((t) => t.id));
  dupCheck(`情報源`, data.sources.map((s) => s.id));

  allTerms.forEach((t) => {
    if (!Array.isArray(t.aliases)) issues.push(`${t.id}: aliases が配列ではない`);
    (t.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${t.id}: 存在しないトピック ${tid}`); });
    (t.sources || []).forEach((sid) => { if (!sourcesById[sid]) issues.push(`${t.id}: 存在しない出典 ${sid}`); });
    (t.relatedEpisodes || []).forEach((eid) => { if (!episodesById[eid]) issues.push(`${t.id}: 存在しないエピソード ${eid}`); });
  });
  data.topics.forEach((tp) => {
    tp.basicIds.forEach((id) => { if (!termsById[id]) issues.push(`${tp.id}.basicIds: 存在しない ${id}`); });
    tp.episodes.forEach((id) => { if (!episodesById[id]) issues.push(`${tp.id}.episodes: 存在しない ${id}`); });
  });
  data.quiz.forEach((q) => {
    if (q.relatedTermId && !termsById[q.relatedTermId]) issues.push(`${q.id}: 存在しない relatedTermId ${q.relatedTermId}`);
    (q.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${q.id}: 存在しないトピック ${tid}`); });
    if (q.format === `mc`) {
      if (!Array.isArray(q.choices) || q.choices.length !== 4) issues.push(`${q.id}: 4択問題の選択肢が4つではない`);
      else if (new Set(q.choices).size !== 4) issues.push(`${q.id}: 選択肢に重複がある`);
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) issues.push(`${q.id}: correctIndex が0〜3ではない`);
    } else if (!q.answer) {
      issues.push(`${q.id}: 記述式なのに answer がない`);
    }
  });
  data.laws.laws.forEach((law) => {
    (law.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${law.id}: 存在しないトピック ${tid}`); });
  });
  if (data.exams && Array.isArray(data.exams.types)) {
    data.exams.types.forEach((type) => {
      (type.categories || []).forEach((c) => {
        (c.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`試験${type.id}.${c.id}: 存在しないトピック ${tid}`); });
        (c.termIds || []).forEach((id) => { if (!termsById[id]) issues.push(`試験${type.id}.${c.id}: 存在しない用語 ${id}`); });
      });
    });
  }

  const examTypeCount = data.exams && Array.isArray(data.exams.types) ? data.exams.types.length : 0;
  console.log(`[データ整合性チェック] episodes=${data.episodes.length} (期待値56), specials=${data.specials.length} (期待値7), terms=${data.terms.length} (期待値43), basics=${data.basics.length} (期待値117), topics=${data.topics.length} (期待値11), laws=${data.laws.laws.length} (期待値6), quiz=${data.quiz.length} (期待値86), sources=${data.sources.length} (期待値13), 試験種別=${examTypeCount} (期待値3), 警告=${issues.length}件`);
  issues.forEach((msg) => console.warn(`[データ整合性チェック] ${msg}`));

  return { episodesById, topicsById, termsById, allTerms, sourcesById, episodeTermIndex, topicTermIndex, topicQuizIndex, topicLawIndex, termByName, issues };
})();
