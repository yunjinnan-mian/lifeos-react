import { useState, useEffect, useCallback, useRef } from 'react';
import './PolaroidCard.css';

// FNV-1a 变体：同一 seed 永远输出同一角度，无随机数。
function seedToTiltDeg(seed) {
  if (!seed) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h |= 0;
  }
  const t = (h >>> 0) / 0xffffffff;
  return t * 7 - 3.5;
}

// 静态常量，不在渲染函数内声明
const AURA_POSITIONS = [
  { top: '-12px', left: '14px' },
  { top: '-12px', right: '14px' },
  { top: '18%', left: '-14px' },
  { top: '18%', right: '-14px' },
  { top: '52%', left: '-14px' },
  { top: '52%', right: '-14px' },
  { bottom: '30px', left: '16px' },
  { bottom: '30px', right: '16px' },
];

/**
 * PolaroidCard — 植物岛核心展示单元。纯渲染，零网络请求。
 *
 * Props:
 *   logId          {string}
 *   imageUrl       {string}
 *   textContent    {string}
 *   tiltSeed       {string}           plant_id 作为种子
 *   auraEmoji      {string|null}      null = 无光环
 *   size           {"normal"|"small"}
 *   isBatchMode    {boolean}
 *   onCardClick    {() => void}       点击卡片主体（非批量、非翻转角）
 *   onTextSave     {(logId, text) => Promise<void>|void}
 *   onFlip         {() => void}
 *   onViewTimeline {() => void}
 */
export default function PolaroidCard({
  logId,
  imageUrl       = '',
  textContent    = '',
  tiltSeed,
  auraEmoji      = null,
  size           = 'normal',
  isBatchMode    = false,
  onCardClick,
  onTextSave,
  onFlip,
  onViewTimeline,
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [localText, setLocalText] = useState(textContent);

  // logId 变化 = 封面切换：同步新 log 的文字，收起翻转。
  // 不监听 textContent，避免远程刷新覆盖用户正在输入的内容。
  useEffect(() => {
    setLocalText(textContent);
    setIsFlipped(false);
  }, [logId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tiltDeg = seedToTiltDeg(tiltSeed || logId || '');

  // onBlur 兜底：点击卡片外部时保存。
  // 点击翻转角时 mousedown.preventDefault 保持 textarea 焦点，此路径不触发。
  const handleTextBlur = useCallback(() => {
    onTextSave?.(logId, localText);
  }, [logId, localText, onTextSave]);

  // 阻止焦点从 textarea 转移（规格文档 §3.1 事件顺序）
  const handleFlipMouseDown = useCallback((e) => {
    e.preventDefault();
  }, []);

  // 翻转角 click：stopPropagation 防止冒泡到外层 onCardClick。
  // 背面→正面必须先 await save，保证文字不丢。
  const handleFlipClick = useCallback(async (e) => {
    e.stopPropagation();
    if (isBatchMode) return;
    if (isFlipped) {
      await onTextSave?.(logId, localText);
    }
    setIsFlipped(f => !f);
    onFlip?.();
  }, [isBatchMode, isFlipped, logId, localText, onTextSave, onFlip]);

  // 批量打卡震动反馈
  const rootRef = useRef(null);
  const handleRootClick = useCallback(() => {
    if (isBatchMode) {
      const el = rootRef.current;
      if (!el) return;
      el.classList.remove('is-tapping');
      void el.offsetWidth;
      el.classList.add('is-tapping');
      el.addEventListener('animationend', () => el.classList.remove('is-tapping'), { once: true });
    } else {
      onCardClick?.();
    }
  }, [isBatchMode, onCardClick]);

  return (
    <div
      ref={rootRef}
      className={[
        'polaroid-root',
        `polaroid--${size}`,
        isBatchMode ? 'is-batch-target' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--tilt': `${tiltDeg}deg` }}
      onClick={handleRootClick}
    >
      {auraEmoji && AURA_POSITIONS.map((pos, i) => (
        <span key={i} className="polaroid-aura" style={pos} aria-hidden="true">
          {auraEmoji}
        </span>
      ))}

      <div className={`polaroid-flipper${isFlipped ? ' is-flipped' : ''}`}>

        {/* ── 正面 ── */}
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
            >⟲</button>
          </div>
        </div>

        {/* ── 背面 ── */}
        <div className="polaroid-face polaroid-back">
          <div className="polaroid-back-content">
            <textarea
              className="polaroid-textarea"
              value={localText}
              placeholder="记点什么…"
              onChange={e => setLocalText(e.target.value)}
              onBlur={handleTextBlur}
              onClick={e => e.stopPropagation()}
            />
            <a
              className="polaroid-timeline-link"
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onViewTimeline?.(); }}
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
            >⟲</button>
          </div>
        </div>

      </div>
    </div>
  );
}
