import { initializeApp }      from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot,
         setDoc, deleteDoc, writeBatch,
         query, where, orderBy, getDocs } from 'firebase/firestore';
import { getStorage, ref as sRef,
         uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const storage = getStorage(app);

// Re-export Firestore helpers so other modules only need to import from here
export { collection, doc, onSnapshot, query, where, orderBy, getDocs };

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

  // ── Exploration entries ───────────────────────────────────────
  // Schema: {
  //   id, islandId, categoryId,
  //   date        : 'YYYY-MM-DD',
  //   text        : string,
  //   photos      : [{ url: string, storagePath: string }],  // max 2
  //   starred     : boolean,
  //   createdAt   : number (ms),
  //   updatedAt   : number (ms),
  // }

  /** 创建或整体覆写一条探索记录 */
  saveExplorationEntry: (id, data) =>
    setDoc(doc(db, 'explorationEntries', id), data),

  /** 局部字段更新（starred / text / photos 等），不触碰 createdAt */
  patchExplorationEntry: (id, patch) =>
    setDoc(doc(db, 'explorationEntries', id), patch, { merge: true }),

  /** 删除记录并清理所有关联 Storage 图片（complete teardown） */
  deleteExplorationEntry: async (entry) => {
    await deleteDoc(doc(db, 'explorationEntries', entry.id));
    if (entry.photos?.length) {
      await Promise.all(
        entry.photos.map(p =>
          p.storagePath
            ? deleteObject(sRef(storage, p.storagePath)).catch(() => {})
            : Promise.resolve()
        )
      );
    }
  },

  /**
   * 上传单张探索图片，返回 { url, storagePath }
   * 命名规则：explorationPhotos/{entryId}_{photoIndex}.webp
   * 覆写同 path 的旧文件，无需先删除
   */
  uploadExplorationPhoto: async (entryId, photoIndex, blob) => {
    const storagePath = `explorationPhotos/${entryId}_${photoIndex}.webp`;
    const sr = sRef(storage, storagePath);
    await uploadBytes(sr, blob);
    const url = await getDownloadURL(sr);
    return { url, storagePath };
  },
};