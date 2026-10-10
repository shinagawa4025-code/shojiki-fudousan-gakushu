// アイコン: オリジナルのストローク型SVGアイコン(24×24、currentColor)
// すべての形はこのアプリ用に独自に描いたもの(外部アイコンライブラリのパスは使っていない)
window.Icons = (function () {
  const PATHS = {
    // ---- ナビゲーション ----
    home: `<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 9.8v9.7h4.5v-5h3v5H18V9.8"/>`,
    'book-open': `<path d="M12 6.6C9.8 5 7.2 4.6 3.5 5v13.4c3.7-.4 6.3 0 8.5 1.6 2.2-1.6 4.8-2 8.5-1.6V5c-3.7-.4-6.3 0-8.5 1.6z"/><path d="M12 6.6V20"/>`,
    layers: `<path d="M12 3.5 3.5 8 12 12.5 20.5 8z"/><path d="M3.5 12 12 16.5 20.5 12"/><path d="M3.5 16 12 20.5 20.5 16"/>`,
    repeat: `<path d="M4 11.5v-2A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16 3l3 3-3 3"/><path d="M20 12.5v2a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M8 21l-3-3 3-3"/>`,
    'pencil-check': `<path d="M15.6 4.4a2.1 2.1 0 0 1 3 3L8.5 17.5 4 19l1.5-4.5z"/><path d="M13.6 6.4l3 3"/><path d="M13.5 18l2 2 4.5-4.5"/>`,
    timer: `<circle cx="12" cy="13.5" r="7"/><path d="M9.5 3.5h5"/><path d="M12 3.5v3"/><path d="M12 13.5l3-2.5"/><path d="M18.4 6.6l1.3-1.3"/>`,
    grid: `<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>`,
    chart: `<path d="M4 4v16h16"/><path d="M8.5 16.5V12"/><path d="M12.5 16.5V7.5"/><path d="M16.5 16.5v-6"/>`,
    calculator: `<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3.5" rx=".6"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01M15.5 17h.01"/>`,
    'play-square': `<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M10 9v6l5-3z"/>`,
    library: `<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="9.5" y="6.5" width="4" height="13.5" rx="1"/><path d="M14.3 19.2l3.1.8 3.2-12-3.1-.9z"/><path d="M4 8h4"/>`,
    settings: `<path d="M10.46 5.58L10.73 3.49L13.27 3.49L13.54 5.58A6.6 6.6 0 0 1 15.45 6.37L17.12 5.09L18.91 6.88L17.63 8.55A6.6 6.6 0 0 1 18.42 10.46L20.51 10.73L20.51 13.27L18.42 13.54A6.6 6.6 0 0 1 17.63 15.45L18.91 17.12L17.12 18.91L15.45 17.63A6.6 6.6 0 0 1 13.54 18.42L13.27 20.51L10.73 20.51L10.46 18.42A6.6 6.6 0 0 1 8.55 17.63L6.88 18.91L5.09 17.12L6.37 15.45A6.6 6.6 0 0 1 5.58 13.54L3.49 13.27L3.49 10.73L5.58 10.46A6.6 6.6 0 0 1 6.37 8.55L5.09 6.88L6.88 5.09L8.55 6.37A6.6 6.6 0 0 1 10.46 5.58z"/><circle cx="12" cy="12" r="2.8"/>`,
    help: `<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.5"/><path d="M12 16.8h.01"/>`,
    menu: `<path d="M4 6.5h16"/><path d="M4 12h16"/><path d="M4 17.5h16"/>`,

    // ---- 操作・状態 ----
    bookmark: `<path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5v16L12 16.5l-5.5 4z"/>`,
    'bookmark-fill': `<path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5v16L12 16.5l-5.5 4z" fill="currentColor"/>`,
    search: `<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>`,
    sun: `<circle cx="12" cy="12" r="3.8"/><path d="M18.2 12h2.4M16.38 16.38l1.7 1.7M12 18.2v2.4M7.62 16.38l-1.7 1.7M5.8 12H3.4M7.62 7.62l-1.7-1.7M12 5.8V3.4M16.38 7.62l1.7-1.7"/>`,
    moon: `<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a7.5 7.5 0 0 0 10 10z"/>`,
    volume: `<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
    flame: `<path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.2 3.6-7.8.4 1.6 1.1 2.6 2.2 3.2C11.6 7.3 12.5 5 14.5 3c.2 3 1.6 4.6 2.8 6.2 1 1.3 1.7 2.8 1.7 4.7C19 17.9 16 21 12 21z"/><path d="M12 18.5c-1.4 0-2.5-1-2.5-2.4 0-1.4 1.2-2.3 2-3.6.9 1.3 3 2.2 3 3.8 0 1.2-1.1 2.2-2.5 2.2z"/>`,
    star: `<path d="M12 4l2.26 5.79 6.2.36-4.8 3.94 1.57 6.01L12 16.75 6.77 20.1l1.57-6.01-4.8-3.94 6.2-.36z"/>`,
    'star-fill': `<path d="M12 4l2.26 5.79 6.2.36-4.8 3.94 1.57 6.01L12 16.75 6.77 20.1l1.57-6.01-4.8-3.94 6.2-.36z" fill="currentColor"/>`,
    'chevron-left': `<path d="M14.5 6l-6 6 6 6"/>`,
    'chevron-right': `<path d="M9.5 6l6 6-6 6"/>`,
    'chevron-down': `<path d="M6 9.5l6 6 6-6"/>`,
    'arrow-right': `<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>`,
    'arrow-left': `<path d="M19.5 12h-15"/><path d="M10.5 6l-6 6 6 6"/>`,
    external: `<path d="M13.5 4.5h6v6"/><path d="M19.5 4.5l-8 8"/><path d="M17.5 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h4"/>`,
    x: `<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
    'check-circle': `<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.5 2.5 4.8-5"/>`,
    'x-circle': `<circle cx="12" cy="12" r="8.5"/><path d="M9.3 9.3l5.4 5.4"/><path d="M14.7 9.3l-5.4 5.4"/>`,
    calendar: `<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16"/><path d="M8.5 3.5v4M15.5 3.5v4"/><path d="M8.5 14h.01M12 14h.01M15.5 14h.01"/>`,
    target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>`,
    info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/>`,
    alert: `<path d="M12 4 21 19.5H3z"/><path d="M12 9.8v4.2"/><path d="M12 16.8h.01"/>`,
    diagram: `<rect x="9" y="3.5" width="6" height="5" rx="1"/><rect x="3.5" y="15.5" width="6" height="5" rx="1"/><rect x="14.5" y="15.5" width="6" height="5" rx="1"/><path d="M12 8.5V12"/><path d="M6.5 15.5V12h11v3.5"/>`,
    flag: `<path d="M5.5 21V4"/><path d="M5.5 4.5c2.5-1.3 4.5-1.3 7 0s4.5 1.3 7 0v9c-2.5 1.3-4.5 1.3-7 0s-4.5-1.3-7 0"/>`,
    clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
    trophy: `<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.5h-3V7a3.5 3.5 0 0 0 3.6 3.5"/><path d="M16.5 5.5h3V7a3.5 3.5 0 0 1-3.6 3.5"/><path d="M12 13.5V17"/><path d="M8.5 20.5h7V19a2 2 0 0 0-2-2h-3a2 2 0 0 0-2 2z"/>`,
    download: `<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>`,
    upload: `<path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>`,
    trash: `<path d="M4 6.5h16"/><path d="M9.5 6.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6 6.5l1 12.6a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-12.6"/><path d="M10 10.5v6M14 10.5v6"/>`,
    list: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>`,
    eye: `<path d="M3 12c2-3.9 5.2-6.5 9-6.5s7 2.6 9 6.5c-2 3.9-5.2 6.5-9 6.5S5 15.9 3 12z"/><circle cx="12" cy="12" r="3"/>`,
    sparkles: `<path d="M10 6.5c.7 4.4 2.1 5.8 6.5 6.5-4.4.7-5.8 2.1-6.5 6.5-.7-4.4-2.1-5.8-6.5-6.5 4.4-.7 5.8-2.1 6.5-6.5z"/><path d="M17.5 3.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"/><path d="M19 15.5v3M17.5 17h3"/>`,
    refresh: `<path d="M19.5 12a7.5 7.5 0 1 1-1.7-4.8"/><path d="M17.8 3.2v4h-4"/>`,
    play: `<path d="M8 5.5v13l10.5-6.5z"/>`,
    lightbulb: `<path d="M9.5 17.5h5M10.5 20.5h3"/><path d="M9.5 17.5v-1.8c0-1-.5-1.8-1.3-2.6a5.75 5.75 0 1 1 7.6 0c-.8.8-1.3 1.6-1.3 2.6v1.8"/>`,

    // ---- トピック ----
    // 賃貸
    key: `<circle cx="8" cy="15.5" r="4"/><path d="M10.8 12.7 19.5 4"/><path d="M16.5 7l2.5 2.5"/><path d="M14 9.5l2 2"/><path d="M7.5 16h.01"/>`,
    // 売買・契約
    handshake: `<path d="M2.5 10 5.5 7l2.5 2.5-3 3z"/><path d="M21.5 10l-3-3L16 9.5l3 3z"/><path d="M16 9.5l-2.6-1.8a2 2 0 0 0-2.3.1L8.4 10a1.3 1.3 0 0 0 1.5 2.1l2.4-1.4 5.4 4.6L19 12.5"/><path d="M5 12.5l5.3 5.3a1.4 1.4 0 0 0 2-2"/><path d="M10.7 13.6l3.9 3.9a1.4 1.4 0 0 0 2-2"/>`,
    // 住宅ローン
    yen: `<circle cx="12" cy="12" r="8.5"/><path d="M8.6 6.8 12 11.5l3.4-4.7"/><path d="M12 11.5v6"/><path d="M9 12.6h6M9 15.3h6"/>`,
    // マンション
    building: `<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M9 7.3h1.5M13.5 7.3H15M9 10.8h1.5M13.5 10.8H15M9 14.3h1.5M13.5 14.3H15"/><path d="M10.5 20.5v-2.8h3v2.8"/>`,
    // 土地の権利関係
    map: `<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5"/><path d="M15 6.5V20"/>`,
    // 業界構造
    briefcase: `<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3.5 12.5h17"/><path d="M12 11.5v2"/>`,
    // 詐欺・トラブル対応
    shield: `<path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z"/><path d="M9 12l2.1 2.1 4-4.2"/>`,
    // 不動産税務
    receipt: `<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>`,
    // 一人暮らしガイド
    sprout: `<path d="M12 20.5V11"/><path d="M12 13c0-3.6-2.4-6-6.5-6 0 3.6 2.4 6 6.5 6z"/><path d="M12 11c0-3.9 2.5-6.5 6.5-6.5 0 3.9-2.5 6.5-6.5 6.5z"/><path d="M7.5 20.5h9"/>`,
    // 法令上の制限
    ruler: `<g transform="rotate(-45 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="1.5"/><path d="M7 8.5v3M10.5 8.5v2M14 8.5v3M17.5 8.5v2"/></g>`,
    // 宅建業法
    scale: `<path d="M12 3.5v17"/><path d="M8 20.5h8"/><path d="M5.5 7h13"/><path d="M5.5 7 3 13.5M5.5 7 8 13.5M3 13.5h5a2.5 2.5 0 0 1-5 0z"/><path d="M18.5 7 16 13.5M18.5 7 21 13.5M16 13.5h5a2.5 2.5 0 0 1-5 0z"/>`
  };

  const warned = {};

  // 属性値に入れる文字列をエスケープ
  function escAttr(s) {
    return String(s)
      .replace(/&/g, `&amp;`)
      .replace(/"/g, `&quot;`)
      .replace(/</g, `&lt;`)
      .replace(/>/g, `&gt;`);
  }

  // SVG文字列を返す。未知の名前は空文字(警告は1回だけ)
  function get(name, opts) {
    const o = opts || {};
    const inner = PATHS[name];
    if (!inner) {
      if (!warned[name]) {
        warned[name] = true;
        console.warn(`Icons: 未定義のアイコン名 "${name}"`);
      }
      return ``;
    }
    const size = o.size || 20;
    const cls = o.className ? `icon ${escAttr(o.className)}` : `icon`;
    const a11y = o.label
      ? `role="img" aria-label="${escAttr(o.label)}"`
      : `aria-hidden="true"`;
    return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a11y} focusable="false">${inner}</svg>`;
  }

  function has(name) {
    return Object.prototype.hasOwnProperty.call(PATHS, name);
  }

  return { get, has, names: Object.keys(PATHS) };
})();
