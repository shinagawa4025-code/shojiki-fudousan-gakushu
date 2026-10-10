// クイズエンジン: 用語からの4択自動生成と、4択形式の固定問題を同じ形の「問題オブジェクト」に揃える
// クイズ画面(js/views/quiz.js)と模擬試験(js/views/exam.js)が共通で使う
//
// 問題オブジェクト:
// { key, kind:'term'|'fixed', refId, termId, level, type, stem, choices:[{text, correct}], explanation, term }
window.QuizEngine = (function () {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 正解の用語が持つtopicIdsを基準に、関連性の高い順(同トピック×同レベル → 同トピック×他レベル →
  // トピック不問×同レベル → トピック不問×他レベル)にダミー候補を集める。必要数より多めに返し、
  // 選択肢テキストの重複を避けるためのバッファとして使う。
  function pickDistractors(allTerms, correctTerm, want) {
    const excludeId = correctTerm.id;
    const correctTopics = correctTerm.topicIds || [];
    const shareTopic = (t) => correctTopics.length > 0 && (t.topicIds || []).some((id) => correctTopics.includes(id));
    const tiers = [
      allTerms.filter((t) => t.id !== excludeId && shareTopic(t) && t.level === correctTerm.level),
      allTerms.filter((t) => t.id !== excludeId && shareTopic(t) && t.level !== correctTerm.level),
      allTerms.filter((t) => t.id !== excludeId && !shareTopic(t) && t.level === correctTerm.level),
      allTerms.filter((t) => t.id !== excludeId && !shareTopic(t) && t.level !== correctTerm.level),
    ];
    const picked = [];
    const usedIds = new Set([excludeId]);
    tiers.forEach((tier) => {
      shuffle(tier).forEach((t) => {
        if (picked.length >= want || usedIds.has(t.id)) return;
        usedIds.add(t.id);
        picked.push(t);
      });
    });
    return picked;
  }

  // ===== 根拠法令(lawRef)の読み取り =====
  // lawRef を「どの法令の、どの条(〜条の範囲)」の一覧に分解し、2つの lawRef が同じ条文を挙げているかを判定する
  // 例: 「宅地建物取引業法33条の2・37条の2〜43条、同施行規則15条の6」
  //   → 宅地建物取引業法 33条の2 / 宅地建物取引業法 37条の2〜43条(41条の2なども含む)/ 宅地建物取引業法施行規則 15条の6
  // 条番号は [条, 枝番…] の配列(37条の2 → [37, 2])で持ち、辞書順で範囲に入るかを比べる
  // 別表は表単位(別表第二の1号と13号は同じ表)、条番号のない法令名だけの参照は「その法令全体」とみなす

  // 略称 → 正式名(別の名前で同じ法令を挙げていても重なりを見つけるため)
  const LAW_ALIASES = [
    [`景品表示法`, `不当景品類及び不当表示防止法`],
    [`宅建業法`, `宅地建物取引業法`],
    [`区分所有法`, `建物の区分所有等に関する法律`],
    [`品確法`, `住宅の品質確保の促進等に関する法律`],
    [`住宅瑕疵担保履行法`, `特定住宅瑕疵担保責任の履行の確保等に関する法律`],
    [`特定商取引法`, `特定商取引に関する法律`],
    [`国土法`, `国土利用計画法`],
    [`盛土規制法`, `宅地造成及び特定盛土等規制法`],
    [`措置法`, `租税特別措置法`],
    [`ADR法`, `裁判外紛争解決手続の利用の促進に関する法律`],
  ];

  function canonicalLaw(name) {
    for (const [short, full] of LAW_ALIASES) {
      if (name.startsWith(short)) return full + name.slice(short.length);
    }
    return name;
  }

  // 「地方税法附則」「登録免許税法別表第一第一号」→ 法令の本体名(地方税法・登録免許税法)
  function lawBody(name) {
    return name.replace(/(附則|別表)[\s\S]*$/, ``);
  }

  function cmpArticle(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length; // 37条 < 37条の2
  }

  // 「、」「・」で区切った項目を順に読む。法令名のない項目(「37条」「附則11条の2」「同施行令3条」)は直前の法令を引き継ぐ
  // allowWhole: 条番号のない法令名を「法令全体」として扱うか(括弧書きの補足文では扱わない)
  function scanCitations(text, out, allowWhole) {
    let base = ``; // 直前の法令の本体(施行令・施行規則を除く)。「同法」「同施行令」の基準
    let law = ``;  // 番号だけの項目が引き継ぐ法令名
    text.split(/[、,，・]/).forEach((raw) => {
      const item = raw.trim().replace(/^第(?=\d)/, ``); // 「第3項」のような続きの項目
      if (!item) return;
      const art = item.search(/\d+条/);
      let name = /^\d/.test(item) ? ``
        : art > 0 ? item.slice(0, art)
        : /通達/.test(item) ? item.replace(/\d[\s\S]*$/, ``)
        : item;
      name = name.trim();
      if (/^[〜～第項号\s一二三四五六七八九十〇]*$/.test(name)) name = ``; // 「(6)〜(11)号」を外した残り・「第一号」等
      const named = !!name;
      if (named) {
        if (/^同/.test(name)) name = base + name.replace(/^同法?/, ``);
        else if (/^(附則|別表)/.test(name)) name = lawBody(law) + name;
        else name = canonicalLaw(name);
        law = name;
        base = lawBody(name).replace(/(施行令|施行規則)$/, ``);
      }
      if (!law) return;

      // 別表(表単位で比べる)。続く条番号は本体の条文とみなす
      const table = law.match(/別表(?:第)?([一二三四五六七八九十〇]+|\d+)/);
      if (table) {
        out.push({ law: `${lawBody(law)}別表第${table[1]}`, lo: [], hi: [] });
        law = lawBody(law);
        return;
      }

      // 条番号(「〜」でつながる2つは範囲)。通達は「6-1-1〜6-1-3」のような番号
      const isTsutatsu = art < 0 && /通達/.test(law);
      const re = isTsutatsu ? /(\d+(?:-\d+)*)/g : /(\d+)条((?:の\d+)*)/g;
      const toNum = (m) => (isTsutatsu ? m[1].split(`-`) : [m[1]].concat(m[2] ? m[2].split(`の`).slice(1) : [])).map(Number);
      let m;
      let prevEnd = -1;
      let found = false;
      while ((m = re.exec(item))) {
        const num = toNum(m);
        const last = out[out.length - 1];
        if (found && /[〜～]/.test(item.slice(prevEnd, m.index)) && last && last.law === law) last.hi = num;
        else out.push({ law, lo: num, hi: num });
        prevEnd = m.index + m[0].length;
        found = true;
      }
      if (!found && named && allowWhole) out.push({ law, whole: true });
    });
  }

  const citationCache = new Map();
  function lawCitations(ref) {
    const key = String(ref || ``);
    if (citationCache.has(key)) return citationCache.get(key);
    // 「」の中の区切り記号では分けない。括弧書き(見出し・補足)は外して、中に挙がっている条文だけ別に拾う
    let text = key.replace(/「[^」]*」/g, (s) => s.replace(/[、,，・]/g, ``));
    const notes = [];
    let prev;
    do {
      prev = text;
      text = text.replace(/[(（【]([^()（）【】]*)[)）】]/g, (s, inner) => { notes.push(inner); return ``; });
    } while (text !== prev);
    const out = [];
    scanCitations(text, out, true);
    notes.forEach((n) => scanCitations(n, out, false));
    citationCache.set(key, out);
    return out;
  }

  function citationsOverlap(x, y) {
    if (x.whole || y.whole) {
      const w = x.whole ? x : y;
      const o = x.whole ? y : x;
      return o.law.startsWith(w.law) || (!!o.whole && w.law.startsWith(o.law));
    }
    return x.law === y.law && cmpArticle(x.lo, y.hi) <= 0 && cmpArticle(y.lo, x.hi) <= 0;
  }

  // 2つの根拠法令が「同じ答え」とみなせるか(同じ条文・同じ別表・同じ法令全体を挙げている)
  function lawRefsOverlap(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const ca = lawCitations(a);
    const cb = lawCitations(b);
    if (!ca.length || !cb.length) return a.includes(b) || b.includes(a);
    return ca.some((x) => cb.some((y) => citationsOverlap(x, y)));
  }

  // 根拠法令クイズ用: 正解と重ならないlawRefを持つ他の用語からダミー候補を集める
  // (用語データは読み込み後に変わらないため、用語ごとに結果を覚えておく)
  let poolCache = { terms: null, map: new Map() };
  function lawRefPool(allTerms, correctTerm) {
    if (poolCache.terms !== allTerms) poolCache = { terms: allTerms, map: new Map() };
    const key = `${correctTerm.id}\n${correctTerm.lawRef}`;
    let pool = poolCache.map.get(key);
    if (!pool) {
      pool = allTerms.filter((t) => t.id !== correctTerm.id && t.lawRef && !lawRefsOverlap(t.lawRef, correctTerm.lawRef));
      poolCache.map.set(key, pool);
    }
    return pool;
  }
  // ダミー同士も同じ条文を挙げていないものを優先する(足りなければ、文字列が違うものを後ろに補う)
  function pickLawRefDistractors(allTerms, correctTerm, want) {
    const picked = [];
    const spare = [];
    for (const t of shuffle(lawRefPool(allTerms, correctTerm))) {
      if (picked.length >= want) break;
      if (picked.some((p) => p.lawRef === t.lawRef)) continue;
      if (picked.some((p) => lawRefsOverlap(p.lawRef, t.lawRef))) { spare.push(t); continue; }
      picked.push(t);
    }
    spare.forEach((t) => {
      if (picked.length < want && !picked.some((p) => p.lawRef === t.lawRef)) picked.push(t);
    });
    return picked;
  }

  // 上限文字数の直前(手前15文字以内)に句読点があればそこで切り、不自然な文中カットを避ける
  function truncate(text, max) {
    if (text.length <= max) return text;
    const slice = text.slice(0, max);
    const windowStart = Math.max(0, max - 15);
    let cutAt = -1;
    for (let i = slice.length - 1; i >= windowStart; i--) {
      if (slice[i] === `、` || slice[i] === `。`) { cutAt = i + 1; break; }
    }
    return (cutAt > -1 ? text.slice(0, cutAt) : slice) + `…`;
  }

  // ===== 用語名の伏せ字(答えが問題文・選択肢にそのまま書かれているのを防ぐ) =====
  // 用語名・括弧書きを除いた名前・それを「・」で区切った各部分・別名(2文字以上)。長いものから順に置き換える
  function nameVariants(term) {
    const set = new Set();
    const add = (s) => {
      const v = String(s || ``).trim();
      if (v.length >= 2) set.add(v);
    };
    const name = String(term.name || ``);
    add(name);
    const core = name.replace(/[(（][^()（）]*[)）]/g, ``).trim();
    add(core);
    core.split(/[・/／]/).forEach(add);
    (Array.isArray(term.aliases) ? term.aliases : []).forEach(add);
    return Array.from(set).sort((a, b) => b.length - a.length);
  }

  function mentionsAny(text, variants) {
    return variants.some((v) => text.includes(v));
  }

  function maskNames(text, variants) {
    return variants.reduce((s, v) => s.split(v).join(`〇〇`), String(text || ``));
  }

  // 用語の説明から自分の用語名を伏せたもの(「用語を選ぶ」の問題文・「意味を選ぶ」の選択肢)
  function maskedExplanation(term) {
    return maskNames(term.simpleExplanation, nameVariants(term));
  }

  function buildChoiceText(term, type) {
    if (type === `name-from-def`) return term.name;
    if (type === `law-ref`) return truncate(term.lawRef, 80);
    return truncate(maskedExplanation(term), 100);
  }

  // stats({termId:{wrong,correct}})がある場合、不正解が多い用語ほど先に来るよう並べ替える
  // (同程度の苦手度の中ではランダム性を保つ)
  function orderByWeakness(pool, stats) {
    const withScore = pool.map((t) => ({
      t,
      score: stats[t.id] ? (stats[t.id].wrong - stats[t.id].correct) : 0,
      rand: Math.random(),
    }));
    withScore.sort((a, b) => (b.score - a.score) || (b.rand - a.rand));
    return withScore.map((x) => x.t);
  }

  // 1つの用語から出題可能なら問題オブジェクトを、4択が揃わなければ null を返す
  function buildQuestionForTerm(term, opts) {
    opts = opts || {};
    const lawEligible = !!term.lawRef && new Set(lawRefPool(AppIndex.allTerms, term).map((t) => t.lawRef)).size >= 3;
    const typeOptions = opts.types || (lawEligible ? [`name-from-def`, `def-from-name`, `law-ref`] : [`name-from-def`, `def-from-name`]);
    const usableTypes = typeOptions.filter((t) => t !== `law-ref` || lawEligible);
    if (!usableTypes.length) return null;
    const type = usableTypes[Math.floor(Math.random() * usableTypes.length)];

    const variants = nameVariants(term);
    const stem = type === `name-from-def` ? maskNames(term.simpleExplanation, variants)
      : type === `law-ref` ? `${term.name} の根拠法令は?`
      : term.name;
    const correctText = buildChoiceText(term, type);
    const usedTexts = new Set([correctText]);
    // 根拠法令以外は関連の強い順に全用語を並べ、条件に合うものを先頭から3つ使う
    const candidates = type === `law-ref` ? pickLawRefDistractors(AppIndex.allTerms, term, 8) : pickDistractors(AppIndex.allTerms, term, AppIndex.allTerms.length);
    const distractors = [];
    for (const cand of candidates) {
      if (distractors.length >= 3) break;
      const text = buildChoiceText(cand, type);
      if (usedTexts.has(text)) continue; // 選択肢テキストの重複(切り詰め後の偶然の一致含む)を回避
      // 答えの手がかり・複数正解のもとになるダミーは使わない
      // 用語を選ぶ: 問題文(説明)にそのダミーの用語名が出てくる / 意味を選ぶ: ダミーの説明に問われている用語名が出てくる
      if (type === `name-from-def` && mentionsAny(stem, nameVariants(cand))) continue;
      if (type === `def-from-name` && mentionsAny(text, variants)) continue;
      usedTexts.add(text);
      distractors.push({ text, correct: false });
    }
    if (distractors.length < 3) return null; // 4択が揃わない用語は出題をスキップ

    const choices = shuffle([{ text: correctText, correct: true }, ...distractors]);
    return {
      key: `term:${term.id}`,
      kind: `term`,
      refId: term.id,
      termId: term.id,
      level: term.level,
      type,
      stem,
      choices,
      explanation: term.simpleExplanation,
      term,
    };
  }

  function buildQuestionsFromTerms(terms, opts) {
    return terms.map((t) => buildQuestionForTerm(t, opts)).filter(Boolean);
  }

  function generateAutoQuiz(level, topicId, count, weakStats) {
    let pool = AppIndex.allTerms.filter((t) => level === `全て` || t.level === level);
    if (topicId && topicId !== `全て`) pool = pool.filter((t) => (t.topicIds || []).includes(topicId));

    const orderedPool = weakStats ? orderByWeakness(pool, weakStats) : shuffle(pool);
    const questions = [];
    orderedPool.some((term) => {
      if (questions.length >= count) return true;
      const q = buildQuestionForTerm(term);
      if (q) questions.push(q);
      return false;
    });
    return questions;
  }

  function isMcItem(item) {
    return !!item && item.format === `mc` && Array.isArray(item.choices) && item.choices.length === 4
      && Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < 4;
  }

  // 4択形式の固定問題(data/quiz.js の format:'mc')を問題オブジェクトに変換
  function fromFixedMc(item, opts) {
    opts = opts || {};
    if (!isMcItem(item)) return null;
    const truths = statementTruths(item);
    const notes = cleanNotes(item.choiceNotes, !!truths);
    const choices = item.choices.map((text, i) => ({ text, correct: i === item.correctIndex, note: notes ? notes[i] : ``, truth: truths ? truths[i] : null }));
    return {
      key: `quiz:${item.id}`,
      kind: `fixed`,
      refId: item.id,
      termId: item.relatedTermId || null,
      level: item.level,
      type: `mc`,
      stem: item.question,
      choices: opts.keepOrder ? choices : shuffle(choices),
      explanation: item.explanation || item.answer || ``,
      term: item.relatedTermId ? AppIndex.termsById[item.relatedTermId] || null : null,
      ask: item.ask || null,
    };
  }

  // choiceNotes を表示用に整える。先頭の「○:」「× 」「正しい。」などの判定語は画面側で○×を表示するので取り除く
  // stripVerdict: 画面に○×が出る正誤判定型(ask)のときだけ判定語を取り除く(それ以外は判定語が唯一の手がかりなので残す)
  function cleanNotes(notes, stripVerdict) {
    if (!Array.isArray(notes) || notes.length !== 4) return null;
    if (!stripVerdict) return notes.map((n) => String(n || ``));
    return notes.map((n) => String(n || ``)
      .replace(/^\s*[○〇×✕]\s*[:：。、]?\s*/, ``)
      .replace(/^\s*(正しい|誤り)\s*[。:：、]\s*/, ``));
  }

  // 正誤判定型(ask: 'correct' = 正しいものを選ぶ / 'incorrect' = 誤っているものを選ぶ)の各選択肢の正誤
  function statementTruths(item) {
    if (!isMcItem(item) || (item.ask !== `correct` && item.ask !== `incorrect`)) return null;
    return item.choices.map((_, i) => (item.ask === `correct` ? i === item.correctIndex : i !== item.correctIndex));
  }

  // 4択問題の問いかけから「〜に関する記述(民法の規定によれば)」の形で前提を取り出す(○×一問一答・弱点分析で表示)
  // 「正しいもの/誤っているもの/最も適当なもの」は文の正誤の手がかりになるため含めない
  // 「どれか。」の後ろの補足(「なお、…ものとする。」)は前提として残す。形が合わなければ空文字
  function stemContext(question) {
    const q = String(question || ``).trim();
    const m = q.match(/^([\s\S]+?)次の記述のうち、?([\s\S]*?)(?:最も)?(?:正しい|誤っている|誤りである|適切な|不適切な|適当な|不適当な)もの(?:はどれか|を選べ)?(?:。|$)([\s\S]*)$/);
    if (!m) return ``;
    const head = m[1].trim();
    const qual = m[2].replace(/[、,]\s*$/, ``).trim();
    const tail = m[3].trim();
    return `${head}記述${qual ? `(${qual})` : ``}${tail ? `。${tail}` : ``}`;
  }

  // ○×一問一答用: 正誤判定型の4択問題を1文ずつの○×問題に分解する
  // 戻り値: [{ id: 'quiz-K-01#2', quizId, index, text, truth, note, context, termId, level, topicIds }]
  function statementsFrom(item) {
    const truths = statementTruths(item);
    if (!truths) return [];
    const notes = cleanNotes(item.choiceNotes, true);
    const context = stemContext(item.question);
    return item.choices.map((text, i) => ({
      id: `${item.id}#${i}`,
      quizId: item.id,
      index: i,
      text,
      truth: truths[i],
      note: notes ? notes[i] : ``,
      context,
      termId: item.relatedTermId || null,
      level: item.level,
      topicIds: item.topicIds || [],
    }));
  }

  function allStatements() {
    return (window.APP_DATA.quiz || []).flatMap(statementsFrom);
  }

  return {
    shuffle, truncate, pickDistractors, pickLawRefDistractors, buildChoiceText, orderByWeakness,
    buildQuestionForTerm, buildQuestionsFromTerms, generateAutoQuiz, isMcItem, fromFixedMc,
    statementTruths, statementsFrom, allStatements, stemContext, lawRefsOverlap, lawCitations,
    nameVariants, maskNames,
  };
})();
