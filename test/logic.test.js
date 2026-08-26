/* 純邏輯測試（node 執行，不需瀏覽器）：node test/logic.test.js
   對應 ACCEPTANCE 的 A / B / C / F / G / H 各項可自動驗證的部分。 */
globalThis.App = {};
var path = require('path');
var root = path.join(__dirname, '..');
['util', 'store', 'model', 'sync'].forEach(function (m) {
  require(path.join(root, 'js', m + '.js'));
});
var A = globalThis.App;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want });
}
function group(t) { console.log('\n' + t); }

/* 建一份乾淨狀態 */
function setState(tasks, resetHour) {
  A.state = {
    schema_version: 1,
    updated_at: new Date(0).toISOString(),
    settings: { reset_hour: resetHour === undefined ? 4 : resetHour },
    tasks: tasks
  };
}
function daily(title, history, order, opts) {
  opts = opts || {};
  return {
    id: title, type: 'daily', title: title, note: opts.note || '',
    order_index: order || 1000, created_at: new Date(0).toISOString(),
    history: history || [],
    start_date: opts.start_date || (history && history.length ? history[0] : '2020-01-01'),
    repeat: { unit: opts.unit || 'day', interval: opts.interval || 1 }
  };
}
function general(title, completed_at, order) {
  return { id: title, type: 'general', title: title, note: '', order_index: order || 1000,
           created_at: new Date(0).toISOString(), completed_at: completed_at || null };
}
/* 讓 logicalToday() 可控 */
function freeze(y, m, d, h, mi) {
  A.logicalToday = function () { return A.logicalDate(new Date(y, m - 1, d, h, mi || 0), A.resetHour()); };
}

group('A. 日期與重置（reset_hour = 4）');
eq('A3 03:00 算前一天', A.logicalDate(new Date(2026, 7, 18, 3, 0), 4), '2026-08-17');
eq('A4 03:59 算前一天', A.logicalDate(new Date(2026, 7, 18, 3, 59), 4), '2026-08-17');
eq('A4 04:01 算當天', A.logicalDate(new Date(2026, 7, 18, 4, 1), 4), '2026-08-18');
eq('A2 05:00 算當天', A.logicalDate(new Date(2026, 7, 18, 5, 0), 4), '2026-08-18');
eq('A5 07:00（台灣早上）不得因 UTC 而變前一天',
   A.logicalDate(new Date(2026, 7, 18, 7, 0), 4), '2026-08-18');
eq('reset_hour = 0 時 00:30 就是當天', A.logicalDate(new Date(2026, 7, 18, 0, 30), 0), '2026-08-18');
eq('reset_hour = 2 時 01:00 算前一天', A.logicalDate(new Date(2026, 7, 18, 1, 0), 2), '2026-08-17');
eq('跨月：9/1 03:00 → 8/31', A.logicalDate(new Date(2026, 8, 1, 3, 0), 4), '2026-08-31');
eq('閏年 shiftDate', A.shiftDate('2024-02-28', 1), '2024-02-29');
eq('跨年 shiftDate', A.shiftDate('2025-12-31', 1), '2026-01-01');
eq('往前跨月 shiftDate', A.shiftDate('2026-03-01', -1), '2026-02-28');

group('A7 / A8 勾選與設定變更');
setState([daily('a')], 4);
freeze(2026, 8, 18, 10);
var t = A.state.tasks[0];
A.toggle(t);
eq('A1 勾選後今天已完成', A.isDoneToday(t), true);
eq('A7 取消勾選後移除紀錄', (A.toggle(t), t.history), []);
A.toggle(t);
var histBefore = t.history.slice();
A.state.settings.reset_hour = 2;
eq('A8 改 reset_hour 不動歷史', t.history, histBefore);

