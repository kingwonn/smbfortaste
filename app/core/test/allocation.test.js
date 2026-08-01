'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { applyEntry, getBalance } = require('../balance');
const { recordPayment, reallocatePayment, aging, openDeliveries } = require('../allocation');

async function seedDeliveries(store) {
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 10000, refType: 'receipt', refId: 'HZ1', bizDate: '2026-06-01' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 20000, refType: 'receipt', refId: 'HZ2', bizDate: '2026-06-20' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 15000, refType: 'receipt', refId: 'HZ3', bizDate: '2026-07-10' });
}

test('FIFO 分配:先冲最老的送货,跨笔拆分', async () => {
  const store = new MemoryStore();
  await seedDeliveries(store);
  const { allocations, prepayCents } = await recordPayment(store, {
    tenantId: 't1', partyId: 'c1', amountCents: 25000, method: '微信', refId: 'P1', bizDate: '2026-07-15',
  });
  assert.equal(prepayCents, 0);
  const fifo = allocations.filter((a) => a.kind === 'fifo');
  assert.equal(fifo.length, 2);
  assert.equal(fifo[0].amountCents, 10000); // HZ1 全冲
  assert.equal(fifo[1].amountCents, 15000); // HZ2 冲一半
  const open = await openDeliveries(store, 't1', 'c1');
  assert.deepEqual(open.map((o) => [o.entry.refId, o.openCents]), [['HZ2', 5000], ['HZ3', 15000]]);
  assert.equal(await getBalance(store, 't1', 'c1'), 20000);
});

test('凑整多付自动挂预收,余额可为负(客户多付)', async () => {
  const store = new MemoryStore();
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 9800, refType: 'receipt', refId: 'HZ1', bizDate: '2026-07-01' });
  const { prepayCents } = await recordPayment(store, {
    tenantId: 't1', partyId: 'c1', amountCents: 10000, method: '现金', refId: 'P1', bizDate: '2026-07-02',
  });
  assert.equal(prepayCents, 200);
  assert.equal(await getBalance(store, 't1', 'c1'), -200);
});

test('手工改分配:合计必须等于收款额,旧分配作废留痕', async () => {
  const store = new MemoryStore();
  await seedDeliveries(store);
  const { paymentEntry } = await recordPayment(store, {
    tenantId: 't1', partyId: 'c1', amountCents: 12000, method: '转账', refId: 'P1', bizDate: '2026-07-15',
  });
  const open = await openDeliveries(store, 't1', 'c1');
  // 老板指认:这笔钱其实是还 HZ3 的
  const hz3 = open.find((o) => o.entry.refId === 'HZ3').entry;
  await assert.rejects(
    reallocatePayment(store, { tenantId: 't1', partyId: 'c1', paymentEntryId: paymentEntry.id, allocations: [{ entryId: hz3.id, amountCents: 11000 }] }),
    /合计必须等于收款金额/,
  );
  await reallocatePayment(store, {
    tenantId: 't1', partyId: 'c1', paymentEntryId: paymentEntry.id, allocations: [{ entryId: hz3.id, amountCents: 12000 }],
  });
  const open2 = await openDeliveries(store, 't1', 'c1');
  assert.deepEqual(open2.map((o) => [o.entry.refId, o.openCents]), [['HZ1', 10000], ['HZ2', 20000], ['HZ3', 3000]]);
});

test('账龄按最老未清送货起算,三色正确', async () => {
  const store = new MemoryStore();
  await seedDeliveries(store);
  let a = await aging(store, { tenantId: 't1', partyId: 'c1', today: '2026-08-01' });
  assert.equal(a.days, 61); // 2026-06-01 起
  assert.equal(a.bucket, 'red');
  await recordPayment(store, { tenantId: 't1', partyId: 'c1', amountCents: 10000, method: '微信', refId: 'P1', bizDate: '2026-08-01' });
  a = await aging(store, { tenantId: 't1', partyId: 'c1', today: '2026-08-01' });
  assert.equal(a.days, 42); // 最老变为 2026-06-20
  assert.equal(a.bucket, 'yellow');
  await recordPayment(store, { tenantId: 't1', partyId: 'c1', amountCents: 20000, method: '微信', refId: 'P2', bizDate: '2026-08-01' });
  a = await aging(store, { tenantId: 't1', partyId: 'c1', today: '2026-08-01' });
  assert.equal(a.days, 22); // 只剩 2026-07-10
  assert.equal(a.bucket, 'green');
});
