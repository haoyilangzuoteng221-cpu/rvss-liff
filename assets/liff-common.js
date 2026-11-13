/**
 * LIFF 共通処理（RVSS 採用）
 *
 * 3本のページ（面接予約／面談予約／視聴）が同じ手順を踏むので、そこを1本にまとめてある。
 *   liff.init → getProfile → (日程を GAS から取る) → 送信 → 完了画面
 *
 * ★設計上の決めごと（変えるときは理由ごと変える）
 *  1. 送信は「隠しiframe + form POST」。fetch を使わない。
 *     ∵ GAS の /exec は CORS ヘッダを返さないので、fetch だと成功しても結果を読めない。
 *       しかも script.google.com → googleusercontent.com へリダイレクトするため
 *       no-cors でも扱いが不安定。既存の視聴・計測はform POSTのloadを受信し、保存確認は別に行う。
 *       予約のpostBookingは、GASが返す明示的な保存応答だけを成功にする（2026-11-12）。
 *  2. 個人情報を URL に載せない。氏名・メール・userID は必ず POST の body で送る。
 *  3. 二重送信を2段で止める。①押した瞬間にボタンを無効化 ②GAS 側で同一内容の重複を弾く。
 *     ∵ 2026-09-05 の実測で、既存LIFF経由の23行のうち5行が二重登録だった。
 *  4. `src`（流入元）は必ず載せる。付いていなければ 'unknown'。SNS へ寄せない。
 *     ∵ 寄せると広報KPIが実態より膨らむ（83f13138）。
 */
