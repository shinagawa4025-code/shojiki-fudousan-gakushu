// サイト全体検索: トピック/用語/基礎知識/動画/クイズ/情報源を横断検索
window.GlobalSearch = (function () {
  let index = null;

  function buildIndex() {
    const idx = [];
    window.APP_DATA.topics.forEach((t) => {
      idx.push({ type: `トピック`, title: t.name, snippet: t.description, nav: `#topics/${t.id}`,
        haystack: `${t.name} ${t.description}`.toLowerCase() });
    });
    AppIndex.allTerms.forEach((t) => {
      idx.push({ type: t.source === `general` ? `基礎知識` : `用語`, title: t.name, snippet: t.simpleExplanation, nav: `#glossary/${t.id}`,
        haystack: `${t.name} ${(t.aliases || []).join(` `)} ${t.simpleExplanation}`.toLowerCase() });
    });
    window.APP_DATA.episodes.forEach((e) => {
      idx.push({ type: `動画`, title: `${e.displayLabel} ${e.theme}`, snippet: e.summary, nav: `#summary/${e.id}`,
        haystack: `${e.theme} ${e.summary} ${(e.terms || []).map((x) => x.term).join(` `)}`.toLowerCase() });
    });
    window.APP_DATA.quiz.forEach((q) => {
      idx.push({ type: `クイズ`, title: q.question, snippet: q.answer, nav: `#quiz`,
        haystack: `${q.question} ${q.answer}`.toLowerCase() });
    });
    window.APP_DATA.sources.forEach((s) => {
      idx.push({ type: `情報源`, title: s.orgName, snippet: s.description, nav: `#sources`,
        haystack: `${s.orgName} ${s.description} ${s.category}`.toLowerCase() });
    });
    return idx;
  }

  function search(query, limit) {
    if (!index) index = buildIndex();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((item) => item.haystack.includes(q)).slice(0, limit || 8);
  }

  return { search };
})();
