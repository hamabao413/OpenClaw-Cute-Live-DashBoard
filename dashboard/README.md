# OpenClaw 主代理 Live Dashboard（獨立網頁）

此 Dashboard 會在本機啟動一個輕量 HTTP Server，並以 **OpenClaw 的 log 檔**作為資料來源：
- 即時 tail log（不依賴任何第三方 Python 套件）
- 以規則式狀態機判斷：idle / working / queued / rate_limited / misconfigured / warning
- 在網頁上以「辦公室 + 小人」方式 Live 顯示

## 1) 啟動方式（Windows）
1. 確認已安裝 Python 3.10+（建議 3.11/3.12）
2. 直接雙擊：`run_dashboard.bat`
3. 瀏覽器打開：`http://127.0.0.1:8787/`

## 2) 設定 OpenClaw log 路徑
進入網頁右上角 **Settings**：
- `OpenClaw log 路徑` 可填「檔案」或「資料夾」
  - 若填資料夾：會自動選擇該資料夾中「最新修改」的 *.log（或 *.txt）
- 按 **儲存** 後寫入本專案的 `config.json`
- 若你改了 Host/Port，請重啟 `run_dashboard.bat`

### 常見路徑提示
OpenClaw 通常會在 `C:\Users\<你的帳號>\.openclaw\` 底下。
你可以先找找是否有 `logs\*.log`，或你執行 OpenClaw 時是否有把輸出導到某個 log 檔。

## 3) 狀態判斷規則（可擴充）
`server.py` 內的 `classify_line()` 以關鍵字判斷：
- No API key found -> misconfigured
- HTTP 429 / Too Many Requests / weekly usage limit -> rate_limited
- lane wait exceeded / queueAhead -> queued
- timed out / embedded run timeout -> timeout
- [tools] exec failed -> tool_error
- [agent/embedded] / LLM request -> working

你可依自己的 log 特徵新增規則。

## 4) 安全
本 Server 只綁定 `127.0.0.1`（預設），僅本機可存取。
若你要讓同網段其他設備存取，請把 config.json 的 host 改成 `0.0.0.0`，並自行評估風險。
