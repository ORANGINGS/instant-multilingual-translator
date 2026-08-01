(() => {
  "use strict";

  if (document.getElementById("stressMode")) return;

  const languagePanel = document.querySelector(".language-panel");
  const settingsSection = document.querySelector(".settings");
  const main = document.querySelector("main");
  const enabled = document.getElementById("enabled");
  const saved = document.getElementById("saved");

  if (!settingsSection || !main) return;

  const style = document.createElement("style");
  style.textContent = `
    .stress-practice-panel {
      margin-bottom: 11px;
      padding: 11px 12px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--surface-subtle);
    }

    .stress-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      cursor: pointer;
      user-select: none;
    }

    .stress-toggle-copy {
      display: grid;
      gap: 2px;
    }

    .stress-switch-wrap {
      display: grid;
      justify-items: end;
      gap: 5px;
      flex: 0 0 auto;
    }

    .stress-switch-wrap input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .stress-status {
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
    }

    .stress-status[data-state="on"] {
      color: var(--accent);
    }

    .stress-switch {
      position: relative;
      display: block;
      width: 44px;
      height: 24px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-hover);
      transition: background 160ms ease, border-color 160ms ease;
    }

    .stress-thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--text-muted);
      box-shadow: 0 1px 3px rgba(60, 64, 67, 0.35);
      transition: transform 160ms ease, background 160ms ease;
    }

    .stress-switch-wrap input:checked + .stress-switch {
      border-color: var(--accent);
      background: rgba(26, 115, 232, 0.18);
    }

    .stress-switch-wrap input:checked + .stress-switch .stress-thumb {
      transform: translateX(20px);
      background: var(--accent);
    }

    .stress-switch-wrap input:focus-visible + .stress-switch {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .stress-switch-wrap input:disabled + .stress-switch {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;
  document.head.append(style);

  const panel = document.createElement("section");
  panel.className = "stress-practice-panel";
  panel.setAttribute("aria-label", "英文發音練習設定");

  const row = document.createElement("label");
  row.className = "stress-toggle-row";

  const copy = document.createElement("span");
  copy.className = "stress-toggle-copy";

  const title = document.createElement("strong");
  title.textContent = "英文重音強調模式";

  const description = document.createElement("small");
  description.textContent = "獨立開關；需要練習時才開啟，單字會再慢速重播";
  copy.append(title, description);

  const switchWrap = document.createElement("span");
  switchWrap.className = "stress-switch-wrap";

  const status = document.createElement("span");
  status.className = "stress-status";
  status.setAttribute("aria-live", "polite");

  const input = document.createElement("input");
  input.id = "stressMode";
  input.type = "checkbox";
  input.setAttribute("aria-label", "英文重音強調模式");

  const switchTrack = document.createElement("span");
  switchTrack.className = "stress-switch";
  switchTrack.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("span");
  thumb.className = "stress-thumb";
  switchTrack.append(thumb);

  switchWrap.append(status, input, switchTrack);
  row.append(copy, switchWrap);
  panel.append(row);

  if (languagePanel?.nextSibling) {
    main.insertBefore(panel, languagePanel.nextSibling);
  } else {
    main.insertBefore(panel, settingsSection);
  }

  chrome.storage.sync
    .get({ stressMode: false, enabled: true })
    .then((stored) => {
      input.checked = stored.stressMode === true;
      input.disabled = stored.enabled === false;
      updateState();
    })
    .catch(() => {
      input.checked = false;
      input.disabled = true;
      updateState();
    });

  input.addEventListener("change", async () => {
    window.speechSynthesis?.cancel();
    await chrome.storage.sync.set({ stressMode: input.checked });
    updateState();
    showSaved(input.checked ? "重音強調模式已開啟" : "重音強調模式已關閉");
  });

  enabled?.addEventListener("change", () => {
    input.disabled = !enabled.checked;
    if (!enabled.checked) window.speechSynthesis?.cancel();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.stressMode) {
      input.checked = changes.stressMode.newValue === true;
      updateState();
    }
    if (changes.enabled) {
      input.disabled = changes.enabled.newValue === false;
    }
  });

  function updateState() {
    status.textContent = input.checked ? "已開啟" : "已關閉";
    status.dataset.state = input.checked ? "on" : "off";
  }

  function showSaved(message) {
    if (!saved) return;
    saved.textContent = message;
    clearTimeout(showSaved.timer);
    showSaved.timer = setTimeout(() => {
      saved.textContent = "";
    }, 1100);
  }
})();
