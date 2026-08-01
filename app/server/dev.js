'use strict';
// 本地开发服务器:node dev.js → http://localhost:8788
// 内存 D1 模拟器 + 自动建档(真实照片档案),浏览器直开收单工作台。
// 生产部署走 wrangler(见 wrangler.toml),本文件仅本机联调用。

const { serve } = require('@hono/node-server');
const { app } = require('./src/index');
const { newMockD1 } = require('../core/test/d1-mock');
const { D1Store } = require('../core/store-d1');
const { seedTenant } = require('./seed');

const env = { DB: newMockD1(), DEV_SEED: '1' };
const PORT = Number(process.env.PORT || 8788);

seedTenant(new D1Store(env.DB), 't1').then((r) => {
  console.log(`已建档:${r.customers} 客户 / ${r.products} 商品(照片档案,存疑项见 design/14)`);
  serve({ fetch: (req) => app.fetch(req, env), port: PORT }, () => {
    console.log(`收单工作台: http://localhost:${PORT}  (租户 t1)`);
  });
});
