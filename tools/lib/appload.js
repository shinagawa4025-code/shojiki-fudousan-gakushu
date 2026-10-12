// アプリのデータと、データを扱う部分(索引・問題エンジン・検索)を Node の vm に読み込む(ブラウザなしで確かめるため)
// index.html の <script src> の順に、data/* と ENGINE のファイルだけを読む。webapp は書き換えない
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = ['js/siteConfig.js', 'js/appData.js', 'js/storage.js', 'js/dates.js', 'js/dataIndex.js', 'js/stats.js', 'js/quizEngine.js', 'js/search.js'];

// index.html の <script src="…">(外部URLを除く)
function scriptList(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]).filter((s) => !/^[a-z]+:|^\/\//i.test(s));
}
function styleList(html) {
  return [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map((m) => (m[0].match(/\bhref="([^"]+)"/) || [])[1]).filter((s) => s && !/^[a-z]+:|^\/\//i.test(s));
}

function makeContext(opts) {
  const store = {};
  const logs = { log: [], warn: [], error: [] };
  const fmt = (a) => a.map((x) => (x && x.stack) || (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  const ctx = {
    console: { log: (...a) => logs.log.push(fmt(a)), info: (...a) => logs.log.push(fmt(a)), warn: (...a) => logs.warn.push(fmt(a)), error: (...a) => logs.error.push(fmt(a)), debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] || null, clear: () => { Object.keys(store).forEach((k) => delete store[k]); }, get length() { return Object.keys(store).length; } },
    location: { hostname: opts.hostname == null ? 'localhost' : opts.hostname, search: opts.search || '', hash: '', protocol: 'http:', href: 'http://localhost/' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, logs };
}

function run(ctx, rel, code, opts) {
  try {
    vm.runInContext(code, ctx, { filename: rel });
  } catch (e) {
    e.message = `${rel}: ${e.message}`;
    throw e;
  }
  if (rel === 'js/dates.js' && opts.today && ctx.DateUtil) ctx.DateUtil.today = () => opts.today;
}

// opts.transform(rel, code) → 読み込む前にコードを差し替える(ビルド結果との比較用)
// opts.hostname: 'localhost' のとき dataIndex.js の整合性チェックが動く(公開サイトでは動かない)
function loadApp(webappDir, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(webappDir, 'index.html'), 'utf8');
  const files = scriptList(html).filter((s) => s.startsWith('data/') || ENGINE.includes(s));
  const { ctx, logs } = makeContext(opts);
  for (const rel of files) {
    let code = fs.readFileSync(path.join(webappDir, rel), 'utf8').replace(/^﻿/, '');
    if (opts.transform) code = opts.transform(rel, code);
    run(ctx, rel, code, opts);
  }
  return { ctx, files, logs, html };
}

// 公開用ビルドの結果を読み込む(tools/build.js の確認用): 本体のデータの束 → 本体のコードのうち ENGINE のファイル(縮小後)
// opts.coreData: 本体のデータの束のコード / opts.engine: [{ rel, code }](index.html の順) / opts.hostname・today は loadApp と同じ
// 戻り値の mergeDetail(code) で詳細の束のデータの部分を実行する
function loadBuilt(opts) {
  const { ctx, logs } = makeContext(opts);
  run(ctx, 'assets/data.js', opts.coreData, opts);
  for (const f of opts.engine) run(ctx, f.rel, f.code, opts);
  return { ctx, logs, mergeDetail: (code) => run(ctx, 'assets/detail.js', code, opts) };
}

// 公開前の確認や比較に使う要約(件数と、データ全体のハッシュ)
function summarize(ctx) {
  const crypto = require('crypto');
  const D = ctx.APP_DATA || {};
  const stmts = ctx.QuizEngine ? ctx.QuizEngine.allStatements() : [];
  const h = (v) => crypto.createHash('sha256').update(JSON.stringify(v) || '').digest('hex').slice(0, 16);
  const I = ctx.AppIndex;
  return {
    quiz: (D.quiz || []).length,
    mc: (D.quiz || []).filter((q) => q.format === 'mc').length,
    statements: stmts.length,
    terms: (D.terms || []).length,
    basics: (D.basics || []).length,
    topics: (D.topics || []).length,
    issues: I ? I.issues.length : null,
    dataHash: h(D),
    statementsHash: h(stmts),
    // ○×の文の id・正誤・分野など(文の本文・解説を除く。公開版の本体だけの状態でも元と同じになる部分)
    skeletonHash: h(stmts.map((s) => [s.id, s.quizId, s.index, s.truth, s.termId, s.level, s.topicIds])),
    // 索引(用語・トピック・問題の対応、小見出し、名前→用語)
    indexHash: I ? h([I.episodeTermIndex, I.topicTermIndex, I.topicQuizIndex, I.termQuizIndex, I.topicLawIndex, I.topicSections, I.topicBasicOrder, I.termByName, Object.keys(I.termsById), Object.keys(I.episodesById), Object.keys(I.sourcesById)]) : null,
  };
}

module.exports = { loadApp, loadBuilt, summarize, scriptList, styleList, ENGINE };
