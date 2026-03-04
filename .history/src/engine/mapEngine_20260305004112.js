/**
 * mapEngine.js
 * 地图引擎：Canvas 绘制 · 地形网格 · 视口平移缩放 · 输入处理
 * 以模块级单例管理所有引擎状态，对外暴露纯函数 API。
 */
import { CONFIG, T, BASE_COLOR } from '../config.js';

const TS    = CONFIG.TILE_SIZE;
const SCALE = CONFIG.ZONE_SCALE;
const GW    = CONFIG.GRID_W;
const GH    = CONFIG.GRID_H;

// ── 内部状态 ────────────────────────────────────────────────────
let _canvas = null, _ctx = null;
let _rippleCanvas = null, _rctx = null;
let _panX = 0, _panY = 0, _zoom = 1;
let _zones = [], _itemsByZone = new Map();
let _worldTileType = null;
const _worldTileZone = new Map();
let _animTick = 0;
const _ripples = new Map();
const _polarCache = new Map();
let _hasAutocentered = false;

// ── 公开 API ────────────────────────────────────────────────────

export function initEngine(canvas, rippleCanvas) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d');
  _rippleCanvas = rippleCanvas;
  _rctx = rippleCanvas.getContext('2d');
  resizeCanvas();
  _panX = Math.round(_canvas.width  / 2 - (GW * ets()) / 2);
  _panY = Math.round(_canvas.height / 2 - (GH * ets()) / 2);
}

export function resizeCanvas() {
  if (!_canvas) return;
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
  _rippleCanvas.width  = _canvas.width;
  _rippleCanvas.height = _canvas.height;
  clampPan();
}

/** 重建世界地形网格，返回新的 itemsByZone Map */
export function buildWorldGrid(zones, items) {
  if (!_worldTileType) _worldTileType = new Uint8Array(GW * GH);
  else _worldTileType.fill(0);
  _worldTileZone.clear();

  const ibz = new Map(zones.map(z => [z.id, items.filter(i => i.zoneId === z.id)]));
  _zones = zones;
  _itemsByZone = ibz;

  zones.forEach(zone => {
    getIslandTiles(zone, ibz).forEach(({ gx, gy, type }) => {
      if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) {
        const idx = gy * GW + gx;
        if (!_worldTileZone.has(idx) || _worldTileZone.get(idx) === zone.id) {
          _worldTileType[idx] = type;
          _worldTileZone.set(idx, zone.id);
        }
      }
    });
  });

  if (!_hasAutocentered && zones.length > 0) {
    _hasAutocentered = true;
    centerOnIsland(zones[0]);
  }
  return ibz;
}

export function centerOnIsland(zone) {
  if (!zone || zone.gridX == null) return;
  const ET = ets();
  _panX = Math.round(_canvas.width  / 2 - zone.gridX * SCALE * ET);
  _panY = Math.round(_canvas.height / 2 - zone.gridY * SCALE * ET);
}

export function getZoomValue() { return _zoom; }

export function applyZoomStep(step) {
  const cx = _canvas.width  / 2;
  const cy = _canvas.height / 2;
  const newZoom = step === 0 ? 1 : _zoom + step;
  zoomAround(cx, cy, newZoom);
  return _zoom;
}

export function zoomAround(cx, cy, newZoom) {
  newZoom = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, newZoom));
  const ratio = newZoom / _zoom;
  _panX = cx - (cx - _panX) * ratio;
  _panY = cy - (cy - _panY) * ratio;
  _zoom = newZoom;
  clampPan();
  return _zoom;
}

export function movePan(dx, dy) {
  _panX += dx; _panY += dy;
  clampPan();
}

/** 把屏幕坐标转成地图信息 */
export function screenToMap(cx, cy) {
  const ET = ets();
  const gx = Math.floor((cx - _panX) / ET);
  const gy = Math.floor((cy - _panY) / ET);
  if (gx < 0 || gx >= GW || gy < 0 || gy >= GH) return null;
  const zoneId = _worldTileType ? (_worldTileZone.get(gy * GW + gx) ?? null) : null;
  return { gx, gy, zoneId };
}

export function isZoneTooClose(gx, gy) {
  return _zones.some(z =>
    Math.sqrt((z.gridX * SCALE - gx) ** 2 + (z.gridY * SCALE - gy) ** 2) < 40
  );
}

export function gridToZonePos(gx, gy) {
  return { x: Math.round(gx / SCALE), y: Math.round(gy / SCALE) };
}

export function addRipple(zoneId) {
  _ripples.set(zoneId, _animTick);
}

