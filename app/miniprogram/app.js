// 入口:登录后按角色分流——老板/老板娘 → 今晚要办工作台;配送员 → 今日路线(待建)。
// 设计依据:design/09(老板娘默认首页=今晚要办)、design/01(角色分工)。
App({
  globalData: { role: null, tenantId: null },
  onLaunch() {
    // TODO(M1): wx.cloud.init + 微信登录换角色;M0 阶段本地模拟
  },
});
