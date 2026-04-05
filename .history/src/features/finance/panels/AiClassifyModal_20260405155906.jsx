// ============================================================
// Finance Pro — AiClassifyModal AI 自动分类
// 逐条发送，每条完成立即应用，实时显示进度
// ============================================================

import { useState, useMemo, useRef } from 'react';

const LS_KEY = 'finance_ai_config';
function loadConfig() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveConfig(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {}
}

// 单条账单分类 prompt，只返回一个 catId 字符串或 null
function buildSinglePrompt(cats, bill) {
    const expLines = cats
        .filter(c => c.type === 'expense').sort((a, b) => a.sort - b.sort)
        .map(c => `  ${c.id}: ${c.name}（${c.group}）`).join('\n');
    const incLines = cats
        .filter(c => c.type === 'income').sort((a, b) => a.sort - b.sort)
        .map(c => `  ${c.id}: ${c.name}（${c.group}）`).join('\n');

    return `你是一个账单自动分类助手。根据以下分类列表，为账单分配最合适的分类ID。

【支出分类】
${expLines}

【收入分类】
${incLines}

【账单】
类型：${bill.realType === 'income' ? 'income' : 'expense'}
描述：${bill.desc}

只输出一个分类ID字符串（如 cat_001），无法判断时输出 null。不要任何其他文字。`;
}

const ROW = { PENDING: 'pending', LOADING: 'loading', HIT: 'hit', MISS: 'miss', ERROR: 'error' };
const STATUS = { IDLE: 'idle', LOADING: 'loading', DONE: 'done' };

