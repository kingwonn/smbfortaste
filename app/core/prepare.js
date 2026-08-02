'use strict';
// 备好引擎(design/17 四条铁律的机制层):
// 铁律① 系统备好、人只扫一眼确认 → suggestPrices(价格记忆)+ getOverview(今日总览,一切预填);
// 铁律② 数据汇接、随时调用、交叉验证 → runAudit(六项交叉验证)+ traceCustomer(客户360,每笔钱带单据链);
// 铁律④ 不想看还能听 → buildBriefing(口语化汇报稿,前端用系统语音念)。
// 规矩不变:引擎只"备",不"定"——所有落账动作仍必须经人确认,金额一律整数分。

const { mulQty, formatYuan } = require('./money');
const { recalcAndVerify } = require('./balance');

function addDays(dateStr, delta) {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  return new Date(t + delta * 86400000).toISOString().slice(0, 10);
}

function sortBySeq(a, b) {
  return (a.bizDate < b.bizDate ? -1 : a.bizDate > b.bizDate ? 1 : (a._seq || 0) - (b._seq || 0));
}

/* ---------------- 铁律①:价格记忆 ---------------- */
// 单价三级记忆:该客户最近一次 → 全店最近一次 → 档案价(salePriceCents>0)。
// 返回来源与上次日期,前端据此标注"上回价/店里价/档案价",偏差高亮由前端按 refCents 判断。
async function suggestPrices(store, { tenantId, partyId, names }) {
  const receipts = (await store.find('receipts', { eq: { tenantId } })).sort(sortBySeq);
  const products = await store.find('products', { eq: { tenantId } });
  const byName = new Map(products.map((p) => [p.name, p]));
  const mine = new Map(); const anyone = new Map(); // name -> {cents, date, qty, party}
  for (const r of receipts) {
    for (const l of r.items || []) {
      const rec = { cents: l.unitPriceCents, date: r.bizDate, qty: l.qtyActual, party: r.partyId };
      anyone.set(l.name, rec);                       // 越靠后越新,后写覆盖前写
      if (r.partyId === partyId) mine.set(l.name, rec);
    }
  }
  const out = {};
  for (const name of names) {
    if (mine.has(name)) {
      const m = mine.get(name);
      out[name] = { cents: m.cents, source: 'customer-last', lastDate: m.date, lastQty: m.qty };
    } else if (anyone.has(name)) {
      const a = anyone.get(name);
      out[name] = { cents: a.cents, source: 'tenant-last', lastDate: a.date, lastQty: a.qty };
    } else {
      const p = byName.get(name);
      out[name] = p && p.salePriceCents > 0
        ? { cents: p.salePriceCents, source: 'catalog', lastDate: null, lastQty: null }
        : { cents: null, source: 'none', lastDate: null, lastQty: null };
    }
  }
  return out;
}

