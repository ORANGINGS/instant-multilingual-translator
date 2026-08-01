(() => {
  "use strict";

  const HOST_ID = "__instant_multilingual_translate__";
  const INVALID_CONTEXT_PATTERN =
    /extension context invalidated|cannot read properties of undefined.*sendMessage|receiving end does not exist/i;

  function isInvalidContextError(value) {
    return INVALID_CONTEXT_PATTERN.test(String(value?.message || value || ""));
  }

  function cleanStaleExtensionUI() {
    document.getElementById(HOST_ID)?.remove();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Ignore cleanup failures after the extension context is invalidated.
    }
  }

  window.addEventListener("unhandledrejection", (event) => {
    if (!isInvalidContextError(event.reason)) return;
    event.preventDefault();
    cleanStaleExtensionUI();
  });

  window.addEventListener(
    "error",
    (event) => {
      if (!isInvalidContextError(event.error || event.message)) return;
      event.preventDefault();
      cleanStaleExtensionUI();
    },
    true
  );
})();
