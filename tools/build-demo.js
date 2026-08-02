'use strict';
// 体验版构建器:把「真内核 + 真档案 + 工作台 v2 界面」打进一个自包含 HTML。
// 原则(design/17 铁律②的延伸):体验版不许是另一套逻辑的仿品——
// 浏览器里跑的就是 app/core 的原码(微型 CJS 加载器),连六项交叉验证都是真的。
// 用法:node tools/build-demo.js [输出路径,默认 app/web/taste-demo.html]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { WORKBENCH_HTML } = require(path.join(ROOT, 'app/server/src/workbench'));

// —— 1. 真内核模块(顺序无关,加载器按需解析)——
const MODULES = ['money', 'store-memory', 'numbering', 'balance', 'allocation',
  'statement', 'delivery', 'intake', 'splitter', 'prepare'];
const modDefs = MODULES.map((m) => {
  const src = fs.readFileSync(path.join(ROOT, 'app/core', `${m}.js`), 'utf8');
  return `__def(${JSON.stringify(m)}, function (module, exports, require) {\n${src}\n});`;
}).join('\n');
const seedSrc = fs.readFileSync(path.join(ROOT, 'app/server/seed.js'), 'utf8');

// —— 2. 引擎:加载器 + 路由(与 app/server/src/index.js 同形)+ 演示布景 ——
const ENGINE = `<script>
/* 体验版引擎:app/core 真内核原样打包(tools/build-demo.js 生成,勿手改) */
(function () {
  /* MemoryStore 用 Node 的 setImmediate 模拟网络往返;浏览器里用微任务顶上 */
  if (typeof setImmediate === 'undefined') {
    window.setImmediate = function (fn) { return queueMicrotask(fn); };
  }
  var __defs = {}, __cache = {};
  function __def(name, fn) { __defs[name] = fn; }
  function __req(name) {
    name = String(name).replace(/^\\.\\//, '');
    if (__cache[name]) return __cache[name].exports;
    var m = { exports: {} };
    __cache[name] = m;
    __defs[name].call(null, m, m.exports, __req);
    return m.exports;
  }
${modDefs}
__def('seed', function (module, exports, require) {
${seedSrc}
module.exports = { seedTenant: seedTenant };
});
  window.__CORE = __req;
})();
</script>
<script>
/* 体验版路由 + 布景:数据全在本页内存,刷新即重置 */
(function () {
  var C = window.__CORE;
  var money = C('money'), storeM = C('store-memory'), num = C('numbering');
  var bal = C('balance'), alloc = C('allocation'), stmt = C('statement');
  var del = C('delivery'), intake = C('intake'), prep = C('prepare'), seed = C('seed');
  var store = new storeM.MemoryStore();
  num.initNumbering(store);
  var T = 't1';
  function ld(off) { var d = new Date(); d.setDate(d.getDate() + off);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dk(s) { return s.split('-').join(''); }
  var JX = 't1|c_jxxc', DB = 't1|c_dbjcc', SLD = 't1|c_16dm', HX = 't1|c_hxg', EJ = 't1|c_ej';

  // 布景:昨天真实营业一轮(留下价格记忆),老欠账两户(红/黄),今晚的消息已到
  var ready = (async function () {
    await seed.seedTenant(store, T);
    var y = ld(-1), yk = dk(y);
    async function receipt(party, items) {
      return del.postDeliveryReceipt(store, { tenantId: T, partyId: party, bizDate: y, dateKey: yk,
        items: items.map(function (x) { return { name: x[0], qtyOrdered: x[1], qtyActual: x[2] != null ? x[2] : x[1], unit: x[3], unitPriceCents: money.toCents(x[4]) }; }) });
    }
    var r1 = await receipt(JX, [['姜', 3, 2.8, '斤', '1.9'], ['藕', 3, 3, '斤', '4'], ['蒜台', 2, 2, '斤', '6'], ['烧鸡', 2, null, '只', '40'], ['黄灯笼辣椒酱', 2, null, '瓶', '13']]);
    await receipt(DB, [['小油菜', 1, 1.1, '斤', '2.5'], ['黄瓜', 2, 2, '斤', '3']]);
    await receipt(SLD, [['香菜', 2, 2.2, '斤', '7.5'], ['桂皮', 1, 1, '斤', '12']]);
    // 佳湘现结:昨晚扫码把 r1 全付清(核销闭环的活例子)
    await alloc.recordPayment(store, { tenantId: T, partyId: JX, amountCents: r1.amountCents, method: '微信', refId: 'pay_demo_1', bizDate: y });
    await stmt.generateStatement(store, { tenantId: T, partyId: JX, kind: 'RZ', periodKey: yk, from: y, to: y, openingCents: 0 });
    // 老欠账:黄小馆 393.53 欠了 62 天(红);二建 120 欠了 35 天(黄)
    await bal.applyEntry(store, { tenantId: T, partyId: HX, type: 'opening', amountCents: money.toCents('393.53'), refType: 'opening', refId: 'QC-hx', bizDate: ld(-62) });
    await bal.applyEntry(store, { tenantId: T, partyId: EJ, type: 'opening', amountCents: money.toCents('120'), refType: 'opening', refId: 'QC-ej', bizDate: ld(-35) });
    // 今晚的微信消息已粘进来:两家全认出,一家有标红;东北那单已经确认好(备好卡的活例子)
    var r = await intake.createIntakeFromText(store, { tenantId: T, bizDate: ld(0), source: 'paste-pc',
      text: '佳湘小厨\\n姜三斤\\n香菜2斤\\n烧鸡两只\\n干张2斤\\n东北家常菜 小油菜1斤 黄瓜2斤\\n猪脚饭 拿点桂皮' });
    var db = r.created.filter(function (it) { return it.partyId === DB; })[0];
    if (db) await intake.confirmIntake(store, db.id, {});
  })();

  function J(p) { var u = p.split('?'); return { base: u[0], q: new URLSearchParams(u[1] || '') }; }
  async function route(path, body) {
    await ready;
    var u = J(path), q = u.q, seg = u.base.split('/').map(decodeURIComponent), today = ld(0);
    if (u.base === '/api/customers') {
      return { customers: (await store.find('customers', { eq: { tenantId: T } })).map(function (x) { return { id: x.id, name: x.name, aliases: x.aliases || [] }; }) };
    }
    if (u.base === '/api/products') {
      return { products: (await store.find('products', { eq: { tenantId: T } })).map(function (p) { return { id: p.id, name: p.name, unit: p.unit, weighable: !!p.weighable }; }) };
    }
    if (u.base === '/api/overview') return prep.getOverview(store, { tenantId: T, bizDate: q.get('bizDate') || today, today: q.get('today') || today });
    if (u.base === '/api/briefing') {
      var ov = await prep.getOverview(store, { tenantId: T, bizDate: q.get('bizDate') || today, today: q.get('today') || today });
      return prep.buildBriefing(ov);
    }
    if (u.base === '/api/audit') return prep.runAudit(store, { tenantId: T });
    if (u.base === '/api/price-suggest') {
      return prep.suggestPrices(store, { tenantId: T, partyId: q.get('customerId'), names: String(q.get('names') || '').split(',').filter(Boolean) });
    }
    if (u.base === '/api/intake' && body) {
      var r = await intake.createIntakeFromText(store, { tenantId: T, text: body.text, source: body.source, bizDate: body.bizDate });
      return { ok: true, created: r.created.map(function (it) { return { id: it.id, customerName: it.customerName, status: it.status, lines: it.lines.length }; }), unassignedLines: r.unassignedLines };
    }
    if (u.base === '/api/intake/todolist') return { groups: await intake.getTodolist(store, { tenantId: T, bizDate: q.get('bizDate') }) };
    if (u.base === '/api/intake/confirmed') return { groups: await intake.getConfirmed(store, { tenantId: T, bizDate: q.get('bizDate') }) };
    if (seg.length === 5 && seg[2] === 'intake') {
      if (seg[4] === 'confirm') return { ok: true, status: (await intake.confirmIntake(store, seg[3], { lines: body && body.lines, partyId: body && body.partyId })).status };
      if (seg[4] === 'book') return { ok: true, status: (await intake.bookIntake(store, seg[3], { receiptNo: body && body.receiptNo })).status };
      if (seg[4] === 'dismiss') return { ok: true, status: (await intake.dismissIntake(store, seg[3], body && body.reason)).status };
    }
    if (u.base === '/api/receipts' && body) {
      var items = body.items.map(function (it) { return { name: it.name, unit: it.unit, qtyOrdered: it.qtyOrdered, qtyActual: it.qtyActual, unitPriceCents: money.toCents(it.unitPriceYuan) }; });
      var rr = await del.postDeliveryReceipt(store, { tenantId: T, partyId: body.customerId, bizDate: body.bizDate, dateKey: body.dateKey, items: items, diff: body.diff === true, signer: body.signer });
      return { ok: true, receiptId: rr.receipt.id, receiptNo: rr.receipt.receiptNo, amountCents: rr.amountCents, held: rr.held };
    }
    if (u.base === '/api/statements/daily' && body) {
      var g = await stmt.generateStatement(store, { tenantId: T, partyId: body.customerId, kind: 'RZ', periodKey: body.dateKey, from: body.bizDate, to: body.bizDate, openingCents: body.openingCents | 0 });
      return { ok: true, created: g.created, no: g.stmt.no, closingCents: g.stmt.closingCents };
    }
    if (u.base === '/api/payments' && body) {
      var pr = await alloc.recordPayment(store, { tenantId: T, partyId: body.customerId, amountCents: money.toCents(body.amountYuan), method: body.method, refId: body.refId, bizDate: body.bizDate });
      return { ok: true, prepayCents: pr.prepayCents, balanceCents: await bal.getBalance(store, T, body.customerId) };
    }
    if (seg.length === 5 && seg[2] === 'customers') {
      var pid = seg[3];
      if (seg[4] === 'balance') return { balanceCents: await bal.getBalance(store, T, pid), aging: await alloc.aging(store, { tenantId: T, partyId: pid, today: q.get('today') || today }) };
      if (seg[4] === 'monthly') return stmt.monthlyView(store, { tenantId: T, partyId: pid, from: q.get('from'), to: q.get('to') });
      if (seg[4] === 'trace') return prep.traceCustomer(store, { tenantId: T, partyId: pid, today: q.get('today') || today });
    }
    throw new Error('体验版没有这个接口: ' + u.base);
  }
  window.__DEMO = { handle: function (path, body) {
    return route(path, body || null)
      .then(function (json) { return { ok: true, json: json }; })
      .catch(function (e) { return { ok: false, json: { ok: false, error: String((e && e.message) || e) } }; });
  } };
  /* 开场:把今晚还没贴的那段消息先摆在粘贴框里(十六对面 + 一条含糊单) */
  var pasteEl = document.getElementById('paste');
  if (pasteEl && !pasteEl.value) pasteEl.value = '十六对面\\n香菜2斤\\n干张一斤\\n拿点熟芝麻';
})();
</script>`;

