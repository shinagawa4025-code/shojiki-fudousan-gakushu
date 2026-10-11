// サイト全体検索: 画面/トピック/用語/基礎知識/図解/動画/クイズ/情報源を横断検索
// 全角・半角(NFKC)とカタカナ・ひらがなの違い、中黒・空白の有無(クーリング・オフ = クーリングオフ)を吸収して照合する
window.GlobalSearch = (function () {
  let index = null;
  let indexKey = null;

  // 同じ順位のときの並び: 学ぶ内容(画面・トピック・基礎知識・用語) > 図解 > クイズ > 動画・情報源
  const TYPE_ORDER = { 画面: 0, トピック: 0, 基礎知識: 0, 用語: 0, 図解: 1, クイズ: 2, 動画: 3, 情報源: 3 };

  // 画面そのものを探せるようにする(「バックアップ」で設定、「模試」で模擬試験など)
  const SCREEN_KEYWORDS = {
    home: { desc: `試験までの残り日数・今日やること`, words: [`ホーム`, `カウントダウン`, `今日やること`] },
    progress: { desc: `分野別の達成度・弱点分析・学習の記録`, words: [`進捗`, `弱点分析`, `苦手`, `習熟度`, `学習の記録`] },
    topics: { desc: `テーマごとの基礎知識`, words: [`トピック`, `基礎知識`] },
    glossary: { desc: `用語カードの一覧`, words: [`用語集`, `用語カード`, `フラッシュカード`] },
    figures: { desc: `図で理解する重要論点`, words: [`図解`, `図`] },
    bookmarks: { desc: `保存した用語・問題`, words: [`ブックマーク`, `保存`, `お気に入り`] },
    summary: { desc: `「正直不動産」のエピソード一覧`, words: [`動画`, `エピソード`, `正直不動産`] },
    review: { desc: `間隔反復で用語を復習する`, words: [`復習`, `今日の復習`, `間隔反復`, `SRS`] },
    quiz: { desc: `確認問題・4択・自動生成クイズ`, words: [`クイズ`, `4択`, `確認問題`, `問題`] },
    ox: { desc: `1問数秒の○×問題。間違えた文だけ解き直せる`, words: [`一問一答`, `○×`, `まるばつ`, `OX`, `マルバツ`] },
    exam: { desc: `本番形式の模擬試験(宅建士)`, words: [`模擬試験`, `模試`, `本試験`, `過去問形式`] },
    calculators: { desc: `住宅ローン・税金・諸費用の概算`, words: [`計算機`, `ローン`, `シミュレーション`, `税金計算`] },
    sources: { desc: `公的機関の一次情報・出典`, words: [`情報源`, `出典`, `一次情報`] },
    settings: { desc: `試験日・今日の復習・テーマ・読み上げ・バックアップ`, words: [`設定`, `バックアップ`, `エクスポート`, `インポート`, `復元`, `テーマ`, `ダークモード`, `試験日`, `目標`, `読み上げ`, `新しい用語の数`] },
  };

  function norm(s) {
    return String(s || ``)
      .normalize(`NFKC`)
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・\s　]/g, ``);
  }

  function entry(type, title, snippet, nav, aliases, extra) {
    const parts = [title].concat(aliases || [], [snippet, extra || ``]);
    return {
      type, title, snippet, nav,
      titleN: norm(title),
      aliasesN: (aliases || []).map(norm),
      // 空白を除いて照合するため、項目の境目をまたいで一致しないよう区切り文字でつなぐ
      haystack: parts.map(norm).join(`\u0001`),
    };
  }

  // 試験の分野(Stats)が分かる環境なら使う
  function primaryTypeId() {
    try {
      const p = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
      const type = p ? Stats.examType(p.examTypeId) : null;
      return type && Array.isArray(type.categories) ? type.id : null;
    } catch (e) { return null; }
  }

  function topicHas(topic, termId) {
    if (Array.isArray(topic.basicIds) && topic.basicIds.includes(termId)) return true;
    // トピックを見出しごとに分けている場合(sections: [{ name, ids }])も対象にする
    return Array.isArray(topic.sections) && topic.sections.some((s) => s && Array.isArray(s.ids) && s.ids.includes(termId));
  }

  // 複数トピックに入っている基礎知識は、より試験に近い・具体的なトピックへ案内する
  // ①主目標の試験でその項目が属する分野のトピック ②宅建士・税理士の分野で個別指定(termIds)されたトピック
  // ③試験向けトピック(具体的なものから) ④データの先頭
  const EXAM_TOPIC_RANK = [`topicO`, `topicN`, `topicL`, `topicK`, `topicJ`, `topicH`];
  function basicTopicOf(term, primaryId) {
    const cands = window.APP_DATA.topics.filter((t) => topicHas(t, term.id));
    if (cands.length <= 1) return cands.length ? cands[0].id : null;
    const pickFrom = (topicIds) => (topicIds || []).find((id) => cands.some((c) => c.id === id)) || null;
    if (primaryId && window.Stats) {
      const cat = Stats.categoryOf(term, primaryId);
      const hit = cat ? pickFrom(cat.topicIds) : null;
      if (hit) return hit;
    }
    const types = (window.APP_DATA.exams && Array.isArray(window.APP_DATA.exams.types)) ? window.APP_DATA.exams.types : [];
    const order = [primaryId, `takken`, `zeirishi`].filter((id, i, a) => id && a.indexOf(id) === i);
    for (const typeId of order) {
      const type = types.find((t) => t.id === typeId);
      const cat = type && Array.isArray(type.categories) ? type.categories.find((c) => (c.termIds || []).includes(term.id)) : null;
      const hit = cat ? pickFrom(cat.topicIds) : null;
      if (hit) return hit;
    }
    return pickFrom(EXAM_TOPIC_RANK) || cands[0].id;
  }

  function buildIndex(primaryId) {
    const idx = [];
    if (window.Nav && Array.isArray(Nav.ITEMS)) {
      Nav.ITEMS.forEach((it) => {
        const k = SCREEN_KEYWORDS[it.view];
        if (!k) return;
        idx.push(entry(`画面`, it.label, k.desc, `#${it.view}`, k.words));
      });
    }
    window.APP_DATA.topics.forEach((t) => {
      idx.push(entry(`トピック`, t.name, t.description, `#topics/${t.id}`));
    });
    AppIndex.allTerms.forEach((t) => {
      const topicId = t.source === `general` ? basicTopicOf(t, primaryId) : null;
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

  function typeOrder(item) {
    return item.type in TYPE_ORDER ? TYPE_ORDER[item.type] : 4;
  }

  function search(query, limit) {
    // 主目標の試験が変わったら、基礎知識の案内先が変わるため索引を作り直す
    const key = primaryTypeId();
    if (!index || key !== indexKey) { index = buildIndex(key); indexKey = key; }
    const q = norm(String(query || ``).trim());
    if (!q) return [];
    return index
      .filter((item) => item.haystack.includes(q))
      .map((item) => ({ item, rank: rankOf(item, q) }))
      .sort((a, b) => (a.rank - b.rank) || (typeOrder(a.item) - typeOrder(b.item)) || (a.item.title.length - b.item.title.length))
      .slice(0, limit || 8)
      .map((e) => e.item);
  }

  // 図解などデータが後から増えたときに索引を作り直す
  function reset() {
    index = null;
  }

  return { search, reset, norm };
})();
