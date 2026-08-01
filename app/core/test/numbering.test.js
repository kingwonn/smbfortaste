'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { initNumbering, nextNo } = require('../numbering');

test('取号压测:100 并发零重号、序号连续(M0 打靶③口径)', async () => {
  const store = new MemoryStore();
  initNumbering(store);
  const N = 100;
  const nos = await Promise.all(
    Array.from({ length: N }, () => nextNo(store, { tenantId: 't1', prefix: 'HZ', dateKey: '20260801' })),
  );
  assert.equal(new Set(nos).size, N, '出现重号');
  const seqs = nos.map((n) => parseInt(n.split('-')[1], 10)).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: N }, (_, i) => i + 1), '序号不连续');
  assert.match(nos[0], /^HZ20260801-\d{4}$/);
});

test('租户与日期隔离:各自从0001起,互不影响', async () => {
  const store = new MemoryStore();
  initNumbering(store);
  const a = await nextNo(store, { tenantId: 't1', prefix: 'RZ', dateKey: '20260801' });
  const b = await nextNo(store, { tenantId: 't2', prefix: 'RZ', dateKey: '20260801' });
  const c = await nextNo(store, { tenantId: 't1', prefix: 'RZ', dateKey: '20260802' });
  const d = await nextNo(store, { tenantId: 't1', prefix: 'DZ', dateKey: '202608' });
  assert.equal(a, 'RZ20260801-0001');
  assert.equal(b, 'RZ20260801-0001'.replace('RZ', 'RZ')); // t2 独立计数
  assert.equal(c, 'RZ20260802-0001');
  assert.equal(d, 'DZ202608-0001');
});
