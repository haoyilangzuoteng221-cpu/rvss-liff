/** 外部向けAI分科会の申込（10/30・11/2を選べる。両日も可。押すのはボタン1つ）。
 * 回ごとの日時・題・講師・参加リンクは専用GASの 開催設定.js だけが持ち、この画面は応答をそのまま出す（画面に日時を書かない）。
 * 名前は入力させず、サーバーが検証したLINEの表示名で記録する。
 */
(function (global) {
  'use strict';
  var ENDPOINT = (global.RVSS_BUNKAKAI_ENTRY || {}).endpoint || '';
  var GOOGLE = /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
  var params = new URLSearchParams(global.location.search);
  var preview = /^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) && params.get('preview') === '1';
  var source = global.RVSS.readSrc(), sending = false, slots = [], friend = '';
  // 表示を速くするため、回の一覧（本人確認なしで出せる日時・題）を先に出し、LINEの本人確認と申込済みの確認は後から重ねる。
  var liffReady = false, confirmed = false, friendP = Promise.resolve('');
  var join = document.getElementById('join');
  function randomId() { var b = new Uint8Array(16); global.crypto.getRandomValues(b); return Array.from(b).map(function (n) { return n.toString(16).padStart(2, '0'); }).join(''); }
  /** 確認用（?preview=1）。&case=registered（10/30申込済み）／all（両日申込済み）／nofriend／failed／none（全回が準備中）／one（10/30だけ公開）。保存も送信もしない。 */
  function mock(data) {
    var c = params.get('case') || '';
    if (c === 'none' && data.action === 'bootstrap') return {ok:true, action:'bootstrap', slots:[]};
    var s = [{id:'ai_20261030', label:'10月30日（金）22:00〜22:30', title:'“いい感じ”をカタチにする！ChatGPT画像生成とデザインの基本', teacher:''},
      {id:'ai_20261102', label:'11月2日（月）22:00〜22:30', title:'意外と知らない、ChatGPTでできること3選', teacher:''}];
    if (c === 'one') s = s.slice(0, 1);
    if (data.action === 'bootstrap') return {ok:true, action:'bootstrap', slots:s.map(function (x, i) {
      var reg = c === 'all' || (c === 'registered' && i === 0);
      return Object.assign({}, x, {closed:false, registered:reg, notified:reg, responseId:reg ? '確認用' : '', url:''});
    })};
    var sent = c !== 'nofriend' && c !== 'failed';
    return {ok:true, action:'submit', responseId:'確認用・保存なし', notified:sent, items:s.filter(function (x) { return data.slotIds.split(',').indexOf(x.id) >= 0; })
      .map(function (x) { return {id:x.id, label:x.label, responseId:'確認用', url:sent ? '' : 'https://example.invalid/join/' + x.id}; })};
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
  function titleLines(title) { var t = String(title); return /！(?=.)/.test(t) ? t.replace(/！(?=.)/, '！\n') : t.replace(/、(?=.)/, '、\n'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function boxes() { return [].slice.call(document.querySelectorAll('#sessions input:not(:disabled)')); }
  function chosen() { return boxes().filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
  // 押せるのはLINEの本人確認（liff.init）が済んでから。カードはそれより先に出す。
  function update() { var n = chosen().length; join.disabled = sending || !n || !liffReady; join.textContent = !liffReady ? '読み込み中…' : n > 1 ? '両日に参加する' : '参加する'; }
  /** 前回この端末で取れた回の一覧（公開の日時・題だけ）。開いた瞬間に出し、届いた最新で差し替える。
   * 置き場はGASの開催設定の1か所のまま（ここは控え）。6時間より古い控えは使わない。保存できない端末では何もしない。 */
  var CACHE_KEY = 'rvssBunkakaiSlots', CACHE_MS = 6 * 3600000;
  function loadCache() { try { var c = JSON.parse(global.localStorage.getItem(CACHE_KEY) || 'null'); return c && Date.now() - c.at < CACHE_MS && c.slots && c.slots.length ? c.slots : null; } catch (_) { return null; } }
  function saveCache(list) {
    try { global.localStorage.setItem(CACHE_KEY, JSON.stringify({at:Date.now(), slots:list.map(function (s) { return {id:s.id, label:s.label, title:s.title || '', teacher:s.teacher || ''}; })})); } catch (_) {}
  }
  function renderForm() {
    var box = document.getElementById('sessions'), keep = chosen(); box.textContent = '';
    slots.forEach(function (s) {
      if (s.closed && !s.registered) return;
      var label = el('label', 'session' + (s.registered ? ' is-done' : '')), input = el('input'), body = el('span', 'session-body');
      input.type = 'checkbox'; input.value = s.id; input.disabled = !!(s.registered || s.closed);
      input.checked = !input.disabled && keep.indexOf(s.id) >= 0;   // 先に出したカードで選んだものは、申込済みの確認が届いても外さない
      body.appendChild(el('strong', 'session-when', dateLines(s.label)));
      if (s.title) body.appendChild(el('span', 'session-title', titleLines(s.title)));
      if (s.teacher) body.appendChild(el('small', 'session-teacher', '講師：' + s.teacher));
      if (s.registered) body.appendChild(el('em', 'badge', '申込済み'));
      label.appendChild(input); label.appendChild(body); box.appendChild(label);
      input.addEventListener('change', update);
    });
    // 公開中の回が1つだけなら「選んでください／両日の参加もできます」を出さない（10/23 守屋）
    var shown = box.querySelectorAll('.session').length;
    document.getElementById('pick-title').textContent = shown > 1 ? '参加する回を選んでください' : '参加する回';
    document.getElementById('pick-note').hidden = shown < 2;
    // 選べる回が1つだけなら最初から選んでおく（押すのはボタン1つ）
    var free = boxes(); if (free.length === 1) free[0].checked = true;
    update();
    global.RVSS.hide('done'); global.RVSS.show('form-area');
  }
  /** done＝{id,label,url}の並び。notified＝公式LINEに届いたか。 */
  function showDone(done, notified, already, receipt) {
    global.RVSS.hide('form-area'); global.RVSS.show('done');
    document.getElementById('done-title').textContent = already ? 'お申し込み済みです' : '予約が完了しました';
    var list = document.getElementById('done-list'); list.textContent = '';
    done.forEach(function (d) { list.appendChild(el('li', '', dateLines(d.label))); });
    // 受付番号はUUID。2回分並ぶと長いので、照合に足りる先頭8文字だけ出す。
    document.getElementById('receipt').textContent = receipt ? '受付番号：' + String(receipt).split(',').map(function (x) { return x.slice(0, 8); }).join('・') : '';
    var zoomBox = document.getElementById('zoom-buttons'); zoomBox.textContent = '';
    var withZoom = notified ? [] : done.filter(function (d) { return d.url; });
    withZoom.forEach(function (d) {
      var b = el('button', 'join zoom-open', done.length > 1 ? d.label.split('）')[0] + '）の\n参加用リンクを開く' : '参加用のリンクを開く'); b.type = 'button';
      b.addEventListener('click', function () { openLink(d.url); }); zoomBox.appendChild(b);
    });
    document.getElementById('done-line').hidden = !notified;
    document.getElementById('fallback').hidden = !withZoom.length;
    document.getElementById('friend-link').hidden = friend !== '0';
    document.getElementById('fallback-text').textContent = friend === '0'
      ? '公式LINEの友だちではないため、\nLINEのお知らせが届きません。\n当日は、下のボタンから\n参加できます。'
      : '公式LINEへのお知らせを\n送れませんでした。\n当日は、下のボタンから\n参加できます。';
    document.getElementById('add-more').hidden = !slots.some(function (s) { return !s.registered && !s.closed; });
  }
  /** 参加リンクはLINE内ブラウザでなく外で開く（Zoom・Google Meet のアプリに渡すため。会員用 /bunkakai/ と同じ）。 */
  function openLink(url) {
    try { if (global.liff && global.liff.isInClient && global.liff.isInClient()) { global.liff.openWindow({url:url, external:true}); return; } } catch (_) {}
    global.location.href = url;
  }
  /** ①回の一覧を先に取る（GASの公開口・JSONP）。本人確認なしで出せる日時・題だけで、申込済みかどうかは②で重ねる。 */
  function early() {
    if (global.RVSS_BE_EARLY) return global.RVSS_BE_EARLY;   // ページの先頭（early.js）で始めた問い合わせがあれば、それを使う
    if (preview) return new Promise(function (resolve) { setTimeout(function () { resolve((mock({action:'bootstrap'}).slots || []).map(function (s) { return {id:s.id, label:s.label, title:s.title, teacher:s.teacher}; })); }, 150); });
    return new Promise(function (resolve, reject) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(ENDPOINT)) { reject(new Error('not_ready')); return; }
      var cb = '__rvssBe' + randomId().slice(0, 12), s = document.createElement('script'), timer = setTimeout(function () { done(); reject(new Error('timeout')); }, 15000);
      function done() { clearTimeout(timer); try { delete global[cb]; } catch (_) { global[cb] = undefined; } s.remove(); }
      global[cb] = function (j) { done(); resolve((j && j.ready && j.slots) || []); };
      s.onerror = function () { done(); reject(new Error('network')); };
      s.src = ENDPOINT + '?callback=' + cb; document.head.appendChild(s);
    });
  }
  /** ②LINEの本人確認が済んだら、友だちかどうかと申込済みかどうかを同時に確かめる（プロフィールは使わないので取らない）。 */
  function afterLiff() {
    liffReady = true; update();
    friendP = preview ? Promise.resolve(friend) : Promise.resolve().then(function () { return global.liff.getFriendship(); })
      .then(function (f) { return f && f.friendFlag ? '1' : '0'; }, function () { return ''; });
    // 友だちでない人には確認LINEが届かない。分かれば送らずに画面へ参加用のリンクを出す。読めなければ送る側に倒す。
    friendP.then(function (f) { friend = f; });
    post({action:'bootstrap', accessToken:token()}).then(function (r) {
      confirmed = true;
      if (!document.getElementById('done').hidden) return;   // 先に出したカードから申し込み終えていたら、完了画面のままにする
      slots = r.slots || []; if (!slots.length) { try { global.localStorage.removeItem(CACHE_KEY); } catch (_) {} throw new Error('not_ready'); }
      saveCache(slots.filter(function (s) { return !s.closed; }));
      global.RVSS.hide('loading');
      var open = slots.filter(function (s) { return !s.closed; });
      if (open.length && open.every(function (s) { return s.registered; })) {
        var mine = slots.filter(function (s) { return s.registered; });
        showDone(mine, mine.every(function (s) { return s.notified; }), true, mine.map(function (s) { return s.responseId; }).join(','));
      } else renderForm();
    }).catch(function (e) {
      confirmed = true;
      if (!document.getElementById('done').hidden) return;
      global.RVSS.hide('loading'); global.RVSS.hide('form-area');
      global.RVSS.setBootStatus(errorText(e.message), e.message === 'not_ready' ? '' : 'err');
    });
  }
  /** LIFFの初期化（共通の RVSS.boot と同じ手順・同じ文言。違いはプロフィールを取らないことだけ）。 */
  function startLiff() {
    if (preview) { setTimeout(afterLiff, 300); return; }
    var liffId = ((global.RVSS_CONFIG || {}).LIFF_IDS || {}).bunkakai || '';
    if (!liffId) { global.RVSS.hide('loading'); global.RVSS.setBootStatus('このページはまだ準備中です（LIFF ID が未設定）。担当者へお知らせください。', 'err'); return; }
    if (typeof global.liff === 'undefined') { global.RVSS.hide('loading'); global.RVSS.setBootStatus('LINEアプリの読み込みに失敗しました。通信環境を確かめて開き直してください。', 'err'); return; }
    global.liff.init({liffId:liffId}).then(function () {
      if (!global.liff.isLoggedIn()) { global.liff.login({redirectUri:global.location.origin + global.location.pathname + '?src=' + encodeURIComponent(source)}); return; }
      afterLiff();
    }).catch(function (err) {
      global.RVSS.hide('loading'); global.RVSS.hide('form-area');
      global.RVSS.setBootStatus('読み込みに失敗しました（' + (err && err.message ? err.message : 'unknown') + '）。LINEアプリから開き直してください。', 'err');
    });
  }
  function showEarly(list) {
    if (confirmed || !list || !list.length || !document.getElementById('done').hidden) return;
    slots = list.map(function (s) { return Object.assign({closed:false, registered:false}, s); });
    global.RVSS.hide('loading'); renderForm();
  }
  function boot() {
    showEarly(loadCache());   // ⓪前回の控えがあれば、すぐ出す
    early().then(function (list) {
      if (list.length) saveCache(list);
      showEarly(list);   // ①最新の一覧で差し替える。準備中・終了の判定は②（本人確認つき）に任せる
    }).catch(function () {});
    startLiff();
  }
  join.addEventListener('click', function () {
    var ids = chosen(); if (sending || !ids.length || !liffReady) return;
    var access; try { access = token(); } catch (err) { global.RVSS.setStatus(errorText(err.message), 'err'); return; }
    sending = true; update(); join.textContent = '予約しています…'; global.RVSS.setStatus('', '');
    friendP.then(function (f) { friend = f; return post({action:'submit', accessToken:access, slotIds:ids.join(','), src:source, friend:f}); }).then(function (r) {
      var items = r.items || [];
      items.forEach(function (it) { slots.forEach(function (s) { if (s.id === it.id) { s.registered = true; s.notified = r.notified; } }); });
      showDone(items, r.notified, !!r.dedup, r.responseId);
    }).catch(function (err) { global.RVSS.setStatus(errorText(err.message), 'err'); })
      .finally(function () { sending = false; update(); });
  });
  document.getElementById('add-more').addEventListener('click', renderForm);
  if (preview) { global.RVSS.show('preview-note'); friend = params.get('case') === 'nofriend' ? '0' : '1'; boot(); }
  else if (!ENDPOINT) { global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText('not_ready'), ''); }
  else boot();
})(window);
