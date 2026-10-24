// 2026-10-24 セキュリティ点検①｜共通の送信（postToGas）が LINE のアクセストークンを POST の body に添えるか。
// VM で DOM の境界だけを模擬する。実通信・実送信はしない。
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'assets/liff-common.js'), 'utf8');
function setup(liff) {
  const forms = [];
  function node(tag) {
    return { tag, children: [], style: {}, appendChild(n) { this.children.push(n); return n; }, addEventListener(ev, fn) { if (ev === 'load') this.onload = fn; },
      submit() { forms.push(this); queueMicrotask(() => iframes.at(-1).onload()); }, get parentNode() { return { removeChild() {} }; } };
  }
  const iframes = [];
  const doc = { createElement: (t) => { const n = node(t); if (t === 'iframe') iframes.push(n); return n; }, body: node('body'), getElementById: () => null, head: node('head') };
  const win = { RVSS_CONFIG: { GAS_ENDPOINT: 'https://script.google.com/macros/s/fixture/exec', LIFF_TOKEN: '' }, location: { search: '' } };
  if (liff !== undefined) win.liff = liff;
  vm.runInNewContext(code, { window: win, document: doc, URLSearchParams, Object, String, Promise, Error, setTimeout, clearTimeout, queueMicrotask });
  const fields = () => Object.fromEntries(forms.at(-1).children.map((i) => [i.name, i.value]));
  return { RVSS: win.RVSS, forms, fields };
}
(async () => {
  let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };
  await test('ログイン済みならトークンを body に添える（URL には載せない）', async () => {
    const x = setup({ getAccessToken: () => 'fixture-access-token' });
    await x.RVSS.postToGas({ kind: 'interview', lineUserId: 'Uxx' });
    const f = x.fields();
    assert.equal(f.accessToken, 'fixture-access-token');
    assert.equal(f.kind, 'interview');
    assert.equal(x.forms[0].method, 'POST');
    assert.ok(!x.forms[0].action.includes('fixture-access-token'));
  });
  await test('トークンが取れない・liff が無い・例外のときは付けずに送る（画面は止めない）', async () => {
    for (const liff of [{ getAccessToken: () => null }, undefined, { getAccessToken: () => { throw new Error('x'); } }]) {
      const x = setup(liff);
      await x.RVSS.postToGas({ kind: 'watch' });
      assert.ok(!('accessToken' in x.fields()));
    }
  });
  await test('計測（journey）や対象外の種別には付けない', async () => {
    for (const kind of ['journey', 'gosetsu', '']) {
      const x = setup({ getAccessToken: () => 'fixture-access-token' });
      await x.RVSS.postToGas({ kind });
      assert.ok(!('accessToken' in x.fields()), kind);
    }
  });
  await test('送信する5画面は新しい liff-common.js を読む（端末に残った古い版で送らない）', async () => {
    for (const page of ['interview', 'mendan', 'watch', 'kouryu', 'rookies']) {
      const html = fs.readFileSync(path.join(root, page, 'index.html'), 'utf8');
      assert.match(html, /liff-common\.js\?v=20261024\.1"/, page);
    }
  });
  await test('面接の完了画面は Zoom を GAS から受け取る前提の文を残さない', async () => {
    const html = fs.readFileSync(path.join(root, 'interview/index.html'), 'utf8');
    assert.ok(!html.includes('日時とZoomのURLが予定に入ります'));
    assert.ok(!html.includes('前日までにLINEでお送りします'));
    assert.match(html, /ZoomのURLは、このあとLINEでお送りします。/);
  });
  console.log('PASS ' + n + ' 件');
})().catch((e) => { console.error(e); process.exit(1); });
