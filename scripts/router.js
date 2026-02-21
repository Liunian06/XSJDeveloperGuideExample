/**
 * 路由模块 - SPA 页面导航与上下文传递
 */
const Router = (() => {
  const history = [];
  let currentRoute = null;

  /** 路由规范 */
  const routes = {
    splash:    { screen: 'splash-screen' },
    lock:      { screen: 'lock-screen' },
    home:      { screen: 'home-screen' },
    app:       { screen: 'app-container' }
  };

  /** 导航到指定页面 */
  function navigate(route, params = {}) {
    const config = routes[route];
    if (!config) {
      console.warn(`路由不存在: ${route}，回退到主屏`);
      navigate('home');
      return;
    }

    if (currentRoute) {
      history.push({ route: currentRoute.route, params: currentRoute.params });
    }

    currentRoute = { route, params };
    Utils.showScreen(config.screen);

    // 触发路由变更事件
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: { route, params }
    }));
  }

  /** 返回上一页 */
  function back() {
    if (history.length > 0) {
      const prev = history.pop();
      currentRoute = prev;
      const config = routes[prev.route];
      if (config) {
        Utils.showScreen(config.screen);
        window.dispatchEvent(new CustomEvent('route-change', {
          detail: prev
        }));
      }
    } else {
      navigate('home');
    }
  }

  /** 打开应用 */
  function openApp(appId, params = {}) {
    navigate('app', { appId, ...params });
  }

  /** 获取当前路由 */
  function current() {
    return currentRoute;
  }

  /** 清空历史 */
  function clearHistory() {
    history.length = 0;
  }

  return { navigate, back, openApp, current, clearHistory };
})();
