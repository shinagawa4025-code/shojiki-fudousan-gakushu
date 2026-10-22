// レベルと経験値(v14): 学習のたびに経験値(XP)を足し、合計からレベル(Lv.1〜99)を決める。本体の束(ホームのレベル表示に使う)
// 呼び出し: window.Xp && Xp.award(kind, { id, correct, unsure })。kind と1回の XP(正解・「自信なし」の正解・不正解):
//   mc(4択。模擬試験の採点も)10・6・3 / ox 3・2・1 / review(今日の復習の評価)3 / numbers・compare・joubun 4・2・1 /
//   challenge(今日のチャレンジ。{ ids: 正解した文ID, finished })正解1問 2・その日はじめて最後までやると +30 /
//   goal(1日の目標の達成。js/goals.js の 'goal:met' を聞いて1日1回)+50
// 同じ日に同じ問題(kind と id)へもう一度答えたときは、2回目から1回 1XP まで(くり返しで稼げないように)
// 保存: Storage `xp` = { total, days: { 'YYYY-MM-DD': その日の XP }(400日分), seeded: true, seen: お祝いしたレベル,
//   seed: はじめに付けた XP, seedAt, goal: 目標の XP を付けた日, ch: チャレンジのボーナスを付けた日, ids: { d: 日付, h: 今日答えた問題の印 } }
// はじめの XP(seedIfNeeded): 初めて使うときに1回だけ、これまでの学習の記録から付ける(数え方は LevelUi.seedValue。記録のない人は 0。
//   二度は付けない)。本体を軽くするため数え方は詳細の束(js/views/challenge.js の LevelUi)にあり、届くまでは付けない(ホームのレベルも出さない)
// レベルアップのお祝い・進捗のカードも LevelUi。どれも例外を投げない
window.Xp = (function () {
  const KEY = `xp`;
  const MAX = 99;
  const IDS = 3000;
  const PTS = { mc: [10, 6, 3], ox: [3, 2, 1], review: [3, 3, 3], numbers: [4, 2, 1], compare: [4, 2, 1], joubun: [4, 2, 1] };
  const fns = [];
  const obj = (v) => Storage.isPlainObject(v);
  const day = (d) => DateUtil.isValid(d);
  const n0 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e9) : 0; };

  // レベルの曲線: レベル L になるのに要る合計 XP = 300 × (L − 1)^1.5(10 の位で丸める)
  // Lv.2 300・Lv.5 2,400・Lv.10 8,100・Lv.20 24,850・Lv.99 291,050(1日に4択40問ほどなら Lv.5 まで約1週間・Lv.20 まで約2〜3か月)
  function startOf(L) {
    return L > 1 ? Math.round(30 * Math.pow(L - 1, 1.5)) * 10 : 0;
  }
  function levelOf(total) {
    const t = n0(total);
    let L = 1;
    while (L < MAX && t >= startOf(L + 1)) L += 1;
    const max = L >= MAX;
    const need = max ? 0 : startOf(L + 1) - startOf(L);
    const into = t - startOf(L);
    return { level: L, into, need, rest: need - into, pct: max ? 100 : Math.floor((into / need) * 100), max };
  }

  // 保存値を整えて読む(壊れた値・型の違う値は捨てる)
  function read() {
    const r = Storage.get(KEY, {});
    const days = {};
    if (obj(r.days)) Object.keys(r.days).forEach((d) => { if (n0(r.days[d]) && day(d)) days[d] = n0(r.days[d]); });
    const ok = obj(r.ids) && day(r.ids.d) && Array.isArray(r.ids.h);
    const x = { total: n0(r.total), days, seeded: r.seeded === true, seen: Math.max(1, n0(r.seen)), seed: n0(r.seed), ids: { d: ok ? r.ids.d : ``, h: ok ? r.ids.h.filter((h) => typeof h === `string`).slice(-IDS) : [] } };
    [`seedAt`, `goal`, `ch`].forEach((k) => { if (day(r[k])) x[k] = r[k]; });
    return x;
  }

  // 400日より古い日を消して保存する
  function write(x) {
    const old = DateUtil.addDays(DateUtil.today(), -400);
    Object.keys(x.days).forEach((d) => { if (d < old) delete x.days[d]; });
    Storage.set(KEY, x);
  }

  // 読む(まだはじめの XP を付けていなければ、数え方が届いていれば付ける)
  function load() {
    const x = read();
    if (!x.seeded && window.LevelUi && LevelUi.seedValue) {
      const s = n0(LevelUi.seedValue());
      Object.assign(x, { total: x.total + s, seeded: true, seed: s, seedAt: DateUtil.today() });
      x.seen = Math.max(x.seen, levelOf(x.total).level);
      write(x);
      fire(0, `seed`, 0);
    }
    return x;
  }

  function fire(gained, kind, before) {
    const lv = level();
    const info = { gained, kind, total: total(), level: lv };
    fns.slice().forEach((fn) => { try { fn(info); } catch (e) { console.error(`[経験値]`, e); } });
    try { window.dispatchEvent(new CustomEvent(`xp:change`, { detail: info })); } catch (e) { /* 古いブラウザでは知らせない */ }
    // レベルアップのお祝いは詳細の束(LevelUi)が落ち着いたときに出す(まだ届いていなければ、届いたときに LevelUi が確かめる)
    if (before && lv.level > before && window.LevelUi && LevelUi.celebrate) LevelUi.celebrate();
  }

  // 戻り値: 足した XP
  function award(kind, detail) {
    try {
      const d = obj(detail) ? detail : {};
      const t = DateUtil.today();
      const x = load();
      if (x.ids.d !== t) x.ids = { d: t, h: [] };
      // 今日すでに答えた問題なら true(初めてなら印を付ける。印は文字列の32ビットのハッシュ)
      const again = (k) => {
        let h = 2166136261;
        for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
        h = (h >>> 0).toString(36);
        if (x.ids.h.includes(h)) return true;
        x.ids.h.push(h);
        return false;
      };
      let g = 0;
      if (kind === `goal`) {
        if (x.goal === t) return 0;
        x.goal = t;
        g = 50;
      } else if (kind === `challenge`) {
        (Array.isArray(d.ids) ? d.ids : []).forEach((id) => { g += again(`challenge:${id}`) ? 1 : 2; });
        if (d.finished === true && x.ch !== t) { x.ch = t; g += 30; }
      } else {
        const p = PTS[kind];
        if (!p) return 0;
        g = d.correct === true ? p[d.unsure === true ? 1 : 0] : p[2];
        if (d.id != null && again(`${kind}:${d.id}`)) g = Math.min(g, 1);
      }
      if (!g) return 0;
      const before = levelOf(x.total).level;
      x.total += g;
      x.days[t] = (x.days[t] || 0) + g;
      x.ids.h = x.ids.h.slice(-IDS);
      write(x);
      fire(g, kind, before);
      return g;
    } catch (e) {
      console.error(`[経験値] 記録できませんでした`, e);
      return 0;
    }
  }

  function total() {
    try { return load().total; } catch (e) { return 0; }
  }
  function level() {
    return levelOf(total());
  }
  // 今日の XP
  function today() {
    try { return load().days[DateUtil.today()] || 0; } catch (e) { return 0; }
  }
  function onChange(fn) {
    if (typeof fn !== `function`) return () => {};
    fns.push(fn);
    return () => { if (fns.includes(fn)) fns.splice(fns.indexOf(fn), 1); };
  }

  // ホームの記録のカウンターの下: レベルの札・次のレベルまでのバー・今日の XP と「今日のチャレンジ」(今日のベスト)。
  // はじめの XP を付けるまでは空(CSS で隠す)。XP が変わったら描き直す(画面から外れたら監視をやめる)
  function renderHome(box) {
    if (!box || !window.UI) return;
    const paint = () => {
      if (!load().seeded) return;
      const lv = level();
      const td = today();
      const c = Storage.get(`challenge`, {});
      const cd = obj(c.days) && obj(c.days[DateUtil.today()]) ? c.days[DateUtil.today()] : {};
      const best = n0(cd.runs) ? `今日のベスト ${n0(cd.best)}問` : `3分で○×`;
      const next = lv.max ? `最高レベルです` : `次のレベルまで あと${lv.rest} XP`;
      box.innerHTML = `<div class="xp-home">
        <a class="xp-main" href="#progress" aria-label="レベル${lv.level}。${next}。今日の経験値 ${td} XP">
          <span class="xp-medal" aria-hidden="true"><small>Lv.</small><b>${lv.level}</b></span>
          <span class="xp-body" aria-hidden="true"><span class="xp-next">${next}</span><span class="xp-bar"><span style="width:${lv.pct}%"></span></span><span class="xp-today">${td ? `今日 +${td} XP` : `今日はこれから`}</span></span>
        </a>
        <a class="xp-ch" href="#challenge" aria-label="今日のチャレンジ(${best})">${UI.icon(`bolt`, { size: 20 })}<span aria-hidden="true"><b>今日のチャレンジ</b><small>${best}</small></span></a>
      </div>`;
    };
    paint();
    const off = onChange(() => { if (box.isConnected) paint(); else off(); });
    if (UI.onLeave) UI.onLeave(box, off);
  }

  if (window.addEventListener) window.addEventListener(`goal:met`, () => award(`goal`));

  return {
    award, total, level, levelOf, startOf, today, onChange, renderHome, POINTS: PTS, MAX,
    seedIfNeeded: () => { try { load(); } catch (e) { console.error(`[経験値]`, e); } },
    // LevelUi(詳細の束)用: 整えた保存値の読み書き(お祝いしたレベル・直近の日ごとの XP など)
    _read: read, _write: write,
  };
})();
