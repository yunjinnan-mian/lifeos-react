import { useState, useEffect, useCallback, useRef } from 'react';
import './PolaroidCard.css';

// 将 plant_id 字符串映射到 -3.5° ~ 3.5° 的稳定倾斜角。
// 同一 seed 每次渲染结果严格一致，不依赖随机数或时间戳。
// 使用 32 位 FNV-1a 变体：快速、分布均匀、无需外部库。
function seedToTiltDeg(seed) {
  if (!seed) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h |= 0; // 截断为 32 位整数
  }
  // 归一化到 0 ~ 1，再映射到 -3.5 ~ 3.5 度
  const t = (h >>> 0) / 0xffffffff; // 无符号右移确保正数
  return t * 7 - 3.5;
}

// 光环 Emoji 的固定错落位置（相对于 .polaroid-root）。
// 静态常量，避免在渲染函数内重复分配数组。
const AURA_POSITIONS = [
  { top:    '-12px', left:  '14px'  },
  { top:    '-12px', right: '14px'  },
  { top:    '18%',   left:  '-14px' },
  { top:    '18%',   right: '-14px' },
  { top:    '52%',   left:  '-14px' },
  { top:    '52%',   right: '-14px' },
  { bottom: '30px',  left:  '16px'  },
  { bottom: '30px',  right: '16px'  },
];

/**
 * PolaroidCard — 植物岛的核心展示单元。
 *
 * 职责边界：
 * - 纯渲染，不查询任何 Firestore 表，不持有网络状态
 * - 管理卡片翻转状态（isFlipped）和背面文字草稿（localText）
 * - 翻转保存顺序由内部 handleFlipClick 保证（见下方注释）
 *
 * Props:
 *   logId          {string}          绑定的 GrowthLog ID，文字保存目标
 *   imageUrl       {string}          封面图 URL；空字符串显示占位
 *   textContent    {string}          文字备注（可为空）
 *   tiltSeed       {string}          plant_id，生成稳定倾斜角的种子
 *   auraEmoji      {string|null}     光环 Emoji；null = 无光环（未曾采摘）
 *   size           {"normal"|"small"} normal=主页，small=时间线
 *   isBatchMode    {boolean}         true 时翻转角禁用，整卡响应打卡点击
 *   onTextSave     {(logId, text) => Promise<void>|void}  背面文字保存回调
 *   onFlip         {() => void}      翻转完成后的通知回调（可选）
 *   onViewTimeline {() => void}      "查看完整生长图鉴"点击回调（可选，阶段 3 接入）
 */
