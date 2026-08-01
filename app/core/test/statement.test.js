'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { initNumbering } = require('../numbering');
const { applyEntry } = require('../balance');
const { recordPayment } = require('../allocation');
const { generateStatement, markStatement, settlementReadiness, stmtKey } = require('../statement');

async function seed(store) {
  initNumbering(store);
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 20500, refType: 'receipt', refId: 'HZ20260701-0001', bizDate: '2026-07-01' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 14500, refType: 'receipt', refId: 'HZ20260701-0002', bizDate: '2026-07-01' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'adjust', amountCents: -500, refType: 'receipt', refId: 'HZ20260701-0002', bizDate: '2026-07-01', reason: '白菜蔫了折让', operator: '老板娘' });
  await recordPayment(store, { tenantId: 't1', partyId: 'c1', amountCents: 10000, method: '微信', refId: 'P1', bizDate: '2026-07-01' });
}

test('日账单 RZ:当日多笔汇总+调整,四类型明细行,金额闭合', async () => {
  const store = new MemoryStore();
  await seed(store);
  const { stmt, created } = await generateStatement(store, {
    tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: '20260701',
    from: '2026-07-01', to: '2026-07-01', openingCents: 120000,
  });
  assert.equal(created, true);
  assert.match(stmt.no, /^RZ20260701-\d{4}$/);
  assert.equal(stmt.deliveryCents, 35000);
  assert.equal(stmt.adjustCents, -500);
  assert.equal(stmt.paidCents, 10000);
  assert.equal(stmt.closingCents, 120000 + 35000 - 500 - 10000);
  assert.deepEqual(stmt.lines.map((l) => l.label), ['送货', '送货', '调整', '收款']);
  const adj = stmt.lines.find((l) => l.type === 'adjust');
  assert.match(adj.note, /白菜蔫了折让\(经手:老板娘\)/);
});

test('幂等:同键重复生成返回同一快照,不重号不重复', async () => {
  const store = new MemoryStore();
  await seed(store);
  const args = { tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: '20260701', from: '2026-07-01', to: '2026-07-01', openingCents: 0 };
  const [r1, r2, r3] = [await generateStatement(store, args), await generateStatement(store, args), await generateStatement(store, args)];
  assert.equal(r1.created, true);
  assert.equal(r2.created, false);
  assert.equal(r3.created, false);
  assert.equal(r1.stmt.no, r2.stmt.no);
});

test('快照冻结:出单后再来流水,快照数字不变(快照后已收另行展示)', async () => {
  const store = new MemoryStore();
  await seed(store);
  const key = stmtKey('t1', 'c1', 'RZ', '20260701');
  await generateStatement(store, { tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: '20260701', from: '2026-07-01', to: '2026-07-01', openingCents: 0 });
  await recordPayment(store, { tenantId: 't1', partyId: 'c1', amountCents: 5000, method: '微信', refId: 'P2', bizDate: '2026-07-01' });
  const again = await generateStatement(store, { tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: '20260701', from: '2026-07-01', to: '2026-07-01', openingCents: 0 });
  assert.equal(again.created, false);
  assert.equal(again.stmt.paidCents, 10000, '快照被后来流水污染');
});

test('表态留证:确认/默认生效/异议,收款约定落字段', async () => {
  const store = new MemoryStore();
  await seed(store);
  const key = stmtKey('t1', 'c1', 'RZ', '20260701');
  await generateStatement(store, { tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: '20260701', from: '2026-07-01', to: '2026-07-01', openingCents: 0 });
  const confirmed = await markStatement(store, key, 'confirm', { by: 'openid_wang', at: '2026-07-02T09:00:00', promisedPayDate: '2026-07-05' });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmedBy, 'openid_wang');
  assert.equal(confirmed.promisedPayDate, '2026-07-05');
  const disputed = await markStatement(store, key, 'dispute', { memo: '7月1日那单醋没收到' });
  assert.equal(disputed.status, 'disputed');
  assert.match(disputed.disputeMemo, /醋/);
});

test('结算单前置检查:期内每个送货日都要有已表态的日账单(结算单上不出现第一次见到的数字)', async () => {
  const store = new MemoryStore();
  initNumbering(store);
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 10000, refType: 'receipt', refId: 'HZ-a', bizDate: '2026-07-01' });
  await applyEntry(store, { tenantId: 't1', partyId: 'c1', type: 'delivery', amountCents: 5000, refType: 'receipt', refId: 'HZ-b', bizDate: '2026-07-02' });

  let r = await settlementReadiness(store, { tenantId: 't1', partyId: 'c1', from: '2026-07-01', to: '2026-07-31' });
  assert.equal(r.ready, false);
  assert.deepEqual(r.missingDailyStatements, ['2026-07-01', '2026-07-02']);

  for (const d of ['20260701', '20260702']) {
    await generateStatement(store, { tenantId: 't1', partyId: 'c1', kind: 'RZ', periodKey: d, from: `2026-07-${d.slice(6)}`, to: `2026-07-${d.slice(6)}`, openingCents: 0 });
  }
  await markStatement(store, stmtKey('t1', 'c1', 'RZ', '20260701'), 'confirm', { by: 'o', at: 't' });
  r = await settlementReadiness(store, { tenantId: 't1', partyId: 'c1', from: '2026-07-01', to: '2026-07-31' });
  assert.equal(r.ready, false);
  assert.deepEqual(r.unconfirmedDailyStatements, ['2026-07-02']);

  await markStatement(store, stmtKey('t1', 'c1', 'RZ', '20260702'), 'default_confirm', { at: 't' });
  r = await settlementReadiness(store, { tenantId: 't1', partyId: 'c1', from: '2026-07-01', to: '2026-07-31' });
  assert.equal(r.ready, true);
});
