// src/features/finance/components/WeekDetailDrawer.jsx
import React, { useState, useMemo } from 'react';

export default function WeekDetailDrawer({ weekData, onClose, onDeleteTx, onTogglePool }) {
  const [sortConfig, setSortConfig] = useState({ key: 'time', dir: 'desc' });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedTxs = useMemo(() => {
    return [...weekData.txs].sort((a, b) => {
      let valA, valB;
      if (sortConfig.key === 'amount') {
        valA = parseFloat(a.amount) || 0;
        valB = parseFloat(b.amount) || 0;
      } else {
        valA = new Date(a.date || 0).getTime();
        valB = new Date(b.date || 0).getTime();
      }
      if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
  },[weekData.txs, sortConfig]);

  return (
    <div className="h-full bg-surface-bright flex flex-col p-6 lg:p-12 shadow-2xl overflow-y-auto">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onClose}
          className="group flex items-center gap-2 px-4 py-3 -ml-4 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface-variant/50 transition-all text-sm font-semibold cursor-pointer"
        >
          <i className="ri-arrow-left-s-line text-xl group-hover:-translate-x-1 transition-transform"></i>
          返回周概览
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-bold font-mono-num text-primary">{weekData.w}</h2>
          <span className="text-xs text-outline">{weekData.d}</span>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 border-0 border-b-[1px] border-solid border-surface-variant pb-2">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-on-surface-variant">
          {weekData.w} 账单明细
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => handleSort('time')}
            className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${sortConfig.key === 'time' ? 'bg-secondary text-surface' : 'bg-surface-variant text-on-surface-variant hover:bg-outline/20'}`}
          >
            按时间 {sortConfig.key === 'time' && (sortConfig.dir === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('amount')}
            className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${sortConfig.key === 'amount' ? 'bg-secondary text-surface' : 'bg-surface-variant text-on-surface-variant hover:bg-outline/20'}`}
          >
            按金额 {sortConfig.key === 'amount' && (sortConfig.dir === 'asc' ? '↑' : '↓')}
          </button>
        </div>
      </div>

      {/* 账单列表 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {weekData.txs.length === 0 ? (
          <div className="text-sm text-outline italic py-4">本周暂无支出记录。</div>
        ) : (
          sortedTxs.map(tx => {
            const isCoin = tx.pool !== 'bank'; // 默认是 coin 计入
            return (
              <div key={tx.id} className="flex justify-between items-center py-3 px-4 bg-surface rounded-lg group transition-colors">
                <div className="flex flex-col">
                  {/* 若为 bank 排除，说明文字加上删除线并变灰 */}
                  <span className={`text-sm font-medium transition-colors ${isCoin ? 'text-primary' : 'text-outline line-through decoration-outline/50'}`}>
                    {tx.desc}
                  </span>
                  <span className="text-[10px] text-outline mt-0.5">{tx.date}</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* 金额颜色同步变化 */}
                  <span className={`font-mono-num font-bold transition-colors ${isCoin ? 'text-error' : 'text-outline'}`}>
                    -{tx.amount}
                  </span>
                  
                  <button
                    onClick={() => onTogglePool(tx)}
                    title={isCoin ? "已计入蓄水池" : "不计入蓄水池"}
                    className="relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full bg-surface-variant transition-colors duration-200 ease-in-out"
                  >
                    <span
                      className={`pointer-events-none flex h-[26px] w-[26px] transform items-center justify-center transition-transform duration-200 ease-in-out ${
                        isCoin ? 'translate-x-[20px]' : 'translate-x-0'
                      }`}
                    >
                      <span className="text-[16px] leading-none">{isCoin ? '🪙' : '🏦'}</span>
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}