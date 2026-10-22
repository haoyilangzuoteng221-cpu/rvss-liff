/** 外部向けAI分科会の申込（10/30・11/2を選べる。両日も可。押すのはボタン1つ）。
 * 回ごとの日時・題・講師・Zoomは専用GASの 開催設定.js だけが持ち、この画面は応答をそのまま出す（画面に日時を書かない）。
 * 名前は入力させず、サーバーが検証したLINEの表示名で記録する。
 */
(function (global) {
  'use strict';
  var ENDPOINT = (global.RVSS_BUNKAKAI_ENTRY || {}).endpoint || '';
  var GOOGLE = /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
  var params = new URLSearchParams(global.location.search);
  var preview = /^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) && params.get('preview') === '1';
  var source = global.RVSS.readSrc(), sending = false, slots = [], friend = '';
  var join = document.getElementById('join');
  function randomId() { var b = new Uint8Array(16); global.crypto.getRandomValues(b); return Array.from(b).map(function (n) { return n.toString(16).padStart(2, '0'); }).join(''); }
  /** 確認用（?preview=1）。&case=registered（10/30申込済み）／all（両日申込済み）／nofriend／failed／none（全回が準備中）。保存も送信もしない。 */
  function mock(data) {
    var c = params.get('case') || '';
    if (c === 'none' && data.action === 'bootstrap') return {ok:true, action:'bootstrap', slots:[]};
    var s = [{id:'ai_20261030', label:'10月30日（金）22:00〜22:30', title:'“いい感じ”をカタチにする！ChatGPT画像生成とデザインの基本', teacher:'ゆいな（日本大学芸術学部）'},
      {id:'ai_20261102', label:'11月2日（月）〔確認用〕', title:'', teacher:''}];
    if (data.action === 'bootstrap') return {ok:true, action:'bootstrap', slots:s.map(function (x, i) {
      var reg = c === 'all' || (c === 'registered' && i === 0);
      return Object.assign({}, x, {closed:false, registered:reg, notified:reg, responseId:reg ? '確認用' : '', zoom:''});
    })};
    var sent = c !== 'nofriend' && c !== 'failed';
    return {ok:true, action:'submit', responseId:'確認用・保存なし', notified:sent, items:s.filter(function (x) { return data.slotIds.split(',').indexOf(x.id) >= 0; })
      .map(function (x) { return {id:x.id, label:x.label, responseId:'確認用', zoom:sent ? '' : 'https://example.invalid/zoom/' + x.id}; })};
  }
  function post(data) {
    if (preview) return new Promise(function (resolve) { setTimeout(function () { resolve(mock(data)); }, 400); });
    return new Promise(function (resolve, reject) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(ENDPOINT)) { reject(new Error('not_ready')); return; }
      var id = randomId(), frame = document.createElement('iframe'), f = document.createElement('form'), timer;
      frame.name = 'bunkakai_' + id; frame.hidden = true; f.target = frame.name; f.hidden = true; f.method = 'POST'; f.action = ENDPOINT;
      var payload = Object.assign({}, data, {kind:'bunkakai_entry', requestId:id, receiverOrigin:global.location.origin});
      Object.keys(payload).forEach(function (key) { var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = String(payload[key] == null ? '' : payload[key]); f.appendChild(input); });
      function clean() { clearTimeout(timer); global.removeEventListener('message', receive); f.remove(); frame.remove(); }
      function receive(e) {
        var m = e.data;
        if (!GOOGLE.test(e.origin) || !e.source || e.source === global || !m || m.type !== 'rvss-bunkakai-entry' || m.requestId !== id || !m.result || m.result.action !== data.action) return;
        clean(); if (m.result.ok !== true) reject(new Error(m.result.error || 'save_failed'));
        else if (data.action === 'submit' && !m.result.responseId) reject(new Error('save_failed')); else resolve(m.result);
      }
      global.addEventListener('message', receive); timer = setTimeout(function () { clean(); reject(new Error('no_response')); }, 45000);
      document.body.appendChild(frame); document.body.appendChild(f);
      try { f.submit(); } catch (e) { clean(); reject(e); }
    });
  }
  function errorText(code) { return ({not_ready:['参加申込は準備中です。', '公式LINEのご案内を', 'お待ちください。'].join('\n'), login_required:'LINEから開き直して、もう一度お試しください。', closed:'選んだ回の受付は終了しました。ページを開き直してください。', invalid_input:'ページを開き直して、もう一度お試しください。', no_response:'予約の確認ができませんでした。もう一度押すと、同じ内容で確かめ直します。', busy:'ただいま混み合っています。少し待ってから、もう一度押してください。'})[code] || '予約を保存できませんでした。もう一度押してください。'; }
  function token() { if (preview) return ''; var t = global.liff.getAccessToken(); if (!t) throw new Error('login_required'); return t; }
  /** スマホ幅で語が泣き別れしないよう、意味の切れ目で改行する（pre-line）。 */
  function dateLines(label) { return String(label).replace('）', '）\n'); }
  function titleLines(title) { return String(title).replace(/！(?=.)/, '！\n'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function boxes() { return [].slice.call(document.querySelectorAll('#sessions input:not(:disabled)')); }
  function chosen() { return boxes().filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
  function update() { var n = chosen().length; join.disabled = sending || !n; join.textContent = n > 1 ? '両日に参加する' : '参加する'; }
  function renderForm() {
    var box = document.getElementById('sessions'); box.textContent = '';
    slots.forEach(function (s) {
      if (s.closed && !s.registered) return;
      var label = el('label', 'session' + (s.registered ? ' is-done' : '')), input = el('input'), body = el('span', 'session-body');
      input.type = 'checkbox'; input.value = s.id; input.disabled = !!(s.registered || s.closed);
      body.appendChild(el('strong', 'session-when', dateLines(s.label)));
      if (s.title) body.appendChild(el('span', 'session-title', titleLines(s.title)));
      if (s.teacher) body.appendChild(el('small', 'session-teacher', '講師：' + s.teacher));
      if (s.registered) body.appendChild(el('em', 'badge', '申込済み'));
      label.appendChild(input); label.appendChild(body); box.appendChild(label);
      input.addEventListener('change', update);
    });
    // 選べる回が1つだけなら最初から選んでおく（押すのはボタン1つ）
    var free = boxes(); if (free.length === 1) free[0].checked = true;
    update();
    global.RVSS.hide('done'); global.RVSS.show('form-area');
  }
  /** done＝{id,label,zoom}の並び。notified＝公式LINEに届いたか。 */
  function showDone(done, notified, already, receipt) {
    global.RVSS.hide('form-area'); global.RVSS.show('done');
    document.getElementById('done-title').textContent = already ? 'お申し込み済みです' : '予約が完了しました';
    var list = document.getElementById('done-list'); list.textContent = '';
    done.forEach(function (d) { list.appendChild(el('li', '', dateLines(d.label))); });
    // 受付番号はUUID。2回分並ぶと長いので、照合に足りる先頭8文字だけ出す。
    document.getElementById('receipt').textContent = receipt ? '受付番号：' + String(receipt).split(',').map(function (x) { return x.slice(0, 8); }).join('・') : '';
    var zoomBox = document.getElementById('zoom-buttons'); zoomBox.textContent = '';
    var withZoom = notified ? [] : done.filter(function (d) { return d.zoom; });
    withZoom.forEach(function (d) {
      var b = el('button', 'join zoom-open', (done.length > 1 ? d.label.split('）')[0] + '）の' : '') + 'Zoomを開く'); b.type = 'button';
      b.addEventListener('click', function () { openZoom(d.zoom); }); zoomBox.appendChild(b);
    });
    document.getElementById('done-line').hidden = !notified;
    document.getElementById('fallback').hidden = !withZoom.length;
    document.getElementById('friend-link').hidden = friend !== '0';
    document.getElementById('fallback-text').textContent = friend === '0'
      ? '公式LINEの友だちではないため、\nLINEのお知らせが届きません。\n当日は、下のボタンから\nZoomに入れます。'
      : '公式LINEへのお知らせを\n送れませんでした。\n当日は、下のボタンから\nZoomに入れます。';
    document.getElementById('add-more').hidden = !slots.some(function (s) { return !s.registered && !s.closed; });
  }
  /** Zoom はLINE内ブラウザでなく外で開く（会員用 /bunkakai/ と同じ）。 */
  function openZoom(url) {
    try { if (global.liff && global.liff.isInClient && global.liff.isInClient()) { global.liff.openWindow({url:url, external:true}); return; } } catch (_) {}
    global.location.href = url;
  }
  function boot() {
    post({action:'bootstrap', accessToken:token()}).then(function (r) {
      slots = r.slots || []; if (!slots.length) throw new Error('not_ready');
      global.RVSS.hide('loading');
      var open = slots.filter(function (s) { return !s.closed; });
      if (open.length && open.every(function (s) { return s.registered; })) {
        var mine = slots.filter(function (s) { return s.registered; });
        showDone(mine, mine.every(function (s) { return s.notified; }), true, mine.map(function (s) { return s.responseId; }).join(','));
      } else renderForm();
    }).catch(function (e) { global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText(e.message), e.message === 'not_ready' ? '' : 'err'); });
  }
  join.addEventListener('click', function () {
    var ids = chosen(); if (sending || !ids.length) return;
    var access; try { access = token(); } catch (err) { global.RVSS.setStatus(errorText(err.message), 'err'); return; }
    sending = true; update(); join.textContent = '予約しています…'; global.RVSS.setStatus('', '');
    post({action:'submit', accessToken:access, slotIds:ids.join(','), src:source, friend:friend}).then(function (r) {
      var items = r.items || [];
      items.forEach(function (it) { slots.forEach(function (s) { if (s.id === it.id) { s.registered = true; s.notified = r.notified; } }); });
      showDone(items, r.notified, !!r.dedup, r.responseId);
    }).catch(function (err) { global.RVSS.setStatus(errorText(err.message), 'err'); })
      .finally(function () { sending = false; update(); });
  });
  document.getElementById('add-more').addEventListener('click', renderForm);
  if (preview) { global.RVSS.show('preview-note'); friend = params.get('case') === 'nofriend' ? '0' : '1'; boot(); }
  else if (!ENDPOINT) { global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText('not_ready'), ''); }
  else global.RVSS.boot({liffKey:'bunkakai', loginRedirectUri:global.location.origin + global.location.pathname + '?src=' + encodeURIComponent(source), onReady:function () {
    // 友だちでない人には確認LINEが届かない。分かれば送らずに画面へZoomを出す。読めなければ送る側に倒す。
    Promise.resolve().then(function () { return global.liff.getFriendship(); })
      .then(function (f) { friend = f && f.friendFlag ? '1' : '0'; }, function () { friend = ''; })
      .then(boot);
  }});
})(window);
