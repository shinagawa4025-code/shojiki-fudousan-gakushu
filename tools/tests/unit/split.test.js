// 公開用ビルドのデータの分け方(tools/lib/split.js), Node
// v14: 新しい機能のデータと更新履歴(changelog)は丸ごと詳細の束へ(本体では null)。本体と詳細を戻すと元のデータと同じ
'use strict';
const fs = require('fs');
const path = require('path');
const { test, run, RAW } = require('../lib/harness.js');
const split = require('../../lib/split.js');
const { parseBlocks } = require('../../lib/html.js');

test('データ: 新しい機能のデータと更新履歴は丸ごと詳細へ(本体は null)・戻すと元と同じ', (t) => {
  const html = fs.readFileSync(path.join(RAW, 'index.html'), 'utf8');
  const block = parseBlocks(html).find((b) => b.kind === 'js' && b.name === 'data');
  t.ok(!!block, 'index.html に build:js data の範囲がある');
  const snap = split.snapshotData(RAW, block.files);
  const { core, detail } = split.splitData(snap.data);
  ['frequency', 'numbers', 'compareTables', 'joubun', 'changelog'].forEach((k) => {
    t.ok(core[k] === null && detail[split.WHOLE] && detail[split.WHOLE][k] != null, `${k}: 本体は null・詳細に丸ごと`);
  });
  t.ok(Array.isArray(detail[split.WHOLE].changelog) && detail[split.WHOLE].changelog.length === snap.data.changelog.length, '更新履歴は全部詳細に');
  t.eq(split.firstDifference(split.mergeForCheck(core, detail), snap.data, 'APP_DATA'), null, '本体と詳細を戻すと元のデータと同じ');
  // 本体のホームが使う集まり(問題・用語・トピックなど)は本体に残る
  t.ok(Array.isArray(core.quiz) && core.quiz.length === snap.data.quiz.length && Array.isArray(core.topics), '問題・トピックは本体に');
});

run();
