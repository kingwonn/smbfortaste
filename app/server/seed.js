'use strict';
// 家用版初始档案(design/14 三.6):全部来自店里照片实物,手写体识读存疑处
// 在 note 里标(?),上线前由店主逐条校对。价格未知一律 0,首周补录。
// priceMode: fixed=固定价(调味粮油) / daily=日价(蔬菜肉类,weighable 实称)。

const CUSTOMERS = [
  { id: 'c_jxxc', name: '佳湘小厨', aliases: ['佳湘'], settle: '现结/短周期', note: '微信文字长清单下单,¥220转账实例' },
  { id: 'c_dbjcc', name: '东北家常菜', aliases: ['东北'], settle: '待定' },
  { id: 'c_zjf', name: '猪脚饭', aliases: [], settle: '待定' },
  { id: 'c_dwx', name: '大碗香', aliases: [], settle: '待定' },
  { id: 'c_hxg', name: '黄小馆', aliases: [], settle: '月结', note: '(?)手写体待校对;8月流水39353、7月40948——最大户之一' },
  { id: 'c_ej', name: '二建', aliases: [], settle: '月结', note: '大米大户,签收人"刘(?)"' },
  { id: 'c_4h', name: '4号', aliases: ['4J'], settle: '月结', note: '(?)购货单位代号待校对;7月流水4158' },
  { id: 'c_16', name: '十六', aliases: ['16'], settle: '待定', note: '拢账本客户段代号' },
  { id: 'c_16dm', name: '十六对面', aliases: ['16对面'], settle: '待定', note: '与"十六"互为前缀——拆单最长匹配的活用例' },
  { id: 'c_1125', name: '11-25', aliases: [], settle: '待定', note: '门牌号命名' },
  { id: 'c_nrt', name: '牛肉汤馆', aliases: ['牛肉汤'], settle: '待定', note: '(?)手写体待校对' },
  { id: 'c_bg', name: '北沟', aliases: [], settle: '待定', note: '(?)是客户、产地还是供应商待确认' },
];

// [phrase, unit, priceMode, weighable]
const P = (phrase, unit, priceMode, weighable) => ({ phrase, unit, priceMode, weighable });
const PRODUCTS = [
  // 蔬菜(日价,实称)
  P('小葱', '斤', 'daily', true), P('香葱', '斤', 'daily', true), P('香菜', '斤', 'daily', true),
  P('绿豆芽', '斤', 'daily', true), P('黄豆芽', '斤', 'daily', true), P('番茄', '斤', 'daily', true),
  P('线椒', '斤', 'daily', true), P('青椒', '斤', 'daily', true), P('圆椒', '斤', 'daily', true),
  P('姜', '斤', 'daily', true), P('藕', '斤', 'daily', true), P('蒜台', '斤', 'daily', true),
  P('小油菜', '斤', 'daily', true), P('油菜', '斤', 'daily', true), P('生菜', '斤', 'daily', true),
  P('白菜', '斤', 'daily', true), P('豆角', '斤', 'daily', true), P('长豆角', '斤', 'daily', true),
  P('土豆', '斤', 'daily', true), P('茄子', '斤', 'daily', true), P('黄瓜', '斤', 'daily', true),
  P('花菜', '斤', 'daily', true),
  // 肉禽蛋(日价为主,实称/按件)
  P('羊肉', '斤', 'daily', true), P('鸡排', '斤', 'daily', true), P('鸡心', '斤', 'daily', true),
  P('鸡翅', '件', 'fixed', false), P('鸡脸', '件', 'fixed', false),
  P('去皮蛋', '斤', 'daily', true), P('鸭血', '箱', 'fixed', false),
  // 豆制品/半成品
  P('干张', '斤', 'daily', true), P('炸豆腐', '斤', 'daily', true), P('皮冻', '斤', 'daily', true),
  P('豆卷', '斤', 'daily', true), P('饺子皮', '斤', 'daily', true), P('小饼', '个', 'fixed', false),
  // 水产/熟食
  P('鲤鱼', '条', 'daily', true), P('花甲', '斤', 'daily', true),
  P('烧鸡', '只', 'fixed', false), P('三文治火腿肠', '根', 'fixed', false),
  // 粮油(固定价)
  P('大米', '袋', 'fixed', false), P('五得利面粉', '袋', 'fixed', false), P('面粉', '袋', 'fixed', false),
  P('油', '桶', 'fixed', false), P('羊油', '斤', 'daily', true),
  // 调味(固定价)
  P('生抽', '件', 'fixed', false), P('料酒', '件', 'fixed', false), P('淀粉', '袋', 'fixed', false),
  P('辣段', '斤', 'fixed', false), P('桂皮', '斤', 'fixed', false), P('熟芝麻', '斤', 'fixed', false),
  P('黄灯笼辣椒酱', '瓶', 'fixed', false), P('辣妹子', '斤', 'fixed', false), P('黄豆', '包', 'fixed', false),
];

function catalogFor() {
  // 家用版:全部客户共享同一目录(常用品对照表按客户细化是后续动作)
  return PRODUCTS.map((p, i) => ({
    sku: `SKU-${String(i + 1).padStart(3, '0')}`,
    phrase: p.phrase, spec: '', unit: p.unit,
  }));
}

async function seedTenant(store, tenantId) {
  const catalog = catalogFor();
  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(await store.insert('customers', {
      id: `${tenantId}|${c.id}`, tenantId,
      name: c.name, aliases: c.aliases, settle: c.settle, note: c.note || null,
    }));
  }
  const products = [];
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    products.push(await store.insert('products', {
      id: `${tenantId}|SKU-${String(i + 1).padStart(3, '0')}`, tenantId,
      name: p.phrase, unit: p.unit, priceMode: p.priceMode, weighable: p.weighable,
      salePriceCents: 0, // 待店主首周补录
    }));
  }
  return { customers: customers.length, products: products.length };
}

// 拆单器需要的形态(含共享目录)
function splitterCustomers() {
  const catalog = catalogFor();
  return CUSTOMERS.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases, catalog }));
}

module.exports = { CUSTOMERS, PRODUCTS, seedTenant, splitterCustomers };