group('B. 連續天數');
setState([daily('s', [])], 4);
freeze(2026, 8, 18, 10);
eq('B1 沒有紀錄 → 0', A.streak(A.state.tasks[0]), 0);
setState([daily('s', ['2026-08-16', '2026-08-17', '2026-08-18'])], 4);
eq('B2 連續 3 天 → 3', A.streak(A.state.tasks[0]), 3);
setState([daily('s', ['2026-08-15', '2026-08-16', '2026-08-17'])], 4);
eq('B3 今天還沒勾但昨天有 → 仍是 3', A.streak(A.state.tasks[0]), 3);
setState([daily('s', ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-18'])], 4);
eq('B4 中斷後今天勾 → 1', A.streak(A.state.tasks[0]), 1);
eq('B4 最長連續 → 3', A.longestStreak(A.state.tasks[0]), 3);
setState([daily('s', ['2026-08-13', '2026-08-16'])], 4);
eq('前天以前才有紀錄 → 0', A.streak(A.state.tasks[0]), 0);
var many = [];
for (var i = 0; i < 400; i++) many.push(A.shiftDate('2026-08-18', -i));
many.sort();
setState([daily('s', many)], 4);
eq('B5 長歷史 streak', A.streak(A.state.tasks[0]), 400);
eq('B5 長歷史總數', A.state.tasks[0].history.length, 400);

group('週期：每日 / 每週 / 每月 / 每年');
setState([], 4);
var t3 = daily('t', [], 1000, { start_date: '2026-08-18', unit: 'day', interval: 3 });
eq('每 3 天：起始日到期', A.isDue(t3, '2026-08-18'), true);
eq('每 3 天：+1 天不到期', A.isDue(t3, '2026-08-19'), false);
eq('每 3 天：+3 天到期', A.isDue(t3, '2026-08-21'), true);
eq('起始日之前一律不到期', A.isDue(t3, '2026-08-17'), false);

var tw = daily('w', [], 1000, { start_date: '2026-08-18', unit: 'week', interval: 1 });
eq('每週：起始日（週二）到期', A.isDue(tw, '2026-08-18'), true);
eq('每週：隔天不到期', A.isDue(tw, '2026-08-19'), false);
eq('每週：下週同一天到期', A.isDue(tw, '2026-08-25'), true);
eq('每週：週中查詢回上一個到期日', A.dueOnOrBefore(tw, '2026-08-21'), '2026-08-18');

var tw2 = daily('w2', [], 1000, { start_date: '2026-08-18', unit: 'week', interval: 2 });
eq('每 2 週：下週不到期', A.isDue(tw2, '2026-08-25'), false);
eq('每 2 週：兩週後到期', A.isDue(tw2, '2026-09-01'), true);

var tm = daily('m', [], 1000, { start_date: '2026-01-31', unit: 'month', interval: 1 });
eq('每月 31 日：1/31 到期', A.isDue(tm, '2026-01-31'), true);
eq('每月 31 日：2 月夾到月底 2/28', A.isDue(tm, '2026-02-28'), true);
eq('每月 31 日：2/27 不到期', A.isDue(tm, '2026-02-27'), false);
eq('每月 31 日：3/31 到期', A.isDue(tm, '2026-03-31'), true);
eq('每月 31 日：3/30 不到期', A.isDue(tm, '2026-03-30'), false);

var tm2 = daily('m2', [], 1000, { start_date: '2026-08-18', unit: 'month', interval: 2 });
eq('每 2 個月：9/18 不到期', A.isDue(tm2, '2026-09-18'), false);
eq('每 2 個月：10/18 到期', A.isDue(tm2, '2026-10-18'), true);

var ty = daily('y', [], 1000, { start_date: '2024-02-29', unit: 'year', interval: 1 });
eq('每年 2/29：2024 到期', A.isDue(ty, '2024-02-29'), true);
eq('每年 2/29：非閏年夾到 2/28', A.isDue(ty, '2025-02-28'), true);
eq('每年 2/29：閏年回到 2/29', A.isDue(ty, '2028-02-29'), true);
eq('每年 2/29：2028-02-28 不到期', A.isDue(ty, '2028-02-28'), false);

eq('往前一期（每週）', A.stepDue(tw, '2026-08-25', -1), '2026-08-18');
eq('往後一期（每月夾月）', A.stepDue(tm, '2026-01-31', 1), '2026-02-28');
eq('往後一期（月底夾回 31）', A.stepDue(tm, '2026-02-28', 1), '2026-03-31');

group('連續期數（非每日週期）');
freeze(2026, 8, 25, 10);
setState([daily('w', ['2026-08-11', '2026-08-18', '2026-08-25'], 1000,
                { start_date: '2026-08-11', unit: 'week' })], 4);
eq('每週連續 3 期 → 3', A.streak(A.state.tasks[0]), 3);
freeze(2026, 8, 26, 10);                                    /* 週三，非到期日 */
eq('非到期日仍顯示 3（本期已完成）', A.streak(A.state.tasks[0]), 3);
setState([daily('w', ['2026-08-11', '2026-08-18'], 1000,
                { start_date: '2026-08-11', unit: 'week' })], 4);
freeze(2026, 8, 25, 10);
eq('本期未完成但上一期有 → 2（不歸零）', A.streak(A.state.tasks[0]), 2);
setState([daily('w', ['2026-08-04', '2026-08-18', '2026-08-25'], 1000,
                { start_date: '2026-08-04', unit: 'week' })], 4);
eq('中間漏一期 → 2', A.streak(A.state.tasks[0]), 2);
eq('最長連續期數 → 2', A.longestStreak(A.state.tasks[0]), 2);
setState([daily('m', ['2026-06-18', '2026-07-18', '2026-08-18'], 1000,
                { start_date: '2026-06-18', unit: 'month' })], 4);
freeze(2026, 8, 20, 10);
eq('每月連續 3 期 → 3', A.streak(A.state.tasks[0]), 3);

group('一般模式只顯示今天到期的日常任務');
freeze(2026, 8, 26, 10);                                    /* 週三 */
setState([
  daily('每天', [], 1000, { start_date: '2026-08-01', unit: 'day' }),
  daily('週二', [], 2000, { start_date: '2026-08-18', unit: 'week' }),
  daily('週三', [], 3000, { start_date: '2026-08-19', unit: 'week' }),
  daily('還沒開始', [], 4000, { start_date: '2026-09-01', unit: 'day' })
], 4);
eq('一般模式只留到期的',
   A.sortedTasks('daily', 'normal').map(function (x) { return x.title; }), ['每天', '週三']);
eq('編輯模式顯示全部',
   A.sortedTasks('daily', 'edit').map(function (x) { return x.title; }),
   ['每天', '週二', '週三', '還沒開始']);

group('勾選記在「本期」而非字面上的今天');
freeze(2026, 8, 26, 10);                                    /* 週三 */
setState([daily('w', [], 1000, { start_date: '2026-08-18', unit: 'week' })], 4);
A.toggle(A.state.tasks[0]);
eq('每週任務在非到期日勾選 → 記在上一個到期日',
   A.state.tasks[0].history, ['2026-08-25']);
setState([daily('d', [], 1000, { start_date: '2026-08-01', unit: 'day' })], 4);
A.toggle(A.state.tasks[0]);
eq('每日任務仍記在今天', A.state.tasks[0].history, ['2026-08-26']);

group('30 天格子的三種狀態');
freeze(2026, 8, 26, 10);
setState([daily('w', ['2026-08-18'], 1000, { start_date: '2026-08-11', unit: 'week' })], 4);
var cells = A.recentDays(A.state.tasks[0], 30);
eq('格子數', cells.length, 30);
eq('已完成的那天', cells.filter(function (c) { return c.state === 'done'; })
   .map(function (c) { return c.date; }), ['2026-08-18']);
eq('到期未完成的天數',
   cells.filter(function (c) { return c.state === 'missed'; }).map(function (c) { return c.date; }),
   ['2026-08-11', '2026-08-25']);
eq('其餘為非到期日', cells.filter(function (c) { return c.state === 'off'; }).length, 27);

group('註釋欄位');
setState([], 4);
var withNote = A.addTask('daily', { title: '喝水', note: '一天 2000ml', unit: 'day', interval: 1 });
eq('新增時寫入 note', withNote.note, '一天 2000ml');
eq('新增時給預設起始日與週期',
   [withNote.start_date === A.logicalToday(), withNote.repeat.unit, withNote.repeat.interval],
   [true, 'day', 1]);
A.updateTask(withNote.id, { title: '喝水', note: '', unit: 'week', interval: 2 });
eq('修改可清空 note 並換週期',
   [withNote.note, withNote.repeat.unit, withNote.repeat.interval], ['', 'week', 2]);

group('C. 排序');
freeze(2026, 8, 18, 10);
setState([
  daily('d1', [], 1000),
  daily('d2', ['2026-08-18'], 2000),
  daily('d3', [], 3000)
], 4);
eq('C1 一般模式：已完成沉底',
   A.sortedTasks('daily', 'normal').map(function (x) { return x.title; }),
   ['d1', 'd3', 'd2']);
eq('C2/C3 編輯模式：依 order_index 原位',
   A.sortedTasks('daily', 'edit').map(function (x) { return x.title; }),
   ['d1', 'd2', 'd3']);
setState([general('g1', null, 1000), general('g2', '2026-08-18T02:00:00.000Z', 2000),
          general('g3', null, 3000)], 4);
eq('C6 一般分頁不沉底',
   A.sortedTasks('general', 'normal').map(function (x) { return x.title; }),
   ['g1', 'g2', 'g3']);

group('C7 / §3.2 order_index');
setState([daily('d1', [], 1000), daily('d2', [], 2000), general('g1', null, 5000)], 4);
eq('新增 daily 取 max+1000', A.nextOrder('daily'), 3000);
eq('新增 general 取 max+1000', A.nextOrder('general'), 6000);
setState([], 4);
eq('空清單 → 1000', A.nextOrder('daily'), 1000);
setState([daily('d1', [], 1000), daily('d2', [], 2000), daily('d3', [], 3000)], 4);
A.applyOrder('daily', ['d3', 'd1', 'd2']);
eq('拖曳後重新指派 (i+1)*1000',
   A.sortedTasks('daily', 'edit').map(function (x) { return [x.title, x.order_index]; }),
   [['d3', 1000], ['d1', 2000], ['d2', 3000]]);

group('H. 清除已完成');
setState([daily('d1', ['2026-08-18'], 1000), general('g1', '2026-08-18T00:00:00.000Z', 1000),
          general('g2', null, 2000)], 4);
eq('H2 只刪 general 已完成', A.clearCompletedGeneral(), 1);
eq('H2 每日任務與未完成一般任務不受影響',
   A.activeTasks().map(function (x) { return x.title; }), ['d1', 'g2']);
ok('H2 被清除的物件仍在陣列中且有 deleted_at',
   A.state.tasks.length === 3 && A.findTask('g1').deleted_at != null);

group('F. 同步決策（§6.3）');
var L = function (n, when) { return { tasks: new Array(n).fill(0), updated_at: when }; };
eq('無遠端 → push', A.syncDecision(L(3, '2026-08-18T00:00:00Z'), null), 'push');
eq('F6 本機 0 筆、遠端有資料 → pull（硬規則）',
   A.syncDecision(L(0, '2026-08-18T00:00:00Z'), L(10, '2000-01-01T00:00:00Z')), 'pull');
eq('F5 遠端空且較舊 → push（不清空本機）',
   A.syncDecision(L(5, '2026-08-18T00:00:00Z'), L(0, '2000-01-01T00:00:00Z')), 'push');
eq('遠端較新 → pull',
   A.syncDecision(L(5, '2026-08-18T00:00:00Z'), L(7, '2026-08-19T00:00:00Z')), 'pull');
eq('本機較新 → push',
   A.syncDecision(L(5, '2026-08-19T00:00:00Z'), L(7, '2026-08-18T00:00:00Z')), 'push');
eq('相同 → noop',
   A.syncDecision(L(5, '2026-08-18T00:00:00Z'), L(5, '2026-08-18T00:00:00Z')), 'noop');
eq('雙方皆空 → noop',
   A.syncDecision(L(0, '2026-08-18T00:00:00Z'), L(0, '2026-08-18T00:00:00Z')), 'noop');
ok('F3 匯出內容不含 PAT', (function () {
  setState([daily('d1', ['2026-08-18'])], 4);
  return JSON.stringify(A.state).indexOf('gist_token') < 0 &&
         JSON.stringify(A.state).indexOf('ghp_') < 0;
})());

group('G. 匯入驗證（§6.4）');
ok('G1 亂碼 → 拒絕', A.parsePayload('這不是 JSON').ok === false);
ok('G2 tasks 非陣列 → 拒絕', A.parsePayload('{"schema_version":1,"tasks":"abc"}').ok === false);
ok('G2 缺 schema_version → 拒絕', A.parsePayload('{"tasks":[]}').ok === false);
ok('G3 版本過新 → 拒絕', A.parsePayload('{"schema_version":99,"tasks":[]}').ok === false);
ok('G3 v2 可接受', A.parsePayload('{"schema_version":2,"tasks":[]}').ok === true);
ok('G3 錯誤訊息提到版本',
   /版本/.test(A.parsePayload('{"schema_version":99,"tasks":[]}').error));
var good = A.parsePayload(JSON.stringify({
  schema_version: 1,
  updated_at: '2026-08-18T00:00:00.000Z',
  settings: { reset_hour: 4 },
  tasks: [{ id: 'x', type: 'daily', title: '喝水', order_index: 1000,
            created_at: '2026-08-01T00:00:00.000Z', history: ['2026-08-02', '2026-08-01'] }]
}));
ok('G4 合法 JSON → 通過', good.ok === true);
eq('history 排序去重', good.state.tasks[0].history, ['2026-08-01', '2026-08-02']);

group('v1 → v2 遷移');
var migrated = A.checkPayload({
  schema_version: 1, updated_at: '2026-08-18T00:00:00.000Z', settings: { reset_hour: 4 },
  tasks: [{ id: 'a', type: 'daily', title: '喝水', order_index: 1000,
            created_at: '2026-08-01T00:00:00.000Z',
            history: ['2026-08-16', '2026-08-17', '2026-08-18'] },
          { id: 'b', type: 'general', title: '繳費', order_index: 1000,
            created_at: '2026-08-01T00:00:00.000Z', completed_at: null }]
});
ok('v1 資料仍可匯入', migrated.ok === true);
eq('升級為現行版本', migrated.state.schema_version, A.SCHEMA_VERSION);
eq('start_date 取最早歷史紀錄（連續紀錄不斷掉）',
   migrated.state.tasks[0].start_date, '2026-08-16');
eq('補上每日週期', migrated.state.tasks[0].repeat, { unit: 'day', interval: 1 });
eq('補上空 note', migrated.state.tasks[0].note, '');
ok('一般任務不會被塞入週期欄位', migrated.state.tasks[1].repeat === undefined);
eq('difficulty 無損保留（本 App 不用但不可丟）', A.normalizeState({ tasks: [
  { type: 'daily', title: 'x', difficulty: 4 }] }).tasks[0].difficulty, 4);
ok('v3 備份可匯入', A.parsePayload('{"schema_version":3,"tasks":[]}').ok === true);
A.state = migrated.state;
A.logicalToday = function () { return '2026-08-18'; };
eq('遷移後連續天數仍是 3', A.streak(A.state.tasks[0]), 3);

group('正規化修復');
var n = A.normalizeState({
  tasks: [
    { type: 'daily', title: ' 空白會被 trim ', history: ['2026-08-01', '2026-08-01', 'bad', '2026-02-30'] },
    { type: 'general', title: '', completed_at: null },
    { type: '???', title: '未知型別當一般', completed_at: 'x' },
    'not an object'
  ],
  settings: { reset_hour: 99 }
});
eq('丟掉無名稱與非物件的項目', n.tasks.length, 2);
eq('trim 標題', n.tasks[0].title, '空白會被 trim');
eq('過濾非法日期並去重', n.tasks[0].history, ['2026-08-01']);
eq('未知型別 → general', n.tasks[1].type, 'general');
eq('reset_hour 夾在 0..23', n.settings.reset_hour, 23);
ok('自動補 order_index', typeof n.tasks[0].order_index === 'number');
ok('自動補 start_date', A.isDateStr(n.tasks[0].start_date));
eq('非法 repeat 退回每日', A.normalizeState({ tasks: [
  { type: 'daily', title: 'x', repeat: { unit: '???', interval: -5 } }] }).tasks[0].repeat,
  { unit: 'day', interval: 1 });
eq('note 會 trim', A.normalizeState({ tasks: [
  { type: 'daily', title: 'x', note: '  有空白  ' }] }).tasks[0].note, '有空白');

group('軟刪除：集中過濾');
setState([daily('d1', ['2026-08-01', '2026-08-02'], 1000), daily('d2', [], 2000),
          general('g1', null, 1000)], 4);
freeze(2026, 8, 18, 10);
ok('刪除前 activeTasks 看得到', A.activeTasks('daily').length === 2);
ok('軟刪除成功', A.softDeleteTask('d1') === true);
eq('activeTasks 不再回傳已刪除的',
   A.activeTasks('daily').map(function (t) { return t.title; }), ['d2']);
eq('沒有 type 時也過濾', A.activeTasks().map(function (t) { return t.title; }), ['d2', 'g1']);
ok('物件仍在陣列裡', A.state.tasks.length === 3);
ok('deleted_at 是 ISO 字串', /^\d{4}-\d{2}-\d{2}T/.test(A.findTask('d1').deleted_at));
eq('history 完全沒被動', A.findTask('d1').history, ['2026-08-01', '2026-08-02']);
eq('order_index 完全沒被動', A.findTask('d1').order_index, 1000);
ok('重複刪除不覆寫時間', (function () {
  var before = A.findTask('d1').deleted_at;
  return A.softDeleteTask('d1') === false && A.findTask('d1').deleted_at === before;
})());
eq('排序不含已刪除（一般模式）',
   A.sortedTasks('daily', 'normal').map(function (t) { return t.title; }), ['d2']);
eq('排序不含已刪除（編輯模式）',
   A.sortedTasks('daily', 'edit').map(function (t) { return t.title; }), ['d2']);
eq('deletedTasks 只回傳已刪除的',
   A.deletedTasks().map(function (t) { return t.title; }), ['d1']);

group('軟刪除：order_index 不受已刪除者影響');
setState([daily('a', [], 1000), daily('b', [], 2000), daily('c', [], 3000)], 4);
A.softDeleteTask('c');
eq('新增任務的索引以未刪除者最大值為基準，並跳過已刪除者佔用的 3000',
   A.nextOrder('daily'), 4000);
var added = A.addTask('daily', { title: 'd' });
eq('新任務排在最後', added.order_index, 4000);
eq('新任務不與已刪除者的索引重複',
   A.activeTasks('daily').map(function (t) { return [t.title, t.order_index]; }),
   [['a', 1000], ['b', 2000], ['d', 4000]]);
ok('已刪除者仍保有自己的 3000', A.findTask('c').order_index === 3000);
A.applyOrder('daily', A.sortedTasks('daily', 'edit').map(function (t) { return t.id; }));
eq('拖曳重排只重排未刪除者',
   A.activeTasks('daily').map(function (t) { return [t.title, t.order_index]; }),
   [['a', 1000], ['b', 2000], ['d', 3000]]);
eq('已刪除者的索引不被改寫', A.findTask('c').order_index, 3000);

group('軟刪除：還原與永久刪除');
setState([daily('keep', [], 1000), daily('gone', ['2026-08-01', '2026-08-02', '2026-08-03'], 2000)], 4);
freeze(2026, 8, 3, 10);
eq('刪除前連續 3 天', A.streak(A.findTask('gone')), 3);
A.softDeleteTask('gone');
var restored = A.restoreTask('gone');
ok('還原回傳任務', !!restored);
eq('deleted_at 歸零', restored.deleted_at, null);
eq('還原後排到最後（未刪除者最大值 + 1000，不因自己的舊索引而多跳）',
   restored.order_index, 2000);
eq('還原後連續天數完整恢復', A.streak(A.findTask('gone')), 3);
eq('還原後歷史完整', A.findTask('gone').history, ['2026-08-01', '2026-08-02', '2026-08-03']);
ok('還原不存在的任務回 null', A.restoreTask('沒這個') === null);
setState([daily('x', [], 1000), daily('y', [], 5000)], 4);
A.softDeleteTask('y');
A.restoreTask('y');
eq('還原時取未刪除者最大值 + 1000', A.findTask('y').order_index, 2000);
ok('永久刪除真的移除物件',
   (A.softDeleteTask('y'), A.purgeTask('y') === true && A.state.tasks.length === 1));
ok('永久刪除不存在的 id 回 false', A.purgeTask('沒這個') === false);

group('軟刪除：遷移與序列化');
var noField = A.normalizeState({ tasks: [
  { id: 'a', type: 'daily', title: '舊資料', order_index: 1000, history: [] }] });
eq('舊備份沒有 deleted_at → 視為未刪除', noField.tasks[0].deleted_at, null);
var withField = A.normalizeState({ tasks: [
  { id: 'a', type: 'daily', title: 'x', order_index: 1000, history: [],
    deleted_at: '2026-08-18T00:00:00.000Z' }] });
eq('已刪除標記會保留', withField.tasks[0].deleted_at, '2026-08-18T00:00:00.000Z');
eq('非字串的 deleted_at 視為未刪除', A.normalizeState({ tasks: [
  { id: 'a', type: 'daily', title: 'x', order_index: 1000, history: [], deleted_at: 123 }]
}).tasks[0].deleted_at, null);
A.state = A.normalizeState({ tasks: [
  { id: 'a', type: 'daily', title: '在', order_index: 1000, history: ['2026-08-01'] },
  { id: 'b', type: 'daily', title: '刪了', order_index: 2000, history: ['2026-08-02'],
    deleted_at: '2026-08-18T00:00:00.000Z' }] });
ok('序列化（匯出 / mirror / gist）包含已刪除的任務',
   JSON.stringify(A.state).indexOf('刪了') >= 0);
eq('但清單只看得到未刪除的',
   A.activeTasks('daily').map(function (t) { return t.title; }), ['在']);

group('軟刪除：同步決策刻意計入已刪除者');
eq('本機只剩已刪除的任務且較新 → 上傳（刪除要傳播出去，不可被遠端蓋回）',
   A.syncDecision({ tasks: [{ deleted_at: '2026-08-18T00:00:00Z' }],
                    updated_at: '2026-08-18T10:00:00Z' },
                  { tasks: [{ deleted_at: null }], updated_at: '2026-08-18T09:00:00Z' }), 'push');
eq('真正空白的本機（0 筆）仍走硬規則拉回',
   A.syncDecision({ tasks: [], updated_at: '2026-08-18T10:00:00Z' },
                  { tasks: [{ deleted_at: null }], updated_at: '2000-01-01T00:00:00Z' }), 'pull');

group('標籤：正規化');
eq('逗號／全形逗號／頓號／換行分隔、去空白、去開頭 #、去重',
   A.normTags(' 家務, 健康、#家務 ，, 運動\n讀書 '), ['家務', '健康', '運動', '讀書']);
eq('陣列輸入', A.normTags(['a', 'a', ' b ', 3, '']), ['a', 'b']);
eq('非字串／非陣列 → 空', [A.normTags(null), A.normTags(42), A.normTags(undefined)], [[], [], []]);
eq('上限 10 個', A.normTags('1,2,3,4,5,6,7,8,9,10,11,12').length, 10);
eq('單一標籤截到 20 字', A.normTags('一二三四五六七八九十一二三四五六七八九十二十一')[0].length, 20);
setState([]);
var tg = A.addTask('general', { title: 't', tags: 'x, y' });
eq('addTask 寫入 tags', tg.tags, ['x', 'y']);
A.updateTask(tg.id, { title: 't', tags: 'z' });
eq('updateTask 覆寫 tags', A.findTask(tg.id).tags, ['z']);
A.updateTask(tg.id, { title: 't2' });
eq('updateTask 未給 tags 時不動它', A.findTask(tg.id).tags, ['z']);
var normed = A.normalizeState({ tasks: [{ id: 'a', type: 'general', title: 'a', tags: ['q', 'q', ' r '] },
                                       { id: 'b', type: 'daily', title: 'b' }] });
eq('normalizeState 正規化 tags，沒有就空陣列', normed.tasks.map(function (t) { return t.tags; }), [['q', 'r'], []]);

group('篩選：normFilter / allTags / matches');
eq('normFilter 空值', A.normFilter(null), { tags: [], from: null, to: null });
eq('normFilter 起迄顛倒會調換', A.normFilter({ from: '2026-08-20', to: '2026-08-10' }),
   { tags: [], from: '2026-08-10', to: '2026-08-20' });
eq('normFilter 壞日期丟掉', A.normFilter({ from: '2026-13-40', to: 'x', tags: 'a' }),
   { tags: ['a'], from: null, to: null });
eq('filterActive', [A.filterActive(A.normFilter(null)), A.filterActive(A.normFilter({ tags: ['a'] })),
                    A.filterActive(A.normFilter({ to: '2026-01-01' }))], [false, true, true]);

setState([
  Object.assign(daily('每日', [], 1000, { start_date: '2026-01-01' }), { tags: ['健康'] }),
  Object.assign(daily('每週一', [], 2000, { start_date: '2026-08-03', unit: 'week' }), { tags: ['健康'] }),
  Object.assign(general('買菜', null, 1000), { tags: ['家務'], created_at: '2026-08-10T12:00:00Z' }),
  Object.assign(general('繳費', '2026-08-15T12:00:00Z', 2000), { tags: [], created_at: '2026-08-01T12:00:00Z' }),
  Object.assign(general('已刪', null, 3000), { tags: ['不該出現'], deleted_at: '2026-08-01T00:00:00Z' })
]);
eq('allTags 只算未刪除者、次數多的在前', A.allTags(), ['健康', '家務']);
eq('matchesTags 空＝全部', A.matchesTags(A.findTask('繳費'), []), true);
eq('matchesTags 多選為 OR', [A.matchesTags(A.findTask('買菜'), ['健康', '家務']),
                             A.matchesTags(A.findTask('繳費'), ['健康', '家務'])], [true, false]);

var wk = A.findTask('每週一');
eq('dueInRange 區間內沒有到期日', A.dueInRange(wk, '2026-08-04', '2026-08-09'), false);
eq('dueInRange 區間含到期日 8/10', A.dueInRange(wk, '2026-08-04', '2026-08-10'), true);
eq('dueInRange 起迄同日＝只看那天', [A.dueInRange(wk, '2026-08-10', '2026-08-10'),
                                     A.dueInRange(wk, '2026-08-11', '2026-08-11')], [true, false]);
eq('dueInRange 只填迄日：迄日早於起始日 → 無', A.dueInRange(wk, null, '2026-08-02'), false);
eq('dueInRange 只填迄日：迄日在起始日之後 → 有', A.dueInRange(wk, null, '2026-08-03'), true);
eq('dueInRange 只填起日：週期無限延續 → 一律有', A.dueInRange(wk, '2030-01-01', null), true);

eq('generalInRange 看建立日', [A.generalInRange(A.findTask('買菜'), '2026-08-10', '2026-08-10'),
                               A.generalInRange(A.findTask('買菜'), '2026-08-11', null),
                               A.generalInRange(A.findTask('買菜'), null, '2026-08-09')], [true, false, false]);
eq('generalInRange 也看完成日', A.generalInRange(A.findTask('繳費'), '2026-08-15', '2026-08-15'), true);

A.filter = A.normFilter({ tags: ['家務'] });
eq('sortedTasks 一般模式套標籤篩選（一般分頁）', A.sortedTasks('general', 'normal').map(function (t) { return t.title; }), ['買菜']);
eq('sortedTasks 編輯模式不套篩選', A.sortedTasks('general', 'edit').map(function (t) { return t.title; }), ['買菜', '繳費']);
A.filter = A.normFilter({ from: '2026-08-04', to: '2026-08-09' });
eq('sortedTasks 日期篩選取代「今天到期」：每日有到期、每週一沒有',
   A.sortedTasks('daily', 'normal').map(function (t) { return t.title; }), ['每日']);
A.filter = A.normFilter({ from: '2026-08-15', to: '2026-08-15' });
eq('sortedTasks 一般分頁日期篩選：完成於 8/15 的繳費',
   A.sortedTasks('general', 'normal').map(function (t) { return t.title; }), ['繳費']);
A.filter = A.normFilter(null);
eq('清除篩選後一般分頁回到全部', A.sortedTasks('general', 'normal').map(function (t) { return t.title; }), ['買菜', '繳費']);

group('排序：normSort / compareTasks / sortedTasks');
eq('normSort 空值＝自訂正序', A.normSort(null), { by: 'custom', dir: 'asc' });
eq('normSort 壞值退回預設', A.normSort({ by: 'nope', dir: 'sideways' }), { by: 'custom', dir: 'asc' });
eq('sortIsDefault', [A.sortIsDefault(A.normSort(null)), A.sortIsDefault(A.normSort({ dir: 'desc' })),
                     A.sortIsDefault(A.normSort({ by: 'alpha' }))], [true, false, false]);
eq('compareTitles 數字優先且 2 < 10', ['b', '10', 'a', '2'].sort(A.compareTitles), ['2', '10', 'a', 'b']);
eq('compareTitles 數字 < 英文 < 中文', ['中', 'a', '1'].sort(A.compareTitles), ['1', 'a', '中']);
setState([
  Object.assign(general('香蕉', null, 3000), { created_at: '2026-08-03T00:00:00Z' }),
  Object.assign(general('apple', null, 1000), { created_at: '2026-08-02T00:00:00Z' }),
  Object.assign(general('10 件事', null, 2000), { created_at: '2026-08-01T00:00:00Z' }),
  Object.assign(general('2 件事', null, 4000), { created_at: '2026-08-04T00:00:00Z' })
]);
var names = function (type, mode) { return A.sortedTasks(type, mode).map(function (t) { return t.title; }); };
A.sort = A.normSort(null);
eq('自訂正序＝order_index', names('general', 'normal'), ['apple', '10 件事', '香蕉', '2 件事']);
A.sort = A.normSort({ by: 'custom', dir: 'desc' });
eq('自訂倒序', names('general', 'normal'), ['2 件事', '香蕉', '10 件事', 'apple']);
A.sort = A.normSort({ by: 'created', dir: 'asc' });
eq('建立日期正序（舊→新）', names('general', 'normal'), ['10 件事', 'apple', '香蕉', '2 件事']);
A.sort = A.normSort({ by: 'created', dir: 'desc' });
eq('建立日期倒序（新→舊）', names('general', 'normal'), ['2 件事', '香蕉', 'apple', '10 件事']);
A.sort = A.normSort({ by: 'alpha', dir: 'asc' });
eq('字母正序：數字（2<10）→ 英文 → 中文', names('general', 'normal'), ['2 件事', '10 件事', 'apple', '香蕉']);
A.sort = A.normSort({ by: 'alpha', dir: 'desc' });
eq('字母倒序', names('general', 'normal'), ['香蕉', 'apple', '10 件事', '2 件事']);
eq('編輯模式固定自訂正序，不受排序設定影響', names('general', 'edit'), ['apple', '10 件事', '香蕉', '2 件事']);
setState([
  Object.assign(daily('b', [], 2000, { start_date: '2020-01-01' }), { created_at: '2026-08-02T00:00:00Z' }),
  Object.assign(daily('a', [A.logicalToday()], 1000, { start_date: '2020-01-01' }), { created_at: '2026-08-01T00:00:00Z' })
]);
A.sort = A.normSort({ by: 'alpha', dir: 'asc' });
eq('日常分頁：已完成仍沉底，未完成者之間才套排序', names('daily', 'normal'), ['b', 'a']);
A.sort = A.normSort(null);
eq('同值以 order_index 決勝（穩定）', (function () {
  setState([Object.assign(general('x', null, 2000), { created_at: 'same' }),
            Object.assign(general('y', null, 1000), { created_at: 'same' })]);
  A.sort = A.normSort({ by: 'created' });
  var r = names('general', 'normal'); A.sort = A.normSort(null); return r;
})(), ['y', 'x']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
