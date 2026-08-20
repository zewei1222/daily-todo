import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:8732/daily-todo/';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), { got: g, want: w });
const group = t => console.log('\n' + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,accept,content-type,x-github-api-version',
  'Content-Type': 'application/json'
};

/* ---- 假的 gist 伺服器 ---- */
const server = { gists: {}, log: [], nextId: 1, offline: false };
function handle(method, path, body) {
  server.log.push({ method, path, body: body ? JSON.parse(body) : null });
  if (method === 'GET' && path.startsWith('/gists?')) {
    return Object.values(server.gists).map(g => ({ id: g.id, public: g.public,
      updated_at: g.updated_at, files: { 'todo-backup.json': { filename: 'todo-backup.json' } } }));
  }
  if (method === 'POST' && path === '/gists') {
    const id = 'gist' + (server.nextId++);
    const content = JSON.parse(body).files['todo-backup.json'].content;
    server.gists[id] = { id, public: JSON.parse(body).public, updated_at: new Date().toISOString(), content };
    return { id };
  }
  const m = path.match(/^\/gists\/([^/?]+)$/);
  if (m) {
    const g = server.gists[m[1]];
    if (!g) return { __status: 404, message: 'Not Found' };
    if (method === 'GET') {
      return { id: g.id, updated_at: g.updated_at,
               files: { 'todo-backup.json': { content: g.content, truncated: false } } };
    }
    if (method === 'PATCH') {
      g.content = JSON.parse(body).files['todo-backup.json'].content;
      g.updated_at = new Date().toISOString();
      return { id: g.id };
    }
  }
  return { __status: 404, message: 'Not Found' };
}
const remoteState = () => {
  const g = Object.values(server.gists)[0];
  return g ? JSON.parse(g.content) : null;
};
const pushes = () => server.log.filter(r => r.method === 'PATCH' || (r.method === 'POST' && r.path === '/gists'));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome',
  headless: 'shell', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];

async function newPage(ctx) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (!r.url().includes('api.github.com')) { r.continue(); return; }
    if (server.offline) { r.abort('internetdisconnected'); return; }
    if (r.method() === 'OPTIONS') { r.respond({ status: 204, headers: CORS }); return; }
    const path = r.url().replace('https://api.github.com', '');
    const res = handle(r.method(), path, r.postData());
    const status = res && res.__status ? res.__status : 200;
    r.respond({ status, headers: CORS, body: JSON.stringify(res) });
  });
  return page;
}
const setPat = (page, pat) => page.evaluate(pat => {
  document.querySelector('#btn-settings').click();
  document.querySelector('#input-pat').value = pat;
  document.querySelector('#btn-pat-save').click();
}, pat);
const add = (page, title) => page.evaluate(t => {
  App.addTask('daily', { title: t }); App.render.list('daily', { animate: false }); App.save();
}, title);
const titles = page => page.$$eval('#list-daily .card-title', ns => ns.map(n => n.textContent));
const status = page => page.$eval('#sync-status', e => e.textContent);

/* ================================================================== */
group('F1 / F2 / F3 首次設定與自動上傳');
const ctx = await browser.createBrowserContext();
let page = await newPage(ctx);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await add(page, '喝水');
await setPat(page, 'ghp_test_token_123');
await sleep(800);
eq('F1 建立 gist 後狀態為已同步', await status(page), '已同步');
const created = server.log.find(r => r.method === 'POST' && r.path === '/gists');
ok('F1 gist 為 private', created && created.body.public === false, created && created.body.public);
ok('F1 檔名為 todo-backup.json', !!(created && created.body.files['todo-backup.json']));
eq('F1 gist_id 已保存', await page.evaluate(() => !!localStorage.getItem('gist_id')), true);
eq('F1 遠端內容含任務', remoteState().tasks.map(t => t.title), ['喝水']);
ok('F3 遠端內容不含 PAT', !/ghp_|gist_token/.test(JSON.stringify(server.gists)));

await add(page, '運動');
await sleep(3600);                       /* debounce 3 秒 */
eq('F2 新增後自動 PATCH 上去', remoteState().tasks.map(t => t.title), ['喝水', '運動']);
eq('F2 狀態仍為已同步', await status(page), '已同步');

group('E5 離線編輯 → 恢復連線');
server.offline = true;
await page.setOfflineMode(true);
await add(page, '離線加的');
await sleep(3600);
eq('E5 離線時顯示離線待同步', await status(page), '離線待同步');
eq('E5 遠端尚未變更', remoteState().tasks.length, 2);
server.offline = false;
await page.setOfflineMode(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await sleep(900);
eq('E5 恢復連線後轉為已同步', await status(page), '已同步');
eq('E5 變更已上傳', remoteState().tasks.map(t => t.title), ['喝水', '運動', '離線加的']);
await ctx.close();

/* ================================================================== */
group('F4 清空本機資料後用同一 PAT 還原');
{
  const ctx2 = await browser.createBrowserContext();
  const p2 = await newPage(ctx2);
  await p2.goto(URL, { waitUntil: 'domcontentloaded' });
  eq('新裝置一開始沒有資料', (await titles(p2)).length, 0);
  server.log.length = 0;
  await setPat(p2, 'ghp_test_token_123');
  await sleep(1200);
  ok('F4 有去列出 gists 尋找備份', server.log.some(r => r.path.startsWith('/gists?')));
  eq('F4 資料完整還原', await titles(p2), ['喝水', '運動', '離線加的']);
  eq('F4 狀態為已同步', await status(p2), '已同步');
  eq('F6 本機空白時未上傳空資料', pushes().length, 0);
  await ctx2.close();
}

/* ================================================================== */
group('F5 遠端被改成空且時間較舊 → 不得清空本機');
{
  const ctx3 = await browser.createBrowserContext();
  const p3 = await newPage(ctx3);
  await p3.goto(URL, { waitUntil: 'domcontentloaded' });
  await add(p3, '本機重要資料');
  await setPat(p3, 'ghp_test_token_123');
  await sleep(1200);
  /* 手動把遠端改成空、時間設成過去 */
  const gid = Object.keys(server.gists)[0];
  server.gists[gid].content = JSON.stringify({
    schema_version: 1, updated_at: '2000-01-01T00:00:00.000Z',
    settings: { reset_hour: 4 }, tasks: []
  });
  server.log.length = 0;
  await p3.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);
  ok('F5 本機資料還在', (await titles(p3)).includes('本機重要資料'), await titles(p3));
  ok('F5 以本機覆蓋遠端', remoteState().tasks.length >= 1, remoteState());
  await ctx3.close();
}

