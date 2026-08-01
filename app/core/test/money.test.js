'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toCents, formatYuan, assertCents, MoneyError } = require('../money');

test('金额一律整数分:解析与格式化', () => {
  assert.equal(toCents('3.1'), 310);
  assert.equal(toCents('3.10'), 310);
  assert.equal(toCents('3'), 300);
  assert.equal(toCents(45), 4500);
  assert.equal(toCents('-0.05'), -5);
  assert.equal(formatYuan(310), '3.10');
  assert.equal(formatYuan(-5), '-0.05');
});

test('浮点陷阱在分整数下消失:0.1+0.2', () => {
  assert.equal(toCents('0.1') + toCents('0.2'), 30);
});

test('超过两位小数与非整数分一律拒绝', () => {
  assert.throws(() => toCents('3.145'), MoneyError);
  assert.throws(() => toCents('abc'), MoneyError);
  assert.throws(() => assertCents(3.14), MoneyError);
  assert.throws(() => assertCents(NaN), MoneyError);
});
