import { useRef, useState } from 'react';
import { ZONE_TYPES } from '../../../lib/config.js';

const TYPE_OPTIONS = [
  { value: ZONE_TYPES.ITEMS, emoji: '📦', label: '物品岛', desc: '储存与管理物品' },
  { value: ZONE_TYPES.EXPLORATION, emoji: '🔭', label: '探索岛', desc: '记录观察与日志' },
];

export default function ZoneNewModal({ isOpen, onClose, onSave }) {
  const nameRef = useRef(null);
  const emojiRef = useRef(null);
  const [zoneType, setZoneType] = useState(ZONE_TYPES.ITEMS);

  function handleEmojiInput() {
    const chars = [...(emojiRef.current?.value || '')];
    if (chars.length > 1 && emojiRef.current) emojiRef.current.value = chars[0];
  }

  function handleSave() {
    const name = nameRef.current?.value.trim() || '';
    const emoji = emojiRef.current?.value.trim()
      || TYPE_OPTIONS.find(o => o.value === zoneType)?.emoji
      || '📦';
    onSave(name, emoji, zoneType);
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay open"
      id="zoneModal"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rpgui-container framed-golden modal-box">
        <div className="modal-title">✦ 新建领域</div>

        {/* 岛屿类型选择 */}
        <div className="form-group">
          <label>领域类型</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setZoneType(opt.value)}
                style={{
                  flex: 1,
                  padding: '8px 4px 7px',
                  background: zoneType === opt.value
                    ? 'linear-gradient(to bottom, rgba(200,160,30,.25), rgba(200,160,30,.12))'
                    : 'rgba(0,0,0,.2)',
                  border: zoneType === opt.value
                    ? '2px solid rgba(200,160,30,.7)'
                    : '2px solid rgba(200,160,30,.2)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: zoneType === opt.value ? '#FFE878' : '#C49050',
                  transition: 'border-color .12s, background .12s',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontSize: '18px', marginBottom: '2px' }}>{opt.emoji}</div>
                <div style={{ fontSize: '11px', letterSpacing: '1px', fontWeight: 'bold' }}>{opt.label}</div>
                <div style={{ fontSize: '9px', opacity: 0.65, marginTop: '2px', letterSpacing: '0.5px' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>领域名称</label>
          <input
            ref={nameRef}
            className="rpgui-input"
            type="text"
            placeholder={
              zoneType === ZONE_TYPES.EXPLORATION
                ? '例：水培 / 香薰 / 阅读'
                : '例：画画 / 徒步 / 清洁用品'
            }
          />
        </div>

        <div className="form-group">
          <label>图标（Emoji）</label>
          <input
            ref={emojiRef}
            className="rpgui-input"
            type="text"
            placeholder={TYPE_OPTIONS.find(o => o.value === zoneType)?.emoji}
            onInput={handleEmojiInput}
          />
        </div>

        <div className="btn-row">
          <button className="rpgui-button" type="button" onClick={onClose}><p>取消</p></button>
          <button className="rpgui-button" type="button" onClick={handleSave}>
            <p style={{ color: '#FFD700', textShadow: '0 0 5px rgba(255,215,0,0.5)' }}>放置</p>
          </button>
        </div>
      </div>
    </div>
  );
}