/* ================================================================== */
group('F6 本機 0 筆、遠端有資料 → 拉回且不覆蓋');
{
  const gid = Object.keys(server.gists)[0];
  server.gists[gid].content = JSON.stringify({
    schema_version: 1, updated_at: '2000-01-01T00:00:00.000Z', settings: { reset_hour: 4 },
    tasks: Array.from({ length: 10 }, (_, i) => ({
      id: 'r' + i, type: 'daily', title: '遠端' + i, order_index: (i + 1) * 1000,
      created_at: '2026-01-01T00:00:00.000Z', history: [] }))
  });
  const ctx4 = await browser.createBrowserContext();
  const p4 = await newPage(ctx4);
  await p4.goto(URL, { waitUntil: 'domcontentloaded' });
  server.log.length = 0;
  await setPat(p4, 'ghp_test_token_123');
  await sleep(1500);
  eq('F6 拉回 10 筆（即使遠端 updated_at 較舊）', (await titles(p4)).length, 10);
  eq('F6 完全沒有上傳動作', pushes().length, 0);
  eq('F6 遠端仍是 10 筆', remoteState().tasks.length, 10);
  await ctx4.close();
}

/* ================================================================== */
group('gist 被刪掉的情況');
{
  const ctx5 = await browser.createBrowserContext();
  const p5 = await newPage(ctx5);
  await p5.goto(URL, { waitUntil: 'domcontentloaded' });
  await add(p5, '重建測試');
  await setPat(p5, 'ghp_test_token_123');
  await sleep(1200);
  const before = Object.keys(server.gists).length;
  Object.keys(server.gists).forEach(k => delete server.gists[k]);
  await p5.evaluate(() => App.sync.startup());
  await sleep(1200);
  eq('gist 不存在時自動重建', Object.keys(server.gists).length, 1);
  eq('重建後狀態為已同步', await status(p5), '已同步');
  ok('重建後遠端有本機資料', remoteState().tasks.some(t => t.title === '重建測試'));
  await ctx5.close();
}

/* ================================================================== */
group('[16] 已刪除任務必須進入 gist 備份');
{
  const ctx6 = await browser.createBrowserContext();
  const p6 = await newPage(ctx6);
  await p6.goto(URL, { waitUntil: 'domcontentloaded' });
  await add(p6, '留著的');
  await add(p6, '要刪的');
  await setPat(p6, 'ghp_test_token_123');
  await sleep(1200);

  await p6.evaluate(() => {
    const t = App.activeTasks('daily').find(x => x.title === '要刪的');
    t.history = ['2026-08-01', '2026-08-02'];
    App.softDeleteTask(t.id);
    App.save();
    App.render.list('daily', { animate: false });
  });
  await sleep(3600);                        /* debounce 3 秒 */

  const remote = remoteState();
  const deleted = remote.tasks.find(t => t.title === '要刪的');
  ok('[16] gist 內容包含已刪除任務', !!deleted, remote.tasks.map(t => t.title));
  ok('[16] deleted_at 一起上傳', deleted && !!deleted.deleted_at, deleted && deleted.deleted_at);
  eq('[16] history 一併保留', deleted.history, ['2026-08-01', '2026-08-02']);
  eq('[16] 未刪除的任務不受影響',
     remote.tasks.filter(t => t.deleted_at == null).map(t => t.title), ['留著的']);
  eq('[16] 狀態為已同步', await status(p6), '已同步');

  /* 從備份還原到新裝置時，已刪除的仍是已刪除 */
  const ctx7 = await browser.createBrowserContext();
  const p7 = await newPage(ctx7);
  await p7.goto(URL, { waitUntil: 'domcontentloaded' });
  await setPat(p7, 'ghp_test_token_123');
  await sleep(1500);
  eq('[16] 新裝置拉回後清單只有未刪除的', await titles(p7), ['留著的']);
  eq('[16] 已刪除的任務也一起拉回（未被丟棄）',
     await p7.evaluate(() => [App.state.tasks.length, App.deletedTasks().length]), [2, 1]);
  await ctx6.close();
  await ctx7.close();
}

console.log('\npage errors: ' + (errors.length ? JSON.stringify(errors) : 'none'));
ok('無 page error', errors.length === 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail ? 1 : 0);
