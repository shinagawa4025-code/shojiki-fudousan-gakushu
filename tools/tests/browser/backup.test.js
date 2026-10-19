// バックアップ(ブラウザ): 書き出し → 別の端末で読み込み(すべてのキー・値が同じ)・前の版(v11.1)のファイル・
// 悪意のあるファイル(__proto__・HTML)・壊れた中身・大きすぎて保存できない(元に戻す)・バックアップでないファイル・
// iPhone の共有(取り消しで最後のバックアップ日時を戻す)
// 元: scratchpad audit7/T5 t2_backup.js・r6/w6 t_misc.js(バックアップ)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../lib/browser.js');
const S = require('../fixtures/seeds.js');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fudomana-backup-test-'));
process.on('exit', () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) { /* 無視 */ } });
const file = (name, text) => { const f = path.join(DIR, name); fs.writeFileSync(f, text); return f; };
// 書き出したファイルをつかまえる(ダウンロードはしない)
const CAPTURE = () => {
  window.__blobs = [];
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__blobs.push(b); return orig(b); };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloaded = this.download; return undefined; } return click.call(this); };
};
const ROUTES = ['home', 'quiz', 'ox', 'exam', 'progress', 'progress/predict', 'progress/time', 'progress/badges', 'plan', 'review', 'glossary', 'topics', 'bookmarks', 'settings', 'about', 'calculators', 'more'];

// 設定の画面でファイルを選ぶ → 確認の画面なら「読み込む」を押して再読み込みを待つ。戻り値 { confirm, status }
async function importFile(p, f) {
  if (!(await p.evaluate(() => window.Router && Router.current() === 'settings'))) await p.go('settings/backup');
  await p.waitForSelector('[data-role="import-file"]');
  await p.evaluate(() => { const s = document.querySelector('[data-role="import-status"]'); if (s) { s.hidden = true; s.textContent = ''; } });
  await p.setFiles('[data-role="import-file"]', [f]);
  const got = await p.waitFor(() => (document.querySelector('.modal-overlay [data-role="confirm"]') ? 'confirm' : null) || ((() => { const s = document.querySelector('[data-role="import-status"]'); return s && !s.hidden && s.textContent.trim() ? 'status' : null; })()));
  if (got === 'confirm') {
    const msg = await p.evaluate(() => document.querySelector('.modal-overlay .modal-message').textContent);
    const before = p.loads;
    await p.evaluate(() => document.querySelector('.modal-overlay [data-role="confirm"]').click());
    const st = await p.waitFor(() => { const s = document.querySelector('[data-role="import-status"]'); return s && !s.hidden && s.textContent.trim(); }, { timeout: 8000 });
    if (st && /完了/.test(st)) {
      for (let i = 0; i < 300 && p.loads === before; i++) await B.sleep(50);
      await p.waitApp();
    }
    return { confirm: msg, status: st };
  }
  return { confirm: null, status: got === 'status' ? await p.evaluate(() => document.querySelector('[data-role="import-status"]').textContent) : null };
}
// 全部の画面を開いて、エラーの画面・ページのエラーがないこと
async function visitAll(t, p, label, routes) {
  const bad = [];
  for (const r of routes || ROUTES) {
    const before = p.errors.length;
    await p.go(r);
    const st = await p.evaluate(() => ({ err: !!document.querySelector('#view-root .error-view, .error-screen'), view: !!document.querySelector('#view-root .view') }));
    if (st.err || !st.view || p.errors.length > before) bad.push(`#${r}${st.err ? ' エラーの画面' : ''}${!st.view ? ' 画面なし' : ''} ${p.errors.slice(before).join(' | ').slice(0, 200)}`);
  }
  t.eq(bad, [], `${label}: すべての画面が出る(エラーなし)`);
}
const without = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

