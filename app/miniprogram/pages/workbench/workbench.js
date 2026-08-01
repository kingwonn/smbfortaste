// 今晚要办统一工作台(design/09 裁定 P0,M1 门禁⑯):
// 收拢待确认/待改账/待转发/未回应/该催/绑定审批/断订雷达/问题登记八个队列,
// 按"现在该干哪件"排序,干完划一件。数据源:各业务集合的计数查询(云函数聚合)。
Page({
  data: {
    queues: [
      { key: 'orders_pending',   label: '待确认订单',   count: 0, route: '/pages/paste/paste' },
      { key: 'silent_customers', label: '断订雷达',     count: 0, route: '' },
      { key: 'receipts_diff',    label: '待改账(有改动)', count: 0, route: '/pages/daily-reconcile/daily-reconcile' },
      { key: 'daily_reconcile',  label: '今日对账',     count: 0, route: '/pages/daily-reconcile/daily-reconcile' },
      { key: 'to_forward',       label: '今日待转发',   count: 0, route: '' },
      { key: 'problems',         label: '记下的问题',   count: 0, route: '' },
      { key: 'due_collections',  label: '该催的账',     count: 0, route: '' },
      { key: 'no_response',      label: '未回应清单',   count: 0, route: '' }
    ]
  },
  onShow() { /* TODO(M1): 拉取各队列计数,零待办的队列灰显沉底 */ },
  openQueue(e) {
    const q = this.data.queues[e.currentTarget.dataset.i];
    if (q.route) wx.navigateTo({ url: q.route });
  },
});
