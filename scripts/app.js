/**
 * 应用主入口 - 初始化、SW 注册、生命周期管理
 */
const App = (() => {
  /** 注册 Service Worker */
  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker 注册成功');
      } catch (err) {
        console.warn('Service Worker 注册失败:', err);
      }
    }
  }

  /** 应用路由事件监听 */
  function bindRouteEvents() {
    // 返回按钮
    const backBtn = document.getElementById('app-back-btn');
    if (backBtn) {
      backBtn.onclick = () => Router.back();
    }

    // 路由变更时更新应用容器
    window.addEventListener('route-change', (e) => {
      const { route, params } = e.detail;
      if (route === 'app' && params.appId) {
        loadApp(params.appId, params);
      }
    });
  }

  /** 加载应用内容 */
  function loadApp(appId, params) {
    const title = document.getElementById('app-title');
    const body = document.getElementById('app-body');

    const appNames = {
      chat: '微信', contacts: '联系人', memories: '记忆',
      journal: '日记', forum: '论坛', worldbook: '世界书',
      presets: '预设', stickers: '表情包', settings: '设置'
    };

    if (title) title.textContent = appNames[appId] || appId;
    if (body) {
      body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;color:var(--text-tertiary);">
          <div style="font-size:48px;">🚧</div>
          <div style="font-size:var(--font-md);">${appNames[appId] || appId} 开发中...</div>
        </div>
      `;
    }
  }

  /** 页面可见性管理 */
  function bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 页面隐藏时保存状态
        const current = Router.current();
        if (current) {
          DB.setSetting('last_route', JSON.stringify(current));
        }
      }
    });
  }

  /** 启动 */
  async function boot() {
    await DB.open();
    registerSW();
    bindRouteEvents();
    bindVisibility();

    // 检查存储配额
    DB.checkQuota();

    // 启动画面 -> 锁屏
    Splash.init();
  }

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { boot, loadApp };
})();
