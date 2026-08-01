'use strict';
// AI 结构化拆单(design/11 刀刃①):LLM 只产生"候选",逐条过确定性校验,
// 幻觉(查无此客户/查无此货/数量非法/单位不符)一律拦下标红——AI 让红格变少,不让确认消失。
// provider 无关:llm 参数是 async ({system, prompt}) => string,换模型不换本文件。
// 模型永远不接触价格与金额;LLM 不可用/输出不合法时,整体回退规则版 splitPaste。

const { splitPaste } = require('./splitter');

function buildPrompt(text, customers) {
  const book = customers.map((c) => ({
    id: c.id,
    name: c.name,
    wxRemark: c.wxRemark || null,
    aliases: c.aliases || [],
    catalog: c.catalog.map((g) => ({ sku: g.sku, phrase: g.phrase, spec: g.spec, unit: g.unit })),
  }));
  return {
    system: [
      '你是订货消息结构化助手。把粘贴的微信订货文本拆成订单JSON。',
      '规则:1) customerId 只能取自客户档案,认不准就填 null;',
      '2) sku 只能取自该客户 catalog,没有匹配就把该行放进 unknown 并原样保留 raw;',
      '3) qty 必须是正整数,说不清数量(如"拿点")就放 unknown;',
      '4) 不要计算任何价格金额;5) 只输出JSON,不要解释。',
      '输出格式:{"orders":[{"customerId":"","lines":[{"raw":"","sku":"","qty":1,"unit":""}],"unknown":[{"raw":"","why":""}]}]}',
    ].join('\n'),
    prompt: `客户档案:\n${JSON.stringify(book)}\n\n订货文本:\n${text}`,
  };
}

// 确定性校验:候选逐条核对档案——这是红线,模型说什么不算,档案说了算。
function validateCandidate(cand, customers) {
  const orders = [];
  for (const o of cand.orders || []) {
    const customer = customers.find((c) => c.id === o.customerId);
    if (!customer) {
      orders.push({
        customerId: null, customerName: o.customerId || '未认出客户',
        lines: (o.lines || []).map((l) => ({ raw: l.raw, flagged: true, reason: '客户没认准,请人工指定' })),
        flagged: true, reason: 'AI 给的客户不在档案里,不采信',
      });
      continue;
    }
    const lines = [];
    for (const l of o.lines || []) {
      const g = customer.catalog.find((x) => x.sku === l.sku);
      if (!g) { lines.push({ raw: l.raw, flagged: true, reason: '货对不上档案(AI幻觉拦截)' }); continue; }
      if (!Number.isInteger(l.qty) || l.qty <= 0 || l.qty > 999) {
        lines.push({ raw: l.raw, sku: g.sku, flagged: true, reason: '数量非法,请核实' }); continue;
      }
      if (l.unit && l.unit !== g.unit) {
        lines.push({ raw: l.raw, sku: g.sku, qty: l.qty, unit: l.unit, flagged: true, reason: `单位"${l.unit}"与档案"${g.unit}"不符,请核实` });
        continue;
      }
      lines.push({ raw: l.raw, sku: g.sku, spec: g.spec, qty: l.qty, unit: g.unit, flagged: false });
    }
    for (const u of o.unknown || []) {
      lines.push({ raw: u.raw, flagged: true, reason: u.why || '没听清,请核实' });
    }
    orders.push({ customerId: customer.id, customerName: customer.name, lines, flagged: lines.some((l) => l.flagged) });
  }
  return { orders, unassigned: [] };
}

async function splitPasteAI(text, customers, llm) {
  try {
    const { system, prompt } = buildPrompt(text, customers);
    const raw = await llm({ system, prompt });
    const jsonText = String(raw).replace(/^```json?\s*|\s*```$/g, '');
    const cand = JSON.parse(jsonText);
    if (!cand || !Array.isArray(cand.orders)) throw new Error('候选结构不合法');
    return { ...validateCandidate(cand, customers), engine: 'ai' };
  } catch (e) {
    // LLM 不可用/输出垃圾 → 规则版兜底,业务永不因 AI 停摆
    return { ...splitPaste(text, customers), engine: 'rules-fallback', aiError: String(e.message || e) };
  }
}

module.exports = { splitPasteAI, buildPrompt, validateCandidate };
