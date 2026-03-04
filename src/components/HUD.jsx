export default function HUD({ zoneCount, itemCount, syncStatus, aiStatus, zoom, onOpenStats, onZoom }) {
  const syncLabel = { synced: 'SYNCED', syncing: 'SYNC…', error: 'ERROR' }[syncStatus] || 'SYNC…';

  const aiVisible = aiStatus !== 'ready';
  const aiLabel   = { loading: 'AI 加载中…', ready: 'AI 就绪 ✓', error: 'AI 不可用' }[aiStatus] || '';
  const aiDotCls  = { loading: 'sync-dot syncing', ready: 'sync-dot synced', error: 'sync-dot error' }[aiStatus] || 'sync-dot syncing';

  return (
    <div id="hud">
      <div className="rpgui-container framed-golden">
        <div className="hud-title">▶ 物品地图</div>

        <div className="hud-stat">
          <span className="hud-stat-emoji">🏝️</span>
          <div>
            <div className="hud-stat-val">{zoneCount}</div>
            <div className="hud-stat-label">个领域</div>
          </div>
        </div>

        <div className="hud-stat">
          <span className="hud-stat-emoji">📦</span>
          <div>
            <div className="hud-stat-val">{itemCount}</div>
            <div className="hud-stat-label">件物品</div>
          </div>
        </div>

        <div className="hud-sync">
          <div className={`sync-dot ${syncStatus}`}></div>
          <span className="sync-label">{syncLabel}</span>
        </div>

        {aiVisible && (
          <div className="hud-sync">
            <div className={aiDotCls}></div>
            <span className="sync-label">{aiLabel}</span>
          </div>
        )}

        <div className="hud-zoom-row">
          <button className="hud-zoom-btn" title="缩小"  onClick={() => onZoom('out')}>−</button>
          <button className="hud-zoom-btn" title="重置"  onClick={() => onZoom('reset')}>⌂</button>
          <button className="hud-zoom-btn" title="放大"  onClick={() => onZoom('in')}>＋</button>
        </div>
        <div className="hud-zoom-val">×{zoom.toFixed(1)}</div>

        <button className="rpgui-button" type="button" onClick={onOpenStats}>
          <p>≡ 统计</p>
        </button>
      </div>
    </div>
  );
}
