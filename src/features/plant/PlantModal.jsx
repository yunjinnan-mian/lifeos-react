import { useEffect, useRef } from 'react';
import PlantPage from './PlantPage.jsx';
import './PlantModal.css';

/**
 * PlantModal — 植物岛入口弹窗。
 *
 * 从地图点击植物岛时打开，底部抽屉样式，高度 94dvh。
 * PlantPage 在内部滚动，弹窗本身不滚动。
 *
 * Props:
 *   isOpen    {boolean}
 *   onClose   {() => void}
 *   showToast {(msg: string) => void}  复用 App 层的 Toast
 */
export default function PlantModal({ isOpen, onClose, showToast }) {
  const sheetRef = useRef(null);

  // 打开时锁定 body 滚动，关闭时释放
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="plant-modal-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 抽屉主体 */}
      <div
        ref={sheetRef}
        className="plant-modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="植物岛"
      >
        {/* 把手 + 顶部栏 */}
        <div className="plant-modal-header">
          <div className="plant-modal-handle" />
          <div className="plant-modal-title">🌿 植物岛</div>
          <button
            className="plant-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 内容区：PlantPage 在此滚动 */}
        <div className="plant-modal-body">
          <PlantPage showToast={showToast} />
        </div>
      </div>
    </>
  );
}
