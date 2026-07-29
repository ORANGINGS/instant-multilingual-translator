"use strict";

const MAX_TEXT_LENGTH = 500;
const DICTIONARY_MAX_LENGTH = 100;
const DICTIONARY_MAX_WORDS = 8;
const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const ALLOWED_LANGUAGE_CODES = new Set([
  "auto", "en", "es", "zh-TW", "zh-CN", "ja", "ko", "fr", "de",
  "it", "pt", "ru", "vi", "th", "id", "tr", "ar", "hi", "nl",
  "pl", "uk", "sv"
]);

let extensionEnabled = true;

chrome.runtime.onInstalled.addListener(() => syncEnabledState());
chrome.runtime.onStartup.addListener(() => syncEnabledState());
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.enabled) return;
  extensionEnabled = changes.enabled.newValue !== false;
  updateActionState().catch(console.error);
});

syncEnabledState().catch(console.error);

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
  if (message?.type !== "TRANSLATE_ONLINE") return false;

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

async function lookupGoogleTranslation({ text, sourceLanguage, targetLanguage }) {
  const cleanText = typeof text === "string" ? text.trim() : "";
  validateRequest(cleanText, sourceLanguage, targetLanguage);

  // Primary translation uses the simpler legacy response. It is more stable than
  // relying on the optional dictionary response to contain the translated text.
  const primaryParams = buildBaseParams(cleanText, sourceLanguage, targetLanguage);
  primaryParams.append("dt", "t");

  const primaryData = await fetchTranslationJson(primaryParams, 10000);
  const primary = parseTranslationResponse(primaryData);

  if (!primary.translation) {
    throw new Error("翻譯服務回傳空白結果，請重新整理頁面後再試。");
  }

  const result = {
    translation: primary.translation,
    alternatives: primary.alternatives,
    detectedSourceLanguage: primary.detectedSourceLanguage
  };

  // Dictionary data is optional. A dictionary failure must never erase an
  // already successful primary translation.
  if (isDictionaryCandidate(cleanText)) {
    try {
      const dictionaryParams = buildBaseParams(cleanText, sourceLanguage, targetLanguage);
      dictionaryParams.set("dj", "1");
      dictionaryParams.append("dt", "t");
      dictionaryParams.append("dt", "bd");

      const dictionaryData = await fetchTranslationJson(dictionaryParams, 7000);
      const dictionary = parseTranslationResponse(dictionaryData);

      if (dictionary.alternatives.length > 0) {
        result.alternatives = dictionary.alternatives;
      }
      if (!result.detectedSourceLanguage && dictionary.detectedSourceLanguage) {
        result.detectedSourceLanguage = dictionary.detectedSourceLanguage;
      }
    } catch (error) {
      console.info("[即時多語朗讀翻譯] 多義詞查詢失敗，保留主要翻譯：", error);
    }
  }

  return result;
}

function validateRequest(text, sourceLanguage, targetLanguage) {
  if (!text) throw new Error("沒有可翻譯的文字。");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`文字不可超過 ${MAX_TEXT_LENGTH} 個字元。`);
  }
  if (
    !ALLOWED_LANGUAGE_CODES.has(sourceLanguage) ||
    !ALLOWED_LANGUAGE_CODES.has(targetLanguage) ||
    targetLanguage === "auto"
  ) {
    throw new Error("不支援的語言組合。");
  }
}

function buildBaseParams(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams();
  params.set("client", "gtx");
  params.set("sl", sourceLanguage);
  params.set("tl", targetLanguage);
  params.set("hl", targetLanguage);
  params.set("ie", "UTF-8");
  params.set("oe", "UTF-8");
  params.set("source", "input");
  params.set("q", text);
  return params;
}

async function fetchTranslationJson(params, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${TRANSLATE_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) {
      throw new Error("http");
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("翻譯逾時，請檢查網路連線。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isDictionaryCandidate(text) {
  return text.length <= DICTIONARY_MAX_LENGTH &&
    text.split(/\s+/).filter(Boolean).length <= DICTIONARY_MAX_WORDS;
}

function parseTranslationResponse(data) {
  if (data && !Array.isArray(data) && typeof data === "object") {
    const sentences = Array.isArray(data.sentences) ? data.sentences : [];
    const sentenceTranslation = sentences
      .map((sentence) => typeof sentence?.trans === "string" ? sentence.trans : "")
      .filter(Boolean)
      .join("")
      .trim();

    const directTranslation = firstNonEmptyString([
      sentenceTranslation,
      data.translation,
      data.translatedText,
      data.trans
    ]);

    return {
      translation: directTranslation,
      alternatives: parseStructuredDictionary(data.dict),
      detectedSourceLanguage: firstNonEmptyString([
        data.src,
        data.sourceLanguage,
        data.detectedSourceLanguage
      ]) || null
    };
  }

  if (Array.isArray(data)) {
    const segments = Array.isArray(data[0]) ? data[0] : [];
    const translation = segments
      .map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")
      .filter(Boolean)
      .join("")
      .trim();

    return {
      translation,
      alternatives: parseLegacyDictionary(data[1]),
      detectedSourceLanguage: typeof data[2] === "string" ? data[2].trim() || null : null
    };
  }

  return { translation: "", alternatives: [], detectedSourceLanguage: null };
}

function parseStructuredDictionary(dictionary) {
  if (!Array.isArray(dictionary)) return [];

  return dictionary
    .map((group) => {
      if (!group || typeof group !== "object") return null;
      const terms = [];
      if (Array.isArray(group.terms)) terms.push(...group.terms);
      if (Array.isArray(group.entry)) {
        for (const entry of group.entry) {
          if (typeof entry?.word === "string") terms.push(entry.word);
        }
      }

      const cleanTerms = uniqueStrings(terms).slice(0, 12);
      if (cleanTerms.length === 0) return null;
      return {
        partOfSpeech: typeof group.pos === "string" ? group.pos.trim() : "",
        terms: cleanTerms
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function parseLegacyDictionary(dictionary) {
  if (!Array.isArray(dictionary)) return [];

  return dictionary
    .map((group) => {
      if (!Array.isArray(group)) return null;
      const partOfSpeech = typeof group[0] === "string" ? group[0].trim() : "";
      const terms = Array.isArray(group[1]) ? group[1] : [];
      const cleanTerms = uniqueStrings(terms).slice(0, 12);
      return cleanTerms.length > 0 ? { partOfSpeech, terms: cleanTerms } : null;
    })
    .filter(Boolean)
    .slice(0, 6);
}

function firstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (clean) return clean;
  }
  return "";
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