/** 主渲染帧（由 rAF 循环调用） */
export function render() {
  _animTick++;
  const W = _canvas.width, H = _canvas.height;
  const ET = ets();
  _ctx.clearRect(0, 0, W, H);

  const sx = Math.max(0, Math.floor(-_panX / ET) - 1);
  const sy = Math.max(0, Math.floor(-_panY / ET) - 1);
  const ex = Math.min(GW, sx + Math.ceil(W / ET) + 2);
  const ey = Math.min(GH, sy + Math.ceil(H / ET) + 2);

  if (_worldTileType) {
    for (let gy = sy; gy < ey; gy++) {
      const y0 = Math.round(gy * ET + _panY);
      const y1 = Math.round((gy + 1) * ET + _panY);
      for (let gx = sx; gx < ex; gx++) {
        const x0 = Math.round(gx * ET + _panX);
        const x1 = Math.round((gx + 1) * ET + _panX);
        drawTile(gx, gy, _worldTileType[gy * GW + gx], x0, y0, x1 - x0, y1 - y0);
      }
    }
  } else {
    _ctx.fillStyle = BASE_COLOR[T.DEEP];
    _ctx.fillRect(0, 0, W, H);
  }
  drawZoneLabels();
  drawHint();
  drawRipples();
}

// ── 私有工具 ────────────────────────────────────────────────────

function ets() { return TS * _zoom; }

function clampPan() {
  if (!_canvas) return;
  const W = _canvas.width, H = _canvas.height;
  const gw = GW * ets(), gh = GH * ets();
  _panX = Math.max(-(gw - W * 0.3), Math.min(W * 0.7, _panX));
  _panY = Math.max(-(gh - H * 0.3), Math.min(H * 0.7, _panY));
  if (!isFinite(_panX)) _panX = 0;
  if (!isFinite(_panY)) _panY = 0;
}

function seededRng(seed) {
  let s = seed | 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0xFFFFFFFF; };
}
function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function ph(gx, gy) { return ((gx * 1664525) ^ (gy * 1013904223)) >>> 0; }

function getPolarOutline(zoneId, baseR, numPts = 16) {
  const key = zoneId + ':' + baseR.toFixed(1);
  if (_polarCache.has(key)) return _polarCache.get(key);
  const rng = seededRng(hashStr(zoneId));
  const radii = Array.from({ length: numPts }, () => baseR * (0.65 + rng() * 0.70));
  const smooth = (arr) => arr.map((_, i) => {
    const p = arr[(i - 1 + numPts) % numPts], n = arr[(i + 1) % numPts];
    return p * 0.25 + arr[i] * 0.5 + n * 0.25;
  });
  const s = smooth(smooth(radii));
  const fn = (angle) => {
    const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const frac = norm / (Math.PI * 2) * numPts;
    const lo = Math.floor(frac) % numPts;
    const hi = (lo + 1) % numPts;
    const ct = (1 - Math.cos((frac - Math.floor(frac)) * Math.PI)) / 2;
    return s[lo] * (1 - ct) + s[hi] * ct;
  };
  _polarCache.set(key, fn);
  return fn;
}

export function computeRichness(zi) {
  if (!zi.length) return 0;
  const s = zi.map(i =>
    Math.min((i.note || '').length / 80, 0.4) +
    Math.min((i.usage || '').length / 80, 0.3) +
    (i.photoUrl ? 0.3 : 0)
  );
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function getIslandTiles(zone, itemsByZone) {
  const zi    = itemsByZone.get(zone.id) ?? [];
  const rich  = computeRichness(zi);
  const baseR = 3.5 + Math.sqrt(zi.length * 1.4);
  const getR  = getPolarOutline(zone.id, baseR);
  const SW    = CONFIG.SHORE_W;
  const maxR  = Math.ceil(baseR + SW + 2);
  const cx    = zone.gridX * SCALE;
  const cy    = zone.gridY * SCALE;
  const result = [];

  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const d     = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const edgeR = getR(angle);
      if (d <= edgeR) {
        const pct = d / edgeR;
        let type;
        if      (pct < 0.30) type = rich > 0.6 ? T.FOREST : rich > 0.2 ? T.DGRASS : T.GRASS;
        else if (pct < 0.60) type = rich > 0.35 ? T.DGRASS : T.GRASS;
        else if (pct < 0.80) type = T.GRASS;
        else                 type = T.SAND;
        result.push({ gx: cx + dx, gy: cy + dy, type });
      } else if (d <= edgeR + SW) {
        result.push({ gx: cx + dx, gy: cy + dy, type: T.SHALLOW });
      }
    }
  }
  return result;
}

