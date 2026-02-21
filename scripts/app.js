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
    
    let html = `
      <div class="memory-app">
        <div class="memory-list">
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
        html += `
          <div class="memory-item card">
            <div class="memory-header">
              <span class="memory-title">${this.escapeHtml(memory.title || '无标题')}</span>
              <span class="memory-priority">${priorityStars}</span>
            </div>
            <div class="memory-content">${this.escapeHtml(memory.content || '')}</div>
            <div class="memory-footer">
              ${memory.tags ? memory.tags.map(tag => `<span class="memory-tag">${this.escapeHtml(tag)}</span>`).join('') : ''}
              <span class="memory-date">${new Date(memory.created_at).toLocaleDateString('zh-CN')}</span>
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
  }

  /**
   * 加载日记应用
   */
  async loadJournalApp(container) {
    const journals = await db.getAll('journals');
    
    let html = `
      <div class="journal-app">
        <div class="journal-list">
    `;
    
    if (journals.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无日记</div>
          <div class="empty-state-desc">开始记录你的生活吧</div>
        </div>
      `;
    } else {
      journals.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      journals.forEach(journal => {
        html += `
          <div class="journal-item card">
            <div class="journal-header">
              <span class="journal-date">${new Date(journal.date).toLocaleDateString('zh-CN')}</span>
              <span class="journal-mood">${journal.mood || '😊'}</span>
            </div>
            <div class="journal-preview">${this.escapeHtml(journal.content?.substring(0, 100) || '')}${journal.content?.length > 100 ? '...' : ''}</div>
            <div class="journal-footer">
              <span class="journal-words">${journal.content?.length || 0} 字</span>
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
  }

  /**
   * 加载论坛应用
   */
  async loadForumApp(container) {
    const forums = await db.getAll('forums');
    
    let html = `
      <div class="forum-app">
        <div class="forum-list">
    `;
    
    if (forums.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-title">暂无帖子</div>
          <div class="empty-state-desc">发布第一个帖子吧</div>
        </div>
      `;
    } else {
      forums.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      forums.forEach(post => {
        html += `
          <div class="forum-item card">
            <div class="forum-title">${this.escapeHtml(post.title || '无标题')}</div>
            <div class="forum-preview">${this.escapeHtml(post.content?.substring(0, 50) || '')}${post.content?.length > 50 ? '...' : ''}</div>
            <div class="forum-footer">
              <span class="forum-author">${this.escapeHtml(post.author || '匿名')}</span>
              <span class="forum-stats">👍 ${post.likes || 0} 💬 ${post.comments || 0}</span>
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
