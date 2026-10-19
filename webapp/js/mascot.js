// 家の形のマスコット(このアプリ用に独自に描いたもの)と、達成時の紙吹雪
// 色は css/style.css の --mascot-*(ダークでも見える)。飾りなので読み上げない(aria-hidden・フォーカスしない)
// v12.2: まばたき・待機中の小さな揺れは css/motion.css(目は .m-eyes、体は .m-sway)。表情に「驚き」「照れ」を追加。
//        ホームではタップすると跳ねて、少しのあいだ表情が変わる(react。js/motion.js から)
window.Mascot = (function () {
  // 表情ごとの顔(目・口・飾り)。座標は 100×100。まばたきする開いた目は .m-eyes にまとめる
  const EYE = `<g class="m-eyes"><circle class="m-ink" cx="38" cy="63" r="4"/><circle class="m-ink" cx="62" cy="63" r="4"/><circle class="m-hi" cx="39.4" cy="61.6" r="1.3"/><circle class="m-hi" cx="63.4" cy="61.6" r="1.3"/></g>`;
  const SMILE_EYE = `<path class="m-line" d="M33.5 64q4.5-5.5 9 0M57.5 64q4.5-5.5 9 0"/>`;
  // きらめき(元気な表情の飾り)
  const STARS = `<path class="m-door" d="M13 19l2.1 4.9 4.9 2.1-4.9 2.1-2.1 4.9-2.1-4.9-4.9-2.1 4.9-2.1zM90 16l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z"/>`;
  const FACES = {
    normal: `${EYE}<path class="m-line" d="M45 69q5 4.5 10 0"/>`,
    happy: `${SMILE_EYE}<path class="m-ink" d="M44 68q6 9 12 0z"/>`,
    cheer: `${SMILE_EYE}<path class="m-ink" d="M42.5 67q7.5 12 15 0z"/>${STARS}`,
    think: `<g class="m-eyes"><circle class="m-ink" cx="36" cy="61.5" r="4"/><circle class="m-ink" cx="60" cy="61.5" r="4"/></g><path class="m-line" d="M56 54q5-3 10 0M46.5 71.5q3.5-2 7 0"/><circle class="m-bub" cx="15" cy="34" r="2.2"/><circle class="m-bub" cx="9" cy="25" r="3.4"/>`,
    // 驚き: 大きな丸い目・上がった眉・小さな「お」の口
    surprised: `<g class="m-eyes"><circle class="m-ink" cx="37.5" cy="63" r="5"/><circle class="m-ink" cx="62.5" cy="63" r="5"/><circle class="m-hi" cx="39.2" cy="61.2" r="1.6"/><circle class="m-hi" cx="64.2" cy="61.2" r="1.6"/></g><path class="m-line" d="M33 56.5q4.5-3 9 0M58 56.5q4.5-3 9 0"/><ellipse class="m-ink" cx="50" cy="71" rx="2.8" ry="3.3"/>`,
    // 照れ: 下向きに細めた目・ほおの斜線・小さな波の口
    shy: `<path class="m-line" d="M33.5 62q4.5 4 9 0M57.5 62q4.5 4 9 0M45.5 71.5q2.25-2.2 4.5 0t4.5 0"/><path class="m-blush" d="M25.5 68.5l-2.5 3.6M30 68.5l-2.5 3.6M72.5 68.5l-2.5 3.6M77 68.5l-2.5 3.6"/>`,
  };
  // 元気な表情は少し傾ける(体の下を軸に)
  const tiltOf = (name) => (name === `cheer` ? `rotate(-6 50 94)` : ``);

  // 表情('normal' | 'happy' | 'cheer' | 'think' | 'surprised' | 'shy')と大きさ(px)を受け取り、SVG の文字列を返す
  function svg(expression, size, opts) {
    const face = FACES[expression] || FACES.normal;
    const name = FACES[expression] ? expression : `normal`;
    const px = Number(size) > 0 ? Number(size) : 96;
    const cls = opts && opts.className ? ` ${String(opts.className).replace(/[^\w -]/g, ``)}` : ``;
    const tilt = tiltOf(name);
    // .m-sway: 待機中の揺れ(css/motion.css)。中の g は表情ごとの傾き(SVG の属性。CSS の動きと重ならないよう分ける)
    return `<svg class="mascot mascot-${name}${cls}" viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true" focusable="false"><g class="m-sway"><g class="m-pose"${tilt ? ` transform="${tilt}"` : ``}>`
      + `<rect class="m-rd" x="66" y="17" width="11" height="22" rx="2"/>`
      + `<rect class="m-body" x="18" y="42" width="64" height="52" rx="13"/>`
      + `<path class="m-roof" d="M50 14 88 47H12z"/>`
      + `<path class="m-eave" d="M13 51.5h74"/>`
      + `<path class="m-door" d="M44 94v-9a6 6 0 0 1 12 0v9z"/>`
      + `<ellipse class="m-cheek" cx="29.5" cy="70.5" rx="5" ry="3.2"/><ellipse class="m-cheek" cx="70.5" cy="70.5" rx="5" ry="3.2"/>`
      + `<g class="m-face">${face}</g></g></g></svg>`;
  }

  // 描いたマスコット(svg 要素)の表情だけを変える(大きさ・ほかのクラスはそのまま)
  function setFace(el, expression) {
    if (!el || !FACES[expression]) return;
    const face = el.querySelector(`.m-face`);
    if (!face) return;
    face.innerHTML = FACES[expression];
    const pose = el.querySelector(`.m-pose`);
    if (pose) {
      const t = tiltOf(expression);
      if (t) pose.setAttribute(`transform`, t); else pose.removeAttribute(`transform`);
    }
    // クラスの並びはそのまま、表情のクラス(mascot-〜)だけを入れ替える
    let found = false;
    const cls = (el.getAttribute(`class`) || ``).split(/\s+/).filter(Boolean).map((c) => {
      if (!/^mascot-/.test(c)) return c;
      found = true;
      return `mascot-${expression}`;
    });
    if (!found) cls.push(`mascot-${expression}`);
    el.setAttribute(`class`, cls.join(` `));
  }

  // タップしたときの反応: 小さく跳ねて、少しのあいだ別の表情に(タップのたびに順に変わる)。
  // 動きを減らす設定では跳ねずに表情だけ変える
  const REACT = [`surprised`, `happy`, `shy`, `cheer`];
  let reactN = 0;
  function react(el) {
    if (!el || !el.isConnected) return;
    const st = el.__mascot || (el.__mascot = { base: (String(el.getAttribute(`class`)).match(/\bmascot-(\w+)/) || [])[1] || `normal`, timer: null });
    setFace(el, REACT[reactN++ % REACT.length]);
    el.classList.remove(`is-hop`);
    // 続けて押しても跳ね直すよう、いったん外してから付ける
    void el.getBoundingClientRect();
    el.classList.add(`is-hop`);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      el.classList.remove(`is-hop`);
      if (el.isConnected) setFace(el, st.base);
    }, 1400);
  }

  // 紙吹雪: 要素の中央から色の紙が飛び散る(CSS の .confetti-bit。1.2秒後に消す)。動きを減らす設定では何もしない
  // opts(v12.2): { n: 紙の数, spread: 飛ぶ距離の倍率, cls: 箱のクラス(既定 confetti。小さな演出は fd-burst) }
  function confetti(target, opts) {
    if (!target || !target.getBoundingClientRect || !document.body) return;
    if (window.matchMedia && window.matchMedia(`(prefers-reduced-motion: reduce)`).matches) return;
    const o = opts || {};
    const r = target.getBoundingClientRect();
    const box = document.createElement(`span`);
    box.className = o.cls || `confetti`;
    box.setAttribute(`aria-hidden`, `true`);
    box.style.left = `${Math.round(r.left + r.width / 2)}px`;
    box.style.top = `${Math.round(r.top + Math.min(r.height / 2, 120))}px`;
    const n = o.n || 28;
    const k = o.spread || 1;
    for (let i = 0; i < n; i++) {
      const bit = document.createElement(`span`);
      bit.className = `confetti-bit`;
      const a = (i / n) * Math.PI * 2 + Math.random() * .4;
      const d = (60 + Math.random() * 90) * k;
      bit.style.setProperty(`--x`, `${Math.round(Math.cos(a) * d)}px`);
      bit.style.setProperty(`--y`, `${Math.round(Math.sin(a) * d * .6 - 70 * k)}px`);
      bit.style.setProperty(`--r`, `${Math.round(Math.random() * 720 - 360)}deg`);
      bit.style.setProperty(`--d`, `${Math.round(Math.random() * 90)}ms`);
      box.appendChild(bit);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1200);
  }

  return { svg, setFace, react, confetti, expressions: Object.keys(FACES) };
})();
