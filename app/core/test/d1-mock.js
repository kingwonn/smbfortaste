'use strict';
// 本地 D1 模拟器:用 node:sqlite 暴露 Cloudflare D1 的 API 子集(prepare/bind/run/first/all),
// 让 store-d1 适配器与账务内核在本机跑同一套测试。真 D1 语义差异:按语句原子、异步——
// 适配器只依赖"单条语句原子"这一条,两边一致。

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

class MockStmt {
  constructor(stmt) { this.stmt = stmt; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async run() {
    const info = this.stmt.run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
  async first() {
    const row = this.stmt.get(...this.params);
    return row == null ? null : { ...row };
  }
  async all() {
    return { results: this.stmt.all(...this.params).map((r) => ({ ...r })) };
  }
}

class MockD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new MockStmt(this.db.prepare(sql)); }
}

function newMockD1() {
  const db = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'schema.sql'), 'utf8');
  db.exec(schema);
  return new MockD1(db);
}

module.exports = { newMockD1, MockD1 };
