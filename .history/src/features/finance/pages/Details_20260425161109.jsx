// ============================================================
// Finance Pro — Details 账单明细
// 功能：关键词筛选 + 排序 + 编辑 + 删除
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useFinance } from '../index';
import { getCatName, getColorMap, getExpenseOpts, getIncomeOpts, getCatMap, getDomainForCat } from '../utils/catMap';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

// ── Firestore 写入前清理（与 useFinanceData 中一致）──────────
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

export default function Details() {
    const { data, setData, updateData, delTx, updateHistory, saveData, showToast } = useFinance();

    // ── 筛选状态（仅保留搜索）────────────────────────────
    const [filterKey, setFilterKey] = useState('');
    const [sortDesc,  setSortDesc]  = useState(true);

    // 行内编辑状态
    const [editingTxId, setEditingTxId] = useState(null);
    const [editFormData, setEditFormData] = useState({ date: '', cat2: '', desc: '', amount: 0 });

    // ── 筛选 + 排序 ───────────────────────────────────────
    const filteredTxs = useMemo(() => {
        const list = [...data.txs].filter(t => {
            if (filterKey) {
                const txt = `${t.desc || ''} ${t.cat1 || ''} ${t.cat2 || ''}`.toLowerCase();
                if (!txt.includes(filterKey.toLowerCase())) return false;
            }
            return true;
        });
        return list.sort((a, b) => {
            const d = new Date(b.date) - new Date(a.date);
            return sortDesc ? d : -d;
        });
    }, [data.txs, filterKey, sortDesc]);

    // ── 删除 ──────────────────────────────────────────────
    const handleDelete = useCallback(async (tx) => {
        if (!window.confirm('确定删除该交易？')) return;
        // 余额回退
        if (tx.type === 'income') {
            updateData(prev => ({ ...prev, acc: prev.acc.map(a => String(a.id) === String(tx.accId) ? { ...a, bal: a.bal - tx.amount } : a) }));
        } else if (tx.type === 'expense') {
            const targetId = tx.accId === 'auto' ? data.acc[0]?.id : tx.accId;
            updateData(prev => ({ ...prev, acc: prev.acc.map(a => String(a.id) === String(targetId) ? { ...a, bal: a.bal + tx.amount } : a) }));
        } else if (tx.type === 'transfer') {
            updateData(prev => ({ ...prev, acc: prev.acc.map(a => {
                if (String(a.id) === String(tx.accId))   return { ...a, bal: a.bal + tx.amount };
                if (String(a.id) === String(tx.toAccId)) return { ...a, bal: a.bal - tx.amount };
                return a;
            }) }));
        }
        await delTx(tx.id);
        showToast('交易已删除');
    }, [data.acc, delTx, updateData, showToast]);

    // ── 行内编辑：开始编辑 ─────────────────────────────────
    const handleStartEdit = useCallback((t) => {
        setEditingTxId(t.id);
        setEditFormData({
            date: t.date || '',
            cat2: t.cat2 || '',
            desc: t.desc || '',
            amount: t.amount || 0,
        });
    }, []);

    // ── 行内编辑：取消 ─────────────────────────────────────
    const handleCancelEdit = useCallback(() => {
        setEditingTxId(null);
        setEditFormData({ date: '', cat2: '', desc: '', amount: 0 });
    }, []);

    // ── 行内编辑：保存（核心逻辑）──────────────────────────
    const handleSaveEdit = useCallback(async (t) => {
        const oldAmount = t.amount || 0;
        const newAmount = parseFloat(editFormData.amount) || 0;
        const amountDiff = newAmount - oldAmount;

        // 根据新选择的 cat2 确定新的 type（支持收入↔支出转型）
        const newCat = data.cats.find(c => c.id === editFormData.cat2);
        const newType = newCat?.type || t.type;

        // (a) 余额差值处理（使用 newType 确保分类变更后方向正确）
        if (amountDiff !== 0) {
            if (newType === 'income') {
                updateData(prev => ({
                    ...prev,
                    acc: prev.acc.map(a =>
                        String(a.id) === String(t.accId) ? { ...a, bal: (a.bal || 0) + amountDiff } : a
                    ),
                }));
            } else if (newType === 'expense') {
                const targetId = t.accId === 'auto' ? data.acc[0]?.id : t.accId;
                updateData(prev => ({
                    ...prev,
                    acc: prev.acc.map(a =>
                        String(a.id) === String(targetId) ? { ...a, bal: (a.bal || 0) - amountDiff } : a
                    ),
                }));
            } else if (newType === 'transfer') {
                updateData(prev => ({
                    ...prev,
                    acc: prev.acc.map(a => {
                        if (String(a.id) === String(t.accId))   return { ...a, bal: (a.bal || 0) - amountDiff };
                        if (String(a.id) === String(t.toAccId)) return { ...a, bal: (a.bal || 0) + amountDiff };
                        return a;
                    }),
                }));
            }
        }

        // (b) 数据更新
        const catMap = getCatMap(data.cats);
        const updatedTx = {
            ...t,
            type: newType,   // ← 同步更新类型，确保收入↔支出转型正确
            date: editFormData.date,
            desc: editFormData.desc,
            cat2: editFormData.cat2,
            cat1: catMap[editFormData.cat2] || '其他',
            amount: newAmount,
            domain: getDomainForCat(data.cats, editFormData.cat2),
            updatedAt: new Date().toISOString(),
        };

        // (c) 状态与 Firebase 同步
        // 只用 setData 回调更新本地状态（确保获取最新数据，无陈旧闭包问题）
        // 不再调用 saveData()，因为 saveConfigToFirebase 不保存 txs，
        // 且上面的 setDoc 已直接将更新写入 Firebase transactions 集合
        setData(prev => ({
            ...prev,
            txs: prev.txs.map(tx =>
                String(tx.id) === String(t.id) ? updatedTx : tx
            ),
        }));

        try {
            await setDoc(doc(db, 'transactions', String(t.id)), sanitizeForFirestore(updatedTx), { merge: true });
        } catch (e) {
            console.error('edit save failed', e);
        }

        // (d) 交互反馈
        setEditingTxId(null);
        setEditFormData({ date: '', cat2: '', desc: '', amount: 0 });
        showToast('修改成功');
    }, [editFormData, data, setData, updateData, showToast]);

    // ── 颜色映射 ──────────────────────────────────────────
    const colorMap = useMemo(() => getColorMap(data.cats), [data.cats]);

    return (
        <>
            <div id="details" className="card">
                <div className="card-header">
                    <div className="title">收支明细</div>

                    {/* 搜索框 */}
                    <input
                        id="filter-key"
                        className="form-control"
                        style={{ minWidth:90, width:200 }}
                        placeholder="搜索"
                        value={filterKey}
                        onChange={e => setFilterKey(e.target.value)}
                    />
                </div>

                {/* 表格 */}
                <div style={{ overflowX:'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th onClick={() => setSortDesc(v => !v)} style={{ cursor:'pointer', userSelect:'none' }}>
                                    日期 <i className={sortDesc ? 'ri-sort-desc' : 'ri-sort-asc'} />
                                </th>
                                <th>类型</th>
                                <th>一级</th>
                                <th>二级</th>
                                <th>说明</th>
                                <th style={{ textAlign:'right' }}>金额</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTxs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign:'center', color:'#aaa', padding:30 }}>暂无数据</td>
                                </tr>
                            ) : filteredTxs.map(t => (
                                <TxRow
                                    key={t.id}
                                    tx={t}
                                    colorMap={colorMap}
                                    cats={data.cats}
                                    editingTxId={editingTxId}
                                    editFormData={editFormData}
                                    setEditFormData={setEditFormData}
                                    onStartEdit={handleStartEdit}
                                    onSaveEdit={handleSaveEdit}
                                    onCancelEdit={handleCancelEdit}
                                    onDelete={() => handleDelete(t)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

// ── 单行组件（支持行内编辑）────────────────────────────────
function TxRow({ tx: t, colorMap, cats, editingTxId, editFormData, setEditFormData, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
    const c = colorMap[t.cat1] || '#ccc';
    const isEditing = editingTxId === t.id;

    let typeLabel = '支出', typeColor = 'var(--c-survive)', amtPrefix = '-';
    if (t.type === 'income')   { typeLabel = '收入'; typeColor = 'var(--c-income)';  amtPrefix = '+'; }
    else if (t.type === 'transfer') { typeLabel = '转账'; typeColor = '#718096'; amtPrefix = ''; }
    else if (t.type === 'adjust')   {
        typeLabel = '平账'; typeColor = '#A0AEC0';
        const isInc = t.diffDir === 'inc' || t.cat2 === '平账收入';
        amtPrefix = isInc ? '+' : '-';
    }

    // 编辑态下的分类下拉选项
    const catOptsHtml = t.type === 'income'
        ? getIncomeOpts(cats)
        : getExpenseOpts(cats);

    return (
        <tr>
            <td data-label="日期" className="td-edit-wrap">
                {isEditing ? (
                    <input
                        type="date"
                        className="edit-naked-input"
                        style={{ width:130 }}
                        value={editFormData.date}
                        onChange={e => setEditFormData(f => ({ ...f, date: e.target.value }))}
                    />
                ) : <span className="td-edit-wrap-text">{t.date}</span>}
            </td>
            <td data-label="类型" className="td-edit-wrap">
                <span className="td-edit-wrap-text" style={{ color:typeColor, fontWeight:700 }}>{typeLabel}</span>
            </td>
            <td data-label="一级" className="td-edit-wrap">
                <span className="tag td-edit-wrap-text" style={{ background:`${c}22`, color:c }}>{t.cat1 || '-'}</span>
            </td>
            <td data-label="二级" className="td-edit-wrap">
                {isEditing ? (
                    <select
                        className="edit-naked-select"
                        style={{ width:130 }}
                        value={editFormData.cat2}
                        onChange={e => setEditFormData(f => ({ ...f, cat2: e.target.value }))}
                        dangerouslySetInnerHTML={{ __html: '<option value="">(选择分类)</option>' + catOptsHtml }}
                    />
                ) : <span className="td-edit-wrap-text">{getCatName(cats, t.cat2)}</span>}
            </td>
            <td data-label="说明" className="td-edit-wrap" style={{ color:'#2D3748', fontWeight:500 }}>
                {isEditing ? (
                    <input
                        type="text"
                        className="edit-naked-input"
                        style={{ width:'100%', minWidth:80 }}
                        value={editFormData.desc}
                        onChange={e => setEditFormData(f => ({ ...f, desc: e.target.value }))}
                    />
                ) : <span className="td-edit-wrap-text">{(t.desc || '')}</span>}
            </td>
            <td data-label="金额" className="td-edit-wrap" style={{ textAlign:'right', fontWeight:'bold', color:typeColor }}>
                {isEditing ? (
                    <input
                        type="number"
                        className="edit-naked-input"
                        style={{ width:100, textAlign:'right' }}
                        value={editFormData.amount}
                        onChange={e => setEditFormData(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    />
                ) : (
                    <span className="td-edit-wrap-text">{amtPrefix} {(t.amount || 0).toLocaleString()}</span>
                )}
            </td>
            <td className="td-edit-wrap" style={{ whiteSpace:'nowrap' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end' }}>
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => onSaveEdit(t)}
                                title="保存"
                                style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}
                            >✅</button>
                            <button
                                onClick={onCancelEdit}
                                title="取消"
                                style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}
                            >❌</button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => onStartEdit(t)}
                                title="编辑"
                                style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}
                            >✏️</button>
                            <button
                                onClick={onDelete}
                                title="删除"
                                style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}
                            >🗑️</button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}
