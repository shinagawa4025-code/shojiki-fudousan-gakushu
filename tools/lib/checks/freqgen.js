// 出題頻度ランクの作り直し(v14): webapp/data/frequency.js が tools/freq の入力から gen.js で作った内容と同じかを確かめる
//   module.exports = function (ctx, info) → { errors: [...], warnings: [...] }(tools/check.js の 9. から呼ばれる)
//   frequency.js は手で直さず、tools/freq の JSON を直して node tools/freq/gen.js --write で作り直す(毎年の見直しも同じ。tools/freq/README.txt)。
//   違えばエラー(入力と frequency.js がずれたままだと、次に作り直したときに直した所が黙って元に戻るため)。改行の違い(CRLF / LF)は同じとみなす
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function (ctx, info) {
  const errors = [];
  const warnings = [];
  const root = (info && info.root) || path.join(__dirname, '..', '..', '..');
  const webapp = (info && info.webapp) || path.join(root, 'webapp');
  const genFile = path.join(root, 'tools', 'freq', 'gen.js');
  const dataFile = path.join(webapp, 'data', 'frequency.js');
  if (!fs.existsSync(genFile) || !fs.existsSync(dataFile)) return { errors, warnings };
  let r;
  try {
    r = require(genFile).generate({ repo: root, app: ctx });
  } catch (e) {
    errors.push(`tools/freq/gen.js を実行できませんでした: ${e.message}`);
    return { errors, warnings };
  }
  if (r.errors.length) {
    errors.push(`tools/freq の入力から frequency.js を作れません(エラー ${r.errors.length}件。最初: ${r.errors[0]})。node tools/freq/gen.js で確かめてください`);
    return { errors, warnings };
  }
  const cur = fs.readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n');
  if (cur !== r.text) errors.push('webapp/data/frequency.js が tools/freq の入力から作った内容と違います。手で直したときは tools/freq の JSON を直し、node tools/freq/gen.js --write で作り直してください');
  return { errors, warnings };
};
