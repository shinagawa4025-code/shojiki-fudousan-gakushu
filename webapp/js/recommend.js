// 「次にやること」のおすすめ: 復習期限 > 苦手用語 > 進捗最小トピック > 激励メッセージ の優先順
// 戻り値: { title, detail, ctaLabel, nav, icon, tone }
// あわせて、暮らし・仕事の目的(学ぶ目的 learnerProfile)向けの「今日の1テーマ」の選び方もここで扱う
window.Recommend = (function () {
  // 暮らし・取引の学習で読む順(気になるテーマを選んでいれば、そのトピックを先にする)。まだないトピックは除く
  const GENERAL_ORDER = [`topicI`, `topicA`, `topicB`, `topicC`, `topicD`, `topicP`, `topicQ`, `topicG`, `topicH`, `topicE`, `topicF`];

  function topicById(id) {
    return window.AppIndex && AppIndex.topicsById ? AppIndex.topicsById[id] || null : null;
  }

  function isLearned(bp, id) {
    return !!(bp[id] && typeof bp[id] === `object` && bp[id].learned);
  }

  function basicsProgress() {
    const v = Storage.get(`basicsProgress`, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  // トピックの基礎知識の並び(小見出しの順)と学習済みの数、次に読む項目
  function topicBasics(topicId, bp) {
    const topic = topicById(topicId);
    if (!topic) return null;
    const progress = bp || basicsProgress();
    const order = ((AppIndex.topicBasicOrder && AppIndex.topicBasicOrder[topicId]) || topic.basicIds || []).filter((id) => AppIndex.termsById[id]);
    const done = order.filter((id) => isLearned(progress, id)).length;
    const nextId = order.find((id) => !isLearned(progress, id)) || null;
    return { topic, order, total: order.length, done, nextId, next: nextId ? AppIndex.termsById[nextId] : null };
  }

  // 暮らし・取引の学習の順(気になるテーマ → 既定の順)
  function generalTopicOrder(profile) {
    const first = window.Stats && Stats.interestTopicIds ? Stats.interestTopicIds(profile) : [];
    const out = [];
    first.concat(GENERAL_ORDER).forEach((id) => { if (topicById(id) && !out.includes(id)) out.push(id); });
    return out;
  }

  // 今日の1テーマ: 順に見て、まだ学習済みにしていない最初の基礎知識(exclude のトピックは飛ばす)
  // 戻り値 { topic, basicId, basic, done, total } / すべて学習済みなら null
  function nextTheme(opts) {
    opts = opts || {};
    const bp = basicsProgress();
    const order = opts.order || generalTopicOrder(opts.profile);
    const exclude = opts.exclude || [];
    for (const id of order) {
      if (exclude.includes(id)) continue;
      const b = topicBasics(id, bp);
      if (b && b.nextId) return { topic: b.topic, basicId: b.nextId, basic: b.next, done: b.done, total: b.total };
    }
    return null;
  }

  function getNext(opts) {
    opts = opts || {};

    if (!opts.skipReview) {
      const dueCount = Stats.dueReviewCount();
      if (dueCount > 0) {
        return {
          title: `今日の復習が${dueCount}件あります`,
          detail: `間隔反復学習(SRS)で復習のタイミングが来た用語があります。短時間でも続けると定着率が上がります。`,
          ctaLabel: `今日の復習をはじめる`,
          nav: `#review`,
          icon: `repeat`,
          tone: `warn`,
        };
      }
    }

    // 苦手な用語の数え方は弱点分析・クイズ画面の「苦手な用語」と同じ(Analysis.weakTermIds)。
    // 目標の試験(試験日が未登録なら学ぶ目的の試験)があれば、その試験の分野に入る用語だけを数える
    const primary = Stats.primaryTarget ? Stats.primaryTarget() : null;
    const goalTypeId = !primary && Stats.goalExamTypeId ? Stats.goalExamTypeId() : null;
    const primaryType = primary ? Stats.examType(primary.examTypeId) : goalTypeId ? Stats.examType(goalTypeId) : null;
    const examScoped = !!(primaryType && Array.isArray(primaryType.categories));
    let weakIds = window.Analysis && typeof Analysis.weakTermIds === `function` ? Analysis.weakTermIds() : [];
    if (examScoped) {
      weakIds = weakIds.filter((id) => AppIndex.termsById[id] && Stats.categoryOf(AppIndex.termsById[id], primaryType.id));
    }
    if (weakIds.length) {
      return {
        title: examScoped ? `${primaryType.shortName}の苦手な用語が${weakIds.length}語あります` : `苦手な用語が${weakIds.length}語あります`,
        detail: `自動生成クイズで間違えることが多い用語があります。優先的に解き直しましょう。`,
        ctaLabel: `苦手な用語のクイズに挑戦`,
        nav: `#quiz/auto/weak`,
        icon: `target`,
        tone: `warn`,
      };
    }

    // 暮らし・仕事の目的で気になるテーマを選んでいれば(試験の目標がないとき)、そのトピックの続きを先に案内する
    // (弱点分析は試験の分野で組み立てるため、試験の分野の案内より前に置く)
    const interests = !examScoped && Stats.interestTopicIds ? Stats.interestTopicIds() : [];

    // 弱点分析のおすすめ(回答データがあるとき)
    try {
      const s = !opts.skipAnalysis && !interests.length && window.Analysis && Analysis.summary ? Analysis.summary(examScoped ? primaryType.id : undefined) : null;
      const a = s && s.hasData ? s.topStudyAction : null;
      if (a && a.nav) return { title: a.title, detail: a.detail, ctaLabel: `はじめる`, nav: a.nav, icon: a.icon || `target`, tone: `info` };
    } catch (e) { /* 分析に失敗したら従来のおすすめにする */ }

    // 目標の試験(なければ学ぶ目的の試験)があれば、その試験の分野に含まれるトピックから選ぶ
    const type = primaryType;
    const allowed = type && Array.isArray(type.categories) ? new Set(type.categories.flatMap((c) => c.topicIds || [])) : null;
    if (!allowed) {
      const theme = interests.length ? nextTheme({ order: interests }) : null;
      if (theme) {
        return {
          title: `「${theme.topic.name}」の基礎知識を読む`,
          detail: `学習済み ${theme.done}/${theme.total}。次は「${theme.basic ? theme.basic.name : ``}」です。`,
          ctaLabel: `続きを読む`,
          nav: `#topics/${theme.topic.id}/${theme.basicId}`,
          icon: theme.topic.icon || `book-open`,
          tone: `info`,
        };
      }
    }
    const bp = basicsProgress();
    let weakestTopic = null;
    let weakestPct = 101;
    window.APP_DATA.topics.forEach((topic) => {
      if (!Array.isArray(topic.basicIds) || !topic.basicIds.length) return;
      if (allowed && allowed.size && !allowed.has(topic.id)) return;
      const done = topic.basicIds.filter((id) => isLearned(bp, id)).length;
      const pct = Math.round((done / topic.basicIds.length) * 100);
      if (pct < weakestPct) { weakestPct = pct; weakestTopic = topic; }
    });
    if (weakestTopic && weakestPct < 100) {
      return {
        title: weakestPct === 0 ? `「${weakestTopic.name}」を始めましょう` : `「${weakestTopic.name}」はあと少し(${weakestPct}%)`,
        detail: `このトピックの基礎知識をまだ学習しきれていません。次はここから進めるのがおすすめです。`,
        ctaLabel: `${weakestTopic.name}を開く`,
        nav: `#topics/${weakestTopic.id}`,
        icon: weakestTopic.icon || `book-open`,
        tone: `info`,
      };
    }

    return {
      title: `よく頑張っています`,
      detail: `復習待ちの用語も苦手な用語も特にありません。模擬試験で実力を確かめてみましょう。`,
      ctaLabel: `模擬試験に挑戦する`,
      nav: `#exam`,
      icon: `trophy`,
      tone: `ok`,
    };
  }

  return { getNext, topicBasics, generalTopicOrder, nextTheme, GENERAL_ORDER };
})();
