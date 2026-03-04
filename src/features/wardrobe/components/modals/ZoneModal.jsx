import { useState, useEffect } from 'react';

const EMOJI_OPTS = ['🧢','🪖','👒','🎩','🧣','🧤','👕','👔','🧥','🥼','👗','👘','👖','👟','👠','👡','👢','🥿','👜','👝','🎒','💼','💍','⌚','🕶️'];

export default function ZoneModal({ open, zone, onSave, onClose }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📦');

  useEffect(() => {
    if (!open) return;
    setName(zone?.name || '');
    setEmoji(zone?.emoji || '📦');
  }, [open, zone?.id]);

  function handleSave() {
    if (!name.trim()) { alert('请输入名称'); return; }
    onSave({ name, emoji });
  }

  if (!open) return null;

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{zone ? '编辑分类' : '新建大分类'}</div>

        <div className="form-group">
          <label>图标</label>
          <div className="emoji-row">
            {EMOJI_OPTS.map(e => (
              <span
                key={e}
                className={`emoji-opt${e === emoji ? ' selected' : ''}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </span>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>名称</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例如：头部" />
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
