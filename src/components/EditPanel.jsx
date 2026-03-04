import { useEffect, useRef } from 'react';

export default function EditPanel({ zone, onSave, onDelete }) {
  const nameRef  = useRef(null);
  const emojiRef = useRef(null);

  // 每次 zone 改变时同步输入框
  useEffect(() => {
    if (!zone) return;
    if (nameRef.current)  nameRef.current.value  = zone.name  || '';
    if (emojiRef.current) emojiRef.current.value = zone.emoji || '';
  }, [zone]);

  function handleEmojiInput() {
    const chars = [...(emojiRef.current?.value || '')];
    if (chars.length > 1 && emojiRef.current) emojiRef.current.value = chars[0];
  }

  function handleSave() {
    const name  = nameRef.current?.value.trim()  || '';
    const emoji = emojiRef.current?.value.trim() || '📦';
    onSave(name, emoji);
  }

  return (
    <>
      <div className="edit-row-2col">
        <div className="edit-col-wide">
          <label className="edit-label">领域名称</label>
          <input ref={nameRef} className="rpgui-input" type="text" placeholder="例：画画 / 徒步" />
        </div>
        <div className="edit-col-emoji">
          <label className="edit-label">图标</label>
          <input
            ref={emojiRef}
            className="rpgui-input"
            type="text"
            placeholder="📦"
            onInput={handleEmojiInput}
          />
        </div>
      </div>
      <div className="edit-save-actions">
        <button className="edit-action-btn" onClick={handleSave}>保存</button>
        <button className="edit-action-btn danger" onClick={onDelete}>
          ⚠ 删除领域及全部物品
        </button>
      </div>
    </>
  );
}
