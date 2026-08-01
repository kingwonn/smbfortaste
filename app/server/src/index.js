'use strict';
// Cloudflare Workers 服务层(Hono):只做鉴权、租户注入、参数校验与存储适配,
// 全部业务逻辑在 ../../core(平台无关账务内核)。SOTA 轮子:Hono 路由 + D1 + R2 + Cron。
// 部署:wrangler deploy;本地联调:wrangler dev;库表:wrangler d1 execute --file=schema.sql

const { Hono } = require('hono');
const { D1Store } = require('../../core/store-d1');
const { toCents } = require('../../core/money');
const { applyEntry, getBalance, recalcAndVerify } = require('../../core/balance');
const { recordPayment, aging } = require('../../core/allocation');
const { generateStatement, markStatement, settlementReadiness } = require('../../core/statement');
const { nextNo } = require('../../core/numbering');

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

// 签收挂账:配送员拍照回执后调用(差异闸门:diff=true 时只存回执,不挂账不发卡,进待改账)
app.post('/api/receipts', async (c) => {
  const store = c.get('store'); const tenantId = c.get('tenantId');
  const b = await c.req.json();
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
