// ============================================================
// ExplorationModal — Step 2: Firebase 实时订阅 + 图片上传
// ============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { db, DB, collection, query, where, onSnapshot } from '../../firebase.js';
import './exploration.css';

// ── 确定性旋转（seed → 固定角度，不用 Math.random）────────
function deterministicRotation(seed, range = 3) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (((h >>> 0) / 0xFFFFFFFF) * range * 2 - range).toFixed(2);
}

function fmtDateShort(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${parseInt(m)}/${parseInt(day)}`;
}
function fmtDateFull(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${y}年${parseInt(m)}月${parseInt(day)}日`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── 探索图片压缩 ─────────────────────────────────────────
// 两段式：第一段降至安全尺寸防 iOS OOM，第二段输出目标 WebP
// 目标：最长边 ≤ 1200px，WebP quality 0.82
const EXPLORE_PHOTO_PRESHRINK = 2400; // 第一段上限（超出才触发）
const EXPLORE_PHOTO_MAX       = 1200;
const EXPLORE_PHOTO_QUALITY   = 0.82;

async function compressExplorationPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      let { width, height } = img;

      // 第一段：超大图先缩到安全尺寸
      if (Math.max(width, height) > EXPLORE_PHOTO_PRESHRINK) {
        const ratio = EXPLORE_PHOTO_PRESHRINK / Math.max(width, height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      // 第二段：缩到目标尺寸
      if (Math.max(width, height) > EXPLORE_PHOTO_MAX) {
        const ratio = EXPLORE_PHOTO_MAX / Math.max(width, height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob failed')),
        'image/webp',
        EXPLORE_PHOTO_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('image load failed')); };
    img.src = blobUrl;
  });
}

