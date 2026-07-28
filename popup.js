"use strict";

const LANGUAGES = [
  ["en", "\u82f1\u6587", "en-US", "forecast"],
  ["es", "\u897f\u73ed\u7259\u6587", "es-ES", "pron\u00f3stico"],
  ["zh-TW", "\u4e2d\u6587\uff08\u7e41\u9ad4\uff09", "zh-TW", "\u5929\u6c23\u9810\u5831"],
  ["zh-CN", "\u4e2d\u6587\uff08\u7c21\u9ad4\uff09", "zh-CN", "\u5929\u6c14\u9884\u62a5"],
  ["ja", "\u65e5\u6587", "ja-JP", "\u5929\u6c17\u4e88\u5831"],
  ["ko", "\u97d3\u6587", "ko-KR", "\uc77c\uae30 \uc608\ubcf4"],
  ["fr", "\u6cd5\u6587", "fr-FR", "pr\u00e9vision"],
  ["de", "\u5fb7\u6587", "de-DE", "Vorhersage"],
  ["it", "\u7fa9\u5927\u5229\u6587", "it-IT", "previsione"],
  ["pt", "\u8461\u8404\u7259\u6587", "pt-BR", "previs\u00e3o"],
  ["ru", "\u4fc4\u6587", "ru-RU", "\u043f\u0440\u043e\u0433\u043d\u043e\u0437"],
  ["vi", "\u8d8a\u5357\u6587", "vi-VN", "d\u1ef1 b\u00e1o"],
  ["th", "\u6cf0\u6587", "th-TH", "\u0e1e\u0e22\u0e32\u0e01\u0e23\u0e13\u0e4c"],
  ["id", "\u5370\u5c3c\u6587", "id-ID", "prakiraan"],
  ["tr", "\u571f\u8033\u5176\u6587", "tr-TR", "tahmin"],
  ["ar", "\u963f\u62c9\u4f2f\u6587", "ar-SA", "\u062a\u0648\u0642\u0639\u0627\u062a"],
  ["hi", "\u5370\u5730\u6587", "hi-IN", "\u092a\u0942\u0930\u094d\u0935\u093e\u0928\u0941\u092e\u093e\u0928"],
  ["nl", "\u8377\u862d\u6587", "nl-NL", "voorspelling"],
  ["pl", "\u6ce2\u862d\u6587", "pl-PL", "prognoza"],
  ["uk", "\u70cf\u514b\u862d\u6587", "uk-UA", "\u043f\u0440\u043e\u0433\u043d\u043e\u0437"],
  ["sv", "\u745e\u5178\u6587", "sv-SE", "prognos"]
].map(([code, label, speechCode, sample]) => ({ code, label, speechCode, sample }));

const LANGUAGE_BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));
const DEFAULTS = {
  enabled: true,
  autoSpeak: true,
  onlineFallback: true,
  sourceLanguage: "auto",
  targetLanguage: "zh-TW",
  theme: "system",
  speechRate: 0.9
};

const elements = Object.fromEntries([
  "enabled", "autoSpeak", "onlineFallback", "sourceLanguage",
  "targetLanguage", "theme", "speechRate", "rateValue",
  "testVoice", "languageWarning", "saved", "powerStatus", "disabledBanner"
].map((id) => [id, document.getElementById(id)]));
const darkMedia = matchMedia("(prefers-color-scheme: dark)");

initialize().catch(console.error);

async function initialize() {
  populateLanguages();
  const settings = sanitize({ ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) });

  elements.enabled.checked = settings.enabled;
  elements.autoSpeak.checked = settings.autoSpeak;
  elements.onlineFallback.checked = settings.onlineFallback;
  elements.sourceLanguage.value = settings.sourceLanguage;
  elements.targetLanguage.value = settings.targetLanguage;
  elements.theme.value = settings.theme;
  elements.speechRate.value = String(settings.speechRate);
  refresh();

  elements.enabled.addEventListener("change", () => {
    updatePowerState();
    save(elements.enabled.checked ? "擴充功能已開啟" : "擴充功能已關閉");
  });
  for (const id of ["autoSpeak", "onlineFallback"]) {
    elements[id].addEventListener("change", save);
  }
  elements.sourceLanguage.addEventListener("change", () => { refresh(); save(); });
  elements.targetLanguage.addEventListener("change", () => { refresh(); save(); });
  elements.theme.addEventListener("change", () => { applyTheme(); save(); });
  elements.speechRate.addEventListener("input", () => { updateRate(); save(); });
  elements.testVoice.addEventListener("click", testVoice);
  darkMedia.addEventListener("change", () => {
    if (elements.theme.value === "system") applyTheme();
  });
}

