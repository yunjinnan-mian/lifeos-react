// ============================================================
// Finance Pro — RuleModal 智能规则管理弹窗
// ============================================================

import { useState } from 'react';
import { useFinance } from '../index';
import { getCatName, getExpenseOpts, getIncomeOpts } from '../utils/catMap';

export default function RuleModal({ open, onClose, onRuleSaved }) {
    const { data, updateData, saveData, showToast } = useFinance();
    const [keyword, setKeyword] = useState('');
    const [catVal, setCatVal]   = useState('');

    if (!open) return null;

    const handleAdd = () => {
        if (!keyword.trim()) { showToast('请输入关键词', 'error'); return; }
        if (!catVal)         { showToast('请选择分类', 'error');   return; }
        const newRules = { ...data.rules, [keyword.trim()]: catVal };
        updateData(prev => ({ ...prev, rules: newRules }));
        saveData({ ...data, rules: newRules });
        onRuleSaved?.(keyword.trim(), catVal);   // 通知 Journal 回溯应用
        setKeyword('');
        showToast('规则已保存 ✓ 下次导入时自动匹配');
        onClose();
    };

    const handleDelete = (key) => {
        const newRules = { ...data.rules };
        delete newRules[key];
        updateData(prev => ({ ...prev, rules: newRules }));
        saveData({ ...data, rules: newRules });
    };

    const ruleKeys = Object.keys(data.rules);

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <h3 style={{ marginTop:0, borderBottom:'1px solid #eee', paddingBottom:12 }}>⚡ 智能规则管理</h3>
                <p style={{ fontSize:12, color:'#A0AEC0', marginBottom:14 }}>
                    规则使用「<b>包含匹配</b>」——只要交易描述里<b>含有</b>关键词就命中。<br />
                    建议填短关键词（如「麦当劳」），跨门店都能自动分类。
                </p>

                {/* 新增一行 */}
                <div style={{ display:'flex', gap:8, marginBottom:15, alignItems:'center' }}>
                    <input
                        className="form-control"
                        style={{ flex:'1.2' }}
                        placeholder="关键词（越短越通用）"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <i className="ri-arrow-right-line" style={{ color:'#CBD5E0', flexShrink:0 }} />
                    <select
                        className="form-control"
                        style={{ flex:1 }}
                        value={catVal}
                        onChange={e => setCatVal(e.target.value)}
                        dangerouslySetInnerHTML={{ __html:
                            '<option value="">选择分类</option>' +
                            getExpenseOpts(data.cats) + getIncomeOpts(data.cats)
                        }}
                    />
                    <button className="btn btn-primary" style={{ flexShrink:0 }} onClick={handleAdd}>添加</button>
                </div>

                {/* 规则列表 */}
                <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid #eee', borderRadius:8, marginBottom:15 }}>
                    {ruleKeys.length === 0
                        ? <div style={{ padding:'20px', textAlign:'center', color:'#aaa' }}>暂无规则</div>
                        : ruleKeys.map(k => (
                            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid #f5f5f5', alignItems:'center', gap:8 }}>
                                <span style={{ fontSize:12, color:'#718096', flexShrink:0 }}>包含</span>
                                <span style={{ flex:1, fontSize:13, fontWeight:600, color:'#2D3748', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k}</span>
                                <span style={{ fontSize:11, color:'#A0AEC0' }}>→</span>
                                <span style={{ fontSize:12, fontWeight:600, color:'var(--primary)', whiteSpace:'nowrap' }}>
                                    {getCatName(data.cats, data.rules[k])}
                                </span>
                                <button className="btn-icon" style={{ flexShrink:0 }} onClick={() => handleDelete(k)}>×</button>
                            </div>
                        ))
                    }
                </div>
                <button className="btn btn-outline" onClick={onClose}>关闭</button>
            </div>
        </div>
    );
}
