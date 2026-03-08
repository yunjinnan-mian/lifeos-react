// ============================================================
// ExplorationModal — Step 3: 线条对齐 + MediaPipe 去背 + 绕排
// 依赖：npm install @mediapipe/tasks-vision
// ============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { db, DB, collection, query, where, onSnapshot } from '../../firebase.js';
import './exploration.css';

// ── 日期工具 ─────────────────────────────────────────────
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

// ── 确定性旋转（手账贴图用）─────────────────────────────
function deterministicRotation(seed, range = 3) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (((h >>> 0) / 0xFFFFFFFF) * range * 2 - range).toFixed(2);
}

// ── 探索图片压缩（两段式，最长边 ≤ 1200px，WebP 0.82）──
const PRESHRINK = 2400;
const MAX_SIDE  = 1200;
const QUALITY   = 0.82;

async function compressExplorationPhoto(file) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let { width: w, height: h } = img;
      const maxIn = Math.max(w, h);
      if (maxIn > PRESHRINK) { const r = PRESHRINK / maxIn; w = (w * r) | 0; h = (h * r) | 0; }
      if (Math.max(w, h) > MAX_SIDE) { const r = MAX_SIDE / Math.max(w, h); w = (w * r) | 0; h = (h * r) | 0; }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('img load failed')); };
    img.src = objUrl;
  });
}

// ── MediaPipe ImageSegmenter 单例（懒加载）────────────────
// 模型：DeepLab v3（PASCAL VOC 21类，支持 plant/bottle 等物品）
// wasm：jsdelivr CDN（国内相对可访问）
// 注意：首次加载约 3–6s，后续复用同一实例
let _segmenter      = null;
let _segLoading     = false;
const _segWaiters   = [];

async function getSegmenter() {
  if (_segmenter) return _segmenter;
  if (_segLoading) return new Promise((res, rej) => _segWaiters.push({ res, rej }));
  _segLoading = true;
  try {
    const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    _segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
        delegate: 'GPU',
      },
      outputCategoryMask:    true,
      outputConfidenceMasks: false,
      runningMode:           'IMAGE',
    });
    _segWaiters.forEach(w => w.res(_segmenter));
  } catch (err) {
    _segLoading = false;
    _segWaiters.forEach(w => w.rej(err));
    _segWaiters.length = 0;
    throw err;
  }
  _segLoading = false;
  _segWaiters.length = 0;
  return _segmenter;
}

