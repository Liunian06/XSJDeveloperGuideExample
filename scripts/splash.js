/**
 * 启动画面模块
 */
const Splash = (() => {
  const SPLASH_DURATION = 2200; // 启动画面持续时间

  async function init() {
    // 等待动画完成后进入锁屏
    setTimeout(async () => {
      await Lockscreen.init();
    }, SPLASH_DURATION);
  }

  return { init };
})();
