import { useState, useEffect, useRef, useCallback } from 'react';
import { DB } from './lib/firebase.js';
import { useItemMapData } from './features/itemMap/hooks/useItemMapData.js';
import { buildWorldGrid, addRipple, applyZoomStep, getZoomValue } from './features/itemMap/engine/mapEngine.js';
import { warmupBgModel, processPhoto, bgModelStatus, setAiStatusCallback } from './lib/photo.js';
import MapCanvas from './features/itemMap/components/MapCanvas.jsx';
import HUD from './features/itemMap/components/HUD.jsx';
import Toast from './components/Toast.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import NavButton from './components/NavButton.jsx';
import StatsModal from './features/itemMap/components/StatsModal.jsx';
import ZoneDetailModal from './features/itemMap/components/ZoneDetailModal.jsx';
import ZoneNewModal from './features/itemMap/components/ZoneNewModal.jsx';
import Wardrobe from './features/wardrobe/index.jsx';
import Finance from './features/finance/index.jsx';
import { ZONE_TYPES, ZOOM_STEP } from './lib/config.js';
import ExplorationModal from './features/exploration/index.jsx';
import PlantModal from './features/plant/PlantModal.jsx';

export default function App() {
  // ── Page routing ──────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState('map');

  // ── Firebase 数据 ─────────────────────────────────────────
  const { zones, setZones, items, syncStatus } = useItemMapData();
  const [itemsByZone, setItemsByZone] = useState(new Map());

  // ── AI 状态 ───────────────────────────────────────────────
  const [aiStatus, setAiStatus] = useState('loading');

  // ── UI 状态 ───────────────────────────────────────────────
  const [openModal, setOpenModal] = useState(null);  // 'zoneDetail'|'zoneNew'|'stats'|null
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [activeTab, setActiveTab] = useState('items');
  const [activeCatId, setActiveCatId] = useState('all');
  const [showRetired, setShowRetired] = useState(false);
  const [useCamera, setUseCamera] = useState(true);
  const [zoom, setZoom] = useState(1);

  // ── Toast ─────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef(null);

  // ── Confirm dialog ────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const confirmResolveRef = useRef(null);

  // zones 的镜像 ref，供 useCallback 内读取最新值而不产生 stale closure
  const _zones_ref = useRef([]);
  useEffect(() => { _zones_ref.current = zones; }, [zones]);

  // ── 照片处理 ──────────────────────────────────────────────
  const photoCameraRef = useRef(null);
  const photoGalleryRef = useRef(null);
  const photoStateRef = useRef({ blob: null, url: null, action: null });
  const editingItemIdRef = useRef(null);
  const pendingPlaceRef = useRef(null);   // {x, y} grid pos for new zone
  const localPreviewCache = useRef(new Map());

  // ── 统计弹窗打开状态 ──────────────────────────────────────
  const openModalCount = openModal ? 1 : 0;

  // ── Toast helpers ─────────────────────────────────────────
  const showToast = useCallback((msg, persist = false) => {
    setToastMsg(msg);
    setToastVisible(true);
    clearTimeout(toastTimerRef.current);
    if (!persist) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), 2200);
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimeout(toastTimerRef.current);
    setToastVisible(false);
  }, []);

  // ── Confirm helper ────────────────────────────────────────
  const showConfirm = useCallback((msg) => {
    return new Promise(resolve => {
      confirmResolveRef.current = resolve;
      setConfirmMsg(msg);
      setConfirmOpen(true);
    });
  }, []);

  const handleConfirmResolve = useCallback((val) => {
    setConfirmOpen(false);
    confirmResolveRef.current?.(val);
    confirmResolveRef.current = null;
  }, []);

  // ── AI status callback ────────────────────────────────────
  useEffect(() => {
    setAiStatusCallback(setAiStatus);
  }, []);

  // ── Rebuild world grid whenever data changes ──────────────
  useEffect(() => {
    const ibz = buildWorldGrid(zones, items);
    setItemsByZone(ibz);
    setZoom(getZoomValue());
  }, [zones, items]);

  // ── Warmup AI after first render ──────────────────────────
  useEffect(() => {
    document.fonts.ready.then(() => warmupBgModel());
  }, []);

  // ── Map tap handlers ──────────────────────────────────────
  const handleTapZone = useCallback((zoneId) => {
    const zone = _zones_ref.current.find(z => z.id === zoneId);
    if (zone?.type === ZONE_TYPES.EXPLORATION) {
      setActiveZoneId(zoneId);
      setOpenModal('exploration');
    } else if (zone?.type === ZONE_TYPES.PLANT) {
      setActiveZoneId(zoneId);
      setOpenModal('plant');
    } else {
      setActiveZoneId(zoneId);
      setActiveTab('items');
      setActiveCatId('all');
      setShowRetired(false);
      setOpenModal('zoneDetail');
    }
  }, []);

  const handleTapEmpty = useCallback((gridPos) => {
    pendingPlaceRef.current = gridPos;
    setOpenModal('zoneNew');
  }, []);

  const handleZoomChange = useCallback((z) => setZoom(z), []);

  // ── Zoom buttons ──────────────────────────────────────────
  const handleZoom = useCallback((dir) => {
    const step = ZOOM_STEP;
    const z = applyZoomStep(dir === 'reset' ? 0 : dir === 'in' ? step : -step);
    setZoom(z);
  }, []);

  // ── Zone CRUD ─────────────────────────────────────────────
  async function handleSaveZone(name, emoji) {
    if (!name) { showToast('请输入领域名称'); return; }
    if (!activeZoneId) return;
    showToast('保存中…', true);
    await DB.saveZoneConfig(zones.map(z => z.id === activeZoneId ? { ...z, name, emoji } : z));
    showToast('已保存 ✓');
    setActiveTab('items');
  }

  async function handleDeleteZone() {
    if (!activeZoneId) return;
    const zone = zones.find(z => z.id === activeZoneId);
    const confirmed = await showConfirm(`确认删除「${zone?.name || '该领域'}」？\n领域下的所有物品和图片将被永久删除，无法恢复。`);
    if (!confirmed) return;
    showToast('删除中…', true);
    const toDelete = itemsByZone.get(activeZoneId) || items.filter(i => i.zoneId === activeZoneId);
    await DB.deleteItemsBatchCompletely(toDelete);
    await DB.saveZoneConfig(zones.filter(z => z.id !== activeZoneId));
    setOpenModal(null);
    showToast('已删除 ✓');
  }

  async function handleSaveNewZone(name, emoji, type = ZONE_TYPES.ITEMS) {
    if (!name) { showToast('请输入领域名称'); return; }
    if (!pendingPlaceRef.current) return;
    const newZone = {
      id: 'zone_' + Date.now(), name, emoji,
      type,
      gridX: pendingPlaceRef.current.x,
      gridY: pendingPlaceRef.current.y,
    };
    await DB.saveZoneConfig([...zones, newZone]);
    addRipple(newZone.id);
    setOpenModal(null);
  }

  // ── Category CRUD ─────────────────────────────────────────
  function handleSwitchCat(catId) {
    if (catId === activeCatId && catId !== 'all') {
      handleDeleteCat(catId);
      return;
    }
    setActiveCatId(catId);
  }

  async function handleAddCat() {
    const emoji = window.prompt('请输入 1 个 Emoji 作为新分类图标：');
    if (!emoji?.trim()) return;
    const finalEmoji = [...emoji.trim()][0];
    const zone = zones.find(z => z.id === activeZoneId);
    if (!zone) return;
    const cats = zone.cats || [];
    if (cats.some(c => c.emoji === finalEmoji)) { showToast('⚠ 该分类已存在'); return; }
    const newCatId = 'cat_' + Date.now();
    const updatedZones = zones.map(z => z.id === activeZoneId
      ? { ...z, cats: [...cats, { id: newCatId, emoji: finalEmoji }] }
      : z);
    await DB.saveZoneConfig(updatedZones);
    setActiveCatId(newCatId);
  }

  async function handleDeleteCat(catId) {
    const confirmed = await showConfirm('确认删除此分类？\n（该分类下的物品不会被删除，将自动归入 ALL）');
    if (!confirmed) return;
    const zone = zones.find(z => z.id === activeZoneId);
    if (!zone) return;
    showToast('分类删除中...', true);
    const updatedCats = (zone.cats || []).filter(c => c.id !== catId);
    await DB.saveZoneConfig(zones.map(z => z.id === activeZoneId ? { ...z, cats: updatedCats } : z));
    const affected = items.filter(i => i.zoneId === activeZoneId && i.categoryId === catId);
    await Promise.all(affected.map(i => DB.patchItem(i.id, { categoryId: '' })));
    setActiveCatId('all');
    hideToast();
  }

  // ── Item management ───────────────────────────────────────
  async function handleToggleRetire(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    await DB.patchItem(itemId, { vibe: item.vibe === 'retire' ? 'love' : 'retire', updatedAt: new Date().toISOString() });
  }

  async function handleSaveNote(itemId, note, oldNote) {
    if (note === (oldNote || '')) return;
    await DB.patchItem(itemId, { note, updatedAt: new Date().toISOString() });
  }

  async function handleDeleteItem(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const confirmed = await showConfirm('确定删除？\n将同时移除图片，不可恢复。');
    if (!confirmed) return;
    await DB.deleteItemCompletely(item);
  }

  function handleRetake(itemId) {
    if (bgModelStatus !== 'ready') { showToast('⏳ AI 模型准备中，请稍候…'); return; }
    editingItemIdRef.current = itemId;
    photoStateRef.current.action = 'replace';
    (useCamera ? photoCameraRef.current : photoGalleryRef.current)?.click();
  }

  function handleAddSlot() {
    if (bgModelStatus !== 'ready') { showToast('⏳ AI 模型准备中，请稍候…'); return; }
    photoStateRef.current.action = 'add';
    editingItemIdRef.current = null;
    revokePhotoUrl();
    (useCamera ? photoCameraRef.current : photoGalleryRef.current)?.click();
  }

  // ── Photo pipeline ────────────────────────────────────────
  function revokePhotoUrl() {
    if (photoStateRef.current.url) {
      URL.revokeObjectURL(photoStateRef.current.url);
      photoStateRef.current.url = null;
    }
  }

  async function onFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const currentAction = photoStateRef.current.action;
    const targetZoneId = activeZoneId;
    const targetItemId = editingItemIdRef.current;

    const blob = await processPhoto(file, showToast);
    hideToast();
    if (!blob) { showToast('图片处理失败'); return; }

    photoStateRef.current.blob = blob;
    revokePhotoUrl();
    photoStateRef.current.url = URL.createObjectURL(blob);

    if (currentAction === 'add') {
      await autoSaveItem(targetZoneId, blob);
    } else if (currentAction === 'replace' && targetItemId) {
      await doReplacePhoto(targetItemId, blob);
    }
  }

  async function autoSaveItem(targetZoneId, blob) {
    const now = new Date().toISOString();
    const id = 'item_' + Date.now();
    const path = `items/${id}.webp`;

    // 乐观预览
    localPreviewCache.current.set(id, photoStateRef.current.url);
    await DB.createItem(id, {
      note: '', usage: '', typeId: '', photoUrl: '', photoStoragePath: path,
      vibe: 'love', domain: 'home',
      zoneId: targetZoneId,
      categoryId: activeCatId !== 'all' ? activeCatId : '',
      type: 'general', isConsumable: false,
      createdAt: now, updatedAt: now,
    });

    const zoneName = zones.find(z => z.id === targetZoneId)?.name || '该领域';
    showToast(`已添加到「${zoneName}」 ✓`);
    addRipple(targetZoneId);

    const currentBlob = blob;
    photoStateRef.current.blob = null;

    try {
      const remoteUrl = await DB.uploadPhoto(path, currentBlob);
      // 上传期间用户可能已删除该条目，校验文档仍存在再写入
      const snap = await DB.getItem(id);
      if (!snap.exists()) {
        await DB.deletePhoto(path).catch(() => {});
        localPreviewCache.current.delete(id);
        revokePhotoUrl();
        return;
      }
      await DB.patchItem(id, { photoUrl: remoteUrl });
      localPreviewCache.current.delete(id);
      revokePhotoUrl();
    } catch (e) {
      console.error('上传失败', e);
      try { await DB.deleteItemById(id); } catch (e2) { console.error('回滚失败', e2); }
      localPreviewCache.current.delete(id);
      revokePhotoUrl();
      showToast('⚠ 上传失败，已自动撤销');
    }
  }

  async function doReplacePhoto(targetItemId, blob) {
    if (!targetItemId || !blob) return;
    const exist = items.find(i => i.id === targetItemId);
    if (!exist) return;
    const path = `items/${targetItemId}.webp`;

    localPreviewCache.current.set(targetItemId, photoStateRef.current.url);
    await DB.patchItem(targetItemId, { updatedAt: new Date().toISOString() });
    showToast('图片已替换 ✓');

    const currentBlob = blob;
    photoStateRef.current.blob = null;

    try {
      const remoteUrl = await DB.uploadPhoto(path, currentBlob);
      if (exist.photoUrl) try { await DB.deletePhoto(exist.photoUrl); } catch (e) { /* ok */ }
      await DB.patchItem(targetItemId, { photoUrl: remoteUrl, photoStoragePath: path });
      localPreviewCache.current.delete(targetItemId);
      revokePhotoUrl();
    } catch (e) {
      console.error('替换上传失败', e);
      localPreviewCache.current.delete(targetItemId);
      revokePhotoUrl();
      showToast('⚠ 替换失败，已撤销预览');
    }
  }

  // ── Current zone data ─────────────────────────────────────
  const activeZone = zones.find(z => z.id === activeZoneId) || null;
  const activeItems = activeZoneId ? (itemsByZone.get(activeZoneId) || []) : [];

  // ── Wardrobe page ─────────────────────────────────────────
  if (currentPage === 'wardrobe') {
    return (
      <div className="wrd-scope">
        <Wardrobe />
        <NavButton onClick={() => setCurrentPage('map')} title="返回地图">🏝️</NavButton>
      </div>
    );
  }

  // ── Finance page ──────────────────────────────────────────
  if (currentPage === 'finance') {
    return (
      <div className="fin-scope">
        <Finance />
        <NavButton onClick={() => setCurrentPage('map')} title="返回地图">🏝️</NavButton>
      </div>
    );
  }

  // ── Map page (default) ────────────────────────────────────
  return (
    <>
      {/* ── Canvas：必须在 rpgui-content 之外，与原始 HTML 结构一致 ── */}
      <MapCanvas
        onTapZone={handleTapZone}
        onTapEmpty={handleTapEmpty}
        onZoomChange={handleZoomChange}
        openModalCount={openModalCount}
      />

      {/* Tooltip & Toast 也在 ui-root 外，避免被 RPGUI 样式影响 */}
      <div id="inv-tooltip" />
      <Toast msg={toastMsg} visible={toastVisible} />

      {/* 衣柜入口 */}
      <NavButton onClick={() => setCurrentPage('wardrobe')} title="衣柜">👗</NavButton>

      {/* 记账入口 */}
      <NavButton onClick={() => setCurrentPage('finance')} title="记账" top="60px">
        💰
      </NavButton>

      <div className="rpgui-content" id="ui-root">

        {/* HUD */}
        <HUD
          zoneCount={zones.length}
          itemCount={items.length}
          syncStatus={syncStatus}
          aiStatus={aiStatus}
          zoom={zoom}
          onOpenStats={() => setOpenModal('stats')}
          onZoom={handleZoom}
        />

        {/* Hidden file inputs */}
        <input ref={photoCameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFileChange} />
        <input ref={photoGalleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />

        {/* Modals */}
        <ZoneDetailModal
          isOpen={openModal === 'zoneDetail'}
          zone={activeZone}
          zoneItems={activeItems}
          localPreviewCache={localPreviewCache.current}
          activeTab={activeTab}
          activeCatId={activeCatId}
          showRetired={showRetired}
          useCamera={useCamera}
          onClose={() => setOpenModal(null)}
          onSwitchTab={setActiveTab}
          onToggleCamera={() => setUseCamera(c => !c)}
          onSwitchCat={handleSwitchCat}
          onAddCat={handleAddCat}
          onAddSlot={handleAddSlot}
          onToggleRetired={() => setShowRetired(s => !s)}
          onToggleRetire={handleToggleRetire}
          onRetake={handleRetake}
          onDeleteItem={handleDeleteItem}
          onSaveNote={handleSaveNote}
          onSaveZone={handleSaveZone}
          onDeleteZone={handleDeleteZone}
        />

        <ZoneNewModal
          isOpen={openModal === 'zoneNew'}
          onClose={() => setOpenModal(null)}
          onSave={handleSaveNewZone}
        />

        <StatsModal
          isOpen={openModal === 'stats'}
          zones={zones}
          items={items}
          itemsByZone={itemsByZone}
          onClose={() => setOpenModal(null)}
        />

        <ConfirmModal
          isOpen={confirmOpen}
          msg={confirmMsg}
          onResolve={handleConfirmResolve}
        />
        <ExplorationModal
          isOpen={openModal === 'exploration'}
          zone={zones.find(z => z.id === activeZoneId) ?? null}
          onClose={() => setOpenModal(null)}
        />
      </div>{/* /ui-root */}

      {/* PlantModal 在 rpgui-content 外，不继承游戏风格样式 */}
      <PlantModal
        isOpen={openModal === 'plant'}
        onClose={() => setOpenModal(null)}
        showToast={showToast}
      />
    </>

  );
}
