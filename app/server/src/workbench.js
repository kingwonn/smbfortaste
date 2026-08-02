'use strict';
// 老板娘工作台 v2(design/17 四条铁律的界面层):
// ⓪今日总览——系统把一切备好:下一步该干嘛、备好的账、钱的进出、欠账警报、七日走势、六项验证,扫一眼全知道;
// ①今晚要办 ②记账台(单价按记忆预填,来源标注、偏差提醒)③客户的账(360往来,每笔钱带单据链);
// 【听汇报】不想看就听:汇报稿由后端生成,浏览器系统语音念,零外部依赖。
// 视觉:墨绿账本纸——宋体牌匾字+系统黑体+表格数字;红=欠/标红、黄=账龄、绿=清爽;亮暗双主题。

const WORKBENCH_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>汇金源 · 老板娘工作台</title>
<link rel="icon" href="data:,">
<style>
:root{
  --paper:#f2f4f1; --card:#ffffff; --card2:#f7f9f6;
  --ink:#212722; --ink2:#5a655c; --ink3:#8a948c;
  --line:#e3e7e1; --line2:#cfd7cf;
  --brand:#1d5b4c; --brand-2:#2a7a66; --brand-weak:#e4efe9; --brand-line:#bcd6cc;
  --red:#b5372a; --red-bg:#f9e9e5; --amber:#9a6708; --amber-bg:#f6eeda;
  --good:#276b3d; --good-bg:#e4f0e2;
  --shadow:0 1px 2px rgba(30,40,34,.05),0 4px 14px rgba(30,40,34,.06);
  --serif:"Songti SC","STSong","NSimSun","SimSun",serif;
}
@media (prefers-color-scheme: dark){:root{
  --paper:#141915; --card:#1c231e; --card2:#212a23;
  --ink:#e6ebe6; --ink2:#a3aea5; --ink3:#737d75;
  --line:#2b332c; --line2:#3a443b;
  --brand:#57ab90; --brand-2:#6dbfa4; --brand-weak:#24382f; --brand-line:#33564a;
  --red:#e08072; --red-bg:#3a2420; --amber:#d8a24e; --amber-bg:#382d18;
  --good:#74bd8a; --good-bg:#223526;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.25);
}}
:root[data-theme="light"]{
  --paper:#f2f4f1; --card:#ffffff; --card2:#f7f9f6;
  --ink:#212722; --ink2:#5a655c; --ink3:#8a948c;
  --line:#e3e7e1; --line2:#cfd7cf;
  --brand:#1d5b4c; --brand-2:#2a7a66; --brand-weak:#e4efe9; --brand-line:#bcd6cc;
  --red:#b5372a; --red-bg:#f9e9e5; --amber:#9a6708; --amber-bg:#f6eeda;
  --good:#276b3d; --good-bg:#e4f0e2;
  --shadow:0 1px 2px rgba(30,40,34,.05),0 4px 14px rgba(30,40,34,.06);
}
:root[data-theme="dark"]{
  --paper:#141915; --card:#1c231e; --card2:#212a23;
  --ink:#e6ebe6; --ink2:#a3aea5; --ink3:#737d75;
  --line:#2b332c; --line2:#3a443b;
  --brand:#57ab90; --brand-2:#6dbfa4; --brand-weak:#24382f; --brand-line:#33564a;
  --red:#e08072; --red-bg:#3a2420; --amber:#d8a24e; --amber-bg:#382d18;
  --good:#74bd8a; --good-bg:#223526;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.25);
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  font-size:16px;line-height:1.55;color:var(--ink);background:var(--paper)}
button{font-family:inherit}
.num{font-variant-numeric:tabular-nums;letter-spacing:-.01em}

/* ---- 顶栏 ---- */
.bar{position:sticky;top:0;z-index:30;background:var(--card);border-bottom:1px solid var(--line);
  box-shadow:0 1px 0 rgba(30,40,34,.03)}
