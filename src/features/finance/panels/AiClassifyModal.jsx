// ============================================================
// Finance Pro — AiClassifyModal AI 自动分类
// 调用 OpenAI-compatible API，批量对未分类账单推断分类
// ============================================================

import { useState, useMemo } from 'react';

const LS_KEY = 'finance_ai_config';

function loadConfig() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveConfig(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch {}
}

// 构建分类指令 prompt
// 把 cats 和 bills 列表注入 prompt，要求返回纯 JSON 数组
function buildPrompt(cats, bills) {
    const expLines = cats
        .filter(c => c.type === 'expense').sort((a, b) => a.sort - b.sort)
        .map(c => `  ${c.id}: ${c.name}（${c.group}）`).join('\n');
    const incLines = cats
        .filter(c => c.type === 'income').sort((a, b) => a.sort - b.sort)
        .map(c => `  ${c.id}: ${c.name}（${c.group}）`).join('\n');
    const billLines = bills
        .map((b, i) => `[${i}] ${b.realType === 'income' ? 'income' : 'expense'} | ${b.desc}`)
        .join('\n');

    return `你是一个账单自动分类助手。根据以下分类列表，为每条账单分配最合适的分类ID。

【支出分类】
${expLines}

【收入分类】
${incLines}

【任务】
以下是账单列表，格式为 [序号] 类型 | 描述。
请输出一个 JSON 数组，长度与账单列表完全相同，每个元素是对应账单最匹配的分类ID（字符串），
无法判断时填 null。只输出 JSON 数组，不要任何其他文字或 markdown 代码块。

账单列表：
${billLines}`;
}

// STATUS 枚举，禁止用 null/boolean 混合表达状态
const STATUS = { IDLE: 'idle', LOADING: 'loading', DONE: 'done', ERROR: 'error' };

