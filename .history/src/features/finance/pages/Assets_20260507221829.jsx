// ============================================================
// Finance Pro — Assets 资产快照 (表格风格版)
// 多账户 · 手动快照 · Firebase 持久化 · 差额对比账单净额
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
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

// ── 格式化工具 ────────────────────────────────────────────────
const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDiff = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n);
function fmtDate(d) {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${parseInt(m)}月${parseInt(day)}日`;
}
function getTodayDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ════════════════════════════════════════════════════════════
const Assets = memo(function Assets() {
    const { data: financeData } = useFinance();

    const [accounts,  setAccounts]  = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [loaded,    setLoaded]    = useState(false);
    const [error,     setError]     = useState('');

    const [editCell, setEditCell] = useState(null);
    const [editVal,  setEditVal]  = useState('');
    const inputRef      = useRef(null);
    const navigatingRef = useRef(false);

    const [isEditMode, setIsEditMode] = useState(false);
    const [showAddAcc, setShowAddAcc] = useState(false);
    const [newAccName, setNewAccName] = useState('');

    const [hoverChartIdx, setHoverChartIdx] = useState(null);

    const tableContainerRef = useRef(null);
    const [showLeftShadow, setShowLeftShadow] = useState(false);
    const [showRightShadow, setShowRightShadow] = useState(false);

    // ── 初始加载 ──────────────────────────────────────────
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

    // ── 滚动阴影逻辑 ──────────────────────────────────────
    const checkShadows = useCallback(() => {
        if (!tableContainerRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
        setShowLeftShadow(scrollLeft > 0);
        setShowRightShadow(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }, []);

    useEffect(() => {
        checkShadows();
        window.addEventListener('resize', checkShadows);
        return () => window.removeEventListener('resize', checkShadows);
    }, [snapshots, accounts, checkShadows]);

    const handleScroll = () => checkShadows();

    // ── 派生数据 ──────────────────────────────────────────
    const rows = useMemo(() => {
        const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
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
    }, [snapshots, accounts, financeData.txs]);

    const displayRows = useMemo(() => [...rows].reverse(), [rows]);
    const latestSnap = rows[rows.length - 1];
    const grandTotal = latestSnap ? latestSnap.total : 0;

    // ── 账户操作 ──────────────────────────────────────────
    const handleAddAccount = useCallback(async () => {
        const name = newAccName.trim();
        if (!name) { setShowAddAcc(false); return; }
        const acc  = { id: `acc_${Date.now()}`, name };
        const next = [...accounts, acc];
        setAccounts(next);
        setNewAccName('');
        setShowAddAcc(false);
        try { await persistAccounts(next); } catch { setError('账户保存失败'); }
    }, [accounts, newAccName]);

    const handleDeleteAccount = useCallback(async (accId) => {
        if (!window.confirm('确认删除该账户？历史余额也将不再显示。')) return;
        const next = accounts.filter(a => a.id !== accId);
        setAccounts(next);
        try { await persistAccounts(next); } catch { setError('账户删除失败'); }
    }, [accounts]);

    const handleMoveAccount = useCallback(async (index, direction) => {
        const newAccounts = [...accounts];
        const temp = newAccounts[index];
        newAccounts[index] = newAccounts[index + direction];
        newAccounts[index + direction] = temp;
        setAccounts(newAccounts);
        try { await persistAccounts(newAccounts); } catch { setError('排序保存失败'); }
    }, [accounts]);

    // ── 快照操作 (记录今日) ──────────────────────────
    const handleRecordToday = useCallback(async () => {
        if (accounts.length === 0) { setError('请先添加至少一个账户！'); return; }
        setIsEditMode(false);
        const today = getTodayDate();
        let targetSnapId = null;

        const existingSnap = snapshots.find(s => s.date === today);
        if (existingSnap) {
            targetSnapId = existingSnap.id;
        } else {
            targetSnapId = `snap_${Date.now()}`;
            const newSnap = { id: targetSnapId, date: today, balances: {} };
            setSnapshots(prev => [...prev, newSnap]);
            try { await persistSnapshot(newSnap); } catch { setError('快照保存失败'); }
        }

        const firstAccId = accounts[0].id;
        const currentVal = existingSnap ? existingSnap.balances[firstAccId] : 0;
        setEditCell({ snapId: targetSnapId, accId: firstAccId });
        setEditVal(currentVal != null && currentVal !== 0 ? String(currentVal) : '');
    }, [accounts, snapshots]);

    const handleDeleteSnapshot = useCallback(async (snapId) => {
        if(!window.confirm('确定删除此日期快照？')) return;
        setSnapshots(prev => prev.filter(s => s.id !== snapId));
        try { await removeSnapshot(snapId); } catch { setError('快照删除失败'); }
    }, []);

    const handleChangeSnapshotDate = useCallback(async (snapId, newDate) => {
        if (!newDate) return;
        if (snapshots.some(s => s.id !== snapId && s.date === newDate)) {
            setError('该日期已存在其他快照'); return;
        }
        const target = snapshots.find(s => s.id === snapId);
        if (!target) return;
        const updated = { ...target, date: newDate };
        setSnapshots(prev => prev.map(s => s.id === snapId ? updated : s));
        try { await persistSnapshot(updated); } catch { setError('保存失败'); }
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

    // ── 原生 SVG 折线图 (必须有 2 条及以上数据才显示) ──
    const chartRender = useMemo(() => {
        if (rows.length < 2) return null; 
        
        const chartWidth = 1000;
        const chartHeight = 80;
        const totals = rows.map(r => r.total);
        const minTotal = Math.min(...totals);
        const maxTotal = Math.max(...totals);
        const pad = (maxTotal - minTotal) * 0.1 || maxTotal * 0.1 || 1; 
        const yMin = minTotal - pad;
        const yMax = maxTotal + pad;
        const yRange = yMax - yMin;

        const points = rows.map((r, i) => {
            const x = (i / (rows.length - 1)) * chartWidth;
            const y = chartHeight - ((r.total - yMin) / yRange) * chartHeight;
            return `${x},${y}`;
        }).join(' ');

        const fillPoints = `0,${chartHeight} ${points} ${chartWidth},${chartHeight}`;

        return { chartWidth, chartHeight, points, fillPoints, yMin, yRange };
    }, [rows]);

    if (!loaded) return <div style={{ textAlign:'center', marginTop:50, color:'#999' }}>加载中…</div>;

    return (
        <div style={{ paddingBottom: 40, width: '100%' }}>
            
            {/* 注入组件专属 CSS：高级统一控制条 */}
            <style>{`
                .assets-table-scroll::-webkit-scrollbar { height: 6px; }
                .assets-table-scroll::-webkit-scrollbar-track { background: transparent; }
                .assets-table-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }
                .assets-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
                
                /* iOS 风格聚合控制条 */
                .glass-toolbar {
                    display: inline-flex;
                    align-items: center;
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 4px;
                }
                .glass-btn {
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #475569;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    white-space: nowrap; /* 绝对禁止换行 */
                }
                .glass-btn:active { transform: scale(0.95); }
                .glass-btn:hover { background: rgba(0,0,0,0.04); color: #0f172a; }
                .glass-btn.active-mode { background: #fff; color: #0284c7; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                
                .glass-divider { width: 1px; height: 16px; background: #cbd5e1; margin: 0 4px; }
                
                .glass-input {
                    background: #fff;
                    border: 1px solid #3b82f6;
                    border-radius: 6px;
                    padding: 5px 10px;
                    font-size: 13px;
                    width: 90px;
                    outline: none;
                    box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
                    text-align: center;
                }
            `}</style>

            {error && (
                <div style={{ background:'#FFF5F5', color:'#E53935', padding:'8px 14px', marginBottom:16, borderRadius: 6 }}>
                    {error} <button onClick={() => setError('')} style={{ float:'right', border:'none', background:'none', cursor:'pointer' }}>×</button>
                </div>
            )}

            {/* 🚀 重构顶栏：Flex 自动折行 + 聚合控制条 */}
            <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: chartRender ? 12 : 20 
            }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>💰 资产快照表</h2>
                
                {/* 聚合控制条 (iOS Segmented Control 风格) */}
                <div className="glass-toolbar">
                    <button className="glass-btn" onClick={handleRecordToday}>
                        <span style={{ fontSize: 14 }}>📅</span> 记录今日
                    </button>

                    <div className="glass-divider" />

                    <button 
                        className={`glass-btn ${isEditMode ? 'active-mode' : ''}`} 
                        onClick={() => setIsEditMode(p => !p)}
                    >
                        <span style={{ fontSize: 14 }}>⚙️</span> {isEditMode ? '完成' : '编辑'}
                    </button>

                    <div className="glass-divider" />

                    {showAddAcc ? (
                        <input
                            className="glass-input"
                            autoFocus placeholder="回车确认" value={newAccName}
                            onChange={e => setNewAccName(e.target.value)} onBlur={handleAddAccount}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') setShowAddAcc(false); }}
                        />
                    ) : (
                        <button className="glass-btn" onClick={() => setShowAddAcc(true)}>
                            ➕ 账户
                        </button>
                    )}
                </div>
            </div>

            {/* 折线图区 — 每个点就是数值本身，线纯粹连接相邻点 */}
            {chartRender && (
                <div style={{ position: 'relative', height: 80, marginBottom: 12, borderRadius: 8, overflow: 'hidden' }}>
                    <svg viewBox={`0 0 ${chartRender.chartWidth} ${chartRender.chartHeight}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25"/>
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                            </linearGradient>
                        </defs>
                        <polygon points={chartRender.fillPoints} fill="url(#chartGradient)" />
                        <polyline points={chartRender.points} fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                        {/* 数据点圆点 */}
                        {rows.map((r, i) => {
                            const x = (i / (rows.length - 1)) * chartRender.chartWidth;
                            const y = chartRender.chartHeight - ((r.total - chartRender.yMin) / chartRender.yRange) * chartRender.chartHeight;
                            return <circle key={r.id} cx={x} cy={y} r="3.5" fill="#10b981" stroke="#fff" strokeWidth="1.5" />;
                        })}
                        {/* 悬停竖线：用数据点的精确 x 坐标，与圆点完全对齐 */}
                        {hoverChartIdx != null && (() => {
                            const hx = (hoverChartIdx / (rows.length - 1)) * chartRender.chartWidth;
                            return <line x1={hx} y1="0" x2={hx} y2={chartRender.chartHeight} stroke="rgba(16,185,129,0.5)" strokeWidth="1" strokeDasharray="4 4" />;
                        })()}
                    </svg>

                    {/* 透明 hit area（只负责检测鼠标落在哪个分区），视觉线由 SVG 绘制 */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                        {rows.map((r, i) => (
                            <div 
                                key={r.id} 
                                style={{ flex: 1, cursor: 'crosshair' }}
                                onMouseEnter={() => setHoverChartIdx(i)}
                                onMouseLeave={() => setHoverChartIdx(null)}
                            />
                        ))}
                    </div>
                    {/* Tooltip：边缘自适应，避免被 overflow:hidden 裁切 */}
                    {hoverChartIdx != null && (() => {
                        const ratio = hoverChartIdx / (rows.length - 1);
                        const lastIdx = rows.length - 1;
                        let transform = 'translateX(-50%)'; // 中间：居中
                        if (hoverChartIdx <= 1) transform = 'translateX(0)';           // 最左：右展开
                        else if (hoverChartIdx >= lastIdx - 1) transform = 'translateX(-100%)'; // 最右：左展开
                        return (
                            <div style={{
                                position: 'absolute', bottom: '60%', left: `${ratio * 100}%`, transform,
                                background: '#1e293b', color: '#fff', padding: '4px 8px', borderRadius: 4,
                                fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                {fmtDate(rows[hoverChartIdx].date)} : {fmt(rows[hoverChartIdx].total)}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* 表格区 */}
            <div style={{ position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                
                {/* 边缘呼吸阴影 */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 12, background: 'linear-gradient(to right, rgba(0,0,0,0.06), transparent)', opacity: showLeftShadow ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 20 }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 12, background: 'linear-gradient(to left, rgba(0,0,0,0.06), transparent)', opacity: showRightShadow ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 20 }} />

                <div 
                    className="assets-table-scroll"
                    ref={tableContainerRef}
                    onScroll={handleScroll}
                    style={{ width: '100%', overflowX: 'auto', paddingBottom: 2 }}
                >
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 13, tableLayout: 'auto' }}>
                        <thead>
                            <tr>
                                <th style={{ ...TH_STYLE, color:'#10b981', minWidth: 90 }}>Σ 总合计</th>
                                <th style={{...TH_STYLE, width: isEditMode ? 140 : 110 }}>日期</th>
                                
                                {accounts.map((acc, idx) => (
                                    <th key={acc.id} style={{ ...TH_STYLE, minWidth: 110 }}>
                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:2 }}>
                                            {isEditMode && idx > 0 && <button onClick={() => handleMoveAccount(idx, -1)} style={ICON_BTN}>◀</button>}
                                            <span style={{ margin: '0 4px', whiteSpace: 'nowrap' }}>{acc.name}</span>
                                            {isEditMode && <button onClick={() => handleDeleteAccount(acc.id)} style={{...ICON_BTN, color: '#ef4444'}}>×</button>}
                                            {isEditMode && idx < accounts.length - 1 && <button onClick={() => handleMoveAccount(idx, 1)} style={ICON_BTN}>▶</button>}
                                        </div>
                                    </th>
                                ))}
                                <th style={{ ...TH_STYLE, minWidth: 100 }}>资产变动</th>
                            </tr>
                        </thead>

                        <tbody>
                            {displayRows.map((row, idx) => {
                                const isLatestRow = idx === 0 && !isEditMode;
                                const rowBg = isLatestRow ? '#f0fdf4' : '#fff';
                                const rowBorder = isLatestRow ? '2px solid #bbf7d0' : '1px solid #f1f5f9';
                                const textColor = isLatestRow ? '#166534' : '#475569';
                                const fw = isLatestRow ? 'bold' : 'normal';

                                return (
                                    <tr 
                                        key={row.id} 
                                        style={{ background: rowBg, borderBottom: rowBorder, transition:'background 0.1s' }} 
                                        onMouseEnter={e => { if(!isLatestRow) e.currentTarget.style.background = '#f8fafc'; }} 
                                        onMouseLeave={e => { if(!isLatestRow) e.currentTarget.style.background = '#fff'; }}
                                    >
                                        <td style={{ ...TD_STYLE, fontWeight:'bold', background: isLatestRow ? 'transparent' : '#fafafa', color: isLatestRow ? '#166534' : '#0f172a' }}>
                                            {fmt(row.total)}
                                        </td>

                                        <td style={{ ...TD_STYLE, whiteSpace:'nowrap', color: textColor, fontWeight: fw }}>
                                            {isEditMode ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                    <button onClick={() => handleDeleteSnapshot(row.id)} style={{...ICON_BTN, color: '#ef4444', fontSize: 16}} title="删除快照行">×</button>
                                                    <input 
                                                        type="date" value={row.date} 
                                                        onChange={(e) => handleChangeSnapshotDate(row.id, e.target.value)}
                                                        style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 12, outline: 'none' }}
                                                    />
                                                </div>
                                            ) : fmtDate(row.date)}
                                        </td>

                                        {accounts.map(acc => {
                                            const isEditing = editCell?.snapId === row.id && editCell?.accId === acc.id;
                                            const val = row.balances?.[acc.id];
                                            return (
                                                <td 
                                                    key={acc.id} 
                                                    onClick={() => { if (!isEditing && !isEditMode) startEdit(row.id, acc.id, val); }}
                                                    style={{ ...TD_STYLE, cursor: isEditMode ? 'not-allowed' : 'text', position: 'relative' }}
                                                >
                                                    <div style={{ opacity: isEditing ? 0 : (isEditMode ? 0.5 : 1), color: val ? textColor : '#cbd5e1', fontWeight: fw }}>
                                                        {val ? fmt(val) : '—'}
                                                    </div>

                                                    {isEditing && !isEditMode && (
                                                        <input
                                                            ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                                                            onBlur={handleCellBlur} onKeyDown={handleCellKey}
                                                            className="edit-naked-input"
                                                            style={{ 
                                                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                                                margin: 0, textAlign: 'center',
                                                                color: '#0f172a', zIndex: 10, fontWeight: 'bold',
                                                                background: 'transparent',
                                                            }}
                                                        />
                                                    )}
                                                </td>
                                            );
                                        })}
                                        
                                        <td style={{ ...TD_STYLE }}>
                                            {row.actualDiff != null ? (
                                                <div style={{ opacity: isEditMode ? 0.5 : 1 }}>
                                                    <div style={{ fontWeight:'bold', color: row.actualDiff >= 0 ? '#10b981' : '#ef4444' }}>{fmtDiff(row.actualDiff)}</div>
                                                    {row.txNet != null && <div style={{ fontSize:11, color:'#94a3b8' }}>账单 {fmtDiff(row.txNet)}</div>}
                                                </div>
                                            ) : <span style={{ color:'#e2e8f0' }}>—</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});

export default Assets;

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

const ICON_BTN = {
    background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
    fontSize: 12, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
};
//