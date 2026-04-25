// ============================================================
// Finance Pro — ToastContext（与数据 Context 解耦）
// 避免 toast 状态变化导致整个 finance context 重渲染
// ============================================================

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toast, setToast] = useState({ visible: false, msg: '', type: 'success' });
    const timerRef = useRef(null);

    const showToast = useCallback((msg, type = 'success') => {
        setToast({ visible: true, msg, type });
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setToast(t => ({ ...t, visible: false }));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ toast, showToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
