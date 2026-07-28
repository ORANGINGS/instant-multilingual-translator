(() => {
  "use strict";

  const MAX = 500;
  const HOST_ID = "__instant_multilingual_translate__";
  const LANGUAGES = [
    ["en", "英文", "en", "en-US"], ["es", "西班牙文", "es", "es-ES"],
    ["zh-TW", "中文（繁體）", "zh-Hant", "zh-TW"], ["zh-CN", "中文（簡體）", "zh-Hans", "zh-CN"],
    ["ja", "日文", "ja", "ja-JP"], ["ko", "韓文", "ko", "ko-KR"],
    ["fr", "法文", "fr", "fr-FR"], ["de", "德文", "de", "de-DE"],
    ["it", "義大利文", "it", "it-IT"], ["pt", "葡萄牙文", "pt", "pt-BR"],
    ["ru", "俄文", "ru", "ru-RU"], ["vi", "越南文", "vi", "vi-VN"],
    ["th", "泰文", "th", "th-TH"], ["id", "印尼文", "id", "id-ID"],
    ["tr", "土耳其文", "tr", "tr-TR"], ["ar", "阿拉伯文", "ar", "ar-SA"],
    ["hi", "印地文", "hi", "hi-IN"], ["nl", "荷蘭文", "nl", "nl-NL"],
    ["pl", "波蘭文", "pl", "pl-PL"], ["uk", "烏克蘭文", "uk", "uk-UA"],
    ["sv", "瑞典文", "sv", "sv-SE"]
  ].map(([code, label, local, speech]) => ({ code, label, local, speech }));
  const BY_CODE = new Map(LANGUAGES.map((item) => [item.code, item]));
  const POS = {
    adjective: "形容詞", adverb: "副詞", noun: "名詞", verb: "動詞",
    pronoun: "代名詞", preposition: "介系詞", conjunction: "連接詞",
    interjection: "感嘆詞", phrase: "片語", abbreviation: "縮寫",
    article: "冠詞", determiner: "限定詞", auxiliary: "助動詞",
    "auxiliary verb": "助動詞", adjetivo: "形容詞", adverbio: "副詞",
    sustantivo: "名詞", nombre: "名詞", verbo: "動詞", pronombre: "代名詞"
  };
  const DEFAULTS = {
    enabled: true, autoSpeak: true, speechRate: 0.9, onlineFallback: true,
    sourceLanguage: "auto", targetLanguage: "zh-TW", theme: "system"
  };

  let settings = { ...DEFAULTS };
  let host = null;
  let ui = null;
  let serial = 0;
  let current = null;
  let lastKey = "";
  let lastAt = 0;
  let detectorPromise = null;
  const translators = new Map();
  const darkMedia = matchMedia("(prefers-color-scheme: dark)");

  chrome.storage.sync.get(DEFAULTS).then((value) => settings = cleanSettings(value));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const key of Object.keys(DEFAULTS)) if (changes[key]) settings[key] = changes[key].newValue;
    settings = cleanSettings(settings);
    if (!settings.enabled) close();
    else if (host && current) handle(current);
  });
  darkMedia.addEventListener("change", () => { if (ui) ui.card.dataset.theme = theme(); });
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { close(); speechSynthesis?.cancel(); }
  }, true);
  addEventListener("scroll", close, true);
  addEventListener("resize", close);

  function cleanSettings(value) {
    return {
      enabled: Boolean(value.enabled), autoSpeak: Boolean(value.autoSpeak),
      onlineFallback: Boolean(value.onlineFallback),
      speechRate: clamp(Number(value.speechRate), 0.6, 1.4, 0.9),
      sourceLanguage: value.sourceLanguage === "auto" || BY_CODE.has(value.sourceLanguage) ? value.sourceLanguage : "auto",
      targetLanguage: BY_CODE.has(value.targetLanguage) ? value.targetLanguage : "zh-TW",
      theme: ["system", "light", "dark"].includes(value.theme) ? value.theme : "system"
    };
  }

  function onMouseUp(event) {
    if (!settings.enabled || event.button !== 0 || (host && event.composedPath().includes(host))) return;
    const selection = readSelection(event);
    if (!selection) { close(); return; }
    const key = selection.text.toLocaleLowerCase();
    const now = Date.now();
    if (key === lastKey && now - lastAt < 350) return;
    lastKey = key; lastAt = now; handle(selection);
  }

  function readSelection(event) {
    let text = "";
    let rect = null;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const { selectionStart: start, selectionEnd: end } = active;
      if (typeof start === "number" && typeof end === "number" && end > start) text = active.value.slice(start, end);
    } else {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
      text = selection.toString();
      try { rect = selection.getRangeAt(0).getBoundingClientRect(); } catch { rect = null; }
    }
    text = normalize(text);
    if (!text || text.length > MAX || !/[\p{L}\p{N}\u3400-\u9fff]/u.test(text)) return null;
    return { text, rect: rect && (rect.width || rect.height) ? rect : new DOMRect(event.clientX, event.clientY, 1, 1) };
  }

  function handle(selection) {
    current = selection;
    const id = ++serial;
    makePopup(selection);
    translate(selection.text, id);
  }

  async function translate(text, id) {
    setResult("正在辨識語言…", "loading");
    hideMeanings();
    let source = settings.sourceLanguage;
    if (source === "auto") source = await detect(text, id);
    if (id !== serial) return;
    source = BY_CODE.has(source) ? source : "en";
    updateSource(source, settings.sourceLanguage === "auto");
    if (settings.autoSpeak) speak(text, BY_CODE.get(source).speech);

    const target = settings.targetLanguage;
    if (source === target) {
      finish(text, BY_CODE.get(target).speech);
      status("來源與目標語言相同，未進行翻譯", "notice");
      return;
    }

    const dictionaryCandidate = text.length <= 100 && text.split(/\s+/).length <= 8;
    const onlinePromise = settings.onlineFallback && dictionaryCandidate ? online(text, settings.sourceLanguage === "auto" ? "auto" : source, target) : null;
    if (onlinePromise) meaningsLoading();

    let localText = "";
    try {
      setResult("正在使用 Chrome 本機翻譯…", "loading");
      localText = await localTranslate(text, source, target, (loaded) => {
        if (id === serial) setResult(`首次使用：下載本機模型 ${Math.round(clamp(loaded, 0, 1, 0) * 100)}%`, "loading");
      });
      if (id !== serial) return;
      finish(localText, BY_CODE.get(target).speech);
      status(onlinePromise ? "本機翻譯完成｜正在查詢多義詞" : "Chrome 本機翻譯｜文字不會上傳", onlinePromise ? "notice" : "success");
    } catch (error) {
      console.info("[即時多語朗讀翻譯] 本機翻譯不可用", error);
    }

    if (!localText) {
      if (!settings.onlineFallback) {
        setResult("本機翻譯目前不可用，請開啟「線上多義詞與備援」。", "error");
        status("翻譯失敗", "error"); hideMeanings(); return;
      }
      setResult("正在改用線上翻譯…", "loading");
      status("選取文字將傳送至線上翻譯服務", "notice");
      try {
        const details = onlinePromise ? await onlinePromise : await online(text, settings.sourceLanguage === "auto" ? "auto" : source, target);
        if (id !== serial) return;
        finish(details.translation, BY_CODE.get(target).speech);
        const count = renderMeanings(details.alternatives, details.translation);
        status(count ? "線上翻譯＋其他常見意思" : "線上翻譯", "notice");
      } catch (error) {
        if (id !== serial) return;
        setResult(error instanceof Error ? error.message : "翻譯失敗，請稍後再試。", "error");
        status("翻譯失敗", "error"); hideMeanings();
      }
      return;
    }

    if (onlinePromise) {
      try {
        const details = await onlinePromise;
        if (id !== serial) return;
        if (details.translation) finish(details.translation, BY_CODE.get(target).speech, false);
        const count = renderMeanings(details.alternatives, details.translation || localText);
        status(count ? "Chrome 本機翻譯＋線上多義詞" : "Chrome 本機翻譯｜沒有查到其他意思", count ? "notice" : "success");
      } catch {
        if (id === serial) { hideMeanings(); status("Chrome 本機翻譯｜多義詞查詢失敗", "notice"); }
      }
    }
  }

  async function detect(text, id) {
    const script = detectScript(text);
    if (script && !["en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "tr"].includes(script)) return script;
    if ("LanguageDetector" in globalThis) {
      try {
        if (!detectorPromise) detectorPromise = Promise.resolve(globalThis.LanguageDetector.create({
          monitor(monitor) { monitor.addEventListener("downloadprogress", (e) => { if (id === serial) status(`首次使用：下載語言辨識模型 ${Math.round((Number(e.loaded) || 0) * 100)}%`, "notice"); }); }
        })).catch((error) => { detectorPromise = null; throw error; });
        const detector = await detectorPromise;
        const results = await detector.detect(text);
        for (const result of Array.isArray(results) ? results : []) {
          const code = normalizeCode(result.detectedLanguage || result.language || result.lang, text);
          if (code && (Number(result.confidence || 0) >= 0.2 || text.length >= 8)) return code;
        }
      } catch { /* fall through */ }
    }
    try {
      const result = await online(text, "auto", settings.targetLanguage === "en" ? "zh-TW" : "en");
      return normalizeCode(result.detectedSourceLanguage, text) || script || "en";
    } catch { return script || "en"; }
  }

  function detectScript(text) {
    if (/[\u3040-\u30ff]/u.test(text)) return "ja";
    if (/[\uac00-\ud7af]/u.test(text)) return "ko";
    if (/[\u0e00-\u0e7f]/u.test(text)) return "th";
    if (/[\u0600-\u06ff]/u.test(text)) return "ar";
    if (/[\u0900-\u097f]/u.test(text)) return "hi";
    if (/[\u0400-\u04ff]/u.test(text)) return "ru";
    if (/[\u3400-\u9fff]/u.test(text)) return /[體學會國語臺灣龍門關]/u.test(text) ? "zh-TW" : "zh-CN";
    return null;
  }

  function normalizeCode(raw, text = "") {
    if (typeof raw !== "string") return detectScript(text);
    const code = raw.trim().replace(/_/g, "-").toLowerCase();
    if (code.includes("hant") || code === "zh-tw") return "zh-TW";
    if (code.includes("hans") || code === "zh-cn") return "zh-CN";
    if (code === "zh") return detectScript(text) || "zh-TW";
    const base = code.split("-")[0];
    return BY_CODE.has(base) ? base : null;
  }

  async function localTranslate(text, source, target, onProgress) {
    if (!("Translator" in globalThis)) throw new Error("Translator API unavailable");
    const from = BY_CODE.get(source).local;
    const to = BY_CODE.get(target).local;
    const key = `${from}>${to}`;
    if (!translators.has(key)) {
      const promise = Promise.resolve(globalThis.Translator.create({ sourceLanguage: from, targetLanguage: to,
        monitor(monitor) { monitor.addEventListener("downloadprogress", (e) => onProgress?.(Number(e.loaded) || 0)); }
      })).catch((error) => { translators.delete(key); throw error; });
      translators.set(key, promise);
    }
    const translator = await translators.get(key);
    const result = normalize(await translator.translate(text));
    if (!result) throw new Error("本機翻譯沒有回傳內容。");
    return result;
  }

  function online(text, sourceLanguage, targetLanguage) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({
      type: "TRANSLATE_ONLINE", text, sourceLanguage, targetLanguage
    }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response?.ok) return reject(new Error(response?.error || "線上翻譯失敗。"));
      resolve({
        translation: normalize(response.translation),
        alternatives: Array.isArray(response.alternatives) ? response.alternatives : [],
        detectedSourceLanguage: response.detectedSourceLanguage || null
      });
    }));
  }

  function makePopup({ text, rect }) {
    close(false);
    const root = document.createElement("div");
    root.id = HOST_ID;
    Object.assign(root.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", visibility: "hidden", pointerEvents: "auto" });
    const shadow = root.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    const card = el("div", "card");
    card.dataset.theme = theme();
    card.setAttribute("role", "dialog");

    const header = el("div", "header");
    const sourceSelect = languageSelect(true, settings.sourceLanguage, "來源語言");
    const arrow = el("span", "arrow", "→");
    const targetSelect = languageSelect(false, settings.targetLanguage, "目標語言");
    const closeButton = iconButton("關閉", closeIcon());
    closeButton.onclick = (event) => { event.stopPropagation(); close(); };
    sourceSelect.onchange = () => chrome.storage.sync.set({ sourceLanguage: sourceSelect.value });
    targetSelect.onchange = () => chrome.storage.sync.set({ targetLanguage: targetSelect.value });
    header.append(sourceSelect, arrow, targetSelect, closeButton);

    const sourceSection = el("div", "section source-section");
    const sourceLabel = el("div", "label", settings.sourceLanguage === "auto" ? "自動偵測來源語言" : BY_CODE.get(settings.sourceLanguage).label);
    const sourceRow = el("div", "row");
    const sourceSpeak = iconButton("播放原文", speakerIcon());
    sourceSpeak.onclick = (event) => { event.stopPropagation(); speak(text, BY_CODE.get(settings.sourceLanguage === "auto" ? "en" : settings.sourceLanguage).speech); };
    sourceRow.append(sourceSpeak, el("div", "text", text));
    sourceSection.append(sourceLabel, sourceRow);

    const targetSection = el("div", "section target-section");
    const targetLabel = el("div", "label", BY_CODE.get(settings.targetLanguage).label);
    const targetRow = el("div", "row");
    const targetSpeak = iconButton("播放翻譯", speakerIcon());
    targetSpeak.disabled = true;
    const targetText = el("div", "text loading", "正在翻譯…");
    targetRow.append(targetSpeak, targetText);
    const meanings = el("div", "meanings"); meanings.hidden = true;
    targetSection.append(targetLabel, targetRow, meanings);

    const footer = el("div", "footer");
    const statusEl = el("span", "status", "正在準備翻譯…");
    const copy = el("button", "copy", "複製翻譯"); copy.type = "button"; copy.disabled = true;
    footer.append(statusEl, copy);
    card.append(header, sourceSection, el("div", "divider"), targetSection, footer);
    shadow.append(style, card);
    document.documentElement.appendChild(root);
    host = root;
    ui = { card, sourceLabel, sourceSpeak, targetLabel, targetSpeak, targetText, meanings, status: statusEl, copy };
    position(root, card, rect);
  }

  function languageSelect(includeAuto, value, label) {
    const select = document.createElement("select");
    select.className = "language-select"; select.title = label; select.setAttribute("aria-label", label);
    if (includeAuto) select.append(new Option("自動偵測", "auto"));
    for (const language of LANGUAGES) select.append(new Option(language.label, language.code));
    select.value = value;
    return select;
  }

  function updateSource(code, auto) {
    if (!ui) return;
    const language = BY_CODE.get(code);
    ui.sourceLabel.textContent = auto ? `${language.label}（自動偵測）` : language.label;
    ui.sourceSpeak.title = `播放${language.label}`;
    ui.sourceSpeak.onclick = (event) => { event.stopPropagation(); if (current) speak(current.text, language.speech); };
  }

  function finish(text, speech, allowAuto = true) {
    if (!ui) return;
    ui.targetText.textContent = text;
    ui.targetText.className = "text";
    ui.targetSpeak.disabled = false;
    ui.targetSpeak.onclick = (event) => { event.stopPropagation(); speak(text, speech); };
    ui.copy.disabled = false;
    ui.copy.onclick = async (event) => {
      event.stopPropagation();
      try { await navigator.clipboard.writeText(text); const old = ui.copy.textContent; ui.copy.textContent = "已複製"; setTimeout(() => { if (ui) ui.copy.textContent = old; }, 900); }
      catch { status("無法複製，請手動選取文字", "error"); }
    };
    if (allowAuto && settings.autoSpeak && settings.sourceLanguage !== "auto" && settings.sourceLanguage === settings.targetLanguage) speak(text, speech);
    reposition();
  }

  function renderMeanings(groups, primary) {
    if (!ui || !Array.isArray(groups) || !groups.length) { hideMeanings(); return 0; }
    const seen = new Set(normalize(primary).split(/[、,，;；/／\n]+/).map((x) => x.trim().toLocaleLowerCase()).filter(Boolean));
    ui.meanings.replaceChildren(el("div", "meanings-title", "其他常見意思"));
    let count = 0;
    for (const group of groups.slice(0, 6)) {
      const terms = [];
      for (const term of Array.isArray(group?.terms) ? group.terms : []) {
        const clean = normalize(term), key = clean.toLocaleLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key); terms.push(clean); if (terms.length >= 10) break;
      }
      if (!terms.length) continue;
      const row = el("div", "sense-row");
      row.append(el("span", "pos", POS[normalize(group.partOfSpeech).toLocaleLowerCase()] || group.partOfSpeech || "其他"), el("span", "terms", terms.join("、")));
      ui.meanings.append(row); count += terms.length;
    }
    ui.meanings.hidden = count === 0; reposition(); return count;
  }

  function meaningsLoading() { if (!ui) return; ui.meanings.replaceChildren(el("div", "meanings-loading", "正在查詢其他常見意思…")); ui.meanings.hidden = false; reposition(); }
  function hideMeanings() { if (!ui) return; ui.meanings.replaceChildren(); ui.meanings.hidden = true; reposition(); }
  function setResult(message, state) { if (!ui) return; ui.targetText.textContent = message; ui.targetText.className = `text ${state}`; ui.targetSpeak.disabled = true; ui.copy.disabled = true; reposition(); }
  function status(message, state = "") { if (!ui) return; ui.status.textContent = message; ui.status.className = `status ${state}`; }

  function position(root, card, rect) {
    requestAnimationFrame(() => {
      if (!root.isConnected) return;
      const box = card.getBoundingClientRect(), margin = 8, gap = 9;
      let left = rect.left, top = rect.bottom + gap;
      if (top + box.height > innerHeight - margin) top = rect.top - box.height - gap;
      left = Math.max(margin, Math.min(left, innerWidth - box.width - margin));
      top = Math.max(margin, Math.min(top, innerHeight - box.height - margin));
      root.style.left = `${Math.round(left)}px`; root.style.top = `${Math.round(top)}px`; root.style.visibility = "visible";
    });
  }
  function reposition() { if (host && ui && current) position(host, ui.card, current.rect); }
  function close(invalidate = true) { if (invalidate) { serial++; current = null; } host?.remove(); host = null; ui = null; }
  function theme() { return settings.theme === "system" ? (darkMedia.matches ? "dark" : "light") : settings.theme; }
  function normalize(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function clamp(value, min, max, fallback) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
  function el(tag, className = "", text = "") { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
  function iconButton(label, svg) { const button = el("button", "icon-button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label); button.innerHTML = svg; return button; }
  function speakerIcon() { return '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm11.5 3A3.5 3.5 0 0 0 13 9.13v5.74A3.5 3.5 0 0 0 14.5 12zM13 4.8v2.06a6 6 0 0 1 0 10.28v2.06a8 8 0 0 0 0-14.4z"/></svg>'; }
  function closeIcon() { return '<svg viewBox="0 0 24 24"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4l-6.3 6.31-1.42-1.42L9.17 12l-6.3-6.29 1.42-1.42 6.3 6.31 6.3-6.31z"/></svg>'; }

  function speak(text, language) {
    text = normalize(text); if (!text || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language; utterance.rate = settings.speechRate;
    const prefix = language.toLowerCase().split("-")[0];
    const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
    utterance.voice = voices.find((voice) => /google|microsoft/i.test(voice.name)) || voices[0] || null;
    setTimeout(() => speechSynthesis.speak(utterance), 0);
  }

  const CSS = `
    :host{all:initial}*{box-sizing:border-box}.card{--s:#fff;--h:#f1f3f4;--t:#202124;--m:#80868b;--b:#dadce0;--d:#edf0f2;--a:#1a73e8;--ok:#137333;--e:#b3261e;width:min(410px,calc(100vw - 16px));max-height:min(560px,calc(100vh - 16px));overflow:auto;border:1px solid var(--b);border-radius:9px;background:var(--s);color:var(--t);box-shadow:0 2px 6px #3c40432e,0 8px 24px #3c404324;font:14px/1.45 Arial,"Noto Sans TC","Microsoft JhengHei",sans-serif;color-scheme:light}.card[data-theme=dark]{--s:#202124;--h:#303134;--t:#e8eaed;--m:#9aa0a6;--b:#5f6368;--d:#3c4043;--a:#8ab4f8;--ok:#81c995;--e:#f28b82;box-shadow:0 3px 10px #0009,0 14px 32px #0007;color-scheme:dark}.header{display:flex;align-items:center;gap:7px;min-height:51px;padding:8px;border-bottom:1px solid var(--d)}.language-select{min-width:0;height:33px;flex:1;padding:0 26px 0 9px;border:1px solid var(--b);border-radius:4px;background:var(--s);color:var(--t);font:inherit;cursor:pointer}.arrow{color:var(--m);font-size:16px}.icon-button{display:inline-grid;place-items:center;width:32px;height:32px;flex:0 0 auto;padding:0;border:0;border-radius:50%;background:transparent;color:var(--m);cursor:pointer}.icon-button:hover,.copy:hover:not(:disabled){background:var(--h);color:var(--t)}.icon-button:disabled{opacity:.45;cursor:wait}.icon-button svg{width:20px;height:20px;fill:currentColor}.section{padding:11px 12px}.source-section{padding-bottom:7px}.target-section{padding-top:6px}.label{margin:0 0 5px 38px;color:var(--m);font-size:12px}.row{display:flex;align-items:flex-start;gap:6px}.text{flex:1;min-width:0;padding:5px 2px 3px 0;overflow-wrap:anywhere;white-space:pre-wrap;font-size:17px}.text.loading{color:var(--m);font-size:14px}.text.error{color:var(--e);font-size:14px}.divider{height:1px;margin:0 12px;background:var(--d)}.meanings{margin:10px 0 1px 38px;padding-top:9px;border-top:1px solid var(--d)}.meanings-title{margin-bottom:7px;color:var(--m);font-size:12px;font-weight:600}.meanings-loading{color:var(--m);font-size:12px}.sense-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:7px;margin:5px 0}.pos{color:var(--m);font-size:12px;white-space:nowrap}.terms{color:var(--t);font-size:14px;overflow-wrap:anywhere}.footer{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:39px;padding:5px 10px 5px 12px;border-top:1px solid var(--d);color:var(--m);font-size:11px}.status.success{color:var(--ok)}.status.error{color:var(--e)}.copy{min-height:27px;padding:3px 9px;border:0;border-radius:4px;background:transparent;color:var(--a);font:12px inherit;cursor:pointer}.copy:disabled{color:var(--m);opacity:.7;cursor:default}`;
})();
