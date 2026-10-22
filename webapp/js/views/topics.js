// 学習トピックビュー: 目的別(暮らし・取引/宅建士試験/税理士試験)のトピック一覧 + トピック詳細(基礎知識/問題/用語/法律)
// ルート: #topics / #topics/<topicId> / #topics/<topicId>/<基礎知識ID>
// v14: 宅建士試験のトピックでは、基礎知識の小見出しと項目に出題頻度ランクの札(「頻出A」など。js/freq.js)を付ける
window.Views = window.Views || {};
window.Views.topics = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);

  // 一覧の切り替え(暮らし・取引 / 宅建士試験 / 税理士試験)
  const TRACKS = [
    { id: `life`, label: `暮らし・取引` },
    { id: `takken`, label: `宅建士試験` },
    { id: `zeirishi`, label: `税理士試験` },
  ];
  // v14: 一覧の上に出す、覚えるためのツールの入口(js/nav.js の ITEMS の画面名)
  const HUB_VIEWS = [`compare`, `numbers`];
  // 暮らし・取引のまとまり(まだないトピックは表示しない)
  const LIFE_GROUPS = [
    { id: `rent`, name: `住まいを借りる`, ids: [`topicI`, `topicA`] },
    { id: `own`, name: `買う・持つ・売る`, ids: [`topicB`, `topicC`, `topicD`, `topicP`, `topicQ`, `topicE`, `topicH`] },
    { id: `trade`, name: `業界のしくみとトラブル`, ids: [`topicF`, `topicG`] },
  ];

  // 学ぶ目的(設定・初回ガイドで選んだもの)。未設定なら登録している試験から決める
  function profileGoal() {
    try {
      const p = window.Stats && typeof Stats.getProfile === `function` ? Stats.getProfile() : null;
      if (p && typeof p.goal === `string`) return p.goal;
    } catch (e) { /* 読めなければ試験の登録から決める */ }
    const target = window.Stats && Stats.primaryTarget ? Stats.primaryTarget() : null;
    return target ? target.examTypeId : null;
  }

  function defaultTrack() {
    const g = profileGoal();
    return g === `takken` || g === `zeirishi` ? g : `life`;
  }

  function render(root, param) {
    if (param) {
      const [topicId, basicId] = param.split(`/`);
      const topic = AppIndex.topicsById[topicId];
      // 統合した古い基礎知識ID(保存済みのリンク)は引き継ぎ先の項目を開く
      const focusId = basicId && AppIndex.retiredTermId ? AppIndex.retiredTermId(basicId) : basicId;
      if (topic) { renderDetail(root, topic, focusId || null); return; }
    }
    renderList(root);
  }

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  // v14: 宅建士試験の出題頻度ランクの札(js/freq.js。テーマ(論点)のある基礎知識と、その小見出しだけ)
  function freqOn() {
    return !!(window.Freq && Freq.ready());
  }

  function basicFreqChip(id) {
    const t = freqOn() ? Freq.themeOfBasic(id) : null;
    return t ? Freq.chipFor(t, { cls: `basics-freq-chip` }) : ``;
  }

  // 小見出しの札は、その中でいちばん高いランク
  function sectionFreqChip(topicId, sec) {
    const t = freqOn() ? Freq.sectionBest(topicId, sec.name, sec.ids) : null;
    return t ? Freq.chipFor(t, { cls: `basics-freq-chip`, prefix: `この中でいちばん高いランクは` }) : ``;
  }

  function isLearned(progress, id) {
    return !!(Storage.isPlainObject(progress[id]) && progress[id].learned);
  }

  // 一覧のまとまり: [{id, name, meta, topics}](1つのトピックは同じ一覧の中で1回だけ出す)
  function trackGroups(track) {
    const byId = AppIndex.topicsById;
    const takken = Stats.examType(`takken`);
    const cats = takken && Array.isArray(takken.categories) ? takken.categories : [];
    const zei = Stats.examType(`zeirishi`);
    const zeiCats = zei && Array.isArray(zei.categories) ? zei.categories : [];
    const zeiIds = zeiCats.flatMap((c) => c.topicIds || []);
    const used = new Set();
    const pick = (ids) => ids.filter((id) => byId[id] && !used.has(id)).map((id) => { used.add(id); return byId[id]; });
    let groups;
    if (track === `takken`) {
      // 宅建士の出題分野ごと(分野の中は試験設定 data/exams.js の topicIds の順)
      groups = cats.map((c) => ({ id: c.id, name: c.name, meta: c.questions ? `例年${c.questions}問` : ``, topics: pick(c.topicIds || []) }));
    } else if (track === `zeirishi`) {
      // 税理士試験の分野ごと(不動産税務 / 不動産と消費税 / 消費税法。data/exams.js の順)
      groups = zeiCats.map((c) => ({ id: c.id, name: c.name, meta: ``, topics: pick(c.topicIds || []) }));
    } else {
      groups = LIFE_GROUPS.map((g) => ({ id: g.id, name: g.name, meta: ``, topics: pick(g.ids) }));
      // どの一覧にも入っていないトピック(新しく追加したものなど)は、暮らし・取引の最後にまとめる
      const elsewhere = new Set(cats.flatMap((c) => c.topicIds || []).concat(zeiIds));
      const rest = window.APP_DATA.topics.filter((t) => !used.has(t.id) && !elsewhere.has(t.id)).map((t) => t.id);
      groups.push({ id: `other`, name: `そのほかのテーマ`, meta: ``, topics: pick(rest) });
    }
    return groups.filter((g) => g.topics.length);
  }

  // トピックの分野({ id, name })。色はステッカーと進捗バーに使う(cardUi.js がなければ暮らしの緑)
  function topicCat(topicId) {
    return window.CardUi && typeof CardUi.topicCategory === `function` ? CardUi.topicCategory(topicId) : { id: `life`, name: null };
  }

  // トピックのカード: 分野の色のステッカー・題名・説明(2行まで)・進捗バー。レベルと項目数は札にせず1行の小さな文字で
  function topicCardHtml(topic, stat) {
    const basicsCount = topic.basicIds.filter((id) => AppIndex.termsById[id]).length;
    const quizCount = (AppIndex.topicQuizIndex[topic.id] || []).length;
    const done = stat.total > 0 && stat.done >= stat.total;
    // 基礎知識も問題もまだないトピック(執筆中)は「準備中」と添える
    const meta = [esc(topic.level), basicsCount ? `基礎知識 ${basicsCount}` : ``, quizCount ? `問題 ${quizCount}` : ``, !basicsCount && !quizCount ? `準備中` : ``].filter(Boolean).join(`・`);
    return `
      <a class="card card-interactive topic-card cat-${topicCat(topic.id).id}${done ? ` is-done` : ``}" href="#topics/${topic.id}">
        <div class="topic-card-head">
          <span class="topic-icon" aria-hidden="true">${ic(topic.icon || `book-open`, 24)}</span>
          <div class="topic-card-main">
            <div class="topic-card-title">${esc(topic.name)}</div>
            <p class="topic-card-desc">${esc(topic.description)}</p>
          </div>
        </div>
        <div class="topic-progress-row"><span class="sr-only">進捗(記憶済み・学習済み)</span><div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill${done ? ` fill-success` : ``}" style="width:${stat.pct}%"></div></div><span class="topic-progress-num num">${done ? ic(`check`, 16) : ``}${stat.done}/${stat.total}</span></div>
        <p class="topic-card-meta">${meta}</p>
      </a>`;
  }

  function renderList(root) {
    const byTopic = {};
    Stats.byTopic().forEach((r) => { byTopic[r.topic.id] = r; });

    // 戻るで帰ってきたときは、選んでいた一覧を元に戻す(履歴エントリごとに保存)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const savedTrack = Storage.isPlainObject(hs.tState) && hs.tState.list === true ? hs.tState.track : null;
    let track = TRACKS.some((t) => t.id === savedTrack) ? savedTrack : defaultTrack();
    const myHash = location.hash;

    const wrap = document.createElement(`div`);
    wrap.className = `view topics-view`;
    // 画面の説明は見出しの ⓘ から(一覧の上に説明文を置かない)
    wrap.innerHTML = `
      <div class="learn-head">
        <h2>学習トピック</h2>
        <button type="button" class="btn btn-icon learn-info-btn" data-role="info" aria-label="学習トピックについて" aria-haspopup="dialog">${ic(`info`)}</button>
      </div>
      ${window.Nav && Nav.tilesHtml ? Nav.tilesHtml(HUB_VIEWS, `覚えるためのツール`) : ``}
      <div class="segmented seg-bold topic-tracks" role="group" aria-label="表示するトピック">
        ${TRACKS.map((t) => `<button type="button" class="segmented-item" data-track="${t.id}" aria-pressed="${t.id === track}">${t.label}</button>`).join(``)}
      </div>
      <div data-role="groups"></div>
    `;
    root.appendChild(wrap);
    wrap.querySelector(`[data-role="info"]`).addEventListener(`click`, () => {
      UI.sheet({
        title: `学習トピックについて`,
        content: `<p class="learn-info-text">テーマごとに、基礎知識 → 用語カード → 問題の順で学べます。</p><p class="learn-info-text">カードの進捗は、基礎知識の「学習済み」と用語カードの「記憶済み」を合わせた数です。全部そろうとバーが金色になります。</p>`,
      });
    });
    const groupsEl = wrap.querySelector(`[data-role="groups"]`);

    function paintGroups() {
      groupsEl.innerHTML = trackGroups(track).map((g) => `
        <section class="topic-group">
          <div class="topic-group-head"><h3>${esc(g.name)}</h3>${g.meta ? `<span class="topic-group-meta">${esc(g.meta)}</span>` : ``}</div>
          <div class="topic-grid">${g.topics.map((topic) => topicCardHtml(topic, byTopic[topic.id] || { done: 0, total: 0, pct: 0 })).join(``)}</div>
        </section>`).join(``);
    }

    function saveTrack() {
      if (location.hash !== myHash || !wrap.isConnected) return;
      try {
        const st = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
        window.history.replaceState(Object.assign({}, st, { tState: { list: true, track } }), ``);
      } catch (e) { /* 履歴の保存に失敗しても表示には影響しない */ }
    }

    wrap.querySelectorAll(`[data-track]`).forEach((b) => b.addEventListener(`click`, () => {
      if (b.dataset.track === track) return;
      track = b.dataset.track;
      wrap.querySelectorAll(`[data-track]`).forEach((x) => x.setAttribute(`aria-pressed`, String(x === b)));
      paintGroups();
      saveTrack();
    }));
    paintGroups();
  }

  // 件数の多い一覧は一定数ずつ表示して「もっと見る」で末尾に追加する(作り直さないのでスクロール位置が飛ばない)
  // initial: 戻るで帰ってきたときに最初から表示しておく件数
  function renderPaged(container, items, build, page, unit, initial, onMore) {
    let shown = 0;
    let btn = null;
    function more(count) {
      const next = Math.min(items.length, shown + (count || page));
      const fragment = document.createDocumentFragment();
      items.slice(shown, next).forEach((it) => { const el = build(it); if (el) fragment.appendChild(el); });
      container.appendChild(fragment);
      shown = next;
      if (shown >= items.length) { if (btn) { btn.remove(); btn = null; } return; }
      if (!btn) {
        btn = document.createElement(`button`);
        btn.type = `button`;
        btn.className = `btn load-more-btn`;
        btn.addEventListener(`click`, () => { more(); if (onMore) onMore(); });
        container.insertAdjacentElement(`afterend`, btn);
      }
      btn.textContent = `もっと見る(残り${items.length - shown}${unit})`;
    }
    more(Math.max(page, Number(initial) || 0));
    return { shown: () => shown };
  }

  function renderDetail(root, topic, focusBasicId) {
    const basicsProgress = obj(`basicsProgress`);
    const known = obj(`flashcards`);
    Storage.set(`lastTopic`, topic.id);
    const stat = Stats.byTopic().find((r) => r.topic.id === topic.id) || { done: 0, total: 0, pct: 0 };
    const termIds = AppIndex.topicTermIndex[topic.id] || [];
    const quizIds = AppIndex.topicQuizIndex[topic.id] || [];
    const lawIds = AppIndex.topicLawIndex[topic.id] || [];
    const sections = (AppIndex.topicSections && AppIndex.topicSections[topic.id]) || null;
    const order = ((AppIndex.topicBasicOrder && AppIndex.topicBasicOrder[topic.id]) || topic.basicIds).filter((id) => AppIndex.termsById[id]);
    const episodes = topic.episodes.filter((id) => AppIndex.episodesById[id]);
    const laws = lawIds.map((id) => window.APP_DATA.laws.laws.find((l) => l.id === id)).filter(Boolean);
    const quizById = {};
    window.APP_DATA.quiz.forEach((item) => { quizById[item.id] = item; });
    const quizzes = quizIds.map((id) => quizById[id]).filter(Boolean);
    const allMc = quizzes.length > 0 && quizzes.every((q) => q.format === `mc`);
    const quizLabel = allMc ? `4択問題` : `確認問題`;
    const oxCount = window.QuizEngine && QuizEngine.statementsFrom ? quizzes.reduce((n, q) => n + QuizEngine.statementsFrom(q).length, 0) : 0;
    // 用語カードは基礎知識チェックリストにない用語だけ(同じ内容を2回並べない)。
    // 作品由来の俗語(worksOnly)は「作品で学ぶ」コーナー用なので出さない
    const extraTerms = termIds.filter((id) => !topic.basicIds.includes(id)).map((id) => AppIndex.termsById[id]).filter((t) => t && t.worksOnly !== true);
    // 基礎知識も用語もまだないトピック(執筆中)では、自動生成クイズ(用語から作る)と用語集への案内を出さない
    const hasTerms = order.length > 0 || extraTerms.length > 0;
    const practiceHtml = [
      quizzes.length ? `<a class="btn btn-lg topic-practice-main" href="#quiz/${topic.id}">${ic(`pencil-check`, 24)}<span class="topic-practice-text"><span>${quizLabel}</span><span class="topic-practice-count">${quizzes.length}問</span></span>${ic(`arrow-right`, 20)}</a>` : ``,
      oxCount ? `<a class="btn btn-secondary btn-lg" href="#ox/topic/${topic.id}">${ic(`o-x`, 24)}<span class="topic-practice-text"><span><span class="sr-only">○×</span>一問一答</span><span class="topic-practice-count">${oxCount}問</span></span></a>` : ``,
      !quizzes.length && hasTerms ? `<a class="btn btn-secondary btn-lg" href="#quiz/auto/${topic.id}">${ic(`sparkles`, 24)}<span class="topic-practice-text"><span>自動生成クイズ</span></span></a>` : ``,
    ].join(``);

    // 戻る/再読み込みで帰ってきたときは、開いていた項目・表示件数・絞り込みを元に戻す(履歴エントリごとに保存)
    // (Router は描画の直後に保存位置へスクロールするので、ここで同期的に元の高さまで作っておく)
    // 直リンク(#topics/<id>/<基礎知識ID>)の履歴へ戻ってきたとき(この履歴に保存した状態がある)も、保存した状態を使う
    // (スクロール位置で判定すると、画面の一番上で操作してから離れたときに、戻ると直リンクの最初の表示に戻ってしまう)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const returning = Number(hs.y) > 0;
    const saved = hs.tState && typeof hs.tState === `object` && hs.tState.topic === topic.id ? hs.tState : null;
    const myHash = location.hash;

    const wrap = document.createElement(`div`);
    wrap.className = `view topic-detail-view`;
    const navItems = [
      [`sec-basics`, `基礎知識`, `check-circle`],
      [`sec-quiz`, `問題`, `pencil-check`],
      [`sec-terms`, `用語カード`, `layers`],
      laws.length ? [`sec-laws`, `関連法律`, `library`] : null,
    ].filter(Boolean);
    // 見出し: 分野の色の大きなステッカー・分野名とレベル・題名、その下に進捗のバー(全部そろうと金色)
    const cat = topicCat(topic.id);
    const heroDone = stat.total > 0 && stat.done >= stat.total;
    wrap.innerHTML = `
      <a class="btn back-btn" href="#topics">${ic(`chevron-left`, 18)}トピック一覧</a>
      <div class="topic-hero cat-${cat.id}">
        <span class="topic-icon" aria-hidden="true">${ic(topic.icon || `book-open`, 32)}</span>
        <div class="topic-hero-main">
          <p class="topic-hero-eyebrow">${cat.name && cat.name !== topic.name ? `<b>${esc(cat.name)}</b>・` : ``}${esc(topic.level)}</p>
          <h2>${esc(topic.name)}</h2>
        </div>
      </div>
      <div class="topic-hero-progress cat-${cat.id}">
        <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill${heroDone ? ` fill-success` : ``}" data-role="hero-bar" style="width:${stat.pct}%"></div></div>
        <span class="topic-hero-pct num" data-role="hero-pct"><span class="sr-only">このトピックの進捗(記憶済み・学習済み)</span>${stat.pct}%</span>
      </div>
      <p class="view-desc topic-desc">${esc(topic.description)}</p>
      ${practiceHtml ? `<div class="topic-practice">${practiceHtml}</div>` : ``}
      <div class="topic-detail-layout">
        <div class="topic-main">
          <section id="sec-basics" class="topic-sec">
            <div class="section-head"><h3>基礎知識</h3><span class="topic-group-meta" data-role="basics-count"></span></div>
            <div class="basics-progress" data-role="basics-progress" hidden>
              <div class="basics-tools">
                <button type="button" class="btn btn-secondary btn-sm basics-next" data-role="next-unlearned"></button>
                <div class="segmented basics-filter" role="group" aria-label="表示する基礎知識" data-role="basics-filter">
                  <button type="button" class="segmented-item" data-filter="all" aria-pressed="true">すべて</button>
                  <button type="button" class="segmented-item" data-filter="unlearned" aria-pressed="false">未学習のみ</button>
                </div>
              </div>
            </div>
            <ul class="${sections ? `basics-sections` : `basics-checklist`}" data-role="basics-list"></ul>
          </section>
          <section id="sec-quiz" class="topic-sec">
            <div class="section-head"><h3>このトピックの問題</h3>${quizzes.length ? `<a class="btn btn-sm" href="#quiz/${topic.id}">${ic(`pencil-check`, 16)}1問ずつ解く<span class="sr-only">(${quizLabel}${quizzes.length}問)</span></a>` : ``}</div>
            <div class="quiz-list" data-role="quiz-list"></div>
            ${hasTerms ? `<div class="card-actions"><a class="btn btn-secondary" href="#quiz/auto/${topic.id}">${ic(`sparkles`)}自動生成クイズに挑戦</a></div>` : ``}
          </section>
          <section id="sec-terms" class="topic-sec">
            <div class="section-head"><h3>用語カード</h3>${hasTerms ? `<a class="link-btn" href="#glossary/topic/${topic.id}">用語集で見る${ic(`chevron-right`, 16)}</a>` : ``}</div>
            ${order.length ? `<a class="card card-interactive basics-card-hint" href="#glossary/topic/${topic.id}"><span class="sticker sticker-sm" aria-hidden="true">${ic(`layers`, 18)}</span><span>基礎知識(${order.length}項目)もカードで暗記チェック</span>${ic(`chevron-right`, 18)}</a>` : ``}
            <div class="card-grid" data-role="term-grid"></div>
          </section>
          ${laws.length ? `
          <section id="sec-laws" class="topic-sec">
            <div class="section-head"><h3>関連法律・制度</h3></div>
            <div class="law-row-grid">${laws.map((law) => `<div class="card card-compact law-row"><div class="law-name">${ic(`library`, 18)}${esc(law.name)}</div><div class="law-desc">${esc(law.description)}</div></div>`).join(``)}</div>
          </section>` : ``}
          ${episodes.length ? `<a class="card card-interactive topic-works-link" href="#works/topic/${topic.id}">${ic(`play-square`, 18)}<span>作品で学ぶ: このテーマを扱った回(${episodes.length}件)</span>${ic(`chevron-right`, 16)}</a>` : ``}
        </div>
        <aside class="topic-rail" aria-label="このトピックの進捗">
          <div class="card topic-rail-card cat-${cat.id}">
            <div class="stat-value" data-role="rail-pct">${stat.pct}<small>%</small></div>
            <div class="stat-label">このトピックの進捗(★記憶済み+✓学習済み)</div>
            <div class="stat-label num" data-role="rail-label">${stat.done}/${stat.total}項目</div>
            <div class="progress-bar topic-rail-bar"><div class="progress-bar-fill${heroDone ? ` fill-success` : ``}" data-role="rail-bar" style="width:${stat.pct}%"></div></div>
          </div>
          <div class="card card-compact topic-rail-card">
            <div class="side-nav-heading topic-rail-heading">このページの内容</div>
            ${navItems.map(([id, label, icon]) => `<button type="button" class="side-nav-item" data-jump="${id}">${ic(icon, 18)}${label}</button>`).join(``)}
          </div>
        </aside>
      </div>
    `;
    root.appendChild(wrap);

    wrap.querySelectorAll(`[data-jump]`).forEach((b) => b.addEventListener(`click`, () => UI.scrollIntoView(wrap.querySelector(`#${b.dataset.jump}`), `start`)));

    // ---- 状態の保存(戻るで復元する) ----
    let termsPager = null;
    let quizPager = null;
    let filterUnlearned = !!(saved && saved.unlearned);
    // 回答した問題(問題ID → 選んだ番号 / 記述は 'ok'・'ng')と、めくった用語カード。
    // 回答・裏返しでカードの背が伸びるため、戻ったときに元の表示にしないと位置がずれる
    const answeredMap = {};
    if (saved && Storage.isPlainObject(saved.answered)) {
      quizzes.forEach((q) => {
        const v = saved.answered[q.id];
        if ((Number.isInteger(v) && v >= 0 && v < 4) || v === `ok` || v === `ng`) answeredMap[q.id] = v;
      });
    }
    const flippedIds = new Set(saved && Array.isArray(saved.flipped) ? saved.flipped.filter((id) => typeof id === `string` && extraTerms.some((t) => t.id === id)) : []);
    let saveTimer = null;
    function saveState() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        // 別の画面へ移ったあとに書き込むと、移動先の履歴エントリに混ざるため
        if (location.hash !== myHash || !document.body.contains(wrap)) return;
        try {
          const st = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
          const open = Array.from(wrap.querySelectorAll(`.basics-item > details[open]`)).map((d) => d.parentNode.dataset.id);
          const secs = Array.from(wrap.querySelectorAll(`.basics-section > details[open]`)).map((d) => d.parentNode.dataset.sec);
          // 「未学習のみ」の表示中にチェックしてその場に残した項目・小見出し
          const keep = Array.from(wrap.querySelectorAll(`.basics-item.keep-visible`)).map((li) => li.dataset.id);
          const keepSecs = Array.from(wrap.querySelectorAll(`.basics-section.keep-visible`)).map((li) => li.dataset.sec);
          window.history.replaceState(Object.assign({}, st, {
            tState: {
              topic: topic.id, open, secs, terms: termsPager ? termsPager.shown() : 0, quiz: quizPager ? quizPager.shown() : 0, unlearned: filterUnlearned,
              keep, keepSecs, answered: Object.assign({}, answeredMap), flipped: Array.from(flippedIds),
            },
          }), ``);
        } catch (e) { /* 履歴の保存に失敗しても表示には影響しない */ }
      }, 120);
    }

    // ---- 基礎知識チェックリスト ----
    const basicsList = wrap.querySelector(`[data-role="basics-list"]`);
    const basicsCount = wrap.querySelector(`[data-role="basics-count"]`);
    const progressBox = wrap.querySelector(`[data-role="basics-progress"]`);
    const nextBtn = wrap.querySelector(`[data-role="next-unlearned"]`);
    const filterSeg = wrap.querySelector(`[data-role="basics-filter"]`);
    const itemEls = new Map();
    const secOf = new Map();
    const secEls = [];

    function learned(id) { return isLearned(basicsProgress, id); }

    // 進捗(見出しのバーと、広い画面の右側)を塗り直す。全部そろったらバーは金色
    function updateRail() {
      const st = Stats.byTopic().find((r) => r.topic.id === topic.id);
      if (!st) return;
      const full = st.total > 0 && st.done >= st.total;
      const pctEl = wrap.querySelector(`[data-role="rail-pct"]`);
      const labelEl = wrap.querySelector(`[data-role="rail-label"]`);
      const barEl = wrap.querySelector(`[data-role="rail-bar"]`);
      const heroBar = wrap.querySelector(`[data-role="hero-bar"]`);
      const heroPct = wrap.querySelector(`[data-role="hero-pct"]`);
      if (pctEl) pctEl.innerHTML = `${st.pct}<small>%</small>`;
      if (labelEl) labelEl.textContent = `${st.done}/${st.total}項目`;
      if (barEl) { barEl.style.width = `${st.pct}%`; barEl.classList.toggle(`fill-success`, full); }
      if (heroBar) { heroBar.style.width = `${st.pct}%`; heroBar.classList.toggle(`fill-success`, full); }
      if (heroPct) heroPct.innerHTML = `<span class="sr-only">このトピックの進捗(記憶済み・学習済み)</span>${st.pct}%`;
    }

    function paintSection(sec) {
      const done = sec.ids.filter(learned).length;
      const complete = done === sec.ids.length;
      sec.li.classList.toggle(`is-complete`, complete);
      sec.countEl.classList.toggle(`is-done`, complete);
      sec.countEl.innerHTML = `${complete ? ic(`check`, 14) : ``}<span class="sr-only">学習済み</span>${done}/${sec.ids.length}`;
    }

    function firstUnlearned() {
      return order.find((id) => !learned(id)) || null;
    }

    // この項目より後ろ(学習の順)で最初の未学習
    function nextUnlearnedAfter(id) {
      const i = order.indexOf(id);
      return order.slice(i + 1).find((x) => !learned(x)) || null;
    }

    function updateBasicsHead() {
      const done = order.filter(learned).length;
      basicsCount.textContent = `学習済み ${done}/${order.length}`;
      if (!order.length) return;
      // 基礎知識だけの進捗バーは置かない(見出しの進捗バーと、道の金色の印で示す)
      const next = firstUnlearned();
      nextBtn.disabled = !next;
      nextBtn.innerHTML = next
        ? `${ic(`arrow-right`, 16)}<span class="basics-next-label">次の未学習へ: ${AppIndex.termsById[next].name}</span>`
        : `${ic(`check-circle`, 16)}<span class="basics-next-label">すべて学習済み</span>`;
    }

    function setLearned(id, value) {
      // 別のタブでの記録を消さないよう、最新の値を読み直してから書き込む
      Object.assign(basicsProgress, Storage.get(`basicsProgress`, {}));
      if (!Storage.isPlainObject(basicsProgress[id])) basicsProgress[id] = {};
      // 学習済みにした日(今日のメニューの「新しい基礎知識」の完了判定に使う。以前の記録には無い)
      if (value && !basicsProgress[id].learned) basicsProgress[id].learnedAt = DateUtil.today();
      else if (!value) delete basicsProgress[id].learnedAt;
      basicsProgress[id].learned = value;
      Storage.set(`basicsProgress`, basicsProgress);
      // 学習記録は学習済みにしたときだけ(チェックを外したのは学習ではないので数えない)
      if (value) Streak.recordToday();
      const li = itemEls.get(id);
      if (li) {
        li.classList.toggle(`is-learned`, value);
        const cb = li.querySelector(`[data-role="learned-checkbox"]`);
        if (cb.checked !== value) cb.checked = value;
        // 「未学習のみ」の表示中にチェックした項目は、その場では消さない(一覧が詰まって位置が飛ぶため)
        if (filterUnlearned && value) li.classList.add(`keep-visible`);
        // 学習済みにした瞬間だけ金色の印が「ぽん」と出る(描き直しのときは動かさない)
        if (value) {
          li.classList.add(`just-learned`);
          setTimeout(() => li.classList.remove(`just-learned`), 400);
        }
      }
      // 「学習済みにして次へ / 閉じる」は後ろの未学習の有無で変わるので、作ってある項目のボタンをまとめて塗り直す
      itemEls.forEach((x) => paintCloseBtn(x));
      const sec = secOf.get(id);
      if (sec) {
        paintSection(sec);
        if (filterUnlearned && value) sec.li.classList.add(`keep-visible`);
      }
      updateBasicsHead();
      updateRail();
      // その場に残した項目を戻るでも残す(消えると下の内容が詰まって位置がずれる)
      if (filterUnlearned) saveState();
    }

    // 開いた項目の下の主ボタン: 未学習なら「学習済みにして次へ」(後ろに未学習がなければ「…閉じる」)、学習済みなら「閉じる」
    function paintCloseBtn(li) {
      const btn = li.querySelector(`[data-role="learn-close"]`);
      if (!btn) return;
      const id = li.dataset.id;
      if (learned(id)) {
        btn.className = `btn btn-secondary btn-block basics-learn-btn`;
        btn.textContent = `閉じる`;
        return;
      }
      btn.className = `btn btn-success btn-lg btn-block basics-learn-btn`;
      btn.innerHTML = `${ic(`check`, 20)}${nextUnlearnedAfter(id) ? `学習済みにして次へ` : `学習済みにして閉じる`}`;
    }

    // 項目の本文(読む部分)は開くときに作る(一覧には数十項目あり、ほとんどは閉じたまま)
    function bodyHtml(concept) {
      const id = concept.id;
      const diagrams = CardUi.diagramsFor(id);
      const relQuiz = (AppIndex.termQuizIndex && AppIndex.termQuizIndex[id]) || [];
      const bmOn = window.Bookmarks ? Bookmarks.has(`term:${id}`) : false;
      return `
        <p class="term-simple">${concept.simpleExplanation}</p>
        ${CardUi.deepHtml(concept, topic.id)}
        ${CardUi.buildLawRefHtml(concept)}
        ${CardUi.practiceNoteHtml(concept)}
        ${CardUi.buildSourceCitationHtml(concept)}
        ${diagrams.map((dId) => CardUi.figureHtml(dId)).join(``)}
        ${CardUi.calcLinksHtml(id)}
        <div class="basics-actions">
          <button type="button" data-role="learn-close"></button>
          <div class="basics-actions-row">
            ${relQuiz.length ? `<a class="btn btn-secondary" href="#quiz/q/${encodeURIComponent(relQuiz[0])}">${ic(`pencil-check`, 18)}確認問題 ${relQuiz.length}問</a>` : ``}
            ${window.Bookmarks ? `<button type="button" class="btn btn-secondary bookmark-toggle${bmOn ? ` is-bookmarked` : ``}" data-role="bookmark" data-label="ブックマーク" aria-pressed="${bmOn}">${ic(bmOn ? `bookmark-fill` : `bookmark`, 16)}<span>ブックマーク</span></button>` : ``}
          </div>
        </div>
        ${CardUi.itemMetaHtml(concept, `#topics/${topic.id}/${id}`)}`;
    }

    function ensureBody(li) {
      const body = li && li.querySelector(`.basics-body[data-lazy]`);
      if (!body) return;
      const id = li.dataset.id;
      body.removeAttribute(`data-lazy`);
      body.innerHTML = bodyHtml(AppIndex.termsById[id]);
      paintCloseBtn(li);
      const details = li.querySelector(`details`);
      body.querySelector(`[data-role="learn-close"]`).addEventListener(`click`, () => {
        const wasLearned = learned(id);
        if (!wasLearned) setLearned(id, true);
        details.open = false;
        // 未学習だった項目は、学習の順で次の未学習を開く(なければ閉じた項目の見出しを画面の上端に合わせる)
        const next = wasLearned ? null : nextUnlearnedAfter(id);
        if (next) openItem(next, `start`);
        else UI.scrollIntoView(li, `start`);
      });
      const bm = body.querySelector(`[data-role="bookmark"]`);
      if (bm) {
        bm.addEventListener(`click`, () => {
          const on = Bookmarks.toggle(`term:${id}`);
          CardUi.paintBookmarkButtons(li, on);
        });
      }
    }

    function buildItem(concept) {
      const id = concept.id;
      const done = learned(id);
      const hasDiagram = CardUi.diagramsFor(id).length > 0;
      const li = document.createElement(`li`);
      li.className = `basics-item` + (done ? ` is-learned` : ``);
      li.id = `basic-${id}`;
      li.dataset.id = id;
      li.innerHTML = `
        <label class="basics-check-wrap" title="学習済みにする"><input type="checkbox" class="basics-check" data-role="learned-checkbox" aria-label="「${esc(concept.name)}」を学習済みにする" ${done ? `checked` : ``}><span class="basics-node" aria-hidden="true">${ic(`check`, 18)}</span></label>
        <details>
          <summary>
            <span class="basics-name">${concept.name}</span>
            ${basicFreqChip(id)}
            ${hasDiagram ? `<span class="basics-fig" title="図解あり">${ic(`diagram`, 18)}<span class="sr-only">図解あり</span></span>` : ``}
            <span class="chevron">${ic(`chevron-down`, 18)}</span>
          </summary>
          <div class="basics-body" data-lazy></div>
        </details>
      `;
      const details = li.querySelector(`details`);
      li.querySelector(`[data-role="learned-checkbox"]`).addEventListener(`change`, (e) => setLearned(id, e.target.checked));
      // 開く操作の前に本文を作る(開いてから作ると、空の項目が一瞬見える)
      li.querySelector(`summary`).addEventListener(`click`, () => ensureBody(li));
      details.addEventListener(`toggle`, () => {
        if (details.open) ensureBody(li);
        saveState();
      });
      itemEls.set(id, li);
      return li;
    }

    if (!order.length) {
      const li = document.createElement(`li`);
      li.appendChild(UI.emptyState({ icon: `book-open`, title: `準備中です`, body: `このトピックの基礎知識は順次追加します。` }));
      basicsList.appendChild(li);
    } else if (sections) {
      sections.forEach((s, i) => {
        const li = document.createElement(`li`);
        li.className = `basics-section`;
        li.dataset.sec = String(i);
        li.innerHTML = `
          <details>
            <summary class="basics-section-head"><span class="chevron">${ic(`chevron-down`, 18)}</span><span class="basics-section-name">${esc(s.name)}</span>${sectionFreqChip(topic.id, s)}<span class="basics-section-count num" data-role="sec-count"></span></summary>
            <ul class="basics-checklist"></ul>
          </details>`;
        const ul = li.querySelector(`ul`);
        const sec = { li, details: li.querySelector(`details`), countEl: li.querySelector(`[data-role="sec-count"]`), ids: s.ids.filter((id) => AppIndex.termsById[id]) };
        sec.ids.forEach((id) => { ul.appendChild(buildItem(AppIndex.termsById[id])); secOf.set(id, sec); });
        paintSection(sec);
        sec.details.addEventListener(`toggle`, saveState);
        secEls.push(sec);
        basicsList.appendChild(li);
      });
    } else {
      order.forEach((id) => basicsList.appendChild(buildItem(AppIndex.termsById[id])));
    }

    if (order.length) {
      progressBox.hidden = false;
      updateBasicsHead();
      nextBtn.addEventListener(`click`, () => {
        const id = firstUnlearned();
        if (id) openItem(id, `start`);
      });
      const applyFilter = () => {
        basicsList.classList.toggle(`basics-only-unlearned`, filterUnlearned);
        filterSeg.querySelectorAll(`[data-filter]`).forEach((b) => b.setAttribute(`aria-pressed`, String((b.dataset.filter === `unlearned`) === filterUnlearned)));
      };
      filterSeg.querySelectorAll(`[data-filter]`).forEach((b) => b.addEventListener(`click`, () => {
        const v = b.dataset.filter === `unlearned`;
        if (v === filterUnlearned) return;
        filterUnlearned = v;
        wrap.querySelectorAll(`.keep-visible`).forEach((el) => el.classList.remove(`keep-visible`));
        applyFilter();
        saveState();
      }));
      applyFilter();
    }

    // 項目を開いて(小見出しも開く)画面内へ
    function openItem(id, block) {
      const li = itemEls.get(id);
      if (!li) return null;
      const sec = secOf.get(id);
      if (sec) sec.details.open = true;
      ensureBody(li);
      li.querySelector(`details`).open = true;
      li.classList.add(`highlighted`);
      setTimeout(() => li.classList.remove(`highlighted`), 2400);
      requestAnimationFrame(() => UI.scrollIntoView(li, block || (li.offsetHeight > window.innerHeight * 0.6 ? `start` : `center`)));
      return li;
    }

    // 開く小見出し・項目: 戻ってきたときは保存した状態、初めて開いたときは「未学習のある最初の小見出し」
    if (saved) {
      const openSecs = Array.isArray(saved.secs) ? saved.secs.map(String) : [];
      secEls.forEach((sec) => { sec.details.open = openSecs.includes(sec.li.dataset.sec); });
      (Array.isArray(saved.open) ? saved.open : []).forEach((id) => {
        const li = typeof id === `string` ? itemEls.get(id) : null;
        if (li) {
          ensureBody(li);
          li.querySelector(`details`).open = true;
        }
      });
      if (filterUnlearned) {
        (Array.isArray(saved.keep) ? saved.keep : []).forEach((id) => {
          const li = typeof id === `string` ? itemEls.get(id) : null;
          if (li) li.classList.add(`keep-visible`);
        });
        const keepSecs = Array.isArray(saved.keepSecs) ? saved.keepSecs.map(String) : [];
        secEls.forEach((sec) => { if (keepSecs.includes(sec.li.dataset.sec)) sec.li.classList.add(`keep-visible`); });
      }
    } else if (secEls.length) {
      const first = secEls.find((sec) => sec.ids.some((id) => !learned(id)));
      if (first) first.details.open = true;
    }

    // 問題・用語カードの欄はページの下のほうにあるので、初めて開いたときは画面に近づいてから作る
    // (近づいたとき=まだ画面の下の外なので、作っても見えている内容は動かない。
    //  戻る・再読み込みで帰ってきたときは、元の位置に戻せるよう最初から作る)
    function whenNear(el, build) {
      if (returning || !(`IntersectionObserver` in window)) { build(); return; }
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        if (!wrap.isConnected) return;
        build();
        saveState();
      }, { rootMargin: `1200px 0px` });
      io.observe(el);
      // 画面を離れたら監視をやめる
      const stop = () => { if (!wrap.isConnected) { io.disconnect(); window.removeEventListener(`hashchange`, stop); } };
      window.addEventListener(`hashchange`, stop);
    }

    // ---- このトピックの問題(確認問題のカードを再利用) ----
    const quizList = wrap.querySelector(`[data-role="quiz-list"]`);
    if (quizzes.length) {
      const onResult = (result, card, picked, restored) => {
        if (restored) return;
        answeredMap[card.dataset.quizId] = picked;
        saveState();
      };
      whenNear(quizList, () => {
        const quizHistory = obj(`quizHistory`);
        // 「もっと見る」で続きを足したら、それまでの最後の回答済みのカードにも「次の問題」を付ける
        const onMoreQuiz = () => {
          if (Views.quiz.ensureNextButtons) Views.quiz.ensureNextButtons(quizList);
          saveState();
        };
        quizPager = renderPaged(quizList, quizzes, (q) => Views.quiz.buildFixedCard(q, { history: quizHistory, restoreChoice: answeredMap[q.id], onResult }), 10, `問`, saved && saved.quiz, onMoreQuiz);
      });
    } else {
      quizList.appendChild(UI.emptyState({ icon: `pencil-check`, title: `確認問題は準備中です`, body: hasTerms ? `自動生成クイズで用語の理解を確認できます。` : `このトピックの問題は順次追加します。` }));
    }

    // ---- 用語フリップカード(基礎知識チェックリストにない用語) ----
    const termGrid = wrap.querySelector(`[data-role="term-grid"]`);
    if (extraTerms.length) {
      const onFlip = (t, on) => {
        if (on) flippedIds.add(t.id); else flippedIds.delete(t.id);
        saveState();
      };
      whenNear(termGrid, () => {
        const bmAll = obj(`bookmarks`);
        termsPager = renderPaged(termGrid, extraTerms, (term) => CardUi.buildFlipCard(term, { known, bookmarked: !!bmAll[`term:${term.id}`], topicId: topic.id, flipped: flippedIds.has(term.id), onFlip, onToggleKnown: () => updateRail() }), 12, `語`, saved && saved.terms, saveState);
      });
    } else if (!order.length) {
      termGrid.appendChild(UI.emptyState({ icon: `layers`, title: `用語は準備中です` }));
    } else {
      termGrid.hidden = true;
    }

    // #topics/<topicId>/<basicId> で開いた場合は該当の基礎知識を開いて強調(戻るで帰ってきたときは保存位置を優先)
    if (focusBasicId && !saved) openItem(focusBasicId);
  }

  return { render };
})();
