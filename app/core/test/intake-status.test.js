'use strict';
// 需求条目状态机守卫(走查中抓到的真实缺陷):
// 已开单(booked)的需求曾会回流到今晚待办,被再确认→再挂账→重复收钱。
// 规矩:待办清单只认 pending/flagged;booked 不能再确认、不能直接作废。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { getTodolist, confirmIntake, bookIntake, dismissIntake } = require('../intake');

async function seedIntake(store, status) {
  return store.insert('intakes', {
    tenantId: 't1', bizDate: '2026-08-02', source: 'paste-pc',
    partyId: 'c1', customerName: '佳湘小厨',
    lines: [{ raw: '姜三斤', qty: 3, unit: '斤', flagged: false }],
    status,
  });
}

test('待办清单白名单:booked/confirmed/dismissed 一律不回流', async () => {
  const store = new MemoryStore();
  await seedIntake(store, 'pending');
  await seedIntake(store, 'flagged');
  await seedIntake(store, 'confirmed');
  await seedIntake(store, 'booked');
  await seedIntake(store, 'dismissed');
  const list = await getTodolist(store, { tenantId: 't1', bizDate: '2026-08-02' });
  const statuses = list.flatMap((g) => g.items.map((i) => i.status)).sort();
  assert.deepEqual(statuses, ['flagged', 'pending']);
});

test('已开单的条目:再确认被拒、直接作废被拒——重复挂账的门焊死', async () => {
  const store = new MemoryStore();
  const it = await seedIntake(store, 'confirmed');
  await bookIntake(store, it.id, { receiptNo: 'HZ20260802-0001' });
  await assert.rejects(() => confirmIntake(store, it.id, {}), /已开单挂账,不能再确认/);
  await assert.rejects(() => dismissIntake(store, it.id, '手滑'), /不能直接作废/);
});

test('确认只认 pending/flagged;确认过的不能重复确认', async () => {
  const store = new MemoryStore();
  const it = await seedIntake(store, 'pending');
  const r = await confirmIntake(store, it.id, {});
  assert.equal(r.status, 'confirmed');
  await assert.rejects(() => confirmIntake(store, it.id, {}), /已处理过,不能再确认/);
});
