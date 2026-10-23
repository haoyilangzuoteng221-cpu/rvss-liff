/** 回の一覧（公開の日時・題）の問い合わせを、ページの先頭で先に始める（LINEの部品を読み終えるのを待たない）。
 * 結果は window.RVSS_BE_EARLY（Promise・失敗時は空の配列）に置き、entry.js が受け取る。確認用（?preview=1）では何もしない。 */
(function (global) {
  'use strict';
  var url = (global.RVSS_BUNKAKAI_ENTRY || {}).endpoint || '';
  var preview = /^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) && /[?&]preview=1/.test(global.location.search);
  if (preview || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) return;
  global.RVSS_BE_EARLY = new Promise(function (resolve) {
    var cb = '__rvssBeEarly' + Date.now(), s = document.createElement('script'), timer = setTimeout(function () { done(); resolve([]); }, 15000);
    function done() { clearTimeout(timer); try { delete global[cb]; } catch (_) { global[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
    global[cb] = function (j) { done(); resolve((j && j.ready && j.slots) || []); };
    s.onerror = function () { done(); resolve([]); };
    s.src = url + '?callback=' + cb; document.head.appendChild(s);
  });
})(window);
