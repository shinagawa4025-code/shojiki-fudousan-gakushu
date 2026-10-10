// localStorage ヘルパー(namespaced + versioned keys)
window.Storage = (function () {
  const PREFIX = `shojikiLearn.v1.`;

  function isPlainObject(v) {
    return !!v && typeof v === `object` && !Array.isArray(v);
  }

  // fallback がオブジェクト/配列のときは、保存値の型が違えば fallback を返す
  // (古い・壊れたバックアップをインポートしても画面が落ちないように)
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
      if (isPlainObject(fallback) && !isPlainObject(value)) return fallback;
      return value;
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

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 無視 */ }
  }

  return { get, set, remove, isPlainObject };
})();
