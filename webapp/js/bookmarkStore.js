// ブックマーク: 用語(term:<id>)とクイズ問題(quiz:<id>)を保存する
// localStorage: bookmarks = { "term:basicA01": 保存時刻, "quiz:quiz-K-01": 保存時刻 }
window.Bookmarks = (function () {
  function getAll() {
    const v = Storage.get(`bookmarks`, {});
    return v && typeof v === `object` && !Array.isArray(v) ? v : {};
  }

  function has(key) {
    return !!getAll()[key];
  }

  // 切り替え後の状態(true=保存済み)を返す
  function toggle(key) {
    const all = getAll();
    let on;
    let prevAt = null;
    if (all[key]) { prevAt = all[key]; delete all[key]; on = false; }
    else { all[key] = Date.now(); on = true; }
    Storage.set(`bookmarks`, all);
    window.dispatchEvent(new CustomEvent(`bookmarks:change`, { detail: { key, on, prevAt } }));
    return on;
  }

  // 元に戻す: 外す前の保存時刻で戻す(一覧の並び順を保つ)
  function restore(key, at) {
    const all = getAll();
    all[key] = Number(at) || Date.now();
    Storage.set(`bookmarks`, all);
    window.dispatchEvent(new CustomEvent(`bookmarks:change`, { detail: { key, on: true, restored: true } }));
  }

  // 新しい順 [{key, kind, id, at}]
  function list() {
    const all = getAll();
    return Object.keys(all)
      .map((key) => {
        const i = key.indexOf(`:`);
        return { key, kind: key.slice(0, i), id: key.slice(i + 1), at: all[key] };
      })
      .sort((a, b) => b.at - a.at);
  }

  function count() {
    return Object.keys(getAll()).length;
  }

  return { has, toggle, restore, list, count };
})();
