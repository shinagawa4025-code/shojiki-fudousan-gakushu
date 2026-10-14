// 学習時間の記録(v12): 画面が見えていて、最後の操作から90秒以内(模擬試験の解答中は5分以内)の時間だけを日ごとに数える
// 保存: Storage `studyTime` = { 'YYYY-MM-DD': 秒 }(400日より古い日は消す)。複数のタブで二重に数えない
//       Storage `studyTimeLock` = { tab: タブの印, at: 最後に数えた時刻(ミリ秒) }(いま数えているタブ。バックアップしない)
// しくみ:
// - 画面が見えている間だけ15秒ごとに確かめ、数えてよい状態(見えている・このウィンドウが前面・最後の操作から90秒以内・
//   設定などの画面でない・ほかのタブが数えていない)なら、前回からの経過(1回30秒まで)をその時点の日付に足す
// - 操作 = pointerdown / keydown / touchstart / scroll / wheel(受け取るのは時刻だけ。重い処理はしない)
// - 保存は30秒に1回まで。画面が隠れる・ページを離れるときにも保存する(書く直前に読み直して、別のタブの記録を消さない)
// - 未来の日付の記録(端末の時計のずれ)は合計に入れない
window.StudyTime = (function () {
  const KEY = `studyTime`;
  const LOCK_KEY = `studyTimeLock`;
  const TICK_MS = 15000;
  const MAX_CREDIT_MS = 30000; // 1回の確認で足す上限(端末のスリープなどで間が空いても一度に多く数えない)
  const IDLE_MS = 90000;
  const EXAM_IDLE_MS = 300000; // 模擬試験の解答中(#exam/run)は考える時間が長いので5分
  const FLUSH_MS = 30000;
  const LOCK_TTL_MS = 45000; // これより古い印は、閉じたタブの残りとみなす
  const LOCK_REFRESH_MS = 25000; // 印の書き直しは間をあける(書くたびに別のタブへ通知が飛ぶため)
  const KEEP_DAYS = 400;
  const DAY_MAX = 86400;
  // 学習ではない画面(設定・このアプリについて・メニュー)は数えない
  const EXCLUDED = [`settings`, `about`, `more`];

  // テストで時計を差し替えられるように(既定は Date.now)
  let now = () => Date.now();
  const tabId = `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

  let started = false;
  let timer = null;
  let visible = false;
  let focused = false;
  let touchedSinceBlur = false;
  let lastInput = 0; // 最後の操作の時刻
  let lastTick = 0; // ここまでは数えた(または数えないと決めた)時刻
  let lastFlush = 0;
  let route = ``;
  let holding = false; // このタブが数える役か(印を書いたか)
  let lockWrittenAt = 0;
  // まだ保存していない分 { 'YYYY-MM-DD': ミリ秒 }
  let pending = Object.create(null);
  // 保存できなかった(容量不足)ときに書こうとした値 { 'YYYY-MM-DD': { total: 書こうとした秒, add: そのうち pending から足した秒 } }。
  // Storage は失敗した値を覚えていて「古い記録を整理」で書き直すため、次の保存の前にそれが書かれたかを確かめる(二重に足さない)
  let unsaved = null;

  function routeOf(hash) {
    return String(hash || ``).replace(/^#/, ``).split(`/`)[0] || `home`;
  }

  function isExamRun(hash) {
    return /^#?exam\/run(?:$|[/?])/.test(String(hash || ``));
  }

  function currentHash() {
    try { return typeof location !== `undefined` ? String(location.hash || ``) : ``; } catch (e) { return ``; }
  }

  function idleLimit() {
    return isExamRun(currentHash()) ? EXAM_IDLE_MS : IDLE_MS;
  }

  function sec(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), DAY_MAX) : 0;
  }

  // ---- 印(どのタブが数えているか) ----
  function readLock() {
    const v = Storage.get(LOCK_KEY, null);
    return Storage.isPlainObject(v) && typeof v.tab === `string` && typeof v.at === `number` && Number.isFinite(v.at) ? v : null;
  }

  // ほかのタブが新しい印を持っていれば false。数えてよければ印を(間をあけて)書き直す
  function claimLock(t) {
    const lk = readLock();
    if (lk && lk.tab !== tabId && t - lk.at < LOCK_TTL_MS && lk.at <= t + LOCK_TTL_MS) {
      holding = false;
      return false;
    }
    if (!lk || lk.tab !== tabId || t - lockWrittenAt >= LOCK_REFRESH_MS) {
      Storage.set(LOCK_KEY, { tab: tabId, at: t });
      lockWrittenAt = t;
    }
    holding = true;
    return true;
  }

  function releaseLock() {
    if (!holding) return;
    holding = false;
    lockWrittenAt = 0;
    const lk = readLock();
    if (lk && lk.tab === tabId) Storage.remove(LOCK_KEY);
  }

  // ---- 数える ----
  // 数えてよい状態か(印以外)
  function eligible(t) {
    return visible && focused && t - lastInput <= idleLimit() && !EXCLUDED.includes(route);
  }

  // 前回からこの時点までの分を足す(状態が変わる直前にも呼ぶ。変わる前の状態で判定する)
  function accrue(t) {
    const from = lastTick;
    lastTick = t;
    if (!from || t <= from || !eligible(from)) return;
    // 最後の操作から上限を過ぎた分は数えない
    const until = Math.min(t, lastInput + idleLimit());
    const ms = Math.min(until - from, MAX_CREDIT_MS);
    if (ms <= 0) return;
    if (!claimLock(t)) return;
    const day = DateUtil.today();
    pending[day] = (pending[day] || 0) + ms;
  }

  // 保存値を整える(日付として正しく、400日以内のものだけ。未来の日付は消さずに残す=時計が戻ったときに失わない)
  function cleanStore(raw, today) {
    const out = {};
    if (!Storage.isPlainObject(raw)) return out;
    const oldest = DateUtil.addDays(today, -KEEP_DAYS);
    Object.keys(raw).forEach((d) => {
      if (!DateUtil.isValid(d) || d < oldest) return;
      const s = sec(raw[d]);
      if (s) out[d] = s;
    });
    return out;
  }

  // 前回保存できなかった値が、その後 Storage の書き直し(「古い記録を整理」)で保存されていたら、その分を pending から外す
  function settleUnsaved(store) {
    if (!unsaved) return;
    Object.keys(unsaved).forEach((d) => {
      const u = unsaved[d];
      if (!pending[d] || (store[d] || 0) < u.total) return;
      pending[d] -= u.add * 1000;
      if (pending[d] <= 0) delete pending[d];
    });
    unsaved = null;
  }

  function flush() {
    lastFlush = now();
    if (!Object.keys(pending).length) { unsaved = null; return; }
    const today = DateUtil.today();
    const store = cleanStore(Storage.get(KEY, {}), today);
    settleUnsaved(store);
    const add = Object.create(null);
    Object.keys(pending).forEach((d) => {
      const whole = Math.floor(pending[d] / 1000);
      if (whole > 0) add[d] = whole;
    });
    if (!Object.keys(add).length) return;
    Object.keys(add).forEach((d) => { store[d] = Math.min(DAY_MAX, (store[d] || 0) + add[d]); });
    if (!Storage.set(KEY, store)) {
      // 保存できなければ次の機会にもう一度(書こうとした値を覚えておく)
      unsaved = Object.create(null);
      Object.keys(add).forEach((d) => { unsaved[d] = { total: store[d], add: add[d] }; });
      return;
    }
    Object.keys(add).forEach((d) => {
      pending[d] -= add[d] * 1000;
      if (pending[d] <= 0) delete pending[d];
    });
    try { window.dispatchEvent(new CustomEvent(`studytime:change`)); } catch (e) { /* 知らせなくても記録は残る */ }
  }

  // 端末の時計が戻された(手で合わせたなど): 未来の時刻のままの「最後の操作」などを今に合わせる
  // (そのままだと、操作がなくても時計が追いつくまで数え続け、保存も止まるため)
  function rebase(t) {
    if (lastInput > t) lastInput = t;
    if (lastFlush > t) lastFlush = t;
    if (lockWrittenAt > t) lockWrittenAt = 0;
  }

  function tick() {
    const t = now();
    rebase(t);
    // 状態を最新にしてから数える(focus/blur を取りこぼしても、ここで合わせる)
    syncFocus();
    accrue(t);
    // 画面の切り替えで hashchange が出ない場合(replaceState)もあるので、ここで読み直す
    route = routeOf(currentHash());
    if (!eligible(t)) releaseIfIdle();
    if (t - lastFlush >= FLUSH_MS) flush();
  }

  // 操作がなくなった・前面でなくなったタブは、ほかのタブが数えられるように印を外す
  function releaseIfIdle() {
    if (holding) releaseLock();
  }

  // 前面にあるか: document.hasFocus()。ただし別のウィンドウへ移った(blur)あとにタップ・キー入力があれば前面とみなす
  function syncFocus() {
    let f = true;
    try { f = typeof document.hasFocus === `function` ? document.hasFocus() : true; } catch (e) { f = true; }
    focused = f || touchedSinceBlur;
  }

  function startTimer() {
    if (timer || !visible) return;
    timer = setInterval(tick, TICK_MS);
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  // ---- 出来事 ----
  // スクロールのたびに呼ばれるので軽く(90秒以内なら模擬試験中かどうかを調べるまでもない)
  function onInput(e) {
    const t = now();
    rebase(t);
    // しばらく操作がなかったあとの最初の操作: 空いていた時間は数えず、ここから数え直す
    if (t - lastInput > IDLE_MS && t - lastInput > idleLimit()) { accrue(t); lastTick = t; }
    lastInput = t;
    // タップ・クリック・キー入力は、このウィンドウが前面にある印(document.hasFocus() が正しく返らない環境のため)
    if (e && e.type !== `wheel` && e.type !== `scroll`) touchedSinceBlur = true;
  }

  // 画面に戻ってきた(タブの切り替え・アプリへの復帰も利用者の操作とみなす)
  function resume() {
    const t = now();
    if (visible && timer) return;
    visible = true;
    syncFocus();
    lastTick = t;
    lastInput = t;
    startTimer();
  }

  function onVisibility() {
    if (document.visibilityState === `visible`) { resume(); return; }
    accrue(now());
    visible = false;
    stopTimer();
    flush();
    releaseLock();
  }

  // 戻る・進むで保存しておいたページ(bfcache)から戻ったとき(persisted)は、離れていた間を数えないよう数え直す
  // (Safari はページを離れるときに visibilitychange を出さないことがあり、その場合 resume だけでは数え直さない)
  function onPageShow(e) {
    if (document.visibilityState === `hidden`) return;
    if (e && e.persisted) {
      const t = now();
      lastTick = t;
      lastInput = t;
    }
    resume();
  }

  function onFocus() {
    const t = now();
    if (!focused) { accrue(t); lastTick = t; }
    focused = true;
    lastInput = t;
  }

  function onBlur() {
    accrue(now());
    focused = false;
    touchedSinceBlur = false;
    releaseLock();
  }

  function onHashChange() {
    accrue(now());
    route = routeOf(currentHash());
  }

  function onPageHide() {
    accrue(now());
    flush();
    releaseLock();
  }

  function start() {
    if (started || typeof document === `undefined` || typeof window.addEventListener !== `function`) return;
    started = true;
    const t = now();
    visible = document.visibilityState !== `hidden`;
    syncFocus();
    route = routeOf(currentHash());
    // 開いた(読み込んだ)ことも操作とみなす
    lastInput = t;
    lastTick = t;
    lastFlush = t;
    const opt = { capture: true, passive: true };
    [`pointerdown`, `keydown`, `touchstart`, `wheel`].forEach((type) => window.addEventListener(type, onInput, opt));
    // スクロールは泡立たないため document で受ける(要素の中のスクロールも capture で拾う)
    document.addEventListener(`scroll`, onInput, opt);
    document.addEventListener(`visibilitychange`, onVisibility);
    window.addEventListener(`focus`, onFocus);
    window.addEventListener(`blur`, onBlur);
    window.addEventListener(`hashchange`, onHashChange);
    window.addEventListener(`pagehide`, onPageHide);
    window.addEventListener(`pageshow`, onPageShow);
    startTimer();
  }

  // ---- 読み出し ----
  function stored() {
    return cleanStore(Storage.get(KEY, {}), DateUtil.today());
  }

  // 保存済み + まだ保存していない分(秒)
  function secondsOf(store, d) {
    return Math.min(DAY_MAX, (store[d] || 0) + Math.floor((pending[d] || 0) / 1000));
  }

  function todaySeconds() {
    const d = DateUtil.today();
    return secondsOf(stored(), d);
  }

  // 直近 n 日(今日を含む)の [{ date, sec }](古い順)
  function lastNDays(n) {
    const len = Math.max(0, Math.min(Math.floor(Number(n)) || 0, KEEP_DAYS + 1));
    const store = stored();
    const today = DateUtil.today();
    const out = [];
    for (let i = len - 1; i >= 0; i--) {
      const date = DateUtil.addDays(today, -i);
      out.push({ date, sec: secondsOf(store, date) });
    }
    return out;
  }

  // 今日までの合計(未来の日付は入れない)
  function totalSeconds() {
    const store = stored();
    const today = DateUtil.today();
    const days = Object.keys(store).concat(Object.keys(pending).filter((d) => !store[d]));
    return days.reduce((sum, d) => (d <= today ? sum + secondsOf(store, d) : sum), 0);
  }

  return {
    start, todaySeconds, lastNDays, totalSeconds,
    KEY, LOCK_KEY,
    // テスト用: 時計の差し替え・1回分の確認・保存を外から行う
    _internal: {
      setNow(fn) { now = typeof fn === `function` ? fn : () => Date.now(); },
      tick, flush, accrue,
      state: () => ({ visible, focused, lastInput, lastTick, lastFlush, route, holding, tabId, timer: !!timer, pending: Object.assign({}, pending) }),
      constants: { TICK_MS, MAX_CREDIT_MS, IDLE_MS, EXAM_IDLE_MS, FLUSH_MS, LOCK_TTL_MS, LOCK_REFRESH_MS, KEEP_DAYS, EXCLUDED },
    },
  };
})();
