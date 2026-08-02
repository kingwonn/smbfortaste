'use strict';
// 备好引擎测试:铁律①价格记忆与总览、铁律②六项交叉验证与客户360、铁律④汇报稿。
// 场景数字沿用拢账本真实算式(香菜 3.4×7.5=25.5 等),验证"备好的数"与"人工算的数"一致。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../store-memory');
const { initNumbering } = require('../numbering');
const { toCents, mulQty } = require('../money');
const { postDeliveryReceipt } = require('../delivery');
const { recordPayment } = require('../allocation');
const { applyEntry } = require('../balance');
const { generateStatement } = require('../statement');
const {
  suggestPrices, runAudit, getOverview, buildBriefing, traceCustomer, speakYuan,
} = require('../prepare');

const T = 't1';
async function base() {
  const store = new MemoryStore();
  initNumbering(store);
  await store.insert('customers', { id: 'c_jx', tenantId: T, name: '佳湘小厨', aliases: ['佳湘'] });
  await store.insert('customers', { id: 'c_hx', tenantId: T, name: '黄小馆', aliases: [] });
  await store.insert('products', { id: 'sku_jiang', tenantId: T, name: '姜', unit: '斤', priceMode: 'daily', weighable: true, salePriceCents: 0 });
  await store.insert('products', { id: 'sku_guipi', tenantId: T, name: '桂皮', unit: '斤', priceMode: 'fixed', weighable: false, salePriceCents: toCents('12') });
  return store;
}

test('价格记忆三级:该客户上回价 → 全店上回价 → 档案价;最近一次为准', async () => {
  const store = await base();
  await postDeliveryReceipt(store, {
    tenantId: T, partyId: 'c_jx', bizDate: '2026-08-01', dateKey: '20260801',
    items: [{ name: '姜', qtyOrdered: 3, qtyActual: 2.8, unit: '斤', unitPriceCents: toCents('1.9') }],
  });
  let s = await suggestPrices(store, { tenantId: T, partyId: 'c_jx', names: ['姜', '桂皮', '香菜'] });
  assert.deepEqual([s['姜'].cents, s['姜'].source], [toCents('1.9'), 'customer-last']);
  assert.deepEqual([s['桂皮'].cents, s['桂皮'].source], [toCents('12'), 'catalog']);
  assert.deepEqual([s['香菜'].cents, s['香菜'].source], [null, 'none']);

  // 黄小馆没买过姜:借全店最近价
  s = await suggestPrices(store, { tenantId: T, partyId: 'c_hx', names: ['姜'] });
  assert.deepEqual([s['姜'].cents, s['姜'].source], [toCents('1.9'), 'tenant-last']);

  // 姜第二天涨到 2.1:记忆跟着最近一次走
  await postDeliveryReceipt(store, {
    tenantId: T, partyId: 'c_jx', bizDate: '2026-08-02', dateKey: '20260802',
    items: [{ name: '姜', qtyOrdered: 3, qtyActual: 3, unit: '斤', unitPriceCents: toCents('2.1') }],
  });
  s = await suggestPrices(store, { tenantId: T, partyId: 'c_jx', names: ['姜'] });
  assert.equal(s['姜'].cents, toCents('2.1'));
  assert.equal(s['姜'].lastDate, '2026-08-02');
});

// 一个完整营业日:昨日留价 → 今晚收单确认 → 总览预填 → 挂账收款 → 账单
async function fullDay(store) {
  await postDeliveryReceipt(store, {  // 昨天的账:留下姜 1.9、香菜 7.5 的价格记忆
    tenantId: T, partyId: 'c_jx', bizDate: '2026-08-01', dateKey: '20260801',
    items: [
      { name: '姜', qtyOrdered: 3, qtyActual: 2.8, unit: '斤', unitPriceCents: toCents('1.9') },
      { name: '香菜', qtyOrdered: 3, qtyActual: 3.4, unit: '斤', unitPriceCents: toCents('7.5') },
    ],
  });
  // 今晚:一条标红待核,一条已确认待记账(佳湘要姜3斤香菜2斤)
  await store.insert('intakes', {
    tenantId: T, bizDate: '2026-08-02', source: 'paste-pc', partyId: null, customerName: '猪脚饭',
    lines: [{ raw: '拿点桂皮', sku: 'sku_guipi', qty: null, unit: null, flagged: true, reason: '没说数量' }],
    status: 'flagged',
  });
  await store.insert('intakes', {
    tenantId: T, bizDate: '2026-08-02', source: 'paste-pc', partyId: 'c_jx', customerName: '佳湘小厨',
    lines: [
      { raw: '姜三斤', sku: 'sku_jiang', qty: 3, unit: '斤', flagged: false },
      { raw: '香菜2斤', sku: 'sku_xiangcai', qty: 2, unit: '斤', flagged: false, name: '香菜' },
    ],
    status: 'confirmed',
  });
  // 黄小馆 6月的旧账 39353(design/14 实拍数),今天来还了 220
  await applyEntry(store, {
    tenantId: T, partyId: 'c_hx', type: 'opening', amountCents: toCents('393.53'),
    refType: 'opening', refId: 'QC-hx', bizDate: '2026-06-01',
  });
  await recordPayment(store, { tenantId: T, partyId: 'c_hx', amountCents: toCents('220'), method: '微信', refId: 'P1', bizDate: '2026-08-02' });
}

