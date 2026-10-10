// 日付ユーティリティ: 端末のローカル日付(日本ならJST)で YYYY-MM-DD を扱う
// toISOString() はUTC基準のため、JSTでは0〜9時に前日扱いになる・日付計算が1日ずれる問題を避ける
window.DateUtil = (function () {
  function pad(n) {
    return String(n).padStart(2, `0`);
  }

  function format(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // YYYY-MM-DD をローカル時刻の正午として解釈(夏時間等の境界でも日付がずれないように正午を使う)
  function parse(s) {
    if (typeof s !== `string` || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split(`-`).map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }

  function today() {
    return format(new Date());
  }

  function addDays(s, n) {
    const d = parse(s);
    if (!d) return s;
    d.setDate(d.getDate() + n);
    return format(d);
  }

  // b - a の日数(a, b は YYYY-MM-DD)
  function diffDays(a, b) {
    const da = parse(a);
    const db = parse(b);
    if (!da || !db) return NaN;
    return Math.round((db - da) / 86400000);
  }

  function isValid(s) {
    return parse(s) !== null;
  }

  // 表示用: 2026年10月10日(土)
  function toJapanese(s, withWeekday) {
    const d = parse(s);
    if (!d) return s;
    const wd = [`日`, `月`, `火`, `水`, `木`, `金`, `土`][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日${withWeekday ? `(${wd})` : ``}`;
  }

  return { today, addDays, diffDays, parse, format, isValid, toJapanese };
})();
