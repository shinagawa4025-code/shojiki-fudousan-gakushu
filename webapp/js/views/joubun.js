// 条文穴埋め(消費税法)(v14)。税理士試験(消費税法)の理論に向けて、e-Gov 法令検索の条文(項ごと)の大事な語句を穴埋めで覚える
// ルート: #joubun(まとまりごとの一覧と覚えた数)/ #joubun/<id>(条文。やり方は最後に選んだもの)/ #joubun/<id>/<choose|recall|read>
// やり方: 選んで埋める(空欄ごとに4択。下に貼り付く欄で答え、答えるとすぐ次の空欄へ)/
//         思い出す(空欄をタップして答えを見る → 全部見たら条文全体を ○ 言えた / △ あいまい / × 言えなかった で自分で採点)/
//         全文を読む(答えを入れた全文)。長い括弧書き({ omit })は小さな「（略）」のボタンにたたみ、押すとその場で開く
// 次の条文: 苦手の順(Cloze.weakOrder: 前回 × → △ → まだ → ○ の古い順)。一覧の「苦手から練習」も同じ順
// 記録: Storage `joubunStats` = { id: { c, w, last, grade } }(選んで埋めるは空欄ごとに c / w、終えたら grade。思い出すは採点で c / w と grade)
// 条文はデータ(data/joubun.js)のまま表示する(つなげると e-Gov の本文と1字も違わないことを tools/lib/checks/tools.js が確かめる)
window.Views = window.Views || {};
window.Views.joubun = (function () {
  const KEY = `joubunStats`;
  const MODES = [
    { id: `choose`, label: `選んで埋める`, icon: `pencil-check` },
    { id: `recall`, label: `思い出す`, icon: `lightbulb` },
    { id: `read`, label: `全文を読む`, icon: `book-open` },
  ];
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);
  let omitSeq = 0;
  // 長い答えは行をまたいで折り返す札にする(短い答えは番号と語句を1つの札のまま)
  const long = (t) => (Array.from(String(t || ``)).length > 9 ? ` is-long` : ``);

  function data() {
    const d = window.APP_DATA && APP_DATA.joubun;
    return d && typeof d === `object` ? d : null;
  }
  function items() {
    const d = data();
    return d && Array.isArray(d.items) ? d.items.filter((it) => it && typeof it.id === `string` && Array.isArray(it.parts) && Array.isArray(it.blanks)) : [];
  }
  function law() {
    const d = data();
    return d && d.law && typeof d.law === `object` ? d.law : { name: `消費税法` };
  }
  function groupsOf(list) {
    const out = [];
    list.forEach((it) => {
      const name = it.group || `その他`;
      let g = out.find((x) => x.name === name);
      if (!g) { g = { name, items: [] }; out.push(g); }
      g.items.push(it);
    });
    return out;
  }
  function blankCount(it) {
    return it.parts.filter((p) => p && Number.isInteger(p.b)).length;
  }
  // 条文の画面の見出しは、その条の e-Gov の見出し(caption。「（課税標準）」のように括弧ごとそのまま)。
  // 項目の見出し(title)が条の見出しと違うとき(第2項以降・号など)だけ、その下に小さく添える
  function capSub(it) {
    if (!it.title) return false;
    if (!it.caption) return false;
    return it.title !== String(it.caption).replace(/^（(.*)）$/, `$1`);
  }
  // 次に練習する条文(苦手の順。except は除く)
  function nextWeak(except) {
    const ids = Cloze.weakOrder(items().map((it) => it.id), Cloze.stats(KEY)).filter((id) => id !== except);
    return ids[0] || null;
  }

  // 「練習」のリンクで開くやり方(最後に使ったやり方。全文を読む・知らないやり方なら 選んで埋める)
  function practiceMode(m) {
    return m !== `read` && MODES.some((x) => x.id === m) ? m : `choose`;
  }

  const GRADE_TEXT = { 2: `言えた`, 1: `あいまい`, 0: `言えなかった` };
  function statusHtml(s) {
    if (!s || s.grade == null) return `<span class="tl-row-status is-new">まだ</span>`;
    return `<span class="tl-row-status is-g${s.grade}">${Cloze.markSvg({ 2: `o`, 1: `t`, 0: `x` }[s.grade], 16)}<span>${GRADE_TEXT[s.grade]}</span></span>`;
  }

  function lawLinkHtml(cls) {
    const l = law();
    return l.url ? `<a class="${cls || `link-btn`}" href="${esc(l.url)}" target="_blank" rel="noopener" data-role="egov">${ic(`library`, 16)}<span>e-Govで条文を見る</span>${ic(`external`, 14)}</a>` : ``;
  }
  function asOfText() {
    const l = law();
    return l.asOf && DateUtil.isValid(l.asOf) ? `${DateUtil.toJapanese(l.asOf)}時点` : ``;
  }

  // ---------- 一覧 ----------
  function renderList(root) {
    const list = items();
    const l = law();
    const st = Cloze.stats(KEY);
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view joubun-view cat-shohi`;
    wrap.innerHTML = `
      <div class="tl-hero">
        <span class="sticker sticker-lg" aria-hidden="true">${ic(`scale`, 28)}</span>
        <div class="tl-hero-main">
          <h2>条文穴埋め<span class="tl-h2-sub">(${esc(l.name || `消費税法`)})</span></h2>
          <p class="tl-lead"><span class="hub-tile-badge tl-badge">税理士</span>試験の理論に向けて、条文の大事な語句を穴埋めで覚えます。</p>
        </div>
      </div>`;
    root.appendChild(wrap);
    if (!list.length) {
      wrap.appendChild(UI.emptyState({ icon: `scale`, title: `準備中です`, body: `条文のデータを準備しています。もうしばらくお待ちください。`, cta: { label: `学習トピックへ`, nav: `#topics` } }));
      return;
    }
    const knownN = list.filter((it) => Cloze.known(st[it.id])).length;
    const weakN = list.filter((it) => st[it.id] && st[it.id].grade != null && st[it.id].grade < 2).length;
    const first = nextWeak(null);
    const pref = Cloze.prefs(`joubun`).mode;
    const prog = document.createElement(`section`);
    prog.className = `card tl-progress`;
    prog.setAttribute(`aria-label`, `覚えた条文`);
    prog.innerHTML = `
      <div class="tl-progress-head"><span class="tl-progress-label">覚えた条文</span><span class="tl-progress-num"><strong class="num">${knownN}</strong><span class="num"> / ${list.length}</span></span></div>
      <div class="progress-bar" role="progressbar" aria-label="覚えた条文の割合" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${knownN}"><div class="progress-bar-fill${knownN === list.length ? ` fill-success` : ``}" style="width:${Cloze.pct(knownN, list.length)}%"></div></div>
      <p class="tl-progress-sub">${weakN ? `復習したい条文 <b class="num">${weakN}</b>・` : ``}まだ <b class="num">${list.filter((it) => !st[it.id] || st[it.id].grade == null).length}</b></p>
      ${first ? `<a class="btn btn-lg btn-block tl-start" href="#joubun/${encodeURIComponent(first)}/${practiceMode(pref)}" data-role="start-weak">${ic(`play`, 20)}<span>${weakN ? `苦手な条文から練習` : `次の条文を練習`}</span></a>` : ``}
      <p class="tl-law-src">${ic(`library`, 14)}<span>${esc(l.name || `消費税法`)}${l.num ? `(${esc(l.num)})` : ``}${asOfText() ? `・${esc(asOfText())}の条文` : ``}。出典: e-Gov 法令検索</span></p>
      ${lawLinkHtml()}`;
    wrap.appendChild(prog);

    const box = document.createElement(`div`);
    box.className = `tl-groups`;
    box.dataset.role = `groups`;
    wrap.appendChild(box);
    Cloze.lazyList(box, groupsOf(list), (g) => {
      const sec = document.createElement(`section`);
      sec.className = `tl-group`;
      const known = g.items.filter((it) => Cloze.known(st[it.id])).length;
      sec.innerHTML = `
        <h3 class="tl-group-title">${esc(g.name)}<span class="tl-group-n num">${known} / ${g.items.length}<span class="sr-only">覚えた</span></span></h3>
        <ul class="list-group tl-joubun-list">
          ${g.items.map((it) => {
            const s = st[it.id];
            return `
            <li>
              <a class="list-row cat-shohi" href="#joubun/${encodeURIComponent(it.id)}" data-id="${esc(it.id)}">
                <span class="list-row-icon${s && s.grade === 2 ? ` is-ok` : s && s.grade === 0 ? ` is-warn` : ``}" aria-hidden="true">${ic(s && s.grade === 2 ? `check` : `scale`, 20)}</span>
                <span class="list-row-main"><span class="list-row-title"><span class="tl-row-art">${esc(it.article || ``).replace(/([条項])(?=第)/g, `$1<wbr>`)}</span><span class="tl-row-cap">${esc(it.title || ``)}</span></span><span class="list-row-sub">空欄 ${blankCount(it)}か所</span></span>
                ${statusHtml(s)}${ic(`chevron-right`)}
              </a>
            </li>`;
          }).join(``)}
        </ul>`;
      return sec;
    }, { chunk: 4, size: (g) => g.items.length, unit: `項目` });
  }

  // ---------- 条文 ----------
  // 文の HTML。blank(n) → 空欄 n の HTML。括弧書きは「（略）」のボタン(opened: 開いている括弧書きの番号の Set)
  function textHtml(it, blank, opened) {
    let k = -1;
    return it.parts.map((p) => {
      if (typeof p === `string`) return esc(p);
      if (p && Number.isInteger(p.b)) return blank(p.b);
      if (p && typeof p.omit === `string`) {
        k += 1;
        const open = !!opened && opened.has(k);
        const id = `jb-omit-${++omitSeq}`;
        return `<span class="tl-omit-text" id="${id}"${open ? `` : ` hidden`}>${esc(p.omit)}</span><button type="button" class="tl-omit" aria-label="括弧書き" aria-expanded="${open}" aria-controls="${id}" data-role="omit" data-k="${k}">${omitLabel(open)}</button>`;
      }
      return ``;
    }).join(``);
  }
  // 見た目の文字だけ(読み上げはボタンの名前「括弧書き」と、開いているか(aria-expanded))
  function omitLabel(open) {
    return open ? `たたむ` : `（略）`;
  }

  // 「（略）」を押すとその場で開く(もう一度押すとたたむ)。開いた番号は opened に覚え、空欄に答えて文を描き直しても開いたまま
  function wireOmits(box, opened, onToggle) {
    box.querySelectorAll(`[data-role="omit"]`).forEach((btn) => btn.addEventListener(`click`, () => {
      const t = document.getElementById(btn.getAttribute(`aria-controls`));
      if (!t) return;
      const open = btn.getAttribute(`aria-expanded`) !== `true`;
      t.hidden = !open;
      btn.setAttribute(`aria-expanded`, String(open));
      btn.innerHTML = omitLabel(open);
      const k = Number(btn.dataset.k);
      if (open) opened.add(k); else opened.delete(k);
      if (onToggle) onToggle();
    }));
  }

  function renderItem(root, id, modeParam) {
    const list = items();
    const idx = list.findIndex((x) => x.id === id);
    const it = list[idx];
    const wrap = document.createElement(`div`);
    wrap.className = `view tl-view joubun-view tl-item-view cat-shohi`;
    root.appendChild(wrap);
    if (!it) {
      wrap.innerHTML = `<a class="btn back-btn" href="#joubun">${ic(`chevron-left`)}条文の一覧</a><h2>条文穴埋め</h2>`;
      wrap.appendChild(UI.emptyState({ icon: `scale`, title: `条文が見つかりません`, body: `一覧から選び直してください。`, cta: { label: `条文の一覧へ`, nav: `#joubun` } }));
      return;
    }
    const pref = Cloze.prefs(`joubun`).mode;
    let mode = MODES.some((m) => m.id === modeParam) ? modeParam : MODES.some((m) => m.id === pref) ? pref : `choose`;
    if (!it.blanks.length && mode !== `read`) mode = `read`;
    const prev = list[idx - 1];
    const nextInList = list[idx + 1];
    const hasOmit = it.parts.some((p) => p && typeof p.omit === `string`);
    wrap.innerHTML = `
      <a class="btn back-btn" href="#joubun">${ic(`chevron-left`)}条文の一覧</a>
      <p class="tl-eyebrow"><span class="tl-tag"><span class="tl-tag-dot" aria-hidden="true"></span>${esc(it.group || `消費税法`)}</span><span class="hub-tile-badge tl-badge">税理士</span></p>
      <h2 class="tl-article"><span class="tl-article-num">${esc(law().name || `消費税法`)} ${esc(it.article || ``)}</span> <span class="tl-article-cap${Array.from(String(it.caption || it.title || ``)).length > 24 ? ` is-long` : ``}">${esc(it.caption || it.title || ``)}</span></h2>
      ${capSub(it) ? `<p class="tl-article-sub" data-role="item-title">${esc(it.title)}</p>` : ``}
      <div class="segmented seg-bold tl-seg tl-mode" role="group" aria-label="やり方" data-role="modes">
        ${MODES.map((m) => `<button type="button" class="segmented-item" data-mode="${m.id}" aria-pressed="${m.id === mode}"${!it.blanks.length && m.id !== `read` ? ` disabled` : ``}>${ic(m.icon, 16)}${m.label}</button>`).join(``)}
      </div>
      <section class="card tl-law" aria-label="条文">
        <div class="tl-law-tools">
          <span class="tl-law-hint" data-role="hint"></span>
          ${hasOmit ? `<button type="button" class="link-btn tl-omit-all" data-role="omit-all">括弧書きを全部ひらく</button>` : ``}
        </div>
        <p class="tl-law-text" data-role="text" lang="ja"></p>
      </section>
      <div class="tl-panel-slot" data-role="panel-slot"></div>
      <section class="card tl-notes" aria-label="補足">
        ${it.note ? `<p class="tl-note">${ic(`lightbulb`, 16)}<span>${esc(it.note)}</span></p>` : ``}
        ${Cloze.basicLinksHtml(it.basicIds, 4)}
        <p class="tl-law-src">${ic(`library`, 14)}<span>${esc(law().name || `消費税法`)}${law().num ? `(${esc(law().num)})` : ``}${asOfText() ? `・${esc(asOfText())}` : ``}。e-Gov 法令検索の条文をそのまま載せています。</span></p>
        ${lawLinkHtml(`btn btn-secondary btn-sm tl-egov`)}
      </section>
      <nav class="tl-pager" aria-label="ほかの条文">
        ${prev ? `<a class="tl-pager-link" href="#joubun/${encodeURIComponent(prev.id)}">${ic(`chevron-left`, 16)}<span><small>前の条文</small><span class="tl-pager-name">${esc(prev.article || ``)} ${esc(prev.title || ``)}</span></span></a>` : `<span></span>`}
        ${nextInList ? `<a class="tl-pager-link is-next" href="#joubun/${encodeURIComponent(nextInList.id)}"><span><small>次の条文</small><span class="tl-pager-name">${esc(nextInList.article || ``)} ${esc(nextInList.title || ``)}</span></span>${ic(`chevron-right`, 16)}</a>` : ``}
      </nav>`;
    const textEl = wrap.querySelector(`[data-role="text"]`);
    const hint = wrap.querySelector(`[data-role="hint"]`);
    const slot = wrap.querySelector(`[data-role="panel-slot"]`);
    const omitAll = wrap.querySelector(`[data-role="omit-all"]`);
    const live = Cloze.live(wrap);
    let keyAct = null;
    let openAll = false;
    const opened = new Set(); // 開いている括弧書きの番号

    function syncOmitAll() {
      if (!omitAll) return;
      const btns = Array.from(textEl.querySelectorAll(`[data-role="omit"]`));
      openAll = btns.length > 0 && btns.every((b) => b.getAttribute(`aria-expanded`) === `true`);
      // 名前が「ひらく / たたむ」で変わるので、押されている状態(aria-pressed)は付けない(読み上げが食い違わないように)
      omitAll.textContent = openAll ? `括弧書きを全部たたむ` : `括弧書きを全部ひらく`;
    }
    if (omitAll) {
      omitAll.addEventListener(`click`, () => {
        const want = !openAll;
        textEl.querySelectorAll(`[data-role="omit"]`).forEach((b) => { if ((b.getAttribute(`aria-expanded`) === `true`) !== want) b.click(); });
        syncOmitAll();
      });
    }

    function setMode(m, replace) {
      mode = m;
      wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.setAttribute(`aria-pressed`, String(b.dataset.mode === m)));
      if (replace !== false) {
        try { history.replaceState(history.state, ``, `#joubun/${encodeURIComponent(it.id)}/${m}`); } catch (e) { /* 無視 */ }
      }
      Cloze.setPrefs(`joubun`, { mode: m });
      wrap.dataset.mode = m;
      keyAct = null;
      slot.innerHTML = ``;
      wrap.style.removeProperty(`--tl-panel-h`);
      if (m === `choose`) runChoose();
      else if (m === `recall`) runRecall();
      else runRead();
    }

    // 全文を読む
    function runRead() {
      hint.textContent = `答えを入れた全文です`;
      textEl.innerHTML = textHtml(it, (n) => `<b class="tl-ans">${esc(it.blanks[n] ? it.blanks[n].a : ``)}</b>`, opened);
      wireOmits(textEl, opened, syncOmitAll);
      syncOmitAll();
      if (it.blanks.length) {
        slot.innerHTML = `<div class="tl-read-actions"><button type="button" class="btn btn-secondary btn-block" data-role="to-recall">${ic(`lightbulb`, 18)}<span>思い出せるか確かめる</span></button></div>`;
        slot.querySelector(`[data-role="to-recall"]`).addEventListener(`click`, () => setMode(`recall`));
      }
    }

    // 結果の欄(選んで埋める・思い出すの最後)
    function resultBox(opts) {
      const box = document.createElement(`section`);
      box.className = `card tl-result tl-result-compact`;
      box.setAttribute(`aria-label`, `結果`);
      const nw = nextWeak(it.id);
      const nwItem = nw ? list.find((x) => x.id === nw) : null;
      box.innerHTML = `
        ${opts.head}
        ${opts.xp ? `<p class="tl-xp"><span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`bolt`, 16)}</span><span>経験値 <b class="num">+${opts.xp}</b></span></p>` : ``}
        <div class="tl-result-actions">
          ${nwItem ? `<a class="btn btn-lg btn-block" href="#joubun/${encodeURIComponent(nwItem.id)}/${practiceMode(mode)}" data-role="next-weak"><span class="tl-btn-2l"><span>次の条文へ</span><small>${esc(nwItem.article || ``)} ${esc(nwItem.title || ``)}</small></span>${ic(`arrow-right`, 20)}</a>` : ``}
          <button type="button" class="btn btn-secondary btn-block" data-role="again">${ic(`refresh`, 18)}<span>もう一度</span></button>
          ${opts.extra || ``}
        </div>`;
      box.querySelector(`[data-role="again"]`).addEventListener(`click`, () => { setMode(mode, false); scrollToText(); });
      return box;
    }

    function scrollToText() {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const card = wrap.querySelector(`.tl-law`);
      if (card.getBoundingClientRect().top < pad) card.scrollIntoView({ block: `start` });
    }

    function setPanelH(panel) {
      wrap.style.setProperty(`--tl-panel-h`, `${panel.offsetHeight}px`);
    }

    // el(いまの空欄)が下に貼り付く欄の裏・画面の上に隠れていれば見える所へ。smooth: 答えたあと(開いた直後はすぐ動かす)
    function keepVisible(el, panel, smooth) {
      if (!el || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const pr = panel && panel.isConnected ? panel.getBoundingClientRect() : { top: window.innerHeight };
      if (r.bottom > pr.top - 8 || r.top < 0) el.scrollIntoView({ block: `nearest`, behavior: smooth && !UI.prefersReducedMotion() ? `smooth` : `auto` });
    }

    // 選んで埋める
    function runChoose() {
      hint.textContent = `空欄をタップして選べます`;
      const run = it.blanks.map((b, n) => ({ n, answer: String(b.a).trim(), opts: Cloze.options(b.a, b.alts), done: false, ok: null, picked: null }));
      let cur = 0;
      let lastNote = null;
      let xp = 0;
      const nb = (n) => `<span class="tl-blank-n num" aria-hidden="true">${n + 1}</span>`;

      function paintText() {
        textEl.innerHTML = textHtml(it, (n) => {
          const b = run[n];
          if (!b) return ``;
          if (!b.done) return `<button type="button" class="tl-blank is-q${n === cur ? ` is-current` : ``}" data-b="${n}" aria-label="空欄 ${n + 1}"${n === cur ? ` aria-current="true"` : ``}>${nb(n)}<span aria-hidden="true">？</span></button>`;
          // 読み上げ用の判定は札の外(すぐ後ろ)に置く(札の中の最後にあると、行末で折り返すときに中身のない小さな札が次の行にできる)
          return `<span class="tl-blank is-filled ${b.ok ? `is-ok` : `is-ng`}${long(b.answer)}">${nb(n)}${esc(b.answer)}</span><span class="sr-only">(${b.ok ? `正解` : `不正解。あなたの回答は ${esc(b.picked)}`})</span>`;
        }, opened);
        wireOmits(textEl, opened, syncOmitAll);
        textEl.querySelectorAll(`button.tl-blank`).forEach((btn) => btn.addEventListener(`click`, () => {
          const b = run[Number(btn.dataset.b)];
          if (!b || b.done) return;
          cur = b.n;
          paint();
          const f = slot.querySelector(`.choice-btn`);
          if (f) f.focus({ preventScroll: true });
        }));
      }

      function nextOpen(from) {
        for (let i = 1; i <= run.length; i++) {
          const b = run[(from + i) % run.length];
          if (!b.done) return b.n;
        }
        return -1;
      }

      function answer(b, i) {
        if (b.done) return;
        b.done = true;
        b.picked = b.opts[i];
        b.ok = b.opts[i] === b.answer;
        Cloze.update(KEY, it.id, (s) => {
          const p = s || { c: 0, w: 0 };
          const next = Object.assign({}, p, { c: (p.c || 0) + (b.ok ? 1 : 0), w: (p.w || 0) + (b.ok ? 0 : 1), last: DateUtil.today() });
          // 終えるまでは点(grade)を付けない(前の点があればそのまま。null は残さない)
          if (next.grade == null) delete next.grade;
          return next;
        });
        xp += Cloze.answered(`joubun`, `${it.id}:${b.n}`, b.ok ? 2 : 0);
        lastNote = { ok: b.ok, text: b.answer };
        live.say(b.ok ? `正解。空欄${b.n + 1}は${b.answer}` : `不正解。空欄${b.n + 1}は${b.answer}`);
        cur = nextOpen(b.n);
        if (cur < 0) finish();
        else paint(true);
      }

      function finish() {
        keyAct = null;
        paintText();
        const ok = run.filter((b) => b.ok).length;
        const n = run.length;
        const grade = ok === n ? 2 : ok / n >= 0.5 ? 1 : 0;
        Cloze.update(KEY, it.id, (s) => Object.assign({}, s || { c: 0, w: 0 }, { grade, last: DateUtil.today() }));
        slot.innerHTML = ``;
        wrap.style.removeProperty(`--tl-panel-h`);
        const p = Cloze.pct(ok, n);
        const box = resultBox({
          head: `${Cloze.heroMascot(p, 72)}
            <h3 class="tl-result-title" tabindex="-1">${ok === n ? `全部正解!` : `おつかれさまでした`}</h3>
            <p class="tl-result-score"><strong class="big-num num">${ok}</strong><span class="num"> / ${n}</span><span class="tl-result-unit">正解</span></p>`,
          xp,
          extra: `<button type="button" class="btn btn-secondary btn-block" data-role="to-recall">${ic(`lightbulb`, 18)}<span>思い出すで確かめる</span></button>`,
        });
        box.querySelector(`[data-role="to-recall"]`).addEventListener(`click`, () => { setMode(`recall`); scrollToText(); });
        slot.appendChild(box);
        if (window.Motion && Motion.countIn) { try { Motion.countIn(box); } catch (e) { /* 飾り */ } }
        if (ok === n) Cloze.celebrate(box.querySelector(`.tl-result-hero`) || box);
        box.querySelector(`.tl-result-title`).focus({ preventScroll: true });
      }

      function paint(afterAnswer) {
        paintText();
        const b = run[cur];
        const doneN = run.filter((x) => x.done).length;
        slot.innerHTML = ``;
        const panel = document.createElement(`section`);
        panel.className = `tl-panel`;
        panel.setAttribute(`aria-label`, `空欄の答え`);
        panel.dataset.role = `panel`;
        panel.innerHTML = `
          ${lastNote ? `<p class="tl-panel-prev ${lastNote.ok ? `is-ok` : `is-ng`}">${Cloze.markSvg(lastNote.ok ? `o` : `x`, 18)}<span>${lastNote.ok ? `正解!` : `おしい! 正解は <b>${esc(lastNote.text)}</b>`}</span></p>` : ``}
          <div class="tl-panel-top">
            <p class="tl-panel-q">空欄 <b class="num">${b.n + 1}</b> に入る語句は?</p>
            <span class="tl-panel-done num">${doneN + 1} / ${run.length}<span class="sr-only">か所目</span></span>
          </div>
          <div data-role="answer"></div>`;
        const list = Cloze.choiceList(b.opts, { label: `空欄 ${b.n + 1} の選択肢`, gridMax: 12, onPick: (i) => answer(b, i) });
        panel.querySelector(`[data-role="answer"]`).appendChild(list);
        keyAct = (e) => {
          if (/^[1-4]$/.test(e.key) && list.querySelectorAll(`.choice-btn`)[Number(e.key) - 1]) { e.preventDefault(); answer(b, Number(e.key) - 1); }
        };
        slot.appendChild(panel);
        setPanelH(panel);
        // いまの空欄が下に貼り付く欄の裏に隠れないように(開いた直後も。Router が上へ戻したあとのフレームで確かめる)
        const curEl = textEl.querySelector(`.tl-blank.is-current`);
        requestAnimationFrame(() => keepVisible(curEl, panel, !!afterAnswer));
        if (afterAnswer) {
          const ae = document.activeElement;
          if (!ae || ae === document.body || !ae.isConnected || slot.contains(ae) || textEl.contains(ae)) list.querySelector(`.choice-btn`).focus({ preventScroll: true });
        }
      }

      paint();
    }

    // 思い出す
    function runRecall() {
      hint.textContent = `空欄をタップすると答えが出ます`;
      const shown = it.blanks.map(() => false);
      let graded = false;

      function paintText() {
        textEl.innerHTML = textHtml(it, (n) => {
          const b = it.blanks[n];
          if (!b) return ``;
          const num = `<span class="tl-blank-n num" aria-hidden="true">${n + 1}</span>`;
          if (shown[n]) return `<span class="tl-blank is-filled is-shown${long(b.a)}" data-b="${n}">${num}${esc(b.a)}</span>`;
          return `<button type="button" class="tl-blank is-q" data-b="${n}" aria-label="空欄 ${n + 1} の答えを見る">${num}<span aria-hidden="true">？</span></button>`;
        }, opened);
        wireOmits(textEl, opened, syncOmitAll);
        textEl.querySelectorAll(`button.tl-blank`).forEach((btn) => btn.addEventListener(`click`, () => show(Number(btn.dataset.b), true)));
      }

      function show(n, viaTap) {
        if (shown[n] || graded) return;
        shown[n] = true;
        paintText();
        live.say(`空欄${n + 1}は${it.blanks[n].a}`);
        const allShown = shown.every(Boolean);
        paintPanel(allShown);
        // タップで開いたときは、次の空欄(なければ採点のボタン)へフォーカスを移す
        if (viaTap) {
          const nextBtn = textEl.querySelector(`button.tl-blank`);
          const f = nextBtn || slot.querySelector(`[data-grade]`);
          if (f) f.focus({ preventScroll: true });
        }
      }

      function paintPanel(allShown) {
        slot.innerHTML = ``;
        const panel = document.createElement(`section`);
        panel.className = `tl-panel`;
        panel.setAttribute(`aria-label`, `思い出せたか`);
        panel.dataset.role = `panel`;
        const n = shown.filter(Boolean).length;
        panel.innerHTML = `
          <div class="tl-panel-top">
            <p class="tl-panel-q">${allShown ? `空欄を全部 言えましたか?` : `語句を思い出してから、空欄をタップして確かめましょう。`}</p>
            <span class="tl-panel-done num">${n} / ${shown.length}<span class="sr-only">か所の答えを見ました</span></span>
          </div>
          <div data-role="answer"></div>`;
        const ans = panel.querySelector(`[data-role="answer"]`);
        if (!allShown) {
          ans.innerHTML = `<button type="button" class="btn btn-secondary btn-block tl-reveal-next" data-role="reveal-next">${ic(`eye`, 18)}<span>次の空欄を見る</span><kbd class="tl-key" aria-hidden="true">Space</kbd></button>
            <button type="button" class="link-btn tl-reveal-all" data-role="reveal-all">全部の答えを見る</button>`;
          ans.querySelector(`[data-role="reveal-next"]`).addEventListener(`click`, () => {
            const i = shown.indexOf(false);
            if (i >= 0) show(i, false);
            const f = slot.querySelector(`[data-role="reveal-next"], [data-grade]`);
            if (f) f.focus({ preventScroll: true });
          });
          ans.querySelector(`[data-role="reveal-all"]`).addEventListener(`click`, () => {
            shown.fill(true);
            paintText();
            live.say(`答え: ${it.blanks.map((b, i) => `空欄${i + 1} ${b.a}`).join(`、`)}`);
            paintPanel(true);
            const f = slot.querySelector(`[data-grade]`);
            if (f) f.focus({ preventScroll: true });
          });
          keyAct = (e) => {
            if (e.key === ` ` && !(e.target.closest && e.target.closest(`a, button:not([data-role="reveal-next"])`))) {
              e.preventDefault();
              const i = shown.indexOf(false);
              if (i >= 0) show(i, false);
              const f = slot.querySelector(`[data-role="reveal-next"], [data-grade]`);
              if (f) f.focus({ preventScroll: true });
            }
          };
        } else {
          const row = Cloze.gradeRow({ label: `条文を思い出せたかを選ぶ`, labels: GRADE_TEXT, onGrade: grade });
          ans.appendChild(row);
          keyAct = (e) => {
            if (/^[1-3]$/.test(e.key)) {
              const b = row.querySelectorAll(`[data-grade]`)[Number(e.key) - 1];
              if (b && !b.disabled) { e.preventDefault(); b.click(); }
            }
          };
        }
        slot.appendChild(panel);
        setPanelH(panel);
      }

      function grade(g) {
        if (graded) return;
        graded = true;
        keyAct = null;
        Cloze.record(KEY, it.id, g);
        const xp = Cloze.answered(`joubun`, it.id, g);
        slot.innerHTML = ``;
        wrap.style.removeProperty(`--tl-panel-h`);
        const box = resultBox({
          head: `<div class="tl-graded is-g${g}">${Cloze.markSvg({ 2: `o`, 1: `t`, 0: `x` }[g], 28)}<h3 class="tl-result-title" tabindex="-1">${g === 2 ? `言えました!` : g === 1 ? `あいまいでした` : `次はきっと言えます`}</h3></div>
            <p class="tl-graded-sub">${g === 2 ? `この調子で次の条文へ進みましょう。` : `苦手な条文として、次に練習するときに先に出します。`}</p>`,
          xp,
        });
        slot.appendChild(box);
        if (g === 2) Cloze.celebrate(box);
        box.querySelector(`.tl-result-title`).focus({ preventScroll: true });
      }

      paintText();
      paintPanel(!it.blanks.length);
    }

    wrap.querySelectorAll(`[data-mode]`).forEach((b) => b.addEventListener(`click`, () => {
      if (b.disabled || b.getAttribute(`aria-pressed`) === `true`) return;
      setMode(b.dataset.mode);
    }));
    Cloze.bindKeys(wrap, (e) => { if (keyAct) keyAct(e); });
    setMode(mode, false);
  }

  function render(root, param) {
    const parts = String(param || ``).split(`/`);
    if (parts[0]) renderItem(root, parts[0], parts[1] || null);
    else renderList(root);
  }

  return { render, _internal: { items, nextWeak, textHtml } };
})();