test('今日总览:待办/预填/挂账/收款/欠账/七日走势/验证,一次备齐', async () => {
  const store = await base();
  await fullDay(store);
  const ov = await getOverview(store, { tenantId: T, bizDate: '2026-08-02', today: '2026-08-02' });

  assert.deepEqual(ov.intake, { groupsOpen: 1, openLines: 1, flaggedLines: 1 });

  // 预填:姜按上回 1.9,香菜按上回 7.5;估算金额=机器先算好
  assert.equal(ov.prepared.length, 1);
  const p = ov.prepared[0];
  assert.equal(p.customerName, '佳湘小厨');
  assert.equal(p.allPriced, true);
  const jiang = p.lines.find((l) => l.name === '姜');
  assert.equal(jiang.suggest.cents, toCents('1.9'));
  assert.equal(jiang.estimateCents, mulQty(toCents('1.9'), 3));
  assert.equal(p.estimateCents, mulQty(toCents('1.9'), 3) + mulQty(toCents('7.5'), 2));

  // 昨天挂账不算今天;黄小馆收款 220 计入今天
  assert.deepEqual([ov.booked.count, ov.booked.cents], [0, 0]);
  assert.deepEqual([ov.payments.count, ov.payments.cents], [1, toCents('220')]);

  // 欠账:黄小馆 393.53-220=173.53(6月1日起算账龄 62 天 → 红)+ 佳湘昨日挂账 30.82 未收
  assert.equal(ov.receivable.cents, toCents('173.53') + toCents('30.82'));
  assert.equal(ov.receivable.debtors[0].name, '黄小馆');
  assert.equal(ov.receivable.debtors[0].aging.bucket, 'red');

  // 七日走势:8月1日那天有昨日挂账合计
  assert.equal(ov.last7.length, 7);
  const d0801 = ov.last7.find((d) => d.date === '2026-08-01');
  assert.equal(d0801.cents, mulQty(toCents('1.9'), 2.8) + mulQty(toCents('7.5'), 3.4));

  assert.equal(ov.audit.ok, true);
  assert.equal(ov.audit.passed, ov.audit.total);
});

test('汇报稿:要办的事、钱的进出、欠账大户、账对没对上,全说人话', async () => {
  const store = await base();
  await fullDay(store);
  const ov = await getOverview(store, { tenantId: T, bizDate: '2026-08-02', today: '2026-08-02' });
  const b = buildBriefing(ov);
  assert.match(b.text, /8月2号的账/);
  assert.match(b.text, /1家的要货没确认.*1样拿不准,已经标红/);
  assert.match(b.text, /佳湘小厨/);
  assert.match(b.text, /价钱都按上回的给您备好了/);
  assert.match(b.text, /收了1笔钱,共220元/);
  assert.match(b.text, /欠得最多的是黄小馆,173元5角3分/);
  assert.match(b.text, /欠了62天,得催一催/);
  assert.match(b.text, /项交叉检查全部通过,分毫不差/);
});

test('数字念法:绝不念小数点,零角说"零"', () => {
  assert.equal(speakYuan(toCents('320.53')), '320元5角3分');
  assert.equal(speakYuan(toCents('320.5')), '320元5角');
  assert.equal(speakYuan(toCents('320')), '320元');
  assert.equal(speakYuan(toCents('320.03')), '320元零3分');
  assert.equal(speakYuan(toCents('-45.03')), '负45元零3分');
});

