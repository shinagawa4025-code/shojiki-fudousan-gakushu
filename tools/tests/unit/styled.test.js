// 個数・組合せの問題の自己テスト(tools/selftest_styled.js をそのまま呼ぶ。tools/check.js の最後の段階と同じもの)
// node tools/test.js --unit だけで一通り確かめられるように、ここにも入れておく(約1秒)
'use strict';
const { test, run, RAW } = require('../lib/harness.js');
const selftest = require('../../selftest_styled.js');

test('個数・組合せ(見本 tools/fixtures/q4_example.js を本物のコードに通す)', (t) => {
  const r = selftest.run(RAW);
  t.ok(r.passed > 100, `確認の数が少なすぎる(${r.passed}件)`);
  r.errors.forEach((m) => t.ok(false, m));
  t.checks += r.passed;
});

run();
