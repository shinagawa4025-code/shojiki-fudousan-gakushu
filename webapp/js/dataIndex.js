// 起動時に相互参照インデックスを構築
window.AppIndex = (function () {
  const data = window.APP_DATA;
  // 索引はプロトタイプを持たないオブジェクトにする(#topics/constructor のようなURLで Object の組み込みを拾わないように)
  const dict = () => Object.create(null);

  // 廃止した問題(data/content/q2_fix.js などが APP_DATA.retiredQuizIds = [問題ID, ...] で指定)は、索引を作る前に
  // APP_DATA.quiz から取り除く。クイズ・模擬試験・○×・検索・分野別の集計のどこにも出なくなる
  // (保存済みの記録(quizHistory・examHistory・ブックマーク・oxStats)に残ったIDは、各画面で存在しない問題として読み飛ばされる)
  const retiredQuizIds = new Set(Array.isArray(data.retiredQuizIds) ? data.retiredQuizIds.filter((id) => typeof id === `string`) : []);
  const retiredQuizMissing = [];
  if (retiredQuizIds.size) {
    const present = new Set(data.quiz.map((q) => q && q.id));
    retiredQuizIds.forEach((id) => { if (!present.has(id)) retiredQuizMissing.push(id); });
    const kept = data.quiz.filter((q) => !(q && retiredQuizIds.has(q.id)));
    // 他のモジュールが同じ配列を参照していても食い違わないよう、配列そのものを詰め直す
    data.quiz.length = 0;
    kept.forEach((q) => data.quiz.push(q));
  }

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

  // 用語は「用語集の用語(terms)」と「基礎知識(basics)」を統合した1つのプールとして扱う
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

  // トピックID -> [termId, ...] (用語集の用語+基礎知識、term.topicIds を単一の正として逆引きを構築)
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
  // 開発時(localhost・127.0.0.1・ファイルを直接開いたとき・URL に ?debug)と、Node で読み込む確認(tools/check.js など)だけで動かす。
  // 公開サイトでは起動を速くするため省く(公開前に CI が同じチェックを必ず通している)。索引づくり(小見出しなど)はいつも行う
  const loc = typeof location !== `undefined` && location ? location : null;
  const CHECK = !loc || !loc.hostname || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname) || /debug/.test(String(loc.search || ``));
  const issues = [];
  const reviewDue = [];

  // トピックの小見出し: topicId -> [{ name, ids }](basicIds にある項目だけ・各項目は最初の小見出しに1回だけ)
  // 小見出しのないトピックは null。どの小見出しにも入っていない項目は末尾の「その他」にまとめる
  // 項目が1つもない小見出しは出さない(執筆中のトピックは ids: [] の小見出しだけを先に置ける。全部空なら null と同じ扱い)
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
    topicSections[tp.id] = secs.length ? secs : null;
    topicBasicOrder[tp.id] = secs.flatMap((s) => s.ids);
  });
  function dupCheck(label, ids) {
    const seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) issues.push(`${label}のIDが重複: ${id}`);
      seen.add(id);
    });
  }
  if (CHECK) {
    dupCheck(`用語・基礎知識`, allTerms.map((t) => t.id));
    dupCheck(`クイズ`, data.quiz.map((q) => q.id));
    dupCheck(`トピック`, data.topics.map((t) => t.id));
    dupCheck(`情報源`, data.sources.map((s) => s.id));
    retiredQuizMissing.forEach((id) => issues.push(`retiredQuizIds: 存在しない問題 ${id}`));

    // 試験分野の明示 examCats: { 試験ID: 分野ID | null }(null は「その試験の範囲外」)。js/stats.js の categoryOf が最優先で使う
    const examTypesById = dict();
    if (data.exams && Array.isArray(data.exams.types)) data.exams.types.forEach((type) => { examTypesById[type.id] = type; });
    function checkExamCats(id, ec) {
      if (ec == null) return;
      if (typeof ec !== `object` || Array.isArray(ec)) { issues.push(`${id}: examCats は { 試験ID: 分野ID または null } の形にする`); return; }
      Object.keys(ec).forEach((typeId) => {
        const type = examTypesById[typeId];
        if (!type) { issues.push(`${id}: examCats に存在しない試験 ${typeId}`); return; }
        const cid = ec[typeId];
        if (cid === null) return;
        if (!(Array.isArray(type.categories) ? type.categories : []).some((c) => c.id === cid)) issues.push(`${id}: examCats.${typeId} に存在しない分野 ${cid}`);
      });
    }

    // 期限付きの情報(reviewBy: 'YYYY-MM-DD'。画面には出さない)は、見直しの期限を過ぎたものを開発用にコンソールへ出す
    const today = window.DateUtil && typeof DateUtil.today === `function` ? DateUtil.today() : ``;
    function checkReviewBy(item) {
      if (item.reviewBy == null) return;
      if (typeof item.reviewBy !== `string` || !(window.DateUtil ? DateUtil.isValid(item.reviewBy) : /^\d{4}-\d{2}-\d{2}$/.test(item.reviewBy))) {
        issues.push(`${item.id}: reviewBy は YYYY-MM-DD の日付にする`);
        return;
      }
      if (today && item.reviewBy < today) reviewDue.push(`${item.id}(${item.reviewBy})`);
    }

    allTerms.forEach((t) => {
      checkExamCats(t.id, t.examCats);
      checkReviewBy(t);
      if (!Array.isArray(t.aliases)) issues.push(`${t.id}: aliases が配列ではない`);
      (t.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${t.id}: 存在しないトピック ${tid}`); });
      (t.sources || []).forEach((sid) => { if (!sourcesById[sid]) issues.push(`${t.id}: 存在しない出典 ${sid}`); });
      (t.relatedEpisodes || []).forEach((eid) => { if (!episodesById[eid]) issues.push(`${t.id}: 存在しないエピソード ${eid}`); });
    });
    data.topics.forEach((tp) => {
      tp.basicIds.forEach((id) => { if (!termsById[id]) issues.push(`${tp.id}.basicIds: 存在しない ${id}`); });
      tp.episodes.forEach((id) => { if (!episodesById[id]) issues.push(`${tp.id}.episodes: 存在しない ${id}`); });
    });
    // 個数・組合せの問題(style: 'count' | 'combo')の形と答え(js/quizEngine.js の styledAnswer と同じ決まり)。
    // このファイルは問題エンジンより先に読み込まれるので、組合せの読み取りはここでも行う。
    // 公開版の本体では stmts・stmtNotes が仮の値(「…」「……」…)になるため、文の中身ではなく数・型・重複だけを見る
    // (本体だけの状態と詳細を戻した状態で、警告がまったく同じになるように。文の中身は tools/lint_quiz.js が見る)
    const STMT_LABELS = [`ア`, `イ`, `ウ`, `エ`];
    const COUNT_CHOICES = [`一つ`, `二つ`, `三つ`, `四つ`];
    const comboOf = (text) => {
      const parts = String(text == null ? `` : text).normalize(`NFKC`).trim().split(/\s*[、,・]\s*|\s*と\s*|\s+/);
      const out = [];
      for (const p of parts) {
        const i = STMT_LABELS.indexOf(p);
        if (i < 0 || out.includes(i)) return [];
        out.push(i);
      }
      return out.sort((a, b) => a - b);
    };
    const strings4 = (v) => Array.isArray(v) && v.length === 4 && v.every((s) => typeof s === `string` && !!s);
    function checkStyled(q) {
      const id = q.id;
      if (q.style !== `count` && q.style !== `combo`) { issues.push(`${id}: style は count(個数)/ combo(組合せ)のどちらか`); return; }
      const kind = q.style === `count` ? `個数問題` : `組合せ問題`;
      if (q.format !== `mc`) { issues.push(`${id}: ${kind}は format: 'mc' にする`); return; }
      let ok = true;
      const bad = (m) => { issues.push(`${id}: ${kind}の${m}`); ok = false; };
      if (q.ask !== `correct` && q.ask !== `incorrect`) bad(`ask は correct / incorrect のどちらか(必須)`);
      if (!strings4(q.stmts)) bad(`stmts(記述ア〜エ)は空でない文字列4つ`);
      else if (new Set(q.stmts).size !== 4) bad(`stmts(記述ア〜エ)に同じ文がある`);
      if (!Array.isArray(q.stmtTruths) || q.stmtTruths.length !== 4 || q.stmtTruths.some((t) => typeof t !== `boolean`)) bad(`stmtTruths は true / false を4つ`);
      if (!strings4(q.stmtNotes)) bad(`stmtNotes(記述ごとの注)は空でない文字列4つ`);
      if (q.choiceNotes != null) bad(`choiceNotes は書かない(記述ごとの注は stmtNotes に書く)`);
      if (!Array.isArray(q.choices) || q.choices.length !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) ok = false; // 上の4択の検査で知らせる
      let combos = null;
      if (Array.isArray(q.choices) && q.choices.length === 4) {
        if (q.style === `count`) {
          if (q.choices.some((c, i) => c !== COUNT_CHOICES[i])) bad(`選択肢は「${COUNT_CHOICES.join(`」「`)}」(この順)にする`);
        } else {
          combos = q.choices.map((c) => comboOf(c).join(`,`));
          if (q.choices.some((c) => comboOf(c).length !== 2)) bad(`選択肢は「ア、イ」のような2つの記号(ア〜エ)の組にする`);
          else if (new Set(combos).size !== 4) bad(`選択肢に同じ組がある`);
        }
      }
      if (!ok) return;
      // 答えの検算: 問われている側(ask が correct なら正しい記述、incorrect なら誤っている記述)
      const want = q.ask === `correct`;
      const matching = [];
      q.stmtTruths.forEach((t, i) => { if (t === want) matching.push(i); });
      const side = want ? `正しい` : `誤っている`;
      if (q.style === `count`) {
        if (!matching.length) bad(`答えが合わない(${side}記述が0個。個数は一つ〜四つ)`);
        else if (q.correctIndex !== matching.length - 1) bad(`答えが合わない(${side}記述は${matching.length}個なので correctIndex は ${matching.length - 1})`);
        return;
      }
      if (matching.length !== 2) { bad(`答えが合わない(${side}記述が${matching.length}個。組合せ問題はちょうど2つ)`); return; }
      const key = matching.join(`,`);
      const hits = combos.map((c, i) => (c === key ? i : -1)).filter((i) => i >= 0);
      const pair = matching.map((i) => STMT_LABELS[i]).join(`、`);
      if (hits.length !== 1) bad(`答えが合わない(${side}記述の組「${pair}」の選択肢が${hits.length}個)`);
      else if (q.correctIndex !== hits[0]) bad(`答えが合わない(${side}記述の組「${pair}」は選択肢${hits[0] + 1}なので correctIndex は ${hits[0]})`);
    }

    data.quiz.forEach((q) => {
      checkExamCats(q.id, q.examCats);
      checkReviewBy(q);
      if (q.relatedTermId && !termsById[q.relatedTermId]) issues.push(`${q.id}: 存在しない relatedTermId ${q.relatedTermId}`);
      (q.topicIds || []).forEach((tid) => { if (!topicsById[tid]) issues.push(`${q.id}: 存在しないトピック ${tid}`); });
      if (q.format === `mc`) {
        if (!Array.isArray(q.choices) || q.choices.length !== 4) issues.push(`${q.id}: 4択問題の選択肢が4つではない`);
        else if (new Set(q.choices).size !== 4) issues.push(`${q.id}: 選択肢に重複がある`);
        if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) issues.push(`${q.id}: correctIndex が0〜3ではない`);
        if (q.ask != null && q.ask !== `correct` && q.ask !== `incorrect`) issues.push(`${q.id}: ask は correct / incorrect のどちらか`);
        if (q.style == null && q.choiceNotes != null && (!Array.isArray(q.choiceNotes) || q.choiceNotes.length !== 4 || q.choiceNotes.some((n) => typeof n !== `string` || !n))) issues.push(`${q.id}: choiceNotes は空でない文字列4つ`);
        if (!q.explanation) issues.push(`${q.id}: 4択問題に explanation がない`);
      } else if (!q.answer) {
        issues.push(`${q.id}: 記述式なのに answer がない`);
      }
      if (q.style != null) checkStyled(q);
      else if (q.stmts != null || q.stmtTruths != null || q.stmtNotes != null) issues.push(`${q.id}: stmts・stmtTruths・stmtNotes は個数・組合せの問題(style あり)だけに書く`);
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
    const styledCount = data.quiz.filter((q) => q.style != null).length;
    // 執筆中のトピック(data/topics.js の draft: true)は0件でもよい。基礎知識が入ったら draft を外すよう知らせる
    const emptyTopics = data.topics.filter((t) => !t.basicIds.length && t.draft !== true).map((t) => t.id);
    if (emptyTopics.length) issues.push(`基礎知識が0件のトピック: ${emptyTopics.join(`, `)}`);
    data.topics.filter((t) => t.draft === true && t.basicIds.length).forEach((t) => issues.push(`${t.id}: 基礎知識が入ったので data/topics.js の draft: true(執筆中)を外す`));
    console.log(`[データ整合性チェック] episodes=${data.episodes.length} (期待値56), specials=${data.specials.length} (期待値7), terms=${data.terms.length} (期待値43), basics=${data.basics.length}, topics=${data.topics.length} (期待値19), laws=${data.laws.laws.length} (期待値6), quiz=${data.quiz.length}(うち4択${mcCount}・個数/組合せ${styledCount}・廃止${retiredQuizIds.size - retiredQuizMissing.length}), sources=${data.sources.length}, 試験種別=${examTypeCount} (期待値3), 追加パック=${packNote}, 見直し期限切れ=${reviewDue.length}件, 警告=${issues.length}件`);
    issues.forEach((msg) => console.warn(`[データ整合性チェック] ${msg}`));
    if (reviewDue.length) console.warn(`[見直し時期] reviewBy を過ぎた項目 ${reviewDue.length}件(法改正・統計の更新を確認して、内容と reviewBy を直す): ${reviewDue.join(`, `)}`);
  } // if (CHECK)

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

  return { episodesById, topicsById, termsById, allTerms, sourcesById, episodeTermIndex, topicTermIndex, topicQuizIndex, termQuizIndex, topicLawIndex, topicSections, topicBasicOrder, termByName, issues, reviewDue, retiredTermId: retired, isRetiredQuiz: (id) => retiredQuizIds.has(id) };
})();
