import { useRef } from 'react';

export default function ZoneNewModal({ isOpen, onClose, onSave }) {
  const nameRef  = useRef(null);
  const emojiRef = useRef(null);

  function handleEmojiInput() {
    const chars = [...(emojiRef.current?.value || '')];
    if (chars.length > 1 && emojiRef.current) emojiRef.current.value = chars[0];
  }

  function handleSave() {
    const name  = nameRef.current?.value.trim()  || '';
    const emoji = emojiRef.current?.value.trim() || '📦';
    onSave(name, emoji);
  }

  // 打开时清空输入框
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay open"
      id="zoneModal"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rpgui-container framed-golden modal-box">
        <div className="modal-title">✦ 新建领域</div>

        <div className="form-group">
          <label>领域名称</label>
          <input
            ref={nameRef}
            className="rpgui-input"
            type="text"
            placeholder="例：画画 / 徒步 / 清洁用品"
          />
        </div>

        <div className="form-group">
          <label>图标（Emoji）</label>
          <input
            ref={emojiRef}
            className="rpgui-input"
            type="text"
            placeholder="🎨"
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
