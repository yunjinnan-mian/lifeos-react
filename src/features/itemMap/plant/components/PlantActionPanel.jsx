import { useRef } from 'react';

/**
 * PlantActionPanel — 点击植物卡片主体后弹出的操作面板。
 *
 * 职责：触发文件选择并上报，不持有任何业务逻辑。
 *
 * Props:
 *   plant          {object}      当前植物
 *   onClose        {() => void}
 *   onUpdatePhoto  {(plant, file) => void}  更新状态图片
 *   onHarvest      {(plant) => void}        采摘（阶段 6 实现，暂 disabled）
 */
export default function PlantActionPanel({ plant, onClose, onUpdatePhoto, onHarvest }) {
  const fileInputRef = useRef(null);

  function handleUpdateClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';  // 允许重复选同一文件
    onClose();
    onUpdatePhoto(plant, file);
  }

  return (
    <>
      {/* 遮罩 */}
      <div className="panel-overlay" onClick={onClose} />

      <div className="plant-action-panel" role="dialog" aria-modal="true">
        <div className="panel-handle" />

        <div className="panel-plant-name">{plant.nickname ?? ''}</div>

        <div className="panel-actions">
          <button className="panel-action-btn" onClick={handleUpdateClick}>
            <span className="panel-action-icon">📷</span>
            <span>更新状态</span>
          </button>

          {/* 采摘：阶段 6 实现，现在仅展示入口 */}
          <button
            className="panel-action-btn panel-action-btn--disabled"
            disabled
            title="采摘功能即将上线"
          >
            <span className="panel-action-icon">🫳</span>
            <span>采摘</span>
          </button>
        </div>

        {/* 隐藏的文件选择器，只接受图片 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </>
  );
}
