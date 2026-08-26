/* theme.js — 外觀（深／淺／跟隨系統）與主題色。
   這是「這台裝置」的顯示偏好，存 localStorage，不進 state、不進備份；
   色值全部在 css/tokens.css，這裡只負責把選擇寫到 <html> 的 data-* 屬性。 */
(function (A) {
  'use strict';

  A.THEME_ACCENTS = [
    { id: 'purple', name: '紫' },
    { id: 'yellow', name: '黃' },
    { id: 'blue',   name: '藍' },
    { id: 'green',  name: '綠' },
    { id: 'orange', name: '橘' },
    { id: 'pink',   name: '粉' }
  ];
  A.THEME_APPEARANCES = ['dark', 'light', 'system'];

  var KEY = 'theme';

  A.defaultTheme = function () {
    return { accent: 'purple', appearance: 'dark' };
  };

  function validAccent(id) {
    return A.THEME_ACCENTS.some(function (a) { return a.id === id; });
  }

  A.readTheme = function () {
    var t = A.defaultTheme();
    var raw = A.ls.get(KEY);
    if (!raw) return t;
    try {
      var o = JSON.parse(raw);
      if (o && validAccent(o.accent)) t.accent = o.accent;
      if (o && A.THEME_APPEARANCES.indexOf(o.appearance) >= 0) t.appearance = o.appearance;
    } catch (e) {}
    return t;
  };

  A.writeTheme = function (t) {
    try { A.ls.set(KEY, JSON.stringify(t)); } catch (e) {}
  };

  /* 目前生效的底色（system 會解析成 dark / light） */
  A.resolvedAppearance = function (t) {
    t = t || A.theme;
    if (t.appearance !== 'system') return t.appearance;
    try { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
    catch (e) { return 'dark'; }
  };

  function syncMetaColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim();
    if (bg) meta.setAttribute('content', bg);
  }

  A.applyTheme = function (t) {
    A.theme = t;
    var root = document.documentElement;
    root.setAttribute('data-accent', t.accent);
    root.setAttribute('data-appearance', t.appearance);
    syncMetaColor();
  };

  A.setTheme = function (patch) {
    var t = A.readTheme();
    if (patch && validAccent(patch.accent)) t.accent = patch.accent;
    if (patch && A.THEME_APPEARANCES.indexOf(patch.appearance) >= 0) t.appearance = patch.appearance;
    A.writeTheme(t);
    A.applyTheme(t);
    return t;
  };

  /* 載入當下就套用：script 在 body 尾端、不加 defer，首屏前就生效 */
  A.applyTheme(A.readTheme());

  /* 跟隨系統時，系統切換深淺要同步 theme-color */
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncMetaColor);
  } catch (e) {}

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
