# iOS 網頁 App（PWA）平台行為規格書

> 這份文件不是視覺設計規範。它記錄的是「把網頁做成 iPhone 主畫面 App」時，iOS Safari
> 特有的平台行為、會踩的坑、以及本專案驗證過的對策。**交給任何 agent 或工程師動這類專案前，先讀完本文。**
> 所有規則都來自實際踩坑（daily-todo 專案 v1–v14），不是理論。
>
> 適用範圍：iOS Safari（含 standalone / 加入主畫面模式）為主要目標的行動網頁。
> Android Chrome 的行為差異會特別標註。

## 0. 硬性規則速查（先照做，細節見後文）

| # | 規則 | 一句話原因 |
|---|---|---|
| 1 | 所有可輸入欄位 `font-size ≥ 16px` | iOS 對 <16px 的欄位 focus 時會放大整頁且不縮回 |
| 2 | 不要用 `maximum-scale` / `user-scalable=no` 擋放大 | 傷無障礙；正解是規則 1 |
| 3 | `body` 用 `position: fixed` 釘死，捲動全部發生在內層容器 | 否則 iOS 會為了露出輸入框捲動整份文件，把 fixed 元素推出畫面 |
| 4 | 鍵盤高度只餵給捲動容器的 `padding-bottom`，**絕不改動全螢幕面板的幾何** | `visualViewport` 通報慢一拍，跟著改高度必抖 |
| 5 | **不要把 iOS 為了露出輸入框做的位移「壓回去」** | 壓回去＝輸入框被鍵盤蓋住、看不到打字、無法長按選字複製 |
| 6 | `focus()` 必須發生在使用者手勢的同一個 task | 否則 iOS 不開鍵盤，或自行捲動可視區域 |
| 7 | 不要在開頁／開面板時自動 `focus()` | 鍵盤自己跳出來＝畫面抖一下；只有「搜尋」這類明確要打字的入口例外 |
| 8 | 自製手勢（長按、拖曳）的元素設 `touch-action: none` | 否則瀏覽器把觸控接管成捲動、送 `pointercancel`，手勢收不到後續事件 |
| 9 | 按鍵類元素設 `-webkit-touch-callout: none` + `user-select: none`，長按入口再攔 `contextmenu` | 封鎖長按跳出的選字／複製選單；**輸入框內不可封**（使用者要複製貼上） |
| 10 | 按鍵的 `mousedown` 要 `preventDefault()` | pointerup 之後瀏覽器補送的 mousedown 會把焦點從輸入框搶走 |
| 11 | 點擊目標 ≥ 44×44pt；視覺可以更小，用透明外圈補 | Apple HIG 硬規則 |
| 12 | 可點的東西用真的 `<button>`，不要 `<span role="button">` | VoiceOver／鍵盤／切換控制才到得了 |
| 13 | `interactive-widget=resizes-content` 與 `dvh` **解決不了 iOS 鍵盤問題** | 前者 iOS 不支援（至 iOS 18）；後者反映的是工具列不是鍵盤 |

## 1. Viewport 與縮放

### 1.1 標準 meta

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

- `viewport-fit=cover` 讓內容延伸到瀏海與底部指示條後面，配合 `env(safe-area-inset-*)` 自己留邊。
- **不要**加 `maximum-scale=1` / `user-scalable=no`：iOS 10 之後 pinch 縮放本來就會忽略它，
  它唯一的「效果」是傷害放大鏡使用者；而 focus 自動放大有正解（見 1.2）。

### 1.2 focus 時整頁被放大

**現象**：點某個輸入框，整頁突然放大，而且收鍵盤後不會縮回。
**原因**：iOS Safari 對 `font-size < 16px` 的 input/textarea/select，focus 時自動 zoom。
**對策**：所有可輸入欄位字級一律 ≥ 16px。建議做成 token 一次管好：

```css
:root { --fs-field: max(16px, 0.9412rem); }
input, textarea, select { font-size: var(--fs-field); }
```