export default function AiClassifyModal({ open, onClose, bills, cats, onApply }) {
    const saved = loadConfig();
    const [apiBase, setApiBase] = useState(saved.apiBase || 'http://127.0.0.1:1234/v1');
    const [apiKey,  setApiKey]  = useState(saved.apiKey  || '');
    const [model,   setModel]   = useState(saved.model   || 'qwen2.5-coder-1.5b-instruct');
    const [status,  setStatus]  = useState(STATUS.IDLE);
    const [rows,    setRows]    = useState([]);
    const stopRef = useRef(false);

    const pending = useMemo(
        () => bills.filter(b => !b.isIgnored && !b.cat && b.mode !== 'transfer'),
        [bills]
    );

    const catDisplayMap = useMemo(() => {
        const m = {};
        cats.forEach(c => { m[c.id] = `${c.icon} ${c.name}`; });
        return m;
    }, [cats]);

    if (!open) return null;

    const validIds = new Set(cats.map(c => c.id));

    const updateRow = (index, patch) => {
        setRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
        });
    };

    const handleClassify = async () => {
        const isLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
        if (!isLocal && !apiKey.trim()) { alert('请填写 API Key'); return; }
        if (pending.length === 0) { alert('没有待分类的条目'); return; }

        saveConfig({ apiBase: apiBase.trim(), apiKey: apiKey.trim(), model: model.trim() });
        stopRef.current = false;

        setRows(pending.map(b => ({ bill: b, rowStatus: ROW.PENDING, catId: null, error: '' })));
        setStatus(STATUS.LOADING);

        const endpoint = `${apiBase.trim().replace(/\/$/, '')}/chat/completions`;

        for (let i = 0; i < pending.length; i++) {
            if (stopRef.current) break;

            updateRow(i, { rowStatus: ROW.LOADING });

            try {
                const prompt = buildSinglePrompt(cats, pending[i]);
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
                    },
                    body: JSON.stringify({
                        model: model.trim(),
                        temperature: 0,
                        messages: [
                            { role: 'system', content: '你只能输出一个分类ID字符串或null，不要任何其他内容。' },
                            { role: 'user', content: prompt },
                        ],
                    }),
                });

                if (!res.ok) {
                    const t = await res.text();
                    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
                }

                const json = await res.json();
                const raw = (json?.choices?.[0]?.message?.content || '').trim();
                const catId = (raw && raw !== 'null' && validIds.has(raw)) ? raw : null;

                updateRow(i, { rowStatus: catId ? ROW.HIT : ROW.MISS, catId });
                if (catId) onApply(pending[i].id, catId);

            } catch (e) {
                updateRow(i, { rowStatus: ROW.ERROR, error: e.message || String(e) });
            }
        }

        setStatus(STATUS.DONE);
    };

    const handleStop = () => { stopRef.current = true; };

    const doneCount  = rows.filter(r => [ROW.HIT, ROW.MISS, ROW.ERROR].includes(r.rowStatus)).length;
    const hitCount   = rows.filter(r => r.rowStatus === ROW.HIT).length;
    const errorCount = rows.filter(r => r.rowStatus === ROW.ERROR).length;
    const progress   = pending.length > 0 ? Math.round((doneCount / pending.length) * 100) : 0;

    const rowStatusStyle = {
        [ROW.PENDING]: { color: '#CBD5E0' },
        [ROW.LOADING]: { color: '#3182CE' },
        [ROW.HIT]:     { color: '#38A169', fontWeight: 600 },
        [ROW.MISS]:    { color: '#CBD5E0' },
        [ROW.ERROR]:   { color: '#E53935' },
    };

    const rowStatusText = (r) => {
        if (r.rowStatus === ROW.PENDING) return '等待中';
        if (r.rowStatus === ROW.LOADING) return '识别中…';
        if (r.rowStatus === ROW.HIT)     return catDisplayMap[r.catId] || r.catId;
        if (r.rowStatus === ROW.MISS)    return '未识别';
        if (r.rowStatus === ROW.ERROR)   return '错误';
        return '';
    };

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width: 500 }}>

                {/* 标题栏 */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, borderBottom:'1px solid #EDF2F7', paddingBottom:12 }}>
                    <h3 style={{ margin:0 }}>🧠 AI 自动分类</h3>
                    <button className="btn-icon" style={{ fontSize:20 }} onClick={onClose}>×</button>
                </div>

                {/* 配置区（仅 IDLE 时显示） */}
                {status === STATUS.IDLE && (
                    <div style={{ display:'grid', gap:10, marginBottom:16 }}>
                        <div>
                            <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>API Base URL</div>
                            <input className="form-control" placeholder="http://127.0.0.1:1234/v1"
                                value={apiBase} onChange={e => setApiBase(e.target.value)} />
                        </div>
                        <div>
                            <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>API Key</div>
                            <input className="form-control" type="password" placeholder="sk-... （本地可留空）"
                                value={apiKey} onChange={e => setApiKey(e.target.value)} />
                        </div>
                        <div>
                            <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>模型</div>
                            <input className="form-control" placeholder="deepseek-chat"
                                value={model} onChange={e => setModel(e.target.value)} />
                        </div>
                    </div>
                )}

                {/* 进度条 */}
                {status !== STATUS.IDLE && (
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#718096', marginBottom:4 }}>
                            <span>
                                {status === STATUS.LOADING ? `处理中 ${doneCount} / ${pending.length} 条` : `完成 ${doneCount} / ${pending.length} 条`}
                                {' · '}已应用 <b style={{ color:'#38A169' }}>{hitCount}</b> 条
                                {errorCount > 0 && <span style={{ color:'#E53935' }}> · 失败 {errorCount} 条</span>}
                            </span>
                            <span>{progress}%</span>
                        </div>
                        <div style={{ height:6, background:'#EDF2F7', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${progress}%`, background: status === STATUS.DONE ? '#38A169' : '#5F27CD', borderRadius:99, transition:'width 0.3s' }} />
                        </div>
                    </div>
                )}

                {/* 实时列表 */}
                {rows.length > 0 && (
                    <div style={{ maxHeight:260, overflowY:'auto', border:'1px solid #EDF2F7', borderRadius:8, marginBottom:14 }}>
                        {rows.map(r => (
                            <div key={r.bill.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px', borderBottom:'1px solid #F7FAFC', fontSize:12 }}>
                                <span style={{ flex:1, color:'#2D3748', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8 }}>
                                    {r.rowStatus === ROW.LOADING && <span style={{ marginRight:4 }}>⏳</span>}
                                    {r.bill.desc}
                                </span>
                                <span style={{ flexShrink:0, ...rowStatusStyle[r.rowStatus] }}>
                                    {rowStatusText(r)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* IDLE 提示 */}
                {status === STATUS.IDLE && (
                    <div style={{ fontSize:13, color:'#718096', marginBottom:12, padding:'8px 12px', background:'#F7FAFC', borderRadius:8 }}>
                        待分类 <b>{pending.length}</b> 条，逐条识别，识别后立即应用，无需等待全部完成。
                    </div>
                )}

                {/* 按钮 */}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button className="btn btn-outline" onClick={onClose}>
                        {status === STATUS.DONE ? '关闭' : '取消'}
                    </button>
                    {status === STATUS.IDLE && (
                        <button
                            className="btn btn-primary"
                            style={{ background:'#5F27CD', borderColor:'#5F27CD' }}
                            disabled={pending.length === 0}
                            onClick={handleClassify}
                        >
                            🧠 开始分类（{pending.length} 条）
                        </button>
                    )}
                    {status === STATUS.LOADING && (
                        <button
                            className="btn btn-outline"
                            style={{ color:'#E53935', borderColor:'#E53935' }}
                            onClick={handleStop}
                        >
                            ⏹ 停止
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}