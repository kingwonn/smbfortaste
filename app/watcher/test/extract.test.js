'use strict';
// 增量提取压测:连拍去重、同文重发、滚屏回看、噪声过滤、跨天重置、只收对方。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IncrementalExtractor, runOnce } = require('../extract');

const snap = (chatTitle, day, msgs) => ({
  chatTitle, day,
  messages: msgs.map(([side, text]) => ({ side, text })),
});

test('连拍同屏:第一拍全收,后续拍零重复', () => {
  const ex = new IncrementalExtractor();
  const s = snap('佳湘小厨', '2026-08-02', [
    ['peer', '姜三斤'], ['peer', '烧鸡两只'], ['me', '好'],
  ]);
  assert.deepEqual(ex.extractNew(s), ['姜三斤', '烧鸡两只']);
  assert.deepEqual(ex.extractNew(s), []);
  assert.deepEqual(ex.extractNew(s), []);
});

test('增量:新消息追加,只发新增', () => {
  const ex = new IncrementalExtractor();
  ex.extractNew(snap('佳湘小厨', '2026-08-02', [['peer', '姜三斤']]));
  const fresh = ex.extractNew(snap('佳湘小厨', '2026-08-02', [
    ['peer', '姜三斤'], ['peer', '藕三斤'], ['peer', '蒜台两斤'],
  ]));
  assert.deepEqual(fresh, ['藕三斤', '蒜台两斤']);
});

test('同一天客户真发了两条一模一样的:补发第二条', () => {
  const ex = new IncrementalExtractor();
  ex.extractNew(snap('大碗香', '2026-08-02', [['peer', '烧鸡两只']]));
  const fresh = ex.extractNew(snap('大碗香', '2026-08-02', [
    ['peer', '烧鸡两只'], ['peer', '烧鸡两只'],
  ]));
  assert.deepEqual(fresh, ['烧鸡两只']);
});

test('滚屏回看旧消息:不重发', () => {
  const ex = new IncrementalExtractor();
  ex.extractNew(snap('十六', '2026-08-02', [['peer', '黄瓜4斤'], ['peer', '香菜2斤']]));
  // 往上滚,屏上只剩旧的一条
  assert.deepEqual(ex.extractNew(snap('十六', '2026-08-02', [['peer', '黄瓜4斤']])), []);
  // 滚回来,两条都在——仍不重发
  assert.deepEqual(ex.extractNew(snap('十六', '2026-08-02', [['peer', '黄瓜4斤'], ['peer', '香菜2斤']])), []);
});

test('噪声与自己消息过滤:时间戳/[图片]/me 一律不收', () => {
  const ex = new IncrementalExtractor();
  const fresh = ex.extractNew(snap('二建', '2026-08-02', [
    ['peer', '昨天 22:35'], ['peer', '05:28'], ['peer', '[图片]'],
    ['me', '收到'], ['peer', '大米六袋'],
  ]));
  assert.deepEqual(fresh, ['大米六袋']);
});

test('跨天重置:昨天发过的话今天再发,照收', () => {
  const ex = new IncrementalExtractor();
  ex.extractNew(snap('佳湘小厨', '2026-08-01', [['peer', '烧鸡两只']]));
  const fresh = ex.extractNew(snap('佳湘小厨', '2026-08-02', [['peer', '烧鸡两只']]));
  assert.deepEqual(fresh, ['烧鸡两只']);
});

test('runOnce:多会话快照→按会话合并推送(客户名前置,接拆单器)', async () => {
  const ex = new IncrementalExtractor();
  const pushes = [];
  const snapshots = [
    snap('佳湘小厨', '2026-08-02', [['peer', '姜三斤'], ['peer', '藕三斤']]),
    snap('十六对面', '2026-08-02', [['peer', '香菜2斤']]),
    snap('大碗香', '2026-08-02', [['me', '好']]), // 无新对方消息,不推
  ];
  const pushed = await runOnce(ex, snapshots, async (p) => pushes.push(p));
  assert.deepEqual(pushed, [
    { chatTitle: '佳湘小厨', lines: 2 },
    { chatTitle: '十六对面', lines: 1 },
  ]);
  assert.equal(pushes[0].text, '佳湘小厨\n姜三斤\n藕三斤');
  assert.equal(pushes[0].source, 'screen-watch');
  // 再跑一轮同样的快照:零推送
  assert.deepEqual(await runOnce(ex, snapshots, async (p) => pushes.push(p)), []);
});
