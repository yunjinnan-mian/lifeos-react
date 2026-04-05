// ============================================================
// Finance Pro — AiClassifyModal AI 自动分类
// 支持每个分类自定义说明，注入 prompt 提升识别准确率
// ============================================================

import { useState, useMemo, useRef } from 'react';

const LS_KEY     = 'finance_ai_config';
const HINTS_KEY  = 'finance_ai_hints'; // 每个 catId 的自定义说明

function loadConfig() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function saveConfig(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {} }
function loadHints() { try { return JSON.parse(localStorage.getItem(HINTS_KEY) || '{}'); } catch { return {}; } }
function saveHints(h) { try { localStorage.setItem(HINTS_KEY, JSON.stringify(h)); } catch {} }

// 根据 domain 给出默认说明，用户可以覆盖
const DEFAULT_HINT = {
    food:      '正餐、外卖、零食、饮料、超市食品，如：餐厅名、外卖订单、山药粉、面包、巧克力',
    home:      '家里添置的非消耗类物品，如：架子、床、四件套、勺子、喷水壶、胶带切割器',
    transport: '出行交通，如：地铁、公交、单车、打车、滴滴',
    health:    '药品和补品，如：铝镁加、甘氨酸镁、维生素D、药店购买',
    supplies:  '日常消耗品，如：纸巾、卫生巾、本子、笔、洗护用品',
    telecom:   '话费和订阅会员，如：中国移动话费、爱奇艺、腾讯视频、宽带费',
    explore:   '衣物、兴趣爱好相关购买，如：内裤、袜子、T恤、花肥、宠物用品',
    income:    '工资、奖金、转账收入',
};

// 构建 prompt，把每个分类的自定义说明注入进去
function buildSinglePrompt(cats, bill, hints) {
    const catLines = cats
        .sort((a, b) => a.sort - b.sort)
        .map(c => {
            const hint = hints[c.id] || DEFAULT_HINT[c.domain] || '';
            return `  ${c.id} [${c.name}]：${hint}`;
        }).join('\n');

    return `你是一个账单自动分类助手。根据账单描述，从以下分类中选出最匹配的，输出其ID。

【分类定义】
${catLines}

【待分类账单】
类型：${bill.realType === 'income' ? '收入' : '支出'}
描述：${bill.desc}

只输出一个分类ID（如 cat_001），完全无法判断时输出 null，不要任何其他文字。`;
}

// ── useAiClassify hook（暴露给父组件）───────────────────────
export function useAiClassify() {
    const [running,  setRunning]  = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0, hit: 0 });
    const stopRef = useRef(false);

    const start = async ({ apiBase, apiKey, model, pending, cats, hints, validIds, onApply }) => {
        stopRef.current = false;
        setRunning(true);
        setProgress({ done: 0, total: pending.length, hit: 0 });

        const endpoint = `${apiBase.trim().replace(/\/$/, '')}/chat/completions`;
        let hit = 0;

        for (let i = 0; i < pending.length; i++) {
            if (stopRef.current) break;
            try {
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
                            { role: 'system', content: '你只能输出一个分类ID或null，不要任何其他内容。' },
                            { role: 'user', content: buildSinglePrompt(cats, pending[i], hints) },
                        ],
                    }),
                });
                if (res.ok) {
                    const json = await res.json();
                    const raw  = (json?.choices?.[0]?.message?.content || '').trim();
                    if (raw && raw !== 'null' && validIds.has(raw)) {
                        onApply(pending[i].id, raw);
                        hit++;
                    }
                }
            } catch (_) {}

            setProgress({ done: i + 1, total: pending.length, hit });
        }
        setRunning(false);
    };

    const stop = () => { stopRef.current = true; };
    return { running, progress, start, stop };
}

