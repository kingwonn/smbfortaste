// 批量贴单(design/05 包2,M1 P0):一次粘贴整晚聊天记录→按客户拆单→逐单确认卡。
// 拆分逻辑即 core/splitter.js(与测试语料同一套代码),铁规:拿不准标红,绝不猜。
const { splitPaste } = require('../../../core/splitter');
Page({
  data: { text: '', orders: [] },
  onInput(e) { this.setData({ text: e.detail.value }); },
  doSplit() {
    // TODO(M1): customers 来自客户档案缓存(含常用品对照表)
    const customers = wx.getStorageSync('customers') || [];
    const { orders } = splitPaste(this.data.text, customers);
    this.setData({ orders });
  },
});
