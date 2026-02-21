/**
 * 锁屏模块 - 密码设置与解锁
 */
const Lockscreen = (() => {
  let passcode = '';
  let storedPassword = null;
  let failCount = 0;
  let lockoutUntil = 0;
  const MAX_FAILS = 5;
  const LOCKOUT_MS = 30000;
  const WEAK_PASSWORDS = ['123456', '000000', '111111', '654321', '888888', '666666'];

  // 密码设置流程状态
  let setupStep = 'first'; // 'first' | 'confirm'
  let firstInput = '';

  /** 更新时钟 */
  function updateClock() {
    const now = new Date();
    const time = Utils.formatTime(now);
    const date = Utils.formatDate(now);

    const lockTime = document.getElementById('lock-time');
    const lockDate = document.getElementById('lock-date');
    const lockStatusTime = document.getElementById('lock-status-time');

    if (lockTime) lockTime.textContent = time;
    if (lockDate) lockDate.textContent = date;
    if (lockStatusTime) lockStatusTime.textContent = time;
  }

  /** 更新密码点显示 */
  function updateDots(containerId, length) {
    const dots = document.querySelectorAll(`#${containerId} .dot`);
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < length);
    });
  }

  /** 初始化锁屏 */
  async function init() {
    storedPassword = await DB.getSetting('password');

    if (!storedPassword) {
      // 首次使用，显示密码设置弹窗
      showSetupModal();
    } else {
      Router.navigate('lock');
    }

    updateClock();
    setInterval(updateClock, 1000);
    bindKeypad();
  }

  /** 显示密码设置弹窗 */
  function showSetupModal() {
    Router.navigate('lock');
    const modal = document.getElementById('setup-modal');
    modal.style.display = 'flex';
    setupStep = 'first';
    firstInput = '';
    passcode = '';
    updateSetupUI();
    bindSetupKeypad();
  }

  function updateSetupUI() {
    const title = document.getElementById('setup-title');
    const desc = document.getElementById('setup-desc');
    const error = document.getElementById('setup-error');

    if (setupStep === 'first') {
      title.textContent = '设置密码';
      desc.textContent = '请输入 6 位数字密码';
    } else {
      title.textContent = '确认密码';
      desc.textContent = '请再次输入密码';
    }
    error.textContent = '';
    updateDots('setup-dots', 0);
  }

  /** 绑定设置键盘 */
  function bindSetupKeypad() {
    const keypad = document.getElementById('setup-keypad');
    keypad.onclick = (e) => {
      const key = e.target.closest('.key');
      if (!key) return;
      const val = key.dataset.key;

      if (val === 'delete') {
        passcode = passcode.slice(0, -1);
      } else if (val && passcode.length < 6) {
        passcode += val;
      }

      updateDots('setup-dots', passcode.length);

      if (passcode.length === 6) {
        handleSetupInput(passcode);
        passcode = '';
      }
    };
  }

  /** 处理密码设置输入 */
  async function handleSetupInput(input) {
    const error = document.getElementById('setup-error');

    if (setupStep === 'first') {
      if (WEAK_PASSWORDS.includes(input)) {
        error.textContent = '密码过于简单，请重新设置';
        Utils.shakeElement(document.getElementById('setup-dots'));
        updateDots('setup-dots', 0);
        return;
      }
      firstInput = input;
      setupStep = 'confirm';
      updateSetupUI();
    } else {
      if (input !== firstInput) {
        error.textContent = '两次输入不一致，请重新设置';
        Utils.shakeElement(document.getElementById('setup-dots'));
        setupStep = 'first';
        firstInput = '';
        setTimeout(updateSetupUI, 600);
        return;
      }
      // 保存密码
      await DB.setSetting('password', input);
      storedPassword = input;
      document.getElementById('setup-modal').style.display = 'none';
      // 直接进入主屏
      Router.navigate('home');
      Homescreen.init();
    }
  }

  /** 绑定锁屏键盘 */
  function bindKeypad() {
    const keypad = document.getElementById('passcode-keypad');
    keypad.onclick = (e) => {
      const key = e.target.closest('.key');
      if (!key) return;

      // 检查锁定状态
      if (Date.now() < lockoutUntil) {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        document.getElementById('passcode-error').textContent = `请等待 ${remaining} 秒后重试`;
        return;
      }

      const val = key.dataset.key;
      if (val === 'delete') {
        passcode = passcode.slice(0, -1);
      } else if (val && passcode.length < 6) {
        passcode += val;
      }

      updateDots('passcode-dots', passcode.length);

      if (passcode.length === 6) {
        verifyPasscode(passcode);
        passcode = '';
      }
    };
  }

  /** 验证密码 */
  function verifyPasscode(input) {
    const error = document.getElementById('passcode-error');

    if (input === storedPassword) {
      // 解锁成功
      failCount = 0;
      error.textContent = '';
      Router.navigate('home');
      Homescreen.init();
    } else {
      // 解锁失败
      failCount++;
      Utils.shakeElement(document.getElementById('passcode-dots'));

      if (failCount >= MAX_FAILS) {
        lockoutUntil = Date.now() + LOCKOUT_MS;
        error.textContent = `连续失败 ${MAX_FAILS} 次，请等待 30 秒`;
        failCount = 0;
        startLockoutTimer();
      } else {
        error.textContent = `密码错误 (${failCount}/${MAX_FAILS})`;
      }
      updateDots('passcode-dots', 0);
    }
  }

  /** 锁定倒计时 */
  function startLockoutTimer() {
    const error = document.getElementById('passcode-error');
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(interval);
        error.textContent = '';
      } else {
        error.textContent = `请等待 ${remaining} 秒后重试`;
      }
    }, 1000);
  }

  /** 锁定屏幕 */
  function lock() {
    passcode = '';
    updateDots('passcode-dots', 0);
    document.getElementById('passcode-error').textContent = '';
    Router.navigate('lock');
  }

  return { init, lock };
})();
