'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { applyEntry, getBalance, recalcAndVerify } = require('../balance');

function delivery(partyId, cents, bizDate, refId) {
  return { tenantId: 't1', partyId, type: 'delivery', amountCents: cents, refType: 'receipt', refId, bizDate };
}

test('流水追加与物化余额同步一致', async () => {
  const store = new MemoryStore();
  await applyEntry(store, delivery('c1', 20500, '2026-07-01', 'HZ1'));
  await applyEntry(store, delivery('c1', 14500, '2026-07-02', 'HZ2'));
  await applyEntry(store, {
    tenantId: 't1', partyId: 'c1', type: 'payment', amountCents: -10000,
    refType: 'payment', refId: 'P1', bizDate: '2026-07-03',
  });
  await applyEntry(store, {
    tenantId: 't1', partyId: 'c1', type: 'adjust', amountCents: -500,
    refType: 'receipt', refId: 'HZ2', bizDate: '2026-07-03', reason: '两桶破损折让', operator: '老板娘',
  });
  assert.equal(await getBalance(store, 't1', 'c1'), 20500 + 14500 - 10000 - 500);
  assert.deepEqual(await recalcAndVerify(store, 't1'), [], '夜间重算应零报警');
});

test('调整分录必须附原因与经手人,否则拒绝(design/07 缺口③)', async () => {
  const store = new MemoryStore();
  await assert.rejects(
    applyEntry(store, {
      tenantId: 't1', partyId: 'c1', type: 'adjust', amountCents: -500,
      refType: 'receipt', refId: 'HZ1', bizDate: '2026-07-01',
    }),
    /原因与经手人/,
  );
});

test('人为造一笔错账,夜间重算必报警,repair 以流水为准修复', async () => {
  const store = new MemoryStore();
  await applyEntry(store, delivery('c1', 10000, '2026-07-01', 'HZ1'));
  // 直接篡改物化余额(模拟bug/手改库)
  const bal = await store.get('balances', 't1|receivable|c1');
  await store.cas('balances', bal.id, bal._v, { cents: 99999 });
  const alarms = await recalcAndVerify(store, 't1');
  assert.equal(alarms.length, 1);
  assert.equal(alarms[0].materialized, 99999);
  assert.equal(alarms[0].computed, 10000);
  await recalcAndVerify(store, 't1', { repair: true });
  assert.equal(await getBalance(store, 't1', 'c1'), 10000);
  assert.deepEqual(await recalcAndVerify(store, 't1'), []);
});

test('并发追加流水,余额不丢更新', async () => {
  const store = new MemoryStore();
  await Promise.all(
    Array.from({ length: 30 }, (_, i) => applyEntry(store, delivery('c1', 100, '2026-07-01', `HZ${i}`))),
  );
  assert.equal(await getBalance(store, 't1', 'c1'), 3000);
  assert.deepEqual(await recalcAndVerify(store, 't1'), []);
});