B.test('書き出し(たくさん使った利用者・すべてのキー・値が同じ・ロックは入れない)→ 別の端末で読み込み(同じ記録・すべての画面)', async (t) => {
  const p = await t.open('home', { device: 'desktop', seedFn: S.heavy, goto: false, pre: CAPTURE });
  await p.evaluate(() => {
    const s = (k, v) => localStorage.setItem(`shojikiLearn.v1.${k}`, JSON.stringify(v));
    const today = DateUtil.today();
    const mcs = APP_DATA.quiz.filter((q) => QuizEngine.isMcItem(q));
    mcs.slice(0, 30).forEach((q, i) => AnswerLog.record(q.id, { ok: i % 3 !== 0, unsure: i % 5 === 1, src: 'quiz' }));
    AnswerLog.markUnsure(mcs[2].id, 'quiz');
    s('studyTime', { [today]: 1234, [DateUtil.addDays(today, -1)]: 600 });
    s('studyTimeLock', { tab: 'tzz', at: Date.now() });
    Goals.set({ kind: 'minutes', value: 45 });
    s('goalDays', { [DateUtil.addDays(today, -1)]: true });
    s('badges', { seeded: true, at: { first: '2026-10-01' } });
    s('drillStats', { graduated: 3 });
    Drill.noteWrong(mcs[5].id, 'quiz');
    s('answerPrefs', { aiButton: false }); s('predictPrefs', { exempt: true }); s('planPrefs', {});
    s('oxPrefs', { scope: {}, filter: 'all', count: 10, autoNext: true, confidence: true });
    s('quizPrefs', { level: 'all', topic: 'all', status: 'all', format: 'styled', autoCount: 10 });
    s('examTargets', [{ id: 'et_t', name: '宅建士試験', examTypeId: 'takken', date: '2027-10-17', primary: true, createdAt: 1, tentative: true }]);
    s('learnerProfile', { goal: 'takken', interests: [], at: 5 });
    s('reviewNewLimit', 15); s('ttsRate', 1.1); s('themePreference', 'dark'); s('lastTopic', 'topicL');
    s('calcInputs', { loan: { principalMan: '3000' } }); s('roadmap', { a: 1 }); s('reviewNewToday', { date: today, ids: ['basicA01'] });
    s('quizRetryToday', { date: today, ids: [] }); s('seenReviewTip', true); s('glossaryMode', 'list'); s('audience', 'takken');
    s('installNoteDismissedAt', 1700000000000); s('backupNoteDismissedAt', 1700000000001); s('lastBackupAt', 1700000000002);
  });
  await p.goto('index.html?r=1#settings/backup');
  await p.waitApp();
  const known = await p.evaluate(() => Array.from(Views.settings.KNOWN_KEYS));
  const A = await p.storage();
  t.eq(Object.keys(A).filter((k) => !known.includes(k) && k !== 'studyTimeLock'), [], '保存しているキーはすべて読み込みの対象(KNOWN_KEYS)');
  await p.click('[data-role="export"]');
  const text = await p.waitFor(async () => (window.__blobs.length ? window.__blobs[window.__blobs.length - 1].text() : null));
  t.ok(!!text, '書き出しのファイルができる');
  const ex = JSON.parse(text);
  t.ok(ex.__app && ex.__app.name === 'fudomana' && ex.__app.schema === 2 && ex.__app.version === t.env.info.version, `ファイルの印(name・schema 2・版 ${t.env.info.version})`, ex.__app);
  t.ok(/^fudomana-backup-\d{4}-\d{2}-\d{2}\.json$/.test(await p.evaluate(() => window.__downloaded || '')), 'ファイル名 fudomana-backup-日付.json');
  const A2 = await p.storage();
  t.eq(Object.keys(A2).filter((k) => k !== 'studyTimeLock' && !(k in ex)), [], 'ロック(studyTimeLock)以外のすべてのキーを書き出す');
  t.ok(!('studyTimeLock' in ex), 'ロックは書き出さない');
  t.eq(Object.keys(ex).filter((k) => k !== '__app' && k !== 'lastBackupAt' && JSON.stringify(ex[k]) !== JSON.stringify(A2[k])), [], '書き出した値は保存と同じ');
  const f = file('backup_v12.json', text);
  // 別の端末
  const q = await t.open('settings/backup', { device: 'desktop' });
  const r = await importFile(q, f);
  t.ok(r.confirm && /完了/.test(r.status || ''), '確認 → 読み込み完了', r);
  const Bk = await q.storage();
  const diff = Object.keys(Object.assign({}, without(A2, ['studyTimeLock']), Bk)).filter((k) => !['lastBackupAt', 'studyTimeLock', 'studyTime', 'badges', 'goalDays'].includes(k) && JSON.stringify(A2[k]) !== JSON.stringify(Bk[k]));
  t.eq(diff, [], '読み込んだ記録は元と同じ(学習時間・バッジ・達成した日は進むことがある)');
  t.eq(Bk.lastBackupAt, ex.lastBackupAt, '最後のバックアップ日時は書き出したときのもの');
  t.ok(await q.waitFor(() => Array.from(document.querySelectorAll('.toast')).some((x) => /読み込みました/.test(x.textContent))), '再読み込みのあとに「読み込みました」');
  t.ok(!(await q.exists('.onb-overlay')), '読み込んだあとは初回ガイドを出さない');
  await visitAll(t, q, '読み込んだあと');
});

