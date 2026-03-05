// ============================================================
// Finance Pro — CategoryModal 分类管理
// ============================================================

import { useState } from 'react';
import { useFinance } from '../index';
import { CAT_GROUPS, DOMAIN_OPTS } from '../utils/constants';
import { getDomainLabel } from '../utils/catMap';

export default function CategoryModal({ open, onClose }) {
    const { data, updateData, saveData, showToast } = useFinance();
    const [tab,     setTab]     = useState('expense');
    const [editId,  setEditId]  = useState(null);   // 当前打开内联编辑的 catId
    const [editForm, setEditForm] = useState({});

    if (!open) return null;

    const cats = data.cats.filter(c => c.type === tab).sort((a, b) => a.sort - b.sort);

    const openEdit = (cat) => {
        setEditId(cat.id);
        setEditForm({ icon: cat.icon, name: cat.name, group: cat.group, domain: cat.domain, color: cat.color });
    };
    const closeEdit = () => setEditId(null);

    const saveEdit = (id) => {
        updateData(prev => ({
            ...prev,
            cats: prev.cats.map(c => c.id !== id ? c : {
                ...c,
                icon:   editForm.icon   || c.icon,
                name:   editForm.name   || c.name,
                group:  editForm.group  || c.group,
                domain: editForm.domain || c.domain,
                color:  editForm.color  || c.color,
            }),
        }));
        setEditId(null);
        showToast('已修改，记得点"保存并同步云端"');
    };

    const handleSave = () => {
        saveData({ ...data });
        showToast('✅ 分类已保存并同步云端');
        onClose();
    };

    const groupOpts = CAT_GROUPS[tab].map(g => <option key={g} value={g}>{g}</option>);
    const domainOpts = DOMAIN_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>);

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width:520, maxHeight:'85vh' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <h3 style={{ margin:0 }}>⚙️ 分类管理</h3>
                    <button className="btn-icon" style={{ fontSize:20 }} onClick={onClose}>×</button>
                </div>
                <p style={{ fontSize:12, color:'#A0AEC0', marginBottom:16 }}>
                    点击铅笔图标修改名称和外观。分组和生活域可切换，不影响历史数据统计。
                </p>

                {/* Tab */}
                <div className="cat-tab-bar">
                    <button className={`cat-tab${tab === 'expense' ? ' active' : ''}`} onClick={() => setTab('expense')}>⚔️ 支出分类</button>
                    <button className={`cat-tab${tab === 'income'  ? ' active' : ''}`} onClick={() => setTab('income') }>💰 收入分类</button>
                </div>

                {/* 列表 */}
                <div style={{ maxHeight:420, overflowY:'auto', paddingRight:4 }}>
                    {cats.length === 0
                        ? <div style={{ textAlign:'center', color:'#A0AEC0', padding:30 }}>暂无分类</div>
                        : cats.map(c => (
                            <div key={c.id}>
                                {/* 分类行 */}
                                <div className="cat-row">
                                    <div className="cat-icon-preview">{c.icon}</div>
                                    <div className="cat-row-body">
                                        <span className="cat-row-name">{c.name}</span>
                                        <span className="cat-chip cat-chip-group">{c.group}</span>
                                        <span className="cat-chip cat-chip-domain">{getDomainLabel(c.domain)}</span>
                                    </div>
                                    <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                                        <div style={{ width:14, height:14, borderRadius:'50%', background:c.color, border:'1px solid #E2E8F0' }} />
                                        <button className="btn-icon" style={{ fontSize:16, color:'#718096' }} onClick={() => editId === c.id ? closeEdit() : openEdit(c)} title="编辑">
                                            <i className="ri-pencil-line" />
                                        </button>
                                    </div>
                                </div>

                                {/* 内联编辑 */}
                                {editId === c.id && (
                                    <div className="cat-edit-form open">
                                        <div className="cat-edit-identity">
                                            <div className="cat-edit-icon-wrap">
                                                <div className="cat-edit-label">图标</div>
                                                <input className="cat-edit-input" style={{ fontSize:22, textAlign:'center', padding:4 }}
                                                    value={editForm.icon}
                                                    onChange={e => setEditForm(f => ({ ...f, icon: e.target.value }))} />
                                            </div>
                                            <div>
                                                <div className="cat-edit-label">显示名称</div>
                                                <input className="cat-edit-input" placeholder="分类名称"
                                                    value={editForm.name}
                                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="cat-edit-classify">
                                            <div>
                                                <div className="cat-edit-label">分组</div>
                                                <select className="cat-group-select" value={editForm.group}
                                                    onChange={e => setEditForm(f => ({ ...f, group: e.target.value }))}>{groupOpts}</select>
                                            </div>
                                            <div>
                                                <div className="cat-edit-label">生活域</div>
                                                <select className="cat-group-select" value={editForm.domain}
                                                    onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))}>{domainOpts}</select>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="cat-edit-label">颜色</div>
                                            <div className="cat-edit-color-row">
                                                <div className="cat-color-swatch" style={{ background: editForm.color }} />
                                                <input type="color" className="cat-color-picker" value={editForm.color}
                                                    onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                                            <button className="btn btn-outline" onClick={closeEdit}>取消</button>
                                            <button className="btn btn-primary" onClick={() => saveEdit(c.id)}>保存</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    }
                </div>

                <div style={{ marginTop:16, textAlign:'right' }}>
                    <button className="btn btn-primary" onClick={handleSave}>💾 保存并同步云端</button>
                </div>
            </div>
        </div>
    );
}
