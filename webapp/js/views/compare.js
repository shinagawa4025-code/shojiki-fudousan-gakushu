// 比較表で覚える(v14)。似た制度を表で見比べ、穴埋めで確かめる
// ルート: #compare(分野ごとの表の一覧)/ #compare/<表の id>(表を見る)/ #compare/<表の id>/fill(穴埋め)
// 表: 行の見出し+列。スマホ(599px 以下)では1行を1枚のカード(列の名前と値を縦に)にして、ページを横にはみ出させない。
//     PC・タブレットでは表の形。どちらも role="table" などを付けて、読み上げでは表として読む
// 穴埋め: keys のマスを空欄にする。選択肢は同じ列のほかの値+正解(混ぜる。最大4つ)。ほかの値が2つ未満なら、タップで答えを見て
//         自分で採点(○△×)。下に貼り付く欄で1マスずつ答え、答えるとすぐ次の空欄へ(前の空欄の判定は欄の上と表のマスに残す)。
//         全部答えたら結果(正解の数・経験値・間違えたマスだけもう一度)
// 記録: Storage `compareStats` = { 表の id: { c, w, last, done(穴埋めを終えた回数), lastOk, lastN, grade } }(js/cloze.js)
window.Views = window.Views || {};
window.Views.compare = (function () {
  const KEY = `compareStats`;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  function tables() {
    const d = window.APP_DATA && APP_DATA.compareTables;
    return Array.isArray(d) ? d.filter(valid) : [];
  }
  function valid(t) {
    return t && typeof t.id === `string` && Array.isArray(t.cols) && t.cols.length && Array.isArray(t.rows) && t.rows.length
      && t.rows.every((r) => r && Array.isArray(r.cells) && r.cells.length === t.cols.length);
  }
  // 空欄にするマス(範囲の外・重複は除く)
  function keysOf(t) {
    const seen = new Set();
    return (Array.isArray(t.keys) ? t.keys : []).filter((k) => {
      if (!Array.isArray(k) || !t.rows[k[0]] || !Number.isInteger(k[1]) || k[1] < 0 || k[1] >= t.cols.length) return false;
      const id = `${k[0]}-${k[1]}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).map((k) => ({ r: k[0], c: k[1], id: `${k[0]}-${k[1]}` }));
  }
  const cell = (t, r, c) => String(t.rows[r].cells[c] == null ? `` : t.rows[r].cells[c]);

  // 同じ列のほかの値(正解と同じ値は除く)
  function columnAlts(t, k) {
    const a = cell(t, k.r, k.c).trim();
    return t.rows.map((row, i) => (i === k.r ? null : cell(t, i, k.c).trim())).filter((v) => v && v !== a);
  }

  function catsOf(list) {
    const order = Cloze.CATS.map((c) => c.id);
    const ids = [];
    list.forEach((t) => { if (!ids.includes(t.cat)) ids.push(t.cat); });
    return ids.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).map(Cloze.cat);
  }

  // ---------- 一覧 ----------
  function renderList(root) {
    const list = tables();
    const st = Cloze.stats(KEY);
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view compare-view`;
    wrap.innerHTML = `
      <div class="tl-hero">
        <span class="sticker sticker-lg" aria-hidden="true">${ic(`grid`, 28)}</span>
        <div class="tl-hero-main">
          <h2>比較表で覚える</h2>
          <p class="tl-lead">似た制度を表で見比べて、大事なマスを穴埋めで確かめます。</p>
        </div>
      </div>`;
    root.appendChild(wrap);
    if (!list.length) {
      wrap.appendChild(UI.emptyState({ icon: `grid`, title: `準備中です`, body: `比較表のデータを準備しています。もうしばらくお待ちください。`, cta: { label: `学習トピックへ`, nav: `#topics` } }));
      return;
    }
    const doneN = list.filter((t) => st[t.id] && st[t.id].done).length;
    const perfectN = list.filter((t) => Cloze.known(st[t.id])).length;
    const prog = document.createElement(`section`);
    prog.className = `card tl-progress`;
    prog.setAttribute(`aria-label`, `穴埋めをした表`);
    prog.innerHTML = `
      <div class="tl-progress-head"><span class="tl-progress-label">穴埋めをした表</span><span class="tl-progress-num"><strong class="num">${doneN}</strong><span class="num"> / ${list.length}</span></span></div>
      <div class="progress-bar" role="progressbar" aria-label="穴埋めをした表の割合" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${doneN}"><div class="progress-bar-fill${doneN === list.length ? ` fill-success` : ``}" style="width:${Cloze.pct(doneN, list.length)}%"></div></div>
      <p class="tl-progress-sub">前回 全問正解 <b class="num">${perfectN}</b></p>`;
    wrap.appendChild(prog);

    const box = document.createElement(`div`);
    box.className = `tl-groups`;
    box.dataset.role = `groups`;
    wrap.appendChild(box);
    const groups = catsOf(list).map((c) => ({ c, items: list.filter((t) => t.cat === c.id) }));
    Cloze.lazyList(box, groups, (g) => {
      const sec = document.createElement(`section`);
      sec.className = `tl-group ${g.c.cls}`;
      sec.innerHTML = `
        <h3 class="tl-group-title">${esc(g.c.label)}${g.c.id === `shohiho` ? `<span class="hub-tile-badge tl-badge">税理士</span>` : ``}<span class="tl-group-n num">${g.items.length}表</span></h3>
        <ul class="list-group tl-table-list">
          ${g.items.map((t) => {
            const s = st[t.id];
            const n = keysOf(t).length;
            const status = s && s.done ? `<span class="tl-row-status${s.grade === 2 ? ` is-ok` : ``}">前回 <b class="num">${s.lastOk}/${s.lastN}</b></span>` : `<span class="tl-row-status is-new">まだ</span>`;
            return `
            <li>
              <a class="list-row ${g.c.cls}" href="#compare/${encodeURIComponent(t.id)}" data-id="${esc(t.id)}">
                <span class="list-row-icon${s && s.grade === 2 ? ` is-ok` : ``}" aria-hidden="true">${ic(s && s.grade === 2 ? `check` : `grid`, 20)}</span>
                <span class="list-row-main"><span class="list-row-title">${esc(t.title)}</span><span class="list-row-sub">${t.rows.length}行 × ${t.cols.length}列${n ? `・穴埋め ${n}か所` : ``}</span></span>
                ${status}${ic(`chevron-right`)}
              </a>
            </li>`;
          }).join(``)}
        </ul>`;
      return sec;
    }, { chunk: 3 });
  }

  // ---------- 表 ----------
  function tableHtml(t, opts) {
    opts = opts || {};
    const blanks = opts.blanks || {};
    const cols = t.cols.length;
    return `
      <div class="tl-table${cols >= 4 ? ` is-wide` : ``}" role="table" aria-label="${esc(t.title)}" style="--cols:${cols}" data-role="grid">
        <div class="tl-tr tl-thead" role="row">
          <span class="tl-th tl-corner" role="columnheader"><span class="sr-only">区分</span></span>
          ${t.cols.map((c) => `<span class="tl-th" role="columnheader">${esc(c)}</span>`).join(``)}
        </div>
        ${t.rows.map((row, r) => `
          <div class="tl-tr" role="row">
            <span class="tl-rh" role="rowheader">${esc(row.label)}</span>
            ${row.cells.map((v, c) => {
              const b = blanks[`${r}-${c}`];
              return `<span class="tl-td${b ? ` has-blank` : ``}" role="cell"><span class="tl-td-label" aria-hidden="true">${esc(t.cols[c])}</span><span class="tl-td-val">${b ? b : esc(v)}</span></span>`;
            }).join(``)}
          </div>`).join(``)}
      </div>`;
  }

  function notesHtml(t) {
    const notes = (Array.isArray(t.notes) ? t.notes : []).filter((n) => typeof n === `string` && n);
    const body = `
      ${notes.length ? `<ul class="tl-notes-list">${notes.map((n) => `<li>${esc(n)}</li>`).join(``)}</ul>` : ``}
      ${Cloze.lawRefHtml(t.lawRef)}
      ${Cloze.basicLinksHtml(t.basicIds, 4)}
      ${Cloze.sourcesHtml(t.sources)}`;
    return body.trim() ? `<section class="card tl-notes" aria-label="補足と根拠"><h3 class="tl-label">${ic(`lightbulb`, 16)}補足と根拠</h3>${body}</section>` : ``;
  }

  function renderTable(root, id, modeParam) {
    const list = tables();
    const idx = list.findIndex((x) => x.id === id);
    const t = list[idx];
    if (!t) {
      const wrap = document.createElement(`div`);
      wrap.className = `view tl-view compare-view`;
      wrap.innerHTML = `<a class="btn back-btn" href="#compare">${ic(`chevron-left`)}比較表の一覧</a><h2>比較表</h2>`;
      wrap.appendChild(UI.emptyState({ icon: `grid`, title: `表が見つかりません`, body: `一覧から選び直してください。`, cta: { label: `比較表の一覧へ`, nav: `#compare` } }));
      root.appendChild(wrap);
      return;
    }
    const c = Cloze.cat(t.cat);
    const keys = keysOf(t);
    let mode = modeParam === `fill` && keys.length ? `fill` : `view`;
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view compare-view tl-table-view ${c.cls}`;
    const prev = list[idx - 1];
    const next = list[idx + 1];
    wrap.innerHTML = `
      <a class="btn back-btn" href="#compare">${ic(`chevron-left`)}比較表の一覧</a>
      <p class="tl-eyebrow"><span class="tl-tag"><span class="tl-tag-dot" aria-hidden="true"></span>${esc(c.label)}</span>${t.cat === `shohiho` ? `<span class="hub-tile-badge tl-badge">税理士</span>` : ``}</p>
      <h2>${esc(t.title)}</h2>
      ${t.intro ? `<p class="tl-lead">${esc(t.intro)}</p>` : ``}
      ${keys.length ? `<div class="segmented seg-bold tl-seg tl-mode" role="group" aria-label="表の使い方" data-role="modes">
        <button type="button" class="segmented-item" data-mode="view" aria-pressed="${mode === `view`}">${ic(`eye`, 16)}表を見る</button>
        <button type="button" class="segmented-item" data-mode="fill" aria-pressed="${mode === `fill`}">${ic(`pencil-check`, 16)}穴埋め<span class="segmented-count num">${keys.length}</span></button>
      </div>` : ``}
      <div class="tl-table-box" data-role="table"></div>
      <div class="tl-panel-slot" data-role="panel-slot"></div>
      ${notesHtml(t)}
      <nav class="tl-pager" aria-label="ほかの表">
        ${prev ? `<a class="tl-pager-link" href="#compare/${encodeURIComponent(prev.id)}">${ic(`chevron-left`, 16)}<span><small>前の表</small><span class="tl-pager-name">${esc(prev.title)}</span></span></a>` : `<span></span>`}
        ${next ? `<a class="tl-pager-link is-next" href="#compare/${encodeURIComponent(next.id)}"><span><small>次の表</small><span class="tl-pager-name">${esc(next.title)}</span></span>${ic(`chevron-right`, 16)}</a>` : ``}
      </nav>`;
    root.appendChild(wrap);
    const tableBox = wrap.querySelector(`[data-role="table"]`);
    const slot = wrap.querySelector(`[data-role="panel-slot"]`);
    const live = Cloze.live(wrap);
    let keyAct = null;

    function setMode(m, push) {
      mode = m;
      wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.mode === m)));
      if (push !== false) {
        try { history.replaceState(history.state, ``, m === `fill` ? `#compare/${encodeURIComponent(t.id)}/fill` : `#compare/${encodeURIComponent(t.id)}`); } catch (e) { /* 無視 */ }
      }
      if (m === `fill`) startFill(keys);
      else showView();
    }

    function showView() {
      keyAct = null;
      wrap.classList.remove(`is-filling`);
      tableBox.innerHTML = tableHtml(t);
      slot.innerHTML = ``;
    }

    // 穴埋め。list: 空欄にするマス(全部か、間違えたマスだけ)
    function startFill(list) {
      wrap.classList.add(`is-filling`);
      const run = list.map((k, i) => {
        const opts = Cloze.options(cell(t, k.r, k.c), columnAlts(t, k));
        return Object.assign({}, k, { n: i, answer: cell(t, k.r, k.c).trim(), opts, choose: opts.length >= 3, done: false, grade: null, picked: null });
      });
      let cur = 0;
      let lastNote = null; // 前の空欄の判定 { ok, text }
      let xp = 0;
      const byId = {};
      run.forEach((b) => { byId[b.id] = b; });

      function blankBtn(b) {
        const label = `「${t.rows[b.r].label}」の「${t.cols[b.c]}」`;
        if (!b.done) {
          return `<button type="button" class="tl-blank is-q${b.n === cur ? ` is-current` : ``}" data-key="${b.id}" aria-label="${esc(label)}(空欄 ${b.n + 1})"${b.n === cur ? ` aria-current="true"` : ``}><span class="tl-blank-n num" aria-hidden="true">${b.n + 1}</span><span aria-hidden="true">？</span></button>`;
        }
        const ok = b.grade >= 1;
        const word = b.choose ? (ok ? `正解` : `不正解`) : { 2: `覚えていた`, 1: `あいまい`, 0: `まだ` }[b.grade];
        return `<span class="tl-blank is-filled ${b.grade === 2 ? `is-ok` : b.grade === 1 ? `is-shown` : `is-ng`}${Array.from(b.answer).length > 9 ? ` is-long` : ``}" data-key="${b.id}">${esc(b.answer)}<span class="sr-only">(${word}${b.choose && !ok && b.picked ? `。あなたの回答は ${esc(b.picked)}` : ``})</span></span>`;
      }

      function paintTable() {
        const blanks = {};
        run.forEach((b) => { blanks[b.id] = blankBtn(b); });
        tableBox.innerHTML = tableHtml(t, { blanks });
        tableBox.querySelectorAll(`button.tl-blank`).forEach((btn) => btn.addEventListener(`click`, () => {
          const b = byId[btn.dataset.key];
          if (!b || b.done) return;
          cur = b.n;
          paint();
          const focusEl = slot.querySelector(`.choice-btn, [data-role="reveal"]`);
          if (focusEl) focusEl.focus({ preventScroll: true });
        }));
      }

      function nextOpen(from) {
        for (let i = 1; i <= run.length; i++) {
          const b = run[(from + i) % run.length];
          if (!b.done) return b.n;
        }
        return -1;
      }

      function finishBlank(b, grade, picked) {
        b.done = true;
        b.grade = grade;
        b.picked = picked || null;
        Cloze.update(KEY, t.id, (s) => {
          const p = s || { c: 0, w: 0, done: 0 };
          return Object.assign({}, p, { c: (p.c || 0) + (grade >= 1 ? 1 : 0), w: (p.w || 0) + (grade >= 1 ? 0 : 1), last: DateUtil.today() });
        });
        xp += Cloze.answered(`compare`, `${t.id}:${b.id}`, grade);
        const label = `「${t.rows[b.r].label}」の「${t.cols[b.c]}」`;
        lastNote = { ok: grade >= 1, grade, choose: b.choose, text: b.answer };
        live.say(b.choose ? (grade >= 1 ? `正解。${label}は${b.answer}` : `不正解。${label}は${b.answer}`) : `${label}は${b.answer}`);
        cur = nextOpen(b.n);
        if (cur < 0) finish();
        else paint(true);
      }

      function finish() {
        keyAct = null;
        const ok = run.filter((b) => b.grade === 2).length;
        const n = run.length;
        const full = n === keys.length;
        const grade = ok === n ? 2 : ok / n >= 0.5 ? 1 : 0;
        Cloze.update(KEY, t.id, (s) => {
          const p = s || { c: 0, w: 0 };
          return Object.assign({}, p, { done: (p.done || 0) + 1, last: DateUtil.today(), lastOk: full ? ok : Math.min(keys.length, (keys.length - n) + ok), lastN: keys.length, grade: full ? grade : (ok === n ? 2 : Math.min(1, grade)) });
        });
        wrap.classList.remove(`is-filling`);
        paintTable();
        const missed = run.filter((b) => b.grade < 2);
        const p = Cloze.pct(ok, n);
        slot.innerHTML = ``;
        const box = document.createElement(`section`);
        box.className = `card tl-result`;
        box.setAttribute(`aria-label`, `穴埋めの結果`);
        box.innerHTML = `
          ${Cloze.heroMascot(p, 80)}
          <h3 class="tl-result-title" tabindex="-1">${ok === n ? `全部正解!` : `おつかれさまでした`}</h3>
          <p class="tl-result-score"><strong class="big-num num">${ok}</strong><span class="num"> / ${n}</span><span class="tl-result-unit">正解</span></p>
          ${xp ? `<p class="tl-xp"><span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`bolt`, 16)}</span><span>経験値 <b class="num">+${xp}</b></span></p>` : ``}
          <div class="tl-result-actions">
            ${missed.length ? `<button type="button" class="btn btn-lg btn-block" data-role="retry-missed">${ic(`repeat`, 20)}<span>間違えたマスだけもう一度(${missed.length}か所)</span></button>` : ``}
            <button type="button" class="btn btn-lg btn-block${missed.length ? ` btn-secondary` : ``}" data-role="again">${ic(`refresh`, 20)}<span>もう一度 全部</span></button>
            <button type="button" class="btn btn-secondary btn-block" data-role="to-view">${ic(`eye`, 18)}<span>表を見る</span></button>
            ${next ? `<a class="btn btn-secondary btn-block" href="#compare/${encodeURIComponent(next.id)}/fill" data-role="next-table">${ic(`arrow-right`, 18)}<span>次の表へ</span></a>` : ``}
          </div>`;
        slot.appendChild(box);
        const retry = box.querySelector(`[data-role="retry-missed"]`);
        if (retry) retry.addEventListener(`click`, () => { startFill(missed.map((b) => ({ r: b.r, c: b.c, id: b.id }))); scrollToTable(); });
        box.querySelector(`[data-role="again"]`).addEventListener(`click`, () => { startFill(keys); scrollToTable(); });
        box.querySelector(`[data-role="to-view"]`).addEventListener(`click`, () => { setMode(`view`); scrollToTable(); });
        if (window.Motion && Motion.countIn) { try { Motion.countIn(box); } catch (e) { /* 飾り */ } }
        if (ok === n) Cloze.celebrate(box.querySelector(`.tl-result-hero`) || box);
        box.querySelector(`.tl-result-title`).focus({ preventScroll: true });
        UI.scrollIntoView(box, `start`);
      }

      // 下に貼り付く欄: 前の空欄の判定・いまの空欄の問い・選択肢(または「答えを見る」→ ○△×)
      function paint(afterAnswer) {
        paintTable();
        const b = run[cur];
        const doneN = run.filter((x) => x.done).length;
        slot.innerHTML = ``;
        const panel = document.createElement(`section`);
        panel.className = `tl-panel`;
        panel.setAttribute(`aria-label`, `穴埋めの答え`);
        panel.dataset.role = `panel`;
        const prevHtml = lastNote ? (lastNote.choose
          ? `<p class="tl-panel-prev ${lastNote.ok ? `is-ok` : `is-ng`}">${Cloze.markSvg(lastNote.ok ? `o` : `x`, 18)}<span>${lastNote.ok ? `正解!` : `おしい! 正解は <b>${esc(lastNote.text)}</b>`}</span></p>`
          : `<p class="tl-panel-prev is-g${lastNote.grade}">${Cloze.markSvg({ 2: `o`, 1: `t`, 0: `x` }[lastNote.grade], 18)}<span>答えは <b>${esc(lastNote.text)}</b></span></p>`) : ``;
        panel.innerHTML = `
          ${prevHtml}
          <div class="tl-panel-top">
            <p class="tl-panel-q">「${esc(t.rows[b.r].label)}」の<b>${esc(t.cols[b.c])}</b>は?</p>
            <span class="tl-panel-done num">${doneN + 1} / ${run.length}<span class="sr-only">か所目</span></span>
          </div>
          <div data-role="answer"></div>`;
        const ans = panel.querySelector(`[data-role="answer"]`);
        if (b.choose) {
          const choose = (i) => {
            if (b.done) return;
            const ok = b.opts[i] === b.answer;
            finishBlank(b, ok ? 2 : 0, b.opts[i]);
          };
          const list = Cloze.choiceList(b.opts, { label: `「${t.rows[b.r].label}」の「${t.cols[b.c]}」の選択肢`, gridMax: 14, onPick: (i) => choose(i) });
          ans.appendChild(list);
          keyAct = (e) => {
            if (/^[1-4]$/.test(e.key) && list.querySelectorAll(`.choice-btn`)[Number(e.key) - 1]) { e.preventDefault(); choose(Number(e.key) - 1); }
          };
        } else {
          ans.innerHTML = `<button type="button" class="btn btn-lg btn-block tl-reveal" data-role="reveal">${ic(`eye`, 20)}<span>答えを見る</span><kbd class="tl-key" aria-hidden="true">Space</kbd></button>`;
          const reveal = () => {
            if (ans.dataset.shown) return;
            ans.dataset.shown = `1`;
            ans.innerHTML = `<p class="tl-panel-answer">答え: <b>${esc(b.answer)}</b></p>`;
            const row = Cloze.gradeRow({ labels: { 2: `合っていた`, 1: `あいまい`, 0: `違った` }, onGrade: (g) => finishBlank(b, g) });
            ans.appendChild(row);
            live.say(`答えは ${b.answer}`);
            row.querySelector(`[data-grade]`).focus({ preventScroll: true });
          };
          const fresh = Cloze.freshGuard();
          ans.querySelector(`[data-role="reveal"]`).addEventListener(`click`, (e) => { if (fresh(e)) reveal(); });
          keyAct = (e) => {
            if (!ans.dataset.shown) {
              if ((e.key === ` ` || e.key === `Enter`) && !(e.target.closest && e.target.closest(`a, button:not([data-role="reveal"])`))) { e.preventDefault(); reveal(); }
              return;
            }
            if (/^[1-3]$/.test(e.key)) {
              const btn = ans.querySelectorAll(`[data-grade]`)[Number(e.key) - 1];
              if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
            }
          };
        }
        slot.appendChild(panel);
        // 空欄が貼り付く欄の裏に隠れないよう、欄の高さ分の余白を空欄に持たせる
        wrap.style.setProperty(`--tl-panel-h`, `${panel.offsetHeight}px`);
        const curBtn = tableBox.querySelector(`.tl-blank.is-current`);
        if (curBtn && afterAnswer) {
          const r = curBtn.getBoundingClientRect();
          const pr = panel.getBoundingClientRect();
          if (r.bottom > pr.top - 8 || r.top < 0) curBtn.scrollIntoView({ block: `nearest`, behavior: UI.prefersReducedMotion() ? `auto` : `smooth` });
        }
        if (afterAnswer) {
          const f = ans.querySelector(`.choice-btn, [data-role="reveal"]`);
          if (f && document.activeElement && (document.activeElement === document.body || !document.activeElement.isConnected || slot.contains(document.activeElement) || tableBox.contains(document.activeElement))) f.focus({ preventScroll: true });
        }
      }

      paint();
    }

    function scrollToTable() {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      if (tableBox.getBoundingClientRect().top < pad) tableBox.scrollIntoView({ block: `start` });
    }

    wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.addEventListener(`click`, () => {
      if (b.getAttribute(`aria-pressed`) === `true`) return;
      setMode(b.dataset.mode);
    }));
    Cloze.bindKeys(wrap, (e) => { if (keyAct) keyAct(e); });
    setMode(mode, false);
  }

  function render(root, param) {
    const parts = String(param || ``).split(`/`);
    if (parts[0]) renderTable(root, parts[0], parts[1] || null);
    else renderList(root);
  }

  return { render, _internal: { tables, keysOf, columnAlts } };
})();
