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
 *       no-cors でも扱いが不安定。form POST なら確実に届き、iframe の load で完了を拾える。
 *  2. 個人情報を URL に載せない。氏名・メール・userID は必ず POST の body で送る。
 *  3. 二重送信を2段で止める。①押した瞬間にボタンを無効化 ②GAS 側で同一内容の重複を弾く。
 *     ∵ 2026-09-05 の実測で、既存LIFF経由の23行のうち5行が二重登録だった。
 *  4. `src`（流入元）は必ず載せる。付いていなければ 'unknown'。SNS へ寄せない。
 *     ∵ 寄せると広報KPIが実態より膨らむ（83f13138）。
 */
(function (global) {
  'use strict';

  var CFG = global.RVSS_CONFIG || {};
  var ALLOWED_SRC = /^[a-z0-9_\-]{1,40}$/i;

  /** クエリから流入元を取る。無い・不正なら 'unknown'（SNSへ寄せない）。 */
  function readSrc() {
    var q = new URLSearchParams(global.location.search);
    // LIFF は liff.state に元のクエリを畳んで渡してくることがある
    var state = q.get('liff.state');
    if (state) {
      try {
        var inner = new URLSearchParams(state.indexOf('?') >= 0 ? state.slice(state.indexOf('?')) : '');
        if (inner.get('src')) q = inner;
      } catch (e) { /* 読めなければ元のクエリのまま */ }
    }
    var raw = (q.get('src') || '').trim();
    return ALLOWED_SRC.test(raw) ? raw : 'unknown';
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
      global[cbName] = function (json) { cleanup(); resolve(json || {}); };
      var s = document.createElement('script');
      // ★種別は GAS 側で絞る（予定タブを持っているのは向こう）。
      //   kind 未指定なら今までどおり合説の候補日が返る。
      s.src = CFG.GAS_ENDPOINT + '?callback=' + encodeURIComponent(cbName)
        + (kind ? '&kind=' + encodeURIComponent(kind) : '');
      s.onerror = function () { cleanup(); reject(new Error('network')); };
      document.head.appendChild(s);
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
      global.RVSS.lastSchedule = j;       // 完了画面が選んだ枠の日付や Zoom を引けるように残す（2026-09-25）
      var items = j.items || [];
      // items が空でも dates（表示文字列だけ）があれば使う（旧レスポンス互換）
      if (!items.length && !kindFilter && (j.dates || []).length) {
        items = (j.dates || []).map(function (d) { return { value: d, label: d }; });
      }
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

  /**
   * ページの共通起動処理。
   * @param {Object} opts
   *   opts.liffKey   'interview' | 'mendan' | 'watch'
   *   opts.onReady   function(profile, src) — プロフィールが取れたら呼ばれる
   */
  function boot(opts) {
    var src = readSrc();
    var liffId = (CFG.LIFF_IDS || {})[opts.liffKey] || '';

    if (!liffId) {
      hide('loading');
      setBootStatus('このページはまだ準備中です（LIFF ID が未設定）。担当者へお知らせください。', 'err');
      return;
    }
    if (typeof liff === 'undefined') {
      hide('loading');
      setBootStatus('LINEアプリの読み込みに失敗しました。通信環境を確かめて開き直してください。', 'err');
      return;
    }

    liff.init({ liffId: liffId })
      .then(function () {
        if (!liff.isLoggedIn()) { liff.login(); return null; }
        return liff.getProfile();
      })
      .then(function (profile) {
        if (!profile) return; // login へ飛んだ
        hide('loading');
        opts.onReady(profile, src);
      })
      .catch(function (err) {
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
    boot: boot
  };
})(window);
