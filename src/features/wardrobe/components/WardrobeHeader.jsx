export default function WardrobeHeader({ syncStatus }) {
  const label = { synced: '已同步', syncing: '同步中', error: '离线', '': '连接中' }[syncStatus] || '';

  return (
    <header className="wrd-header">
      <div className="wrd-logo">装备耐久 <span>· 衣橱</span></div>
      <div className="sync-status">
        <div className={`sync-dot ${syncStatus}`}></div>
        <span>{label}</span>
      </div>
    </header>
  );
}
