// ============================================================
// Finance Pro — Assets 资产盘点
// 账户卡片 · 拖拽排序 · 余额直编 · 平账流水
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import { useFinance } from '../index';
import TransferModal from '../panels/TransferModal';

export default function Assets() {
    const { data, updateData, addTx, saveData, showToast } = useFinance();
    const [transferOpen, setTransferOpen] = useState(false);
    const [dragIdx, setDragIdx] = useState(null);

    // ── 总资产 ────────────────────────────────────────────
    const total = useMemo(() => data.acc.reduce((s, a) => s + (a.bal || 0), 0), [data.acc]);

    // ── 余额手动修改 + 平账流水 ────────────────────────────
    const handleBalChange = useCallback(async (accId, newVal) => {
        const a = data.acc.find(x => x.id === accId);
        if (!a) return;
        const current  = parseFloat(newVal);
        if (isNaN(current)) return;
        const diff = current - a.bal;
        if (Math.abs(diff) < 0.01) {
            updateData(prev => ({ ...prev, acc: prev.acc.map(x => x.id === accId ? { ...x, bal: current } : x) }));
            saveData({ ...data });
            return;
        }
        const yes = window.confirm(
            `检测到余额变动：\n原余额: ${a.bal.toLocaleString()}\n新余额: ${current.toLocaleString()}\n差  额: ${diff > 0 ? '+' : ''}${diff.toLocaleString()}\n是否记录为"平账"流水？`
        );
        if (yes) {
            updateData(prev => ({ ...prev, acc: prev.acc.map(x => x.id === accId ? { ...x, bal: current } : x) }));
            await addTx({
                id: Date.now(), date: new Date().toISOString().slice(0, 10),
                type: 'adjust', amount: Math.abs(diff),
                desc: '余额平账/校准', cat1: '平账', cat2: '资金调整',
                accId, diffDir: diff > 0 ? 'inc' : 'dec',
            });
            saveData({ ...data });
            showToast('✅ 已平账');
        } else {
            updateData(prev => ({ ...prev, acc: prev.acc.map(x => x.id === accId ? { ...x, bal: current } : x) }));
            saveData({ ...data });
            showToast('⚠️ 资产已强制修改 (无流水)');
        }
    }, [data, addTx, updateData, saveData, showToast]);

    // ── 新增账户 ──────────────────────────────────────────
    const handleAddAccount = useCallback(() => {
        const name = window.prompt('账户名称');
        if (!name?.trim()) return;
        updateData(prev => ({ ...prev, acc: [...prev.acc, { id: Date.now(), name: name.trim(), bal: 0 }] }));
        saveData({ ...data });
        showToast('账户已添加');
    }, [data, updateData, saveData, showToast]);

    // ── 删除账户 ──────────────────────────────────────────
    const handleDeleteAccount = useCallback((idx) => {
        if (!window.confirm(`确定删除账户 "${data.acc[idx].name}"？`)) return;
        updateData(prev => ({ ...prev, acc: prev.acc.filter((_, i) => i !== idx) }));
        saveData({ ...data });
        showToast('账户已删除');
    }, [data, updateData, saveData, showToast]);

    // ── 拖拽排序 ──────────────────────────────────────────
    const handleDragStart = useCallback((e, idx) => {
        setDragIdx(idx);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback((e, dropIdx) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return; }
        updateData(prev => {
            const acc = [...prev.acc];
            const [item] = acc.splice(dragIdx, 1);
            acc.splice(dropIdx, 0, item);
            return { ...prev, acc };
        });
        saveData({ ...data });
        showToast('已调整扣款顺序');
        setDragIdx(null);
    }, [dragIdx, data, updateData, saveData, showToast]);

    return (
        <>
            <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
                <div className="card-header">
                    <div className="title">资产盘点 (拖动调整扣款顺序)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => setTransferOpen(true)}>
                            ⚡️ 资金调拨
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={handleAddAccount}>
                            + 新增账户
                        </button>
                    </div>
                </div>

                <div className="asset-grid">
                    {data.acc.map((a, i) => (
                        <div
                            key={a.id}
                            className={`asset-card${dragIdx === i ? ' dragging' : ''}`}
                            draggable
                            onDragStart={e => handleDragStart(e, i)}
                            onDragEnd={() => setDragIdx(null)}
                            onDragOver={handleDragOver}
                            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                            onDragEnter={e => e.currentTarget.classList.add('drag-over')}
                            onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, i); }}
                        >
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, alignItems:'center' }}>
                                <div style={{ display:'flex', alignItems:'center' }}>
                                    <i className="ri-draggable" style={{ color:'#A0AEC0', fontSize:20, marginRight:6, cursor:'grab' }} />
                                    <span style={{ fontWeight:700, color:'#2D3748' }}>{a.name}</span>
                                </div>
                                <button
                                    className="btn-icon"
                                    style={{ color:'#E53935' }}
                                    onClick={e => { e.stopPropagation(); handleDeleteAccount(i); }}
                                >×</button>
                            </div>
                            <input
                                className="form-control"
                                style={{ border:'none', background:'transparent', fontSize:24, fontWeight:800, padding:0, textAlign:'right', height:'auto', color:'#2D3748', width:'100%' }}
                                type="number"
                                defaultValue={a.bal.toFixed(2)}
                                key={a.id + '-' + a.bal}   // 外部修改时强制 reset
                                onBlur={e => handleBalChange(a.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                    ))}
                </div>

                <div style={{ textAlign:'right', marginTop:20, fontWeight:800, fontSize:20 }}>
                    总计: ¥{total.toLocaleString('zh-CN', { minimumFractionDigits:2 })}
                </div>
            </div>

            <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
        </>
    );
}