B.test('前の版(v11.1)のファイル: すべてのキーをそのまま読み込み、新しいキーは既定・お知らせのカード', async (t) => {
  const p = await t.open('settings/backup', { device: 'desktop', seed: { dailyGoal: { kind: 'minutes', value: 25 }, answerPrefs: { aiButton: false }, answerDaily: { '2026-10-13': { gyoho: [3, 1, 2] } } } });
  const v11 = { __app: { name: 'fudomana', schema: 2, exportedAt: '2026-10-14T00:00:00.000Z', version: '11.1' }, quizHistory: { 'quiz-K-01': 'ng' }, activityLog: { '2026-10-10': 3 }, seenWhatsNew: 'v11', onboardingDone: { v: 2, at: 1 },
    examTargets: [{ id: 'et_t', name: '宅建士試験', examTypeId: 'takken', date: '2026-10-18', primary: true, createdAt: 1 }], oxPrefs: { scope: {}, filter: 'all', count: 10, autoNext: true }, quizPrefs: { level: 'all', topic: 'all', status: 'all', autoCount: 10 },
    oxStats: { 'quiz-K-01#0': { c: 1, w: 0, last: '2026-10-13', lastOk: true } }, srsCards: {}, srsMigrated: true, schemaVersion: 2, flashcards: { basicA01: true } };
  const r = await importFile(p, file('backup_v11.json', JSON.stringify(v11)));
  t.ok(/完了/.test(r.status || '') && !/このアプリのものではない|形式が合わない/.test(r.confirm || ''), '確認の文に問題なし → 完了', r);
  const C = await p.storage();
  const lost = Object.keys(v11).filter((k) => k !== '__app' && !(k in C));
  const changed = Object.keys(v11).filter((k) => k !== '__app' && k in C && JSON.stringify(C[k]) !== JSON.stringify(v11[k]));
  t.ok(!lost.length && !changed.length, 'すべてのキーをそのまま読み込む', { lost, changed });
  t.ok(C.dailyGoal == null && C.answerPrefs == null && C.answerDaily == null, '前の記録(新しいキー)は消して既定に戻る', C);
  t.eq(await p.evaluate(() => Goals.get()), { kind: 'actions', value: 10 }, '1日の目標は既定');
  await p.go('home');
  const news = await p.waitFor(() => { const c = document.querySelector('.home-news'); return c && c.textContent.replace(/\s+/g, ' '); });
  t.ok(news && /新しくなりました/.test(news) && /消費税法/.test(news) && /合格予測/.test(news) && /学習計画/.test(news) && !(await p.exists('.onb-overlay')), 'お知らせのカード(初回ガイドなし。v11 の記録なので v12 の合格予測・学習計画も案内)', news && news.slice(0, 400));
});

