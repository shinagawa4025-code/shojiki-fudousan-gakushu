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
    // 画面の説明は見出しの ⓘ から(一覧の上に説明文を置かない)
    wrap.innerHTML = `
      <div class="learn-head">
        <h2>ブックマーク</h2>
        <button type="button" class="btn btn-icon learn-info-btn" data-role="info" aria-label="ブックマークについて" aria-haspopup="dialog">${ic(`info`, 20)}</button>
      </div>
      <div class="segmented seg-bold bm-filter" role="group" aria-label="表示する種類" data-role="filter"></div>
      <div data-role="body"></div>`;
    root.appendChild(wrap);
    wrap.querySelector(`[data-role="info"]`).addEventListener(`click`, () => {
      UI.sheet({ title: `ブックマークについて`, content: `<p class="learn-info-text">あとで見返したい用語や問題を保存しておく場所です。しおりマークをもう一度押すと一覧から外れます。</p>` });
    });
    const filterEl = wrap.querySelector(`[data-role="filter"]`);
    const body = wrap.querySelector(`[data-role="body"]`);

    // 回答した問題(問題ID → 選んだ番号 / 記述は 'ok'・'ng')と、めくった用語カード。
    // 回答・裏返しでカードの背が伸びるため、戻る・再読み込み・種類の切り替えのあとも同じ表示にする(履歴エントリごとに保存)
    const hs = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
    const saved = Storage.isPlainObject(hs.bState) ? hs.bState : null;
    // 種類の切り替えもこの履歴エントリの表示に合わせる(再読み込みで「すべて」に戻ると、保存した位置と内容がずれるため)
    if (saved && [`all`, `term`, `quiz`].includes(saved.filter)) filter = saved.filter;
    const answeredMap = {};
    if (saved && Storage.isPlainObject(saved.answered)) {
      Object.keys(saved.answered).forEach((id) => {
        const v = saved.answered[id];
        if ((Number.isInteger(v) && v >= 0 && v < 4) || v === `ok` || v === `ng`) answeredMap[id] = v;
      });
    }
    const flippedIds = new Set(saved && Array.isArray(saved.flipped) ? saved.flipped.filter((id) => typeof id === `string`) : []);
    // 表示している件数(「もっと見る」で増やした分。戻ったときは最初からその件数を描く)
    const savedShown = saved && Storage.isPlainObject(saved.shown) ? saved.shown : {};
    let initialShown = { term: Number(savedShown.term) || 0, quiz: Number(savedShown.quiz) || 0 };
    const pagers = {};
    const myHash = location.hash;
    let saveTimer = null;
    function saveState() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        // 別の画面へ移ったあとに書き込むと、移動先の履歴エントリに混ざるため
        if (location.hash !== myHash || !document.body.contains(wrap)) return;
        try {
          const st = window.history.state && typeof window.history.state === `object` ? window.history.state : {};
          const shown = { term: pagers.term ? pagers.term.shown() : 0, quiz: pagers.quiz ? pagers.quiz.shown() : 0 };
          window.history.replaceState(Object.assign({}, st, { bState: { answered: Object.assign({}, answeredMap), flipped: Array.from(flippedIds), shown, filter } }), ``);
        } catch (e) { /* 履歴の保存に失敗しても表示には影響しない */ }
      }, 120);
    }

    // 件数の多い一覧は一定数ずつ表示して「もっと見る」で末尾に追加する(作り直さないのでスクロール位置が飛ばない)
    function renderPaged(container, items, build, page, unit, initial) {
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
          btn.addEventListener(`click`, () => {
            more();
            // 足した問題の前の回答済みのカードにも「次の問題」を付ける
            if (window.Views.quiz && Views.quiz.ensureNextButtons) Views.quiz.ensureNextButtons(container);
            saveState();
          });
          container.insertAdjacentElement(`afterend`, btn);
        }
        btn.textContent = `もっと見る(残り${items.length - shown}${unit})`;
      }
      more(Math.max(page, Number(initial) || 0));
      return { shown: () => shown };
    }
    function onResult(result, card, picked, restored) {
      if (restored) return;
      answeredMap[card.dataset.quizId] = picked;
      saveState();
    }
    function onFlip(term, on) {
      if (on) flippedIds.add(term.id); else flippedIds.delete(term.id);
      saveState();
    }

    function paintFilter(data) {
      const opts = [
        { id: `all`, label: `すべて`, n: data.terms.length + data.quizzes.length },
        { id: `term`, label: `用語`, n: data.terms.length },
        { id: `quiz`, label: `問題`, n: data.quizzes.length },
      ];
      filterEl.hidden = !(data.terms.length + data.quizzes.length);
      filterEl.innerHTML = opts.map((o) => `<button type="button" class="segmented-item" data-filter="${o.id}" aria-pressed="${o.id === filter}">${o.label}<span class="bm-count num">${o.n}</span></button>`).join(``);
      filterEl.querySelectorAll(`[data-filter]`).forEach((b) => b.addEventListener(`click`, () => {
        if (filter === b.dataset.filter) return;
        filter = b.dataset.filter;
        paint();
        saveState();
      }));
    }

    // 「すべて」のときの種類ごとの見出し: 小さなステッカー+名前+件数(件数は札にせず太い数字)
    function section(kind, title, icon, count, content) {
      const sec = document.createElement(`section`);
      sec.className = `bm-section`;
      sec.dataset.kind = kind;
      sec.innerHTML = `<div class="section-head bm-section-head"><h3><span class="sticker sticker-sm" aria-hidden="true">${ic(icon, 18)}</span>${title}<span class="bm-sec-count num" data-role="sec-count">${count}</span></h3></div>`;
      sec.appendChild(content);
      return sec;
    }

    // 種類ごとの一覧を「もっと見る」付きで作る(戻ったとき以外は最初のページから)
    // 「すべて」で用語の下に並ぶ問題の欄は、初めて開いたときは画面に近づいてから作る
    // (近づいたとき=まだ画面の下の外なので、作っても見えている内容は動かない。戻ってきたときは位置を戻せるよう最初から作る)
    const returning = Number(hs.y) > 0;
    let nearObserver = null;
    function pagedSection(kind, title, icon, count, list, items, build, page, unit, lazy) {
      const holder = document.createElement(`div`);
      holder.appendChild(list);
      const target = filter === `all` ? section(kind, title, icon, count, holder) : holder;
      body.appendChild(target);
      const initial = initialShown[kind];
      const make = () => { pagers[kind] = renderPaged(list, items, build, page, unit, initial); };
      if (!lazy || returning || initial > 0 || !(`IntersectionObserver` in window)) { make(); return; }
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        if (!list.isConnected) return;
        make();
        saveState();
      }, { rootMargin: `1200px 0px` });
      io.observe(list);
      nearObserver = io;
    }

    function paint() {
      const data = collect();
      paintFilter(data);
      body.innerHTML = ``;
      pagers.term = null;
      pagers.quiz = null;
      if (nearObserver) { nearObserver.disconnect(); nearObserver = null; }
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
          // 用語カードは軽いので30枚ずつ、問題カードは1枚が大きいので10問ずつ
          pagedSection(`term`, `用語`, `layers`, data.terms.length, grid, data.terms,
            ({ item }) => CardUi.buildFlipCard(item, { known, bookmarked: true, flipped: flippedIds.has(item.id), onFlip }), 30, `語`);
        } else if (filter === `term`) {
          body.appendChild(UI.emptyState({ icon: `layers`, title: `保存した用語はありません`, body: `用語カードの右上にあるしおりマークで保存できます。`, cta: { label: `用語集を見る`, nav: `#glossary` } }));
        }
      }

      if (showQuiz) {
        if (data.quizzes.length) {
          const list = document.createElement(`div`);
          list.className = `quiz-list`;
          pagedSection(`quiz`, `問題`, `pencil-check`, data.quizzes.length, list, data.quizzes,
            ({ item }) => Views.quiz.buildFixedCard(item, { restoreChoice: answeredMap[item.id], onResult }), 10, `問`, filter === `all` && data.terms.length > 0);
        } else if (filter === `quiz`) {
          body.appendChild(UI.emptyState({ icon: `pencil-check`, title: `保存した問題はありません`, body: `確認問題のカードの右上にあるしおりマークで保存できます。`, cta: { label: `確認問題を見る`, nav: `#quiz` } }));
        }
      }
      // 保存した件数で描くのは戻ってきた最初の1回だけ(種類の切り替えなどで作り直すときは最初のページから)
      initialShown = { term: 0, quiz: 0 };
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
      const counts = { term: data.terms.length, quiz: data.quizzes.length };
      body.querySelectorAll(`.bm-section`).forEach((sec) => {
        const n = sec.querySelector(`[data-role="sec-count"]`);
        if (n && counts[sec.dataset.kind] != null) n.textContent = counts[sec.dataset.kind];
      });
      return data;
    }
    // 用語カードは表と裏の両方にしおりボタンがあるので、まとめて塗り替える
    function paintBookmarkBtn(el, on) {
      if (!el) return;
      if (CardUi.paintBookmarkButtons) { CardUi.paintBookmarkButtons(el, on); return; }
      el.querySelectorAll(`[data-role="bookmark"]`).forEach((btn) => {
        btn.classList.toggle(`is-bookmarked`, on);
        btn.setAttribute(`aria-pressed`, String(on));
        btn.setAttribute(`aria-label`, on ? `ブックマークを外す` : `ブックマークする`);
        btn.innerHTML = UI.icon(on ? `bookmark-fill` : `bookmark`, { size: 20 });
      });
    }
    // 一覧を作り直すときも、「もっと見る」で広げた件数は保つ(縮むと位置が飛ぶため)
    function repaintKeep() {
      initialShown = { term: pagers.term ? pagers.term.shown() : 0, quiz: pagers.quiz ? pagers.quiz.shown() : 0 };
      paint();
    }
    function onChange(e) {
      if (!document.body.contains(wrap)) { detach(); return; }
      const detail = (e && e.detail) || {};
      if (!detail.key) { repaintKeep(); return; }
      if (detail.on === false) {
        const el = cardFor(detail.key);
        if (el) {
          removed[detail.key] = { el, parent: el.parentNode, next: el.nextSibling };
          el.remove();
        }
        const data = refreshCounts();
        // 種類ごとの一覧が空になったら空表示に切り替える(失うものがないので作り直してよい)
        const kind = detail.key.slice(0, detail.key.indexOf(`:`));
        if (!(data.terms.length + data.quizzes.length) || (kind === `term` && !data.terms.length) || (kind === `quiz` && !data.quizzes.length)) repaintKeep();
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
          repaintKeep();
        }
      }
    }
    function onHash() {
      if (!document.body.contains(wrap)) detach();
    }
    function detach() {
      if (nearObserver) { nearObserver.disconnect(); nearObserver = null; }
      window.removeEventListener(`bookmarks:change`, onChange);
      window.removeEventListener(`hashchange`, onHash);
    }
    window.addEventListener(`bookmarks:change`, onChange);
    window.addEventListener(`hashchange`, onHash);

    paint();
    // 前に選んだ種類(用語・問題)で開いたときは、この履歴エントリにも残す(再読み込みで同じ表示に戻すため)
    if (filter !== `all` && !(saved && saved.filter === filter)) saveState();
  }

  return { render };
})();
