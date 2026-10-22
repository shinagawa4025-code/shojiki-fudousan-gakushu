// 動きと手ごたえ(v12.2)。見た目は css/motion.css。音・振動は使わない。「動きを減らす」設定ではどれも動かさない(最後の状態をすぐ出す)
// - page(dir, update): 画面の切り替え(router.js から)。View Transitions が使えるブラウザ(Safari 18 以降・Chrome・Edge)は
//   進むと右から・戻ると左から少しスライド('fade' はタブの切替などで重ねて薄く)。使えなければ短いフェード。update は必ず1回呼ぶ
// - countUp(el, n, key): 数字の数え上げ。key を付けたものは、このタブで前に見せた値より増えたときだけ動かす(初めて見せるときは動かさない)。
//   文字(textContent)は最初から最後の値のまま。途中の数は ::after(CSS のカウンター)で見せる(読み上げ・コピーは正しい値)
// - countIn(root): 結果の大きな数字(.big-num・.stat-value)を 0 から数え上げる(解き終えた直後だけ呼ぶ)
// - streak(bar, n): 連続正解 3・5・10(以後10ごと)で、判定のバーに「n問連続!」と小さな紙吹雪
// - 今日の目標の達成('goal:met'。js/goals.js が1日1回送る)で、画面の上に小さなお祝い
// - tapMascot(el): ホームのマスコットをタップすると跳ねて表情が変わる(飾りなので読み上げない・フォーカスしない)
// - busy(blocking): 演出を待つべきか(模擬試験の解答中・初回ガイド・裏のタブ。blocking はさらに、ほかのダイアログ・4択/○×/復習の途中と、addBusyCheck(fn) で足した条件)
window.Motion = (function () {
  const doc = document;
  const reduced = () => !!(window.matchMedia && window.matchMedia(`(prefers-reduced-motion: reduce)`).matches);
  // このタブの中だけの記録(sessionStorage)。使えないときは覚えない(動きを省くだけ)
  function tabGet(k) { try { return JSON.parse(sessionStorage.getItem(`fudomana.${k}`)); } catch (e) { return null; } }
  function tabSet(k, v) { try { sessionStorage.setItem(`fudomana.${k}`, JSON.stringify(v)); } catch (e) { /* 無視 */ } }

  // (v14)詳細の束の画面が「途中」の条件を足す(addBusyCheck。js/cloze.js の数字ドリル・比較表/条文の穴埋め)。
  // 画面の部品の名前はここに書かない(本体のコードに出てくる名前の規則は、最初の表示の CSS に入るため。tools/lib/cssplit.js)
  const busyChecks = [];
  function addBusyCheck(fn) { if (typeof fn === `function`) busyChecks.push(fn); }
  function busy(blocking) {
    const b = doc.body;
    if (!b || doc.visibilityState === `hidden` || b.classList.contains(`exam-active`) || doc.querySelector(`.onb-overlay`)) return true;
    if (!blocking) return false;
    if (doc.querySelector(`.modal-overlay, .sheet-backdrop, .ox-view.is-run, .quiz-stepper:not(.is-finished)`)) return true;
    if (busyChecks.some((fn) => { try { return !!fn(); } catch (e) { return false; } })) return true;
    try { return !!doc.querySelector(`.review-view:not(:has(.rv-done)) .flip-card`); } catch (e) { return false; }
  }

  // ---- 画面の切り替え ----
  // 切り替えの途中(写しを重ねている間)のタップ・クリックは写しに当たって届かないので、押し始めたら切り替えを打ち切る。
  // タッチはそのまま下の画面に届く。マウスのクリックは押した所が写しになるため、直後のクリックを下の部品へ渡し直す
  let vtSeq = 0;
  let skipAt = 0;
  let passOn = false;
  function passClick(e) {
    if (e.target !== doc.documentElement || Date.now() - skipAt > 1000) return;
    const el = doc.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === doc.documentElement) return;
    const act = el.closest && el.closest(`a[href], button, summary, label, input, select, textarea, [role="button"]`);
    if (act && (/^(SELECT|TEXTAREA)$/.test(act.tagName) || (act.tagName === `INPUT` && !/^(checkbox|radio|button|submit)$/.test(act.type)))) act.focus();
    else if (act) act.click();
    // ボタンでない部品(カード・マスコットなど)は、その場所にクリックを送り直す
    else el.dispatchEvent(new MouseEvent(`click`, { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, view: window }));
  }
  function page(dir, update) {
    const root = doc.documentElement;
    if (!dir || reduced() || doc.visibilityState === `hidden`) { update(); return; }
    if (typeof doc.startViewTransition !== `function`) {
      update();
      const v = doc.querySelector(`#view-root > .view:last-child`);
      if (v) {
        v.classList.add(`fd-fade`);
        setTimeout(() => v.classList.remove(`fd-fade`), 260);
      }
      return;
    }
    const seq = ++vtSeq;
    root.setAttribute(`data-fd-vt`, dir);
    let t = null;
    try { t = doc.startViewTransition(update); } catch (e) { t = null; }
    if (!t) { root.removeAttribute(`data-fd-vt`); update(); return; }
    const skip = () => { skipAt = Date.now(); try { t.skipTransition(); } catch (e) { /* 終わっている */ } };
    doc.addEventListener(`pointerdown`, skip, true);
    if (!passOn) { passOn = true; doc.addEventListener(`click`, passClick, true); }
    const end = () => {
      doc.removeEventListener(`pointerdown`, skip, true);
      if (seq === vtSeq) root.removeAttribute(`data-fd-vt`);
    };
    // 次の切り替えで打ち切られたときなどの失敗は、画面には影響しないので黙って終える
    t.finished.then(end, end);
    if (t.ready) t.ready.catch(() => {});
    if (t.updateCallbackDone) t.updateCallbackDone.catch(() => {});
  }

  // ---- 数え上げ ----
  function lead(el) {
    // 数字のあとに単位などの要素が続くとき(5<small>/10問</small>)は、先頭の数字だけを包んで数える
    if (!el.firstElementChild) return el;
    const n = el.firstChild;
    if (!n || n.nodeType !== 3 || !/\d/.test(n.nodeValue)) return null;
    const s = doc.createElement(`span`);
    s.className = `fd-num`;
    n.replaceWith(s);
    s.appendChild(n);
    return s;
  }
  function run(el, from, to) {
    const box = lead(el);
    if (!box) return;
    const tok = (box.__fdCount || 0) + 1;
    box.__fdCount = tok;
    const ms = Math.min(900, 280 + (to - from) * 45);
    const t0 = performance.now();
    box.classList.add(`fd-counting`);
    const stop = () => {
      if (box.__fdCount !== tok) return;
      box.classList.remove(`fd-counting`);
      box.style.removeProperty(`--fd-n`);
    };
    // 描く前(画面に入れる前)に呼ばれることもあるので、はじめの値はすぐ入れ、続きは次のフレームから
    box.style.setProperty(`--fd-n`, String(from));
    const tick = (now) => {
      if (box.__fdCount !== tok) return;
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      box.style.setProperty(`--fd-n`, String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))));
      if (p < 1 && box.isConnected) requestAnimationFrame(tick); else stop();
    };
    requestAnimationFrame(tick);
    // 裏のタブなどで描画が止まっても、最後は必ず元の文字に戻す
    setTimeout(stop, ms + 400);
  }
  function countUp(el, to, key) {
    if (!el) return;
    const v = Math.max(0, Math.floor(Number(to) || 0));
    let from = 0;
    if (key) {
      const seen = tabGet(`seen`) || {};
      from = typeof seen[key] === `number` ? seen[key] : null;
      seen[key] = v;
      tabSet(`seen`, seen);
    }
    if (from == null || !(v > from) || reduced()) return;
    run(el, from, v);
  }
  function countIn(root) {
    if (!root || reduced()) return;
    root.querySelectorAll(`.big-num, .stat-value`).forEach((el) => {
      const n = parseInt(el.textContent, 10);
      if (n > 0) countUp(el, n);
    });
  }

  // ---- 小さな紙吹雪(.confetti とは別の箱。数を少なく・近くに) ----
  function burst(target, n) {
    if (window.Mascot && Mascot.confetti) Mascot.confetti(target, { n: n || 10, spread: .55, cls: `fd-burst` });
  }

  function mini(face) {
    return window.Mascot && Mascot.svg ? Mascot.svg(face, 26, { className: `fd-mini` }) : ``;
  }

  // ---- 連続正解 ----
  function streak(bar, n) {
    if (!bar || !(n === 3 || n === 5 || (n >= 10 && n % 10 === 0))) return;
    const head = bar.querySelector(`.quiz-verdict strong`);
    if (!head || head.querySelector(`.fd-run`)) return;
    // 判定の文(読み上げ)には「n問つづけて正解!」が入っているので、この札は読み上げない
    head.insertAdjacentHTML(`beforeend`, `<span class="fd-run" aria-hidden="true">${mini(`cheer`)}<span>${n}問連続!</span></span>`);
    // 判定のバーが下から出きってから(出る途中の位置から飛ばないように)
    setTimeout(() => { if (head.isConnected) burst(head.querySelector(`.fd-run`) || head, n >= 10 ? 14 : 10); }, 200);
  }

  // ---- 今日の目標の達成 ----
  let live = null;
  function say(text) {
    if (!live || !live.isConnected) {
      live = doc.createElement(`div`);
      live.className = `sr-only`;
      live.setAttribute(`role`, `status`);
      doc.body.appendChild(live);
    }
    live.textContent = ``;
    setTimeout(() => { live.textContent = text; }, 60);
  }
  let goalWait = null;
  function goalMet(e) {
    const day = (e && e.detail && e.detail.date) || ``;
    if (tabGet(`goalCele`) === day) return;
    clearTimeout(goalWait);
    if (busy(false)) { goalWait = setTimeout(() => goalMet(e), 3000); return; }
    tabSet(`goalCele`, day);
    const el = doc.createElement(`div`);
    el.className = `fd-cele`;
    el.setAttribute(`aria-hidden`, `true`);
    el.innerHTML = `${mini(`cheer`)}<span>今日の目標を達成!</span>`;
    doc.body.appendChild(el);
    say(`今日の目標を達成しました`);
    if (!reduced()) setTimeout(() => burst(el, 12), 120);
    setTimeout(() => {
      if (el.classList) el.classList.add(`is-out`);
      setTimeout(() => { if (el.remove) el.remove(); }, 300);
    }, 2600);
  }
  if (typeof window.addEventListener === `function`) window.addEventListener(`goal:met`, goalMet);

  // ---- ホームのマスコット ----
  function tapMascot(el) {
    if (!el || el.__fdTap || !window.Mascot || !Mascot.react) return;
    el.__fdTap = true;
    el.addEventListener(`click`, () => Mascot.react(el));
  }

  return { page, countUp, countIn, streak, burst, tapMascot, busy, addBusyCheck, reduced };
})();
