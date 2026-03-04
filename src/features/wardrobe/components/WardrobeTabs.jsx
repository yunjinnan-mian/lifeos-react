const TABS = [
  { id: 'inventory', label: '衣橱库存' },
  { id: 'stats',     label: '数据统计' },
  { id: 'knowledge', label: '搭配笔记' },
  { id: 'annotate',  label: '季节标注' },
  { id: 'categories',label: '分类管理' },
];

export default function WardrobeTabs({ activeTab, onSwitch }) {
  return (
    <div className="wrd-tabs">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
          onClick={() => onSwitch(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
