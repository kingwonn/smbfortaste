'use strict';
// 账务内核之三:收款分配(design/05 包5、design/06 模块9)。
// payment_allocation 表记录"哪笔钱冲了哪笔货":FIFO 自动分配最老未清送货分录,
// 多付/凑整自动挂预收;账龄按"最老一笔未冲清的送货"起算——色条因此可计算(回应 design/04 技术#七)。

const { assertCents } = require('./money');
const { applyEntry } = require('./balance');

async function openDeliveries(store, tenantId, partyId, direction = 'receivable') {
  const entries = await store.find(
    'entries',
    (e) => e.tenantId === tenantId && e.direction === direction && e.partyId === partyId
      && (e.type === 'delivery' || e.type === 'opening'),
  );
  const allocs = await store.find(
    'allocations',
    (a) => a.tenantId === tenantId && a.direction === direction && a.partyId === partyId,
  );
  const allocatedBy = new Map();
  for (const a of allocs) {
    if (a.entryId != null) allocatedBy.set(a.entryId, (allocatedBy.get(a.entryId) || 0) + a.amountCents);
  }
  entries.sort((a, b) => (a.bizDate < b.bizDate ? -1 : a.bizDate > b.bizDate ? 1 : a._seq - b._seq));
  return entries
    .map((e) => ({ entry: e, openCents: e.amountCents - (allocatedBy.get(e.id) || 0) }))
    .filter((x) => x.openCents > 0);
}

// 记一笔收款:写 payment 流水(负数) + FIFO 分配 + 余款挂预收。
async function recordPayment(store, { tenantId, partyId, amountCents, method, refId, bizDate, direction = 'receivable' }) {
  assertCents(amountCents, 'payment.amountCents');
  if (amountCents <= 0) throw new Error('收款金额必须为正');
  const paymentEntry = await applyEntry(store, {
    tenantId, direction, partyId, type: 'payment', amountCents: -amountCents,
    refType: 'payment', refId: refId != null ? refId : `pay_${bizDate}`, bizDate, memo: method || null,
  });

  let remain = amountCents;
  const made = [];
  for (const { entry, openCents } of await openDeliveries(store, tenantId, partyId, direction)) {
    if (remain <= 0) break;
    const take = Math.min(openCents, remain);
    const a = await store.insert('allocations', {
      tenantId, direction, partyId, paymentEntryId: paymentEntry.id, entryId: entry.id,
      amountCents: take, kind: 'fifo',
    });
    made.push(a);
    remain -= take;
  }
  if (remain > 0) {
    const a = await store.insert('allocations', {
      tenantId, direction, partyId, paymentEntryId: paymentEntry.id, entryId: null,
      amountCents: remain, kind: 'prepay',
    });
    made.push(a);
  }
  return { paymentEntry, allocations: made, prepayCents: remain };
}

// 老板手工改分配(design/06 模块9 分配调整):整笔收款的分配重来,总额不得超过收款额,全程留痕由调用方记 audit。
async function reallocatePayment(store, { tenantId, partyId, paymentEntryId, allocations, direction = 'receivable' }) {
  const payment = await store.get('entries', paymentEntryId);
  if (!payment || payment.type !== 'payment') throw new Error('收款流水不存在');
  const total = allocations.reduce((s, a) => s + assertCents(a.amountCents, 'realloc'), 0);
  if (total !== -payment.amountCents) throw new Error('分配合计必须等于收款金额');
  const olds = await store.find('allocations', (a) => a.paymentEntryId === paymentEntryId);
  for (const o of olds) await store.cas('allocations', o.id, o._v, { voided: true, amountCents: 0 });
  const made = [];
  for (const a of allocations) {
    made.push(await store.insert('allocations', {
      tenantId, direction, partyId, paymentEntryId,
      entryId: a.entryId != null ? a.entryId : null,
      amountCents: a.amountCents, kind: a.entryId != null ? 'manual' : 'prepay',
    }));
  }
  return made;
}

// 账龄:最老未冲清送货分录距今天数 → 三色(design/01 屏8:绿<30 / 黄30-60 / 红>60)。
function daysBetween(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

async function aging(store, { tenantId, partyId, today, direction = 'receivable' }) {
  const open = await openDeliveries(store, tenantId, partyId, direction);
  if (open.length === 0) return { days: 0, bucket: 'green', oldestEntryId: null };
  const oldest = open[0];
  const days = daysBetween(oldest.entry.bizDate, today);
  const bucket = days > 60 ? 'red' : days >= 30 ? 'yellow' : 'green';
  return { days, bucket, oldestEntryId: oldest.entry.id };
}

module.exports = { recordPayment, reallocatePayment, aging, openDeliveries };
