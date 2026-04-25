// ============================================================
// Finance Pro — Details 账单明细
// 功能：关键词筛选 + 排序 + 编辑 + 删除
// 优化：虚拟滚动 + React.memo + 搜索防抖
// ============================================================

import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { useFinance } from '../index';
import { getCatName, getColorMap, getExpenseOpts, getIncomeOpts, getCatMap, getDomainForCat } from '../utils/catMap';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useVirtualizer } from '@tanstack/react-virtual';

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

    // ── 搜索防抖 ─────────────────────────────────────────
    const [searchInput, setSearchInput] = useState('');
    const debounceRef = useRef(null);
    const handleSearchChange = useCallback((e) => {
        const val = e.target.value;
        setSearchInput(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setFilterKey(val), 120);
    }, []);

    // ── 筛选 + 排序 ──────────────────────────────────────
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

    // ── 颜色映射 ─────────────────────────────────────────
    const colorMap = useMemo(() => getColorMap(data.cats), [data.cats]);

    // ── 虚拟滚动 ─────────────────────────────────────────
    const scrollRef = useRef(null);
    const rowVirtualizer = useVirtualizer({
        count: filteredTxs.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 53,
        overscan: 6,
    });

    // ── 删除 ─────────────────────────────────────────────
    const handleDelete = useCallback(async (tx) => {
        if (!window.confirm('确定删除该交易？')) return;
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

    // ── 行内编辑：开始编辑 ────────────────────────────────
    const handleStartEdit = useCallback((t) => {
        setEditingTxId(t.id);
        setEditFormData({
            date: t.date || '',
            cat2: t.cat2 || '',
            desc: t.desc || '',
            amount: t.amount || 0,
        });
    }, []);

    // ── 行内编辑：取消 ────────────────────────────────────
    const handleCancelEdit = useCallback(() => {
        setEditingTxId(null);
        setEditFormData({ date: '', cat2: '', desc: '', amount: 0 });
    }, []);

    // ── 行内编辑：保存（核心逻辑）─────────────────────────
    const handleSaveEdit = useCallback(async (t) => {
        const oldAmount = t.amount || 0;
        const newAmount = parseFloat(editFormData.amount) || 0;
        const amountDiff = newAmount - oldAmount;

        const newCat = data.cats.find(c => c.id === editFormData.cat2);
        const newType = newCat?.type || t.type;

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

        const catMap = getCatMap(data.cats);
        const updatedTx = {
            ...t,
            type: newType,
            date: editFormData.date,
            desc: editFormData.desc,
            cat2: editFormData.cat2,
            cat1: catMap[editFormData.cat2] || '其他',
            amount: newAmount,
            domain: getDomainForCat(data.cats, editFormData.cat2),
            updatedAt: new Date().toISOString(),
        };

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

        setEditingTxId(null);
        setEditFormData({ date: '', cat2: '', desc: '', amount: 0 });
        showToast('修改成功');
    }, [editFormData, data, setData, updateData, showToast]);

    return (
        <>
            <div id="details" className="card virt-table-card">
                <div className="card-header">
                    <div className="title">收支明细</div>
                    <input
                        id="filter-key"
                        className="form-control"
                        style={{ minWidth:90, width:200 }}
                        placeholder="搜索"
                        value={searchInput}
                        onChange={handleSearchChange}
                    />
                </div>

                {/* 虚拟滚动表格 */}
                <div className="virt-table-container">
                    {/* 表头（固定不滚动） */}
                    <div className="virt-thead">
                        <div
                            className="virt-th virt-th-date"
                            onClick={() => setSortDesc(v => !v)}
                        >
                            日期 <i className={sortDesc ? 'ri-sort-desc' : 'ri-sort-asc'} />
                        </div>
                        <div className="virt-th virt-th-type">类型</div>
                        <div className="virt-th virt-th-cat1">一级</div>
                        <div className="virt-th virt-th-cat2">二级</div>
                        <div className="virt-th virt-th-desc">说明</div>
                        <div className="virt-th virt-th-amount">金额</div>
                        <div className="virt-th virt-th-actions" />
                    </div>

                    {/* 虚拟滚动区域 */}
                    <div ref={scrollRef} className="virt-tbody">
                        {filteredTxs.length === 0 ? (
                            <div className="virt-empty">暂无数据</div>
                        ) : (
                            <div
                                className="virt-scroll-space"
                                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                            >
                                {rowVirtualizer.getVirtualItems().map(virtualItem => {
                                    const t = filteredTxs[virtualItem.index];
                                    return (
                                        <div
                                            key={virtualItem.key}
                                            className="virt-row"
                                            style={{
                                                height: `${virtualItem.size}px`,
                                                transform: `translateY(${virtualItem.start}px)`,
                                            }}
                                        >
                                            <TxRow
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
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── 单行组件（支持行内编辑）+ React.memo ──────────────────
const TxRow = memo(function TxRow({ tx: t, colorMap, cats, editingTxId, editFormData, setEditFormData, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
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

    const catOptsHtml = t.type === 'income'
        ? getIncomeOpts(cats)
        : getExpenseOpts(cats);

    return (
        <>
            {/* 桌面端：Grid 布局行 */}
            <div className="virt-td virt-td-date">
                {isEditing ? (
                    <input
                        type="date"
                        className="edit-naked-input"
                        style={{ width:130 }}
                        value={editFormData.date}
                        onChange={e => setEditFormData(f => ({ ...f, date: e.target.value }))}
                    />
                ) : <span>{t.date}</span>}
            </div>
            <div className="virt-td virt-td-type">
                <span style={{ color:typeColor, fontWeight:700 }}>{typeLabel}</span>
            </div>
            <div className="virt-td virt-td-cat1">
                <span className="tag" style={{ background:`${c}22`, color:c }}>{t.cat1 || '-'}</span>
            </div>
            <div className="virt-td virt-td-cat2">
                {isEditing ? (
                    <select
                        className="edit-naked-select"
                        style={{ width:130 }}
                        value={editFormData.cat2}
                        onChange={e => setEditFormData(f => ({ ...f, cat2: e.target.value }))}
                        dangerouslySetInnerHTML={{ __html: '<option value="">(选择分类)</option>' + catOptsHtml }}
                    />
                ) : <span>{getCatName(cats, t.cat2)}</span>}
            </div>
            <div className="virt-td virt-td-desc" style={{ color:'#2D3748', fontWeight:500 }}>
                {isEditing ? (
                    <input
                        type="text"
                        className="edit-naked-input"
                        style={{ width:'100%', minWidth:80 }}
                        value={editFormData.desc}
                        onChange={e => setEditFormData(f => ({ ...f, desc: e.target.value }))}
                    />
                ) : <span>{(t.desc || '')}</span>}
            </div>
            <div className="virt-td virt-td-amount" style={{ textAlign:'right', fontWeight:'bold', color:typeColor }}>
                {isEditing ? (
                    <input
                        type="number"
                        className="edit-naked-input"
                        style={{ width:100, textAlign:'right' }}
                        value={editFormData.amount}
                        onChange={e => setEditFormData(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    />
                ) : (
                    <span>{amtPrefix} {(t.amount || 0).toLocaleString()}</span>
                )}
            </div>
            <div className="virt-td virt-td-actions" style={{ whiteSpace:'nowrap', display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end' }}>
                {isEditing ? (
                    <>
                        <button onClick={() => onSaveEdit(t)} title="保存"
                            style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}>✅</button>
                        <button onClick={onCancelEdit} title="取消"
                            style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}>❌</button>
                    </>
                ) : (
                    <>
                        <button onClick={() => onStartEdit(t)} title="编辑"
                            style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}>✏️</button>
                        <button onClick={onDelete} title="删除"
                            style={{ background:'none', border:'none', cursor:'pointer', padding:'0 4px', fontSize:16, lineHeight:1 }}>🗑️</button>
                    </>
                )}
            </div>
        </>
    );
});
