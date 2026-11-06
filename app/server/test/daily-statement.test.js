'use strict';
// 日账单(RZ)两条真实场景:老客户带旧欠;同一客户一天送多次。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/index');
const { newMockD1 } = require('../../core/test/d1-mock');

function client() {
  const env = { DB: newMockD1(), DEV_SEED: '1' };
  return async (path, body) => {
    const init = { method: body ? 'POST' : 'GET', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' } };
    if (body) init.body = JSON.stringify(body);
    const res = await app.request(path, init, env);
    return { status: res.status, json: await res.json() };
  };
}
const JX = 't1|c_jxxc';
const book = (call, bizDate, qty, price) => call('/api/receipts', {
  customerId: JX, bizDate, dateKey: bizDate.replace(/-/g, ''),
  items: [{ name: '姜', unit: '斤', qtyOrdered: qty, qtyActual: qty, unitPriceYuan: price }],
});

test('日账单期初自动取当天之前的欠款,期末=真实欠款', async () => {
  const call = client();
  await call('/api/dev/seed', {});
  await book(call, '2026-08-01', 10, '2'); // 昨天欠 20 元
  await book(call, '2026-08-02', 5, '2'); // 今天送 10 元
  const r = await call('/api/statements/daily', { customerId: JX, dateKey: '20260802', bizDate: '2026-08-02' });
  assert.equal(r.status, 200);
  assert.equal(r.json.openingCents, 2000);
  assert.equal(r.json.closingCents, 3000);
  const bal = await call(`/api/customers/${encodeURIComponent(JX)}/balance?today=2026-08-02`);
  assert.equal(r.json.closingCents, bal.json.balanceCents); // 账单上的数=账本上的数
  assert.equal(r.json.text, [
    '佳湘小厨 8月2日 对账', '姜 5斤×2=10', '今天合计:10元', '之前欠:20元', '到今天共欠:30元',
    '您看下没问题回个"好"就行,有不对的直接说。',
  ].join('\n'));
});

test('同一天送两次:日账单含两笔;出单后再挂账会提示账单已过期', async () => {
  const call = client();
  await call('/api/dev/seed', {});
  await book(call, '2026-08-02', 5, '2');
  await book(call, '2026-08-02', 3, '2');
  let r = await call('/api/statements/daily', { customerId: JX, dateKey: '20260802', bizDate: '2026-08-02' });
  assert.equal(r.json.deliveryCents, 1600);
  assert.equal(r.json.stale, false);
  await book(call, '2026-08-02', 1, '2'); // 出单后又补送一次
  r = await call('/api/statements/daily', { customerId: JX, dateKey: '20260802', bizDate: '2026-08-02' });
  assert.equal(r.json.created, false);
  assert.equal(r.json.stale, true);
  assert.equal(r.json.missingCents, 200);
});