寫一條測試掃全部欄位的 computed font-size ≥ 16px，防止日後新欄位破功。

### 1.3 `interactive-widget=resizes-content`

Chrome Android 108+ 支援：鍵盤彈出時縮小 layout viewport，版面自動讓位。
**iOS Safari 到 18 為止不支援**，加了沒有任何效果。不要以它為方案基礎。

## 2. 鍵盤與 visualViewport（核心章節）

### 2.1 平台事實（先接受，再設計）

1. iOS 的鍵盤是**疊**在畫面上的：layout viewport 完全不變（`window.innerHeight` 不變），
   只有 `window.visualViewport.height` 縮小。
2. `visualViewport` 的事件**永遠慢一拍**：`resize` 多半在鍵盤動畫（約 250–350ms）結束後才來一次，
   `scroll` 在動畫期間零星地來。任何「跟著事件即時調整版面」的作法都會在動畫期間肉眼可見地跳動。
3. focus 的輸入框若在鍵盤將覆蓋的區域，iOS 會**自己**捲動：能捲內層容器就捲容器，
   不行就平移 visual viewport（`visualViewport.offsetTop > 0`），此時 `window.scrollY` 可能變成非零。
4. 這個平移**不會自動復原**，收鍵盤後畫面可能停在偏移狀態。

### 2.2 反模式（都實際踩過，不要再走）

**反模式 A：把面板高度綁 `visualViewport.height`**（外部 AI 常見建議）
動畫期間事件還沒來，面板仍是全高、輸入框被鍵盤蓋住 → iOS 先平移可視區域 →
事件到了才縮高度 → 畫面跳一下，而且平移不復原，面板頂端被切在畫面外直到收鍵盤。
此法在 Android（`resizes-content`）成立，在 iOS 不成立。

**反模式 B：把 iOS 的位移壓回去**（`window.scrollTo(0,0)`、把 `offsetTop` 反向補償到面板 top）
在「輸入框永遠在畫面上方」時看似無害；一旦輸入框在下半部，iOS 推上來露出它、你又壓回去，
結果：**輸入框被鍵盤蓋住、看不到打的字、長按選不了字、複製貼上出不來**。
（系統的選字放大鏡與游標定位以它自己的捲動結果為準，被你壓回去之後就對不上了。）

**反模式 C：開頁／開面板自動 `focus()`**
鍵盤自己彈出 → iOS 推畫面 → 你的留白補償慢半拍 → 抖一下。自動 focus 只留給「搜尋」這種
使用者按下去就是要打字的入口。

### 2.3 驗證過的正解模式

原則一句話：**面板幾何永遠不變；鍵盤高度只變成捲動容器的底部留白；欄位位置自己捲。**

結構：

```html
<div class="sheet">            <!-- position:fixed、全高、幾何永不變 -->
  <div class="sheet-head">…</div>   <!-- 釘住的標題列 -->
  <div class="sheet-body">…</div>   <!-- 唯一的捲動容器，欄位都在這裡 -->
</div>
```

```css
html, body { height: 100%; overflow: hidden; }
body { position: fixed; inset: 0; overscroll-behavior: none; }   /* 文件層無捲動空間 */

.sheet-body {
  flex: 1 1 auto; min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding-bottom: calc(32px + var(--kb-h, 0px) + env(safe-area-inset-bottom));
  /* 保險：瀏覽器自己 scroll-into-view 時也把鍵盤區當不可視 */
  scroll-padding-bottom: calc(var(--kb-h, 0px) + 32px);
}
```

JS（完整可抄，原檔見 daily-todo 的 js/main.js `VP` 模組）：

