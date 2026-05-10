// ============================================================
// Finance Pro — Assets 资产快照 (Timeline 颠覆版)
// 时间线折叠 · 影子余额速录 · 自动对账诊断 · 引力线图表
// ============================================================

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { useFinance } from '../index';

// ── Firebase 数据层 ───────────────────────────────────────
const ACCOUNTS_REF  = doc(db, 'config', 'assets_accounts');
const SNAPSHOTS_COL = 'assets_snapshots';

async function fetchAccounts() {
    const snap = await getDoc(ACCOUNTS_REF);
    return snap.exists() ? (snap.data().accounts ?? []) :[];
}
async function persistAccounts(accounts) {
    await setDoc(ACCOUNTS_REF, { accounts, updatedAt: new Date().toISOString() });
}
async function fetchSnapshots() {
    const snap = await getDocs(collection(db, SNAPSHOTS_COL));
    const list =[];
    snap.forEach(d => list.push(d.data()));
    return list.sort((a, b) => a.date.localeCompare(b.date));
}
async function persistSnapshot(snapshot) {
    await setDoc(doc(db, SNAPSHOTS_COL, snapshot.id), { ...snapshot, updatedAt: new Date().toISOString() });
}
async function removeSnapshot(id) {
    await deleteDoc(doc(db, SNAPSHOTS_COL, id));
}

