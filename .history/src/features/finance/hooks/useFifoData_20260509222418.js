// src/features/finance/hooks/useFifoData.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { FinanceDB } from '../../../lib/db';
import { useFinance } from '../index'; // 直接接入你主应用的上下文
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

// ISO 8601: W1 是包含该年第一个星期四的那一周
function isoW1Monday(year) {
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7;
  return new Date(year, 0, 4 - dow);
}

export function useFifoData() {
  // 核心改动 1：直接从主应用获取全部数据和方法
  const { data, setData, updateData, showToast } = useFinance();
  const allTxs = data?.txs ||[];

  // 1. 动态提取所有存在的年份（因为 allTxs 在内存里，这一步瞬间完成）
  const availableYears = useMemo(() => {
    const years = new Set();
    allTxs.forEach(tx => {
      if (tx.date) years.add(parseInt(tx.date.substring(0, 4), 10));
    });
    const arr = Array.from(years).sort((a, b) => b - a);
    return arr.length > 0 ? arr : [new Date().getFullYear()];
  }, [allTxs]);

  // 2. 当前激活年份（默认选中数据里最新的一年）
  const [activeYear, setActiveYear] = useState(availableYears[0] || 2025);

  // 兜底同步：如果数据刚加载进来，年份还没对齐，自动对齐
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(activeYear)) {
      setActiveYear(availableYears[0]);
    }
  },[availableYears, activeYear]);

  const [budgets, setBudgets] = useState({});
  const[loading, setLoading] = useState(true);

  // 3. 只有“预算(Budget)”这个专属数据才需要去 Firebase 拉
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    FinanceDB.getFifoBudgets(activeYear).then(res => {
      if (!isMounted) return;
      setBudgets(res || {});
      setLoading(false);
    }).catch(e => {
      console.error("加载预算失败", e);
      if (isMounted) setLoading(false);
    });
    return () => { isMounted = false; };
  }, [activeYear]);

  // 4. 计算 52 周的数据排布
  const weeklyData = useMemo(() => {
    const w1 = isoW1Monday(activeYear);
    const weeks =[];
    
    // 过滤出当前年份的“支出”
    const currentYearTxs = allTxs.filter(tx => {
      if (tx.type !== 'expense') return false; 
      if (!tx.date) return false;
      return parseInt(tx.date.substring(0, 4), 10) === activeYear;
    });

    // 按周聚拢实际支出
    const txsByWeek = {};
    currentYearTxs.forEach(tx => {
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
        txs: txsByWeek[wKey]?.list ??[] 
      });
    }
    return weeks;
  }, [activeYear, budgets, allTxs]);

  // 5. 更新预算并落库
  const handleBudgetChange = useCallback(async (weekKey, newValue) => {
    const targetYear = activeYear; 
    const val = parseFloat(newValue) || 0;
    
    setBudgets(prev => {
      const next = { ...prev, [weekKey]: val };
      FinanceDB.saveFifoBudgets(targetYear, next).catch(e => console.error('保存失败', e));
      return next;
    });
  }, [activeYear]);

  // 6. 抽屉内新建交易：同步更新外层 data.txs 与外层账户余额
  const saveTransaction = useCallback(async (txData) => {
    const id = txData.id || `tx_${Date.now()}`;
    const payload = {
      id,
      domain: 'finance', // 默认记为财务域
      type: 'expense',
      amount: parseFloat(txData.amount) || 0,
      desc: txData.desc || '',
      date: txData.date,
      cat1: '其他', // 快速记账默认值
      cat2: '其他',
      accId: data?.acc?.[0]?.id || 'auto', // 默认扣除第一个账户
      createdAt: txData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 乐观更新：推送到全局账单数组
    setData(prev => ({
      ...prev,
      txs:[...prev.txs, payload]
    }));

    // 乐观更新：全局账户余额扣减
    if (data?.acc?.length > 0) {
      updateData(prev => ({
        ...prev,
        acc: prev.acc.map(a => 
          String(a.id) === String(payload.accId) ? { ...a, bal: a.bal - payload.amount } : a
        )
      }));
    }

    try {
      await setDoc(doc(db, 'transactions', id), payload, { merge: true });
      if(showToast) showToast('已记录');
    } catch (e) {
      console.error('交易保存失败', e);
    }
  },[data, setData, updateData, showToast]);

  // 7. 抽屉内删除交易：同步更新外层
  const deleteTransaction = useCallback(async (id) => {
    const targetTx = allTxs.find(t => t.id === id);
    if (!targetTx) return;

    // 乐观更新：移出全局账单
    setData(prev => ({ ...prev, txs: prev.txs.filter(t => t.id !== id) }));
    
    // 乐观更新：全局账户余额恢复
    if (data?.acc?.length > 0) {
      updateData(prev => ({
        ...prev,
        acc: prev.acc.map(a => 
          String(a.id) === String(targetTx.accId) ? { ...a, bal: a.bal + targetTx.amount } : a
        )
      }));
    }

    try {
      await deleteDoc(doc(db, 'transactions', id));
      if(showToast) showToast('已删除');
    } catch (e) {
      console.error('交易删除失败', e);
    }
  },[allTxs, data, setData, updateData, showToast]);

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