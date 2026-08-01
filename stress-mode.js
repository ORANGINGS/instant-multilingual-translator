(() => {
  "use strict";

  const synth = window.speechSynthesis;
  if (!synth || globalThis.__instantTranslatorStressModeInstalled) return;
  globalThis.__instantTranslatorStressModeInstalled = true;

  const REPLAY_DELAY_MS = 320;
  const SLOW_RATE_FACTOR = 0.72;
  const SLOW_MIN_RATE = 0.55;
  const STRESS_PITCH = 1.12;
  const nativeCancel = synth.cancel.bind(synth);
  const nativeSpeak = synth.speak.bind(synth);

  let enabled = true;
  let stressMode = false;
  let replayTimer = null;
  let generation = 0;
  const activeUtterances = new Set();

  chrome.storage.sync
    .get({ enabled: true, stressMode: false })
    .then((settings) => {
      enabled = settings.enabled !== false;
      stressMode = settings.stressMode === true;
    })
    .catch(() => {
      enabled = false;
      stressMode = false;
    });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
    }
    if (changes.stressMode) {
      stressMode = changes.stressMode.newValue === true;
    }

    if (!enabled || !stressMode) {
      cancelStressPlayback();
    }
  });

  function cancelStressPlayback() {
    generation += 1;
    if (replayTimer !== null) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
    activeUtterances.clear();

    try {
      nativeCancel();
      if (synth.paused) synth.resume();
    } catch {
      // The page may be unloading or the speech service may be unavailable.
    }
  }

  function speakWithStressPractice(utterance) {
    generation += 1;
    const token = generation;

    if (replayTimer !== null) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }

    if (!shouldUseStressMode(utterance)) {
      nativeSpeak(utterance);
      return;
    }

    activeUtterances.add(utterance);

    const releaseFirst = () => {
      activeUtterances.delete(utterance);
    };

    utterance.addEventListener("error", releaseFirst, { once: true });
    utterance.addEventListener(
      "end",
      () => {
        releaseFirst();
        if (token !== generation || !enabled || !stressMode) return;

        replayTimer = setTimeout(() => {
          replayTimer = null;
          if (token !== generation || !enabled || !stressMode) return;

          const slow = cloneForStressPractice(utterance);
          activeUtterances.add(slow);

          const releaseSlow = () => activeUtterances.delete(slow);
          slow.addEventListener("end", releaseSlow, { once: true });
          slow.addEventListener("error", releaseSlow, { once: true });

          try {
            if (synth.paused) synth.resume();
            nativeSpeak(slow);
          } catch (error) {
            releaseSlow();
            console.debug("[即時多語朗讀翻譯] 重音練習播放失敗：", error);
          }
        }, REPLAY_DELAY_MS);
      },
      { once: true }
    );

    nativeSpeak(utterance);
  }

  function shouldUseStressMode(utterance) {
    if (!enabled || !stressMode || !(utterance instanceof SpeechSynthesisUtterance)) {
      return false;
    }

    const language = String(utterance.lang || "").toLowerCase();
    const text = String(utterance.text || "").trim();

    return (
      (language === "en" || language.startsWith("en-")) &&
      /^[A-Za-z]+(?:['’-][A-Za-z]+)?$/.test(text)
    );
  }

  function cloneForStressPractice(original) {
    const slow = new SpeechSynthesisUtterance(original.text);
    slow.lang = original.lang;
    slow.voice = original.voice;
    slow.volume = original.volume;
    slow.rate = Math.max(
      SLOW_MIN_RATE,
      (Number.isFinite(original.rate) ? original.rate : 1) * SLOW_RATE_FACTOR
    );
    slow.pitch = Math.min(
      2,
      Math.max(STRESS_PITCH, (Number.isFinite(original.pitch) ? original.pitch : 1) + 0.12)
    );
    return slow;
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

  replaceMethod("cancel", cancelStressPlayback);
  replaceMethod("speak", speakWithStressPractice);
  addEventListener("pagehide", cancelStressPlayback, { once: true });
})();
