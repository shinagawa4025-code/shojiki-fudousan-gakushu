// 追加コンテンツの登録口: data/content/*.js から ContentPack.add({...}) を呼ぶ
// 分野ごとに別ファイルへ分けることで、基礎知識・問題を並行して追加・管理できるようにしている
window.APP_DATA = window.APP_DATA || {};
window.ContentPack = (function () {
  const packs = [];

  function findItem(id) {
    const D = window.APP_DATA;
    return (D.terms || []).find((t) => t.id === id) || (D.basics || []).find((t) => t.id === id) || null;
  }

  // pack: { id, topicId, basicIds[], basics[], quiz[], sources[], episodes[], tags: { 既存の用語ID: [追加するtopicId] } }
  function add(pack) {
    const D = window.APP_DATA;
    (pack.sources || []).forEach((s) => D.sources.push(s));
    (pack.basics || []).forEach((b) => D.basics.push(b));
    (pack.quiz || []).forEach((q) => D.quiz.push(q));
    const topic = pack.topicId ? (D.topics || []).find((t) => t.id === pack.topicId) : null;
    if (pack.topicId && !topic) console.warn(`[ContentPack] ${pack.id}: トピック ${pack.topicId} がありません`);
    if (topic) {
      (pack.basicIds || []).forEach((id) => { if (!topic.basicIds.includes(id)) topic.basicIds.push(id); });
      (pack.episodes || []).forEach((id) => { if (!topic.episodes.includes(id)) topic.episodes.push(id); });
    }
    Object.keys(pack.tags || {}).forEach((id) => {
      const item = findItem(id);
      if (!item) { console.warn(`[ContentPack] ${pack.id}: タグ付け対象 ${id} がありません`); return; }
      item.topicIds = item.topicIds || [];
      pack.tags[id].forEach((tid) => { if (!item.topicIds.includes(tid)) item.topicIds.push(tid); });
    });
    packs.push({ id: pack.id, basics: (pack.basics || []).length, quiz: (pack.quiz || []).length });
  }

  // 既存の問題(data/quiz.js)をIDで上書きする(記述式→4択への作り直し、ask/choiceNotes の追加など)
  // patches: [{ id, ...上書きするフィールド }]
  function patchQuiz(packId, patches) {
    const D = window.APP_DATA;
    let applied = 0;
    (patches || []).forEach((p) => {
      const item = (D.quiz || []).find((q) => q.id === p.id);
      if (!item) { console.warn(`[ContentPack] ${packId}: 上書き対象の問題 ${p.id} がありません`); return; }
      Object.assign(item, p);
      applied += 1;
    });
    packs.push({ id: packId, basics: 0, quiz: 0, patched: applied });
  }

  return { add, patchQuiz, list: () => packs.slice() };
})();