```js
var VP = (function () {
  var root = document.documentElement;
  var vv = window.visualViewport;
  var KB_ANIM = 420;           // 鍵盤動畫約 250-350ms，留餘裕
  var KB_GUESS_RATIO = 0.42;   // 第一次還沒量過時的估計值
  var MIN_KB = 100;
  var lockUntil = 0, lockTimer = null, queued = false;

  function set(kb) { root.style.setProperty('--kb-h', Math.round(kb) + 'px'); }

  // 把正在輸入的欄位捲到鍵盤上方：在捲動容器裡捲，不動面板本身
  function revealField(el) {
    var body = el && el.closest && el.closest('.sheet-body');
    if (!body) return;
    var kb = parseFloat(root.style.getPropertyValue('--kb-h')) || 0;
    var margin = 32;
    var limit = window.innerHeight - kb - margin;
    var r = el.getBoundingClientRect();
    if (r.bottom > limit) body.scrollTop += Math.ceil(r.bottom - limit);
  }
  function revealActive() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('.sheet')) revealField(a);
  }
  function remembered() {      // 上次實測的鍵盤高度
    var v = Number(localStorage.getItem('kb_height'));
    return isFinite(v) && v > MIN_KB ? v : 0;
  }
  function measure() {         // 注意：這裡「不做」scrollTo(0,0)、不做位移補償（反模式 B）
    if (!vv) { set(0); return; }
    var kb = window.innerHeight - vv.height;
    if (kb < MIN_KB) kb = 0; else localStorage.setItem('kb_height', String(Math.round(kb)));
    set(kb);
    revealActive();            // 用實測值再校正一次位置
  }
  function lock() {            // 鍵盤動畫期間一律不理會 vv 事件
    lockUntil = Date.now() + KB_ANIM;
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(function () { lockTimer = null; measure(); }, KB_ANIM + 30);
  }
  function onChange() {
    if (Date.now() < lockUntil) return;
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; measure(); });
  }
  return {
    watch: function () {
      if (!vv) { set(0); return; }
      vv.addEventListener('resize', onChange);
      vv.addEventListener('scroll', onChange);
      window.addEventListener('orientationchange', function () { lockUntil = 0; setTimeout(measure, 120); });
      measure();
    },
    // 在 focus 的同一個 task 內呼叫：先開好留白＋把欄位捲到鍵盤上方，iOS 就沒有理由搬畫面
    keyboardOpening: function (el) {
      set(remembered() || Math.round(window.innerHeight * KB_GUESS_RATIO));
      revealField(el);
      lock();
    },
    keyboardClosing: function () { set(0); lock(); }
  };
})();

document.addEventListener('focusin', function (e) {
  var t = e.target;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.closest('.sheet')) VP.keyboardOpening(t);
});
document.addEventListener('focusout', function (e) {
  var t = e.target;
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !t.closest('.sheet')) return;
  setTimeout(function () {              // 60ms：換欄位時鍵盤沒收，不要清留白
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('.sheet')) return;
    VP.keyboardClosing();
  }, 60);
});
```

要點整理：

- **預估先行、實測校正**：focus 當下就用「上次實測值（localStorage）或 42% 螢幕高」開好留白並捲好位置，
  這一步在使用者手勢的同一個 task 內完成，iOS 因此沒有捲動的理由；420ms 後量真值校正並存起來。
- **鎖定期**：動畫期間任何 `visualViewport` 事件一律忽略，畫面才不會跟著半路的數值跳。
- **就算 iOS 還是搬了畫面，也不要干預**（反模式 B）。
- 關閉面板時再把可能殘留的文件捲動歸零（此時已 blur，不影響輸入）：
  `activeElement.blur(); if (window.scrollY || window.scrollX) window.scrollTo(0, 0);`

### 2.4 開面板的動畫與 focus 的關係

需要「打開就輸入」的面板不要用位移動畫（slide-up）：focus 必須在手勢同 task 發生，
而此刻輸入框還在畫面外，iOS 會自行捲動去露出它——看起來就是抖一下再被拉回。
改用**淡入**（`opacity`），讓輸入框第一帧就在最終位置。

## 3. 觸控與手勢

### 3.1 touch-action 的選擇