// ── 格式化工具 ────────────────────────────────────────────────
const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDiff = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n);
function fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${parseInt(m)}月${parseInt(day)}日`;
}
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════
const Assets = memo(function Assets() {
    const { data: financeData, showToast } = useFinance();

    const [accounts,  setAccounts]  = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [loaded,    setLoaded]    = useState(false);

    // 交互状态
    const [expandedId, setExpandedId] = useState(null); // 当前展开的快照卡片
    const [hoverChartIdx, setHoverChartIdx] = useState(null);
    const [drawerState, setDrawerState] = useState({ open: false, mode: 'new', snapId: null });

    // ── 初始加载 ──────────────────────────────────────────
    useEffect(() => {
        Promise.all([fetchAccounts(), fetchSnapshots()])
            .then(([accs, snaps]) => { setAccounts(accs); setSnapshots(snaps); setLoaded(true); })
            .catch(() => setLoaded(true));
    },[]);

    // ── 派生数据计算 (倒序排列，最新在最上) ────────────────
    const rows = useMemo(() => {
        const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
        return sorted.map((snap, idx) => {
            const total = accounts.reduce((s, a) => s + (snap.balances?.[a.id] ?? 0), 0);
            let actualDiff = null;
            let txNet      = null;
            let gap        = null; // 核心诊断：对账误差
            
            if (idx > 0) {
                const prev = sorted[idx - 1];
                const prevTotal = accounts.reduce((s, a) => s + (prev.balances?.[a.id] ?? 0), 0);
                actualDiff = total - prevTotal;
                
                // 计算期间流水净额 (排除平账)
                txNet = financeData.txs
                    .filter(t =>
                        t.date > prev.date && t.date <= snap.date &&
                        t.type !== 'transfer' && t.type !== 'adjust' &&
                        !t.cat2?.includes('平账') && !t.cat1?.includes('平账')
                    )
                    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
                
                gap = actualDiff - txNet;
            }
            return { ...snap, total, actualDiff, txNet, gap };
        }).reverse(); // 翻转，最新在上
    },[snapshots, accounts, financeData.txs]);

    const latestTotal = rows.length > 0 ? rows[0].total : 0;

    // ── 原生 SVG 平滑曲线图 & 引力线 ──────────────────────────────
    const chartRender = useMemo(() => {
        if (rows.length < 2) return null;
        const forwardRows = [...rows].reverse(); // 绘图需要正序(从左到右)
        
        const chartWidth = 1000;
        const chartHeight = 100;
        const totals = forwardRows.map(r => r.total);
        const minTotal = Math.min(...totals);
        const maxTotal = Math.max(...totals);
        
        // ✨ 计算引力线 (下一个 5万 的整数关口)
        const gravityTarget = Math.ceil(maxTotal / 50000) * 50000;
        const pad = (gravityTarget - minTotal) * 0.1 || maxTotal * 0.1;
        const yMin = minTotal - pad;
        const yMax = Math.max(maxTotal + pad, gravityTarget + pad * 0.5);
        const yRange = yMax - yMin;

        const pts = forwardRows.map((r, i) => ({
            x: (i / (forwardRows.length - 1)) * chartWidth,
            y: chartHeight - ((r.total - yMin) / yRange) * chartHeight,
        }));
        
        const gravityY = chartHeight - ((gravityTarget - yMin) / yRange) * chartHeight;

        let curvePath = '';
        if (pts.length === 2) {
            curvePath = `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
        } else {
            curvePath = `M ${pts[0].x},${pts[0].y}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                const tx0 = i === 0 ? p1.x - p0.x : (p1.x - pts[i - 1].x) / 2;
                const ty0 = i === 0 ? p1.y - p0.y : (p1.y - pts[i - 1].y) / 2;
                const tx1 = i === pts.length - 2 ? p1.x - p0.x : (pts[i + 2].x - p0.x) / 2;
                const ty1 = i === pts.length - 2 ? p1.y - p0.y : (pts[i + 2].y - p0.y) / 2;
                curvePath += ` C ${p0.x + tx0 / 3},${p0.y + ty0 / 3} ${p1.x - tx1 / 3},${p1.y - ty1 / 3} ${p1.x},${p1.y}`;
            }
        }
        const fillPath = curvePath + ` L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`;

        return { chartWidth, chartHeight, curvePath, fillPath, pts, gravityY, gravityTarget, forwardRows };
    }, [rows]);

    // ── 操作函数 ──────────────────────────────────────────
    const handleDelete = async (e, snapId) => {
        e.stopPropagation();
        if(!window.confirm('确定删除此快照？')) return;
        setSnapshots(prev => prev.filter(s => s.id !== snapId));
        if (expandedId === snapId) setExpandedId(null);
        await removeSnapshot(snapId);
        showToast('快照已删除');
    };

    const handleSaveSnapshot = async (newSnap) => {
        setSnapshots(prev => {
            const exists = prev.find(s => s.id === newSnap.id);
            if (exists) return prev.map(s => s.id === newSnap.id ? newSnap : s);
            return [...prev, newSnap];
        });
        setDrawerState({ open: false });
        await persistSnapshot(newSnap);
        showToast('资产快照已更新');
    };

    if (!loaded) return <div style={{ textAlign:'center', marginTop:50, color:'#999' }}>加载中…</div>;

    return (
        <div className="flex-1 h-full overflow-y-auto px-6 py-8 lg:px-12 bg-surface text-primary antialiased relative">
            
            {/* 顶栏：大数字 + 核心按钮 */}
            <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
                <div>
                    <div className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Total Net Worth</div>
                    <div className="flex items-baseline font-mono-num leading-none tracking-tighter text-primary">
                        <span className="text-3xl font-medium text-on-surface-variant mr-1 self-start mt-1">¥</span>
                        <span className="text-6xl lg:text-7xl font-bold">{fmt(latestTotal)}</span>
                    </div>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={() => setDrawerState({ open: true, mode: 'manage_acc' })}
                        className="px-4 py-2 rounded-xl border border-surface-variant text-sm font-semibold text-on-surface-variant hover:text-primary hover:bg-surface-variant/50 transition-colors"
                    >
                        管理账户
                    </button>
                    <button 
                        onClick={() => setDrawerState({ open: true, mode: 'new', snapId: null })}
                        className="px-5 py-2 rounded-xl bg-primary text-surface text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <i className="ri-camera-lens-fill text-lg"></i> 记录今日快照
                    </button>
                </div>
            </div>

            {/* 视觉革新：引力线折线图 */}
            {chartRender && (
                <div className="relative w-full h-[120px] mb-12 rounded-xl overflow-hidden bg-surface-bright border border-surface-variant">
                    <svg viewBox={`0 0 ${chartRender.chartWidth} ${chartRender.chartHeight}`} preserveAspectRatio="none" className="w-full h-full block">
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3"/>
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                            </linearGradient>
                        </defs>
                        {/* 引力线 */}
                        <line x1="0" y1={chartRender.gravityY} x2={chartRender.chartWidth} y2={chartRender.gravityY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 5" opacity="0.5" />
                        <text x="10" y={chartRender.gravityY - 5} fill="#94a3b8" fontSize="12" fontFamily="monospace" fontWeight="bold">TARGET: {chartRender.gravityTarget / 1000}k</text>

                        <path d={chartRender.fillPath} fill="url(#chartGradient)" />
                        <path d={chartRender.curvePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        
                        {hoverChartIdx != null && (
                            <line 
                                x1={chartRender.pts[hoverChartIdx].x} y1="0" 
                                x2={chartRender.pts[hoverChartIdx].x} y2={chartRender.chartHeight} 
                                stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" 
                            />
                        )}
                    </svg>

                    <div className="absolute inset-0 flex">
                        {chartRender.forwardRows.map((r, i) => (
                            <div key={r.id} className="flex-1 cursor-crosshair" onMouseEnter={() => setHoverChartIdx(i)} onMouseLeave={() => setHoverChartIdx(null)} />
                        ))}
                    </div>

                    {hoverChartIdx != null && (
                        <div 
                            className="absolute bottom-2 bg-inverse-surface text-surface px-3 py-1.5 rounded shadow-lg text-xs font-mono-num pointer-events-none z-10 transition-transform duration-75"
                            style={{ 
                                left: `${(hoverChartIdx / (chartRender.forwardRows.length - 1)) * 100}%`,
                                transform: hoverChartIdx > chartRender.forwardRows.length / 2 ? 'translateX(-100%)' : 'translateX(0)',
                                marginLeft: hoverChartIdx > chartRender.forwardRows.length / 2 ? '-10px' : '10px'
                            }}
                        >
                            <div className="font-bold text-white mb-0.5">{fmtDate(chartRender.forwardRows[hoverChartIdx].date)}</div>
                            <div className="text-secondary-fixed">¥ {fmt(chartRender.forwardRows[hoverChartIdx].total)}</div>
                        </div>
                    )}
                </div>
            )}

            {/* 时间线：可折叠卡片列表 */}
            <div className="max-w-4xl mx-auto space-y-4">
                {rows.map((row, idx) => {
                    const isExpanded = expandedId === row.id;
                    const isLatest = idx === 0;

                    // 诊断胶囊计算
                    let gapPill = null;
                    if (row.gap != null) {
                        const absGap = Math.abs(row.gap);
                        if (absGap < 50) {
                            gapPill = <span className="bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-bold">✅ 账平</span>;
                        } else if (row.gap > 0) {
                            gapPill = <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-[10px] font-bold">📈 溢出 {Math.round(absGap)}</span>;
                        } else {
                            gapPill = <span className="bg-error/10 text-error px-2 py-0.5 rounded text-[10px] font-bold">📉 漏账 {Math.round(absGap)}</span>;
                        }
                    }

                    return (
                        <div 
                            key={row.id} 
                            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-primary shadow-md' : 'border-surface-variant hover:border-outline-variant bg-surface-bright'}`}
                        >
                            {/* 卡片头部 (Summary) */}
                            <div 
                                className="flex flex-wrap items-center justify-between p-5 cursor-pointer select-none"
                                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                            >
                                <div className="flex items-center gap-6 min-w-[200px]">
                                    <div className="flex flex-col">
                                        <span className={`text-lg font-bold font-mono-num ${isLatest ? 'text-primary' : 'text-on-surface-variant'}`}>{fmtDate(row.date)}</span>
                                        <span className="text-[10px] text-outline mt-0.5">{row.date.slice(0,4)}年</span>
                                    </div>
                                    <div className="w-px h-8 bg-surface-variant"></div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-outline mb-0.5">总资产</span>
                                        <span className={`text-xl font-bold font-mono-num ${isLatest ? 'text-secondary' : 'text-primary'}`}>{fmt(row.total)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-8 mt-2 sm:mt-0">
                                    {row.actualDiff != null && (
                                        <div className="flex items-center gap-4 text-sm font-mono-num">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-outline uppercase">实际变动</span>
                                                <span className={`font-bold ${row.actualDiff >= 0 ? 'text-secondary' : 'text-error'}`}>{fmtDiff(row.actualDiff)}</span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-outline uppercase">账单净额</span>
                                                <span className="font-medium text-on-surface-variant">{fmtDiff(row.txNet)}</span>
                                            </div>
                                            {gapPill && <div className="ml-2">{gapPill}</div>}
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setDrawerState({ open: true, mode: 'edit', snapId: row.id }); }}
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-variant hover:text-primary transition-colors"
                                        >
                                            <i className="ri-edit-line text-lg"></i>
                                        </button>
                                        <button 
                                            onClick={(e) => handleDelete(e, row.id)}
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-error/10 hover:text-error transition-colors"
                                        >
                                            <i className="ri-delete-bin-line text-lg"></i>
                                        </button>
                                        <i className={`ri-arrow-down-s-line text-xl text-outline transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}></i>
                                    </div>
                                </div>
                            </div>

                            {/* 展开的账户明细 (Details Grid) */}
                            <div 
                                className="transition-all duration-300 ease-in-out bg-surface"
                                style={{ maxHeight: isExpanded ? '1000px' : '0', opacity: isExpanded ? 1 : 0 }}
                            >
                                <div className="p-6 border-t border-surface-variant border-dashed">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-6 gap-x-4">
                                        {accounts.map(acc => {
                                            const val = row.balances?.[acc.id];
                                            if (!val) return null; // 极简：展开只显示有钱的账户
                                            return (
                                                <div key={acc.id} className="flex flex-col">
                                                    <span className="text-xs text-outline mb-1 font-medium">{acc.name}</span>
                                                    <span className="text-base font-bold font-mono-num text-primary">{fmt(val)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 右侧滑出抽屉：记录/编辑快照表单 */}
            <SnapshotDrawer 
                state={drawerState} 
                onClose={() => setDrawerState({ open: false })}
                accounts={accounts}
                snapshots={rows} // 传入倒序的 rows
                onSave={handleSaveSnapshot}
                setAccounts={setAccounts}
            />

        </div>
    );
});

export default Assets;

// ── 垂直抽屉组件 (Shadow Balance 魔法所在地) ─────────────────────────
function SnapshotDrawer({ state, onClose, accounts, snapshots, onSave, setAccounts }) {
    const { open, mode, snapId } = state;
    const [formDate, setFormDate] = useState('');
    const [balances, setBalances] = useState({});
    
    // 账户管理状态
    const [newAccName, setNewAccName] = useState('');

    useEffect(() => {
        if (!open) return;
        if (mode === 'manage_acc') return;

        if (mode === 'edit' && snapId) {
            const target = snapshots.find(s => s.id === snapId);
            setFormDate(target.date);
            setBalances({ ...target.balances });
        } else if (mode === 'new') {
            setFormDate(getTodayDate());
            // 影子余额：拉取最近一次快照的值作为初始表单值
            const latest = snapshots.length > 0 ? snapshots[0].balances : {};
            setBalances({ ...latest });
        }
    },[open, mode, snapId, snapshots]);

    // 抽屉滑出样式控制
    const drawerStyle = {
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
    };

    const handleSave = () => {
        if (mode === 'manage_acc') { onClose(); return; }
        if (!formDate) return;
        
        // 提取输入的值，清空无效的 0
        const finalBalances = {};
        for (const acc of accounts) {
            const val = parseFloat(balances[acc.id]);
            if (!isNaN(val) && val !== 0) finalBalances[acc.id] = val;
        }

        onSave({
            id: mode === 'edit' ? snapId : `snap_${Date.now()}`,
            date: formDate,
            balances: finalBalances
        });
    };

    const handleAddAccount = async () => {
        if (!newAccName.trim()) return;
        const next =[...accounts, { id: `acc_${Date.now()}`, name: newAccName.trim() }];
        setAccounts(next);
        setNewAccName('');
        await persistAccounts(next);
    };

    return (
        <div 
            className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-surface-bright shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-50 flex flex-col border-l border-surface-variant"
            style={drawerStyle}
        >
            <div className="px-6 py-6 border-b border-surface-variant flex items-center justify-between bg-surface/50 backdrop-blur-md">
                <h3 className="text-lg font-bold text-primary">
                    {mode === 'manage_acc' ? '🏦 管理资产账户' : mode === 'new' ? '📸 记录今日快照' : '✏️ 修改快照数据'}
                </h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center hover:bg-outline-variant transition-colors">
                    <i className="ri-close-line text-lg"></i>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {mode === 'manage_acc' ? (
                    <>
                        <div className="flex gap-2">
                            <input 
                                type="text" placeholder="输入新账户名称" value={newAccName} onChange={e => setNewAccName(e.target.value)}
                                className="flex-1 bg-surface border border-surface-variant rounded-xl px-4 py-3 text-sm focus:border-primary outline-none"
                                onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
                            />
                            <button onClick={handleAddAccount} className="px-4 bg-primary text-surface rounded-xl font-bold">添加</button>
                        </div>
                        <div className="space-y-2">
                            {accounts.map(acc => (
                                <div key={acc.id} className="flex justify-between items-center px-4 py-3 bg-surface border border-surface-variant rounded-xl">
                                    <span className="font-medium text-primary">{acc.name}</span>
                                    {/* 这里可以加删除逻辑，但为了极简先略去，因为删账户会影响历史数据，建议只隐藏 */}
                                    <span className="text-[10px] text-outline">已建立档案</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        {/* 日期选择 */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-outline uppercase tracking-wider">快照日期 Snapshot Date</label>
                            <input 
                                type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                                className="bg-surface border border-surface-variant rounded-xl px-4 py-3 text-sm font-mono-num font-bold text-primary focus:border-primary outline-none"
                            />
                        </div>

                        <div className="w-full h-px bg-surface-variant my-2"></div>

                        {/* 垂直录入表单：带影子余额 */}
                        <div className="space-y-4">
                            {accounts.map((acc, index) => {
                                const val = balances[acc.id] ?? '';
                                return (
                                    <div key={acc.id} className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-on-surface-variant pl-1">{acc.name}</label>
                                        <div className="relative flex items-center">
                                            <span className="absolute left-4 text-outline font-mono-num text-sm">¥</span>
                                            <input 
                                                type="number"
                                                value={val}
                                                onChange={e => setBalances(p => ({ ...p,[acc.id]: e.target.value }))}
                                                className="w-full bg-surface border border-surface-variant rounded-xl pl-8 pr-4 py-3 text-sm font-mono-num font-bold text-primary focus:border-primary outline-none transition-colors"
                                                placeholder="0.00"
                                                autoFocus={index === 0} // 自动聚焦第一个
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            <div className="p-6 border-t border-surface-variant bg-surface">
                <button 
                    onClick={handleSave}
                    className="w-full py-3.5 bg-primary text-surface rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-sm"
                >
                    {mode === 'manage_acc' ? '完成' : '保存入账'}
                </button>
            </div>
        </div>
    );
}