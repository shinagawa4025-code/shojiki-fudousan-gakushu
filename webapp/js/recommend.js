// 「次にやること」のおすすめ: 復習期限 > 苦手用語 > 進捗最小トピック > 激励メッセージ の優先順
// 戻り値: { title, detail, ctaLabel, nav, icon, tone }
// あわせて、暮らし・仕事の目的(学ぶ目的 learnerProfile)向けの「今日の1テーマ」の選び方と、
// ホーム上部の「今日のメニュー(約15分)」(todayMenu)もここで扱う
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

  // 暮らし・仕事向けのホームの並び: 今日の1テーマと「続きから」(最後に開いたトピック)
  // 続きからに出すトピックは、今日の1テーマでは別のトピックにする(同じ案内を2回出さない)
  // 戻り値 { order, theme, cont }(theme は nextTheme の戻り値、cont は topicBasics の戻り値。なければ null)
  function generalPlan(profile) {
    const order = generalTopicOrder(profile);
    const lastId = Storage.get(`lastTopic`, null);
    const cont = typeof lastId === `string` && topicById(lastId) ? topicBasics(lastId) : null;
    const contShown = !!(cont && cont.nextId);
    let theme = nextTheme({ order, exclude: contShown ? [cont.topic.id] : [] });
    if (!theme && contShown) theme = nextTheme({ order: [cont.topic.id] });
    return { order, theme, cont: contShown && !(theme && theme.topic.id === cont.topic.id) ? cont : null };
  }

  // ===== 今日のメニュー(約15分) =====
  // ①今日の復習カード → ②間違えた4択の解き直し(最大10問)→ ③苦手の○×(10問)→ ④新しい基礎知識を1テーマ
  // 各手順の完了は記録から判定する(開いただけでは完了にしない):
  //   ① 期限の来た復習カードがなく、今日の新しい用語も出し終えた(Stats.dueReviewCount / newAvailableToday が 0。
  //      今日ほかの問題で間違えて「もう一度」になったカードは数えない)
  //   ② 期限の来た解き直しがない、または今日の分(最大10問)を解いた(Drill)
  //   ③ 今日○×に答えた文の数が、この手順の問題数(10。間違えたことがある文が少なければその数)以上(oxStats の last)
  //   ④ 今日、基礎知識を1つ以上「学習済み」にした(basicsProgress の learnedAt)
  // 所要時間の目安: 復習カード1枚15秒・解き直し1問40秒・○×1問12秒・基礎知識1テーマ3分(ふつうの日の合計がおよそ15分)
  // 解き直しのない日は②を出さない。読める基礎知識が残っていない(今日学習済みにしたものもない)ときは④を出さない
  // opts(ホームから渡す。省略時はここで求める): { variant: 'exam'|'general', typeId, focusId, theme, oxFallback: { nav, label, scope } }
  // 戻り値: [{ id: 'review'|'retry'|'ox'|'basic', no, title, sub, minutes, nav, done, icon, count }]
  const MENU_SEC = { card: 15, retry: 40, ox: 12, basic: 180 };
  const MENU_RETRY_MAX = 10;
  const MENU_OX = 10;

  function menuMinutes(sec) {
    return Math.max(1, Math.ceil(sec / 60));
  }

  // 試験向けの基礎知識の順: 優先して伸ばしたい分野(なければ出題数の多い分野。税理士は不動産と消費税)のトピックから
  function examTopicOrder(type, focusId) {
    const first = focusId || (type.id === `zeirishi` ? `shohi` : null);
    const cats = type.categories.map((c, i) => ({ c, i })).sort((a, b) => ((b.c.id === first) - (a.c.id === first))
      || ((Number(b.c.questions) || 0) - (Number(a.c.questions) || 0)) || (a.i - b.i)).map((x) => x.c);
    const out = [];
    cats.forEach((c) => (c.topicIds || []).forEach((id) => { if (topicById(id) && !out.includes(id)) out.push(id); }));
    return out;
  }

  function menuTheme(opts, variant, typeId) {
    if (opts.theme !== undefined) return opts.theme;
    if (variant !== `exam`) return generalPlan().theme;
    const type = typeId && window.Stats ? Stats.examType(typeId) : null;
    if (type && Array.isArray(type.categories)) {
      let focusId = opts.focusId;
      if (focusId === undefined) {
        try {
          const s = window.Analysis && typeof Analysis.summary === `function` ? Analysis.summary(typeId) : null;
          focusId = s && s.examTypeId === typeId && s.focus ? s.focus.id : null;
        } catch (e) { focusId = null; }
      }
      const t = nextTheme({ order: examTopicOrder(type, focusId) });
      if (t) return t;
    }
    return nextTheme({ order: generalTopicOrder(null) });
  }

  function topicOfBasic(id) {
    const topics = (window.APP_DATA && window.APP_DATA.topics) || [];
    return topics.find((t) => Array.isArray(t.basicIds) && t.basicIds.includes(id)) || null;
  }

  function todayMenu(opts) {
    opts = opts || {};
    const today = DateUtil.today();
    const target = Stats.primaryTarget ? Stats.primaryTarget() : null;
    const goalTypeId = Stats.goalExamTypeId ? Stats.goalExamTypeId() : null;
    const typeId = opts.typeId !== undefined ? opts.typeId : (target && Stats.examType(target.examTypeId) ? target.examTypeId : goalTypeId);
    const variant = opts.variant || (target || goalTypeId ? `exam` : `general`);
    const steps = [];

    // ① 今日の復習カード
    // 4択・○×・模擬試験で今日間違えた用語は、その場で「もう一度」(今日が期限)の復習カードになる。
    // これは①の完了の判定に数えない(①を終えたあと②③で間違えるたびに、①が未完了に戻らないように)。
    // まだ終わっていないときの枚数には含める(今日の復習の画面にはそのまま出るため)
    const allCards = Srs.getAllCards();
    const due = Stats.dueReviewCount();
    const added = Object.keys(allCards).filter((id) => {
      const c = allCards[id];
      return Storage.isPlainObject(c) && c.dueDate === today && Number(c.lastGrade) === 1 && !!AppIndex.termsById[id];
    }).length;
    const newAvail = Stats.newAvailableToday();
    const cards = Object.keys(allCards).length;
    const cardsLeft = due + newAvail;
    const reviewDone = Math.max(0, due - added) + newAvail === 0;
    const first = cards - added <= 0 && newAvail > 0;
    steps.push({
      id: `review`,
      title: first ? `最初の${newAvail}語を覚える` : `今日の復習カード`,
      sub: reviewDone ? (cardsLeft ? `今日の分は完了・間違えた用語${cardsLeft}枚が追加` : `今日の分は完了`)
        : first ? `カードをめくって意味を確認`
          : due && newAvail ? `復習${due}枚+新しい用語${newAvail}語`
            : due ? `復習${due}枚` : `新しい用語${newAvail}語をカードで`,
      minutes: reviewDone ? 0 : menuMinutes(cardsLeft * MENU_SEC.card),
      nav: `#review`,
      done: reviewDone,
      icon: `layers`,
      count: reviewDone ? 0 : cardsLeft,
    });

    // ② 間違えた4択の解き直し
    const D = window.Drill;
    const retryDue = D ? D.dueCount() : 0;
    const retryDone = D ? D.todayCount() : 0;
    const planned = Math.min(MENU_RETRY_MAX, retryDue + retryDone);
    if (planned > 0) {
      const left = Math.max(0, Math.min(retryDue, planned - retryDone));
      steps.push({
        id: `retry`,
        title: `間違えた4択の解き直し`,
        sub: left ? `${left}問・1→3→7→21日後に出し直し` : `今日の分は完了`,
        minutes: left ? menuMinutes(left * MENU_SEC.retry) : 0,
        nav: left && left < retryDue ? `#quiz/due/${left}` : `#quiz/due`,
        done: left === 0,
        icon: `repeat`,
        count: left,
      });
    }

    // ③ 苦手の○×(間違えたことがある文がなければ、ふつうの○×で腕試し)
    const quiz = (window.APP_DATA && window.APP_DATA.quiz) || [];
    if (quiz.some((q) => q && (q.ask === `correct` || q.ask === `incorrect`))) {
      const ids = new Set(quiz.map((q) => q && q.id));
      const ox = Storage.get(`oxStats`, {});
      let weak = 0;
      let answeredToday = 0;
      Object.keys(ox).forEach((sid) => {
        const v = ox[sid];
        if (!Storage.isPlainObject(v) || !ids.has(sid.split(`#`)[0])) return;
        if (Number(v.w) > 0) weak += 1;
        if (v.last === today) answeredToday += 1;
      });
      const useWeak = weak > 0;
      const n = useWeak ? Math.min(MENU_OX, weak) : MENU_OX;
      const fb = opts.oxFallback && typeof opts.oxFallback.nav === `string` ? opts.oxFallback : { nav: `#ox`, scope: `` };
      const done = answeredToday >= n;
      steps.push({
        id: `ox`,
        title: useWeak ? `苦手の○×` : `○×で腕試し`,
        sub: done ? `今日${answeredToday}問に回答` : useWeak ? `間違えたことがある文から${n}問` : `${fb.scope ? `${fb.scope}・` : ``}${n}問`,
        minutes: done ? 0 : menuMinutes(n * MENU_SEC.ox),
        nav: useWeak ? `#ox/weak/${MENU_OX}` : fb.nav,
        done,
        icon: `o-x`,
        count: n,
      });
    }

    // ④ 新しい基礎知識を1テーマ(目的・伸ばしたい分野から)
    const bp = basicsProgress();
    const learnedToday = Object.keys(bp).filter((id) => isLearned(bp, id) && bp[id].learnedAt === today && AppIndex.termsById[id]);
    let theme = null;
    try { theme = menuTheme(opts, variant, typeId); } catch (e) { theme = null; }
    if (theme || learnedToday.length) {
      const doneId = learnedToday[learnedToday.length - 1] || null;
      const doneTopic = doneId ? topicOfBasic(doneId) : null;
      const done = !!doneId;
      steps.push({
        id: `basic`,
        title: `新しい基礎知識を1テーマ`,
        sub: done ? `「${AppIndex.termsById[doneId].name}」を学習済み`
          : `${theme.topic.name}「${theme.basic ? theme.basic.name : theme.topic.name}」`,
        minutes: done ? 0 : menuMinutes(MENU_SEC.basic),
        nav: theme ? `#topics/${theme.topic.id}/${theme.basicId}` : doneTopic ? `#topics/${doneTopic.id}/${doneId}` : `#topics`,
        done,
        icon: theme && theme.topic.icon ? theme.topic.icon : `book-open`,
        count: 1,
      });
    }

    steps.forEach((s, i) => { s.no = i + 1; });
    return steps;
  }

  // 今日のメニューのまとめ: { total, done, minutes(残りの目安), allDone, next(まだの最初の手順) }
  function menuStatus(steps) {
    const list = Array.isArray(steps) ? steps : [];
    const doneN = list.filter((s) => s.done).length;
    return {
      total: list.length,
      done: doneN,
      minutes: list.reduce((m, s) => m + (s.done ? 0 : Number(s.minutes) || 0), 0),
      allDone: list.length > 0 && doneN === list.length,
      next: list.find((s) => !s.done) || null,
    };
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

  return { getNext, topicBasics, generalTopicOrder, nextTheme, generalPlan, todayMenu, menuStatus, GENERAL_ORDER };
})();
