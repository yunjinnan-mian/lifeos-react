// ============================================================
// Finance Pro — Assets 资产快照 (表格风格版)
// 多账户 · 手动快照 · Firebase 持久化 · 差额对比账单净额
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { useFinance } from '../index';

// ── Firebase 数据层 ───────────────────────────────────────
const ACCOUNTS_REF  = doc(db, 'config', 'assets_accounts');
const SNAPSHOTS_COL = 'assets_snapshots';

async function fetchAccounts() {
    const snap = await getDoc(ACCOUNTS_REF);
    return snap.exists() ? (snap.data().accounts ?? []) : [];
}
async function persistAccounts(accounts) {
    await setDoc(ACCOUNTS_REF, { accounts, updatedAt: new Date().toISOString() });
}
async function fetchSnapshots() {
    const snap = await getDocs(collection(db, SNAPSHOTS_COL));
    const list = [];
    snap.forEach(d => list.push(d.data()));
    return list.sort((a, b) => a.date.localeCompare(b.date));
}
async function persistSnapshot(snapshot) {
    await setDoc(doc(db, SNAPSHOTS_COL, snapshot.id), {
        ...snapshot,
        updatedAt: new Date().toISOString(),
    });
}
async function removeSnapshot(id) {
    await deleteDoc(doc(db, SNAPSHOTS_COL, id));
}

