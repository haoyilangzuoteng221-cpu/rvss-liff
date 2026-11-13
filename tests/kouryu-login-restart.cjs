// src=test専用のログイン再確認。LINE SDK/GASはfixtureに置換し、実通信・実ログアウトはしない。
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..'), out = path.resolve(root, '../../tmp/login-source-fix-20261113');
fs.mkdirSync(out, { recursive: true });
const origin = 'https://haoyilangzuoteng221-cpu.github.io', base = origin + '/rvss-liff/kouryu/';
const gas = 'https://script.google.com/macros/s/fixture/exec';
const slot = { value: '11/15(日) 19:00〜19:20', label: '11/15(日) 19:00〜19:20', date: '2026-11-15', dateLabel: '11/15(日)', time: '19:00' };
let browser; const results = [];
async function setup(options = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  let reads = 0, posts = 0, navigations = 0, releaseSchedule;
  const gate = new Promise(resolve => { releaseSchedule = resolve; });
  page.on('pageerror', e => errors.push(e.message));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin + u.pathname === gas) {
      if (req.method() !== 'GET') { posts++; await route.abort(); return; }
      reads++; if (options.holdSchedule && reads === 2) { await gate; if (page.isClosed()) return; }
      await route.fulfill({ contentType: 'application/javascript', body: u.searchParams.get('callback') + '(' + JSON.stringify({ items: [slot] }) + ')' }); return;
    }
    if (u.hostname === 'static.line-scdn.net') {
      const profile = '{userId:"fixture-user",displayName:"検証用"}';
      await route.fulfill({ contentType: 'application/javascript', body: 'window.liff={' +
        'init:()=>Promise.resolve(),isLoggedIn:()=>!sessionStorage.getItem("fixture-logged-out"),' +
        'isInClient:()=>'+!!options.client+',getProfile:()=>'+(options.profileDelay ? 'new Promise(r=>{window.releaseFixtureProfile=()=>r('+profile+')})' : 'Promise.resolve('+profile+')')+',' +
        'login:o=>{window.loginArgs=o||{}},getAccessToken:()=>"fixture-token",' +
        'logout:()=>{'+(options.logoutError ? 'throw new Error("fixture-logout-error")' : 'sessionStorage.setItem("fixture-logged-out","1");sessionStorage.setItem("fixture-logout-count",String(1+Number(sessionStorage.getItem("fixture-logout-count")||0)))')+'}};' }); return;
    }
    if (u.hostname === 'rvss-dx-ten.vercel.app') { await route.fulfill({ contentType: 'application/javascript', body: '' }); return; }
    if (u.origin === origin && u.pathname.startsWith('/rvss-liff/')) {
      const rel = u.pathname.slice('/rvss-liff/'.length);
      if (rel === 'config.js') { await route.fulfill({ contentType: 'application/javascript', body: 'window.RVSS_CONFIG='+JSON.stringify({ GAS_ENDPOINT: gas, BOOKING_GAS_ENDPOINT: gas, LIFF_IDS: { kouryu: 'fixture' } }) }); return; }
      const file = path.join(root, rel.endsWith('/') ? rel+'index.html' : rel);
      const types = { '.js': 'application/javascript', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png' };
      await route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) }); return;
    }
    errors.push('unexpected request '+u.origin+u.pathname); await route.abort();
  });
  await page.goto(base+(options.query === undefined ? '?src=test' : options.query));
  if (options.profileDelay) await page.waitForFunction(() => typeof window.releaseFixtureProfile === 'function');
  else await page.waitForFunction(() => !!window.__kouryuT.ready);
  return { context, page, errors, releaseSchedule, reads: () => reads, posts: () => posts, navigations: () => navigations };
}
async function test(name, fn) { await fn(); results.push(name); console.log('PASS '+name); }
(async () => {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync'] });
  try {
    await test('通常src・欠損・不正・LINEアプリ内ではテストボタンを出さない', async () => {
      for (const options of [{query:'?src=richmenu_kouryu#timing'},{query:''},{query:'?src=bad%20value'},{client:true}]) {
        const x = await setup(options);
        try {
          assert.equal(await x.page.locator('#login-check').isVisible(), false);
          assert.equal(await x.page.locator('#login-restart').isDisabled(), true);
          await x.page.evaluate(() => document.getElementById('login-restart').click());
          assert.equal(await x.page.evaluate(() => sessionStorage.getItem('fixture-logout-count')), null);
          assert.equal(x.posts(), 0); assert.deepEqual(x.errors, []);
        } finally { await x.context.close(); }
      }
    });
    await test('testの外部ブラウザでもready前は非表示、ready後にだけ押せる', async () => {
      const x = await setup({profileDelay:true});
      try {
        assert.equal(await x.page.locator('#login-check').isVisible(), false);
        assert.equal(await x.page.locator('#login-restart').isDisabled(), true);
        await x.page.evaluate(() => window.releaseFixtureProfile());
        await x.page.locator('#login-check').waitFor({state:'visible'});
        assert.equal(await x.page.locator('#login-restart').isDisabled(), false);
        await x.page.locator('#login-check').scrollIntoViewIfNeeded();
        await x.page.screenshot({path:path.join(out,'kouryu-login-check.png')});
        assert.equal(await x.page.evaluate(() => document.documentElement.scrollWidth), 375);
        assert.deepEqual(x.errors, []);
      } finally { await x.context.close(); }
    });
    await test('送信中は無効化し、プログラム上のclickでもログアウトしない', async () => {
      const x = await setup({holdSchedule:true});
      try {
        await x.page.locator('#times button').first().click(); await x.page.locator('#submit').click();
        assert.equal(await x.page.locator('#login-restart').isDisabled(), true);
        await x.page.evaluate(() => document.getElementById('login-restart').click());
        assert.equal(await x.page.evaluate(() => sessionStorage.getItem('fixture-logout-count')), null);
        assert.equal(x.navigations(), 1); assert.equal(x.posts(), 0); assert.deepEqual(x.errors, []);
      } finally { await x.context.close(); x.releaseSchedule(); }
    });
    await test('公式logoutを1回呼びreload後の共通bootが同じsrcでloginする', async () => {
      const x = await setup();
      try {
        await x.page.locator('#login-restart').click();
        await x.page.waitForFunction(() => !!window.loginArgs);
        assert.equal(await x.page.evaluate(() => sessionStorage.getItem('fixture-logout-count')), '1');
        assert.equal(await x.page.evaluate(() => window.loginArgs.redirectUri), base+'?src=test');
        assert.equal(x.navigations(), 2); assert.equal(x.posts(), 0);
        assert.equal(await x.page.locator('#login-check').isVisible(), false); assert.deepEqual(x.errors, []);
      } finally { await x.context.close(); }
    });
    await test('logout失敗はエラーを表示し、再読込・予約成功・送信を起こさない', async () => {
      const x = await setup({logoutError:true});
      try {
        await x.page.locator('#login-restart').click();
        assert.match(await x.page.locator('#status').textContent(), /ログインの確認をやり直せません/);
        assert.equal(await x.page.locator('#login-restart').isDisabled(), false);
        assert.equal(await x.page.locator('#done').isVisible(), false);
        assert.equal(x.navigations(), 1); assert.equal(x.posts(), 0); assert.deepEqual(x.errors, []);
      } finally { await x.context.close(); }
    });
    console.log('PASS '+results.length+' 件（実通信なし）');
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out,'login-restart-qa.json'), JSON.stringify({ at:new Date().toISOString(),results,passed:results.length===5 },null,2));
  }
})().catch(e => { console.error(e); process.exitCode=1; });
