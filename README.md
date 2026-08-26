# 極簡待辦（daily-todo）

單人使用的重複待辦 PWA。零框架、零建置步驟，直接放上 GitHub Pages，從 iPhone 主畫面以 standalone 開啟。

> 本 repo 是 `daily-tick` 的**純 todo 分支**：同一套任務功能，沒有遊戲層。
> 資料格式（schema v3）與 gist 備份檔（`todo-backup.json`）與 daily-tick 完全相容；
> 部署在同一個 GitHub Pages origin 時，兩個 App 直接共用同一份本機資料
> （IndexedDB 名稱刻意沿用 `daily-tick`）。`difficulty` 欄位會被無損保留但不顯示。

兩種任務：**日常**（依週期重複，每日／每週／每月／每年，記連續期數）與**一般**（做完就結束）。
兩者都可以加一行敘述，顯示在卡片標題下方。

任務卡片分左右兩個色塊：**左側是一個正方形的主題色方塊，圓圈在正中央**，點它切換完成／未完成
（完成時圓圈翻色並出現勾）；**右側是卡片底色**，放標題與敘述，點它開啟編輯。兩塊的交界就是視覺上的
分隔線，沒有畫任何邊框。主題色與底色（深／淺／跟隨系統）都可以在設定頁調整。

任務可以加**標籤**（新增／編輯 sheet 的「標籤」欄，逗號分隔），標題列左上角的漏斗圖示開啟**篩選**：
依標籤（多選為 OR）與日期區間（起／迄任一可空）過濾清單。篩選右邊是**排序**：建立日期／字母／自訂順序，
再點目前的方式就切換正倒序（圖示箭頭朝上＝正序、朝下＝倒序）。詳見「標籤與篩選」「排序」。

右下角的 ＋：**短按新增任務；長按**以 ＋ 的圓心為圓心向外淡入一個圓弧面板，有「搜尋任務」（依名稱即時過濾）
與「編輯順序」（拖曳排序模式）。編輯順序模式下 ＋ 變成 ✓，點一下結束。詳見「FAB 與編輯順序模式」。

- 主資料：IndexedDB（單筆 record，key = `app`）
- 首屏同步渲染：localStorage `mirror`
- 備份：GitHub private gist（`todo-backup.json`），debounce 3 秒自動上傳
- 離線：Service Worker cache-first，開啟不等網路

## 部署

專案假設 Pages 路徑為 `https://zewei1222.github.io/daily-todo/`，所有路徑都寫死 `/daily-todo/` 前綴
（`manifest.json` 的 `start_url` / `scope`、SW 的註冊路徑與 scope、`index.html` 的資源連結）。

1. 把整個 repo 推到 `zewei1222/daily-todo` 的預設分支
2. Settings → Pages → Source 選該分支、資料夾 `/ (root)`
3. 用 Safari 開 `https://zewei1222.github.io/daily-todo/` → 分享 → 加入主畫面

**換 repo 名稱或帳號時**，要一起改：`index.html`（5 處連結）、`manifest.json`（`start_url`、`scope`）、
`js/main.js` 的 `BASE`、`sw.js` 的 `BASE`。前綴不一致會導致 scope 不符、加入主畫面後離線啟動失敗。

改完 code 推上去後，從主畫面開啟會先看到舊版（cache-first）。App 用兩條路偵測新版：
Service Worker 在背景比對快取內容，另外每次啟動與回到前景時會用 `?live=1`（SW 不攔）直接抓線上
`index.html` 比對 `<meta name="app-version">`。任一條發現不同就顯示「有新版本」提示條；點「重新載入」
會先讓 SW 把 app shell 全部換成新版再 reload，拿到的一定是一致的新版本。

**發版守則：每次改動都要把 `index.html` 的 `app-version` 與 `sw.js` 的 `CACHE_VERSION` 一起 +1**
（兩者必須同號，測試會檢查）。忘了改版本號，使用者就不會收到更新提示。

設定頁最下方會顯示目前執行中的版本號，用來確認裝置上跑的是哪一版。

## 備份設定

設定頁（右上齒輪）貼上 GitHub PAT，scope 只需要 `gist`。

- 第一次儲存會自動建立一個 private gist 並記住 `gist_id`
- 清掉瀏覽器資料後，重新填同一個 PAT 會自動用檔名 `todo-backup.json` 找回舊 gist 並拉回資料
- gist 與匯出的 JSON **都不含 PAT**；token 只存在這台裝置的 localStorage
- 沒設定 PAT 時 App 完全正常離線運作，狀態顯示「未設定備份」

同步方向的判斷（`js/sync.js` 的 `syncDecision`）：

