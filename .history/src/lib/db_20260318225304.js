// PlantDB：植物岛所有 Firestore / Storage 操作的唯一入口。
//
// 设计约束：
// - 组件和 hook 禁止直接调用 firebase/firestore，统一走此层
// - 每个导出函数都是独立的，可通过独立脚本验证，不依赖任何 UI 状态
// - 所有字段读取必须提供兜底值（见附录 A）
//
// Collections：plants / growth_logs / plant_actions / harvests / categories
// Storage 路径：plant-logs/{logId}.webp（详见规格文档 §6.6）

import { db, storage } from './firebase.js';
import {
  collection, doc, getDoc, getDocs,
  setDoc, deleteDoc, writeBatch,
  query, where, orderBy, limit as fsLimit,
} from 'firebase/firestore';
import {
  ref as sRef,
  uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';

// Firestore writeBatch 硬性上限：500 ops/batch
const BATCH_CHUNK = 500;

// ── 内部工具 ────────────────────────────────────────────────────────────────

// 用 URL 定位并删除 Storage 文件。
// 文件不存在时静默忽略，单个失败不影响调用方流程。
async function deleteStorageByUrl(url) {
  if (!url) return;
  try { await deleteObject(sRef(storage, url)); } catch (_) {}
}

// 分块批量删除 Firestore doc refs，自动处理超过 500 的情况。
async function batchDeleteRefs(docRefs) {
  for (let i = 0; i < docRefs.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    docRefs.slice(i, i + BATCH_CHUNK).forEach(r => batch.delete(r));
    await batch.commit();
  }
}

// ── PlantDB ──────────────────────────────────────────────────────────────────

export const PlantDB = {

  // ═══════════════════════════════════════════
  // Plants
  // ═══════════════════════════════════════════

  createPlant: (id, data) =>
    setDoc(doc(db, 'plants', id), data),

  patchPlant: (id, patch) =>
    setDoc(doc(db, 'plants', id), patch, { merge: true }),

  // 软删除：保留数据，仅标记 status，Harvest 溯源不断链
  archivePlant: (id) =>
    setDoc(doc(db, 'plants', id), {
      status:     'archived',
      updated_at: new Date().toISOString(),
    }, { merge: true }),

  /**
   * 硬删除植物及其全部关联数据。
   *
   * 执行顺序：
   * 1. 检查 harvests 表，若有关联记录则抛出 'PLANT_HAS_HARVESTS'（孤岛阻断）
   * 2. 批量删除 growth_logs + plant_actions + plant 文档（Firestore）
   * 3. 并行清理所有 growth_log 图片（Storage）
   *
   * 为什么先删 Firestore 再删 Storage：
   * Firestore batch 是原子操作，失败则全量回滚，不产生孤儿文档。
   * Storage 无法参与事务，放到最后是因为"有文档无图片"比"有图片无文档"
   * 危害更小——孤儿图片可补救，孤儿文档会在 UI 上持续暴露。
   */
  hardDeletePlant: async (plantId) => {
    // 步骤 1：孤岛阻断，先查再动
    const harvestCheck = await getDocs(
      query(collection(db, 'harvests'), where('source_plant_id', '==', plantId), fsLimit(1))
    );
    if (!harvestCheck.empty) throw new Error('PLANT_HAS_HARVESTS');

    // 步骤 2：收集所有关联 doc refs
    const [logsSnap, actionsSnap] = await Promise.all([
      getDocs(query(collection(db, 'growth_logs'),  where('plant_id', '==', plantId))),
      getDocs(query(collection(db, 'plant_actions'), where('plant_id', '==', plantId))),
    ]);

    const logs       = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const logRefs    = logs.map(l => doc(db, 'growth_logs', l.id));
    const actionRefs = actionsSnap.docs.map(d => doc(db, 'plant_actions', d.id));
    const plantRef   = doc(db, 'plants', plantId);

    // 步骤 3：原子批量删除所有 Firestore 文档
    await batchDeleteRefs([plantRef, ...logRefs, ...actionRefs]);

    // 步骤 4：并行清理 Storage（单个失败不阻断其他）
    await Promise.all(logs.map(l => deleteStorageByUrl(l.image_url || '')));
  },

  // ═══════════════════════════════════════════
  // GrowthLogs
  // ═══════════════════════════════════════════

  createGrowthLog: (id, data) =>
    setDoc(doc(db, 'growth_logs', id), data),

  patchGrowthLog: (id, patch) =>
    setDoc(doc(db, 'growth_logs', id), patch, { merge: true }),

  getGrowthLogById: async (id) => {
    const snap = await getDoc(doc(db, 'growth_logs', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  /**
   * 删除 GrowthLog，并按 log_type 决定是否级联。
   *
   * harvest_snapshot：同时删除 harvests 表中 source_log_id == logId 的记录
   *   及其 Storage 图片（果实图）。
   * status_update：仅删除该条 GrowthLog 及其 Storage 图片。
   *
   * 封面实时回退：调用方通过 onSnapshot 订阅实现，DB 层无需处理。
   */
  deleteGrowthLogWithCascade: async (log) => {
    const logId    = log.id;
    const logType  = log.log_type   || '';
    const imageUrl = log.image_url  || '';

    // 级联删除关联 Harvest（query-based，即使已被手动删除也安全）
    if (logType === 'harvest_snapshot') {
      const harvestSnap = await getDocs(
        query(collection(db, 'harvests'), where('source_log_id', '==', logId))
      );
      // 每条 Harvest 独立处理，互不阻塞
      await Promise.all(
        harvestSnap.docs.map(async (d) => {
          const harvestImageUrl = (d.data().image_url || '');
          await deleteDoc(doc(db, 'harvests', d.id));
          await deleteStorageByUrl(harvestImageUrl);
        })
      );
    }

    // 删除 GrowthLog 文档 + 图片
    await deleteDoc(doc(db, 'growth_logs', logId));
    await deleteStorageByUrl(imageUrl);
  },

  // 返回该植物最新一条 GrowthLog，用于主页封面取图
  // 依赖复合索引：(plant_id ASC, recorded_at DESC)
  getLatestGrowthLog: async (plantId) => {
    const snap = await getDocs(
      query(
        collection(db, 'growth_logs'),
        where('plant_id', '==', plantId),
        orderBy('recorded_at', 'desc'),
        fsLimit(1)
      )
    );
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  },

  // 返回该植物全部 GrowthLog，按 recorded_at 倒序（时间线用）
  // 依赖复合索引：(plant_id ASC, recorded_at DESC)
  listGrowthLogs: async (plantId) => {
    const snap = await getDocs(
      query(
        collection(db, 'growth_logs'),
        where('plant_id', '==', plantId),
        orderBy('recorded_at', 'desc')
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ═══════════════════════════════════════════
  // PlantActions
  // ═══════════════════════════════════════════

  createPlantAction: (id, data) =>
    setDoc(doc(db, 'plant_actions', id), data),

  deletePlantAction: (id) =>
    deleteDoc(doc(db, 'plant_actions', id)),

  // 单株植物的全部操作记录（时间线 / 矩阵格子明细用）
  // 依赖复合索引：(plant_id ASC, recorded_at DESC)
  listPlantActions: async (plantId) => {
    const snap = await getDocs(
      query(
        collection(db, 'plant_actions'),
        where('plant_id',   '==', plantId),
        where('island_type','==', 'plant'),
        orderBy('recorded_at', 'desc')
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /**
   * 矩阵看板专用：一次拉取所有植物在指定日期范围内的操作记录。
   * 比逐株查询少 N-1 次网络往返。
   *
   * startDate / endDate：ISO date string 'YYYY-MM-DD'（含）
   * 依赖复合索引：(island_type ASC, recorded_at ASC)
   */
  listAllPlantActionsInRange: async (startDate, endDate) => {
    const snap = await getDocs(
      query(
        collection(db, 'plant_actions'),
        where('island_type', '==', 'plant'),
        where('recorded_at', '>=', startDate),
        where('recorded_at', '<=', endDate + '\uffff'), // 覆盖当天全天的 ISO 字符串
        orderBy('recorded_at', 'desc')
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ═══════════════════════════════════════════
  // Harvests
  // ═══════════════════════════════════════════

  createHarvest: (id, data) =>
    setDoc(doc(db, 'harvests', id), data),

  /**
   * 删除单条 Harvest 记录及其果实图片。
   * 不触碰植物岛时间线中的 harvest_snapshot 条目（双向独立）。
   */
  deleteHarvest: async (harvest) => {
    await deleteDoc(doc(db, 'harvests', harvest.id));
    await deleteStorageByUrl(harvest.image_url || '');
  },

  // 判断植物是否已有采摘记录，决定光环是否显示（aura 系统）
  hasHarvests: async (plantId) => {
    const snap = await getDocs(
      query(collection(db, 'harvests'), where('source_plant_id', '==', plantId), fsLimit(1))
    );
    return !snap.empty;
  },

  // ═══════════════════════════════════════════
  // Categories
  // ═══════════════════════════════════════════

  createCategory: (id, data) =>
    // island_type 强制注入，防止调用方遗漏导致跨岛污染
    setDoc(doc(db, 'categories', id), { ...data, island_type: 'plant' }),

  listCategories: async () => {
    const snap = await getDocs(
      query(collection(db, 'categories'), where('island_type', '==', 'plant'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /**
   * 删除分类前强制校验引用，阻断悬空外键。
   * 抛出 'CATEGORY_HAS_REFERENCES' 时，调用方提示用户手动迁移后再删。
   *
   * 两个查询并行执行，比串行快一次网络往返。
   */
  deleteCategory: async (categoryId) => {
    const [plantSnap, harvestSnap] = await Promise.all([
      getDocs(query(collection(db, 'plants'),   where('category_id', '==', categoryId), fsLimit(1))),
      getDocs(query(collection(db, 'harvests'), where('category_id', '==', categoryId), fsLimit(1))),
    ]);
    if (!plantSnap.empty || !harvestSnap.empty) {
      throw new Error('CATEGORY_HAS_REFERENCES');
    }
    await deleteDoc(doc(db, 'categories', categoryId));
  },

  // ═══════════════════════════════════════════
  // 复合事务（双写原子操作）
  // ═══════════════════════════════════════════

  /**
   * 原子写入新植物档案 + 第一条 GrowthLog。
   * 两个文档要么同时写入，要么都不写（Firestore writeBatch 保证）。
   *
   * 配合乐观更新模式使用（Firebase 宪法 §8）：
   *   调用时 plantData 和 logData 的图片 URL 均传 ''（占位）
   *   → 后台上传图片
   *   → patchGrowthLog 补全 image_url
   *
   * 上传失败时回滚：调用 deleteGrowthLogById(logId) + deletePlantById(plantId)
   * 此时两个文档的 image_url 均为 ''，Storage 无对应文件，走 deleteXxxById 即可。
   */
  createPlantWithFirstLog: (plantId, plantData, logId, logData) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'plants',      plantId), plantData);
    batch.set(doc(db, 'growth_logs', logId),   logData);
    return batch.commit();
  },

  /**
   * 原子写入采摘快照 GrowthLog + Harvest 记录。
   * 两个文档要么同时写入，要么都不写（Firestore writeBatch 保证）。
   *
   * logData.log_type 应为 'harvest_snapshot'。
   * harvestData 应含 source_plant_id、source_log_id、emoji_snapshot。
   *
   * 上传失败时回滚：调用 deleteGrowthLogById + deleteHarvestById（两个均无图片 URL）
   */
  createHarvestWithSnapshot: (logId, logData, harvestId, harvestData) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'growth_logs', logId),    logData);
    batch.set(doc(db, 'harvests',    harvestId), harvestData);
    return batch.commit();
  },

  // ═══════════════════════════════════════════
  // Storage
  // ═══════════════════════════════════════════

  /**
   * 上传图片 Blob 到 Storage，返回完整下载 URL。
   * path 示例：'plant-logs/{logId}.webp'（规格文档 §6.6）
   */
  uploadPhoto: async (path, blob) => {
    const sr = sRef(storage, path);
    await uploadBytes(sr, blob);
    return getDownloadURL(sr);
  },

  // ═══════════════════════════════════════════
  // 回滚专用（仅限 image_url === '' 的占位文档）
  // ═══════════════════════════════════════════
  //
  // 使用约束：只允许在 image_url 确认为空的乐观更新回滚场景中调用。
  // 有图片的文档必须走对应的完整删除函数（deleteGrowthLogWithCascade / deleteHarvest）。

  deletePlantById:     (id) => deleteDoc(doc(db, 'plants',      id)),
  deleteGrowthLogById: (id) => deleteDoc(doc(db, 'growth_logs', id)),
  deleteHarvestById:   (id) => deleteDoc(doc(db, 'harvests',    id)),

  // ═══════════════════════════════════════════
  // 点查（竞态兜底校验用）
  // ═══════════════════════════════════════════

  getPlantById: async (id) => {
    const snap = await getDoc(doc(db, 'plants', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
};
