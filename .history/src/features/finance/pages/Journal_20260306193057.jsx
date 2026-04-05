// ============================================================
// Finance Pro — Journal 记账工作台
// 功能：拖拽导入 → 清洗台 → 规则管理 → 确认入账
// ============================================================

import { useRef, useCallback, useMemo, useState } from 'react';
import { useFinance } from '../index';
import { useWxParser } from '../hooks/useWxParser';
import { getExpenseOpts, getIncomeOpts, getCatName } from '../utils/catMap';
import RuleModal from '../panels/RuleModal';

export default function Journal() {
    const { data, addTxBatch, updateData, saveData, showToast } = useFinance();
    const fileInputRef = useRef(null);
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);

    const {
        parsedBills, setParsedBills,
        showCleanZone,
        handleFile, applyParsed,
        toggleRow, toggleAll, updateRow, switchRowType,
        mergeSelected, cancelCleaning, removeImported,
        getSummary,
    } = useWxParser();

    // ── 账户 options HTML ─────────────────────────────────
    const accOptsHtml = useMemo(() =>
        '<option value="">(选择账户)</option>' +
        data.acc.map(a => `<option value="${a.id}">${a.name}</option>`).join(''),
    [data.acc]);

    // ── 文件拖拽 / 选择处理 ───────────────────────────────
    const processFile = useCallback(async (file) => {
        if (!file) return;
        const result = await handleFile(file, {
            acc: data.acc, txs: data.txs, rules: data.rules,
        });
        const { ok, msg } = applyParsed(result, parsedBills);
        showToast(ok ? msg : msg, ok ? 'success' : 'error');
    }, [handleFile, applyParsed, parsedBills, data, showToast]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '';
        e.currentTarget.style.background  = '';
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    // ── 合并行 ────────────────────────────────────────────
    const handleMerge = useCallback(() => {
        const selected = parsedBills.filter(b => !b.isIgnored);
        if (selected.length < 2) { showToast('请至少勾选 2 笔交易进行合并', 'error'); return; }
        const desc = window.prompt('合并后的交易说明：', selected[0].desc + ' (合并)');
        if (desc === null) return;
        mergeSelected(desc);
    }, [parsedBills, mergeSelected, showToast]);

    // ── 存为规则（从清洗台📌按钮触发）─────────────────────
    const handleQuickRule = useCallback((idx) => {
        const b = parsedBills[idx];
        if (!b || !b.cat) return;
        const kw = window.prompt('保存规则关键词：', b.desc.replace(/^\[退款\]\s*/, '').replace(/[（(][^）)]*[）)]\s*$/, '').trim());
        if (!kw) return;
        const newRules = { ...data.rules, [kw]: b.cat };
        updateData(prev => ({ ...prev, rules: newRules }));
        saveData({ ...data, rules: newRules });
        // 回溯应用当前批次
        let hit = 0;
        setParsedBills(prev => prev.map(bill => {
            if (!bill.isIgnored && !bill.cat && (bill.desc || '').includes(kw)) {
                hit++;
                return { ...bill, cat: b.cat, isIgnored: false };
            }
            return bill;
        }));
        showToast(hit > 0 ? `规则已保存，当前批次自动命中 ${hit} 笔` : '规则已保存 ✓ 下次导入时自动匹配');
    }, [parsedBills, data, updateData, saveData, setParsedBills, showToast]);

    // ── 规则弹窗保存回调 → 回溯应用当前批次 ─────────────
    const handleRuleSaved = useCallback((kw, catId) => {
        let hit = 0;
        setParsedBills(prev => prev.map(b => {
            if (!b.isIgnored && !b.cat && (b.desc || '').includes(kw)) {
                hit++;
                return { ...b, cat: catId, isIgnored: false };
            }
            return b;
        }));
        if (hit > 0) showToast(`规则已保存，当前批次自动命中 ${hit} 笔`);
    }, [setParsedBills, showToast]);

    // ── 确认入账 ─────────────────────────────────────────
    const handleImport = useCallback(async () => {
        const selected = parsedBills.filter(b => !b.isIgnored);
        const ready = selected.filter(b =>
            b.mode === 'transfer'
                ? b.fromAcc && b.toAcc && b.fromAcc !== b.toAcc
                : b.cat && b.amount > 0
        );
        const notReady = selected.filter(b =>
            !(b.mode === 'transfer'
                ? b.fromAcc && b.toAcc && b.fromAcc !== b.toAcc
                : b.cat && b.amount > 0)
        );
        if (ready.length === 0) { showToast('请至少为一笔交易选择分类或账户', 'error'); return; }

        setImporting(true);
        try {
            const txsToAdd = [];
            ready.forEach(b => {
                if (b.mode === 'transfer') {
                    const fromA = data.acc.find(a => String(a.id) === String(b.fromAcc));
                    const toA   = data.acc.find(a => String(a.id) === String(b.toAcc));
                    if (fromA && toA) {
                        txsToAdd.push({
                            id: Date.now() + Math.random(), date: b.date, type: 'transfer',
                            amount: b.amount, cat1: '内部转账', cat2: '资产调拨',
                            desc: `[导入] ${b.desc}`, accId: fromA.id, toAccId: toA.id,
                            ...(b.wxId ? { wxId: b.wxId } : {}),
                        });
                        updateData(prev => ({
                            ...prev,
                            acc: prev.acc.map(a =>
                                a.id === fromA.id ? { ...a, bal: a.bal - b.amount }
                                : a.id === toA.id  ? { ...a, bal: a.bal + b.amount }
                                : a
                            ),
                        }));
                    }
                } else {
                    const catMap = {};
                    data.cats.forEach(c => { catMap[c.id] = c.group; });
                    const cat1      = catMap[b.cat] || '其他';
                    const targetAcc = b.fromAcc || data.acc[0]?.id || 'auto';
                    txsToAdd.push({
                        id: Date.now() + Math.random(), date: b.date, amount: b.amount,
                        desc: b.desc, cat2: b.cat, cat1, type: b.realType,
                        accId: targetAcc,
                        ...(b.wxId ? { wxId: b.wxId } : {}),
                    });
                    updateData(prev => ({
                        ...prev,
                        acc: prev.acc.map(a => {
                            if (String(a.id) !== String(targetAcc)) return a;
                            return { ...a, bal: a.bal + (b.realType === 'income' ? b.amount : -b.amount) };
                        }),
                    }));
                }
            });

            await addTxBatch(txsToAdd);

            const importedIds = new Set(ready.map(b => String(b.id)));
            const ignored     = parsedBills.filter(b => b.isIgnored);
            const manual      = notReady.filter(b => !(b.source === 'manual' && (!b.amount || b.amount <= 0)));

            removeImported(importedIds);
            const remaining = [...ignored, ...manual];

            if (remaining.length === 0) {
                showToast(`🎉 全部搞定！已入账 ${ready.length} 笔`);
            } else {
                showToast(`✅ 已入账 ${ready.length} 笔，剩 ${remaining.length} 笔待处理`);
            }
        } finally {
            setImporting(false);
        }
    }, [parsedBills, data, addTxBatch, updateData, removeImported, showToast]);

    // ── 汇总数据 ──────────────────────────────────────────
    const summary = useMemo(() => getSummary(parsedBills), [parsedBills, getSummary]);
    const expOpts  = useMemo(() => getExpenseOpts(data.cats), [data.cats]);
    const incOpts  = useMemo(() => getIncomeOpts(data.cats), [data.cats]);

    return (
        <>
            <div className="card">
                <div className="card-header">
                    <div className="title" id="journal-title">
                        {showCleanZone ? '记账工作台' : '记账工作台'}
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => setRuleModalOpen(true)}>
                        📅 周期订阅
                    </button>
                </div>

                {/* ── 拖拽导入区域 ────────────────────────── */}
                <div
                    id="import-zone"
                    className={showCleanZone ? 'compact' : ''}
                    style={{ textAlign:'center', padding:'50px 20px', border:'2px dashed #C4A882', borderRadius:10, background:'#FFF8EC', transition:'all 0.3s ease', cursor:'pointer' }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = '#EEF2FF'; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = ''; }}
                    onDrop={handleDrop}
                >
                    <i className="ri-file-transfer-line" style={{ fontSize: showCleanZone ? 24 : 56, color:'#1D6F42', display:'block', marginBottom: showCleanZone ? 0 : 20 }} />
                    <div style={{ fontSize: showCleanZone ? 14 : 18, fontWeight:700, color:'#2D3748', marginBottom: showCleanZone ? 0 : 10 }}>
                        {showCleanZone ? '继续拖拽或点击导入更多文件' : '点击 或 拖拽 微信/支付宝 账单文件'}
                    </div>
                    {!showCleanZone && (
                        <div className="hint-text" style={{ fontSize:13, color:'#718096' }}>
                            支持多文件混排 · 自动去重 · 智能识别 · 退款对冲
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        style={{ display:'none' }}
                        onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }}
                        onClick={e => e.stopPropagation()}
                    />
                </div>

                {/* ── 清洗工作台 ──────────────────────────── */}
                {showCleanZone && (
                    <div style={{ marginTop:10, animation:'fadeIn 0.3s' }}>
                        {/* 吸顶操作栏 */}
                        <div className="cleaning-header">
                            <div style={{ display:'flex', gap:8 }}>
                                <button
                                    className="btn btn-outline btn-sm"
                                    style={{ color:'#E53935', borderColor:'#E53935' }}
                                    onClick={() => {
                                        if (parsedBills.length > 0 && !window.confirm('确定放弃当前未处理的账单吗？')) return;
                                        cancelCleaning();
                                    }}
                                >
                                    <i className="ri-delete-bin-line" />
                                </button>
                                <button
                                    className="btn btn-outline btn-sm"
                                    style={{ color:'#5F27CD', borderColor:'#5F27CD' }}
                                    onClick={handleMerge}
                                >
                                    🔗 合并
                                </button>
                            </div>

                            {/* 汇总信息 */}
                            <div style={{ flex:1, textAlign:'right', paddingRight:15, fontSize:12, fontFamily:'monospace' }}>
                                <span style={{ fontWeight:'bold', color:'#2D3748' }}>已选 {summary.count} 笔</span>
                                <span style={{ color:'#CBD5E0', margin:'0 5px' }}>|</span>
                                <span style={{ color:'var(--c-income)' }}>收入 +{summary.totalInc.toLocaleString('zh-CN', { minimumFractionDigits:2 })}</span>
                                <span style={{ color:'#CBD5E0', margin:'0 5px' }}>|</span>
                                <span style={{ color:'var(--c-survive)' }}>支出 {summary.totalExp.toLocaleString('zh-CN', { minimumFractionDigits:2 })}</span>
                            </div>

                            <div style={{ display:'flex', gap:8 }}>
                                <button
                                    className="btn btn-outline btn-sm"
                                    style={{ color:'#F57F17', borderColor:'#FBC02D' }}
                                    onClick={() => setRuleModalOpen(true)}
                                >
                                    🤖 规则
                                </button>
                                <button
                                    className={`btn btn-sm ${summary.readyCount > 0 ? 'btn-primary' : 'btn-outline'}`}
                                    disabled={importing || summary.readyCount === 0}
                                    onClick={handleImport}
                                >
                                    {importing ? '入账中...' : summary.readyCount > 0 ? `✨ 立即入账 (${summary.readyCount}笔)` : '请先选择分类...'}
                                </button>
                            </div>
                        </div>

                        {/* 清洗表格 */}
                        <div style={{ border:'1px solid #EDF2F7', borderTop:'none', borderRadius:'0 0 8px 8px', maxHeight:'55vh', overflowY:'auto' }}>
                            <table className="table clean-table">
                                <thead>
                                    <tr style={{ background:'#F7FAFC' }}>
                                        <th style={{ width:40, textAlign:'center' }}>
                                            <input
                                                type="checkbox"
                                                defaultChecked
                                                className="clean-checkbox"
                                                onChange={e => toggleAll(e.target.checked)}
                                            />
                                        </th>
                                        <th>日期</th>
                                        <th>说明 / 交易对象</th>
                                        <th className="th-center">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedBills.map((b, idx) => (
                                        <CleanRow
                                            key={b.id}
                                            bill={b}
                                            idx={idx}
                                            accOptsHtml={accOptsHtml}
                                            expOptsHtml={expOpts}
                                            incOptsHtml={incOpts}
                                            cats={data.cats}
                                            onToggle={toggleRow}
                                            onUpdate={updateRow}
                                            onSwitchType={switchRowType}
                                            onQuickRule={handleQuickRule}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* 规则管理弹窗 */}
            <RuleModal
                open={ruleModalOpen}
                onClose={() => setRuleModalOpen(false)}
                onRuleSaved={handleRuleSaved}
            />
        </>
    );
}

// ── 清洗台单行组件 ─────────────────────────────────────────
function CleanRow({ bill: b, idx, accOptsHtml, expOptsHtml, incOptsHtml, cats, onToggle, onUpdate, onSwitchType, onQuickRule }) {
    const isReady = b.mode === 'transfer'
        ? b.fromAcc && b.toAcc && b.fromAcc !== b.toAcc
        : b.cat && b.amount > 0;

    const rowBg = b.isIgnored ? '' : (isReady ? '#F0FFF4' : '');

    // 标签
    let tagHtml;
    if (b.amount < 0 && b.realType === 'expense') {
        tagHtml = <span className="tag-badge" style={{ background:'#FED7D7', color:'#C53030' }}>退款</span>;
    } else if (b.mode === 'transfer') {
        tagHtml = <span className="tag-badge tag-tf">转账</span>;
    } else {
        tagHtml = b.realType === 'income'
            ? <span className="tag-badge tag-inc">收入</span>
            : <span className="tag-badge tag-exp">支出</span>;
    }

    // 原始类型标签
    const showType = b.type && !['商户消费', '/', '扫二维码付款'].includes(b.type);

    // 操作区
    let actionCell;
    if (b.mode === 'transfer') {
        const alertStyle = (!b.fromAcc || !b.toAcc) ? 'borderColor:#F56565' : '';
        actionCell = (
            <>
                <div style={{ display:'flex', gap:4, alignItems:'center', justifyContent:'center' }}>
                    <select
                        className="clean-select"
                        style={{ width:90, ...(!b.fromAcc ? { borderColor:'#F56565' } : {}) }}
                        value={b.fromAcc}
                        onChange={e => onUpdate(idx, { fromAcc: e.target.value })}
                        dangerouslySetInnerHTML={{ __html: accOptsHtml }}
                    />
                    <i className="ri-arrow-right-line" style={{ color:'#CBD5E0' }} />
                    <select
                        className="clean-select"
                        style={{ width:90, ...(!b.toAcc ? { borderColor:'#F56565' } : {}) }}
                        value={b.toAcc}
                        onChange={e => onUpdate(idx, { toAcc: e.target.value })}
                        dangerouslySetInnerHTML={{ __html: accOptsHtml }}
                    />
                </div>
                <div style={{ textAlign:'center', marginTop:4 }}>
                    <input
                        type="number" className="clean-input amt" style={{ width:100 }}
                        value={b.amount}
                        onChange={e => onUpdate(idx, { amount: parseFloat(e.target.value) || 0 })}
                    />
                </div>
            </>
        );
    } else {
        const catOpts  = b.realType === 'income' ? incOptsHtml : expOptsHtml;
        const toggleIcon  = b.realType === 'income' ? 'ri-add-circle-line' : 'ri-indeterminate-circle-line';
        const toggleColor = b.realType === 'income' ? 'var(--c-income)' : 'var(--c-survive)';

        actionCell = (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:3 }}>
                <select
                    className="clean-select"
                    style={{ flex:1, minWidth:0, ...(!b.cat ? { border:'1px solid #F56565', background:'#fff' } : {}) }}
                    value={b.cat}
                    onChange={e => onUpdate(idx, { cat: e.target.value })}
                    dangerouslySetInnerHTML={{ __html: '<option value="">(分类)</option>' + catOpts }}
                />
                {b.cat
                    ? <button
                        onClick={() => onQuickRule(idx)}
                        title="存为规则"
                        style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, padding:'0 2px', color:'#A0AEC0', flexShrink:0 }}
                      >📌</button>
                    : <span style={{ width:19, flexShrink:0 }} />
                }
                <div style={{ position:'relative', width:74, flexShrink:0 }}>
                    <input
                        type="number" className="clean-input amt"
                        style={{ width:'100%', color: toggleColor, padding:'0 2px' }}
                        value={b.amount}
                        onChange={e => onUpdate(idx, { amount: parseFloat(e.target.value) || 0 })}
                    />
                    <i
                        className={toggleIcon}
                        style={{ position:'absolute', right:-6, top:-6, cursor:'pointer', color:'#A0AEC0', background:'#fff', borderRadius:'50%', fontSize:14 }}
                        title="切换收支"
                        onClick={() => onSwitchType(idx)}
                    />
                </div>
            </div>
        );
    }

    return (
        <tr
            className={`clean-row${b.isIgnored ? ' ignored' : ''}`}
            style={{ background: rowBg }}
        >
            <td style={{ textAlign:'center' }}>
                <input
                    type="checkbox"
                    className="clean-checkbox"
                    checked={!b.isIgnored}
                    onChange={e => onToggle(idx, e.target.checked)}
                />
            </td>
            <td>
                <input
                    type="text" className="clean-input-date"
                    value={b.date}
                    onChange={e => onUpdate(idx, { date: e.target.value })}
                />
            </td>
            <td>
                <div className="clean-text-main">
                    {tagHtml}
                    {showType && (
                        <span style={{ fontSize:10, color:'#4A5568', background:'#EDF2F7', padding:'1px 6px', borderRadius:4, marginRight:5, verticalAlign:'middle', border:'1px solid #E2E8F0' }}>
                            {b.type}
                        </span>
                    )}
                    <input
                        type="text" className="clean-input"
                        style={{ fontWeight:600 }}
                        value={b.desc}
                        onChange={e => onUpdate(idx, { desc: e.target.value })}
                    />
                </div>
            </td>
            <td>{actionCell}</td>
        </tr>
    );
}
