// 作品で学ぶ(任意のコーナー): 不動産を題材にした作品の公式チャンネルの動画を、このアプリのテーマ別に紹介する
// ルート: #works / #works/topic/<topicId>(テーマで絞り込み) / #works/<エピソードID>(その回へ移動)
// 旧ルート #summary・#summary/<エピソードID> も同じ画面を出す(Views.summary は Views.works の別名)
window.Views = window.Views || {};
window.Views.works = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 20 });
  const esc = (s) => UI.escapeHtml(s);
  const WORK_TITLE = `正直不動産`;
  const CHANNEL_NAME = `正直不動産【公式】`;
  const CHANNEL_URL = `https://www.youtube.com/@shojiki_comicanime/videos`;
  // 掲載している動画を公式チャンネルで確認した日
  const CHECKED_AT = `2026年10月4日`;

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  function render(root, param) {
    const episodes = (window.APP_DATA.episodes || []).filter((ep) => ep && ep.id);
    const specials = window.APP_DATA.specials || [];
    const epById = (window.AppIndex && AppIndex.episodesById) || {};
    // 動画を含むテーマだけを絞り込みに出す(新しいテーマに episodes が無くても動くように)
    const topics = (window.APP_DATA.topics || []).filter((t) => Array.isArray(t.episodes) && t.episodes.some((id) => epById[id]));
    const topicById = {};
    topics.forEach((t) => { topicById[t.id] = t; });
    // 1話が複数テーマに属する場合はすべて表示する
    const episodeTopicIndex = {};
    topics.forEach((t) => t.episodes.forEach((id) => { (episodeTopicIndex[id] = episodeTopicIndex[id] || []).push(t); }));

    // param: topic/<topicId> または <エピソードID>
    let topicFilter = null;
    let focusId = null;
    if (param) {
      const [head, sub] = param.split(`/`);
      if (head === `topic`) topicFilter = sub && topicById[sub] ? sub : null;
      else if (epById[head]) focusId = head;
    }

    const roadmap = obj(`roadmap`);
    const wrap = document.createElement(`div`);
    wrap.className = `view works-view`;
    wrap.dataset.docTitle = `作品で学ぶ`;
    wrap.innerHTML = `
      <h2>作品で学ぶ <span class="badge badge-soft works-badge">任意</span></h2>
      <p class="view-desc">不動産を題材にしたマンガ・ドラマ『${esc(WORK_TITLE)}』の公式YouTubeチャンネルで公開されている動画を、このアプリのテーマ別に紹介するコーナーです。体系的に学ぶなら<a href="#topics">「学ぶ」タブのトピック</a>から始めるのがおすすめです。</p>
      <aside class="card card-compact works-notice" aria-label="このコーナーについて">
        <p class="works-notice-title">${ic(`info`, 18)}<span>このコーナーについて</span></p>
        <ul class="works-notice-list">
          <li>このアプリは個人が運営する非公式の学習アプリで、作品の著作権者・出版社・制作会社・公式チャンネルとは関係ありません。作品名と各回のタイトルは、内容を紹介する目的で記載しています。</li>
          <li>各回の要点は、このアプリが独自にまとめたものです。動画は公式チャンネル(YouTube)で視聴してください。</li>
          <li>作品はフィクションです。作中の取引や手口の描き方は、実際の法律・実務と異なることがあります。正しい扱いは各トピックの解説で確認してください。</li>
        </ul>
        <p class="works-credit">原作: 大谷アキラ(漫画)・夏原武(原案)・水野光博(脚本)/小学館「ビッグコミック」連載。<br>掲載している動画: ${CHECKED_AT}時点で公開されていた通常回${episodes.length * 2}本(${episodes.length}テーマ)と特別編${specials.length}本。<a href="${CHANNEL_URL}" target="_blank" rel="noopener">${esc(CHANNEL_NAME)}${ic(`external`, 14)}</a></p>
      </aside>
      <input type="search" class="search-input" placeholder="テーマ・要点・用語を検索…" aria-label="動画を検索" enterkeyhint="search">
      <div class="chip-row chip-row-scroll works-filter" role="group" aria-label="テーマで絞り込む" data-role="filter"></div>
      <p class="works-count text-muted" data-role="count" aria-live="polite"></p>
      <div class="card-list" data-role="episode-list"></div>
      ${specials.length ? `
      <details class="specials-section">
        <summary>特別編・総集編(${specials.length}本)</summary>
        <div class="card-list" data-role="specials-list"></div>
      </details>` : ``}
    `;
    root.appendChild(wrap);

    const searchInput = wrap.querySelector(`.search-input`);
    const filterEl = wrap.querySelector(`[data-role="filter"]`);
    const countEl = wrap.querySelector(`[data-role="count"]`);
    const list = wrap.querySelector(`[data-role="episode-list"]`);
    const specialsList = wrap.querySelector(`[data-role="specials-list"]`);
    if (specialsList) specials.forEach((sp) => specialsList.appendChild(buildSpecialCard(sp)));

    // ---- テーマの絞り込み ----
    const countIn = (t) => t.episodes.filter((id) => epById[id]).length;
    filterEl.innerHTML = [`<button type="button" class="chip chip-small" data-topic="">すべて<span class="num">${episodes.length}</span></button>`]
      .concat(topics.map((t) => `<button type="button" class="chip chip-small" data-topic="${esc(t.id)}">${esc(t.name)}<span class="num">${countIn(t)}</span></button>`))
      .join(``);
    function paintChips() {
      filterEl.querySelectorAll(`[data-topic]`).forEach((b) => b.setAttribute(`aria-pressed`, String((b.dataset.topic || null) === topicFilter)));
    }
    filterEl.addEventListener(`click`, (e) => {
      const b = e.target.closest(`[data-topic]`);
      if (!b) return;
      const next = b.dataset.topic || null;
      if (next === topicFilter) return;
      topicFilter = next;
      paintChips();
      list.style.minHeight = ``;
      renderList();
      // 絞り込みはURLにも残す(再読み込み・共有で同じ表示になる)。画面の作り直しはしない
      try { history.replaceState(history.state, ``, topicFilter ? `#works/topic/${topicFilter}` : `#works`); } catch (err) { /* 回数制限などは無視 */ }
    });
    paintChips();
    // URLで選ばれているテーマのチップが横スクロールの外にあれば見える位置へ(画面の縦位置は動かさない)
    if (topicFilter) {
      const on = filterEl.querySelector(`[aria-pressed="true"]`);
      if (on && filterEl.scrollWidth > filterEl.clientWidth) filterEl.scrollLeft = Math.max(0, on.offsetLeft - filterEl.offsetLeft - 16);
    }

    // ---- 検索(全角半角・カタカナひらがなの違いを無視。用語集・サイト内検索と同じ正規化) ----
    const norm = (s) => ((window.GlobalSearch && GlobalSearch.norm) ? GlobalSearch.norm(s) : String(s || ``).toLowerCase());
    const haystacks = new Map();
    function matches(ep, q) {
      if (!q) return true;
      let h = haystacks.get(ep.id);
      if (h == null) {
        // norm は空白を取り除くので、項目どうしは区切り文字(\u0001)でつなぐ(項目をまたいで一致しないように)
        h = [ep.displayLabel, ep.theme, ep.summary, ...(ep.terms || []).map((t) => t.term), ep.termsNote || ``].map(norm).join(`\u0001`);
        haystacks.set(ep.id, h);
      }
      return h.includes(q);
    }

    function renderList() {
      const q = norm(searchInput.value.trim());
      const inTopic = topicFilter ? new Set(topicById[topicFilter].episodes) : null;
      const hits = episodes.filter((ep) => (!inTopic || inTopic.has(ep.id)) && matches(ep, q));
      list.innerHTML = ``;
      const fragment = document.createDocumentFragment();
      hits.forEach((ep) => fragment.appendChild(buildEpisodeCard(ep)));
      list.appendChild(fragment);
      const scope = topicFilter ? `「${topicById[topicFilter].name}」を扱った回` : `すべての回`;
      countEl.textContent = `${scope}: ${hits.length}件`;
      if (!hits.length) {
        list.appendChild(UI.emptyState({
          icon: `search`,
          title: `該当する回がありません`,
          body: `別の言葉で検索するか、絞り込みを「すべて」に戻してみてください。`,
          cta: { label: `検索をクリア`, onClick: () => { searchInput.value = ``; list.style.minHeight = ``; renderList(); searchInput.focus({ preventScroll: true }); } },
        }));
      }
    }

    // 入力中に一覧が短くなっても検索欄の位置が動かないよう、検索中は一覧に画面1枚分の高さを確保し、位置を補正する
    let searchTimer = null;
    searchInput.addEventListener(`input`, () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const before = searchInput.getBoundingClientRect().top;
        list.style.minHeight = searchInput.value.trim() ? `${window.innerHeight}px` : ``;
        renderList();
        const after = searchInput.getBoundingClientRect().top;
        if (Math.abs(after - before) > 1) window.scrollBy(0, after - before);
      }, 150);
    });
    renderList();

    // #works/<エピソードID> はその回へ移動して強調する(戻る/再読み込みで保存位置があるときは Router が元の位置へ戻す)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    if (focusId && !(Number(hs.y) > 0)) {
      const target = list.querySelector(`[data-episode-id="${window.CSS && CSS.escape ? CSS.escape(focusId) : focusId}"]`);
      if (target) requestAnimationFrame(() => {
        // 「視差効果を減らす」設定では瞬時に移動する(UI.scrollIntoView が判定する)
        UI.scrollIntoView(target, `center`);
        target.classList.add(`highlighted`);
        setTimeout(() => target.classList.remove(`highlighted`), 1500);
      });
    }

    function videoLink(ep, v) {
      if (!v || !v.url) return ``;
      const label = v.label || `動画`;
      return `<a href="${esc(v.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" aria-label="${esc(`${ep.displayLabel}「${ep.theme}」${label}をYouTubeで見る(新しいタブ)`)}">${ic(`play`, 16)}${esc(label)}</a>`;
    }

    function buildEpisodeCard(ep) {
      const card = document.createElement(`article`);
      card.className = `card episode-card`;
      card.dataset.episodeId = ep.id;
      const st = Storage.isPlainObject && Storage.isPlainObject(roadmap[ep.id]) ? roadmap[ep.id] : (roadmap[ep.id] || {});

      const termIds = (AppIndex.episodeTermIndex && AppIndex.episodeTermIndex[ep.id]) || [];
      const termChips = termIds.map((termId) => {
        const t = AppIndex.termsById[termId];
        return t ? `<a class="chip chip-small" href="#glossary/${esc(termId)}">${esc(t.name)}</a>` : ``;
      }).join(``);
      const topicChips = (episodeTopicIndex[ep.id] || [])
        .map((t) => `<a class="chip chip-small chip-topic" href="#topics/${esc(t.id)}">${esc(t.name)}</a>`)
        .join(``);
      const videos = ep.videos || {};
      const report = window.Report ? Report.linkHtml({ kind: `works`, id: ep.id, title: `${ep.displayLabel} ${ep.theme}`, location: `#works/${ep.id}` }) : ``;

      card.innerHTML = `
        <div class="card-header">
          <span class="episode-label">${esc(ep.displayLabel)}</span>
          <span class="episode-theme" role="heading" aria-level="3">${esc(ep.theme)}</span>
          ${topicChips ? `<span class="episode-topic-chips">${topicChips}</span>` : ``}
        </div>
        <p class="episode-summary">${esc(ep.summary)}</p>
        ${ep.termsNote ? `<p class="terms-note">${esc(ep.termsNote)}</p>` : ``}
        ${termChips ? `<div class="episode-chip-row" aria-label="この回に出てくる用語">${termChips}</div>` : ``}
        <div class="video-links">${videoLink(ep, videos.zenpen)}${videoLink(ep, videos.kouhen)}</div>
        <div class="chip-row works-ep-checks">
          <label class="check-label"><input type="checkbox" data-role="watched"${st.watched ? ` checked` : ``}> 視聴済み</label>
          <label class="check-label"><input type="checkbox" data-role="understood"${st.understood ? ` checked` : ``}> 理解済み</label>
        </div>
        ${report ? `<p class="item-meta">${report}</p>` : ``}
      `;

      // 視聴済み・理解済み(トピックの進捗と同じ roadmap に保存。別タブの変更を消さないよう、保存の直前に読み直す)
      [`watched`, `understood`].forEach((key) => {
        card.querySelector(`[data-role="${key}"]`).addEventListener(`change`, (e) => {
          Object.assign(roadmap, obj(`roadmap`));
          const cur = Storage.isPlainObject && Storage.isPlainObject(roadmap[ep.id]) ? roadmap[ep.id] : { watched: false, understood: false };
          roadmap[ep.id] = Object.assign({ watched: false, understood: false }, cur, { [key]: e.target.checked });
          Storage.set(`roadmap`, roadmap);
          if (window.Streak && Streak.recordToday) Streak.recordToday();
        });
      });
      return card;
    }

    function buildSpecialCard(sp) {
      const card = document.createElement(`article`);
      card.className = `card special-card`;
      card.innerHTML = `
        <div class="card-header"><span class="episode-theme" role="heading" aria-level="3">${esc(sp.title)}</span></div>
        <p class="episode-summary">${esc(sp.description)}</p>
        ${sp.duration ? `<p class="special-duration">${esc(sp.duration)}</p>` : ``}
        ${sp.url ? `<div class="video-links"><a href="${esc(sp.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" aria-label="${esc(`${sp.title}をYouTubeで見る(新しいタブ)`)}">${ic(`play`, 16)}視聴</a></div>` : ``}
      `;
      return card;
    }
  }

  return { render };
})();
// 旧ルート #summary(動画一覧)の別名
window.Views.summary = window.Views.works;
