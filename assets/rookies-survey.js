(function (global) {
  'use strict';
  var EVENT = 'real_rookies_20261017';
  var GOOGLE_ORIGIN = /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
  function requestId() {
    var bytes = new Uint8Array(16); global.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  function post(data, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var id = requestId(), name = 'rrSurvey_' + id;
      var frame = document.createElement('iframe');
      frame.name = name; frame.hidden = true;
      var form = document.createElement('form');
      form.method = 'POST'; form.action = (global.RVSS_CONFIG || {}).ROOKIES_SURVEY_GAS_ENDPOINT;
      form.target = name; form.hidden = true;
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(form.action || '')) {
        reject(new Error('not_configured')); return;
      }
      var payload = Object.assign({}, data, { kind: 'rookies_survey', eventId: EVENT,
        requestId: id, receiverOrigin: global.location.origin });
      Object.keys(payload).forEach(function (key) {
        var input = document.createElement('input'); input.type = 'hidden'; input.name = key;
        input.value = String(payload[key] == null ? '' : payload[key]); form.appendChild(input);
      });
      var finished = false;
      function cleanup() {
        clearTimeout(timer); global.removeEventListener('message', onMessage);
        form.remove(); frame.remove();
      }
      function finish(error, result) {
        if (finished) return; finished = true; cleanup();
        if (error) reject(error); else resolve(result);
      }
      function onMessage(event) {
        var message = event.data;
        if (!GOOGLE_ORIGIN.test(event.origin) || !event.source || event.source === global || !message ||
            message.type !== 'rvss-rookies-survey' || message.requestId !== id || !message.result ||
            message.result.action !== data.action) return;
        if (message.result.ok !== true) { finish(new Error(message.result.error || 'save_failed')); return; }
        if (data.action === 'submit' && !message.result.responseId) { finish(new Error('save_failed')); return; }
        finish(null, message.result);
      }
      global.addEventListener('message', onMessage);
      var timer = setTimeout(function () { finish(new Error('no_response')); }, timeoutMs || 45000);
      document.body.appendChild(frame); document.body.appendChild(form);
      // iframe loadは成功判定に使わない。GASの明示的な保存応答だけを待つ。
      try { form.submit(); } catch (e) { finish(e); }
    });
  }
  function visible(schema, area) {
    return schema.questions.filter(function (q) { return !q.areas || q.areas.indexOf(area) >= 0; });
  }
  function readAnswers(schema, area) {
    var answer = {};
    visible(schema, area).forEach(function (q) {
      var field = document.getElementById('field_' + q.id);
      if (field && field.hidden) { answer[q.id] = q.type === 'multi' ? [] : ''; return; }
      if (q.type === 'multi') answer[q.id] = q.options.filter(function (o, i) {
        return document.getElementById('q_' + q.id + '_' + i).checked;
      }).map(function (o) { return o.value; });
      else if (q.type === 'grid') {
        var grid = {}; q.rows.forEach(function (r) { grid[r.id] = document.getElementById('q_' + q.id + '_' + r.id).value; });
        answer[q.id] = grid;
      } else answer[q.id] = document.getElementById('q_' + q.id).value.trim();
    });
    return answer;
  }
  function select(options, id, required) {
    var el = document.createElement('select'); el.id = id; el.required = !!required;
    var head = document.createElement('option'); head.value = ''; head.textContent = '選んでください'; el.appendChild(head);
    options.forEach(function (o) { var item = document.createElement('option'); item.value = o.value; item.textContent = o.label; el.appendChild(item); });
    return el;
  }
  function render(schema, area) {
    var container = document.getElementById('questions'); container.replaceChildren();
    visible(schema, area).forEach(function (q) {
      var field = document.createElement('fieldset'); field.className = 'field'; field.id = 'field_' + q.id;
      var legend = document.createElement('legend'); legend.textContent = q.label + (q.required ? '（必須）' : ''); field.appendChild(legend);
      if (q.help) { var help = document.createElement('p'); help.textContent = q.help; field.appendChild(help); }
      if (q.type === 'multi') q.options.forEach(function (o, i) {
        var label = document.createElement('label');
        var check = document.createElement('input'); check.type = 'checkbox'; check.id = 'q_' + q.id + '_' + i;
        check.addEventListener('change', function () {
          if (!check.checked || !q.exclusive) return;
          q.options.forEach(function (other, j) {
            if (j !== i && (q.exclusive.indexOf(o.value) >= 0 || q.exclusive.indexOf(other.value) >= 0)) document.getElementById('q_' + q.id + '_' + j).checked = false;
          });
        });
        label.appendChild(check); label.appendChild(document.createTextNode(' ' + o.label)); field.appendChild(label);
      });
      else if (q.type === 'grid') q.rows.forEach(function (r) {
        var label = document.createElement('label'); label.htmlFor = 'q_' + q.id + '_' + r.id; label.textContent = r.label;
        field.appendChild(label); field.appendChild(select(q.options, label.htmlFor, q.required));
      });
      else {
        var input;
        if (q.type === 'text') { input = document.createElement('textarea'); input.id = 'q_' + q.id; input.maxLength = q.maxLength || 1000; input.required = !!q.required; }
        else input = select(q.options, 'q_' + q.id, q.required);
        input.setAttribute('aria-label', q.label); field.appendChild(input);
      }
      container.appendChild(field);
    });
    function updateConditions() {
      visible(schema, area).forEach(function (q) {
        if (!q.showWhen) return;
        var parent = document.getElementById('q_' + q.showWhen.id);
        var field = document.getElementById('field_' + q.id);
        field.hidden = !parent || q.showWhen.values.indexOf(parent.value) < 0;
        field.querySelectorAll('input,select,textarea').forEach(function (input) { input.disabled = field.hidden; });
      });
    }
    container.onchange = updateConditions; updateConditions();
  }
  function errorText(code) {
    var messages = { not_ready: 'アンケートは準備中です。運営の案内をお待ちください。',
      login_required: '本人確認のため、LINEから開き直してください。', auth_unavailable: '本人確認ができませんでした。少し待って開き直してください。',
      version_changed: 'アンケートが更新されました。開き直してください。', already_submitted: '回答はすでに受け付けています。変更がある場合は運営へお知らせください。',
      required_answer: '必須項目に回答してください。', area_required: '参加した会場を選んでください。',
      identity_required: 'お名前を入力してください。', source_required: '会場のアンケート用QRコードから開き直してください。', no_response: '保存の確認ができませんでした。入力を残したまま再送できます。',
      not_configured: 'アンケートは準備中です。運営の案内をお待ちください。' };
    return messages[code] || '回答を保存できませんでした。入力を残したまま再送してください。';
  }
  function start() {
    if (!((global.RVSS_CONFIG || {}).LIFF_IDS || {}).rookiesSurvey) {
      global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText('not_configured'), ''); return;
    }
    var schema, participant, sending = false;
    var area = '', form = document.getElementById('survey-form'), btn = document.getElementById('submit');
    function idToken() { var token = global.liff.getIDToken(); if (!token) throw new Error('login_required'); return token; }
    var source = global.RVSS.readSrc();
    if (['rr1017_survey_kanto','rr1017_survey_kansai'].indexOf(source) < 0) {
      global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText('source_required'), 'err'); return;
    }
    var redirect = global.location.origin + global.location.pathname + '?src=' + encodeURIComponent(source);
    global.RVSS.boot({ liffKey: 'rookiesSurvey', loginRedirectUri: redirect, onReady: function () {
      global.RVSS.show('loading'); document.getElementById('loading').textContent = '読み込んでいます…';
      var token;
      try { token = idToken(); } catch (e) { global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText(e.message), 'err'); return; }
      post({ action: 'bootstrap', idToken: token, src: source }).then(function (result) {
        schema = result.schema; participant = result.participant;
        if (!schema || schema.status !== 'ready' || !schema.questions.length || !participant) throw new Error('not_ready');
        var name = document.getElementById('name');
        name.value = participant.name || '';
        name.readOnly = participant.status === 'matched' && !!name.value;
        area = result.area;
        if (['関東','関西'].indexOf(area) < 0) throw new Error('source_required');
        render(schema, area); global.RVSS.hide('loading'); global.RVSS.show('form-area');
      }).catch(function (e) { global.RVSS.hide('loading'); global.RVSS.setBootStatus(errorText(e.message), 'err'); });
    }});
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (sending || !schema) return;
      if (!form.reportValidity()) return;
      var token; try { token = idToken(); } catch (err) { global.RVSS.setStatus(errorText(err.message), 'err'); return; }
      sending = true; btn.disabled = true; btn.textContent = '送信しています…';
      global.RVSS.setStatus('回答を保存しています…', '');
      post({ action: 'submit', idToken: token, schemaVersion: schema.version,
        name: document.getElementById('name').value.trim(),
        src: source, answers: JSON.stringify(readAnswers(schema, area)) }).then(function () {
        global.RVSS.hide('form-area'); global.RVSS.show('done');
      }).catch(function (err) { global.RVSS.setStatus(errorText(err.message), 'err'); }).finally(function () {
        sending = false; btn.disabled = false; btn.textContent = '回答を送信する';
      });
    });
  }
  global.RVSS_ROOKIES_SURVEY = { post: post, visible: visible, readAnswers: readAnswers, render: render, start: start };
})(window);
