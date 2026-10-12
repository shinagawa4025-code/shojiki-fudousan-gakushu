// 誤りの報告: Googleフォームを、報告する項目(種類・ID・名前・画面・版)を事前入力した状態で開くリンクを作る
// フォームのURLと入力欄のIDは js/siteConfig.js の SITE.report に書く。未設定のあいだはリンクを出さない(空文字を返す)
// o = { kind: 'quiz'|'ox'|'basic'|'term'|'calc'|'fig'|'exam'|'works'|'page', id, title, location }
window.Report = (function () {
  const C = (window.SITE && window.SITE.report) || {};
  const KIND = { quiz: `4択問題`, ox: `○×問題`, basic: `基礎知識`, term: `用語`, calc: `計算機`, fig: `図解`, exam: `模擬試験`, works: `作品で学ぶ`, page: `その他・全体` };

  const enabled = () => /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform/.test(C.formUrl || ``) && !!(C.entry && C.entry.itemId);

  // 空白をまとめ、長い文は n 文字(…を含む)に切る。絵文字・サロゲートペアの途中で切らないよう文字単位で数える
  const clip = (s, n) => {
    const a = Array.from(String(s || ``).replace(/\s+/g, ` `).trim());
    return a.length > n ? a.slice(0, n - 1).join(``) + `…` : a.join(``);
  };

  const esc = (s) => (window.UI && UI.escapeHtml ? UI.escapeHtml(s) : String(s == null ? `` : s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const icon = (name, size) => (window.UI && UI.icon ? UI.icon(name, { size }) : ``);

  function url(o) {
    if (!enabled()) return null;
    o = o || {};
    const p = new URLSearchParams();
    p.set(`usp`, `pp_url`);
    const e = C.entry;
    const put = (k, v) => { if (e[k] && v) p.set(e[k], v); };
    put(`kind`, KIND[o.kind] || KIND.page);
    put(`itemId`, o.id ? `${o.kind || `page`}:${o.id}` : `general`);
    put(`itemTitle`, clip(o.title, 80));
    put(`location`, clip(o.location || location.hash || `#home`, 120));
    put(`appVersion`, `${window.SITE.version}(内容 ${window.SITE.contentAsOf})`);
    return `${C.formUrl.split(`?`)[0]}?${p.toString()}`;
  }

  // 新しいタブでフォームを開くリンク。報告フォームが未設定なら空文字
  function linkHtml(o, label) {
    const u = url(o);
    if (!u) return ``;
    const l = label || `誤りを報告`;
    return `<a class="report-link" href="${esc(u)}" target="_blank" rel="noopener" aria-label="${esc(l)}(Googleフォームが開きます)">${icon(`flag`, 14)}<span>${esc(l)}</span>${icon(`external`, 12)}</a>`;
  }

  // 「2026年10月時点の法令に基づく」。d は 'YYYY-MM-DD'(省略時は SITE.contentAsOf)
  function asOfText(d) {
    const s = String(d || (window.SITE && window.SITE.contentAsOf) || ``);
    const m = s.match(/^(\d{4})-(\d{1,2})/);
    return m ? `${m[1]}年${Number(m[2])}月時点の法令に基づく` : ``;
  }

  // 項目の下に置く1行(基準日 + 報告リンク)。opts: { asOf, label }
  function metaHtml(o, opts) {
    opts = opts || {};
    const asOf = asOfText(opts.asOf);
    const link = linkHtml(o, opts.label);
    if (!asOf && !link) return ``;
    return `<p class="item-meta"><span>${esc(asOf)}</span>${link}</p>`;
  }

  // カード(タップでめくる・開く)の中に置いたリンクを押しても、カード側の操作が動かないようにする
  // (リンク本来の動作 = 新しいタブで開く、はそのまま)
  function isReportTarget(e) {
    return !!(e.target && e.target.closest && e.target.closest(`.report-link`));
  }
  window.addEventListener(`click`, (e) => { if (isReportTarget(e)) e.stopPropagation(); }, true);
  window.addEventListener(`keydown`, (e) => { if ((e.key === `Enter` || e.key === ` `) && isReportTarget(e)) e.stopPropagation(); }, true);

  return { enabled, url, linkHtml, metaHtml, asOfText, KIND };
})();
