// 数字まとめドリル(v14)。宅建士試験で覚える数字(期間・金額・面積・割合など)をカードと4択の穴埋めで覚える
// ルート: #numbers(分野・まとまり・やり方・問題数を選ぶ)/ #numbers/run(出題中。組は画面の外に持つので、戻る→進むで続きから)/
//         #numbers/list・#numbers/list/<分野>(答えを入れた文の一覧。押すと根拠)
// やり方: カードでめくる(答えを見て ○ 覚えた / △ あいまい / × まだ)・4択で埋める(正解 / 誤り)。問題数 10・20・すべて
// 出す順: 前回まちがえた → あいまい → まだ → 覚えた(古い順)から問題数だけ選び、混ぜて出す。結果から「間違えたものだけもう一度」
// 記録: Storage `numbersStats` = { id: { c, w, last, grade } }(js/cloze.js)。好み: `toolPrefs`.numbers = { cat, group, mode, size }
window.Views = window.Views || {};
window.Views.numbers = (function () {
  const KEY = `numbersStats`;
  const ALL = `all`;
  const SIZES = [10, 20, 0]; // 0 = すべて
  const MODES = [{ id: `card`, label: `カードでめくる`, icon: `refresh` }, { id: `choice`, label: `4択で埋める`, icon: `pencil-check` }];
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);

  // 出題中の組(画面を作り直しても続けられるよう、画面の外に持つ)
  let session = null;

  function items() {
    const d = window.APP_DATA && APP_DATA.numbers;
    return Array.isArray(d) ? d.filter((it) => it && typeof it.id === `string` && typeof it.q === `string` && it.q.split(`{}`).length === 2 && typeof it.a === `string`) : [];
  }

  // データにある分野(決まった順。知らない分野は最後に)
  function catsOf(list) {
    const ids = [];
    list.forEach((it) => { if (!ids.includes(it.cat)) ids.push(it.cat); });
    const order = Cloze.CATS.map((c) => c.id);
    return ids.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).map(Cloze.cat);
  }

  // まとまり(データに出てきた順)
  function groupsOf(list) {
    const out = [];
    list.forEach((it) => {
      const name = it.group || `その他`;
      let g = out.find((x) => x.name === name && x.cat === it.cat);
      if (!g) { g = { name, cat: it.cat, items: [] }; out.push(g); }
      g.items.push(it);
    });
    return out;
  }

  // 空欄の前後の文
  function sides(it) {
    const [before, after] = it.q.split(`{}`);
    return { before, after };
  }
  function sentenceHtml(it, blank) {
    const s = sides(it);
    return `${esc(s.before)}${blank}${esc(s.after)}`;
  }

  // 正解を入れた読み上げ用の文
  function plainSentence(it) {
    const s = sides(it);
    return `${s.before}${it.a}${s.after}`;
  }

  function markHtml(st) {
    if (!st || st.grade == null) return `<span class="tl-mini-mark is-none" aria-hidden="true"></span>`;
    const word = { 2: `前回: 覚えた`, 1: `前回: あいまい`, 0: `前回: まちがえた` }[st.grade];
    return `<span class="tl-mini-mark is-g${st.grade}">${Cloze.markSvg({ 2: `o`, 1: `t`, 0: `x` }[st.grade], 16)}<span class="sr-only">${word}</span></span>`;
  }

  function filterList(list, catId, group) {
    return list.filter((it) => (catId === ALL || it.cat === catId) && (!group || group === ALL || (it.group || `その他`) === group));
  }

  // ---------- 選ぶ画面 ----------
  function renderSetup(root) {
    const list = items();
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view numbers-view`;
    root.appendChild(wrap);
    wrap.innerHTML = `
      <div class="tl-hero">
        <span class="sticker sticker-lg" aria-hidden="true">${ic(`percent`, 28)}</span>
        <div class="tl-hero-main">
          <h2>数字まとめドリル</h2>
          <p class="tl-lead">期間・金額・面積・割合など、宅建士試験で覚える数字を、カードと4択の穴埋めで確かめます。</p>
        </div>
      </div>`;
    if (!list.length) {
      wrap.appendChild(UI.emptyState({ icon: `percent`, title: `準備中です`, body: `数字のデータを準備しています。もうしばらくお待ちください。`, cta: { label: `4択問題へ`, nav: `#quiz` } }));
      return;
    }
    const st = Cloze.stats(KEY);
    const p = Cloze.prefs(`numbers`);
    const cats = catsOf(list);
    let catId = cats.some((c) => c.id === p.cat) ? p.cat : ALL;
    let group = typeof p.group === `string` ? p.group : ALL;
    let mode = MODES.some((m) => m.id === p.mode) ? p.mode : `card`;
    let size = SIZES.includes(Number(p.size)) ? Number(p.size) : 10;

    const knownN = list.filter((it) => Cloze.known(st[it.id])).length;
    const wrongN = list.filter((it) => st[it.id] && st[it.id].grade === 0).length;
    const unseenN = list.filter((it) => !st[it.id]).length;

    const prog = document.createElement(`section`);
    prog.className = `card tl-progress`;
    prog.setAttribute(`aria-label`, `覚えた数字`);
    prog.innerHTML = `
      <div class="tl-progress-head"><span class="tl-progress-label">覚えた数字</span><span class="tl-progress-num"><strong class="num">${knownN}</strong><span class="num"> / ${list.length}</span></span></div>
      <div class="progress-bar" role="progressbar" aria-label="覚えた数字の割合" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${knownN}"><div class="progress-bar-fill${knownN === list.length ? ` fill-success` : ``}" style="width:${Cloze.pct(knownN, list.length)}%"></div></div>
      <p class="tl-progress-sub">${wrongN ? `前回まちがえた <b class="num">${wrongN}</b>・` : ``}まだ <b class="num">${unseenN}</b></p>`;
    wrap.appendChild(prog);

    const setup = document.createElement(`section`);
    setup.className = `card tl-setup`;
    setup.setAttribute(`aria-label`, `出題の設定`);
    setup.innerHTML = `
      <h3 class="tl-label" id="num-cat-label">分野</h3>
      <div class="chip-row chip-row-scroll tl-chips" role="group" aria-labelledby="num-cat-label" data-role="cats"></div>
      <h3 class="tl-label" id="num-group-label">まとまり</h3>
      <div class="chip-row chip-row-scroll tl-chips" role="group" aria-labelledby="num-group-label" data-role="groups"></div>
      <h3 class="tl-label" id="num-mode-label">やり方</h3>
      <div class="segmented seg-bold tl-seg" role="group" aria-labelledby="num-mode-label" data-role="modes">
        ${MODES.map((m) => `<button type="button" class="segmented-item" data-mode="${m.id}" aria-pressed="${m.id === mode}">${ic(m.icon, 16)}${m.label}</button>`).join(``)}
      </div>
      <h3 class="tl-label" id="num-size-label">問題数</h3>
      <div class="segmented seg-bold tl-seg" role="group" aria-labelledby="num-size-label" data-role="sizes"></div>
      <button type="button" class="btn btn-lg btn-block tl-start" data-role="start">${ic(`play`, 20)}<span>はじめる</span></button>
      <p class="tl-start-note">前回まちがえた数字・まだの数字から先に出します。</p>`;
    wrap.appendChild(setup);

    const links = document.createElement(`div`);
    links.className = `tl-foot-links`;
    links.innerHTML = `<a class="link-btn" href="#numbers/list" data-role="to-list">${ic(`list`, 16)}数字の一覧を見る${ic(`chevron-right`, 16)}</a>`;
    wrap.appendChild(links);

    const catsEl = setup.querySelector(`[data-role="cats"]`);
    const groupsEl = setup.querySelector(`[data-role="groups"]`);
    const sizesEl = setup.querySelector(`[data-role="sizes"]`);

    function pool() { return filterList(list, catId, group); }

    function paint() {
      const inCat = filterList(list, catId, ALL);
      // まとまりの札は名前ごと(「すべて」の分野で同じ名前のまとまりが2つの分野にあれば1つにまとめる)
      const groups = [];
      inCat.forEach((it) => {
        const name = it.group || `その他`;
        const g = groups.find((x) => x.name === name);
        if (g) g.items.push(it); else groups.push({ name, items: [it] });
      });
      if (group !== ALL && !groups.some((g) => g.name === group)) group = ALL;
      catsEl.innerHTML = [{ id: ALL, label: `すべて`, n: list.length }].concat(cats.map((c) => ({ id: c.id, label: c.label, n: list.filter((it) => it.cat === c.id).length, cls: c.cls })))
        .map((c) => `<button type="button" class="chip chip-small${c.cls ? ` ${c.cls}` : ``}" data-cat="${c.id}" aria-pressed="${c.id === catId}">${esc(c.label)}<span class="tl-chip-n num">${c.n}</span></button>`).join(``);
      groupsEl.innerHTML = [{ name: ALL, label: `すべて`, n: inCat.length }].concat(groups.map((g) => ({ name: g.name, label: g.name, n: g.items.length })))
        .map((g) => `<button type="button" class="chip chip-small" data-group="${esc(g.name)}" aria-pressed="${g.name === group}">${esc(g.label)}<span class="tl-chip-n num">${g.n}</span></button>`).join(``);
      const n = pool().length;
      sizesEl.innerHTML = SIZES.filter((s) => s === 0 || s < n).map((s) => `<button type="button" class="segmented-item" data-size="${s}" aria-pressed="${s === size || (s === 0 && size >= n)}">${s ? `${s}問` : `すべて(${n}問)`}</button>`).join(``);
      links.querySelector(`[data-role="to-list"]`).setAttribute(`href`, catId === ALL ? `#numbers/list` : `#numbers/list/${catId}`);
    }

    function save() { Cloze.setPrefs(`numbers`, { cat: catId, group, mode, size }); }

    catsEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-cat]`);
      if (!b) return;
      catId = b.dataset.cat;
      group = ALL;
      save();
      paint();
      const now = catsEl.querySelector(`[aria-pressed="true"]`);
      if (now) now.focus({ preventScroll: true });
    });
    groupsEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-group]`);
      if (!b) return;
      group = b.dataset.group;
      save();
      paint();
      const now = groupsEl.querySelector(`[aria-pressed="true"]`);
      if (now) now.focus({ preventScroll: true });
    });
    setup.querySelector(`[data-role="modes"]`).addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-mode]`);
      if (!b) return;
      mode = b.dataset.mode;
      setup.querySelectorAll(`[data-mode]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
      save();
    });
    sizesEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-size]`);
      if (!b) return;
      size = Number(b.dataset.size);
      sizesEl.querySelectorAll(`[data-size]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
      save();
    });
    setup.querySelector(`[data-role="start"]`).addEventListener(`click`, () => {
      const chosen = pick(pool(), size);
      if (!chosen.length) return;
      start(chosen, mode, { catId, group, size });
    });
    paint();
  }

  // 出す数字を選ぶ: 苦手の順(Cloze.weakOrder。同じ段の中は混ぜる)から size 件 → 混ぜる
  function pick(pool, size) {
    const st = Cloze.stats(KEY);
    const ids = Cloze.weakOrder(Cloze.shuffle(pool.map((it) => it.id)), st);
    const byId = {};
    pool.forEach((it) => { byId[it.id] = it; });
    const n = size ? Math.min(size, ids.length) : ids.length;
    return Cloze.shuffle(ids.slice(0, n).map((id) => byId[id]));
  }

  function start(list, mode, from) {
    session = { list, mode, from: from || null, index: 0, results: [], xp: 0, run: 0, id: Date.now() };
    Router.navigate(`#numbers/run`);
  }

  // ---------- 出題中 ----------
  function renderRun(root) {
    if (!session) {
      try { history.replaceState(null, ``, `#numbers`); } catch (e) { /* 無視 */ }
      renderSetup(root);
      return;
    }
    const s = session;
    // 答えたあとに画面を離れて戻ったときは、次の問題から(同じ問題を二度記録しない)
    s.index = Math.min(s.results.length, s.list.length);
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view numbers-view tl-run`;
    wrap.innerHTML = `
      <div class="tl-run-head">
        <a class="btn back-btn" href="#numbers" data-role="quit">${ic(`chevron-left`)}やめる</a>
        <h2 class="tl-run-title">数字まとめドリル<span class="sr-only">(${s.mode === `card` ? `カードでめくる` : `4択で埋める`})</span></h2>
        <span class="tl-run-count num" data-role="count"></span>
      </div>
      <div class="progress-bar tl-run-bar" aria-hidden="true"><div class="progress-bar-fill"></div></div>
      <div class="tl-stage" data-role="stage"></div>`;
    root.appendChild(wrap);
    const stage = wrap.querySelector(`[data-role="stage"]`);
    const countEl = wrap.querySelector(`[data-role="count"]`);
    const fill = wrap.querySelector(`.tl-run-bar .progress-bar-fill`);
    const live = Cloze.live(wrap);
    let keyAct = null; // いまのカードのキー操作

    function meta() {
      const total = s.list.length;
      const done = s.results.length;
      const finished = done >= total;
      const cur = Math.min(total, s.index + 1);
      countEl.textContent = `${finished ? total : cur} / ${total}`;
      countEl.setAttribute(`aria-label`, finished ? `${total}問すべて答えました` : `${total}問中 ${cur}問目`);
      fill.style.width = `${Cloze.pct(done, total)}%`;
      fill.classList.toggle(`fill-success`, finished);
    }

    function showTop() {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      if (wrap.getBoundingClientRect().top < pad - 1) wrap.scrollIntoView({ block: `start` });
    }

    function next() {
      s.index += 1;
      if (s.index >= s.list.length) renderResult();
      else renderCard();
      showTop();
    }

    function finishItem(it, grade) {
      Cloze.record(KEY, it.id, grade);
      s.xp += Cloze.answered(`numbers`, it.id, grade);
      s.results.push({ id: it.id, grade });
      s.run = grade === 2 ? s.run + 1 : 0;
      meta();
    }

    function renderCard() {
      meta();
      const it = s.list[s.index];
      const c = Cloze.cat(it.cat);
      const card = document.createElement(`section`);
      card.className = `card tl-card ${c.cls}`;
      card.dataset.id = it.id;
      const qid = `num-q-${s.id}-${s.index}`;
      card.setAttribute(`aria-labelledby`, qid);
      card.innerHTML = `
        <div class="tl-card-head">
          <span class="tl-tag"><span class="tl-tag-dot" aria-hidden="true"></span>${esc(c.label)}・${esc(it.group || ``)}</span>
        </div>
        <p class="tl-q" id="${qid}">${sentenceHtml(it, `<span class="tl-blank is-q" data-role="blank"><span class="sr-only">空欄</span><span aria-hidden="true">？</span></span>`)}</p>
        <div class="tl-act" data-role="act"></div>
        <div class="tl-after" data-role="after" hidden></div>`;
      stage.innerHTML = ``;
      stage.appendChild(card);
      const act = card.querySelector(`[data-role="act"]`);
      const after = card.querySelector(`[data-role="after"]`);
      const blank = card.querySelector(`[data-role="blank"]`);

      function fillBlank(ok) {
        blank.className = `tl-blank is-filled ${ok === false ? `is-ng` : ok === true ? `is-ok` : `is-shown`}`;
        blank.innerHTML = `<span class="sr-only">答え </span>${esc(it.a)}`;
      }

      function noteHtml() {
        return `
          ${it.note ? `<p class="tl-note">${ic(`lightbulb`, 16)}<span>${esc(it.note)}</span></p>` : ``}
          ${Cloze.lawRefHtml(it.lawRef)}`;
      }

      if (s.mode === `card`) {
        act.innerHTML = `<button type="button" class="btn btn-lg btn-block tl-reveal" data-role="reveal">${ic(`eye`, 20)}<span>答えを見る</span><kbd class="tl-key" aria-hidden="true">Space</kbd></button>`;
        const reveal = () => {
          if (card.classList.contains(`is-revealed`)) return;
          card.classList.add(`is-revealed`);
          fillBlank(null);
          after.hidden = false;
          after.innerHTML = noteHtml();
          act.innerHTML = ``;
          const row = Cloze.gradeRow({ labels: { 2: `覚えた`, 1: `あいまい`, 0: `まだ` }, onGrade: (g) => { finishItem(it, g); next(); } });
          act.appendChild(row);
          live.say(`答えは ${it.a}。${plainSentence(it)}`);
          row.querySelector(`[data-grade]`).focus({ preventScroll: true });
        };
        const fresh = Cloze.freshGuard();
        act.querySelector(`[data-role="reveal"]`).addEventListener(`click`, (e) => { if (fresh(e)) reveal(); });
        keyAct = (e) => {
          if (!card.classList.contains(`is-revealed`)) {
            if ((e.key === ` ` || e.key === `Enter`) && !(e.target.closest && e.target.closest(`a, button:not([data-role="reveal"])`))) { e.preventDefault(); reveal(); }
            return;
          }
          if (/^[1-3]$/.test(e.key)) {
            const b = act.querySelectorAll(`[data-grade]`)[Number(e.key) - 1];
            if (b && !b.disabled) { e.preventDefault(); b.click(); }
          }
        };
        if (s.index > 0) act.querySelector(`[data-role="reveal"]`).focus({ preventScroll: true });
      } else {
        const opts = Cloze.options(it.a, it.alts);
        const answerIdx = opts.indexOf(String(it.a).trim());
        const list = Cloze.choiceList(opts, { label: `空欄に入るもの`, onPick: (i, btn, e) => choose(i, e) });
        act.appendChild(list);
        let answered = false;
        const choose = (i, e) => {
          if (answered) return;
          answered = true;
          const ok = i === answerIdx;
          Cloze.paintChoices(list, answerIdx, i);
          card.classList.add(`is-answered`, ok ? `is-ok` : `is-ng`);
          fillBlank(ok);
          finishItem(it, ok ? 2 : 0);
          after.hidden = false;
          const last = s.index + 1 >= s.list.length;
          after.innerHTML = `
            ${Cloze.verdictHtml(ok, ok ? null : it.a, ok && s.run >= 3 ? `${s.run}問つづけて正解!` : ``)}
            ${noteHtml()}`;
          // 「つづける」はカードの直下に置き、カードが見えている間は画面の下に貼り付ける(答えたあとにスクロールしなくても押せる)
          card.insertAdjacentHTML(`beforeend`, `<button type="button" class="btn btn-lg btn-block tl-next${ok ? `` : ` is-ng`}" data-role="next"><span>${last ? `結果を見る` : `つづける`}</span>${ic(last ? `flag` : `arrow-right`, 20)}</button>`);
          live.say(ok ? `正解。${plainSentence(it)}` : `不正解。正解は ${it.a}。${plainSentence(it)}`);
          const v = after.querySelector(`.tl-verdict`);
          if (ok && s.run >= 3 && window.Motion && Motion.streak && v) { try { Motion.streak(v, s.run); } catch (err) { /* 飾り */ } }
          const nb = card.querySelector(`[data-role="next"]`);
          nb.addEventListener(`click`, () => { if (nb.dataset.used) return; nb.dataset.used = `1`; next(); });
          if (!e || e.detail === 0) nb.focus({ preventScroll: true });
        };
        keyAct = (e) => {
          if (!answered && /^[1-4]$/.test(e.key)) {
            const b = list.querySelectorAll(`.choice-btn`)[Number(e.key) - 1];
            if (b) { e.preventDefault(); choose(Number(e.key) - 1, null); }
            return;
          }
          if (answered && e.key === `Enter` && !(e.target.closest && e.target.closest(`a, button, summary`))) {
            e.preventDefault();
            next();
          }
        };
      }
    }

    function renderResult() {
      keyAct = null;
      meta();
      const total = s.results.length;
      const ok = s.results.filter((r) => r.grade === 2).length;
      const missed = s.results.filter((r) => r.grade < 2).map((r) => s.list.find((it) => it.id === r.id)).filter(Boolean);
      const p = Cloze.pct(ok, total);
      const card = document.createElement(`section`);
      card.className = `card tl-result`;
      card.setAttribute(`aria-label`, `結果`);
      const word = s.mode === `card` ? `覚えた` : `正解`;
      card.innerHTML = `
        ${Cloze.heroMascot(p)}
        <h3 class="tl-result-title" tabindex="-1">${p === 100 ? `全部${word}!` : `おつかれさまでした`}</h3>
        <p class="tl-result-score"><strong class="big-num num">${ok}</strong><span class="num"> / ${total}</span><span class="tl-result-unit">${word}</span></p>
        ${s.xp ? `<p class="tl-xp"><span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`bolt`, 16)}</span><span>経験値 <b class="num">+${s.xp}</b></span></p>` : ``}
        ${total > 10 ? `<details class="tl-result-more"><summary>${ic(`list`, 16)}<span>答えた${total}問の一覧</span>${ic(`chevron-down`, 16)}</summary>` : ``}
        <ol class="tl-result-list">
          ${s.results.map((r) => {
            const it = s.list.find((x) => x.id === r.id);
            if (!it) return ``;
            return `<li class="tl-result-item is-g${r.grade}">${Cloze.markSvg({ 2: `o`, 1: `t`, 0: `x` }[r.grade], 20)}<span class="sr-only">${{ 2: word, 1: `あいまい`, 0: s.mode === `card` ? `まだ` : `不正解` }[r.grade]}。</span><span>${sentenceHtml(it, `<b class="tl-ans">${esc(it.a)}</b>`)}</span></li>`;
          }).join(``)}
        </ol>
        ${total > 10 ? `</details>` : ``}
        <div class="tl-result-actions">
          ${missed.length ? `<button type="button" class="btn btn-lg btn-block" data-role="retry-missed">${ic(`repeat`, 20)}<span>${s.mode === `card` ? `覚えていないもの` : `間違えたもの`}だけもう一度(${missed.length}問)</span></button>` : ``}
          <button type="button" class="btn btn-lg btn-block${missed.length ? ` btn-secondary` : ``}" data-role="again">${ic(`refresh`, 20)}<span>新しい組でもう一度</span></button>
          <a class="btn btn-secondary btn-block" href="#numbers" data-role="back-setup">${ic(`list`, 18)}<span>設定にもどる</span></a>
        </div>`;
      stage.innerHTML = ``;
      stage.appendChild(card);
      const retry = card.querySelector(`[data-role="retry-missed"]`);
      if (retry) retry.addEventListener(`click`, () => start(Cloze.shuffle(missed.slice()), s.mode, s.from));
      card.querySelector(`[data-role="again"]`).addEventListener(`click`, () => {
        const from = s.from || { catId: ALL, group: ALL, size: 10 };
        const chosen = pick(filterList(items(), from.catId || ALL, from.group || ALL), SIZES.includes(Number(from.size)) ? Number(from.size) : 10);
        if (chosen.length) start(chosen, s.mode, from);
      });
      if (window.Motion && Motion.countIn) { try { Motion.countIn(card); } catch (e) { /* 飾り */ } }
      if (p === 100) Cloze.celebrate(card.querySelector(`.tl-result-hero`) || card);
      card.querySelector(`.tl-result-title`).focus({ preventScroll: true });
    }

    Cloze.bindKeys(wrap, (e) => { if (keyAct) keyAct(e); });
    if (s.index >= s.list.length) renderResult();
    else renderCard();
  }

  // ---------- 一覧 ----------
  function renderList(root, catParam) {
    const list = items();
    const cats = catsOf(list);
    const catId = cats.some((c) => c.id === catParam) ? catParam : ALL;
    const st = Cloze.stats(KEY);
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view numbers-view tl-list-view`;
    wrap.innerHTML = `
      <a class="btn back-btn" href="#numbers">${ic(`chevron-left`)}数字まとめドリル</a>
      <h2>数字の一覧</h2>
      <p class="view-desc">答えを入れた文で並べています。文を押すと根拠を確かめられます。</p>
      <nav class="chip-row chip-row-scroll tl-chips" aria-label="分野で絞り込む" data-role="cats">
        ${[{ id: ALL, label: `すべて`, n: list.length }].concat(cats.map((c) => ({ id: c.id, label: c.label, cls: c.cls, n: list.filter((it) => it.cat === c.id).length })))
          .map((c) => `<a class="chip chip-small${c.cls ? ` ${c.cls}` : ``}" href="${c.id === ALL ? `#numbers/list` : `#numbers/list/${c.id}`}"${c.id === catId ? ` aria-current="page"` : ``}>${esc(c.label)}<span class="tl-chip-n num">${c.n}</span></a>`).join(``)}
      </nav>
      <div class="tl-groups" data-role="groups"></div>`;
    root.appendChild(wrap);
    const box = wrap.querySelector(`[data-role="groups"]`);
    const shown = filterList(list, catId, ALL);
    if (!shown.length) {
      box.appendChild(UI.emptyState({ icon: `percent`, title: `準備中です`, body: `数字のデータを準備しています。` }));
      return;
    }
    const groups = groupsOf(shown);
    Cloze.lazyList(box, groups, (g) => {
      const c = Cloze.cat(g.cat);
      const sec = document.createElement(`section`);
      sec.className = `tl-group ${c.cls}`;
      const known = g.items.filter((it) => Cloze.known(st[it.id])).length;
      sec.innerHTML = `
        <h3 class="tl-group-head"><span class="tl-tag-dot" aria-hidden="true"></span><span>${esc(g.name)}</span>${catId === ALL ? `<span class="tl-group-cat">${esc(c.label)}</span>` : ``}<span class="tl-group-n num">${known} / ${g.items.length}<span class="sr-only">覚えた</span></span></h3>
        <ul class="tl-num-list">
          ${g.items.map((it) => `
            <li class="tl-num-item" data-id="${esc(it.id)}">
              <details>
                <summary>${markHtml(st[it.id])}<span class="tl-num-text">${sentenceHtml(it, `<b class="tl-ans">${esc(it.a)}</b>`)}</span>${ic(`chevron-down`, 16)}</summary>
                <div class="tl-num-more">
                  ${it.note ? `<p class="tl-note">${ic(`lightbulb`, 16)}<span>${esc(it.note)}</span></p>` : ``}
                  ${Cloze.lawRefHtml(it.lawRef)}
                  ${Cloze.basicLinksHtml(it.basicIds, 3)}
                  ${Cloze.sourcesHtml(it.sources)}
                </div>
              </details>
            </li>`).join(``)}
        </ul>`;
      return sec;
    }, { chunk: 6 });
  }

  function render(root, param) {
    const parts = String(param || ``).split(`/`);
    if (parts[0] === `list`) renderList(root, parts[1] || null);
    else if (parts[0] === `run`) renderRun(root);
    else renderSetup(root);
  }

  return { render, _internal: { items, pick, getSession: () => session, groupsOf } };
})();
