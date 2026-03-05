// ============================================================
// Finance Pro — TransferModal 资金传送门
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useFinance } from '../index';

export default function TransferModal({ open, onClose }) {
    const { data, updateData, addTx, saveData, showToast } = useFinance();
    const [fromId, setFromId] = useState('');
    const [toId,   setToId]   = useState('');
    const [amount, setAmount] = useState('');

    // 初始化默认账户
    useEffect(() => {
        if (open && data.acc.length >= 1) {
            setFromId(String(data.acc[0].id));
            setToId(String(data.acc.length > 1 ? data.acc[1].id : data.acc[0].id));
            setAmount('');
        }
    }, [open, data.acc]);

    if (!open) return null;

    const fromAcc = data.acc.find(a => String(a.id) === fromId);
    const toAcc   = data.acc.find(a => String(a.id) === toId);
    const amt     = parseFloat(amount) || 0;

    const accOpts = data.acc.map(a => (
        <option key={a.id} value={String(a.id)}>{a.name}</option>
    ));

    const handleExecute = useCallback(async () => {
        if (!amt || amt <= 0)  { showToast('请输入有效金额', 'error'); return; }
        if (fromId === toId)   { showToast('不能转给自己', 'error');   return; }
        if (!fromAcc || !toAcc) return;
        if (fromAcc.bal < amt) { showToast('余额不足！', 'error');     return; }

        await addTx({
            id: Date.now(), date: new Date().toISOString().slice(0, 10),
            type: 'transfer', amount: amt,
            cat1: '内部转账', cat2: '资产调拨',
            desc: `从 [${fromAcc.name}] 转入 [${toAcc.name}]`,
            accId: fromAcc.id, toAccId: toAcc.id,
        });
        updateData(prev => ({
            ...prev,
            acc: prev.acc.map(a => {
                if (a.id === fromAcc.id) return { ...a, bal: a.bal - amt };
                if (a.id === toAcc.id)  return { ...a, bal: a.bal + amt };
                return a;
            }),
        }));
        saveData({ ...data });
        showToast('⚡️ 资金调拨成功');
        onClose();
    }, [amt, fromId, toId, fromAcc, toAcc, addTx, updateData, saveData, data, showToast, onClose]);

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width: 550 }}>
                <h3 style={{ marginTop:0, borderBottom:'1px solid #eee', paddingBottom:15, display:'flex', justifyContent:'space-between' }}>
                    <span>⚡️ 资金传送门</span>
                    <span style={{ fontSize:12, fontWeight:400, color:'#A0AEC0', marginTop:5 }}>ASSET TRANSFER</span>
                </h3>

                <div className="transfer-container">
                    {/* 来源 */}
                    <div className={`t-card${fromAcc ? ' active' : ''}`}>
                        <span className="t-label">从 (Source)</span>
                        <select className="form-control" style={{ marginBottom:8, textAlign:'center' }} value={fromId} onChange={e => setFromId(e.target.value)}>
                            {accOpts}
                        </select>
                        <div className="t-bal-origin">{fromAcc?.bal.toLocaleString() ?? '—'}</div>
                        {amt > 0 && (
                            <div className="t-bal-new show" style={{ color:'#E53935' }}>
                                剩余: {((fromAcc?.bal || 0) - amt).toLocaleString()}
                            </div>
                        )}
                    </div>

                    {/* 箭头 */}
                    <div className="t-arrow-box"><i className="ri-arrow-right-double-fill" /></div>

                    {/* 目标 */}
                    <div className={`t-card${toAcc ? ' active' : ''}`}>
                        <span className="t-label">到 (Target)</span>
                        <select className="form-control" style={{ marginBottom:8, textAlign:'center' }} value={toId} onChange={e => setToId(e.target.value)}>
                            {accOpts}
                        </select>
                        <div className="t-bal-origin">{toAcc?.bal.toLocaleString() ?? '—'}</div>
                        {amt > 0 && (
                            <div className="t-bal-new show" style={{ color:'#48BB78' }}>
                                新余额: {((toAcc?.bal || 0) + amt).toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>

                {/* 金额输入 */}
                <div style={{ textAlign:'center', marginBottom:10 }}>
                    <input
                        type="number"
                        className="form-control"
                        placeholder="输入转账金额"
                        style={{ fontSize:24, fontWeight:800, textAlign:'center', height:60, color:'var(--primary)' }}
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                    />
                </div>

                {/* 快捷金额 */}
                <div className="quick-actions">
                    {[100, 500, 1000, 5000].map(v => (
                        <div key={v} className="q-chip" onClick={() => setAmount(String(v))}>¥{v.toLocaleString()}</div>
                    ))}
                    <div className="q-chip" style={{ color:'var(--primary)', borderColor:'var(--primary)' }}
                        onClick={() => setAmount(String(fromAcc?.bal || 0))}>全部余额</div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:15, marginTop:25 }}>
                    <button className="btn btn-outline" onClick={onClose}>取消</button>
                    <button className="btn btn-primary" onClick={handleExecute}>确认传送</button>
                </div>
            </div>
        </div>
    );
}
