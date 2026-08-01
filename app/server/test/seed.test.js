'use strict';
// 真实档案验收:照片里的客户名与真实订货消息,必须被正确建档与拆单。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newMockD1 } = require('../../core/test/d1-mock');
const { D1Store } = require('../../core/store-d1');
const { seedTenant, splitterCustomers } = require('../seed');
const { splitPaste } = require('../../core/splitter');

test('建档:12 客户 + 50+ SKU 全部入库', async () => {
  const store = new D1Store(newMockD1());
  const r = await seedTenant(store, 't1');
  assert.equal(r.customers, 12);
  assert.ok(r.products >= 50);
  const customers = await store.find('customers', { eq: { tenantId: 't1' } });
  assert.ok(customers.some((c) => c.name === '佳湘小厨'));
});

test('最长匹配:"十六对面"不误归"十六"(真实客户名互为前缀)', () => {
  const customers = splitterCustomers();
  const { orders } = splitPaste('十六对面 香菜2斤\n十六 黄瓜4斤', customers);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].customerName, '十六对面');
  assert.equal(orders[1].customerName, '十六');
  assert.equal(orders[0].flagged, false);
  assert.equal(orders[1].flagged, false);
});

test('佳湘小厨真实十行订货消息:逐行拆对,零标红零错归', () => {
  const customers = splitterCustomers();
  const realMessage = [
    '佳湘小厨',
    '姜三斤',
    '藕三斤',
    '蒜台两斤',
    '香葱两斤',
    '皮冻五斤',
    '去皮蛋两斤',
    '烧鸡两只',
    '鸭血一箱',
    '五得利面粉一袋',
    '黄灯笼辣椒酱两瓶',
  ].join('\n');
  const { orders, unassigned } = splitPaste(realMessage, customers);
  assert.equal(unassigned.length, 0);
  assert.equal(orders.length, 1);
  const o = orders[0];
  assert.equal(o.customerName, '佳湘小厨');
  assert.equal(o.flagged, false, `有标红行: ${JSON.stringify(o.lines.filter((l) => l.flagged))}`);
  assert.deepEqual(
    o.lines.map((l) => [l.raw.replace(/[一二两三四五六七八九十0-9]+(斤|只|箱|袋|瓶)$/, ''), l.qty, l.unit]),
    [
      ['姜', 3, '斤'], ['藕', 3, '斤'], ['蒜台', 2, '斤'], ['香葱', 2, '斤'],
      ['皮冻', 5, '斤'], ['去皮蛋', 2, '斤'], ['烧鸡', 2, '只'], ['鸭血', 1, '箱'],
      ['五得利面粉', 1, '袋'], ['黄灯笼辣椒酱', 2, '瓶'],
    ],
  );
});

test('菜群转发原文:"东北家常菜 辣妹子2斤 小油菜1斤"按客户拆出', () => {
  const customers = splitterCustomers();
  const { orders } = splitPaste('东北家常菜 辣妹子2斤 小油菜1斤\n猪脚饭 小油菜2斤', customers);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].customerName, '东北家常菜');
  assert.deepEqual(orders[0].lines.map((l) => [l.qty, l.unit, l.flagged]), [[2, '斤', false], [1, '斤', false]]);
  assert.equal(orders[1].customerName, '猪脚饭');
  assert.equal(orders[1].lines[0].qty, 2);
});
