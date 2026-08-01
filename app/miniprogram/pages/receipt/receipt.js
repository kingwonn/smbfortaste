// 配送员拍照回执+差异闸门(design/05 包3,M1 P0):
// 拍一张签好字的回执→必选【跟单上一样】/【有改动】;有改动→挂起进老板娘待改账,
// 电子回执卡等老板娘改完账才发(电子单永远与纸质签字一致)。断网入本地队列回网补传。
Page({
  data: { photo: '', diff: null },
  takePhoto() { wx.chooseMedia({ count: 1, mediaType: ['image'], success: (r) => this.setData({ photo: r.tempFiles[0].tempFilePath }) }); },
  markSame() { this.setData({ diff: false }); /* TODO(M1): 上传+挂账(core/balance.applyEntry via 云函数) */ },
  markDiff() { this.setData({ diff: true }); /* TODO(M1): 上传+进待改账队列,电子卡挂起 */ },
});
