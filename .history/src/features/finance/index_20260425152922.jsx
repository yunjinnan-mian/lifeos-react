// ============================================================
// Finance Pro — 入口文件  ✅ 全部迁移完成 (Batch 1–4)
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import './finance.css';

// ── Hooks ─────────────────────────────────────────────────
import { useFinanceData }  from './hooks/useFinanceData';
import { useClearData }    from './hooks/useClearData';

// ── Layout ───────────────────────────────────────────────
import Sidebar   from './components/Sidebar';
import Toast     from './components/Toast';

// ── Pages ────────────────────────────────────────────────
import Dashboard from './pages/Dashboard';
import Journal   from './pages/Journal';
import Details   from './pages/Details';
import Notes     from './pages/Notes';
import Assets     from './pages/Assets';

// ── Panels / Modals ──────────────────────────────────────
import QuickPanel          from './panels/QuickPanel';
import ExportModal         from './panels/ExportModal';
import SubscriptionModal   from './panels/SubscriptionModal';

// ════════════════════════════════════════════════════════════
// Context
// ════════════════════════════════════════════════════════════
export const FinanceContext = createContext(null);

export function useFinance() {
    const ctx = useContext(FinanceContext);
    if (!ctx) throw new Error('useFinance must be used within FinancePage');
    return ctx;
}

// ════════════════════════════════════════════════════════════
// 主页面
// ════════════════════════════════════════════════════════════
export default function FinancePage() {
    const [activePage, setActivePage] = useState('dashboard');

    // ── 侧边栏折叠状态 ────────────────────────────────────
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // ── 全局 ESC 快捷键：切换侧边栏折叠/展开（避开输入框冲突） ────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            // 核心冲突拦截：如果焦点在输入框/文本域/下拉框上，直接忽略
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            e.preventDefault();
            // 必须使用函数式更新，确保能折叠也能展开
            setIsSidebarCollapsed(prev => !prev);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    // ── 弹窗状态 ──────────────────────────────────────────
    const [exportOpen,   setExportOpen]   = useState(false);
    const [subModalOpen, setSubModalOpen] = useState(false);

    // ── 数据层 ────────────────────────────────────────────
    const financeHook = useFinanceData();
    const { data, toast, showToast, loadFromFirebase, checkSubs } = financeHook;

    // ── 清空数据 ──────────────────────────────────────────
    const clearData = useClearData({ showToast });

    // ── 初始化加载 ────────────────────────────────────────
    useEffect(() => {
        showToast('☁️ 正在从云端加载数据...');
        loadFromFirebase()
            .then(() => { checkSubs(); showToast('✅ 数据加载完成'); })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 仪表盘排行榜 → 跳转明细并筛选 ───────────────────
    const handleJumpToCategory = useCallback((catId) => {
        setActivePage('details');
        financeHook.updateData(prev => ({ ...prev, _jumpCat: catId }));
    }, [financeHook]);

    // ── Journal 需要打开订阅弹窗 ─────────────────────────
    const handleOpenSub = useCallback(() => setSubModalOpen(true), []);

    const contextValue = {
        ...financeHook,
        activePage,
        setActivePage,
        openSubModal:    () => setSubModalOpen(true),
        openExportModal: () => setExportOpen(true),
    };

    return (
        <FinanceContext.Provider value={contextValue}>
            <div className="finance-root">

                {/* ── 侧边栏 ──────────────────────────── */}
                <Sidebar
                    activePage={activePage}
                    onNav={setActivePage}
                    onOpenExportModal={() => setExportOpen(true)}
                    onClearData={clearData}
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapse={() => setIsSidebarCollapsed(v => !v)}
                />

                {/* ── 主内容区 ────────────────────────── */}
                <div className="main">
                    {/* 永远可见的侧边栏折叠/展开按钮 */}
                    <button
                        className="sidebar-toggle-btn"
                        onClick={() => setIsSidebarCollapsed(v => !v)}
                        title={isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
                    >
                        <i className={isSidebarCollapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'} />
                    </button>

                    {activePage === 'notes'     && <Notes />}
                    {activePage === 'assets'    && <Assets />}
                    {activePage === 'dashboard' && (
                        <Dashboard onJumpToCategory={handleJumpToCategory} />
                    )}
                    {activePage === 'journal' && (
                        <Journal onOpenSub={handleOpenSub} />
                    )}
                    {activePage === 'details' && <Details />}
                </div>

                {/* ── 浮动快速记账 ────────────────────── */}
                <QuickPanel />

                {/* ── 弹窗层 ──────────────────────────── */}
                <ExportModal
                    open={exportOpen}
                    onClose={() => setExportOpen(false)}
                />
                <SubscriptionModal
                    open={subModalOpen}
                    onClose={() => setSubModalOpen(false)}
                />

                {/* ── Toast ───────────────────────────── */}
                <Toast visible={toast.visible} msg={toast.msg} type={toast.type} />
            </div>
        </FinanceContext.Provider>
    );
}