test('六项交叉验证:干净账全绿;篡改余额/回执行/凭空挂账,分别被点名', async () => {
  const store = await base();
  await fullDay(store);
  let audit = await runAudit(store, { tenantId: T });
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.checks.map((c) => c.id), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);

  // ① 台账被偷偷改了 1 分钱 → C1 点名该户
  const bal = await store.get('balances', `${T}|receivable|c_hx`);
  await store.cas('balances', bal.id, bal._v, { cents: bal.cents + 1 });
  audit = await runAudit(store, { tenantId: T });
  const c1 = audit.checks.find((c) => c.id === 'C1');
  assert.equal(c1.pass, false);
  assert.match(c1.issues[0], /c_hx/);
  await (async () => { const b2 = await store.get('balances', bal.id); await store.cas('balances', b2.id, b2._v, { cents: bal.cents }); })();

  // ② 回执某行金额被改 → C2 点名到单号与品名
  const r = (await store.find('receipts', { eq: { tenantId: T } }))[0];
  const items = r.items.map((l, i) => (i === 0 ? { ...l, amountCents: l.amountCents + 100 } : l));
  await store.cas('receipts', r.id, r._v, { items });
  audit = await runAudit(store, { tenantId: T });
  const c2 = audit.checks.find((c) => c.id === 'C2');
  assert.equal(c2.pass, false);
  assert.match(c2.issues[0], new RegExp(r.receiptNo));
  assert.equal(c2.issues.length, 2); // 行金额不符 + 整单≠各行合计,两条都点名
  // 整单金额与挂账仍一致,C3 不冤枉人
  assert.equal(audit.checks.find((c) => c.id === 'C3').pass, true);

  // 汇报稿如实播报账不平
  const ov = await getOverview(store, { tenantId: T, bizDate: '2026-08-02', today: '2026-08-02' });
  assert.match(buildBriefing(ov).text, /项没对上.*今晚得看一眼/);
});

test('凭空挂账(流水引用不存在的回执)逃不过 C3', async () => {
  const store = await base();
  await applyEntry(store, {
    tenantId: T, partyId: 'c_jx', type: 'delivery', amountCents: toCents('100'),
    refType: 'receipt', refId: 'HZ20260802-9999', bizDate: '2026-08-02',
  });
  const audit = await runAudit(store, { tenantId: T });
  const c3 = audit.checks.find((c) => c.id === 'C3');
  assert.equal(c3.pass, false);
  assert.match(c3.issues[0], /HZ20260802-9999 不存在/);
});

test('客户360:每笔钱带单据链,收款说清冲了哪张单,页内独立交叉核对', async () => {
  const store = await base();
  // 佳湘:两张回执 + 一笔 30 元收款(FIFO 先冲最老一张)
  const r1 = await postDeliveryReceipt(store, {
    tenantId: T, partyId: 'c_jx', bizDate: '2026-08-01', dateKey: '20260801',
    items: [{ name: '香菜', qtyOrdered: 3, qtyActual: 3.4, unit: '斤', unitPriceCents: toCents('7.5') }], // 25.5
  });
  const r2 = await postDeliveryReceipt(store, {
    tenantId: T, partyId: 'c_jx', bizDate: '2026-08-02', dateKey: '20260802',
    items: [{ name: '姜', qtyOrdered: 3, qtyActual: 3, unit: '斤', unitPriceCents: toCents('2.1') }], // 6.3
  });
  await recordPayment(store, { tenantId: T, partyId: 'c_jx', amountCents: toCents('30'), method: '现金', refId: 'P9', bizDate: '2026-08-02' });
  await generateStatement(store, { tenantId: T, partyId: 'c_jx', kind: 'RZ', periodKey: '20260802', from: '2026-08-02', to: '2026-08-02', openingCents: toCents('25.5') });

  const tr = await traceCustomer(store, { tenantId: T, partyId: 'c_jx', today: '2026-08-02' });
  assert.equal(tr.customer.name, '佳湘小厨');
  assert.equal(tr.balanceCents, toCents('25.5') + toCents('6.3') - toCents('30')); // 1.80

  // 送货行:挂着回执与已冲金额;第一张 25.5 全清,第二张 6.3 冲了 4.5 剩 1.8
  const d1 = tr.timeline.find((x) => x.refId === r1.receipt.receiptNo);
  assert.equal(d1.receipt.itemCount, 1);
  assert.deepEqual([d1.settledCents, d1.openCents], [toCents('25.5'), 0]);
  const d2 = tr.timeline.find((x) => x.refId === r2.receipt.receiptNo);
  assert.deepEqual([d2.settledCents, d2.openCents], [toCents('4.5'), toCents('1.8')]);

  // 收款行:说清这 30 元冲了哪两张单
  const pay = tr.timeline.find((x) => x.type === 'payment');
  assert.deepEqual(pay.settles.map((s) => s.targetRef), [r1.receipt.receiptNo, r2.receipt.receiptNo]);

  assert.equal(tr.statements.length, 1);
  assert.equal(tr.statements[0].kind, 'RZ');
  assert.deepEqual(tr.openDeliveries.map((o) => [o.refId, o.openCents]), [[r2.receipt.receiptNo, toCents('1.8')]]);
  assert.equal(tr.verify.consistent, true);
  assert.equal(tr.verify.ledgerCents, tr.verify.balanceCents);
});
