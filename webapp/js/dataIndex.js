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
    t.aliases.forEach((alias) => { termByName[alias] = t.id; });
  });

  console.log(`[データ整合性チェック] episodes=${data.episodes.length} (期待値56), specials=${data.specials.length} (期待値7), terms=${data.terms.length} (期待値43), basics=${data.basics.length} (期待値117), topics=${data.topics.length} (期待値10), laws=${data.laws.laws.length} (期待値6), quiz=${data.quiz.length} (期待値86), sources=${data.sources.length} (期待値13)`);

  return { episodesById, topicsById, termsById, allTerms, sourcesById, episodeTermIndex, topicTermIndex, topicQuizIndex, topicLawIndex, termByName };
})();
