// ============================================================
// ExplorationModal — 探索岛日志面板
// Step 1 骨架：DOM 结构 / 样式 / 交互骨架全部就位
// Step 2 填充：Firebase 实时订阅 + 图片上传逻辑
// ============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import './exploration.css';

// ── 辅助：基于字符串的确定性旋转（不用 Math.random，每次渲染结果一致）
function deterministicRotation(seed, range = 3) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  const norm = (h >>> 0) / 0xFFFFFFFF;           // 0..1
  return ((norm * range * 2) - range).toFixed(2); // -range..+range deg
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}
function fmtDateFull(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// 主组件
// ============================================================
export default function ExplorationModal({ isOpen, zone, onClose }) {
  const [activeCat,  setActiveCat]  = useState('all');
  const [activeDate, setActiveDate] = useState(null);
  const [editOpen,   setEditOpen]   = useState(false);
  // entries 格式: { id, islandId, categoryId, date, text, photos:[{url,storagePath}], starred }
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(false);

  // 打开时重置所有瞬态状态
  useEffect(() => {
    if (isOpen) {
      setActiveCat('all');
      setActiveDate(null);
      setEditOpen(false);
      // TODO step 2: 在此发起 Firebase onSnapshot 订阅，setEntries / setLoading
    }
  }, [isOpen, zone?.id]);

  // 过滤 + 倒序（最新在上）
  const filtered = entries
    .filter(e => activeCat === 'all' || e.categoryId === activeCat)
    .sort((a, b) => b.date.localeCompare(a.date));

  // 有记录的日期列表（升序，时间轴左旧右新）
  const datesWithEntries = [...new Set(filtered.map(e => e.date))].sort();

  // 当前激活日期默认为最新一条
  const displayDate    = activeDate ?? datesWithEntries.at(-1) ?? null;
  const currentEntries = filtered.filter(e => e.date === displayDate);

  const handleDateSelect = useCallback((date) => setActiveDate(date), []);
  const handleTodayBtn   = useCallback(() => setEditOpen(true), []);

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
              <button className="exp-today-btn" onClick={handleTodayBtn}>
                ＋ 今日记录
              </button>
              <button className="exp-close-btn" onClick={onClose} aria-label="关闭">×</button>
            </div>
          </div>

          {/* ── 分类 chip bar（有分类时显示）── */}
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
                <EntryCard key={entry.id} entry={entry} onToggleStar={() => {
                  // TODO step 2: DB.patchExplorationEntry(entry.id, { starred: !entry.starred })
                }} />
              ))}
            </div>
          </div>

          {/* ── 今日记录编辑浮层 ── */}
          {editOpen && (
            <EditOverlay
              zone={zone}
              activeCat={activeCat !== 'all' ? activeCat : null}
              onClose={() => setEditOpen(false)}
              onSave={(data) => {
                // TODO step 2: 上传图片 → saveExplorationEntry
                setEditOpen(false);
              }}
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
  const rot1 = deterministicRotation(entry.id + '_0');
  const rot2 = deterministicRotation(entry.id + '_1');
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
  const [text,   setText]   = useState('');
  const [photos, setPhotos] = useState([]); // [{ previewUrl, file }]，上限 2 张
  const fileRef = useRef(null);
  const today   = todayStr();

  // 卸载时统一释放 object URL，防止内存泄漏
  useEffect(() => {
    return () => { photos.forEach(p => URL.revokeObjectURL(p.previewUrl)); };
  // 仅在 unmount 时执行，intentionally empty deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddPhoto() {
    if (photos.length >= 2) return;
    fileRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许再次选同一文件
    if (!file) return;
    setPhotos(prev => [...prev, { previewUrl: URL.createObjectURL(file), file }]);
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function handleSave() {
    if (!text.trim() && photos.length === 0) { onClose(); return; }
    onSave({
      text: text.trim(),
      photos,
      date: today,
      islandId: zone.id,
      categoryId: activeCat ?? null,
    });
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
      />

      {/* 图片槽：最多 2 张 */}
      <div className="exp-edit-photo-row">
        {photos.map((p, idx) => (
          <div key={idx} className="exp-edit-photo-slot">
            <img src={p.previewUrl} alt="" />
            <button
              className="exp-edit-photo-remove"
              onClick={() => handleRemovePhoto(idx)}
              aria-label="移除图片"
            >×</button>
          </div>
        ))}
        {photos.length < 2 && (
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
        <button className="exp-edit-btn" onClick={onClose}>取消</button>
        <button className="exp-edit-btn primary" onClick={handleSave}>保存</button>
      </div>
    </div>
  );
}