| 情況 | 動作 |
|---|---|
| 遠端沒有備份 | 上傳 |
| **本機 0 筆、遠端有資料** | **一律拉回，永不上傳**（防止空資料覆蓋備份） |
| 遠端 `updated_at` 較新 | 拉回 |
| 本機 `updated_at` 較新 | 上傳 |
| 相同 | 不動作 |

## 開機圖（避免冷啟動白閃）

目前只放了 iPhone 15 Pro（393×852 @3x → 1179×2556）。換機或多裝置時：

```bash
# 1. 在 tools_gen_assets.py 的 __main__ 加一行，例如 iPhone SE 3：
#    splash(750, 1334, 200).save("splash/splash-750x1334.png")
python3 tools_gen_assets.py
# 2. 在 index.html 依該機型的 CSS 尺寸與 DPR 加一行 link
```

`icons/` 與 `splash/` 都由 `tools_gen_assets.py` 產生（需要 Pillow）。**開機圖必須是純黑底**
（與 App 啟動後的背景同色），否則冷啟動會閃一下白色。

## 檔案結構

```
index.html            單頁；script 放在 body 尾端且不加 defer，確保首屏在解析完就畫好
manifest.json         PWA manifest
sw.js                 Service Worker：cache-first + 背景比對更新
css/tokens.css        唯一的視覺數值來源（色彩／圓角／間距／字級／動畫時間）
css/app.css           版面與元件，只引用 tokens 變數
js/util.js            日期（邏輯日期、shiftDate）、DOM、token 讀取
js/store.js           IndexedDB + mirror + ui_state、資料正規化與匯入驗證
js/model.js           勾選、連續天數、排序、order_index（無 DOM）
js/sync.js            gist 備份、同步方向決策
js/theme.js           外觀（深／淺／跟隨系統）與主題色：存 localStorage，寫到 <html> 的 data-* 屬性
js/render.js          差異更新渲染 + FLIP 動畫 + 統計
js/gestures.js        點擊與左滑刪除（Pointer Events，1:1 跟手）
js/main.js            啟動三階段、事件接線、Sheet、Service Worker 註冊
vendor/sortable.min.js  Sortable 1.15.6（進編輯模式才動態載入）
tools_gen_assets.py   產生 icons/ 與 splash/
test/                 測試（開發用）
```

## 資料結構

```json
{
  "schema_version": 2,
  "updated_at": "2026-08-18T14:03:22.000Z",
  "settings": { "reset_hour": 4 },
  "tasks": [
    { "id": "uuid", "type": "daily", "title": "倒垃圾", "note": "可回收與廚餘分開", "tags": ["家務"],
      "start_date": "2026-08-18", "repeat": { "unit": "week", "interval": 1 },
      "order_index": 1000, "created_at": "...", "deleted_at": null,
      "history": ["2026-08-18"] },
    { "id": "uuid", "type": "general", "title": "繳費", "note": "", "tags": [],
      "order_index": 1000, "created_at": "...", "deleted_at": null,
      "completed_at": null }
  ]
}
```

`unit` 為 `day` / `week` / `month` / `year`，`interval` 是「每 N 個單位」。

「今天」一律用本地時間算，並往前推 `reset_hour` 小時（預設 4）。沒有任何重置流程：日期一過，
`logicalToday()` 回傳新值，本期未完成的日常任務自動變回未勾，`history` 永不裁切。
改 `reset_hour` 不會動到既有紀錄。

### 週期規則

到期日一律從 `start_date` 起算，`history` 記的是**到期日**而不是字面上的今天：

| 情況 | 行為 |
|---|---|
| 每週 | 與起始日同一個星期幾；每 N 週就是每 N×7 天 |
| 每月 31 日遇到 2 月 | 夾到當月最後一天（2/28、閏年 2/29），下個月回到 31 日 |
| 每年 2/29 | 非閏年落在 2/28，閏年回到 2/29 |
| 起始日之前 | 一律不到期 |

- **一般模式的日常分頁只顯示「今天到期」的任務**；編輯模式顯示全部（含未到期），方便管理與排序
- 連續數在每日（間隔 1）時稱「天」，其他週期稱「期」。本期未完成但上一期有完成時，仍顯示上一期的連續數，不會一早就歸零
- 統計的 30 天格子有三種狀態：亮紫＝完成、深灰＝到期未完成、純黑＝非到期日

### 軟刪除

刪除任務**不會**移除資料，只把 `deleted_at` 從 `null` 設成刪除時間。`history`（連續天數與
未來統計的唯一資料來源）因此永遠不會被丟掉。

