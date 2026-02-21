/**
 * 主屏幕模块 - 应用网格、Dock、小组件
 */
const Homescreen = (() => {
  let clockInterval = null;

  // 应用定义
  const apps = [
    { id: 'chat',      name: '微信',   icon: '💬', color: '#07C160', badge: 3, dock: true },
    { id: 'contacts',  name: '联系人', icon: '👤', color: '#10AEFF', dock: true },
    { id: 'memories',  name: '记忆',   icon: '🧠', color: '#8B5CF6', dock: false },
    { id: 'journal',   name: '日记',   icon: '📔', color: '#F59E0B', dock: false },
    { id: 'forum',     name: '论坛',   icon: '📋', color: '#EF4444', dock: false },
    { id: 'worldbook', name: '世界书', icon: '🌍', color: '#06B6D4', dock: false },
    { id: 'presets',   name: '预设',   icon: '⚙️', color: '#6366F1', dock: false },
    { id: 'stickers',  name: '表情包', icon: '😊', color: '#EC4899', dock: false },
    { id: 'settings',  name: '设置',   icon: '🔧', color: '#6B7280', dock: true },
  ];

  /** 初始化主屏 */
  function init() {
    renderApps();
    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);
  }

  /** 更新时钟 */
  function updateClock() {
    const now = new Date();
    const time = Utils.formatTime(now);
    const date = Utils.formatDate(now);

    const homeTime = document.getElementById('home-status-time');
    const clockTime = document.getElementById('home-clock-time');
    const clockDate = document.getElementById('home-clock-date');

    if (homeTime) homeTime.textContent = time;
    if (clockTime) clockTime.textContent = time;
    if (clockDate) clockDate.textContent = date;
  }

  /** 渲染应用图标 */
  function renderApps() {
    const grid = document.getElementById('app-grid');
    const dock = document.getElementById('app-dock');
    if (!grid || !dock) return;

    grid.innerHTML = '';
    dock.innerHTML = '';

    const gridApps = apps.filter(a => !a.dock);
    const dockApps = apps.filter(a => a.dock);

    gridApps.forEach(app => {
      grid.appendChild(createAppIcon(app, 'app-icon-wrap'));
    });

    dockApps.forEach(app => {
      dock.appendChild(createAppIcon(app, 'dock-icon-wrap'));
    });
  }

  /** 创建应用图标元素 */
  function createAppIcon(app, wrapClass) {
    const wrap = document.createElement('div');
    wrap.className = wrapClass;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', app.name);
    wrap.onclick = () => Router.openApp(app.id);

    const icon = document.createElement('div');
    icon.className = 'app-icon';
    icon.style.background = app.color;
    icon.textContent = app.icon;

    if (app.badge) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = app.badge > 99 ? '99+' : app.badge;
      icon.appendChild(badge);
    }

    const label = document.createElement('span');
    label.className = 'app-icon-label';
    label.textContent = app.name;

    wrap.appendChild(icon);
    wrap.appendChild(label);
    return wrap;
  }

  return { init };
})();
