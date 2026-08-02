'use strict';
// 家用版工作台 v1(核心闭环可体验):三页籤——
// ①今晚要办:粘贴订货→拆单→标红置顶→确认/作废
// ②记账台:已确认需求→实称+单价→记回执挂账→生成日账单(RZ)
// ③客户的账:欠款+欠了多久(三色)→记一笔收款→月账"日期=金额"
// 自包含 HTML,大字模式,词表说人话;正式 TDesign 版是 M2 的活。

const WORKBENCH_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>汇金源 · 家用版工作台</title>
<style>
  :root{--ink:#1f2328;--ink2:#57606a;--line:#e4e7eb;--primary:#0d6e5f;--bad:#b91c1c;--badbg:#fdeaea;--good:#15803d;--goodbg:#e8f5ec;--warn:#b45309;--warnbg:#fdf3e3;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:17px;color:var(--ink);background:#f2f3f5;padding:18px}
  .top{max-width:1280px;margin:0 auto 14px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  h1{font-size:22px}
  .tabs{display:flex;gap:8px}
  .tab{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:10px 22px;font-size:17px;font-weight:700;cursor:pointer}
  .tab.on{background:var(--primary);color:#fff;border-color:var(--primary)}
  .wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;max-width:1280px;margin:0 auto}
  .col{flex:1;min-width:420px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
  .sub{color:var(--ink2);font-size:14px;margin-bottom:10px}
  textarea{width:100%;min-height:180px;font-size:17px;padding:12px;border:1.5px solid var(--line);border-radius:10px;resize:vertical}
  .btn{display:inline-block;border:0;border-radius:10px;padding:12px 22px;font-size:18px;font-weight:700;cursor:pointer}
  .btn-p{background:var(--primary);color:#fff}
  .btn-gray{background:#fff;color:var(--ink2);border:1.5px solid var(--line)}
  .btn-sm{padding:8px 14px;font-size:15px}
  .btn:disabled{background:#c8cdd3;color:#fff;border:0;cursor:not-allowed}
  .group{border:1.5px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
  .group.flagged{border-color:var(--bad)}
  .gname{font-size:19px;font-weight:800}
  .badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700;margin-left:8px}
  .b-bad{background:var(--badbg);color:var(--bad)}
  .b-ok{background:var(--goodbg);color:var(--good)}
  .b-warn{background:var(--warnbg);color:var(--warn)}
  .lrow{display:flex;gap:10px;align-items:center;padding:8px 4px;border-bottom:1px dashed var(--line);font-size:17px;flex-wrap:wrap}
  .lrow:last-child{border-bottom:0}
  .lrow.bad{background:var(--badbg);border-radius:8px;padding:8px}
  .lrow .why{color:var(--bad);font-size:13.5px}
  .lrow input{font-size:17px;padding:6px;border:1.5px solid var(--line);border-radius:8px;text-align:center;width:84px}
  .foot{display:flex;gap:10px;margin-top:12px;align-items:center;flex-wrap:wrap}
  .msg{font-size:14px;color:var(--ink2);min-height:20px}
  .empty{color:var(--good);font-size:18px;padding:16px 4px}
  select{font-size:16px;padding:8px;border-radius:8px;border:1.5px solid var(--line)}
  .hint{font-size:13.5px;color:var(--ink2);line-height:1.8;margin-top:10px}
  .amt{font-size:20px;font-weight:800}
  .acct{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .mono{border-top:1px dashed var(--line);margin-top:10px;padding-top:8px;font-size:16.5px}
  .mrow{display:flex;justify-content:space-between;padding:4px 2px}
  .total{font-weight:800;border-top:1.5px solid var(--ink);margin-top:6px;padding-top:6px}
  .aging-green{color:var(--good);font-weight:700}
  .aging-yellow{color:var(--warn);font-weight:700}
  .aging-red{color:var(--bad);font-weight:700}
</style>
</head>
<body>
<div class="top">
  <h1>汇金源 · 家用版工作台</h1>
  <div class="tabs">
    <button class="tab on" id="tab0" onclick="showTab(0)">① 今晚要办</button>
    <button class="tab" id="tab1" onclick="showTab(1)">② 记账台</button>
    <button class="tab" id="tab2" onclick="showTab(2)">③ 客户的账</button>
  </div>
</div>

<div id="page0" class="wrap">
  <div class="col">
    <div class="card">
      <div class="sub">把微信里的订货消息整段粘进来(语音先在微信里右键"转文字"),多家一起贴也行</div>
      <textarea id="paste" placeholder="例:&#10;佳湘小厨&#10;姜三斤&#10;烧鸡两只&#10;东北家常菜 小油菜1斤 黄瓜2斤"></textarea>
      <div class="foot">
        <button class="btn btn-p" id="btnSplit" onclick="splitIt()">拆单进清单</button>
        <button class="btn btn-gray" onclick="refresh()">刷新</button>
      </div>
      <div class="msg" id="pasteMsg"></div>
      <div class="hint">规矩:拿不准的会<b>标红置顶,改好才能确认</b>——错单过不了这道门。确认完去「② 记账台」。</div>
    </div>
  </div>
  <div class="col">
    <div class="card"><div class="sub">需求清单 · 按店归组,标红的排最前</div><div id="list"></div></div>
  </div>
</div>

<div id="page1" class="wrap" style="display:none">
  <div class="col">
    <div class="card">
      <div class="sub">今晚确认过的需求都在这——填<b>实称</b>和<b>单价</b>,一键记回执挂账;每家记完出日账单发客户</div>
      <div id="booking"></div>
    </div>
  </div>
</div>

<div id="page2" class="wrap" style="display:none">
  <div class="col">
    <div class="card">
      <div class="sub">按欠款从多到少排 · 颜色=欠了多久(绿&lt;30天/黄30-60/红&gt;60)</div>
      <div id="accounts"></div>
    </div>
  </div>
</div>

<script>
var TENANT = localStorage.getItem('tenant') || 't1';
var CUSTOMERS = [], PRODUCTS = {}, ITEMS = {}, BOOK = {};

function api(path, body, method){
  var init = { method: method || (body ? 'POST' : 'GET'), headers: { 'x-tenant-id': TENANT, 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return fetch(path, init).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, json: j }; }); });
}
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function dkey(){ return today().split('-').join(''); }
function monthStart(){ return today().slice(0,8) + '01'; }
function esc(s){ var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function yuan(cents){ return (cents/100).toFixed(2); }
function pname(sku, raw){ return PRODUCTS[sku] ? PRODUCTS[sku].name : raw; }

function showTab(n){
  for (var i=0;i<3;i++){
    document.getElementById('page'+i).style.display = i===n ? 'flex' : 'none';
    document.getElementById('tab'+i).className = 'tab' + (i===n ? ' on' : '');
  }
  if (n===0) refresh();
  if (n===1) loadBooking();
  if (n===2) loadAccounts();
}

/* ---------- ① 今晚要办 ---------- */
function splitIt(){
  var text = document.getElementById('paste').value;
  if (!text.trim()) return;
  document.getElementById('btnSplit').disabled = true;
  api('/api/intake', { text: text, source: 'paste-pc', bizDate: today() }).then(function(r){
    document.getElementById('btnSplit').disabled = false;
    if (!r.ok) { document.getElementById('pasteMsg').textContent = '出错:' + (r.json && r.json.error); return; }
    var un = (r.json.unassignedLines || []).length;
    document.getElementById('pasteMsg').textContent = '已进清单 ' + r.json.created.length + ' 家' + (un ? ';有 ' + un + ' 行没认出是哪家,请补店名重贴' : '');
    document.getElementById('paste').value = '';
    refresh();
  });
}
function render(groups){
  var el = document.getElementById('list');
  if (!groups.length) { el.innerHTML = '<div class="empty">清了 ✓ 去「② 记账台」记账挂账</div>'; return; }
  var h = '';
  groups.forEach(function(g){ g.items.forEach(function(it){
    ITEMS[it.id] = it;
    var fl = it.status === 'flagged';
    h += '<div class="group' + (fl?' flagged':'') + '"><div><span class="gname">' + esc(g.customerName||'没认出的店') + '</span>';
    h += '<span class="badge ' + (fl?'b-bad':'b-ok') + '">' + (fl?'有拿不准的,先看这条':it.lines.length+' 样') + '</span></div>';
    it.lines.forEach(function(l,i){
      if (l.flagged) {
        h += '<div class="lrow bad"><span>' + esc(l.raw) + '</span><span class="why">' + esc(l.reason||'') + '</span>';
        h += '<input type="number" step="0.1" min="0" placeholder="数量" id="q-'+it.id+'-'+i+'">';
        h += '<input type="text" placeholder="单位" id="u-'+it.id+'-'+i+'" value="'+esc(l.unit||'')+'"></div>';
      } else {
        h += '<div class="lrow"><span>' + esc(l.raw) + '</span><span style="color:var(--good)">✓ ' + esc((l.qty!=null?l.qty:'')+(l.unit||'')) + '</span></div>';
      }
    });
    h += '<div class="foot">';
    if (!it.partyId) {
      h += '<select id="p-'+it.id+'"><option value="">这是哪家店?</option>';
      CUSTOMERS.forEach(function(c){ h += '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>'; });
      h += '</select>';
    }
    h += '<button class="btn btn-p" onclick="confirmItem(\\''+it.id+'\\')">确认</button>';
    h += '<button class="btn btn-gray" onclick="dismissItem(\\''+it.id+'\\')">作废</button>';
    h += '<span class="msg" id="m-'+it.id+'"></span></div></div>';
  });});
  el.innerHTML = h;
}
function refresh(){ api('/api/intake/todolist?bizDate='+today()).then(function(r){ if (r.ok) render(r.json.groups); }); }
function confirmItem(id){
  var it = ITEMS[id];
  var lines = it.lines.map(function(l,i){
    if (!l.flagged) return l;
    var q = parseFloat((document.getElementById('q-'+id+'-'+i)||{}).value);
    var u = ((document.getElementById('u-'+id+'-'+i)||{}).value||'').trim();
    if (!(q>0)) return l;
    var f = {}; for (var k in l) f[k]=l[k];
    f.flagged=false; f.qty=q; if(u) f.unit=u; f.reason=null; return f;
  });
  var body = { lines: lines };
  var sel = document.getElementById('p-'+id);
  if (sel && sel.value) body.partyId = sel.value;
  api('/api/intake/'+id+'/confirm', body).then(function(r){
    if (!r.ok) { document.getElementById('m-'+id).textContent = r.json && r.json.error; return; }
    refresh();
  });
}
function dismissItem(id){ api('/api/intake/'+id+'/dismiss', { reason:'手动作废' }).then(refresh); }

/* ---------- ② 记账台 ---------- */
function loadBooking(){
  api('/api/intake/confirmed?bizDate='+today()).then(function(r){
    var el = document.getElementById('booking');
    if (!r.ok) { el.innerHTML = esc(r.json && r.json.error); return; }
    var groups = r.json.groups;
    if (!groups.length) { el.innerHTML = '<div class="empty">没有待记账的需求——先去「① 今晚要办」确认订单</div>'; return; }
    var h = '';
    groups.forEach(function(g){
      var lines = [];
      g.items.forEach(function(it){ it.lines.forEach(function(l){ lines.push(l); }); });
      BOOK[g.partyId] = { group: g, lines: lines };
      h += '<div class="group"><div><span class="gname">' + esc(g.customerName) + '</span><span class="badge b-warn">待记账</span></div>';
      h += '<div class="lrow" style="color:var(--ink2);font-size:14px"><span style="flex:1">品名</span><span style="width:84px;text-align:center">要货</span><span style="width:96px;text-align:center">实称</span><span style="width:96px;text-align:center">单价(元)</span></div>';
      lines.forEach(function(l,i){
        h += '<div class="lrow"><span style="flex:1">' + esc(pname(l.sku, l.raw)) + '(' + esc(l.raw) + ')</span>';
        h += '<span style="width:84px;text-align:center">' + esc((l.qty!=null?l.qty:'')+(l.unit||'')) + '</span>';
        h += '<input type="number" step="0.01" min="0" id="ba-'+esc(g.partyId)+'-'+i+'" value="'+(l.qty!=null?l.qty:'')+'">';
        h += '<input type="number" step="0.01" min="0" placeholder="单价" id="bp-'+esc(g.partyId)+'-'+i+'"></div>';
      });
      h += '<div class="foot"><button class="btn btn-p" onclick="bookGroup(\\''+esc(g.partyId)+'\\')">记回执挂账</button>';
      h += '<span class="msg" id="bm-'+esc(g.partyId)+'"></span></div></div>';
    });
    el.innerHTML = h;
  });
}
function bookGroup(partyId){
  var b = BOOK[partyId];
  var items = [];
  for (var i=0;i<b.lines.length;i++){
    var l = b.lines[i];
    var qa = parseFloat((document.getElementById('ba-'+partyId+'-'+i)||{}).value);
    var up = parseFloat((document.getElementById('bp-'+partyId+'-'+i)||{}).value);
    if (!(up>0)) { document.getElementById('bm-'+partyId).textContent = '「' + pname(l.sku,l.raw) + '」的单价还没填'; return; }
    items.push({ name: pname(l.sku,l.raw), unit: l.unit, qtyOrdered: l.qty, qtyActual: (qa>0?qa:l.qty), unitPriceYuan: String(up) });
  }
  api('/api/receipts', { customerId: partyId, bizDate: today(), dateKey: dkey(), items: items }).then(function(r){
    if (!r.ok) { document.getElementById('bm-'+partyId).textContent = r.json && r.json.error; return; }
    var receiptNo = r.json.receiptNo;
    var pending = b.group.items.map(function(it){ return api('/api/intake/'+it.id+'/book', { receiptNo: receiptNo }); });
    Promise.all(pending).then(function(){
      return api('/api/statements/daily', { customerId: partyId, dateKey: dkey(), bizDate: today(), openingCents: 0 });
    }).then(function(s){
      var note = '已挂账 ' + receiptNo + ' 合计 ¥' + yuan(r.json.amountCents);
      if (s.ok) note += ';日账单 ' + s.json.no + ' 已生成,可发客户';
      document.getElementById('bm-'+partyId).textContent = note;
      setTimeout(loadBooking, 1200);
    });
  });
}

/* ---------- ③ 客户的账 ---------- */
function loadAccounts(){
  var el = document.getElementById('accounts');
  el.innerHTML = '…';
  var rows = [];
  var jobs = CUSTOMERS.map(function(c){
    return api('/api/customers/'+encodeURIComponent(c.id)+'/balance?today='+today()).then(function(r){
      if (r.ok) rows.push({ c: c, bal: r.json.balanceCents, aging: r.json.aging });
    });
  });
  Promise.all(jobs).then(function(){
    rows.sort(function(a,b){ return b.bal - a.bal; });
    var h = '';
    rows.forEach(function(x){
      var agingTxt = x.bal<=0 ? '<span class="aging-green">账清爽</span>'
        : '<span class="aging-'+x.aging.bucket+'">欠了 '+x.aging.days+' 天</span>';
      h += '<div class="group"><div class="acct"><span class="gname">' + esc(x.c.name) + '</span>';
      h += '<span>' + agingTxt + ' <span class="amt">¥' + yuan(x.bal) + '</span></span></div>';
      h += '<div class="foot">';
      h += '<input type="number" step="0.01" min="0" placeholder="收款(元)" id="pay-'+esc(x.c.id)+'" style="width:120px;font-size:17px;padding:8px;border:1.5px solid var(--line);border-radius:8px">';
      h += '<select id="pm-'+esc(x.c.id)+'"><option>微信</option><option>现金</option><option>银行转账</option></select>';
      h += '<button class="btn btn-p btn-sm" onclick="pay(\\''+esc(x.c.id)+'\\')">记一笔收款</button>';
      h += '<button class="btn btn-gray btn-sm" onclick="monthly(\\''+esc(x.c.id)+'\\')">看月账</button>';
      h += '<span class="msg" id="am-'+esc(x.c.id)+'"></span></div>';
      h += '<div class="mono" id="mv-'+esc(x.c.id)+'" style="display:none"></div></div>';
    });
    el.innerHTML = h || '<div class="empty">还没有客户</div>';
  });
}
function pay(id){
  var v = parseFloat((document.getElementById('pay-'+id)||{}).value);
  if (!(v>0)) { document.getElementById('am-'+id).textContent = '先填金额'; return; }
  var m = document.getElementById('pm-'+id).value;
  api('/api/payments', { customerId: id, amountYuan: String(v), method: m, refId: 'pay'+Date.now(), bizDate: today() }).then(function(r){
    if (!r.ok) { document.getElementById('am-'+id).textContent = r.json && r.json.error; return; }
    loadAccounts();
  });
}
function monthly(id){
  var el = document.getElementById('mv-'+id);
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  api('/api/customers/'+encodeURIComponent(id)+'/monthly?from='+monthStart()+'&to='+today()).then(function(r){
    if (!r.ok) return;
    var h = '';
    r.json.days.forEach(function(d){ h += '<div class="mrow"><span>' + esc(d.date.slice(5).replace('-','.')) + '</span><span>= ' + yuan(d.cents) + '</span></div>'; });
    h += '<div class="mrow total"><span>本月合计</span><span>¥' + yuan(r.json.totalCents) + '</span></div>';
    h += '<div class="mrow"><span>本月已收</span><span>¥' + yuan(r.json.paidCents) + '</span></div>';
    el.innerHTML = h || '本月还没有账';
    el.style.display = 'block';
  });
}

api('/api/customers').then(function(r){ if (r.ok) CUSTOMERS = r.json.customers || []; refresh(); });
api('/api/products').then(function(r){ if (r.ok) (r.json.products||[]).forEach(function(p){ PRODUCTS[p.id] = p; }); });
</script>
</body>
</html>`;

module.exports = { WORKBENCH_HTML };
