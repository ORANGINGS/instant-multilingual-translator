<p align="center">
  <img src="icons/icon128.png" width="128" alt="即時多語朗讀翻譯圖示">
</p>

<h1 align="center">即時多語朗讀翻譯</h1>

<p align="center">
  <strong>Instant Multilingual Translator</strong><br>
  雙擊或反白網頁文字後，立即辨識語言、朗讀原文並顯示翻譯與常見詞義。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.4.0-1a73e8">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-137333">
  <img alt="Status" src="https://img.shields.io/badge/status-Beta-f9ab00">
</p>

## 專案介紹

這是一款為語言學習與快速閱讀設計的 Chrome 擴充功能。使用者只要雙擊單字，或拖曳選取片語與句子，就能在原文字旁開啟翻譯卡片，同時播放發音、查看主要翻譯及其他常見意思。

擴充功能預設會自動辨識來源語言，也能固定使用英文、西班牙文、日文等語言，並自由選擇翻譯目標語言。介面支援淺色、深色與跟隨系統模式，且不需要購買 API Key。

## 主要功能

- **一鍵開關**：從工具列設定視窗快速開啟或關閉擴充功能；關閉時停止偵測、朗讀與翻譯請求。
- **反白即用**：雙擊單字或拖曳選取片語、句子後自動啟動。
- **即時朗讀**：依來源語言選擇相符的系統語音並播放原文。
- **英文重音強調**：單一英文單字先正常播放，再以慢速與略高音調重播，方便辨識語音引擎的自然重音。
- **多語言辨識**：預設自動偵測，也可手動指定來源語言。
- **自訂翻譯方向**：自行選擇要翻譯成繁中、英文、西班牙文或其他語言。
- **多義詞與詞性**：除了主要翻譯，也顯示其他常見意思並依詞性分類。
- **雙向播放**：原文與譯文各有獨立的播放按鈕。
- **深色模式**：支援跟隨系統、淺色與深色三種外觀。
- **免 API Key**：優先使用 Chrome 內建 AI；必要時使用線上備援。
- **設定同步**：來源語言、目標語言、語速、重音模式與外觀會透過 Chrome Storage 保存。

## 英文重音強調模式

開啟後，單一英文單字會依序播放：

```text
正常語速播放
      ↓ 短暫停頓
較慢語速＋略高音調重播
```

例如 `execution`、`inferred` 或 `unforeseen`，第二次播放會讓原本的自然重音更容易被聽見。片語、完整句子及非英文內容仍只播放一次，避免造成干擾。

Web Speech API 的語速與音調控制是作用於整個朗讀片段，不能直接指定單一音節的重音。因此此模式是用正常與慢速重播協助辨識自然重音，而不是自行改寫字典重音。

## 支援語言

設定選單目前包含：

- 英文、西班牙文
- 繁體中文、簡體中文
- 日文、韓文
- 法文、德文、義大利文、葡萄牙文
- 俄文、烏克蘭文、波蘭文、瑞典文、荷蘭文
- 越南文、泰文、印尼文、土耳其文
- 阿拉伯文、印地文

Chrome 本機翻譯是否可用，取決於 Chrome 版本、作業系統及指定語言組合是否有可下載的語言模型。本機功能不可用時，可由線上備援完成翻譯。

## 翻譯與朗讀流程

```text
選取網頁文字
      ↓
自動辨識或使用指定來源語言
      ↓
播放來源語言發音
      ↓
Chrome 本機 Translator API
      ↓ 失敗或需要查詢多義詞
Google 非正式翻譯端點
      ↓
顯示翻譯、詞性、其他意思與播放按鈕
```

朗讀採用瀏覽器的 Web Speech API。實際可用的聲音及自然程度，取決於 Chrome、Windows 或作業系統已安裝的語音。

## 安裝方式

### 方法一：下載原始碼

