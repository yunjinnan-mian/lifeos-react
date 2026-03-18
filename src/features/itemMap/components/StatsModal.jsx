import { computeRichness } from '../engine/mapEngine.js';

export default function StatsModal({ isOpen, zones, items, itemsByZone, onClose }) {
  if (!isOpen) return null;

  const total    = items.length;
  const frequent = items.filter(i => i.vibe === 'love').length;
  const stored   = total - frequent;
  const maxCnt   = Math.max(...zones.map(z => (itemsByZone.get(z.id) || []).length), 1);

  const rows = zones
    .map(z => {
      const zi = itemsByZone.get(z.id) || [];
      return { z, cnt: zi.length, rich: computeRichness(zi) };
    })
    .sort((a, b) => b.cnt - a.cnt);

  return (
    <div className="modal-overlay open" id="statsModal"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rpgui-container framed-golden modal-box">
        <div className="modal-title">≡ 统计</div>

        <div className="stat-card">
          <div className="stat-card-title">总览</div>
          <div className="stat-big">{total}</div>
          <div className="stat-sub">件物品 · {zones.length} 个领域</div>
          <div className="stat-mini-pair">
            <div className="stat-mini green">
              <div className="stat-mini-val">{frequent}</div>
              <div className="stat-mini-label">✦ 常用</div>
            </div>
            <div className="stat-mini blue">
              <div className="stat-mini-val">{stored}</div>
              <div className="stat-mini-label">◌ 不常用</div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">各领域</div>
          {rows.length === 0 && (
            <div style={{ color: '#7a5018', padding: '14px 0', fontSize: '17px', textAlign: 'center' }}>
              还没有领域
            </div>
          )}
          {rows.map(({ z, cnt, rich }) => (
            <div key={z.id}>
              <div className="stat-zone-row">
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{z.emoji || '📦'}</span>
                <span className="stat-zone-name">{z.name}</span>
                <div className="stat-bar-bg">
                  <div className="stat-bar" style={{ width: `${Math.round(cnt / maxCnt * 100)}%` }} />
                </div>
                <span className="stat-num">{cnt}</span>
              </div>
              <div className="richness-row">
                <span style={{ fontSize: '12px', color: '#705018', minWidth: '36px', letterSpacing: '1px' }}>丰富度</span>
                <div className="rich-bar-bg">
                  <div className="rich-bar" style={{ width: `${Math.round(rich * 100)}%` }} />
                </div>
                <span className="rich-pct">{Math.round(rich * 100)}%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="btn-row">
          <button className="rpgui-button" type="button" onClick={onClose}><p>关闭</p></button>
        </div>
      </div>
    </div>
  );
}
