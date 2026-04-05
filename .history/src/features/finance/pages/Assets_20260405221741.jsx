// ============================================================
// Finance Pro — Assets 资产快照
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
const fmt     = (n) => n == null ? '—' : Math.round(n).toLocaleString('zh-CN');
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

    // 行内编辑：{snapId, accId} | null
    const [editCell, setEditCell] = useState(null);
    const [editVal,  setEditVal]  = useState('');
    const inputRef      = useRef(null);
    // 方向键导航时阻断 onBlur 重复提交
    const navigatingRef = useRef(false);

    // 添加账户
    const [showAddAcc, setShowAddAcc] = useState(false);
    const [newAccName, setNewAccName] = useState('');

    // 行内添加快照（表格末行）
    const [pendingDate, setPendingDate] = useState('');

    // ── 初始加载 ──────────────────────────────────────────
    useEffect(() => {
        Promise.all([fetchAccounts(), fetchSnapshots()])
            .then(([accs, snaps]) => { setAccounts(accs); setSnapshots(snaps); setLoaded(true); })
            .catch(() => { setError('加载失败，请刷新重试'); setLoaded(true); });
    }, []);

    // 编辑切换后聚焦，并重置导航锁
    useEffect(() => {
        if (editCell) {
            inputRef.current?.focus();
            navigatingRef.current = false;
        }
    }, [editCell]);

    // ── 派生数据 ──────────────────────────────────────────
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
        if (!name) return;
        const acc  = { id: `acc_${Date.now()}`, name, sort: accounts.length };
        const next = [...accounts, acc];
        setAccounts(next);
        setNewAccName('');
        setShowAddAcc(false);
        try { await persistAccounts(next); }
        catch { setError('账户保存失败'); }
    }, [accounts, newAccName]);

    const handleDeleteAccount = useCallback(async (accId) => {
        if (!window.confirm('确认删除该账户？该账户在所有快照中的余额将不再显示。')) return;
        const next = accounts.filter(a => a.id !== accId);
        setAccounts(next);
        try { await persistAccounts(next); }
        catch { setError('账户删除失败'); }
    }, [accounts]);

    // ── 快照操作 ──────────────────────────────────────────
    const handleAddSnapshot = useCallback(async () => {
        const date = pendingDate.trim();
        if (!date) return;
        if (snapshots.some(s => s.date === date)) { setError('该日期已存在快照'); return; }
        const snap = { id: `snap_${Date.now()}`, date, balances: {} };
        setSnapshots(prev => [...prev, snap]);
        setPendingDate('');
        try { await persistSnapshot(snap); }
        catch { setError('快照保存失败'); }
    }, [snapshots, pendingDate]);

    const handleDeleteSnapshot = useCallback(async (snapId) => {
        setSnapshots(prev => prev.filter(s => s.id !== snapId));
        try { await removeSnapshot(snapId); }
        catch { setError('快照删除失败'); }
    }, []);

    // ── 单元格编辑 ────────────────────────────────────────
    const startEdit = useCallback((snapId, accId, currentVal) => {
        setEditCell({ snapId, accId });
        setEditVal(currentVal != null && currentVal !== 0 ? String(currentVal) : '');
    }, []);

    // navToAccId: 导航到的下一个账户 id，null 表示退出编辑
    const commitEdit = useCallback(async (navToAccId = null) => {
        if (!editCell) return;
        const { snapId, accId } = editCell;
        const num = parseFloat(editVal.replace(/,/g, ''));
        const val = isNaN(num) ? 0 : num;

        // 先从当前 snapshots 构建 updated，再 setState
        let updated;
        setSnapshots(prev => {
            const next = prev.map(s => {
                if (s.id !== snapId) return s;
                updated = { ...s, balances: { ...s.balances, [accId]: val } };
                return updated;
            });
            return next;
        });

        // 导航到下一格
        if (navToAccId !== null) {
            // 从当前 snapshots 读取目标格的值（注意此时 setSnapshots 还未 flush）
            const snap    = snapshots.find(s => s.id === snapId);
            const nextVal = snap?.balances?.[navToAccId];
            setEditCell({ snapId, accId: navToAccId });
            setEditVal(nextVal != null && nextVal !== 0 ? String(nextVal) : '');
        } else {
            setEditCell(null);
        }

        // 异步持久化，不阻塞 UI
        // updated 在 setSnapshots 回调里赋值，但因为 JS 同步执行，此处已能读到
        if (updated) {
            persistSnapshot(updated).catch(() => setError('保存失败，请重试'));
        }
    }, [editCell, editVal, snapshots]);

    const handleCellKey = useCallback((e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (!editCell) return;
            const idx     = accounts.findIndex(a => a.id === editCell.accId);
            const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
            if (nextIdx < 0 || nextIdx >= accounts.length) return;
            // 设置导航锁，阻断即将触发的 onBlur 重复提交
            navigatingRef.current = true;
            commitEdit(accounts[nextIdx].id);
        } else if (e.key === 'Enter') {
            commitEdit(null);
        } else if (e.key === 'Escape') {
            setEditCell(null);
        }
    }, [editCell, accounts, commitEdit]);

    const handleCellBlur = useCallback(() => {
        if (navigatingRef.current) return; // 方向键导航，忽略
        commitEdit(null);
    }, [commitEdit]);

    // ════════════════════════════════════════════════════════
    if (!loaded) {
        return (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'#999' }}>
                加载中…
            </div>
        );
    }

    return (
        <div style={{ paddingBottom: 40 }}>

            {/* 错误提示 */}
            {error && (
                <div style={{ background:'#FFF5F5', color:'#E53935', padding:'8px 14px', borderRadius:8, marginBottom:16, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ flex:1 }}>{error}</span>
                    <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#E53935', fontSize:16 }}>×</button>
                </div>
            )}

            {/* 顶部操作栏 */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--c-text, #2d3748)' }}>💰 资产快照</h2>
                <div style={{ flex:1 }} />
                <button className="btn btn-outline" style={{ fontSize:13 }} onClick={() => setShowAddAcc(v => !v)}>
                    + 添加账户
                </button>
            </div>

            {/* 添加账户表单 */}
            {showAddAcc && (
                <div style={{ display:'flex', gap:8, marginBottom:16, background:'var(--c-card, #fff)', padding:'12px 16px', borderRadius:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                    <input
                        className="form-control"
                        placeholder="账户名称，如：招商银行、支付宝、现金"
                        value={newAccName}
                        onChange={e => setNewAccName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') { setShowAddAcc(false); setNewAccName(''); } }}
                        style={{ flex:1 }}
                        autoFocus
                    />
                    <button className="btn btn-primary" onClick={handleAddAccount}>确认</button>
                    <button className="btn btn-outline" onClick={() => { setShowAddAcc(false); setNewAccName(''); }}>取消</button>
                </div>
            )}

            {/* 无账户空态 */}
            {accounts.length === 0 && (
                <div style={{ textAlign:'center', padding:'60px 20px', color:'#999' }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🏦</div>
                    <div style={{ fontSize:15, marginBottom:6 }}>还没有账户</div>
                    <div style={{ fontSize:13 }}>点击「添加账户」开始追踪你的资产</div>
                </div>
            )}

            {/* 资产表格 */}
            {accounts.length > 0 && (
                <div className="card" style={{ marginBottom:0, padding:0, overflow:'hidden' }}>
                    <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                            <thead>
                                {/* 列标题：合计 在 日期 左边 */}
                                <tr style={{ background:'var(--c-bg, #f7f8fc)', borderBottom:'2px solid #EDF2F7' }}>
                                    <th style={{ ...TH, color:'var(--c-income, #4caf50)', minWidth:90 }}>Σ 合计</th>
                                    <th style={{ ...TH, minWidth:110 }}>日期</th>
                                    {accounts.map(acc => (
                                        <th key={acc.id} style={{ ...TH, minWidth:110 }}>
                                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                                                {acc.name}
                                                <button
                                                    onClick={() => handleDeleteAccount(acc.id)}
                                                    title="删除账户"
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E0', fontSize:13, lineHeight:1, padding:'0 1px' }}
                                                >×</button>
                                            </div>
                                        </th>
                                    ))}
                                    <th style={{ ...TH, minWidth:120, color:'#A0AEC0', fontSize:11 }}>
                                        <div>资产变动</div>
                                        <div style={{ fontWeight:400, color:'#CBD5E0' }}>账单净额</div>
                                    </th>
                                </tr>

                                {/* 当前余额汇总行 */}
                                {latestSnap && (
                                    <tr style={{ background:'#EBF8F0', borderBottom:'1px solid #C6F6D5' }}>
                                        <td style={{ ...TD, textAlign:'right', fontWeight:700, color:'#38A169', fontSize:15 }}>
                                            {fmt(grandTotal)}
                                        </td>
                                        <td style={{ ...TD, fontWeight:600, color:'#38A169', whiteSpace:'nowrap' }}>当前余额</td>
                                        {accounts.map(acc => (
                                            <td key={acc.id} style={{ ...TD, textAlign:'right', color:'#38A169', fontWeight:600 }}>
                                                {fmt(latestSnap.balances?.[acc.id] ?? 0)}
                                            </td>
                                        ))}
                                        <td style={TD} />
                                    </tr>
                                )}
                            </thead>

                            <tbody>
                                {displayRows.map(row => (
                                    <tr
                                        key={row.id}
                                        style={{ borderBottom:'1px solid #F0F0F0', transition:'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg, #f7f8fc)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                    >
                                        {/* 合计（左） */}
                                        <td style={{ ...TD, textAlign:'right', fontWeight:700, fontSize:14 }}>
                                            {fmt(row.total)}
                                        </td>

                                        {/* 日期 */}
                                        <td style={{ ...TD, whiteSpace:'nowrap', fontWeight:600 }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                                <button
                                                    onClick={() => handleDeleteSnapshot(row.id)}
                                                    title="删除此快照"
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E0', fontSize:13, lineHeight:1, padding:'0 2px', flexShrink:0 }}
                                                >×</button>
                                                {fmtDate(row.date)}
                                            </div>
                                        </td>

                                        {/* 各账户余额（可编辑） */}
                                        {accounts.map(acc => {
                                            const isEditing = editCell?.snapId === row.id && editCell?.accId === acc.id;
                                            const val = row.balances?.[acc.id];
                                            return (
                                                <td
                                                    key={acc.id}
                                                    style={{ ...TD, textAlign:'right', cursor:'pointer', padding:'4px 10px' }}
                                                    onClick={() => { if (!isEditing) startEdit(row.id, acc.id, val); }}
                                                    title="点击编辑，← → 切换账户"
                                                >
                                                    {isEditing ? (
                                                        <input
                                                            ref={inputRef}
                                                            value={editVal}
                                                            onChange={e => setEditVal(e.target.value)}
                                                            onBlur={handleCellBlur}
                                                            onKeyDown={handleCellKey}
                                                            style={{
                                                                width:'100%', textAlign:'right',
                                                                border:'1.5px solid var(--c-primary, #5F27CD)',
                                                                borderRadius:4, padding:'2px 6px',
                                                                fontSize:13, outline:'none',
                                                                background:'var(--c-card, #fff)',
                                                            }}
                                                        />
                                                    ) : (
                                                        <span style={{ color: val ? 'var(--c-text, #2d3748)' : '#CBD5E0' }}>
                                                            {val ? fmt(val) : '—'}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}

                                        {/* 差额列 */}
                                        <td style={{ ...TD, textAlign:'center' }}>
                                            {row.actualDiff != null ? (
                                                <div>
                                                    <div style={{
                                                        fontWeight:700, fontSize:13,
                                                        color: row.actualDiff >= 0
                                                            ? 'var(--c-income, #4caf50)'
                                                            : 'var(--c-survive, #e53935)',
                                                    }}>
                                                        {fmtDiff(Math.round(row.actualDiff))}
                                                    </div>
                                                    {row.txNet != null && (
                                                        <div style={{ fontSize:11, color:'#A0AEC0', marginTop:3 }}>
                                                            账单 {fmtDiff(Math.round(row.txNet))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color:'#E2E8F0' }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}

                                {/* 行内添加快照行（始终可见） */}
                                <tr style={{ borderTop:'2px dashed #EDF2F7', background:'var(--c-bg, #f7f8fc)' }}>
                                    <td style={{ ...TD, color:'#CBD5E0', textAlign:'right' }}>—</td>
                                    <td style={{ ...TD, padding:'6px 10px' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                            <input
                                                type="date"
                                                value={pendingDate}
                                                onChange={e => setPendingDate(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleAddSnapshot(); if (e.key === 'Escape') setPendingDate(''); }}
                                                style={{
                                                    border:'1px solid #EDF2F7', borderRadius:6,
                                                    padding:'3px 6px', fontSize:12,
                                                    color:'var(--c-text, #2d3748)',
                                                    background:'var(--c-card, #fff)',
                                                    cursor:'pointer', outline:'none',
                                                }}
                                            />
                                            {pendingDate && (
                                                <button
                                                    onClick={handleAddSnapshot}
                                                    style={{
                                                        background:'var(--c-primary, #5F27CD)', color:'#fff',
                                                        border:'none', borderRadius:5, padding:'3px 8px',
                                                        fontSize:12, cursor:'pointer',
                                                    }}
                                                >✓</button>
                                            )}
                                        </div>
                                    </td>
                                    <td colSpan={accounts.length + 1} style={{ ...TD, color:'#A0AEC0', fontSize:12 }}>
                                        选择日期后按 Enter 或点击 ✓ 新增快照
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div style={{ marginTop:14, fontSize:12, color:'#A0AEC0' }}>
                💡 点击余额单元格编辑 · ← → 切换账户 · Enter 确认 · Esc 取消
            </div>
        </div>
    );
}

// ── 样式常量 ──────────────────────────────────────────────
const TH = {
    padding:    '10px 12px',
    textAlign:  'center',
    fontSize:   12,
    fontWeight: 600,
    color:      'var(--c-text-muted, #718096)',
    whiteSpace: 'nowrap',
};

const TD = {
    padding:       '8px 12px',
    fontSize:      13,
    color:         'var(--c-text, #2d3748)',
    verticalAlign: 'middle',
};