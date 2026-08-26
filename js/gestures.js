/* gestures.js — 點擊與左滑刪除。1:1 跟手、無長按、同時只有一張露出（SPEC §4.2 / §7.5）。
   點擊分兩側：卡片左側色塊（.card-side）切換完成，右側（.card-body）開編輯。 */
(function (A) {
  'use strict';

  var G = {};
  A.gestures = G;

  var openRow = null;   /* 目前露出刪除按鈕的 row */
  var st = null;        /* 進行中的指標狀態 */

  function tok() {
    return {
      actionW: A.token('--swipe-action-w', 96),
      openAt:  A.token('--swipe-open-at', 44),
      extra:   A.token('--swipe-max-extra', 28),
      slop:    A.token('--swipe-tap-slop', 8),
      dur:     A.token('--dur-mid', 200)
    };
  }

  function ease() {
    return getComputedStyle(document.documentElement)
             .getPropertyValue('--ease-out').trim() || 'ease-out';
  }

  function setX(card, x, animate) {
    card.style.transition = animate ? ('transform ' + tok().dur + 'ms ' + ease()) : 'none';
    card.style.transform = x ? 'translateX(' + x + 'px)' : '';
  }

  G.closeOpen = function (animate) {
    if (!openRow) return;
    var row = openRow;
    openRow = null;
    row.classList.remove('is-over');
    var card = A.$('.card', row);
    if (card) setX(card, 0, animate !== false);
  };

  G.isOpen = function (row) { return openRow === row; };

  function openIt(row, card) {
    openRow = row;
    setX(card, -tok().actionW, true);
  }

  /* ---------- 指標事件 ---------- */
  function onDown(e) {
    if (!e.isPrimary || e.button > 0) return;
    var t = e.target;
    if (t.closest('.drag-handle')) return;      /* 交給 Sortable */
    if (t.closest('.btn-del')) return;          /* 交給 click */

    var row = t.closest('.row');
    if (!row) return;
    var card = A.$('.card', row);
    if (!card) return;

    var swallow = false;
    if (openRow && openRow !== row) { G.closeOpen(true); swallow = true; }
    else if (openRow === row) { swallow = true; }

    st = {
      id: e.pointerId,
      row: row,
      card: card,
      target: t,
      x0: e.clientX,
      y0: e.clientY,
      baseX: swallow && openRow === row ? -tok().actionW : 0,
      phase: 'undecided',
      swallow: swallow
    };

    card.classList.add(t.closest('.card-side') ? 'is-press-side' : 'is-press');
    try { card.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function unpress(card) { card.classList.remove('is-press', 'is-press-side'); }

  function onMove(e) {
    if (!st || e.pointerId !== st.id) return;
    var dx = e.clientX - st.x0;
    var dy = e.clientY - st.y0;
    var k = tok();

    if (st.phase === 'undecided') {
      if (Math.abs(dx) > k.slop && Math.abs(dx) > Math.abs(dy)) {
        st.phase = 'swipe';
        unpress(st.card);
      } else if (Math.abs(dy) > k.slop) {
        st.phase = 'scroll';                    /* 讓瀏覽器捲動，不再介入 */
        unpress(st.card);
        return;
      } else {
        return;
      }
    }
    if (st.phase !== 'swipe') return;

    if (e.cancelable) e.preventDefault();
    var x = st.baseX + dx;
    var min = -(k.actionW + k.extra);
    if (x > 0) x = 0;
    if (x < min) x = min;
    setX(st.card, x, false);
    st.row.classList.toggle('is-over', x <= -k.actionW);
    st.lastX = x;
  }

  function finish(e) {
    if (!st || (e && e.pointerId !== st.id)) return;
    var s = st;
    st = null;
    unpress(s.card);
    try { s.card.releasePointerCapture(s.id); } catch (err) {}

    if (s.phase === 'swipe') {
      var x = s.lastX || 0;
      if (x <= -tok().openAt) openIt(s.row, s.card);
      else { openRow = (openRow === s.row) ? null : openRow; s.row.classList.remove('is-over'); setX(s.card, 0, true); }
      return;
    }

    if (s.phase === 'scroll') return;

    /* 保險：iOS 有時會直接接手捲動而不送 pointermove／pointercancel，
       所以放手時再用實際位移確認一次，位移過大就不算點擊。 */
    if (e && (Math.abs(e.clientX - s.x0) > tok().slop ||
              Math.abs(e.clientY - s.y0) > tok().slop)) return;

    /* 點擊 */
    if (s.swallow) { G.closeOpen(true); return; }
    tapCard(s.row, s.target);
  }

  function onCancel(e) {
    if (!st || (e && e.pointerId !== st.id)) return;
    var s = st;
    st = null;
    unpress(s.card);
    if (s.phase === 'swipe') {
      if (openRow === s.row) setX(s.card, -tok().actionW, true);
      else { s.row.classList.remove('is-over'); setX(s.card, 0, true); }
    }
  }

  /* ---------- 動作 ---------- */
  function tapCard(row, target) {
    var task = A.findTask(row.dataset.id);
    if (!task) return;

    /* 編輯順序模式：只能拖曳把手排序，點卡片任何位置都不切換完成、也不開編輯 */
    if (A.mode === 'edit') return;

    /* 左側色塊：切換完成 */
    if (target.closest('.card-side')) {
      A.toggle(task);
      A.render.list(task.type, { animate: true });
      if (A.tab === 'stats') A.render.stats();
      A.save();
      return;
    }

    /* 右側：編輯任務 */
    if (A.openTaskSheet) A.openTaskSheet(task);
  }

  function onClick(e) {
    var del = e.target.closest('.btn-del');
    if (!del) return;
    var row = del.closest('.row');
    if (!row) return;
    var id = row.dataset.id;
    var task = A.findTask(id);
    if (!task) return;
    var type = task.type;
    G.closeOpen(false);
    A.softDeleteTask(id);
    A.render.list(type, { animate: true });
    if (A.tab === 'stats') A.render.stats();
    A.save();
  }

  /* ---------- 掛載 ---------- */
  G.attach = function (listEl) {
    listEl.addEventListener('pointerdown', onDown);
    listEl.addEventListener('pointermove', onMove, { passive: false });
    listEl.addEventListener('pointerup', finish);
    listEl.addEventListener('pointercancel', onCancel);
    listEl.addEventListener('click', onClick);
  };

  G.attachScrollClose = function (viewEl) {
    viewEl.addEventListener('scroll', function () { G.closeOpen(true); }, { passive: true });
  };

  /* 點畫面其他地方也收回（清單內的點擊由 onDown 處理） */
  document.addEventListener('pointerdown', function (e) {
    if (!openRow) return;
    if (e.target.closest('.list')) return;
    G.closeOpen(true);
  }, true);

})(typeof globalThis !== 'undefined'
   ? (globalThis.App = globalThis.App || {})
   : (window.App = window.App || {}));
