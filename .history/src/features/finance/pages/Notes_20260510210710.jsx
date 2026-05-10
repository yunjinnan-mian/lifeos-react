// ============================================================
// Finance Pro — Notes 备忘录 · 极简无压时间流
// 幽灵块 · 降噪时间线 · 自动保存到 finance_config.memoBlocks
// ============================================================

import { useState, useCallback, useRef, memo, useMemo } from 'react';
import { useFinance } from '../index';

// ════════════════════════════════════════════════════════════
// AutoResizeTextarea — 打字时自动拉长，无原生滚动条
// ════════════════════════════════════════════════════════════
const AutoResizeTextarea = memo(function AutoResizeTextarea({ value, onChange, placeholder, onBlur }) {
    const handleInput = (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    };

    const handleChange = (e) => {
        onChange(e);
        handleInput(e);
    };

    const handleInit = (el) => {
        if (el) {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }
    };

    return (
        <textarea
            ref={handleInit}
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            onInput={handleInput}
            placeholder={placeholder}
            className="w-full bg-transparent border-none resize-none outline-none focus:ring-0 p-0 text-sm leading-relaxed text-on-surface-variant focus:text-primary transition-colors overflow-hidden placeholder:text-outline-variant"
            rows={1}
            spellCheck={false}
        />
    );
});

