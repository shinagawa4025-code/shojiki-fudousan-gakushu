// サイト全体検索: トピック/用語/基礎知識/動画/クイズ/情報源を横断検索
window.GlobalSearch = (function () {
  let index = null;

  function buildIndex() {
    const idx = [];
    window.APP_DATA.topics.forEach((t) => {
      idx.push({ type: `トピック`, title: t.name, snippet: t.description, nav: `#topics/${t.id}`,
        titleLower: t.name.toLowerCase(), aliasesLower: [],
        haystack: `${t.name} ${t.description}`.toLowerCase() });
    });
    AppIndex.allTerms.forEach((t) => {
      idx.push({ type: t.source === `general` ? `基礎知識` : `用語`, title: t.name, snippet: t.simpleExplanation, nav: `#glossary/${t.id}`,
        titleLower: t.name.toLowerCase(), aliasesLower: (t.aliases || []).map((a) => a.toLowerCase()),
        haystack: `${t.name} ${(t.aliases || []).join(` `)} ${t.simpleExplanation}`.toLowerCase() });
    });
    window.APP_DATA.episodes.forEach((e) => {
      const title = `${e.displayLabel} ${e.theme}`;
      idx.push({ type: `動画`, title, snippet: e.summary, nav: `#summary/${e.id}`,
        titleLower: title.toLowerCase(), aliasesLower: [],
        haystack: `${e.theme} ${e.summary} ${(e.terms || []).map((x) => x.term).join(` `)}`.toLowerCase() });
    });
    window.APP_DATA.quiz.forEach((q) => {
      idx.push({ type: `クイズ`, title: q.question, snippet: q.answer, nav: `#quiz`,
        titleLower: q.question.toLowerCase(), aliasesLower: [],
        haystack: `${q.question} ${q.answer}`.toLowerCase() });
    });
    window.APP_DATA.sources.forEach((s) => {
      idx.push({ type: `情報源`, title: s.orgName, snippet: s.description, nav: `#sources`,
        titleLower: s.orgName.toLowerCase(), aliasesLower: [],
        haystack: `${s.orgName} ${s.description} ${s.category}`.toLowerCase() });
    });
    return idx;
  }

  function rankOf(item, q) {
    if (item.titleLower === q) return 0;
    if (item.titleLower.startsWith(q)) return 1;
    if (item.aliasesLower.some((a) => a === q || a.startsWith(q))) return 2;
    if (item.titleLower.includes(q)) return 3;
    return 4;
  }

  function search(query, limit) {
    if (!index) index = buildIndex();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter((item) => item.haystack.includes(q))
      .map((item) => ({ item, rank: rankOf(item, q) }))
      .sort((a, b) => (a.rank - b.rank) || (a.item.title.length - b.item.title.length))
      .slice(0, limit || 8)
      .map((entry) => entry.item);
  }

  return { search };
})();
