(() => {
  "use strict";

  if (globalThis.__instantTranslatorStressShortcutInstalled) return;
  globalThis.__instantTranslatorStressShortcutInstalled = true;

  const DOUBLE_PRESS_WINDOW_MS = 450;
  const TOAST_ID = "__instant_translator_stress_shortcut_toast__";

  let lastGAt = 0;
  let toggleInProgress = false;
  let toastTimer = null;

  document.addEventListener("keydown", onKeyDown, true);

  function onKeyDown(event) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      String(event.key).toLowerCase() !== "g" ||
      isEditableTarget(event.target)
    ) {
      if (String(event.key).toLowerCase() !== "g") lastGAt = 0;
      return;
    }

    const now = performance.now();
    const isDoublePress = lastGAt > 0 && now - lastGAt <= DOUBLE_PRESS_WINDOW_MS;
    lastGAt = isDoublePress ? 0 : now;

    if (!isDoublePress || toggleInProgress) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleStressMode();
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
      )
    );
  }

  async function toggleStressMode() {
    toggleInProgress = true;

    try {
      const stored = await chrome.storage.sync.get({ stressMode: false, enabled: true });
      const nextValue = stored.stressMode !== true;
      await chrome.storage.sync.set({ stressMode: nextValue });

      try {
        window.speechSynthesis?.cancel();
      } catch {
        // Ignore speech cleanup failures.
      }

      const suffix = stored.enabled === false ? "（外掛目前關閉）" : "";
      showToast(`重音強調：${nextValue ? "已開啟" : "已關閉"}${suffix}`, nextValue);
    } catch (error) {
      console.debug("[即時多語朗讀翻譯] 無法切換重音模式：", error);
      showToast("無法切換重音模式，請重新整理頁面", false, true);
    } finally {
      toggleInProgress = false;
    }
  }

  function showToast(message, enabled, isError = false) {
    document.getElementById(TOAST_ID)?.remove();
    clearTimeout(toastTimer);

    const host = document.createElement("div");
    host.id = TOAST_ID;
    Object.assign(host.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "2147483647",
      pointerEvents: "none"
    });

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .toast {
        padding: 10px 14px;
        border: 1px solid ${isError ? "#f28b82" : enabled ? "#8ab4f8" : "#80868b"};
        border-radius: 8px;
        background: #202124;
        color: #f1f3f4;
        box-shadow: 0 5px 18px rgba(0, 0, 0, 0.34);
        font: 600 13px/1.35 Arial, "Noto Sans TC", "Microsoft JhengHei", sans-serif;
        opacity: 0;
        transform: translateY(-6px);
        animation: enter 140ms ease forwards;
      }
      @keyframes enter {
        to { opacity: 1; transform: translateY(0); }
      }
    `;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    shadow.append(style, toast);
    document.documentElement.append(host);

    toastTimer = setTimeout(() => host.remove(), 1500);
  }
})();
