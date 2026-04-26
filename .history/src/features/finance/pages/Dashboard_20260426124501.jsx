// ============================================================
// Finance Pro — Dashboard 总览透视页
// ============================================================

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useFinance } from '../index';
import TimePills from '../components/TimePills';
import KpiHud from '../components/KpiHud';
import Heatmap from '../components/Heatmap';
import WordCloud from '../components/WordCloud';
import RankingList from '../components/RankingList';
import { getCatName, getColorMap } from '../utils/catMap';

// ── 派生时间状态的工具函数 ─────────────────────────────────

/** 从 data.txs 中找最新一条交易的月份 */
function getNewestMonth(txs) {
    if (!txs.length) return new Date().toISOString().slice(0, 7);
    const newest = txs.reduce((max, t) => (t.date && t.date > max ? t.date : max), '');
    return newest ? newest.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

/** 从 txs 提取所有有数据的年份列表（升序） */
function getYears(txs) {
    const set = new Set();
    txs.forEach(t => { if (t.date) set.add(t.date.slice(0, 4)); });
    if (set.size === 0) set.add(new Date().getFullYear().toString());
    return [...set].sort();
}

/** 从 txs 提取指定年份有数据的月份列表（升序） */
function getMonthsOfYear(txs, year) {
    const set = new Set();
    txs.forEach(t => { if (t.date?.startsWith(year)) set.add(t.date.slice(0, 7)); });
    return [...set].sort();
}

// ════════════════════════════════════════════════════════════

const Dashboard = memo(function Dashboard({ onJumpToCategory }) {
    const { data } = useFinance();

    // ── 时间导航状态 ──────────────────────────────────────
    const [activeMonth, setActiveMonth] = useState(() => getNewestMonth(data.txs));
    const [activeYear,  setActiveYear]  = useState(() => getNewestMonth(data.txs).slice(0, 4));
    const [matrixOpen,  setMatrixOpen]  = useState(true);

    // data 加载完成后，自动跳到最新月份
    useEffect(() => {
        if (data.txs.length > 0) {
            const newest = getNewestMonth(data.txs);
            setActiveMonth(newest);
            setActiveYear(newest.slice(0, 4));
        }
    }, [data.txs.length]); // eslint-disable-line

    // ── TimePills 数据 ────────────────────────────────────
    const years  = useMemo(() => getYears(data.txs), [data.txs]);
    const months = useMemo(() => getMonthsOfYear(data.txs, activeYear), [data.txs, activeYear]);

    const handleSelectYear = useCallback((y) => {
        setActiveYear(y);
        // 切年后把月份切到该年最新月
        const ym = getMonthsOfYear(data.txs, y);
        if (ym.length > 0) setActiveMonth(ym[ym.length - 1]);
    }, [data.txs]);

    const handleSelectMonth = useCallback((m) => {
        setActiveMonth(m);
        setActiveYear(m.slice(0, 4));
    }, []);

    // ── KPI 计算 ──────────────────────────────────────────
    const { inc, exp, bal, incCount, expCount, total } = useMemo(() => {
        let inc = 0, exp = 0, incCount = 0, expCount = 0;
        data.txs.forEach(t => {
            if (t.type === 'transfer' || t.type === 'adjust') return;
            if (t.cat2?.includes('平账') || t.cat1 === '平账') return;
            if (!t.date?.startsWith(activeMonth)) return;
            if (t.type === 'income') { inc += t.amount; incCount++; }
            else { exp += t.amount; expCount++; }
        });
        return { inc, exp, bal: inc - exp, incCount, expCount, total: inc + exp };
    }, [data.txs, activeMonth]);

    const totalAssets = useMemo(
        () => data.acc.reduce((s, a) => s + (a.bal || 0), 0),
        [data.acc]
    );

    const [y, m] = activeMonth.split('-');
    const periodLabel = `${y}年${m}月`;

    // ── KPI 状态文字 ──────────────────────────────────────
    const balColor  = bal >= 0 ? '#1DD1A1' : '#FF6B6B';
    const balStatus = bal > 0  ? `✅ ${periodLabel} 盈余 · 系统健康`
                    : bal < 0  ? `⚠️ ${periodLabel} 赤字 · 资源告急`
                    :            `— ${periodLabel} 收支持平`;

    return (
        <div>
            {/* 时间胶囊导航 */}
            <TimePills
                years={years}
                months={months}
                activeYear={activeYear}
                activeMonth={activeMonth}
                onSelectYear={handleSelectYear}
                onSelectMonth={handleSelectMonth}
            />

            {/* KPI Row */}
            <div className="kpi-row">
                <KpiHud
                    color="#1DD1A1"
                    icon="🏆"
                    eng="INCOME · 收益"
                    title="月度入账"
                    value={inc.toLocaleString()}
                    barPct={total > 0 ? (inc / total) * 100 : 0}
                    status={incCount > 0 ? `${periodLabel} · 已结算 ${incCount} 笔任务` : `${periodLabel} · 暂无收益入账`}
                />
                <KpiHud
                    color="#FF6B6B"
                    icon="🔥"
                    eng="EXPENSE · 耗损"
                    title="资源耗损"
                    value={exp.toLocaleString()}
                    barPct={total > 0 ? (exp / total) * 100 : 0}
                    status={expCount > 0
                        ? `${periodLabel} · 消耗比 ${Math.round(total > 0 ? (exp/total)*100 : 0)}%，共 ${expCount} 笔`
                        : `${periodLabel} · 暂无资源消耗`}
                />
                <KpiHud
                    color={balColor}
                    icon="⚡"
                    eng="BALANCE · 存档"
                    title="净存档值"
                    value={(bal >= 0 ? '+' : '') + bal.toLocaleString()}
                    barPct={inc > 0 ? (Math.abs(bal) / inc) * 100 : (bal !== 0 ? 100 : 0)}
                    status={balStatus}
                />
                <KpiHud
                    color="#FECA57"
                    icon="💎"
                    eng="ASSETS · 储备"
                    title="资金储备"
                    value={totalAssets.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                    barPct={totalAssets > 0 ? 72 : (totalAssets < 0 ? 100 : 0)}
                    status={totalAssets >= 0
                        ? `${data.acc.length} 个账户 · 💰 资产安全`
                        : `⚠️ 负债状态 · 需要关注`}
                />
            </div>

            {/* 热力图 + 词云 */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:24, marginBottom:24, alignItems:'start' }}>
                <div className="card" style={{ marginBottom:0, display:'flex', flexDirection:'column', overflow:'hidden', flex:'0 0 auto', width:'auto' }}>
                    <div className="card-header">
                        <div className="title">🌾 年度行迹</div>
                    </div>
                    <Heatmap data={data} activeYear={activeYear} />
                    <div className="heatmap-legend" style={{ marginTop:'auto', paddingTop:10 }}>
                        <span style={{ fontWeight:600 }}>图例：</span>
                        {[
                            { cls:'empty',        label:'无',   bg:'#E8DFC8' },
                            { cls:'income',       label:'收入', bg:'#C6F6D5' },
                            { cls:'expense',      label:'支出', bg:'#FED7D7' },
                            { cls:'mixed',        label:'混合', bg:'#FEEBC8' },
                        ].map(item => (
                            <div key={item.cls} className="heatmap-legend-item">
                                <div className="heatmap-legend-box" style={{ background: item.bg, borderColor: item.bg }} />
                                {item.label}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card" style={{ marginBottom:0, display:'flex', flexDirection:'column', flex:'1 1 300px' }}>
                    <div className="card-header" style={{ marginBottom:15 }}>
                        <div className="title">消费关键词</div>
                    </div>
                    <WordCloud data={data} activeYear={activeYear} />
                </div>
            </div>

            {/* 消费排行榜 + 月度透视 */}
            <div style={{ display:'flex', gap:24, marginBottom:24 }}>
                <div className="card" style={{ marginBottom:0, flex:'0 0 340px' }}>
                    <div className="card-header">
                        <div className="title">消费排行榜 (Top)</div>
                    </div>
                    <RankingList
                        data={data}
                        activeMonth={activeMonth}
                        onJumpToCategory={onJumpToCategory}
                    />
                </div>
                <div className="card" style={{ marginBottom:0, flex:1, minWidth:0 }}>
                    <div
                        className="card-header"
                        style={{ cursor:'pointer' }}
                        onClick={() => setMatrixOpen(v => !v)}
                    >
                        <div className="title">
                            月度透视 (The Matrix)
                            <i className={matrixOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
                        </div>
                    </div>
                    {matrixOpen && <MatrixTable data={data} activeYear={activeYear} />}
                </div>
            </div>
        </div>
    );
});

export default Dashboard;

// ── 矩阵子组件 ─────────────────────────────────────────────
function MatrixTable({ data, activeYear }) {
    const y = activeYear || new Date().getFullYear().toString();
    const md = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, inc:0, exp:0, A:0, B:0, C:0 }));
    let maxE = 1;

    data.txs.forEach(t => {
        if (!t.date?.startsWith(y) || t.type === 'transfer') return;
        const mi = parseInt(t.date.split('-')[1]) - 1;
        if (t.type === 'income') md[mi].inc += t.amount;
        else {
            md[mi].exp += t.amount;
            if (t.cat1 === '生存底座')  md[mi].A += t.amount;
            else if (t.cat1 === '生活消耗') md[mi].B += t.amount;
            else                          md[mi].C += t.amount;
        }
    });
    md.forEach(d => { if (d.exp > maxE) maxE = d.exp; });

    const rows = md.filter(d => d.inc > 0 || d.exp > 0);

    if (rows.length === 0) {
        return <div style={{ textAlign:'center', color:'#aaa', padding:20 }}>该年度暂无数据</div>;
    }

    return (
        <div style={{ overflowX:'auto' }}>
            <table className="table">
                <thead>
                    <tr>
                        <th>月份</th>
                        <th>收入</th>
                        <th>支出</th>
                        <th style={{ width:'40%' }}>结构 &amp; 明细</th>
                        <th>结余</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(d => {
                        const bal = d.inc - d.exp;
                        const barW  = Math.max((d.exp / maxE) * 100, 5);
                        const aW = d.exp > 0 ? (d.A / d.exp) * 100 : 0;
                        const bW = d.exp > 0 ? (d.B / d.exp) * 100 : 0;
                        const cW = d.exp > 0 ? (d.C / d.exp) * 100 : 0;
                        return (
                            <tr key={d.m}>
                                <td>{d.m}月</td>
                                <td>{d.inc.toFixed(0)}</td>
                                <td>{d.exp.toFixed(0)}</td>
                                <td>
                                    <div style={{ display:'flex', height:8, background:'#eee', width:`${barW}%`, borderRadius:4, overflow:'hidden', marginBottom:4 }}>
                                        <div style={{ width:`${aW}%`, background:'var(--c-survive)' }} />
                                        <div style={{ width:`${bW}%`, background:'var(--c-consume)' }} />
                                        <div style={{ width:`${cW}%`, background:'var(--c-event)' }} />
                                    </div>
                                    <div style={{ fontSize:10, color:'#A0AEC0', display:'flex', gap:8 }}>
                                        <span style={{ color:'var(--c-survive)' }}>A:{d.A.toFixed(0)}</span>
                                        <span style={{ color:'var(--c-consume)' }}>B:{d.B.toFixed(0)}</span>
                                        <span style={{ color:'var(--c-event)' }}>C:{d.C.toFixed(0)}</span>
                                    </div>
                                </td>
                                <td style={{ color: bal >= 0 ? 'var(--c-income)' : 'var(--c-survive)', fontWeight:600 }}>
                                    {bal.toFixed(0)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
