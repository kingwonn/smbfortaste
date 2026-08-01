'use strict';
// 明细行回执(design/14 修订①③④):行格式照抄店里笔记本——品名|要货数|实称数|单价|金额,
// 金额一律服务端确定性计算(mulQty,分位取整);差异闸门:diff=true 只存回执不挂账,
// 待老板娘改账确认(confirmHeldReceipt)后才生成应收与电子单。

const { mulQty, assertCents } = require('./money');
const { nextNo } = require('./numbering');
const { applyEntry } = require('./balance');

function buildLines(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('回执必须有明细行');
  return items.map((it) => {
    if (!it.name) throw new Error('明细缺品名');
    assertCents(it.unitPriceCents, `${it.name}.unitPriceCents`);
    const qty = it.qtyActual != null ? it.qtyActual : it.qtyOrdered; // 不称重品:实发=要货
    const amountCents = mulQty(it.unitPriceCents, qty);
    return {
      name: it.name,
      qtyOrdered: it.qtyOrdered != null ? it.qtyOrdered : qty,
      qtyActual: qty,
      unit: it.unit || null,
      unitPriceCents: it.unitPriceCents,
      amountCents,
    };
  });
}

async function postDeliveryReceipt(store, {
  tenantId, partyId, bizDate, dateKey, items, diff = false, signer, photoKey, direction = 'receivable',
}) {
  const lines = buildLines(items);
  const amountCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const receiptNo = await nextNo(store, { tenantId, prefix: 'HZ', dateKey });
  const receipt = await store.insert('receipts', {
    tenantId, direction, partyId, receiptNo, bizDate,
    items: lines, amountCents, held: !!diff,
    signer: signer || null, photoKey: photoKey || null,
  });
  if (!diff) {
    await applyEntry(store, {
      tenantId, direction, partyId, type: 'delivery', amountCents,
      refType: 'receipt', refId: receiptNo, bizDate,
    });
  }
  return { receipt, amountCents, held: !!diff };
}

// 老板娘处理"有改动"单:按实际改后的明细重算、落账;回执从挂起转生效,改动留在明细里
async function confirmHeldReceipt(store, receiptId, { items, direction = 'receivable' }) {
  const receipt = await store.get('receipts', receiptId);
  if (!receipt) throw new Error('回执不存在');
  if (!receipt.held) throw new Error('该回执不是挂起状态');
  const lines = buildLines(items || receipt.items);
  const amountCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const updated = await store.cas('receipts', receiptId, receipt._v, {
    items: lines, amountCents, held: false,
  });
  await applyEntry(store, {
    tenantId: receipt.tenantId, direction, partyId: receipt.partyId,
    type: 'delivery', amountCents, refType: 'receipt', refId: receipt.receiptNo,
    bizDate: receipt.bizDate,
  });
  return { receipt: updated, amountCents };
}

module.exports = { postDeliveryReceipt, confirmHeldReceipt, buildLines };
