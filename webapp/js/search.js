// サイト全体検索: 画面/トピック/用語/基礎知識/図解/クイズ/情報源/作品で学ぶ(動画)を横断検索
// 全角・半角(NFKC)とカタカナ・ひらがなの違い、中黒・空白の有無(クーリング・オフ = クーリングオフ)、
// 送りがなと法令の漢字表記のゆれ(引き渡し = 引渡し、建ぺい率 = 建蔽率。fold)を吸収して照合する
window.GlobalSearch = (function () {
  let index = null;
  let indexKey = null;

  // 同じ順位のときの並び: 学ぶ内容(画面・トピック・基礎知識・用語) > 図解 > クイズ > 情報源
  const TYPE_ORDER = { 画面: 0, トピック: 0, 基礎知識: 0, 用語: 0, 図解: 1, クイズ: 2, 情報源: 3 };
  // 任意のコーナー(作品で学ぶ)の動画は、一致の度合いにかかわらず最後に出す
  const LAST_TYPES = new Set([`作品で学ぶ`]);

  // 画面そのものを探せるようにする(「バックアップ」で設定、「模試」で模擬試験など)
  const SCREEN_KEYWORDS = {
    home: { desc: `試験までの残り日数・今日やること`, words: [`ホーム`, `カウントダウン`, `今日やること`] },
    progress: { desc: `分野別の達成度・弱点分析・合格予測・バッジ・学習の記録`, words: [`進捗`, `弱点分析`, `苦手`, `習熟度`, `学習の記録`, `合格予測`, `予測`, `予想点`, `バッジ`, `実績`, `学習時間`] },
    plan: { desc: `試験日から逆算した今週の学習計画`, words: [`学習計画`, `計画`, `逆算`, `スケジュール`, `今週やること`] },
    topics: { desc: `テーマごとの基礎知識`, words: [`トピック`, `基礎知識`] },
    glossary: { desc: `用語カードの一覧`, words: [`用語集`, `用語カード`, `フラッシュカード`] },
    figures: { desc: `図で理解する重要論点`, words: [`図解`, `図`] },
    bookmarks: { desc: `保存した用語・問題`, words: [`ブックマーク`, `保存`, `お気に入り`] },
    works: { desc: `『正直不動産』の動画をテーマ別に紹介(任意コーナー)`, words: [`作品`, `動画`, `エピソード`, `正直不動産`, `ドラマ`, `マンガ`] },
    about: { desc: `運営者・プライバシー・免責事項・更新履歴`, words: [`このアプリについて`, `運営者`, `プライバシー`, `免責`, `更新履歴`, `お問い合わせ`, `誤り`, `報告`] },
    review: { desc: `間隔反復で用語を復習する`, words: [`復習`, `今日の復習`, `間隔反復`, `SRS`] },
    quiz: { desc: `確認問題・4択(個数・組合せの問題も)・自動生成クイズ`, words: [`クイズ`, `4択`, `確認問題`, `問題`, `個数問題`, `組合せ問題`, `個数・組合せ`] },
    ox: { desc: `○×一問一答。間違えた文だけ解き直せる`, words: [`一問一答`, `○×`, `まるばつ`, `OX`, `マルバツ`, `自信度`] },
    exam: { desc: `本番形式の模擬試験(宅建士)`, words: [`模擬試験`, `模試`, `本試験`, `過去問形式`] },
    calculators: { desc: `住宅ローン・税金・諸費用の概算`, words: [`計算機`, `ローン`, `シミュレーション`, `税金計算`] },
    sources: { desc: `公的機関の一次情報・出典`, words: [`情報源`, `出典`, `一次情報`] },
    settings: { desc: `試験日・1日の目標・今日の復習・AIに聞く・テーマ・読み上げ・バックアップ`, words: [`設定`, `バックアップ`, `エクスポート`, `インポート`, `復元`, `テーマ`, `ダークモード`, `試験日`, `目標`, `1日の目標`, `AIに聞く`, `読み上げ`, `新しい用語の数`] },
  };

  // 画面の中のカード(#progress/predict など)へ直接案内する項目。親の画面が索引にあるときだけ出す
  const SUB_SCREENS = [
    { view: `progress`, title: `合格予測`, nav: `#progress/predict`, desc: `宅建士の分野別の正答率から本試験の得点を推定(アプリ独自の目安)`, words: [`予測`, `予想点`, `合格ライン`] },
    { view: `progress`, title: `学習時間`, nav: `#progress/time`, desc: `直近7日の学習時間`, words: [`勉強時間`] },
    { view: `progress`, title: `バッジ`, nav: `#progress/badges`, desc: `学習の節目でもらえるバッジの一覧`, words: [`実績`] },
    { view: `settings`, title: `1日の目標`, nav: `#settings/goal`, desc: `ホームの「今日の学習」の目標(回数か学習時間)`, words: [`目標`, `学習の目標`, `ノルマ`] },
    { view: `settings`, title: `AIに聞く`, nav: `#settings/answer`, desc: `解説の「AIに聞く」ボタンを出すかどうか`, words: [`AI`, `ChatGPT`, `Claude`, `Gemini`] },
  ];

  // メニュー(Nav.ITEMS)に無いときに使う画面名
  const SCREEN_FALLBACK_LABELS = { works: `作品で学ぶ`, about: `このアプリについて`, plan: `学習計画` };

  function norm(s) {
    return String(s || ``)
      .normalize(`NFKC`)
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・\s　]/g, ``);
  }

  // 表記ゆれをそろえた形(norm のあとに使う。照合だけに使い、画面の表示は変えない):
  // 法令の漢字表記とかな交じりの表記(建蔽率 = 建ぺい率、斡旋 = あっせん、毀損 = き損)と、
  // 漢字にはさまれた送りがな(引き渡し = 引渡し、取り消し = 取消し、申し込み = 申込み、売り主 = 売主、差し押さえ = 差押え)
  const FOLD = [[/蔽/g, `ぺい`], [/斡旋/g, `あっせん`], [/毀/g, `き`], [/押さえ/g, `押え`]];
  const KANJI_OKURI = /([一-鿿々])[きしちりみめけえい](?=[一-鿿々])/g;
  function fold(n) {
    let s = n;
    FOLD.forEach(([re, to]) => { s = s.replace(re, to); });
    return s.replace(KANJI_OKURI, `$1`);
  }
  // 検索語の表記ゆれをそろえる。末尾の送りがなも省く(「引き渡し」「取消し」で「引渡し時期」にも当たるように。
  // 本文の「引渡し時期」は fold で「引渡時期」になるため)。1文字だけになるときは省かない
  function foldQuery(q) {
    const f = fold(q);
    const t = f.replace(/([一-鿿々])[きしちりみめけえい]$/, `$1`);
    return Array.from(t).length >= 2 ? t : f;
  }

  function entry(type, title, snippet, nav, aliases, extra) {
    const parts = [title].concat(aliases || [], [snippet, extra || ``]);
    const titleN = norm(title);
    const aliasesN = (aliases || []).map(norm);
    // 空白を除いて照合するため、項目の境目をまたいで一致しないよう区切り文字でつなぐ
    const haystack = parts.map(norm).join(`\u0001`);
    const haystackF = fold(haystack);
    const item = { type, title, snippet, nav, titleN, aliasesN, haystack };
    // 表記ゆれをそろえた形(違うときだけ持つ)
    if (haystackF !== haystack) {
      item.haystackF = haystackF;
      item.titleF = fold(titleN);
      item.aliasesF = aliasesN.map(fold);
    }
    return item;
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

  // 公開版で詳細(解説・選択肢・根拠法令・作品・情報源・図解)がまだ届いていないか。届く前は、届いている項目(名前・説明・問題文)だけで
  // 索引を作り、届いたら作り直す(仮の値「…」を索引や結果の説明に入れないように)
  function detailMissing() {
    return !!(window.AppData && typeof AppData.hasDetail === `function` && !AppData.hasDetail());
  }

  function buildIndex(primaryId) {
    const idx = [];
    const partial = detailMissing();
    const screens = new Set();
    if (window.Nav && Array.isArray(Nav.ITEMS)) {
      Nav.ITEMS.forEach((it) => {
        const k = SCREEN_KEYWORDS[it.view];
        if (!k || screens.has(it.view)) return;
        screens.add(it.view);
        idx.push(entry(`画面`, it.label, k.desc, `#${it.view}`, k.words));
      });
    }
    // メニューに項目が無い画面も探せるようにする
    Object.keys(SCREEN_FALLBACK_LABELS).forEach((view) => {
      if (screens.has(view) || !SCREEN_KEYWORDS[view]) return;
      const k = SCREEN_KEYWORDS[view];
      idx.push(entry(`画面`, SCREEN_FALLBACK_LABELS[view], k.desc, `#${view}`, k.words));
      screens.add(view);
    });
    SUB_SCREENS.forEach((s) => {
      if (screens.has(s.view)) idx.push(entry(`画面`, s.title, s.desc, s.nav, s.words));
    });
    window.APP_DATA.topics.forEach((t) => {
      idx.push(entry(`トピック`, t.name, t.description, `#topics/${t.id}`));
    });
    AppIndex.allTerms.forEach((t) => {
      const topicId = t.source === `general` ? basicTopicOf(t, primaryId) : null;
      const nav = topicId ? `#topics/${topicId}/${t.id}` : `#glossary/${t.id}`;
      idx.push(entry(t.source === `general` ? `基礎知識` : `用語`, t.name, t.simpleExplanation, nav, t.aliases, partial ? `` : t.lawRef));
    });
    const D = window.Diagrams;
    if (D && D.defs) {
      Object.keys(D.defs).forEach((id) => {
        const d = D.defs[id];
        idx.push(entry(`図解`, d.title, d.caption || d.alt || ``, `#figures/${id}`, [], d.alt));
      });
    }
    if (!partial) {
      window.APP_DATA.episodes.forEach((e) => {
        idx.push(entry(`作品で学ぶ`, `${e.displayLabel} ${e.theme}`, e.summary, `#works/${e.id}`, [], (e.terms || []).map((x) => x.term).join(` `)));
      });
    }
    window.APP_DATA.quiz.forEach((q) => {
      if (partial) idx.push(entry(`クイズ`, q.question, ``, `#quiz/q/${q.id}`, []));
      else {
        // 個数・組合せの問題は、選択肢(一つ〜四つ・記号の組)ではなく記述ア〜エに中身があるので、記述も探す対象にする
        const stmts = q.style != null && Array.isArray(q.stmts) ? q.stmts : [];
        idx.push(entry(`クイズ`, q.question, q.answer || q.explanation || ``, `#quiz/q/${q.id}`, [], (q.choices || []).concat(stmts).join(` `)));
      }
    });
    if (!partial) {
      window.APP_DATA.sources.forEach((s) => {
        idx.push(entry(`情報源`, s.orgName, s.description, `#sources`, [], s.category));
      });
    }
    return idx;
  }

  function rankIn(item, title, aliases, q) {
    // 4択の問題文は長い文なので、名前の一致としては扱わない(「抵当権に関する次の記述…」が
    // 抵当権の基礎知識より前に並ばないように)。問題文の先頭の一致は、学ぶ内容の名前の途中の一致と同じ順位、
    // 問題文の途中の一致は、学ぶ内容の説明の一致と同じ順位、選択肢・解説だけの一致はその後
    if (item.type === `クイズ`) return title.startsWith(q) ? 3 : title.includes(q) ? 4 : 5;
    if (title === q) return 0;
    if (title.startsWith(q)) return 1;
    if (aliases.some((a) => a === q || a.startsWith(q))) return 2;
    if (title.includes(q)) return 3;
    return 4;
  }

  function rankOf(item, q, qf) {
    const r = rankIn(item, item.titleN, item.aliasesN, q);
    if (r === 0 || !qf) return r;
    return Math.min(r, rankIn(item, item.titleF || item.titleN, item.aliasesF || item.aliasesN, qf));
  }

  function matches(item, q, qf) {
    return item.haystack.includes(q) || (item.haystackF || item.haystack).includes(qf);
  }

  function typeOrder(item) {
    return item.type in TYPE_ORDER ? TYPE_ORDER[item.type] : 4;
  }

  function isLast(item) {
    return LAST_TYPES.has(item.type) ? 1 : 0;
  }

  function search(query, limit) {
    // 主目標の試験が変わったら、基礎知識の案内先が変わるため索引を作り直す。公開版で詳細を取り込んだときも作り直す
    const ver = window.AppData && typeof AppData.version === `function` ? AppData.version() : 0;
    const typeId = primaryTypeId();
    const key = `${typeId}|${ver}`;
    if (!index || key !== indexKey) { index = buildIndex(typeId); indexKey = key; }
    // 詳細がまだなら読み込みを急ぐ(届いたら上の目印で作り直す)
    if (detailMissing()) AppData.whenDetail().catch(() => { /* 失敗の知らせは AppData が出す */ });
    const q = norm(String(query || ``).trim());
    if (!q) return [];
    const qf = foldQuery(q);
    return index
      .filter((item) => matches(item, q, qf))
      .map((item) => ({ item, rank: rankOf(item, q, qf) }))
      .sort((a, b) => (isLast(a.item) - isLast(b.item)) || (a.rank - b.rank) || (typeOrder(a.item) - typeOrder(b.item)) || (a.item.title.length - b.item.title.length))
      .slice(0, limit || 8)
      .map((e) => e.item);
  }

  // 図解などデータが後から増えたときに索引を作り直す
  function reset() {
    index = null;
  }

  // 公開版で詳細を取り込んだら、届く前に作った索引を捨て、手の空いたときに作り直しておく(次の検索を待たせないように)
  if (window.AppData && AppData.onDetail) {
    AppData.onDetail(() => {
      if (!index) return;
      index = null;
      setTimeout(() => { try { if (!index) search(`あ`, 1); } catch (e) { /* 検索時に作り直す */ } }, 1500);
    });
  }

  return { search, reset, norm };
})();