(function (global) {
  'use strict';

  var CFG = global.RVSS_CONFIG || {};
  var AUTH_KINDS = /^(interview|mendan|watch|rookies|kouryu)$/;   // GAS の本人確認_20261024.js の RVSS_AUTH.KINDS と揃える
  var ALLOWED_SRC = /^[a-z0-9_\-]{1,40}$/i;

  function normalizeSrc(raw) {
    raw = String(raw || '').trim();
    return ALLOWED_SRC.test(raw) ? raw : 'unknown';
  }

  /** クエリから流入元を取る。無い・不正なら 'unknown'（SNSへ寄せない）。 */
  function readSrc() {
    var q = new URLSearchParams(global.location.search);
    var raw = q.get('src');
    // LIFF は元のquery/fragmentを liff.state に畳む。内側のsrcを優先し、fragmentは読み込まない。
    // 入れ子を読む回数に上限を置く。同じ階層にsrcが複数あれば従来どおり先頭を使う。
    for (var depth = 0; depth < 5; depth++) {
      var state = q.get('liff.state');
      if (!state) break;
      var query = state.split('#')[0];
      var start = query.indexOf('?');
      if (start < 0) break;
      q = new URLSearchParams(query.slice(start + 1));
      if (q.has('src')) raw = q.get('src');
    }
    return normalizeSrc(raw);
  }

  /** 画面のどこかに一言出す（成功・失敗・待ちの共通表示）。 */
  function setStatus(msg, kind) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.hidden = !msg;
  }

  /**
   * 起動に失敗したときの表示。
   * ★#status ではなく #boot-status に出す。
   *   ∵ #status はフォームの中にあり、起動に失敗した時点ではフォームごと hidden。
   *     そこへ書くと本人には何も見えず、真っ白な画面だけが残る（2026-09-05 に実際に起きた）。
   */
  function setBootStatus(msg, kind) {
    var el = document.getElementById('boot-status') || document.getElementById('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.hidden = !msg;
  }

  function show(id) { var el = document.getElementById(id); if (el) el.hidden = false; }
  function hide(id) { var el = document.getElementById(id); if (el) el.hidden = true; }

  /**
   * GAS の doGet から日程を取る。
   * CORS を避けるため JSONP（?callback=）で取る。仕様＝LIFF連携_仕様_0825.md。
   */
  function fetchSchedule(kind) {
    return new Promise(function (resolve, reject) {
      var cbName = '__rvssCb' + Date.now() + Math.floor(Math.random() * 1000);
      var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 12000);
      function cleanup() {
        clearTimeout(timer);
        try { delete global[cbName]; } catch (e) { global[cbName] = undefined; }
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
      global[cbName] = function (json) {
        cleanup();
        if (json && json.ok === false) reject(new Error('schedule_rejected'));
        else resolve(json || {});
      };
      var s = document.createElement('script');
      // ★種別は GAS 側で絞る（予定タブを持っているのは向こう）。
      //   kind 未指定なら今までどおり合説の候補日が返る。
      s.src = CFG.GAS_ENDPOINT + '?callback=' + encodeURIComponent(cbName)
        + (kind ? '&kind=' + encodeURIComponent(kind) : '');
      s.onerror = function () { cleanup(); reject(new Error('network')); };
      document.head.appendChild(s);
    });
  }

  /** 日程の並び替え用キー。date(yyyy-MM-dd) が無ければ表示文字列の M/D から作る。読めない枠は末尾。 */
  function dateTimeKey_(it) {
    var label = String(it.label || it.value || '');
    var key = '';
    var d = String(it.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (d) key = d[1] + d[2] + d[3];
    else {
      var md = label.match(/(\d{1,2})\/(\d{1,2})/);
      if (!md) return '99999999';
      var now = new Date(), y = now.getFullYear();
      if (Number(md[1]) < now.getMonth() + 1 - 6) y += 1;   // 年をまたぐ枠（12月に1月の枠）
      key = y + ('0' + md[1]).slice(-2) + ('0' + md[2]).slice(-2);
    }
    var t = label.match(/(\d{1,2})[:：](\d{2})/);
    return key + (t ? ('0' + t[1]).slice(-2) + t[2] : '9999');
  }

  function sortByDateTime_(items) {
    return items.map(function (it, i) { return { it: it, i: i, k: dateTimeKey_(it) }; })
      .sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i; })
      .map(function (x) { return x.it; });
  }

  /** 公開日前の月の枠を外す（reveal＝{YYYYMM: 'YYYYMMDD'}）。config に無い月はそのまま出す。 */
  function hideUnrevealed_(items, reveal, now) {
    if (!reveal) return items;
    var d = now || new Date();
    var today = '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return items.filter(function (it) {
      var from = reveal[dateTimeKey_(it).slice(0, 6)];
      return !from || today >= from;
    });
  }

  /**
   * 日程プルダウンを埋める。
   * @param {HTMLSelectElement} sel
   * @param {string} kindFilter 空なら合説の候補日。'面談'／'面接' でその種別だけ。
   * @returns {Promise<number>} 入れた件数
   */
  function fillDates(sel, kindFilter) {
    return fetchSchedule(kindFilter).then(function (j) {
      global.RVSS.lastSchedule = j;       // 完了画面が選んだ枠の日付を引けるように残す（2026-09-25。Zoom は 2026-10-24 から返らない）
      var items = j.items || [];
      // items が空でも dates（表示文字列だけ）があれば使う（旧レスポンス互換）
      if (!items.length && !kindFilter && (j.dates || []).length) {
        items = (j.dates || []).map(function (d) { return { value: d, label: d }; });
      }
      // ★2026-10-17 守屋＝GAS は予定タブの行の順で返すので、11月の後ろに10月の枠が埋もれていた。早い日時順に並べる。
      items = sortByDateTime_(items);
      if (String(kindFilter || '').indexOf('面接') >= 0) items = hideUnrevealed_(items, CFG.INTERVIEW_SLOT_REVEAL);
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      var head = document.createElement('option');
      head.value = ''; head.textContent = '選んでください';
      sel.appendChild(head);
      items.forEach(function (it) {
        var o = document.createElement('option');
        o.value = it.value; o.textContent = it.label || it.value;
        sel.appendChild(o);
      });
      return items.length;
    });
  }

  /**
   * 隠し iframe + form で POST する。
   * @param {Object} data key/value（値は文字列化される）
   * @param {number} [timeoutMs] 待つ上限（既定15秒）。★交流会は GAS 側でカレンダー登録・通知メール・確認LINEまで
   *   やるので15秒前後かかる（2026-09-25 実測）→ 交流会の画面だけ長めに渡す。
   * @returns {Promise<void>} iframe が load したら解決。届いたかどうかまでは読めない。
   */
  function postToGas(data, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var name = '__rvssPost' + Date.now();
      var iframe = document.createElement('iframe');
      iframe.name = name; iframe.style.display = 'none';
      document.body.appendChild(iframe);

      var form = document.createElement('form');
      form.method = 'POST';
      form.action = CFG.GAS_ENDPOINT;
      form.target = name;
      form.style.display = 'none';

      var payload = Object.assign({}, data);
      if (CFG.LIFF_TOKEN) payload.token = CFG.LIFF_TOKEN;
      // ★2026-10-24 セキュリティ点検①｜GAS が送り主を LINE で確かめられるよう、LINE のアクセストークンを添える。
      //   GAS はこれで本人の userID を引き直し、画面から来た lineUserId は信じない。トークンは GAS で保存しない。
      //   body の POST で送る（決めごと2＝URL に載せない）。取れないとき（未ログイン）は付けずに送り、GAS が断る。
      //   GAS が確かめる5種だけに付ける（journey の計測は5秒おきに送るので、トークンを無駄に流さない）。
      try {
        var at = AUTH_KINDS.test(String(payload.kind || '')) && global.liff && typeof global.liff.getAccessToken === 'function'
          ? global.liff.getAccessToken() : '';
        if (at) payload.accessToken = at;
      } catch (e) { /* 取れなければ付けない */ }
      Object.keys(payload).forEach(function (k) {
        var input = document.createElement('input');
        input.type = 'hidden'; input.name = k;
        input.value = payload[k] == null ? '' : String(payload[k]);
        form.appendChild(input);
      });
      document.body.appendChild(form);

      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true; cleanup();
        // 送信自体は飛んでいる見込みだが、確認できないので失敗として扱う。
        // ★ここで成功にすると、落ちた申込を誰も拾えなくなる。
        reject(new Error('no_response'));
      }, timeoutMs || 15000);

      function cleanup() {
        clearTimeout(timer);
        if (form.parentNode) form.parentNode.removeChild(form);
        setTimeout(function () { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000);
      }
      iframe.addEventListener('load', function () {
        if (done) return;
        done = true; cleanup(); resolve();
      });
      form.submit();
    });
  }

  /** 予約用の応答照合ID。再送時は呼び出し側が同じIDを使う。 */
  function newBookingRequestId() {
    var bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
  }

  /**
   * 保存結果を明示的に返す予約用POST（interview / kouryu）。
   * iframeのloadは成功にしない。既存の視聴・計測用postToGasとは分離する。
   * GASのHtmlServiceは内側のiframeから応答するため、sourceの直接一致は使えない。
   * Googleのorigin、推測できないrequestId、種別、保存済みの受付番号を照合する。
   */
  function postBooking(data, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var endpoint = CFG.BOOKING_GAS_ENDPOINT || '';
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint) ||
          !/^(interview|kouryu)$/.test(String(data.kind || ''))) {
        reject(new Error('not_configured')); return;
      }
      var accessToken;
      try { accessToken = global.liff && global.liff.getAccessToken(); } catch (_) {}
      if (!accessToken) { reject(new Error('login_required')); return; }
      var id = data.requestId || newBookingRequestId();
      if (!/^[a-f0-9]{32}$/.test(id)) { reject(new Error('invalid_request')); return; }
      var frame = document.createElement('iframe');
      frame.name = '__rvssBooking_' + id; frame.hidden = true;
      var form = document.createElement('form');
      form.method = 'POST'; form.action = endpoint; form.target = frame.name; form.hidden = true;
      var payload = Object.assign({}, data, { requestId: id, receiverOrigin: global.location.origin, accessToken: accessToken });
      if (CFG.LIFF_TOKEN) payload.token = CFG.LIFF_TOKEN;
      Object.keys(payload).forEach(function (key) {
        var input = document.createElement('input'); input.type = 'hidden'; input.name = key;
        input.value = payload[key] == null ? '' : String(payload[key]); form.appendChild(input);
      });
      var finished = false, timer;
      function finish(error, result) {
        if (finished) return;
        finished = true; clearTimeout(timer); global.removeEventListener('message', onMessage);
        if (form.parentNode) form.parentNode.removeChild(form);
        if (frame.parentNode) frame.parentNode.removeChild(frame);
        if (error) reject(error); else resolve(result);
      }
      function onMessage(event) {
        var message = event.data;
        if (!/^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(event.origin) ||
            !event.source || event.source === global || !message || message.type !== 'rvss-booking' ||
            message.requestId !== id || !message.result) return;
        var result = message.result;
        if (result.kind !== data.kind) return;
        if (result.ok !== true) { finish(new Error(result.error || 'save_failed')); return; }
        if (result.saved !== true || typeof result.receiptId !== 'string' || !result.receiptId) {
          finish(new Error('save_unconfirmed')); return;
        }
        finish(null, result);
      }
      global.addEventListener('message', onMessage);
      timer = setTimeout(function () { finish(new Error('no_response')); }, timeoutMs || 60000);
      document.body.appendChild(frame); document.body.appendChild(form);
      try { form.submit(); } catch (_) { finish(new Error('network')); }
    });
  }

  /**
   * ページの共通起動処理。
   * @param {Object} opts
   *   opts.liffKey   'interview' | 'mendan' | 'watch'
   *   opts.onReady   function(profile, src) — プロフィールが取れたら呼ばれる
   */
  function boot(opts) {
    var src = opts.entrySrc ? normalizeSrc(opts.entrySrc) : readSrc();
    // initがURLを書き換える前に、ページが指定した戻り先を確保する。
    var loginRedirectUri = opts.loginRedirectUri;
    function observe(event, result) { try { if (opts.analytics) opts.analytics.record(event, { stage: 'auth', result: result }); } catch (_) {} }
    observe('auth_start', 'started');
    var liffId = (CFG.LIFF_IDS || {})[opts.liffKey] || '';

    if (!liffId) {
      observe('auth_error', 'missing_id');
      hide('loading');
      setBootStatus('このページはまだ準備中です（LIFF ID が未設定）。担当者へお知らせください。', 'err');
      return;
    }
    if (typeof liff === 'undefined') {
      observe('auth_error', 'sdk_missing');
      hide('loading');
      setBootStatus('LINEアプリの読み込みに失敗しました。通信環境を確かめて開き直してください。', 'err');
      return;
    }

    liff.init({ liffId: liffId })
      .then(function () {
        if (!liff.isLoggedIn()) {
          observe('auth_redirect', 'login');
          // 戻り先を指定しない既存ページは、従来どおりLINE側のエンドポイントへ戻す。
          if (loginRedirectUri) liff.login({ redirectUri: loginRedirectUri });
          else liff.login();
          return null;
        }
        return liff.getProfile();
      })
      .then(function (profile) {
        if (!profile) return; // login へ飛んだ
        hide('loading');
        opts.onReady(profile, src);
      })
      .catch(function (err) {
        observe('auth_error', 'init_or_profile');
        hide('loading');
        setBootStatus('読み込みに失敗しました（' + (err && err.message ? err.message : 'unknown') + '）。LINEアプリから開き直してください。', 'err');
      });
  }

  global.RVSS = {
    readSrc: readSrc,
    setStatus: setStatus,
    setBootStatus: setBootStatus,
    show: show,
    hide: hide,
    fillDates: fillDates,
    postToGas: postToGas,
    postBooking: postBooking,
    newBookingRequestId: newBookingRequestId,
    boot: boot
  };
})(window);
