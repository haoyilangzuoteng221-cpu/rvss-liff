(function (global) {
  'use strict';
  var ENDPOINT = (global.RVSS_BUNKAKAI_ENTRY || {}).endpoint || '';
  var GOOGLE = /^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
  var preview = /^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) && global.location.search === '?preview=1';
  var source = global.RVSS.readSrc(), sending = false, slots = [];
  var form = document.getElementById('entry-form'), submit = document.getElementById('submit');
  function randomId() { var b = new Uint8Array(16); global.crypto.getRandomValues(b); return Array.from(b).map(function (n) { return n.toString(16).padStart(2, '0'); }).join(''); }
  function post(data) {
    if (preview) return Promise.resolve(data.action === 'bootstrap' ? {ok:true,action:'bootstrap',slots:[
      {id:'ai_20261030',label:'10月30日（金）21:00開始（講義30分）'}, {id:'ai_20261102',label:'11月2日（月）21:00開始（講義30分）'}
    ]} : {ok:true,action:'submit',responseId:'確認用・保存なし',slotLabel:slots.filter(function (s) {return s.id === data.slotId;})[0].label});
    return new Promise(function (resolve, reject) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(ENDPOINT)) { reject(new Error('not_ready')); return; }
      var id = randomId(), frame = document.createElement('iframe'), f = document.createElement('form'), timer;
      frame.name = 'bunkakai_' + id; frame.hidden = true; f.target = frame.name; f.hidden = true; f.method = 'POST'; f.action = ENDPOINT;
      var payload = Object.assign({}, data, {kind:'bunkakai_entry',requestId:id,receiverOrigin:global.location.origin});
      Object.keys(payload).forEach(function (key) { var input = document.createElement('input'); input.type='hidden';input.name=key;input.value=String(payload[key] == null ? '' : payload[key]);f.appendChild(input); });
      function clean() { clearTimeout(timer);global.removeEventListener('message',receive);f.remove();frame.remove(); }
      function receive(e) {
        var m=e.data;
        if (!GOOGLE.test(e.origin) || !e.source || e.source===global || !m || m.type!=='rvss-bunkakai-entry' || m.requestId!==id || !m.result || m.result.action!==data.action) return;
        clean(); if (m.result.ok!==true) reject(new Error(m.result.error||'save_failed'));
        else if(data.action==='submit' && !m.result.responseId) reject(new Error('save_failed')); else resolve(m.result);
      }
      global.addEventListener('message',receive);timer=setTimeout(function(){clean();reject(new Error('no_response'));},45000);
      document.body.appendChild(frame);document.body.appendChild(f);
      try {f.submit();} catch(e) {clean();reject(e);}
    });
  }
  function errorText(code) { return ({not_ready:'参加申込は準備中です。公式LINEのご案内をお待ちください。',login_required:'LINEから開き直して、もう一度お試しください。',closed:'この回の受付は終了しました。別の日時をお選びください。',invalid_input:'入力内容をご確認ください。',already_registered:'この回にはすでにお申し込み済みです。申込内容の変更は公式LINEでお知らせください。',no_response:'保存の確認ができませんでした。入力は残っています。同じ内容で再送できます。',busy:'ただいま混み合っています。少し待って再送してください。'})[code] || 'お申し込みを保存できませんでした。入力を残したまま、もう一度お試しください。'; }
  function token() {var t=global.liff.getAccessToken();if(!t)throw new Error('login_required');return t;}
  function boot() {
    post({action:'bootstrap',accessToken:preview?'':token()}).then(function(r){
      slots=r.slots||[]; if(!slots.length) throw new Error('closed');
      slots.forEach(function(s){var label=document.createElement('label');label.className='session';var radio=document.createElement('input');radio.type='radio';radio.name='slot';radio.value=s.id;radio.required=true;var span=document.createElement('span');var strong=document.createElement('strong');strong.textContent=s.label.split('21:00')[0];var small=document.createElement('small');small.textContent='21:00開始 · 前半30分の講義';span.appendChild(strong);span.appendChild(small);label.appendChild(radio);label.appendChild(span);document.getElementById('sessions').appendChild(label);});
      global.RVSS.hide('loading');global.RVSS.show('form-area');
    }).catch(function(e){global.RVSS.hide('loading');global.RVSS.setBootStatus(errorText(e.message),'err');});
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();if(sending||!form.reportValidity())return;
    var selected=form.querySelector('input[name="slot"]:checked');if(!selected)return;
    var access;try{access=preview?'':token();}catch(err){global.RVSS.setStatus(errorText(err.message),'err');return;}
    var data={action:'submit',accessToken:access,slotId:selected.value,src:source};
    data.name=document.getElementById('name').value.trim();
    sending=true;submit.disabled=true;submit.textContent='保存しています…';global.RVSS.setStatus('お申し込みを保存しています…','');
    post(data).then(function(r){global.RVSS.hide('form-area');global.RVSS.show('done');document.getElementById('done-when').textContent=r.slotLabel;document.getElementById('receipt').textContent='受付番号：'+r.responseId;})
      .catch(function(err){global.RVSS.setStatus(errorText(err.message),'err');})
      .finally(function(){sending=false;submit.disabled=false;submit.textContent='参加を申し込む';});
  });
  if(preview){global.RVSS.show('preview-note');boot();}
  else if(!ENDPOINT){global.RVSS.hide('loading');global.RVSS.setBootStatus(errorText('not_ready'),'');}
  else global.RVSS.boot({liffKey:'bunkakai',loginRedirectUri:global.location.origin+global.location.pathname+'?src='+encodeURIComponent(source),onReady:function(profile){if(profile&&profile.displayName&&!document.getElementById('name').value)document.getElementById('name').value=profile.displayName;boot();}});
})(window);
