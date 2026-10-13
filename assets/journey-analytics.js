/* RVSS予約導線の操作記録。入力値・トークン・URLは記録しない。保存確認後だけ送信待ちを消す。 */
(function (w) {
  'use strict';
  var VERSION = '20261013.1', QUEUE = 'rvss_ja_queue_v1', TTL = 7 * 86400000;
  var allowed = ['page_open', 'auth_start', 'auth_redirect', 'auth_ready', 'auth_error', 'form_visible',
    'schedule_start', 'schedule_ready', 'schedule_empty', 'schedule_error', 'field_focus', 'field_state',
    'submit_click', 'validation_error', 'submit_attempt', 'transport_response', 'transport_error',
    'confirmation_visible', 'video_ready', 'video_state', 'video_progress', 'video_error', 'video_unavailable',
    'video_expired', 'video_reissue', 'cta_click', 'cta_unavailable', 'heartbeat', 'page_hidden', 'page_visible', 'page_leave'];
  function id() {
    var a = new Uint8Array(16);
    if (w.crypto && w.crypto.getRandomValues) w.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
  }
  function read(store, key, fallback) { try { return JSON.parse(store.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function write(store, key, value) { try { store.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function storage(name) { try { return w[name]; } catch (_) { return null; } }
  var local = storage('localStorage'), session = storage('sessionStorage');
  function freshQueue(items) { return items.filter(function (x) { return x && Date.now() - x.clientAt < TTL; }).slice(-250); }
  function create(page) {
    var cfg = w.RVSS_CONFIG || {}, visitor = read(local, 'rvss_ja_visitor_v1', null) || id();
    var sess = read(session, 'rvss_ja_session_v1', null);
    if (!sess || Date.now() - sess.at > 30 * 60000) sess = { id: id(), at: Date.now() };
    var storageOK = write(local, 'rvss_ja_visitor_v1', visitor);
    write(session, 'rvss_ja_session_v1', sess);
    var visit = id(), uid = '', opened = Date.now(), visible = 0, visibleSince = document.hidden ? 0 : opened;
    var countKey = 'rvss_ja_count_' + page, visits = read(local, countKey, 0);
    write(local, countKey, visits + 1);
    var source = w.RVSS ? w.RVSS.readSrc() : 'unknown';
    var remembered = read(session, 'rvss_ja_source_v1', null);
    if (source === 'unknown' && remembered && remembered.page === page && Date.now() - remembered.at < 10 * 60000) source = remembered.src;
    write(session, 'rvss_ja_source_v1', { page: page, src: source, at: Date.now() });
    var agent = navigator.userAgent || '';
    var device = /iPad|Tablet/i.test(agent) ? 'tablet' : /Mobile|iPhone|Android/i.test(agent) ? 'mobile' : 'desktop';
    var browser = /Line\//i.test(agent) ? 'line' : /Edg\//.test(agent) ? 'edge' : /Chrome|CriOS/.test(agent) ? 'chrome' : /Firefox|FxiOS/.test(agent) ? 'firefox' : /Safari/.test(agent) ? 'safari' : 'other';
    var queue = freshQueue(read(local, QUEUE, [])), sending = false, lastStage = 'entry', lastState = {};
    function persist() {
      var merged = {}, other = freshQueue(read(local, QUEUE, []));
      other.concat(queue).forEach(function (x) { merged[x.eventId] = x; });
      queue = freshQueue(Object.keys(merged).map(function (key) { return merged[key]; }));
      write(local, QUEUE, queue);
    }
    function visibleMs() { return visible + (visibleSince ? Date.now() - visibleSince : 0); }
    function context() { return { visitorId: visitor, sessionId: sess.id, visitId: visit, page: page, src: source, device: device, browser: browser, build: VERSION }; }
    function record(event, data) {
      try {
        if (allowed.indexOf(event) < 0) return;
        data = data || {};
        if (data.stage) lastStage = data.stage;
        var ev = Object.assign(context(), { eventId: id(), clientAt: Date.now(), lineUserId: uid, event: event,
          elapsedMs: Date.now() - opened, visibleMs: visibleMs(), inLine: !!(w.liff && w.liff.isInClient && w.liff.isInClient()) });
        ['stage', 'result', 'field', 'slot', 'count', 'nameFilled', 'emailState', 'dateFilled'].forEach(function (k) { if (data[k] !== undefined) ev[k] = data[k]; });
        // Detailsは固定項目だけ。DOMの値・例外本文・任意オブジェクトを受け取らない。
        ev.details = {};
        ['pct', 'positionSec', 'durationSec', 'playerState', 'errorCode', 'slotOptions', 'attemptId', 'bookedEntry', 'scheduleVersion'].forEach(function (k) { if (data[k] !== undefined) ev.details[k] = data[k]; });
        ev.details.online = navigator.onLine !== false;
        if (event === 'page_open') {
          var nav = w.performance && w.performance.getEntriesByType ? w.performance.getEntriesByType('navigation')[0] : null;
          Object.assign(ev.details, { revisit: visits > 0, visitNumber: visits + 1, storage: storageOK,
            viewportW: w.innerWidth, viewportH: w.innerHeight, timezoneOffset: new Date().getTimezoneOffset(),
            language: String(navigator.language || '').split('-')[0], navigation: nav ? nav.type : 'unknown',
            network: navigator.connection ? navigator.connection.effectiveType : 'unknown' });
        }
        queue.push(ev); persist();
      } catch (_) { /* 計測が壊れても表示・予約を止めない */ }
    }
    function ack(batchId) {
      return new Promise(function (resolve, reject) {
        var cb = '__rvssJa' + id(), script = document.createElement('script');
        var timer = setTimeout(function () { clean(); reject(new Error('ack_timeout')); }, 12000);
        function clean() { clearTimeout(timer); delete w[cb]; if (script.parentNode) script.parentNode.removeChild(script); }
        w[cb] = function (value) { clean(); resolve(value); };
        script.onerror = function () { clean(); reject(new Error('ack_network')); };
        script.src = cfg.GAS_ENDPOINT + '?kind=journey_ack&batchId=' + encodeURIComponent(batchId) + '&callback=' + cb;
        document.head.appendChild(script);
      });
    }
    function flush(leaving) {
      try {
        persist();
        if (sending || !queue.length || !cfg.GAS_ENDPOINT) return;
        var batch = queue.slice(0, 25), batchId = id();
        var payload = { kind: 'journey', batchId: batchId, events: JSON.stringify(batch), token: cfg.LIFF_TOKEN || '' };
        if (leaving) {
          if (navigator.sendBeacon) navigator.sendBeacon(cfg.GAS_ENDPOINT, new URLSearchParams(payload));
          // Beaconは受理確認ではない。次の訪問で同じeventIdを再送する。
          return;
        }
        sending = true;
        w.RVSS.postToGas(payload, 18000).then(function () { return ack(batchId); }).then(function (result) {
          if (!result || !result.ok || result.processed !== batch.length) return;
          var sent = {}; batch.forEach(function (x) { sent[x.eventId] = true; });
          queue = freshQueue(read(local, QUEUE, []).concat(queue)).filter(function (x) { return !sent[x.eventId]; });
          write(local, QUEUE, queue);
        }).catch(function () {}).then(function () { sending = false; });
      } catch (_) { sending = false; }
    }
    var api = {
      record: record, flush: flush, context: context, source: function () { return source; },
      identify: function (profile) { uid = /^U[0-9a-f]{32}$/i.test(profile && profile.userId || '') ? profile.userId : ''; record('auth_ready', { stage: 'auth', result: uid ? 'ready' : 'missing_profile' }); },
      state: function (data) { lastState = data || {}; },
      id: id
    };
    record('page_open', { stage: 'entry' });
    setInterval(function () { flush(false); }, 5000);
    setInterval(function () { if (!document.hidden) record('heartbeat', Object.assign({ stage: lastStage }, lastState)); }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (visibleSince) visible += Date.now() - visibleSince; visibleSince = 0; record('page_hidden', Object.assign({ stage: lastStage }, lastState)); flush(true); }
      else { visibleSince = Date.now(); record('page_visible', { stage: lastStage }); flush(false); }
    });
    w.addEventListener('pagehide', function () { record('page_leave', Object.assign({ stage: lastStage }, lastState)); flush(true); });
    w.addEventListener('online', function () { flush(false); });
    return api;
  }
  var noop = { record: function () {}, identify: function () {}, state: function () {}, flush: function () {}, context: function () { return {}; }, source: function () { return w.RVSS.readSrc(); }, id: id };
  w.RVSSJourney = { create: function (page) { try { return create(page); } catch (_) { return noop; } } };
})(window);
