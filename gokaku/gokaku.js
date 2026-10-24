/** 合格時フォーム（2026-10-24・Adness b61d7854）。
 * 基本情報7項目と入会説明会に出る日を、専用GAS（RVSS 合格後シート）へ1人1行で送る。LINE名とuserIDはサーバーが検証して記録する。
 * 説明会の候補日はGASの「説明会の設定」タブから毎回作るので、この画面には日付を書かない。
 */
(function (global) {
  'use strict';
  var ENDPOINT = (global.RVSS_GOKAKU || {}).endpoint || '';
  var EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/;
  var GOOGLE = /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
  var GRADES = ['1年', '2年', '3年', '4年', '5年', '6年', '修士1年', '修士2年', '博士', 'その他'];
  var AREAS = ['関東', '関西', '中部', '北海道・東北', '中国・四国', '九州・沖縄', '海外'];
  var FIELDS = ['name', 'birth', 'mail', 'univ', 'faculty', 'grade', 'area'];
  var params = new URLSearchParams(global.location.search);
  var preview = /^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) && params.get('preview') === '1';
  var source = global.RVSS.readSrc(), sending = false, liffReady = false, dates = [], consultLabel = '', lastLabel = '';
  var send = document.getElementById('send'), form = document.getElementById('form-area');
  function $(id) { return document.getElementById(id); }
  function randomId() { var b = new Uint8Array(16); global.crypto.getRandomValues(b); return Array.from(b).map(function (n) { return n.toString(16).padStart(2, '0'); }).join(''); }

  /** 確認用（?preview=1）。&case=saved（前に送った人）／closed（候補日なし）／fail（送信に失敗）。保存も送信もしない。 */
  function mock(data) {
    var c = params.get('case') || '';
    var ds = c === 'closed' ? [] : [{value:'2026-10-31', label:'10月31日（土）12:00〜13:00'}, {value:'2026-11-07', label:'11月7日（土）12:00〜13:00'}, {value:'2026-11-14', label:'11月14日（土）12:00〜13:00'}];
    if (data.action === 'bootstrap') return {ok:true, action:'bootstrap', dates:ds, consult:'どの日も難しい（相談したい）',
      saved: c === 'saved' ? {name:'山田 太郎', birth:'2005-04-01', mail:'name@gmail.com', univ:'東京理科大学', faculty:'理学部', grade:'3年', area:'関東', dateLabel:'10月31日（土）12:00〜13:00'} : null};
    if (c === 'fail') return {ok:false, action:'submit', error:'save_failed'};
    var pick = ds.filter(function (d) { return d.value === data.date; })[0];
    return {ok:true, action:'submit', updated:c === 'saved', dateLabel:pick ? pick.label : 'どの日も難しい（相談したい）', consult:!pick};
  }
  /** GASへは隠しフォームで送り、結果は postMessage で受け取る（分科会の申込と同じ仕組み）。 */
  function post(data) {
    if (preview) return new Promise(function (resolve, reject) { setTimeout(function () { var r = mock(data); r.ok ? resolve(r) : reject(new Error(r.error)); }, 500); });
    return new Promise(function (resolve, reject) {
      if (!EXEC.test(ENDPOINT)) { reject(new Error('not_ready')); return; }
      var id = randomId(), frame = document.createElement('iframe'), f = document.createElement('form'), timer;
      frame.name = 'gokaku_' + id; frame.hidden = true; f.target = frame.name; f.hidden = true; f.method = 'POST'; f.action = ENDPOINT;
      var payload = Object.assign({}, data, {kind:'gokaku_entry', requestId:id, receiverOrigin:global.location.origin});
      Object.keys(payload).forEach(function (key) { var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = String(payload[key] == null ? '' : payload[key]); f.appendChild(input); });
      function clean() { clearTimeout(timer); global.removeEventListener('message', receive); f.remove(); frame.remove(); }
      function receive(e) {
        var m = e.data;
        if (!GOOGLE.test(e.origin) || !e.source || e.source === global || !m || m.type !== 'rvss-gokaku-entry' || m.requestId !== id || !m.result || m.result.action !== data.action) return;
        clean(); if (m.result.ok !== true) reject(new Error(m.result.error || 'save_failed')); else resolve(m.result);
      }
      global.addEventListener('message', receive); timer = setTimeout(function () { clean(); reject(new Error('no_response')); }, 45000);
      document.body.appendChild(frame); document.body.appendChild(f);
      try { f.submit(); } catch (e) { clean(); reject(e); }
    });
  }
  function errorText(code) {
    return ({not_ready:'このページはまだ準備中です。\n担当者へお知らせください。', login_required:'LINEから開き直して、\nもう一度お試しください。',
      invalid_input:'入力の内容を確かめて、\nもう一度送ってください。', date_closed:'選んだ日の受付が終わりました。\nページを開き直して、別の日を選んでください。',
      busy:'ただいま混み合っています。\n少し待ってから、もう一度送ってください。', no_response:'うまく受け付けられませんでした。\nもう一度送ってください。'})[code]
      || '保存できませんでした。\nもう一度送ってください。';
  }
  function token() { if (preview) return ''; var t = global.liff.getAccessToken(); if (!t) throw new Error('login_required'); return t; }
  function fillSelect(id, items) { var s = $(id); items.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); }); }

  function renderDates(savedLabel) {
    var box = $('dates'); box.textContent = '';
    var add = function (value, label, cls) {
      var l = document.createElement('label'), i = document.createElement('input'), t = document.createElement('span');
      l.className = 'date' + (cls ? ' ' + cls : ''); i.type = 'radio'; i.name = 'date'; i.value = value; t.textContent = label;
      i.checked = !!savedLabel && savedLabel === label;
      i.addEventListener('change', function () { $('dates').parentNode.classList.remove('is-err'); update(); });
      l.appendChild(i); l.appendChild(t); box.appendChild(l);
    };
    dates.forEach(function (d) { add(d.value, d.label, ''); });
    if (consultLabel) add('consult', consultLabel, 'consult');
  }
  function values() {
    var v = {}; FIELDS.forEach(function (k) { v[k] = $(k).value.trim(); });
    var r = document.querySelector('#dates input:checked'); v.date = r ? r.value : '';
    return v;
  }
  /** 足りない・形が違う項目に印を付け、最初の1つを返す。サーバーでも同じことを確かめる。 */
  function check(v) {
    var bad = [];
    if (!v.name) bad.push('name');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.birth)) bad.push('birth');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.mail)) bad.push('mail');
    ['univ', 'faculty', 'grade', 'area'].forEach(function (k) { if (!v[k]) bad.push(k); });
    FIELDS.forEach(function (k) { $(k).closest('.field').classList.toggle('is-err', bad.indexOf(k) >= 0); });
    $('dates').parentNode.classList.toggle('is-err', !v.date);
    if (!v.date) bad.push('date');
    return bad;
  }
  function update() { send.disabled = sending || !liffReady; send.textContent = !liffReady ? '読み込み中…' : sending ? '送信しています…' : '送信する'; }

  function showForm(saved) {
    global.RVSS.hide('loading'); global.RVSS.hide('done');
    if (saved) {
      FIELDS.forEach(function (k) { if (saved[k] != null) $(k).value = String(saved[k]); });
      $('saved-note').hidden = false; $('title').textContent = '入力した内容の確認・変更';
    }
    renderDates(saved ? saved.dateLabel : '');
    form.hidden = false; update();
  }
  function showDone(r) {
    form.hidden = true; global.RVSS.show('done'); lastLabel = r.dateLabel;
    $('done-title').textContent = r.updated ? '変更を受け付けました' : '受け付けました';
    $('done-date').textContent = r.consult ? '' : '入会説明会\n' + r.dateLabel.replace('）', '）\n');
    $('done-text').textContent = r.consult ? '日程の相談は、\n公式LINEで受け付けます。' : '当日はZoomで行います。\n日程の変更・相談は、\n公式LINEで受け付けます。';
    global.scrollTo(0, 0);
  }

  function afterLiff() {
    liffReady = true; update();
    post({action:'bootstrap', accessToken:token(), src:source}).then(function (r) {
      dates = r.dates || []; consultLabel = r.consult || '';
      showForm(r.saved);
    }).catch(function (e) {
      global.RVSS.hide('loading'); form.hidden = true;
      global.RVSS.setBootStatus(errorText(e.message), 'err');
    });
  }
  function startLiff() {
    if (preview) { setTimeout(afterLiff, 300); return; }
    var liffId = ((global.RVSS_CONFIG || {}).LIFF_IDS || {}).gokaku || '';
    if (!liffId) { global.RVSS.hide('loading'); global.RVSS.setBootStatus('このページはまだ準備中です（LIFF ID が未設定）。担当者へお知らせください。', 'err'); return; }
    if (typeof global.liff === 'undefined') { global.RVSS.hide('loading'); global.RVSS.setBootStatus('LINEアプリの読み込みに失敗しました。通信環境を確かめて開き直してください。', 'err'); return; }
    global.liff.init({liffId:liffId}).then(function () {
      if (!global.liff.isLoggedIn()) { global.liff.login({redirectUri:global.location.origin + global.location.pathname + '?src=' + encodeURIComponent(source)}); return; }
      afterLiff();
    }).catch(function (err) {
      global.RVSS.hide('loading');
      global.RVSS.setBootStatus('読み込みに失敗しました（' + (err && err.message ? err.message : 'unknown') + '）。LINEアプリから開き直してください。', 'err');
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending || !liffReady) return;
    var v = values(), bad = check(v);
    if (bad.length) {
      global.RVSS.setStatus(bad[0] === 'date' ? '入会説明会に出る日を選んでください。' : '赤い枠の項目を入力してください。', 'err');
      var first = bad[0] === 'date' ? $('dates') : $(bad[0]); if (first.scrollIntoView) first.scrollIntoView({block:'center', behavior:'smooth'});
      return;
    }
    var access; try { access = token(); } catch (err) { global.RVSS.setStatus(errorText(err.message), 'err'); return; }
    sending = true; update(); global.RVSS.setStatus('', '');
    post(Object.assign({action:'submit', accessToken:access, src:source}, v)).then(showDone)
      .catch(function (err) { global.RVSS.setStatus(errorText(err.message), 'err'); })
      .finally(function () { sending = false; update(); });
  });
  FIELDS.forEach(function (k) { $(k).addEventListener('input', function () { $(k).closest('.field').classList.remove('is-err'); }); });
  $('edit').addEventListener('click', function () { showForm(null); renderDates(lastLabel); $('saved-note').hidden = false; $('title').textContent = '入力した内容の確認・変更'; });

  fillSelect('grade', GRADES); fillSelect('area', AREAS);
  if (preview) global.RVSS.show('preview-note');
  if (!preview && !ENDPOINT) { global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText('not_ready'), ''); }
  else startLiff();
})(window);
