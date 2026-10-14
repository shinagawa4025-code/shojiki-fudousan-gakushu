// 学習トピックビュー: 目的別(暮らし・取引/宅建士試験/税理士試験)のトピック一覧 + トピック詳細(基礎知識/問題/用語/法律)
// ルート: #topics / #topics/<topicId> / #topics/<topicId>/<基礎知識ID>
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

  function topicLevelBadgeClass(level) {
    if (level.includes(`超入門`)) return `超入門`;
    if (level.includes(`上`)) return `上級`;
    if (level.includes(`中`)) return `中級`;
    return `初級`;
  }

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
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
    const zeiIds = zei && Array.isArray(zei.categories) ? zei.categories.flatMap((c) => c.topicIds || []) : [];
    const used = new Set();
    const pick = (ids) => ids.filter((id) => byId[id] && !used.has(id)).map((id) => { used.add(id); return byId[id]; });
    let groups;
    if (track === `takken`) {
      // 宅建士の出題分野ごと(分野の中は試験設定 data/exams.js の topicIds の順)
      groups = cats.map((c) => ({ id: c.id, name: c.name, meta: c.questions ? `例年${c.questions}問` : ``, topics: pick(c.topicIds || []) }));
    } else if (track === `zeirishi`) {
      groups = [{ id: `zeirishi`, name: `不動産の税金と消費税`, meta: ``, topics: pick(zeiIds) }];
    } else {
      groups = LIFE_GROUPS.map((g) => ({ id: g.id, name: g.name, meta: ``, topics: pick(g.ids) }));
      // どの一覧にも入っていないトピック(新しく追加したものなど)は、暮らし・取引の最後にまとめる
      const elsewhere = new Set(cats.flatMap((c) => c.topicIds || []).concat(zeiIds));
      const rest = window.APP_DATA.topics.filter((t) => !used.has(t.id) && !elsewhere.has(t.id)).map((t) => t.id);
      groups.push({ id: `other`, name: `そのほかのテーマ`, meta: ``, topics: pick(rest) });
    }
    return groups.filter((g) => g.topics.length);
  }

  function topicCardHtml(topic, stat) {
    const basicsCount = topic.basicIds.filter((id) => AppIndex.termsById[id]).length;
    const quizCount = (AppIndex.topicQuizIndex[topic.id] || []).length;
    return `
      <a class="card card-interactive topic-card" href="#topics/${topic.id}">
        <div class="topic-card-head">
          <span class="topic-icon">${ic(topic.icon || `book-open`, 22)}</span>
          <div class="topic-card-main">
            <div class="topic-card-title">${esc(topic.name)}</div>
            <p class="topic-card-desc">${esc(topic.description)}</p>
          </div>
        </div>
        <div class="topic-progress-row"><span class="topic-progress-label">進捗<span class="sr-only">(記憶済み・学習済み)</span></span><div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill" style="width:${stat.pct}%"></div></div><span class="num">${stat.done}/${stat.total}</span></div>
        <div class="topic-card-tags">
          <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${esc(topic.level)}</span>
          ${basicsCount ? `<span class="source-tag">${ic(`check-circle`, 12)} 基礎知識${basicsCount}</span>` : ``}
          ${quizCount ? `<span class="source-tag">${ic(`pencil-check`, 12)} 問題${quizCount}</span>` : ``}
        </div>
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
    wrap.innerHTML = `
      <h2>学習トピック</h2>
      <p class="view-desc">テーマごとに、基礎知識 → 用語カード → 問題の順で学べます。</p>
      <div class="segmented topic-tracks" role="group" aria-label="表示するトピック">
        ${TRACKS.map((t) => `<button type="button" class="segmented-item" data-track="${t.id}" aria-pressed="${t.id === track}">${t.label}</button>`).join(``)}
      </div>
      <div data-role="groups"></div>
    `;
    root.appendChild(wrap);
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
    wrap.innerHTML = `
      <a class="btn back-btn" href="#topics">${ic(`chevron-left`, 18)}トピック一覧</a>
      <div class="topic-hero">
        <span class="topic-icon">${ic(topic.icon || `book-open`, 28)}</span>
        <div class="topic-hero-main">
          <h2>${esc(topic.name)}</h2>
          <span class="badge badge-${topicLevelBadgeClass(topic.level)}">${esc(topic.level)}</span>
        </div>
      </div>
      <p class="view-desc">${esc(topic.description)}</p>
      <div class="topic-practice">
        ${quizzes.length ? `<a class="btn" href="#quiz/${topic.id}">${ic(`pencil-check`, 18)}<span>${quizLabel}</span><span class="topic-practice-count">${quizzes.length}問</span></a>` : ``}
        ${oxCount ? `<a class="btn btn-secondary" href="#ox/topic/${topic.id}">${ic(`o-x`, 18)}<span><span class="sr-only">○×</span>一問一答</span><span class="topic-practice-count">${oxCount}問</span></a>` : ``}
        ${!quizzes.length ? `<a class="btn btn-secondary" href="#quiz/auto/${topic.id}">${ic(`sparkles`, 18)}自動生成クイズ</a>` : ``}
      </div>
      <div class="topic-detail-layout">
        <div class="topic-main">
          <section id="sec-basics" class="topic-sec">
            <div class="section-head"><h3>基礎知識</h3><span class="topic-group-meta" data-role="basics-count"></span></div>
            <div class="basics-progress" data-role="basics-progress" hidden>
              <div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill fill-success" data-role="basics-bar"></div></div>
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
            <div class="section-head"><h3>このトピックの問題</h3>${quizzes.length ? `<a class="link-btn" href="#quiz/${topic.id}">${quizLabel}(${quizzes.length}問)を解く${ic(`chevron-right`, 16)}</a>` : ``}</div>
            <div class="quiz-list" data-role="quiz-list"></div>
            <div class="card-actions"><a class="btn" href="#quiz/auto/${topic.id}">${ic(`sparkles`)}自動生成クイズに挑戦</a></div>
          </section>
          <section id="sec-terms" class="topic-sec">
            <div class="section-head"><h3>用語カード</h3><a class="link-btn" href="#glossary/topic/${topic.id}">用語集で見る${ic(`chevron-right`, 16)}</a></div>
            ${order.length ? `<a class="card card-interactive basics-card-hint" href="#glossary/topic/${topic.id}">${ic(`layers`, 18)}<span>基礎知識(${order.length}項目)もカードで暗記チェック</span>${ic(`chevron-right`, 16)}</a>` : ``}
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
          <div class="card topic-rail-card">
            <div class="stat-value" data-role="rail-pct">${stat.pct}<small>%</small></div>
            <div class="stat-label">このトピックの進捗(★記憶済み+✓学習済み)</div>
            <div class="stat-label num" data-role="rail-label">${stat.done}/${stat.total}項目</div>
            <div class="progress-bar topic-rail-bar"><div class="progress-bar-fill" data-role="rail-bar" style="width:${stat.pct}%"></div></div>
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
    const bar = wrap.querySelector(`[data-role="basics-bar"]`);
    const nextBtn = wrap.querySelector(`[data-role="next-unlearned"]`);
    const filterSeg = wrap.querySelector(`[data-role="basics-filter"]`);
    const itemEls = new Map();
    const secOf = new Map();
    const secEls = [];

    function learned(id) { return isLearned(basicsProgress, id); }

    function updateRail() {
      const st = Stats.byTopic().find((r) => r.topic.id === topic.id);
      if (!st) return;
      const pctEl = wrap.querySelector(`[data-role="rail-pct"]`);
      const labelEl = wrap.querySelector(`[data-role="rail-label"]`);
      const barEl = wrap.querySelector(`[data-role="rail-bar"]`);
      if (pctEl) pctEl.innerHTML = `${st.pct}<small>%</small>`;
      if (labelEl) labelEl.textContent = `${st.done}/${st.total}項目`;
      if (barEl) barEl.style.width = `${st.pct}%`;
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
      bar.style.width = `${Math.round((done / order.length) * 100)}%`;
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
        <label class="basics-check-wrap" title="学習済みにする"><input type="checkbox" class="basics-check" data-role="learned-checkbox" aria-label="「${esc(concept.name)}」を学習済みにする" ${done ? `checked` : ``}></label>
        <details>
          <summary>
            <span class="basics-name">${concept.name}</span>
            ${hasDiagram ? `<span class="source-tag">${ic(`diagram`, 12)} 図解</span>` : ``}
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
            <summary class="basics-section-head"><span class="chevron">${ic(`chevron-down`, 18)}</span><span class="basics-section-name">${esc(s.name)}</span><span class="basics-section-count num" data-role="sec-count"></span></summary>
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
      quizList.appendChild(UI.emptyState({ icon: `pencil-check`, title: `確認問題は準備中です`, body: `自動生成クイズで用語の理解を確認できます。` }));
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
