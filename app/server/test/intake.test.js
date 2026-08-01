'use strict';
// 收单箱端到端:粘贴文本 → 需求 todolist → 标红先处理 → 确认/作废。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/index');
const { newMockD1 } = require('../../core/test/d1-mock');
const { D1Store } = require('../../core/store-d1');
const { seedTenant } = require('../seed');

async function client() {
  const env = { DB: newMockD1(), DEV_SEED: '1' };
  await seedTenant(new D1Store(env.DB), 't1');
  return async (path, body, method) => {
    const init = { method: method || (body ? 'POST' : 'GET'), headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' } };
    if (body) init.body = JSON.stringify(body);
    const res = await app.request(path, init, env);
    let json = null;
    try { json = await res.json(); } catch { /* 非JSON响应 */ }
    return { status: res.status, json };
  };
}

test('收单箱端到端:整晚粘贴→todolist→标红置顶→改正确认→作废', async () => {
  const call = await client();

  // 一次粘贴三家的消息:两家干净,一家有含糊数量(标红)
  const text = [
    '佳湘小厨',
    '姜三斤',
    '烧鸡两只',
    '东北家常菜 小油菜1斤 黄瓜2斤',
    '十六对面 香菜2斤 拿点桂皮',
  ].join('\n');
  let r = await call('/api/intake', { text, source: 'paste-pc', bizDate: '2026-08-02' });
  assert.equal(r.status, 200);
  assert.equal(r.json.created.length, 3);
  const flagged = r.json.created.find((x) => x.status === 'flagged');
  assert.equal(flagged.customerName, '十六对面'); // "拿点桂皮"标红

  // todolist:标红的排最前
  r = await call('/api/intake/todolist?bizDate=2026-08-02');
  assert.equal(r.json.groups.length, 3);
  assert.equal(r.json.groups[0].customerName, '十六对面');

  // 标红行未处理不许确认
  r = await call(`/api/intake/${flagged.id}/confirm`, {});
  assert.equal(r.status, 500);
  assert.match(r.json.error, /标红/);

  // 老板娘改正标红行(问清了:桂皮2斤)后确认
  const group = (await call('/api/intake/todolist?bizDate=2026-08-02')).json.groups[0];
  const item = group.items[0];
  const fixedLines = item.lines.map((l) => l.flagged
    ? { ...l, flagged: false, qty: 2, unit: '斤', reason: null }
    : l);
  r = await call(`/api/intake/${item.id}/confirm`, { lines: fixedLines });
  assert.equal(r.json.status, 'confirmed');

  // 干净的一家直接确认;另一家作废(重复单)
  const rest = (await call('/api/intake/todolist?bizDate=2026-08-02')).json.groups;
  assert.equal(rest.length, 2);
  const jx = rest.find((g) => g.customerName === '佳湘小厨');
  r = await call(`/api/intake/${jx.items[0].id}/confirm`, {});
  assert.equal(r.json.status, 'confirmed');
  const db = rest.find((g) => g.customerName === '东北家常菜');
  r = await call(`/api/intake/${db.items[0].id}/dismiss`, { reason: '重复' });
  assert.equal(r.json.status, 'dismissed');

  // 清空
  r = await call('/api/intake/todolist?bizDate=2026-08-02');
  assert.equal(r.json.groups.length, 0);
});
