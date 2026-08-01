'use strict';
// 同一套账务内核,换 D1 存储适配器重跑关键流程——两种存储行为必须一致。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newMockD1 } = require('./d1-mock');
const { D1Store } = require('../store-d1');
const { initNumbering, nextNo } = require('../numbering');
const { applyEntry, getBalance, recalcAndVerify } = require('../balance');
const { recordPayment, aging, openDeliveries } = require('../allocation');
const { generateStatement, markStatement, settlementReadiness, stmtKey } = require('../statement');

function newStore() {
  const store = new D1Store(newMockD1());
  initNumbering(store);
  return store;
}

test('D1:取号并发50零重号、租户隔离(唯一索引由 schema 承担)', async () => {
  const store = newStore();
  const nos = await Promise.all(
    Array.from({ length: 50 }, () => nextNo(store, { tenantId: 't1', prefix: 'HZ', dateKey: '20260801' })),
  );
  assert.equal(new Set(nos).size, 50);
  const t2 = await nextNo(store, { tenantId: 't2', prefix: 'HZ', dateKey: '20260801' });
  assert.equal(t2, 'HZ20260801-0001');
});

test('D1:送货→折让→收款FIFO→余额→账龄 全链一致', async () => {
  const store = newStore();
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 10000, refType: 'receipt', refId: 'HZ1', bizDate: '2026-06-01' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 20000, refType: 'receipt', refId: 'HZ2', bizDate: '2026-06-20' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'adjust', amountCents: -500, refType: 'receipt', refId: 'HZ2', bizDate: '2026-06-21', reason: '破损折让', operator: '老板娘' });
  const { prepayCents } = await recordPayment(store, { tenantId: 't1', partyId: 'c1', amountCents: 25000, method: '微信', refId: 'P1', bizDate: '2026-07-15' });
  assert.equal(prepayCents, 0);
  assert.equal(await getBalance(store, 't1', 'c1'), 10000 + 20000 - 500 - 25000);
  const open = await openDeliveries(store, 't1', 'c1');
  assert.deepEqual(open.map((o) => [o.entry.refId, o.openCents]), [['HZ2', 5000]]);
  const a = await aging(store, { tenantId: 't1', partyId: 'c1', today: '2026-08-01' });
  assert.equal(a.bucket, 'yellow'); // 2026-06-20 起 42 天
  assert.deepEqual(await recalcAndVerify(store, 't1'), []);
});

test('D1:篡改余额,重算必报警并可修复', async () => {
  const store = newStore();
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 10000, refType: 'receipt', refId: 'HZ1', bizDate: '2026-07-01' });
  const bal = await store.get('balances', 't1|receivable|c1');
  await store.cas('balances', bal.id, bal._v, { cents: 99999 });
  const alarms = await recalcAndVerify(store, 't1');
  assert.equal(alarms.length, 1);
  await recalcAndVerify(store, 't1', { repair: true });
  assert.equal(await getBalance(store, 't1', 'c1'), 10000);
});

test('D1:日账单幂等(主键即幂等键)、快照冻结、结算前置检查', async () => {
  const store = newStore();
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 20500, refType: 'receipt', refId: 'HZ-a', bizDate: '2026-07-01' });
  const args = { tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: '20260701', from: '2026-07-01', to: '2026-07-01', openingCents: 0 };
  const r1 = await generateStatement(store, args);
  const r2 = await generateStatement(store, args);
  assert.equal(r1.created, true);
  assert.equal(r2.created, false);
  assert.equal(r1.stmt.no, r2.stmt.no);
  assert.equal(r1.stmt.closingCents, 20500);

  await recordPayment(store, { tenantId: 't1', partyId: 'c1', amountCents: 5000, method: '微信', refId: 'P9', bizDate: '2026-07-01' });
  const again = await generateStatement(store, args);
  assert.equal(again.stmt.paidCents, 0, '快照被后来流水污染');

  let r = await settlementReadiness(store, { tenantId: 't1', partyId: 'c1', from: '2026-07-01', to: '2026-07-31' });
  assert.equal(r.ready, false);
  await markStatement(store, stmtKey('t1', 'c1', 'RZ', '20260701'), 'confirm', { by: 'openid_w', at: '2026-07-02' });
  r = await settlementReadiness(store, { tenantId: 't1', partyId: 'c1', from: '2026-07-01', to: '2026-07-31' });
  assert.equal(r.ready, true);
});

test('D1:查询未建列的字段直接抛错(纪律:查询必须走索引)', async () => {
  const store = newStore();
  await assert.rejects(store.find('entries', { eq: { memo: 'x' } }), /schema 未建列/);
});
