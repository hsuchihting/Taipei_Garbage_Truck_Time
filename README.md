# 臺北垃圾車時間查詢

第一階段 MVP：依時間、行政區、里別查詢臺北市垃圾車**預定清運時間與停靠地點**。

網站：https://hsuchihting.github.io/Taipei_Garbage_Truck_Time/

## 功能

- 預設 18:30–21:00，可自訂時間；含起訖邊界，依抵達時間由早到晚排序。
- 行政區、里別由官方資料產生；更換行政區會清除原里別。兩者皆可不選。
- 卡片顯示抵達／離開時間、地點、行政區、里別、路線、車次、車號及分隊。
- Google Maps 連結使用該筆緯度、經度；缺少有效座標時不產生錯誤定位。
- 載入、無結果、連線失敗與重新載入狀態；手機、平板與桌機版面。

使用 HTML、CSS、原生 JavaScript 與 Fetch API，無前端框架或第三方執行期依賴。

## 官方資料與跨網域限制

來源：臺北市資料大平臺「臺北市垃圾車點位路線資訊」。

`https://data.taipei/api/v1/dataset/a6e90031-7ec4-4089-afb5-361a4efe7202?scope=resourceAquire`

API 以 `count`、`offset` 和實際回傳筆數逐頁取得全部資料，檢查重複 ID、缺頁及筆數異動，避免把不完整資料當成成功。

2026-09-29 驗證 API 的 `Access-Control-Allow-Origin` 為 `https://data.taipei`，無法由 GitHub Pages 網域直接讀取。因此採最小部署相容處理：

1. 網頁初始化先嘗試完整官方 API。
2. 若受 CORS／連線限制，改讀同網站 `data/stops.json`。此檔由部署流程分頁取得官方資料產生，非手工或示範資料。
3. 網頁顯示快照來源與擷取時間；超過 48 小時加註資料較舊。
4. 載入後保留於記憶體，查詢與切換選單不再次呼叫 API。

GitHub Actions 在推送 `main`、手動執行及每日 UTC 22:17（臺北時間隔日 06:17）重新抓取並部署。排程可能延遲；公開儲存庫長期無活動時，GitHub 可能停用排程。資料取得失敗會中止部署，保留上一個成功版本，不發布空資料。兩種來源皆無法載入時顯示重試介面。

資料授權：政府資料開放授權條款第 1 版；程式碼授權見 LICENSE。

## 本機執行

需要 Node.js 22.8 以上，不需安裝套件。

```sh
npm test
npm run build
npm start
```

開啟 http://127.0.0.1:4173 。Build 需要連線至市府 API；`dist/` 是產出的部署資料夾。

## 部署

GitHub Settings → Pages → Source 設為 **GitHub Actions**。工作流程位於 `.github/workflows/pages.yml`；僅發布 `dist/`，測試通過且完整官方資料取得成功後才部署。不需要 API key 或私人憑證。

## 驗證

`npm test` 涵蓋時間格式與邊界、選用篩選、排序、里別來源、地圖座標、完整分頁、重複／中斷頁面及資料備援。另於瀏覽器確認官方資料查詢與 375px 版面。

僅包含第一階段；未包含即時 GPS 追蹤、附近距離排序、倒數或收藏。
