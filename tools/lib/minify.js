// 公開用ビルドの「控えめな」縮小(依存パッケージなし。Node の標準機能だけ)
// - JS: コメントと、意味を持たない空白だけを取り除く。文字列・テンプレート文字列(日本語の文章やHTML)・正規表現の中身には一切触れない。
//       改行はすべて残す(行番号が元のファイルと同じになり、エラーの行が追える。自動セミコロン挿入の挙動も変わらない)。
//       行頭のインデントと行末の空白は消し、同じ行の中の空白は ( ) [ ] { } , ; : の隣だけ消す(それ以外は1つに詰める)。
// - CSS: コメントを消し、空白を1つに詰め、{ } ; , の隣の空白と } の直前の ; を消す(セレクタの子孫結合子の空白などは残す)。
// 安全のため、縮小のあとに「元と同じ字句(トークン)の並びか」を確かめ、JS は構文としてコンパイルできるかも確かめる。
// 少しでも判断に迷う書き方(} の直後の / や、HTML 形式のコメント <!-- -->)があるファイルは縮小せず、元のまま使う。
'use strict';
const vm = require('vm');

const isNl = (c) => c === '\n' || c === '\r' || c === ' ' || c === ' ';
const isWs = (c) => /\s/.test(c); // JS の空白(全角スペース U+3000・BOM なども含む)
const isIdChar = (c) => /[A-Za-z0-9_$\\#]/.test(c) || (c >= '\u0080' && !/\s/.test(c));
const isDigit = (c) => c >= '0' && c <= '9';
// この語の直後の / は正規表現の始まり(それ以外の名前・数値・閉じかっこの直後は割り算)
const EXPR_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'extends']);
const COND_KEYWORDS = new Set(['if', 'while', 'for', 'with']);

class Unsafe extends Error {}

function countNl(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\r') { n++; if (s[i + 1] === '\n') i++; } else if (c === '\n' || c === ' ' || c === ' ') n++;
  }
  return n;
}

// JS の字句分け。tokens: { t: 'ws'|'lc'|'bc'|'str'|'tpl'|'re'|'id'|'num'|'p', s, e }
function tokenizeJs(src) {
  const tokens = [];
  let i = 0;
  if (src.startsWith('#!')) { // シバン行
    while (i < src.length && !isNl(src[i])) i++;
    tokens.push({ t: 'lc', s: 0, e: i });
  }
  i = scan(src, i, false, tokens);
  if (i !== src.length) throw new Unsafe('scan did not reach the end');
  return tokens;
}

// i から字句を読む。nested=true のときはテンプレートの ${ } の中で、対応する } の直後の位置を返す
function scan(src, i, nested, out) {
  let last = null; // 直前の意味のある字句 { t, v }
  const parens = []; // ( の種類: true = if/while/for/with の条件
  let braces = 0;
  let lastParenWasCond = false;
  const push = (t, s, e) => { if (out) out.push({ t, s, e }); };
  const regexAllowed = () => {
    if (!last) return true;
    if (last.t === 'id') return EXPR_KEYWORDS.has(last.v);
    if (last.t === 'num' || last.t === 'str' || last.t === 'tpl' || last.t === 're') return false;
    if (last.v === ')') return lastParenWasCond;
    if (last.v === ']' || last.v === '++' || last.v === '--') return false;
    if (last.v === '}') throw new Unsafe('"/" right after "}" is ambiguous');
    return true;
  };
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const s = i;
    if (isWs(c)) {
      while (i < n && isWs(src[i])) i++;
      push('ws', s, i);
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && !isNl(src[i])) i++;
      push('lc', s, i);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Unsafe('unterminated block comment');
      i = end + 2;
      push('bc', s, i);
      continue;
    }
    if (c === '<' && src.startsWith('<!--', i)) throw new Unsafe('HTML-like comment');
    if (c === '-' && src.startsWith('-->', i)) throw new Unsafe('HTML-like comment');
    if (c === '\'' || c === '"') {
      i++;
      while (true) {
        if (i >= n) throw new Unsafe('unterminated string');
        const d = src[i];
        if (d === '\\') { i += src[i + 1] === '\r' && src[i + 2] === '\n' ? 3 : 2; continue; }
        if (d === c) { i++; break; }
        if (d === '\n' || d === '\r') throw new Unsafe('newline in string');
        i++;
      }
      push('str', s, i);
      last = { t: 'str' };
      continue;
    }
    if (c === '`') {
      i++;
      while (true) {
        if (i >= n) throw new Unsafe('unterminated template');
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '`') { i++; break; }
        if (d === '$' && src[i + 1] === '{') { i = scan(src, i + 2, true, null); continue; }
        i++;
      }
      push('tpl', s, i);
      last = { t: 'tpl' };
      continue;
    }
    if (c === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n) {
        const d = src[j];
        if (isNl(d)) break;
        if (d === '\\') { if (j + 1 >= n || isNl(src[j + 1])) break; j += 2; continue; }
        if (inClass) { if (d === ']') inClass = false; } else if (d === '[') inClass = true; else if (d === '/') { ok = true; break; }
        j++;
      }
      if (!ok) throw new Unsafe('regex literal could not be read');
      j++;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      i = j;
      push('re', s, i);
      last = { t: 're' };
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      while (i < n && /[0-9A-Za-z_.]/.test(src[i])) {
        // 1e+5 / 1e-5 の指数の符号
        if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '+' || src[i + 1] === '-') && !/^0[xXbBoO]/.test(src.slice(s, i))) i += 2;
        else i++;
      }
      push('num', s, i);
      last = { t: 'num' };
      continue;
    }
    if (isIdChar(c)) {
      while (i < n && isIdChar(src[i])) i++;
      push('id', s, i);
      last = { t: 'id', v: src.slice(s, i) };
      continue;
    }
    // 記号
    let v = c;
    if ((c === '+' || c === '-') && src[i + 1] === c) v = c + c;
    i += v.length;
    if (v === '(') parens.push(!!(last && last.t === 'id' && COND_KEYWORDS.has(last.v)));
    if (v === ')') lastParenWasCond = !!parens.pop();
    if (v === '{') braces++;
    if (v === '}') {
      if (nested && braces === 0) { push('p', s, i); return i; } // ${ } の終わり
      braces--;
    }
    push('p', s, i);
    last = { t: 'p', v };
  }
  if (nested) throw new Unsafe('unterminated ${ } in template');
  return i;
}

