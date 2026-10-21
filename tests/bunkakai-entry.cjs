// VMで通信とDOMの境界だけを検証する。ブラウザ操作・実通信・実送信は行わない。
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../assets/bunkakai-entry.js'),'utf8');
function setup(mode='ok'){
  const els={},messages=new Set(),posts=[],timers=[];let bootstrap=true,submitHandler;
  function node(tag){return{tag,children:[],hidden:false,value:'',textContent:'',appendChild(n){this.children.push(n);return n;},remove(){},reportValidity(){return true;},querySelector(){return {value:'ai_20261030'};},addEventListener(event,fn){if(event==='submit')submitHandler=fn;},submit(){
    const p=Object.fromEntries(this.children.map(n=>[n.name,n.value]));posts.push(p);
    const isBoot=bootstrap;bootstrap=false;
    if(!isBoot&&mode==='noAck')return;
    queueMicrotask(()=>{const result=isBoot?{ok:true,action:'bootstrap',slots:[{id:'ai_20261030',label:'10月30日（金）21:00〜21:30'}]}:mode==='reject'?{ok:false,action:'submit',error:'closed'}:{ok:true,action:'submit',slotLabel:'10月30日（金）21:00〜21:30',...(mode==='noReceipt'?{}:{responseId:'receipt-fixture'})};
      const packet={origin:(!isBoot&&mode==='forged')?'https://evil.invalid':'https://fixture-script.googleusercontent.com',source:{},data:{type:'rvss-bunkakai-entry',requestId:p.requestId,result}};messages.forEach(fn=>fn(packet));});
  }};}
  ['entry-form','submit','loading','boot-status','sessions','form-area','done','done-when','receipt','status','preview-note','name'].forEach(id=>els[id]=node(id));
  els['form-area'].hidden=els.done.hidden=true;
  Object.assign(els.name,{value:'確認用'});
  const win={RVSS_BUNKAKAI_ENTRY:{endpoint:mode==='unconfigured'?'':'https://script.google.com/macros/s/fixture/exec'},location:{hostname:'production.test',origin:'https://app.test',pathname:'/bunkakai/entry/',search:''},crypto:{getRandomValues:b=>{b.fill(posts.length+1);}},liff:{getAccessToken:()=> 'fixture-token'},RVSS:{readSrc:()=> 'fixture_source',boot:o=>o.onReady(),show:id=>els[id].hidden=false,hide:id=>els[id].hidden=true,setStatus:s=>els.status.textContent=s,setBootStatus:s=>els['boot-status'].textContent=s},addEventListener:(t,fn)=>messages.add(fn),removeEventListener:(t,fn)=>messages.delete(fn)};
  vm.runInNewContext(code,{window:win,document:{getElementById:id=>els[id],createElement:node,body:node('body')},Uint8Array,Array,Object,String,Promise,Error,encodeURIComponent,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
  return{els,posts,timers,messages,submit:()=>submitHandler({preventDefault(){}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let count=0;async function test(name,fn){await fn();console.log('PASS '+name);count++;}
  await test('未設定では受付を開かず通信しない',async()=>{const x=setup('unconfigured');await tick();assert.equal(x.posts.length,0);assert.equal(x.els['form-area'].hidden,true);assert.match(x.els['boot-status'].textContent,/準備中/);});
  await test('保存応答を受け取ってから完了表示、認証情報はPOST内だけ',async()=>{const x=setup();await tick();assert.equal(x.els['form-area'].hidden,false);x.submit();assert.equal(x.els.done.hidden,true);await tick();assert.equal(x.els.done.hidden,false);assert.equal(x.els.receipt.textContent,'受付番号：receipt-fixture');assert.equal(x.posts[1].src,'fixture_source');assert.equal(x.posts[1].accessToken,'fixture-token');});
  await test('iframe表示のみでは成功にせず再送を可能にする',async()=>{const x=setup('noAck');await tick();x.submit();await tick();assert.equal(x.els.done.hidden,true);x.timers.at(-1)();await tick();assert.equal(x.els['form-area'].hidden,false);assert.equal(x.els.submit.disabled,false);assert.equal(x.els.name.value,'確認用');assert.match(x.els.status.textContent,/再送/);});
  await test('GASが保存を拒否したら成功にしない',async()=>{const x=setup('reject');await tick();x.submit();await tick();assert.equal(x.els.done.hidden,true);assert.match(x.els.status.textContent,/受付は終了/);});
  await test('受付IDのない成功応答を完了と扱わない',async()=>{const x=setup('noReceipt');await tick();x.submit();await tick();assert.equal(x.els.done.hidden,true);});
  await test('他originからの偽の成功通知を受けない',async()=>{const x=setup('forged');await tick();x.submit();await tick();assert.equal(x.els.done.hidden,true);});
  await test('送信中の連打でPOSTを増やさない',async()=>{const x=setup('noAck');await tick();x.submit();x.submit();assert.equal(x.posts.length,2);});
  await test('入力は名前と日時のみ、属性や同意チェックを増やさない',async()=>{const html=fs.readFileSync(path.join(__dirname,'../bunkakai/entry/index.html'),'utf8');const fields=html.match(/<(?:input|select|textarea)\b[^>]*>/g)||[];assert.equal(fields.length,1);assert.match(fields[0],/id="name"/);assert(!/id="(?:email|school|membership)"/.test(html));assert(!/60分|22:00/.test(html));const x=setup();await tick();x.submit();await tick();for(const key of ['email','school','membership'])assert(!Object.hasOwn(x.posts[1],key));});
  console.log(`TOTAL ${count} passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
