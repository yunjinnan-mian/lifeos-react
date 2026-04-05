// ============================================================
// Finance Pro — AiClassifyModal AI 自动分类
// 点击开始后弹窗立刻关闭，后台逐条识别并自动应用
// ============================================================

import { useState, useMemo, useRef } from 'react';

const LS_KEY = 'finance_ai_config';
function loadConfig() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveConfig(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {}
}

// domain 值 → 中文含义
const DOMAIN_LABEL = {
    food:      '餐饮食物（餐厅、外卖、超市食品、饮料零食）',
    home:      '住房物业（房租、水电、物业、家居用品、家装）',
    transport: '交通出行（打车、公交、地铁、加油、停车）',
    health:    '医疗健康（药品、医院、保健品、个人护理）',
    supplies:  '日用消耗（洗护用品、文具、清洁用品）',
    telecom:   '通讯网络（手机话费、宽带、会员订阅）',
    explore:   '购物娱乐（服装、电子产品、游戏、旅游）',
    income:    '收入',
};

// domain → 典型账单描述示例（用于 few-shot）
const DOMAIN_EXAMPLE = {
    food:      ['麦当劳', '美团外卖', '星巴克', '胖东来超市', '盒马生鲜'],
    home:      ['物业费', '水费', '电费', '宜家家居', 'IKEA'],
    transport: ['滴滴出行', '地铁', '加油站', '高铁票', 'ETC'],
    health:    ['药店', '挂号费', '体检', '眼镜店', '理发'],
    supplies:  ['纸巾', '洗发水', '文具', '垃圾袋', '清洁用品'],
    telecom:   ['中国移动话费', '宽带费', 'Netflix', '爱奇艺会员', '腾讯视频'],
    explore:   ['淘宝', '京东', '服装店', 'Steam', '电影票'],
};

function buildSinglePrompt(cats, bill) {
    // 每个分类取 icon+name+domain，作为最清晰的标签
    const expLines = cats
        .filter(c => c.type === 'expense').sort((a, b) => a.sort - b.sort)
        .map(c => `  ${c.id}: ${c.name}（含义：${DOMAIN_LABEL[c.domain] || c.domain}）`).join('\n');
    const incLines = cats
        .filter(c => c.type === 'income').sort((a, b) => a.sort - b.sort)
        .map(c => `  ${c.id}: ${c.name}（含义：${DOMAIN_LABEL[c.domain] || c.domain}）`).join('\n');

    // 从现有分类自动生成 few-shot 示例，帮助模型理解映射关系
    const examples = cats.filter(c => DOMAIN_EXAMPLE[c.domain]).map(c => {
        const exampleDescs = DOMAIN_EXAMPLE[c.domain] || [];
        return exampleDescs.map(desc => `账单：${desc} → ${c.id}`).join('\n');
    }).flat().join('\n');

    return `你是一个账单自动分类助手。根据账单描述，从以下分类中选出最匹配的一个，输出其ID。

【分类列表】
${expLines}
${incLines}

【示例】（仅供理解分类含义，不是真实数据）
${examples}

【待分类账单】
类型：${bill.realType === 'income' ? '收入' : '支出'}
描述：${bill.desc}

规则：只输出一个分类ID（如 cat_001），无法判断时输出 null，不要任何其他文字。`;
}

// 这个 hook 暴露给父组件用，管理后台分类任务的状态
// 用法：const aiClassify = useAiClassify(); 然后传给 AiClassifyModal
export function useAiClassify() {
    const [running, setRunning]   = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0, hit: 0 });
    const stopRef = useRef(false);

    const start = async ({ apiBase, apiKey, model, pending, cats, validIds, onApply }) => {
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
                            { role: 'system', content: '你只能输出一个分类ID字符串或null，不要任何其他内容。' },
                            { role: 'user', content: buildSinglePrompt(cats, pending[i]) },
                        ],
                    }),
                });
                if (res.ok) {
                    const json = await res.json();
                    const raw = (json?.choices?.[0]?.message?.content || '').trim();
                    if (raw && raw !== 'null' && validIds.has(raw)) {
                        onApply(pending[i].id, raw);
                        hit++;
                    }
                }
            } catch (_) { /* 单条失败静默跳过 */ }

            setProgress({ done: i + 1, total: pending.length, hit });
        }

        setRunning(false);
    };

    const stop = () => { stopRef.current = true; };

    return { running, progress, start, stop };
}

// ── 主组件 ──────────────────────────────────────────────────
export default function AiClassifyModal({ open, onClose, bills, cats, onApply, aiClassify }) {
    const saved = loadConfig();
    const [apiBase, setApiBase] = useState(saved.apiBase || 'http://127.0.0.1:1234/v1');
    const [apiKey,  setApiKey]  = useState(saved.apiKey  || '');
    const [model,   setModel]   = useState(saved.model   || 'qwen2.5-coder-1.5b-instruct');
    const [error,   setError]   = useState('');

    const pending = useMemo(
        () => bills.filter(b => !b.isIgnored && !b.cat && b.mode !== 'transfer'),
        [bills]
    );

    const validIds = useMemo(() => new Set(cats.map(c => c.id)), [cats]);

    if (!open) return null;

    const handleStart = () => {
        const isLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
        if (!isLocal && !apiKey.trim()) { setError('请填写 API Key'); return; }
        if (pending.length === 0) { setError('没有待分类的条目'); return; }

        saveConfig({ apiBase: apiBase.trim(), apiKey: apiKey.trim(), model: model.trim() });

        // 先关弹窗，再开始后台任务
        onClose();
        aiClassify.start({ apiBase, apiKey, model, pending, cats, validIds, onApply });
    };

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width: 460 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, borderBottom:'1px solid #EDF2F7', paddingBottom:12 }}>
                    <h3 style={{ margin:0 }}>🧠 AI 自动分类</h3>
                    <button className="btn-icon" style={{ fontSize:20 }} onClick={onClose}>×</button>
                </div>

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

                {error && (
                    <div style={{ fontSize:12, color:'#E53935', marginBottom:12, padding:'8px 12px', background:'#FFF5F5', borderRadius:8 }}>
                        {error}
                    </div>
                )}

                <div style={{ fontSize:13, color:'#718096', marginBottom:14, padding:'8px 12px', background:'#F7FAFC', borderRadius:8 }}>
                    待分类 <b>{pending.length}</b> 条，点击开始后弹窗关闭，后台自动识别并应用。
                </div>

                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
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

// ── 后台进度浮条（放在页面任意位置，running 时自动出现）──
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
                <button
                    onClick={stop}
                    style={{ fontSize:11, color:'#E53935', background:'none', border:'none', cursor:'pointer', textAlign:'right', padding:0 }}
                >
                    ⏹ 停止
                </button>
            )}
        </div>
    );
}