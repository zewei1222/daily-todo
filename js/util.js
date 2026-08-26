/* util.js — 純工具：日期、DOM、雜項。無副作用，可在 node 中載入做測試。 */
(function (A) {
  'use strict';

  /* ---------- DOM ---------- */
  A.$ = function (sel, root) { return (root || document).querySelector(sel); };
  A.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  A.el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* 讀取 tokens.css 的數值（避免在 JS 裡硬編碼視覺數值） */
  A.token = function (name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      var n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    } catch (e) { return fallback; }
  };

  A.reducedMotion = function () {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  };

  /* ---------- 日期（SPEC §2.1，一律走本地時間，禁用 toISOString 取日期） ---------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  A.pad2 = pad2;

  A.logicalDate = function (now, resetHour) {
    var t = new Date(now.getTime() - resetHour * 3600000);
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  };

  A.shiftDate = function (dateStr, delta) {
    var p = dateStr.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + delta);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };

  A.dateParts = function (s) {
    var p = s.split('-');
    return [Number(p[0]), Number(p[1]), Number(p[2])];
  };

  /* 用 UTC 當基準算天數差，避免日光節約時間造成 ±1 天誤差 */
  A.daysBetween = function (a, b) {
    var pa = A.dateParts(a), pb = A.dateParts(b);
    var ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    var tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((tb - ta) / 86400000);
  };

  A.monthsBetween = function (a, b) {
    var pa = A.dateParts(a), pb = A.dateParts(b);
    return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1]);
  };

  A.lastDayOfMonth = function (year, month) {
    return new Date(year, month, 0).getDate();
  };

  A.makeDate = function (year, month, day) {
    return year + '-' + pad2(month) + '-' + pad2(day);
  };

  A.weekdayOf = function (dateStr) {
    var p = A.dateParts(dateStr);
    return new Date(p[0], p[1] - 1, p[2]).getDay();     /* 0 = 週日 */
  };

  A.WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

  A.isDateStr = function (s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  };

  /* ---------- 標籤 ---------- */
  A.MAX_TAGS = 10;
  A.MAX_TAG_LEN = 20;

  /* 接受字串（逗號／全形逗號／頓號／換行分隔）或陣列；去空白、去開頭 #、去重、限量 */
  A.normTags = function (raw) {
    var list = Array.isArray(raw) ? raw
             : (typeof raw === 'string' ? raw.split(/[,，、\n]/) : []);
    var seen = Object.create(null), out = [];
    list.forEach(function (t) {
      if (typeof t !== 'string') return;
      t = t.trim().replace(/^#+/, '').trim().slice(0, A.MAX_TAG_LEN);
      if (!t || seen[t] || out.length >= A.MAX_TAGS) return;
      seen[t] = true;
      out.push(t);
    });
    return out;
  };

  /* ---------- 雜項 ---------- */
  A.uuid = function () {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = Array.prototype.map.call(b, function (x) { return pad2(x.toString(16)); }).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
               h.slice(16, 20) + '-' + h.slice(20);
      }
    } catch (e) { /* 落到下面 */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  };

  A.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
  };

  A.nowIso = function () { return new Date().toISOString(); };

  A.clampHour = function (h) {
    h = Number(h);
    if (!isFinite(h)) return 4;
    h = Math.floor(h);
    if (h < 0) h = 0;
    if (h > 23) h = 23;
    return h;
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
