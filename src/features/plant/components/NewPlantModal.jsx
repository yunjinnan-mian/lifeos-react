import { useState, useEffect, useRef } from 'react';
import { PlantDB } from '../../../lib/db.js';
import { compressWebP } from '../../../lib/photo.js';
import { PLANT_CONFIG } from '../../../lib/config.js';

/**
 * NewPlantModal — 新建植物档案。
 *
 * 乐观更新流程（Firebase 宪法 §8）：
 *   1. 生成 plantId / logId，快照所有上下文到局部变量
 *   2. createPlantWithFirstLog（image_url: ''）→ Toast → 关闭弹窗
 *   3. 后台压缩 + 上传图片
 *   4. 竞态兜底：getPlantById 确认文档仍存在
 *   5. patchGrowthLog 补全 image_url
 *   失败：deleteGrowthLogById + deletePlantById 回滚占位文档
 *
 * Props:
 *   existingPlants  {Array}         用于计算 sort_order
 *   onClose         {() => void}
 *   onCreated       {() => void}    可选：新建成功后通知容器
 *   showToast       {(msg) => void}
 */
export default function NewPlantModal({ existingPlants = [], onClose, onCreated, showToast }) {
  const [categories, setCategories]         = useState([]);
  const [nickname, setNickname]             = useState('');
  const [categoryId, setCategoryId]         = useState('');
  const [isNewCat, setIsNewCat]             = useState(false);
  const [newCatName, setNewCatName]         = useState('');
  const [newCatEmoji, setNewCatEmoji]       = useState('🌱');
  const [previewUrl, setPreviewUrl]         = useState('');
  const [selectedFile, setSelectedFile]     = useState(null);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const fileRef                             = useRef(null);

  // 加载分类列表
  useEffect(() => {
    PlantDB.listCategories().then(setCategories).catch(() => {});
  }, []);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  // 清理 ObjectURL，防止内存泄漏
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  async function handleSubmit() {
    if (!nickname.trim()) { showToast?.('请填写昵称'); return; }
    if (!selectedFile)    { showToast?.('请选择初始状态图片'); return; }
    if (!isNewCat && !categoryId) { showToast?.('请选择分类'); return; }
    if (isNewCat && !newCatName.trim()) { showToast?.('请填写新分类名称'); return; }

    setIsSubmitting(true);

    // ── 在第一个 await 前冻结所有上下文 ─────────────────────────────────
    const now        = new Date().toISOString();
    const plantId    = 'plant_' + Date.now();
    const logId      = 'log_'   + Date.now();
    const storagePath = `plant-logs/${logId}.webp`;
    const fileSnapshot = selectedFile;
    const nicknameSnapshot = nickname.trim();
    const maxOrder = existingPlants.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
    const sortOrder = maxOrder + 1000;

    // 创建分类（如有），同样在 await 前快照参数
    let finalCategoryId = categoryId;
    if (isNewCat) {
      const catId = 'cat_' + Date.now();
      const catNameSnapshot  = newCatName.trim();
      const catEmojiSnapshot = newCatEmoji;
      try {
        await PlantDB.createCategory(catId, {
          name:       catNameSnapshot,
          emoji:      catEmojiSnapshot,
          created_at: now,
        });
        finalCategoryId = catId;
      } catch {
        showToast?.('分类创建失败，请重试');
        setIsSubmitting(false);
        return;
      }
    }

    // ── 步骤 1：写占位文档（双写事务）─────────────────────────────────────
    try {
      await PlantDB.createPlantWithFirstLog(
        plantId,
        {
          nickname:    nicknameSnapshot,
          category_id: finalCategoryId,
          sort_order:  sortOrder,
          status:      'active',
          created_at:  now,
          updated_at:  now,
        },
        logId,
        {
          plant_id:    plantId,
          image_url:   '',          // 占位，上传后 patch
          text_content: '',
          log_type:    'status_update',
          recorded_at: now,
        },
      );
    } catch {
      showToast?.('创建失败，请检查网络');
      setIsSubmitting(false);
      return;
    }

    // ── 步骤 2：UI 即时反馈，关闭弹窗 ─────────────────────────────────────
    showToast?.('已添加 ✓');
    onCreated?.();
    onClose();

    // ── 步骤 3：后台静默上传 ────────────────────────────────────────────
    try {
      const blob      = await compressWebP(fileSnapshot, PLANT_CONFIG.IMAGE_MAX_WIDTH, PLANT_CONFIG.IMAGE_QUALITY_WEBP, PLANT_CONFIG.IMAGE_PRE_MAX);
      const remoteUrl = await PlantDB.uploadPhoto(storagePath, blob);

      // 竞态兜底：用户可能已在上传期间删除该植物
      const still = await PlantDB.getPlantById(plantId);
      if (!still) {
        // 文档已消失，清理孤儿 Storage 文件
        PlantDB.uploadPhoto && await PlantDB.deletePhoto?.(storagePath).catch(() => {});
        return;
      }

      await PlantDB.patchGrowthLog(logId, { image_url: remoteUrl });
    } catch {
      // 上传失败：回滚占位文档（image_url 为空，Storage 无文件）
      await Promise.allSettled([
        PlantDB.deleteGrowthLogById(logId),
        PlantDB.deletePlantById(plantId),
      ]);
      showToast?.('⚠ 图片上传失败，已自动撤销');
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />

      <div className="new-plant-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">新建植物档案</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {/* 昵称 */}
        <label className="modal-label">昵称 <span className="modal-required">*</span></label>
        <input
          className="modal-input"
          type="text"
          placeholder="如：草莓 Unit 01"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={20}
        />

        {/* 分类 */}
        <label className="modal-label">分类 <span className="modal-required">*</span></label>
        <div className="modal-cat-tabs">
          <button
            className={`modal-cat-tab${!isNewCat ? ' active' : ''}`}
            onClick={() => setIsNewCat(false)}
          >选择现有</button>
          <button
            className={`modal-cat-tab${isNewCat ? ' active' : ''}`}
            onClick={() => setIsNewCat(true)}
          >新建分类</button>
        </div>

        {!isNewCat ? (
          <div className="modal-cat-list">
            {categories.length === 0
              ? <p className="modal-hint">暂无分类，请新建</p>
              : categories.map(c => (
                <button
                  key={c.id}
                  className={`modal-cat-chip${categoryId === c.id ? ' selected' : ''}`}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.emoji ?? ''} {c.name ?? ''}
                </button>
              ))
            }
          </div>
        ) : (
          <div className="modal-new-cat">
            <input
              className="modal-input modal-input--inline"
              type="text"
              placeholder="分类名称"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              maxLength={10}
            />
            <input
              className="modal-input modal-input--emoji"
              type="text"
              placeholder="🌱"
              value={newCatEmoji}
              onChange={e => setNewCatEmoji(e.target.value)}
              maxLength={2}
            />
          </div>
        )}

        {/* 初始状态图片 */}
        <label className="modal-label">初始状态图片 <span className="modal-required">*</span></label>
        <div
          className={`modal-photo-picker${previewUrl ? ' has-photo' : ''}`}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
        >
          {previewUrl
            ? <img src={previewUrl} alt="预览" className="modal-photo-preview" />
            : <span className="modal-photo-placeholder">📷 点击选择或拍照</span>
          }
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* 提交 */}
        <button
          className="modal-submit-btn"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? '创建中…' : '建档'}
        </button>
      </div>
    </>
  );
}
