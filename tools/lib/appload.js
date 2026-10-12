// アプリのデータと、データを扱う部分(索引・問題エンジン・検索)を Node の vm に読み込む(ブラウザなしで確かめるため)
// index.html の <script src> の順に、data/* と ENGINE のファイルだけを読む。webapp は書き換えない
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = ['js/siteConfig.js', 'js/storage.js', 'js/dates.js', 'js/dataIndex.js', 'js/stats.js', 'js/quizEngine.js', 'js/search.js'];

// index.html の <script src="…">(外部URLを除く)
function scriptList(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]).filter((s) => !/^[a-z]+:|^\/\//i.test(s));
}
function styleList(html) {
  return [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map((m) => (m[0].match(/\bhref="([^"]+)"/) || [])[1]).filter((s) => s && !/^[a-z]+:|^\/\//i.test(s));
}

// opts.transform(rel, code) → 読み込む前にコードを差し替える(ビルド結果との比較用)
// opts.hostname: 'localhost' のとき dataIndex.js の整合性チェックが動く(公開サイトでは動かない)
function loadApp(webappDir, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(webappDir, 'index.html'), 'utf8');
  const files = scriptList(html).filter((s) => s.startsWith('data/') || ENGINE.includes(s));
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
  for (const rel of files) {
    const file = path.join(webappDir, rel);
    let code = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    if (opts.transform) code = opts.transform(rel, code);
    try {
      vm.runInContext(code, ctx, { filename: rel });
    } catch (e) {
      e.message = `${rel}: ${e.message}`;
      throw e;
    }
    if (rel === 'js/dates.js' && opts.today && ctx.DateUtil) ctx.DateUtil.today = () => opts.today;
  }
  return { ctx, files, logs, html };
}

// 公開前の確認や比較に使う要約(件数と、データ全体のハッシュ)
function summarize(ctx) {
  const crypto = require('crypto');
  const D = ctx.APP_DATA || {};
  const stmts = ctx.QuizEngine ? ctx.QuizEngine.allStatements() : [];
  const h = (v) => crypto.createHash('sha256').update(JSON.stringify(v) || '').digest('hex').slice(0, 16);
  return {
    quiz: (D.quiz || []).length,
    mc: (D.quiz || []).filter((q) => q.format === 'mc').length,
    statements: stmts.length,
    terms: (D.terms || []).length,
    basics: (D.basics || []).length,
    topics: (D.topics || []).length,
    issues: ctx.AppIndex ? ctx.AppIndex.issues.length : null,
    dataHash: h(D),
    statementsHash: h(stmts),
  };
}

module.exports = { loadApp, summarize, scriptList, styleList, ENGINE };
