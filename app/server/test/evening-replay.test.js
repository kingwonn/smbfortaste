'use strict';
// 回放一晚:把一晚的真实订货原文按老板娘的操作顺序走完整条链(贴单→确认→记账→收款→出日账单→汇报),
// 输出与快照逐字比对。日账单文字是发给饭店老板的,任何改变都必须出现在快照 diff 里经人审过。
// 重录快照:UPDATE_SNAPSHOTS=1 node --test app/server/test/evening-replay.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/index');
const { newMockD1 } = require('../../core/test/d1-mock');

const DIR = path.join(__dirname, 'evenings');

function client() {
  const env = { DB: newMockD1(), DEV_SEED: '1' };
  return async (p, body) => {
    const init = { method: body ? 'POST' : 'GET', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' } };
    if (body) init.body = JSON.stringify(body);
    const res = await app.request(p, init, env);
    const json = await res.json();
    assert.ok(res.ok, `${p} 失败:${JSON.stringify(json)}`);
    return json;
  };
}

async function replay(ev) {
  const call = client();
  await call('/api/dev/seed', {});
  const { customers } = await call('/api/customers');
  const custId = (name) => {
    const c = customers.find((x) => x.name === name);
    assert.ok(c, `档案里没有客户"${name}"`);
    return c.id;
  };
  const { products } = await call('/api/products');
  const prodName = new Map(products.map((p) => [p.id, p.name]));
  const dk = (d) => d.replace(/-/g, '');

  for (const p of ev.prior || []) {
    await call('/api/receipts', {
      customerId: custId(p.customer), bizDate: p.bizDate, dateKey: dk(p.bizDate),
      items: p.items.map(([name, qty, unit, price]) => ({ name, unit, qtyOrdered: qty, qtyActual: qty, unitPriceYuan: price })),
    });
  }

  const day = ev.bizDate;
  for (const text of ev.messages) {
    const r = await call('/api/intake', { text, source: 'paste-pc', bizDate: day });
    assert.deepEqual(r.unassignedLines, [], '有行没归到客户');
  }
  const { groups } = await call(`/api/intake/todolist?bizDate=${day}`);
  for (const g of groups) {
    for (const it of g.items) {
      assert.notEqual(it.status, 'flagged', `${g.customerName} 有标红行:回放夹具要写明老板娘的改正`);
      await call(`/api/intake/${it.id}/confirm`, {});
    }
  }

  const touched = new Set();
  const confirmed = (await call(`/api/intake/confirmed?bizDate=${day}`)).groups;
  for (const g of confirmed) {
    const items = [];
    for (const it of g.items) {
      for (const l of it.lines) {
        const name = prodName.get(l.sku) || l.raw;
        assert.ok(ev.prices[name], `夹具缺"${name}"的单价`);
        const weighed = (ev.weights[g.customerName] || {})[name];
        items.push({ name, unit: l.unit, qtyOrdered: l.qty, qtyActual: weighed ?? l.qty, unitPriceYuan: ev.prices[name] });
      }
    }
    const rc = await call('/api/receipts', { customerId: g.partyId, bizDate: day, dateKey: dk(day), items });
    for (const it of g.items) await call(`/api/intake/${it.id}/book`, { receiptNo: rc.receiptNo });
    touched.add(g.partyId);
  }

  ev.payments.forEach((p, i) => touched.add(custId(p.customer)));
  for (const [i, p] of ev.payments.entries()) {
    await call('/api/payments', { customerId: custId(p.customer), amountYuan: p.yuan, method: p.method, refId: `replay-${i}`, bizDate: day });
  }

  const nameOf = new Map(customers.map((c) => [c.id, c.name]));
  const statements = [];
  for (const pid of [...touched].sort((a, b) => nameOf.get(a).localeCompare(nameOf.get(b), 'zh'))) {
    const s = await call('/api/statements/daily', { customerId: pid, bizDate: day, dateKey: dk(day) });
    assert.equal(s.stale, false);
    statements.push(s.text);
  }
  const audit = await call('/api/audit');
  assert.equal(audit.ok, true, `交叉验证不平:${JSON.stringify(audit.checks.filter((c) => !c.pass))}`);
  const brief = await call(`/api/briefing?bizDate=${day}`);
  return ['# ' + ev.title, '', '## 发给客户的日账单', '', statements.join('\n\n'), '', '## 听汇报', '', brief.parts.join('\n'), ''].join('\n');
}

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  test(`回放一晚 ${f}:日账单与汇报逐字等于快照`, async () => {
    const ev = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const out = await replay(ev);
    const snap = path.join(DIR, f.replace(/\.json$/, '.snapshot.md'));
    if (process.env.UPDATE_SNAPSHOTS === '1') { fs.writeFileSync(snap, out); return; }
    assert.ok(fs.existsSync(snap), `没有快照:先用 UPDATE_SNAPSHOTS=1 录一次,审过再提交 ${path.relative(process.cwd(), snap)}`);
    assert.equal(out, fs.readFileSync(snap, 'utf8'));
  });
}
