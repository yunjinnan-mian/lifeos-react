import { useState, useEffect, useRef, useCallback } from 'react';
import { SEASON_KEYS, SEASON_LABELS, SEASON_ICONS } from '../constants';
import { patchItem } from '../hooks/useWardrobeData';

export default function ImmersiveOverlay({ open, zones, items, db, onClose }) {
  const [zoneId, setZoneId] = useState('all');
  const [idx, setIdx] = useState(0);
  const [lockedId, setLockedId] = useState(null);
  const [noteVal, setNoteVal] = useState('');
  const noteTimer = useRef(null);
  const swipeStart = useRef({ x: 0, y: 0 });
  const swipeLocked = useRef(false);
  const photoAreaRef = useRef(null);

  // Build the list of annotatable items
  function getList() {
    if (zoneId === 'all') return items.filter(i => i.photoUrl);
    if (zoneId === 'untagged') return items.filter(i => i.photoUrl && !(i.seasons || []).length);
    return items.filter(i => i.zoneId === zoneId && i.photoUrl);
  }

  const list = getList();
  const untaggedCount = items.filter(i => i.photoUrl && !(i.seasons || []).length).length;

  // Resolve current item
  let currentItem = lockedId ? items.find(i => i.id === lockedId) : null;
  if (!currentItem) {
    const safeIdx = Math.max(0, Math.min(idx, list.length - 1));
    currentItem = list[safeIdx];
  }

  useEffect(() => {
    if (currentItem) setNoteVal(currentItem.note || '');
  }, [currentItem?.id]);

  // Swipe navigation on photo area
  useEffect(() => {
    if (!open) return;
    const el = photoAreaRef.current;
    if (!el) return;

    function onTouchStart(e) {
      swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      swipeLocked.current = false;
    }
    function onTouchMove(e) {
      if (swipeLocked.current) return;
      const dx = Math.abs(e.touches[0].clientX - swipeStart.current.x);
      const dy = Math.abs(e.touches[0].clientY - swipeStart.current.y);
      if (dx > 8 || dy > 8) {
        swipeLocked.current = true;
        if (dx > dy) e.preventDefault();
      }
    }
    function onTouchEnd(e) {
      const dx = e.changedTouches[0].clientX - swipeStart.current.x;
      const dy = e.changedTouches[0].clientY - swipeStart.current.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [open, list, lockedId, idx]);

  function navigate(dir) {
    clearTimeout(noteTimer.current);
    // flush note
    if (currentItem && noteVal.trim() !== (currentItem.note || '').trim()) {
      patchItem(db, items, currentItem.id, { note: noteVal.trim() }).catch(() => {});
    }
    const pos = lockedId ? list.findIndex(i => i.id === lockedId) : idx;
    const newIdx = pos + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    setIdx(newIdx);
    setLockedId(null);
  }

  function handleZoneChange(val) {
    setZoneId(val);
    setIdx(0);
    setLockedId(null);
  }

  async function toggleSeason(season) {
    if (!currentItem) return;
    const seasons = [...(currentItem.seasons || [])];
    const i = seasons.indexOf(season);
    if (i >= 0) seasons.splice(i, 1); else seasons.push(season);
    setLockedId(currentItem.id);
    await patchItem(db, items, currentItem.id, { seasons });
  }

  async function toggleAllSeasons() {
    if (!currentItem) return;
    const allOn = SEASON_KEYS.every(s => (currentItem.seasons || []).includes(s));
    setLockedId(currentItem.id);
    await patchItem(db, items, currentItem.id, { seasons: allOn ? [] : [...SEASON_KEYS] });
  }

  async function setVibe(vibe) {
    if (!currentItem) return;
    setLockedId(currentItem.id);
    await patchItem(db, items, currentItem.id, { vibe: currentItem.vibe === vibe ? null : vibe });
  }

  function handleNoteChange(val) {
    setNoteVal(val);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      if (!currentItem) return;
      await patchItem(db, items, currentItem.id, { note: val.trim() });
    }, 700);
  }

  // Determine counter position
  const posInList = currentItem ? list.findIndex(i => i.id === currentItem.id) : -1;
  const displayIdx = posInList >= 0 ? posInList : idx;

  const seasons = currentItem?.seasons || [];
  const allSelected = SEASON_KEYS.every(s => seasons.includes(s));

  const zoneOptions = [
    { id: 'all', label: '全部' },
    { id: 'untagged', label: `未标注${untaggedCount ? ' · ' + untaggedCount : ''}` },
    ...zones.map(z => ({ id: z.id, label: (z.emoji || '') + ' ' + z.name })),
  ];

  return (
    <div className={`immersive-overlay${open ? ' open' : ''}`}>
      <div className="imm-header">
        <select
          className="imm-zone-select"
          value={zoneId}
          onChange={e => handleZoneChange(e.target.value)}
        >
          {zoneOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <span className="imm-counter">
          {list.length ? `${displayIdx + 1} / ${list.length}` : ''}
        </span>
        <button className="imm-exit-btn" onClick={onClose}>退出 ↙</button>
      </div>

      <div className="imm-photo-area" ref={photoAreaRef}>
        <div className="imm-photo-inner">
          {currentItem?.photoUrl ? (
            <img src={currentItem.photoUrl} draggable={false} alt="" />
          ) : (
            <div className="ann-empty">
              <div style={{ fontSize: 40, opacity: .3, marginBottom: 12 }}>
                {zoneId === 'untagged' ? '✦' : '📷'}
              </div>
              <span>{zoneId === 'untagged' ? '所有衣物都已标注 ✦' : '这里还没有照片'}</span>
            </div>
          )}
        </div>
      </div>

      {currentItem && (
        <div className="imm-panel">
          <div className="ann-row">
            <span className="ann-row-lbl">季节</span>
            {SEASON_KEYS.map(s => (
              <button
                key={s}
                className={`s-btn${seasons.includes(s) ? ' on-' + s : ''}`}
                onClick={() => toggleSeason(s)}
              >
                {SEASON_ICONS[s]} {SEASON_LABELS[s]}
              </button>
            ))}
            <button
              className={`s-all-btn${allSelected ? ' all-on' : ''}`}
              onClick={toggleAllSeasons}
            >
              <span className="s-all-star">✦</span> 全选
            </button>
          </div>
          <div className="ann-row">
            <span className="ann-row-lbl">眼缘</span>
            <button className={`v-btn${currentItem.vibe === 'love' ? ' on-love' : ''}`} onClick={() => setVibe('love')}>💛 喜欢</button>
            <button className={`v-btn${currentItem.vibe === 'ok' ? ' on-ok' : ''}`} onClick={() => setVibe('ok')}>○ 一般</button>
            <button className={`v-btn${currentItem.vibe === 'retire' ? ' on-retire' : ''}`} onClick={() => setVibe('retire')}>↓ 淘汰</button>
          </div>
          <div className="ann-row">
            <span className="ann-row-lbl">备注</span>
            <div className="ann-note-wrap">
              <input
                className="ann-note-input"
                value={noteVal}
                placeholder="搭配想法、什么场合穿..."
                onChange={e => handleNoteChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