// ── 主弹窗组件 ───────────────────────────────────────────────
export default function AiClassifyModal({ open, onClose, bills, cats, onApply, aiClassify }) {
    const saved = loadConfig();
    const [apiBase, setApiBase]   = useState(saved.apiBase || 'http://127.0.0.1:1234/v1');
    const [apiKey,  setApiKey]    = useState(saved.apiKey  || '');
    const [model,   setModel]     = useState(saved.model   || 'qwen2.5-coder-1.5b-instruct');
    const [hints,   setHints]     = useState(() => loadHints());
    const [showHints, setShowHints] = useState(false);
    const [error,   setError]     = useState('');

    const pending  = useMemo(() => bills.filter(b => !b.isIgnored && !b.cat && b.mode !== 'transfer'), [bills]);
    const validIds = useMemo(() => new Set(cats.map(c => c.id)), [cats]);

    if (!open) return null;

    const updateHint = (catId, val) => {
        const next = { ...hints, [catId]: val };
        setHints(next);
        saveHints(next);
    };

    const handleStart = () => {
        const isLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
        if (!isLocal && !apiKey.trim()) { setError('请填写 API Key'); return; }
        if (pending.length === 0) { setError('没有待分类的条目'); return; }
        saveConfig({ apiBase: apiBase.trim(), apiKey: apiKey.trim(), model: model.trim() });
        onClose();
        aiClassify.start({ apiBase, apiKey, model, pending, cats, hints, validIds, onApply });
    };

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

                {/* 标题 */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, borderBottom:'1px solid #EDF2F7', paddingBottom:12, flexShrink:0 }}>
                    <h3 style={{ margin:0 }}>🧠 AI 自动分类</h3>
                    <button className="btn-icon" style={{ fontSize:20 }} onClick={onClose}>×</button>
                </div>

                {/* 滚动区域 */}
                <div style={{ overflowY: 'auto', flex: 1 }}>

                    {/* API 配置 */}
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

                    {/* 分类说明折叠区 */}
                    <div style={{ marginBottom:16, border:'1px solid #EDF2F7', borderRadius:8, overflow:'hidden' }}>
                        <button
                            onClick={() => setShowHints(v => !v)}
                            style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#F7FAFC', border:'none', cursor:'pointer', fontSize:13, color:'#4A5568', fontWeight:600 }}
                        >
                            <span>📝 分类说明（告诉 AI 每个分类的含义，提升识别率）</span>
                            <span style={{ fontSize:10, color:'#A0AEC0' }}>{showHints ? '▲ 收起' : '▼ 展开'}</span>
                        </button>

                        {showHints && (
                            <div style={{ padding:'12px 14px', display:'grid', gap:10 }}>
                                <div style={{ fontSize:12, color:'#718096', marginBottom:2 }}>
                                    用你自己的话描述每个分类，例如典型的账单名称或消费场景。修改后自动保存。
                                </div>
                                {cats.filter(c => c.type === 'expense').sort((a,b) => a.sort - b.sort).map(c => (
                                    <div key={c.id}>
                                        <div style={{ fontSize:12, fontWeight:600, color:'#2D3748', marginBottom:3 }}>
                                            {c.icon} {c.name}
                                        </div>
                                        <textarea
                                            rows={2}
                                            className="form-control"
                                            style={{ fontSize:12, resize:'vertical' }}
                                            placeholder={DEFAULT_HINT[c.domain] || '描述这个分类包含哪些账单…'}
                                            value={hints[c.id] ?? ''}
                                            onChange={e => updateHint(c.id, e.target.value)}
                                        />
                                    </div>
                                ))}
                                {cats.filter(c => c.type === 'income').sort((a,b) => a.sort - b.sort).map(c => (
                                    <div key={c.id}>
                                        <div style={{ fontSize:12, fontWeight:600, color:'#2D3748', marginBottom:3 }}>
                                            {c.icon} {c.name}（收入）
                                        </div>
                                        <textarea
                                            rows={2}
                                            className="form-control"
                                            style={{ fontSize:12, resize:'vertical' }}
                                            placeholder={DEFAULT_HINT[c.domain] || '描述这个分类包含哪些收入…'}
                                            value={hints[c.id] ?? ''}
                                            onChange={e => updateHint(c.id, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div style={{ fontSize:12, color:'#E53935', marginBottom:12, padding:'8px 12px', background:'#FFF5F5', borderRadius:8 }}>
                            {error}
                        </div>
                    )}

                    <div style={{ fontSize:13, color:'#718096', marginBottom:14, padding:'8px 12px', background:'#F7FAFC', borderRadius:8 }}>
                        待分类 <b>{pending.length}</b> 条，点击开始后弹窗关闭，后台自动识别并应用。
                    </div>
                </div>

                {/* 底部按钮（固定） */}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:12, borderTop:'1px solid #EDF2F7', flexShrink:0 }}>
                    <button className="btn btn-outline" onClick={onClose}>取消</button>
                    <button
                        className="btn btn-primary"
                        style={{ background:'#5F27CD', borderColor:'#5F27CD' }}
                        disabled={pending.length === 0}
                        onClick={handleStart}
                    >
                        🧠 开始分类（{pending.length} 条）
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── 后台进度浮条 ────────────────────────────────────────────
export function AiClassifyProgressBar({ aiClassify }) {
    const { running, progress, stop } = aiClassify;
    if (!running && progress.done === 0) return null;

    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

    return (
        <div style={{
            position:'fixed', bottom:24, right:24, zIndex:9999,
            background:'#fff', border:'1px solid #EDF2F7',
            borderRadius:12, padding:'12px 16px', minWidth:260,
            boxShadow:'0 4px 20px rgba(0,0,0,0.12)',
            display:'flex', flexDirection:'column', gap:8,
        }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13 }}>
                <span style={{ color:'#2D3748', fontWeight:600 }}>
                    {running ? '🧠 AI 分类中…' : '✅ 分类完成'}
                </span>
                <span style={{ color:'#718096', fontSize:12 }}>
                    {progress.done} / {progress.total} · 已应用 <b style={{ color:'#38A169' }}>{progress.hit}</b> 条
                </span>
            </div>
            <div style={{ height:5, background:'#EDF2F7', borderRadius:99, overflow:'hidden' }}>
                <div style={{
                    height:'100%', width:`${pct}%`,
                    background: running ? '#5F27CD' : '#38A169',
                    borderRadius:99, transition:'width 0.3s',
                }} />
            </div>
            {running && (
                <button onClick={stop} style={{ fontSize:11, color:'#E53935', background:'none', border:'none', cursor:'pointer', textAlign:'right', padding:0 }}>
                    ⏹ 停止
                </button>
            )}
        </div>
    );
}