const JS_GLUE = new Set(['(', ')', '[', ']', '{', '}', ',', ';', ':']);
const isGap = (tk) => tk.t === 'ws' || tk.t === 'lc' || tk.t === 'bc';

function minifyJsUnchecked(src, tokens) {
  const out = [];
  let k = 0;
  let prev = null;
  while (k < tokens.length) {
    const tk = tokens[k];
    if (!isGap(tk)) { out.push(src.slice(tk.s, tk.e)); prev = tk; k++; continue; }
    let nl = 0;
    while (k < tokens.length && isGap(tokens[k])) {
      const g = tokens[k];
      if (g.t !== 'lc') nl += countNl(src.slice(g.s, g.e));
      k++;
    }
    const next = k < tokens.length ? tokens[k] : null;
    if (nl > 0) { out.push('\n'.repeat(nl)); continue; }
    if (!prev || !next) continue;
    const a = src.slice(prev.s, prev.e);
    const b = src.slice(next.s, next.e);
    if ((prev.t === 'p' && JS_GLUE.has(a)) || (next.t === 'p' && JS_GLUE.has(b))) continue;
    out.push(' ');
  }
  return out.join('');
}

function sig(src, tokens) {
  return tokens.filter((t) => !isGap(t)).map((t) => t.t + '\u0000' + src.slice(t.s, t.e));
}

// 戻り値: { code, minified: boolean, reason? }
function minifyJs(src, name) {
  try {
    const tokens = tokenizeJs(src);
    const code = minifyJsUnchecked(src, tokens);
    // 検証1: 元と同じ字句の並び(消したのは空白とコメントだけ)
    const a = sig(src, tokens);
    const b = sig(code, tokenizeJs(code));
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) throw new Unsafe('token stream changed');
    // 検証2: 行の数が同じ(行番号がずれない)
    if (countNl(src) !== countNl(code)) throw new Unsafe('line count changed');
    // 検証3: 構文としてコンパイルできる
    new vm.Script(code, { filename: name || 'bundle.js' });
    return { code, minified: true };
  } catch (e) {
    if (e instanceof Unsafe) return { code: src, minified: false, reason: e.message };
    throw e;
  }
}

