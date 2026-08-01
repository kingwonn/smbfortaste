'use strict';
// 账务内核之二:应收流水 + 物化余额 + 重算校验(design/05 包5、design/06 模块9)。
// 规矩:流水只追加不修改;余额是流水的物化结果;每夜全量重算比对,不平即报警,以流水为准修复。
// direction 抽象(design/08):receivable=对客户应收,payable=对供应商应付,同一引擎。

const { assertCents } = require('./money');
const { ConflictError } = require('./store-memory');

const ENTRY_TYPES = new Set(['delivery', 'payment', 'adjust', 'opening']);

function balanceId(tenantId, direction, partyId) {
  return `${tenantId}|${direction}|${partyId}`;
}

// 追加一条流水并同步维护物化余额。
// delivery/opening 为正、payment 为负、adjust 正负皆可且必附 reason+operator(design/07 缺口③)。
async function applyEntry(store, entry) {
  const { tenantId, partyId, type, amountCents, refType, refId, bizDate } = entry;
  const direction = entry.direction || 'receivable';
  if (!tenantId || !partyId || !bizDate) throw new Error('流水参数不全');
  if (!ENTRY_TYPES.has(type)) throw new Error(`未知流水类型: ${type}`);
  assertCents(amountCents, 'entry.amountCents');
  if ((type === 'delivery' || type === 'opening') && amountCents <= 0) {
    throw new Error(`${type} 流水金额必须为正`);
  }
  if (type === 'payment' && amountCents >= 0) throw new Error('payment 流水金额必须为负');
  if (type === 'adjust' && (!entry.reason || !entry.operator)) {
    throw new Error('调整分录必须附原因与经手人');
  }
  if (!refType || refId == null) throw new Error('流水必须带 refType/refId,张张有据');

  const stored = await store.insert('entries', {
    tenantId, direction, partyId, type, amountCents,
    refType, refId, bizDate,
    reason: entry.reason || null, operator: entry.operator || null, memo: entry.memo || null,
  });

  // 物化余额 CAS 重试
  const bid = balanceId(tenantId, direction, partyId);
  for (let i = 0; i < 50; i++) {
    const bal = await store.get('balances', bid);
    if (!bal) {
      try {
        await store.insert('balances', { id: bid, tenantId, direction, partyId, cents: amountCents });
        return stored;
      } catch (e) { continue; }
    }
    try {
      await store.cas('balances', bid, bal._v, { cents: bal.cents + amountCents });
      return stored;
    } catch (e) {
      if (e instanceof ConflictError) continue;
      throw e;
    }
  }
  throw new Error('余额更新重试超限');
}

async function getBalance(store, tenantId, partyId, direction = 'receivable') {
  const bal = await store.get('balances', balanceId(tenantId, direction, partyId));
  return bal ? bal.cents : 0;
}

// 夜间重算校验:逐户以流水求和比对物化余额;不平返回报警清单;repair=true 时以流水为准修复。
async function recalcAndVerify(store, tenantId, { repair = false } = {}) {
  const entries = await store.find('entries', { eq: { tenantId } });
  const computed = new Map();
  for (const e of entries) {
    const bid = balanceId(e.tenantId, e.direction, e.partyId);
    computed.set(bid, (computed.get(bid) || 0) + e.amountCents);
  }
  const balances = await store.find('balances', { eq: { tenantId } });
  const seen = new Set();
  const mismatches = [];
  for (const b of balances) {
    seen.add(b.id);
    const expect = computed.get(b.id) || 0;
    if (expect !== b.cents) {
      mismatches.push({ balanceId: b.id, materialized: b.cents, computed: expect });
      if (repair) await store.cas('balances', b.id, b._v, { cents: expect });
    }
  }
  for (const [bid, expect] of computed) {
    if (!seen.has(bid) && expect !== 0) {
      mismatches.push({ balanceId: bid, materialized: null, computed: expect });
    }
  }
  return mismatches;
}

module.exports = { applyEntry, getBalance, recalcAndVerify, balanceId };
