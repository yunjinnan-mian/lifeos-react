// ============================================================
// ExplorationModal — 手账纸张，文字对齐横线
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { db, DB, collection, query, where, onSnapshot } from '../../firebase.js';
import './exploration.css';

// ── 日期工具 ─────────────────────────────────────────────
function fmtDateFull(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${y}年${parseInt(m)}月${parseInt(day)}日`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── 确定性旋转（手账贴图用）─────────────────────────────
function deterministicRotation(seed, range = 3) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (((h >>> 0) / 0xFFFFFFFF) * range * 2 - range).toFixed(2);
}

// ── 图片压缩（最长边 ≤ 1200px，WebP 0.82）────────────────
async function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let { width: w, height: h } = img;
      const max = 1200;
      if (Math.max(w, h) > max) { const r = max / Math.max(w, h); w = (w * r) | 0; h = (h * r) | 0; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('img load failed')); };
    img.src = objUrl;
  });
}

// ============================================================
// 主组件
// ============================================================
export default function ExplorationModal({ isOpen, zone, onClose }) {
  const [activeCat, setActiveCat] = useState('all');
  const [editOpen,  setEditOpen]  = useState(false);
  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!isOpen || !zone?.id) return;
    setLoading(true);
    setEntries([]);
    setActiveCat('all');
    setEditOpen(false);

    const q     = query(collection(db, 'explorationEntries'), where('islandId', '==', zone.id));
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error('exp snapshot:', err); setLoading(false); });
    return () => unsub();
  }, [isOpen, zone?.id]);

  const filtered = entries
    .filter(e => activeCat === 'all' || e.categoryId === activeCat)
    .sort((a, b) => b.date.localeCompare(a.date));

  async function handleSaveEntry(data) {
    const entryId        = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now            = Date.now();
    const uploadedPhotos = [];

    for (let i = 0; i < data.photos.length; i++) {
      try {
        const blob   = await compressPhoto(data.photos[i].file);
        const result = await DB.uploadExplorationPhoto(entryId, i, blob);
        uploadedPhotos.push(result);
      } catch (e) { console.error(`photo[${i}] upload:`, e); }
    }

    await DB.saveExplorationEntry(entryId, {
      islandId:   data.islandId,
      categoryId: data.categoryId ?? null,
      date:       data.date,
      text:       data.text,
      photos:     uploadedPhotos,
      createdAt:  now,
      updatedAt:  now,
    });
    setEditOpen(false);
  }

  if (!isOpen || !zone) return null;
  const cats = zone.cats || [];

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="exp-scope">
        <div className="exp-wrapper">

          {/* Header */}
          <div className="exp-header">
            <div className="exp-header-title">
              <span>{zone.emoji || '🔭'}</span>
              <span>{zone.name}</span>
            </div>
            <div className="exp-header-actions">
              <button className="exp-today-btn" onClick={() => setEditOpen(true)}>
                ＋ 今日记录
              </button>
            </div>
          </div>

          {/* 分类 chip bar */}
          {cats.length > 0 && (
            <div className="exp-cat-bar">
              <button className={`exp-cat-chip${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>全部</button>
              {cats.map(cat => (
                <button key={cat.id} className={`exp-cat-chip${activeCat === cat.id ? ' active' : ''}`} onClick={() => setActiveCat(cat.id)}>
                  {cat.emoji ? `${cat.emoji} ` : ''}{cat.label || cat.id}
                </button>
              ))}
            </div>
          )}

          {/* Notebook 主体 */}
          <div className="exp-notebook">
            <div className="exp-entries-area">
              {loading && (
                <div className="exp-empty">
                  <div className="exp-empty-icon">⏳</div>
                  <div>加载中…</div>
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="exp-empty">
                  <div className="exp-empty-icon">🔭</div>
                  <div>还没有记录</div>
                  <div style={{ fontSize: '12px', opacity: .6 }}>点击「今日记录」开始第一篇观察</div>
                </div>
              )}
              {!loading && filtered.map((entry, idx) => {
                const showDate = idx === 0 || filtered[idx - 1].date !== entry.date;
                return (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    showDate={showDate}
                  />
                );
              })}
            </div>
          </div>

          {/* 编辑浮层 */}
          {editOpen && (
            <EditOverlay
              zone={zone}
              activeCat={activeCat !== 'all' ? activeCat : null}
              onClose={() => setEditOpen(false)}
              onSave={handleSaveEntry}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 条目卡片
// ============================================================
function EntryCard({ entry, showDate }) {
  const photos   = entry.photos ?? [];
  const rot1     = deterministicRotation(entry.id + '_0');
  const rot2     = deterministicRotation(entry.id + '_1');
  const [, m, d] = entry.date ? entry.date.split('-') : ['', '', ''];

  return (
    <div className="exp-entry-card">
      {showDate && (
        <div className="exp-entry-date">
          {parseInt(m)}·{parseInt(d)}
        </div>
      )}

      {entry.text && (
        <div className="exp-entry-text">{entry.text}</div>
      )}

      {photos.length > 0 && (
        <div className="exp-entry-photos-sticker">
          {photos.map((p, idx) => (
            <div
              key={idx}
              className="exp-photo-frame"
              style={{ transform: `rotate(${idx === 0 ? rot1 : rot2}deg)` }}
            >
              <img src={p.url} alt="" loading="lazy" draggable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 编辑浮层
// ============================================================
function EditOverlay({ zone, activeCat, onClose, onSave }) {
  // photos: [{ previewUrl, file }]
  const [text,   setText]   = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const today   = todayStr();

  useEffect(() => {
    return () => { photos.forEach(p => URL.revokeObjectURL(p.previewUrl)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddPhoto() {
    if (photos.length >= 2) return;
    fileRef.current?.click();
  }
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotos(prev => [...prev, { previewUrl: URL.createObjectURL(file), file }]);
  }
  function handleRemovePhoto(idx) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSave() {
    if (!text.trim() && photos.length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await onSave({ text: text.trim(), photos, date: today, islandId: zone.id, categoryId: activeCat ?? null });
    } catch (e) {
      console.error('save:', e);
      setSaving(false);
    }
  }

  return (
    <div className="exp-edit-overlay">
      <div className="exp-edit-header">
        <span className="exp-edit-title">今日记录</span>
        <span className="exp-edit-date">{fmtDateFull(today)}</span>
      </div>

      <textarea
        className="exp-edit-textarea"
        placeholder="写下今天观察到的…"
        value={text}
        onChange={e => setText(e.target.value)}
        autoFocus
        disabled={saving}
      />

      <div className="exp-edit-photo-row">
        {photos.map((p, idx) => (
          <div key={idx} className="exp-edit-photo-slot">
            <img src={p.previewUrl} alt="" />
            {!saving && (
              <button className="exp-edit-photo-remove" onClick={() => handleRemovePhoto(idx)} aria-label="移除">×</button>
            )}
          </div>
        ))}
        {photos.length < 2 && !saving && (
          <div className="exp-edit-photo-slot" onClick={handleAddPhoto} role="button">
            <span className="exp-edit-photo-slot-icon">📷</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      <div className="exp-edit-actions">
        <button className="exp-edit-btn" onClick={onClose} disabled={saving}>取消</button>
        <button className="exp-edit-btn primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}