// —— 3. 界面:工作台原文,fetch 换成本页引擎;补体验版标识 ——
const API_FETCH = `function api(path, body, method){
  var init = { method: method || (body ? 'POST' : 'GET'), headers: { 'x-tenant-id': TENANT, 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return fetch(path, init).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, json: j }; }); });
}`;
const API_DEMO = `function api(path, body, method){ return window.__DEMO.handle(path, body); }`;

let html = WORKBENCH_HTML;
if (!html.includes(API_FETCH)) throw new Error('工作台 api() 原文变了,请同步 build-demo.js');
html = html.replace(API_FETCH, API_DEMO);
html = html.replace('<title>汇金源 · 老板娘工作台</title>', '<title>汇金源 · 老板娘工作台(体验版)</title>');
html = html.replace('<span class="tag">老板娘工作台</span>',
  '<span class="tag">老板娘工作台</span><span class="chip amber" style="align-self:center">体验版 · 数据在本页,刷新即重置</span>');
// 引擎脚本插在主脚本之前(主脚本一落地就要调 api)
html = html.replace('<script>\nvar TENANT', ENGINE + '\n<script>\nvar TENANT');

// —— 4. Artifact 形态:去掉文档骨架标签(发布器会自己包一层)——
for (const tag of ['<!doctype html>', '<html lang="zh-CN">', '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<head>', '</head>', '<body>', '</body>', '</html>']) {
  html = html.replace(tag + '\n', '').replace('\n' + tag, '');
}

const out = process.argv[2] || path.join(ROOT, 'app/web/taste-demo.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html.trim() + '\n');
console.log(`体验版已生成: ${out} (${Math.round(html.length / 1024)} KB;内核模块 ${MODULES.length} 个原样打包)`);
