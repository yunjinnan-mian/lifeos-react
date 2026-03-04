import { useRef } from 'react';
import { doc, writeBatch, deleteDoc } from 'firebase/firestore';

export default function CategorySection({
  zones, zoneTypes, items, db,
  onNewZone, onEditZone, onDeleteZone,
  onNewType, onDeleteType,
}) {
  const dragZoneId = useRef(null);
  const dragTypeId = useRef(null);

  // ── Zone drag (desktop) ───────────────────────────────
  function onZoneDragStart(e, zoneId) {
    dragZoneId.current = zoneId;
    e.dataTransfer.effectAllowed = 'move';
  }
  async function onZoneDrop(e, targetId) {
    e.preventDefault();
    const srcId = dragZoneId.current;
    if (!srcId || srcId === targetId) return;
    const arr = [...zones];
    const si = arr.findIndex(z => z.id === srcId);
    const ti = arr.findIndex(z => z.id === targetId);
    const [moved] = arr.splice(si, 1);
    arr.splice(ti, 0, moved);
    const batch = writeBatch(db);
    arr.forEach((z, i) => batch.set(doc(db, 'zones', z.id), { ...z, order: i, updatedAt: new Date().toISOString() }));
    await batch.commit();
    dragZoneId.current = null;
  }

  // ── Type drag (desktop) ───────────────────────────────
  function onTypeDragStart(e, typeId) {
    e.stopPropagation();
    dragTypeId.current = typeId;
    e.dataTransfer.effectAllowed = 'move';
  }
  async function onTypeDrop(e, targetTypeId) {
    e.preventDefault();
    e.stopPropagation();
    const srcId = dragTypeId.current;
    if (!srcId || srcId === targetTypeId) return;
    const srcType = zoneTypes.find(t => t.id === srcId);
    const tgtType = zoneTypes.find(t => t.id === targetTypeId);
    if (!srcType || !tgtType) return;
    const list = zoneTypes.filter(t => t.zoneId === tgtType.zoneId);
    const si = list.findIndex(t => t.id === srcId);
    const ti = list.findIndex(t => t.id === targetTypeId);
    if (si < 0 || ti < 0) return;
    const [moved] = list.splice(si, 1);
    list.splice(ti, 0, moved);
    const batch = writeBatch(db);
    list.forEach((t, i) => batch.set(doc(db, 'zoneTypes', t.id), { ...t, order: i, updatedAt: new Date().toISOString() }));
    await batch.commit();
    dragTypeId.current = null;
  }

  return (
    <div className="cat-wrap">
      <div className="cat-header">
        <div className="section-heading">分类管理</div>
        <button className="btn-add" onClick={() => onNewZone()}>＋ 新建分类</button>
      </div>

      {zones.map(zone => {
        const types = zoneTypes.filter(t => t.zoneId === zone.id);
        return (
          <div
            key={zone.id}
            className="cat-zone-card"
            onDragOver={e => e.preventDefault()}
            onDrop={e => onZoneDrop(e, zone.id)}
          >
            <div className="cat-zone-row">
              <span
                className="drag-handle"
                draggable
                onDragStart={e => onZoneDragStart(e, zone.id)}
              >⠿</span>
              <span className="cat-zone-emoji">{zone.emoji || '📦'}</span>
              <span className="cat-zone-name">{zone.name}</span>
              <div className="cat-zone-actions">
                <button className="cat-icon-btn" onClick={() => onEditZone(zone.id)}>编辑</button>
                <button className="cat-icon-btn danger" onClick={() => onDeleteZone(zone.id)}>删除</button>
              </div>
            </div>
            <div className="cat-types">
              {types.map(t => (
                <div
                  key={t.id}
                  className="cat-type-chip"
                  draggable
                  onDragStart={e => onTypeDragStart(e, t.id)}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => onTypeDrop(e, t.id)}
                >
                  <span className="drag-handle" style={{ width: 16, height: 16, fontSize: 12 }}>⠿</span>
                  {t.label}
                  <button onClick={() => onDeleteType(t.id, zone.id)}>✕</button>
                </div>
              ))}
              <button className="cat-add-type" onClick={() => onNewType(null, zone.id)}>＋ 添加</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
