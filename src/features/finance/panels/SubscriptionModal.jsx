// ============================================================
// Finance Pro — SubscriptionModal 周期订阅管理
// ============================================================

import { useState } from 'react';
import { useFinance } from '../index';
import { getExpenseOpts, getIncomeOpts } from '../utils/catMap';

export default function SubscriptionModal({ open, onClose }) {
    const { data, updateData, saveData, showToast } = useFinance();
    const [form, setForm] = useState({ name:'', amount:'', day:'', cat2:'', type:'expense' });

    if (!open) return null;

    const catOptsHtml = form.type === 'income' ? getIncomeOpts(data.cats) : getExpenseOpts(data.cats);

    const handleAdd = () => {
        if (!form.name.trim())                                 { showToast('请输入订阅名称', 'error'); return; }
        if (!parseFloat(form.amount) || parseFloat(form.amount) <= 0) { showToast('金额无效', 'error'); return; }
        const day = parseInt(form.day);
        if (!day || day < 1 || day > 31)                      { showToast('日期无效', 'error'); return; }
        if (!form.cat2)                                        { showToast('请选择分类', 'error'); return; }

        const newSub = {
            id: Date.now(), name: form.name.trim(),
            amount: parseFloat(form.amount), day,
            cat2: form.cat2, type: form.type, lastRun: '',
        };
        updateData(prev => ({ ...prev, subs: [...prev.subs, newSub] }));
        saveData({ ...data, subs: [...data.subs, newSub] });
        setForm({ name:'', amount:'', day:'', cat2:'', type:'expense' });
        showToast('订阅已添加');
    };

    const handleDelete = (idx) => {
        if (!window.confirm('确定删除该订阅？')) return;
        updateData(prev => ({ ...prev, subs: prev.subs.filter((_, i) => i !== idx) }));
        saveData({ ...data });
        showToast('订阅已删除');
    };

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <h3 style={{ marginTop:0, borderBottom:'1px solid #eee', paddingBottom:12 }}>周期订阅管理</h3>

                <div style={{ display:'grid', gap:10, marginBottom:15 }}>
                    <select
                        className="form-control"
                        value={form.type}
                        onChange={e => setForm(f => ({ ...f, type: e.target.value, cat2: '' }))}
                    >
                        <option value="expense">支出 (Expense)</option>
                        <option value="income">收入 (Income)</option>
                    </select>
                    <input className="form-control" placeholder="订阅名称（如：公积金/会员）"
                        value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    <input className="form-control" type="number" placeholder="金额"
                        value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                    <input className="form-control" type="number" placeholder="每月扣款/入账日（1-31）" min="1" max="31"
                        value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))} />
                    <select
                        className="form-control"
                        value={form.cat2}
                        onChange={e => setForm(f => ({ ...f, cat2: e.target.value }))}
                        dangerouslySetInnerHTML={{ __html: '<option value="">选择分类</option>' + catOptsHtml }}
                    />
                </div>

                <button className="btn btn-primary" style={{ width:'100%', marginBottom:10 }} onClick={handleAdd}>
                    添加订阅
                </button>

                {/* 订阅列表 */}
                <div style={{ maxHeight:300, overflowY:'auto', border:'1px solid #eee', borderRadius:8, marginBottom:15 }}>
                    {data.subs.length === 0
                        ? <div style={{ padding:20, textAlign:'center', color:'#aaa' }}>暂无订阅</div>
                        : data.subs.map((s, i) => (
                            <div key={s.id} style={{ display:'flex', justifyContent:'space-between', padding:12, borderBottom:'1px solid #eee', alignItems:'center' }}>
                                <div style={{ flex:1 }}>
                                    <div style={{ fontWeight:600, marginBottom:4 }}>{s.name}</div>
                                    <div style={{ fontSize:11, color:'#999' }}>每月{s.day}号 | ¥{s.amount} | {s.cat2}</div>
                                </div>
                                <button className="btn-icon" style={{ color:'red' }} onClick={() => handleDelete(i)}>×</button>
                            </div>
                        ))
                    }
                </div>

                <button className="btn btn-outline" onClick={onClose}>关闭</button>
            </div>
        </div>
    );
}
