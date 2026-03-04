// lifenav.js - 云端动态左侧悬浮导航
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Firebase 配置（与你的系统完全一致）
const firebaseConfig = {
    apiKey: "AIzaSyCq0apieaxh4xaAoJBJ5Evam_jnNOr8yBw",
    authDomain: "gen-lang-client-0378444111.firebaseapp.com",
    projectId: "gen-lang-client-0378444111",
    storageBucket: "gen-lang-client-0378444111.firebasestorage.app",
    messagingSenderId: "440342290540",
    appId: "1:440342290540:web:894148c0d604d2eaa33849"
};

// 安全机制：防止在已经有 Firebase 的页面里重复初始化报错
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

(async function initLifeNav() {
    // 2. 注入专属的极简 CSS 样式（左侧垂直悬浮）
    const style = document.createElement('style');
    style.innerHTML = `
        .life-dock-vertical {
            position: fixed;
            left: 20px;            /* 靠左 20px */
            top: 50%;              /* 垂直居中 */
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(0,0,0,0.08);
            padding: 15px 10px;    /* 垂直方向留白多一点 */
            border-radius: 30px;   /* 圆角长条 */
            box-shadow: 0 10px 25px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column; /* 竖向排列 */
            gap: 15px;             /* Emoji 之间的间距 */
            z-index: 9999; 
            transition: all 0.3s ease;
        }
        .life-dock-vertical:hover {
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
        }
        .life-dock-item {
            text-decoration: none;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            transition: all 0.2s;
        }
        .life-dock-item:hover {
            background: rgba(0,0,0,0.05);
            transform: scale(1.1); /* 悬停时轻微放大 */
        }
        .life-dock-icon { 
            font-size: 1.5rem; /* Emoji 大小 */
            line-height: 1;
        }
    `;
    document.head.appendChild(style);

    // 3. 构建导航栏外壳
    const dock = document.createElement('div');
    dock.className = 'life-dock-vertical';

    // 默认先放入“主页”和“仪表盘”这两个最底层的系统级入口
    dock.innerHTML = `
        <a href="index.html" class="life-dock-item" title="主页 (LifeOS)"><span class="life-dock-icon">🌳</span></a>
        <a href="dashboard.html" class="life-dock-item" title="全局控制台"><span class="life-dock-icon">👁️</span></a>
    `;

    // 4. 从云端自动抓取你配置的其他入口
    try {
        const navQuery = query(collection(db, "navigation"), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(navQuery);
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // 如果没有填 Emoji，默认用圆点替代，保持阵型不乱
            const icon = data.icon || '🔸'; 
            
            const a = document.createElement('a');
            a.href = data.url;
            a.className = 'life-dock-item';
            // title 属性就是悬停时显示的文字提示
            a.title = `${data.title} (${data.layer === 'roots' ? '根系' : data.layer === 'trunk' ? '树干' : '枝叶'})`; 
            a.innerHTML = `<span class="life-dock-icon">${icon}</span>`;
            
            dock.appendChild(a);
        });
    } catch (error) {
        console.error("动态导航拉取失败:", error);
    }

    // 5. 挂载到页面
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dock));
    } else {
        document.body.appendChild(dock);
    }
})();