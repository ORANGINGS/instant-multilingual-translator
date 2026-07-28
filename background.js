"use strict";

const MAX_TEXT_LENGTH = 500;
const ALLOWED_LANGUAGE_CODES = new Set([
  "auto",
  "en",
  "es",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "vi",
  "th",
  "id",
  "tr",
  "ar",
  "hi",
  "nl",
  "pl",
  "uk",
  "sv"
]);

let extensionEnabled = true;

chrome.runtime.onInstalled.addListener(() => syncEnabledState());
chrome.runtime.onStartup.addListener(() => syncEnabledState());
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.enabled) return;
  extensionEnabled = changes.enabled.newValue !== false;
  updateActionState();
});

syncEnabledState();

async function syncEnabledState() {
  const stored = await chrome.storage.sync.get({ enabled: true });
  extensionEnabled = stored.enabled !== false;
  await updateActionState();
}

async function updateActionState() {
  await chrome.action.setBadgeText({ text: extensionEnabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#5f6368" });
  await chrome.action.setTitle({
    title: `即時多語朗讀翻譯（${extensionEnabled ? "已開啟" : "已關閉"}）`
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_ONLINE") {
    return false;
  }

  if (!extensionEnabled) {
    sendResponse({ ok: false, error: "擴充功能目前已關閉。" });
    return false;
  }

  lookupGoogleTranslation(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error("[即時多語朗讀翻譯] 線上翻譯失敗：", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function lookupGoogleTranslation({
  text,
  sourceLanguage,
  targetLanguage
}) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText) {
    throw new Error("沒有可翻譯的文字。");
  }

  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error(`文字不可超過 ${MAX_TEXT_LENGTH} 個字元。`);
  }

  if (
    !ALLOWED_LANGUAGE_CODES.has(sourceLanguage) ||
    !ALLOWED_LANGUAGE_CODES.has(targetLanguage) ||
    targetLanguage === "auto"
  ) {
    throw new Error("不支援的語言組合。");
  }

  const params = new URLSearchParams();
  params.set("client", "gtx");
  params.set("sl", sourceLanguage);
  params.set("tl", targetLanguage);
  params.set("hl", targetLanguage);
  params.set("dj", "1");
  params.set("source", "input");
  params.set("q", cleanText);
  params.append("dt", "t");
  params.append("dt", "bd");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit"
      }
    );

    if (!response.ok) {
      throw new Error(`翻譯服務回傳 HTTP ${response.status}。`);
    }

    const data = await response.json();
    const parsed = parseTranslationResponse(data);

    if (!parsed.translation) {
      throw new Error("翻譯服務沒有回傳結果。");
    }

    return parsed;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("翻譯逾時，請檢查網路連線。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseTranslationResponse(data) {
  if (data && !Array.isArray(data) && typeof data === "object") {
    const sentences = Array.isArray(data.sentences) ? data.sentences : [];
    const translation = sentences
      .map((sentence) =>
        typeof sentence?.trans === "string" ? sentence.trans : ""
      )
      .filter(Boolean)
      .join("")
      .trim();

    return {
      translation,
      alternatives: parseStructuredDictionary(data.dict),
      detectedSourceLanguage:
        typeof data.src === "string" ? data.src : null
    };
  }

  if (Array.isArray(data)) {
    const segments = Array.isArray(data[0]) ? data[0] : [];
    const translation = segments
      .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
      .filter((value) => typeof value === "string" && value)
      .join("")
      .trim();

    return {
      translation,
      alternatives: parseLegacyDictionary(data[1]),
      detectedSourceLanguage:
        typeof data[2] === "string" ? data[2] : null
    };
  }

  return {
    translation: "",
    alternatives: [],
    detectedSourceLanguage: null
  };
}

function parseStructuredDictionary(dictionary) {
  if (!Array.isArray(dictionary)) {
    return [];
  }

  return dictionary
    .map((group) => {
      if (!group || typeof group !== "object") {
        return null;
      }

      const terms = [];

      if (Array.isArray(group.terms)) {
        terms.push(...group.terms);
      }

      if (Array.isArray(group.entry)) {
        for (const entry of group.entry) {
          if (typeof entry?.word === "string") {
            terms.push(entry.word);
          }
        }
      }

      const cleanTerms = uniqueStrings(terms).slice(0, 12);
      if (cleanTerms.length === 0) {
        return null;
      }

      return {
        partOfSpeech:
          typeof group.pos === "string" ? group.pos.trim() : "",
        terms: cleanTerms
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function parseLegacyDictionary(dictionary) {
  if (!Array.isArray(dictionary)) {
    return [];
  }

  return dictionary
    .map((group) => {
      if (!Array.isArray(group)) {
        return null;
      }

      const partOfSpeech =
        typeof group[0] === "string" ? group[0].trim() : "";
      const terms = Array.isArray(group[1]) ? group[1] : [];
      const cleanTerms = uniqueStrings(terms).slice(0, 12);

      if (cleanTerms.length === 0) {
        return null;
      }

      return {
        partOfSpeech,
        terms: cleanTerms
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (typeof value !== "string") continue;

    const cleanValue = value.replace(/\s+/g, " ").trim();
    const key = cleanValue.toLocaleLowerCase();

    if (!cleanValue || seen.has(key)) continue;

    seen.add(key);
    result.push(cleanValue);
  }

  return result;
}
