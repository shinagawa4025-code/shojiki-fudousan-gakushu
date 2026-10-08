// 読み上げ機能(Web Speech API、オフライン・無料)
window.TTS = (function () {
  const supported = `speechSynthesis` in window;

  function speak(text) {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = `ja-JP`;
    utter.rate = Storage.get(`ttsRate`, 0.95);
    window.speechSynthesis.speak(utter);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
  }

  return { supported, speak, stop };
})();