/* ---------------- 铁律②:六项交叉验证 ---------------- */
// 每一项都是"同一笔钱的两条独立路径必须得出同一个数";任何一项不平都点名到单据号。
async function runAudit(store, { tenantId }) {
  const [receipts, entries, allocations, statements, intakes] = await Promise.all([
    store.find('receipts', { eq: { tenantId } }),
    store.find('entries', { eq: { tenantId } }),
    store.find('allocations', { eq: { tenantId } }),
    store.find('statements', { eq: { tenantId } }),
    store.find('intakes', { eq: { tenantId } }),
  ]);
  const checks = [];
  const add = (id, name, issues, checked) =>
    checks.push({ id, name, pass: issues.length === 0, issues, checked });

  // C1 余额↔流水:物化余额必须等于流水逐笔累加(recalcAndVerify 是夜航仪,这里随叫随到)
  const mismatches = await recalcAndVerify(store, tenantId);
  add('C1', '余额与流水分毫相符',
    mismatches.map((m) => `${m.balanceId}:台账 ${m.materialized == null ? '缺' : formatYuan(m.materialized)} ≠ 流水累加 ${formatYuan(m.computed)}`),
    entries.length);

  // C2 回执明细自洽:每行 金额=实称×单价(分位取整),整单金额=各行之和
  const c2 = [];
  for (const r of receipts) {
    let sum = 0;
    for (const l of r.items || []) {
      const expect = mulQty(l.unitPriceCents, l.qtyActual);
      if (expect !== l.amountCents) c2.push(`${r.receiptNo}「${l.name}」行金额 ${formatYuan(l.amountCents)} ≠ ${l.qtyActual}×${formatYuan(l.unitPriceCents)}`);
      sum += l.amountCents;
    }
    if (sum !== r.amountCents) c2.push(`${r.receiptNo} 整单 ${formatYuan(r.amountCents)} ≠ 各行合计 ${formatYuan(sum)}`);
  }
  add('C2', '回执:行金额=实称×单价,整单=各行之和', c2, receipts.length);

  // C3 挂账有据:生效回执 ↔ 应收流水一一对应且金额一致(两边互查,单向缺失都算不平)
  const c3 = [];
  const deliveryByRef = new Map();
  for (const e of entries) {
    if (e.type === 'delivery' && e.refType === 'receipt') {
      if (deliveryByRef.has(e.refId)) c3.push(`回执 ${e.refId} 挂了两笔账`);
      deliveryByRef.set(e.refId, e);
    }
  }
  const receiptNos = new Set();
  for (const r of receipts) {
    receiptNos.add(r.receiptNo);
    if (r.held) continue; // 挂起单本就不该有账
    const e = deliveryByRef.get(r.receiptNo);
    if (!e) c3.push(`回执 ${r.receiptNo} 已生效但没挂上账`);
    else if (e.amountCents !== r.amountCents) c3.push(`回执 ${r.receiptNo} 金额 ${formatYuan(r.amountCents)} ≠ 挂账 ${formatYuan(e.amountCents)}`);
  }
  for (const [refId] of deliveryByRef) {
    if (!receiptNos.has(refId)) c3.push(`流水引用的回执 ${refId} 不存在`);
  }
  add('C3', '每笔挂账都有回执,金额一致', c3, deliveryByRef.size);

  // C4 账单快照对得上:期末=期初+送货+调整-收款,且明细行合计与三项分解一致
  const c4 = [];
  for (const s of statements) {
    if (s.closingCents !== s.openingCents + s.deliveryCents + s.adjustCents - s.paidCents) {
      c4.push(`${s.no} 期末 ${formatYuan(s.closingCents)} ≠ 期初+送货+调整-收款`);
    }
    let d = 0, p = 0, adj = 0;
    for (const l of s.lines || []) {
      if (l.type === 'delivery') d += l.amountCents;
      else if (l.type === 'payment') p += -l.amountCents;
      else if (l.type === 'adjust') adj += l.amountCents;
    }
    if (d !== s.deliveryCents || p !== s.paidCents || adj !== s.adjustCents) {
      c4.push(`${s.no} 明细行合计与汇总数对不上`);
    }
  }
  add('C4', '账单:期末=期初+送货+调整-收款', c4, statements.length);

  // C5 收款核销闭合:每笔收款的核销合计=收款额;任何一笔送货不被多冲
  const c5 = [];
  const allocByPayment = new Map(); const allocByEntry = new Map();
  for (const a of allocations) {
    if (a.voided) continue;
    allocByPayment.set(a.paymentEntryId, (allocByPayment.get(a.paymentEntryId) || 0) + a.amountCents);
    if (a.entryId != null) allocByEntry.set(a.entryId, (allocByEntry.get(a.entryId) || 0) + a.amountCents);
  }
  const entryById = new Map(entries.map((e) => [e.id, e]));
  for (const e of entries) {
    if (e.type !== 'payment') continue;
    const got = allocByPayment.get(e.id) || 0;
    if (got !== -e.amountCents) c5.push(`收款 ${e.refId} 核销 ${formatYuan(got)} ≠ 收款额 ${formatYuan(-e.amountCents)}`);
  }
  for (const [entryId, got] of allocByEntry) {
    const e = entryById.get(entryId);
    if (!e) c5.push(`核销指向不存在的流水 ${entryId}`);
    else if (got > e.amountCents) c5.push(`${e.refId} 被多冲:核销 ${formatYuan(got)} > 货款 ${formatYuan(e.amountCents)}`);
  }
  add('C5', '每笔收款冲了哪笔货,笔笔闭合', c5, allocByPayment.size);

  // C6 需求闭环:已开单的需求必须落到真实回执号(收单→确认→回执 链条不断)
  const c6 = [];
  let booked = 0;
  for (const it of intakes) {
    if (it.status !== 'booked') continue;
    booked++;
    if (!it.receiptNo) c6.push(`「${it.customerName}」的需求已开单但没记回执号`);
    else if (!receiptNos.has(it.receiptNo)) c6.push(`「${it.customerName}」的需求指向不存在的回执 ${it.receiptNo}`);
  }
  add('C6', '每条要货最终落到回执,链条不断', c6, booked);

  return { ok: checks.every((c) => c.pass), checks };
}

