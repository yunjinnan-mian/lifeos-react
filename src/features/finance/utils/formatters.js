// ============================================================
// Finance Pro — 数字 & 日期格式化工具
// ============================================================

/**
 * 格式化金额，带千分符（中文 locale）
 * @param {number} val
 * @param {number} decimals 小数位数，默认 2
 */
export function fmtMoney(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * 格式化金额（整数，无小数，用于 KPI 大数字）
 * @param {number} val
 */
export function fmtMoneyInt(val) {
    if (!val || isNaN(val)) return '0';
    return Number(val).toLocaleString('zh-CN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

/**
 * 简短金额：≥10000 用 "万" 表示
 * @param {number} val
 */
export function fmtMoneyShort(val) {
    if (!val || isNaN(val)) return '0';
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 10000) {
        return sign + (abs / 10000).toFixed(1) + '万';
    }
    return sign + abs.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

/**
 * 将 Date 对象或字符串格式化为 YYYY-MM 字符串
 * @param {Date|string} date
 */
export function fmtYearMonth(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 7);
}

/**
 * 今天的 YYYY-MM-DD 字符串
 */
export function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * 今天的 YYYY-MM 字符串
 */
export function thisMonthStr() {
    return new Date().toISOString().slice(0, 7);
}

/**
 * 当前年份字符串
 */
export function thisYearStr() {
    return new Date().getFullYear().toString();
}

/**
 * 将金额数字转换为带颜色信息的对象（用于表格 / KPI 显示）
 * @param {number} val
 * @param {'income'|'expense'|'transfer'} type
 */
export function coloredAmount(val, type) {
    if (type === 'income')   return { text: '+¥' + fmtMoney(val), color: '#4CAF7D' };
    if (type === 'expense')  return { text: '-¥' + fmtMoney(Math.abs(val)), color: '#E05A3A' };
    if (type === 'transfer') return { text: '¥'  + fmtMoney(val), color: '#2BBFCC' };
    return { text: '¥' + fmtMoney(val), color: '#3D2B1F' };
}