function drawTile(gx, gy, type, sx, sy, tw, th) {
  const h   = ph(gx, gy);
  const scX = tw / TS;
  const scY = th / TS;

  function r(lx, ly, lw, lh, c) {
    _ctx.fillStyle = c;
    const x0 = sx + (lx * scX | 0);
    const y0 = sy + (ly * scY | 0);
    const pw  = Math.max(1, ((lx + lw) * scX | 0) - (lx * scX | 0));
    const ph2 = Math.max(1, ((ly + lh) * scY | 0) - (ly * scY | 0));
    _ctx.fillRect(x0, y0, pw, ph2);
  }

  r(0, 0, TS, TS, BASE_COLOR[type]);

  switch (type) {
    case T.DEEP: {
      if (h % 9 === 0) r(0, 0, TS, TS, '#122e6e');
      const w1 = ((_animTick >> 3) + gx * 3 + gy * 7) & 63;
      if (w1 < 3) { r(0, (h >> 3) % 5 + 2, TS, 1, '#3a70cc'); if (w1 === 0) r(h % 5, ((h >> 3) % 5) + 1, 3, 1, 'rgba(255,255,255,0.7)'); }
      const w2 = ((_animTick >> 4) + gx * 7 + gy * 3 + 20) & 63;
      if (w2 < 2) r(0, (h >> 5) % 6 + 1, TS, 1, '#2a5cb8');
      // 光点：只用tile固有hash决定位置和是否存在，不参与animTick，静态常驻
      if (h % 23 === 0) r(h % (TS - 1), (h >> 4) % (TS - 1), 1, 1, 'rgba(255,255,255,0.55)');
      break;
    }
    case T.SHALLOW: {
      if (h % 5 === 0) r(0, 0, TS, TS, '#59C9F1');
      if (h % 4 === 0) r((h >> 2) % 5 + 1, (h >> 5) % 5 + 1, 2, 1, 'rgba(255,255,255,.55)');
      const ws = ((_animTick >> 3) + gx * 5 + gy * 4) & 47;
      if (ws < 4) r(0, (h >> 3) % 5 + 2, TS, 1, 'rgba(255,255,255,0.25)');
      break;
    }
    case T.SAND: {
      if (h % 3 === 0) r((h >> 1) % (TS - 1), (h >> 4) % (TS - 1), 1, 1, '#f0b840');
      if (h % 4 === 0) r((h >> 3) % (TS - 1), (h >> 6) % (TS - 1), 1, 1, '#c08818');
      if (h % 6 === 0) r((h >> 2) % (TS - 2), (h >> 5) % (TS - 2), 2, 1, '#d49828');
      if (h % 26 === 0) { r((h >> 2) % 4 + 1, (h >> 5) % 4 + 1, 3, 2, '#f8f0d0'); r((h >> 2) % 4 + 2, (h >> 5) % 4 + 2, 1, 1, '#d8c898'); }
      if (h % 17 === 0) { r((h >> 3) % 4 + 1, (h >> 6) % 4 + 1, 2, 2, '#a08040'); r((h >> 3) % 4 + 1, (h >> 6) % 4 + 1, 1, 1, '#c0a060'); }
      break;
    }
    case T.GRASS: {
      if (h % 7 === 0) r(0, 0, TS, TS, '#58ac14');
      r(0, TS - 2, TS, 2, '#2a7010');
      if (h % 2 === 0) { r((h >> 1) % (TS - 1), TS - 4, 1, 4, '#328530'); r((h >> 3) % (TS - 1), TS - 3, 1, 3, '#3d9815'); }
      if (h % 3 === 0) r((h >> 4) % (TS - 1), TS - 5, 1, 2, '#70c725');
      if (h % 24 === 0) { r((h >> 2) % 4 + 1, (h >> 6) % 3 + 2, 2, 2, '#f8e030'); r((h >> 2) % 4 + 2, (h >> 6) % 3 + 1, 1, 1, '#fff'); }
      if (h % 31 === 0) r((h >> 3) % 4 + 1, (h >> 7) % 3 + 2, 2, 2, '#e85898');
      break;
    }
    case T.DGRASS: {
      if (h % 7 === 0) r(0, 0, TS, TS, '#2e7020');
      r(0, TS - 2, TS, 2, '#1e5018');
      if (h % 2 === 0) { r((h >> 1) % (TS - 1), TS - 5, 1, 5, '#1e5818'); r((h >> 3) % (TS - 1), TS - 6, 1, 6, '#246820'); }
      if (h % 3 === 0) r((h >> 4) % (TS - 1), TS - 7, 1, 3, '#44a318');
      if (h % 3 === 1) r((h >> 5) % (TS - 1), TS - 4, 1, 1, '#70c725');
      if (h % 42 === 0) { r((h >> 2) % 3 + 1, (h >> 7) % 3 + 1, 2, 3, '#c04040'); r((h >> 2) % 3, (h >> 7) % 3, 4, 1, '#e05050'); }
      break;
    }
    case T.FOREST: {
      r(0, 0, TS, TS, h % 3 === 0 ? '#143808' : '#1a4a0a');
      if (h % 4 < 2) {
        const tx = h % 3 === 0 ? 1 : 0;
        r(tx + TS / 2 - 1 | 0, TS - 3, 2, 3, '#6B3710'); r(tx + TS / 2 | 0, TS - 3, 1, 3, '#8a5020');
        r(tx + 1, TS - 6, TS - 2, 4, '#0e3206'); r(tx + 2, TS - 6, TS - 4, 3, '#1e6010'); r(tx + 3, TS - 6, TS - 6, 1, '#2a8020');
        r(tx + 2, TS - 9, TS - 4, 4, '#0a2804'); r(tx + 3, TS - 9, TS - 6, 3, '#145010'); r(tx + 4, TS - 9, TS - 8, 1, '#1e6818');
        r(tx + TS / 2 - 2 | 0, 1, 4, TS - 9, '#0e3206'); r(tx + TS / 2 - 1 | 0, 2, 2, TS - 10, '#145010'); r(tx + TS / 2 | 0, 2, 1, 2, '#2a7018');
      } else {
        if (h % 5 === 0) r((h >> 2) % (TS - 2) + 1, (h >> 5) % (TS - 4) + 1, 2, 1, '#1e5010');
        if (h % 7 === 0) r((h >> 3) % (TS - 2) + 1, (h >> 6) % (TS - 4) + 1, 3, 2, '#2a6818');
      }
      break;
    }
  }
}