/* ---------------- 铁律①:今日总览(一切备好,只等扫一眼) ---------------- */
async function getOverview(store, { tenantId, bizDate, today }) {
  const day = bizDate;
  const [customers, products, intakes, receipts, entries, balances] = await Promise.all([
    store.find('customers', { eq: { tenantId } }),
    store.find('products', { eq: { tenantId } }),
    store.find('intakes', { eq: { tenantId } }),
    store.find('receipts', { eq: { tenantId } }),
    store.find('entries', { eq: { tenantId } }),
    store.find('balances', { eq: { tenantId } }),
  ]);
  const custName = new Map(customers.map((c) => [c.id, c.name]));
  const prodBySku = new Map(products.map((p) => [p.id, p]));
  const lineName = (l) => (l.sku && prodBySku.has(l.sku) ? prodBySku.get(l.sku).name : (l.name || l.raw));

  // 今晚要办:待确认/标红(不限当天的旧欠条也提醒)
  const open = intakes.filter((it) => it.status === 'pending' || it.status === 'flagged');
  const flaggedLines = open.reduce((s, it) => s + it.lines.filter((l) => l.flagged).length, 0);
  const openLines = open.reduce((s, it) => s + it.lines.length, 0);

  // 已确认待记账 → 逐行备好单价(价格记忆),能算的先把金额估出来
  const confirmed = intakes.filter((it) => it.status === 'confirmed');
  const groups = new Map();
  for (const it of confirmed) {
    if (!groups.has(it.partyId)) groups.set(it.partyId, { partyId: it.partyId, customerName: custName.get(it.partyId) || it.customerName, intakeIds: [], lines: [] });
    const g = groups.get(it.partyId);
    g.intakeIds.push(it.id);
    for (const l of it.lines) g.lines.push({ raw: l.raw, sku: l.sku || null, name: lineName(l), qty: l.qty != null ? l.qty : null, unit: l.unit || null });
  }
  const prepared = [];
  for (const g of groups.values()) {
    const names = [...new Set(g.lines.map((l) => l.name))];
    const sug = await suggestPrices(store, { tenantId, partyId: g.partyId, names });
    let estimate = 0; let priced = 0;
    for (const l of g.lines) {
      l.suggest = sug[l.name];
      if (l.suggest.cents != null && typeof l.qty === 'number' && l.qty > 0) {
        l.estimateCents = mulQty(l.suggest.cents, l.qty); estimate += l.estimateCents; priced++;
      } else l.estimateCents = null;
    }
    prepared.push({ ...g, estimateCents: estimate, pricedLines: priced, totalLines: g.lines.length,
      allPriced: priced === g.lines.length });
  }
  prepared.sort((a, b) => b.estimateCents - a.estimateCents);

  // 今日已挂账/挂起/已收款
  const todayReceipts = receipts.filter((r) => r.bizDate === day);
  const bookedCents = todayReceipts.filter((r) => !r.held).reduce((s, r) => s + r.amountCents, 0);
  const heldCount = receipts.filter((r) => r.held).length; // 挂起单不分日子,悬着就要看见
  const todayPays = entries.filter((e) => e.type === 'payment' && e.bizDate === day);
  const paidCents = todayPays.reduce((s, e) => s + -e.amountCents, 0);

  // 应收与账龄警报(账龄逐户算太贵,这里用"最老未清"近似:C5 保证核销闭合,直接由流水推)
  const { aging } = require('./allocation');
  const debtors = [];
  for (const b of balances) {
    if (b.direction !== 'receivable' || b.cents <= 0) continue;
    const a = await aging(store, { tenantId, partyId: b.partyId, today });
    debtors.push({ partyId: b.partyId, name: custName.get(b.partyId) || b.partyId, cents: b.cents, aging: a });
  }
  debtors.sort((a, b) => b.cents - a.cents);
  const receivableCents = debtors.reduce((s, d) => s + d.cents, 0);

  // 七日送货走势(总览小图:生意的脉搏)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(day, -i);
    const cents = entries.filter((e) => e.type === 'delivery' && e.bizDate === d)
      .reduce((s, e) => s + e.amountCents, 0);
    last7.push({ date: d, cents });
  }

  const audit = await runAudit(store, { tenantId });
  return {
    bizDate: day,
    intake: { groupsOpen: open.length, openLines, flaggedLines },
    prepared,
    booked: { count: todayReceipts.filter((r) => !r.held).length, cents: bookedCents, heldCount },
    payments: { count: todayPays.length, cents: paidCents },
    receivable: { cents: receivableCents, debtors },
    last7,
    audit: {
      ok: audit.ok,
      passed: audit.checks.filter((c) => c.pass).length,
      total: audit.checks.length,
      checks: audit.checks,
    },
  };
}

