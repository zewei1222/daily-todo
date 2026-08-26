/* render.js — DOM 渲染。差異更新（保留節點）＋ FLIP 動畫（SPEC §9.3）。 */
(function (A) {
  'use strict';

  var R = {};
  A.render = R;

  var els = null;
  R.init = function () {
    els = {
      title:     A.$('#app-title'),
      btnEdit:   A.$('#btn-edit'),
      btnFilter: A.$('#btn-filter'),
      btnSort:   A.$('#btn-sort'),
      filterBar: A.$('#filter-bar'),
      filterText: A.$('#filter-text'),
      searchBar: A.$('#search-bar'),
      fab:       A.$('#fab'),
      lists:     { daily: A.$('#list-daily'), general: A.$('#list-general') },
      empties:   { daily: A.$('#empty-daily'), general: A.$('#empty-general') },
      views:     { daily: A.$('#view-daily'), general: A.$('#view-general'), stats: A.$('#view-stats') },
      footGeneral: A.$('#foot-general'),
      stats:     A.$('#stats-body'),
      tabs:      A.$$('.tab')
    };
    R.els = els;
  };

  /* ---------- FLIP ---------- */
  function flip(container, mutate) {
    if (A.reducedMotion()) { mutate(); return; }

    var before = new Map();
    A.$$(':scope > .row', container).forEach(function (n) {
      n.style.transition = 'none';
      n.style.transform = '';
      before.set(n, n.getBoundingClientRect().top);
    });

    mutate();

    var dur = A.token('--dur-slow', 240);
    var ease = getComputedStyle(document.documentElement)
                 .getPropertyValue('--ease-out').trim() || 'ease-out';

    A.$$(':scope > .row', container).forEach(function (n) {
      var prev = before.get(n);
      var now = n.getBoundingClientRect().top;

      if (prev === undefined) {                     /* 新節點：淡入 */
        n.style.transition = 'none';
        n.style.opacity = '0';
        void n.offsetHeight;
        n.style.transition = 'opacity ' + dur + 'ms ' + ease;
        n.style.opacity = '';
        return;
      }
      var dy = prev - now;
      if (!dy) { n.style.transition = ''; return; }
      n.style.transition = 'none';
      n.style.transform = 'translateY(' + dy + 'px)';
      void n.offsetHeight;                          /* 強制套用起始值 */
      n.style.transition = 'transform ' + dur + 'ms ' + ease;
      n.style.transform = '';
    });
  }
  R.flip = flip;

  /* ---------- 卡片 ---------- */
  function buildRow(task) {
    var row = A.el('li', 'row');
    row.dataset.id = task.id;

    var actions = A.el('div', 'row-actions');
    var del = A.el('button', 'btn-del', '刪除');
    del.type = 'button';
    del.dataset.act = 'delete';
    actions.appendChild(del);

    /* 卡片分左右兩個色塊：左側正方形（主題色）放圓圈，點它切換完成；
       右側（卡片底色）放標題與敘述，點它開編輯。 */
    var card = A.el('div', 'card');

    var side = A.el('span', 'card-side');
    side.setAttribute('role', 'button');
    var check = A.el('span', 'check');
    check.appendChild(A.el('span', 'check-mark', '✓'));
    side.appendChild(check);
    card.appendChild(side);

    var body = A.el('span', 'card-body');
    body.setAttribute('role', 'button');
    var main = A.el('span', 'card-main');
    main.appendChild(A.el('span', 'card-title'));
    main.appendChild(A.el('span', 'card-note'));
    main.appendChild(A.el('span', 'card-tags'));
    body.appendChild(main);
    body.appendChild(A.el('span', 'badge'));
    var handle = A.el('span', 'drag-handle', '≡');
    handle.setAttribute('aria-hidden', 'true');
    body.appendChild(handle);
    card.appendChild(body);

    row.appendChild(actions);
    row.appendChild(card);
    return row;
  }

  function updateRow(row, task) {
    var card = A.$('.card', row);
    var titleEl = A.$('.card-title', row);
    var noteEl = A.$('.card-note', row);
    var badgeEl = A.$('.badge', row);

    if (titleEl.textContent !== task.title) titleEl.textContent = task.title;

    var note = task.note || '';
    if (noteEl.textContent !== note) noteEl.textContent = note;
    noteEl.hidden = !note;

    var tagsEl = A.$('.card-tags', row);
    var tags = (task.tags || []).map(function (g) { return '#' + g; }).join('  ');
    if (tagsEl.textContent !== tags) tagsEl.textContent = tags;
    tagsEl.hidden = !tags;

    var done = A.isDone(task);
    card.classList.toggle('is-done', done);
    var side = A.$('.card-side', row);
    side.setAttribute('aria-pressed', done ? 'true' : 'false');
    side.setAttribute('aria-label', (done ? '取消完成 ' : '完成 ') + task.title);
    A.$('.card-body', row).setAttribute('aria-label', '編輯 ' + task.title);

    /* 一般模式顯示連續期數；編輯模式改顯示週期，方便一眼確認排程 */
    var text = '', quiet = false;
    if (task.type === 'daily') {
      if (A.mode === 'edit') { text = A.repeatLabel(task); quiet = true; }
      else { var n = A.streak(task); text = n > 0 ? String(n) : ''; }
    }
    badgeEl.hidden = !text;
    if (text && badgeEl.textContent !== text) badgeEl.textContent = text;
    badgeEl.classList.toggle('is-quiet', quiet);
  }

  function reconcile(listEl, tasks) {
    var existing = new Map();
    A.$$(':scope > .row', listEl).forEach(function (li) { existing.set(li.dataset.id, li); });

    var wanted = Object.create(null);
    tasks.forEach(function (t) { wanted[t.id] = true; });
    existing.forEach(function (li, id) { if (!wanted[id]) li.remove(); });

    var prev = null;
    tasks.forEach(function (t) {
      var li = existing.get(t.id);
      if (!li) li = buildRow(t);
      updateRow(li, t);
      var ref = prev ? prev.nextSibling : listEl.firstChild;
      if (li !== ref) listEl.insertBefore(li, ref);
      prev = li;
    });
  }

  /* ---------- 清單 ---------- */
  R.list = function (type, opts) {
    opts = opts || {};
    var listEl = els.lists[type];
    if (!listEl) return;
    var tasks = A.sortedTasks(type, A.mode);

    listEl.classList.toggle('is-edit', A.mode === 'edit');

    var mutate = function () { reconcile(listEl, tasks); };
    if (opts.animate === false) mutate();
    else flip(listEl, mutate);

    var emptyEl = els.empties[type];
    emptyEl.hidden = tasks.length > 0;
    if (!emptyEl.hidden) {
      if (A.mode !== 'edit' && (A.filterActive() || A.query) && A.activeTasks(type).length) {
        emptyEl.textContent = A.query && !A.filterActive() ? '沒有符合搜尋條件的任務。'
                            : (A.query ? '沒有符合搜尋與篩選條件的任務。' : '沒有符合篩選條件的任務。');
      } else if (type === 'general') {
        emptyEl.textContent = '還沒有一般任務。按右下角的 ＋ 新增。';
      } else if (A.activeTasks('daily').length === 0) {
        emptyEl.textContent = '還沒有日常任務。按右下角的 ＋ 新增。';
      } else {
        emptyEl.textContent = '今天沒有到期的日常任務。';
      }
    }
    if (type === 'general') {
      els.footGeneral.hidden = !(A.mode === 'normal' && A.hasCompletedGeneral());
    }
  };

  /* ---------- Header / Tab / FAB ---------- */
  var TITLES = { daily: '日常', general: '一般', stats: '統計' };

  /* 篩選條的文字：「#家務  #健康 ・ 08-01 ～ 08-15」 */
  function filterSummary(f) {
    var parts = [];
    if (f.tags.length) parts.push(f.tags.map(function (g) { return '#' + g; }).join('  '));
    if (f.from && f.to) parts.push(f.from === f.to ? f.from : f.from + ' ～ ' + f.to);
    else if (f.from) parts.push(f.from + ' 起');
    else if (f.to) parts.push('至 ' + f.to);
    return parts.join(' ・ ');
  }
  R.filterSummary = filterSummary;

  var SORT_NAMES = { custom: '自訂順序', created: '建立日期', alpha: '字母' };
  R.SORT_NAMES = SORT_NAMES;
  R.sortLabel = function (s) {
    return SORT_NAMES[s.by] + '・' + (s.dir === 'desc' ? '倒序' : '正序');
  };

  R.chrome = function () {
    els.title.textContent = TITLES[A.tab] || '';
    var onList = A.tab === 'daily' || A.tab === 'general';
    els.btnEdit.classList.toggle('is-invisible', !onList);
    els.btnEdit.textContent = A.mode === 'edit' ? '完成' : '編輯';
    /* FAB：一般模式是「＋新增」（長按開圓弧面板）；編輯順序模式變成「✓ 結束編輯」 */
    els.fab.hidden = !onList;
    els.fab.classList.toggle('is-edit', A.mode === 'edit');
    els.fab.setAttribute('aria-label', A.mode === 'edit' ? '結束編輯順序' : '新增任務（長按開選單）');
    /* 搜尋列：有關鍵字或使用者剛打開時顯示；編輯模式顯示全部，所以收起 */
    els.searchBar.hidden = !(onList && A.mode === 'normal' && (A.query || A.searchOpen));

    /* 排序按鍵：圖示顯示正／倒序；非預設排序（自訂正序以外）時變主題色 */
    els.btnSort.classList.toggle('is-invisible', !onList);
    els.btnSort.classList.toggle('is-active', !A.sortIsDefault());
    els.btnSort.classList.toggle('is-desc', A.sort.dir === 'desc');
    els.btnSort.setAttribute('aria-label', '排序：' + R.sortLabel(A.sort));

    var active = A.filterActive();
    els.btnFilter.classList.toggle('is-invisible', !onList);
    els.btnFilter.classList.toggle('is-active', active);
    els.btnFilter.setAttribute('aria-pressed', active ? 'true' : 'false');
    /* 編輯模式顯示全部、不套篩選，所以篩選條也收起來 */
    els.filterBar.hidden = !(onList && active && A.mode === 'normal');
    if (!els.filterBar.hidden) els.filterText.textContent = filterSummary(A.filter);

    els.tabs.forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === A.tab ? 'true' : 'false');
    });
    Object.keys(els.views).forEach(function (k) {
      els.views[k].hidden = k !== A.tab;
    });
  };

  /* ---------- 統計 ---------- */
  var GRID_DAYS = 30;

  R.stats = function () {
    var host = els.stats;
    var tasks = A.sortedTasks('daily', 'edit');
    host.textContent = '';

    if (!tasks.length) {
      host.appendChild(A.el('p', 'empty', '還沒有日常任務，統計是空的。'));
      return;
    }

    tasks.forEach(function (t) {
      var s = A.statsFor(t);
      var unit = A.streakUnit(t);
      var box = A.el('div', 'stat-item');
      box.appendChild(A.el('div', 'stat-name', s.title));
      if (s.note) box.appendChild(A.el('div', 'stat-note', s.note));

      var meta = A.el('div', 'stat-meta');
      meta.appendChild(A.el('span', null, s.repeat));
      meta.appendChild(A.el('span', null, '目前連續 ' + s.streak + ' ' + unit));
      meta.appendChild(A.el('span', null, '最長 ' + s.longest + ' ' + unit));
      meta.appendChild(A.el('span', null, '總完成 ' + s.total + ' 次'));
      box.appendChild(meta);

      var grid = A.el('div', 'grid30');
      A.recentDays(t, GRID_DAYS).forEach(function (d) {
        var cls = 'cell';
        if (d.state === 'done') cls += ' is-done';
        else if (d.state === 'missed') cls += ' is-missed';
        var c = A.el('div', cls);
        c.title = d.date;
        grid.appendChild(c);
      });
      box.appendChild(grid);
      box.appendChild(A.el('p', 'grid-legend', '最近 ' + GRID_DAYS + ' 天　亮紫＝完成、深灰＝到期未完成'));

      host.appendChild(box);
    });
  };

  /* ---------- 全部 ---------- */
  R.all = function (opts) {
    opts = opts || {};
    R.chrome();
    R.list('daily', opts);
    R.list('general', opts);
    if (A.tab === 'stats') R.stats();
  };

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
