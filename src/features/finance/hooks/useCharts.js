// ============================================================
// Finance Pro — useCharts
// 管理 Chart.js 实例（mainChart 月度趋势 + assetChart 净资产走势）
// 在 Dashboard 中调用，sidebar 折叠触发 resize
// ============================================================

import { useRef, useCallback, useEffect } from 'react';

export function useCharts() {
    const mainChartRef   = useRef(null); // canvas DOM ref
    const assetChartRef  = useRef(null); // canvas DOM ref
    const mainInstance   = useRef(null); // Chart.js instance
    const assetInstance  = useRef(null); // Chart.js instance

    // ── 绘制月度支出趋势（堆叠柱状图）────────────────────
    const renderMainChart = useCallback((data, activeYear) => {
        const canvas = mainChartRef.current;
        if (!canvas || !window.Chart) return;

        const year = activeYear || new Date().getFullYear().toString();
        const dA = new Array(12).fill(0);
        const dB = new Array(12).fill(0);
        const dC = new Array(12).fill(0);

        data.txs.forEach(t => {
            if (t.type === 'expense' && t.date?.startsWith(year)) {
                const m = parseInt(t.date.split('-')[1]) - 1;
                if (t.cat1 === '生存底座')  dA[m] += t.amount;
                else if (t.cat1 === '生活消耗') dB[m] += t.amount;
                else                         dC[m] += t.amount;
            }
        });

        if (mainInstance.current) mainInstance.current.destroy();
        mainInstance.current = new window.Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Array.from({ length: 12 }, (_, i) => (i + 1) + '月'),
                datasets: [
                    { label: '生存', data: dA, backgroundColor: '#FF6B6B' },
                    { label: '消耗', data: dB, backgroundColor: '#48DBFB' },
                    { label: '事件', data: dC, backgroundColor: '#FECA57' },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
                scales: { x: { stacked: true }, y: { stacked: true } },
            },
        });
    }, []);

    // ── 绘制净资产走势（折线图）──────────────────────────
    const renderAssetChart = useCallback((data) => {
        const canvas = assetChartRef.current;
        if (!canvas || !window.Chart) return;

        const labels = data.history.map(h => h.month);
        const vals   = data.history.map(h => h.val);

        if (assetInstance.current) assetInstance.current.destroy();
        assetInstance.current = new window.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '净资产',
                    data: vals,
                    borderColor: '#5F27CD',
                    backgroundColor: 'rgba(95,39,205,0.1)',
                    fill: true,
                    tension: 0.3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
            },
        });
    }, []);

    // ── sidebar 折叠后触发 resize ─────────────────────────
    const resizeCharts = useCallback(() => {
        mainInstance.current?.resize();
        assetInstance.current?.resize();
    }, []);

    // ── 卸载时销毁实例 ────────────────────────────────────
    useEffect(() => {
        return () => {
            mainInstance.current?.destroy();
            assetInstance.current?.destroy();
        };
    }, []);

    return { mainChartRef, assetChartRef, renderMainChart, renderAssetChart, resizeCharts };
}
