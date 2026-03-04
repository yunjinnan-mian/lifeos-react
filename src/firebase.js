import { initializeApp }      from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot,
         setDoc, deleteDoc, writeBatch, query, where } from 'firebase/firestore';
import { getStorage, ref as sRef,
         uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const storage = getStorage(app);

// Re-export Firestore helpers so other modules only need to import from here
export { collection, doc, onSnapshot, query, where };

// ── DB 对象：所有读写操作的唯一入口 ──────────────────────────────
export const DB = {
  // Zones
  saveZoneConfig: (zones) =>
    setDoc(doc(db, 'config', 'itemMapZones'), { zones }),

  // Items
  createItem: (id, data) =>
    setDoc(doc(db, 'items', id), data),

  patchItem: (id, patch) =>
    setDoc(doc(db, 'items', id), patch, { merge: true }),

  // 删除：连根拔起，Firestore + Storage 一次搞定
  deleteItemCompletely: async (item) => {
    await deleteDoc(doc(db, 'items', item.id));
    if (item.photoUrl) {
      try { await deleteObject(sRef(storage, item.photoUrl)); } catch (e) { /* ignore */ }
    }
  },

  // 仅删除 Firestore 文档（乐观写入回滚用）
  deleteItemById: (id) =>
    deleteDoc(doc(db, 'items', id)),

  deleteItemsBatchCompletely: async (itemList) => {
    const batch = writeBatch(db);
    itemList.forEach(i => batch.delete(doc(db, 'items', i.id)));
    await batch.commit();
    await Promise.all(
      itemList.map(i =>
        i.photoUrl
          ? deleteObject(sRef(storage, i.photoUrl)).catch(() => {})
          : Promise.resolve()
      )
    );
  },

  // Storage
  uploadPhoto: async (path, blob) => {
    const sr = sRef(storage, path);
    await uploadBytes(sr, blob);
    return getDownloadURL(sr);
  },

  deletePhoto: (photoUrl) =>
    deleteObject(sRef(storage, photoUrl)),
};
