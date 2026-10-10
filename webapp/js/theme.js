// テーマ管理: 設定値(system/light/dark)を解決して、<html data-theme> に常に light か dark を設定する
// CSSのダーク配色は :root[data-theme="dark"] の1か所だけで定義している
window.ThemeManager = (function () {
  const THEME_COLORS = { light: `#1e3a5f`, dark: `#141a22` };
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

  function apply(pref) {
    const theme = resolve(pref);
    document.documentElement.setAttribute(`data-theme`, theme);
    const meta = document.querySelector(`meta[name="theme-color"]`);
    if (meta) meta.setAttribute(`content`, THEME_COLORS[theme]);
    listeners.forEach((fn) => fn(theme));
  }

  function setPreference(pref) {
    Storage.set(`themePreference`, pref);
    apply(pref);
  }

  function toggle() {
    setPreference(getResolved() === `dark` ? `light` : `dark`);
  }

  function onChange(fn) {
    listeners.push(fn);
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