function populateLanguages() {
  elements.sourceLanguage.append(new Option("\u81ea\u52d5\u5075\u6e2c", "auto"));
  for (const language of LANGUAGES) {
    elements.sourceLanguage.append(new Option(language.label, language.code));
    elements.targetLanguage.append(new Option(language.label, language.code));
  }
}

function sanitize(settings) {
  return {
    enabled: Boolean(settings.enabled),
    autoSpeak: Boolean(settings.autoSpeak),
    onlineFallback: Boolean(settings.onlineFallback),
    sourceLanguage: settings.sourceLanguage === "auto" || LANGUAGE_BY_CODE.has(settings.sourceLanguage)
      ? settings.sourceLanguage : "auto",
    targetLanguage: LANGUAGE_BY_CODE.has(settings.targetLanguage) ? settings.targetLanguage : "zh-TW",
    theme: ["system", "light", "dark"].includes(settings.theme) ? settings.theme : "system",
    speechRate: clamp(Number(settings.speechRate), 0.6, 1.4, 0.9)
  };
}

function refresh() {
  updatePowerState();
  updateRate();
  elements.languageWarning.hidden = !(
    elements.sourceLanguage.value !== "auto" &&
    elements.sourceLanguage.value === elements.targetLanguage.value
  );
  const language = LANGUAGE_BY_CODE.get(elements.sourceLanguage.value) || LANGUAGE_BY_CODE.get("en");
  elements.testVoice.textContent = `\ud83d\udd0a \u8a66\u64ad ${language.sample}`;
  applyTheme();
}

function updateRate() {
  elements.rateValue.textContent = `${Number(elements.speechRate.value).toFixed(2)}\u00d7`;
}

function applyTheme() {
  const selected = elements.theme.value;
  document.documentElement.dataset.theme = selected === "system"
    ? (darkMedia.matches ? "dark" : "light")
    : selected;
}

function updatePowerState() {
  const isEnabled = elements.enabled.checked;
  document.querySelector("main").dataset.enabled = String(isEnabled);
  elements.powerStatus.textContent = isEnabled ? "已開啟" : "已關閉";
  elements.powerStatus.dataset.state = isEnabled ? "on" : "off";
  elements.disabledBanner.hidden = isEnabled;
  elements.testVoice.disabled = !isEnabled;
  if (!isEnabled) window.speechSynthesis.cancel();
}

async function save(message = "設定已儲存") {
  await chrome.storage.sync.set({
    enabled: elements.enabled.checked,
    autoSpeak: elements.autoSpeak.checked,
    onlineFallback: elements.onlineFallback.checked,
    sourceLanguage: elements.sourceLanguage.value,
    targetLanguage: elements.targetLanguage.value,
    theme: elements.theme.value,
    speechRate: Number(elements.speechRate.value)
  });
  elements.saved.textContent = message;
  clearTimeout(save.timer);
  save.timer = setTimeout(() => { elements.saved.textContent = ""; }, 900);
}

function testVoice() {
  const language = LANGUAGE_BY_CODE.get(elements.sourceLanguage.value) || LANGUAGE_BY_CODE.get("en");
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(language.sample);
  utterance.lang = language.speechCode;
  utterance.rate = Number(elements.speechRate.value);
  const prefix = language.speechCode.toLowerCase().split("-")[0];
  const matching = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
  utterance.voice = matching.find((voice) => /google|microsoft/i.test(voice.name)) || matching[0] || null;
  setTimeout(() => speechSynthesis.speak(utterance), 0);
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
