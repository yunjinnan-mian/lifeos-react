import { useRef } from 'react';
import { SEASON_KEYS } from '../constants';

const SEASON_DEFS = [
  { s: 'all', label: '全部' },
  { s: 'spring', label: '春' },
  { s: 'summer', label: '夏' },
  { s: 'autumn', label: '秋' },
  { s: 'winter', label: '冬' },
];

export default function ClosetSection({
  zones, zoneTypes, items,
  seasonFilter, onSeasonChange,
  onItemClick, onAddItem,
}) {
  const cameraInputRef = useRef(null);
  const pendingZoneId = useRef(null);

  function triggerCamera(zoneId) {
    pendingZoneId.current = zoneId;
    cameraInputRef.current.value = '';
    cameraInputRef.current.click();
  }

  function handleCameraChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    onAddItem(pendingZoneId.current, file);
    e.target.value = '';
  }

  return (
    <>
      {/* Season filter bar */}
      <div className="season-bar">
        {SEASON_DEFS.map(d => (
          <button
            key={d.s}
            className={`season-seg${seasonFilter === d.s ? ' s-active' : ''}`}
            onClick={() => onSeasonChange(d.s)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Zone rows */}
      {zones.map((zone, i) => {
        const typesInZone = zoneTypes.filter(t => t.zoneId === zone.id);
        let zoneItems = items.filter(it => it.zoneId === zone.id);
        if (seasonFilter !== 'all') {
          zoneItems = zoneItems.filter(it => (it.seasons || []).includes(seasonFilter));
        }

        return (
          <div key={zone.id}>
            {i > 0 && <div className="zone-divider" />}
            <div className="zone">
              <div className="zone-header">
                <span className="zone-emoji">{zone.emoji || '📦'}</span>
                <span className="zone-name">{zone.name}</span>
                <span className="zone-sub">{typesInZone.map(t => t.label).join('、')}</span>
                {zoneItems.length > 0 && (
                  <span className="zone-count">{zoneItems.length}</span>
                )}
              </div>
              <div className="zone-scroll">
                {zoneItems.map(it => (
                  <div
                    key={it.id}
                    className="item-card"
                    onClick={() => onItemClick(it.id)}
                  >
                    <div className="card-photo">
                      {it.photoUrl
                        ? <img src={it.photoUrl} loading="lazy" alt="" />
                        : (zone.emoji || '📦')}
                    </div>
                    {it.vibe && <div className={`card-vibe vibe-${it.vibe}`} />}
                  </div>
                ))}
                <div className="add-card" onClick={() => triggerCamera(zone.id)}>+</div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Hidden camera input */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
      />
    </>
  );
}
