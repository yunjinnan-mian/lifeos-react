export const CONFIG = {
    TILE_SIZE: 7,
    ZONE_SCALE: 4,
    GRID_W: 480,
    GRID_H: 480,
    SHORE_W: 1.8,
    ZOOM_MIN: 0.4,
    ZOOM_MAX: 4.0,
    ZOOM_WHEEL: 0.12,
    PHOTO_PRE_MAX: 2048,
    PHOTO_MAX_W: 800,
    PHOTO_QUALITY: 0.75,
};

export const ZOOM_STEP = 0.15;

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, DGRASS: 4, FOREST: 5 };

// ── 岛屿类型 ─────────────────────────────────────────────────────
// packed tile byte 的高 nibble 编码岛屿类型，低 nibble 编码地形 tile type
// 支持最多 16 种岛屿类型 × 16 种 tile type，当前使用 2 种，最大 packed 值 0x15 = 21（Uint8Array 安全）
export const ZONE_TYPES = {
    ITEMS: 'items',
    EXPLORATION: 'exploration',
};
export const ZONE_CATEGORY_BITS = {
    [ZONE_TYPES.ITEMS]: 0x00,
    [ZONE_TYPES.EXPLORATION]: 0x10,
};

export const BASE_COLOR = {
    [0]: '#1a3f8c',  // DEEP
    [1]: '#4aa8d8',  // SHALLOW
    [2]: '#e8a322',  // SAND
    [3]: '#44a318',  // GRASS
    [4]: '#328530',  // DGRASS
    [5]: '#1a4a0a',  // FOREST
};

// 探索岛调色板：羊皮纸沙滩 + 鼠尾草绿 + 茶绿森林，与物品岛形成色调区分
// 海洋（DEEP / SHALLOW）与物品岛共享，保持地图整体水域一致性
export const EXPLORE_BASE_COLOR = {
    [0]: '#1a3f8c',  // DEEP    （共享）
    [1]: '#4aa8d8',  // SHALLOW （共享）
    [2]: '#dfc09a',  // SAND    → 羊皮纸色
    [3]: '#7aaa6a',  // GRASS   → 鼠尾草绿
    [4]: '#4a8a5a',  // DGRASS  → 深鼠尾草
    [5]: '#235a42',  // FOREST  → 茶绿
};

export const firebaseConfig = {
    apiKey: 'AIzaSyCq0apieaxh4xaAoJBJ5Evam_jnNOr8yBw',
    authDomain: 'gen-lang-client-0378444111.firebaseapp.com',
    projectId: 'gen-lang-client-0378444111',
    storageBucket: 'gen-lang-client-0378444111.firebasestorage.app',
    messagingSenderId: '440342290540',
    appId: '1:440342290540:web:894148c0d604d2eaa33849',
};

// ── 植物岛常量 ─────────────────────────────────────────────────────────────
// 所有植物岛数值通过此对象引用，禁止在业务逻辑中硬编码。
export const PLANT_CONFIG = {
    // 矩阵看板
    MATRIX_DEFAULT_DAYS:      15,   // 默认展示的历史天数

    // 批量打卡防重节流
    BATCH_ACTION_THROTTLE_MS: 500,  // 同一卡片连续点击的最短间隔（ms）

    // 抠图 API 降级阈值
    CUTOUT_API_TIMEOUT_MS:    3000, // 超时后自动降级使用原图

    // 虚拟滚动缓冲区
    VIRTUAL_SCROLL_BUFFER:    5,    // 视口外上下各保留的卡片数量

    // 图片压缩（对齐 Firebase 宪法 compressWebP 参数）
    IMAGE_MAX_WIDTH:          800,  // 最长边压缩目标（px）
    IMAGE_QUALITY_WEBP:       0.75, // WebP 压缩质量
    IMAGE_QUALITY_JPEG:       0.70, // JPEG 降级压缩质量
    IMAGE_PRE_MAX:            2048, // iOS OOM 防护预缩阈值（px）
};
