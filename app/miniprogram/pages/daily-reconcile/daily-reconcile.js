// 今日对账工作台(design/08 四.2,M1 P0,门禁⑮):
// 当日有单客户列表(状态灯)→逐户核对→行级打折/减免/退货(必附原因)→
// 生成日账单(RZ,core/statement.generateStatement)→一键发客户/待转发。
Page({
  data: { customers: [] },
  onShow() { /* TODO(M1): 拉当日已签收回执按客户分组;差异闸门标记置顶 */ },
});
