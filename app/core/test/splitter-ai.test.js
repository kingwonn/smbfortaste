'use strict';
// 红线测试:AI 只递候选,幻觉必拦截,AI 挂了业务不停。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitPasteAI } = require('../splitter-ai');

const customers = [
  {
    id: 'c1', name: '老王饺子馆', wxRemark: 'B-老王饺子馆-王老板', aliases: ['老王'],
    catalog: [
      { phrase: '酱油', sku: 'TW-001', spec: '10L/桶', unit: '桶' },
      { phrase: '醋', sku: 'TW-002', spec: '420ml×15瓶/件', unit: '件' },
    ],
  },
];

test('AI 候选合法:采信并结构化', async () => {
  const llm = async () => JSON.stringify({
    orders: [{ customerId: 'c1', lines: [{ raw: '两桶酱油', sku: 'TW-001', qty: 2, unit: '桶' }], unknown: [] }],
  });
  const r = await splitPasteAI('B-老王饺子馆-王老板\n两桶酱油', customers, llm);
  assert.equal(r.engine, 'ai');
  assert.equal(r.orders[0].customerId, 'c1');
  assert.deepEqual(r.orders[0].lines[0], { raw: '两桶酱油', sku: 'TW-001', spec: '10L/桶', qty: 2, unit: '桶', flagged: false });
  assert.equal(r.orders[0].flagged, false);
});

test('幻觉拦截:编造的客户/货/数量/单位一律标红,绝不采信', async () => {
  const llm = async () => JSON.stringify({
    orders: [
      { customerId: 'c1',
        lines: [
          { raw: '花椒两袋', sku: 'TW-999', qty: 2, unit: '袋' },   // 幻觉SKU:档案里没有
          { raw: '酱油', sku: 'TW-001', qty: 0, unit: '桶' },       // 数量非法
          { raw: '两袋醋', sku: 'TW-002', qty: 2, unit: '袋' },     // 单位与档案不符
        ],
        unknown: [{ raw: '拿点香油', why: '数量没说清' }] },
      { customerId: 'c404', lines: [{ raw: '大米一袋', sku: 'LY-001', qty: 1 }] }, // 幻觉客户
    ],
  });
  const r = await splitPasteAI('乱七八糟的文本', customers, llm);
  const o1 = r.orders[0];
  assert.equal(o1.flagged, true);
  assert.match(o1.lines[0].reason, /幻觉拦截/);
  assert.match(o1.lines[1].reason, /数量非法/);
  assert.match(o1.lines[2].reason, /单位.*不符/);
  assert.match(o1.lines[3].reason, /数量没说清/);
  const o2 = r.orders[1];
  assert.equal(o2.customerId, null, '幻觉客户被采信了');
  assert.equal(o2.flagged, true);
});

test('AI 挂了/输出垃圾:回退规则版,业务不停摆', async () => {
  const r1 = await splitPasteAI('B-老王饺子馆-王老板\n两桶酱油', customers, async () => { throw new Error('超时'); });
  assert.equal(r1.engine, 'rules-fallback');
  assert.equal(r1.orders[0].customerId, 'c1');
  assert.equal(r1.orders[0].lines[0].sku, 'TW-001');

  const r2 = await splitPasteAI('B-老王饺子馆-王老板\n两桶酱油', customers, async () => '我觉得他要的是酱油吧');
  assert.equal(r2.engine, 'rules-fallback');
  assert.equal(r2.orders[0].lines[0].flagged, false);
});

test('markdown 包裹的 JSON 也能解析(模型常见输出形态)', async () => {
  const llm = async () => '```json\n' + JSON.stringify({ orders: [{ customerId: 'c1', lines: [{ raw: '一件醋', sku: 'TW-002', qty: 1, unit: '件' }], unknown: [] }] }) + '\n```';
  const r = await splitPasteAI('老王饺子馆 一件醋', customers, llm);
  assert.equal(r.engine, 'ai');
  assert.equal(r.orders[0].lines[0].flagged, false);
});
