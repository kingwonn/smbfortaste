'use strict';
// 金额铁律(design/07 四.工程铁律):一律以"分"为单位的整数参与运算,浮点禁止进账务路径。

class MoneyError extends Error {}

function assertCents(n, label) {
  if (!Number.isInteger(n)) {
    throw new MoneyError(`金额必须是整数分: ${label || ''}=${n}`);
  }
  return n;
}

// "3.1" / "3.10" / 3.1 / "3" → 310/310/310/300。只保留两位小数,多余位直接拒绝。
function toCents(v) {
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyError(`无法解析金额: ${v}`);
  const sign = m[1] === '-' ? -1 : 1;
  const yuan = parseInt(m[2], 10);
  const frac = m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0;
  return sign * (yuan * 100 + frac);
}

// 实称数量×单价(分)→金额(分):数量可带小数(实称2.8斤),按千分位整数化后相乘取整,
// 杜绝浮点误差(23.7×1.9元=45.03 必须分毫不差——妹妹笔记本上的真实算式)。
function mulQty(unitPriceCents, qty) {
  assertCents(unitPriceCents, 'unitPriceCents');
  if (typeof qty !== 'number' || !(qty > 0)) throw new MoneyError(`数量非法: ${qty}`);
  const qtyMil = Math.round(qty * 1000);
  if (Math.abs(qtyMil - qty * 1000) > 0.001) throw new MoneyError(`数量最多三位小数: ${qty}`);
  return Math.round((qtyMil * unitPriceCents) / 1000);
}

function formatYuan(cents) {
  assertCents(cents, 'formatYuan');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

module.exports = { MoneyError, assertCents, toCents, formatYuan, mulQty };
