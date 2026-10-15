// テーマ管理: 設定値(system/light/dark)を解決して、<html data-theme> に常に light か dark を設定する
// CSSのダーク配色は :root[data-theme="dark"] の1か所だけで定義している
window.ThemeManager = (function () {
  // ブラウザのツールバー色はヘッダーの背景(--color-surface)に合わせる
  // index.html には media 付きの theme-color が2つある(JSの実行前でも端末の設定に合う色を出すため)
  const THEME_COLORS = { light: `#ffffff`, dark: `#15201a` };
  const mql = window.matchMedia ? window.matchMedia(`(prefers-color-scheme: dark)`) : null;
  const listeners = [];

  function getPreference() {
    const pref = Storage.get(`themePreference`, `system`);
    return pref === `light` || pref === `dark` ? pref : `system`;
  }

  function resolve(pref) {
    if (pref === `light` || pref === `dark`) return pref;
    return mql && mql.matches ? `dark` : `light`;
  }

  function getResolved() {
    return resolve(getPreference());
  }

  // theme-color: 「端末設定に従う」なら media ごとの色(ライト用は白・ダーク用は暗色)に戻し、
  // ライト/ダークを明示的に選んだときは、どちらの media でも選んだテーマの色にする
  function applyThemeColor(pref, theme) {
    document.querySelectorAll(`meta[name="theme-color"]`).forEach((meta) => {
      const media = meta.getAttribute(`media`) || ``;
      const forTheme = /dark/.test(media) ? `dark` : /light/.test(media) ? `light` : null;
      const color = pref === `system` && forTheme ? THEME_COLORS[forTheme] : THEME_COLORS[theme];
      if (meta.getAttribute(`content`) !== color) meta.setAttribute(`content`, color);
    });
  }

  function apply(pref) {
    const theme = resolve(pref);
    document.documentElement.setAttribute(`data-theme`, theme);
    applyThemeColor(pref === `light` || pref === `dark` ? pref : `system`, theme);
    listeners.slice().forEach((fn) => fn(theme));
  }

  function setPreference(pref) {
    Storage.set(`themePreference`, pref);
    apply(pref);
  }

  function toggle() {
    setPreference(getResolved() === `dark` ? `light` : `dark`);
  }

  // 戻り値の関数を呼ぶと登録を解除する
  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  // 「端末設定に従う」の間は、端末側の切替にも追従する
  if (mql) {
    const handler = () => { if (getPreference() === `system`) apply(`system`); };
    if (mql.addEventListener) mql.addEventListener(`change`, handler);
    else if (mql.addListener) mql.addListener(handler);
  }

  apply(getPreference());

  return { getPreference, getResolved, setPreference, toggle, apply, onChange };
})();
