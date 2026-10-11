// 起動時に相互参照インデックスを構築
window.AppIndex = (function () {
  const data = window.APP_DATA;
  // 索引はプロトタイプを持たないオブジェクトにする(#topics/constructor のようなURLで Object の組み込みを拾わないように)
  const dict = () => Object.create(null);

  // 統合・削除した用語ID → 引き継ぎ先(データ中の参照と保存済みの学習記録を読み替える)
  const RETIRED_TERMS = { basicI12: `basicA19` };
  const retired = (id) => (Object.prototype.hasOwnProperty.call(RETIRED_TERMS, id) ? RETIRED_TERMS[id] : id);
  const remapList = (list) => {
    if (!Array.isArray(list)) return list;
    const out = [];
    list.forEach((id) => { const r = retired(id); if (!out.includes(r)) out.push(r); });
    return out;
  };
  data.quiz.forEach((q) => { if (q.relatedTermId) q.relatedTermId = retired(q.relatedTermId); });
  data.topics.forEach((tp) => {
    tp.basicIds = remapList(tp.basicIds) || [];
    (tp.sections || []).forEach((s) => { s.ids = remapList(s.ids) || []; });
  });
  if (data.exams && Array.isArray(data.exams.types)) {
    data.exams.types.forEach((type) => (type.categories || []).forEach((c) => { if (c.termIds) c.termIds = remapList(c.termIds); }));
  }

  const episodesById = dict();
  data.episodes.forEach((ep) => { episodesById[ep.id] = ep; });

  const topicsById = dict();
  data.topics.forEach((tp) => { topicsById[tp.id] = tp; });

  const sourcesById = dict();
  data.sources.forEach((src) => { sourcesById[src.id] = src; });

  // 用語は「作中用語(terms)」と「基礎知識(basics)」を統合した1つのプールとして扱う
  const allTerms = [...data.terms, ...data.basics];
  const termsById = dict();
  allTerms.forEach((t) => { termsById[t.id] = t; });

  // トピックの基礎知識チェックリストに載せた項目は、そのトピックの用語としても扱う(用語集の絞り込み・進捗の母数をそろえる)
  data.topics.forEach((tp) => {
    tp.basicIds.forEach((id) => {
      const t = termsById[id];
      if (!t) return;
      if (!Array.isArray(t.topicIds)) t.topicIds = [];
      if (!t.topicIds.includes(tp.id)) t.topicIds.push(tp.id);
    });
  });

  // エピソードID -> [termId, ...] (terms/basics の relatedEpisodes を単一の正として逆引きを構築)
  const episodeTermIndex = dict();
  allTerms.forEach((t) => {
    (t.relatedEpisodes || []).forEach((epId) => {
      if (!episodeTermIndex[epId]) episodeTermIndex[epId] = [];
      episodeTermIndex[epId].push(t.id);
    });
  });

  // トピックID -> [termId, ...] (作中用語+基礎知識、term.topicIds を単一の正として逆引きを構築)
  const topicTermIndex = dict();
  allTerms.forEach((t) => {
    (t.topicIds || []).forEach((topicId) => {
      if (!topicTermIndex[topicId]) topicTermIndex[topicId] = [];
      topicTermIndex[topicId].push(t.id);
    });
  });

  // トピックID -> [quizId, ...]
  const topicQuizIndex = dict();
  // 用語ID -> [quizId, ...] (その用語を確認する問題。基礎知識の「確認問題」ボタン用)
  const termQuizIndex = dict();
  data.quiz.forEach((q) => {
    (q.topicIds || []).forEach((topicId) => {
      if (!topicQuizIndex[topicId]) topicQuizIndex[topicId] = [];
      topicQuizIndex[topicId].push(q.id);
    });
    if (q.relatedTermId) (termQuizIndex[q.relatedTermId] = termQuizIndex[q.relatedTermId] || []).push(q.id);
  });

  // トピックID -> [lawId, ...]
  const topicLawIndex = dict();
  data.laws.laws.forEach((law) => {
    (law.topicIds || []).forEach((topicId) => {
      if (!topicLawIndex[topicId]) topicLawIndex[topicId] = [];
      topicLawIndex[topicId].push(law.id);
    });
  });

  // 用語名/エイリアス -> termId (要約ビューでの本文ハイライト用)
  const termByName = dict();
  allTerms.forEach((t) => {
    termByName[t.name] = t.id;
    (t.aliases || []).forEach((alias) => { termByName[alias] = t.id; });
  });

  // ---- データ整合性チェック(問題があれば console.warn で列挙) ----
  const issues = [];

  // トピックの小見出し: topicId -> [{ name, ids }](basicIds にある項目だけ・各項目は最初の小見出しに1回だけ)
  // 小見出しのないトピックは null。どの小見出しにも入っていない項目は末尾の「その他」にまとめる
  const topicSections = dict();
  // トピックID -> 基礎知識の表示順(小見出し順。なければ basicIds の順)
  const topicBasicOrder = dict();
  data.topics.forEach((tp) => {
    if (!Array.isArray(tp.sections) || !tp.sections.length) {
      topicSections[tp.id] = null;
      topicBasicOrder[tp.id] = tp.basicIds.slice();
      return;
    }
    const used = new Set();
    const secs = [];
    tp.sections.forEach((s) => {
      const ids = [];
      (Array.isArray(s.ids) ? s.ids : []).forEach((id) => {
        if (!tp.basicIds.includes(id)) { issues.push(`${tp.id}.sections「${s.name}」: basicIds にない ${id}`); return; }
        if (used.has(id)) return;
        used.add(id);
        ids.push(id);
      });
      if (ids.length) secs.push({ name: String(s.name || ``), ids });
    });
    const rest = tp.basicIds.filter((id) => !used.has(id));
    if (rest.length) {
      issues.push(`${tp.id}: どの小見出しにも入っていない基礎知識 ${rest.join(`, `)}`);
      secs.push({ name: `その他`, ids: rest });
    }
    topicSections[tp.id] = secs;
    topicBasicOrder[tp.id] = secs.flatMap((s) => s.ids);
  });
  function dupCheck(label, ids) {
    const seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) issues.push(`${label}のIDが重複: ${id}`);
      seen.add(id);
    });
  }
  dupCheck(`用語・基礎知識`, allTerms.map((t) => t.id));
  dupCheck(`クイズ`, data.quiz.map((q) => q.id));
  dupCheck(`トピック`, data.topics.map((t) => t.id));
  dupCheck(`情報源`, data.sources.map((s) => s.id));

  allTerms.forEach((t) => {
    if (!Array.isArray(t.aliases)) issues.push(`${t.id}: aliases が配列ではない`);
    (t.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${t.id}: 存在しないトピック ${tid}`); });
    (t.sources || []).forEach((sid) => { if (!sourcesById[sid]) issues.push(`${t.id}: 存在しない出典 ${sid}`); });
    (t.relatedEpisodes || []).forEach((eid) => { if (!episodesById[eid]) issues.push(`${t.id}: 存在しないエピソード ${eid}`); });
  });
  data.topics.forEach((tp) => {
    tp.basicIds.forEach((id) => { if (!termsById[id]) issues.push(`${tp.id}.basicIds: 存在しない ${id}`); });
    tp.episodes.forEach((id) => { if (!episodesById[id]) issues.push(`${tp.id}.episodes: 存在しない ${id}`); });
  });
  data.quiz.forEach((q) => {
    if (q.relatedTermId && !termsById[q.relatedTermId]) issues.push(`${q.id}: 存在しない relatedTermId ${q.relatedTermId}`);
    (q.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${q.id}: 存在しないトピック ${tid}`); });
    if (q.format === `mc`) {
      if (!Array.isArray(q.choices) || q.choices.length !== 4) issues.push(`${q.id}: 4択問題の選択肢が4つではない`);
      else if (new Set(q.choices).size !== 4) issues.push(`${q.id}: 選択肢に重複がある`);
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) issues.push(`${q.id}: correctIndex が0〜3ではない`);
      if (q.ask != null && q.ask !== `correct` && q.ask !== `incorrect`) issues.push(`${q.id}: ask は correct / incorrect のどちらか`);
      if (q.choiceNotes != null && (!Array.isArray(q.choiceNotes) || q.choiceNotes.length !== 4 || q.choiceNotes.some((n) => typeof n !== `string` || !n))) issues.push(`${q.id}: choiceNotes は空でない文字列4つ`);
      if (!q.explanation) issues.push(`${q.id}: 4択問題に explanation がない`);
    } else if (!q.answer) {
      issues.push(`${q.id}: 記述式なのに answer がない`);
    }
  });
  data.laws.laws.forEach((law) => {
    (law.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${law.id}: 存在しないトピック ${tid}`); });
  });
  if (data.exams && Array.isArray(data.exams.types)) {
    data.exams.types.forEach((type) => {
      (type.categories || []).forEach((c) => {
        (c.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`試験${type.id}.${c.id}: 存在しないトピック ${tid}`); });
        (c.termIds || []).forEach((id) => { if (!termsById[id]) issues.push(`試験${type.id}.${c.id}: 存在しない用語 ${id}`); });
      });
    });
  }

  const examTypeCount = data.exams && Array.isArray(data.exams.types) ? data.exams.types.length : 0;
  const packs = window.ContentPack ? ContentPack.list() : [];
  const packNote = packs.map((p) => p.patched != null ? `${p.id}(上書き${p.patched})` : `${p.id}(基礎${p.basics}・問題${p.quiz})`).join(` `) || `なし`;
  const mcCount = data.quiz.filter((q) => q.format === `mc`).length;
  const emptyTopics = data.topics.filter((t) => !t.basicIds.length).map((t) => t.id);
  if (emptyTopics.length) issues.push(`基礎知識が0件のトピック: ${emptyTopics.join(`, `)}`);
  console.log(`[データ整合性チェック] episodes=${data.episodes.length} (期待値56), specials=${data.specials.length} (期待値7), terms=${data.terms.length} (期待値43), basics=${data.basics.length}, topics=${data.topics.length} (期待値14), laws=${data.laws.laws.length} (期待値6), quiz=${data.quiz.length}(うち4択${mcCount}), sources=${data.sources.length}, 試験種別=${examTypeCount} (期待値3), 追加パック=${packNote}, 警告=${issues.length}件`);
  issues.forEach((msg) => console.warn(`[データ整合性チェック] ${msg}`));

  // 統合した用語IDの学習記録(★・学習済み・復習カード・自動クイズの成績・ブックマーク)を引き継ぎ先へ移す
  // (読み込んだバックアップに古いIDが入っていた場合も、次回の起動時に移る)
  function migrateRetiredTerms() {
    if (!window.Storage || typeof Storage.get !== `function`) return;
    const isObj = (v) => !!v && typeof v === `object` && !Array.isArray(v);
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
    Object.keys(RETIRED_TERMS).forEach((oldId) => {
      const newId = RETIRED_TERMS[oldId];
      if (!termsById[newId]) return;
      const fix = (key, merge) => {
        const all = Storage.get(key, {});
        if (!isObj(all) || !Object.prototype.hasOwnProperty.call(all, oldId)) return;
        const hasNew = Object.prototype.hasOwnProperty.call(all, newId);
        all[newId] = hasNew ? merge(all[newId], all[oldId]) : all[oldId];
        delete all[oldId];
        Storage.set(key, all);
      };
      fix(`flashcards`, (a, b) => !!(a || b));
      fix(`basicsProgress`, (a, b) => (isObj(a) && a.learned ? a : (isObj(b) && b.learned ? b : a)));
      // 両方にカードがあれば、復習の進んでいる方(連続正解の多い方)を残す
      fix(`srsCards`, (a, b) => (isObj(a) && isObj(b) ? (num(b.reps) > num(a.reps) ? b : a) : (isObj(a) ? a : b)));
      fix(`autoQuizStats`, (a, b) => (isObj(a) && isObj(b) ? Object.assign({}, a, { correct: num(a.correct) + num(b.correct), wrong: num(a.wrong) + num(b.wrong) }) : (isObj(a) ? a : b)));
      const bm = Storage.get(`bookmarks`, {});
      const oldKey = `term:${oldId}`;
      const newKey = `term:${newId}`;
      if (isObj(bm) && Object.prototype.hasOwnProperty.call(bm, oldKey)) {
        if (!bm[newKey]) bm[newKey] = bm[oldKey];
        delete bm[oldKey];
        Storage.set(`bookmarks`, bm);
      }
    });
  }
  try { migrateRetiredTerms(); } catch (e) { /* 移行に失敗しても表示には影響しない(古いIDは各画面で無視される) */ }

  return { episodesById, topicsById, termsById, allTerms, sourcesById, episodeTermIndex, topicTermIndex, topicQuizIndex, termQuizIndex, topicLawIndex, topicSections, topicBasicOrder, termByName, issues, retiredTermId: retired };
})();
