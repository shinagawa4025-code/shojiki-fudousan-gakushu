// localStorage ヘルパー(namespaced + versioned keys)
window.Storage = (function () {
  const PREFIX = `shojikiLearn.v1.`;

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  return { get, set };
})();
