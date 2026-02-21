const CACHE_NAME = 'xsj-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './styles/reset.css',
  './styles/theme.css',
  './styles/global.css',
  './styles/splash.css',
  './styles/lockscreen.css',
  './styles/homescreen.css',
  './scripts/db.js',
  './scripts/router.js',
  './scripts/utils.js',
  './scripts/splash.js',
  './scripts/lockscreen.js',
  './scripts/homescreen.js',
  './scripts/app.js'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 拦截请求：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // 仅缓存同源的成功响应
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // 离线兜底：返回主页
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
