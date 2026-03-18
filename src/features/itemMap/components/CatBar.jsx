export default function CatBar({ cats, activeCatId, onSwitch, onAddCat }) {
  return (
    <div className="cat-bar">
      {/* ALL 按钮 */}
      <div
        className={`cat-tab all-tab ${activeCatId === 'all' ? 'active' : ''}`}
        onClick={() => onSwitch('all')}
      >ALL</div>

      {/* 各分类 */}
      {cats.map(c => (
        <div
          key={c.id}
          className={`cat-tab ${activeCatId === c.id ? 'active' : ''}`}
          title={activeCatId === c.id ? '再次点击删除此分类' : ''}
          onClick={() => onSwitch(c.id)}
        >
          {c.emoji}
        </div>
      ))}

      {/* 新增按钮 */}
      <div className="cat-tab add-btn" title="新增分类" onClick={onAddCat}>＋</div>
    </div>
  );
}
