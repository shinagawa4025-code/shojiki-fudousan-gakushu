// 単体テスト用: アプリのデータと記録まわりのモジュールを Node の vm に読み込む(ブラウザなし)
//
// tools/lib/appload.js と同じ範囲(index.html の <script src> の順に data/* と ENGINE)を読み、そのあとに記録・予測・計画の
// モジュール(EXTRA)を読む。読み込む前から次の差し替えを入れておく:
//   - 時計: Date / Date.now は env.clock.t(ミリ秒)を返す。DateUtil.today() もこの時計の日付になる(端末の時刻に左右されない)。
//           既定は opts.today(既定 2026-10-14)の正午(TZ=Asia/Tokyo で動かす。tools/test.js が子プロセスに渡す)
//   - タイマー: setTimeout / setInterval は偽物(env.clock.advance(ms) で時計を進めると、その間のタイマーが順に動く)。opts.realTimers で本物
//   - localStorage: 容量の上限を変えられる偽物(makeStore。store.quotaChars を小さくすると書き込みが QuotaExceededError)。
//                   opts.store を渡すと複数の「タブ」で共有できる。opts.session は sessionStorage(undefined ならグローバルに置かない)
//   - window のイベント(addEventListener / dispatchEvent / CustomEvent。env.fired に種類の記録)・UI.toast(env.toasts)・document(env.doc)
// webapp のファイルは書き換えない(読むだけ)。読み込んだコードは vm.Script としてプロセスの中で使い回す(速さのため)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptList, ENGINE } = require('../../lib/appload.js');
const { RAW } = require('./harness.js');

const P = 'shojikiLearn.v1.';
// 記録・予測・計画のモジュール(index.html の順)。ENGINE のあとに読む
const EXTRA = ['js/srs.js', 'js/drill.js', 'js/streak.js', 'js/analysis.js', 'js/answerLog.js', 'js/studyTime.js', 'js/goals.js', 'js/badges.js', 'js/predict.js', 'js/plan.js'];
const DEFAULT_TODAY = '2026-10-14';

// 偽物の Date(vm の中で最初に実行する。__testClock.t を今の時刻にする)
const DATE_SHIM = `(function (g) {
  var RealDate = g.Date;
  var clock = g.__testClock;
  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    if (!new.target) return new RealDate(clock.t).toString();
    return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(clock.t);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return clock.t; };
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  g.Date = FakeDate;
})(this);`;

const scripts = new Map();
function script(webapp, rel) {
  const key = `${webapp}|${rel}`;
  if (!scripts.has(key)) scripts.set(key, new vm.Script(fs.readFileSync(path.join(webapp, rel), 'utf8').replace(/^﻿/, ''), { filename: rel }));
  return scripts.get(key);
}
let fileList = null;
function files(webapp) {
  if (!fileList || fileList.webapp !== webapp) {
    const html = fs.readFileSync(path.join(webapp, 'index.html'), 'utf8');
    const all = scriptList(html);
    const engine = all.filter((s) => s.startsWith('data/') || ENGINE.includes(s));
    const missing = EXTRA.filter((s) => !all.includes(s));
    if (missing.length) throw new Error(`index.html に読み込まれていないモジュール: ${missing.join(', ')}(tools/tests/lib/node.js の EXTRA を直す)`);
    fileList = { webapp, list: engine.concat(EXTRA) };
  }
  return fileList.list;
}

// YYYY-MM-DD の正午(この Node のタイムゾーン)
function noon(d) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 12, 0, 0).getTime();
}

function makeStore(backing) {
  const store = backing || {};
  const api = {
    _data: store,
    quotaChars: Infinity,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem(k, v) {
      v = String(v);
      let used = 0;
      Object.keys(store).forEach((x) => { if (x !== k) used += x.length + store[x].length; });
      if (used + k.length + v.length > api.quotaChars) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = v;
    },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
  };
  return api;
}

const ENVS = new WeakMap();

