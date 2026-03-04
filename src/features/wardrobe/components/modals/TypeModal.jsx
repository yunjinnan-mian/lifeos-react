import { useState, useEffect } from 'react';

export default function TypeModal({ open, type, onSave, onClose }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel(type?.label || '');
  }, [open, type?.id]);

  function handleSave() {
    if (!label.trim()) { alert('请输入名称'); return; }
    onSave({ label });
  }

  if (!open) return null;

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{type ? '编辑小分类' : '新建小分类'}</div>

        <div className="form-group">
          <label>名称</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="例如：帽子" />
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
