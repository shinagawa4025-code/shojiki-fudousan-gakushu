// 読み上げ機能(Web Speech API、オフライン・無料)
window.TTS = (function () {
  const supported = `speechSynthesis` in window;
  const DEFAULT_RATE = 1;
  const MIN_RATE = 0.6;
  const MAX_RATE = 1.4;

  // 保存値が壊れていても(読み込んだバックアップの文字列など)範囲内の数値にそろえる
  function getRate() {
    const n = Number(Storage.get(`ttsRate`, DEFAULT_RATE));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_RATE;
    return Math.min(MAX_RATE, Math.max(MIN_RATE, n));
  }

  function speak(text, opts) {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = `ja-JP`;
    utter.rate = opts && Number.isFinite(opts.rate) ? opts.rate : getRate();
    window.speechSynthesis.speak(utter);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
  }

  return { supported, speak, stop, getRate, DEFAULT_RATE, MIN_RATE, MAX_RATE };
})();