// 对 HTMLImageElement 执行去背，返回透明背景的 canvas
// DeepLab category 0 = background → transparent
async function removeBackground(imgEl) {
  const seg    = await getSegmenter();
  const result = seg.segment(imgEl);
  const { categoryMask } = result;
  const maskData = categoryMask.getAsUint8Array();
  const mW = categoryMask.width;
  const mH = categoryMask.height;
  const iW = imgEl.naturalWidth  || imgEl.width;
  const iH = imgEl.naturalHeight || imgEl.height;

  const cv  = document.createElement('canvas');
  cv.width  = iW;
  cv.height = iH;
  const ctx = cv.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, iW, iH);

  const imgData = ctx.getImageData(0, 0, iW, iH);
  const { data } = imgData;

  // 预计算每行/列对应的 mask 坐标
  const xMap = new Int32Array(iW);
  const yMap = new Int32Array(iH);
  for (let px = 0; px < iW; px++) xMap[px] = ((px / iW * (mW - 1)) + 0.5) | 0;
  for (let py = 0; py < iH; py++) yMap[py] = ((py / iH * (mH - 1)) + 0.5) | 0;

  for (let py = 0; py < iH; py++) {
    const maskRow = yMap[py] * mW;
    const imgRow  = py * iW;
    for (let px = 0; px < iW; px++) {
      if (maskData[maskRow + xMap[px]] === 0) {
        data[(imgRow + px) * 4 + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  categoryMask.close();
  return cv;
}

// canvas → blob（WebP with alpha）
function canvasToBlob(canvas) {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/webp', QUALITY)
  );
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

  useEffect(() => {
    if (!isOpen || !zone?.id) return;
    setLoading(true);
    setEntries([]);
    setActiveCat('all');
    setActiveDate(null);
    setEditOpen(false);

    const q    = query(collection(db, 'explorationEntries'), where('islandId', '==', zone.id));
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error('exp snapshot:', err); setLoading(false); });
    return () => unsub();
  }, [isOpen, zone?.id]);

  const filtered     = entries
    .filter(e => activeCat === 'all' || e.categoryId === activeCat)
    .sort((a, b) => b.date.localeCompare(a.date));
  const datesAll     = [...new Set(filtered.map(e => e.date))].sort();
  const displayDate  = activeDate ?? datesAll.at(-1) ?? null;
  const current      = filtered.filter(e => e.date === displayDate);

  const handleDateSelect = useCallback(d => setActiveDate(d), []);

  async function handleToggleStar(entry) {
    try { await DB.patchExplorationEntry(entry.id, { starred: !entry.starred }); }
    catch (e) { console.error('toggleStar:', e); }
  }

  async function handleSaveEntry(data) {
    const entryId = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now     = Date.now();
    const uploadedPhotos = [];

    for (let i = 0; i < data.photos.length; i++) {
      const p = data.photos[i];
      try {
        // 如果已去背，直接用去背 blob；否则压缩原图
        const blob   = p.nobgBlob ?? await compressExplorationPhoto(p.file);
        const result = await DB.uploadExplorationPhoto(entryId, i, blob);
        uploadedPhotos.push({ ...result, nobg: !!p.nobgBlob });
      } catch (e) { console.error(`photo[${i}] upload:`, e); }
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

          {/* 时间轴 */}
          {datesAll.length > 0 && (
            <div className="exp-timeline-rail">
              <div className="exp-timeline-track">
                {datesAll.map(date => (
                  <button key={date} className={`exp-date-dot${date === displayDate ? ' active' : ''}`} onClick={() => handleDateSelect(date)}>
                    <div className="exp-date-dot-circle" />
                    <div className="exp-date-dot-label">{fmtDateShort(date)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notebook 主体 */}
          <div className="exp-notebook">
            <div className="exp-entries-area">
              {loading && <div className="exp-empty"><div className="exp-empty-icon">⏳</div><div>加载中…</div></div>}
              {!loading && filtered.length === 0 && (
                <div className="exp-empty">
                  <div className="exp-empty-icon">🔭</div>
                  <div>还没有记录</div>
                  <div style={{ fontSize: '12px', opacity: .6 }}>点击「今日记录」开始第一篇观察</div>
                </div>
              )}
              {!loading && current.map(entry => (
                <EntryCard key={entry.id} entry={entry} onToggleStar={() => handleToggleStar(entry)} />
              ))}
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
function EntryCard({ entry, onToggleStar }) {
  const photos     = entry.photos ?? [];
  const hasNobg    = photos.some(p => p.nobg);
  const rot1       = deterministicRotation(entry.id + '_0');
  const rot2       = deterministicRotation(entry.id + '_1');

  return (
    <div className="exp-entry-card">
      <div className="exp-entry-meta">
        <span className="exp-entry-date">{fmtDateFull(entry.date)}</span>
        <button className={`exp-entry-star${entry.starred ? ' starred' : ''}`} onClick={onToggleStar}>
          {entry.starred ? '★' : '☆'}
        </button>
      </div>

      {/* 有去背图片 → 文字绕排 */}
      {hasNobg ? (
        <div className="exp-entry-flow">
          {photos[0]?.nobg && (
            <img src={photos[0].url} className="exp-photo-nobg float-left" alt="" loading="lazy" draggable={false} />
          )}
          {photos[1]?.nobg && (
            <img src={photos[1].url} className="exp-photo-nobg float-right" alt="" loading="lazy" draggable={false} />
          )}
          {/* 非去背的图作为普通贴图追加 */}
          {photos.filter(p => !p.nobg).length > 0 && (
            <div className="exp-entry-photos-sticker" style={{ clear: 'none' }}>
              {photos.filter(p => !p.nobg).map((p, idx) => (
                <div key={idx} className="exp-photo-frame" style={{ transform: `rotate(${deterministicRotation(entry.id + '_r' + idx)}deg)` }}>
                  <img src={p.url} alt="" loading="lazy" draggable={false} />
                </div>
              ))}
            </div>
          )}
          {entry.text && <div className="exp-flow-text">{entry.text}</div>}
        </div>
      ) : (
        /* 无去背 → 手账贴图 + 文字 */
        <>
          {entry.text && <div className="exp-entry-text">{entry.text}</div>}
          {photos.length > 0 && (
            <div className="exp-entry-photos-sticker">
              {photos.map((p, idx) => (
                <div key={idx} className="exp-photo-frame" style={{ transform: `rotate(${idx === 0 ? rot1 : rot2}deg)` }}>
                  <img src={p.url} alt="" loading="lazy" draggable={false} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// 编辑浮层
// ============================================================
function EditOverlay({ zone, activeCat, onClose, onSave }) {
  const [text,   setText]   = useState('');
  // photos: [{ previewUrl, file, nobgBlob?, nobgPreviewUrl?, nobgState: 'idle'|'loading'|'done'|'error' }]
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const today   = todayStr();

  useEffect(() => {
    return () => {
      photos.forEach(p => {
        URL.revokeObjectURL(p.previewUrl);
        if (p.nobgPreviewUrl) URL.revokeObjectURL(p.nobgPreviewUrl);
      });
    };
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
    setPhotos(prev => [
      ...prev,
      { previewUrl: URL.createObjectURL(file), file, nobgBlob: null, nobgPreviewUrl: null, nobgState: 'idle' }
    ]);
  }
  function handleRemovePhoto(idx) {
    setPhotos(prev => {
      const p = prev[idx];
      URL.revokeObjectURL(p.previewUrl);
      if (p.nobgPreviewUrl) URL.revokeObjectURL(p.nobgPreviewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleNobg(idx) {
    setPhotos(prev => prev.map((p, i) => i === idx ? { ...p, nobgState: 'loading' } : p));
    try {
      const p   = photos[idx];
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = p.previewUrl; });
      const canvas    = await removeBackground(img);
      const nobgBlob  = await canvasToBlob(canvas);
      const nobgPreviewUrl = URL.createObjectURL(nobgBlob);
      setPhotos(prev => prev.map((ph, i) =>
        i === idx ? { ...ph, nobgBlob, nobgPreviewUrl, nobgState: 'done' } : ph
      ));
    } catch (err) {
      console.error('removeBackground failed:', err);
      setPhotos(prev => prev.map((p, i) => i === idx ? { ...p, nobgState: 'error' } : p));
    }
  }

  function handleNobgUndo(idx) {
    setPhotos(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      if (p.nobgPreviewUrl) URL.revokeObjectURL(p.nobgPreviewUrl);
      return { ...p, nobgBlob: null, nobgPreviewUrl: null, nobgState: 'idle' };
    }));
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
        {photos.map((p, idx) => {
          const displayUrl = p.nobgState === 'done' ? p.nobgPreviewUrl : p.previewUrl;
          const isNobg     = p.nobgState === 'done';
          return (
            <div key={idx} className="exp-edit-photo-wrap">
              <div className="exp-edit-photo-slot">
                <img src={displayUrl} alt="" className={isNobg ? 'nobg-preview' : ''} />
                {!saving && (
                  <button className="exp-edit-photo-remove" onClick={() => handleRemovePhoto(idx)} aria-label="移除">×</button>
                )}
              </div>
              {/* 去背控制按钮 */}
              {!saving && p.nobgState === 'idle' && (
                <button className="exp-nobg-btn" onClick={() => handleNobg(idx)}>✂ 去背</button>
              )}
              {p.nobgState === 'loading' && (
                <span className="exp-nobg-loading">⏳ 处理中</span>
              )}
              {p.nobgState === 'done' && (
                <button className="exp-nobg-btn applied" onClick={() => handleNobgUndo(idx)}>↩ 恢复</button>
              )}
              {p.nobgState === 'error' && (
                <button className="exp-nobg-btn" onClick={() => handleNobg(idx)} style={{ color: '#c04040' }}>✖ 重试</button>
              )}
            </div>
          );
        })}
        {photos.length < 2 && !saving && (
          <div className="exp-edit-photo-slot" style={{ cursor: 'pointer' }} onClick={handleAddPhoto} role="button">
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