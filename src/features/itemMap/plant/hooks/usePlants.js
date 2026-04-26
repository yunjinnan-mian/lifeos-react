import { useState, useEffect, useRef } from 'react';
import { db } from '../../../../lib/firebase.js';
import {
  collection, query, where, orderBy, onSnapshot,
  limit as fsLimit,
} from 'firebase/firestore';

/**
 * usePlants — 订阅 active 植物列表 + 每株植物最新 GrowthLog。
 *
 * 封面实时更新机制：
 *   每株植物独立持有一个 onSnapshot(growth_logs, limit 1)。
 *   某株植物的最新 log 变化时，只触发 latestLogs Map 的局部更新，
 *   不影响其他植物的订阅，最小化重渲染范围。
 *
 * 依赖 Firestore 复合索引：(plant_id ASC, recorded_at DESC)
 */
export function usePlants() {
  const [plants, setPlants]       = useState([]);
  const [latestLogs, setLatestLogs] = useState(new Map()); // Map<plantId, log|null>
  const [loading, setLoading]     = useState(true);

  // useRef 保存 listeners，避免 effect 依赖数组捕获旧 Map 引用
  const logListeners = useRef(new Map()); // Map<plantId, unsubscribeFn>

  useEffect(() => {
    const plantsQ = query(
      collection(db, 'plants'),
      where('status', '==', 'active'),
      orderBy('sort_order', 'asc'),
    );

    const unsubPlants = onSnapshot(plantsQ, (snap) => {
      const newPlants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlants(newPlants);
      setLoading(false);

      const newIds = new Set(newPlants.map(p => p.id));

      // 取消已消失植物的 log 订阅，清理 latestLogs
      for (const [plantId, unsub] of logListeners.current) {
        if (!newIds.has(plantId)) {
          unsub();
          logListeners.current.delete(plantId);
          setLatestLogs(prev => {
            const next = new Map(prev);
            next.delete(plantId);
            return next;
          });
        }
      }

      // 为新植物建立 log 订阅
      for (const plant of newPlants) {
        if (logListeners.current.has(plant.id)) continue;

        const logQ = query(
          collection(db, 'growth_logs'),
          where('plant_id', '==', plant.id),
          orderBy('recorded_at', 'desc'),
          fsLimit(1),
        );

        const unsub = onSnapshot(logQ, (logSnap) => {
          const log = logSnap.empty
            ? null
            : { id: logSnap.docs[0].id, ...logSnap.docs[0].data() };
          setLatestLogs(prev => new Map(prev).set(plant.id, log));
        });

        logListeners.current.set(plant.id, unsub);
      }
    });

    return () => {
      unsubPlants();
      for (const unsub of logListeners.current.values()) unsub();
      logListeners.current.clear();
    };
  }, []);

  return { plants, latestLogs, loading };
}