| 元素 | 值 | 原因 |
|---|---|---|
| 一般按鍵 | `manipulation` | 去除 300ms 延遲疑慮、保留捲動 |
| 自製手勢的元素（長按開選單、下拉關閉、跟手拖曳） | `none` | 否則手指一滑，瀏覽器把觸控接管成捲動並送出 `pointercancel`，你的 pointermove/up 再也收不到 |
| 清單卡片（左滑刪除＋垂直捲動共存） | `pan-y` | 垂直交給瀏覽器捲，水平自己接 |

### 3.2 Pointer Events 自製手勢的固定寫法

- `pointerdown` 記起點、`setPointerCapture`；位移超過 slop（8px）才判定方向；
  判定為捲動就完全放手不再介入。
- 長按＝按住超過 450ms 且位移在 slop 內。長按觸發後**繼續**追蹤 move/up 可做「滑到選項放開＝選擇」。
- `pointercancel` 永遠要處理（清狀態），iOS 會在各種時機送它。

### 3.3 合成事件的陷阱（實際踩過）

1. **pointerup 之後瀏覽器會補送 mousedown/mouseup/click**。若按鍵在 pointerup 就執行動作並
   focus 了某個輸入框，補送的 mousedown 會把焦點搶回按鍵 → 鍵盤留白被清掉。
   對策：動作留在 `click` 執行；按鍵上 `mousedown` 一律 `preventDefault()`（按鍵不需要焦點）。
2. **長按放手後補送的 click 可能落在手指最後的位置**（不是按鍵上），會誤觸底下的元件。
   對策：長按放手當下設旗標，在 document 捕獲階段吞掉接下來 100ms 內的 click；
   **不要**讓旗標無限期殘留（手勢若沒產生 click，旗標會吃掉下一次合法點擊）。
3. **手勢元素若在按住期間被移動**（例如它跟著鍵盤留白浮動），放手時合成 click 會打在
   「原位置現在的元件」上。對策：手勢元素的位置在按壓期間必須穩定（例如固定在畫面底部）。
4. 快速拖曳剛結束的瞬間，下一個觸控 tap 偶爾不會產生 click（瀏覽器仍在手勢狀態）。
   寫自動化測試時要避免依賴這個時序。

### 3.4 封鎖長按選字／複製選單

```css
button {
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
```

長按入口（例如長按開輪盤的按鍵與選單本體）再加 `contextmenu` 的 `preventDefault()`。
**輸入框（input/textarea）絕對不要封**——使用者要在裡面長按選字、複製、貼上。
（§2.2 反模式 B 也會造成「輸入框無法長按選字」，先確認不是那個問題。）

## 4. 捲動與版面

- 文件層不可捲動：`html, body { height: 100%; overflow: hidden; }` + `body { position: fixed; inset: 0; }`。
  驗證：`document.scrollingElement.scrollHeight <= clientHeight`。
- 每個畫面自己一個 `overflow-y: auto` 容器，加 `overscroll-behavior-y: contain`（擋 iOS 的連鎖回彈）
  與 `-webkit-overflow-scrolling: touch`（舊機慣性）。
- 安全區：頂列 `padding-top: env(safe-area-inset-top)`、底列 `padding-bottom: env(safe-area-inset-bottom)`，
  搭配 meta 的 `viewport-fit=cover`。
- `dvh/svh/lvh`：反映 Safari 動態工具列，**與鍵盤無關**；standalone 下 `100dvh ≈ 100%`。
  不要拿它解鍵盤問題。

## 5. Standalone（加入主畫面）細節

- **meta 組**：`apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style`、
  `apple-mobile-web-app-title`、`manifest.json` 的 `display: standalone`。
- **狀態列**：`black-translucent`＝狀態列文字白色、內容延伸到其後。這個值在「加入主畫面當下」被固定，
  之後改 meta 對已安裝的 App 無效。淺色主題的 App 要注意白字看不見的問題——沒有執行期解法，
  只能在預設外觀上做選擇。