// ============================================================
// 主组件
// ============================================================
export default function ExplorationModal({ isOpen, zone, onClose }) {
  const [activeCat,  setActiveCat]  = useState('all');
  const [activeDate, setActiveDate] = useState(null);
  const [editOpen,   setEditOpen]   = useState(false);
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(false);

  // Firebase 实时订阅
  useEffect(() => {
    if (!isOpen || !zone?.id) return;

    setLoading(true);
    setEntries([]);
    setActiveCat('all');
    setActiveDate(null);
    setEditOpen(false);

    const q = query(
      collection(db, 'explorationEntries'),
      where('islandId', '==', zone.id)
    );
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEntries(rows);
      setLoading(false);
    }, err => {
      console.error('ExplorationModal snapshot error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, zone?.id]);

  // 过滤 + 日期排序
  const filtered = entries
    .filter(e => activeCat === 'all' || e.categoryId === activeCat)
    .sort((a, b) => b.date.localeCompare(a.date));

  const datesWithEntries = [...new Set(filtered.map(e => e.date))].sort();
  const displayDate      = activeDate ?? datesWithEntries.at(-1) ?? null;
  const currentEntries   = filtered.filter(e => e.date === displayDate);

  const handleDateSelect = useCallback(date => setActiveDate(date), []);

  async function handleToggleStar(entry) {
    try {
      await DB.patchExplorationEntry(entry.id, { starred: !entry.starred });
    } catch (e) {
      console.error('toggleStar failed:', e);
    }
  }

  async function handleSaveEntry(data) {
    // data: { text, photos:[{previewUrl,file}], date, islandId, categoryId }
    const entryId = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    // 上传图片
    const uploadedPhotos = [];
    for (let i = 0; i < data.photos.length; i++) {
      try {
        const blob = await compressExplorationPhoto(data.photos[i].file);
        const result = await DB.uploadExplorationPhoto(entryId, i, blob);
        uploadedPhotos.push(result); // { url, storagePath }
      } catch (e) {
        console.error(`photo[${i}] upload failed:`, e);
        // 上传失败跳过该张，不中断整条记录
      }
    }

    await DB.saveExplorationEntry(entryId, {
      islandId:   data.islandId,
      categoryId: data.categoryId ?? null,
      date:       data.date,
      text:       data.text,
      photos:     uploadedPhotos,
      starred:    false,
      createdAt:  now,
      updatedAt:  now,
    });

    setEditOpen(false);
    // onSnapshot 会自动推送新条目，无需手动 setEntries
  }

  if (!isOpen || !zone) return null;

  const cats = zone.cats || [];

  return (
    <div
      className="modal-overlay open"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="exp-scope">
        <div className="exp-wrapper">

          {/* ── Header ── */}
          <div className="exp-header">
            <div className="exp-header-title">
              <span>{zone.emoji || '🔭'}</span>
              <span>{zone.name}</span>
            </div>
            <div className="exp-header-actions">
              <button className="exp-today-btn" onClick={() => setEditOpen(true)}>
                ＋ 今日记录
              </button>
              <button className="exp-close-btn" onClick={onClose} aria-label="关闭">×</button>
            </div>
          </div>

          {/* ── 分类 chip bar ── */}
          {cats.length > 0 && (
            <div className="exp-cat-bar">
              <button
                className={`exp-cat-chip${activeCat === 'all' ? ' active' : ''}`}
                onClick={() => setActiveCat('all')}
              >全部</button>
              {cats.map(cat => (
                <button
                  key={cat.id}
                  className={`exp-cat-chip${activeCat === cat.id ? ' active' : ''}`}
                  onClick={() => setActiveCat(cat.id)}
                >
                  {cat.emoji ? `${cat.emoji} ` : ''}{cat.label || cat.id}
                </button>
              ))}
            </div>
          )}

          {/* ── 时间轴 ── */}
          {datesWithEntries.length > 0 && (
            <div className="exp-timeline-rail">
              <div className="exp-timeline-track">
                {datesWithEntries.map(date => (
                  <button
                    key={date}
                    className={`exp-date-dot${date === displayDate ? ' active' : ''}`}
                    onClick={() => handleDateSelect(date)}
                  >
                    <div className="exp-date-dot-circle" />
                    <div className="exp-date-dot-label">{fmtDateShort(date)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Notebook 主体 ── */}
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
                  <div style={{ fontSize: '12px', opacity: .6 }}>点击「今日记录」开始你的第一篇观察</div>
                </div>
              )}
              {!loading && currentEntries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onToggleStar={() => handleToggleStar(entry)}
                />
              ))}
            </div>
          </div>

          {/* ── 编辑浮层 ── */}
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
function EntryCard({ entry, onToggleStar }) {
  const rot1       = deterministicRotation(entry.id + '_0');
  const rot2       = deterministicRotation(entry.id + '_1');
  const photoCount = entry.photos?.length ?? 0;

  return (
    <div className="exp-entry-card">
      <div className="exp-entry-meta">
        <span className="exp-entry-date">{fmtDateFull(entry.date)}</span>
        <button
          className={`exp-entry-star${entry.starred ? ' starred' : ''}`}
          onClick={onToggleStar}
          aria-label={entry.starred ? '取消收藏' : '收藏'}
        >
          {entry.starred ? '★' : '☆'}
        </button>
      </div>

      {entry.text ? (
        <div className="exp-entry-text">{entry.text}</div>
      ) : null}

      {photoCount > 0 && (
        <div className={`exp-entry-photos count-${photoCount}`}>
          {entry.photos.map((photo, idx) => (
            <div
              key={idx}
              className="exp-photo-frame"
              style={{ transform: `rotate(${idx === 0 ? rot1 : rot2}deg)` }}
            >
              <img src={photo.url} alt="" loading="lazy" draggable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 今日记录编辑浮层
// ============================================================
function EditOverlay({ zone, activeCat, onClose, onSave }) {
  const [text,      setText]      = useState('');
  const [photos,    setPhotos]    = useState([]); // [{previewUrl, file}]，上限 2
  const [saving,    setSaving]    = useState(false);
  const fileRef = useRef(null);
  const today   = todayStr();

  useEffect(() => {
    // 卸载时统一释放 object URL
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
      await onSave({
        text: text.trim(),
        photos,
        date:       today,
        islandId:   zone.id,
        categoryId: activeCat ?? null,
      });
    } catch (e) {
      console.error('saveEntry failed:', e);
      setSaving(false);
    }
    // onSave 内部调用 setEditOpen(false)，此处不需要再操作
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
              <button
                className="exp-edit-photo-remove"
                onClick={() => handleRemovePhoto(idx)}
                aria-label="移除图片"
              >×</button>
            )}
          </div>
        ))}
        {photos.length < 2 && !saving && (
          <div
            className="exp-edit-photo-slot empty"
            onClick={handleAddPhoto}
            role="button"
            aria-label="添加图片"
          >
            <span className="exp-edit-photo-slot-icon">📷</span>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="exp-edit-actions">
        <button className="exp-edit-btn" onClick={onClose} disabled={saving}>取消</button>
        <button className="exp-edit-btn primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}