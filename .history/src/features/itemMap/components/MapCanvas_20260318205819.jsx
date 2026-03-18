import { useEffect, useRef } from 'react';
import {
  initEngine, resizeCanvas, render,
  zoomAround, movePan, screenToMap,
  isZoneTooClose, gridToZonePos, applyZoomStep,
  getZoomValue,
} from '../engine/mapEngine.js';
import { CONFIG } from '../../../lib/config.js';

export default function MapCanvas({ onTapZone, onTapEmpty, onZoomChange, openModalCount }) {
  const canvasRef = useRef(null);
  const rippleRef = useRef(null);
  const rafRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, lastX: 0, lastY: 0, startX: 0, startY: 0, startTime: 0 });
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1, midX: 0, midY: 0 });

  // ── Init engine + render loop ──────────────────────────────
  useEffect(() => {
    initEngine(canvasRef.current, rippleRef.current);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (openModalCount > 0) return;   // 弹窗省电
      render();
    };
    rafRef.current = requestAnimationFrame(loop);

    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // openModalCount 变化时不重新初始化，loop 闭包会自动读取
  // 这里用 ref 持有最新值
  const openModalCountRef = useRef(openModalCount);
  useEffect(() => { openModalCountRef.current = openModalCount; }, [openModalCount]);

  // ── Input helpers ──────────────────────────────────────────
  function getTouchMid(t) {
    return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
  }
  function getTouchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointerDown(x, y) {
    dragRef.current = { active: true, moved: false, startX: x, startY: y, lastX: x, lastY: y, startTime: Date.now() };
  }
  function pointerMove(x, y) {
    const d = dragRef.current;
    if (!d.active) return;
    if (Math.abs(x - d.startX) + Math.abs(y - d.startY) > 7) d.moved = true;
    movePan(x - d.lastX, y - d.lastY);
    d.lastX = x; d.lastY = y;
  }
  function pointerUp(x, y) {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    if (!d.moved && Date.now() - d.startTime < 450) handleTap(d.startX, d.startY);
  }

  function handleTap(cx, cy) {
    const hit = screenToMap(cx, cy);
    if (!hit) return;
    if (hit.zoneId) {
      onTapZone(hit.zoneId);
    } else {
      if (isZoneTooClose(hit.gx, hit.gy)) return;
      onTapEmpty(gridToZonePos(hit.gx, hit.gy));
    }
  }

  // ── Canvas event listeners ─────────────────────────────────
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const onTouchStart = e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        dragRef.current.active = false;
        const mid = getTouchMid(e.touches);
        pinchRef.current = { active: true, startDist: getTouchDist(e.touches), startZoom: getZoomValue(), midX: mid.x, midY: mid.y };
      } else if (e.touches.length === 1) {
        pinchRef.current.active = false;
        pointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchMove = e => {
      e.preventDefault();
      const p = pinchRef.current;
      if (p.active && e.touches.length === 2) {
        const dist = getTouchDist(e.touches);
        const mid = getTouchMid(e.touches);
        movePan(mid.x - p.midX, mid.y - p.midY);
        const newZoom = zoomAround(mid.x, mid.y, p.startZoom * (dist / p.startDist));
        onZoomChange(newZoom);
        p.midX = mid.x; p.midY = mid.y;
      } else if (!p.active && e.touches.length === 1) {
        pointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = e => {
      if (e.touches.length < 2) pinchRef.current.active = false;
      if (e.touches.length === 0) {
        const t = e.changedTouches[0];
        pointerUp(t.clientX, t.clientY);
      }
    };
    const onMouseDown = e => pointerDown(e.clientX, e.clientY);
    const onMouseMove = e => pointerMove(e.clientX, e.clientY);
    const onMouseUp = e => pointerUp(e.clientX, e.clientY);
    const onWheel = e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -CONFIG.ZOOM_WHEEL : CONFIG.ZOOM_WHEEL;
      const newZoom = zoomAround(e.clientX, e.clientY, getZoomValue() + delta);
      onZoomChange(newZoom);
    };

    cvs.addEventListener('touchstart', onTouchStart, { passive: false });
    cvs.addEventListener('touchmove', onTouchMove, { passive: false });
    cvs.addEventListener('touchend', onTouchEnd);
    cvs.addEventListener('mousedown', onMouseDown);
    cvs.addEventListener('mousemove', onMouseMove);
    cvs.addEventListener('mouseup', onMouseUp);
    cvs.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cvs.removeEventListener('touchstart', onTouchStart);
      cvs.removeEventListener('touchmove', onTouchMove);
      cvs.removeEventListener('touchend', onTouchEnd);
      cvs.removeEventListener('mousedown', onMouseDown);
      cvs.removeEventListener('mousemove', onMouseMove);
      cvs.removeEventListener('mouseup', onMouseUp);
      cvs.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTapZone, onTapEmpty, onZoomChange]);

  // ── Tooltip ────────────────────────────────────────────────
  useEffect(() => {
    const tip = document.getElementById('inv-tooltip');
    let visible = false;

    const onOver = e => {
      const slot = e.target.closest('.inv-slot[data-tip]');
      if (slot?.dataset.tip) {
        tip.textContent = slot.dataset.tip;
        tip.style.display = 'block';
        visible = true;
      }
    };
    const onMove = e => {
      if (!visible) return;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 200) + 'px';
      tip.style.top = Math.max(e.clientY - 60, 8) + 'px';
    };
    const onOut = e => {
      if (e.target.closest('.inv-slot[data-tip]')) {
        tip.style.display = 'none';
        visible = false;
      }
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  return (
    <>
      <canvas id="mapCanvas" ref={canvasRef} />
      <canvas id="rippleCanvas" ref={rippleRef} />
    </>
  );
}
