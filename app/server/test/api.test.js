'use strict';
// 服务层端到端:Hono app.request + D1 模拟器,把"签收挂账→记款→日账单→表态→结算就绪"走通。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/index');
const { newMockD1 } = require('../../core/test/d1-mock');

function client() {
  const env = { DB: newMockD1() };
  return async (path, body, method) => {
    const init = {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' },
    };
    if (body) init.body = JSON.stringify(body);
    const res = await app.request(path, init, env);
    return { status: res.status, json: await res.json() };
  };
}

test('未登录(无租户头)一律 401', async () => {
  const res = await app.request('/api/payments', { method: 'POST', body: '{}' }, { DB: newMockD1() });
  assert.equal(res.status, 401);
});

test('端到端:签收挂账→差异闸门→记款→日账单→确认→结算就绪', async () => {
  const call = client();

  // 配送员拍照:跟单上一样 → 挂账
  let r = await call('/api/receipts', { customerId: 'c1', amountYuan: '205.00', bizDate: '2026-07-01', dateKey: '20260701' });
  assert.equal(r.status, 200);
  assert.match(r.json.receiptNo, /^HZ20260701-0001$/);
  assert.equal(r.json.held, false);

  // 有改动 → 挂起,不挂账
  r = await call('/api/receipts', { customerId: 'c1', amountYuan: '145.00', bizDate: '2026-07-01', dateKey: '20260701', diff: true });
  assert.equal(r.json.held, true);

  // 记一笔收款 100 元
  r = await call('/api/payments', { customerId: 'c1', amountYuan: '100', method: '微信', refId: 'P1', bizDate: '2026-07-01' });
  assert.equal(r.json.balanceCents, 20500 - 10000);

  // 日账单(幂等)
  r = await call('/api/statements/daily', { customerId: 'c1', dateKey: '20260701', bizDate: '2026-07-01', openingCents: 0 });
  assert.equal(r.json.created, true);
  assert.equal(r.json.closingCents, 10500);
  const again = await call('/api/statements/daily', { customerId: 'c1', dateKey: '20260701', bizDate: '2026-07-01', openingCents: 0 });
  assert.equal(again.json.created, false);
  assert.equal(again.json.no, r.json.no);

  // 客户确认 → 结算就绪
  r = await call('/api/statements/t1|c1|RZ|20260701/mark', { action: 'confirm', by: 'openid_w', at: '2026-07-02' });
  assert.equal(r.json.status, 'confirmed');
  r = await call('/api/settlement-readiness?customerId=c1&from=2026-07-01&to=2026-07-31');
  assert.equal(r.json.ready, true);

  // 欠款与账龄
  r = await call('/api/customers/c1/balance?today=2026-07-20');
  assert.equal(r.json.balanceCents, 10500);
  assert.equal(r.json.aging.bucket, 'green');
});

test('收单工作台页面:GET / 下发自包含 HTML', async () => {
  const res = await app.request('/', { method: 'GET' }, { DB: newMockD1() });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /家用版工作台/);
  assert.match(html, /今晚要办/);
  assert.match(html, /记账台/);
  assert.match(html, /客户的账/);
});
