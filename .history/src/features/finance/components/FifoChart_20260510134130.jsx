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

export default function FifoChart({ weeklyData }) {
  const chartRef = useRef(null);
  const ecInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!ecInstance.current) {
      ecInstance.current = echarts.init(chartRef.current);
    }

    // ── 计算溢水与蓄水池核心逻辑 ──
    let base = [], gap = [], over = [], spilled = Array(52).fill(0), overflow =[];
    
    weeklyData.forEach((it, i) => {
      base[i] = Math.min(it.s, it.b);
      gap[i]  = it.b - base[i];
      over[i] = Math.max(0, it.s - it.b);
    });

    for (let i = 0; i < 52; i++) {
      let rem = over[i];
      if (rem > 0) {
        for (let j = 0; j < i; j++) {
          const f = Math.min(rem, gap[j]);
          if (f > 0) { spilled[j] += f; gap[j] -= f; rem -= f; }
          if (rem <= 0) break;
        }
      }
      overflow[i] = rem;
    }

    const mlines =[];
    for (let i = 1; i < weeklyData.length; i++) {
      if (weeklyData[i].month !== weeklyData[i-1].month) {
        mlines.push({ xAxis: i - 0.5, lineStyle: { color: C.bdr, type: 'dashed', width: 1, opacity: 0.5 }, label: { show: false } });
      }
    }

    ecInstance.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: C.bdr, type: 'dashed' } },
        backgroundColor: 'rgba(250, 250, 245, 0.95)',
        borderColor: C.bdr,
        borderRadius: 4,
        padding:[12, 16],
        textStyle: { color: C.t1, fontSize: 12, fontFamily: 'Inter' },
        extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.05); backdrop-filter: blur(4px);'
      },
      grid: { top: 10, left: 0, right: 0, bottom: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: weeklyData.map(x => x.w),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: C.bdr } },
        axisLabel: { color: C.t3, interval: 3, fontSize: 10, fontFamily: 'SF Mono', margin: 12 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: C.bdr, type: 'dashed', opacity: 0.4 } },
        axisLabel: { color: C.t3, fontSize: 10, fontFamily: 'SF Mono', margin: 12 },
      },
      series:[
        // 剥离 markLine 到 z: 0 的透明基础层，确保分割线永远在柱体背后
        {
          type: 'line', data: [], z: 0,
          markLine: { data: mlines, symbol: 'none', silent: true },
        },
        {
          name: '基础', type: 'bar', stack: 's', barWidth: '40%', z: 2,
          itemStyle: { color: C.base, borderRadius:[2, 2, 0, 0] }, data: base,
        },
        { name: '历史', type: 'bar', stack: 's', itemStyle: { color: C.spill, borderRadius: [2, 2, 0, 0] }, data: spilled },
        { name: '超支', type: 'bar', stack: 's', itemStyle: { color: C.over, borderRadius: [2, 2, 0, 0] }, data: overflow },
        {
          name: '基准', type: 'line', step: 'middle', symbol: 'none', z: 5,
          lineStyle: { color: C.budget, width: 1, type: 'dashed', opacity: 0.5 },
          data: weeklyData.map(x => x.b),
        },
        {
          name: '全部', type: 'line', smooth: 0.3, symbol: 'none', z: 8,
          lineStyle: { color: '#959c9f', width: 1.5, type: 'dotted' },
          data: weeklyData.map(x => x.sAll),
        },
        {
          name: '实际', type: 'line', smooth: 0.3, symbol: 'none', z: 10,
          lineStyle: { color: C.gold, width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1,[
              { offset: 0, color: 'rgba(92, 31, 20, 0.15)' },
              { offset: 1, color: 'rgba(92, 31, 20, 0)' }
            ])
          },
          data: weeklyData.map(x => x.s),
        },
      ],
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