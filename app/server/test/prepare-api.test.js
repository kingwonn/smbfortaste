'use strict';
// 备好引擎四端点端到端:真实建档 → 昨日挂账留价 → 今晚收单确认 → 总览预填 → 汇报稿 → 客户360。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/index');
const { newMockD1 } = require('../../core/test/d1-mock');

function client() {
  const env = { DB: newMockD1(), DEV_SEED: '1' };
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

test('总览/验证/汇报/360:系统把一切备好,四端点一条链走通', async () => {
  const call = client();
  const JX = 't1|c_jxxc'; // 佳湘小厨(真实建档 id)
  await call('/api/dev/seed', {});

  // 昨天:佳湘挂过 姜2.8斤×1.9 → 留下价格记忆
  let r = await call('/api/receipts', {
    customerId: JX, bizDate: '2026-08-01', dateKey: '20260801',
    items: [{ name: '姜', unit: '斤', qtyOrdered: 3, qtyActual: 2.8, unitPriceYuan: '1.9' }],
  });
  assert.equal(r.status, 200);

  // 价格记忆端点:该客户上回价 1.9
  r = await call(`/api/price-suggest?customerId=${encodeURIComponent(JX)}&names=${encodeURIComponent('姜')}`);
  assert.deepEqual([r.json['姜'].cents, r.json['姜'].source], [190, 'customer-last']);

  // 今晚:微信消息拆单 → 确认
  r = await call('/api/intake', { text: '佳湘小厨\n姜三斤', source: 'paste-pc', bizDate: '2026-08-02' });
  assert.equal(r.json.created.length, 1);
  const intakeId = r.json.created[0].id;
  r = await call(`/api/intake/${intakeId}/confirm`, {});
  assert.equal(r.json.status, 'confirmed');

  // 总览:待记账已按上回价备好,估算 3×1.9=5.70;六项验证全绿
  r = await call('/api/overview?bizDate=2026-08-02&today=2026-08-02');
  assert.equal(r.json.prepared.length, 1);
  const p = r.json.prepared[0];
  assert.equal(p.customerName, '佳湘小厨');
  assert.equal(p.lines[0].suggest.cents, 190);
  assert.equal(p.estimateCents, 570);
  assert.equal(r.json.audit.ok, true);
  assert.equal(r.json.receivable.cents, 532); // 昨日挂账 5.32 未收

  // 汇报稿:说人话,报平安
  r = await call('/api/briefing?bizDate=2026-08-02&today=2026-08-02');
  assert.match(r.json.text, /佳湘小厨/);
  assert.match(r.json.text, /价钱都按上回的给您备好了,预计一共5元7角/);
  assert.match(r.json.text, /项交叉检查全部通过,分毫不差/);

  // 客户360:昨日那笔挂账带着回执明细,页内交叉核对通过
  r = await call(`/api/customers/${encodeURIComponent(JX)}/trace?today=2026-08-02`);
  assert.equal(r.json.customer.name, '佳湘小厨');
  assert.equal(r.json.balanceCents, 532);
  const d = r.json.timeline.find((x) => x.type === 'delivery');
  assert.equal(d.receipt.itemCount, 1);
  assert.equal(d.openCents, 532);
  assert.equal(r.json.verify.consistent, true);

  // 独立验证端点随叫随到
  r = await call('/api/audit');
  assert.equal(r.json.ok, true);
  assert.equal(r.json.checks.length, 6);
});
