// 公開用ビルドで、データを「本体」と「詳細」に分ける(webapp/js/appData.js と組で使う)
//
// index.html の <!-- build:js data --> の範囲(設定とデータのファイル)を Node の vm で順に実行し、できた APP_DATA を JSON にする。
//   本体: APP_DATA から DETAIL_FIELDS の値を仮の値に置き換えたもの(項目の位置はそのまま。件数・正誤・分野・索引は元と同じに数えられる)
//          文字列 → PENDING(「…」)、空でない別々の文字列の配列 → 「…」「……」「………」…(長さ・別々であること・空でないことを保つ)
//          それ以外の型・空の値は本体のまま(詳細に回さない)
//   詳細: { 集まりの名前: { f: [項目名…], r: [[id, 値…], …] } }。値 0 は「その項目は本体のまま」
// CODE_FILES(APP_DATA 以外のもの = SITE・ContentPack を作るファイル)はコードのまま本体に入れ、ほかのファイルは APP_DATA の
// 中身として入れる。ほかのファイルが APP_DATA 以外のグローバルを作る・書き換えるとき、データが JSON にできないとき、
// 同じオブジェクトを2か所から参照しているときは失敗にする(分けると元と同じに動かないため)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PENDING = '…';
const DETAIL_FIELDS = {
  quiz: ['explanation', 'answer', 'choiceNotes', 'choices'],
  terms: ['deepDive', 'lawRef'],
  basics: ['deepDive', 'lawRef'],
  episodes: ['displayLabel', 'theme', 'summary', 'termsNote'],
  specials: ['title', 'description', 'url', 'duration'],
  sources: ['orgName', 'description', 'url', 'category'],
};
const CODE_FILES = ['js/siteConfig.js', 'data/contentPack.js'];
const BASE_GLOBALS = ['console', 'location', 'window'];

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function newContext(hostname) {
  const logs = { log: [], warn: [], error: [] };
  const fmt = (a) => a.map((x) => (x && x.stack) || (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  const ctx = {
    console: { log: (...a) => logs.log.push(fmt(a)), info: (...a) => logs.log.push(fmt(a)), warn: (...a) => logs.warn.push(fmt(a)), error: (...a) => logs.error.push(fmt(a)), debug() {} },
    location: { hostname: hostname || 'localhost', search: '', hash: '', protocol: 'http:', href: 'http://localhost/' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, logs };
}

// データの範囲を実行して、APP_DATA・追加パックの一覧・SITE を得る
function snapshotData(src, files) {
  const { ctx, logs } = newContext('localhost');
  const owners = {}; // グローバル名 → 作ったファイル
  for (const rel of files) {
    const code = fs.readFileSync(path.join(src, rel), 'utf8').replace(/^﻿/, '');
    const before = new Map(Object.keys(ctx).map((k) => [k, ctx[k]]));
    vm.runInContext(code, ctx, { filename: rel });
    const changed = Object.keys(ctx).filter((k) => !BASE_GLOBALS.includes(k) && (!before.has(k) || before.get(k) !== ctx[k]));
    const isCode = CODE_FILES.includes(rel);
    changed.forEach((k) => {
      if (k === 'APP_DATA') { owners[k] = owners[k] || rel; return; }
      if (!isCode) throw new Error(`${rel} が APP_DATA 以外のグローバル ${k} を作っています(本体と詳細に分けられない。tools/lib/split.js の CODE_FILES に入れるか、APP_DATA の中に入れる)`);
      owners[k] = rel;
    });
  }
  if (logs.warn.length || logs.error.length) throw new Error(`データの読み込みで警告・エラーが出ました: ${[...logs.warn, ...logs.error].slice(0, 3).join(' / ')}`);
  const D = ctx.APP_DATA;
  if (!D || typeof D !== 'object') throw new Error('APP_DATA がありません');
  assertJsonSafe(D, 'APP_DATA');
  const packs = ctx.ContentPack && typeof ctx.ContentPack.list === 'function' ? JSON.parse(JSON.stringify(ctx.ContentPack.list())) : null;
  const extraGlobals = Object.keys(owners).filter((k) => k !== 'APP_DATA');
  // CODE_FILES はデータより先に(単独で)実行しても同じものを作ること(本体ではデータより前に置くため)
  const alone = newContext('localhost');
  files.filter((f) => CODE_FILES.includes(f)).forEach((rel) => vm.runInContext(fs.readFileSync(path.join(src, rel), 'utf8').replace(/^﻿/, ''), alone.ctx, { filename: rel }));
  extraGlobals.forEach((k) => {
    if (!(k in alone.ctx)) throw new Error(`${owners[k]} の ${k} が、データより先に実行すると作られません`);
    if (k === 'SITE' && JSON.stringify(alone.ctx.SITE) !== JSON.stringify(ctx.SITE)) throw new Error('SITE がデータの有無で変わります');
  });
  return { data: JSON.parse(JSON.stringify(D)), packs, codeFiles: files.filter((f) => CODE_FILES.includes(f)), dataFiles: files.filter((f) => !CODE_FILES.includes(f)) };
}

// 同じオブジェクトを複数の項目から参照してよいもの(中身が文字列・null だけで、アプリが書き換えないもの)。
// data/content の examCats は定数を使い回している(js/ は読むだけ)
const SHARED_OK = new Set(['examCats']);

// JSON にしても同じになるか(関数・undefined・NaN・-0・疎な配列・getter・プロトタイプが普通でないもの・同じオブジェクトの共有はだめ)
function assertJsonSafe(root, label) {
  const seen = new Set();
  const walk = (v, p, key) => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0)) throw new Error(`${p} が JSON にできない数(${v})`);
      return;
    }
    if (typeof v !== 'object') throw new Error(`${p} が JSON にできない値(${typeof v})`);
    if (seen.has(v)) {
      const leaf = !Array.isArray(v) && Object.keys(v).every((k) => v[k] === null || typeof v[k] === 'string');
      if (SHARED_OK.has(key) && leaf) return;
      throw new Error(`${p} は別の場所と同じオブジェクトを参照しています(分けると別々になる)`);
    }
    seen.add(v);
    const proto = Object.getPrototypeOf(v);
    if (Array.isArray(v)) {
      const keys = Object.getOwnPropertyNames(v).filter((k) => k !== 'length');
      if (keys.length !== v.length || keys.some((k, i) => k !== String(i))) throw new Error(`${p} が疎な配列か、余分な項目を持っています`);
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
      return;
    }
    if (proto !== null && Object.getPrototypeOf(proto) !== null) throw new Error(`${p} が普通のオブジェクトではありません`);
    if (Object.getOwnPropertySymbols(v).length) throw new Error(`${p} に Symbol の項目があります`);
    for (const k of Object.getOwnPropertyNames(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (!d.enumerable || !('value' in d)) throw new Error(`${p}.${k} が getter か列挙されない項目です`);
      if (d.value === undefined) throw new Error(`${p}.${k} が undefined です(JSON にすると項目が消える)`);
      walk(d.value, `${p}.${k}`, k);
    }
  };
  walk(root, label, null);
}

