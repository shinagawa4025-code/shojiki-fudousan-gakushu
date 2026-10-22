// 出題頻度ランクの作り直し(v14): tools/freq/gen.js(入力の JSON → webapp/data/frequency.js)と、その確認 tools/lib/checks/freqgen.js。Node
// 入力に過去問の文章が入っていないこと(id・番号・日付と、このアプリが書いたテーマの名前・範囲だけ)の形も確かめる
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, run, ROOT, RAW } = require('../lib/harness.js');
const { loadApp } = require('../../lib/appload.js');
const gen = require('../../freq/gen.js');
const check = require('../../lib/checks/freqgen.js');

const DIR = path.join(ROOT, 'tools', 'freq');
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
let app = null;
const appCtx = () => (app || (app = loadApp(RAW).ctx));

test('入力の形: 過去問の分類は回の id・問題番号・テーマの id だけ(文章を持たない)・各回50問', (t) => {
  const exams = J('exams.json');
  const themes = J('themes.json');
  const past = J('past.json');
  const pairs = J('quizTheme.json');
  const examIds = new Set(exams.map((e) => e.id));
  const themeIds = new Set(themes.map((x) => x.id));
  t.ok(exams.length > 0 && exams.every((e) => Object.keys(e).sort().join() === 'date,id,label' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^(平成|令和)(\d+|元)年度(\((10|12)月\))?$/.test(e.label)), 'exams.json は { id, label, date } だけ');
  const odd = past.filter((r) => Object.keys(r).some((k) => !['exam', 'no', 'primary', 'secondary', 'low'].includes(k))
    || !examIds.has(r.exam) || !Number.isInteger(r.no) || !themeIds.has(r.primary)
    || !Array.isArray(r.secondary) || r.secondary.some((s) => !themeIds.has(s)) || (r.low != null && typeof r.low !== 'boolean'));
  t.eq(odd.slice(0, 3), [], 'past.json は { exam, no, primary, secondary, low? } だけ(値は id・番号・真偽)');
  exams.forEach((e) => t.eq(past.filter((r) => r.exam === e.id).length, 50, `${e.id}: 50問`));
  t.ok(pairs.every((p) => Object.keys(p).sort().join() === 'quizId,themeId' && /^quiz-/.test(p.quizId) && themeIds.has(p.themeId)), 'quizTheme.json は { quizId, themeId } だけ');
  t.ok(themes.every((x) => Object.keys(x).every((k) => ['id', 'name', 'cat', 'topicId', 'section', 'basicIds', 'scope'].includes(k))), 'themes.json は決まった項目だけ');
});

test('gen.js: 今の入力から作ると webapp/data/frequency.js と1字も違わない(改行の違いは除く)', (t) => {
  const r = gen.generate({ repo: ROOT, app: appCtx() });
  t.eq(r.errors, [], 'エラーなし');
  const cur = fs.readFileSync(path.join(RAW, 'data', 'frequency.js'), 'utf8').replace(/\r\n/g, '\n');
  t.ok(r.text === cur, '作った内容が frequency.js と同じ(違うときは node tools/freq/gen.js --write で作り直すか、入力を直す)');
  t.eq(check(appCtx(), { root: ROOT, webapp: RAW }).errors, [], 'tools/lib/checks/freqgen.js もエラーなし');
});

test('freqgen.js: frequency.js を手で直すとエラー(入力とずれたまま公開しない)・改行の違いは同じとみなす・入力が壊れていれば作らない', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'freqgen-'));
  t.defer(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'data'));
  const cur = fs.readFileSync(path.join(RAW, 'data', 'frequency.js'), 'utf8');
  fs.writeFileSync(path.join(tmp, 'data', 'frequency.js'), cur.replace(/hits: (\d+)/, (m, n) => `hits: ${Number(n) === 0 ? 1 : Number(n) - 1}`));
  const r = check(appCtx(), { root: ROOT, webapp: tmp });
  t.ok(r.errors.some((w) => /入力から作った内容と違います/.test(w)), '違えばエラー', r.errors);
  fs.writeFileSync(path.join(tmp, 'data', 'frequency.js'), cur.replace(/\n/g, '\r\n'));
  t.eq(check(appCtx(), { root: ROOT, webapp: tmp }).errors, [], '改行が CRLF でも同じとみなす');
  const bad = gen.generate({ dir: DIR, repo: ROOT, app: { APP_DATA: Object.assign({}, appCtx().APP_DATA, { quiz: [{ id: 'quiz-x', examCats: { takken: 'gyoho' } }] }) } });
  t.ok(bad.errors.some((e) => /quiz-x/.test(e)) && bad.text === null, 'テーマのない宅建の4択があればエラー(作らない)', bad.errors.slice(0, 3));
});

run();
