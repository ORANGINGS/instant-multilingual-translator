(() => {
  "use strict";

  if (document.getElementById("stressMode")) return;

  const settingsSection = document.querySelector(".settings");
  const onlineFallback = document.getElementById("onlineFallback");
  const enabled = document.getElementById("enabled");
  const saved = document.getElementById("saved");

  if (!settingsSection) return;

  const row = document.createElement("label");
  row.className = "setting-row";

  const text = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = "英文重音強調模式";
  const description = document.createElement("small");
  description.textContent = "單字先正常播放，再以慢速與較高音調重播";
  text.append(title, description);

  const input = document.createElement("input");
  input.id = "stressMode";
  input.type = "checkbox";
  input.setAttribute("aria-label", "英文重音強調模式");
  row.append(text, input);

  const onlineRow = onlineFallback?.closest(".setting-row");
  if (onlineRow) {
    settingsSection.insertBefore(row, onlineRow);
  } else {
    settingsSection.append(row);
  }

  chrome.storage.sync
    .get({ stressMode: false, enabled: true })
    .then((settings) => {
      input.checked = settings.stressMode === true;
      input.disabled = settings.enabled === false;
    })
    .catch(() => {
      input.disabled = true;
    });

  input.addEventListener("change", async () => {
    await chrome.storage.sync.set({ stressMode: input.checked });
    showSaved(input.checked ? "重音強調模式已開啟" : "重音強調模式已關閉");
  });

  enabled?.addEventListener("change", () => {
    input.disabled = !enabled.checked;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.stressMode) input.checked = changes.stressMode.newValue === true;
    if (changes.enabled) input.disabled = changes.enabled.newValue === false;
  });

  function showSaved(message) {
    if (!saved) return;
    saved.textContent = message;
    clearTimeout(showSaved.timer);
    showSaved.timer = setTimeout(() => {
      saved.textContent = "";
    }, 1100);
  }
})();