B.test('悪意のあるファイル(__proto__・HTML)・壊れた中身: 汚染なし・スクリプトが動かない・すべての画面が出る', async (t) => {
  const H = {
    __app: { name: 'fudomana', schema: 2, version: '12.0' },
    quizHistory: JSON.parse('{"__proto__":{"polluted1":"yes"},"constructor":{"polluted1b":"y"},"quiz-K-01":"ok"}'),
    oxStats: JSON.parse('{"__proto__#0":{"c":1,"w":1,"last":"2026-10-01","lastOk":false},"__proto__":{"c":1,"w":2,"last":"2026-10-01","lastOk":false,"polluted2":"y"},"constructor#1":{"c":1,"w":1,"last":"2026-10-01","lastOk":false},"quiz-K-01#0":{"c":0,"w":3,"last":"2026-10-01","lastOk":false}}'),
    answerDaily: JSON.parse('{"__proto__":{"kenri":[1,1,1]},"2026-10-14":{"__proto__":[1,2,3],"kenri":[1,1,1]}}'),
    studyTime: JSON.parse('{"__proto__":100,"2026-10-14":60}'),
    srsCards: JSON.parse('{"__proto__":{"ease":2.5,"interval":1,"reps":1,"dueDate":"2026-10-01","lastGrade":3}}'),
    bookmarks: JSON.parse('{"__proto__":1,"quiz:__proto__":1,"term:constructor":2,"quiz:quiz-K-01":3}'),
    activityLog: JSON.parse('{"__proto__":5,"2026-10-13":3}'),
    quizUnsure: JSON.parse('{"__proto__":"2026-10-01"}'),
    badges: JSON.parse('{"seeded":true,"at":{"__proto__":"2026-10-01"}}'),
    goalDays: JSON.parse('{"__proto__":true}'),
    quizRetry: JSON.parse('{"__proto__":{"step":0,"due":"2026-10-01","at":"2026-10-01","src":"quiz"},"quiz-K-01":{"step":0,"due":"2026-10-01","at":"2026-10-01","src":"<img src=x onerror=window.__xss=11>"}}'),
    calcInputs: JSON.parse('{"__proto__":{"a":"1"},"loan":{"principalMan":"<img src=x onerror=window.__xss=12>"}}'),
    basicsProgress: JSON.parse('{"__proto__":{"learned":true}}'),
    autoQuizStats: JSON.parse('{"__proto__":{"correct":1,"wrong":1}}'),
    flashcards: JSON.parse('{"__proto__":true}'),
    examTargets: [{ id: '"><img src=x onerror=window.__xss=1>', name: '<img src=x onerror=window.__xss=2>', examTypeId: '<b>x</b>', date: '2027-10-17', primary: true, createdAt: 1, tentative: true },
      { id: 'et2', name: '<svg onload=window.__xss=3>', examTypeId: 'takken', date: '2026-11-01', primary: false }],
    examHistory: [{ id: '<img src=x onerror=window.__xss=4>', mode: '<b>full</b>', score: '<i>1</i>', total: 50, startedAt: 1, finishedAt: 2, categories: JSON.parse('{"__proto__":{"score":1,"total":2}}'), wrong: [{ kind: 'fixed', refId: '<img src=x onerror=window.__xss=5>', stem: '<img src=x onerror=window.__xss=6>', choices: ['<b>a</b>', 'b', 'c', 'd'], correctIndex: 0, chosen: 1 }] }],
    lastTopic: '<img src=x onerror=window.__xss=7>',
    learnerProfile: { goal: 'takken', interests: ['<img src=x onerror=window.__xss=8>'], at: 1 },
    dailyGoal: { kind: '__proto__', value: '<b>' },
    onboardingDone: { v: 2, at: 1 },
    seenWhatsNew: '<img src=x onerror=window.__xss=9>',
    themePreference: '<img src=x onerror=window.__xss=10>',
    predictPrefs: JSON.parse('{"__proto__":{"exempt":true}}'),
    oxPrefs: JSON.parse('{"__proto__":{"confidence":true},"filter":"<img src=x onerror=window.__xss=13>"}'),
    quizPrefs: JSON.parse('{"__proto__":{"format":"styled"},"topic":"<img src=x onerror=window.__xss=14>"}'),
  };
  // 最上位の "__proto__" はオブジェクトの書き方では入らないので、文字列で足す
  const htext = JSON.stringify(H).replace('{"__app"', '{"__proto__":{"polluted0":"yes"},"__app"');
  const p = await t.open('settings/backup', { device: 'desktop', pre: () => { window.__protoBase = Object.getOwnPropertyNames(Object.prototype).length; } });
  const hr = await importFile(p, file('backup_hostile.json', htext));
  t.ok(/完了/.test(hr.status || ''), '読み込みは完了する(使える値だけ)', hr);
  await visitAll(t, p, '悪意のあるファイルのあと');
  const st = await p.evaluate(() => ({
    protoAdded: Object.getOwnPropertyNames(Object.prototype).length - window.__protoBase,
    polluted: ['polluted0', 'polluted1', 'polluted1b', 'polluted2', 'c', 'w', 'kenri', 'learned', 'exempt', 'confidence', 'format', 'a', 'ease', 'step', 'correct', 'score'].filter((k) => ({})[k] !== undefined),
    xss: window.__xss, img: document.querySelectorAll('img[src="x"], svg[onload]').length,
  }));
  t.ok(st.protoAdded === 0 && st.polluted.length === 0, 'Object.prototype は汚染されない', st);
  t.ok(st.xss === undefined && st.img === 0, 'スクリプトが動かない・HTML が入らない', st);
  // 型は合っているが中身が壊れている
  const G = {
    __app: { name: 'fudomana', schema: 2 }, onboardingDone: { v: 2, at: 1 },
    quizHistory: { 'quiz-K-01': 5, 'quiz-K-02': null, x: { a: 1 } },
    oxStats: { 'quiz-K-01#0': 'x', 'quiz-K-01#1': null, 'quiz-K-01#2': { c: 'a', w: -5, last: 3, lastOk: 'no' }, 'quiz-K4-001#s0': [1, 2] },
    examHistory: [1, 'x', null, {}, { score: 'a', total: 0 }, { wrong: 'x', categories: 5 }],
    examTargets: [null, 1, { date: 'not-a-date' }, { name: 5, date: '2027-13-40', examTypeId: 3 }],
    activityLog: { '2026-10-14': 'abc', bad: 3, '2026-10-13': -4 },
    answerDaily: { '2026-10-14': { kenri: 'x', horei: [null, 'a', 1e20], zei: { a: 1 } }, x: 1 },
    studyTime: { '2026-10-14': 'x', '2026-10-13': 1e12, '9999-01-01': 5 },
    quizUnsure: { 'quiz-K-01': 5, 'quiz-K-02': '2026-99-99' }, dailyGoal: { kind: 'minutes', value: 'abc' }, goalDays: { '2026-10-13': 'yes' },
    badges: { seeded: 'x', at: [1, 2] }, drillStats: { graduated: 'many' }, quizRetry: { 'quiz-K-01': 'x', 'quiz-K-02': { step: 99, due: 5 } },
    srsCards: { basicA01: 'x', basicA02: { ease: 'a', dueDate: 5 } }, bookmarks: { 'quiz:none': 'x', 'term:none': null },
    predictPrefs: { exempt: 'yes' }, planPrefs: { x: [1] }, answerPrefs: { aiButton: 'no' },
    oxPrefs: { scope: 5, filter: 3, count: 'x', confidence: 'x' }, quizPrefs: { format: 5, autoCount: 'x' },
    learnerProfile: { goal: 5, interests: 'x' }, reviewNewToday: { date: 5, ids: 'x' }, quizRetryToday: { date: 1, ids: 5 },
    examSession: { questions: 'x', answers: 5 }, examRetryResult: { score: 'x' },
  };
  const q = await t.open('settings/backup', { device: 'desktop' });
  const gr = await importFile(q, file('backup_garbage.json', JSON.stringify(G)));
  t.ok(/完了/.test(gr.status || ''), '壊れた中身のファイルも読み込みは完了する', gr);
  await visitAll(t, q, '壊れた中身のあと');
});

