// src/features/finance/components/WeekDetailDrawer.jsx
import React from 'react';

export default function WeekDetailDrawer({ weekData, onClose, onDeleteTx, onTogglePool }) {
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

      <div className="text-[11px] uppercase tracking-widest font-semibold text-on-surface-variant mb-4 border-b border-surface-variant pb-2">
        {weekData.w} 账单明细
      </div>

      {/* 账单列表 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {weekData.txs.length === 0 ? (
          <div className="text-sm text-outline italic py-4">本周暂无支出记录。</div>
        ) : (
          weekData.txs.map(tx => {
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
                  
                  {/* 🪙/🏦 类似 iOS 的药丸切换开关 */}
                  <button
                    onClick={() => onTogglePool(tx)}
                    title={isCoin ? "已计入蓄水池" : "不计入蓄水池"}
                    className={`relative inline-flex h-6 w-[44px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      isCoin ? 'bg-primary' : 'bg-outline-variant'
                    }`}
                  >
                    <span
                      className={`pointer-events-none flex h-5 w-5 transform items-center justify-center rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out ${
                        isCoin ? 'translate-x-[20px]' : 'translate-x-0'
                      }`}
                    >
                      <span className="text-[12px]">{isCoin ? '🪙' : '🏦'}</span>
                    </span>
                  </button>

                  <button 
                    onClick={() => onDeleteTx(tx.id)}
                    className="opacity-0 group-hover:opacity-100 text-outline hover:text-error transition-all p-1"
                    title="删除"
                  >
                    <i className="ri-delete-bin-line text-[16px]"></i>
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