/* ---------------- 铁律④:口语化汇报稿 ---------------- */
// 从总览生成一段能念出来的话:先说要办的事,再说钱,最后说账对没对上。
// 数字念法:分位为零省掉,"320元";有分位说"320元5角3分",绝不念小数点。
function speakYuan(cents) {
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100); const jiao = Math.floor((abs % 100) / 10); const fen = abs % 10;
  let s = `${yuan}元`;
  if (jiao && fen) s += `${jiao}角${fen}分`;
  else if (jiao) s += `${jiao}角`;
  else if (fen) s += `零${fen}分`; // "320元零3分",绝不念"零角"
  return (cents < 0 ? '负' : '') + s;
}

function buildBriefing(overview) {
  const parts = [];
  const [, m, d] = overview.bizDate.split('-').map(Number);
  parts.push(`${m}月${d}号的账,给您念一遍。`);

  const it = overview.intake;
  if (it.groupsOpen > 0) {
    let s = `今晚还有${it.groupsOpen}家的要货没确认,一共${it.openLines}样`;
    s += it.flaggedLines > 0 ? `,其中${it.flaggedLines}样拿不准,已经标红等您看。` : ',都认全了,扫一眼就能确认。';
    parts.push(s);
  } else parts.push('今晚的要货都确认完了。');

  if (overview.prepared.length > 0) {
    const names = overview.prepared.map((p) => p.customerName).slice(0, 3).join('、');
    const est = overview.prepared.reduce((s, p) => s + p.estimateCents, 0);
    let s = `${overview.prepared.length}家等着记账:${names}${overview.prepared.length > 3 ? '等' : ''}。价钱都按上回的给您备好了`;
    s += est > 0 ? `,预计一共${speakYuan(est)},实称一填就能挂账。` : '。';
    parts.push(s);
  }

  const bk = overview.booked;
  if (bk.count > 0) parts.push(`今天已经记了${bk.count}笔账,共${speakYuan(bk.cents)}。`);
  if (bk.heldCount > 0) parts.push(`有${bk.heldCount}张单子有改动,还挂着等您改账。`);
  const pay = overview.payments;
  if (pay.count > 0) parts.push(`收了${pay.count}笔钱,共${speakYuan(pay.cents)}。`);

  const rc = overview.receivable;
  if (rc.cents > 0) {
    const top = rc.debtors[0];
    let s = `外头一共欠着${speakYuan(rc.cents)}。欠得最多的是${top.name},${speakYuan(top.cents)}`;
    if (top.aging.bucket === 'red') s += `,已经欠了${top.aging.days}天,得催一催了。`;
    else if (top.aging.bucket === 'yellow') s += `,欠了${top.aging.days}天,可以提一嘴。`;
    else s += ',还在正常天数里。';
    parts.push(s);
    const alarm = rc.debtors.filter((x) => x !== top && x.aging.bucket === 'red');
    if (alarm.length) parts.push(`另外${alarm.map((x) => x.name).join('、')}也欠超过60天了。`);
  } else parts.push('外头没有欠账,清清爽爽。');

  const au = overview.audit;
  parts.push(au.ok
    ? `账我全对过了:${au.total}项交叉检查全部通过,分毫不差,您放心。`
    : `注意:${au.total}项交叉检查有${au.total - au.passed}项没对上,第一条是:${au.checks.find((c) => !c.pass).issues[0]}。今晚得看一眼。`);
  return { text: parts.join(''), parts };
}

