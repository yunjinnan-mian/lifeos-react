// Island Registry：每种岛屿类型的配置声明。
// 新增岛屿只需追加一个配置对象，不修改任何现有代码。
// MatrixDashboard / BatchActionBar 等组件通过此配置渲染，不硬编码岛屿逻辑。

export const ISLAND_REGISTRY = {
  plant: {
    island_type:  'plant',
    display_name: '植物岛',
    icon:         '🌿',

    // 该岛屿支持的操作类型，决定矩阵格子的 Emoji 和批量打卡栏的按钮
    action_types: [
      { type: 'water',     emoji: '💧', label: '浇水' },
      { type: 'fertilize', emoji: '💊', label: '施肥' },
      { type: 'sunlight',  emoji: '☀️', label: '光照' },
    ],

    paired_island: 'harvest', // 伴生岛（分类字典由植物岛单向输出）
    has_matrix:    true,      // 支持布尔矩阵看板
    has_timeline:  true,      // 支持生长时间线
    has_aura:      true,      // 支持光环系统（首次采摘后解锁）
  },
};

// 合法 action_type 集合，按岛屿类型索引。
// PlantDB.createPlantAction 写入前可用此做前端校验，防止拼写错误入库。
export const VALID_ACTION_TYPES = Object.fromEntries(
  Object.entries(ISLAND_REGISTRY).map(([islandType, cfg]) => [
    islandType,
    new Set(cfg.action_types.map(a => a.type)),
  ])
);
