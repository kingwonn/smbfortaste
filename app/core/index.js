'use strict';
// smb-core:配送小生意管理系统的平台无关业务内核。
// 账务内核四件事(design/06 M1 头两周先定稿先压测)+ 贴单拆分 POC(M0 打靶②)。
// 存储经适配器注入:测试/本地用 MemoryStore,生产换云开发或 MySQL 适配器,本包代码不变。

module.exports = {
  ...require('./money'),
  ...require('./store-memory'),
  ...require('./numbering'),
  ...require('./balance'),
  ...require('./allocation'),
  ...require('./statement'),
  ...require('./splitter'),
};
