export default function KnowledgeSection({ notes, onNewNote, onEditNote }) {
  return (
    <div className="knowledge-wrap">
      <div className="knowledge-header">
        <div className="section-heading">搭配笔记</div>
        <button className="btn-add" onClick={onNewNote}>＋ 新建</button>
      </div>
      <div className="notes-grid">
        {notes.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="empty-icon">📝</div>
            <p>还没有搭配笔记</p>
          </div>
        ) : notes.map(n => (
          <div key={n.id} className="note-card" onClick={() => onEditNote(n.id)}>
            {n.tag && <div className="note-tag">{n.tag}</div>}
            <div className="note-title">{n.title || '无标题'}</div>
            <div className="note-preview">{n.content || ''}</div>
            <div className="note-date">{n.updatedAt?.slice(0, 10) || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
