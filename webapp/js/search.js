// サイト全体検索: トピック/用語/基礎知識/図解/動画/クイズ/情報源を横断検索
// 全角・半角(NFKC)とカタカナ・ひらがなの違いを吸収して照合する
window.GlobalSearch = (function () {
  let index = null;

  function norm(s) {
    return String(s || ``)
      .normalize(`NFKC`)
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function entry(type, title, snippet, nav, aliases, extra) {
    return {
      type, title, snippet, nav,
      titleN: norm(title),
      aliasesN: (aliases || []).map(norm),
      haystack: norm(`${title} ${(aliases || []).join(` `)} ${snippet} ${extra || ``}`),
    };
  }

  // 基礎知識はトピックの基礎知識チェックリスト(図解・学習済みチェック付き)へ直接飛ばす
  function basicTopicOf(termId) {
    const topic = window.APP_DATA.topics.find((t) => t.basicIds.includes(termId));
    return topic ? topic.id : null;
  }

  function buildIndex() {
    const idx = [];
    window.APP_DATA.topics.forEach((t) => {
      idx.push(entry(`トピック`, t.name, t.description, `#topics/${t.id}`));
    });
    AppIndex.allTerms.forEach((t) => {
      const topicId = t.source === `general` ? basicTopicOf(t.id) : null;
      const nav = topicId ? `#topics/${topicId}/${t.id}` : `#glossary/${t.id}`;
      idx.push(entry(t.source === `general` ? `基礎知識` : `用語`, t.name, t.simpleExplanation, nav, t.aliases, t.lawRef));
    });
    const D = window.Diagrams;
    if (D && D.defs) {
      Object.keys(D.defs).forEach((id) => {
        const d = D.defs[id];
        idx.push(entry(`図解`, d.title, d.caption || d.alt || ``, `#figures/${id}`, [], d.alt));
      });
    }
    window.APP_DATA.episodes.forEach((e) => {
      idx.push(entry(`動画`, `${e.displayLabel} ${e.theme}`, e.summary, `#summary/${e.id}`, [], (e.terms || []).map((x) => x.term).join(` `)));
    });
    window.APP_DATA.quiz.forEach((q) => {
      idx.push(entry(`クイズ`, q.question, q.answer || q.explanation || ``, `#quiz/q/${q.id}`, [], (q.choices || []).join(` `)));
    });
    window.APP_DATA.sources.forEach((s) => {
      idx.push(entry(`情報源`, s.orgName, s.description, `#sources`, [], s.category));
    });
    return idx;
  }

  function rankOf(item, q) {
    if (item.titleN === q) return 0;
    if (item.titleN.startsWith(q)) return 1;
    if (item.aliasesN.some((a) => a === q || a.startsWith(q))) return 2;
    if (item.titleN.includes(q)) return 3;
    return 4;
  }

  function search(query, limit) {
    if (!index) index = buildIndex();
    const q = norm(query.trim());
    if (!q) return [];
    return index
      .filter((item) => item.haystack.includes(q))
      .map((item) => ({ item, rank: rankOf(item, q) }))
      .sort((a, b) => (a.rank - b.rank) || (a.item.title.length - b.item.title.length))
      .slice(0, limit || 8)
      .map((e) => e.item);
  }

  // 図解などデータが後から増えたときに索引を作り直す
  function reset() {
    index = null;
  }

  return { search, reset, norm };
})();
