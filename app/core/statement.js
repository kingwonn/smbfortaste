'use strict';
// 账务内核之四:日账单(RZ)/结算单(DZ)快照(design/07 三、design/08 四)。
// 三层单据链:回执(HZ,单笔凭据)→日账单(RZ,当日按户汇总,确认主战场)→结算单(DZ,周期请款)。
// 规矩:幂等键 (tenant, party, kind, periodKey);生成即快照冻结;明细行只有四种类型;
// 确认留证(谁、何时)或默认生效留证;结算单争议率≈0 是靶——结算单上不许出现第一次见到的数字。

const { nextNo } = require('./numbering');

const LINE_LABEL = { delivery: '送货', payment: '收款', adjust: '调整', opening: '期初' };

function stmtKey(tenantId, partyId, kind, periodKey) {
  return `${tenantId}|${partyId}|${kind}|${periodKey}`;
}

// kind: 'RZ'(日账单,periodKey=YYYYMMDD)| 'DZ'(结算单,periodKey 如 202607 或区间)| 'QC'(期初确认单)
async function generateStatement(store, {
  tenantId, partyId, kind, periodKey, from, to, openingCents, direction = 'receivable',
}) {
  const key = stmtKey(tenantId, partyId, kind, periodKey);
  const existing = await store.get('statements', key);
  if (existing) return { stmt: existing, created: false };

  const entries = await store.find(
    'entries',
    (e) => e.tenantId === tenantId && e.direction === direction && e.partyId === partyId
      && e.type !== 'opening' && e.bizDate >= from && e.bizDate <= to,
  );

  let deliveryCents = 0; let paidCents = 0; let adjustCents = 0;
  const lines = [];
  for (const e of entries) {
    if (e.type === 'adjust' && (!e.reason || !e.operator)) {
      throw new Error(`调整分录缺原因/经手人,拒绝出单: entry ${e.id}`);
    }
    if (e.type === 'delivery') deliveryCents += e.amountCents;
    else if (e.type === 'payment') paidCents += -e.amountCents;
    else if (e.type === 'adjust') adjustCents += e.amountCents;
    lines.push({
      bizDate: e.bizDate,
      type: e.type,
      label: LINE_LABEL[e.type],
      amountCents: e.amountCents,
      refType: e.refType,
      refId: e.refId,
      note: e.type === 'adjust' ? `${e.reason}(经手:${e.operator})` : (e.memo || ''),
    });
  }
  const closingCents = openingCents + deliveryCents + adjustCents - paidCents;

  const no = await nextNo(store, { tenantId, prefix: kind, dateKey: periodKey });
  try {
    const stmt = await store.insert('statements', {
      id: key, no, tenantId, direction, partyId, kind, periodKey, from, to,
      openingCents, deliveryCents, adjustCents, paidCents, closingCents,
      lines, status: 'generated', confirmedAt: null, confirmedBy: null,
      promisedPayDate: null, disputeMemo: null,
    });
    return { stmt, created: true };
  } catch (e) {
    const raced = await store.get('statements', key); // 并发生成:幂等返回已有快照
    if (raced) return { stmt: raced, created: false };
    throw e;
  }
}

// 表态闭环:确认(【看过了,没问题】)/ 默认生效(逾期未回应)/ 异议——全部留证。
async function markStatement(store, key, action, { by, at, memo, promisedPayDate } = {}) {
  const stmt = await store.get('statements', key);
  if (!stmt) throw new Error(`单据不存在: ${key}`);
  const patch = {};
  if (action === 'confirm') {
    Object.assign(patch, { status: 'confirmed', confirmedBy: by || null, confirmedAt: at });
  } else if (action === 'default_confirm') {
    Object.assign(patch, { status: 'default_confirmed', confirmedAt: at });
  } else if (action === 'dispute') {
    Object.assign(patch, { status: 'disputed', disputeMemo: memo || '' });
  } else {
    throw new Error(`未知动作: ${action}`);
  }
  if (promisedPayDate) patch.promisedPayDate = promisedPayDate;
  return store.cas('statements', key, stmt._v, patch);
}

// 结算单聚合校验:DZ 期内每个有流水的日子都应存在已表态的 RZ——
// "结算单上不许出现第一次见到的数字"落成可执行检查(design/08 四)。
async function settlementReadiness(store, { tenantId, partyId, from, to }) {
  const entries = await store.find(
    'entries',
    (e) => e.tenantId === tenantId && e.partyId === partyId && e.type === 'delivery'
      && e.bizDate >= from && e.bizDate <= to,
  );
  const days = [...new Set(entries.map((e) => e.bizDate))];
  const missing = []; const unsettled = [];
  for (const d of days) {
    const key = stmtKey(tenantId, partyId, 'RZ', d.replaceAll('-', ''));
    const rz = await store.get('statements', key);
    if (!rz) missing.push(d);
    else if (rz.status !== 'confirmed' && rz.status !== 'default_confirmed') unsettled.push(d);
  }
  return { ready: missing.length === 0 && unsettled.length === 0, missingDailyStatements: missing, unconfirmedDailyStatements: unsettled };
}

module.exports = { generateStatement, markStatement, settlementReadiness, stmtKey };
