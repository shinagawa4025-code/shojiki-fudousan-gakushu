// ブックマーク: 保存した用語カードと確認問題を一覧する
window.Views = window.Views || {};
window.Views.bookmarks = (function () {
  const ic = (name, size) => UI.icon(name, { size: size || 18 });

  // 絞り込み(画面を離れても保持)
  let filter = `all`;

  function obj(key) {
    const v = Storage.get(key, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  // 存在しなくなったIDは除外して { terms, quizzes } に分ける
  function collect() {
    const quizById = {};
    window.APP_DATA.quiz.forEach((q) => { quizById[q.id] = q; });
    const terms = [];
    const quizzes = [];
    Bookmarks.list().forEach((b) => {
      if (b.kind === `term` && AppIndex.termsById[b.id]) terms.push({ key: b.key, item: AppIndex.termsById[b.id] });
      else if (b.kind === `quiz` && quizById[b.id]) quizzes.push({ key: b.key, item: quizById[b.id] });
    });
    return { terms, quizzes };
  }

  function render(root) {
    const wrap = document.createElement(`div`);
    wrap.className = `view bookmarks-view`;
    wrap.innerHTML = `
      <h2>ブックマーク</h2>
      <p class="view-desc">あとで見返したい用語や問題を保存しておく場所です。しおりマークをもう一度押すと一覧から外れます。</p>
      <div class="segmented bm-filter" role="group" aria-label="表示する種類" data-role="filter"></div>
      <div data-role="body"></div>`;
    root.appendChild(wrap);
    const filterEl = wrap.querySelector(`[data-role="filter"]`);
    const body = wrap.querySelector(`[data-role="body"]`);

    function paintFilter(data) {
      const opts = [
        { id: `all`, label: `すべて`, n: data.terms.length + data.quizzes.length },
        { id: `term`, label: `用語`, n: data.terms.length },
        { id: `quiz`, label: `問題`, n: data.quizzes.length },
      ];
      filterEl.hidden = !(data.terms.length + data.quizzes.length);
      filterEl.innerHTML = opts.map((o) => `<button type="button" class="segmented-item" data-filter="${o.id}" aria-pressed="${o.id === filter}">${o.label}<span class="bm-count num">${o.n}</span></button>`).join(``);
      filterEl.querySelectorAll(`[data-filter]`).forEach((b) => b.addEventListener(`click`, () => {
        filter = b.dataset.filter;
        paint();
      }));
    }

    function section(title, icon, count, content) {
      const sec = document.createElement(`section`);
      sec.className = `bm-section`;
      sec.innerHTML = `<div class="section-head bm-section-head"><h3>${ic(icon, 20)}${title}<span class="badge badge-soft num">${count}</span></h3></div>`;
      sec.appendChild(content);
      return sec;
    }

    function paint() {
      const data = collect();
      paintFilter(data);
      body.innerHTML = ``;
      const total = data.terms.length + data.quizzes.length;
      if (!total) {
        body.appendChild(UI.emptyState({
          icon: `bookmark`,
          title: `ブックマークはまだありません`,
          body: `用語カードの右上、または確認問題のカードの右上にあるしおりマークを押すと、ここに保存されます。`,
          cta: { label: `用語集を見る`, nav: `#glossary` },
        }));
        const more = document.createElement(`p`);
        more.className = `bm-empty-sub`;
        more.innerHTML = `<a class="link-btn" href="#quiz">${ic(`pencil-check`, 16)}確認問題を見る</a>`;
        body.querySelector(`.empty-state`).appendChild(more);
        return;
      }

      const showTerms = filter !== `quiz`;
      const showQuiz = filter !== `term`;

      if (showTerms) {
        if (data.terms.length) {
          const known = obj(`flashcards`);
          const grid = document.createElement(`div`);
          grid.className = `card-grid`;
          data.terms.forEach(({ item }) => grid.appendChild(CardUi.buildFlipCard(item, { known })));
          body.appendChild(filter === `all` ? section(`用語`, `layers`, data.terms.length, grid) : grid);
        } else if (filter === `term`) {
          body.appendChild(UI.emptyState({ icon: `layers`, title: `保存した用語はありません`, body: `用語カードの右上にあるしおりマークで保存できます。`, cta: { label: `用語集を見る`, nav: `#glossary` } }));
        }
      }

      if (showQuiz) {
        if (data.quizzes.length) {
          const list = document.createElement(`div`);
          list.className = `quiz-list`;
          data.quizzes.forEach(({ item }) => list.appendChild(Views.quiz.buildFixedCard(item, {})));
          body.appendChild(filter === `all` ? section(`問題`, `pencil-check`, data.quizzes.length, list) : list);
        } else if (filter === `quiz`) {
          body.appendChild(UI.emptyState({ icon: `pencil-check`, title: `保存した問題はありません`, body: `確認問題のカードの右上にあるしおりマークで保存できます。`, cta: { label: `確認問題を見る`, nav: `#quiz` } }));
        }
      }
    }

    // しおりを外したカードだけを一覧から外す(他のカードの裏返し・回答状態を保つため、全体は作り直さない)
    const removed = {};
    function cardFor(key) {
      const i = key.indexOf(`:`);
      const kind = key.slice(0, i);
      const id = window.CSS && CSS.escape ? CSS.escape(key.slice(i + 1)) : key.slice(i + 1);
      return body.querySelector(kind === `term` ? `.flip-card[data-term-id="${id}"]` : `[data-quiz-id="${id}"]`);
    }
    function refreshCounts() {
      const data = collect();
      paintFilter(data);
      const counts = { 用語: data.terms.length, 問題: data.quizzes.length };
      body.querySelectorAll(`.bm-section`).forEach((sec) => {
        const h = sec.querySelector(`h3`);
        const badge = sec.querySelector(`.badge`);
        const label = h ? h.textContent.replace(/[0-9]+$/, ``).trim() : ``;
        if (badge && counts[label] != null) badge.textContent = counts[label];
      });
      return data;
    }
    function paintBookmarkBtn(el, on) {
      const btn = el && el.querySelector(`[data-role="bookmark"]`);
      if (!btn) return;
      btn.classList.toggle(`is-bookmarked`, on);
      btn.setAttribute(`aria-pressed`, String(on));
      btn.setAttribute(`aria-label`, on ? `ブックマークを外す` : `ブックマークする`);
      btn.innerHTML = UI.icon(on ? `bookmark-fill` : `bookmark`, { size: 20 });
    }
    function onChange(e) {
      if (!document.body.contains(wrap)) { detach(); return; }
      const detail = (e && e.detail) || {};
      if (!detail.key) { paint(); return; }
      if (detail.on === false) {
        const el = cardFor(detail.key);
        if (el) {
          removed[detail.key] = { el, parent: el.parentNode, next: el.nextSibling };
          el.remove();
        }
        const data = refreshCounts();
        // 種類ごとの一覧が空になったら空表示に切り替える(失うものがないので作り直してよい)
        const kind = detail.key.slice(0, detail.key.indexOf(`:`));
        if (!(data.terms.length + data.quizzes.length) || (kind === `term` && !data.terms.length) || (kind === `quiz` && !data.quizzes.length)) paint();
        UI.toast(`ブックマークを外しました`, `default`, {
          action: { label: `元に戻す`, onClick: () => { if (!Bookmarks.has(detail.key)) Bookmarks.restore(detail.key, detail.prevAt); } },
          duration: 4000,
        });
      } else if (detail.restored) {
        const r = removed[detail.key];
        delete removed[detail.key];
        if (r && r.parent && r.parent.isConnected) {
          r.parent.insertBefore(r.el, r.next && r.next.parentNode === r.parent ? r.next : null);
          paintBookmarkBtn(r.el, true);
          refreshCounts();
        } else {
          paint();
        }
      }
    }
    function onHash() {
      if (!document.body.contains(wrap)) detach();
    }
    function detach() {
      window.removeEventListener(`bookmarks:change`, onChange);
      window.removeEventListener(`hashchange`, onHash);
    }
    window.addEventListener(`bookmarks:change`, onChange);
    window.addEventListener(`hashchange`, onHash);

    paint();
  }

  return { render };
})();
