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

  // 根拠法令クイズ用: 自分と異なるlawRefを持つ他の用語からダミー候補を集める
  function pickLawRefDistractors(allTerms, correctTerm, want) {
    const pool = allTerms.filter((t) => t.id !== correctTerm.id && t.lawRef && t.lawRef !== correctTerm.lawRef);
    return shuffle(pool).slice(0, want);
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

  function buildChoiceText(term, type) {
    if (type === `name-from-def`) return term.name;
    if (type === `law-ref`) return truncate(term.lawRef, 80);
    return truncate(term.simpleExplanation, 100);
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
    const lawEligible = !!term.lawRef && AppIndex.allTerms.filter((t) => t.id !== term.id && t.lawRef && t.lawRef !== term.lawRef).length >= 3;
    const typeOptions = opts.types || (lawEligible ? [`name-from-def`, `def-from-name`, `law-ref`] : [`name-from-def`, `def-from-name`]);
    const usableTypes = typeOptions.filter((t) => t !== `law-ref` || lawEligible);
    if (!usableTypes.length) return null;
    const type = usableTypes[Math.floor(Math.random() * usableTypes.length)];

    const correctText = buildChoiceText(term, type);
    const usedTexts = new Set([correctText]);
    const candidates = type === `law-ref` ? pickLawRefDistractors(AppIndex.allTerms, term, 8) : pickDistractors(AppIndex.allTerms, term, 8);
    const distractors = [];
    candidates.forEach((cand) => {
      if (distractors.length >= 3) return;
      const text = buildChoiceText(cand, type);
      if (usedTexts.has(text)) return; // 選択肢テキストの重複(切り詰め後の偶然の一致含む)を回避
      usedTexts.add(text);
      distractors.push({ text, correct: false });
    });
    if (distractors.length < 3) return null; // 4択が揃わない用語は出題をスキップ

    const choices = shuffle([{ text: correctText, correct: true }, ...distractors]);
    const stem = type === `name-from-def` ? term.simpleExplanation
      : type === `law-ref` ? `${term.name} の根拠法令は?`
      : term.name;
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
    const choices = item.choices.map((text, i) => ({ text, correct: i === item.correctIndex }));
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
    };
  }

  return {
    shuffle, truncate, pickDistractors, pickLawRefDistractors, buildChoiceText, orderByWeakness,
    buildQuestionForTerm, buildQuestionsFromTerms, generateAutoQuiz, isMcItem, fromFixedMc,
  };
})();
