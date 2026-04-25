// ============================================================
// Finance Pro — Sidebar 侧边栏
// ============================================================

import { useState, useContext } from 'react';
import { FinanceContext } from '../index';

const NAV_ITEMS = [
    { id: 'notes',     icon: 'ri-sticky-note-line',  label: '备忘录' },
    { id: 'assets',    icon: 'ri-bank-line',          label: '资产快照' },
    { id: 'dashboard', icon: 'ri-dashboard-line',    label: '总览透视' },
    { id: 'journal',   icon: 'ri-file-add-line',     label: '记账工作台',  section: '核心功能' },
    { id: 'details',   icon: 'ri-file-list-3-line',  label: '账单明细',   section: '数据管理' },
];

const PAGE_TITLES = {
    notes:     '备忘录',
    assets:    '资产快照',
    dashboard: '总览透视',
    journal:   '记账工作台',
    details:   '账单明细',
};

export default function Sidebar({ activePage, onNav, onOpenReceipt, onOpenExportModal, onClearData }) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const toggleSidebar = () => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            setMobileOpen(v => !v);
        } else {
            setCollapsed(v => !v);
        }
    };

    const closeMobile = () => setMobileOpen(false);

    const handleNav = (pageId) => {
        onNav(pageId);
        closeMobile();
    };

    // 计算 sidebar className
    const sidebarCls = [
        'sidebar',
        collapsed ? 'collapsed' : '',
        mobileOpen ? 'open' : '',
    ].filter(Boolean).join(' ');

    return (
        <>
            {/* 手机端顶部栏 */}
            <div className="mobile-topbar" id="mobile-topbar">
                <button className="mobile-hamburger" onClick={toggleSidebar} aria-label="打开菜单">
                    <i className="ri-menu-line" />
                </button>
                <span className="mobile-topbar-title">
                    {PAGE_TITLES[activePage] || 'Finance Pro'}
                </span>
                <span style={{ fontFamily:'var(--font-pixel)', fontSize:11, color:'rgba(196,168,130,0.5)', letterSpacing:1 }}>
                    FINANCE
                </span>
            </div>

            {/* 手机端遮罩 */}
            {mobileOpen && (
                <div id="sidebar-overlay" className="active" onClick={closeMobile} />
            )}

            {/* 侧边栏主体 */}
            <div className={sidebarCls} id="sidebar">
                <button
                    className="toggle-btn"
                    onClick={toggleSidebar}
                    style={{ background: 'none', border: 'none' }}
                >
                    <i className={collapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'} />
                </button>

                <div className="logo">
                    <span><i className="ri-wallet-3-fill" /> Finance Pro</span>
                </div>

                {/* 主导航 */}
                {renderNavItems(NAV_ITEMS, activePage, handleNav)}

                {/* 底部工具区 */}
                <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                    <button className="nav-item" onClick={() => { onOpenExportModal?.(); closeMobile(); }}>
                        <i className="ri-archive-line" /><span>年终封存</span>
                    </button>
                    <button
                        className="nav-item"
                        style={{ color: 'var(--c-survive)' }}
                        onClick={() => { onClearData?.(); closeMobile(); }}
                    >
                        <i className="ri-delete-bin-line" /><span>清空数据</span>
                    </button>
                </div>
            </div>
        </>
    );
}

// ── 渲染带分组标签的导航项 ─────────────────────────────────
function renderNavItems(items, activePage, onNav) {
    const result = [];
    let lastSection = null;

    items.forEach(item => {
        if (item.section && item.section !== lastSection) {
            lastSection = item.section;
            result.push(
                <div key={`section-${item.section}`} className="section-label">
                    {item.section}
                </div>
            );
        }
        result.push(
            <button
                key={item.id}
                className={`nav-item${activePage === item.id ? ' active' : ''}`}
                onClick={() => onNav(item.id)}
            >
                <i className={item.icon} />
                <span>{item.label}</span>
            </button>
        );
    });

    return result;
}