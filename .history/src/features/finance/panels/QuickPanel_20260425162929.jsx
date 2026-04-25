// ============================================================
// Finance Pro — QuickPanel 快速记账浮动 HUD
// FAB 按钮 + 底部抽屉 + 分类格子 + 浮动伤害数字
// ============================================================

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useFinance } from '../index';
import { getCatMap } from '../utils/catMap';

// ── 浮动伤害数字 ──────────────────────────────────────────
function spawnFloatingDmg(amt, type, fabEl) {
    if (!fabEl) return;
    const rect = fabEl.getBoundingClientRect();
    const el   = document.createElement('div');
    el.className    = 'floating-dmg';
    el.textContent  = (type === 'income' ? '+' : '-') + '¥' + amt.toLocaleString('zh-CN');
    el.style.color  = type === 'income' ? '#1DD1A1' : '#FF6B6B';
    el.style.left   = (rect.left + rect.width  / 2 - 40) + 'px';
    el.style.top    = (rect.top  - 10) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
}

// ════════════════════════════════════════════════════════════
function QuickPanel() {
    const { data, addTx, updateData, saveData, showToast } = useFinance();
    const fabRef    = useRef(null);
    const amtRef    = useRef(null);

    const [open,    setOpen]    = useState(false);
    const [mode,    setMode]    = useState('exp');   // 'exp' | 'inc'
    const [selCat,  setSelCat]  = useState('');
    const [amount,  setAmount]  = useState('');
    const [note,    setNote]    = useState('');
    const [submitting, setSub]  = useState(false);

    // 打开时聚焦金额，重置状态
    useEffect(() => {
        if (open) {
            setMode('exp'); setSelCat(''); setAmount(''); setNote('');
            setTimeout(() => amtRef.current?.focus(), 200);
        }
    }, [open]);

    // ── 分类格子数据 ──────────────────────────────────────
    const expCats = data.cats.filter(c => c.type === 'expense').sort((a, b) => a.sort - b.sort);
    const incCats = data.cats.filter(c => c.type === 'income' ).sort((a, b) => a.sort - b.sort);
    const cats    = mode === 'exp' ? expCats : incCats;

    // ── 提交按钮文案 ──────────────────────────────────────
    const amt = parseFloat(amount) || 0;
    const selectedCat = data.cats.find(c => c.id === selCat);
    let btnLabel, btnDisabled;
    if (selCat && amt > 0) {
        const catLabel = selectedCat?.name || selCat;
        btnLabel   = mode === 'exp'
            ? `⚔️ 消耗 ¥${amt.toLocaleString('zh-CN')} · ${catLabel}`
            : `💰 入账 ¥${amt.toLocaleString('zh-CN')} · ${catLabel}`;
        btnDisabled = false;
    } else if (selCat) {
        btnLabel = '输入金额后出发 →'; btnDisabled = false;
    } else {
        btnLabel = '选择分类后出发 →'; btnDisabled = true;
    }

    // ── 提交 ──────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!amt || amt <= 0) { showToast('请输入有效金额', 'error'); return; }
        if (!selCat)          { showToast('请选择分类', 'error');     return; }

        setSub(true);
        const type    = mode === 'inc' ? 'income' : 'expense';
        const accId   = data.acc[0]?.id || 'auto';
        const date    = new Date().toISOString().slice(0, 10);
        const catMap  = getCatMap(data.cats);
        const cat1    = catMap[selCat] || '其他';
        const desc    = note || selectedCat?.name || selCat;

        // 浮动伤害数字
        spawnFloatingDmg(amt, type, fabRef.current);

        await addTx({ id: Date.now(), date, amount: amt, type, cat2: selCat, cat1, desc, accId });
        updateData(prev => ({
            ...prev,
            acc: prev.acc.map(a =>
                String(a.id) === String(accId)
                    ? { ...a, bal: a.bal + (type === 'income' ? amt : -amt) }
                    : a
            ),
        }));
        saveData({ ...data });
        showToast(`${type === 'income' ? '💰' : '⚔️'} ${desc} ¥${amt.toLocaleString()} 已记录`);

        setSub(false);
        setTimeout(() => setOpen(false), 600);
    }, [amt, selCat, mode, note, data, addTx, updateData, saveData, showToast, selectedCat]);

    return (
        <>
            {/* 遮罩 */}
            <div
                className={`quick-overlay${open ? ' open' : ''}`}
                onClick={() => setOpen(false)}
            />

            {/* FAB 按钮 */}
            <button
                id="quick-fab"
                ref={fabRef}
                className={open ? 'open' : ''}
                onClick={() => setOpen(o => !o)}
                title="快速记账"
            >
                {open ? '+' : '✦'}
            </button>

            {/* 面板 */}
            <div id="quick-panel" className={open ? 'open' : ''}>
                <div id="quick-panel-inner">
                    <div className="qp-handle" />

                    {/* 模式切换 */}
                    <div className="qp-mode-bar">
                        <button
                            className={`qp-mode-btn${mode === 'exp' ? ' active-exp' : ''}`}
                            onClick={() => { setMode('exp'); setSelCat(''); }}
                        >⚔️ 消耗金币</button>
                        <button
                            className={`qp-mode-btn${mode === 'inc' ? ' active-inc' : ''}`}
                            onClick={() => { setMode('inc'); setSelCat(''); }}
                        >💰 获得金币</button>
                    </div>

                    {/* 金额输入 */}
                    <div className={`qp-amount-wrap${mode === 'inc' ? ' mode-inc' : ''}`}>
                        <span className="qp-currency">¥</span>
                        <input
                            ref={amtRef}
                            type="number"
                            placeholder="0"
                            inputMode="decimal"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                        />
                    </div>

                    {/* 分类格子 */}
                    <div className="qp-cats">
                        {cats.map(c => {
                            const gn   = c.name;
                            const mid  = Math.ceil(gn.length / 2);
                            const l1   = gn.slice(0, mid);
                            const l2   = gn.slice(mid);
                            return (
                                <button
                                    key={c.id}
                                    className={`qp-cat-btn${selCat === c.id ? ' selected' : ''}${mode === 'inc' ? ' inc-wide' : ''}`}
                                    style={{ '--cat-color': c.color }}
                                    onClick={() => {
                                        setSelCat(c.id);
                                        // 微震 via inline class trick
                                    }}
                                >
                                    <span className="qp-cat-icon">{c.icon}</span>
                                    <span className="qp-cat-name">
                                        {l1}{l2 ? <><br />{l2}</> : ''}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 备注 */}
                    <input
                        type="text"
                        placeholder="战报备注… (可选)"
                        maxLength={50}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !btnDisabled && handleSubmit()}
                    />

                    {/* 提交 */}
                    <button
                        id="qp-submit"
                        className={`${mode === 'inc' ? ' mode-inc' : ''}${submitting ? ' hit-anim' : ''}`}
                        disabled={btnDisabled || submitting}
                        onClick={handleSubmit}
                    >
                        {submitting ? '✅ 已记录！' : btnLabel}
                    </button>
                </div>
            </div>
        </>
    );
}

export default memo(QuickPanel);
