// 家の形のマスコット(このアプリ用に独自に描いたもの)と、達成時の紙吹雪
// 色は css/style.css の --mascot-*(ダークでも見える)。飾りなので読み上げない
window.Mascot = (function () {
  // 表情ごとの顔(目・口・飾り)。座標は 100×100
  const EYE = `<circle class="m-ink" cx="38" cy="63" r="4"/><circle class="m-ink" cx="62" cy="63" r="4"/><circle class="m-hi" cx="39.4" cy="61.6" r="1.3"/><circle class="m-hi" cx="63.4" cy="61.6" r="1.3"/>`;
  const SMILE_EYE = `<path class="m-line" d="M33.5 64q4.5-5.5 9 0M57.5 64q4.5-5.5 9 0"/>`;
  // きらめき(元気な表情の飾り)
  const STARS = `<path class="m-door" d="M13 19l2.1 4.9 4.9 2.1-4.9 2.1-2.1 4.9-2.1-4.9-4.9-2.1 4.9-2.1zM90 16l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z"/>`;
  const FACES = {
    normal: `${EYE}<path class="m-line" d="M45 69q5 4.5 10 0"/>`,
    happy: `${SMILE_EYE}<path class="m-ink" d="M44 68q6 9 12 0z"/>`,
    cheer: `${SMILE_EYE}<path class="m-ink" d="M42.5 67q7.5 12 15 0z"/>${STARS}`,
    think: `<circle class="m-ink" cx="36" cy="61.5" r="4"/><circle class="m-ink" cx="60" cy="61.5" r="4"/><path class="m-line" d="M56 54q5-3 10 0M46.5 71.5q3.5-2 7 0"/><circle class="m-bub" cx="15" cy="34" r="2.2"/><circle class="m-bub" cx="9" cy="25" r="3.4"/>`,
  };

  // 表情('normal' | 'happy' | 'cheer' | 'think')と大きさ(px)を受け取り、SVG の文字列を返す
  function svg(expression, size, opts) {
    const face = FACES[expression] || FACES.normal;
    const name = FACES[expression] ? expression : `normal`;
    const px = Number(size) > 0 ? Number(size) : 96;
    const cls = opts && opts.className ? ` ${String(opts.className).replace(/[^\w -]/g, ``)}` : ``;
    // 元気な表情は少し傾ける(体の下を軸に)
    const tilt = name === `cheer` ? ` transform="rotate(-6 50 94)"` : ``;
    return `<svg class="mascot mascot-${name}${cls}" viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true" focusable="false"><g${tilt}>`
      + `<rect class="m-rd" x="66" y="17" width="11" height="22" rx="2"/>`
      + `<rect class="m-body" x="18" y="42" width="64" height="52" rx="13"/>`
      + `<path class="m-roof" d="M50 14 88 47H12z"/>`
      + `<path class="m-eave" d="M13 51.5h74"/>`
      + `<path class="m-door" d="M44 94v-9a6 6 0 0 1 12 0v9z"/>`
      + `<ellipse class="m-cheek" cx="29.5" cy="70.5" rx="5" ry="3.2"/><ellipse class="m-cheek" cx="70.5" cy="70.5" rx="5" ry="3.2"/>`
      + `${face}</g></svg>`;
  }

  // 紙吹雪: 要素の中央から色の紙が飛び散る(CSS の .confetti-bit。1.2秒後に消す)。動きを減らす設定では何もしない
  function confetti(target) {
    if (!target || !target.getBoundingClientRect || !document.body) return;
    if (window.matchMedia && window.matchMedia(`(prefers-reduced-motion: reduce)`).matches) return;
    const r = target.getBoundingClientRect();
    const box = document.createElement(`span`);
    box.className = `confetti`;
    box.setAttribute(`aria-hidden`, `true`);
    box.style.left = `${Math.round(r.left + r.width / 2)}px`;
    box.style.top = `${Math.round(r.top + Math.min(r.height / 2, 120))}px`;
    const n = 28;
    for (let i = 0; i < n; i++) {
      const bit = document.createElement(`span`);
      bit.className = `confetti-bit`;
      const a = (i / n) * Math.PI * 2 + Math.random() * .4;
      const d = 60 + Math.random() * 90;
      bit.style.setProperty(`--x`, `${Math.round(Math.cos(a) * d)}px`);
      bit.style.setProperty(`--y`, `${Math.round(Math.sin(a) * d * .6 - 70)}px`);
      bit.style.setProperty(`--r`, `${Math.round(Math.random() * 720 - 360)}deg`);
      bit.style.setProperty(`--d`, `${Math.round(Math.random() * 90)}ms`);
      box.appendChild(bit);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1200);
  }

  return { svg, confetti, expressions: Object.keys(FACES) };
})();
