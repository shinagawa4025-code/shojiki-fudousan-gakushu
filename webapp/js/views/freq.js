// 出題頻度ランク(v14)。ルート #freq / #freq/<分野ID>(gyoho など。その分野のタブを開く)/ #freq/<テーマID>(そのテーマの分野を開いて、その行へ)
// 宅建士試験の過去の本試験で、論点(テーマ)ごとに出題された回数(data/frequency.js。数えた回数だけで、過去問の文は載せない)から付けた
// A・B・C のランクを、分野のタブ(業法・権利・法令・税・価格・免除)ごとに、ランク → 出た回数の順に並べる。
// 行ごとに自分の成績(4択の最後の結果と○×の文ごとの最後の結果。js/freq.js の mastery)と、そのテーマの4択(#quiz/freq/<テーマID>)・
// ○×(#ox/freq/<テーマID>)を始めるボタン。選んだタブは履歴の state(fState)と Storage `freqPrefs`.tab に残す
// あわせて window.FreqUi.renderProgress(el): 学習の進捗(#progress)の「頻出Aで伸ばしたい論点」のカード
window.Views = window.Views || {};
window.Views.freq = (function () {
  const PREFS_KEY = `freqPrefs`;
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);
  const RANK_HEAD = { A: `よく出る論点`, B: `ときどき出る論点`, C: `出ることが少ない論点` };
  const CAT_ICON = { gyoho: `scale`, kenri: `gavel`, horei: `ruler`, zei: `receipt`, menjo: `mountain` };
  const GOOD = 0.8; // 正答率の色分け(これ以上はできている)
  const WEAK = 0.6; // これ未満は弱い

  function ready() {
    return !!(window.Freq && Freq.ready());
  }

  function loadPrefs() {
    const p = Storage.get(PREFS_KEY, {});
    return Storage.isPlainObject(p) ? p : {};
  }

  function saveTab(tab) {
    Storage.set(PREFS_KEY, Object.assign({}, loadPrefs(), { tab }));
  }

  function historyState() {
    const st = window.history.state;
    return st && typeof st === `object` ? st : {};
  }

  // 「平成28年度〜令和7年度の12回」
  function rangeText(i) {
    if (!i || !i.total) return ``;
    const a = i.first ? String(i.first.label || i.first.id) : ``;
    const b = i.last ? String(i.last.label || i.last.id) : ``;
    return a && b && a !== b ? `${a}〜${b}の${i.total}回` : `${i.total}回`;
  }

  // ランクの境目(「12回中9回以上」など)。回数にできなければ割合で
  function legendHtml(i) {
    const a = Freq.minHits(`A`);
    const b = Freq.minHits(`B`);
    const pct = (r) => `${Math.round(r * 100)}%`;
    const rows = a != null && b != null && b < a
      ? [[`A`, `${i.total}回中${a}回以上`], [`B`, b === a - 1 ? `${b}回` : `${b}〜${a - 1}回`], [`C`, b > 1 ? `${b - 1}回以下` : `出題なし`]]
      : [[`A`, `${pct(i.rankRule.A)}以上の回で出題`], [`B`, `${pct(i.rankRule.B)}以上`], [`C`, `それ未満`]];
    return `<ul class="freq-legend">${rows.map(([r, t]) => `<li>${Freq.chipHtml(r)}<span>${esc(t)}</span></li>`).join(``)}</ul>`;
  }

  // 正答率の行(バーは飾り。文字で読み上げる)
  function masteryHtml(m, cls) {
    if (!m || !m.answered) return `<p class="freq-mastery is-none ${cls || ``}"><span>まだ解いていません</span></p>`;
    const pct = Math.round(m.rate * 100);
    const tone = m.rate >= GOOD ? `is-good` : m.rate < WEAK ? `is-weak` : ``;
    const parts = [m.mc.answered ? `4択${m.mc.answered}問` : ``, m.ox.answered ? `○×${m.ox.answered}文` : ``].filter(Boolean).join(`・`);
    return `<div class="freq-mastery ${tone} ${cls || ``}">
        <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill${m.rate >= GOOD ? ` fill-success` : ``}" style="width:${pct}%"></div></div>
        <span class="freq-rate">正答率 <b class="num">${pct}</b>%<small>(${esc(parts)})</small></span>
      </div>`;
  }

  // テーマの基礎知識の最初の項目(トピックの中で開く)。なければ null
  function basicLink(t) {
    const ids = Array.isArray(t.basicIds) ? t.basicIds : [];
    const I = window.AppIndex;
    if (!I || !I.topicsById[t.topicId]) return null;
    const order = I.topicBasicOrder && Array.isArray(I.topicBasicOrder[t.topicId]) ? I.topicBasicOrder[t.topicId] : ids;
    const first = order.find((id) => ids.includes(id) && I.termsById[id]) || ids.find((id) => I.termsById[id]);
    return first ? `#topics/${t.topicId}/${first}` : null;
  }

  // テーマの4択(#quiz/freq/<テーマID>)・○×(#ox/freq/<テーマID>)を始めるボタン(問題・文がなければ出さない)
  function startButtonsHtml(t) {
    const mc = Freq.quizIdsOf(t.id).length;
    const ox = Freq.statementCountOf(t.id);
    const name = esc(t.name);
    return `
      ${mc ? `<a class="btn btn-sm" href="#quiz/freq/${encodeURIComponent(t.id)}" data-role="start-mc" aria-label="「${name}」を4択で解く(${mc}問)">${ic(`pencil-check`, 16)}<span>4択で解く</span><span class="freq-btn-count num">${mc}問</span></a>` : ``}
      ${ox ? `<a class="btn btn-sm btn-secondary" href="#ox/freq/${encodeURIComponent(t.id)}" data-role="start-ox" aria-label="「${name}」を○×で解く(${ox}文)">${ic(`o-x`, 16)}<span>○×で解く</span><span class="freq-btn-count num">${ox}文</span></a>` : ``}`;
  }

  function rowHtml(t, m, total) {
    const last = t.last ? Freq.examLabel(t.last) : ``;
    const read = basicLink(t);
    const btns = startButtonsHtml(t).trim();
    return `
      <li class="card freq-row cat-${esc(t.cat)}" id="freq-${esc(t.id)}" data-role="freq-row" data-theme-id="${esc(t.id)}" data-rank="${esc(t.rank)}" tabindex="-1">
        <div class="freq-row-top">
          ${Freq.chipFor(t)}
          <h4 class="freq-row-name">${esc(t.name)}</h4>
        </div>
        <p class="freq-row-meta">
          <span class="freq-row-hits"><span class="num">${total}</span>回中<b class="num">${Number(t.hits) || 0}</b>回</span>
          ${last ? `<span class="freq-row-last">最後に出たのは${esc(last)}</span>` : `<span class="freq-row-last">数えた回では出題なし</span>`}
          ${read ? `<a class="link-btn freq-row-read" href="${read}">${ic(`book-open`, 14)}基礎を読む</a>` : ``}
        </p>
        ${masteryHtml(m)}
        <div class="freq-row-actions">${btns || `<span class="freq-row-none">このテーマの問題は準備中です</span>`}</div>
      </li>`;
  }

  function listHtml(cat, all) {
    const total = Freq.total();
    const list = Freq.themes().filter((t) => t.cat === cat).sort(Freq.byRank);
    if (!list.length) return `<p class="prog-note">この分野のテーマはまだありません。</p>`;
    return Freq.RANKS.map((r) => {
      const rows = list.filter((t) => t.rank === r);
      if (!rows.length) return ``;
      return `
        <section class="freq-group" data-rank="${r}" aria-labelledby="freq-g-${r}">
          <h3 class="freq-group-title" id="freq-g-${r}">${Freq.chipHtml(r)}<span>${RANK_HEAD[r]}</span><span class="freq-group-count num">${rows.length}</span></h3>
          <ol class="freq-list">${rows.map((t) => rowHtml(t, all[t.id], total)).join(``)}</ol>
        </section>`;
    }).join(``);
  }

  function infoSheet(i) {
    UI.sheet({
      title: `出題頻度ランクについて`,
      content: `<div class="view-info">
        <p>宅建士試験の過去の本試験(${esc(rangeText(i))})の問題を、このアプリの論点(テーマ)に分けて、それぞれの論点が何回の試験で出たかを数えたランクです。</p>
        ${i.method ? `<p>${esc(i.method)}</p>` : ``}
        <p>A は ${Math.round(i.rankRule.A * 100)}%以上の回、B は ${Math.round(i.rankRule.B * 100)}%以上の回で出た論点です。どの論点が出るかは年によって変わるので、ランクは目安として使ってください。C の論点も出ることがあります。</p>
        <p>過去問の問題文は載せていません(数えた回数だけです)。集計: ${esc(i.asOf ? DateUtil.toJapanese(i.asOf) : ``)}時点。</p>
        <p>正答率は、そのテーマの4択(最後に答えた結果)と○×(文ごとの最後の結果)を合わせたものです。</p>
      </div>`,
    });
  }

  function render(root, param) {
    const wrap = document.createElement(`div`);
    wrap.className = `view freq-view`;
    root.appendChild(wrap);
    if (!ready()) {
      wrap.innerHTML = `<h2>出題頻度ランク</h2>`;
      wrap.appendChild(UI.emptyState({ icon: `star`, title: `出題頻度のデータを読み込めませんでした`, body: `通信状態を確かめて、再読み込みしてください。4択・○×はそのまま使えます。`, cta: { label: `4択問題へ`, nav: `#quiz` } }));
      return;
    }
    const i = Freq.info();
    const cats = Freq.CATS.filter((c) => Freq.themes().some((t) => t.cat === c.id));
    // 開く分野: #freq/<分野> → #freq/<テーマ> の分野 → 戻ってきたとき → 前に開いた分野 → 最初の分野
    const target = param && Freq.theme(param) ? Freq.theme(param) : null;
    const hs = historyState();
    const savedTab = Storage.isPlainObject(hs.fState) ? hs.fState.tab : null;
    const pick = [param, target && target.cat, savedTab, loadPrefs().tab].find((x) => cats.some((c) => c.id === x));
    let tab = pick || (cats[0] ? cats[0].id : null);
    const all = Freq.masteryAll();
    const countA = Freq.themes().filter((t) => t.rank === `A`).length;

    wrap.innerHTML = `
      <div class="view-head">
        <h2>出題頻度ランク</h2>
        <button type="button" class="btn btn-icon view-info-btn" data-role="view-info" aria-label="出題頻度ランクについて" aria-haspopup="dialog">${ic(`info`, 20)}</button>
      </div>
      <section class="card freq-intro" aria-label="ランクの決め方">
        <p class="freq-intro-lead">宅建士試験の過去の本試験<b>${esc(rangeText(i))}</b>で、論点ごとに出題された回数からランクを付けました。</p>
        ${legendHtml(i)}
        ${i.method ? `<p class="freq-intro-note">${esc(i.method)}</p>` : ``}
        <p class="freq-intro-meta">${ic(`info`, 14)}<span>ランクは目安です。${i.asOf ? `${esc(DateUtil.toJapanese(i.asOf))}時点の集計。` : ``}</span></p>
        ${countA ? `<div class="freq-intro-actions">
          <a class="btn btn-sm" href="#quiz/freq/A" data-role="all-mc">${ic(`pencil-check`, 16)}頻出Aを4択で</a>
          <a class="btn btn-sm btn-secondary" href="#ox/freq/A" data-role="all-ox">${ic(`o-x`, 16)}頻出Aを○×で</a>
        </div>` : ``}
      </section>
      <div class="segmented freq-tabs" role="group" aria-label="分野" data-role="tabs">
        ${cats.map((c) => `<button type="button" class="segmented-item" data-cat="${c.id}" aria-pressed="${c.id === tab}" aria-label="${esc(c.full)}(${Freq.themes().filter((t) => t.cat === c.id).length}論点)"><span>${esc(c.name)}</span><span class="segmented-count num" aria-hidden="true">${Freq.themes().filter((t) => t.cat === c.id).length}</span></button>`).join(``)}
      </div>
      <div class="freq-body" data-role="freq-list"></div>
    `;
    const listEl = wrap.querySelector(`[data-role="freq-list"]`);
    wrap.querySelector(`[data-role="view-info"]`).addEventListener(`click`, () => infoSheet(i));

    function paint() {
      const c = cats.find((x) => x.id === tab);
      listEl.className = `freq-body cat-${tab || `gyoho`}`;
      listEl.innerHTML = c ? `<p class="sr-only">${esc(c.full)}の論点</p>${listHtml(tab, all)}` : ``;
    }

    function saveState() {
      try { window.history.replaceState(Object.assign({}, historyState(), { fState: { tab } }), ``); } catch (e) { /* 保存できなくても表示には影響しない */ }
    }

    wrap.querySelector(`[data-role="tabs"]`).addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-cat]`);
      if (!b || b.dataset.cat === tab) return;
      tab = b.dataset.cat;
      wrap.querySelectorAll(`[data-cat]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
      paint();
      saveState();
      saveTab(tab);
    });

    paint();
    saveState();
    // #freq/<テーマID>: その行へ(強調して、フォーカスも移す)
    if (target) {
      const row = listEl.querySelector(`#freq-${CSS.escape(target.id)}`);
      if (row) {
        requestAnimationFrame(() => {
          UI.scrollIntoView(row, `center`);
          row.classList.add(`highlighted`);
          row.focus({ preventScroll: true });
          setTimeout(() => row.classList.remove(`highlighted`), 2400);
        });
      }
    }
  }

  return { render, _internal: { rangeText, basicLink } };
})();

