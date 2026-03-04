import { useState, useEffect } from 'react';

export default function NoteModal({ open, note, onSave, onDelete, onClose }) {
  const [tag, setTag] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setTag(note?.tag || '');
    setTitle(note?.title || '');
    setContent(note?.content || '');
  }, [open, note?.id]);

  function handleSave() {
    if (!title.trim()) { alert('请输入标题'); return; }
    onSave({ tag, title, content });
  }

  if (!open) return null;

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{note ? '编辑笔记' : '新建笔记'}</div>

        <div className="form-group">
          <label>标签</label>
          <input type="text" value={tag} onChange={e => setTag(e.target.value)} placeholder="颜色搭配、比例..." />
        </div>
        <div className="form-group">
          <label>标题</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="笔记标题" />
        </div>
        <div className="form-group">
          <label>内容</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="写下搭配知识..." style={{ minHeight: 130 }} />
        </div>

        <div className="modal-actions">
          {note && <button className="btn-delete" onClick={onDelete}>删除</button>}
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
