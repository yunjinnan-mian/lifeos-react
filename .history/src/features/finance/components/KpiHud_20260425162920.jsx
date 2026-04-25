// ============================================================
// Finance Pro — KpiHud 游戏 HUD 数字卡片
// ============================================================

import { memo } from 'react';

function KpiHud({ color, icon, eng, title, value, barPct = 0, status, style }) {
    const pct = Math.min(100, Math.max(0, barPct));
    return (
        <div className="kpi-hud" style={{ '--hc': color, ...style }}>
            <div className="kpi-hud-accent" />
            <div className="kpi-hud-icon">{icon}</div>
            <div className="kpi-hud-eng">{eng}</div>
            <div className="kpi-hud-title">{title}</div>
            <div className="kpi-val">{value}</div>
            <div className="kpi-hud-track">
                <div className="kpi-hud-fill" style={{ width: pct + '%' }} />
            </div>
            <div className="kpi-hud-status">{status}</div>
        </div>
    );
}

export default memo(KpiHud);
