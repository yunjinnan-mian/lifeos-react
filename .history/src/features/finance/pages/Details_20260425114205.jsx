// ============================================================
// Finance Pro — Details 账单明细
// 功能：年/月/类型/分类/关键词筛选 + 排序 + 编辑 + 删除
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useFinance } from '../index';
import { getCatName, getColorMap, getExpenseOpts, getIncomeOpts } from '../utils/catMap';
import EditModal from '../panels/EditModal';

export default function Details() {
    const { data, setData, updateData, delTx, updateHistory, saveData, showToast } = useFinance();

    // ── 筛选状态 ──────────────────────────────────────────
    const [filterYear,  setFilterYear]  = useState('all');
    const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [filterType,  setFilterType]  = useState('all');
    const [filterCat2,  setFilterCat2]  = useState('all');
    const [filterKey,   setFilterKey]   = useState('');
    const [sortDesc,    setSortDesc]    = useState(true);

    // 编辑弹窗
    const [editTx, setEditTx] = useState(null);

    // 外部跳转（Dashboard 排行榜点击 → 过滤某分类）
    useEffect(() => {
        if (data._jumpCat) {
            setFilterCat2(data._jumpCat);
            setFilterMonth('');
            setFilterYear('all');
            updateData(prev => { const d = { ...prev }; delete d._jumpCat; return d; });
        }
    }, [data._jumpCat]); // eslint-disable-line

    // ── 年份选项 ──────────────────────────────────────────
    const yearOpts = useMemo(() => {
        const s = new Set();
        data.txs.forEach(t => { if (t.date) s.add(t.date.slice(0, 4)); });
        s.add(new Date().getFullYear().toString());
        return [...s].sort((a, b) => b - a);
    }, [data.txs]);

    // ── 分类二级选项 ──────────────────────────────────────
    const cat2OptsHtml = useMemo(() =>
        '<option value="all">全部分类</option>' +
        getExpenseOpts(data.cats) + getIncomeOpts(data.cats),
    [data.cats]);

    // ── 筛选 + 排序 ───────────────────────────────────────
    const filteredTxs = useMemo(() => {
        const list = [...data.txs].filter(t => {
            if (filterMonth) {
                if (!t.date?.startsWith(filterMonth)) return false;
            } else if (filterYear !== 'all') {
                if (!t.date?.startsWith(filterYear)) return false;
            }
            if (filterType !== 'all' && t.type !== filterType) return false;
            if (filterCat2 !== 'all' && t.cat2 !== filterCat2) return false;
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
    }, [data.txs, filterMonth, filterYear, filterType, filterCat2, filterKey, sortDesc]);

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

    // ── 颜色映射 ──────────────────────────────────────────
    const colorMap = useMemo(() => getColorMap(data.cats), [data.cats]);

    return (
        <>
            <div id="details" className="card">
                <div className="card-header">
                    <div className="title">收支明细</div>

                    {/* 筛选工具栏 */}
                    <div style={{ display:'flex', flexWrap:'nowrap', alignItems:'center', gap:8, overflowX:'auto', paddingBottom:2 }}>
                        {/* 年份 */}
                        <select
                            className="form-control"
                            style={{ width:80, flexShrink:0 }}
                            value={filterYear}
                            onChange={e => { setFilterYear(e.target.value); setFilterMonth(''); }}
                        >
                            <option value="all">全部年</option>
                            {yearOpts.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>

                        {/* 月份 */}
                        <input
                            type="month"
                            className="form-control"
                            style={{ width:140, flexShrink:0 }}
                            value={filterMonth}
                            onChange={e => { setFilterMonth(e.target.value); setFilterYear('all'); }}
                        />

                        {/* 类型 */}
                        <select
                            className="form-control"
                            style={{ width:100, flexShrink:0 }}
                            value={filterType}
                            onChange={e => setFilterType(e.target.value)}
                        >
                            <option value="all">全部类型</option>
                            <option value="income">收入</option>
                            <option value="expense">支出</option>
                            <option value="adjust">平账/调整</option>
                        </select>

                        {/* 分类 */}
                        <select
                            className="form-control"
                            style={{ width:120, flexShrink:0 }}
                            value={filterCat2}
                            onChange={e => setFilterCat2(e.target.value)}
                            dangerouslySetInnerHTML={{ __html: cat2OptsHtml }}
                        />

                        {/* 搜索 */}
                        <input
                            id="filter-key"
                            className="form-control"
                            style={{ minWidth:90, flex:1 }}
                            placeholder="搜索"
                            value={filterKey}
                            onChange={e => setFilterKey(e.target.value)}
                        />
                    </div>
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
                                    acc={data.acc}
                                    colorMap={colorMap}
                                    cats={data.cats}
                                    onEdit={() => setEditTx(t)}
                                    onDelete={() => handleDelete(t)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 编辑弹窗 */}
            <EditModal
                open={!!editTx}
                tx={editTx}
                onClose={() => setEditTx(null)}
            />
        </>
    );
}

// ── 单行组件 ────────────────────────────────────────────────
function TxRow({ tx: t, acc, colorMap, cats, onEdit, onDelete }) {
    const c = colorMap[t.cat1] || '#ccc';

    let typeLabel = '支出', typeColor = 'var(--c-survive)', amtPrefix = '-';
    if (t.type === 'income')   { typeLabel = '收入'; typeColor = 'var(--c-income)';  amtPrefix = '+'; }
    else if (t.type === 'transfer') { typeLabel = '转账'; typeColor = '#718096'; amtPrefix = ''; }
    else if (t.type === 'adjust')   {
        typeLabel = '平账'; typeColor = '#A0AEC0';
        const isInc = t.diffDir === 'inc' || (t.cat2 && t.cat2.includes('收入'));
        amtPrefix = isInc ? '+' : '-';
    }

    return (
        <tr>
            <td data-label="日期">{t.date}</td>
            <td data-label="类型"><span style={{ color:typeColor, fontWeight:700 }}>{typeLabel}</span></td>
            <td data-label="一级">
                <span className="tag" style={{ background:`${c}22`, color:c }}>{t.cat1 || '-'}</span>
            </td>
            <td data-label="二级">{getCatName(cats, t.cat2)}</td>
            <td data-label="说明" style={{ color:'#2D3748', fontWeight:500 }}>{t.desc || ''}</td>
            <td data-label="账户" style={{ color:'#A0AEC0', fontSize:12 }}>{accName}</td>
            <td data-label="金额" style={{ textAlign:'right', fontWeight:'bold', color:typeColor }}>
                {amtPrefix} {(t.amount || 0).toLocaleString()}
            </td>
            <td>
                <button className="btn-icon" onClick={onEdit} title="修改">
                    <i className="ri-edit-line" />
                </button>
                <button className="btn-icon" onClick={onDelete} title="删除" style={{ color:'#E53935' }}>
                    <i className="ri-delete-bin-line" />
                </button>
            </td>
        </tr>
    );
}
