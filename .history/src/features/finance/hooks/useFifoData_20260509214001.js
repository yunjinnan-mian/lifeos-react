// src/features/finance/hooks/useFifoData.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { FinanceDB } from '../../../lib/db';

// ISO 8601: W1 是包含该年第一个星期四的那一周
function isoW1Monday(year) {
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7;
  return new Date(year, 0, 4 - dow);
}

export function useFifoData() {
  const [activeYear, setActiveYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  
  const[budgets, setBudgets] = useState({}); // { W1: 500, W2: 600 }
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // 初始化拉取数据
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const[budgetsData, txsData] = await Promise.all([
          FinanceDB.getFifoBudgets(activeYear),
          FinanceDB.listTransactionsByYear(activeYear)
        ]);
        if (!isMounted) return;
        
        setBudgets(budgetsData || {});
        setTransactions(txsData ||[]);

        // 提取已有交易中的所有年份（动态年份切换兜底）
        const yearsSet = new Set([activeYear]);
        txsData.forEach(tx => {
          if (tx.date) yearsSet.add(parseInt(tx.date.substring(0, 4), 10));
        });
        setAvailableYears(Array.from(yearsSet).sort((a, b) => b - a));
      } catch (e) {
        console.error("Failed to load FIFO data", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [activeYear]);

  // 计算 52 周的排布与状态合并
  const weeklyData = useMemo(() => {
    const w1 = isoW1Monday(activeYear);
    const weeks =[];
    
    // 按周聚拢实际支出（只计算 expense）
    const txsByWeek = {};
    transactions.forEach(tx => {
      if (tx.type !== 'expense') return; // 防御性判断：只统计支出
      // 计算该日期属于哪一周
      const txDate = new Date(tx.date);
      const diffTime = Math.abs(txDate - w1);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);
      
      const wKey = `W${weekIndex + 1}`;
      if (!txsByWeek[wKey]) txsByWeek[wKey] = { total: 0, list: [] };
      txsByWeek[wKey].total += (tx.amount || 0);
      txsByWeek[wKey].list.push(tx);
    });

    for (let i = 0; i < 52; i++) {
      const wStart = new Date(w1.getTime() + i * 7 * 864e5);
      const wEnd = new Date(wStart.getTime() + 6 * 864e5);
      const wKey = `W${i + 1}`;
      
      const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      
      weeks.push({
        w: wKey,
        startStr: wStart.toISOString().slice(0, 10),
        endStr: wEnd.toISOString().slice(0, 10),
        d: `${fmt(wStart)}–${fmt(wEnd)}`,
        month: wStart.getMonth(),
        b: budgets[wKey] ?? 0, 
        s: txsByWeek[wKey]?.total ?? 0,
        txs: txsByWeek[wKey]?.list ?? [] // 挂载属于该周的账单
      });
    }
    return weeks;
  },[activeYear, budgets, transactions]);

  // 更新预算并落库
  const handleBudgetChange = useCallback(async (weekKey, newValue) => {
    const targetYear = activeYear; // 上下文冻结
    const val = parseFloat(newValue) || 0;
    
    // 乐观更新
    setBudgets(prev => {
      const next = { ...prev, [weekKey]: val };
      FinanceDB.saveFifoBudgets(targetYear, next).catch(e => {
        console.error('保存预算失败', e);
        // 如果需要严格回滚可以在这里实现，这里为了轻量不回滚
      });
      return next;
    });
  }, [activeYear]);

  // 更新交易明细并落库
  const saveTransaction = useCallback(async (txData) => {
    const id = txData.id || `tx_${Date.now()}`;
    const payload = {
      id,
      domain: 'finance',
      type: 'expense', // 写死为支出
      amount: parseFloat(txData.amount) || 0,
      desc: txData.desc || '',
      date: txData.date,
      createdAt: txData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 乐观更新
    setTransactions(prev => {
      const exists = prev.find(t => t.id === id);
      if (exists) return prev.map(t => t.id === id ? payload : t);
      return [...prev, payload];
    });

    try {
      await FinanceDB.patchTransaction(id, payload);
    } catch (e) {
      console.error('交易保存失败', e);
    }
  },[]);

  const deleteTransaction = useCallback(async (id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    try {
      await FinanceDB.deleteTransaction(id);
    } catch (e) {
      console.error('交易删除失败', e);
    }
  },[]);

  return {
    loading,
    activeYear,
    setActiveYear,
    availableYears,
    weeklyData,
    handleBudgetChange,
    saveTransaction,
    deleteTransaction
  };
}