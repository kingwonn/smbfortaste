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

function formatYuan(cents) {
  assertCents(cents, 'formatYuan');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

module.exports = { MoneyError, assertCents, toCents, formatYuan };