// ── 格式化 ────────────────────────────────────────────────
const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDiff = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n);
function fmtDate(d) {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${parseInt(m)}月${parseInt(day)}日`;
}

// ════════════════════════════════════════════════════════════
export default function Assets() {
    const { data: financeData } = useFinance();

    const [accounts,  setAccounts]  = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [loaded,    setLoaded]    = useState(false);
    const [error,     setError]     = useState('');

    const [editCell, setEditCell] = useState(null);
    const [editVal,  setEditVal]  = useState('');
    const inputRef      = useRef(null);
    const navigatingRef = useRef(false);

    // 新增：编辑模式状态
    const [isEditMode, setIsEditMode] = useState(false);

    const [showAddAcc, setShowAddAcc] = useState(false);
    const [newAccName, setNewAccName] = useState('');
    const [pendingDate, setPendingDate] = useState('');

    useEffect(() => {
        Promise.all([fetchAccounts(), fetchSnapshots()])
            .then(([accs, snaps]) => { setAccounts(accs); setSnapshots(snaps); setLoaded(true); })
            .catch(() => { setError('加载失败，请刷新重试'); setLoaded(true); });
    }, []);

    useEffect(() => {
        if (editCell) {
            inputRef.current?.focus();
            navigatingRef.current = false;
        }
    }, [editCell]);

    const sorted = useMemo(
        () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
        [snapshots]
    );

    const rows = useMemo(() => {
        return sorted.map((snap, idx) => {
            const total = accounts.reduce((s, a) => s + (snap.balances?.[a.id] ?? 0), 0);
            let actualDiff = null;
            let txNet      = null;
            if (idx > 0) {
                const prev      = sorted[idx - 1];
                const prevTotal = accounts.reduce((s, a) => s + (prev.balances?.[a.id] ?? 0), 0);
                actualDiff = total - prevTotal;
                txNet = financeData.txs
                    .filter(t =>
                        t.date > prev.date && t.date <= snap.date &&
                        t.type !== 'transfer' && t.type !== 'adjust' &&
                        !t.cat2?.includes('平账') && !t.cat1?.includes('平账')
                    )
                    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
            }
            return { ...snap, total, actualDiff, txNet };
        });
    }, [sorted, accounts, financeData.txs]);

    const latestSnap = sorted[sorted.length - 1];
    const grandTotal = accounts.reduce((s, a) => s + (latestSnap?.balances?.[a.id] ?? 0), 0);
    const displayRows = useMemo(() => [...rows].reverse(), [rows]);

    // ── 账户操作 ──────────────────────────────────────────
    const handleAddAccount = useCallback(async () => {
        const name = newAccName.trim();
        if (!name) {
            setShowAddAcc(false);
            return;
        }
        const acc  = { id: `acc_${Date.now()}`, name };
        const next = [...accounts, acc];
        setAccounts(next);
        setNewAccName('');
        setShowAddAcc(false);
        try { await persistAccounts(next); }
        catch { setError('账户保存失败'); }
    }, [accounts, newAccName]);

    const handleDeleteAccount = useCallback(async (accId) => {
        if (!window.confirm('确认删除该账户？历史余额也将不再显示。')) return;
        const next = accounts.filter(a => a.id !== accId);
        setAccounts(next);
        try { await persistAccounts(next); }
        catch { setError('账户删除失败'); }
    }, [accounts]);

    // 账户左右移动 (列排序)
    const handleMoveAccount = useCallback(async (index, direction) => {
        const newAccounts = [...accounts];
        const temp = newAccounts[index];
        newAccounts[index] = newAccounts[index + direction];
        newAccounts[index + direction] = temp;
        setAccounts(newAccounts);
        try { await persistAccounts(newAccounts); }
        catch { setError('排序保存失败'); }
    }, [accounts]);

    // ── 快照操作 ──────────────────────────────────────────
    const handleAddSnapshot = useCallback(async (dateOverride) => {
        const date = dateOverride || pendingDate.trim();
        if (!date) return;
        if (snapshots.some(s => s.date === date)) { setError('该日期已存在快照'); return; }
        const snap = { id: `snap_${Date.now()}`, date, balances: {} };
        setSnapshots(prev => [...prev, snap]);
        setPendingDate('');
        try { await persistSnapshot(snap); }
        catch { setError('快照保存失败'); }
    }, [snapshots, pendingDate]);

    const handleDeleteSnapshot = useCallback(async (snapId) => {
        if(!window.confirm('确定删除此日期快照？')) return;
        setSnapshots(prev => prev.filter(s => s.id !== snapId));
        try { await removeSnapshot(snapId); }
        catch { setError('快照删除失败'); }
    }, []);

    // 修改历史快照日期 (行排序)
    const handleChangeSnapshotDate = useCallback(async (snapId, newDate) => {
        if (!newDate) return;
        if (snapshots.some(s => s.id !== snapId && s.date === newDate)) {
            setError('该日期已存在其他快照，请选择不同日期');
            return;
        }
        const target = snapshots.find(s => s.id === snapId);
        if (!target) return;

        const updated = { ...target, date: newDate };
        setSnapshots(prev => prev.map(s => s.id === snapId ? updated : s));
        try { await persistSnapshot(updated); }
        catch { setError('日期修改保存失败'); }
    }, [snapshots]);


    // ── 单元格编辑 ────────────────────────────────────────
    const startEdit = useCallback((snapId, accId, currentVal) => {
        setEditCell({ snapId, accId });
        setEditVal(currentVal != null && currentVal !== 0 ? String(currentVal) : '');
    }, []);

    const commitEdit = useCallback(async (navToAccId = null) => {
        if (!editCell) return;
        const { snapId, accId } = editCell;
        const num = parseFloat(editVal.replace(/,/g, ''));
        const val = isNaN(num) ? 0 : num;

        const targetSnap = snapshots.find(s => s.id === snapId);
        if (!targetSnap) return;

        const updatedSnap = { ...targetSnap, balances: { ...targetSnap.balances, [accId]: val } };
        setSnapshots(prev => prev.map(s => s.id === snapId ? updatedSnap : s));

        if (navToAccId !== null) {
            const nextVal = updatedSnap.balances[navToAccId];
            setEditCell({ snapId, accId: navToAccId });
            setEditVal(nextVal != null && nextVal !== 0 ? String(nextVal) : '');
        } else {
            setEditCell(null);
        }

        persistSnapshot(updatedSnap).catch(() => setError('保存至数据库失败，请刷新重试'));
    }, [editCell, editVal, snapshots]);

    const handleCellKey = useCallback((e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (!editCell) return;
            const idx     = accounts.findIndex(a => a.id === editCell.accId);
            const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
            if (nextIdx < 0 || nextIdx >= accounts.length) return;
            navigatingRef.current = true;
            commitEdit(accounts[nextIdx].id);
        } else if (e.key === 'Enter') {
            commitEdit(null);
        } else if (e.key === 'Escape') {
            setEditCell(null);
        }
    }, [editCell, accounts, commitEdit]);

    const handleCellBlur = useCallback(() => {
        if (navigatingRef.current) return;
        commitEdit(null);
    }, [commitEdit]);

    if (!loaded) return <div style={{ textAlign:'center', marginTop:50, color:'#999' }}>加载中…</div>;

    return (
        <div style={{ paddingBottom: 40, width: '100%', overflowX: 'auto' }}>
            {error && (
                <div style={{ background:'#FFF5F5', color:'#E53935', padding:'8px 14px', marginBottom:16 }}>
                    {error} <button onClick={() => setError('')} style={{ float:'right', border:'none', background:'none' }}>×</button>
                </div>
            )}

            <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
                <h2 style={{ margin:0, fontSize:18, fontWeight:700 }}>💰 资产快照表</h2>
                
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize:12, color:'#888', display: 'none', '@media(minWidth: 768px)': { display: 'block' } }}>
                        💡 提示：点击单元格修改 · ← → 切换 · Enter 保存
                    </div>

                    {/* 编辑模式切换按钮 */}
                    <button
                        onClick={() => setIsEditMode(p => !p)}
                        style={{
                            background: isEditMode ? '#e0f2fe' : '#f1f5f9',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 10px',
                            cursor: 'pointer',
                            color: isEditMode ? '#0284c7' : '#64748b',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 13,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        ⚙️ {isEditMode ? '完成编辑' : '编辑结构'}
                    </button>
                    
                    <div>
                        {showAddAcc ? (
                            <input
                                autoFocus
                                placeholder="输入名称并回车"
                                value={newAccName}
                                onChange={e => setNewAccName(e.target.value)}
                                onBlur={handleAddAccount}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') setShowAddAcc(false); }}
                                style={{ 
                                    padding:'5px 10px', border:'1px solid #3b82f6', borderRadius: 6, 
                                    outline:'none', fontSize:13, width: 140, boxShadow: '0 0 0 2px rgba(59,130,246,0.2)',
                                    textAlign: 'center'
                                }}
                            />
                        ) : (
                            <button 
                                onClick={() => setShowAddAcc(true)}
                                style={{ 
                                    padding:'5px 12px', background:'#fff', border:'1px solid #cbd5e1', 
                                    borderRadius: 6, color:'#334155', cursor:'pointer', fontSize: 13,
                                    fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            >+ 增加账户</button>
                        )}
                    </div>
                </div>
            </div>

            <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse', 
                background: '#fff', 
                fontSize: 13,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                tableLayout: 'auto' 
            }}>
                <thead>
                    <tr>
                        <th style={{ ...TH_STYLE, color:'#10b981', minWidth: 90 }}>Σ 总合计</th>
                        <th style={{...TH_STYLE, width: isEditMode ? 140 : 110 }}>日期</th>
                        
                        {accounts.map((acc, idx) => (
                            <th key={acc.id} style={{ ...TH_STYLE, minWidth: 110 }}>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:2 }}>
                                    {/* 向左移动箭头 */}
                                    {isEditMode && idx > 0 && (
                                        <button onClick={() => handleMoveAccount(idx, -1)} style={ICON_BTN} title="向左移动">◀</button>
                                    )}
                                    
                                    <span style={{ margin: '0 4px' }}>{acc.name}</span>

                                    {/* 删除按钮 */}
                                    {isEditMode && (
                                        <button onClick={() => handleDeleteAccount(acc.id)} style={{...ICON_BTN, color: '#ef4444'}} title="删除账户">×</button>
                                    )}

                                    {/* 向右移动箭头 */}
                                    {isEditMode && idx < accounts.length - 1 && (
                                        <button onClick={() => handleMoveAccount(idx, 1)} style={ICON_BTN} title="向右移动">▶</button>
                                    )}
                                </div>
                            </th>
                        ))}
                        
                        <th style={{ ...TH_STYLE, minWidth: 100 }}>资产变动</th>
                    </tr>

                    {latestSnap && (
                        <tr style={{ background:'#f0fdf4', borderBottom: '2px solid #bbf7d0' }}>
                            <td style={{ ...TD_STYLE, fontWeight:'bold', color:'#166534', fontSize:14 }}>
                                {fmt(grandTotal)}
                            </td>
                            <td style={{ ...TD_STYLE, fontWeight:'bold', color:'#166534' }}>
                                当前最新
                            </td>
                            {accounts.map(acc => (
                                <td key={acc.id} style={{ ...TD_STYLE, color:'#166534', fontWeight:'bold' }}>
                                    {fmt(latestSnap.balances?.[acc.id] ?? 0)}
                                </td>
                            ))}
                            <td style={TD_STYLE}></td>
                        </tr>
                    )}
                </thead>

                <tbody>
                    {displayRows.map(row => (
                        <tr key={row.id} style={{ transition:'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                            
                            <td style={{ ...TD_STYLE, fontWeight:'bold', background:'#fafafa' }}>
                                {fmt(row.total)}
                            </td>

                            <td style={{ ...TD_STYLE, whiteSpace:'nowrap', color:'#475569' }}>
                                {isEditMode ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <button onClick={() => handleDeleteSnapshot(row.id)} style={{...ICON_BTN, color: '#ef4444', fontSize: 16}} title="删除快照行">×</button>
                                        <input 
                                            type="date" 
                                            value={row.date} 
                                            onChange={(e) => handleChangeSnapshotDate(row.id, e.target.value)}
                                            style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 12, outline: 'none' }}
                                        />
                                    </div>
                                ) : (
                                    fmtDate(row.date)
                                )}
                            </td>

                            {accounts.map(acc => {
                                const isEditing = editCell?.snapId === row.id && editCell?.accId === acc.id;
                                const val = row.balances?.[acc.id];
                                return (
                                    <td 
                                        key={acc.id} 
                                        onClick={() => { if (!isEditing && !isEditMode) startEdit(row.id, acc.id, val); }}
                                        style={{ 
                                            ...TD_STYLE, 
                                            cursor: isEditMode ? 'not-allowed' : 'text', // 编辑结构时禁止改金额
                                            position: 'relative' 
                                        }}
                                    >
                                        <div style={{ opacity: isEditing ? 0 : (isEditMode ? 0.5 : 1), color: val ? '#0f172a' : '#cbd5e1' }}>
                                            {val ? fmt(val) : '—'}
                                        </div>

                                        {isEditing && !isEditMode && (
                                            <input
                                                ref={inputRef}
                                                value={editVal}
                                                onChange={e => setEditVal(e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKey}
                                                style={{ 
                                                    position: 'absolute',
                                                    top: 0, left: 0,
                                                    width: '100%', height: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '8px 10px',
                                                    margin: 0,
                                                    textAlign: 'center',
                                                    border: '2px solid #3b82f6', 
                                                    outline: 'none', 
                                                    background: '#fff',
                                                    fontSize: 13,
                                                    color: '#0f172a',
                                                    zIndex: 10,
                                                    fontFamily: 'inherit'
                                                }}
                                            />
                                        )}
                                    </td>
                                );
                            })}
                            
                            <td style={{ ...TD_STYLE }}>
                                {row.actualDiff != null ? (
                                    <div style={{ opacity: isEditMode ? 0.5 : 1 }}>
                                        <div style={{ fontWeight:'bold', color: row.actualDiff >= 0 ? '#10b981' : '#ef4444' }}>
                                            {fmtDiff(row.actualDiff)}
                                        </div>
                                        {row.txNet != null && (
                                            <div style={{ fontSize:11, color:'#94a3b8' }}>
                                                账单 {fmtDiff(row.txNet)}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span style={{ color:'#e2e8f0' }}>—</span>
                                )}
                            </td>
                        </tr>
                    ))}

                    {/* 底部新增行只在平时显示，防止编辑模式干扰视觉 */}
                    {!isEditMode && (
                        <tr>
                            <td style={{ ...TD_STYLE, color: '#cbd5e1' }}>—</td>
                            
                            <td style={{ ...TD_STYLE, padding: '6px' }}>
                                <input
                                    type="date"
                                    value={pendingDate}
                                    onChange={e => {
                                        setPendingDate(e.target.value);
                                        if(e.target.value) handleAddSnapshot(e.target.value); 
                                    }}
                                    style={{ border:'1px solid #cbd5e1', borderRadius:4, padding:'4px', fontSize:12, width:'110px', textAlign: 'center' }}
                                />
                            </td>
                            
                            <td colSpan={accounts.length + 1} style={{ ...TD_STYLE, color:'#94a3b8', textAlign:'left', paddingLeft: 16 }}>
                                ← 选择日期新建快照行
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ── 样式常量 ──────────────────────────────────────────────
const BORDER_COLOR = '#e2e8f0';

const TH_STYLE = {
    border: `1px solid ${BORDER_COLOR}`,
    padding: '10px 8px',
    background: '#f1f5f9',
    color: '#334155',
    fontWeight: 'bold',
    textAlign: 'center',
    whiteSpace: 'nowrap'
};

const TD_STYLE = {
    border: `1px solid ${BORDER_COLOR}`,
    padding: '8px 10px',
    textAlign: 'center',
    verticalAlign: 'middle',
};

// 工具图标按钮样式
const ICON_BTN = {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1
};