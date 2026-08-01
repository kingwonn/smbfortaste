'use strict';
// Cloudflare D1 存储适配器:与 MemoryStore 同一契约(insert/get/cas/find)。
// 表结构见 app/server/schema.sql——每个集合一张表:id 主键 + v 版本 + data JSON,
// 查询/唯一字段用 SQLite 生成列(json_extract)落索引;唯一约束由 schema 承担。
// D1 单条语句原子:CAS 用 "UPDATE ... WHERE id=? AND v=?",changes=0 即冲突。

const { DuplicateKeyError, ConflictError, NotFoundError } = require('./store-memory');

// 每个集合允许出现在查询里的列(必须与 schema.sql 的生成列一致;查其他字段=设计错误,直接抛)
const COLS = {
  entries: ['tenantId', 'direction', 'partyId', 'type', 'bizDate'],
  allocations: ['tenantId', 'direction', 'partyId', 'paymentEntryId'],
  balances: ['tenantId', 'direction', 'partyId'],
  statements: ['tenantId', 'partyId', 'kind', 'periodKey'],
  receipts: ['tenantId', 'partyId', 'bizDate', 'held'],
  intakes: ['tenantId', 'partyId', 'status', 'bizDate'],
  customers: ['tenantId'],
  products: ['tenantId'],
  counters: [],
  doc_numbers: ['tenantId', 'no'],
};
const TABLES = Object.keys(COLS);

function assertColl(coll) {
  if (!TABLES.includes(coll)) throw new Error(`未注册的集合: ${coll}`);
}
function isConstraint(e) {
  return /constraint/i.test(String(e && (e.message || e.errstr)));
}

let autoId = 0;

class D1Store {
  constructor(db) { this.db = db; }

  // 与 MemoryStore 对齐的空实现:D1 的唯一索引在 schema.sql 里,不在运行时声明
  ensureUniqueIndex() {}

  async insert(coll, doc) {
    assertColl(coll);
    const id = doc.id != null ? String(doc.id)
      : (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `auto_${Date.now()}_${++autoId}`);
    const data = { ...doc, id };
    try {
      await this.db.prepare(`INSERT INTO ${coll} (id, v, data) VALUES (?, 1, json(?))`)
        .bind(id, JSON.stringify(data)).run();
    } catch (e) {
      if (isConstraint(e)) throw new DuplicateKeyError(`${coll} 唯一约束冲突: ${id}`);
      throw e;
    }
    const row = await this.db.prepare(`SELECT rowid AS seq FROM ${coll} WHERE id=?`).bind(id).first();
    return { ...data, _v: 1, _seq: row ? row.seq : 0 };
  }

  async get(coll, id) {
    assertColl(coll);
    const row = await this.db.prepare(`SELECT v, data, rowid AS seq FROM ${coll} WHERE id=?`)
      .bind(String(id)).first();
    return row ? { ...JSON.parse(row.data), _v: row.v, _seq: row.seq } : null;
  }

  async cas(coll, id, expectedV, patch) {
    assertColl(coll);
    const cur = await this.get(coll, id);
    if (!cur) throw new NotFoundError(`${coll}/${id}`);
    const { _v, _seq, ...plain } = cur;
    const next = { ...plain, ...patch };
    const res = await this.db.prepare(`UPDATE ${coll} SET data=json(?), v=v+1 WHERE id=? AND v=?`)
      .bind(JSON.stringify(next), String(id), expectedV).run();
    const changes = res.meta ? res.meta.changes : res.changes;
    if (!changes) throw new ConflictError(`${coll}/${id} 版本冲突`);
    return { ...next, _v: expectedV + 1, _seq };
  }

  async find(coll, query = {}) {
    assertColl(coll);
    const allowed = COLS[coll];
    const where = []; const params = [];
    for (const [f, v] of Object.entries(query.eq || {})) {
      if (!allowed.includes(f)) throw new Error(`${coll} 不支持按 ${f} 查询(schema 未建列)`);
      where.push(`${f} = ?`); params.push(v);
    }
    for (const [f, vs] of Object.entries(query.in || {})) {
      if (!allowed.includes(f)) throw new Error(`${coll} 不支持按 ${f} 查询(schema 未建列)`);
      where.push(`${f} IN (${vs.map(() => '?').join(',')})`); params.push(...vs);
    }
    if (query.range) {
      const { field, from, to } = query.range;
      if (!allowed.includes(field)) throw new Error(`${coll} 不支持按 ${field} 查询(schema 未建列)`);
      if (from != null) { where.push(`${field} >= ?`); params.push(from); }
      if (to != null) { where.push(`${field} <= ?`); params.push(to); }
    }
    const sql = `SELECT v, data, rowid AS seq FROM ${coll}`
      + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY rowid';
    const res = await this.db.prepare(sql).bind(...params).all();
    return (res.results || []).map((r) => ({ ...JSON.parse(r.data), _v: r.v, _seq: r.seq }));
  }
}

module.exports = { D1Store, COLS };
