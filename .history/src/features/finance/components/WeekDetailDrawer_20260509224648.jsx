// src/features/finance/components/WeekDetailDrawer.jsx
import React from 'react';

export default function WeekDetailDrawer({ weekData, onClose, onDeleteTx }) {
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
          weekData.txs.map(tx => (
            <div key={tx.id} className="flex justify-between items-center py-3 px-4 bg-surface rounded-lg group">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-primary">{tx.desc}</span>
                <span className="text-[10px] text-outline">{tx.date}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono-num font-bold text-error">-{tx.amount}</span>
                <button 
                  onClick={() => onDeleteTx(tx.id)}
                  className="opacity-0 group-hover:opacity-100 text-outline hover:text-error transition-all"
                  title="删除"
                >
                  <i className="ri-delete-bin-line text-[16px]"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}