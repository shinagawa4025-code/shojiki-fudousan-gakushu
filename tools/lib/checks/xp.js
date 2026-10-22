// レベルと経験値・今日のチャレンジ(v14。js/xp.js・js/views/challenge.js)の確認。tools/check.js の 9. から呼ばれる
//   module.exports = function (ctx, info) → { errors: [...], warnings: [...] }(ctx は check.js の 3. で読み込んだアプリの vm。ここでは使わない)
// エラー(公開を止める):
//   - index.html で js/xp.js が本体の束(data-bundle なし)にない・js/views/challenge.js が詳細の束(data-bundle="detail")にない
//   - js/xp.js を読み込むと Xp の関数(award・level・levelOf・startOf・renderHome・seedIfNeeded・_read・_write)がそろわない・
//     レベルの曲線が Lv.1 → 0 XP から始まり、レベルが上がるほど次のレベルまでの XP が増える形でない
// 警告(知らせるだけ): js/xp.js の縮めた大きさが 5KB を超える(本体の束は最初の表示を遅くするため。数え方・画面は LevelUi へ)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE_MAX = 5 * 1024;

module.exports = function (ctx, info) {
  const errors = [];
  const warnings = [];
  const html = fs.readFileSync(path.join(info.webapp, 'index.html'), 'utf8');
  const tag = (src) => (html.match(new RegExp(`<script\\b[^>]*\\bsrc="${src.replace(/[.]/g, '\\.')}"[^>]*>`)) || [])[0] || null;
  const xpTag = tag('js/xp.js');
  const chTag = tag('js/views/challenge.js');
  if (!xpTag) errors.push('index.html に js/xp.js がありません');
  else if (/data-bundle=/.test(xpTag)) errors.push('js/xp.js は本体の束(data-bundle なし)に置いてください(ホームのレベル表示に使うため)');
  if (!chTag) errors.push('index.html に js/views/challenge.js がありません');
  else if (!/data-bundle="detail"/.test(chTag)) errors.push('js/views/challenge.js は詳細の束(data-bundle="detail")に置いてください');

  const file = path.join(info.webapp, 'js', 'xp.js');
  if (!fs.existsSync(file)) return { errors, warnings };
  const code = fs.readFileSync(file, 'utf8');
  try {
    const { minifyJs } = require(path.join(info.root, 'tools', 'lib', 'minify.js'));
    let m = minifyJs(code);
    if (typeof m !== 'string') m = m && m.code;
    const bytes = Buffer.byteLength(String(m || ''));
    if (bytes > CORE_MAX) warnings.push(`js/xp.js の縮めた大きさが ${(bytes / 1024).toFixed(1)}KB で、目安の 5KB を超えています(本体の束。数え方や画面は js/views/challenge.js の LevelUi へ)`);
  } catch (e) {
    warnings.push(`js/xp.js の大きさを測れませんでした: ${e.message}`);
  }
  // 別の vm で読み込んで、関数と曲線を確かめる(check.js の ctx は書き換えない)
  try {
    const store = {};
    const sb = { console: { log() {}, warn() {}, error() {} } };
    sb.window = sb;
    sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0 };
    vm.createContext(sb);
    ['js/storage.js', 'js/dates.js', 'js/xp.js'].forEach((rel) => vm.runInContext(fs.readFileSync(path.join(info.webapp, rel), 'utf8'), sb, { filename: rel }));
    const X = sb.Xp;
    const need = ['award', 'total', 'level', 'levelOf', 'startOf', 'today', 'onChange', 'renderHome', 'seedIfNeeded', '_read', '_write'];
    const missing = need.filter((k) => !X || typeof X[k] !== 'function');
    if (missing.length) errors.push(`Xp に関数がありません: ${missing.join('・')}`);
    else {
      if (X.startOf(1) !== 0 || X.levelOf(0).level !== 1) errors.push('レベルの曲線は Lv.1 = 0 XP から始めてください');
      for (let L = 1; L < (X.MAX || 99) - 1; L++) {
        if (!(X.startOf(L + 2) - X.startOf(L + 1) >= X.startOf(L + 1) - X.startOf(L))) { errors.push(`レベルの曲線: Lv.${L + 1} から先の XP が前のレベルより少なくなっています`); break; }
      }
    }
  } catch (e) {
    errors.push(`js/xp.js を読み込めませんでした: ${e.message}`);
  }
  return { errors, warnings };
};
