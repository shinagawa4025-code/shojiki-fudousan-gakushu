// 「次にやること」のおすすめ: 復習期限 > 苦手用語 > 進捗最小トピック > 激励メッセージ の優先順
window.Recommend = (function () {
  function getNext() {
    const dueCount = Srs.getDueTermIds(AppIndex.allTerms.map((t) => t.id)).length;
    if (dueCount > 0) {
      return {
        title: `今日の復習が${dueCount}件あります`,
        detail: `間隔反復学習(SRS)で復習のタイミングが来た用語があります。短時間でも続けると定着率が上がります。`,
        ctaLabel: `今日の復習をはじめる`,
        nav: `#review`,
      };
    }

    const stats = Storage.get(`autoQuizStats`, {});
    const weakIds = Object.keys(stats).filter((id) => {
      const s = stats[id];
      const total = (s.wrong || 0) + (s.correct || 0);
      return total >= 3 && (s.wrong || 0) > (s.correct || 0);
    });
    if (weakIds.length) {
      return {
        title: `苦手な用語が${weakIds.length}件あります`,
        detail: `自動生成クイズで間違えることが多い用語があります。優先的に復習しましょう。`,
        ctaLabel: `苦手な用語のクイズに挑戦`,
        nav: `#quiz/auto/weak`,
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
        title: `「${weakestTopic.name}」がまだ${weakestPct}%です`,
        detail: `このトピックの基礎知識をまだあまり学習していません。次はここから始めてみましょう。`,
        ctaLabel: `${weakestTopic.name}を開く`,
        nav: `#topics/${weakestTopic.id}`,
      };
    }

    return {
      title: `よく頑張っています`,
      detail: `現在、復習待ちの用語も苦手な用語も特にありません。新しいトピックを探索するか、クイズで知識を確認してみましょう。`,
      ctaLabel: `クイズに挑戦する`,
      nav: `#quiz`,
    };
  }

  return { getNext };
})();