- **所有清單讀取只能經由 `A.activeTasks(type)`**（`js/model.js`），它是唯一會過濾 `deleted_at`
  的地方。呼叫端不得自己寫 `filter(t => !t.deleted_at)`，也不得直接遍歷 `A.state.tasks`
- 左滑刪除與「清除已完成」都只是設 `deleted_at`，不動 `history`、`completed_at`、`order_index`
- 設定頁的「已刪除的任務」可以**還原**（`deleted_at = null`，並排到該類型最後）或
  **永久刪除**（唯一真的從陣列移除物件的路徑，需 confirm 且訊息會講明會失去幾次紀錄）
- 沒有「全部清空」、沒有數量徽章、沒有自動清理期限 —— 刻意不做成「回收桶」，
  因為回收桶會誘導人去清空，而清空就是永久丟掉統計資料
- **匯出、`mirror`、gist 備份都包含已刪除的任務**，換裝置還原後它們仍是已刪除狀態

兩個刻意的例外（讀 `tasks` 但不經過 `activeTasks()`）：

| 位置 | 原因 |
|---|---|
| `syncDecision()` 的「本機 0 筆」硬規則 | 必須算**全部**筆數。若只算未刪除者，把所有任務都刪掉的裝置會被判定為「空白」而從遠端拉回，刪除就被還原了 |
| 正規化與序列化（`normalizeState` / `writeMirror` / gist payload / 匯出） | 定義上就要看到完整陣列 |

`findTask(id)` 也看得到已刪除的任務 —— 還原與永久刪除都得靠它命中，但它只以 id 查詢，
不會讓已刪除的任務出現在任何清單裡。

### 標籤與篩選

- `tags` 是任務的字串陣列（`js/util.js` 的 `normTags`）：接受逗號／全形逗號／頓號／換行分隔，去空白、
  去開頭 `#`、去重，單一標籤最長 20 字、最多 10 個。舊備份沒有這個欄位就是空陣列，**不需要升 schema**。
- **與 daily-tick 的相容性**：daily-tick 目前不認得 `tags`，它的正規化會把這個欄位丟掉——若兩個 App
  共用同一份資料且由 daily-tick 那邊寫回，標籤會消失。要保留就得在 daily-tick 的 `normTask` 也保留 `tags`。
- 篩選狀態 `A.filter = { tags, from, to }` 是**這台裝置的檢視狀態**，跟分頁與捲動位置一起存在
  localStorage `ui_state`；不進 `state`、不進備份、不進匯出檔。
- 標籤多選為 OR（符合其中一個即顯示）。
- 日期：只填起日＝從那天起；只填迄日＝到那天為止；兩者相同＝只看那一天；起迄顛倒會自動調換。
  **日常任務看到期日是否落在區間內**（`dueInRange`：週期無限延續，所以只填起日一律成立；只填迄日則迄日
  不得早於起始日）；**一般任務看建立日或完成日**（`generalInRange`，以邏輯日期換算）。
- 有日期篩選時，日常分頁改以「區間內到期」取代「今天到期」的限制，等於看某段期間的清單。
- **編輯模式不套篩選**（它是「管理全部」的視圖；否則拖曳排序只會重排看得到的那幾筆而把索引弄亂），
  進編輯模式時篩選條會收起。
- 篩選中時：標題列的漏斗變主題色，標題列下方出現主題色的篩選條顯示條件，✕ 一鍵清除。
- 標題列的「編輯」按鍵（`#btn-edit`）目前 `hidden`，功能全部保留：`App.toggleEditMode()`。
  之後要放回任何位置，只要一顆按鍵呼叫它。

### FAB 與編輯順序模式

- ＋ 用 Pointer Events 自己判定：按下超過 `--long-press`（450ms）且位移在 `--swipe-tap-slop` 內＝長按，開面板並吞掉
  這次的 click；否則放手即短按＝新增任務。
- 面板 `#fab-menu` 是一個以 FAB 圓心為圓心、半徑 `--fab-menu-r` 的純色大圓，只有左上那一塊在畫面內；
  以 `transform: scale(0) → 1` + 透明度從圓心向外淡入。沒有半透明遮罩：點面板與 FAB 以外的地方就收起。
  選項位置由 `--fab-opt-a-*` / `--fab-opt-b-*`（相對圓心往左、往上的位移）決定，要加選項就再加一組。
- **搜尋任務**：標題列下方出現搜尋列（主題色膠囊＋輸入框），依任務名稱子字串即時過濾（不分大小寫）。
  關鍵字 `A.query` 是檢視狀態（`ui_state`），重載後仍在就會連搜尋列一起出現；✕ 清空並關閉。
