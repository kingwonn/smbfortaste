'use strict';
// 账务内核之一:取号协议(design/05 包5、design/06 模块1)。
// 计数器文档 CAS 自增 + 已发单号唯一索引双保险;序号4位;并发冲突重试,重试超限报错而不发重号。
// 单号规则:前缀+日期+4位序号,如 HZ20260801-0001 / RZ20260801-0012 / DZ202607-0003。

const { DuplicateKeyError, ConflictError } = require('./store-memory');

const MAX_RETRY = 200; // 压测目标:100 并发零重号;冲突重试的代价是延迟,绝不是重号

function initNumbering(store) {
  // 单号在租户内唯一:不同门店各自都有 RZ20260801-0001,互不相干
  store.ensureUniqueIndex('doc_numbers', ['tenantId', 'no']);
}

async function nextNo(store, { tenantId, prefix, dateKey }) {
  if (!tenantId || !prefix || !dateKey) throw new Error('取号参数不全');
  const counterId = `${tenantId}|${prefix}|${dateKey}`;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    let counter = await store.get('counters', counterId);
    if (!counter) {
      try {
        counter = await store.insert('counters', { id: counterId, n: 0 });
      } catch (e) {
        if (!(e instanceof DuplicateKeyError)) throw e;
        counter = await store.get('counters', counterId);
      }
    }
    try {
      const updated = await store.cas('counters', counterId, counter._v, { n: counter.n + 1 });
      const no = `${prefix}${dateKey}-${String(updated.n).padStart(4, '0')}`;
      // 双保险:哪怕计数器出错,唯一索引也绝不放过重号
      await store.insert('doc_numbers', { no, tenantId, prefix, dateKey });
      return no;
    } catch (e) {
      if (e instanceof ConflictError || e instanceof DuplicateKeyError) continue;
      throw e;
    }
  }
  throw new Error(`取号重试超限(${MAX_RETRY}次): ${counterId}`);
}

module.exports = { initNumbering, nextNo };
