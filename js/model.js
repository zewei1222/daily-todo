/* model.js — 任務邏輯：邏輯日期、週期（每日/每週/每月/每年）、勾選、
   連續期數、排序、order_index。無 DOM。 */
(function (A) {
  'use strict';

  A.state = null;              /* 由 main.js 載入 */
  A.mode = 'normal';           /* 'normal' | 'edit' */
  A.tab = 'daily';             /* 'daily' | 'general' | 'stats' */

  A.REPEAT_UNITS = ['day', 'week', 'month', 'year'];

  A.resetHour = function () {
    return A.state && A.state.settings ? A.clampHour(A.state.settings.reset_hour) : 4;
  };

  A.logicalToday = function () {
    return A.logicalDate(new Date(), A.resetHour());
  };

  /* ================= 週期 ================= */

  function rule(task) {
    var r = task.repeat || {};
    var unit = A.REPEAT_UNITS.indexOf(r.unit) >= 0 ? r.unit : 'day';
    var interval = Math.round(Number(r.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    return { unit: unit, interval: interval };
  }
  A.repeatRule = rule;

  /* 由起始日往後推 k 期的到期日；月/年遇到短月夾到月底 */
  function addPeriods(startDate, k, r) {
    var sp = A.dateParts(startDate);
    if (r.unit === 'day') return A.shiftDate(startDate, k * r.interval);
    if (r.unit === 'week') return A.shiftDate(startDate, k * r.interval * 7);
    if (r.unit === 'month') {
      var total = (sp[1] - 1) + k * r.interval;
      var y = sp[0] + Math.floor(total / 12);
      var m = (total % 12 + 12) % 12 + 1;
      return A.makeDate(y, m, Math.min(sp[2], A.lastDayOfMonth(y, m)));
    }
    var yy = sp[0] + k * r.interval;
    return A.makeDate(yy, sp[1], Math.min(sp[2], A.lastDayOfMonth(yy, sp[1])));
  }
  A.addPeriods = addPeriods;

  /* 小於等於 dateStr 的最後一個到期日；還沒開始則為 null */
  A.dueOnOrBefore = function (task, dateStr) {
    if (task.type !== 'daily') return null;
    var start = task.start_date;
    if (!start || dateStr < start) return null;
    var r = rule(task);
    var k;
    if (r.unit === 'day') k = Math.floor(A.daysBetween(start, dateStr) / r.interval);
    else if (r.unit === 'week') k = Math.floor(A.daysBetween(start, dateStr) / (r.interval * 7));
    else if (r.unit === 'month') k = Math.floor(A.monthsBetween(start, dateStr) / r.interval);
    else k = Math.floor((A.dateParts(dateStr)[0] - A.dateParts(start)[0]) / r.interval);

    var d = addPeriods(start, k, r);
    while (d > dateStr && k > 0) { k--; d = addPeriods(start, k, r); }   /* 夾月造成的溢出 */
    return d > dateStr ? null : d;
  };

  A.isDue = function (task, dateStr) {
    if (task.type !== 'daily') return true;
    return A.dueOnOrBefore(task, dateStr) === dateStr;
  };

  A.dueToday = function (task) {
    return A.isDue(task, A.logicalToday());
  };

  /* 從某個到期日往前 / 往後一期 */
  A.stepDue = function (task, dateStr, dir) {
    var r = rule(task);
    var start = task.start_date;
    var k;
    if (r.unit === 'day') k = Math.round(A.daysBetween(start, dateStr) / r.interval);
    else if (r.unit === 'week') k = Math.round(A.daysBetween(start, dateStr) / (r.interval * 7));
    else if (r.unit === 'month') k = Math.round(A.monthsBetween(start, dateStr) / r.interval);
    else k = Math.round((A.dateParts(dateStr)[0] - A.dateParts(start)[0]) / r.interval);
    return addPeriods(start, k + dir, r);
  };

  /* 目前這一期（＝最後一個到期日）。用它記錄完成，而非字面上的「今天」 */
  A.currentPeriod = function (task) {
    return A.dueOnOrBefore(task, A.logicalToday());
  };

  /* 晚於 dateStr 的第一個到期日（還沒開始就是起始日） */
  A.nextDueAfter = function (task, dateStr) {
    var last = A.dueOnOrBefore(task, dateStr);
    if (!last) return task.start_date;
    return A.stepDue(task, last, 1);
  };

  A.repeatLabel = function (task) {
    if (task.type !== 'daily') return '';
    var r = rule(task);
    var sp = A.dateParts(task.start_date || A.logicalToday());
    if (r.unit === 'day') return r.interval === 1 ? '每日' : '每 ' + r.interval + ' 天';
    if (r.unit === 'week') {
      var w = '週' + A.WEEKDAY_NAMES[A.weekdayOf(task.start_date || A.logicalToday())];
      return r.interval === 1 ? '每' + w : '每 ' + r.interval + ' 週・' + w;
    }
    if (r.unit === 'month') {
      return (r.interval === 1 ? '每月' : '每 ' + r.interval + ' 個月・') + sp[2] + ' 日';
    }
    return (r.interval === 1 ? '每年' : '每 ' + r.interval + ' 年・') + sp[1] + '/' + sp[2];
  };

  /* 連續「天」還是連續「期」：只有每日（間隔 1）才叫天 */
  A.streakUnit = function (task) {
    var r = rule(task);
    return (r.unit === 'day' && r.interval === 1) ? '天' : '期';
  };

  /* ================= 完成狀態 ================= */

  A.isDoneToday = function (task) {
    var p = A.currentPeriod(task);
    return !!p && task.history.indexOf(p) >= 0;
  };

  A.isDone = function (task) {
    return task.type === 'daily' ? A.isDoneToday(task) : !!task.completed_at;
  };

  A.toggle = function (task) {
    if (task.type === 'daily') {
      var d = A.currentPeriod(task) || A.logicalToday();
      var i = task.history.indexOf(d);
      if (i >= 0) task.history.splice(i, 1);
      else { task.history.push(d); task.history.sort(); }
    } else {
      task.completed_at = task.completed_at ? null : A.nowIso();
    }
  };

  /* ================= 連續期數 =================
     本期已完成 → 從本期往前數；本期未完成但上一期有 → 從上一期往前數
     （避免週期一開始就顯示 0）。兩者皆無 → 0。 */
  A.streak = function (task) {
    if (task.type !== 'daily' || !task.history.length) return 0;
    var set = Object.create(null);
    task.history.forEach(function (d) { set[d] = true; });

    var last = A.currentPeriod(task);
    if (!last) return 0;
    var cursor = null;
    if (set[last]) cursor = last;
    else {
      var prev = A.stepDue(task, last, -1);
      if (prev >= task.start_date && set[prev]) cursor = prev;
    }
    if (!cursor) return 0;

    var n = 0;
    while (set[cursor] && cursor >= task.start_date) {
      n++;
      cursor = A.stepDue(task, cursor, -1);
    }
    return n;
  };

  A.longestStreak = function (task) {
    if (task.type !== 'daily' || !task.history.length) return 0;
    var h = task.history.slice().sort();
    var best = 1, run = 1;
    for (var i = 1; i < h.length; i++) {
      if (A.stepDue(task, h[i - 1], 1) === h[i]) run++;
      else run = 1;
      if (run > best) best = run;
    }
    return best;
  };

  /* ================= 取用 / 排序 ================= */

  /* ★ 所有任務讀取的唯一入口。軟刪除的任務（deleted_at 有值）一律不回傳。
     禁止在呼叫端自行寫 filter(t => !t.deleted_at)，也禁止直接遍歷 A.state.tasks
     —— 只有序列化（mirror / 匯出 / gist）與正規化可以看到完整陣列。 */
  A.activeTasks = function (type) {
    return A.state.tasks.filter(function (t) {
      return t.deleted_at == null && (type ? t.type === type : true);
    });
  };

  /* 已刪除的任務，最近刪除的在前面（只給設定頁的「已刪除的任務」用） */
  A.deletedTasks = function () {
    return A.state.tasks.filter(function (t) { return t.deleted_at != null; })
      .sort(function (a, b) {
        return String(b.deleted_at).localeCompare(String(a.deleted_at));
      });
  };

  A.sortedTasks = function (type, mode) {
    var list = A.activeTasks(type);
    if (mode === 'edit') {
      return list.sort(function (a, b) { return a.order_index - b.order_index; });
    }
    if (type === 'general') {
      return list.sort(function (a, b) { return a.order_index - b.order_index; });
    }
    return list.filter(A.dueToday).sort(function (a, b) {
      return (A.isDoneToday(a) - A.isDoneToday(b)) || (a.order_index - b.order_index);
    });
  };

  /* 依 id 尋找，含已刪除的：還原與永久刪除都必須找得到它們。
     只以 id 命中，不會讓已刪除的任務出現在任何清單裡。 */
  A.findTask = function (id) {
    for (var i = 0; i < A.state.tasks.length; i++) {
      if (A.state.tasks[i].id === id) return A.state.tasks[i];
    }
    return null;
  };

  /* ================= 變更 ================= */

  /* 新增與還原時的索引。
     基準值只看未刪除者的最大值（要求文件：max(order_index) 應只計算未刪除者），
     但會跳過已刪除任務仍佔用的索引，以滿足「新任務不得與已刪除任務的索引衝突」。
     注意：拖曳後的重排（applyOrder）仍嚴格用 (i+1)*1000，不為已刪除者讓位，
     否則未刪除者的索引就不再連續。 */
  A.nextOrder = function (type, exceptId) {
    var max = null;
    A.activeTasks(type).forEach(function (t) {
      if (max === null || t.order_index > max) max = t.order_index;
    });
    var next = max === null ? 1000 : max + 1000;

    /* exceptId：還原時要排除「自己」的舊索引，否則會為了避開自己而多跳一級 */
    var used = Object.create(null);
    A.deletedTasks().forEach(function (t) {
      if (t.type === type && t.id !== exceptId) used[t.order_index] = true;
    });
    while (used[next]) next += 1000;
    return next;
  };

  A.addTask = function (type, fields) {
    var t = {
      id: A.uuid(),
      type: type,
      title: String(fields.title || '').trim(),
      note: String(fields.note || '').trim(),
      order_index: A.nextOrder(type),
      created_at: A.nowIso(),
      deleted_at: null
    };
    if (type === 'daily') {
      t.start_date = fields.start_date || A.logicalToday();
      t.repeat = {
        unit: A.REPEAT_UNITS.indexOf(fields.unit) >= 0 ? fields.unit : 'day',
        interval: Math.max(1, Math.round(Number(fields.interval) || 1))
      };
      t.history = [];
    } else {
      t.completed_at = null;
    }
    A.state.tasks.push(t);
    return t;
  };

  A.updateTask = function (id, fields) {
    var t = A.findTask(id);
    if (!t) return null;
    t.title = String(fields.title || '').trim() || t.title;
    t.note = String(fields.note || '').trim();
    if (t.type === 'daily') {
      if (fields.start_date) t.start_date = fields.start_date;
      t.repeat = {
        unit: A.REPEAT_UNITS.indexOf(fields.unit) >= 0 ? fields.unit : 'day',
        interval: Math.max(1, Math.round(Number(fields.interval) || 1))
      };
    }
    return t;
  };

  /* 軟刪除：只標記時間，不動 history / completed_at / order_index */
  A.softDeleteTask = function (id) {
    var t = A.findTask(id);
    if (!t || t.deleted_at != null) return false;
    t.deleted_at = A.nowIso();
    return true;
  };

  /* 還原：清掉標記，並排到該類型的最後。
     順序很重要：先用「目前未刪除者」算出索引，再清標記，否則會把自己算進去。 */
  A.restoreTask = function (id) {
    var t = A.findTask(id);
    if (!t || t.deleted_at == null) return null;
    var order = A.nextOrder(t.type, t.id);
    t.deleted_at = null;
    t.order_index = order;
    return t;
  };

  /* 唯一真正從陣列移除物件的路徑 */
  A.purgeTask = function (id) {
    var i = A.state.tasks.findIndex(function (t) { return t.id === id; });
    if (i < 0) return false;
    A.state.tasks.splice(i, 1);
    return true;
  };

  /* 清除已完成：對符合條件者設 deleted_at，不移除物件 */
  A.clearCompletedGeneral = function () {
    var n = 0;
    A.activeTasks('general').forEach(function (t) {
      if (t.completed_at) { t.deleted_at = A.nowIso(); n++; }
    });
    return n;
  };

  A.hasCompletedGeneral = function () {
    return A.activeTasks('general').some(function (t) { return !!t.completed_at; });
  };

  A.applyOrder = function (type, idsInOrder) {
    idsInOrder.forEach(function (id, i) {
      var t = A.findTask(id);
      if (t && t.type === type) t.order_index = (i + 1) * 1000;
    });
  };

  /* ================= 統計 ================= */

  A.statsFor = function (task) {
    return {
      title: task.title,
      note: task.note || '',
      repeat: A.repeatLabel(task),
      streak: A.streak(task),
      longest: A.longestStreak(task),
      total: task.history.length
    };
  };

  /* 每一天的狀態：done 已完成 / missed 到期未完成 / off 非到期日 */
  A.recentDays = function (task, days) {
    var today = A.logicalToday();
    var set = Object.create(null);
    task.history.forEach(function (d) { set[d] = true; });
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = A.shiftDate(today, -i);
      var state = set[d] ? 'done' : (A.isDue(task, d) ? 'missed' : 'off');
      out.push({ date: d, state: state });
    }
    return out;
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
