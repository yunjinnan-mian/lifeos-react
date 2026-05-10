// ============================================================
// Finance Pro — useFinanceData
// 核心数据 hook：持有 data state + Firebase CRUD
// 供 FinanceContext 使用，不直接在组件中调用（只在 index.jsx 调用一次）
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import { db } from '../../../lib/firebase';
import {
    collection, doc,
    getDoc, getDocs,
    setDoc, deleteDoc,
    writeBatch,
} from 'firebase/firestore';
import { INITIAL_DATA, DEFAULT_CATS } from '../utils/constants';
import { getDomainForCat } from '../utils/catMap';

// ── 数据迁移（旧格式兼容）────────────────────────────────────
function migrateOldData(loadedData) {
    const d = { ...INITIAL_DATA, ...loadedData };

    if (!d.history) d.history = [];
    if (!d.subs) d.subs = [];
    if (!d.rules) d.rules = {};
    if (!d.cats || !d.cats.length) d.cats = DEFAULT_CATS.map(c => ({ ...c }));
    if (!d.txs) d.txs = [];
    if (!d.memoBlocks) d.memoBlocks = [];

    // ── 旧格式 cat 迁移（id 非 cat_ 开头 → 新 id）──────────
    const hasOldFormat = d.cats.some(c => !c.id.startsWith('cat_'));
    if (hasOldFormat) {
        const idMap = {};
        d.cats = d.cats.map((c, idx) => {
            const newId = c.id.startsWith('cat_') ? c.id : `cat_mig_${Date.now()}_${idx}`;
            idMap[c.id] = newId;
            return {
                id: newId,
                name: c.gameName || c.label || c.id,
                icon: c.icon || '📌',
                color: c.color || '#999',
                group: c.group || '其他',
                type: c.type || 'expense',
                domain: c.domain || getDomainForCat(d.cats, c.id),
                sort: c.sort || 0,
            };
        });
        // 同步修复流水里的 cat2
        if (d.txs) {
            d.txs.forEach(t => {
                if (t.cat2 && idMap[t.cat2]) t.cat2 = idMap[t.cat2];
            });
        }
    }

    // 账户 id 类型修复
    if (d.acc) {
        d.acc.forEach(a => {
            if (typeof a.id !== 'number') a.id = parseInt(a.id) || Date.now();
        });
    }
    // 交易 accId 类型修复
    if (d.txs) {
        d.txs.forEach(t => {
            if (t.accId && t.accId !== 'auto' && typeof t.accId === 'string') {
                t.accId = parseInt(t.accId) || d.acc[0]?.id;
            }
        });
    }
    // 订阅 cat2 修复
    if (d.subs) {
        d.subs.forEach(s => {
            if (!s.cat2) s.cat2 = '平账支出';
        });
    }

    return d;
}

// ── Firestore 写入前清理（删除 undefined / UI 临时字段）──────
function sanitizeForFirestore(obj) {
    const uiOnlyFields = new Set(['mode', 'dir', 'realType', 'isIgnored', 'source']);
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        if (uiOnlyFields.has(k)) continue;
        cleaned[k] = v;
    }
    return cleaned;
}

