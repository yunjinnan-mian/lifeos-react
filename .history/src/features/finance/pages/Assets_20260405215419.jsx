// ============================================================
// Finance Pro — Assets 资产快照
// 多账户 · 手动快照 · Firebase 持久化 · 差额对比账单净额
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { useFinance } from '../index';

// ── Firebase 集合/文档引用 ─────────────────────────────────
const ACCOUNTS_REF  = doc(db, 'config', 'assets_accounts');
const SNAPSHOTS_COL = 'assets_snapshots';

// ── Firebase 数据层 ───────────────────────────────────────
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

// ── 数字格式化 ────────────────────────────────────────────
const fmt     = (n) => n == null ? '—' : Math.round(n).toLocaleString('zh-CN');
const fmtDiff = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n);

// ── 日期显示 ──────────────────────────────────────────────
function fmtDate(d) {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${parseInt(m)}月${parseInt(day)}日`;
}

// ════════════════════════════════════════════════════════════
export default function Assets() {
    const { data: financeData } = useFinance();

    const [accounts,  setAccounts]  = useState([]);  // [{id, name, sort}]
    const [snapshots, setSnapshots] = useState([]);  // [{id, date, balances:{accId:number}}]
    const [loaded,    setLoaded]    = useState(false);
    const [error,     setError]     = useState('');

    // 行内编辑
    const [editCell, setEditCell] = useState(null);  // {snapId, accId} | null
    const [editVal,  setEditVal]  = useState('');
    const inputRef = useRef(null);

    // 添加账户表单
    const [showAddAcc, setShowAddAcc] = useState(false);
    const [newAccName, setNewAccName] = useState('');

    // 添加快照表单
    const [showAddDate, setShowAddDate] = useState(false);
    const [newDate,     setNewDate]     = useState('');

    // ── 初始加载 ──────────────────────────────────────────
    useEffect(() => {
        Promise.all([fetchAccounts(), fetchSnapshots()])
            .then(([accs, snaps]) => {
                setAccounts(accs);
                setSnapshots(snaps);
                setLoaded(true);
            })
            .catch(() => {
                setError('加载失败，请刷新重试');
                setLoaded(true);
            });
    }, []);

    // 编辑开始后聚焦输入框
    useEffect(() => {
        if (editCell) inputRef.current?.focus();
    }, [editCell]);

    // ── 按日期升序排列的快照 ──────────────────────────────
    const sorted = useMemo(
        () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
        [snapshots]
    );

    // ── 每行附加合计 + 两类差额 ───────────────────────────
    // actualDiff：本次合计 - 上次合计（资产实际变动）
    // txNet：账单数据中该日期区间的 收入 - 支出
    const rows = useMemo(() => {
        return sorted.map((snap, idx) => {
            const total = accounts.reduce((s, a) => s + (snap.balances?.[a.id] ?? 0), 0);
            let actualDiff = null;
            let txNet      = null;

            if (idx > 0) {
                const prev      = sorted[idx - 1];
                const prevTotal = accounts.reduce((s, a) => s + (prev.balances?.[a.id] ?? 0), 0);
                actualDiff = total - prevTotal;

                // 取 (prev.date, snap.date] 区间的账单，排除平账 / 转账 / 调账
                txNet = financeData.txs
                    .filter(t =>
                        t.date > prev.date &&
                        t.date <= snap.date &&
                        t.type !== 'transfer' &&
                        t.type !== 'adjust' &&
                        !t.cat2?.includes('平账') &&
                        !t.cat1?.includes('平账')
                    )
                    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
            }

            return { ...snap, total, actualDiff, txNet };
        });
    }, [sorted, accounts, financeData.txs]);

    // 最新快照（用于顶部汇总行）
    const latestSnap  = sorted[sorted.length - 1];
    const grandTotal  = accounts.reduce((s, a) => s + (latestSnap?.balances?.[a.id] ?? 0), 0);

    // 表格展示：最新在上
    const displayRows = useMemo(() => [...rows].reverse(), [rows]);

    // ── 添加账户 ──────────────────────────────────────────
    const handleAddAccount = useCallback(async () => {
        const name = newAccName.trim();
        if (!name) return;
        const acc  = { id: `acc_${Date.now()}`, name, sort: accounts.length };
        const next = [...accounts, acc];
        setAccounts(next);
        setNewAccName('');
        setShowAddAcc(false);
        try { await persistAccounts(next); }
        catch { setError('账户保存失败，请重试'); }
    }, [accounts, newAccName]);

    // ── 删除账户 ──────────────────────────────────────────
    const handleDeleteAccount = useCallback(async (accId) => {
        if (!window.confirm('确认删除该账户？此操作不会删除快照记录，但该账户的余额数据将不再显示。')) return;
        const next = accounts.filter(a => a.id !== accId);
        setAccounts(next);
        try { await persistAccounts(next); }
        catch { setError('账户删除失败'); }
    }, [accounts]);

    // ── 添加快照 ──────────────────────────────────────────
    const handleAddSnapshot = useCallback(async () => {
        if (!newDate) return;
        if (snapshots.some(s => s.date === newDate)) {
            setError('该日期已存在快照');
            return;
        }
        const snap = { id: `snap_${Date.now()}`, date: newDate, balances: {} };
        const next = [...snapshots, snap];
        setSnapshots(next);
        setNewDate('');
        setShowAddDate(false);
        try { await persistSnapshot(snap); }
        catch { setError('快照保存失败'); }
    }, [snapshots, newDate]);

    // ── 删除快照 ──────────────────────────────────────────
    const handleDeleteSnapshot = useCallback(async (snapId) => {
        const next = snapshots.filter(s => s.id !== snapId);
        setSnapshots(next);
        try { await removeSnapshot(snapId); }
        catch { setError('快照删除失败'); }
    }, [snapshots]);

    // ── 开始编辑单元格 ────────────────────────────────────
    const startEdit = useCallback((snapId, accId, currentVal) => {
        setEditCell({ snapId, accId });
        // 0 值显示为空，方便用户直接输入
        setEditVal(currentVal ? String(currentVal) : '');
    }, []);

    // ── 提交编辑 ──────────────────────────────────────────
    const commitEdit = useCallback(async () => {
        if (!editCell) return;
        const { snapId, accId } = editCell;
        const num = parseFloat(editVal.replace(/,/g, ''));
        const val = isNaN(num) ? 0 : num;

        const next = snapshots.map(s =>
            s.id !== snapId ? s : { ...s, balances: { ...s.balances, [accId]: val } }
        );
        setSnapshots(next);
        setEditCell(null);

        const updated = next.find(s => s.id === snapId);
        try { await persistSnapshot(updated); }
        catch { setError('保存失败，请重试'); }
    }, [editCell, editVal, snapshots]);

    const handleCellKey = (e) => {
        if (e.key === 'Enter')  commitEdit();
        if (e.key === 'Escape') setEditCell(null);
    };

    // ════════════════════════════════════════════════════════
    // Render
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
                    <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#E53935', fontSize:16, lineHeight:1 }}>×</button>
                </div>
            )}

            {/* 顶部操作栏 */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--c-text, #2d3748)' }}>💰 资产快照</h2>
                <div style={{ flex:1 }} />
                <button
                    className="btn btn-outline"
                    style={{ fontSize:13 }}
                    onClick={() => { setShowAddAcc(v => !v); setShowAddDate(false); }}
                >
                    + 添加账户
                </button>
                <button
                    className="btn btn-primary"
                    style={{ fontSize:13 }}
                    onClick={() => { setShowAddDate(v => !v); setShowAddAcc(false); }}
                >
                    + 新增快照
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

            {/* 添加快照日期表单 */}
            {showAddDate && (
                <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center', background:'var(--c-card, #fff)', padding:'12px 16px', borderRadius:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                    <span style={{ fontSize:13, color:'#718096', whiteSpace:'nowrap' }}>快照日期</span>
                    <input
                        type="date"
                        className="form-control"
                        value={newDate}
                        onChange={e => setNewDate(e.target.value)}
                        style={{ width:180 }}
                        autoFocus
                    />
                    <button className="btn btn-primary" onClick={handleAddSnapshot}>确认</button>
                    <button className="btn btn-outline" onClick={() => { setShowAddDate(false); setNewDate(''); }}>取消</button>
                </div>
            )}

            {/* 空态：无账户 */}
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
                                {/* 账户名称行 */}
                                <tr style={{ background:'var(--c-bg, #f7f8fc)', borderBottom:'2px solid #EDF2F7' }}>
                                    <th style={TH}>日期</th>
                                    <th style={{ ...TH, color:'var(--c-income, #4caf50)' }}>Σ 合计</th>
                                    {accounts.map(acc => (
                                        <th key={acc.id} style={{ ...TH, minWidth:110 }}>
                                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                                                <span>{acc.name}</span>
                                                <button
                                                    onClick={() => handleDeleteAccount(acc.id)}
                                                    title="删除账户"
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:'#CBD5E0', fontSize:13, lineHeight:1, padding:'0 1px' }}
                                                >×</button>
                                            </div>
                                        </th>
                                    ))}
                                    {/* 差额列说明 */}
                                    <th style={{ ...TH, minWidth:130, color:'#A0AEC0', fontSize:11 }}>
                                        <div>资产变动</div>
                                        <div style={{ fontWeight:400, color:'#CBD5E0' }}>账单净额</div>
                                    </th>
                                </tr>

                                {/* 当前余额汇总行（取最新快照） */}
                                {latestSnap && (
                                    <tr style={{ background:'#EBF8F0', borderBottom:'1px solid #C6F6D5' }}>
                                        <td style={{ ...TD, fontWeight:600, color:'#38A169', whiteSpace:'nowrap' }}>当前余额</td>
                                        <td style={{ ...TD, textAlign:'right', fontWeight:700, color:'#38A169', fontSize:15 }}>
                                            {fmt(grandTotal)}
                                        </td>
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
                                {/* 空态：有账户但无快照 */}
                                {displayRows.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={accounts.length + 3}
                                            style={{ ...TD, textAlign:'center', color:'#aaa', padding:'40px 0' }}
                                        >
                                            暂无快照记录，点击「新增快照」填写各账户当时余额
                                        </td>
                                    </tr>
                                )}

                                {displayRows.map(row => (
                                    <tr
                                        key={row.id}
                                        style={{ borderBottom:'1px solid #F0F0F0', transition:'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg, #f7f8fc)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                    >
                                        {/* 日期列 */}
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

                                        {/* 合计列 */}
                                        <td style={{ ...TD, textAlign:'right', fontWeight:700, fontSize:14 }}>
                                            {fmt(row.total)}
                                        </td>

                                        {/* 各账户余额列（可点击编辑） */}
                                        {accounts.map(acc => {
                                            const isEditing = editCell?.snapId === row.id && editCell?.accId === acc.id;
                                            const val = row.balances?.[acc.id];
                                            return (
                                                <td
                                                    key={acc.id}
                                                    style={{ ...TD, textAlign:'right', cursor:'pointer', padding:'4px 10px' }}
                                                    onClick={() => !isEditing && startEdit(row.id, acc.id, val)}
                                                    title="点击编辑"
                                                >
                                                    {isEditing ? (
                                                        <input
                                                            ref={inputRef}
                                                            value={editVal}
                                                            onChange={e => setEditVal(e.target.value)}
                                                            onBlur={commitEdit}
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
                                        <td style={{ ...TD, textAlign:'center', verticalAlign:'middle' }}>
                                            {row.actualDiff != null ? (
                                                <div>
                                                    {/* 资产实际变动 */}
                                                    <div style={{
                                                        fontWeight: 700, fontSize: 13,
                                                        color: row.actualDiff >= 0
                                                            ? 'var(--c-income, #4caf50)'
                                                            : 'var(--c-survive, #e53935)',
                                                    }}>
                                                        {fmtDiff(Math.round(row.actualDiff))}
                                                    </div>
                                                    {/* 账单净额（账面预期） */}
                                                    {row.txNet != null && (
                                                        <div style={{ fontSize:11, color:'#A0AEC0', marginTop:3 }}>
                                                            账单 {fmtDiff(Math.round(row.txNet))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color:'#E2E8F0', fontSize:13 }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 使用说明 */}
            <div style={{ marginTop:16, fontSize:12, color:'#A0AEC0', lineHeight:1.8 }}>
                💡 点击单元格可编辑余额 · 按 Enter 确认，Esc 取消 · 差额列：上方为资产实际变动，下方为同期账单净额（收入 - 支出）
            </div>
        </div>
    );
}

// ── 表头/单元格公用样式 ───────────────────────────────────
const TH = {
    padding:       '10px 12px',
    textAlign:     'center',
    fontSize:      12,
    fontWeight:    600,
    color:         'var(--c-text-muted, #718096)',
    whiteSpace:    'nowrap',
};

const TD = {
    padding:       '8px 12px',
    fontSize:      13,
    color:         'var(--c-text, #2d3748)',
    verticalAlign: 'middle',
};