// ════════════════════════════════════════════════════════════
// Notes — 主组件
// ════════════════════════════════════════════════════════════
const Notes = memo(function Notes() {
    const { data, updateData, saveData } = useFinance();

    // ── 兼容旧版纯文本迁移 ──────────────────────────────────
    // 如果 data 中有旧版 memo 字符串，会在组件挂载时自动迁移
    const blocks = useMemo(() => {
        return data.memoBlocks || [];
    }, [data.memoBlocks]);

    // ── 幽灵块状态 ──────────────────────────────────────────
    const [ghostText, setGhostText] = useState('');
    const saveTimerRef = useRef(null);

    const todayStr = useMemo(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
    }, []);

    const hasToday = useMemo(() => {
        return blocks.some(b => b.date === todayStr);
    }, [blocks, todayStr]);

    // ── 自动保存到 Firebase（防抖）────────────────────────
    const scheduleSave = useCallback((newBlocks) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveData({ ...data, memoBlocks: newBlocks });
        }, 1500);
    }, [saveData, data]);

    // ── 保存单个块 ─────────────────────────────────────────
    const handleSaveBlock = useCallback((date, text) => {
        if (!text.trim()) return;
        let newBlocks = [...blocks];
        const idx = newBlocks.findIndex(b => b.date === date);
        if (idx >= 0) {
            newBlocks[idx] = { ...newBlocks[idx], text };
        } else {
            newBlocks.push({ date, text });
        }

        // 按时间升序排列（最旧的在上，最新的在下）
        newBlocks.sort((a, b) => {
            const da = new Date(a.date.replace(/\./g, '-'));
            const db = new Date(b.date.replace(/\./g, '-'));
            return da - db;
        });

        updateData(prev => ({ ...prev, memoBlocks: newBlocks }));
        if (date === todayStr) setGhostText('');
        scheduleSave(newBlocks);
    }, [blocks, todayStr, updateData, scheduleSave]);

    // ── 生成降噪时间线（倒序，最新在上）──────────────────
    const timelineNodes = useMemo(() => {
        let lastYear = null;
        let lastMonth = null;
        const nodes = [];

        const sortedBlocks = [...blocks].sort((a, b) => {
            const da = new Date(a.date.replace(/\./g, '-'));
            const db = new Date(b.date.replace(/\./g, '-'));
            return db - da;
        });

        sortedBlocks.forEach(b => {
            const d = new Date(b.date.replace(/\./g, '-'));
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const day = d.getDate();

            if (y !== lastYear) {
                nodes.push(
                    <div key={`y-${y}`} className="text-xs font-bold text-primary mt-4 mb-1">{y}</div>
                );
                lastYear = y;
                lastMonth = null;
            }
            if (m !== lastMonth) {
                nodes.push(
                    <div key={`m-${y}-${m}`} className="text-[10px] font-semibold text-on-surface-variant ml-2 mt-2 mb-1">{m}月</div>
                );
                lastMonth = m;
            }
            nodes.push(
                <div
                    key={`d-${b.date}`}
                    className="flex items-center gap-2 ml-4 mt-1 cursor-pointer hover:text-primary text-outline transition-colors"
                    onClick={() => {
                        const el = document.getElementById(`block-${b.date}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                >
                    <div className={`w-1 h-1 rounded-full ${b.date === todayStr ? 'bg-primary' : 'bg-outline-variant'}`}></div>
                    <span className="text-[9px] font-mono-num">{day}日</span>
                </div>
            );
        });

        // 如果今天还没有块，也在时间线上显示今天的幽灵点
        if (!hasToday) {
            const d = new Date();
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const day = d.getDate();

            if (y !== lastYear) {
                nodes.push(
                    <div key={`y-${y}`} className="text-xs font-bold text-primary mt-4 mb-1">{y}</div>
                );
                lastYear = y;
                lastMonth = null;
            }
            if (m !== lastMonth) {
                nodes.push(
                    <div key={`m-${y}-${m}`} className="text-[10px] font-semibold text-on-surface-variant ml-2 mt-2 mb-1">{m}月</div>
                );
            }
            nodes.push(
                <div key={`d-${todayStr}`} className="flex items-center gap-2 ml-4 mt-1 text-outline-variant">
                    <div className="w-1 h-1 rounded-full bg-outline-variant opacity-40"></div>
                    <span className="text-[9px] font-mono-num opacity-40">{day}日</span>
                </div>
            );
        }

        return nodes;
    }, [blocks, todayStr, hasToday]);

    // ── 更新已有块的内容 ───────────────────────────────────
    const handleBlockChange = useCallback((date, text) => {
        const newBlocks = blocks.map(b =>
            b.date === date ? { ...b, text } : b
        );
        updateData(prev => ({ ...prev, memoBlocks: newBlocks }));
        scheduleSave(newBlocks);
    }, [blocks, updateData, scheduleSave]);

    return (
        <div className="flex h-full" style={{ padding: '20px 0 20px 24px', marginRight: -24, boxSizing: 'border-box' }}>

            {/* ── 左侧：内容区 ────────────────────────── */}
            <div className="flex-1 pr-4 overflow-y-auto pb-32">
                {/* 标题栏 */}
                <div className="flex items-baseline gap-3 mb-8">
                    <h2 className="m-0 text-lg font-bold text-on-surface">备忘录</h2>
                    <span className="text-[11px] text-outline">
                        {blocks.length} 条记录
                    </span>
                </div>

                {/* 历史记录块（按时间升序 — 最旧在上，最新在下） */}
                {blocks.map(b => (
                    <div
                        key={b.date}
                        id={`block-${b.date}`}
                        className="mb-8 border-b-[1px] border-dashed border-surface-variant pb-8"
                    >
                        <div className="text-[11px] font-mono-num font-bold text-outline mb-3">
                            {b.date}
                        </div>
                        <AutoResizeTextarea
                            value={b.text}
                            onChange={(e) => handleBlockChange(b.date, e.target.value)}
                            onBlur={(e) => handleSaveBlock(b.date, e.target.value)}
                        />
                    </div>
                ))}

                {/* 今日幽灵块（如果今天还没写过） */}
                {!hasToday && (
                    <div className="group relative">
                        {/* 只有输入了内容，日期才会平滑浮现 */}
                        <div
                            className={`text-[11px] font-mono-num font-bold text-outline mb-3 transition-opacity duration-500 ${
                                ghostText.trim() ? 'opacity-100' : 'opacity-0'
                            }`}
                        >
                            {todayStr}
                        </div>
                        <AutoResizeTextarea
                            placeholder=""
                            value={ghostText}
                            onChange={e => setGhostText(e.target.value)}
                            onBlur={(e) => handleSaveBlock(todayStr, e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* ── 右侧：降噪时间线 ────────────────────── */}
            {blocks.length > 0 && (
                <div className="w-16 flex-shrink-0 pl-2 border-l-[1px] border-solid border-surface-variant overflow-y-auto pb-32">
                    <div className="sticky top-0 bg-background pt-5 pb-2">
                        <div className="text-[10px] font-bold text-outline tracking-widest">TIME</div>
                    </div>
                    {timelineNodes}
                </div>
            )}
        </div>
    );
});

export default Notes;