import { useState, useEffect, useRef } from 'react';
import { SEASON_KEYS } from '../../constants';
import { compressImage, formatSize } from '../../utils/imageUtils';

const SEASON_DEFS = [
  { key: 'spring', icon: '🌸', label: '春' },
  { key: 'summer', icon: '☀️', label: '夏' },
  { key: 'autumn', icon: '🍂', label: '秋' },
  { key: 'winter', icon: '❄️', label: '冬' },
];

export default function ItemModal({ open, item, zones, zoneTypes, onSave, onDelete, onClose }) {
  const [typeId, setTypeId] = useState('');
  const [vibe, setVibe] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [note, setNote] = useState('');
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [compressInfo, setCompressInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!open || !item) return;
    setTypeId(item.typeId || '');
    setVibe(item.vibe || null);
    setSeasons(item.seasons || []);
    setNote(item.note || '');
    setPhotoBlob(null);
    setPhotoPreview(item.photoUrl || null);
    setCompressInfo('');
  }, [open, item?.id]);

  async function handlePhoto(file) {
    if (!file) return;
    setCompressInfo('压缩中...');
    const compressed = await compressImage(file);
    setPhotoBlob(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
    setCompressInfo(`${formatSize(file.size)} → ${formatSize(compressed.size)}`);
  }

  function toggleSeason(key) {
    setSeasons(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ typeId, vibe, seasons, note, photoBlob, existingPhotoUrl: item?.photoUrl });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">编辑衣物</div>

        {/* Photo */}
        <div className="form-group">
          <label>照片</label>
          <div className="photo-row">
            <div className="photo-preview-box">
              {photoPreview
                ? <img src={photoPreview} alt="" />
                : <div className="photo-icon">🧥</div>}
            </div>
            <div className="photo-btns">
              <button className="photo-btn photo-btn-gallery" onClick={() => galleryRef.current.click()}>
                🖼 相册
              </button>
              <button className="photo-btn photo-btn-camera" onClick={() => cameraRef.current.click()}>
                📸 拍照
              </button>
              <div className="compress-info">{compressInfo}</div>
            </div>
          </div>
          <input type="file" ref={galleryRef} accept="image/*" onChange={e => handlePhoto(e.target.files[0])} />
          <input type="file" ref={cameraRef} accept="image/*" capture="environment" onChange={e => handlePhoto(e.target.files[0])} />
        </div>

        {/* Type */}
        <div className="form-group">
          <label>小分类</label>
          <select value={typeId} onChange={e => setTypeId(e.target.value)}>
            {zoneTypes.map(t => (
              <option key={t.id} value={t.id}>
                {zones.find(z => z.id === t.zoneId)?.name || ''} · {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Season */}
        <div className="form-group">
          <label>季节</label>
          <div className="item-season-row">
            {SEASON_DEFS.map(d => (
              <button
                key={d.key}
                className={`item-s-btn${seasons.includes(d.key) ? ' active-' + d.key : ''}`}
                onClick={() => toggleSeason(d.key)}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vibe */}
        <div className="form-group">
          <label>眼缘</label>
          <div className="vibe-selector">
            {[['love', '💛 喜欢'], ['ok', '○ 一般'], ['retire', '↓ 淘汰']].map(([v, lbl]) => (
              <button
                key={v}
                className={`vibe-opt${vibe === v ? ' active' : ''}`}
                data-vibe={v}
                onClick={() => setVibe(vibe === v ? null : v)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="form-group">
          <label>备注</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="搭配想法、什么场合穿..." />
        </div>

        <div className="modal-actions">
          {item && <button className="btn-delete" onClick={onDelete}>删除</button>}
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
