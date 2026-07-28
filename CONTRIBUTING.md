# Contributing

歡迎提交 Issue 或 Pull Request。

## 開發流程

1. Fork repository。
2. 建立功能分支。
3. 修改程式碼。
4. 執行 JavaScript 語法檢查。
5. 在桌面版 Chrome 138 以上載入未封裝項目進行測試。
6. 提交 Pull Request，說明功能、測試方式與可能的隱私影響。

## 程式碼原則

- 不將 API Key、Token 或帳號資訊提交至 Git。
- 使用 `textContent` 處理外部文字，避免插入不可信 HTML。
- 新增語言時，同步更新 `content.js` 與 `popup.js` 的語言資料。
- 新增外部服務時，需更新 README 與 PRIVACY。
