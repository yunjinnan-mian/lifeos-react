// src/features/finance/pages/FifoCenter.jsx
import React, { useState } from 'react';
import { useFifoData } from '../hooks/useFifoData';
import FifoChart from '../components/FifoChart';
import WeekDetailDrawer from '../components/WeekDetailDrawer';

export default function FifoCenter() {
  const { 
    loading, activeYear, setActiveYear, availableYears, 
    weeklyData, handleBudgetChange, saveTransaction, deleteTransaction 
  } = useFifoData();

  // 控制右侧抽屉滑出状态
  const [activeWeekNum, setActiveWeekNum] = useState(null);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-outline">加载蓄水池数据中...</div>;
  }

  // 计算全局快照核心指标
  let totalPool = 0;
  let pools = [];
  let balList =[];
  let activeWeeksCount = 0;

  weeklyData.forEach((w, i) => {
    const bal = w.b - w.s;
    totalPool += bal;
    pools.push(totalPool);
    balList.push(bal);
    if (w.s > 0 || w.b > 0) activeWeeksCount++;
  });

  const avgSpend = activeWeeksCount === 0 ? 0 : Math.round(
    weeklyData.reduce((sum, w) => sum + w.s, 0) / activeWeeksCount
  );

  const activeWeekData = activeWeekNum ? weeklyData.find(w => w.w === activeWeekNum) : null;

  return (
    <div className="h-full flex flex-col lg:flex-row relative overflow-hidden bg-surface text-primary antialiased">
      
      {/* 左侧：核心数据与图表 (65%) */}
      <section className="w-full lg:w-[65%] h-full flex flex-col p-6 lg:p-12 overflow-y-auto border-r border-surface-variant relative z-10 shrink-0">
        
        <div className="flex justify-between items-center mb-8">
          <div className="uppercase tracking-widest text-xs font-semibold text-on-surface-variant">
            全局蓄水池快照 · FIFO 模式
          </div>
          {/* 年份切换器（仅存在多年份时显示） */}
          {availableYears.length > 1 && (
            <select 
              value={activeYear}
              onChange={(e) => { setActiveYear(Number(e.target.value)); setActiveWeekNum(null); }}
              className="bg-transparent border-none text-sm font-bold text-primary focus:ring-0 py-0 cursor-pointer"
            >
              {availableYears.map(y => <option key={y} value={y}>{y} 财年</option>)}
            </select>
          )}
        </div>

        <header className="mb-12 relative">
          <div className="relative inline-block">
            <div className="fluid-circle"></div>
            <div className="flex items-baseline font-mono-num leading-none tracking-tighter text-primary">
              <span className={`text-6xl font-light mr-2 ${totalPool >= 0 ? 'text-secondary' : 'text-error'}`}>
                {totalPool >= 0 ? '+' : '−'}
              </span>
              <span className="text-4xl font-medium text-on-surface-variant mr-1 self-start mt-2">¥</span>
              <span className="text-[100px] lg:text-[120px] font-bold">
                {Math.abs(totalPool).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 text-sm font-medium text-on-surface-variant">
            <span>累计净结余</span>
            <div className="w-1 h-1 rounded-full bg-outline"></div>
            <span>{activeWeeksCount} 周已记录 · {52 - activeWeeksCount} 周待填</span>
          </div>
        </header>

        <div className="flex-1 flex flex-col min-h-[300px] lg:min-h-[400px] mb-8">
          <FifoChart weeklyData={weeklyData} />
        </div>

        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-surface-variant mt-auto">
          <div>
            <div className="uppercase tracking-widest text-[10px] font-semibold text-on-surface-variant mb-2">周均消费</div>
            <div className="font-mono-num text-4xl font-bold tracking-tight text-primary">{avgSpend}</div>
            <div className="text-sm font-medium text-outline mt-1">日均 {Math.round(avgSpend / 7)}</div>
          </div>
        </div>
      </section>

      {/* 右侧区域容器 (35%)：包含 Quick Ledger 与 滑动抽屉 */}
      <section className="w-full lg:w-[35%] h-full relative overflow-hidden bg-surface-bright shrink-0 z-10 flex flex-col">
        
        {/* 常规周列表 */}
        <div className={`absolute inset-0 flex flex-col p-6 lg:p-12 transition-transform duration-300 ease-in-out ${activeWeekNum ? '-translate-x-full' : 'translate-x-0'}`}>
          <div className="flex justify-between items-end mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-primary">Quick Ledger</h2>
            <span className="text-xs font-medium text-on-surface-variant bg-surface px-2 py-1 rounded">可编辑预算</span>
          </div>

          <div className="grid grid-cols-12 gap-2 pb-4 border-b border-surface-variant text-[10px] uppercase tracking-widest font-semibold text-on-surface-variant pr-2">
            <div className="col-span-3">周/期</div>
            <div className="col-span-3 text-right">预算</div>
            <div className="col-span-3 text-right">实际(只读)</div>
            <div className="col-span-3 text-right">结余</div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-1 pb-20">
            {weeklyData.map((w, i) => (
              <div 
                key={w.w} 
                className="grid grid-cols-12 gap-2 items-center py-3 px-2 rounded-lg hover:bg-surface transition-colors group cursor-pointer"
                onClick={() => setActiveWeekNum(w.w)} // 点击滑出抽屉
              >
                <div className="col-span-3 flex flex-col">
                  <span className="font-mono-num text-sm font-bold text-primary">{w.w}</span>
                  <span className="text-[9px] text-outline mt-1">{w.d}</span>
                </div>
                
                {/* 预算列：阻止冒泡，避免触发点击抽屉，失去焦点时保存 */}
                <div className="col-span-3 text-right" onClick={e => e.stopPropagation()}>
                  <input 
                    type="number" 
                    defaultValue={w.b} 
                    onBlur={(e) => handleBudgetChange(w.w, e.target.value)}
                    className="number-input-clean w-full bg-transparent border-none text-right font-mono-num text-[15px] font-bold text-on-surface-variant focus:ring-0 focus:text-primary px-0 py-1 transition-colors hover:bg-surface-variant/50 rounded"
                  />
                </div>

                {/* 实际支出列：只读 */}
                <div className="col-span-3 text-right">
                   <div className="font-mono-num text-[15px] font-bold text-primary py-1">
                     {w.s}
                   </div>
                </div>

                <div className={`col-span-3 text-right font-mono-num text-sm font-bold ${balList[i] >= 0 ? 'text-secondary' : 'text-error'}`}>
                  {balList[i] > 0 ? '+' : ''}{balList[i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 抽屉层 */}
        <div 
          className="absolute inset-0 transition-transform duration-300 ease-in-out"
          style={{ transform: activeWeekNum ? 'translateX(0)' : 'translateX(100%)' }}
        >
          {activeWeekData && (
            <WeekDetailDrawer 
              weekData={activeWeekData} 
              onClose={() => setActiveWeekNum(null)}
              onSaveTx={saveTransaction}
              onDeleteTx={deleteTransaction}
            />
          )}
        </div>
      </section>

    </div>
  );
}