import CatBar      from './CatBar.jsx';
import InvGrid     from './InvGrid.jsx';
import ManagePanel from './ManagePanel.jsx';
import EditPanel   from './EditPanel.jsx';

export default function ZoneDetailModal({
  isOpen,
  zone,
  zoneItems,
  localPreviewCache,
  activeTab,
  activeCatId,
  showRetired,
  useCamera,
  onClose,
  onSwitchTab,
  onToggleCamera,
  onSwitchCat,
  onAddCat,
  onAddSlot,
  onToggleRetired,
  onToggleRetire,
  onRetake,
  onDeleteItem,
  onSaveNote,
  onSaveZone,
  onDeleteZone,
}) {
  const cats = zone?.cats || [];

  return (
    <div
      className={`modal-overlay ${isOpen ? 'open' : ''}`}
      id="zoneDetailModal"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="zd-wrapper">
        <div className="rpgui-container framed-golden modal-box">
          <div className="zd-layout">

            {/* 左侧竖向 Tab 栏 */}
            <div className="zd-sidebar">
              <button
                className={`zd-sidetab ${activeTab === 'items' ? 'active' : ''}`}
                id="zdTabItems"
                title="物品"
                onClick={() => onSwitchTab('items')}
              >◈</button>
              <button
                className={`zd-sidetab ${activeTab === 'manage' ? 'active' : ''}`}
                id="zdTabManage"
                title="管理"
                onClick={() => onSwitchTab('manage')}
              >⚖</button>
              <button
                className={`zd-sidetab ${activeTab === 'edit' ? 'active' : ''}`}
                id="zdTabEdit"
                title="编辑"
                onClick={() => onSwitchTab('edit')}
              >⚙</button>
              <div style={{ flex: 1 }} />
              <button
                className={`zd-sidetab ${useCamera ? 'camera-on' : ''}`}
                id="zdTabCamera"
                title={useCamera ? '当前：直接拍照' : '当前：从相册选择'}
                onClick={onToggleCamera}
              >{useCamera ? '◎' : '◫'}</button>
            </div>

            {/* 右侧主体 */}
            <div className="zd-main">
              {/* 分类栏（物品/管理 tab 下显示） */}
              {activeTab !== 'edit' && (
                <CatBar
                  cats={cats}
                  activeCatId={activeCatId}
                  onSwitch={onSwitchCat}
                  onAddCat={onAddCat}
                />
              )}

              {/* 物品面板 */}
              {activeTab === 'items' && (
                <div id="zdPanelItems" className="zd-panel">
                  <div className="inv-scroll">
                    <InvGrid
                      items={zoneItems.filter(i => i.vibe !== 'retire' && (activeCatId === 'all' || i.categoryId === activeCatId))}
                      localPreviewCache={localPreviewCache}
                      onAddSlot={onAddSlot}
                    />
                  </div>
                </div>
              )}

              {/* 管理面板 */}
              {activeTab === 'manage' && (
                <div id="zdPanelManage" className="zd-panel">
                  <ManagePanel
                    items={zoneItems}
                    localPreviewCache={localPreviewCache}
                    showRetired={showRetired}
                    activeCatId={activeCatId}
                    onToggleRetired={onToggleRetired}
                    onToggleRetire={onToggleRetire}
                    onRetake={onRetake}
                    onDelete={onDeleteItem}
                    onSaveNote={onSaveNote}
                  />
                </div>
              )}

              {/* 编辑面板 */}
              {activeTab === 'edit' && (
                <div id="zdPanelEdit" className="zd-panel">
                  <EditPanel
                    zone={zone}
                    onSave={onSaveZone}
                    onDelete={onDeleteZone}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
