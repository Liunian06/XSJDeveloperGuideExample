/**
 * 小手机主应用逻辑
 * 处理应用生命周期、路由、页面切换等核心功能
 */

class App {
  constructor() {
    this.currentState = 'cold_start'; // cold_start, locked, unlocked, background, restored
    this.password = null;
    this.inputPassword = '';
    this.failedAttempts = 0;
    this.isLocked = false;
    this.currentApp = null;
    
    // 页面元素
    this.pages = {
      splash: document.getElementById('splash-screen'),
      lock: document.getElementById('lock-screen'),
      home: document.getElementById('home-screen'),
      appContainer: document.getElementById('app-container')
    };
    
    // 时间更新定时器
    this.timeUpdateInterval = null;
  }

  /**
   * 初始化应用
   */
  async init() {
    console.log('[App] Initializing...');
    
    try {
      // 初始化数据库
      await db.init();
      await db.initDefaultData();
      
      // 检查密码设置
      const savedPassword = await db.getSetting('password');
      
      if (savedPassword) {
        this.password = savedPassword;
        this.currentState = 'locked';
      } else {
        this.currentState = 'cold_start';
        // 首次启动，进入密码设置流程
        await this.showPasswordSetup();
      }
      
      // 隐藏启动画面
      setTimeout(() => {
        this.hideSplash();
      }, 2500);
      
      // 启动时间更新
      this.startTimeUpdate();
      
      // 绑定事件
      this.bindEvents();
      
      console.log('[App] Initialization complete, state:', this.currentState);
      
    } catch (error) {
      console.error('[App] Initialization failed:', error);
    }
  }

  /**
   * 隐藏启动画面
   */
  hideSplash() {
    if (this.pages.splash) {
      this.pages.splash.style.display = 'none';
    }
    
    // 根据状态显示对应页面
    if (this.currentState === 'locked' || this.password) {
      this.showLockScreen();
    } else {
      this.showHomeScreen();
    }
  }

  /**
   * 显示锁屏页面
   */
  showLockScreen() {
    if (this.pages.lock) {
      this.pages.lock.classList.remove('hidden');
    }
    this.updateLockTime();
  }

  /**
   * 显示主屏幕
   */
  showHomeScreen() {
    if (this.pages.home) {
      this.pages.home.classList.remove('hidden');
    }
    if (this.pages.lock) {
      this.pages.lock.classList.add('hidden');
    }
    this.currentState = 'unlocked';
    this.isLocked = false;
  }

  /**
   * 显示密码设置界面
   */
  async showPasswordSetup() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">设置密码</div>
          </div>
          <div class="modal-body">
            <p style="text-align: center; color: var(--text-secondary); margin-bottom: 16px;">请设置 6 位数字密码</p>
            <input type="text" id="setup-password-input" class="input" maxlength="6" placeholder="输入 6 位数字" style="text-align: center; letter-spacing: 8px; font-size: 20px;">
          </div>
          <div class="modal-footer">
            <div class="modal-btn" id="setup-confirm-btn">确定</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      const input = modal.querySelector('#setup-password-input');
      const confirmBtn = modal.querySelector('#setup-confirm-btn');
      
      // 只允许输入数字
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
      
