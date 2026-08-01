'use strict';
// 收单守护·增量提取核心(design/16):
// 屏幕捕获层(OCR/VLM/通知)每隔几秒产出一次"会话快照",本模块负责从连续快照中
// 只挑出【新出现的对方消息】,防重、防滚屏误报,再交给收单箱(/api/intake)。
// 这是守护里唯一与平台无关、可离线压测的部分——捕获层换 OCR/VLM/computer use 都不影响它。
//
// 去重策略:按 会话+日期+消息文本 记录"历史最大出现次数"。
// - 同屏重复识别(每3秒一拍)→ 次数没涨,不发;
// - 同一天客户真发了两条一模一样的("烧鸡两只")→ 屏上出现2次 > 历史1次,补发1条;
// - 往回滚动翻旧账 → 次数回到历史值以内,不发;
// - 已知盲区(诚实注记):同文本消息在"旧的滚出屏外之后"再来一条,可能漏——极罕见,
//   模式A下老板娘当场就在看屏,可接受;模式B由捕获层锚定滚动位置规避。

const crypto = require('node:crypto');

const NOISE = [
  /^\d{1,2}:\d{2}$/,                       // 05:28
  /^(昨天|今天|前天)\s*\d{1,2}:\d{2}$/,     // 昨天 22:35
  /^\d{1,2}月\d{1,2}日/, /^星期[一二三四五六日]/,
  /^以下是新消息$/, /^查看更多消息$/,
  /^\[图片\]$/, /^\[视频\]$/, /^\[表情\]$/,
];

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function isNoise(text) {
  return NOISE.some((re) => re.test(text));
}

function h(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

class IncrementalExtractor {
  constructor({ maxChats = 200 } = {}) {
    this.chats = new Map(); // chatKey(day|title) -> Map(textHash -> maxCount)
    this.order = [];        // LRU 逐出
    this.maxChats = maxChats;
  }

  _bucket(day, chatTitle) {
    const key = `${day}|${chatTitle}`;
    if (!this.chats.has(key)) {
      this.chats.set(key, new Map());
      this.order.push(key);
      if (this.order.length > this.maxChats) this.chats.delete(this.order.shift());
    }
    return this.chats.get(key);
  }

  // snapshot: { chatTitle, day: 'YYYY-MM-DD', messages: [{ side: 'peer'|'me', text }] }
  // 返回:本次新增的对方消息文本数组(保持屏上顺序)
  extractNew(snapshot) {
    const { chatTitle, day, messages } = snapshot;
    if (!chatTitle || !day) throw new Error('快照缺 chatTitle/day');
    const seen = this._bucket(day, chatTitle);

    // 统计本快照中每条对方消息文本的出现次数(带首次出现顺序)
    const counts = new Map(); const orderFirst = [];
    for (const m of messages || []) {
      if (!m || m.side !== 'peer') continue;   // 只收对方;自己发的确认/回复一律忽略
      const text = normalize(m.text);
      if (!text || isNoise(text)) continue;
      const key = h(text);
      if (!counts.has(key)) { counts.set(key, { text, n: 0 }); orderFirst.push(key); }
      counts.get(key).n += 1;
    }

    const fresh = [];
    for (const key of orderFirst) {
      const { text, n } = counts.get(key);
      const prev = seen.get(key) || 0;
      if (n > prev) {
        for (let i = 0; i < n - prev; i++) fresh.push(text);
        seen.set(key, n);
      }
    }
    return fresh;
  }
}

// 守护主循环的纯逻辑部分:一批快照 → 需要推送到收单箱的 {chatTitle, text} 列表。
// pushFn 注入(生产环境为 POST /api/intake,source: 'screen-watch'),便于测试。
async function runOnce(extractor, snapshots, pushFn) {
  const pushed = [];
  for (const snap of snapshots) {
    const fresh = extractor.extractNew(snap);
    if (fresh.length === 0) continue;
    // 同一会话的新消息合并为一次收单(客户名前置,复用拆单器的客户归属)
    const text = `${snap.chatTitle}\n${fresh.join('\n')}`;
    await pushFn({ chatTitle: snap.chatTitle, text, source: 'screen-watch', bizDate: snap.day });
    pushed.push({ chatTitle: snap.chatTitle, lines: fresh.length });
  }
  return pushed;
}

module.exports = { IncrementalExtractor, runOnce, normalize, isNoise };
