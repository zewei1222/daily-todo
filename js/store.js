/* store.js — 資料層：IndexedDB（主）＋ localStorage mirror（首屏同步渲染用）。
   兩者不一致時以 IndexedDB 為源（SPEC §1.3）。 */
(function (A) {
  'use strict';

  /* v3 與主 repo（daily-tick）的資料格式相容：difficulty 欄位原樣保留但
     本 App 不顯示、不使用（它是遊戲層的概念）。這讓同一份 gist 備份與
     同 origin 的 IndexedDB 可以在兩個 App 之間無痛共用。 */
  A.SCHEMA_VERSION = 3;

  A.LSK = {
    token:  'gist_token',
    gistId: 'gist_id',
    synced: 'last_synced_at',
    mirror: 'mirror',
    ui:     'ui_state',
    kb:     'kb_height'     /* 量到的鍵盤高度，用來預先縮好 sheet（見 main.js） */
  };

  /* ---------- localStorage 包一層，避免無痕模式丟例外 ---------- */
  A.ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- 預設 / 正規化 ---------- */
  A.defaultState = function () {
    return {
      schema_version: A.SCHEMA_VERSION,
      updated_at: new Date(0).toISOString(),
      settings: { reset_hour: 4 },
      tasks: []
    };
  };

  var UNITS = ['day', 'week', 'month', 'year'];

  function normRepeat(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var unit = UNITS.indexOf(r.unit) >= 0 ? r.unit : 'day';
    var interval = Math.round(Number(r.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    if (interval > 999) interval = 999;
    return { unit: unit, interval: interval };
  }

  /* v1 沒有 start_date：用最早的歷史紀錄回推，才不會讓既有的連續紀錄斷掉；
     沒有歷史就用 created_at 當天，最後才退回今天。 */
  function deriveStartDate(raw, history, today) {
    if (A.isDateStr(raw.start_date)) return raw.start_date;
    if (history && history.length) return history[0];
    if (typeof raw.created_at === 'string') {
      var t = new Date(raw.created_at);
      if (!isNaN(t.getTime())) {
        return t.getFullYear() + '-' + A.pad2(t.getMonth() + 1) + '-' + A.pad2(t.getDate());
      }
    }
    return today;
  }

  function normTask(raw, index, seenIds, today) {
    if (!raw || typeof raw !== 'object') return null;
    var title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return null;

    var type = raw.type === 'daily' ? 'daily' : 'general';
    var id = typeof raw.id === 'string' && raw.id ? raw.id : A.uuid();
    if (seenIds[id]) id = A.uuid();
    seenIds[id] = true;

    var t = {
      id: id,
      type: type,
      title: title,
      note: typeof raw.note === 'string' ? raw.note.trim() : '',
      /* 標籤：本 App 新增的欄位，舊備份沒有就是空陣列。daily-tick 目前不認得它，
         由那邊寫回時會被丟掉（見 README「標籤」）。 */
      tags: A.normTags(raw.tags),
      order_index: isFinite(Number(raw.order_index)) ? Math.round(Number(raw.order_index))
                                                     : (index + 1) * 1000,
      created_at: typeof raw.created_at === 'string' ? raw.created_at : A.nowIso(),
      /* 軟刪除標記。改版前的備份沒有這個欄位，一律視為未刪除，不得報錯。 */
      deleted_at: typeof raw.deleted_at === 'string' && raw.deleted_at ? raw.deleted_at : null,
      /* difficulty：遊戲層欄位，這裡只做無損保留（round-trip） */
      difficulty: (function () {
        var d = Math.round(Number(raw.difficulty));
        return isFinite(d) && d >= 1 && d <= 5 ? d : 1;
      })()
    };

    if (type === 'daily') {
      var seen = {}, hist = [];
      (Array.isArray(raw.history) ? raw.history : []).forEach(function (d) {
        if (A.isDateStr(d) && !seen[d]) { seen[d] = true; hist.push(d); }
      });
      hist.sort();
      t.history = hist;
      t.start_date = deriveStartDate(raw, hist, today);
      t.repeat = normRepeat(raw.repeat);
    } else {
      t.completed_at = typeof raw.completed_at === 'string' && raw.completed_at
        ? raw.completed_at : null;
    }
    /* 模塊（進度條／步驟）：可選；壞的個別丟掉，不讓一筆爛資料弄掉整個任務。
       v7 的 task.progress 在這裡轉成模塊（只有日常任務有進度條）。 */
    t.modules = A.normModules(raw.modules, type === 'daily' ? raw.progress : null, type === 'daily');
    return t;
  }

  /* 寬鬆修復：用於讀本機資料 / 已通過檢查的匯入資料 */
  A.normalizeState = function (raw) {
    if (!raw || typeof raw !== 'object') return null;
    var seenIds = {};
    var resetHour = A.clampHour(raw.settings && raw.settings.reset_hour);
    var today = A.logicalDate(new Date(), resetHour);
    return {
      schema_version: A.SCHEMA_VERSION,
      updated_at: typeof raw.updated_at === 'string' ? raw.updated_at
                                                     : new Date(0).toISOString(),
      settings: { reset_hour: resetHour },
      tasks: (Array.isArray(raw.tasks) ? raw.tasks : [])
        .map(function (t, i) { return normTask(t, i, seenIds, today); })
        .filter(Boolean)
    };
  };

  /* 嚴格檢查：用於匯入與遠端資料（SPEC §6.4） */
  A.checkPayload = function (raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '格式錯誤：最外層必須是物件' };
    }
    if (typeof raw.schema_version !== 'number') {
      return { ok: false, error: '格式錯誤：缺少 schema_version' };
    }
    if (raw.schema_version > A.SCHEMA_VERSION) {
      return { ok: false, error: '版本不支援：資料為 v' + raw.schema_version +
                                 '，本 App 只支援到 v' + A.SCHEMA_VERSION };
    }
    if (!Array.isArray(raw.tasks)) {
      return { ok: false, error: '格式錯誤：tasks 必須是陣列' };
    }
    return { ok: true, state: A.normalizeState(raw) };
  };

  A.parsePayload = function (text) {
    var raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, error: '不是合法的 JSON' }; }
    return A.checkPayload(raw);
  };

  /* ---------- mirror（同步、抗強制關閉） ---------- */
  A.readMirror = function () {
    var s = A.ls.get(A.LSK.mirror);
    if (!s) return null;
    try { return A.normalizeState(JSON.parse(s)); } catch (e) { return null; }
  };

  A.writeMirror = function (state) {
    try { A.ls.set(A.LSK.mirror, JSON.stringify(state)); } catch (e) {}
  };

  /* ---------- IndexedDB ---------- */
  /* DB 名刻意保留 'daily-tick'：GitHub Pages 同一 origin 下，這讓本 App 直接
     讀到 daily-tick App 既有的任務資料，零搬移。 */
  /* DB 版本對齊 daily-tick App 的 v2（同名 DB 用較低版本開啟會拋 VersionError）。
     升級時把兩個 store 都建好：'state' 是本 App 的，'game_data' 是 daily-tick
     遊戲層的——先建起來讓兩個 App 在同一 origin 上互不打架。 */
  var DB_NAME = 'daily-tick', DB_VER = 2, STORE = 'state', KEY = 'app';
  var dbPromise = null;

  A.openDB = function () {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains('game_data')) db.createObjectStore('game_data');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('idb blocked')); };
    });
    return dbPromise;
  };

  A.idbLoad = function () {
    return A.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  };

  function idbPut(state) {
    return A.openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(state, KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  /* 寫入合併：進行中就標記 dirty，結束後再寫一次最新狀態（最後一次必然落地） */
  var writing = false, dirty = false;

  function flush() {
    writing = true;
    idbPut(JSON.parse(JSON.stringify(A.state)))
      .catch(function (e) { console.warn('IndexedDB 寫入失敗，已寫入 mirror', e); })
      .then(function () {
        writing = false;
        if (dirty) { dirty = false; flush(); }
      });
  }

  A.queueIdbWrite = function () {
    if (writing) { dirty = true; return; }
    flush();
  };

  /* ---------- 對外唯一的儲存入口 ---------- */
  A.save = function (opts) {
    opts = opts || {};
    if (!A.state) return;
    if (opts.bump !== false) A.state.updated_at = A.nowIso();
    A.writeMirror(A.state);          /* 同步，先落地 */
    A.queueIdbWrite();               /* 非同步，不阻塞 UI */
    if (opts.sync !== false && A.sync) A.sync.schedulePush();
  };

  /* ---------- ui_state（分頁與捲動位置，SPEC §9.2） ---------- */
  A.defaultUi = function () {
    return { tab: 'daily', scroll: { daily: 0, general: 0, stats: 0 },
             filter: { tags: [], from: null, to: null },
             sort: { by: 'custom', dir: 'asc' },
             query: '' };
  };

  A.readUiState = function () {
    var raw = A.ls.get(A.LSK.ui);
    var ui = A.defaultUi();
    if (!raw) return ui;
    try {
      var o = JSON.parse(raw);
      if (o && (o.tab === 'daily' || o.tab === 'general' || o.tab === 'stats')) ui.tab = o.tab;
      if (o && o.scroll) {
        ['daily', 'general', 'stats'].forEach(function (k) {
          var v = Number(o.scroll[k]);
          if (isFinite(v) && v >= 0) ui.scroll[k] = v;
        });
      }
      if (o && o.filter && A.normFilter) ui.filter = A.normFilter(o.filter);
      if (o && o.sort && A.normSort) ui.sort = A.normSort(o.sort);
      if (o && A.normQuery) ui.query = A.normQuery(o.query);
    } catch (e) {}
    return ui;
  };

  A.writeUiState = function (ui) {
    try { A.ls.set(A.LSK.ui, JSON.stringify(ui)); } catch (e) {}
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
