// ============================================================
// Finance Pro — TimePills 时间胶囊导航条
// ============================================================

import { memo } from 'react';

function TimePills({ years, months, activeYear, activeMonth, onSelectYear, onSelectMonth }) {
    return (
        <div className="time-nav-wrap">
            {/* 年份条 */}
            <div className="time-pill-bar">
                <span className="time-pill-label">YEAR</span>
                {years.length === 0
                    ? <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)', padding:'5px 6px', fontFamily:'var(--font-pixel)' }}>— 暂无数据 —</span>
                    : years.map(y => (
                        <span
                            key={y}
                            className={`time-pill${y === activeYear ? ' active' : ''}`}
                            onClick={() => onSelectYear(y)}
                        >
                            {y}
                        </span>
                    ))
                }
            </div>

            {/* 月份条 */}
            <div className="time-pill-bar">
                <span className="time-pill-label">MON</span>
                {months.length === 0
                    ? <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)', padding:'5px 6px', fontFamily:'var(--font-pixel)' }}>— 暂无数据 —</span>
                    : months.map(m => (
                        <span
                            key={m}
                            className={`time-pill${m === activeMonth ? ' active' : ''}`}
                            onClick={() => onSelectMonth(m)}
                        >
                            {m.slice(5)}月
                        </span>
                    ))
                }
            </div>
        </div>
    );
}

export default memo(TimePills);