      confirmBtn.addEventListener('click', async () => {
        const password = input.value;
        
        if (password.length !== 6) {
          this.showToast('请输入 6 位数字密码');
          return;
        }
        
        // 检查弱密码
        const weakPasswords = ['123456', '000000', '111111', '666666', '888888'];
        if (weakPasswords.includes(password)) {
          this.showToast('密码过于简单，请更换其他组合');
          return;
        }
        
        // 确认密码
        input.value = '';
        input.placeholder = '再次输入密码';
        
        confirmBtn.addEventListener('click', async () => {
          const confirmPassword = input.value;
          
          if (password !== confirmPassword) {
            this.showToast('两次输入的密码不一致');
            input.value = '';
            return;
          }
          
          // 保存密码
          await db.setSetting('password', password);
          this.password = password;
          this.currentState = 'locked';
          
          document.body.removeChild(modal);
          this.showToast('密码设置成功');
          resolve();
        }, { once: true });
      });
    });
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 锁屏键盘事件
    const keypadBtns = document.querySelectorAll('.keypad-btn');
    keypadBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = e.target.dataset.key;
        if (key === 'back') {
          this.handleBackspace();
        } else if (key) {
          this.handleNumberInput(key);
        }
      });
    });
    
    // 应用图标点击事件
    const appIcons = document.querySelectorAll('.app-icon');
    appIcons.forEach(icon => {
      icon.addEventListener('click', (e) => {
        const appName = e.currentTarget.dataset.app;
        if (appName) {
          this.openApp(appName);
        }
      });
    });
    
    // 返回按钮
    const backBtn = document.getElementById('app-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.closeApp();
      });
    }
    
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.currentState = 'background';
      } else {
        if (!this.isLocked && this.currentState === 'background') {
          this.currentState = 'unlocked';
        }
      }
    });
  }

  /**
   * 处理数字输入
   */
  async handleNumberInput(num) {
    if (this.inputPassword.length < 6) {
      this.inputPassword += num;
      this.updatePasswordDots();
      
      // 检查是否已输入 6 位
      if (this.inputPassword.length === 6) {
        await this.verifyPassword();
      }
    }
  }

  /**
   * 处理退格
   */
  handleBackspace() {
    if (this.inputPassword.length > 0) {
      this.inputPassword = this.inputPassword.slice(0, -1);
      this.updatePasswordDots();
    }
  }

  /**
   * 更新密码圆点显示
   */
  updatePasswordDots() {
    const dots = document.querySelectorAll('.password-dot');
    dots.forEach((dot, index) => {
      if (index < this.inputPassword.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  }

  /**
   * 验证密码
   */
  async verifyPassword() {
    if (this.inputPassword === this.password) {
      // 密码正确
      this.failedAttempts = 0;
      this.inputPassword = '';
      this.updatePasswordDots();
      
      // 解锁动画
      if (this.pages.lock) {
        this.pages.lock.style.transform = 'translateY(-100%)';
      }
      
      setTimeout(() => {
        this.showHomeScreen();
        if (this.pages.lock) {
          this.pages.lock.style.transform = '';
        }
      }, 300);
      
    } else {
      // 密码错误
      this.failedAttempts++;
      
      // 显示错误动画
      const dots = document.querySelectorAll('.password-dot');
      dots.forEach(dot => dot.classList.add('error'));
      
      setTimeout(() => {
        dots.forEach(dot => dot.classList.remove('error'));
      }, 400);
      
      // 清空输入
      setTimeout(() => {
        this.inputPassword = '';
        this.updatePasswordDots();
      }, 500);
      
      // 连续失败处理
      if (this.failedAttempts >= 5) {
        this.showToast('失败次数过多，请稍后再试');
        // 可以添加锁定逻辑
      } else {
        this.showToast('密码错误');
      }
    }
  }

  /**
   * 打开应用
   */
  openApp(appName) {
    console.log('[App] Opening app:', appName);
    
    const appTitleMap = {
      'chat': '微信',
      'contacts': '联系人',
      'memory': '记忆',
      'journal': '日记',
      'forum': '论坛',
      'worldbook': '世界书',
      'preset': '预设',
      'settings': '设置',
      'stickers': '表情包'
    };
    
    this.currentApp = appName;
    
    // 更新标题
    const titleEl = document.getElementById('app-title');
    if (titleEl) {
      titleEl.textContent = appTitleMap[appName] || '应用';
    }
    
    // 显示应用容器
    if (this.pages.appContainer) {
      this.pages.appContainer.classList.remove('hidden');
    }
    
    // 加载应用内容
    this.loadAppContent(appName);
  }

  /**
   * 关闭应用
   */
  closeApp() {
    console.log('[App] Closing app:', this.currentApp);
    
    if (this.pages.appContainer) {
      this.pages.appContainer.classList.add('hidden');
    }
    
    this.currentApp = null;
  }

  /**
   * 加载应用内容
   */
  async loadAppContent(appName) {
    const contentEl = document.getElementById('app-content');
    if (!contentEl) return;
    
    switch (appName) {
      case 'chat':
        await this.loadChatApp(contentEl);
        break;
      case 'contacts':
        await this.loadContactsApp(contentEl);
        break;
      case 'memory':
        await this.loadMemoryApp(contentEl);
        break;
      case 'journal':
        await this.loadJournalApp(contentEl);
        break;
      case 'forum':
        await this.loadForumApp(contentEl);
        break;
      case 'worldbook':
        await this.loadWorldBookApp(contentEl);
        break;
      case 'preset':
        await this.loadPresetApp(contentEl);
        break;
      case 'settings':
        await this.loadSettingsApp(contentEl);
        break;
      case 'stickers':
        await this.loadStickersApp(contentEl);
        break;
      default:
        contentEl.innerHTML = `
          <div class="empty-state">
            <svg class="empty-state-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
            <div class="empty-state-title">功能开发中</div>
            <div class="empty-state-desc">该功能正在开发中，敬请期待</div>
          </div>
        `;
    }
  }

  /**
   * 加载聊天应用
   */
  async loadChatApp(container) {
    const conversations = await db.getAll('conversations');
    const contacts = await db.getAll('contacts');
    const messages = await db.getAll('messages');
    
    // 构建联系人映射
    const contactMap = {};
    contacts.forEach(c => contactMap[c.id] = c);
    
    // 构建最近消息映射
    const lastMessageMap = {};
    messages.forEach(m => {
      if (!lastMessageMap[m.conversation_id] || 
          m.created_at > lastMessageMap[m.conversation_id].created_at) {
        lastMessageMap[m.conversation_id] = m;
      }
    });
    
    let html = '<div class="chat-list">';
    
    if (conversations.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无会话</div>
          <div class="empty-state-desc">点击右下角 + 新建会话</div>
        </div>
      `;
    } else {
      conversations.forEach(conv => {
        const contact = contactMap[conv.contact_id];
        const lastMsg = lastMessageMap[conv.id];
        
        html += `
          <div class="chat-item" data-conv-id="${conv.id}">
            <div class="chat-avatar">
              <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
            <div class="chat-info">
              <div class="chat-header">
                <span class="chat-name">${contact ? contact.name : '未知'}</span>
                <span class="chat-time">${lastMsg ? this.formatTime(lastMsg.created_at) : ''}</span>
              </div>
              <div class="chat-preview">${lastMsg ? lastMsg.content : '暂无消息'}</div>
            </div>
            ${conv.unread_count > 0 ? `<span class="chat-unread">${conv.unread_count}</span>` : ''}
          </div>
        `;
      });
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // 绑定会话点击事件
    container.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const convId = item.dataset.convId;
        this.openChatDetail(convId);
      });
    });
  }

  /**
   * 加载联系人应用
   */
  async loadContactsApp(container) {
    const contacts = await db.getAll('contacts');
    
    let html = '<div class="contacts-list">';
    
    contacts.forEach(contact => {
      html += `
        <div class="contact-item" data-contact-id="${contact.id}">
          <div class="contact-avatar">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <div class="contact-info">
            <div class="contact-name">${contact.name}</div>
            <div class="contact-desc">${contact.tags ? contact.tags.join(' · ') : ''}</div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * 加载设置应用
   */
  async loadSettingsApp(container) {
    const apiPresets = await db.getAll('presets');
    
    let html = `
      <div class="settings-list">
        <div class="settings-section">
          <div class="settings-section-title">通用</div>
          <div class="settings-item" id="settings-export">
            <div class="settings-icon" style="background: #07C160;">
              <svg viewBox="0 0 24 24" style="color: #fff;">
                <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </div>
            <span class="settings-label">导出数据</span>
            <span class="settings-value">
              <svg class="settings-arrow" viewBox="0 0 24 24">
                <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            </span>
          </div>
          <div class="settings-item" id="settings-import">
            <div class="settings-icon" style="background: #10AEFF;">
              <svg viewBox="0 0 24 24" style="color: #fff;">
                <path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
              </svg>
            </div>
            <span class="settings-label">导入数据</span>
            <span class="settings-value">
              <svg class="settings-arrow" viewBox="0 0 24 24">
                <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            </span>
          </div>
        </div>
        
        <div class="settings-section">
          <div class="settings-section-title">API 设置</div>
          <div class="settings-item" id="settings-api">
            <div class="settings-icon" style="background: #9C27B0;">
              <svg viewBox="0 0 24 24" style="color: #fff;">
                <path fill="currentColor" d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
              </svg>
            </div>
            <span class="settings-label">API 预设</span>
            <span class="settings-value">
              <span>${apiPresets.length > 0 ? '已配置' : '未配置'}</span>
              <svg class="settings-arrow" viewBox="0 0 24 24">
                <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            </span>
          </div>
        </div>
        
        <div class="settings-section">
          <div class="settings-section-title">关于</div>
          <div class="settings-item">
            <span class="settings-label">版本</span>
            <span class="settings-value">1.0.0</span>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // 绑定事件
    container.querySelector('#settings-export')?.addEventListener('click', () => {
      this.exportData();
    });
    
    container.querySelector('#settings-import')?.addEventListener('click', () => {
      this.importData();
    });
  }

  /**
   * 打开聊天详情
   */
  async openChatDetail(convId) {
    console.log('[App] Opening chat detail:', convId);
    
    const contentEl = document.getElementById('app-content');
    if (!contentEl) return;
    
    // 获取会话和消息数据
    const conversation = await db.get('conversations', convId);
    const messages = await db.query('messages', 'conversation_id', convId);
    const contact = conversation ? await db.get('contacts', conversation.contact_id) : null;
    
    // 排序消息
    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    let html = `<div class="chat-detail">`;
    
    // 消息列表
    html += `<div class="chat-messages" id="chat-messages-${convId}">`;
    
    if (messages.length === 0) {
      html += `
        <div class="message-time-divider">
          <span>暂无消息，开始聊天吧</span>
        </div>
      `;
    } else {
      let lastDate = null;
      
      messages.forEach(msg => {
        const msgDate = new Date(msg.created_at);
        const dateStr = msgDate.toLocaleDateString('zh-CN');
        const timeStr = `${String(msgDate.getHours()).padStart(2, '0')}:${String(msgDate.getMinutes()).padStart(2, '0')}`;
        
        // 显示日期分隔符
        if (dateStr !== lastDate) {
          html += `
            <div class="message-time-divider">
              <span>${dateStr}</span>
            </div>
          `;
          lastDate = dateStr;
        }
        
        const isSelf = msg.sender_id === 'user';
        
        html += `
          <div class="message-item ${isSelf ? 'self' : ''}">
            <div class="message-avatar">
              <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div class="message-content">
              <div class="message-bubble">${this.escapeHtml(msg.content)}</div>
              <div class="message-time">${timeStr}</div>
            </div>
          </div>
        `;
      });
    }
    
    html += `</div>`;
    
    // 输入区域
    html += `
      <div class="chat-input-area">
        <div class="chat-input-wrapper">
          <textarea class="chat-input" id="chat-input-${convId}" placeholder="发消息..." rows="1"></textarea>
        </div>
        <button class="chat-input-btn" id="chat-send-btn-${convId}">
          <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    `;
    
    html += `</div>`;
    
    contentEl.innerHTML = html;
    
    // 滚动到底部
    const messagesContainer = document.getElementById(`chat-messages-${convId}`);
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // 绑定发送事件
    const sendBtn = document.getElementById(`chat-send-btn-${convId}`);
    const input = document.getElementById(`chat-input-${convId}`);
    
    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => {
        this.sendMessage(convId, input.value);
        input.value = '';
      });
      
      // 回车发送（需要配合 shift 换行）
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }
    
    // 更新标题
    const titleEl = document.getElementById('app-title');
    if (titleEl && contact) {
      titleEl.textContent = contact.name;
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(convId, content) {
    if (!content.trim()) return;
    
    const message = {
      id: `msg_${Date.now()}`,
      conversation_id: convId,
      sender_id: 'user',
      content: content.trim(),
      type: 'text',
      status: 'sent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false
    };
    
    await db.add('messages', message);
    
    // 更新会话
    const conversation = await db.get('conversations', convId);
    if (conversation) {
      conversation.last_message_at = message.created_at;
      conversation.updated_at = message.created_at;
      await db.put('conversations', conversation);
    }
    
    // 重新加载聊天详情
    await this.openChatDetail(convId);
    
    // 模拟自动回复
    setTimeout(() => {
      this.autoReply(convId);
    }, 1000);
  }

  /**
   * 自动回复
   */
  async autoReply(convId) {
    const replies = [
      '嗯嗯，我明白了～',
      '好的，没问题！',
      '这真是一个有趣的想法！',
      '让我想想...',
      '你说得对！',
      '哈哈，太有意思了～',
      '我记下来了，谢谢告诉我！',
      '我们可以继续聊这个话题～'
    ];
    
    const randomReply = replies[Math.floor(Math.random() * replies.length)];
    
    const message = {
      id: `msg_${Date.now()}_reply`,
      conversation_id: convId,
      sender_id: 'contact',
      content: randomReply,
      type: 'text',
      status: 'sent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false
    };
    
    await db.add('messages', message);
    
    // 如果当前正在查看这个聊天，刷新显示
    const messagesContainer = document.getElementById(`chat-messages-${convId}`);
    if (messagesContainer) {
      await this.openChatDetail(convId);
    }
  }

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 加载记忆应用
   */
  async loadMemoryApp(container) {
    const memories = await db.getAll('memories');
    
    // 获取所有唯一标签用于筛选
    const allTags = new Set();
    memories.forEach(m => {
      if (m.tags && Array.isArray(m.tags)) {
        m.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    let html = `
      <div class="memory-app">
        <div class="memory-header-bar">
          <div class="memory-search-box">
            <svg class="memory-search-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input type="text" id="memory-search-input" class="memory-search-input" placeholder="搜索记忆...">
          </div>
          <button class="memory-add-btn" id="memory-add-btn">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
        
        <div class="memory-filter-tags" id="memory-filter-tags">
          <span class="memory-filter-tag active" data-tag="all">全部</span>
          ${Array.from(allTags).map(tag => `<span class="memory-filter-tag" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`).join('')}
        </div>
        
        <div class="memory-list" id="memory-list">
    `;
    
    if (memories.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无记忆</div>
          <div class="empty-state-desc">点击右上角 + 添加记忆</div>
        </div>
      `;
    } else {
      memories.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      memories.forEach(memory => {
        const priorityStars = '★'.repeat(memory.priority || 1) + '☆'.repeat(5 - (memory.priority || 1));
        const tagsHtml = memory.tags ? memory.tags.map(tag => `<span class="memory-tag">${this.escapeHtml(tag)}</span>`).join('') : '';
        
        html += `
          <div class="memory-item card" data-memory-id="${memory.id}" data-tags="${memory.tags ? memory.tags.join(',') : ''}">
            <div class="memory-header">
              <span class="memory-title">${this.escapeHtml(memory.title || '无标题')}</span>
              <span class="memory-priority" title="重要度：${memory.priority || 1}">${priorityStars}</span>
            </div>
            <div class="memory-content">${this.escapeHtml(memory.content || '')}</div>
            <div class="memory-footer">
              <div class="memory-tags">${tagsHtml}</div>
              <span class="memory-date">${new Date(memory.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
            <div class="memory-actions">
              <button class="memory-action-btn memory-edit-btn" data-id="${memory.id}">
                <svg viewBox="0 0 24 24">
                  <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </button>
              <button class="memory-action-btn memory-delete-btn" data-id="${memory.id}">
                <svg viewBox="0 0 24 24">
                  <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // 绑定事件
    this.bindMemoryEvents(container);
  }

  /**
   * 绑定记忆 App 事件
   */
  bindMemoryEvents(container) {
    // 添加按钮
    const addBtn = container.querySelector('#memory-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.showMemoryModal();
      });
    }
    
    // 搜索输入
    const searchInput = container.querySelector('#memory-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterMemoriesBySearch(e.target.value);
      });
    }
    
    // 标签筛选
    const filterTags = container.querySelectorAll('.memory-filter-tag');
    filterTags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        container.querySelectorAll('.memory-filter-tag').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.filterMemoriesByTag(e.target.dataset.tag);
      });
    });
    
    // 编辑按钮
    const editBtns = container.querySelectorAll('.memory-edit-btn');
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memoryId = e.currentTarget.dataset.id;
        this.showMemoryModal(memoryId);
      });
    });
    
    // 删除按钮
    const deleteBtns = container.querySelectorAll('.memory-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memoryId = e.currentTarget.dataset.id;
        this.deleteMemory(memoryId);
      });
    });
    
    // 点击记忆项查看详情
    const memoryItems = container.querySelectorAll('.memory-item');
    memoryItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.memory-action-btn')) {
          const memoryId = item.dataset.memoryId;
          this.viewMemoryDetail(memoryId);
        }
      });
    });
  }

  /**
   * 显示记忆编辑/新增模态框
   */
  async showMemoryModal(memoryId = null) {
    const isEdit = !!memoryId;
    let memory = null;
    
    if (isEdit) {
      memory = await db.get('memories', memoryId);
    }
    
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal memory-modal">
          <div class="modal-header">
            <div class="modal-title">${isEdit ? '编辑记忆' : '新增记忆'}</div>
          </div>
          <div class="modal-body">
            <div class="memory-form-group">
              <label class="memory-form-label">标题</label>
              <input type="text" id="memory-title-input" class="input" value="${this.escapeHtml(memory?.title || '')}" placeholder="输入记忆标题">
            </div>
            <div class="memory-form-group">
              <label class="memory-form-label">内容</label>
              <textarea id="memory-content-input" class="input memory-content-input" rows="5" placeholder="输入记忆内容">${this.escapeHtml(memory?.content || '')}</textarea>
            </div>
            <div class="memory-form-group">
              <label class="memory-form-label">标签（用逗号分隔）</label>
              <input type="text" id="memory-tags-input" class="input" value="${memory?.tags ? memory.tags.join(', ') : ''}" placeholder="例如：工作，学习，重要">
            </div>
            <div class="memory-form-group">
              <label class="memory-form-label">重要度</label>
              <div class="memory-priority-selector" id="memory-priority-selector">
                ${[1,2,3,4,5].map(p => `
                  <span class="priority-star ${p <= (memory?.priority || 1) ? 'active' : ''}" data-priority="${p}">★</span>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            ${isEdit ? `
              <div class="modal-btn danger" id="memory-delete-confirm-btn">删除</div>
            ` : ''}
            <div class="modal-btn" id="memory-cancel-btn">取消</div>
            <div class="modal-btn" id="memory-save-btn">保存</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // 星星选择重要度
      let selectedPriority = memory?.priority || 1;
      const prioritySelector = modal.querySelector('#memory-priority-selector');
      const stars = prioritySelector.querySelectorAll('.priority-star');
      
      stars.forEach(star => {
        star.addEventListener('click', () => {
          selectedPriority = parseInt(star.dataset.priority);
          stars.forEach((s, idx) => {
            s.classList.toggle('active', idx < selectedPriority);
          });
        });
      });
      
      // 取消按钮
      modal.querySelector('#memory-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      // 保存按钮
      modal.querySelector('#memory-save-btn').addEventListener('click', async () => {
        const title = modal.querySelector('#memory-title-input').value.trim();
        const content = modal.querySelector('#memory-content-input').value.trim();
        const tagsInput = modal.querySelector('#memory-tags-input').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        
        if (!content) {
          this.showToast('记忆内容不能为空');
          return;
        }
        
        const memoryData = {
          id: memory?.id || `memory_${Date.now()}`,
          title,
          content,
          tags,
          priority: selectedPriority,
          created_at: memory?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false
        };
        
        await db.put('memories', memoryData);
        document.body.removeChild(modal);
        this.showToast(isEdit ? '记忆已更新' : '记忆已添加');
        
        // 重新加载记忆列表
        const appContent = document.getElementById('app-content');
        if (appContent) {
          await this.loadMemoryApp(appContent);
        }
        resolve(true);
      });
      
      // 删除按钮（编辑模式下）
      if (isEdit) {
        modal.querySelector('#memory-delete-confirm-btn').addEventListener('click', async () => {
          await this.deleteMemory(memoryId);
          document.body.removeChild(modal);
          resolve(true);
        });
      }
    });
  }

  /**
   * 删除记忆
   */
  async deleteMemory(memoryId) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">确认删除</div>
          </div>
          <div class="modal-body">
            <p style="text-align: center;">确定要删除这条记忆吗？</p>
          </div>
          <div class="modal-footer">
            <div class="modal-btn" id="memory-delete-cancel-btn">取消</div>
            <div class="modal-btn danger" id="memory-delete-ok-btn">删除</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('#memory-delete-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      modal.querySelector('#memory-delete-ok-btn').addEventListener('click', async () => {
        await db.delete('memories', memoryId);
        document.body.removeChild(modal);
        this.showToast('记忆已删除');
        
        // 重新加载记忆列表
        const appContent = document.getElementById('app-content');
        if (appContent) {
          await this.loadMemoryApp(appContent);
        }
        resolve(true);
      });
    });
  }

  /**
   * 查看记忆详情
   */
  async viewMemoryDetail(memoryId) {
    const memory = await db.get('memories', memoryId);
    if (!memory) return;
    
    const container = document.getElementById('app-content');
    if (!container) return;
    
    const priorityStars = '★'.repeat(memory.priority || 1) + '☆'.repeat(5 - (memory.priority || 1));
    
    container.innerHTML = `
      <div class="memory-detail">
        <div class="memory-detail-header">
          <h2 class="memory-detail-title">${this.escapeHtml(memory.title || '无标题')}</h2>
          <span class="memory-detail-priority">${priorityStars}</span>
        </div>
        <div class="memory-detail-content">${this.escapeHtml(memory.content || '')}</div>
        <div class="memory-detail-footer">
          <div class="memory-detail-tags">
            ${memory.tags ? memory.tags.map(tag => `<span class="memory-tag">${this.escapeHtml(tag)}</span>`).join('') : ''}
          </div>
          <span class="memory-detail-date">创建于：${new Date(memory.created_at).toLocaleString('zh-CN')}</span>
          ${memory.updated_at !== memory.created_at ? `<span class="memory-detail-date">更新于：${new Date(memory.updated_at).toLocaleString('zh-CN')}</span>` : ''}
        </div>
        <div class="memory-detail-actions">
          <button class="btn btn-secondary" id="memory-detail-edit-btn">编辑</button>
          <button class="btn btn-primary" id="memory-detail-back-btn">返回</button>
        </div>
      </div>
    `;
    
    // 绑定事件
    container.querySelector('#memory-detail-back-btn').addEventListener('click', () => {
      const appContent = document.getElementById('app-content');
      if (appContent) {
        this.loadMemoryApp(appContent);
      }
    });
    
    container.querySelector('#memory-detail-edit-btn').addEventListener('click', () => {
      this.showMemoryModal(memoryId);
    });
  }

  /**
   * 按搜索过滤记忆
   */
  filterMemoriesBySearch(query) {
    const list = document.getElementById('memory-list');
    if (!list) return;
    
    const items = list.querySelectorAll('.memory-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
      const title = item.querySelector('.memory-title')?.textContent.toLowerCase() || '';
      const content = item.querySelector('.memory-content')?.textContent.toLowerCase() || '';
      const tags = item.dataset.tags || '';
      
      const match = title.includes(lowerQuery) || content.includes(lowerQuery) || tags.toLowerCase().includes(lowerQuery);
      item.style.display = match ? '' : 'none';
    });
  }

  /**
   * 按标签过滤记忆
   */
  filterMemoriesByTag(tag) {
    const list = document.getElementById('memory-list');
    if (!list) return;
    
    const items = list.querySelectorAll('.memory-item');
    
    items.forEach(item => {
      if (tag === 'all') {
        item.style.display = '';
      } else {
        const itemTags = item.dataset.tags || '';
        const match = itemTags.split(',').includes(tag);
        item.style.display = match ? '' : 'none';
      }
    });
  }

  /**
   * 加载日记应用
   */
  async loadJournalApp(container) {
    const journals = await db.getAll('journals');
    
    // 按月份分组
    const journalsByMonth = {};
    journals.forEach(j => {
      const monthKey = new Date(j.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
      if (!journalsByMonth[monthKey]) {
        journalsByMonth[monthKey] = [];
      }
      journalsByMonth[monthKey].push(j);
    });
    
    let html = `
      <div class="journal-app">
        <div class="journal-header-bar">
          <div class="journal-search-box">
            <svg class="journal-search-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input type="text" id="journal-search-input" class="journal-search-input" placeholder="搜索日记...">
          </div>
          <button class="journal-add-btn" id="journal-add-btn">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
        
        <div class="journal-filter-moods" id="journal-filter-moods">
          <span class="journal-filter-mood active" data-mood="all">全部</span>
          <span class="journal-filter-mood" data-mood="😊">😊</span>
          <span class="journal-filter-mood" data-mood="😐">😐</span>
          <span class="journal-filter-mood" data-mood="😔">😔</span>
          <span class="journal-filter-mood" data-mood="😠">😠</span>
          <span class="journal-filter-mood" data-mood="😴">😴</span>
        </div>
        
        <div class="journal-list" id="journal-list">
    `;
    
    if (journals.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无日记</div>
          <div class="empty-state-desc">点击右上角 + 开始记录生活</div>
        </div>
      `;
    } else {
      // 按月份排序
      const sortedMonths = Object.keys(journalsByMonth).sort((a, b) => {
        return new Date(journalsByMonth[b][0].date) - new Date(journalsByMonth[a][0].date);
      });
      
      sortedMonths.forEach(month => {
        html += `<div class="journal-month-group"><div class="journal-month-title">${month}</div>`;
        
        const monthJournals = journalsByMonth[month].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        monthJournals.forEach(journal => {
          html += `
            <div class="journal-item card" data-journal-id="${journal.id}" data-mood="${journal.mood || ''}" data-content="${this.escapeHtml(journal.content || '')}">
              <div class="journal-header">
                <span class="journal-date">${new Date(journal.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
                <span class="journal-mood">${journal.mood || '😊'}</span>
              </div>
              <div class="journal-preview">${this.escapeHtml(journal.content?.substring(0, 80) || '')}${journal.content?.length > 80 ? '...' : ''}</div>
              <div class="journal-footer">
                <span class="journal-words">${journal.content?.length || 0} 字</span>
                ${journal.tags && journal.tags.length > 0 ? `<span class="journal-tags-preview">${journal.tags.slice(0, 3).map(t => `#${this.escapeHtml(t)}`).join(' ')}</span>` : ''}
              </div>
              <div class="journal-actions">
                <button class="journal-action-btn journal-edit-btn" data-id="${journal.id}">
                  <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="journal-action-btn journal-delete-btn" data-id="${journal.id}">
                  <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
          `;
        });
        
        html += `</div>`;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // 绑定事件
    this.bindJournalEvents(container);
  }

  /**
   * 绑定日记 App 事件
   */
  bindJournalEvents(container) {
    // 添加按钮
    const addBtn = container.querySelector('#journal-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.showJournalModal();
      });
    }
    
    // 搜索输入
    const searchInput = container.querySelector('#journal-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterJournalsBySearch(e.target.value);
      });
    }
    
    // 情绪筛选
    const filterMoods = container.querySelectorAll('.journal-filter-mood');
    filterMoods.forEach(mood => {
      mood.addEventListener('click', (e) => {
        container.querySelectorAll('.journal-filter-mood').forEach(m => m.classList.remove('active'));
        e.target.classList.add('active');
        this.filterJournalsByMood(e.target.dataset.mood);
      });
    });
    
    // 编辑按钮
    const editBtns = container.querySelectorAll('.journal-edit-btn');
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const journalId = e.currentTarget.dataset.id;
        this.showJournalModal(journalId);
      });
    });
    
    // 删除按钮
    const deleteBtns = container.querySelectorAll('.journal-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const journalId = e.currentTarget.dataset.id;
        this.deleteJournal(journalId);
      });
    });
    
    // 点击日记项查看详情
    const journalItems = container.querySelectorAll('.journal-item');
    journalItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.journal-action-btn')) {
          const journalId = item.dataset.journalId;
          this.viewJournalDetail(journalId);
        }
      });
    });
  }

  /**
   * 显示日记编辑/新增模态框
   */
  async showJournalModal(journalId = null) {
    const isEdit = !!journalId;
    let journal = null;
    
    if (isEdit) {
      journal = await db.get('journals', journalId);
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay journal-modal-overlay';
      modal.innerHTML = `
        <div class="modal journal-modal">
          <div class="modal-header">
            <div class="modal-title">${isEdit ? '编辑日记' : '写日记'}</div>
          </div>
          <div class="modal-body">
            <div class="journal-form-group">
              <label class="journal-form-label">日期</label>
              <input type="date" id="journal-date-input" class="input" value="${journal?.date || today}">
            </div>
            <div class="journal-form-group">
              <label class="journal-form-label">今天的心情</label>
              <div class="journal-mood-selector" id="journal-mood-selector">
                ${['😊','😐','😔','😠','😴','🤒','😍','🤔'].map(mood => `
                  <span class="mood-option ${journal?.mood === mood ? 'active' : ''}" data-mood="${mood}">${mood}</span>
                `).join('')}
              </div>
            </div>
            <div class="journal-form-group">
              <label class="journal-form-label">内容</label>
              <textarea id="journal-content-input" class="input journal-content-input" rows="8" placeholder="今天发生了什么...">${this.escapeHtml(journal?.content || '')}</textarea>
            </div>
            <div class="journal-form-group">
              <label class="journal-form-label">标签（用逗号分隔）</label>
              <input type="text" id="journal-tags-input" class="input" value="${journal?.tags ? journal.tags.join(', ') : ''}" placeholder="例如：工作，生活，感悟">
            </div>
          </div>
          <div class="modal-footer">
            ${isEdit ? `
              <div class="modal-btn danger" id="journal-delete-confirm-btn">删除</div>
            ` : ''}
            <div class="modal-btn" id="journal-cancel-btn">取消</div>
            <div class="modal-btn" id="journal-save-btn">保存</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // 心情选择
      let selectedMood = journal?.mood || '😊';
      const moodSelector = modal.querySelector('#journal-mood-selector');
      const moodOptions = moodSelector.querySelectorAll('.mood-option');
      
      moodOptions.forEach(option => {
        option.addEventListener('click', () => {
          selectedMood = option.dataset.mood;
          moodOptions.forEach(o => o.classList.remove('active'));
          option.classList.add('active');
        });
      });
      
      // 取消按钮
      modal.querySelector('#journal-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      // 保存按钮
      modal.querySelector('#journal-save-btn').addEventListener('click', async () => {
        const date = modal.querySelector('#journal-date-input').value;
        const content = modal.querySelector('#journal-content-input').value.trim();
        const tagsInput = modal.querySelector('#journal-tags-input').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        
        if (!content) {
          this.showToast('日记内容不能为空');
          return;
        }
        
        if (!date) {
          this.showToast('请选择日期');
          return;
        }
        
        const journalData = {
          id: journal?.id || `journal_${Date.now()}`,
          date,
          content,
          mood: selectedMood,
          tags,
          created_at: journal?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false
        };
        
        await db.put('journals', journalData);
        document.body.removeChild(modal);
        this.showToast(isEdit ? '日记已更新' : '日记已保存');
        
        // 重新加载日记列表
        const appContent = document.getElementById('app-content');
        if (appContent) {
          await this.loadJournalApp(appContent);
        }
        resolve(true);
      });
      
      // 删除按钮（编辑模式下）
      if (isEdit) {
        modal.querySelector('#journal-delete-confirm-btn').addEventListener('click', async () => {
          await this.deleteJournal(journalId);
          document.body.removeChild(modal);
          resolve(true);
        });
      }
    });
  }

  /**
   * 删除日记
   */
  async deleteJournal(journalId) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">确认删除</div>
          </div>
          <div class="modal-body">
            <p style="text-align: center;">确定要删除这篇日记吗？</p>
          </div>
          <div class="modal-footer">
            <div class="modal-btn" id="journal-delete-cancel-btn">取消</div>
            <div class="modal-btn danger" id="journal-delete-ok-btn">删除</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('#journal-delete-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      modal.querySelector('#journal-delete-ok-btn').addEventListener('click', async () => {
        await db.delete('journals', journalId);
        document.body.removeChild(modal);
        this.showToast('日记已删除');
        
        // 重新加载日记列表
        const appContent = document.getElementById('app-content');
        if (appContent) {
          await this.loadJournalApp(appContent);
        }
        resolve(true);
      });
    });
  }

  /**
   * 查看日记详情
   */
  async viewJournalDetail(journalId) {
    const journal = await db.get('journals', journalId);
    if (!journal) return;
    
    const container = document.getElementById('app-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="journal-detail">
        <div class="journal-detail-header">
          <div class="journal-detail-date">
            ${new Date(journal.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
          <span class="journal-detail-mood">${journal.mood || '😊'}</span>
        </div>
        <div class="journal-detail-content">${this.escapeHtml(journal.content || '')}</div>
        <div class="journal-detail-footer">
          ${journal.tags && journal.tags.length > 0 ? `
            <div class="journal-detail-tags">
              ${journal.tags.map(tag => `<span class="journal-tag">#${this.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          <span class="journal-detail-meta">
            ${journal.content?.length || 0} 字 · 创建于 ${new Date(journal.created_at).toLocaleString('zh-CN')}
          </span>
        </div>
        <div class="journal-detail-actions">
          <button class="btn btn-secondary" id="journal-detail-edit-btn">编辑</button>
          <button class="btn btn-primary" id="journal-detail-back-btn">返回</button>
        </div>
      </div>
    `;
    
    // 绑定事件
    container.querySelector('#journal-detail-back-btn').addEventListener('click', () => {
      const appContent = document.getElementById('app-content');
      if (appContent) {
        this.loadJournalApp(appContent);
      }
    });
    
    container.querySelector('#journal-detail-edit-btn').addEventListener('click', () => {
      this.showJournalModal(journalId);
    });
  }

  /**
   * 按搜索过滤日记
   */
  filterJournalsBySearch(query) {
    const list = document.getElementById('journal-list');
    if (!list) return;
    
    const items = list.querySelectorAll('.journal-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
      const content = item.dataset.content || '';
      const tags = item.querySelector('.journal-tags-preview')?.textContent.toLowerCase() || '';
      
      const match = content.toLowerCase().includes(lowerQuery) || tags.includes(lowerQuery);
      item.style.display = match ? '' : 'none';
    });
  }

  /**
   * 按情绪过滤日记
   */
  filterJournalsByMood(mood) {
    const list = document.getElementById('journal-list');
    if (!list) return;
    
    const items = list.querySelectorAll('.journal-item');
    
    items.forEach(item => {
      if (mood === 'all') {
        item.style.display = '';
      } else {
        const itemMood = item.dataset.mood || '';
        item.style.display = itemMood === mood ? '' : 'none';
      }
    });
  }

  /**
   * 加载论坛应用
   */
  async loadForumApp(container) {
    const forums = await db.getAll('forums');
    
    // 获取所有唯一标签
    const allTags = new Set();
    forums.forEach(f => {
      if (f.tags && Array.isArray(f.tags)) {
        f.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    let html = `
      <div class="forum-app">
        <div class="forum-header-bar">
          <div class="forum-search-box">
            <svg class="forum-search-icon" viewBox="0 0 24 24">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input type="text" id="forum-search-input" class="forum-search-input" placeholder="搜索帖子...">
          </div>
          <button class="forum-add-btn" id="forum-add-btn">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
        
        <div class="forum-filter-tags" id="forum-filter-tags">
          <span class="forum-filter-tag active" data-tag="all">全部</span>
          <span class="forum-filter-tag" data-tag="hot">🔥 热门</span>
          ${Array.from(allTags).map(tag => `<span class="forum-filter-tag" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`).join('')}
        </div>
        
        <div class="forum-list" id="forum-list">
    `;
    
    if (forums.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无帖子</div>
          <div class="empty-state-desc">点击右上角 + 发布第一个帖子</div>
        </div>
      `;
    } else {
      forums.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      forums.forEach(post => {
        const tagsHtml = post.tags ? post.tags.map(tag => `<span class="forum-tag-item">${this.escapeHtml(tag)}</span>`).join('') : '';
        
        html += `
          <div class="forum-item card" data-forum-id="${post.id}" data-tags="${post.tags ? post.tags.join(',') : ''}" data-likes="${post.likes || 0}">
            <div class="forum-item-header">
              <div class="forum-item-title">${this.escapeHtml(post.title || '无标题')}</div>
              <div class="forum-item-actions">
                <button class="forum-action-btn forum-edit-btn" data-id="${post.id}">
                  <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="forum-action-btn forum-delete-btn" data-id="${post.id}">
                  <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="forum-tags">${tagsHtml}</div>
            <div class="forum-preview">${this.escapeHtml(post.content?.substring(0, 80) || '')}${post.content?.length > 80 ? '...' : ''}</div>
            <div class="forum-footer">
              <span class="forum-author">👤 ${this.escapeHtml(post.author || '匿名')}</span>
              <span class="forum-stats">
                <span class="forum-like-btn" data-id="${post.id}">👍 ${post.likes || 0}</span>
                <span>💬 ${post.comments || 0}</span>
              </span>
            </div>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // 绑定事件
    this.bindForumEvents(container);
  }

  /**
   * 绑定论坛 App 事件
   */
  bindForumEvents(container) {
    // 添加按钮
    const addBtn = container.querySelector('#forum-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.showForumModal();
      });
    }
    
    // 搜索输入
    const searchInput = container.querySelector('#forum-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterForumsBySearch(e.target.value);
      });
    }
    
    // 标签筛选
    const filterTags = container.querySelectorAll('.forum-filter-tag');
    filterTags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        container.querySelectorAll('.forum-filter-tag').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.filterForumsByTag(e.target.dataset.tag);
      });
    });
    
    // 编辑按钮
    const editBtns = container.querySelectorAll('.forum-edit-btn');
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const forumId = e.currentTarget.dataset.id;
        this.showForumModal(forumId);
      });
    });
    
    // 删除按钮
    const deleteBtns = container.querySelectorAll('.forum-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const forumId = e.currentTarget.dataset.id;
        this.deleteForum(forumId);
      });
    });
    
    // 点赞按钮
    const likeBtns = container.querySelectorAll('.forum-like-btn');
    likeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const forumId = e.currentTarget.dataset.id;
        this.likeForum(forumId);
      });
    });
    
    // 点击帖子项查看详情
    const forumItems = container.querySelectorAll('.forum-item');
    forumItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.forum-action-btn') && !e.target.closest('.forum-like-btn')) {
          const forumId = item.dataset.forumId;
          this.viewForumDetail(forumId);
        }
      });
    });
  }

  /**
   * 显示论坛编辑/新增模态框
   */
  async showForumModal(forumId = null) {
    const isEdit = !!forumId;
    let forum = null;
    
    if (isEdit) {
      forum = await db.get('forums', forumId);
    }
    
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay forum-modal-overlay';
      modal.innerHTML = `
        <div class="modal forum-modal">
          <div class="modal-header">
            <div class="modal-title">${isEdit ? '编辑帖子' : '发布帖子'}</div>
          </div>
          <div class="modal-body">
            <div class="forum-form-group">
              <label class="forum-form-label">标题</label>
              <input type="text" id="forum-title-input" class="input" value="${this.escapeHtml(forum?.title || '')}" placeholder="输入帖子标题" maxlength="50">
            </div>
            <div class="forum-form-group">
              <label class="forum-form-label">作者</label>
              <input type="text" id="forum-author-input" class="input" value="${this.escapeHtml(forum?.author || '我')}" placeholder="输入作者名" maxlength="20">
            </div>
            <div class="forum-form-group">
              <label class="forum-form-label">标签（用逗号分隔）</label>
              <input type="text" id="forum-tags-input" class="input" value="${forum?.tags ? forum.tags.join(', ') : ''}" placeholder="例如：讨论，分享，求助">
            </div>
            <div class="forum-form-group">
              <label class="forum-form-label">内容</label>
              <textarea id="forum-content-input" class="input forum-content-input" rows="6" placeholder="输入帖子内容...">${this.escapeHtml(forum?.content || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            ${isEdit ? `
              <div class="modal-btn danger" id="forum-delete-confirm-btn">删除</div>
            ` : ''}
            <div class="modal-btn" id="forum-cancel-btn">取消</div>
            <div class="modal-btn" id="forum-save-btn">保存</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // 取消按钮
      modal.querySelector('#forum-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      // 保存按钮
      modal.querySelector('#forum-save-btn').addEventListener('click', async () => {
        const title = modal.querySelector('#forum-title-input').value.trim();
        const author = modal.querySelector('#forum-author-input').value.trim();
        const tagsInput = modal.querySelector('#forum-tags-input').value.trim();
        const content = modal.querySelector('#forum-content-input').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        
        if (!title) {
          this.showToast('标题不能为空');
          return;
        }
        
        if (!content) {
          this.showToast('内容不能为空');
          return;
        }
        
        const forumData = {
          id: forum?.id || `forum_${Date.now()}`,
          title,
          author: author || '匿名',
          content,
          tags,
          likes: forum?.likes || 0,
          comments: forum?.comments || 0,
          created_at: forum?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false
        };
        
        await db.put('forums', forumData);
        document.body.removeChild(modal);
        this.showToast(isEdit ? '帖子已更新' : '帖子已发布');
        
        // 重新加载论坛列表
        const appContent = document.getElementById('app-content');
        if (appContent) {
          await this.loadForumApp(appContent);
        }
        resolve(true);
      });
      
      // 删除按钮（编辑模式下）
      if (isEdit) {
        modal.querySelector('#forum-delete-confirm-btn').addEventListener('click', async () => {
          await this.deleteForum(forumId);
          document.body.removeChild(modal);
          resolve(true);
        });
      }
    });
  }

  /**
   * 删除论坛帖子
   */
  async deleteForum(forumId) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">确认删除</div>
          </div>
          <div class="modal-body">
            <p style="text-align: center;">确定要删除这个帖子吗？</p>
          </div>
          <div class="modal-footer">
            <div class="modal-btn" id="forum-delete-cancel-btn">取消</div>
            <div class="modal-btn danger" id="forum-delete-ok-btn">删除</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('#forum-delete-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      modal.querySelector('#forum-delete-ok-btn').addEventListener('click', async () => {
        await db.delete('forums', forumId);
        document.body.removeChild(modal);
        this.showToast('帖子已删除');
        
        // 重新加载论坛列表
        const appContent = document.getElementById('app-content');
        if (appContent) {
          await this.loadForumApp(appContent);
        }
        resolve(true);
      });
    });
  }

  /**
   * 点赞论坛帖子
   */
  async likeForum(forumId) {
    const forum = await db.get('forums', forumId);
    if (!forum) return;
    
    forum.likes = (forum.likes || 0) + 1;
    forum.updated_at = new Date().toISOString();
    await db.put('forums', forum);
    
    this.showToast('已点赞');
    
    // 重新加载论坛列表
    const appContent = document.getElementById('app-content');
    if (appContent) {
      await this.loadForumApp(appContent);
    }
  }

  /**
   * 查看论坛帖子详情
   */
  async viewForumDetail(forumId) {
    const forum = await db.get('forums', forumId);
    if (!forum) return;
    
    const container = document.getElementById('app-content');
    if (!container) return;
    
    const tagsHtml = forum.tags ? forum.tags.map(tag => `<span class="forum-tag">${this.escapeHtml(tag)}</span>`).join('') : '';
    
    container.innerHTML = `
      <div class="forum-detail">
        <div class="forum-detail-header">
          <h2 class="forum-detail-title">${this.escapeHtml(forum.title || '无标题')}</h2>
          <div class="forum-detail-meta">
            <span class="forum-detail-author">👤 ${this.escapeHtml(forum.author || '匿名')}</span>
            <span class="forum-detail-date">📅 ${new Date(forum.created_at).toLocaleString('zh-CN')}</span>
          </div>
        </div>
        ${tagsHtml ? `<div class="forum-detail-tags">${tagsHtml}</div>` : ''}
        <div class="forum-detail-content">${this.escapeHtml(forum.content || '')}</div>
        <div class="forum-detail-footer">
          <span class="forum-detail-stats">👍 ${forum.likes || 0} · 💬 ${forum.comments || 0}</span>
        </div>
        <div class="forum-detail-actions">
          <button class="btn btn-secondary" id="forum-detail-edit-btn">编辑</button>
          <button class="btn btn-primary" id="forum-detail-back-btn">返回</button>
        </div>
      </div>
    `;
    
    // 绑定事件
    container.querySelector('#forum-detail-back-btn').addEventListener('click', () => {
      const appContent = document.getElementById('app-content');
      if (appContent) {
        this.loadForumApp(appContent);
      }
    });
    
    container.querySelector('#forum-detail-edit-btn').addEventListener('click', () => {
      this.showForumModal(forumId);
    });
  }

  /**
   * 按搜索过滤论坛
   */
  filterForumsBySearch(query) {
    const list = document.getElementById('forum-list');
    if (!list) return;
    
    const items = list.querySelectorAll('.forum-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
      const title = item.querySelector('.forum-item-title')?.textContent.toLowerCase() || '';
      const preview = item.querySelector('.forum-preview')?.textContent.toLowerCase() || '';
      const author = item.querySelector('.forum-author')?.textContent.toLowerCase() || '';
      
      const match = title.includes(lowerQuery) || preview.includes(lowerQuery) || author.includes(lowerQuery);
      item.style.display = match ? '' : 'none';
    });
  }

  /**
   * 按标签过滤论坛
   */
  filterForumsByTag(tag) {
    const list = document.getElementById('forum-list');
    if (!list) return;
    
    const items = list.querySelectorAll('.forum-item');
    
    items.forEach(item => {
      if (tag === 'all') {
        item.style.display = '';
      } else if (tag === 'hot') {
        // 热门：点赞数大于等于 5
        const likes = parseInt(item.dataset.likes) || 0;
        item.style.display = likes >= 5 ? '' : 'none';
      } else {
        const itemTags = item.dataset.tags || '';
        const match = itemTags.split(',').includes(tag);
        item.style.display = match ? '' : 'none';
      }
    });
  }

  /**
   * 加载世界书应用
   */
  async loadWorldBookApp(container) {
    const worldbook = await db.getAll('worldbook');
    
    let html = `
      <div class="worldbook-app">
        <div class="worldbook-list">
    `;
    
    if (worldbook.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无世界书条目</div>
          <div class="empty-state-desc">创建你的世界观吧</div>
        </div>
      `;
    } else {
      worldbook.forEach(item => {
        const typeIcon = item.type === 'character' ? '👤' : item.type === 'location' ? '📍' : '📖';
        html += `
          <div class="worldbook-item card">
            <div class="worldbook-header">
              <span class="worldbook-type">${typeIcon}</span>
              <span class="worldbook-title">${this.escapeHtml(item.name || '无标题')}</span>
            </div>
            <div class="worldbook-preview">${this.escapeHtml(item.description?.substring(0, 80) || '')}${item.description?.length > 80 ? '...' : ''}</div>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  /**
   * 加载预设应用
   */
  async loadPresetApp(container) {
    const presets = await db.getAll('presets');
    
    let html = `
      <div class="preset-app">
        <div class="preset-list">
    `;
    
    if (presets.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无预设</div>
          <div class="empty-state-desc">创建你的第一个预设吧</div>
        </div>
      `;
    } else {
      presets.forEach(preset => {
        html += `
          <div class="preset-item card">
            <div class="preset-title">${this.escapeHtml(preset.name || '无标题')}</div>
            <div class="preset-preview">${this.escapeHtml(preset.content?.substring(0, 60) || '')}${preset.content?.length > 60 ? '...' : ''}</div>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  /**
   * 加载表情包应用
   */
  async loadStickersApp(container) {
    const stickers = await db.getAll('stickers');
    
    let html = `
      <div class="stickers-app">
        <div class="stickers-grid">
    `;
    
    if (stickers.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无表情包</div>
          <div class="empty-state-desc">添加你的第一个表情包吧</div>
        </div>
      `;
    } else {
      stickers.forEach(sticker => {
        html += `
          <div class="sticker-item">
            <div class="sticker-preview">${sticker.emoji || '😊'}</div>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  /**
   * 导出数据
   */
  async exportData() {
    try {
      const data = await db.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xiaoshouji_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('导出成功');
    } catch (error) {
      console.error('[App] Export failed:', error);
      this.showToast('导出失败');
    }
  }

  /**
   * 导入数据
   */
  async importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await db.importData(data);
        this.showToast('导入成功');
        // 重新加载当前应用
        if (this.currentApp) {
          this.loadAppContent(this.currentApp);
        }
      } catch (error) {
        console.error('[App] Import failed:', error);
        this.showToast('导入失败：文件格式错误');
      }
    });
    
    input.click();
  }

  /**
   * 启动时间更新
   */
  startTimeUpdate() {
    this.updateTime();
    this.timeUpdateInterval = setInterval(() => {
      this.updateTime();
    }, 1000);
  }

  /**
   * 更新时间显示
   */
  updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    // 状态栏时间
    const statusTime = document.getElementById('status-time');
    if (statusTime) {
      statusTime.textContent = timeStr;
    }
    
    // 锁屏时间
    const lockTime = document.getElementById('lock-clock-time');
    if (lockTime) {
      lockTime.textContent = timeStr;
    }
    
    // 小组件时间
    const widgetTime = document.getElementById('widget-time');
    if (widgetTime) {
      widgetTime.textContent = timeStr;
    }
    
    // 日期
    const dateOptions = { month: 'long', day: 'numeric', weekday: 'long' };
    const dateStr = now.toLocaleDateString('zh-CN', dateOptions);
    
    const lockDate = document.getElementById('lock-clock-date');
    if (lockDate) {
      lockDate.textContent = dateStr;
    }
    
    const widgetDate = document.getElementById('widget-date');
    if (widgetDate) {
      widgetDate.textContent = dateStr.replace('星期', '');
    }
  }

  /**
   * 更新锁屏时间
   */
  updateLockTime() {
    this.updateTime();
  }

  /**
   * 显示 Toast 提示
   */
  showToast(message, duration = 2000) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  /**
   * 格式化时间
   */
  formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    // 今天
    if (diff < 24 * 60 * 60 * 1000) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    
    // 昨天
    if (diff < 48 * 60 * 60 * 1000) {
      return '昨天';
    }
    
    // 本周
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[date.getDay()];
    }
    
    // 其他
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

// 初始化应用
const app = new App();
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
