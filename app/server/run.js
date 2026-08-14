'use strict';
// 试用版单机服务器:node run.js → http://localhost:8788
// 与 dev.js(联调用,内存库)的区别:
//   1. 数据落到本地文件 data/ledger.sqlite(node:sqlite),重启不丢;
//   2. 每天首次启动自动把账本快照进 data/backups/(复制该文件即可恢复);
//   3. 空库才建档(seedTenant 不幂等,重复建档会撞唯一索引);
//   4. 默认只听 localhost;设 HJY_LAN=1 开放局域网,此时必须同时设 HJY_KEY 口令,
//      手机浏览器首次访问输一次口令(Cookie 记住)。
// 云端部署仍走 wrangler(wrangler.toml),本文件不参与生产。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { serve } = require('@hono/node-server');
const { app } = require('./src/index');
const { MockD1 } = require('../core/test/d1-mock');
const { D1Store } = require('../core/store-d1');
const { seedTenant } = require('./seed');

const TENANT = process.env.HJY_TENANT || 't1'; // 与工作台前端默认一致
const DATA_DIR = process.env.HJY_DATA || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ledger.sqlite');
const PORT = Number(process.env.PORT || 8788);
const LAN = process.env.HJY_LAN === '1';
const KEY = process.env.HJY_KEY || '';

if (LAN && !KEY) {
  console.error('要开局域网(HJY_LAN=1)必须同时设口令 HJY_KEY,拒绝裸奔。');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

// 每天首次启动先做文件级快照
if (fs.existsSync(DB_FILE)) {
  const bakDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(bakDir, { recursive: true });
  const bak = path.join(bakDir, `ledger-${new Date().toISOString().slice(0, 10)}.sqlite`);
  if (!fs.existsSync(bak)) { fs.copyFileSync(DB_FILE, bak); console.log(`已备份账本 → ${bak}`); }
}

const sqlite = new DatabaseSync(DB_FILE);
sqlite.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')); // 全部 IF NOT EXISTS,幂等
const env = { DB: new MockD1(sqlite) };

// 口令闸(仅局域网模式):Cookie 对不上就回一张口令页,对上放行到工作台
const COOKIE = 'hjy_key';
function keyOk(req) {
  const m = /(?:^|;\s*)hjy_key=([^;]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return false;
  const got = Buffer.from(m[1]); const want = Buffer.from(hash(KEY));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
const GATE_HTML = `<!doctype html><meta charset="utf8"><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font:18px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;display:flex;justify-content:center;padding-top:18vh;background:#eef1ef">
<form method=post action=/trial-login style="text-align:center">
<div style="font-size:22px;font-weight:800;margin-bottom:16px">汇金源 · 工作台</div>
<input name=key type=password placeholder="口令" autofocus style="font-size:20px;padding:10px;border:1.5px solid #dfe5e1;border-radius:10px;text-align:center">
<button style="font-size:20px;padding:10px 22px;border:0;border-radius:10px;background:#0d6e5f;color:#fff;font-weight:700;margin-left:8px">进</button>
</form></body>`;

async function fetchWithGate(req) {
  if (!KEY) return app.fetch(req, env);
  const url = new URL(req.url);
  if (url.pathname === '/trial-login' && req.method === 'POST') {
    const form = await req.formData();
    if (String(form.get('key') || '') === KEY) {
      return new Response(null, {
        status: 302,
        headers: { location: '/', 'set-cookie': `${COOKIE}=${hash(KEY)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` },
      });
    }
    return new Response(GATE_HTML, { status: 401, headers: { 'content-type': 'text/html; charset=utf8' } });
  }
  if (!keyOk(req)) return new Response(GATE_HTML, { status: 401, headers: { 'content-type': 'text/html; charset=utf8' } });
  return app.fetch(req, env);
}

(async () => {
  const store = new D1Store(env.DB);
  const existing = await store.find('customers', { eq: { tenantId: TENANT } });
  if (existing.length === 0) {
    const r = await seedTenant(store, TENANT);
    console.log(`首次启动,已建档:${r.customers} 客户 / ${r.products} 商品(照片档案,存疑项见 design/14)`);
  } else {
    console.log(`账本已在:${existing.length} 客户,数据文件 ${DB_FILE}`);
  }
  serve({ fetch: fetchWithGate, port: PORT, hostname: LAN ? '0.0.0.0' : '127.0.0.1' }, (info) => {
    console.log(`工作台开好了: http://localhost:${PORT}  (租户 ${TENANT})`);
    if (LAN) console.log(`局域网(手机同 WiFi 可开): http://本机IP:${PORT} ,口令已启用`);
    console.log('关这个窗口 = 停服务;账本在 data/ 里,天天自动备份。');
  });
})();
