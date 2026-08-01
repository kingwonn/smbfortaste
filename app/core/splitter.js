'use strict';
// M0 打靶②:批量贴单拆分 POC(design/05 包2)。
// 规则版:按客户名/微信备注切块 → 常用品对照表翻译 → 数量解析;
// 铁规:拿不准一律标红(flagged),绝不猜——错归客户必须为零,可疑即弃。

const CN_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNITS = '桶件袋箱瓶斤包提壶盒条只';
const VAGUE = /[点些]|^几/;

function parseCnNum(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s.length === 1) return CN_NUM[s] ?? null;
  // 十一~九十九
  const m = /^([二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0);
  return null;
}

// customers: [{id, name, wxRemark, aliases: [], catalog: [{phrase, sku, spec, unit}]}]
// 最长匹配优先:真实客户名常互为前缀("十六"/"十六对面",design/14),
// 命中键更长者胜;等长且属不同客户才算歧义("老王"小名同像两家→标红不猜)。
function matchCustomer(line, customers) {
  const hits = [];
  for (const c of customers) {
    const keys = [c.name, c.wxRemark, ...(c.aliases || [])].filter(Boolean);
    for (const k of keys) if (line.includes(k)) hits.push({ c, key: k });
  }
  if (hits.length === 0) return { customer: null, ambiguous: false };
  hits.sort((a, b) => b.key.length - a.key.length);
  const top = hits[0];
  const rival = hits.find((h) => h.c.id !== top.c.id && h.key.length === top.key.length);
  if (rival) {
    const names = [...new Set(hits.filter((h) => h.key.length === top.key.length).map((h) => h.c.name))];
    return { customer: null, ambiguous: true, candidates: names };
  }
  return { customer: top.c, key: top.key, ambiguous: false };
}

function parseItems(text, catalog) {
  const tokens = text.split(/[、,,;;\s和]+/).map((t) => t.trim()).filter(Boolean);
  const lines = [];
  for (const raw of tokens) {
    const hit = catalog.find((g) => raw.includes(g.phrase));
    if (!hit) {
      lines.push({ raw, flagged: true, reason: '不认识的货,请人工核对' });
      continue;
    }
    if (VAGUE.test(raw.replace(hit.phrase, ''))) {
      lines.push({ raw, sku: hit.sku, flagged: true, reason: '数量没说清("点/些/几"),请核实' });
      continue;
    }
    const qm = new RegExp(`([0-9]+|[一二两三四五六七八九十]{1,3})\\s*([${UNITS}])?`).exec(raw.replace(hit.phrase, ''));
    const qty = qm ? parseCnNum(qm[1]) : null;
    if (qty == null || qty <= 0) {
      lines.push({ raw, sku: hit.sku, flagged: true, reason: '没听清数量,请核实' });
      continue;
    }
    const unit = (qm && qm[2]) || hit.unit;
    if (unit !== hit.unit) {
      lines.push({ raw, sku: hit.sku, qty, unit, flagged: true, reason: `单位"${unit}"与档案"${hit.unit}"不符,请核实` });
      continue;
    }
    lines.push({ raw, sku: hit.sku, spec: hit.spec, qty, unit, flagged: false });
  }
  return lines;
}

// 入口:整段粘贴文本 → 按客户拆块 → 逐块解析。
// 返回 { orders: [{customerId, customerName, lines, flagged}], unassigned: [...] }
function splitPaste(text, customers) {
  const rows = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const orders = [];
  const unassigned = [];
  let current = null;

  for (const row of rows) {
    const head = matchCustomer(row, customers);
    if (head.ambiguous) {
      // 两家都像(老王饺子馆/老王面馆同段):宁可整块标红,绝不猜
      current = { customerId: null, customerName: row, lines: [], flagged: true, reason: `多家客户名都匹配: ${head.candidates.join(' / ')},请人工指定` };
      orders.push(current);
      continue;
    }
    if (head.customer) {
      let rest = row;
      for (const k of [head.customer.wxRemark, head.customer.name, head.key].filter(Boolean)) rest = rest.split(k).join('');
      rest = rest.replace(/^[::\s]+/, '');
      current = { customerId: head.customer.id, customerName: head.customer.name, catalog: head.customer.catalog, lines: [], flagged: false };
      orders.push(current);
      if (rest) current.lines.push(...parseItems(rest, head.customer.catalog));
      continue;
    }
    if (current && current.customerId) {
      current.lines.push(...parseItems(row, current.catalog));
    } else if (current && current.flagged) {
      current.lines.push({ raw: row, flagged: true, reason: '归属未定' });
    } else {
      unassigned.push(row);
    }
  }
  for (const o of orders) {
    delete o.catalog;
    if (o.lines.some((l) => l.flagged)) o.flagged = true;
  }
  return { orders, unassigned };
}

module.exports = { splitPaste, parseCnNum };
