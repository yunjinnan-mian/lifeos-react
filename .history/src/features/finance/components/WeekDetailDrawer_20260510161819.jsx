// src/features/finance/components/WeekDetailDrawer.jsx
import React, { useState, useMemo } from 'react';

export default function WeekDetailDrawer({ weekData, onClose, onDeleteTx, onTogglePool }) {
  const [sortConfig, setSortConfig] = useState({ key: 'amount', dir: 'desc' });

  const handleSort = (key) => {
    setSortConfig(prev => {
      // 连续点击同一个，则切换升降序
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // 切换不同的排序项：时间默认给升序(老在前)，金额默认给降序(大在前)
      return { key, dir: key === 'time' ? 'asc' : 'desc' };
    });
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
      <div className="flex justify-between items-center mb-4 border-0 border-b-[1px] border-solid border-surface-variant pb-2">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-on-surface-variant flex items-baseline gap-1">
          <span className="text-[14px] text-primary">{weekData.w}</span> 
          <span className="opacity-70 font-normal">({weekData.d})</span>
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
              <div key={tx.id} className="flex items-center py-3 px-4 bg-surface rounded-lg group transition-colors">
                {/* 左侧：允许收缩并限制最小宽度为0，确保长串数字必须换行 */}
                <div className="flex flex-col flex-1 min-w-0 pr-4">
                  <span className={`text-sm font-medium break-all transition-colors ${isCoin ? 'text-primary' : 'text-outline line-through decoration-outline/50'}`}>
                    {tx.desc}
                  </span>
                   <span className="text-[10px] text-outline mt-1 font-mono-num">
                     {tx.date ? tx.date.substring(5, 16).replace('-', '/') : ''}
                   </span>
                </div>
                
                {/* 右侧：禁止收缩，永远保持原始宽度 */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* 金额颜色同步变化 */}
                  <span className={`font-mono-num font-bold transition-colors ${isCoin ? 'text-error' : 'text-outline'}`}>
                    -{tx.amount}
                  </span>
                  
                  <button
                    onClick={() => onTogglePool(tx)}
                    // 1. 彻底消灭物理边框：使用 border-none outline-none，并加上行内 style 作为双重保险
                    // 2. 增加凹槽质感：使用 shadow-inner
                    // 3. 物理阻尼动画：加入 active:scale-90 让点击时有按下微缩的回弹感
                    className="relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border-none outline-none focus:outline-none focus:ring-0 bg-surface-variant shadow-inner transition-all duration-300 ease-out active:scale-90"
                    style={{ border: 'none' }} 
                  >
                    <span
                      // 轨道滑块容器：延长动画时间，增加丝滑的 ease-out 缓动
                      className={`pointer-events-none flex h-[26px] w-[26px] transform items-center justify-center transition-transform duration-300 ease-out ${
                        isCoin ? 'translate-x-[20px]' : 'translate-x-0'
                      }`}
                    >
                      <span 
                        // 状态层级联动：
                        // 计入 (isCoin) 时，全彩显示、保持原大小
                        // 排除 (!isCoin) 时，变成 40% 透明度、加上灰度滤镜、微缩至 90%，完美匹配左侧划线的灰色文本
                        className={`text-[16px] leading-none transition-all duration-300 ease-out ${
                          isCoin ? 'opacity-100 scale-100' : 'opacity-40 grayscale scale-90'
                        }`}
                      >
                        {isCoin ? '🪙' : '🏦'}
                      </span>
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