function standIn(v) {
  if (typeof v === 'string') return v ? PENDING : undefined;
  if (Array.isArray(v) && v.length && v.every((s) => typeof s === 'string' && s) && new Set(v).size === v.length) return v.map((_, i) => PENDING.repeat(i + 1));
  return undefined;
}

// 本体と詳細に分ける
function splitData(data) {
  const core = JSON.parse(JSON.stringify(data));
  const detail = {};
  const retired = new Set(Array.isArray(core.retiredQuizIds) ? core.retiredQuizIds.filter((id) => typeof id === 'string') : []);
  const moved = {};
  Object.keys(DETAIL_FIELDS).forEach((key) => {
    const list = core[key];
    if (list == null) return;
    if (!Array.isArray(list)) throw new Error(`APP_DATA.${key} が配列ではありません`);
    const fields = DETAIL_FIELDS[key];
    const ids = new Set();
    const rows = [];
    list.forEach((o, i) => {
      if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id) throw new Error(`APP_DATA.${key}[${i}] に id がありません`);
      if (ids.has(o.id)) throw new Error(`APP_DATA.${key} の id が重複しています: ${o.id}`);
      ids.add(o.id);
      // 廃止した問題は起動時に取り除かれるので、詳細を持たせない(仮の値のまま取り除かれる)
      const skip = key === 'quiz' && retired.has(o.id);
      const row = [o.id];
      let any = false;
      fields.forEach((f) => {
        const s = hasOwn(o, f) ? standIn(o[f]) : undefined;
        if (s === undefined || skip) { row.push(0); return; }
        row.push(o[f]);
        o[f] = s;
        any = true;
        moved[`${key}.${f}`] = (moved[`${key}.${f}`] || 0) + 1;
      });
      if (any) rows.push(row);
    });
    if (rows.length) detail[key] = { f: fields, r: rows };
  });
  return { core, detail, moved };
}

// 詳細を本体に戻したもの(webapp/js/appData.js の _merge と同じ置き換え。ビルド時の確認用)
function mergeForCheck(core, detail) {
  const out = JSON.parse(JSON.stringify(core));
  Object.keys(detail).forEach((key) => {
    const byId = new Map(out[key].map((o) => [o.id, o]));
    detail[key].r.forEach((row) => {
      const o = byId.get(row[0]);
      detail[key].f.forEach((f, i) => { if (row[i + 1] !== 0) o[f] = row[i + 1]; });
    });
  });
  return out;
}

// 2つの値が、項目の順・型まで同じか(違えば最初の違いの場所、同じなら null)。別の vm のオブジェクトどうしでも比べられる
function firstDifference(a, b, p) {
  p = p || '$';
  if (a === b) return null;
  if (typeof a !== typeof b) return `${p}: 型が違う(${typeof a} / ${typeof b})`;
  if (typeof a === 'number' && Number.isNaN(a) && Number.isNaN(b)) return null;
  if (typeof a !== 'object' || a === null || b === null) return `${p}: 値が違う`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${p}: 配列とオブジェクト`;
  const ka = Object.getOwnPropertyNames(a);
  const kb = Object.getOwnPropertyNames(b);
  if (ka.join('\u0000') !== kb.join('\u0000')) return `${p}: 項目(の順)が違う ${ka.slice(0, 8).join(',')} / ${kb.slice(0, 8).join(',')}`;
  for (const k of ka) {
    if (Array.isArray(a) && k === 'length') continue;
    const da = Object.getOwnPropertyDescriptor(a, k);
    const db = Object.getOwnPropertyDescriptor(b, k);
    if (('value' in da) !== ('value' in db) || da.enumerable !== db.enumerable) return `${p}.${k}: 項目の種類が違う`;
    if (!('value' in da)) continue;
    const d = firstDifference(da.value, db.value, `${p}.${k}`);
    if (d) return d;
  }
  return null;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { PENDING, DETAIL_FIELDS, CODE_FILES, snapshotData, splitData, mergeForCheck, firstDifference, assertJsonSafe, sha };
