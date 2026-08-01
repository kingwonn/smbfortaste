# app/ —— 工程实现

设计依据:`design/` 全套(以 05/07/08/09 修订口径为准)。开发顺序遵循 design/09 六:**账务内核先定稿先压测,再动界面**。

## 目录

```
app/
├── core/                 # 平台无关业务内核(零依赖,CommonJS)
│   ├── money.js          # 金额铁律:一律整数"分",浮点禁入账务
│   ├── store-memory.js   # 内存存储适配器(模拟云开发:无自增/CAS乐观并发/唯一索引)
│   ├── numbering.js      # 内核① 取号协议:计数器CAS+租户内单号唯一索引双保险
│   ├── balance.js        # 内核② 应收/应付流水(direction 抽象)+物化余额+夜间重算校验
│   ├── allocation.js     # 内核③ 收款FIFO分配+预收+手工改分配+账龄三色
│   ├── statement.js      # 内核④ 日账单RZ/结算单DZ快照:幂等/冻结/表态留证/结算前置检查
│   ├── splitter.js       # M0打靶② 批量贴单拆分POC(拿不准标红,绝不猜)
│   └── test/             # 22 个测试,node --test 全绿
├── miniprogram/          # 微信小程序骨架(4个M1核心页:今晚要办/贴单/今日对账/拍回执)
├── server/               # Cloudflare Workers 服务层(Hono):后端控制面,见 design/10
│   ├── src/index.js      # 路由:签收挂账(含差异闸门)/记款/日账单/表态/结算就绪/账龄 + Cron夜间重算
│   ├── schema.sql        # D1 库表(JSON data + 生成列索引 + 唯一约束)
│   ├── wrangler.toml     # 部署配置(D1/R2/Cron)
│   └── test/api.test.js  # Hono 端到端(app.request + D1 模拟器)
└── project.config.json   # 微信开发者工具项目配置
```

存储双适配:`core/store-memory.js`(测试/模拟并发)与 `core/store-d1.js`(生产,Cloudflare D1),
同一契约(insert/get/cas/find 查询对象),同套内核测试双存储全绿;本地用 `test/d1-mock.js`
(node:sqlite)模拟 D1,零外部依赖。

## 跑测试

```bash
cd app/core && node --test     # 28 个:内核四件事(内存+D1双存储)+拆单POC
cd app/server && node --test   # 2 个:服务层端到端
```

覆盖:100 并发取号零重号、租户隔离、FIFO 跨笔分配、凑整挂预收、手工改分配校验、
账龄三色、篡改余额必报警且可修复、日账单金额闭合、幂等与快照冻结、
表态留证、结算单前置检查("结算单上不出现第一次见到的数字"落成代码)、
拆单语料准确率≥90% 且错归=0。

## 工程约定(不许破)

1. **金额只用整数分**(`money.js`),任何新代码引入浮点金额直接打回;
2. **流水只追加**:改账走调整分录(必附原因+经手人),删改走作废重开;
3. **内核不碰平台 API**:存储经适配器注入;云函数/自建后端只做鉴权、tenant_id 注入与适配;
4. **账务核心函数动了就跑全量测试**,发版前 `node --test` 必须全绿(M1 起进 CI)。

## 已知边界与下一步

- **小程序无法 require miniprogramRoot 之外的文件**:构建时把内核同步进去——
  `cp -r app/core app/miniprogram/core`(M1 起做成 npm script/CI 步骤);`paste.js` 中的
  `require('../../../core/splitter')` 即为同步后的 `miniprogram/core/` 路径预留。
- 拆单语料是 POC 合成语料,**上线前必须换 50 段真实订货文本重跑打靶**(design/06 M0 ②);
- MemoryStore 模拟并发语义,云开发适配器(`store-cloud.js`)在 M1 第 1~2 周实现,
  取号与余额压测在真实云环境重跑(design/06 M0 ③);
- 配送员端路线页、记款页、客户端账本页等其余 M1 页面按 design/06 模块表补齐。