// 学習の進捗(#progress)の「頻出Aで伸ばしたい論点」(js/views/progress.js の data-role="freq-card" の置き場所に描く)
// 頻出Aのテーマのうち、解いた数が下限(Freq.MIN_ANSWERED)以上で正答率が8割未満のものを正答率の低い順に5つ。
// なければ、よく出る順にまだあまり解いていないテーマを3つ。
// 宅建士試験が目的・目標(未設定も含む)でなく、テーマのある問題を1つも解いていなければ何も描かない(置き場所は空のまま隠れる)
window.FreqUi = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 18 });
  const esc = (s) => UI.escapeHtml(s);
  const LIMIT = 5;
  const FRESH_LIMIT = 3;
  const GOOD = 0.8; // これ以上の正答率の論点は「伸ばしたい」に入れない

  function rowHtml(x, start) {
    const t = x.theme;
    const m = x.m;
    const pct = Math.round(m.rate * 100);
    const sub = m.answered ? `正答率 ${pct}%・解いた数 ${m.answered}` : `まだ解いていません`;
    const btns = [
      Freq.quizIdsOf(t.id).length ? `<a class="btn btn-sm freq-btn-mini" href="#quiz/freq/${encodeURIComponent(t.id)}" data-role="start-mc" aria-label="「${esc(t.name)}」を4択で解く">${ic(`pencil-check`, 16)}<span>4択</span></a>` : ``,
      Freq.statementCountOf(t.id) ? `<a class="btn btn-sm btn-secondary freq-btn-mini" href="#ox/freq/${encodeURIComponent(t.id)}" data-role="start-ox" aria-label="「${esc(t.name)}」を○×で解く"><span>○×</span></a>` : ``,
    ].join(``);
    return `
      <li class="freq-prog-row cat-${esc(t.cat)}" data-role="freq-prog-row" data-theme-id="${esc(t.id)}">
        <div class="freq-prog-main">
          <p class="freq-prog-name">${Freq.chipFor(t)}<span>${esc(t.name)}</span></p>
          <p class="freq-prog-sub${m.answered && m.rate < 0.6 ? ` is-weak` : ``}">${esc(sub)}</p>
          ${m.answered ? `<div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill" style="width:${pct}%"></div></div>` : ``}
        </div>
        ${start && btns ? `<div class="freq-prog-actions">${btns}</div>` : ``}
      </li>`;
  }

  function renderProgress(el) {
    if (!el) return;
    el.innerHTML = ``;
    if (!(window.Freq && Freq.ready())) return;
    const all = Freq.masteryAll();
    const anyAnswered = Object.keys(all).some((id) => all[id].answered > 0);
    if (!Freq.forTakken() && !anyAnswered) return;
    // 正答率が8割以上の論点は「伸ばしたい」に入れない
    const tried = Freq.weakThemes({ rank: `A`, mastery: all });
    const weak = tried.filter((x) => x.m.rate < GOOD).slice(0, LIMIT);
    const fresh = weak.length ? [] : Freq.freshThemes({ rank: `A`, limit: FRESH_LIMIT, mastery: all });
    const note = weak.length ? `宅建士試験でよく出る(頻出A)論点のうち、正答率の低い順です。`
      : tried.length ? `解いた頻出Aの論点は、どれも正答率8割以上です。${fresh.length ? `まだあまり解いていない論点も解いてみましょう。` : ``}`
        : `頻出Aの論点を${Freq.MIN_ANSWERED}問(文)以上解くと、正答率の低い順にここに出ます。まずはよく出る論点から始めましょう。`;
    if (!weak.length && !fresh.length && !tried.length) return;
    const list = weak.length ? weak : fresh;
    const card = document.createElement(`section`);
    card.className = `card freq-prog-card`;
    card.setAttribute(`aria-labelledby`, `freq-prog-title`);
    card.innerHTML = `
      <h3 class="card-title prog-title" id="freq-prog-title"><span class="sticker sticker-sm sticker-gold" aria-hidden="true">${ic(`star-fill`, 18)}</span><span>頻出Aで伸ばしたい論点</span></h3>
      <p class="prog-note">${esc(note)}</p>
      ${list.length ? `<ol class="freq-prog-list">${list.map((x) => rowHtml(x, true)).join(``)}</ol>` : ``}
      <div class="card-actions"><a class="link-btn" href="#freq">${ic(`star`, 16)}出題頻度ランクを見る${ic(`chevron-right`, 16)}</a></div>`;
    el.appendChild(card);
  }

  return { renderProgress };
})();
