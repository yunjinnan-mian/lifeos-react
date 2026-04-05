// ============================================================
// Finance Pro — Notes 备忘录
// 自由文本 · Firebase 持久化 · 自动保存
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const DOC_REF = doc(db, 'config', 'notes');
const AUTOSAVE_DELAY = 1500;

export default function Notes() {
    const [content, setContent]   = useState('');
    const [status, setStatus]     = useState('idle'); // idle | saving | saved | error
    const [loaded, setLoaded]     = useState(false);
    const timerRef = useRef(null);
    const latestRef = useRef('');

    // ── 初始加载 ──────────────────────────────────────────
    useEffect(() => {
        getDoc(DOC_REF)
            .then(snap => {
                const text = snap.exists() ? (snap.data().content || '') : '';
                setContent(text);
                latestRef.current = text;
                setLoaded(true);
            })
            .catch(() => {
                setStatus('error');
                setLoaded(true);
            });
    }, []);

    // ── 自动保存 ──────────────────────────────────────────
    const save = useCallback(async (text) => {
        setStatus('saving');
        try {
            await setDoc(DOC_REF, {
                content: text,
                updatedAt: new Date().toISOString(),
            });
            setStatus('saved');
        } catch {
            setStatus('error');
        }
    }, []);

    const handleChange = useCallback((e) => {
        const val = e.target.value;
        setContent(val);
        latestRef.current = val;
        setStatus('idle');
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => save(latestRef.current), AUTOSAVE_DELAY);
    }, [save]);

    // ── 状态文字 ──────────────────────────────────────────
    const statusText = {
        idle:   '',
        saving: '保存中…',
        saved:  '已保存',
        error:  '保存失败',
    }[status];

    const statusColor = {
        idle:   'transparent',
        saving: 'var(--c-text-muted, #999)',
        saved:  'var(--c-income, #4caf50)',
        error:  'var(--c-survive, #e53935)',
    }[status];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 24px', boxSizing: 'border-box' }}>

            {/* 标题栏 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--c-text, #2d3748)' }}>
                    备忘录
                </h2>
                <span style={{ fontSize: 12, color: statusColor, transition: 'color 0.3s' }}>
                    {statusText}
                </span>
            </div>

            {/* 文本区 */}
            {loaded ? (
                <textarea
                    value={content}
                    onChange={handleChange}
                    placeholder={"记点什么……"}
                    style={{
                        flex: 1,
                        width: '100%',
                        resize: 'none',
                        border: 'none',
                        borderRadius: 8,
                        padding: '16px 18px',
                        fontSize: 14,
                        lineHeight: 1.8,
                        fontFamily: 'inherit',
                        background: 'transparent',
                        color: 'var(--c-text, #2d3748)',
                        outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    加载中…
                </div>
            )}
        </div>
    );
}