1. 在 GitHub 點擊 **Code → Download ZIP**。
2. 解壓縮下載的檔案。
3. 在 Chrome 網址列輸入 `chrome://extensions`。
4. 開啟右上角的「開發人員模式」。
5. 點擊「載入未封裝項目」。
6. 選擇包含 `manifest.json` 的專案資料夾。
7. 重新整理原本已開啟的網頁。

### 方法二：使用 Git

```bash
git clone https://github.com/ORANGINGS/instant-multilingual-translator.git
```

接著依照上面的 Chrome 載入步驟安裝。

## 使用方式

1. 雙擊英文單字，例如 `weaken`。
2. 或拖曳反白西班牙文、日文及其他語言文字。
3. 原文會依設定自動朗讀，旁邊同時出現翻譯視窗。
4. 可直接在浮動視窗上方修改來源與目標語言。
5. 按 `Esc`、捲動頁面或點擊其他區域即可關閉視窗。

## 可調整設定

點擊 Chrome 工具列上的擴充功能圖示，可設定：

- 開啟／關閉擴充功能；關閉時工具列圖示會顯示 `OFF`
- 預設來源語言：自動偵測或指定語言
- 翻譯目標語言
- 自動播放原文
- 英文重音強調模式
- 線上多義詞與備援
- 外觀：跟隨系統、淺色、深色
- 朗讀速度

## 隱私說明

- Chrome 本機語言辨識與翻譯會在裝置端執行，選取文字不必傳送至外部服務。
- 啟用「線上多義詞與備援」時，短單字或片語會傳送至 Google 翻譯服務，以取得翻譯及多個常見意思。
- 本機翻譯失敗且線上備援已開啟時，選取文字也會傳送至該服務完成翻譯。
- 本專案不收集帳號、密碼、完整瀏覽紀錄或付款資料。

詳細內容請參閱 [`PRIVACY.md`](PRIVACY.md)。

## 已知限制

- `translate.googleapis.com/translate_a/single` 是非正式公開端點，Google 未保證其長期穩定性。
- 很短的單字可能無法準確自動辨識語言，可改為手動指定來源語言。
- 不同電腦安裝的語音不同，部分語言可能缺少自然的朗讀聲音。
- 重音模式依賴系統 TTS 的自然重音，不能直接重新指定某個音節的字典重音。
- Chrome 內部頁面、Chrome 線上應用程式商店及部分受限頁面不允許內容腳本執行。
- Chrome 內建 Language Detector API 與 Translator API 主要適用於桌面版 Chrome 138 以上。
- 單次選取上限為 500 個字元，避免誤選整頁文字。

## 專案結構

```text
instant-multilingual-translator/
├─ .github/ISSUE_TEMPLATE/
├─ icons/
│  ├─ icon16.png
│  ├─ icon32.png
│  ├─ icon48.png
│  └─ icon128.png
├─ background.js
├─ context-guard.js
├─ speech-stabilizer.js
├─ stress-mode.js
├─ stress-settings.js
├─ content.js
├─ popup.html
├─ popup.css
├─ popup.js
├─ manifest.json
├─ CHANGELOG.md
├─ CONTRIBUTING.md
├─ PRIVACY.md
├─ README.md
└─ LICENSE
```

## 開發與檢查

本專案使用原生 HTML、CSS 與 JavaScript，不需要建置工具或 npm 套件。修改後可執行：

```bash
node --check background.js
node --check context-guard.js
node --check speech-stabilizer.js
node --check stress-mode.js
node --check stress-settings.js
node --check content.js
node --check popup.js
```

接著在 `chrome://extensions` 點擊擴充功能卡片上的「重新載入」。

## Roadmap

- [ ] 單字收藏與複習清單
- [ ] IPA 音標與例句
- [ ] 鍵盤快捷鍵
- [ ] 自訂翻譯服務或正式 API Key
- [ ] 發布至 Chrome Web Store

## 專案狀態

目前版本為 **1.4.0 Beta**。歡迎透過 Issue 回報錯誤或提出功能建議。

## License

本專案採用 [MIT License](LICENSE)。
