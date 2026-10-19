// 試験日からの逆算計画(v12): 目標の試験日までの残り日数から段階を決め、今週やることを分野の配点と習熟度で配分する
// 保存: Storage `planPrefs`(今は使っていない。表示の設定を足すときに使う)
// 本体(ホーム)から使うので軽く: 弱点分析の結果(opts.snap = Analysis.analyze の戻り値)は渡されたものを使い、ここでは集計し直さない
//
// ■ 状態(state): 主目標(Stats.primaryTarget = ★の試験。終わっていれば次の試験)で決める
//   none = 目標なし / before = 試験日の前 / today = 試験日 / after = 試験日が過ぎて、次の目標がない
// ■ 段階(残り日数): 121日以上 基礎固め / 120〜46日 演習 / 45〜15日 実戦(週1回の模擬試験) / 14〜1日 直前(解き直し・弱点) / 0日 当日
//   試験日の180日前より後に登録した目標は、登録した日から試験日までの日数(runway)に合わせて、演習・実戦の境目を同じ割合で縮める。
//   直前(14日)は縮めない(ホームの「直前期」の案内と合わせる。14日以内に登録したら直前から始まる)
//   (例: 90日前に登録 → 62日・28日・14日が境目 / 30日前 → 24日・17日・14日)
// ■ 1週間の時間 = 1日の目標(分)× 7(目標が「回数」のときは 1回 ≈ 1分として換算)。試験日まで7日を切ったら残りの日数分
// ■ 分野の配分: w = 配点の割合 ×(1.5 − 習熟度 ÷ 100)。習熟度は弱点分析の分野別の値(渡されなければ 50 とみなす)
//   税理士(消費税法)など出題数のない試験は、分野を同じ割合にする
// ■ 作業の時間の目安: 4択 90秒・○× 12秒・基礎知識 180秒・解き直し 40秒・復習カード 15秒
window.Plan = (function () {
  const PHASES = [
    { id: `basics`, name: `基礎固め`, desc: `基礎知識を読み、○×で確かめながら範囲をひととおり学ぶ時期です。`, icon: `book-open` },
    { id: `practice`, name: `演習`, desc: `4択を中心に問題を解き、間違えた問題を解き直す時期です。`, icon: `pencil-check` },
    { id: `mock`, name: `実戦`, desc: `週1回の模擬試験で時間配分を確かめ、弱い分野を4択で補う時期です。`, icon: `timer` },
    { id: `final`, name: `直前`, desc: `新しい範囲より、解き直しと弱点の確認を優先する時期です。`, icon: `flag` },
    { id: `day`, name: `当日`, desc: `試験日です。落ち着いて、がんばってください。`, icon: `target` },
  ];
  // 段階が始まる残り日数(この日数以下になったら次の段階)
  const STD = { practice: 120, mock: 45, final: 14 };
  const STD_RUNWAY = 180;
  const SEC = { quiz: 90, ox: 12, basic: 180, drill: 40, card: 15 };
  const ACTION_MIN = 1; // 目標が「回数」のとき、1回あたりの分(4択は約1分半、○×・カードは十数秒のため、あわせて約1分とみなす)
  const MIN_ITEM_MIN = 5;
  const FULL_EXAM_MIN = 120;
  const SHORT_EXAM_MIN = 48;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function phaseDef(id) {
    return PHASES.find((p) => p.id === id) || null;
  }

  // 登録した日(createdAt)から試験日までの日数。分からなければ null
  function runwayOf(target) {
    const ts = target && target.createdAt;
    if (typeof ts !== `number` || !Number.isFinite(ts) || ts <= 0 || ts > 8.64e15) return null;
    const d = DateUtil.diffDays(DateUtil.format(new Date(ts)), target.date);
    return Number.isFinite(d) && d > 0 ? d : null;
  }

  // 段階の境目 { practice, mock, final, compressed, runway }
  // 直前(14日)はホームの「直前期」の案内と同じ日数のまま縮めない。それより前の時期(演習・実戦)を、残りの日数に合わせて同じ割合で縮める
  function thresholds(target) {
    const runway = runwayOf(target);
    if (!runway || runway >= STD_RUNWAY) return Object.assign({ compressed: false, runway }, STD);
    const final = STD.final;
    const s = Math.max(0, runway - final) / (STD_RUNWAY - final);
    const mock = final + Math.max(1, Math.round((STD.mock - STD.final) * s));
    const practice = mock + Math.max(1, Math.round((STD.practice - STD.mock) * s));
    return { practice, mock, final, compressed: true, runway };
  }

  function phaseIdAt(daysLeft, th) {
    if (daysLeft <= 0) return `day`;
    if (daysLeft <= th.final) return `final`;
    if (daysLeft <= th.mock) return `mock`;
    if (daysLeft <= th.practice) return `practice`;
    return `basics`;
  }

  // 段階の一覧(日付つき)。試験日の前のときだけ
  function phaseList(target, th, daysLeft) {
    const exam = target.date;
    const at = (n) => DateUtil.addDays(exam, -n);
    const cur = phaseIdAt(daysLeft, th);
    const rows = [
      { id: `basics`, from: null, to: th.practice + 1 },
      { id: `practice`, from: th.practice, to: th.mock + 1 },
      { id: `mock`, from: th.mock, to: th.final + 1 },
      { id: `final`, from: th.final, to: 1 },
      { id: `day`, from: 0, to: 0 },
    ];
    const order = rows.map((r) => r.id);
    return rows.map((r) => {
      const def = phaseDef(r.id);
      return {
        id: r.id, name: def.name, desc: def.desc, icon: def.icon,
        startDate: r.from == null ? null : at(r.from),
        endDate: at(r.to),
        days: r.from == null ? null : r.from - r.to + 1,
        current: r.id === cur,
        past: order.indexOf(r.id) < order.indexOf(cur),
      };
    });
  }

  // ---- 1週間の時間 ----
  function budget(days) {
    const g = window.Goals && Goals.get ? Goals.get() : { kind: `actions`, value: 10 };
    const perDay = g.kind === `minutes` ? g.value : Math.max(1, Math.round(g.value * ACTION_MIN));
    const d = Math.max(1, Math.min(7, days));
    return { perDay, days: d, week: perDay * d, source: g.kind, goal: { kind: g.kind, value: g.value } };
  }

  // ---- 分野 ----
  function categoriesOf(type) {
    return type && Array.isArray(type.categories) ? type.categories.filter((c) => c && typeof c.id === `string`) : [];
  }

  function snapRows(snap, typeId) {
    if (!snap || typeof snap !== `object` || snap.examTypeId !== typeId || !Array.isArray(snap.categories)) return null;
    const out = Object.create(null);
    snap.categories.forEach((r) => { if (r && typeof r.id === `string`) out[r.id] = r; });
    return out;
  }

  // [{ cat, label, share, mastery, weight, topicIds }](weight は合計1)
  function allocation(type, snap) {
    // 目標の試験の種類が分からない(読み込んだ記録の examTypeId が不正など。Stats.examType が null)ときは配分なし
    if (!type) return [];
    const rows = snapRows(snap, type.id);
    // 弱点分析で用語も回答も1つもない分野(執筆中で中身のまだない分野)は配分しない(空のトピックへ案内しないため)
    const cats = categoriesOf(type).filter((c) => !rows || !rows[c.id] || rows[c.id].available !== false);
    if (!cats.length) return [];
    // 試験ごとの focusOrder(data/exams.js。税理士は消費税法を先に)があれば、その順に並べる(重みが並んだときの順になる)
    if (Array.isArray(type.focusOrder)) {
      const pref = type.focusOrder;
      const idx = (id) => (pref.indexOf(id) < 0 ? pref.length : pref.indexOf(id));
      cats.sort((a, b) => idx(a.id) - idx(b.id));
    }
    const qs = cats.map((c) => (typeof c.questions === `number` && c.questions > 0 ? c.questions : 0));
    const qsum = qs.reduce((s, n) => s + n, 0);
    const list = cats.map((c, i) => {
      const share = qsum > 0 ? qs[i] / qsum : 1 / cats.length;
      const r = rows ? rows[c.id] : null;
      // 弱点分析がない(渡されていない)ときは 50。分析にあって用語も回答もない分野は 0(まだ手をつけていない)
      let mastery = 50;
      if (rows) mastery = r && r.available && Number.isFinite(Number(r.mastery)) ? Math.max(0, Math.min(100, Number(r.mastery))) : 0;
      return {
        cat: c.id, label: c.name, share, mastery: Math.round(mastery),
        raw: share * (1.5 - mastery / 100),
        coverage: r && Number.isFinite(Number(r.coverage)) ? Number(r.coverage) : null,
        // まだ学習済みにしていない項目の数(基礎知識の「約n項目」を、残りの数より多くしないため)
        unlearned: r && Number.isFinite(Number(r.total)) ? Math.max(0, Number(r.total) - (Number(r.learned) || 0)) : null,
        topicIds: Array.isArray(c.topicIds) ? c.topicIds.slice() : [],
      };
    });
    const sum = list.reduce((s, x) => s + x.raw, 0) || 1;
    list.forEach((x) => { x.weight = x.raw / sum; delete x.raw; });
    return list;
  }

  // ---- リンク先 ----
  function topicExists(id) {
    return !!(window.AppIndex && AppIndex.topicsById && hasOwn(AppIndex.topicsById, id));
  }

  // 4択: 分野のトピックのうち問題の多いもの
  function quizTopic(a) {
    const idx = (window.AppIndex && AppIndex.topicQuizIndex) || {};
    let best = null;
    a.topicIds.forEach((tid) => {
      if (!topicExists(tid)) return;
      const n = Array.isArray(idx[tid]) ? idx[tid].length : 0;
      if (n && (!best || n > best.n)) best = { id: tid, n };
    });
    return best ? best.id : null;
  }

  // 基礎知識: 分野のトピックのうち着手率の低いもの(弱点分析のトピック別があれば)
  function basicTopic(a, snap) {
    const rows = snap && Array.isArray(snap.topics) ? snap.topics : null;
    const ids = a.topicIds.filter(topicExists);
    if (!ids.length) return null;
    if (!rows) return ids[0];
    let best = null;
    ids.forEach((tid) => {
      const r = rows.find((x) => x && x.id === tid);
      if (!r || !(r.total > 0)) return;
      const cov = Number.isFinite(Number(r.coverage)) ? Number(r.coverage) : 0;
      if (cov < 1 && (!best || cov < best.cov)) best = { id: tid, cov };
    });
    return best ? best.id : ids[0];
  }

  // ○×: 分野で出せる(宅建士の5分野と「不動産と消費税」「消費税法」)なら分野、ほかはトピック
  const OX_CATS = [`kenri`, `horei`, `zei`, `gyoho`, `menjo`, `shohi`, `shohiho`];
  function oxHref(a) {
    if (OX_CATS.includes(a.cat)) return `#ox/cat/${a.cat}/20`;
    const tid = a.topicIds.find(topicExists);
    return tid ? `#ox/topic/${tid}/20` : `#ox`;
  }

  function roundMin(m) {
    return Math.max(MIN_ITEM_MIN, Math.round(m / 5) * 5);
  }

  function countFor(minutes, sec) {
    return Math.max(1, Math.round((minutes * 60) / sec));
  }

  // 分野ごとの作業(段階で種類を変える)
  function categoryItem(a, minutes, phase, snap) {
    const m = roundMin(minutes);
    const weak = a.mastery < 70;
    const basicTid = basicTopic(a, snap);
    const quizTid = quizTopic(a);
    const lowCoverage = a.coverage == null || a.coverage < 0.7;
    if (phase === `basics` && basicTid && lowCoverage) {
      const n = countFor(m, SEC.basic);
      return { kind: `basic`, cat: a.cat, label: `${a.label}の基礎知識を読む`, sub: `約${a.unlearned ? Math.min(n, a.unlearned) : n}項目`, href: `#topics/${basicTid}`, minutes: m };
    }
    if ((phase === `practice` || (phase === `mock` && weak) || (phase === `basics` && !lowCoverage)) && quizTid) {
      return { kind: `quiz`, cat: a.cat, label: `${a.label}の4択を解く`, sub: `約${countFor(m, SEC.quiz)}問`, href: `#quiz/${quizTid}`, minutes: m };
    }
    return { kind: `ox`, cat: a.cat, label: `${a.label}を○×で確認`, sub: `約${countFor(m, SEC.ox)}問`, href: oxHref(a), minutes: m };
  }

  function drillCount(day) {
    try { return window.Drill && Drill.dueCount ? Drill.dueCount(day) : 0; } catch (e) { return 0; }
  }

  // 今週やること [{ kind, label, sub, href, minutes, cat? }](時間の多い順。段階で決まる作業が先)
  function weekItems(ctx) {
    const { phase, type, alloc, b, snap, today } = ctx;
    const items = [];
    let left = b.week;
    // 段階で決まる作業(cap = この作業に回してよい上限)。数分で終わる作業も5分として載せる
    // fit(分): 上限で一部しか回せないときの件数の書き方(「2388問・今週 約10分」のように件数と時間が食い違わないように)
    const take = (item, cap, fit) => {
      if (!(item.minutes > 0) || cap < MIN_ITEM_MIN || left < MIN_ITEM_MIN) return;
      const full = item.minutes;
      const m = Math.min(item.minutes, Math.floor(cap));
      item.minutes = Math.max(MIN_ITEM_MIN, Math.min(roundMin(m), Math.floor(left / 5) * 5));
      if (fit && item.minutes < full) item.sub = fit(item.minutes);
      left -= item.minutes;
      items.push(item);
    };
    // 実戦: 週1回の模擬試験(時間が足りなければショート)
    if (phase === `mock` && type && type.mockExam) {
      if (b.week >= FULL_EXAM_MIN + 30) take({ kind: `exam`, label: `模擬試験(フル50問)を1回`, sub: `本番と同じ2時間で時間配分を確認`, href: `#exam/full`, minutes: FULL_EXAM_MIN }, b.week);
      else if (b.week >= SHORT_EXAM_MIN + 10) take({ kind: `exam`, label: `模擬試験(ショート20問)を1回`, sub: `分野ごとの正答率を確認`, href: `#exam/short`, minutes: SHORT_EXAM_MIN }, b.week);
    }
    // 解き直し: 今週のうち(直前は試験日の前日まで)に期限が来るもの。リンク先(#quiz/due)は期限が来た問題だけを出すため、
    // 期限が試験より後の問題は数えない。直前は時間を多めに回す
    const nDrill = drillCount(DateUtil.addDays(today, b.days - 1));
    if (nDrill > 0 && phase !== `day`) {
      const cap = b.week * (phase === `final` ? 0.4 : 0.2);
      take({ kind: `drill`, label: `間違えた4択を解き直す`, sub: `${nDrill}問`, href: `#quiz/due`, minutes: Math.ceil((nDrill * SEC.drill) / 60) }, cap,
        (m) => `${nDrill}問のうち約${Math.min(nDrill, countFor(m, SEC.drill))}問`);
    }
    // 直前: 間違えたことのある○×(弱点分析の数があれば)
    const oxWrong = snap && snap.ctx && Number.isFinite(snap.ctx.oxEverWrong) ? snap.ctx.oxEverWrong : 0;
    if (phase === `final` && oxWrong > 0) {
      take({ kind: `ox-weak`, label: `間違えた○×を解き直す`, sub: `${oxWrong}問`, href: `#ox/weak`, minutes: Math.ceil((oxWrong * SEC.ox) / 60) }, b.week * 0.2,
        (m) => `${oxWrong}問のうち約${Math.min(oxWrong, countFor(m, SEC.ox))}問`);
    }
    // 基礎固め・演習: 復習カード(毎日)
    if ((phase === `basics` || phase === `practice`) && ctx.cardsPerDay > 0) {
      take({ kind: `review`, label: `今日の復習(用語カード)を毎日`, sub: `1日約${ctx.cardsPerDay}枚`, href: `#review`, minutes: Math.ceil((ctx.cardsPerDay * SEC.card * b.days) / 60) }, b.week * 0.2,
        (m) => `1日約${ctx.cardsPerDay}枚のうち約${Math.min(ctx.cardsPerDay, Math.max(1, Math.round((m * 60) / (SEC.card * b.days))))}枚`);
    }
    // 残りを分野に配分
    const fixed = items.length;
    if (alloc.length) {
      const pool = left;
      alloc.slice().sort((x, y) => y.weight - x.weight).forEach((a) => {
        const m = pool * a.weight;
        if (m < MIN_ITEM_MIN || left < MIN_ITEM_MIN) return;
        const it = categoryItem(a, Math.min(m, left), phase, snap);
        it.minutes = Math.min(it.minutes, Math.max(MIN_ITEM_MIN, Math.floor(left / 5) * 5));
        left -= it.minutes;
        items.push(it);
      });
      // 時間が少ない(試験の前日に1日10分など)とどの分野も5分に届かず、何も出せなくなる。そのときは一番重い分野に残りをまとめる
      if (items.length === fixed && left >= MIN_ITEM_MIN) {
        const top = alloc.slice().sort((x, y) => y.weight - x.weight)[0];
        const it = categoryItem(top, left, phase, snap);
        it.minutes = Math.max(MIN_ITEM_MIN, Math.floor(left / 5) * 5);
        left -= it.minutes;
        items.push(it);
      }
    } else if (left >= MIN_ITEM_MIN) {
      // 分野の区分がない試験: ○× と 4択を半分ずつ
      const half = left / 2;
      [{ kind: `ox`, label: `○×一問一答`, sub: `約${countFor(half, SEC.ox)}問`, href: `#ox`, minutes: roundMin(half) },
        { kind: `quiz`, label: `4択問題`, sub: `約${countFor(half, SEC.quiz)}問`, href: `#quiz`, minutes: roundMin(half) }].forEach((it) => { if (half >= MIN_ITEM_MIN) items.push(it); });
    }
    // 段階で決まる作業 → 分野(時間の多い順)
    const head = items.slice(0, fixed);
    const tail = items.slice(fixed).sort((x, y) => y.minutes - x.minutes);
    return head.concat(tail);
  }

  // ---- 公開API ----
  // opts: { snap: 弱点分析の結果(ホーム・計画の画面が1回だけ計算したもの), cardsPerDay: 1日の復習カードの枚数(分かっていれば) }
  // 戻り値: { state, target, tentative, examTypeId, typeName, examDate, daysLeft, phase, phases, compressed, runway, budget, alloc, week, after }
  function current(opts) {
    opts = opts || {};
    const target = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
    if (!target) return { state: `none`, target: null, phase: null, phases: [], week: [], alloc: [], after: null, daysLeft: null };
    const today = DateUtil.today();
    const daysLeft = DateUtil.diffDays(today, target.date);
    const type = Stats.examType(target.examTypeId);
    const base = {
      target,
      tentative: target.tentative === true,
      examTypeId: type ? type.id : `other`,
      typeName: type ? type.shortName || type.name : `試験`,
      examDate: target.date,
      daysLeft,
    };
    if (daysLeft < 0) {
      let next = null;
      try { next = (Stats.expectedDates ? Stats.expectedDates(target.examTypeId) : [])[0] || null; } catch (e) { next = null; }
      let official = null;
      try { official = (Stats.officialDates ? Stats.officialDates(target.examTypeId) : [])[0] || null; } catch (e) { official = null; }
      return Object.assign(base, {
        state: `after`, phase: null, phases: [], week: [], alloc: [],
        after: { results: Stats.examResults ? Stats.examResults(target) : null, official, next, daysSince: -daysLeft },
      });
    }
    const th = thresholds(target);
    const phaseId = phaseIdAt(daysLeft, th);
    const def = phaseDef(phaseId);
    const phase = { id: def.id, name: def.name, desc: def.desc, icon: def.icon, mock: phaseId === `mock` && !!(type && type.mockExam) };
    const phases = phaseList(target, th, daysLeft);
    if (daysLeft === 0) {
      return Object.assign(base, { state: `today`, phase, phases, compressed: th.compressed, runway: th.runway, week: [], alloc: [], after: null });
    }
    const b = budget(daysLeft);
    const alloc = allocation(type, opts.snap);
    let cardsPerDay = Number.isFinite(opts.cardsPerDay) ? Math.max(0, Math.floor(opts.cardsPerDay)) : null;
    if (cardsPerDay == null) {
      try { cardsPerDay = Stats.dueReviewCount() + Stats.newAvailableToday(); } catch (e) { cardsPerDay = 0; }
    }
    const week = weekItems({ phase: phaseId, type, alloc, b, snap: opts.snap, today, cardsPerDay: Math.min(cardsPerDay, 60) });
    // 分野の配分(画面の説明用。時間は今週の分野の作業に回した分)
    const catMinutes = Object.create(null);
    week.forEach((it) => { if (it.cat) catMinutes[it.cat] = (catMinutes[it.cat] || 0) + it.minutes; });
    alloc.forEach((a) => { a.minutes = catMinutes[a.cat] || 0; a.weight = Math.round(a.weight * 1000) / 1000; a.share = Math.round(a.share * 1000) / 1000; });
    return Object.assign(base, {
      state: `before`, phase, phases, compressed: th.compressed, runway: th.runway,
      budget: b, alloc, week, after: null,
    });
  }

  return { current, PHASES, SEC, _internal: { thresholds, phaseIdAt, allocation, budget, runwayOf, weekItems, STD, STD_RUNWAY } };
})();
