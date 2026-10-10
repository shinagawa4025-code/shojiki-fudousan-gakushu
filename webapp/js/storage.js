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

  // 保存に失敗したら(容量不足など)1度だけ知らせる。黙って学習記録が消えないように
  let warned = false;
  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (!warned && window.UI && UI.toast) {
        warned = true;
        setTimeout(() => UI.toast(`学習データを保存できませんでした。端末の空き容量を確認し、設定からバックアップを取ってください`, `error`, { duration: 8000 }), 0);
      }
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 無視 */ }
  }

  return { get, set, remove, isPlainObject };
})();
