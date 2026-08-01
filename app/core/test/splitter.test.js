'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitPaste, parseCnNum } = require('../splitter');

const catalogA = [
  { phrase: '酱油', sku: 'TW-001', spec: '10L/桶', unit: '桶' },
  { phrase: '醋', sku: 'TW-002', spec: '420ml×15瓶/件', unit: '件' },
  { phrase: '花椒', sku: 'TW-003', spec: '500g/袋', unit: '袋' },
];
const catalogB = [
  { phrase: '大豆油', sku: 'LY-001', spec: '20L/桶', unit: '桶' },
  { phrase: '面粉', sku: 'LY-002', spec: '25kg/袋', unit: '袋' },
];
const customers = [
  { id: 'c1', name: '老王饺子馆', wxRemark: 'B-老王饺子馆-王老板', aliases: ['老王'], catalog: catalogA },
  { id: 'c2', name: '老王面馆', wxRemark: 'B-老王面馆-王姐', aliases: ['老王'], catalog: catalogA },
  { id: 'c3', name: '学苑食堂3号档口', wxRemark: 'A-学苑食堂3档-刘姐', aliases: ['学苑', '3档'], catalog: catalogB },
];

test('多客户整晚贴单:按备注/店名拆块,常用品翻译,数量单位齐全', () => {
  const text = [
    'B-老王饺子馆-王老板',
    '两桶酱油、一件醋',
    '学苑食堂3号档口 大豆油3桶 面粉2袋',
  ].join('\n');
  const { orders, unassigned } = splitPaste(text, customers);
  assert.equal(unassigned.length, 0);
  assert.equal(orders.length, 2);

  const [o1, o2] = orders;
  assert.equal(o1.customerId, 'c1');
  assert.equal(o1.flagged, false);
  assert.deepEqual(o1.lines.map((l) => [l.sku, l.qty, l.unit]), [['TW-001', 2, '桶'], ['TW-002', 1, '件']]);

  assert.equal(o2.customerId, 'c3');
  assert.equal(o2.flagged, false);
  assert.deepEqual(o2.lines.map((l) => [l.sku, l.qty, l.unit]), [['LY-001', 3, '桶'], ['LY-002', 2, '袋']]);
});

test('铁规:拿不准一律标红,绝不猜', () => {
  const text = [
    '老王:两桶酱油',            // 小名同时像两家 → 整块标红,不猜
    'B-老王饺子馆-王老板',
    '拿点花椒',                  // 数量含糊 → 标红
    '两袋酱油',                  // 单位与档案不符(酱油按桶) → 标红
    '两包卫生纸',                // 不认识的货 → 标红
  ].join('\n');
  const { orders } = splitPaste(text, customers);

  const amb = orders[0];
  assert.equal(amb.customerId, null, '歧义客户被猜了——错归必须为零');
  assert.equal(amb.flagged, true);
  assert.match(amb.reason, /老王饺子馆.*老王面馆|老王面馆.*老王饺子馆/);

  const block = orders[1];
  assert.equal(block.customerId, 'c1');
  assert.equal(block.flagged, true);
  const [vague, unitMismatch, unknown] = block.lines;
  assert.equal(vague.flagged, true);
  assert.match(vague.reason, /数量没说清/);
  assert.equal(unitMismatch.flagged, true);
  assert.match(unitMismatch.reason, /单位.*不符/);
  assert.equal(unknown.flagged, true);
  assert.match(unknown.reason, /不认识的货/);
});

test('中文数量解析:两/十/二十/13', () => {
  assert.equal(parseCnNum('两'), 2);
  assert.equal(parseCnNum('十'), 10);
  assert.equal(parseCnNum('二十'), 20);
  assert.equal(parseCnNum('三十五'), 35);
  assert.equal(parseCnNum('13'), 13);
});

test('M0 打靶口径:语料拆单准确率≥90%、错归=0(POC语料,上线前必须换真实语料重跑)', () => {
  const corpus = [
    { text: 'B-老王饺子馆-王老板\n两桶酱油', expect: { id: 'c1', lines: [['TW-001', 2]] } },
    { text: '老王饺子馆:酱油2桶、醋1件', expect: { id: 'c1', lines: [['TW-001', 2], ['TW-002', 1]] } },
    { text: '学苑食堂3号档口 面粉10袋', expect: { id: 'c3', lines: [['LY-002', 10]] } },
    { text: 'A-学苑食堂3档-刘姐\n大豆油四桶 面粉两袋', expect: { id: 'c3', lines: [['LY-001', 4], ['LY-002', 2]] } },
    { text: '老王面馆 三件醋', expect: { id: 'c2', lines: [['TW-002', 3]] } },
    { text: '老王饺子馆\n花椒五袋、酱油一桶', expect: { id: 'c1', lines: [['TW-003', 5], ['TW-001', 1]] } },
    { text: '3档 大豆油1桶', expect: { id: 'c3', lines: [['LY-001', 1]] } },
    { text: '老王面馆:醋两件 花椒2袋', expect: { id: 'c2', lines: [['TW-002', 2], ['TW-003', 2]] } },
    { text: '学苑 面粉二十袋', expect: { id: 'c3', lines: [['LY-002', 20]] } },
    { text: 'B-老王饺子馆-王老板 酱油3桶 醋2件 花椒1袋', expect: { id: 'c1', lines: [['TW-001', 3], ['TW-002', 2], ['TW-003', 1]] } },
  ];
  let ok = 0; let misassigned = 0;
  for (const c of corpus) {
    const { orders } = splitPaste(c.text, customers);
    const o = orders[0];
    if (!o || o.customerId !== c.expect.id) { if (o && o.customerId) misassigned++; continue; }
    const got = o.lines.filter((l) => !l.flagged).map((l) => [l.sku, l.qty]);
    if (JSON.stringify(got) === JSON.stringify(c.expect.lines)) ok++;
  }
  assert.equal(misassigned, 0, '出现错归客户');
  assert.ok(ok / corpus.length >= 0.9, `拆单准确率 ${ok}/${corpus.length} 低于90%`);
});
