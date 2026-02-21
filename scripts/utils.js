/**
 * 工具函数模块
 */
const Utils = (() => {
  /** 生成唯一 ID */
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** 获取当前时间字符串 (UTC+8) */
  function now() {
    return new Date().toISOString();
  }

  /** 格式化时间为 HH:MM */
  function formatTime(date) {
    const d = date instanceof Date ? date : new Date();
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  /** 格式化日期为 M月D日 星期X */
  function formatDate(date) {
    const d = date instanceof Date ? date : new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = weekdays[d.getDay()];
    return `${month}月${day}日 星期${weekday}`;
  }

  /** 格式化相对时间 */
  function formatRelative(dateStr) {
    const now = Date.now();
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
  }

  /** 显示/隐藏页面 */
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }

  /** 安全获取 DOM 元素 */
  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  /** 防抖 */
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /** 节流 */
  function throttle(fn, delay = 300) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
      }
    };
  }

  /** 震动反馈 */
  function vibrate(pattern = 10) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /** 添加 shake 动画 */
  function shakeElement(el) {
    el.classList.add('shake');
    vibrate([50, 30, 50]);
    setTimeout(() => el.classList.remove('shake'), 500);
  }

  return {
    genId, now, formatTime, formatDate, formatRelative,
    showScreen, $, $$, debounce, throttle, vibrate, shakeElement
  };
})();