.bar-in{max-width:1280px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.brand{display:flex;align-items:baseline;gap:10px;margin-right:6px}
.brand .mark{font-family:var(--serif);font-size:23px;font-weight:700;color:var(--brand);letter-spacing:.06em}
.brand .tag{font-size:12.5px;color:var(--ink3);letter-spacing:.12em}
.tabs{display:flex;gap:4px;flex-wrap:wrap}
.tab{border:0;background:none;border-radius:9px;padding:9px 16px;font-size:15.5px;font-weight:600;
  color:var(--ink2);cursor:pointer;position:relative}
.tab:hover{background:var(--card2);color:var(--ink)}
.tab.on{background:var(--brand-weak);color:var(--brand)}
.tab .bdg{display:inline-block;min-width:19px;text-align:center;border-radius:999px;font-size:12px;
  padding:1px 5px;margin-left:6px;background:var(--line);color:var(--ink2);vertical-align:1px}
.tab .bdg.hot{background:var(--red);color:#fff}
.tab .bdg.warm{background:var(--amber);color:#fff}
.bar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.today{font-size:13.5px;color:var(--ink3)}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 13px;font-size:13.5px;
  font-weight:600;cursor:pointer;border:1px solid var(--line)}
.pill.ok{background:var(--good-bg);color:var(--good);border-color:transparent}
.pill.bad{background:var(--red-bg);color:var(--red);border-color:transparent}
.btn-speak{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:8px 17px;
  font-size:14.5px;font-weight:700;cursor:pointer;background:var(--brand);color:#fff}
.btn-speak:hover{background:var(--brand-2)}
.btn-speak.speaking{background:var(--red)}
.btn-speak svg{width:15px;height:15px;fill:currentColor}

/* ---- 骨架 ---- */
main{max-width:1280px;margin:0 auto;padding:18px 20px 60px}
.page{display:none}.page.on{display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.card+.card{margin-top:14px}
.card-h{display:flex;align-items:baseline;gap:10px;padding:14px 18px 0;flex-wrap:wrap}
.card-t{font-size:16.5px;font-weight:800}
.card-s{font-size:13px;color:var(--ink3)}
.card-b{padding:12px 18px 16px}
.mut{color:var(--ink2)}.mut3{color:var(--ink3)}
.empty{color:var(--ink3);padding:20px 4px;font-size:15px;text-align:center}
.empty b{color:var(--good)}
a.jump{color:var(--brand);font-weight:600;cursor:pointer;text-decoration:none}
a.jump:hover{text-decoration:underline}

/* ---- 下一步横幅 ---- */
.next{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--brand-line);
  border-left:4px solid var(--brand);border-radius:14px;padding:14px 18px;margin-bottom:14px;box-shadow:var(--shadow)}
.next.calm{border-left-color:var(--good);border-color:var(--line)}
.next .lead{font-size:13px;color:var(--ink3);letter-spacing:.1em;white-space:nowrap}
.next .say{font-size:17.5px;font-weight:800;flex:1;min-width:200px}
.next .go{border:0;border-radius:9px;padding:9px 18px;font-size:15px;font-weight:700;cursor:pointer;
  background:var(--brand);color:#fff;white-space:nowrap}
.next .go:hover{background:var(--brand-2)}

/* ---- 统计块 ---- */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px 12px;
  cursor:pointer;box-shadow:var(--shadow);transition:border-color .12s}
.kpi:hover{border-color:var(--brand-line)}
.kpi .k{font-size:13px;color:var(--ink2);display:flex;justify-content:space-between;gap:8px}
.kpi .v{font-size:27px;font-weight:800;margin-top:3px}
.kpi .v small{font-size:15px;font-weight:600;color:var(--ink2)}
.kpi .s{font-size:13px;color:var(--ink3);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chip{display:inline-block;border-radius:6px;padding:1px 8px;font-size:12.5px;font-weight:700}
.chip.red{background:var(--red-bg);color:var(--red)}
.chip.amber{background:var(--amber-bg);color:var(--amber)}
.chip.good{background:var(--good-bg);color:var(--good)}
.chip.brand{background:var(--brand-weak);color:var(--brand)}
.chip.gray{background:var(--card2);color:var(--ink2);border:1px solid var(--line)}

.cols{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:14px;align-items:start}
@media (max-width:980px){.cols{grid-template-columns:1fr}}

/* ---- 备好的账 ---- */
.prep{border:1px solid var(--line);border-radius:12px;margin-bottom:12px;overflow:hidden}
.prep:last-child{margin-bottom:0}
.prep-h{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--card2);flex-wrap:wrap}
.prep-h .nm{font-size:16.5px;font-weight:800}
.prep-h .est{margin-left:auto;font-size:15px;font-weight:800}
.prep-h .est small{font-size:12.5px;color:var(--ink3);font-weight:600;margin-right:6px}
.rowline{display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px dashed var(--line);font-size:14.5px;flex-wrap:wrap}
.rowline .pn{font-weight:600;min-width:72px}
.rowline .qy{color:var(--ink2)}
.rowline .amt{margin-left:auto;font-weight:700}
.prep-f{padding:10px 14px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:9px;padding:9px 17px;font-size:15px;
  font-weight:700;cursor:pointer;background:var(--brand);color:#fff}
.btn:hover{background:var(--brand-2)}
.btn.ghost{background:var(--card);color:var(--ink2);border:1px solid var(--line2)}
.btn.ghost:hover{color:var(--ink);border-color:var(--ink3);background:var(--card)}
.btn.sm{padding:6px 12px;font-size:13.5px;border-radius:8px}
.btn.danger{background:var(--red);color:#fff}
.btn:disabled{opacity:.45;cursor:not-allowed}
.note{font-size:13px;color:var(--ink3);min-height:18px}
.note.err{color:var(--red)}
.note.okk{color:var(--good)}

/* ---- 七日走势 ---- */
.spark{display:flex;align-items:flex-end;gap:7px;height:96px;padding:6px 2px 0}
.sp{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.sp .bar7{width:100%;max-width:34px;background:var(--brand);opacity:.42;border-radius:4px 4px 0 0;
  min-height:2px;cursor:pointer;transition:opacity .12s}
.sp .bar7:hover{opacity:.75}
.sp.today .bar7{opacity:1}
.sp .d7{font-size:11.5px;color:var(--ink3);white-space:nowrap}
.sp.today .d7{color:var(--brand);font-weight:700}
.sp .v7{font-size:11.5px;font-weight:700;color:var(--ink2);white-space:nowrap;visibility:hidden}
.sp.today .v7,.sp.peak .v7{visibility:visible}

/* ---- 验证条 ---- */
.audit-row{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-top:1px dashed var(--line);font-size:13.5px}
.audit-row:first-child{border-top:0}
.audit-row .st{width:19px;height:19px;border-radius:50%;flex:none;display:flex;align-items:center;
  justify-content:center;font-size:11.5px;font-weight:800;margin-top:1px}
.audit-row .st.ok{background:var(--good-bg);color:var(--good)}
.audit-row .st.bad{background:var(--red-bg);color:var(--red)}
.audit-row .iss{color:var(--red);font-size:12.5px;margin-top:2px}

/* ---- 表格 ---- */
.tblwrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th{font-size:12.5px;color:var(--ink3);font-weight:600;text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px dashed var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
td.r,th.r{text-align:right}
input,select{font-family:inherit;font-size:15px;color:var(--ink);background:var(--card);
  border:1.5px solid var(--line2);border-radius:8px;padding:7px 9px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
input.mini{width:86px;text-align:right}
input.warnp{border-color:var(--amber);background:var(--amber-bg)}
textarea{width:100%;min-height:150px;font-family:inherit;font-size:15.5px;color:var(--ink);
  background:var(--card);padding:12px;border:1.5px solid var(--line2);border-radius:10px;resize:vertical}

/* ---- 收单组 ---- */
.grp{border:1px solid var(--line);border-radius:12px;margin-bottom:12px;overflow:hidden}
.grp.flagged{border-color:var(--red)}
.grp-h{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--card2);flex-wrap:wrap}
.grp.flagged .grp-h{background:var(--red-bg)}
.grp-h .nm{font-size:16.5px;font-weight:800}
.lrow{display:flex;gap:10px;align-items:center;padding:8px 14px;border-top:1px dashed var(--line);font-size:14.5px;flex-wrap:wrap}
.lrow.bad{background:var(--red-bg)}
.lrow .why{color:var(--red);font-size:12.5px;font-weight:600}
.grp-f{padding:10px 14px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}

/* ---- 客户卡 ---- */
.acct{border:1px solid var(--line);border-radius:12px;margin-bottom:12px;overflow:hidden}
.acct-h{display:flex;align-items:center;gap:12px;padding:13px 16px;flex-wrap:wrap;cursor:pointer}
.acct-h:hover{background:var(--card2)}
.acct-h .nm{font-size:17px;font-weight:800}
.acct-h .bal{margin-left:auto;text-align:right}
.acct-h .bal .b1{font-size:21px;font-weight:800}
.acct-h .bal .b2{font-size:12px;color:var(--ink3)}
.acct-x{border-top:1px solid var(--line);padding:12px 16px;display:none;background:var(--card2)}
.acct.open .acct-x{display:block}
.payrow{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.verify-line{display:flex;align-items:center;gap:8px;font-size:13px;border-radius:9px;padding:8px 12px;margin:10px 0}
.verify-line.ok{background:var(--good-bg);color:var(--good)}
.verify-line.bad{background:var(--red-bg);color:var(--red)}
.doc{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;background:var(--brand-weak);
  color:var(--brand);white-space:nowrap;font-variant-numeric:tabular-nums}
.mono-list{border-top:1px dashed var(--line);margin-top:8px;padding-top:6px}
.mrow{display:flex;justify-content:space-between;padding:4px 2px;font-size:14.5px}
.mrow.total{font-weight:800;border-top:1.5px solid var(--ink);margin-top:6px;padding-top:7px}

/* ---- 汇报面板 ---- */
.brief{position:fixed;right:18px;bottom:18px;width:min(430px,calc(100vw - 36px));max-height:60vh;overflow:auto;
  background:var(--card);border:1px solid var(--brand-line);border-radius:14px;box-shadow:0 8px 32px rgba(20,30,24,.22);
  padding:16px 18px;display:none;z-index:50}
.brief.on{display:block}
.brief .bt{font-size:14px;font-weight:800;color:var(--brand);letter-spacing:.08em;margin-bottom:8px;display:flex;justify-content:space-between}
.brief .bx{font-size:15.5px;line-height:1.9}
.brief .bx span.said{background:var(--brand-weak);border-radius:4px}
.brief .close{border:0;background:none;color:var(--ink3);cursor:pointer;font-size:15px}

.tip{position:fixed;z-index:60;background:var(--ink);color:var(--paper);font-size:12.5px;border-radius:7px;
  padding:5px 9px;pointer-events:none;display:none;white-space:nowrap}
@media (prefers-reduced-motion: reduce){*{transition:none !important}}
</style>
</head>
<body>
<header class="bar"><div class="bar-in">
  <div class="brand"><span class="mark">汇金源</span><span class="tag">老板娘工作台</span></div>
  <nav class="tabs">
    <button class="tab on" id="tab-ov" onclick="show('ov')">今日总览</button>
    <button class="tab" id="tab-in" onclick="show('in')">今晚要办<span class="bdg" id="bdg-in">0</span></button>
    <button class="tab" id="tab-bk" onclick="show('bk')">记账台<span class="bdg" id="bdg-bk">0</span></button>
    <button class="tab" id="tab-ac" onclick="show('ac')">客户的账</button>
  </nav>
  <div class="bar-right">
    <span class="today num" id="todayLabel"></span>
    <span class="pill ok" id="auditPill" onclick="show('ov')">账核对中…</span>
    <button class="btn-speak" id="btnSpeak" onclick="toggleSpeak()">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l6 5V4L8 9H4zm13.5 3a3.5 3.5 0 0 0-2-3.15v6.3a3.5 3.5 0 0 0 2-3.15zm-2-8.6v2.1a6.5 6.5 0 0 1 0 13v2.1a8.6 8.6 0 0 0 0-17.2z"/></svg>
      听汇报</button>
  </div>
</div></header>

<main>
<!-- ⓪ 今日总览 -->
<section class="page on" id="page-ov">
  <div class="next" id="nextBanner" style="display:none"></div>
  <div class="kpis" id="kpis"></div>
  <div class="cols">
    <div>
      <div class="card">
        <div class="card-h"><span class="card-t">替您备好的账</span>
          <span class="card-s">数量照确认单、单价照上回,机器都填好了——扫一眼,没错就去挂账</span></div>
        <div class="card-b" id="prepList"></div>
      </div>
      <div class="card" id="debtCard" style="display:none">
        <div class="card-h"><span class="card-t">该催的账</span><span class="card-s">按欠得久不久排,黄提一嘴、红要催</span></div>
        <div class="card-b" id="debtList"></div>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="card-h"><span class="card-t">七天送货走势</span><span class="card-s" id="sparkSum"></span></div>
        <div class="card-b"><div class="spark" id="spark"></div></div>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">账目六项交叉验证</span>
          <a class="jump" style="margin-left:auto;font-size:13px" onclick="loadOverview(true)">再查一遍</a></div>
        <div class="card-b" id="auditList"></div>
      </div>
    </div>
  </div>
</section>

<!-- ① 今晚要办 -->
<section class="page" id="page-in">
  <div class="cols">
    <div>
      <div class="card">
        <div class="card-h"><span class="card-t">把订货消息贴进来</span>
          <span class="card-s">微信里整段复制(语音先转文字),多家一起贴也行</span></div>
        <div class="card-b">
          <textarea id="paste" placeholder="例:&#10;佳湘小厨&#10;姜三斤&#10;烧鸡两只&#10;东北家常菜 小油菜1斤 黄瓜2斤"></textarea>
          <div class="grp-f" style="border:0;padding:10px 0 0">
            <button class="btn" id="btnSplit" onclick="splitIt()">拆单进清单</button>
            <span class="note" id="pasteMsg"></span>
          </div>
          <div class="note" style="margin-top:6px">拿不准的会<b>标红置顶,改好才能确认</b>——错单过不了这道门。</div>
        </div>
      </div>
    </div>
    <div>
      <div class="card">
        <div class="card-h"><span class="card-t">需求清单</span><span class="card-s">按店归组,标红的排最前</span></div>
        <div class="card-b" id="list"></div>
      </div>
    </div>
  </div>
</section>

<!-- ② 记账台 -->
<section class="page" id="page-bk">
  <div class="card">
    <div class="card-h"><span class="card-t">记账台</span>
      <span class="card-s">实称、单价都替您填好了(单价按上回);改哪格点哪格,一键记回执挂账,日账单自动生成</span></div>
    <div class="card-b" id="booking"></div>
  </div>
</section>

<!-- ③ 客户的账 -->
<section class="page" id="page-ac">
  <div class="card">
    <div class="card-h"><span class="card-t">客户的账</span>
      <span class="card-s">按欠款从多到少排;点开任何一家看「往来账」——每笔钱都挂着单据,机器页页核对</span></div>
    <div class="card-b" id="accounts"></div>
  </div>
</section>
</main>

<div class="brief" id="brief">
  <div class="bt"><span>今日汇报</span><button class="close" onclick="hideBrief()">收起 ✕</button></div>
  <div class="bx num" id="briefText"></div>
</div>
<div class="tip" id="tip"></div>

<script>
var TENANT = localStorage.getItem('tenant') || 't1';
var CUSTOMERS = [], PRODUCTS = {}, ITEMS = {}, BOOK = {}, OV = null, TRACES = {};

function api(path, body, method){
  var init = { method: method || (body ? 'POST' : 'GET'), headers: { 'x-tenant-id': TENANT, 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return fetch(path, init).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, json: j }; }); });
}
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function dkey(){ return today().split('-').join(''); }
function monthStart(){ return today().slice(0,8) + '01'; }
function esc(s){ var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function yuan(c){ return (c/100).toFixed(2); }
function yuanCn(c){ var v = c/100; return (v === Math.floor(v)) ? String(v) : v.toFixed(2); }
function pname(sku, raw){ return PRODUCTS[sku] ? PRODUCTS[sku].name : raw; }
function srcLabel(s){
  if (!s || s.source === 'none') return '<span class="chip amber">要问价</span>';
  if (s.source === 'customer-last') return '<span class="chip brand" title="这家上回的价">上回 ' + esc((s.lastDate||'').slice(5).replace('-','.')) + '</span>';
  if (s.source === 'tenant-last') return '<span class="chip gray" title="别家最近用过的价">店里价</span>';
  return '<span class="chip gray">档案价</span>';
}

/* ---------- 页籤 ---------- */
var PAGES = ['ov','in','bk','ac'];
function show(p){
  PAGES.forEach(function(x){
    document.getElementById('page-'+x).className = 'page' + (x===p ? ' on' : '');
    document.getElementById('tab-'+x).className = 'tab' + (x===p ? ' on' : '');
  });
  if (p==='ov') loadOverview();
  if (p==='in') refresh();
  if (p==='bk') loadBooking();
  if (p==='ac') loadAccounts();
}

/* ---------- ⓪ 今日总览 ---------- */
function loadOverview(force){
  api('/api/overview?bizDate='+today()+'&today='+today()).then(function(r){
    if (!r.ok) return;
    OV = r.json; renderOverview(OV);
    if (force) note('', '');
  });
}
function renderOverview(ov){
  /* 顶栏徽记 */
  var bin = document.getElementById('bdg-in');
  bin.textContent = ov.intake.groupsOpen;
  bin.className = 'bdg' + (ov.intake.flaggedLines > 0 ? ' hot' : (ov.intake.groupsOpen > 0 ? ' warm' : ''));
  var bbk = document.getElementById('bdg-bk');
  bbk.textContent = ov.prepared.length;
  bbk.className = 'bdg' + (ov.prepared.length > 0 ? ' warm' : '');
  var pill = document.getElementById('auditPill');
  if (ov.audit.ok) { pill.className = 'pill ok'; pill.textContent = '账已核对 ✓ ' + ov.audit.passed + '/' + ov.audit.total; }
  else { pill.className = 'pill bad'; pill.textContent = '账有 ' + (ov.audit.total - ov.audit.passed) + ' 处不平!'; }

  /* 下一步 */
  var nb = document.getElementById('nextBanner');
  var say, go, target, calm = false;
  if (ov.intake.flaggedLines > 0) { say = '有 ' + ov.intake.flaggedLines + ' 样要货拿不准,已标红——先看这个'; go = '去看标红'; target = 'in'; }
  else if (ov.intake.groupsOpen > 0) { say = ov.intake.groupsOpen + ' 家的要货等确认,都认全了,扫一眼就行'; go = '去确认'; target = 'in'; }
  else if (ov.booked.heldCount > 0) { say = '有 ' + ov.booked.heldCount + ' 张改动单挂着,等您改账'; go = '去处理'; target = 'bk'; }
  else if (ov.prepared.length > 0) { say = ov.prepared.length + ' 家的账都替您备好了,扫一眼就能挂账'; go = '去记账'; target = 'bk'; }
  else { say = '今晚的事办完了,清清爽爽'; go = '听个汇报'; target = null; calm = true; }
  nb.style.display = 'flex';
  nb.className = 'next' + (calm ? ' calm' : '');
  nb.innerHTML = '<span class="lead">下一步</span><span class="say">' + esc(say) + '</span>'
    + '<button class="go" onclick="' + (target ? "show('"+target+"')" : 'toggleSpeak()') + '">' + esc(go) + '</button>';

  /* 统计块 */
  var est = 0; ov.prepared.forEach(function(p){ est += p.estimateCents; });
  var reds = ov.receivable.debtors.filter(function(d){ return d.aging.bucket === 'red'; }).length;
  var yels = ov.receivable.debtors.filter(function(d){ return d.aging.bucket === 'yellow'; }).length;
  var k = '';
  k += kpi("show('in')", '今晚要货', ov.intake.groupsOpen + '<small> 家 · ' + ov.intake.openLines + ' 样</small>',
    ov.intake.flaggedLines > 0 ? '<span class="chip red">' + ov.intake.flaggedLines + ' 样标红待核</span>' : (ov.intake.groupsOpen > 0 ? '都认全了' : '没有待办'));
  k += kpi("show('bk')", '备好待记账', ov.prepared.length + '<small> 家</small>',
    ov.prepared.length ? '预计 ¥' + yuan(est) + ' · 价都按上回填好' : '暂无');
  k += kpi("show('bk')", '今天进出', '<span title="挂账">¥' + yuan(ov.booked.cents) + '</span><small> / 收 ¥' + yuan(ov.payments.cents) + '</small>',
    '挂账 ' + ov.booked.count + ' 笔 · 收款 ' + ov.payments.count + ' 笔' + (ov.booked.heldCount ? ' <span class="chip amber">' + ov.booked.heldCount + ' 张改动单挂着</span>' : ''));
  k += kpi("show('ac')", '外头欠着', '¥' + yuan(ov.receivable.cents),
    ov.receivable.cents > 0 ? ((reds ? '<span class="chip red">红 ' + reds + ' 家</span>' : '') + (yels ? '<span class="chip amber">黄 ' + yels + ' 家</span>' : '') + (!reds && !yels ? '都在30天内' : '')) : '没有欠账');
  document.getElementById('kpis').innerHTML = k;

  /* 备好的账 */
  var el = document.getElementById('prepList'); var h = '';
  if (!ov.prepared.length) {
    h = '<div class="empty">' + (ov.intake.groupsOpen > 0
      ? '要货还没确认——先去 <a class="jump" onclick="show(\\'in\\')">今晚要办</a> 扫一眼'
      : '今晚没有待记的账 <b>✓</b>') + '</div>';
  } else ov.prepared.forEach(function(p){
    h += '<div class="prep"><div class="prep-h"><span class="nm">' + esc(p.customerName) + '</span>'
      + '<span class="chip gray">' + p.totalLines + ' 样</span>'
      + '<span class="est num"><small>预计</small>¥' + yuan(p.estimateCents) + '</span></div>';
    p.lines.forEach(function(l){
      h += '<div class="rowline"><span class="pn">' + esc(l.name) + '</span>'
        + '<span class="qy num">' + esc((l.qty != null ? l.qty : '?') + (l.unit || '')) + '</span>'
        + srcLabel(l.suggest)
        + (l.suggest && l.suggest.cents != null ? '<span class="mut3 num">×' + yuanCn(l.suggest.cents) + '</span>' : '')
        + '<span class="amt num">' + (l.estimateCents != null ? '≈¥' + yuan(l.estimateCents) : '—') + '</span></div>';
    });
    h += '<div class="prep-f"><button class="btn" onclick="show(\\'bk\\')">去记账,数都填好了</button>'
      + (p.allPriced ? '<span class="note okk">单价齐了,扫一眼就行</span>' : '<span class="note">有几样没价格记忆,记账时问一声</span>') + '</div></div>';
  });
  el.innerHTML = h;

  /* 该催的账 */
  var alarms = ov.receivable.debtors.filter(function(d){ return d.aging.bucket !== 'green'; });
  var dc = document.getElementById('debtCard');
  if (alarms.length) {
    dc.style.display = 'block';
    var dh = '';
    alarms.sort(function(a,b){ return b.aging.days - a.aging.days; }).forEach(function(d){
      dh += '<div class="rowline"><span class="pn">' + esc(d.name) + '</span>'
        + '<span class="chip ' + (d.aging.bucket === 'red' ? 'red' : 'amber') + '">欠了 ' + d.aging.days + ' 天</span>'
        + '<span class="amt num">¥' + yuan(d.cents) + '</span>'
        + '<button class="btn ghost sm" onclick="gotoTrace(\\'' + esc(d.partyId) + '\\')">看往来</button></div>';
    });
    document.getElementById('debtList').innerHTML = dh;
  } else dc.style.display = 'none';

  /* 七日走势 */
  var mx = 0, sum = 0;
  ov.last7.forEach(function(d){ if (d.cents > mx) mx = d.cents; sum += d.cents; });
  var sp = '';
  ov.last7.forEach(function(d, i){
    var hpx = mx > 0 ? Math.max(3, Math.round(d.cents / mx * 78)) : 2;
    var cls = 'sp' + (i === 6 ? ' today' : '') + (mx > 0 && d.cents === mx && i !== 6 ? ' peak' : '');
    sp += '<div class="' + cls + '"><span class="v7 num">' + yuanCn(d.cents) + '</span>'
      + '<div class="bar7" style="height:' + hpx + 'px" data-tip="' + esc(d.date.slice(5).replace('-','.')) + ' 送货 ¥' + yuan(d.cents) + '"></div>'
      + '<span class="d7 num">' + (i === 6 ? '今天' : d.date.slice(8).replace(/^0/,'') + '日') + '</span></div>';
  });
  document.getElementById('spark').innerHTML = sp;
  document.getElementById('sparkSum').textContent = '七天共 ¥' + yuan(sum);

  /* 验证条 */
  var ah = '';
  ov.audit.checks.forEach(function(c){
    ah += '<div class="audit-row"><span class="st ' + (c.pass ? 'ok">✓' : 'bad">✕') + '</span><div><div>' + esc(c.name)
      + ' <span class="mut3 num">(' + c.checked + ' 笔)</span></div>';
    if (!c.pass) c.issues.slice(0,3).forEach(function(s){ ah += '<div class="iss">' + esc(s) + '</div>'; });
    ah += '</div></div>';
  });
  document.getElementById('auditList').innerHTML = ah;
}
function kpi(onclick, k, v, s){
  return '<div class="kpi" onclick="' + onclick + '"><div class="k"><span>' + k + '</span></div>'
    + '<div class="v num">' + v + '</div><div class="s">' + s + '</div></div>';
}
function gotoTrace(pid){ show('ac'); setTimeout(function(){ openTrace(pid); }, 150); }
function note(id, txt, cls){ var el = document.getElementById(id); if (el) { el.textContent = txt; el.className = 'note ' + (cls||''); } }

/* ---------- 听汇报 ---------- */
var SPEAKING = false;
function toggleSpeak(){
  if (SPEAKING) { window.speechSynthesis && speechSynthesis.cancel(); stopSpeakUI(); return; }
  api('/api/briefing?bizDate='+today()+'&today='+today()).then(function(r){
    if (!r.ok) return;
    var parts = r.json.parts || [r.json.text];
    var bx = document.getElementById('briefText');
    bx.innerHTML = parts.map(function(p,i){ return '<span id="bp'+i+'">' + esc(p) + '</span>'; }).join('');
    document.getElementById('brief').className = 'brief on';
    if (!window.speechSynthesis) return; /* 不支持语音的浏览器:能看文字稿 */
    speechSynthesis.cancel();
    SPEAKING = true;
    document.getElementById('btnSpeak').classList.add('speaking');
    document.getElementById('btnSpeak').lastChild.textContent = '停下';
    var vs = speechSynthesis.getVoices().filter(function(v){ return /zh|cmn/i.test(v.lang); });
    parts.forEach(function(p, i){
      var u = new SpeechSynthesisUtterance(p);
      u.lang = 'zh-CN'; u.rate = 0.92; if (vs.length) u.voice = vs[0];
      u.onstart = function(){ var el = document.getElementById('bp'+i); if (el) el.className = 'said'; };
      if (i === parts.length - 1) u.onend = stopSpeakUI;
      speechSynthesis.speak(u);
    });
  });
}
function stopSpeakUI(){
  SPEAKING = false;
  var b = document.getElementById('btnSpeak');
  b.classList.remove('speaking'); b.lastChild.textContent = '听汇报';
}
function hideBrief(){
  document.getElementById('brief').className = 'brief';
  if (SPEAKING) { speechSynthesis.cancel(); stopSpeakUI(); }
}

/* ---------- ① 今晚要办 ---------- */
function splitIt(){
  var text = document.getElementById('paste').value;
  if (!text.trim()) return;
  document.getElementById('btnSplit').disabled = true;
  api('/api/intake', { text: text, source: 'paste-pc', bizDate: today() }).then(function(r){
    document.getElementById('btnSplit').disabled = false;
    if (!r.ok) { note('pasteMsg', '出错:' + (r.json && r.json.error), 'err'); return; }
    var un = (r.json.unassignedLines || []).length;
    note('pasteMsg', '已进清单 ' + r.json.created.length + ' 家' + (un ? ';有 ' + un + ' 行没认出是哪家,补店名重贴' : ''), un ? 'err' : 'okk');
    document.getElementById('paste').value = '';
    refresh(); loadOverview();
  });
}
function refresh(){ api('/api/intake/todolist?bizDate='+today()).then(function(r){ if (r.ok) renderList(r.json.groups); }); }
function renderList(groups){
  var el = document.getElementById('list');
  if (!groups.length) { el.innerHTML = '<div class="empty">清了 <b>✓</b> 去 <a class="jump" onclick="show(\\'bk\\')">记账台</a>——账都备好了</div>'; return; }
  var h = '';
  groups.forEach(function(g){ g.items.forEach(function(it){
    ITEMS[it.id] = it;
    var fl = it.status === 'flagged';
    h += '<div class="grp' + (fl ? ' flagged' : '') + '"><div class="grp-h"><span class="nm">' + esc(g.customerName || '没认出的店') + '</span>'
      + '<span class="chip ' + (fl ? 'red">先看这条,有拿不准的' : 'good">' + it.lines.length + ' 样,都认全了') + '</span></div>';
    it.lines.forEach(function(l, i){
      if (l.flagged) {
        h += '<div class="lrow bad"><span>' + esc(l.raw) + '</span><span class="why">' + esc(l.reason || '') + '</span>'
          + '<input class="mini" type="number" step="0.1" min="0" placeholder="数量" id="q-' + it.id + '-' + i + '">'
          + '<input class="mini" type="text" placeholder="单位" id="u-' + it.id + '-' + i + '" value="' + esc(l.unit || '') + '"></div>';
      } else {
        h += '<div class="lrow"><span>' + esc(l.raw) + '</span><span class="chip good num">✓ ' + esc((l.qty != null ? l.qty : '') + (l.unit || '')) + '</span></div>';
      }
    });
    h += '<div class="grp-f">';
    if (!it.partyId) {
      h += '<select id="p-' + it.id + '"><option value="">这是哪家店?</option>';
      CUSTOMERS.forEach(function(c){ h += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; });
      h += '</select>';
    }
    h += '<button class="btn" onclick="confirmItem(\\'' + it.id + '\\')">确认</button>'
      + '<button class="btn ghost" onclick="dismissItem(\\'' + it.id + '\\')">作废</button>'
      + '<span class="note" id="m-' + it.id + '"></span></div></div>';
  });});
  el.innerHTML = h;
}
function confirmItem(id){
  var it = ITEMS[id];
  var lines = it.lines.map(function(l, i){
    if (!l.flagged) return l;
    var q = parseFloat((document.getElementById('q-'+id+'-'+i) || {}).value);
    var u = ((document.getElementById('u-'+id+'-'+i) || {}).value || '').trim();
    if (!(q > 0)) return l;
    var f = {}; for (var k in l) f[k] = l[k];
    f.flagged = false; f.qty = q; if (u) f.unit = u; f.reason = null; return f;
  });
  var body = { lines: lines };
  var sel = document.getElementById('p-'+id);
  if (sel && sel.value) body.partyId = sel.value;
  api('/api/intake/'+id+'/confirm', body).then(function(r){
    if (!r.ok) { note('m-'+id, r.json && r.json.error, 'err'); return; }
    refresh(); loadOverview();
  });
}
function dismissItem(id){ api('/api/intake/'+id+'/dismiss', { reason: '手动作废' }).then(function(){ refresh(); loadOverview(); }); }

/* ---------- ② 记账台 ---------- */
function loadBooking(){
  /* 重渲染前先记住手填过的格子:老板娘填了一半的价,绝不能被刷新吃掉 */
  var keep = {};
  document.querySelectorAll('#booking input').forEach(function(inp){ if (inp.value !== '' && inp.value !== inp.defaultValue) keep[inp.id] = inp.value; });
  api('/api/intake/confirmed?bizDate='+today()).then(function(r){
    var el = document.getElementById('booking');
    if (!r.ok) { el.innerHTML = esc(r.json && r.json.error); return; }
    var groups = r.json.groups;
    if (!groups.length) { el.innerHTML = '<div class="empty">没有待记账的需求——先去 <a class="jump" onclick="show(\\'in\\')">今晚要办</a> 确认要货</div>'; return; }
    /* 逐家取价格记忆,预填单价 */
    var jobs = groups.map(function(g){
      var lines = [];
      g.items.forEach(function(it){ it.lines.forEach(function(l){ lines.push(l); }); });
      var names = lines.map(function(l){ return pname(l.sku, l.raw); });
      var uniq = names.filter(function(n, i){ return names.indexOf(n) === i; });
      return api('/api/price-suggest?customerId=' + encodeURIComponent(g.partyId) + '&names=' + encodeURIComponent(uniq.join(','))).then(function(s){
        BOOK[g.partyId] = { group: g, lines: lines, sug: s.ok ? s.json : {} };
      });
    });
    Promise.all(jobs).then(function(){
      var h = '';
      groups.forEach(function(g){
        var b = BOOK[g.partyId];
        h += '<div class="prep"><div class="prep-h"><span class="nm">' + esc(g.customerName) + '</span><span class="chip amber">待记账</span>'
          + '<span class="est num" id="bt-' + esc(g.partyId) + '"></span></div>';
        h += '<div class="tblwrap"><table><tr><th>品名</th><th class="r">要货</th><th class="r">实称</th><th class="r">单价(元)</th><th>价从哪来</th><th class="r">金额</th></tr>';
        b.lines.forEach(function(l, i){
          var nm = pname(l.sku, l.raw);
          var s = b.sug[nm];
          var pv = s && s.cents != null ? yuanCn(s.cents) : '';
          h += '<tr><td><b>' + esc(nm) + '</b> <span class="mut3">' + esc(l.raw !== nm ? l.raw : '') + '</span></td>'
            + '<td class="r num">' + esc((l.qty != null ? l.qty : '') + (l.unit || '')) + '</td>'
            + '<td class="r"><input class="mini" type="number" step="0.01" min="0" id="ba-' + esc(g.partyId) + '-' + i + '" value="' + (l.qty != null ? l.qty : '') + '" oninput="recalc(\\'' + esc(g.partyId) + '\\')"></td>'
            + '<td class="r"><input class="mini" type="number" step="0.01" min="0" placeholder="填价" id="bp-' + esc(g.partyId) + '-' + i + '" value="' + pv + '" data-ref="' + (s && s.cents != null ? s.cents : '') + '" oninput="recalc(\\'' + esc(g.partyId) + '\\')"></td>'
            + '<td>' + srcLabel(s) + '</td>'
            + '<td class="r num" id="bx-' + esc(g.partyId) + '-' + i + '">—</td></tr>';
        });
        h += '</table></div>';
        h += '<div class="prep-f"><button class="btn" onclick="bookGroup(\\'' + esc(g.partyId) + '\\', this)">看一眼没错,记回执挂账</button>'
          + '<span class="note" id="bm-' + esc(g.partyId) + '"></span></div></div>';
      });
      el.innerHTML = h;
      Object.keys(keep).forEach(function(id){ var inp = document.getElementById(id); if (inp) inp.value = keep[id]; });
      groups.forEach(function(g){ recalc(g.partyId); });
    });
  });
}
function recalc(pid){
  var b = BOOK[pid]; if (!b) return;
  var total = 0, all = true;
  b.lines.forEach(function(l, i){
    var q = parseFloat((document.getElementById('ba-'+pid+'-'+i) || {}).value);
    var pEl = document.getElementById('bp-'+pid+'-'+i);
    var p = parseFloat((pEl || {}).value);
    var cell = document.getElementById('bx-'+pid+'-'+i);
    if (q > 0 && p > 0) {
      var cents = Math.round(Math.round(q*1000) * Math.round(p*100) / 1000);
      total += cents;
      if (cell) cell.textContent = '¥' + yuan(cents);
      /* 偏差提醒:和上回价差两成以上,黄一下 */
      var ref = pEl && parseInt(pEl.getAttribute('data-ref'), 10);
      if (pEl) {
        var off = ref > 0 && Math.abs(p*100 - ref) / ref > 0.2;
        pEl.className = 'mini' + (off ? ' warnp' : '');
        pEl.title = off ? ('和上回 ' + yuanCn(ref) + ' 元差得有点多,看一眼') : '';
      }
    } else { all = false; if (cell) cell.textContent = '—'; }
  });
  var t = document.getElementById('bt-'+pid);
  if (t) t.innerHTML = '<small>合计</small>¥' + yuan(total) + (all ? '' : ' <span class="chip amber">还有没填的</span>');
}
function bookGroup(partyId, btnEl){
  var b = BOOK[partyId];
  if (!b || (btnEl && btnEl.disabled)) return;
  var items = [];
  for (var i = 0; i < b.lines.length; i++){
    var l = b.lines[i];
    var nm = pname(l.sku, l.raw);
    var qa = parseFloat((document.getElementById('ba-'+partyId+'-'+i) || {}).value);
    var up = parseFloat((document.getElementById('bp-'+partyId+'-'+i) || {}).value);
    if (!(up > 0)) { note('bm-'+partyId, '「' + nm + '」的单价还没填', 'err'); return; }
    items.push({ name: nm, unit: l.unit, qtyOrdered: l.qty, qtyActual: (qa > 0 ? qa : l.qty), unitPriceYuan: String(up) });
  }
  if (btnEl) btnEl.disabled = true; /* 防双击重复挂账 */
  api('/api/receipts', { customerId: partyId, bizDate: today(), dateKey: dkey(), items: items }).then(function(r){
    if (!r.ok) { if (btnEl) btnEl.disabled = false; note('bm-'+partyId, r.json && r.json.error, 'err'); return; }
    var receiptNo = r.json.receiptNo;
    var pending = b.group.items.map(function(it){ return api('/api/intake/'+it.id+'/book', { receiptNo: receiptNo }); });
    Promise.all(pending).then(function(rs){
      /* 任何一条需求没转成「已开单」都必须喊出来,绝不静默——账链(C6)靠这个不断 */
      var bad = rs.filter(function(x){ return !x.ok; });
      if (bad.length) note('bm-'+partyId, '注意:' + bad.length + ' 条需求没转开单(' + ((bad[0].json && bad[0].json.error) || '未知原因') + '),清单里还会再见到它', 'err');
      return api('/api/statements/daily', { customerId: partyId, dateKey: dkey(), bizDate: today(), openingCents: 0 }).then(function(s){
        var msg = '已挂账 ' + receiptNo + ' 合计 ¥' + yuan(r.json.amountCents);
        if (s.ok) msg += ';日账单 ' + s.json.no + ' 已生成,可发客户';
        if (!bad.length) note('bm-'+partyId, msg, 'okk');
        loadOverview();
        setTimeout(loadBooking, 1400);
      });
    });
  });
}

/* ---------- ③ 客户的账 ---------- */
function loadAccounts(){
  var el = document.getElementById('accounts');
  el.innerHTML = '<div class="empty">正在把账翻出来…</div>';
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
      var aging = x.bal <= 0 ? '<span class="chip good">账清爽</span>'
        : x.aging.days === 0 ? '<span class="chip good">今天刚挂的账</span>'
        : '<span class="chip ' + (x.aging.bucket === 'red' ? 'red' : x.aging.bucket === 'yellow' ? 'amber' : 'good') + '">欠了 ' + x.aging.days + ' 天</span>';
      h += '<div class="acct" id="acct-' + esc(x.c.id) + '">'
        + '<div class="acct-h" onclick="openTrace(\\'' + esc(x.c.id) + '\\')"><span class="nm">' + esc(x.c.name) + '</span>' + aging
        + '<span class="bal"><span class="b1 num">¥' + yuan(x.bal) + '</span><br><span class="b2">点开看往来账</span></span></div>'
        + '<div class="acct-x" id="ax-' + esc(x.c.id) + '"></div></div>';
    });
    el.innerHTML = h || '<div class="empty">还没有客户</div>';
  });
}
function openTrace(pid){
  var card = document.getElementById('acct-'+pid);
  if (!card) return;
  if (card.className.indexOf('open') >= 0) { card.className = 'acct'; return; }
  document.querySelectorAll('.acct').forEach(function(a){ a.className = 'acct'; });
  card.className = 'acct open';
  var el = document.getElementById('ax-'+pid);
  el.innerHTML = '<div class="empty">正在核对这一页账…</div>';
  api('/api/customers/'+encodeURIComponent(pid)+'/trace?today='+today()).then(function(r){
    if (!r.ok) { el.innerHTML = esc(r.json && r.json.error); return; }
    var t = r.json; TRACES[pid] = t;
    var h = '';
    h += '<div class="verify-line ' + (t.verify.consistent ? 'ok' : 'bad') + '">'
      + (t.verify.consistent ? '✓ 这页账机器刚核对过:逐笔流水加起来 = 台账 ¥' + yuan(t.verify.balanceCents) + ',分毫不差'
        : '✕ 注意:这页账两条路径对不上(流水 ¥' + yuan(t.verify.ledgerCents) + ' / 台账 ¥' + yuan(t.verify.balanceCents) + '),别急着收钱,先查')
      + '</div>';
    /* 收一笔钱 */
    h += '<div class="payrow"><input class="mini" style="width:110px" type="number" step="0.01" min="0" placeholder="收款(元)" id="pay-' + esc(pid) + '">'
      + '<select id="pm-' + esc(pid) + '"><option>微信</option><option>现金</option><option>银行转账</option></select>'
      + '<button class="btn sm" onclick="pay(\\'' + esc(pid) + '\\')">记一笔收款</button>'
      + '<button class="btn ghost sm" onclick="monthly(\\'' + esc(pid) + '\\')">看月账</button>'
      + '<span class="note" id="am-' + esc(pid) + '"></span></div>';
    h += '<div class="mono-list" id="mv-' + esc(pid) + '" style="display:none"></div>';
    /* 没冲清的单 */
    if (t.openDeliveries.length) {
      h += '<div style="margin:6px 0 4px;font-size:13px" class="mut">还没冲清的单:';
      t.openDeliveries.forEach(function(o){ h += ' <span class="doc">' + esc(o.refId) + '</span><span class="num mut"> 剩¥' + yuan(o.openCents) + '</span> '; });
      h += '</div>';
    }
    /* 往来时间线 */
    h += '<div class="tblwrap"><table><tr><th>日子</th><th>单据</th><th>事</th><th class="r">金额</th><th>下落</th></tr>';
    t.timeline.slice().reverse().forEach(function(e){
      var doc = e.refId ? '<span class="doc">' + esc(e.refId) + '</span>' : '—';
      var what = '', where = '';
      if (e.type === 'delivery') {
        what = '送货' + (e.receipt ? ' · ' + e.receipt.itemCount + ' 样' : '');
        where = e.openCents === 0 ? '<span class="chip good">已收清</span>'
          : (e.settledCents > 0 ? '<span class="chip amber num">收了¥' + yuan(e.settledCents) + ' 剩¥' + yuan(e.openCents) + '</span>'
            : '<span class="chip gray num">没收,欠着¥' + yuan(e.openCents) + '</span>');
      } else if (e.type === 'payment') {
        what = '收款' + (e.memo ? '(' + esc(e.memo) + ')' : '');
        var tg = (e.settles || []).map(function(s){ return (s.targetRef === '预收' ? '预收' : '冲 ' + s.targetRef) + ' ¥' + yuan(s.amountCents); });
        where = '<span class="mut num" style="font-size:12.5px">' + esc(tg.join(' / ')) + '</span>';
      } else if (e.type === 'opening') { what = '老账带入'; }
      else { what = '调整'; where = '<span class="mut" style="font-size:12.5px">' + esc(e.memo || '') + '</span>'; }
      h += '<tr><td class="num">' + esc(e.bizDate.slice(5).replace('-','.')) + '</td><td>' + doc + '</td><td>' + what + '</td>'
        + '<td class="r num"><b>' + (e.amountCents < 0 ? '−' : '') + yuan(Math.abs(e.amountCents)) + '</b></td><td>' + where + '</td></tr>';
    });
    h += '</table></div>';
    /* 单据一排 */
    if (t.statements.length) {
      h += '<div style="margin-top:8px;font-size:13px" class="mut">出过的账单:';
      t.statements.forEach(function(s){ h += ' <span class="doc">' + esc(s.no) + '</span>'; });
      h += '</div>';
    }
    el.innerHTML = h;
  });
}
function pay(id){
  var v = parseFloat((document.getElementById('pay-'+id) || {}).value);
  if (!(v > 0)) { note('am-'+id, '先填金额', 'err'); return; }
  var m = document.getElementById('pm-'+id).value;
  api('/api/payments', { customerId: id, amountYuan: String(v), method: m, refId: 'pay'+Date.now(), bizDate: today() }).then(function(r){
    if (!r.ok) { note('am-'+id, r.json && r.json.error, 'err'); return; }
    loadAccounts(); loadOverview();
    setTimeout(function(){ openTrace(id); }, 200);
  });
}
function monthly(id){
  var el = document.getElementById('mv-'+id);
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  api('/api/customers/'+encodeURIComponent(id)+'/monthly?from='+monthStart()+'&to='+today()).then(function(r){
    if (!r.ok) return;
    var h = '';
    r.json.days.forEach(function(d){ h += '<div class="mrow num"><span>' + esc(d.date.slice(5).replace('-','.')) + '</span><span>= ' + yuan(d.cents) + '</span></div>'; });
    h += '<div class="mrow total num"><span>本月合计</span><span>¥' + yuan(r.json.totalCents) + '</span></div>';
    h += '<div class="mrow num"><span>本月已收</span><span>¥' + yuan(r.json.paidCents) + '</span></div>';
    el.innerHTML = h || '本月还没有账';
    el.style.display = 'block';
  });
}

/* ---------- 小提示 ---------- */
document.addEventListener('mousemove', function(ev){
  var t = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-tip');
  var tip = document.getElementById('tip');
  if (t) { tip.textContent = t; tip.style.display = 'block'; tip.style.left = (ev.clientX + 12) + 'px'; tip.style.top = (ev.clientY - 30) + 'px'; }
  else tip.style.display = 'none';
});

/* ---------- 起步 ---------- */
(function(){
  var d = new Date();
  document.getElementById('todayLabel').textContent = (d.getMonth()+1) + '月' + d.getDate() + '日';
})();
api('/api/customers').then(function(r){ if (r.ok) CUSTOMERS = r.json.customers || []; });
api('/api/products').then(function(r){ if (r.ok) (r.json.products || []).forEach(function(p){ PRODUCTS[p.id] = p; }); loadOverview(); });
if (window.speechSynthesis) speechSynthesis.getVoices();
</script>
</body>
</html>`;

module.exports = { WORKBENCH_HTML };
