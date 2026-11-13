// LINE・GASへの実通信なし。共通起動の戻り先と、質問会の認証前→onReady→申込bodyを検証する。
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'assets/liff-common.js'), 'utf8');
const origin = 'https://haoyilangzuoteng221-cpu.github.io';
const app = origin + '/rvss-liff';
const base = app + '/kouryu/';
const stateQuery = value => '?liff.state=' + encodeURIComponent(value);
const results = [];
async function test(name, fn) { await fn(); results.push(name); console.log('PASS ' + name); }
function fixture(url, options = {}) {
  const location = new URL(url), loginCalls = [], ready = [];
  const win = { location, RVSS_CONFIG: { LIFF_IDS: { kouryu: 'fixture', interview: 'fixture', watch: 'fixture' } } };
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('流入元を過去の端末記録から取らない'); } });
  const liff = win.liff = {
    init: async () => { if (options.rewriteOnInit) location.search = ''; },
    isLoggedIn: () => !!options.loggedIn,
    login: args => loginCalls.push(args),
    getProfile: async () => ({ displayName: '検証用', userId: 'fixture-user' })
  };
  vm.runInNewContext(code, { window: win, liff, document: { getElementById: () => null }, URLSearchParams, Promise, setTimeout, clearTimeout });
  return { RVSS: win.RVSS, loginCalls, ready, async boot(opts = {}) {
    win.RVSS.boot({ liffKey: 'kouryu', onReady: (profile, src) => ready.push({ profile, src }), ...opts });
    await new Promise(resolve => setImmediate(resolve));
  } };
}
async function unitTests() {
  await test('共通bootの戻り先未指定は従来どおり引数なしのloginを呼ぶ', async () => {
    const before = fixture(base + '?src=test'); await before.boot();
    assert.equal(before.loginCalls.length, 1); assert.equal(before.ready.length, 0);
    assert.equal(before.loginCalls[0], undefined);
  });
  await test('既ログインでは認証遷移せず現在URLのsrcを渡す', async () => {
    const x = fixture(base + '?src=richmenu_kouryu', { loggedIn: true }); await x.boot();
    assert.equal(x.ready[0].src, 'richmenu_kouryu'); assert.equal(x.loginCalls.length, 0);
  });
  await test('src欠損・空・不正はunknown、過去のlocalStorageは読まない', async () => {
    for (const query of ['', '?src=', '?src=a%20b', '?src=%ZZ', '?src=' + 'a'.repeat(41), '?src=%3Cscript%3E']) {
      const x = fixture(base + query); await x.boot();
      assert.equal(x.RVSS.readSrc(), 'unknown', query); assert.equal(x.loginCalls[0], undefined);
    }
  });
  await test('通常URL・パス付きLIFF state・入れ子stateのsrcを読む', async () => {
    for (const query of ['?src=koho_1', stateQuery('?src=koho_1'), stateQuery('/kouryu/?src=koho_1'), stateQuery('/kouryu/' + stateQuery('?src=koho_1'))]) {
      const x = fixture(base + query); await x.boot();
      assert.equal(x.RVSS.readSrc(), 'koho_1');
    }
  });
  await test('fragmentはクエリに混ぜず、fragmentだけのsrcは採用しない', async () => {
    for (const [query, expected] of [
      ['?src=test#timing', 'test'], ['#src=test', 'unknown'],
      [stateQuery('?src=test#timing'), 'test'], [stateQuery('?src=test#&src=other'), 'test'],
      [stateQuery('/#?src=test'), 'unknown'], [stateQuery('/?other=x#?src=test'), 'unknown'],
      [stateQuery(stateQuery('?src=test#timing')), 'test']
    ]) assert.equal(fixture(base + query).RVSS.readSrc(), expected, query);
  });
  await test('内側srcを優先し、内側が空/不正ならunknown・同階層重複は既存の先頭値を保持', async () => {
    for (const [query, expected] of [
      ['?src=outer&liff.state=' + encodeURIComponent('?src=inner'), 'inner'],
      ['?src=outer&liff.state=' + encodeURIComponent('?src='), 'unknown'],
      ['?src=outer&liff.state=' + encodeURIComponent('?src=bad%20value'), 'unknown'],
      ['?src=first&src=second', 'first'], ['?src=&src=test', 'unknown'],
      [stateQuery('?src=first&src=second'), 'first'], [stateQuery('%E0%A4%A'), 'unknown']
    ]) assert.equal(fixture(base + query).RVSS.readSrc(), expected, query);
  });
  await test('深いstateでも処理を打ち切り、例外を出さない', async () => {
    let q = '?src=test'; for (let i = 0; i < 7; i++) q = stateQuery(q);
    assert.equal(fixture(base + q).RVSS.readSrc(), 'unknown');
  });
  await test('明示entrySrcも検証し、不正ならunknownをonReadyに渡す', async () => {
    const x = fixture(base + '?src=url'); await x.boot({ entrySrc: 'bad value' });
    assert.equal(x.loginCalls[0], undefined);
    const y = fixture(base + '?src=url', { loggedIn: true }); await y.boot({ entrySrc: 'bad value' });
    assert.equal(y.ready[0].src, 'unknown');
  });
  await test('interview/watchの明示redirectUriとVIAを変更しない', async () => {
    for (const page of ['interview', 'watch']) {
      const redirect = app + '/' + page + '/?src=od_m1' + (page === 'interview' ? '&via=od' : '');
      const x = fixture(app + '/' + page + '/?src=url');
      await x.boot({ liffKey: page, entrySrc: 'od_m1', loginRedirectUri: redirect });
      assert.equal(x.loginCalls[0].redirectUri, redirect);
    }
    const html = fs.readFileSync(path.join(root, 'interview/index.html'), 'utf8');
    assert.match(html, /loginRedirectUri:[^\n]+VIA \? '&via=' \+ VIA/);
    assert.match(fs.readFileSync(path.join(root, 'watch/index.html'), 'utf8'), /loginRedirectUri:/);
  });
  await test('liff.initがURLを書き換えても認証開始前のsrcを使う', async () => {
    const x = fixture(base + '?src=test', { rewriteOnInit: true }); await x.boot({ loginRedirectUri: base + '?src=test' });
    assert.equal(x.loginCalls[0].redirectUri, base + '?src=test');
    const y = fixture(base + '?src=test', { rewriteOnInit: true, loggedIn: true }); await y.boot();
    assert.equal(y.ready[0].src, 'test');
  });
}
async function browserTests() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync'] });
  const gas = 'https://script.google.com/macros/s/source-fixture/exec', booking = 'https://script.google.com/macros/s/booking-fixture/exec';
  const slot = { value: '11/15(日) 19:00〜19:20', label: '11/15(日) 19:00〜19:20', date: '2026-11-15', dateLabel: '11/15(日)', time: '19:00' };
  try {
    for (const [name, query, expected, loggedIn] of [
      ['未ログインtest', '?src=test', 'test', false],
      ['未ログイン通常入口・機微query除外', '?src=richmenu_kouryu&code=fixture-code&state=fixture-state&access_token=fixture-access&id_token=fixture-id&name=fixture-name&lineUserId=fixture-user#timing', 'richmenu_kouryu', false],
      ['未ログイン欠損', '', 'unknown', false],
      ['未ログイン不正', '?src=bad%20value', 'unknown', false],
      ['未ログイン入れ子state', stateQuery(stateQuery('?src=test#timing')), 'test', false],
      ['既ログイン', '?src=test', 'test', true]
    ]) await test('実ページ：' + name + 'の入口→onReady→申込bodyが一致', async () => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
      const page = await context.newPage(), requests = [], errors = [];
      let authenticated = loggedIn;
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (u.origin + u.pathname === gas) {
          assert.equal(req.method(), 'GET');
          await route.fulfill({ contentType: 'application/javascript', body: u.searchParams.get('callback') + '(' + JSON.stringify({ items: [slot] }) + ')' }); return;
        }
        if (req.url() === booking) {
          assert.equal(req.method(), 'POST'); const body = Object.fromEntries(new URLSearchParams(req.postData())); requests.push(body);
          const message = { type: 'rvss-booking', requestId: body.requestId, result: { ok: false, kind: 'kouryu', error: 'login_required' } };
          await route.fulfill({ contentType: 'text/html', body: '<script>window.top.postMessage(' + JSON.stringify(message) + ',' + JSON.stringify(origin) + ')</script>' }); return;
        }
        if (u.hostname === 'static.line-scdn.net') {
          await route.fulfill({ contentType: 'application/javascript', body: 'window.liff={init:()=>Promise.resolve(),isLoggedIn:()=>'+authenticated+',login:o=>{window.loginArgs=o||{}},getProfile:()=>Promise.resolve({userId:"fixture-user",displayName:"検証用"}),getAccessToken:()=>"fixture-token"};' }); return;
        }
        if (u.hostname === 'rvss-dx-ten.vercel.app') { await route.fulfill({ contentType: 'application/javascript', body: '' }); return; }
        if (u.origin === origin && u.pathname.startsWith('/rvss-liff/')) {
          const rel = u.pathname.slice('/rvss-liff/'.length);
          if (rel === 'config.js') {
            await route.fulfill({ contentType: 'application/javascript', body: 'window.RVSS_CONFIG=' + JSON.stringify({ GAS_ENDPOINT: gas, BOOKING_GAS_ENDPOINT: booking, LIFF_IDS: { kouryu: 'fixture' } }) }); return;
          }
          const file = path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel);
          const types = { '.js': 'application/javascript', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg' };
          let body = fs.readFileSync(file);
          if (rel === 'assets/liff-common.js') body = body.toString() + '\n(function(){var boot=RVSS.boot;RVSS.boot=function(opts){var ready=opts.onReady;opts.onReady=function(p,s){window.readySource=s;ready(p,s)};return boot(opts)}})();';
          await route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body }); return;
        }
        errors.push('unexpected request ' + u.origin + u.pathname); await route.abort();
      });
      try {
        await page.goto(base + query);
        if (!authenticated) {
          await page.waitForFunction(() => !!window.loginArgs);
          const redirect = await page.evaluate(() => window.loginArgs.redirectUri);
          assert.equal(redirect, base + '?src=' + expected); assert.equal(requests.length, 0);
          authenticated = true; await page.goto(redirect);
        }
        await page.waitForFunction(() => typeof window.readySource === 'string');
        assert.equal(await page.evaluate(() => window.readySource), expected);
        assert.equal(await page.evaluate(() => window.loginArgs), undefined);
        await page.locator('#times button').first().click(); await page.locator('#submit').click();
        await page.waitForFunction(() => document.getElementById('status').textContent.includes('完了はまだ確認できていません'));
        assert.equal(requests.length, 1); assert.equal(requests[0].src, expected); assert.equal(requests[0].kind, 'kouryu');
        assert.equal(requests[0].name, (expected === 'test' ? 'テスト ' : '') + '検証用');
        assert.equal(requests[0].accessToken, 'fixture-token'); assert.equal(requests[0].planDate, slot.value);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
}
(async () => {
  await unitTests();
  if (!process.env.SOURCE_UNIT_ONLY) await browserTests();
  console.log('PASS ' + results.length + ' 件（実通信なし）');
})().catch(e => { console.error(e); process.exitCode = 1; });
