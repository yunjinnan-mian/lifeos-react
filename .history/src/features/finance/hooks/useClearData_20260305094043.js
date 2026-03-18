// ============================================================
// Finance Pro — useClearData
// 双重确认 → 批量删除 Firestore transactions + config
// ============================================================

import { useCallback } from 'react';
import { db } from '../../../firebase';
import {
    collection, getDocs, doc, deleteDoc, writeBatch,
} from 'firebase/firestore';

export function useClearData({ showToast }) {
    return useCallback(async () => {
        if (!window.confirm('确定清空所有数据？此操作将删除云端所有记录！')) return;
        if (!window.confirm('再次确认：真的要清空吗？'))                      return;

        showToast('正在清空云端数据...');
        try {
            // 批量删除 transactions
            const snap = await getDocs(collection(db, 'transactions'));
            const refs = [];
            snap.forEach(d => refs.push(d.ref));
            for (let i = 0; i < refs.length; i += 499) {
                const batch = writeBatch(db);
                refs.slice(i, i + 499).forEach(ref => batch.delete(ref));
                await batch.commit();
            }
            // 删除 config
            await deleteDoc(doc(db, 'config', 'finance_config'));

            showToast('✅ 云端数据已清空');
            setTimeout(() => window.location.reload(), 800);
        } catch (e) {
            showToast('清空失败: ' + e.message, 'error');
        }
    }, [showToast]);
}
