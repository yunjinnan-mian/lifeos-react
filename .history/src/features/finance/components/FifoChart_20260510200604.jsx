// src/features/finance/components/FifoChart.jsx
import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

// 从 Tailwind 提取出的设计系统变量（冻结防止重复计算）
const C = {
  base: '#54615b', // secondary
  spill: '#bccac3', // secondary-fixed-dim
  over: '#ba1a1a',  // error
  gold: '#5c1f14',  // tertiary-container
  budget: '#747879', // outline
  t1: '#181f21',    // primary
  t3: '#747879',    // outline
  bdr: '#e3e3de',   // surface-variant
};

export default function FifoChart({ weeklyData, onBarClick }) {
  const chartRef = useRef(null);
  const ecInstance = useRef(null);

  // 解决闭包陷阱，永远保持拿到最新的回调函数
  const onBarClickRef = useRef(onBarClick);
  useEffect(() => {
    onBarClickRef.current = onBarClick;
  }, [onBarClick]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!ecInstance.current) {
      ecInstance.current = echarts.init(chartRef.current);
      
      // 使用底层 zrender 监听：通过像素坐标反推 X 轴，使得点击整根柱子所在的"列空白处"也能精准触发
      ecInstance.current.getZr().on('click', (params) => {
        const pointInPixel = [params.offsetX, params.offsetY];
        if (ecInstance.current.containPixel('grid', pointInPixel)) {
          // 转换得到点击的是第几个柱子
          const xIndex = ecInstance.current.convertFromPixel({ seriesIndex: 0 }, pointInPixel)[0];
          // 直接从图表实例的配置中安全提取当前周的名称（如 'W12'）
          const weekStr = ecInstance.current.getOption().xAxis[0].data[xIndex];
          if (weekStr && onBarClickRef.current) {
            onBarClickRef.current(weekStr);
          }
        }
      });
    }

    // ── 计算溢水与蓄水池核心逻辑 ──
    const n = weeklyData.length;
    let base = [], gap = [], over = [], spilled = Array(n).fill(0), overflow = [];

    // ✨ 核心升级：增加追溯账本
    let consumedMap = Array(n).fill(null).map(() => ({ total: 0, sources: [] }));

    // 第一遍扫描：划定基础和缺口
    for (let i = 0; i < n; i++) {
      const it = weeklyData[i];
      base[i] = Math.min(it.s, it.b);
      gap[i]  = it.b - base[i];
      over[i] = Math.max(0, it.s - it.b);
    }

    // 第二遍扫描：水管工跨周回填，并记录"作案现场"
    for (let i = 0; i < n; i++) {
      let rem = over[i];
      if (rem > 0) {
        for (let j = 0; j < i; j++) {
          const f = Math.min(rem, gap[j]);
          if (f > 0) {
            spilled[j] += f;
            gap[j] -= f;
            rem -= f;
            // 记录：第 i 周的超支，从第 j 周抽了 f 块钱
            consumedMap[i].total += f;
            consumedMap[i].sources.push(j);
          }
          if (rem <= 0) break;
        }
      }
      overflow[i] = rem;
    }

    const mlines = [];
    for (let i = 1; i < n; i++) {
      if (weeklyData[i].month !== weeklyData[i - 1].month) {
        mlines.push({ xAxis: i - 0.5, lineStyle: { color: C.bdr, type: 'dashed', width: 1, opacity: 0.5 }, label: { show: false } });
      }
    }

    // ✨ 探照灯渲染引擎：控制全局明暗
    const getSpotlightSeries = (hIdx = -1, sources = []) => {
      const isSpotlight = hIdx !== -1 && sources.length > 0;
      // 核心明暗逻辑：非主角柱子降级为 15% 透明度
      const getBarOpacity = (i) => isSpotlight ? ((i === hIdx || sources.includes(i)) ? 1 : 0.15) : 1;
      // 折线在探照灯模式下全局变暗（降低干扰）
      const lineOpacity = isSpotlight ? 0.15 : 1;

      return [
        { type: 'line', data: [], z: 0, markLine: { data: mlines, symbol: 'none', silent: true, z: 0 } },
        { name: '预算内消耗', type: 'bar', stack: 's', barWidth: '40%', z: 5, itemStyle: { color: C.base, borderRadius: [2, 2, 0, 0] }, data: base.map((v, i) => ({ value: v, itemStyle: { opacity: getBarOpacity(i) } })) },
        { name: '动用结余', type: 'bar', stack: 's', z: 5, itemStyle: { color: C.spill, borderRadius: [2, 2, 0, 0] }, data: spilled.map((v, i) => ({ value: v, itemStyle: { opacity: getBarOpacity(i) } })) },
        { name: '严重透支', type: 'bar', stack: 's', z: 5, itemStyle: { color: C.over, borderRadius: [2, 2, 0, 0] }, data: overflow.map((v, i) => ({ value: v, itemStyle: { opacity: getBarOpacity(i) } })) },
        { name: '本周预算', type: 'line', step: 'middle', symbol: 'none', z: 6, lineStyle: { color: C.budget, width: 1, type: 'dashed', opacity: isSpotlight ? 0.15 : 0.5 }, data: weeklyData.map(x => x.b) },
        { name: '总支', type: 'line', smooth: 0.3, symbol: 'none', z: 8, lineStyle: { color: C.gold, width: 2, type: 'solid', opacity: lineOpacity }, data: weeklyData.map(x => x.sAll) },
        { name: '生活开销', type: 'line', smooth: 0.3, symbol: 'none', z: 10, lineStyle: { color: '#d1a054', width: 2, type: 'solid', opacity: lineOpacity }, areaStyle: { opacity: isSpotlight ? 0 : 1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(209, 160, 84, 0.2)' }, { offset: 1, color: 'rgba(209, 160, 84, 0)' }]) }, data: weeklyData.map(x => x.s) },
      ];
    };

    ecInstance.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: C.bdr, type: 'dashed' } },
        backgroundColor: 'rgba(250, 250, 245, 0.95)',
        borderColor: C.bdr,
        borderRadius: 8,
        padding: 0,
        extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.05); backdrop-filter: blur(4px);',
        formatter: function (params) {
          const idx = params[0].dataIndex;
          const wData = weeklyData[idx];

          const total = wData.sAll;
          const living = wData.s;
          const budget = wData.b;
          const bal = budget - living;
          const excluded = total - living;

          // 真正的溯源数据，而不是读图表柱子
          const cMap = consumedMap[idx];
          const histUsed = cMap.total;
          const hardOver = overflow[idx];

          const fmt = (n) => Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const balStr = bal >= 0 ? '+' + fmt(bal) : fmt(bal);

          let html = `
            <div style="padding: 12px 16px; color: ${C.t1}; font-family: 'Inter', sans-serif; min-width: 180px;">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px;">${wData.w} 账单快照</div>
              
              <div style="height: 1px; background: ${C.bdr}; margin: 6px 0;"></div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; ${excluded > 0 ? 'margin-bottom: 4px;' : ''}">
                <span>🔴 总支</span>
                <span style="font-family: 'SF Mono', monospace; font-weight: 600;">${fmt(total)}</span>
              </div>
              ${excluded > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: ${C.t3};">
                <span style="padding-left: 20px;">↳ 🏦 非日常/大额</span>
                <span style="font-family: 'SF Mono', monospace;">${fmt(excluded)}</span>
              </div>
              ` : ''}
              
              <div style="height: 1px; background: ${C.bdr}; margin: 6px 0;"></div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                <span>🎯 本周预算</span>
                <span style="font-family: 'SF Mono', monospace; font-weight: 600;">${fmt(budget)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>🛒 生活开销</span>
                <span style="font-family: 'SF Mono', monospace; font-weight: 600;">${fmt(living)}</span>
              </div>
              
              <div style="height: 1px; background: ${C.bdr}; margin: 6px 0;"></div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: ${bal >= 0 ? C.base : C.over};">
                <span>✨ 当周结余</span>
                <span style="font-family: 'SF Mono', monospace;">${balStr}</span>
              </div>
          `;

          if (histUsed > 0 || hardOver > 0) {
            html += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed ${C.bdr};">`;
            if (histUsed > 0) {
              html += `<div style="display: flex; justify-content: space-between; font-size: 11px; color: ${C.t3}; margin-bottom: 2px;">
                 <span>🟨 动用前期结余</span>
                 <span style="font-family: 'SF Mono', monospace;">-${fmt(histUsed)}</span>
               </div>`;
            }
            if (hardOver > 0) {
              html += `<div style="display: flex; justify-content: space-between; font-size: 11px; color: ${C.over};">
                 <span>🟥 严重透支</span>
                 <span style="font-family: 'SF Mono', monospace;">-${fmt(hardOver)}</span>
               </div>`;
            }
            html += `</div>`;
          }

          html += `</div>`;
          return html;
        }
      },
      grid: { top: 10, left: 0, right: 0, bottom: 20, containLabel: true },
      xAxis: {
        type: 'category', data: weeklyData.map(x => x.w),
        axisTick: { show: false }, axisLine: { lineStyle: { color: C.bdr } },
        axisLabel: { color: C.t3, interval: 3, fontSize: 10, fontFamily: 'SF Mono', margin: 12 },
      },
      yAxis: {
        type: 'value', axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: C.bdr, type: 'dashed', opacity: 0.4 } },
        axisLabel: { color: C.t3, fontSize: 10, fontFamily: 'SF Mono', margin: 12 },
      },
      series: getSpotlightSeries(-1, []),
    });

    // ✨ 联动高亮魔法：基于坐标轴的高级监听（防抖、防闪烁）
    ecInstance.current.off('updateAxisPointer');
    ecInstance.current.off('globalout');
    
    let currentSpotlightIdx = -1; // 记录当前状态，避免无效重绘
    
    ecInstance.current.on('updateAxisPointer', (event) => {
      const xAxisInfo = event.axesInfo[0];
      if (xAxisInfo) {
        const idx = xAxisInfo.value;
        if (idx === currentSpotlightIdx) return; // 还在同一根柱子上，不操作
        
        currentSpotlightIdx = idx;
        const sources = consumedMap[idx]?.sources || [];
        
        if (sources.length > 0) {
          // 开启探照灯
          ecInstance.current.setOption({ series: getSpotlightSeries(idx, sources) });
        } else {
          // 当前周没有借钱，恢复世界明亮
          ecInstance.current.setOption({ series: getSpotlightSeries(-1, []) });
        }
      }
    });
    
    ecInstance.current.on('globalout', () => {
      // 鼠标完全移出图表区域，恢复明亮
      currentSpotlightIdx = -1;
      ecInstance.current.setOption({ series: getSpotlightSeries(-1, []) });
    });
  }, [weeklyData]);

  // 绑定 Resize
  useEffect(() => {
    const handleResize = () => ecInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  },[]);

  return <div ref={chartRef} className="w-full flex-1" />;
}