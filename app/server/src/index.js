'use strict';
// Cloudflare Workers 服务层(Hono):只做鉴权、租户注入、参数校验与存储适配,
// 全部业务逻辑在 ../../core(平台无关账务内核)。SOTA 轮子:Hono 路由 + D1 + R2 + Cron。
// 部署:wrangler deploy;本地联调:wrangler dev;库表:wrangler d1 execute --file=schema.sql

const { Hono } = require('hono');
const { D1Store } = require('../../core/store-d1');
const { toCents } = require('../../core/money');
const { applyEntry, getBalance, recalcAndVerify } = require('../../core/balance');
const { recordPayment, aging } = require('../../core/allocation');
const { generateStatement, markStatement, settlementReadiness, monthlyView } = require('../../core/statement');
const { postDeliveryReceipt, confirmHeldReceipt } = require('../../core/delivery');
const { nextNo } = require('../../core/numbering');
const { seedTenant } = require('../seed');

const app = new Hono();

// 鉴权中间件(M1:微信 code2session 换 openid→user→tenantId;当前为骨架桩)
app.use('/api/*', async (c, next) => {
  // TODO(M1): 校验会话 token,查 user 表得 { tenantId, role };配送员角色屏蔽账务路由
  const tenantId = c.req.header('x-tenant-id');
  if (!tenantId) return c.json({ ok: false, error: '未登录' }, 401);
  c.set('tenantId', tenantId);
  c.set('store', new D1Store(c.env.DB));
  await next();
});

app.get('/health', (c) => c.json({ ok: true }));

// 签收挂账(design/14 修订①):明细行照抄笔记本格式——品名|要货|实称|单价,金额服务端算;
// 差异闸门:diff=true 只存回执不挂账,进老板娘待改账队列。兼容旧的整单金额模式(amountYuan)。
app.post('/api/receipts', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const b = await c.req.json();
  if (Array.isArray(b.items)) {
    const items = b.items.map((it) => ({
      name: it.name, unit: it.unit,
      qtyOrdered: it.qtyOrdered, qtyActual: it.qtyActual,
      unitPriceCents: toCents(it.unitPriceYuan),
    }));
    const r = await postDeliveryReceipt(store, {
      tenantId, partyId: b.customerId, bizDate: b.bizDate, dateKey: b.dateKey,
      items, diff: b.diff === true, signer: b.signer, photoKey: b.photoKey,
    });
    return c.json({ ok: true, receiptId: r.receipt.id, receiptNo: r.receipt.receiptNo, amountCents: r.amountCents, held: r.held });
  }
  // 旧模式:整单金额
  const receiptNo = await nextNo(store, { tenantId, prefix: 'HZ', dateKey: b.dateKey });
  if (b.diff === true) {
    return c.json({ ok: true, receiptNo, held: true, note: '有改动:挂起待老板娘改账,电子卡暂不发出' });
  }
  await applyEntry(store, {
    tenantId, partyId: b.customerId, type: 'delivery', amountCents: toCents(b.amountYuan),
    refType: 'receipt', refId: receiptNo, bizDate: b.bizDate,
  });
  return c.json({ ok: true, receiptNo, held: false });
});

// 老板娘处理"有改动"单:按改后明细确认落账
app.post('/api/receipts/:id/confirm', async (c) => {
  const store = c.get('store');
  const b = await c.req.json().catch(() => ({}));
  const items = Array.isArray(b.items)
    ? b.items.map((it) => ({ name: it.name, unit: it.unit, qtyOrdered: it.qtyOrdered, qtyActual: it.qtyActual, unitPriceCents: toCents(it.unitPriceYuan) }))
    : undefined;
  const r = await confirmHeldReceipt(store, c.req.param('id'), { items });
  return c.json({ ok: true, receiptNo: r.receipt.receiptNo, amountCents: r.amountCents });
});

// 月账极简视图(design/14 修订④):"日期=金额"逐日清单+合计——客户看惯的样子
app.get('/api/customers/:id/monthly', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const q = c.req.query();
  const view = await monthlyView(store, { tenantId, partyId: c.req.param('id'), from: q.from, to: q.to });
  return c.json(view);
});

// 家用版初始建档(仅 DEV_SEED=1 环境开放;真实档案以店主校对为准)
app.post('/api/dev/seed', async (c) => {
  if (c.env.DEV_SEED !== '1') return c.json({ ok: false, error: '未开放' }, 403);
  const r = await seedTenant(c.get('store'), c.get('tenantId'));
  return c.json({ ok: true, ...r });
});

// 记一笔收款(手工记款是一等公民,≤10秒流程的后端)
app.post('/api/payments', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const b = await c.req.json();
  const r = await recordPayment(store, {
    tenantId, partyId: b.customerId, amountCents: toCents(b.amountYuan),
    method: b.method, refId: b.refId, bizDate: b.bizDate,
  });
  return c.json({ ok: true, prepayCents: r.prepayCents, balanceCents: await getBalance(store, tenantId, b.customerId) });
});

// 生成日账单 RZ(今日对账工作台"按原单生成/调整后生成"共用;幂等)
app.post('/api/statements/daily', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const b = await c.req.json();
  const { stmt, created } = await generateStatement(store, {
    tenantId, partyId: b.customerId, kind: 'RZ', periodKey: b.dateKey,
    from: b.bizDate, to: b.bizDate, openingCents: b.openingCents | 0,
  });
  return c.json({ ok: true, created, no: stmt.no, closingCents: stmt.closingCents });
});

// 客户表态(确认/异议)与结算前置检查
app.post('/api/statements/:key/mark', async (c) => {
  const store = c.get('store');
  const b = await c.req.json();
  const r = await markStatement(store, c.req.param('key'), b.action, b);
  return c.json({ ok: true, status: r.status });
});
app.get('/api/settlement-readiness', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const q = c.req.query();
  return c.json(await settlementReadiness(store, { tenantId, partyId: q.customerId, from: q.from, to: q.to }));
});

// 客户欠款与账龄(账页/催款军师的数据源)
app.get('/api/customers/:id/balance', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const partyId = c.req.param('id');
  return c.json({
    balanceCents: await getBalance(store, tenantId, partyId),
    aging: await aging(store, { tenantId, partyId, today: c.req.query('today') }),
  });
});

// 夜间重算校验(Cron Trigger 每日 03:00 调用;不平即报警——账不平是 P0 事故)
async function nightlyVerify(env, tenantIds) {
  const store = new D1Store(env.DB);
  const alarms = [];
  for (const t of tenantIds) alarms.push(...await recalcAndVerify(store, t));
  // TODO(M1): alarms 非空→告警渠道(邮件/自用群机器人),绝不静默
  return alarms;
}

module.exports = { app, nightlyVerify };
module.exports.default = {
  fetch: (req, env, ctx) => app.fetch(req, env, ctx),
  scheduled: async (event, env) => {
    // TODO(M1): 从 tenants 表取全部租户分片执行
    await nightlyVerify(env, []);
  },
};
