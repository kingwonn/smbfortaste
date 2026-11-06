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

  const all = await store.find('entries', { eq: { tenantId, direction, partyId } });
  if (openingCents == null) {
    openingCents = all.filter((e) => e.bizDate < from).reduce((s, e) => s + e.amountCents, 0);
  }
  const entries = all.filter((e) => e.bizDate >= from && e.bizDate <= to && e.type !== 'opening');

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

// 日账单发客户的文字:行格式照抄她拢账本"品名 实称×单价=金额"(design/14),末尾带前欠与总欠。
function dailyStatementText(stmt, { customerName, receipts }) {
  const { formatYuan } = require('./money');
  const y = (c) => formatYuan(c).replace(/\.00$/, '');
  const [, m, d] = stmt.from.split('-').map(Number);
  const out = [`${customerName} ${m}月${d}日 对账`];
  for (const r of receipts) {
    for (const l of r.items) {
      out.push(`${l.name} ${l.qtyActual}${l.unit || ''}×${y(l.unitPriceCents)}=${y(l.amountCents)}`);
    }
  }
  out.push(`今天合计:${y(stmt.deliveryCents)}元`);
  if (stmt.adjustCents) out.push(`调整:${y(stmt.adjustCents)}元`);
  if (stmt.paidCents) out.push(`今天已收:${y(stmt.paidCents)}元`);
  if (stmt.openingCents) out.push(`之前欠:${y(stmt.openingCents)}元`);
  out.push(`到今天共欠:${y(stmt.closingCents)}元`);
  out.push('您看下没问题回个"好"就行,有不对的直接说。');
  return out.join('\n');
}

// 出当天日账单(工作台/体验版共用):期初自动取前欠;快照已冻结后又有新流水则报 stale+差额,不许静默。
async function dailyStatementFor(store, { tenantId, partyId, bizDate, dateKey, openingCents }) {
  const { stmt, created } = await generateStatement(store, {
    tenantId, partyId, kind: 'RZ', periodKey: dateKey, from: bizDate, to: bizDate, openingCents,
  });
  const all = await store.find('entries', { eq: { tenantId, direction: 'receivable', partyId } });
  const nowNet = all.filter((e) => e.bizDate === bizDate && e.type !== 'opening').reduce((s, e) => s + e.amountCents, 0);
  const snapNet = stmt.deliveryCents + stmt.adjustCents - stmt.paidCents;
  const refs = new Set(stmt.lines.filter((l) => l.type === 'delivery').map((l) => l.refId));
  const receipts = (await store.find('receipts', { eq: { tenantId } }))
    .filter((r) => r.partyId === partyId && refs.has(r.receiptNo));
  const cust = await store.get('customers', partyId);
  return {
    ok: true, created, no: stmt.no, key: stmt.id,
    openingCents: stmt.openingCents, deliveryCents: stmt.deliveryCents, paidCents: stmt.paidCents,
    adjustCents: stmt.adjustCents, closingCents: stmt.closingCents, lines: stmt.lines,
    stale: nowNet !== snapNet, missingCents: nowNet - snapNet,
    text: dailyStatementText(stmt, { customerName: (cust && cust.name) || partyId, receipts }),
  };
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
  const entries = await store.find('entries', {
    eq: { tenantId, partyId, type: 'delivery' },
    range: { field: 'bizDate', from, to },
  });
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

// 结算单极简视图(design/14 修订④,照抄实物月账页):"日期=金额"逐日清单+合计;
// 收款另行小计。客户看惯的就是这个样子,四段式数字只作附注。
async function monthlyView(store, { tenantId, partyId, from, to, direction = 'receivable' }) {
  const entries = await store.find('entries', {
    eq: { tenantId, direction, partyId },
    range: { field: 'bizDate', from, to },
  });
  const byDay = new Map();
  let paidCents = 0;
  for (const e of entries) {
    if (e.type === 'opening') continue;
    if (e.type === 'payment') { paidCents += -e.amountCents; continue; }
    byDay.set(e.bizDate, (byDay.get(e.bizDate) || 0) + e.amountCents);
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, cents]) => ({ date, cents }));
  const totalCents = days.reduce((s, d) => s + d.cents, 0);
  return { days, totalCents, paidCents };
}

module.exports = { generateStatement, markStatement, settlementReadiness, monthlyView, stmtKey, dailyStatementText, dailyStatementFor };
