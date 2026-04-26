import { useState, useRef, useCallback } from 'react';
import { usePlants } from './hooks/usePlants.js';
import { useMasonryVirtual } from './hooks/useMasonryVirtual.js';
import PolaroidCard from './components/PolaroidCard.jsx';
import PlantActionPanel from './components/PlantActionPanel.jsx';
import NewPlantModal from './components/NewPlantModal.jsx';
import { PlantDB } from '../../../lib/db.js';
import { compressWebP } from '../../../lib/photo.js';
import { PLANT_CONFIG } from '../../../lib/config.js';
import './plant.css';

// Toast 由父层提供或在此简单实现（与项目已有 Toast 组件对齐）
function useToast() {
  const [msg, setMsg] = useState('');
  const timerRef = useRef(null);
  const show = useCallback((text) => {
    setMsg(text);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(''), 2500);
  }, []);
  return { msg, show };
}

export default function PlantPage() {
  const { plants, latestLogs, loading } = usePlants();
  const containerRef                    = useRef(null);
  const { positions, containerHeight, visibleIds } = useMasonryVirtual(plants, containerRef);

  const [actionTarget, setActionTarget] = useState(null); // plant object | null
  const [showNewPlant, setShowNewPlant] = useState(false);
  const { msg: toastMsg, show: showToast } = useToast();

  // ── 拖拽排序 ────────────────────────────────────────────────────────────
  const dragIdRef   = useRef(null);
  const dragOverRef = useRef(null); // 当前悬停的目标 plantId

  function handleDragStart(plantId) {
    dragIdRef.current   = plantId;
    dragOverRef.current = null;
  }

  function handleDragOver(e, plantId) {
    e.preventDefault();
    dragOverRef.current = plantId;
  }

  async function handleDrop(targetPlantId) {
    const dragId = dragIdRef.current;
    dragIdRef.current   = null;
    dragOverRef.current = null;

    if (!dragId || dragId === targetPlantId) return;

    // 在 await 前快照当前顺序
    const ordered    = [...plants];
    const targetIdx  = ordered.findIndex(p => p.id === targetPlantId);
    if (targetIdx < 0) return;

    const prev      = ordered[targetIdx - 1];
    const prevOrder = prev ? (prev.sort_order ?? 0) : ((ordered[targetIdx].sort_order ?? 1000) - 2000);
    const nextOrder = ordered[targetIdx].sort_order ?? 0;
    const newOrder  = (prevOrder + nextOrder) / 2;

    await PlantDB.patchPlant(dragId, {
      sort_order: newOrder,
      updated_at: new Date().toISOString(),
    });
  }

  // ── 背面文字保存 ─────────────────────────────────────────────────────────
  const handleTextSave = useCallback(async (logId, text) => {
    if (!logId) return;
    await PlantDB.patchGrowthLog(logId, {
      text_content: text,
    });
  }, []);

  // ── 更新状态图片（乐观更新）──────────────────────────────────────────────
  const handleUpdatePhoto = useCallback(async (plant, file) => {
    // 在第一个 await 前快照所有上下文
    const plantId     = plant.id;
    const now         = new Date().toISOString();
    const logId       = 'log_' + Date.now();
    const storagePath = `plant-logs/${logId}.webp`;
    const fileSnap    = file;

    // 步骤 1：写占位 GrowthLog
    try {
      await PlantDB.createGrowthLog(logId, {
        plant_id:     plantId,
        image_url:    '',
        text_content: '',
        log_type:     'status_update',
        recorded_at:  now,
      });
    } catch {
      showToast('⚠ 添加失败，请检查网络');
      return;
    }

    // 步骤 2：即时反馈（onSnapshot 会自动更新封面）
    showToast('已添加 ✓');

    // 步骤 3：后台上传
    try {
      const blob      = await compressWebP(fileSnap, PLANT_CONFIG.IMAGE_MAX_WIDTH, PLANT_CONFIG.IMAGE_QUALITY_WEBP, PLANT_CONFIG.IMAGE_PRE_MAX);
      const remoteUrl = await PlantDB.uploadPhoto(storagePath, blob);

      // 竞态兜底
      const latestLog = await PlantDB.getGrowthLogById(logId);
      if (!latestLog) {
        PlantDB.uploadPhoto && await PlantDB.deletePhoto?.(storagePath).catch(() => {});
        return;
      }

      await PlantDB.patchGrowthLog(logId, { image_url: remoteUrl });
    } catch {
      await PlantDB.deleteGrowthLogById(logId).catch(() => {});
      showToast('⚠ 图片上传失败，已自动撤销');
    }
  }, [showToast]);

  // ── 归档 ────────────────────────────────────────────────────────────────
  const handleArchive = useCallback(async (plant) => {
    setActionTarget(null);
    await PlantDB.archivePlant(plant.id);
    showToast('已归档');
  }, [showToast]);

  // ── 硬删除 ──────────────────────────────────────────────────────────────
  const handleHardDelete = useCallback(async (plant) => {
    setActionTarget(null);
    try {
      await PlantDB.hardDeletePlant(plant.id);
      showToast('已删除');
    } catch (e) {
      if (e.message === 'PLANT_HAS_HARVESTS') {
        showToast('该植物已有产出记录，建议使用归档');
      } else {
        showToast('⚠ 删除失败，请重试');
      }
    }
  }, [showToast]);

  return (
    <div className="plant-page">
      {/* ── 顶部占位（阶段 4 矩阵入口）── */}
      <div className="plant-page-header">
        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          {plants.length > 0 ? `${plants.length} 株植物` : ''}
        </span>
      </div>

      {/* ── 空状态 ── */}
      {!loading && plants.length === 0 && (
        <div className="plant-empty">
          <div className="plant-empty-icon">🌱</div>
          <div>还没有植物，点击右下角 + 建档</div>
        </div>
      )}

      {/* ── Masonry 容器 ── */}
      <div
        ref={containerRef}
        className="plant-masonry"
        style={{ height: containerHeight }}
      >
        {positions.map((pos) => {
          const plant     = plants.find(p => p.id === pos.id);
          const latestLog = latestLogs.get(pos.id) ?? null;
          if (!plant) return null;

          const isVisible = visibleIds.has(pos.id);

          return (
            <div
              key={pos.id}
              className={[
                'plant-card-wrapper',
                dragIdRef.current === pos.id   ? 'is-dragging' : '',
                dragOverRef.current === pos.id ? 'drag-over'   : '',
              ].filter(Boolean).join(' ')}
              style={{
                left:   pos.left,
                top:    pos.top,
                width:  pos.width,
              }}
              draggable
              onDragStart={() => handleDragStart(pos.id)}
              onDragOver={(e) => handleDragOver(e, pos.id)}
              onDrop={() => handleDrop(pos.id)}
            >
              {isVisible ? (
                <PolaroidCard
                  logId={latestLog?.id ?? ''}
                  imageUrl={latestLog?.image_url ?? ''}
                  textContent={latestLog?.text_content ?? ''}
                  tiltSeed={plant.id}
                  auraEmoji={null /* 阶段 6 接入 */}
                  size="normal"
                  isBatchMode={false /* 阶段 5 接入 */}
                  onCardClick={() => setActionTarget(plant)}
                  onTextSave={handleTextSave}
                  onFlip={() => {}}
                  onViewTimeline={() => { /* 阶段 3 接入 */ }}
                />
              ) : (
                // 视口外占位：保持 absolute 锚点，不渲染内容
                <div style={{ height: pos.height }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── 新建 FAB ── */}
      <button className="plant-fab" onClick={() => setShowNewPlant(true)} aria-label="新建植物">
        ＋
      </button>

      {/* ── 操作面板 ── */}
      {actionTarget && (
        <PlantActionPanel
          plant={actionTarget}
          onClose={() => setActionTarget(null)}
          onUpdatePhoto={(plant, file) => {
            setActionTarget(null);
            handleUpdatePhoto(plant, file);
          }}
          onHarvest={() => { /* 阶段 6 */ }}
        />
      )}

      {/* ── 新建弹窗 ── */}
      {showNewPlant && (
        <NewPlantModal
          existingPlants={plants}
          onClose={() => setShowNewPlant(false)}
          onCreated={() => {}}
          showToast={showToast}
        />
      )}

      {/* ── Toast ── */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 88, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: '#fff',
          padding: '8px 18px', borderRadius: 20,
          fontSize: 13, zIndex: 100, pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
