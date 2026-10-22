// 穴埋め・答えの表示の共通部品(v14): 数字まとめドリル(#numbers)・比較表(#compare)・条文穴埋め(#joubun)で使う(詳細の束)
// 空欄の答え方は2つ:
//   4択で選ぶ(options で正解+誤りの選択肢を混ぜる → choiceList で選択肢のタイル → paintChoices で正解・誤りの印)
//   タップで答えを見て自分で採点(gradeRow: ○ 覚えた / △ あいまい / × まだ。点は 2 / 1 / 0)
// 記録: 画面ごとのキー(numbersStats・compareStats・joubunStats)に { id: { c: 正解の数, w: 誤りの数, last: 最後の日, grade: 最後の点 } }。
//       update は保存する直前に読み直す(別のタブの記録を消さない)。苦手の順(weakOrder): 点 0 → 1 → まだ → 2(古い順)
// 経験値は answered / award から付ける(各画面で Xp.award を直接呼ばず、ここに集める)。answered は学習の記録(Streak)も1回足す
// キー操作(bindKeys)は画面を離れたら外す。長い一覧は lazyList で少しずつ描く
window.Cloze = (function () {
  const PREFS_KEY = `toolPrefs`;
  const esc = (s) => UI.escapeHtml(s);
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const isObj = (v) => (window.Storage && Storage.isPlainObject ? Storage.isPlainObject(v) : !!v && typeof v === `object` && !Array.isArray(v));
  const int = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

  // 分野(宅建士の5分野と消費税法)。色は .cat-*、アイコンは学習計画・進捗と同じ
  const CATS = [
    { id: `gyoho`, label: `宅建業法`, cls: `cat-gyoho`, icon: `scale` },
    { id: `kenri`, label: `権利関係`, cls: `cat-kenri`, icon: `gavel` },
    { id: `horei`, label: `法令上の制限`, cls: `cat-horei`, icon: `ruler` },
    { id: `zei`, label: `税・価格評定`, cls: `cat-zei`, icon: `receipt` },
    { id: `menjo`, label: `5問免除科目`, cls: `cat-menjo`, icon: `mountain` },
    { id: `shohiho`, label: `消費税法`, cls: `cat-shohi`, icon: `calculator` },
  ];
  function cat(id) {
    return CATS.find((c) => c.id === id) || { id, label: String(id || `その他`), cls: ``, icon: `tag` };
  }

  // ---- 経験値・学習の記録 ----
  // kind: numbers | compare | joubun、detail: { id, correct, unsure }
  function award(kind, detail) {
    try {
      return window.Xp && typeof Xp.award === `function` ? (Number(Xp.award(kind, detail)) || 0) : 0;
    } catch (e) {
      console.error(`[穴埋め] 経験値を記録できませんでした`, e);
      return 0;
    }
  }

  // 1つの空欄・1つの項目に答えたとき(1回だけ呼ぶ)。grade: 2 正解・覚えた / 1 あいまい / 0 誤り・まだ。戻り値は足した XP
  function answered(kind, id, grade) {
    try { if (window.Streak && typeof Streak.recordToday === `function`) Streak.recordToday(); } catch (e) { console.error(`[穴埋め] 学習の記録を付けられませんでした`, e); }
    return award(kind, { id, correct: grade >= 1, unsure: grade === 1 });
  }

  // ---- 記録 ----
  function readAll(key) {
    const v = window.Storage ? Storage.get(key, {}) : {};
    return isObj(v) ? v : {};
  }

  // 1件の記録を整えて返す(なければ null)。grade がない・null の記録(選んで埋めるの途中など)は null のまま(0 = 誤りにしない)
  function clean(s) {
    if (!isObj(s)) return null;
    const g = s.grade == null ? null : Number(s.grade);
    return Object.assign({}, s, {
      c: int(s.c),
      w: int(s.w),
      last: typeof s.last === `string` && window.DateUtil && DateUtil.isValid(s.last) ? s.last : null,
      grade: g === 0 || g === 1 || g === 2 ? g : null,
    });
  }

  function stats(key) {
    const all = readAll(key);
    const out = {};
    Object.keys(all).forEach((id) => { const s = clean(all[id]); if (s) out[id] = s; });
    return out;
  }

  // 記録を書き換える(保存の直前に読み直す)。fn(今の記録 | null) → 新しい記録。戻り値は新しい記録
  function update(key, id, fn) {
    const all = readAll(key);
    const next = fn(clean(all[id]));
    if (!isObj(next)) return null;
    all[id] = next;
    if (window.Storage) Storage.set(key, all);
    return next;
  }

  // 答えを1回記録する(正解・あいまいは c、誤り・まだは w。grade は最後の点)。extra は足したい項目
  function record(key, id, grade, extra) {
    return update(key, id, (s) => {
      const p = s || { c: 0, w: 0 };
      return Object.assign({}, p, extra || {}, {
        c: int(p.c) + (grade >= 1 ? 1 : 0),
        w: int(p.w) + (grade >= 1 ? 0 : 1),
        last: DateUtil.today(),
        grade,
      });
    });
  }

  // 苦手の順: 点 0(古い順)→ 1(古い順)→ まだ答えていない(元の順)→ 2(古い順)。ids は元の順(一覧の順)
  // 点のない記録(空欄の一部だけ答えて離れた・終えていない)は「まだ」の段。ただし誤りの方が多ければ点 0 と同じ段
  function rank(s) {
    if (!s || s.grade == null) return s && (s.c || s.w) && s.w > s.c ? 0 : 2;
    return s.grade === 0 ? 0 : s.grade === 1 ? 1 : 3;
  }
  function weakOrder(ids, st) {
    st = st || {};
    return ids.map((id, i) => ({ id, i, r: rank(st[id]), last: (st[id] && st[id].last) || `` }))
      .sort((a, b) => a.r - b.r || (a.r === 2 ? 0 : a.last < b.last ? -1 : a.last > b.last ? 1 : 0) || a.i - b.i)
      .map((x) => x.id);
  }
  // 覚えた(最後の点が 2)
  const known = (s) => !!s && s.grade === 2;

  // ---- 好み(最後に選んだ分野・やり方など。Storage `toolPrefs` = { numbers: { cat, group, mode, size }, joubun: { mode } }) ----
  function prefs(name) {
    const all = readAll(PREFS_KEY);
    return isObj(all[name]) ? Object.assign({}, all[name]) : {};
  }
  function setPrefs(name, patch) {
    const all = readAll(PREFS_KEY);
    all[name] = Object.assign({}, isObj(all[name]) ? all[name] : {}, patch);
    if (window.Storage) Storage.set(PREFS_KEY, all);
  }

  // ---- 選択肢 ----
  function shuffle(arr, rnd) {
    const r = typeof rnd === `function` ? rnd : Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 正解+誤りの選択肢(空・正解と同じ・重複は除く。多ければ max-1 個を選ぶ)を混ぜた並び
  function options(answer, alts, opts) {
    opts = opts || {};
    const max = opts.max || 4;
    const a = String(answer == null ? `` : answer).trim();
    const seen = new Set([a]);
    const others = [];
    (Array.isArray(alts) ? alts : []).forEach((x) => {
      const t = String(x == null ? `` : x).trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      others.push(t);
    });
    const pick = others.length > max - 1 ? shuffle(others.slice(), opts.rnd).slice(0, max - 1) : others;
    return shuffle([a].concat(pick), opts.rnd);
  }

  // 4択で出せるか(誤りの選択肢が2つ以上)。足りなければタップで答えを見て自分で採点する
  function canChoose(answer, alts) {
    return options(answer, alts).length >= 3;
  }

  // 空欄・括弧書きをつないだ文。parts: 文字列・{ b: 番号 }・{ omit: 文 }。fill(n) → 空欄 n の文字(既定は blanks[n].a)
  function textOf(parts, blanks, fill) {
    return (Array.isArray(parts) ? parts : []).map((p) => {
      if (typeof p === `string`) return p;
      if (p && Number.isInteger(p.b)) return fill ? fill(p.b) : (blanks && blanks[p.b] ? String(blanks[p.b].a) : ``);
      if (p && typeof p.omit === `string`) return p.omit;
      return ``;
    }).join(``);
  }

  // ---- 見た目の部品 ----
  // ○ △ × の印(端末の書体に頼らない線の図)
  function markSvg(kind, size) {
    const s = size || 24;
    const body = kind === `o` ? `<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.8"/>`
      : kind === `t` ? `<path d="M12 4.8l7.6 13.4H4.4z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>`
        : `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`;
    return `<svg class="tl-mark tl-mark-${kind}" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  const MARK_OF = { 2: `o`, 1: `t`, 0: `x` };
  const GRADE_WORD = { 2: `○`, 1: `△`, 0: `×` };

  // 自分で採点する3つのボタン(○ / △ / ×)。labels: { 2: '覚えた', 1: 'あいまい', 0: 'まだ' }、onGrade(点)。キーは 1 / 2 / 3
  function gradeRow(opts) {
    opts = opts || {};
    const labels = Object.assign({ 2: `覚えた`, 1: `あいまい`, 0: `まだ` }, opts.labels || {});
    const row = document.createElement(`div`);
    row.className = `tl-grade`;
    row.setAttribute(`role`, `group`);
    row.setAttribute(`aria-label`, opts.label || `覚えていたかを選ぶ`);
    row.dataset.role = `grade`;
    row.innerHTML = [2, 1, 0].map((g, i) => `
      <button type="button" class="tl-grade-btn is-g${g}" data-grade="${g}">
        ${markSvg(MARK_OF[g], 30)}<span class="tl-grade-label"><span class="sr-only">${GRADE_WORD[g]} </span>${esc(labels[g])}</span><kbd class="tl-key" aria-hidden="true">${i + 1}</kbd>
      </button>`).join(``);
    const guard = freshGuard();
    row.querySelectorAll(`[data-grade]`).forEach((b) => b.addEventListener(`click`, (e) => {
      if (row.dataset.done || !guard(e)) return;
      row.dataset.done = `1`;
      const g = Number(b.dataset.grade);
      row.querySelectorAll(`[data-grade]`).forEach((x) => { x.disabled = true; x.classList.toggle(`is-picked`, x === b); });
      if (opts.onGrade) opts.onGrade(g, b);
    }));
    return row;
  }

  // 4択の選択肢のタイル。texts: 選択肢の文字、onPick(番号, ボタン, イベント)。短い選択肢ばかりなら2列(is-grid)
  function choiceList(texts, opts) {
    opts = opts || {};
    const list = document.createElement(`div`);
    const short = texts.every((t) => Array.from(String(t)).length <= (opts.gridMax || 11));
    list.className = `choice-list tl-choices${short ? ` is-grid` : ``}`;
    list.setAttribute(`role`, `group`);
    list.setAttribute(`aria-label`, opts.label || `選択肢`);
    list.dataset.role = `choices`;
    const guard = freshGuard();
    texts.forEach((t, i) => {
      const btn = document.createElement(`button`);
      btn.type = `button`;
      btn.className = `btn choice-btn`;
      btn.dataset.choice = String(i);
      btn.innerHTML = `<span class="choice-key"><span class="choice-key-num">${i + 1}</span></span><span class="choice-body"><span class="choice-text">${esc(t)}</span></span>`;
      btn.addEventListener(`click`, (e) => {
        if (list.dataset.done || !guard(e)) return;
        if (opts.onPick) opts.onPick(i, btn, e);
      });
      list.appendChild(btn);
    });
    return list;
  }

  // 答えたあとの選択肢: 正解は緑の札に ✓、選んだ誤りは赤みのある札に ×。ほかは控えめに。押せなくする
  function paintChoices(list, answerIdx, picked) {
    list.dataset.done = `1`;
    Array.from(list.querySelectorAll(`.choice-btn`)).forEach((btn, i) => {
      btn.disabled = true;
      btn.classList.add(`is-done`);
      if (i === answerIdx) btn.classList.add(`correct`);
      else if (i === picked) btn.classList.add(`incorrect`);
      if (i === picked) btn.classList.add(`is-picked`);
      const key = btn.querySelector(`.choice-key`);
      if (key && (i === answerIdx || i === picked) && !key.querySelector(`.choice-key-mark`)) {
        key.classList.add(`has-mark`);
        key.insertAdjacentHTML(`beforeend`, `<span class="choice-key-mark" aria-hidden="true">${ic(i === answerIdx ? `check` : `x`, 18)}</span>`);
      }
      const tags = [];
      if (i === answerIdx) tags.push(`<span class="choice-tag is-answer">正解</span>`);
      if (i === picked) tags.push(`<span class="choice-tag is-mine">あなたの回答</span>`);
      if (tags.length) btn.querySelector(`.choice-body`).insertAdjacentHTML(`beforeend`, `<span class="choice-tags">${tags.join(``)}</span>`);
    });
  }

  // 判定(正解! / おしい! 正解は …)。sub: 補足の1行
  function verdictHtml(ok, answer, sub) {
    return `
      <div class="tl-verdict ${ok ? `is-ok` : `is-ng`}">
        <span class="tl-verdict-sticker" aria-hidden="true">${ic(ok ? `check` : `x`, 26)}</span>
        <span class="tl-verdict-text">
          <strong>${ok ? `正解!` : `おしい!`}</strong>
          ${!ok && answer != null ? `<span class="tl-verdict-answer">正解は <b>${esc(answer)}</b></span>` : ``}
          ${sub ? `<small>${sub}</small>` : ``}
        </span>
      </div>`;
  }

  // 読み上げ用の領域(画面に1つ)。say(文) で知らせる
  function live(wrap) {
    let el = wrap.querySelector(`:scope > [data-role="live"]`);
    if (!el) {
      el = document.createElement(`p`);
      el.className = `sr-only`;
      el.setAttribute(`role`, `status`);
      el.setAttribute(`aria-live`, `polite`);
      el.dataset.role = `live`;
      wrap.appendChild(el);
    }
    return {
      say(text) {
        el.textContent = ``;
        setTimeout(() => { el.textContent = text; }, 50);
      },
    };
  }

  // 画面のキー操作。fn(e) は入力欄・ダイアログ・修飾キーのときは呼ばない。画面を離れたら外す
  function bindKeys(wrap, fn) {
    function onKey(e) {
      if (!wrap.isConnected) { off(); return; }
      // キーの押しっぱなし(自動のくり返し)は受けない(答えるとすぐ次の空欄の選択肢が出るので、残りを同じ番号で答えてしまわないように)
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
      if (document.querySelector(`.modal-overlay, .sheet-backdrop, .onb-overlay`)) return;
      const ae = document.activeElement;
      if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
      fn(e);
    }
    function off() { document.removeEventListener(`keydown`, onKey); }
    document.addEventListener(`keydown`, onKey);
    if (window.UI && typeof UI.onLeave === `function`) UI.onLeave(wrap, off);
    return off;
  }

  // 長い一覧を少しずつ描く(最初に chunk 件、下に近づいたら次の chunk 件)。IntersectionObserver がなければ「もっと見る」
  // opts.size(まとまり) → 中の件数(「もっと見る(あと N表)」の数は中身の件数で数える。既定は1つ1件)・opts.unit: 単位(既定「件」)
  // 戻り値 { all() }: 残りを全部描く
  function lazyList(container, items, renderItem, opts) {
    opts = opts || {};
    const chunk = opts.chunk || 24;
    const sizeOf = typeof opts.size === `function` ? opts.size : () => 1;
    let i = 0;
    let io = null;
    const more = document.createElement(`button`);
    more.type = `button`;
    more.className = `btn load-more-btn tl-more`;
    more.dataset.role = `more`;
    function step(n) {
      const frag = document.createDocumentFragment();
      items.slice(i, i + n).forEach((it, k) => { const el = renderItem(it, i + k); if (el) frag.appendChild(el); });
      i = Math.min(items.length, i + n);
      container.appendChild(frag);
      if (i >= items.length) {
        if (io) io.disconnect();
        more.remove();
      } else more.textContent = `もっと見る(あと${items.slice(i).reduce((n, g) => n + (Number(sizeOf(g)) || 0), 0)}${opts.unit || `件`})`;
    }
    step(chunk);
    if (i < items.length) {
      container.after(more);
      more.addEventListener(`click`, () => step(chunk * 2));
      if (typeof IntersectionObserver === `function`) {
        io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting) && container.isConnected) step(chunk); }, { rootMargin: `600px 0px` });
        io.observe(more);
        if (window.UI && UI.onLeave) UI.onLeave(container, () => io.disconnect());
      }
    }
    return { all: () => step(items.length) };
  }

  // 根拠(法令ごとのチップ)・出典・関連する基礎知識のリンク。用語集と同じ部品(js/cardUi.js)があれば使う
  function lawRefHtml(ref) {
    if (!ref) return ``;
    if (window.CardUi && CardUi.buildLawRefHtml) return CardUi.buildLawRefHtml({ lawRef: ref });
    return `<p class="law-ref">${ic(`library`, 14)}<span class="law-ref-label">根拠</span><span class="law-chip">${esc(ref)}</span></p>`;
  }
  function sourcesHtml(ids) {
    const list = (Array.isArray(ids) ? ids : []).filter((id) => window.AppIndex && AppIndex.sourcesById && AppIndex.sourcesById[id]);
    if (!list.length) return ``;
    if (window.CardUi && CardUi.buildSourceCitationHtml) return CardUi.buildSourceCitationHtml({ sources: list });
    return `<div class="term-citation"><span class="term-citation-label">出典:</span><ul class="term-citation-list">${list.map((id) => {
      const s = AppIndex.sourcesById[id];
      return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.orgName || s.title || id)}${ic(`external`, 12)}</a></li>`;
    }).join(``)}</ul></div>`;
  }
  // 基礎知識・用語へのリンク(トピックの中にあればトピックの画面、なければ用語集)
  function basicLinksHtml(ids, max) {
    const terms = (Array.isArray(ids) ? ids : []).map((id) => (window.AppIndex && AppIndex.termsById ? AppIndex.termsById[id] : null)).filter(Boolean).slice(0, max || 4);
    if (!terms.length) return ``;
    return `<div class="chip-row tl-links">${terms.map((t) => {
      const topic = (t.topicIds || []).map((id) => AppIndex.topicsById[id]).find((tp) => tp && (tp.basicIds || []).includes(t.id));
      const href = topic ? `#topics/${encodeURIComponent(topic.id)}/${encodeURIComponent(t.id)}` : `#glossary/${encodeURIComponent(t.id)}`;
      return `<a class="chip chip-small chip-muted" href="${href}">${ic(topic ? `book-open` : `layers`, 14)}${esc(t.name)}</a>`;
    }).join(``)}</div>`;
  }

  // 結果の上の飾り(マスコット)。割合が高いほど元気な表情
  function heroMascot(pct, size) {
    if (!window.Mascot || typeof Mascot.svg !== `function`) return ``;
    return `<div class="tl-result-hero" aria-hidden="true">${Mascot.svg(pct >= 80 ? `cheer` : pct >= 50 ? `happy` : `think`, size || 96, { className: `tl-result-mascot` })}</div>`;
  }
  // 全問正解などのときの紙吹雪(動きを減らす設定では何もしない)
  function celebrate(el) {
    if (!el || !window.Mascot || typeof Mascot.confetti !== `function`) return;
    requestAnimationFrame(() => { if (el.isConnected) { try { Mascot.confetti(el); } catch (e) { /* 飾り */ } } });
  }

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  // 作った直後のタップは受けない(前の問題のボタンを2回押したとき、同じ場所に出た次の選択肢・ボタンを押してしまわないように)。
  // 戻り値 ok(e): 押してよいか。キー操作(e.detail === 0)はいつでも受ける
  function freshGuard(ms) {
    const t0 = Date.now();
    return (e) => !(e && e.detail > 0 && Date.now() - t0 < (ms || 320));
  }

  return {
    CATS, cat, award, answered, stats, update, record, weakOrder, known, prefs, setPrefs, shuffle, options, canChoose, textOf,
    markSvg, gradeRow, choiceList, paintChoices, verdictHtml, live, bindKeys, lazyList, lawRefHtml, sourcesHtml, basicLinksHtml,
    heroMascot, celebrate, pct, freshGuard, GRADE_WORD,
  };
})();

// 数字ドリルの出題中(結果の前)・比較表/条文の穴埋めの答えの欄があるあいだは、ダイアログのお祝い(レベルアップ・バッジ)を待つ
// (Motion.busy(true) の「途中」に足す。結果の画面・ほかの画面へ移ったあとに出る)
if (window.Motion && typeof Motion.addBusyCheck === `function`) {
  Motion.addBusyCheck(() => {
    if (document.querySelector(`.tl-panel, .tl-view.is-filling`)) return true;
    try { return !!document.querySelector(`.tl-run:not(:has(.tl-result))`); } catch (e) { return false; }
  });
}