- **開機圖 `apple-touch-startup-image`**：每個機型尺寸一張（media query 區分），顏色必須與 App
  啟動後的背景同色，否則冷啟動閃色。`media` 支援 `prefers-color-scheme`，深淺可各放一張。
- **theme-color** 可由 JS 動態改（跟隨 App 內主題切換）。
- **Service Worker**：cache-first 的話，更新偵測要走兩條路——SW 背景比對快取內容＋
  頁面用帶參數（如 `?live=1`，SW 放行不攔）的請求直接比對線上版本標記。
  發版時 HTML 內的版本標記與 SW 的 CACHE_VERSION **必須同步遞增**，用測試把關。
- **scope 一致**：`start_url`、`scope`、SW 註冊路徑、所有資源前綴必須一致，不一致會導致
  安裝後離線啟動失敗。

## 6. 輸入欄位細節

- `enterkeyhint`（next / done / search）控制 return 鍵文字；`autocapitalize`、`inputmode="numeric"`、
  `autocomplete="off"` 按欄位性質設。
- `type="search"` 在 WebKit 會出現內建的清除鈕，自己有 ✕ 的話用
  `::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }` 關掉。
- **Dynamic Type**：`html { font-size: 17px; font: -apple-system-body; }`，其餘字級用 rem。
  Apple 平台會跟隨系統文字大小，其他平台忽略該 shorthand、維持 17px。
- 表單驗證錯誤釘在欄位旁（inline），不要只用會消失的 toast；`confirm()`/`alert()` 在 standalone
  下與 App 風格脫節，用 App 內的確認元件。

## 7. 驗收清單（agent 自檢用）

**縮放**
- [ ] 點任何輸入框整頁不會放大（全部欄位 ≥ 16px，有測試把關）
- [ ] meta 沒有 `maximum-scale` / `user-scalable=no`

**鍵盤**
- [ ] 開任何面板鍵盤不會自己跳出來
- [ ] 點頂部欄位：鍵盤滑出過程畫面零位移
- [ ] 點底部欄位：欄位停在鍵盤正上方，看得到游標與文字
- [ ] 欄位內長按可選字、複製、貼上（選字放大鏡位置正確）
- [ ] 換欄位（focus 直接移到另一欄）留白不閃爍
- [ ] 收鍵盤後畫面回到正位，沒有殘留偏移

**觸控**
- [ ] 長按按鍵不會跳出系統選字／複製選單
- [ ] 自製手勢在快速滑動下不會中途斷掉（pointercancel 有處理、touch-action 正確）
- [ ] 長按放手後不會誤觸底下的元件
- [ ] 所有點擊目標 ≥ 44×44

**standalone**
- [ ] 冷啟動不閃色（開機圖與背景同色）
- [ ] 離線可完整啟動與操作
- [ ] 發版後能收到更新提示並拿到一致的新版本

## 8. 已否決方案一覽（別再提）

| 方案 | 否決原因 |
|---|---|
| 面板高度綁 `visualViewport.height` | iOS 事件慢一拍：動畫期間跳動＋visual viewport 平移不復原（§2.2 A） |
| `interactive-widget=resizes-content` | iOS Safari（至 18）不支援 |
| `100dvh` 解鍵盤 | dvh 反映工具列，與鍵盤無關 |
| `maximum-scale=1` 擋 focus 放大 | 傷無障礙；正解是 16px 字級 |
| focus 後 `scrollTo(0,0)`／位移反向補償 | 把 iOS 露出輸入框的捲動壓回去，輸入框被鍵盤蓋住（§2.2 B） |
| 開面板自動 focus | 鍵盤自彈＋畫面抖動（§2.2 C） |
| 動作寫在 `pointerup` | 補送的 mousedown 搶焦點（§3.3-1） |

---
*出處：daily-todo 專案（zewei1222/daily-todo）v1–v14 的實測與測試套件（logic 215 / UI 420 / sync 33）。*
