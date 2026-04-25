// ============================================================
// Finance Pro — useCharts
// 原生 Canvas 堆叠柱状图（月度支出趋势）+ 净资产折线图
// 不依赖任何第三方图表库，ResizeObserver 自动响应容器变化
// ============================================================

import { useRef, useCallback, useEffect } from 'react';

const COLORS   = ['#FF6B6B', '#48DBFB', '#FECA57'];
const SEG_KEYS = ['生存底座', '生活消耗', '事件支出'];

// ── 工具：Y 轴刻度标签格式化 ──────────────────────────────
function fmtAxis(v) {
    if (v >= 10000) return (v / 10000).toFixed(1) + '万';
    if (v >= 1000)  return (v / 1000).toFixed(1) + 'k';
    return v.toFixed(0);
}

// ── 核心绘制函数 ───────────────────────────────────────────
function drawMainChart(canvas, data, activeYear) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    if (W <= 0 || H <= 0) return;

    // 高 DPI 适配
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── 边距 ──────────────────────────────────────────────
    const pad = { top: 16, right: 16, bottom: 28, left: 42 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top  - pad.bottom;
    if (chartW <= 0 || chartH <= 0) return;

    const year = activeYear || new Date().getFullYear().toString();

    // ── 数据聚合 ──────────────────────────────────────────
    const seg = [new Array(12).fill(0), new Array(12).fill(0), new Array(12).fill(0)];
    data.txs.forEach(t => {
        if (t.type !== 'expense' || !t.date?.startsWith(year)) return;
        const m = parseInt(t.date.split('-')[1], 10) - 1;
        const idx = SEG_KEYS.indexOf(t.cat1);
        if (idx >= 0) seg[idx][m] += t.amount;
        else          seg[2][m] += t.amount; // 未匹配 → 事件支出
    });

    const totals = seg[0].map((_, i) => seg[0][i] + seg[1][i] + seg[2][i]);
    const maxVal = Math.max(...totals, 1);

    // ── 清空 ──────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);

    // ── 绘制背景网格线 + Y 轴标签 ─────────────────────────
    ctx.strokeStyle = '#EDF2F7';
    ctx.lineWidth   = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        const y = pad.top + chartH - (i / steps) * chartH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();

        ctx.fillStyle   = '#A0AEC0';
        ctx.font        = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign   = 'right';
        ctx.textBaseline = 'middle';
        const val = (maxVal / steps) * i;
        ctx.fillText(val > 0 ? fmtAxis(val) : '0', pad.left - 6, y);
    }

    // ── Y 轴竖线 ──────────────────────────────────────────
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.stroke();

    // ── 绘制堆叠柱状图 ────────────────────────────────────
    const slotW  = chartW / 12;
    const barW   = Math.max(slotW * 0.6, 4);
    const gap    = slotW * 0.4 + 0.001; // 一半在左一半在右

    for (let m = 0; m < 12; m++) {
        const x = pad.left + m * slotW + gap / 2;
        let yBottom = pad.top + chartH;

        // 从底部向上绘制每个分段
        for (let s = 0; s < 3; s++) {
            const h = (seg[s][m] / maxVal) * chartH;
            if (h <= 0) continue;
            ctx.fillStyle = COLORS[s];
            ctx.fillRect(x, yBottom - h, barW, h);
            yBottom -= h;
        }
    }

    // ── X 轴月份标签 ──────────────────────────────────────
    ctx.fillStyle   = '#718096';
    ctx.font        = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    for (let m = 0; m < 12; m++) {
        const x = pad.left + m * slotW + slotW / 2;
        ctx.fillText((m + 1) + '月', x, pad.top + chartH + 6);
    }

    // ── 图例 ──────────────────────────────────────────────
    const legendY = 4;
    let legendX   = pad.left;
    const legendGap = 18;
    ctx.textBaseline = 'top';
    for (let s = 0; s < 3; s++) {
        // 色块
        ctx.fillStyle = COLORS[s];
        ctx.fillRect(legendX, legendY, 10, 10);
        // 文字
        ctx.fillStyle = '#4A5568';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(SEG_KEYS[s], legendX + 14, legendY - 1);
        legendX += 14 + ctx.measureText(SEG_KEYS[s]).width + legendGap;
    }

    // ── 无数据提示 ────────────────────────────────────────
    if (maxVal <= 1) {
        ctx.fillStyle = '#CBD5E0';
        ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('该年度暂无支出数据', W / 2, H / 2);
    }
}

// ════════════════════════════════════════════════════════════
export function useCharts() {
    const mainChartRef  = useRef(null);
    const lastArgsRef   = useRef({ data: null, year: null });

    // ── 公开的渲染函数 ────────────────────────────────────
    const renderMainChart = useCallback((data, activeYear) => {
        lastArgsRef.current = { data, year: activeYear };
        drawMainChart(mainChartRef.current, data, activeYear);
    }, []);

    // ── ResizeObserver：容器变化时自动重新绘制 ─────────────
    useEffect(() => {
        const canvas = mainChartRef.current;
        if (!canvas) return;

        // 监听 canvas 自身的父容器尺寸变化
        const target = canvas.parentElement || canvas;
        const ro = new ResizeObserver(() => {
            const { data, year } = lastArgsRef.current;
            if (data) drawMainChart(canvas, data, year);
        });
        ro.observe(target);

        return () => ro.disconnect();
    }, []);

    // ── 卸载清理 ──────────────────────────────────────────
    useEffect(() => {
        return () => {
            const canvas = mainChartRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };
    }, []);

    return { mainChartRef, renderMainChart };
}
