import { useState, useEffect } from 'react';

export default function TransferModal({ open, desc, options, onConfirm, onClose }) {
  const [targetVal, setTargetVal] = useState('');

  useEffect(() => {
    if (open && options.length) setTargetVal(options[0].value);
  }, [open, options]);

  if (!open) return null;

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">转移衣物</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>{desc}</p>

        <div className="form-group">
          <label>转移到</label>
          <select value={targetVal} onChange={e => setTargetVal(e.target.value)}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={() => onConfirm(targetVal)}>确认转移并删除</button>
        </div>
      </div>
    </div>
  );
}
