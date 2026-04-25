// ============================================================
// Finance Pro — 常量定义
// 分类数据、固定映射表，所有模块共用
// ============================================================

/** 默认分类数组（id 与 name 解耦，id 永不修改）*/
export const DEFAULT_CATS = [
    // ── 支出 ──────────────────────────────────────────────
    { id:"cat_e001", name:"饥饿值补充", icon:"🍖", color:"#FF6B6B", group:"生存底座", type:"expense", domain:"food",      sort:0 },
    { id:"cat_e002", name:"营地维护",   icon:"🏕️", color:"#F59E0B", group:"生存底座", type:"expense", domain:"home",      sort:1 },
    { id:"cat_e003", name:"日常移动",   icon:"⚡",  color:"#48DBFB", group:"生存底座", type:"expense", domain:"transport", sort:2 },
    { id:"cat_e004", name:"生命值恢复", icon:"💊", color:"#F472B6", group:"生存底座", type:"expense", domain:"health",    sort:3 },
    { id:"cat_e005", name:"基础耗材",   icon:"🔩", color:"#94A3B8", group:"生活消耗", type:"expense", domain:"supplies",  sort:4 },
    { id:"cat_e006", name:"信号连接",   icon:"📡", color:"#A78BFA", group:"生活消耗", type:"expense", domain:"network",   sort:5 },
    { id:"cat_e007", name:"装备耐久",   icon:"🛡️", color:"#FECA57", group:"事件支出", type:"expense", domain:"explore",   sort:6 },
    { id:"cat_e008", name:"自由探索",   icon:"🗺️", color:"#1DD1A1", group:"事件支出", type:"expense", domain:"explore",   sort:7 },
    // ── 收入 ──────────────────────────────────────────────
    { id:"cat_i001", name:"月俸结算",   icon:"🏆", color:"#1DD1A1", group:"主动收入",   type:"income", domain:"explore",  sort:0 },
    { id:"cat_i002", name:"外包任务",   icon:"⚙️", color:"#48DBFB", group:"主动收入",   type:"income", domain:"explore",  sort:1 },
    { id:"cat_i003", name:"系统补贴",   icon:"🎪", color:"#7986CB", group:"主动收入",   type:"income", domain:"explore",  sort:2 },
    { id:"cat_i004", name:"利息产出",   icon:"📈", color:"#7986CB", group:"资产增值",   type:"income", domain:"explore",  sort:3 },
    { id:"cat_i005", name:"意外礼包",   icon:"🎁", color:"#FECA57", group:"非经常收入", type:"income", domain:"explore",  sort:4 },
    { id:"cat_i006", name:"意外掉落",   icon:"✨", color:"#A78BFA", group:"非经常收入", type:"income", domain:"explore",  sort:5 },
];

/** 生活域选项 */
export const DOMAIN_OPTS = [
    { v:'food',      l:'🍖 食物' },
    { v:'home',      l:'🏠 住所' },
    { v:'transport', l:'⚡ 交通' },
    { v:'health',    l:'💊 健康' },
    { v:'supplies',  l:'🔩 日用品' },
    { v:'network',   l:'📡 通讯' },
    { v:'explore',   l:'🗺️ 探索' },
];

/** 默认账户 */
export const DEFAULT_ACCOUNTS = [
    { id:1, name:'招商工资卡', bal:0 },
    { id:2, name:'工行存款卡', bal:0 },
    { id:3, name:'建行房贷卡', bal:0 },
    { id:4, name:'消费卡',     bal:0 },
];

/** 默认收入模版 */
export const DEFAULT_TPLS = [
    { name:"本职薪酬", isSplit:true,  defAmt:0, save:3000, loan:1300, retain:2200 },
    { name:"副业兼职", isSplit:false, defAmt:0, save:0,    loan:0,    retain:0    },
];

/** 初始 data 结构（每次 loadFromFirebase 前的默认值） */
export const INITIAL_DATA = {
    txs:     [],
    acc:     DEFAULT_ACCOUNTS.map(a => ({ ...a })),
    tpls:    DEFAULT_TPLS.map(t => ({ ...t })),
    rules:   {},
    subs:    [],
    history: [],
    cats:    DEFAULT_CATS.map(c => ({ ...c })),
};
