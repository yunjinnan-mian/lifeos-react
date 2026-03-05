// ============================================================
// Finance Pro — 分类映射工具函数
// 所有函数接受 cats 参数（来自 data.cats），确保始终取最新数据
// ============================================================

import { DOMAIN_OPTS } from './constants';

// 旧格式（汉字 id）→ domain 兜底映射
const LEGACY_DOMAIN_MAP = {
    '餐饮日常':'food',   '零食饮料':'food',
    '住房物业':'home',
    '交通通讯':'transport',
    '医疗健康':'health',
    '日用消耗':'supplies',
    '购物置物':'explore', '社交娱乐':'explore',
    '本职薪酬':'explore', '副业兼职':'explore',
    '福利缴存':'explore', '投资理财':'explore',
    '人情红包':'explore', '其他收入':'explore',
};

/**
 * 根据 catId 查询 domain 字段
 * @param {Array} cats  data.cats
 * @param {string} catId
 */
export function getDomainForCat(cats, catId) {
    if (!catId) return 'explore';
    const cat = cats.find(c => c.id === catId);
    if (cat && cat.domain) return cat.domain;
    return LEGACY_DOMAIN_MAP[catId] || 'explore';
}

/**
 * catId → 显示名称
 * @param {Array} cats
 * @param {string} catId
 */
export function getCatName(cats, catId) {
    if (!catId) return '-';
    const cat = cats.find(c => c.id === catId);
    return cat ? cat.name : catId;  // 找不到时 fallback 显示 id（兼容旧数据）
}

/**
 * catId → group（一级分类）映射表
 * { catId: groupName, '平账支出': '其他', ... }
 * @param {Array} cats
 */
export function getCatMap(cats) {
    const m = { '平账支出': '其他', '平账收入': '其他' };
    cats.forEach(c => { m[c.id] = c.group; });
    return m;
}

/**
 * group → color 映射表（用于图表配色）
 * @param {Array} cats
 */
export function getColorMap(cats) {
    const m = { '资金池': '#5F27CD' };
    cats.forEach(c => {
        if (!m[c.group]) m[c.group] = c.color;
    });
    return m;
}

/**
 * 生成支出分类的 <option> HTML 字符串（按分组）
 * @param {Array} cats
 */
export function getExpenseOpts(cats) {
    const groups = {};
    cats
        .filter(c => c.type === 'expense')
        .sort((a, b) => a.sort - b.sort)
        .forEach(c => {
            if (!groups[c.group]) groups[c.group] = [];
            groups[c.group].push(c);
        });
    return (
        Object.entries(groups)
            .map(([g, cs]) =>
                `<optgroup label="${g}">${cs.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</optgroup>`
            )
            .join('') + '<option value="平账支出">🔧 平账支出</option>'
    );
}

/**
 * 生成收入分类的 <option> HTML 字符串（按分组）
 * @param {Array} cats
 */
export function getIncomeOpts(cats) {
    const groups = {};
    cats
        .filter(c => c.type === 'income')
        .sort((a, b) => a.sort - b.sort)
        .forEach(c => {
            if (!groups[c.group]) groups[c.group] = [];
            groups[c.group].push(c);
        });
    return (
        Object.entries(groups)
            .map(([g, cs]) =>
                `<optgroup label="${g}">${cs.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</optgroup>`
            )
            .join('') + '<option value="平账收入">🔧 平账收入</option>'
    );
}

/**
 * 获取支出分类数组（React select 用，返回 [{value, label, group, color}]）
 * @param {Array} cats
 */
export function getExpenseCatOptions(cats) {
    return cats
        .filter(c => c.type === 'expense')
        .sort((a, b) => a.sort - b.sort)
        .map(c => ({ value: c.id, label: `${c.icon} ${c.name}`, group: c.group, color: c.color, icon: c.icon }));
}

/**
 * 获取收入分类数组
 * @param {Array} cats
 */
export function getIncomeCatOptions(cats) {
    return cats
        .filter(c => c.type === 'income')
        .sort((a, b) => a.sort - b.sort)
        .map(c => ({ value: c.id, label: `${c.icon} ${c.name}`, group: c.group, color: c.color, icon: c.icon }));
}

/**
 * 获取 domain 的显示名称
 * @param {string} domainVal
 */
export function getDomainLabel(domainVal) {
    const found = DOMAIN_OPTS.find(o => o.v === domainVal);
    return found ? found.l : domainVal || '-';
}
