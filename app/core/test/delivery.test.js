'use strict';
// 明细行回执与月账视图:金额断言全部取自店里拢账本上的真实算式(design/14)。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { initNumbering } = require('../numbering');
const { mulQty, toCents } = require('../money');
const { postDeliveryReceipt, confirmHeldReceipt } = require('../delivery');
const { getBalance } = require('../balance');
const { monthlyView } = require('../statement');

test('实称×单价=金额:照抄拢账本真实算式,分毫不差', () => {
  assert.equal(mulQty(toCents('7.5'), 3.4), toCents('25.5'));   // 香菜 3.4×7.5=25.5
  assert.equal(mulQty(toCents('3'), 11.2), toCents('33.6'));    // 豆芽 11.2×3=33.6
  assert.equal(mulQty(toCents('1.9'), 23.7), toCents('45.03')); // 白菜 23.7×1.9=45.03
  assert.equal(mulQty(toCents('6'), 2.2), toCents('13.2'));     // 圆椒 2.2×6=13.2
  assert.equal(mulQty(toCents('4.8'), 3), toCents('14.4'));     // 茄子 3×4.8=14.4
  assert.throws(() => mulQty(toCents('5'), 0), /数量非法/);
});

function store6() {
  const s = new MemoryStore();
  initNumbering(s);
  return s;
}

test('明细行回执:要货/实称双数量,服务端算钱,签收即挂账', async () => {
  const store = store6();
  const { receipt, amountCents, held } = await postDeliveryReceipt(store, {
    tenantId: 't1', partyId: 'c_16', bizDate: '2026-08-01', dateKey: '20260801',
    items: [
      { name: '香菜', qtyOrdered: 3, qtyActual: 3.4, unit: '斤', unitPriceCents: toCents('7.5') },
      { name: '豆芽', qtyOrdered: 10, qtyActual: 11.2, unit: '斤', unitPriceCents: toCents('3') },
      { name: '烧鸡', qtyOrdered: 2, unit: '只', unitPriceCents: toCents('40') }, // 不称重:实发=要货
    ],
    signer: '当面点清',
  });
  assert.match(receipt.receiptNo, /^HZ20260801-\d{4}$/);
  assert.equal(held, false);
  assert.equal(amountCents, toCents('25.5') + toCents('33.6') + toCents('80'));
  assert.equal(receipt.items[2].qtyActual, 2);
  assert.equal(await getBalance(store, 't1', 'c_16'), amountCents);
});

test('差异闸门:有改动只存单不挂账,老板娘改明细确认后才落账', async () => {
  const store = store6();
  const { receipt, held } = await postDeliveryReceipt(store, {
    tenantId: 't1', partyId: 'c_ej', bizDate: '2026-08-01', dateKey: '20260801',
    items: [{ name: '大米', qtyOrdered: 6, unit: '袋', unitPriceCents: toCents('102') }],
    diff: true,
  });
  assert.equal(held, true);
  assert.equal(await getBalance(store, 't1', 'c_ej'), 0, '挂起单不许挂账');

  // 现场少收一袋:老板娘改成 5 袋确认
  const r = await confirmHeldReceipt(store, receipt.id, {
    items: [{ name: '大米', qtyOrdered: 6, qtyActual: 5, unit: '袋', unitPriceCents: toCents('102') }],
  });
  assert.equal(r.amountCents, toCents('510'));
  assert.equal(await getBalance(store, 't1', 'c_ej'), toCents('510'));
  await assert.rejects(confirmHeldReceipt(store, receipt.id, {}), /不是挂起状态/);
});

test('月账极简视图:"日期=金额"逐日清单+合计,照抄实物月账页', async () => {
  const store = store6();
  const days = [['2026-07-01', '126'], ['2026-07-02', '226'], ['2026-07-03', '297']];
  for (const [bizDate, yuan] of days) {
    await postDeliveryReceipt(store, {
      tenantId: 't1', partyId: 'c_4h', bizDate, dateKey: bizDate.replaceAll('-', ''),
      items: [{ name: '合计', qtyOrdered: 1, unitPriceCents: toCents(yuan) }],
    });
  }
  const view = await monthlyView(store, { tenantId: 't1', partyId: 'c_4h', from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(view.days.map((d) => [d.date, d.cents]),
    [['2026-07-01', 12600], ['2026-07-02', 22600], ['2026-07-03', 29700]]);
  assert.equal(view.totalCents, toCents('649')); // 126+226+297
});
