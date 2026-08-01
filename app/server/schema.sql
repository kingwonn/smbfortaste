-- Cloudflare D1 库表结构(与 app/core/store-d1.js 的 COLS 注册严格对应)
-- 模式:每集合一张表 = id 主键 + v 版本 + data JSON;查询/唯一字段用生成列落索引。
-- 迁移:wrangler d1 execute <DB> --file=schema.sql

CREATE TABLE IF NOT EXISTS entries (
  id   TEXT PRIMARY KEY,
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId  TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED,
  direction TEXT GENERATED ALWAYS AS (json_extract(data,'$.direction')) STORED,
  partyId   TEXT GENERATED ALWAYS AS (json_extract(data,'$.partyId')) STORED,
  type      TEXT GENERATED ALWAYS AS (json_extract(data,'$.type')) STORED,
  bizDate   TEXT GENERATED ALWAYS AS (json_extract(data,'$.bizDate')) STORED
);
CREATE INDEX IF NOT EXISTS idx_entries_party ON entries(tenantId, direction, partyId, bizDate);
CREATE INDEX IF NOT EXISTS idx_entries_tenant ON entries(tenantId);

CREATE TABLE IF NOT EXISTS allocations (
  id   TEXT PRIMARY KEY,
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId       TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED,
  direction      TEXT GENERATED ALWAYS AS (json_extract(data,'$.direction')) STORED,
  partyId        TEXT GENERATED ALWAYS AS (json_extract(data,'$.partyId')) STORED,
  paymentEntryId TEXT GENERATED ALWAYS AS (json_extract(data,'$.paymentEntryId')) STORED
);
CREATE INDEX IF NOT EXISTS idx_alloc_party ON allocations(tenantId, direction, partyId);
CREATE INDEX IF NOT EXISTS idx_alloc_payment ON allocations(paymentEntryId);

CREATE TABLE IF NOT EXISTS balances (
  id   TEXT PRIMARY KEY,          -- tenantId|direction|partyId
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId  TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED,
  direction TEXT GENERATED ALWAYS AS (json_extract(data,'$.direction')) STORED,
  partyId   TEXT GENERATED ALWAYS AS (json_extract(data,'$.partyId')) STORED
);
CREATE INDEX IF NOT EXISTS idx_bal_tenant ON balances(tenantId);

CREATE TABLE IF NOT EXISTS statements (
  id   TEXT PRIMARY KEY,          -- tenantId|partyId|kind|periodKey(幂等键即主键)
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId  TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED,
  partyId   TEXT GENERATED ALWAYS AS (json_extract(data,'$.partyId')) STORED,
  kind      TEXT GENERATED ALWAYS AS (json_extract(data,'$.kind')) STORED,
  periodKey TEXT GENERATED ALWAYS AS (json_extract(data,'$.periodKey')) STORED
);
CREATE INDEX IF NOT EXISTS idx_stmt_party ON statements(tenantId, partyId, kind);

CREATE TABLE IF NOT EXISTS counters (
  id   TEXT PRIMARY KEY,          -- tenantId|prefix|dateKey
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id   TEXT PRIMARY KEY,
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId  TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED,
  partyId   TEXT GENERATED ALWAYS AS (json_extract(data,'$.partyId')) STORED,
  bizDate   TEXT GENERATED ALWAYS AS (json_extract(data,'$.bizDate')) STORED,
  held      INTEGER GENERATED ALWAYS AS (json_extract(data,'$.held')) STORED
);
CREATE INDEX IF NOT EXISTS idx_receipts_party ON receipts(tenantId, partyId, bizDate);
CREATE INDEX IF NOT EXISTS idx_receipts_held ON receipts(tenantId, held);

CREATE TABLE IF NOT EXISTS customers (
  id   TEXT PRIMARY KEY,
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenantId);

CREATE TABLE IF NOT EXISTS products (
  id   TEXT PRIMARY KEY,
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenantId);

CREATE TABLE IF NOT EXISTS doc_numbers (
  id   TEXT PRIMARY KEY,
  v    INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  tenantId TEXT GENERATED ALWAYS AS (json_extract(data,'$.tenantId')) STORED,
  no       TEXT GENERATED ALWAYS AS (json_extract(data,'$.no')) STORED
);
-- 单号租户内唯一(app/core/numbering.js 的双保险之一)
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_numbers ON doc_numbers(tenantId, no);
