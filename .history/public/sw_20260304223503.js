// Service Worker for LifeOS PWA
// 版本号：每次更新静态资源时，改这里的版本号，旧缓存会自动清理
const CACHE_NAME = 'lifeos-v1';

// 需要预缓存的核心文件（离线时也能打开）
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png'
];

// 安装阶段：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
  // 新版本 SW 立即接管，不等旧页面关闭
  self.skipWaiting();
});

// 激活阶段：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：网络优先策略
// 优先从网络获取最新内容（保证 Firebase 数据实时），
// 网络失败时才降级用缓存（离线可用）
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求，跳过 Firebase / 第三方 API
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firebaseio') ||
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 请求成功：顺手更新缓存
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // 网络失败：从缓存返回
        return caches.match(event.request);
      })
  );
});