B.test('大きすぎて保存できない → 元のデータに戻す・バックアップでないファイルは読み込まない', async (t) => {
  const p = await t.open('home', { device: 'desktop', seedFn: S.light, goto: false });
  await p.goto('index.html?r=1#settings/backup');
  await p.waitApp();
  const before = await p.storage();
  const hu = await importFile(p, file('backup_huge.json', JSON.stringify({ __app: { name: 'fudomana', schema: 2 }, quizHistory: { 'quiz-K-01': 'ok' }, lastTopic: 'x'.repeat(6 * 1024 * 1024) })));
  const after = await p.storage();
  const ign = ['studyTime', 'studyTimeLock', 'badges', 'goalDays'];
  const d = Object.keys(Object.assign({}, before, after)).filter((k) => !ign.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  t.ok(/元のデータに戻しました/.test(hu.status || '') && d.length === 0, '保存できない → 「元のデータに戻しました」・記録は元のまま', { status: hu.status, d });
  t.ok(!(await p.exists('#storage-banner')), '容量不足の帯は残らない');
  const before2 = await p.get('quizHistory');
  for (const [name, text, want] of [
    ['ほかの JSON', '{"foo":1}', /バックアップファイルではない/],
    ['新しい版の形式', JSON.stringify({ __app: { schema: 3 }, quizHistory: {} }), /新しい版/],
    ['壊れた JSON', '{"quizHistory":', /インポートに失敗しました/],
    ['配列', '[1,2]', /インポートに失敗しました/],
    ['すべて型が違う', JSON.stringify({ quizHistory: [], examHistory: {} }), /壊れている/],
  ]) {
    const r = await importFile(p, file(`backup_bad_${name.length}.json`, text));
    t.ok(!r.confirm && want.test(r.status || ''), `${name}: 読み込まない(${want.source})`, r);
  }
  t.eq(await p.get('quizHistory'), before2, 'バックアップでないファイルでは記録は変わらない');
});

B.test('iPhone の共有: 取り消したら最後のバックアップ日時を戻す・共有できたらファイル', async (t) => {
  const p = await t.open('settings/backup', {
    seed: { lastBackupAt: 1700000000000, quizHistory: { 'quiz-K-01': 'ok' } },
    pre: () => {
      window.__shareMode = 'ok';
      navigator.canShare = () => true;
      navigator.share = (d) => { window.__shared = d; return window.__shareMode === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('cancel', 'AbortError')); };
    },
  });
  await p.evaluate(() => { window.__shareMode = 'abort'; });
  await p.click('[data-role="export"]');
  await p.waitFor(() => !!window.__shared);
  t.ok(await p.waitFor(() => localStorage.getItem('shojikiLearn.v1.lastBackupAt') === '1700000000000', { timeout: 3000 }), '取り消し → 最後のバックアップ日時は元のまま');
  await p.evaluate(() => { window.__shareMode = 'ok'; window.__shared = null; });
  await p.click('[data-role="export"]');
  const sh = await p.waitFor(async () => (window.__shared && window.__shared.files ? { name: window.__shared.files[0].name, text: await window.__shared.files[0].text() } : null));
  t.ok(sh && /^fudomana-backup-\d{4}-\d{2}-\d{2}\.json$/.test(sh.name) && JSON.parse(sh.text).quizHistory['quiz-K-01'] === 'ok', '共有 → JSON のファイル', sh && sh.name);
});

B.run();