function drawZoneLabels() {
  _ctx.textAlign = 'center';
  _zones.forEach(zone => {
    const zi    = _itemsByZone.get(zone.id) || [];
    const baseR = 3.5 + Math.sqrt(zi.length * 1.4);
    const ET    = ets();
    const spx   = zone.gridX * SCALE * ET + _panX;
    const spy   = zone.gridY * SCALE * ET + _panY - (baseR + 2.5) * ET - 4;

    _ctx.font = '16px serif';
    _ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _ctx.fillText(zone.emoji || '📦', spx + 1, spy + 1);
    _ctx.fillStyle = '#ffffff';
    _ctx.fillText(zone.emoji || '📦', spx, spy);

    _ctx.font = "bold 10px 'Zpix',monospace";
    _ctx.fillStyle = 'rgba(0,0,0,0.7)';
    _ctx.fillText(zone.name, spx + 1, spy + 15);
    _ctx.fillStyle = '#e8f8e0';
    _ctx.fillText(zone.name, spx, spy + 14);

    if (zi.length > 0) {
      _ctx.font = "9px 'Zpix',monospace";
      _ctx.fillStyle = 'rgba(255,255,255,0.6)';
      _ctx.fillText('×' + zi.length, spx, spy + 25);
    }
  });
}

function drawHint() {
  if (_zones.length > 0) return;
  _ctx.textAlign = 'center';
  _ctx.font = Math.round(14 * _zoom) + "px 'Zpix',monospace";
  _ctx.fillStyle = 'rgba(255,255,255,0.22)';
  _ctx.fillText('点击水面，放置第一块领域', _canvas.width / 2, _canvas.height / 2);
}

function drawRipples() {
  _rctx.clearRect(0, 0, _rippleCanvas.width, _rippleCanvas.height);
  const ET = ets();
  for (const [zoneId, startTick] of _ripples) {
    const zone = _zones.find(z => z.id === zoneId);
    if (!zone) { _ripples.delete(zoneId); continue; }
    const elapsed = _animTick - startTick;
    const dur = 90;
    if (elapsed > dur) { _ripples.delete(zoneId); continue; }
    const baseR = 3.5 + Math.sqrt((_itemsByZone.get(zoneId) || []).length * 1.4);
    const cx    = zone.gridX * SCALE * ET + _panX;
    const cy    = zone.gridY * SCALE * ET + _panY;
    const maxR  = (baseR + 8) * ET;
    for (let ring = 0; ring < 3; ring++) {
      const t      = ((elapsed / dur) + ring * 0.25) % 1;
      const alpha  = (1 - t) * 0.65;
      const radius = t * maxR;
      _rctx.beginPath();
      _rctx.arc(cx, cy, radius, 0, Math.PI * 2);
      _rctx.strokeStyle = `rgba(200,168,64,${alpha})`;
      _rctx.lineWidth   = Math.max(1, (1 - t) * 3);
      _rctx.stroke();
    }
  }
}