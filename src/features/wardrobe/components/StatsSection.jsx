import { useEffect, useRef } from 'react';
import { SEASON_KEYS } from '../constants';

const SEASON_DATA = [
  { key: 'spring', label: '春', icon: '🌸', barClass: 'bar-spring', color: '#78c470' },
  { key: 'summer', label: '夏', icon: '☀️', barClass: 'bar-summer', color: '#d4a830' },
  { key: 'autumn', label: '秋', icon: '🍂', barClass: 'bar-autumn', color: '#c07040' },
  { key: 'winter', label: '冬', icon: '❄️', barClass: 'bar-winter', color: '#5090c0' },
];

export default function StatsSection({ zones, items, active }) {
  const barRefs = useRef([]);

  const withPhoto = items.filter(i => i.photoUrl);
  const total = items.length;
  const untagged = withPhoto.filter(i => !(i.seasons || []).length).length;

  const zoneRows = zones
    .map(z => ({ zone: z, cnt: items.filter(i => i.zoneId === z.id).length }))
    .filter(r => r.cnt > 0);

  const seasonData = SEASON_DATA.map(s => ({
    ...s,
    cnt: items.filter(i => (i.seasons || []).includes(s.key)).length,
  }));
  const maxSeason = Math.max(...seasonData.map(s => s.cnt), 1);

  // Animate bars when section becomes active
  useEffect(() => {
    if (!active) return;
    barRefs.current.forEach(bar => {
      if (!bar) return;
      const target = bar.dataset.target;
      bar.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = target; }));
    });
  }, [active, items]);

  return (
    <div className="stats-wrap">
      <div className="stats-heading">数据统计</div>

      {/* Hero: total + per-zone */}
      <div className="stats-hero">
        <div>
          <div className="stats-hero-num">{total}</div>
          <div className="stats-hero-label">件衣物</div>
        </div>
        <div className="stats-grid" style={{ flex: 1 }}>
          {zoneRows.map(r => (
            <div key={r.zone.id} className="stat-card">
              <div className="stat-card-top">
                <span className="stat-card-emoji">{r.zone.emoji || '📦'}</span>
                <span className="stat-card-name">{r.zone.name}</span>
              </div>
              <div className="stat-card-count">{r.cnt}</div>
              <div className="stat-card-bar-bg">
                <div
                  ref={el => barRefs.current.push(el)}
                  className="stat-card-bar"
                  data-target={`${Math.round(r.cnt / total * 100)}%`}
                  style={{ width: 0 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Season breakdown */}
      <div className="stats-section-title">季节分布</div>
      <div className="stats-season-grid">
        {seasonData.map(s => (
          <div key={s.key} className="stat-season-card">
            <div className="stat-season-icon">{s.icon}</div>
            <div className="stat-season-num">{s.cnt}</div>
            <div className="stat-season-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Untagged */}
      <div className="stats-untagged-row">
        <span className="stats-untagged-lbl">未标注季节</span>
        <span className="stats-untagged-num">{untagged} 件</span>
      </div>
    </div>
  );
}