// ---- CSS ----
function tokenizeCss(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const s = i;
    if (/\s/.test(c)) { while (i < n && /\s/.test(src[i])) i++; tokens.push({ t: 'ws', s, e: i }); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Unsafe('unterminated CSS comment');
      i = end + 2;
      tokens.push({ t: 'bc', s, e: i });
      continue;
    }
    if (c === '"' || c === '\'') {
      i++;
      while (true) {
        if (i >= n) throw new Unsafe('unterminated CSS string');
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === c) { i++; break; }
        if (d === '\n') throw new Unsafe('newline in CSS string');
        i++;
      }
      tokens.push({ t: 'str', s, e: i });
      continue;
    }
    if (/^url\(/i.test(src.slice(i, i + 4))) {
      // url( ) は中身ごと1つの字句にする(引用符なしの URL の空白などを触らない)
      let j = i + 4;
      let q = null;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (q) { if (d === q) q = null; } else if (d === '"' || d === '\'') q = d; else if (d === ')') break;
        j++;
      }
      if (j >= n) throw new Unsafe('unterminated url(');
      i = j + 1;
      tokens.push({ t: 'url', s, e: i });
      continue;
    }
    if (c === '{' || c === '}' || c === ';' || c === ',' || c === ':' || c === '(' || c === ')') { i++; tokens.push({ t: 'p', s, e: i }); continue; }
    // その他(名前・数値・記号)。\ のエスケープは次の1文字ごと
    while (i < n) {
      const d = src[i];
      if (d === '\\') { i += 2; continue; }
      if (/\s/.test(d) || '{};,:()"\''.includes(d) || (d === '/' && src[i + 1] === '*') || /^url\(/i.test(src.slice(i, i + 4))) break;
      i++;
    }
    if (i === s) i++;
    tokens.push({ t: 'w', s, e: i });
  }
  return tokens;
}

const CSS_GLUE = new Set(['{', '}', ';', ',']);
function minifyCssUnchecked(src, tokens) {
  const out = [];
  let prev = null;
  let k = 0;
  while (k < tokens.length) {
    const tk = tokens[k];
    if (tk.t !== 'ws' && tk.t !== 'bc') {
      const v = src.slice(tk.s, tk.e);
      // } の直前の ; は不要
      if (v === '}' && out.length && out[out.length - 1] === ';') out.pop();
      out.push(v);
      prev = tk;
      k++;
      continue;
    }
    let hasWs = false;
    while (k < tokens.length && (tokens[k].t === 'ws' || tokens[k].t === 'bc')) { if (tokens[k].t === 'ws') hasWs = true; k++; }
    const next = k < tokens.length ? tokens[k] : null;
    if (!prev || !next) continue;
    const a = src.slice(prev.s, prev.e);
    const b = src.slice(next.s, next.e);
    if ((prev.t === 'p' && CSS_GLUE.has(a)) || (next.t === 'p' && CSS_GLUE.has(b))) continue;
    // コメントだけで区切られていた(空白なし)ときは、字句の区切りを保つため空のコメントを残す
    out.push(hasWs ? ' ' : '/**/');
  }
  return out.join('');
}

function cssSig(src, tokens) {
  const list = tokens.filter((t) => t.t !== 'ws' && t.t !== 'bc').map((t) => src.slice(t.s, t.e));
  // } の直前の ; は消してよいので比較から外す
  return list.filter((v, i) => !(v === ';' && list[i + 1] === '}'));
}

function minifyCss(src) {
  try {
    const tokens = tokenizeCss(src);
    const code = minifyCssUnchecked(src, tokens);
    const a = cssSig(src, tokens);
    const b = cssSig(code, tokenizeCss(code));
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) throw new Unsafe('CSS token stream changed');
    return { code, minified: true };
  } catch (e) {
    if (e instanceof Unsafe) return { code: src, minified: false, reason: e.message };
    throw e;
  }
}

// ファイルの最上位(ブロックの外)にある const / let / class 宣言を探す。
// ビルドでは各ファイルを try { } で包むため、最上位の const/let/class は他のファイルから見えなくなる(window.X = … の形にする必要がある)
function topLevelLexical(src) {
  const tokens = tokenizeJs(src);
  const found = [];
  let depth = 0;
  for (const tk of tokens) {
    if (tk.t === 'p') {
      const v = src.slice(tk.s, tk.e);
      if (v === '{' || v === '(' || v === '[') depth++;
      else if (v === '}' || v === ')' || v === ']') depth--;
    } else if (tk.t === 'id' && depth === 0) {
      const v = src.slice(tk.s, tk.e);
      if (v === 'const' || v === 'let' || v === 'class') found.push(`${v} (line ${countNl(src.slice(0, tk.s)) + 1})`);
    } else if (tk.t === 'str' && depth === 0 && /^['"]use strict['"]$/.test(src.slice(tk.s, tk.e))) {
      found.push(`"use strict" (line ${countNl(src.slice(0, tk.s)) + 1})`);
    }
  }
  return found;
}

module.exports = { minifyJs, minifyCss, tokenizeJs, topLevelLexical, countNl, Unsafe };