export default function PolaroidCard({
  logId,
  imageUrl       = '',
  textContent    = '',
  tiltSeed,
  auraEmoji      = null,
  size           = 'normal',
  isBatchMode    = false,
  onTextSave,
  onFlip,
  onViewTimeline,
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [localText, setLocalText] = useState(textContent);

  // 当绑定的 GrowthLog 切换（封面变化时 logId 随之变化）才重置草稿文字。
  // 刻意不监听 textContent 变化，避免远程 onSnapshot 刷新覆盖用户正在编辑的内容。
  useEffect(() => {
    setLocalText(textContent);
    // 切换 log 时顺便收起翻转，让新封面以正面展示
    setIsFlipped(false);
  }, [logId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tiltDeg = seedToTiltDeg(tiltSeed || logId || '');

  // ── 背面文字保存：onBlur 兜底路径 ─────────────────────────────────────
  // 正常失焦（点击卡片外部）时走此路径。
  // 翻转角的点击路径由 handleFlipClick 负责，两者互不重复触发：
  // 翻转角 mousedown 阻止了 blur，所以点击翻转角时 onBlur 不会先于 click 触发。
  const handleTextBlur = useCallback(() => {
    onTextSave?.(logId, localText);
  }, [logId, localText, onTextSave]);

  // ── 翻转角 mousedown：阻止焦点从 textarea 转移 ────────────────────────
  // 规格文档 §3.1：mousedown 阻止默认行为，textarea 保持焦点，
  // 使 blur 不在 mousedown 时提前触发，保证 localText 在 click 时仍为最新值。
  const handleFlipMouseDown = useCallback((e) => {
    e.preventDefault();
  }, []);

  // ── 翻转角 click：先 save 再翻转 ──────────────────────────────────────
  // 从背面翻到正面时，需先等待文字保存完成，再切换视觉状态。
  // 从正面翻到背面时，不需要 save（没有待保存内容），直接翻转。
  const handleFlipClick = useCallback(async () => {
    if (isBatchMode) return;

    if (isFlipped) {
      // 背面 → 正面：先保存，再翻转
      await onTextSave?.(logId, localText);
    }

    setIsFlipped(f => !f);
    onFlip?.();
  }, [isBatchMode, isFlipped, logId, localText, onTextSave, onFlip]);

  // ── 批量模式下的点击震动反馈 ──────────────────────────────────────────
  const rootRef = useRef(null);
  const handleBatchTap = useCallback(() => {
    if (!isBatchMode) return;
    const el = rootRef.current;
    if (!el) return;
    el.classList.remove('is-tapping');
    // 强制重排以重置动画
    void el.offsetWidth;
    el.classList.add('is-tapping');
    el.addEventListener('animationend', () => el.classList.remove('is-tapping'), { once: true });
  }, [isBatchMode]);

  return (
    <div
      ref={rootRef}
      className={[
        'polaroid-root',
        `polaroid--${size}`,
        isBatchMode ? 'is-batch-target' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--tilt': `${tiltDeg}deg` }}
      onClick={isBatchMode ? handleBatchTap : undefined}
    >
      {/* 光环 Emoji：仅在 auraEmoji 非空时渲染 */}
      {auraEmoji && AURA_POSITIONS.map((pos, i) => (
        <span
          key={i}
          className="polaroid-aura"
          style={pos}
          aria-hidden="true"
        >
          {auraEmoji}
        </span>
      ))}

      {/* 翻转器 */}
      <div className={`polaroid-flipper${isFlipped ? ' is-flipped' : ''}`}>

        {/* ── 正面 ──────────────────────────────────────────────────── */}
        <div className="polaroid-face polaroid-front">
          <div className="polaroid-photo">
            {imageUrl
              ? <img src={imageUrl} alt="" loading="lazy" />
              : <div className="polaroid-photo-placeholder" aria-hidden="true" />
            }
          </div>
          <div className="polaroid-bottom">
            <button
              className="polaroid-flip-btn"
              onMouseDown={handleFlipMouseDown}
              onClick={handleFlipClick}
              disabled={isBatchMode}
              aria-label="查看背面"
              title="查看备注"
            >
              ⟲
            </button>
          </div>
        </div>

        {/* ── 背面 ──────────────────────────────────────────────────── */}
        <div className="polaroid-face polaroid-back">
          <div className="polaroid-back-content">
            <textarea
              className="polaroid-textarea"
              value={localText}
              placeholder="记点什么…"
              onChange={e => setLocalText(e.target.value)}
              onBlur={handleTextBlur}
              // 阻止 textarea 内的点击冒泡到批量打卡层（背面时批量模式已禁用，以防万一）
              onClick={e => e.stopPropagation()}
            />
            <a
              className="polaroid-timeline-link"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onViewTimeline?.();
              }}
              onKeyDown={(e) => e.key === 'Enter' && onViewTimeline?.()}
            >
              查看完整生长图鉴 →
            </a>
          </div>
          <div className="polaroid-bottom">
            <button
              className="polaroid-flip-btn"
              onMouseDown={handleFlipMouseDown}
              onClick={handleFlipClick}
              disabled={isBatchMode}
              aria-label="翻回正面"
              title="翻回正面"
            >
              ⟲
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
