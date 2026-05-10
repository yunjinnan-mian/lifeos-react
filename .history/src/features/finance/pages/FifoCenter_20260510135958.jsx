// src/features/finance/pages/FifoCenter.jsx
import React, { useState } from 'react';
import '../finance.css';
import { useFifoData } from '../hooks/useFifoData';
import FifoChart from '../components/FifoChart';
import WeekDetailDrawer from '../components/WeekDetailDrawer';

export default function FifoCenter() {
  const { 
    loading, activeYear, setActiveYear, availableYears, 
    weeklyData, handleBudgetChange, deleteTransaction, toggleTransactionPool 
  } = useFifoData();

  // 控制右侧抽屉滑出状态
  const [activeWeekNum, setActiveWeekNum] = useState(null);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-outline">加载蓄水池数据中...</div>;
  }

  // 计算全局快照核心指标（使用"分"作为计算流，保证加减绝对精准）
  let totalPoolCents = 0;
  let pools = [];
  let balList =[];
  let activeWeeksCount = 0;

  weeklyData.forEach((w, i) => {
    // 强制转为分为单位进行整数计算
    const bCents = Math.round(w.b * 100);
    const sCents = Math.round(w.s * 100);
    const balCents = bCents - sCents;
    
    totalPoolCents += balCents;
    pools.push(totalPoolCents / 100);
    balList.push(balCents / 100);
    
    if (sCents > 0 || bCents > 0) activeWeeksCount++;
  });

  const totalPool = totalPoolCents / 100;
  
  // 注入天然的财务格式化函数，附带千位分隔符且最多保留两位小数
  const fmtMoney = (num) => Number(num).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

  const avgSpend = activeWeeksCount === 0 ? 0 : Math.round(
    weeklyData.reduce((sum, w) => sum + w.s, 0) / activeWeeksCount
  );

  const activeWeekData = activeWeekNum ? weeklyData.find(w => w.w === activeWeekNum) : null;

  // 恢复了半屏滚动的响应式属性: overflow-y-auto lg:overflow-hidden
  // 左侧：恢复了高度自适应与边框自适应 h-auto lg:h-full, border-b lg:border-b-0
  return (
    <div className="flex-1 h-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative bg-surface text-primary antialiased">
      
       <section className="w-full lg:w-[65%] h-auto lg:h-full flex flex-col p-6 lg:p-12 overflow-visible lg:overflow-visible border-0 border-b-[1px] lg:border-b-0 lg:border-r-[1px] border-solid border-surface-variant relative z-10 shrink-0">
        
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
                {fmtMoney(Math.abs(totalPool))}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 text-sm font-medium text-on-surface-variant">
            <span>累计净结余</span>
            <div className="w-1 h-1 rounded-full bg-outline"></div>
            <span>{activeWeeksCount} 周已记录 · {52 - activeWeeksCount} 周待填</span>
          </div>
        </header>

        {/* 恢复图表上方的说明图例 */}
        <div className="flex-1 flex flex-col min-h-[400px] mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="uppercase tracking-widest text-[11px] font-semibold text-on-surface-variant">52 周支出趋势</h2>
            <div className="flex gap-4 text-[11px] font-medium text-on-surface-variant">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-secondary"></div>基础</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-secondary-fixed-dim"></div>历史</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-error"></div>超支</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-[2px] rounded-full bg-tertiary-container"></div>全部</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-[2px] rounded-full bg-[#d1a054]"></div>实际</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-[2px] rounded-full bg-outline opacity-50 border-t border-dashed"></div>基准</div>
            </div>
          </div>
          <FifoChart weeklyData={weeklyData} />
        </div>

        {/* 恢复底部的 本周结余 + 周均消费 */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-0 border-t-[1px] border-solid border-surface-variant mt-auto">
          {(() => {
            // 计算当前时间对应到了第几周，以显示精准的本周结余
            // 剥离时间，仅使用本地午夜时间对抗时区漂移
            const now = new Date();
            const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            // 严格对齐 ISO 8601 的第一周定义（包含该年第一个星期四的那一周）
            const jan4 = new Date(activeYear, 0, 4);
            const w1 = new Date(activeYear, 0, 4 - ((jan4.getDay() + 6) % 7));
            
            // 使用 Math.round 抵消夏令时误差，再除以 7
            const diffDays = Math.round((localToday - w1) / 86400000);
            let curWIdx = Math.floor(diffDays / 7);
            curWIdx = Math.max(0, Math.min(51, curWIdx)); // 框定在 0-51 之间
            const curBal = balList[curWIdx] || 0;
            const curWName = `W${curWIdx + 1}`;

            return (
              <>
                <div>
                  <div className="uppercase tracking-widest text-[10px] font-semibold text-on-surface-variant mb-2">本周结余</div>
                  <div className="flex items-baseline gap-2">
                    <div className={`font-mono-num text-4xl font-bold tracking-tight ${curBal >= 0 ? 'text-secondary' : 'text-error'}`}>
                      {curBal > 0 ? '+' : ''}{fmtMoney(curBal)}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-outline mt-1">{curWName}</div>
                </div>
                <div>
                  <div className="uppercase tracking-widest text-[10px] font-semibold text-on-surface-variant mb-2">周均消费</div>
                  <div className="font-mono-num text-4xl font-bold tracking-tight text-primary">{fmtMoney(avgSpend)}</div>
                  <div className="text-sm font-medium text-outline mt-1">日均 {fmtMoney(Math.round(avgSpend / 7))}</div>
                </div>
              </>
            );
          })()}
        </div>
        {/* 抽屉打开时出现的隐形遮罩，点击即可返回 */}
        {activeWeekNum && (
          <div 
            className="absolute inset-0 z-50 cursor-pointer" 
            onClick={() => setActiveWeekNum(null)}
            title="点击返回"
          />
        )}
      </section>

      {/* 右侧区域容器 (35%)：包含 Quick Ledger 与 滑动抽屉 */}
      <section className="w-full lg:w-[35%] h-auto lg:h-full min-h-[500px] lg:min-h-0 relative overflow-hidden bg-surface-bright shrink-0 z-10 flex flex-col">
        
        {/* 常规周列表 (去除 absolute inset-0，让它留在文档流中撑开父级高度) */}
        <div className={`flex-1 h-full flex flex-col p-6 lg:p-12 transition-transform duration-300 ease-in-out ${activeWeekNum ? '-translate-x-full' : 'translate-x-0'}`}>
          <div className="flex justify-between items-end mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-primary">周明细</h2>
          </div>

          <div className="grid grid-cols-12 gap-2 pb-4 border-0 border-b-[1px] border-solid border-surface-variant text-[10px] uppercase tracking-widest font-semibold text-on-surface-variant pr-2">
            <div className="col-span-3">周/期</div>
            <div className="col-span-3 text-right">预算</div>
            <div className="col-span-3 text-right">实际(只读)</div>
            <div className="col-span-3 text-right">结余</div>
          </div>

          {/* 恢复 overflow-visible，让半屏手机端能自然拉伸高度，而PC端正常滚动 */}
          <div className="flex-1 overflow-visible lg:overflow-y-auto pr-2 mt-4 space-y-1 pb-20">
            {weeklyData.map((w, i) => (
              <div 
                key={w.w} 
                className="grid grid-cols-12 gap-2 items-center py-3 px-2 rounded-lg hover:bg-surface transition-colors group cursor-pointer"
                onClick={() => setActiveWeekNum(w.w)}
              >
                {/* 1. 周与日期 */}
                <div className="col-span-3 flex flex-col justify-center">
                  <span className="font-mono-num text-[13px] font-bold text-primary leading-none mb-1">{w.w}</span>
                  <span className="text-[9px] text-outline leading-none">{w.d}</span>
                </div>
                
                {/* 2. 可编辑预算 */}
                <div className="col-span-3 flex items-center justify-end" onClick={e => e.stopPropagation()}>
                  <input 
                    type="number" 
                    defaultValue={w.b} 
                    onBlur={(e) => handleBudgetChange(w.w, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    title="点击修改预算"
                    className="number-input-clean w-20 bg-transparent border-none text-right font-mono-num text-[13px] font-bold text-on-surface-variant focus:ring-0 focus:text-primary p-0 m-0 leading-none outline-none cursor-pointer focus:cursor-text hover:bg-surface-variant/50 rounded transition-colors"
                  />
                </div>

                {/* 3. 实际支出（只读） */}
                <div className="col-span-3 flex items-center justify-end">
                   <span className="font-mono-num text-[13px] font-bold text-primary">
                     {fmtMoney(w.s)}
                   </span>
                </div>

                {/* 4. 结余 */}
                <div className={`col-span-3 flex items-center justify-end font-mono-num text-[13px] font-bold ${balList[i] >= 0 ? 'text-secondary' : 'text-error'}`}>
                  {balList[i] > 0 ? '+' : ''}{fmtMoney(balList[i])}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 抽屉层 (保留 absolute inset-0，仅作为悬浮层滑入滑出) */}
        <div 
          className="absolute inset-0 transition-transform duration-300 ease-in-out z-20"
          style={{ transform: activeWeekNum ? 'translateX(0)' : 'translateX(100%)' }}
        >
          {activeWeekData && (
            <WeekDetailDrawer 
              weekData={activeWeekData} 
              onClose={() => setActiveWeekNum(null)}
              onDeleteTx={deleteTransaction}
              onTogglePool={toggleTransactionPool}
            />
          )}
        </div>
      </section>

    </div>
  );
}