/* ---------------- 铁律②:客户360(一页看全一家店,每笔钱带单据链) ---------------- */
async function traceCustomer(store, { tenantId, partyId, today }) {
  const { aging, openDeliveries } = require('./allocation');
  const [customerList, entries, receipts, statements, allocations] = await Promise.all([
    store.find('customers', { eq: { tenantId } }),
    store.find('entries', { eq: { tenantId, partyId } }),
    store.find('receipts', { eq: { tenantId, partyId } }),
    store.find('statements', { eq: { tenantId, partyId } }),
    store.find('allocations', { eq: { tenantId, partyId } }),
  ]);
  const customer = customerList.find((c) => c.id === partyId) || null;
  const receiptByNo = new Map(receipts.map((r) => [r.receiptNo, r]));
  const allocByEntry = new Map(); const allocByPayment = new Map();
  for (const a of allocations) {
    if (a.voided) continue;
    if (a.entryId != null) {
      if (!allocByEntry.has(a.entryId)) allocByEntry.set(a.entryId, []);
      allocByEntry.get(a.entryId).push(a);
    }
    if (!allocByPayment.has(a.paymentEntryId)) allocByPayment.set(a.paymentEntryId, []);
    allocByPayment.get(a.paymentEntryId).push(a);
  }
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const timeline = entries.filter((e) => e.direction === 'receivable').sort(sortBySeq).map((e) => {
    const row = {
      id: e.id, bizDate: e.bizDate, type: e.type, amountCents: e.amountCents,
      refType: e.refType, refId: e.refId, memo: e.memo || null,
    };
    if (e.type === 'delivery' && e.refType === 'receipt') {
      const r = receiptByNo.get(e.refId);
      if (r) row.receipt = { receiptNo: r.receiptNo, itemCount: (r.items || []).length, items: r.items || [] };
      const settled = (allocByEntry.get(e.id) || []).reduce((s, a) => s + a.amountCents, 0);
      row.settledCents = settled; row.openCents = e.amountCents - settled;
    }
    if (e.type === 'payment') {
      row.settles = (allocByPayment.get(e.id) || []).map((a) => ({
        amountCents: a.amountCents, kind: a.kind,
        targetRef: a.entryId != null && entryById.has(a.entryId) ? entryById.get(a.entryId).refId : (a.kind === 'prepay' ? '预收' : null),
      }));
    }
    return row;
  });

  // 该户独立交叉验证:这页给客户看之前,先让机器把两条路径的数比一遍
  const computed = timeline.reduce((s, r) => s + r.amountCents, 0);
  const { getBalance } = require('./balance');
  const balanceCents = await getBalance(store, tenantId, partyId);
  const open = await openDeliveries(store, tenantId, partyId);
  const openTotal = open.reduce((s, x) => s + x.openCents, 0);

  return {
    customer: customer ? { id: customer.id, name: customer.name, settle: customer.settle || null, note: customer.note || null } : null,
    balanceCents,
    aging: await aging(store, { tenantId, partyId, today }),
    timeline,
    statements: statements.sort((a, b) => (a._seq || 0) - (b._seq || 0)).map((s) => ({
      key: s.id, no: s.no, kind: s.kind, periodKey: s.periodKey, status: s.status, closingCents: s.closingCents,
    })),
    openDeliveries: open.map((x) => ({ refId: x.entry.refId, bizDate: x.entry.bizDate, totalCents: x.entry.amountCents, openCents: x.openCents })),
    verify: {
      ledgerCents: computed,
      balanceCents,
      openCents: openTotal,
      consistent: computed === balanceCents && (balanceCents <= 0 || openTotal === balanceCents),
    },
  };
}

module.exports = { suggestPrices, runAudit, getOverview, buildBriefing, traceCustomer, speakYuan, addDays };
