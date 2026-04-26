import { useState, useEffect, useMemo } from 'react';
import { PLANT_CONFIG } from '../../../../lib/config.js';

// 布局常量（对应 PolaroidCard CSS 变量 normal size）
const PHOTO_PAD = 8;
const BOTTOM_H  = 44;
const GAP       = 14;

function getColCount(width) {
  if (width < 360) return 2;
  if (width < 560) return 3;
  return 4;
}

/**
 * 计算 masonry 各卡片的 absolute 坐标。
 *
 * 高度预算依据：PolaroidCard normal size
 *   cardHeight = photo-pad(top) + photoSize(1:1) + bottom-h
 *   photoSize  = colWidth - photo-pad * 2（左右各一个）
 *
 * 为什么预算而不测量：photo 固定 1:1 + bottom-h 固定，
 * 不渲染时无法测量，预算误差为 0。
 */
function computeLayout(items, containerWidth) {
  if (!containerWidth || items.length === 0) {
    return { positions: [], containerHeight: 0 };
  }

  const cols      = getColCount(containerWidth);
  const colWidth  = (containerWidth - GAP * (cols - 1)) / cols;
  const photoSize = colWidth - PHOTO_PAD * 2;
  const cardH     = PHOTO_PAD + photoSize + BOTTOM_H;

  const colHeights = Array(cols).fill(0);

  const positions = items.map((item) => {
    // 贪心：填入当前最矮的列
    const col = colHeights.indexOf(Math.min(...colHeights));
    const pos = {
      id:     item.id,
      left:   col * (colWidth + GAP),
      top:    colHeights[col],
      width:  colWidth,
      height: cardH,
    };
    colHeights[col] += cardH + GAP;
    return pos;
  });

  return {
    positions,
    containerHeight: Math.max(...colHeights, 0),
  };
}

/**
 * useMasonryVirtual
 *
 * @param {Array}  items        植物列表（需含 .id）
 * @param {React.RefObject} containerRef  masonry 容器 ref
 * @returns {{
 *   positions: Array<{id, left, top, width, height}>,
 *   containerHeight: number,
 *   visibleIds: Set<string>,
 *   colWidth: number,
 * }}
 */
export function useMasonryVirtual(items, containerRef) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollY, setScrollY]               = useState(() => window.scrollY);
  const [viewportH, setViewportH]           = useState(() => window.innerHeight);

  // 监听容器宽度（ResizeObserver）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.offsetWidth);
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // 监听 scroll + viewport resize
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const { positions, containerHeight } = useMemo(
    () => computeLayout(items, containerWidth),
    [items, containerWidth],
  );

  // 可见 ids：容器 top 相对 document 的偏移 + 卡片相对容器的 top
  const visibleIds = useMemo(() => {
    if (!positions.length) return new Set();

    const cardH     = positions[0]?.height ?? 200;
    const bufferPx  = PLANT_CONFIG.VIRTUAL_SCROLL_BUFFER * (cardH + GAP);

    // getBoundingClientRect 是同步的，在渲染阶段调用开销极小
    const containerTop = containerRef.current
      ? containerRef.current.getBoundingClientRect().top + window.scrollY
      : 0;

    const minY = scrollY - containerTop - bufferPx;
    const maxY = scrollY - containerTop + viewportH + bufferPx;

    return new Set(
      positions
        .filter(p => p.top + p.height >= minY && p.top <= maxY)
        .map(p => p.id),
    );
  }, [positions, scrollY, viewportH, containerRef]);

  const colWidth = containerWidth
    ? (containerWidth - GAP * (getColCount(containerWidth) - 1)) / getColCount(containerWidth)
    : 0;

  return { positions, containerHeight, visibleIds, colWidth };
}
