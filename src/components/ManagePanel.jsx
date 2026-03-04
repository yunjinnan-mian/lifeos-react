import { useRef } from 'react';

export default function ManagePanel({
  items,
  localPreviewCache,
  showRetired,
  activeCatId,
  onToggleRetired,
  onToggleRetire,
  onRetake,
  onDelete,
  onSaveNote,
}) {
  const allRetiredCount = items.filter(i => i.vibe === 'retire').length;

  let visible = showRetired
    ? items.filter(i => i.vibe === 'retire')
    : items.filter(i => i.vibe !== 'retire');

  if (activeCatId !== 'all') {
    visible = visible.filter(i => i.categoryId === activeCatId);
  }

  return (
    <>
      <div className="manage-header">
        <span className="manage-header-label">
          {allRetiredCount > 0 ? `已弃用 ${allRetiredCount} 件` : ''}
        </span>
        <button
          className={`manage-retired-btn ${showRetired ? 'active' : ''}`}
          onClick={onToggleRetired}
        >
          {showRetired ? '✦ 隐藏已弃用' : '◌ 查看已弃用'}
        </button>
      </div>

      <div className="inv-scroll">
        <div>
          {visible.length === 0 && (
            <div style={{ color: '#7a5018', padding: '20px 0', fontSize: '16px', textAlign: 'center', letterSpacing: '1px' }}>
              暂无物品
            </div>
          )}
          {visible.map(item => (
            <ManageCard
              key={item.id}
              item={item}
              displayUrl={localPreviewCache.get(item.id) || item.photoUrl}
              onToggleRetire={() => onToggleRetire(item.id)}
              onRetake={() => onRetake(item.id)}
              onDelete={() => onDelete(item.id)}
              onSaveNote={(note) => onSaveNote(item.id, note, item.note)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ManageCard({ item, displayUrl, onToggleRetire, onRetake, onDelete, onSaveNote }) {
  const taRef = useRef(null);
  const isRetired = item.vibe === 'retire';

  function handleBlur() {
    if (taRef.current) onSaveNote(taRef.current.value.trim());
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); taRef.current?.blur(); }
  }

  return (
    <div className={`manage-card ${isRetired ? 'retired' : ''}`}>
      {/* 弃用勾选 */}
      <div className="manage-col-retire" onClick={onToggleRetire}>
        <span className="manage-retire-label">弃用</span>
        <div className={`manage-retire-box ${isRetired ? 'checked' : ''}`}>✔</div>
      </div>

      {/* 缩略图 */}
      <div className="manage-thumb">
        {displayUrl
          ? <img src={displayUrl} loading="lazy" alt="" />
          : <span className="manage-thumb-empty">📦</span>
        }
      </div>

      {/* 操作按钮 */}
      <div className="manage-actions">
        <button className="manage-icon-btn" title="重拍" onClick={onRetake}>↺</button>
        <button className="manage-icon-btn danger" title="删除" onClick={onDelete}>✕</button>
      </div>

      {/* 备注 */}
      <div className="manage-note-col">
        <span className="manage-note-label">备注</span>
        <textarea
          ref={taRef}
          className="manage-note-input"
          defaultValue={item.note || ''}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
