(() => {
  "use strict";

  const synth = window.speechSynthesis;
  if (!synth || globalThis.__instantTranslatorSpeechStabilized) return;
  globalThis.__instantTranslatorSpeechStabilized = true;

  const START_DELAY_MS = 140;
  const nativeCancel = synth.cancel.bind(synth);
  const nativeSpeak = synth.speak.bind(synth);
  let startTimer = null;
  let generation = 0;
  let activeUtterance = null;

  function clearPendingSpeech() {
    generation += 1;
    if (startTimer !== null) {
      clearTimeout(startTimer);
      startTimer = null;
    }
    activeUtterance = null;

    try {
      nativeCancel();
      if (synth.paused) synth.resume();
    } catch {
      // The page may be unloading or the speech service may be unavailable.
    }
  }

  function speakAfterSettle(utterance) {
    const token = generation;
    activeUtterance = utterance;

    const release = () => {
      if (token === generation) activeUtterance = null;
    };
    utterance.addEventListener("end", release, { once: true });
    utterance.addEventListener("error", release, { once: true });

    if (startTimer !== null) clearTimeout(startTimer);
    startTimer = setTimeout(() => {
      startTimer = null;
      if (token !== generation) return;

      try {
        if (synth.paused) synth.resume();
        nativeSpeak(utterance);
      } catch (error) {
        release();
        console.debug("[即時多語朗讀翻譯] 語音播放失敗：", error);
      }
    }, START_DELAY_MS);
  }

  function replaceMethod(name, method) {
    try {
      Object.defineProperty(synth, name, {
        configurable: true,
        writable: true,
        value: method
      });
      return true;
    } catch {
      try {
        synth[name] = method;
        return synth[name] === method;
      } catch {
        return false;
      }
    }
  }

  replaceMethod("cancel", clearPendingSpeech);
  replaceMethod("speak", speakAfterSettle);
  addEventListener("pagehide", clearPendingSpeech, { once: true });
})();