- **編輯順序模式**（原本標題列「編輯」按鍵的功能）：顯示全部任務（含未到期）、顯示拖曳把手、不套篩選／排序／搜尋。
  **點卡片任何位置都沒有反應**——不切換完成、不開編輯——它只負責拖曳排序。此時 ＋ 變成 ✓（點一下結束），
  面板上的選項也變成「結束編輯」；回到前景會強制退出（狀態不記憶）。
- 標題列的 `#btn-edit` 仍 `hidden`，`App.toggleEditMode()` 是同一個開關。

### 排序

- `A.sort = { by: 'custom' | 'created' | 'alpha', dir: 'asc' | 'desc' }`，跟篩選一樣是**檢視狀態**，存 `ui_state`，
  不進 `state`、不進備份。
- `custom`＝編輯模式拖曳出來的 `order_index`；`created`＝`created_at`；`alpha`＝標題以
  首字先分三類——數字 → 英文 → 其他（中文等）——同類之內再用 `Intl.Collator('zh-Hant', { numeric: true })`
  比較（`2 < 10`；中文依瀏覽器 ICU 的 zh-Hant 定序，Safari／Chrome 為筆畫序）。類別要自己定是因為 ICU 的
  zh 定序會把漢字排到拉丁字母前面。沒有 `Intl` 就退回字碼比較。
- 同值一律以 `order_index` 決勝，排序才穩定；倒序是整體反轉。
- 日常分頁「已完成沉底」的規則優先於排序，未完成者之間才套排序。
- **編輯模式固定自訂正序**：那裡就是拖曳編輯 `order_index` 的地方，換了排序拖曳就沒有意義。
- 排序 sheet（標題列漏斗右邊的按鍵）：點別的方式＝換方式並從正序開始；**點目前的方式＝切換正倒序**。
  非預設排序（自訂正序以外）時按鍵變主題色，圖示依方向切換（箭頭朝上＝正序、朝下＝倒序）。

### 版本遷移

v1（只有標題）的資料可以直接讀入與匯入，會自動補上：`note` 為空字串、`repeat` 為每日、
`start_date` 取**最早的歷史紀錄**（沒有歷史才退回 `created_at` 當天），這樣既有的連續紀錄不會斷掉。

改版前的備份沒有 `deleted_at`，讀入時一律視為未刪除，不會報錯（`schema_version` 不需要因此變動，
此欄位向下相容）。

## 測試

```bash
node test/logic.test.js          # 純邏輯：日期、週期、連續期數、排序、軟刪除、匯入驗證、遷移、標籤與篩選、排序、搜尋（190 項）

python3 test/serve.py            # 另開一個終端，掛在 /daily-todo/ 路徑
cd test && npm i                 # 只裝 puppeteer-core，用系統的 google-chrome
node ui.test.mjs                 # 瀏覽器行為：手勢、編輯模式、週期、軟刪除、鍵盤、離線、版面、卡片分割與主題、篩選、排序、FAB 長按面板與搜尋（315 項）
node sync.test.mjs               # 用假的 GitHub API 驗證備份流程 F1–F6、E5、軟刪除同步（33 項）
```

UI 測試預設 `executablePath: '/usr/bin/google-chrome'`，換環境時改掉即可。

## 視覺規範

純色模式，數值全部集中在 `css/tokens.css`。深色是預設值（寫在 `:root`）：

| 用途 | 值 |
|---|---|
| 全局背景 | `#000000` |
| 模態主色塊 | `#5E35B1` |
| 卡片／區塊群組 | `#1C1C1E` |
| 控制項底色 | `#2C2C2E` |
| 主文字 | `#FFFFFF` |
| 次要文字 | `#A09FA5`（單一明度，不混用其他灰） |
| 強調色 | `#9E7BFF` |
| 圓角 | 大區塊 24px、卡片與群組 16px、分段按鈕 12px、輸入框與按鈕全圓角 |

淺色（`data-appearance="light"`，或 `system` 且系統為淺色）只覆寫底色與文字：全局背景 `#F2F2F7`、
卡片 `#FFFFFF`、控制項 `#E5E5EA`、主文字 `#000000`、次要文字 `#6E6E73`。主題色不隨深淺變動。

主題色（`data-accent`）共六組，每組只換三個值 —— 強調色、模態深色塊、強調色底上的提示字：

| id | 強調色 | 模態深色 |
|---|---|---|
| `purple`（預設） | `#9E7BFF` | `#5E35B1` |
| `yellow` | `#FFD60A` | `#8A6D00` |
| `blue` | `#64B5F6` | `#1E4F8A` |
| `green` | `#30D158` | `#1B6B34` |
| `orange` | `#FF9F0A` | `#9A4E00` |
| `pink` | `#FF6B9D` | `#9B2C55` |

