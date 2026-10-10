// 「次にやること」のおすすめ: 復習期限 > 苦手用語 > 進捗最小トピック > 激励メッセージ の優先順
// 戻り値: { title, detail, ctaLabel, nav, icon, tone }
window.Recommend = (function () {
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

    const stats = Storage.get(`autoQuizStats`, {});
    const weakIds = Object.keys(stats).filter((id) => {
      const s = stats[id] || {};
      const total = (s.wrong || 0) + (s.correct || 0);
      return AppIndex.termsById[id] && total >= 3 && (s.wrong || 0) > (s.correct || 0);
    });
    if (weakIds.length) {
      return {
        title: `苦手な用語が${weakIds.length}件あります`,
        detail: `自動生成クイズで間違えることが多い用語があります。優先的に解き直しましょう。`,
        ctaLabel: `苦手な用語のクイズに挑戦`,
        nav: `#quiz/auto/weak`,
        icon: `target`,
        tone: `warn`,
      };
    }

    const basicsProgress = Storage.get(`basicsProgress`, {});
    let weakestTopic = null;
    let weakestPct = 101;
    window.APP_DATA.topics.forEach((topic) => {
      if (!topic.basicIds.length) return;
      const done = topic.basicIds.filter((id) => basicsProgress[id] && basicsProgress[id].learned).length;
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

  return { getNext };
})();