// opts: { today, now(ミリ秒), store, session, realTimers, hidden, hasFocus, extra: false(EXTRA を読まない), webapp }
function load(opts) {
  opts = opts || {};
  const webapp = path.resolve(opts.webapp || RAW);
  const clock = { t: opts.now != null ? opts.now : noon(opts.today || DEFAULT_TODAY), timers: [], seq: 1, frozen: false };
  const logs = { log: [], warn: [], error: [] };
  const fmt = (a) => a.map((x) => (x && x.stack) || (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  const listeners = {};
  const fired = [];
  const toasts = [];
  const store = opts.store || makeStore();
  const ctx = {
    console: { log: (...a) => logs.log.push(fmt(a)), info: (...a) => logs.log.push(fmt(a)), warn: (...a) => logs.warn.push(fmt(a)), error: (...a) => logs.error.push(fmt(a)), debug() {} },
    localStorage: store,
    location: { hostname: 'localhost', search: '', hash: '', protocol: 'http:', href: 'http://localhost/' },
    __testClock: clock,
  };
  if (opts.session !== undefined) ctx.sessionStorage = opts.session;
  ctx.window = ctx;
  // イベント
  ctx.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  ctx.Event = class Event { constructor(type) { this.type = type; } };
  ctx.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  ctx.removeEventListener = (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); };
  ctx.dispatchEvent = (e) => { fired.push(e.type); (listeners[e.type] || []).slice().forEach((fn) => fn(e)); return true; };
  ctx.UI = { icon: () => '', toast: (msg, type, o) => { toasts.push({ msg, type, o, at: clock.t }); return { dismiss() {} }; } };
  // タイマー
  const addTimer = (fn, ms, repeat) => { const id = clock.seq++; clock.timers.push({ id, fn, at: clock.t + Math.max(0, ms || 0), ms: Math.max(1, ms || 0), repeat }); return id; };
  const clearTimer = (id) => { clock.timers = clock.timers.filter((x) => x.id !== id); };
  if (opts.realTimers) {
    Object.assign(ctx, { setTimeout, clearTimeout, setInterval, clearInterval });
  } else {
    Object.assign(ctx, { setTimeout: (fn, ms) => addTimer(fn, ms, false), clearTimeout: clearTimer, setInterval: (fn, ms) => addTimer(fn, ms, true), clearInterval: clearTimer });
  }
  // 時計を ms 進める(その間に来るタイマーを順に実行。clock.frozen の間はタイマーを止める = 端末のスリープ)
  clock.advance = (ms) => {
    const end = clock.t + ms;
    for (;;) {
      const due = clock.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due || clock.frozen) break;
      clock.t = Math.max(clock.t, due.at);
      if (due.repeat) due.at += due.ms; else clearTimer(due.id);
      due.fn();
    }
    clock.t = end;
  };
  // document(StudyTime・Badges が使う部分だけ)
  const docListeners = {};
  const doc = {
    visibilityState: opts.hidden ? 'hidden' : 'visible',
    _focus: opts.hasFocus !== false,
    hasFocus() { return doc._focus; },
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
    removeEventListener() {},
    querySelector: (sel) => (doc._overlay && /onb-overlay/.test(sel) ? {} : null),
    body: { classList: { _set: new Set(), contains(c) { return this._set.has(c); }, add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); } }, appendChild() {}, style: { setProperty() {}, removeProperty() {} } },
    createElement: () => ({ setAttribute() {}, querySelector: () => ({ addEventListener() {} }), isConnected: false, remove() {}, offsetHeight: 0 }),
    _overlay: false,
    fire(t, e) { (docListeners[t] || []).slice().forEach((fn) => fn(e || { type: t })); },
  };
  ctx.document = doc;
  const fireWin = (t, e) => { (listeners[t] || []).slice().forEach((fn) => fn(e || { type: t })); };

  vm.createContext(ctx);
  vm.runInContext(DATE_SHIM, ctx, { filename: 'tests/date-shim.js' });
  const list = files(webapp).filter((rel) => opts.extra !== false || !EXTRA.includes(rel));
  for (const rel of list) {
    try {
      script(webapp, rel).runInContext(ctx);
    } catch (e) {
      e.message = `${rel}: ${e.message}`;
      throw e;
    }
  }
  const env = { ctx, logs, fired, toasts, listeners, clock, doc, fireWin, store };
  ENVS.set(ctx, env);
  return env;
}

// 今日の日付を変える(時計をその日の正午へ。DateUtil.today() と Date.now() がそろって動く)
function setToday(ctx, d) { ENVS.get(ctx).clock.t = noon(d); }
function setKey(ctx, k, v) { ctx.localStorage.setItem(P + k, JSON.stringify(v)); }
function getKey(ctx, k) { const r = ctx.localStorage.getItem(P + k); return r == null ? null : JSON.parse(r); }
function clearAll(ctx) { ctx.localStorage.clear(); }

// 決まった順の乱数(線形合同法)
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

module.exports = { load, setToday, setKey, getKey, clearAll, makeStore, rng, noon, P, EXTRA, DEFAULT_TODAY };