// ════════════════════════════════════════════════════════════
export function useFinanceData(showToast) {
    const [data, setData] = useState(() => ({
        ...INITIAL_DATA,
        cats: DEFAULT_CATS.map(c => ({ ...c })),
        acc: INITIAL_DATA.acc.map(a => ({ ...a })),
        tpls: INITIAL_DATA.tpls.map(t => ({ ...t })),
    }));
    const [loading, setLoading] = useState(false);

    // ── Firebase: 加载 ────────────────────────────────────
    const loadFromFirebase = useCallback(async () => {
        setLoading(true);
        try {
            // 1. 加载配置（账户/模版/规则/订阅/历史/分类）
            const configSnap = await getDoc(doc(db, 'config', 'finance_config'));
            let loadedData = { ...INITIAL_DATA, cats: DEFAULT_CATS.map(c => ({ ...c })) };

            if (configSnap.exists()) {
                const cfg = configSnap.data();
                if (cfg.acc && cfg.acc.length) loadedData.acc = cfg.acc;
                if (cfg.tpls && cfg.tpls.length) loadedData.tpls = cfg.tpls;
                if (cfg.rules) loadedData.rules = cfg.rules;
                if (cfg.subs) loadedData.subs = cfg.subs;
                if (cfg.history) loadedData.history = cfg.history;
                if (cfg.cats && cfg.cats.length) loadedData.cats = cfg.cats;
            }

            // 2. 加载交易记录
            const txSnap = await getDocs(collection(db, 'transactions'));
            loadedData.txs = [];
            txSnap.forEach(d => loadedData.txs.push(d.data()));
            loadedData.txs.sort((a, b) => new Date(b.date) - new Date(a.date));

            const migrated = migrateOldData(loadedData);
            setData(migrated);
            return migrated;
        } catch (e) {
            console.error('Firebase 加载失败', e);
            showToast('⚠️ 云端加载失败，使用本地默认数据', 'error');
            throw e;
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // ── Firebase: 保存配置 ────────────────────────────────
    const saveConfigToFirebase = useCallback(async (currentData) => {
        await setDoc(doc(db, 'config', 'finance_config'), {
            acc: currentData.acc,
            tpls: currentData.tpls,
            rules: currentData.rules,
            subs: currentData.subs,
            history: currentData.history,
            cats: currentData.cats,
            updatedAt: new Date().toISOString(),
        });
    }, []);

    const saveData = useCallback((currentData) => {
        saveConfigToFirebase(currentData).catch(e => {
            console.error('Config 保存失败', e);
            showToast('云端同步失败: ' + e.message, 'error');
        });
    }, [saveConfigToFirebase, showToast]);

    // ── Firebase: 写入单条交易 ────────────────────────────
    const writeTxToFirebase = useCallback(async (tx, cats) => {
        const txId = String(tx.id);
        const rawObj = {
            ...tx,
            id: txId,
            domain: getDomainForCat(cats, tx.cat2),
            createdAt: tx.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const txObj = sanitizeForFirestore(rawObj);
        try {
            await setDoc(doc(db, 'transactions', txId), txObj);
        } catch (e) {
            console.error('TX 写入失败', e);
            showToast('云端写入失败: ' + e.message, 'error');
        }
        return txObj;
    }, [showToast]);

    // ── addTx：同时更新 state 和 Firebase ─────────────────
    const addTx = useCallback(async (txData) => {
        const txId = txData.id || (Date.now() + Math.random());
        const tx = { ...txData, id: txId };

        let txObj;
        // 需要拿到最新 cats，用函数式 setState 先读后写
        await new Promise(resolve => {
            setData(prev => {
                // 在 setState 回调里拿到 prev.cats，启动写 Firebase
                writeTxToFirebase(tx, prev.cats).then(obj => {
                    txObj = obj;
                    resolve();
                });
                return prev; // 暂不更新 state，等 writeTx 完成
            });
        });

        setData(prev => {
            const txs = [...prev.txs];
            const existIdx = txs.findIndex(t => String(t.id) === String(txId));
            if (existIdx >= 0) txs[existIdx] = txObj;
            else txs.push(txObj);
            return { ...prev, txs };
        });
        return txObj;
    }, [writeTxToFirebase]);

    // ── addTxBatch：批量写入（账单导入用）────────────────
    const addTxBatch = useCallback(async (txList) => {
        const BATCH_SIZE = 499;
        let txObjs = [];
        let currentCats = [];

        // 先拿到 cats
        await new Promise(resolve => {
            setData(prev => { currentCats = prev.cats; resolve(); return prev; });
        });

        txList.forEach(tx => {
            const txId = String(tx.id);
            txObjs.push({
                ...tx,
                id: txId,
                domain: getDomainForCat(currentCats, tx.cat2),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        });

        // 先批量更新本地 state
        setData(prev => {
            const txs = [...prev.txs];
            txObjs.forEach(txObj => {
                const existIdx = txs.findIndex(t => String(t.id) === txObj.id);
                if (existIdx >= 0) txs[existIdx] = txObj;
                else txs.push(txObj);
            });
            return { ...prev, txs };
        });

        // 分批写 Firebase
        for (let i = 0; i < txObjs.length; i += BATCH_SIZE) {
            const batchWrite = writeBatch(db);
            txObjs.slice(i, i + BATCH_SIZE).forEach(txObj => {
                batchWrite.set(doc(db, 'transactions', txObj.id), sanitizeForFirestore(txObj));
            });
            try {
                await batchWrite.commit();
            } catch (e) {
                console.error('批量写入失败', e);
                showToast('云端批量写入失败: ' + e.message, 'error');
            }
        }
        return txObjs;
    }, [showToast]);

    // ── delTx ─────────────────────────────────────────────
    const delTx = useCallback(async (txId) => {
        const id = String(txId);
        setData(prev => ({
            ...prev,
            txs: prev.txs.filter(t => String(t.id) !== id),
        }));
        try {
            await deleteDoc(doc(db, 'transactions', id));
        } catch (e) {
            console.error('TX 删除失败', e);
            showToast('云端删除失败: ' + e.message, 'error');
        }
    }, [showToast]);

    // ── updateAcc：更新账户余额 ────────────────────────────
    const updateAcc = useCallback((accId, delta) => {
        setData(prev => ({
            ...prev,
            acc: prev.acc.map(a =>
                a.id === accId ? { ...a, bal: (a.bal || 0) + delta } : a
            ),
        }));
    }, []);

    // ── updateHistory：记录月末净资产快照 ─────────────────
    const updateHistory = useCallback(() => {
        setData(prev => {
            const currentTotal = prev.acc.reduce((s, a) => s + (a.bal || 0), 0);
            const curM = new Date().toISOString().slice(0, 7);
            const history = [...prev.history];
            const idx = history.findIndex(h => h.month === curM);
            if (idx >= 0) history[idx] = { ...history[idx], val: currentTotal };
            else history.push({ month: curM, val: currentTotal });
            history.sort((a, b) => a.month.localeCompare(b.month));
            return { ...prev, history };
        });
    }, []);

    // ── checkSubs：检查周期订阅到期自动入账 ───────────────
    const checkSubs = useCallback(() => {
        setData(prev => {
            if (!prev.subs || prev.subs.length === 0) return prev;
            const today = new Date().toISOString().slice(0, 10);
            let changed = false;
            const newSubs = prev.subs.map(s => {
                if (!s.nextDate || s.nextDate > today || s.paused) return s;
                changed = true;
                // 计算下次日期
                const next = new Date(s.nextDate);
                if (s.cycle === 'monthly') next.setMonth(next.getMonth() + 1);
                else if (s.cycle === 'weekly') next.setDate(next.getDate() + 7);
                else if (s.cycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
                return { ...s, nextDate: next.toISOString().slice(0, 10) };
            });
            if (!changed) return prev;
            showToast('📅 周期订阅已自动处理');
            return { ...prev, subs: newSubs };
        });
    }, [showToast]);

    // ── 更新 data 的通用方法（用于弹窗保存等）────────────
    const updateData = useCallback((updater) => {
        setData(prev => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
            return next;
        });
    }, []);

    return useMemo(() => ({
        data,
        setData,
        updateData,
        loading,
        loadFromFirebase,
        saveData,
        addTx,
        addTxBatch,
        delTx,
        updateAcc,
        updateHistory,
        checkSubs,
    }), [
        data,
        loading,
        setData,
        updateData,
        loadFromFirebase,
        saveData,
        addTx,
        addTxBatch,
        delTx,
        updateAcc,
        updateHistory,
        checkSubs,
    ]);
}