export default function AiClassifyModal({ open, onClose, bills, cats, onApply }) {
    const saved = loadConfig();
const [apiBase, setApiBase] = useState(saved.apiBase || 'http://localhost:1234/v1');
const [apiKey,  setApiKey]  = useState(saved.apiKey  || '');
const [model,   setModel]   = useState(saved.model   || 'qwen2.5-coder-1.5b-instruct');
    const [status,  setStatus]  = useState(STATUS.IDLE);
    const [errorMsg, setErrorMsg] = useState('');
    const [results,  setResults]  = useState([]); // [{ bill, catId }]

    // 仅对未分类、非转账行操作
    const pending = useMemo(
        () => bills.filter(b => !b.isIgnored && !b.cat && b.mode !== 'transfer'),
        [bills]
    );

    // catId → 显示名，供结果预览用
    const catDisplayMap = useMemo(() => {
        const m = {};
        cats.forEach(c => { m[c.id] = `${c.icon} ${c.name}`; });
        return m;
    }, [cats]);

    if (!open) return null;

    const handleClassify = async () => {
const isLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
if (!isLocal && !apiKey.trim()) { setErrorMsg('请填写 API Key（本地 Ollama 不需要填）'); return; }
        if (pending.length === 0) { setErrorMsg('没有待分类的条目（已有分类的行自动跳过）'); return; }

        // 持久化配置，方便下次打开免填
        saveConfig({ apiBase: apiBase.trim(), apiKey: apiKey.trim(), model: model.trim() });

        setStatus(STATUS.LOADING);
        setErrorMsg('');
        setResults([]);

        const prompt = buildPrompt(cats, pending);
        const endpoint = `${apiBase.trim().replace(/\/$/, '')}/chat/completions`;

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey.trim() ? { 'Authorization': `Bearer ${apiKey.trim()}` } : {}),
                },
                body: JSON.stringify({
                    model: model.trim(),
                    temperature: 0,
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}：${errText.slice(0, 300)}`);
            }

            const json = await res.json();
            const raw  = json?.choices?.[0]?.message?.content || '';

            // 去掉模型可能输出的 markdown 代码块标记再解析
            const cleaned = raw.replace(/```json|```/gi, '').trim();
            let catIds;
            try {
                catIds = JSON.parse(cleaned);
            } catch {
                throw new Error(`AI 返回格式无法解析，原始内容：${raw.slice(0, 300)}`);
            }

            if (!Array.isArray(catIds)) {
                throw new Error(`期望 JSON 数组，实际返回：${raw.slice(0, 200)}`);
            }

            // 验证 catId 合法性：AI 幻觉可能返回不存在的 id，一律视为 null
            const validIds = new Set(cats.map(c => c.id));
            const matched = pending.map((b, i) => {
                const catId = catIds[i];
                return { bill: b, catId: (catId && validIds.has(catId)) ? catId : null };
            });

            setResults(matched);
            setStatus(STATUS.DONE);

        } catch (e) {
            setErrorMsg(e.message || String(e));
            setStatus(STATUS.ERROR);
        }
    };

    const handleApply = () => {
        results.filter(r => r.catId).forEach(r => onApply(r.bill.id, r.catId));
        onClose();
    };

    const hitCount = results.filter(r => r.catId).length;

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width: 480 }}>
                {/* 标题栏 */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, borderBottom:'1px solid #EDF2F7', paddingBottom:12 }}>
                    <h3 style={{ margin:0 }}>🧠 AI 自动分类</h3>
                    <button className="btn-icon" style={{ fontSize:20 }} onClick={onClose}>×</button>
                </div>

                {/* 配置区 */}
                <div style={{ display:'grid', gap:10, marginBottom:16 }}>
                    <div>
                        <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>API Base URL</div>
                        <input
                            className="form-control"
                            placeholder="https://api.deepseek.com/v1"
                            value={apiBase}
                            onChange={e => setApiBase(e.target.value)}
                            disabled={status === STATUS.LOADING}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>API Key</div>
                        <input
                            className="form-control"
                            type="password"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            disabled={status === STATUS.LOADING}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize:12, color:'#718096', marginBottom:4 }}>模型</div>
                        <input
                            className="form-control"
                            placeholder="deepseek-chat"
                            value={model}
                            onChange={e => setModel(e.target.value)}
                            disabled={status === STATUS.LOADING}
                        />
                    </div>
                </div>

                {/* 状态说明栏 */}
                <div style={{ fontSize:13, color:'#718096', marginBottom:12, padding:'8px 12px', background:'#F7FAFC', borderRadius:8 }}>
                    {status === STATUS.IDLE    && <>待分类 <b>{pending.length}</b> 条（已有分类的行自动跳过）</>}
                    {status === STATUS.LOADING && <>🔄 请求中，请稍候…</>}
                    {status === STATUS.ERROR   && <span style={{ color:'#E53935' }}>❌ 请求失败</span>}
                    {status === STATUS.DONE    && (
                        <>✅ 完成！命中 <b style={{ color:'#38A169' }}>{hitCount}</b> / {pending.length} 条
                        {hitCount < pending.length && (
                            <span style={{ color:'#E53935' }}>，{pending.length - hitCount} 条无法判断（保持空白，可手动选）</span>
                        )}</>
                    )}
                </div>

                {/* 错误详情 */}
                {errorMsg && (
                    <div style={{ fontSize:12, color:'#E53935', marginBottom:12, padding:'8px 12px', background:'#FFF5F5', borderRadius:8, wordBreak:'break-all' }}>
                        {errorMsg}
                    </div>
                )}

                {/* 结果预览列表 */}
                {status === STATUS.DONE && results.length > 0 && (
                    <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid #EDF2F7', borderRadius:8, marginBottom:14 }}>
                        {results.map(r => (
                            <div key={r.bill.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px', borderBottom:'1px solid #F7FAFC', fontSize:12 }}>
                                <span style={{ flex:1, color:'#2D3748', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8 }}>
                                    {r.bill.desc}
                                </span>
                                {r.catId
                                    ? <span style={{ color:'#38A169', fontWeight:600, flexShrink:0 }}>{catDisplayMap[r.catId] || r.catId}</span>
                                    : <span style={{ color:'#CBD5E0', flexShrink:0 }}>未识别</span>
                                }
                            </div>
                        ))}
                    </div>
                )}

                {/* 操作按钮 */}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button className="btn btn-outline" onClick={onClose}>
                        {status === STATUS.DONE ? '关闭' : '取消'}
                    </button>
                    {status !== STATUS.DONE
                        ? (
                            <button
                                className="btn btn-primary"
                                style={{ background:'#5F27CD', borderColor:'#5F27CD' }}
                                disabled={status === STATUS.LOADING || pending.length === 0}
                                onClick={handleClassify}
                            >
                                {status === STATUS.LOADING ? '分类中…' : `🧠 开始分类（${pending.length} 条）`}
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                disabled={hitCount === 0}
                                onClick={handleApply}
                            >
                                ✅ 应用结果（{hitCount} 条）
                            </button>
                        )
                    }
                </div>
            </div>
        </div>
    );
}