'use strict';
// 收单工作台(家用版 v0,design/15 第2层):浏览器打开即用——粘贴订货文本→拆单→
// 需求todolist(标红置顶、行内改正)→确认/作废。纯自包含 HTML,大字模式,词表说人话。
// Workers 直接下发本页;正式 PC 工作台(TDesign 版)是 M2 的活,本页先让家用版跑起来。

const WORKBENCH_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>收单工作台</title>
<style>
  :root{--ink:#1f2328;--ink2:#57606a;--line:#e4e7eb;--primary:#0d6e5f;--bad:#b91c1c;--badbg:#fdeaea;--good:#15803d;--warnbg:#fdf3e3;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:17px;color:var(--ink);background:#f2f3f5;padding:20px}
  h1{font-size:22px;margin-bottom:4px}
  .sub{color:var(--ink2);font-size:14px;margin-bottom:16px}
  .wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;max-width:1280px;margin:0 auto}
  .col{flex:1;min-width:420px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
  textarea{width:100%;min-height:200px;font-size:17px;padding:12px;border:1.5px solid var(--line);border-radius:10px;resize:vertical}
  .btn{display:inline-block;border:0;border-radius:10px;padding:12px 22px;font-size:18px;font-weight:700;cursor:pointer}
  .btn-p{background:var(--primary);color:#fff}
  .btn-line{background:#fff;color:var(--primary);border:1.5px solid var(--primary)}
  .btn-gray{background:#fff;color:var(--ink2);border:1.5px solid var(--line)}
  .btn:disabled{background:#c8cdd3;color:#fff;border:0;cursor:not-allowed}
  .group{border:1.5px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
  .group.flagged{border-color:var(--bad)}
  .gname{font-size:19px;font-weight:800}
  .badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700;margin-left:8px}
  .b-bad{background:var(--badbg);color:var(--bad)}
  .b-ok{background:#e8f5ec;color:var(--good)}
  .lrow{display:flex;gap:10px;align-items:center;padding:8px 4px;border-bottom:1px dashed var(--line);font-size:17px}
  .lrow:last-child{border-bottom:0}
  .lrow.bad{background:var(--badbg);border-radius:8px;padding:8px}
  .lrow .why{color:var(--bad);font-size:13.5px}
  .lrow input{width:70px;font-size:17px;padding:6px;border:1.5px solid var(--line);border-radius:8px;text-align:center}
  .lrow input.qty{width:84px}
  .foot{display:flex;gap:10px;margin-top:12px;align-items:center;flex-wrap:wrap}
  .msg{font-size:14px;color:var(--ink2);margin-top:8px;min-height:20px}
  .empty{color:var(--good);font-size:18px;padding:16px 4px}
  select{font-size:16px;padding:8px;border-radius:8px;border:1.5px solid var(--line)}
  .hint{font-size:13.5px;color:var(--ink2);line-height:1.8;margin-top:10px}
</style>
</head>
<body>
<div class="wrap">
  <div class="col">
    <h1>收单工作台</h1>
    <div class="sub">把微信里的订货消息整段粘进来(语音先在微信里右键"转文字")——多家一起贴也行</div>
    <div class="card">
      <textarea id="paste" placeholder="例:&#10;佳湘小厨&#10;姜三斤&#10;烧鸡两只&#10;东北家常菜 小油菜1斤 黄瓜2斤"></textarea>
      <div class="foot">
        <button class="btn btn-p" id="btnSplit" onclick="splitIt()">拆单进清单</button>
        <button class="btn btn-gray" onclick="refresh()">刷新清单</button>
      </div>
      <div class="msg" id="pasteMsg"></div>
      <div class="hint">规矩:拿不准的(数量没说清/不认识的货/店名分不清)会标红置顶——<b>改好才能确认,错单过不了这道门。</b></div>
    </div>
  </div>
  <div class="col">
    <h1>今晚要办 · 需求清单</h1>
    <div class="sub">按店归组,标红的排最前;确认一条划一条</div>
    <div id="list"></div>
  </div>
</div>
<script>
var TENANT = localStorage.getItem('tenant') || 't1';
var CUSTOMERS = [];
var ITEMS = {};

function api(path, body, method){
  var init = { method: method || (body ? 'POST' : 'GET'), headers: { 'x-tenant-id': TENANT, 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return fetch(path, init).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, json: j }; }); });
}
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function esc(s){ var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

function splitIt(){
  var text = document.getElementById('paste').value;
  if (!text.trim()) return;
  document.getElementById('btnSplit').disabled = true;
  api('/api/intake', { text: text, source: 'paste-pc', bizDate: today() }).then(function(r){
    document.getElementById('btnSplit').disabled = false;
    if (!r.ok) { document.getElementById('pasteMsg').textContent = '出错:' + (r.json && r.json.error); return; }
    var n = r.json.created.length;
    var un = (r.json.unassignedLines || []).length;
    document.getElementById('pasteMsg').textContent = '已进清单 ' + n + ' 家' + (un ? ';有 ' + un + ' 行没认出是哪家,请补上店名重贴' : '');
    document.getElementById('paste').value = '';
    refresh();
  });
}

function render(groups){
  var el = document.getElementById('list');
  if (!groups.length) { el.innerHTML = '<div class="card"><div class="empty">清了,今晚没有待办 ✓</div></div>'; return; }
  var h = '';
  groups.forEach(function(g){
    g.items.forEach(function(it){
      ITEMS[it.id] = it;
      var flagged = it.status === 'flagged';
      h += '<div class="group' + (flagged ? ' flagged' : '') + '">';
      h += '<div><span class="gname">' + esc(g.customerName || '没认出的店') + '</span>';
      h += '<span class="badge ' + (flagged ? 'b-bad' : 'b-ok') + '">' + (flagged ? '有拿不准的,先看这条' : it.lines.length + ' 样') + '</span></div>';
      it.lines.forEach(function(l, i){
        if (l.flagged) {
          h += '<div class="lrow bad"><span>' + esc(l.raw) + '</span><span class="why">' + esc(l.reason || '') + '</span>';
          h += '<input class="qty" type="number" step="0.1" min="0" placeholder="数量" id="q-' + it.id + '-' + i + '">';
          h += '<input type="text" placeholder="单位" id="u-' + it.id + '-' + i + '" value="' + esc(l.unit || '') + '"></div>';
        } else {
          h += '<div class="lrow"><span>' + esc(l.raw) + '</span><span style="color:var(--good)">✓ ' + esc((l.qty != null ? l.qty : '') + (l.unit || '')) + '</span></div>';
        }
      });
      h += '<div class="foot">';
      if (!it.partyId) {
        h += '<select id="p-' + it.id + '"><option value="">这是哪家店?</option>';
        CUSTOMERS.forEach(function(c){ h += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; });
        h += '</select>';
      }
      h += '<button class="btn btn-p" onclick="confirmItem(\\'' + it.id + '\\')">确认</button>';
      h += '<button class="btn btn-gray" onclick="dismissItem(\\'' + it.id + '\\')">作废</button>';
      h += '<span class="msg" id="m-' + it.id + '"></span></div></div>';
    });
  });
  el.innerHTML = h;
}

function refresh(){
  api('/api/intake/todolist?bizDate=' + today()).then(function(r){
    if (r.ok) render(r.json.groups);
  });
}

function confirmItem(id){
  var it = ITEMS[id];
  var lines = it.lines.map(function(l, i){
    if (!l.flagged) return l;
    var q = parseFloat((document.getElementById('q-' + id + '-' + i) || {}).value);
    var u = ((document.getElementById('u-' + id + '-' + i) || {}).value || '').trim();
    if (!(q > 0)) return l; // 没填,保持标红,服务端会拦
    var fixed = {}; for (var k in l) fixed[k] = l[k];
    fixed.flagged = false; fixed.qty = q; if (u) fixed.unit = u; fixed.reason = null;
    return fixed;
  });
  var body = { lines: lines };
  var sel = document.getElementById('p-' + id);
  if (sel && sel.value) body.partyId = sel.value;
  api('/api/intake/' + id + '/confirm', body).then(function(r){
    if (!r.ok) { document.getElementById('m-' + id).textContent = r.json && r.json.error; return; }
    refresh();
  });
}

function dismissItem(id){
  api('/api/intake/' + id + '/dismiss', { reason: '手动作废' }).then(refresh);
}

api('/api/customers').then(function(r){ if (r.ok) CUSTOMERS = r.json.customers || []; refresh(); });
</script>
</body>
</html>`;

module.exports = { WORKBENCH_HTML };
