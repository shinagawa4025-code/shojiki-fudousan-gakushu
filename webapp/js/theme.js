// ダークモード手動切替
window.ThemeManager = (function () {
  function apply(pref) {
    if (pref === `light` || pref === `dark`) {
      document.documentElement.setAttribute(`data-theme`, pref);
    } else {
      document.documentElement.removeAttribute(`data-theme`);
    }
  }

  function getPreference() {
    return Storage.get(`themePreference`, `system`);
  }

  function setPreference(pref) {
    Storage.set(`themePreference`, pref);
    apply(pref);
  }

  apply(getPreference());

  return { getPreference, setPreference, apply };
})();
