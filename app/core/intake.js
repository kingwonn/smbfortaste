'use strict';
// 收单箱(design/15):任何渠道到达的订货文本(PC粘贴/剪贴板监听/公众号消息/OCR结果)
// 统一进这里,拆单成"需求 todolist"——按客户归组、逐条待确认;拿不准标红待核,绝不猜。
// 渠道只负责把话送到,转换与确认永远走同一条链:text → splitPaste → intake → 确认 → 订单。

const { splitPaste } = require('./splitter');

// 从档案表构造拆单器需要的客户形态(共享目录;客户级常用品对照表是后续细化)
async function loadSplitterCustomers(store, tenantId) {
  const customers = await store.find('customers', { eq: { tenantId } });
  const products = await store.find('products', { eq: { tenantId } });
  const catalog = products.map((p) => ({
    sku: p.id, phrase: p.name, spec: p.spec || '', unit: p.unit,
  }));
  return customers.map((c) => ({
    id: c.id, name: c.name, wxRemark: c.wxRemark || null, aliases: c.aliases || [], catalog,
  }));
}

// 一次粘贴/一条消息 → 若干 intake 条目(每客户一条,含明细行)
// source: paste-pc / paste-mobile / clipboard-watch / mp-message(公众号) / ocr
async function createIntakeFromText(store, { tenantId, text, source, bizDate, llmSplit }) {
  if (!text || !String(text).trim()) throw new Error('空文本');
  const customers = await loadSplitterCustomers(store, tenantId);
  const result = llmSplit
    ? await llmSplit(text, customers)          // AI 拆单(splitter-ai,自带幻觉拦截与规则回退)
    : splitPaste(text, customers);             // 规则拆单
  const created = [];
  for (const o of result.orders) {
    created.push(await store.insert('intakes', {
      tenantId, bizDate: bizDate || null, source: source || 'paste-pc',
      partyId: o.customerId, customerName: o.customerName,
      lines: o.lines, rawText: text.length > 2000 ? text.slice(0, 2000) : text,
      status: o.flagged ? 'flagged' : 'pending',  // flagged=有标红待核 / pending=待确认
    }));
  }
  const unassigned = result.unassigned || [];
  return { created, unassignedLines: unassigned, engine: result.engine || 'rules' };
}

// 今日需求 todolist:按客户归组,标红的排最前(先处理拿不准的)
async function getTodolist(store, { tenantId, bizDate }) {
  const q = { eq: { tenantId } };
  const all = (await store.find('intakes', q))
    .filter((it) => it.status !== 'confirmed' && it.status !== 'dismissed')
    .filter((it) => !bizDate || !it.bizDate || it.bizDate === bizDate);
  const groups = new Map();
  for (const it of all) {
    const key = it.partyId || `?${it.customerName}`;
    if (!groups.has(key)) groups.set(key, { partyId: it.partyId, customerName: it.customerName, items: [] });
    groups.get(key).items.push(it);
  }
  const list = [...groups.values()];
  list.sort((a, b) => {
    const af = a.items.some((i) => i.status === 'flagged') ? 0 : 1;
    const bf = b.items.some((i) => i.status === 'flagged') ? 0 : 1;
    return af - bf;
  });
  return list;
}

// 确认一条(可携改正后的明细——标红行改好了才许确认)
async function confirmIntake(store, intakeId, { lines, partyId } = {}) {
  const it = await store.get('intakes', intakeId);
  if (!it) throw new Error('收单条目不存在');
  const finalLines = lines || it.lines;
  if (finalLines.some((l) => l.flagged)) throw new Error('仍有标红行未处理,不能确认');
  const finalParty = partyId || it.partyId;
  if (!finalParty) throw new Error('客户未指定,不能确认');
  return store.cas('intakes', intakeId, it._v, {
    lines: finalLines, partyId: finalParty, status: 'confirmed',
  });
}

// 已确认清单(记账台的输入:今晚确认过的需求,等着实称记价挂账)
async function getConfirmed(store, { tenantId, bizDate }) {
  const all = (await store.find('intakes', { eq: { tenantId, status: 'confirmed' } }))
    .filter((it) => !bizDate || !it.bizDate || it.bizDate === bizDate);
  const groups = new Map();
  for (const it of all) {
    const key = it.partyId;
    if (!groups.has(key)) groups.set(key, { partyId: it.partyId, customerName: it.customerName, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()];
}

// 已开单(回执落账后,需求条目转 booked,不再出现在任何清单)
async function bookIntake(store, intakeId, { receiptNo } = {}) {
  const it = await store.get('intakes', intakeId);
  if (!it) throw new Error('收单条目不存在');
  if (it.status !== 'confirmed') throw new Error('只有已确认的条目才能转开单');
  return store.cas('intakes', intakeId, it._v, { status: 'booked', receiptNo: receiptNo || null });
}

// 作废(重复/玩笑/撤单)
async function dismissIntake(store, intakeId, reason) {
  const it = await store.get('intakes', intakeId);
  if (!it) throw new Error('收单条目不存在');
  return store.cas('intakes', intakeId, it._v, { status: 'dismissed', dismissReason: reason || null });
}

module.exports = {
  createIntakeFromText, getTodolist, confirmIntake, dismissIntake,
  getConfirmed, bookIntake, loadSplitterCustomers,
};
