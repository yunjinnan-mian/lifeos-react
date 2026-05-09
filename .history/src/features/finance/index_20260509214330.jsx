// ============================================================
// Finance Pro — 入口文件
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import './finance.css';

// ── Hooks ─────────────────────────────────────────────────
import { useFinanceData }  from './hooks/useFinanceData';
import { useClearData }    from './hooks/useClearData';

// ── Toast - 独立 Context ─────────────────────────────────
import { ToastProvider, useToast } from './components/ToastProvider';
import Toast     from './components/Toast';

// ── Layout ───────────────────────────────────────────────
import Sidebar   from './components/Sidebar';

// ── Pages ────────────────────────────────────────────────
import Dashboard from './pages/Dashboard';
import Journal   from './pages/Journal';
import Details   from './pages/Details';
import Notes     from './pages/Notes';
import Assets     from './pages/Assets';
import Settings   from './pages/Settings';
import FifoCenter from './pages/FifoCenter';

// ── Panels / Modals ──────────────────────────────────────
import QuickPanel          from './panels/QuickPanel';
import ExportModal         from './panels/ExportModal';
import SubscriptionModal   from './panels/SubscriptionModal';

// ════════════════════════════════════════════════════════════
// Context (仅数据，不含 toast)
// ════════════════════════════════════════════════════════════
export const FinanceContext = createContext(null);

export function useFinance() {
    const ctx = useContext(FinanceContext);
    if (!ctx) throw new Error('useFinance must be used within FinancePage');
    return ctx;
}

// ════════════════════════════════════════════════════════════
// 内部组件：在 ToastProvider 之内使用 useToast
// ════════════════════════════════════════════════════════════
function FinanceApp() {
    const { toast, showToast } = useToast();
    const [activePage, setActivePage] = useState('dashboard');

    // ── 侧边栏折叠状态 ────────────────────────────────────
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // ── 全局 ESC 快捷键：无条件切换侧边栏折叠/展开 ─────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsSidebarCollapsed(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    // ── 弹窗状态 ──────────────────────────────────────────
    const [exportOpen,   setExportOpen]   = useState(false);
    const [subModalOpen, setSubModalOpen] = useState(false);
    const closeExport = useCallback(() => setExportOpen(false), []);
    const closeSub    = useCallback(() => setSubModalOpen(false), []);

    // ── 数据层（注入 showToast，不再在 hook 内管理 toast）───
    const financeHook = useFinanceData(showToast);
    const { data, loadFromFirebase, checkSubs } = financeHook;

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

    // ── 仪表盘排行榜 → 跳转明细 ─────────────────────────
    const handleJumpToCategory = useCallback((catId) => {
        setActivePage('details');
    }, []);
    // ── Journal 需要打开订阅弹窗 ─────────────────────────
    const handleOpenSub = useCallback(() => setSubModalOpen(true), []);

    // ── 稳定引用函数 ──────────────────────────────────
    const openSubModal    = useCallback(() => setSubModalOpen(true), []);
    const openExportModal = useCallback(() => setExportOpen(true), []);
    const handleToggleCollapse = useCallback(() => setIsSidebarCollapsed(v => !v), []);

    const contextValue = useMemo(() => ({
        ...financeHook,
        showToast,
        activePage,
        setActivePage,
        openSubModal,
        openExportModal,
    }), [financeHook, showToast, activePage, setActivePage, openSubModal, openExportModal]);

    return (
        <FinanceContext.Provider value={contextValue}>
            <div className="finance-root">

                {/* ── 侧边栏 ──────────────────────────── */}
                <Sidebar
                    activePage={activePage}
                    onNav={setActivePage}
                    onOpenExportModal={openExportModal}
                    onClearData={clearData}
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapse={handleToggleCollapse}
                />

                {/* ── 主内容区 ────────────────────────── */}
                <div className="main">
                    {activePage === 'notes'     && <Notes />}
                    {activePage === 'assets'    && <Assets />}
                    {activePage === 'dashboard' && (
                        <Dashboard onJumpToCategory={handleJumpToCategory} />
                    )}
                    {activePage === 'journal' && (
                        <Journal onOpenSub={handleOpenSub} />
                    )}
                    {activePage === 'details' && <Details />}
                    {activePage === 'settings' && <Settings />}
                    {activePage === 'fifo'     && <FifoCenter />}
                </div>

                {/* ── 浮动快速记账 ────────────────────── */}
                <QuickPanel />

                {/* ── 弹窗层 ──────────────────────────── */}
                <ExportModal
                    open={exportOpen}
                    onClose={closeExport}
                />
                <SubscriptionModal
                    open={subModalOpen}
                    onClose={closeSub}
                />

                {/* ── Toast ───────────────────────────── */}
                <Toast visible={toast.visible} msg={toast.msg} type={toast.type} />
            </div>
        </FinanceContext.Provider>
    );
}

// ════════════════════════════════════════════════════════════
// 导出组件（包裹 ToastProvider）
// ════════════════════════════════════════════════════════════
export default function FinancePage() {
    return (
        <ToastProvider>
            <FinanceApp />
        </ToastProvider>
    );
}
