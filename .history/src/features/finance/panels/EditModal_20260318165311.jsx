// ============================================================
// Finance Pro — EditModal 修改记录弹窗
// ============================================================

import { useState, useEffect } from 'react';
import { useFinance } from '../index';
import { getCatMap, getExpenseOpts, getIncomeOpts, getDomainForCat } from '../utils/catMap';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function EditModal({ open, tx, onClose }) {
    const { data, setData, saveData, showToast } = useFinance();

    const [form, setForm] = useState({ date: '', desc: '', cat2: '' });

    useEffect(() => {
        if (tx) setForm({ date: tx.date || '', desc: tx.desc || '', cat2: tx.cat2 || '' });
    }, [tx]);

    if (!open || !tx) return null;

    const catOpts = tx.type === 'income' ? getIncomeOpts(data.cats) : getExpenseOpts(data.cats);

    const handleSave = async () => {
        setData(prev => {
            const txs = prev.txs.map(t => {
                if (String(t.id) !== String(tx.id)) return t;
                const catMap = getCatMap(prev.cats);
                return {
                    ...t,
                    date: form.date,
                    desc: form.desc,
                    cat2: form.cat2,
                    cat1: catMap[form.cat2] || '其他',
                    domain: getDomainForCat(prev.cats, form.cat2),
                    updatedAt: new Date().toISOString(),
                };
            });
            return { ...prev, txs };
        });

        // 同步 Firebase
        try {
            const catMap = getCatMap(data.cats);
            await setDoc(doc(db, 'transactions', String(tx.id)), {
                ...tx,
                date: form.date,
                desc: form.desc,
                cat2: form.cat2,
                cat1: catMap[form.cat2] || '其他',
                domain: getDomainForCat(data.cats, form.cat2),
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        } catch (e) {
            console.error('edit save failed', e);
        }

        saveData({ ...data });
        showToast('修改已保存');
        onClose();
    };

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width: 400 }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: 10 }}>修改记录</h3>

                <div className="edit-row">
                    <span className="edit-label">日期</span>
                    <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="edit-row">
                    <span className="edit-label">说明</span>
                    <input type="text" className="form-control" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
                </div>
                <div className="edit-row">
                    <span className="edit-label">分类</span>
                    <select
                        className="form-control"
                        value={form.cat2}
                        onChange={e => setForm(f => ({ ...f, cat2: e.target.value }))}
                        dangerouslySetInnerHTML={{ __html: catOpts }}
                    />
                </div>
                <div className="edit-row">
                    <span className="edit-label">金额</span>
                    <input
                        type="number" className="form-control" value={tx.amount} disabled
                        style={{ background: '#f5f5f5', cursor: 'not-allowed' }}
                        title="如需修改金额，请删除后重新入账"
                    />
                </div>

                <div style={{ textAlign: 'right', marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onClose}>取消</button>
                    <button className="btn btn-primary" onClick={handleSave}>保存修改</button>
                </div>
            </div>
        </div>
    );
}
