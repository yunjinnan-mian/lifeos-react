// src/features/finance/components/WeekDetailDrawer.jsx
import React, { useState } from 'react';

export default function WeekDetailDrawer({ weekData, onClose, onSaveTx, onDeleteTx }) {
  // 新建/编辑的临时状态
  const [desc, setDesc] = useState('');
  const[amount, setAmount] = useState('');
  
  // 保存新账单
  const handleAdd = () => {
    if (!desc.trim() || !amount) return;
    // 默认日期落在这个周的起始日
    onSaveTx({
      desc: desc.trim(),
      amount: parseFloat(amount),
      date: weekData.startStr,
    });
    setDesc('');
    setAmount('');
  };

  return (
    <div className="absolute inset-0 bg-surface-bright z-20 flex flex-col p-6 lg:p-12 shadow-2xl overflow-y-auto">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onClose}
          className="text-on-surface-variant hover:text-primary transition-colors flex items-center text-sm font-semibold"
        >
          <span className="material-symbols-outlined mr-1" style={{ fontSize: '18px' }}>arrow_back</span>
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
      <div className="flex-1 overflow-y-auto space-y-2 mb-6">
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
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 快速记一笔 */}
      <div className="bg-surface p-4 rounded-xl border border-surface-variant mt-auto">
        <div className="text-xs font-semibold text-on-surface-variant mb-3">记一笔</div>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="说明 (如: 买菜)" 
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="flex-1 bg-transparent border-b border-outline-variant focus:border-primary focus:ring-0 px-1 py-1 text-sm font-medium transition-colors"
          />
          <input 
            type="number" 
            placeholder="金额" 
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="w-24 bg-transparent border-b border-outline-variant focus:border-primary focus:ring-0 px-1 py-1 text-sm font-mono-num font-bold text-right transition-colors"
          />
          <button 
            onClick={handleAdd}
            className="w-8 h-8 rounded-full bg-primary text-surface flex items-center justify-center hover:bg-inverse-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>
    </div>
  );
}