外觀與主題色是**這台裝置的顯示偏好**：由 `js/theme.js` 存在 localStorage（key `theme`），
在 script 載入當下就寫到 `<html>` 的 `data-appearance` / `data-accent`，不進 `state`、不進 gist 備份、
不進匯出檔（資料格式因此與 daily-tick 維持相容）。`<meta name="theme-color">` 會跟著底色更新。

任務卡片的兩個色塊：左側 `--card-side-w`（60px，與 `--card-min-h` 同值才是正方形）用 `--c-card-side`
（＝主題色），圓圈未完成時用 `--c-check`（＝卡片底色，像挖了一個洞），完成時翻成 `--c-check-done`
（＝主文字色）並露出主題色的勾；右側就是卡片底色 `--c-surface`。卡片因為敘述變高時，左側會拉長成直立
矩形，圓圈仍垂直居中。

**全介面沒有任何邊框**，版面靠純色色塊與圓角切割；禁止漸層、rgba 透明、blur、模糊陰影。
這幾條都有測試把關（`ui.test.mjs` 的「I. 版面與 tokens」會掃過所有元素檢查邊框與透明色，
「K. 卡片左右分割 / 外觀與主題色」在淺色模式下再掃一次）。

## 與規格的取捨

- **Sortable.js 改為本地檔案 + 延遲載入**（規格寫 CDN）：CDN 會讓離線時無法排序，且弱網下第一次進
  編輯模式要等。現在放在 `vendor/`，進 SW 快取，首屏完全不載入它。
- **Modal 採全螢幕 sheet**：規格禁止半透明遮罩，所以不做浮層 + 遮罩，改成不透明整頁滑上來，
  順便讓輸入框固定在上方，鍵盤不會蓋住（另外仍用 `visualViewport` 把 `--kb-h` 餵給 sheet）。
- **新增任務的 sheet 多了「每日／一般」切換**：預設為當前分頁，避免站在一般分頁只能新增每日任務。
- **編輯按鍵暫時隱藏、位置待定**：標題列左上角改為篩選（漏斗圖示），編輯模式的開關以
  `App.toggleEditMode()` 保留在程式裡，`index.html` 的 `#btn-edit` 加了 `hidden`，拿掉就回來。
- **卡片點擊分兩側**：左側主題色方塊切換完成，右側文字區開編輯 Modal。
  編輯順序模式下點卡片任何位置都無反應（不開 Modal、不切換完成），只能拖曳排序。
- **卡片的「分隔線」不是線**：規格禁止邊框，所以左右兩側靠兩個純色色塊的交界分開；淺色模式下右側是
  純白、深色模式下是深灰卡片色。
- **預設外觀是深色而非跟隨系統**：開機圖與 `theme-color` 都是純黑，冷啟動才不會閃色；而且加入主畫面時
  iOS 會把 `apple-mobile-web-app-status-bar-style: black-translucent` 固定下來，淺色模式下狀態列
  文字仍是白色。想要淺色的人自己在設定裡切。
- **回到前景會強制退出編輯模式**，符合「編輯模式狀態不記憶」。
- **SW 不用 `skipWaiting()`**：新內容在 fetch 階段比對後寫回同一份快取，避免使用中頁面的資源錯亂。
- Toast 是 `pointer-events: none`，不會吃掉底下按鈕的點擊。
- **鍵盤期間 sheet 的幾何完全不變**：iOS 的 `visualViewport` 通報永遠慢一拍，跟著事件改高度會在
  鍵盤滑上來的過程中晃動，而且只要 sheet 變矮就會露出背後的清單。改為只把鍵盤高度餵給內容區的
  底部留白 `--kb-h`，並在 focus 當下就先用記住的鍵盤高度開好留白。
- **不做子清單與難度**：難度在沒有經驗值系統時是沒有行為的欄位，子清單會讓卡片、手勢、統計都要
  重新設計。要加的時候升 `schema_version` 即可。

## 平台限制（不實作，避免白費工）

iOS Safari / 加入主畫面的已知限制：

- 沒有觸覺回饋（不支援 Vibration API），改用 `:active` 視覺回饋
- 沒有推播提醒：Web Push 需要自架推送伺服器，與「單人、零成本」衝突，本專案不做時間提醒
- 沒有系統整合：無小工具、無 Spotlight、無分享選單接入
- 冷啟動不可避免，只能用 mirror 首屏 + 開機圖 + SW 快取把它壓到最短
