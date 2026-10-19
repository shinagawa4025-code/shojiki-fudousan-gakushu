// 模擬試験の個数・組合せの枠(Views.exam._internal.STYLED_QUOTAS)が、今の収録問題で満たせること(Node)
// v13: フル 業法6・権利関係1・法令上の制限2 / ショート 業法3・法令上の制限1。枠のない分野には入れない
// (tools/smoke.js も公開用ビルドで1回だけ確かめる。ここでは乱数を変えて何回も組み、直近に出した問題を後回しにしても枠どおりか確かめる)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, run, RAW } = require('../lib/harness.js');
const { load } = require('../lib/node.js');

function withExam() {
  const env = load({ today: '2026-10-14' });
  vm.runInContext(fs.readFileSync(path.join(RAW, 'js/views/exam.js'), 'utf8').replace(/^\uFEFF/, ''), env.ctx, { filename: 'js/views/exam.js' });
  return env.ctx;
}
const countStyled = (exam) => {
  const got = {};
  exam.questions.forEach((x) => { if (x && x.style) got[x.categoryId] = (got[x.categoryId] || 0) + 1; });
  return got;
};

test('模擬試験の個数・組合せの枠: 収録数が枠以上・何回組んでも枠どおり(直近2回に出した問題を後回しにしても)', (t) => {
  const ctx = withExam();
  const E = ctx.Views.exam._internal;
  const Q = E.STYLED_QUOTAS;
  t.eq(JSON.parse(JSON.stringify(Q)), { full: { gyoho: 6, kenri: 1, horei: 2 }, short: { gyoho: 3, horei: 1 } }, 'v13 の枠');
  // 収録数(宅建士の分野ごと・記述ア〜エが4つある個数・組合せの問題)は、フルの枠の3倍以上(直近2回を後回しにしても枠を埋められる)
  const pool = {};
  ctx.APP_DATA.quiz.forEach((q) => {
    if (!ctx.QuizEngine.isMcItem(q) || !ctx.QuizEngine.styleOf(q) || ctx.QuizEngine.statementsFrom(q).length !== 4) return;
    const c = ctx.Stats.categoryOf(q, 'takken');
    if (c) pool[c.id] = (pool[c.id] || 0) + 1;
  });
  const short3 = Object.keys(Q.full).filter((cat) => (pool[cat] || 0) < Q.full[cat] * 3);
  t.eq(short3, [], '収録数がフルの枠の3倍以上', pool);
  ['full', 'short'].forEach((mode) => {
    const bad = [];
    let recent = {};
    for (let i = 0; i < 12; i++) {
      const ex = E.buildExam(mode, recent);
      const got = countStyled(ex);
      const want = Q[mode];
      Object.keys(Object.assign({}, want, got)).forEach((cat) => { if ((got[cat] || 0) !== (want[cat] || 0)) bad.push(`${i}回目 ${cat} ${got[cat] || 0}問(枠 ${want[cat] || 0}問)`); });
      if (ex.questions.length !== E.modeDef(mode).total) bad.push(`${i}回目 問題数 ${ex.questions.length}`);
      // 次の回は、この回と前の回に出した問題を後回しにする(recentAsked と同じ形: 前回 2・前々回 1)
      const next = {};
      Object.keys(recent).forEach((id) => { if (recent[id] === 2) next[id] = 1; });
      ex.questions.forEach((x) => { if (x && x.refId) next[x.refId] = 2; });
      recent = next;
    }
    t.eq(bad.slice(0, 5), [], `${mode}: 12回続けて組んでも分野ごとの個数・組合せの数が枠どおり`);
  });
});

run();
