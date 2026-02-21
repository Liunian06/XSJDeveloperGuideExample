/**
 * 小手机 IndexedDB 数据库模块
 * 封装数据库操作，提供统一的 CRUD 接口
 */

class Database {
  constructor() {
    this.dbName = 'XiaoShouJiDB';
    this.dbVersion = 1;
    this.db = null;
    this.stores = [
      'settings',
      'contacts',
      'conversations',
      'messages',
      'groups',
      'moments',
      'memories',
      'journals',
      'forums',
      'worldbook',
      'presets',
      'stickers'
    ];
  }

  /**
   * 初始化数据库
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[Database] Open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Database] Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[Database] Creating object stores...');

        // 创建所有对象仓库
        this.stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: false });
            
            // 为常用字段创建索引
            store.createIndex('created_at', 'created_at', { unique: false });
            store.createIndex('updated_at', 'updated_at', { unique: false });
            
            // 为特定仓库创建额外索引
            if (storeName === 'contacts') {
              store.createIndex('name', 'name', { unique: false });
              store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            } else if (storeName === 'conversations') {
              store.createIndex('last_message_at', 'last_message_at', { unique: false });
              store.createIndex('type', 'type', { unique: false });
            } else if (storeName === 'messages') {
              store.createIndex('conversation_id', 'conversation_id', { unique: false });
              store.createIndex('status', 'status', { unique: false });
            } else if (storeName === 'memories') {
              store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
              store.createIndex('priority', 'priority', { unique: false });
            } else if (storeName === 'journals') {
              store.createIndex('date', 'date', { unique: false });
              store.createIndex('mood', 'mood', { unique: false });
            }
          }
        });

        console.log('[Database] Object stores created');
      };
    });
  }

  /**
   * 通用 CRUD 操作
   */

  // 添加记录
  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 获取记录
  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 获取所有记录
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 更新记录
  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 删除记录
  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 查询（使用索引）
  async query(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 清空仓库
  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 设置相关操作
   */
  async getSetting(key) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : null;
  }

  async setSetting(key, value) {
    await this.put('settings', { id: key, value, updated_at: new Date().toISOString() });
  }

  /**
   * 数据库导入导出
   */
  async exportData() {
    const exportData = {
      version: this.dbVersion,
      exportTime: new Date().toISOString(),
      data: {}
    };

    for (const storeName of this.stores) {
      exportData.data[storeName] = await this.getAll(storeName);
    }

    return exportData;
  }

  async importData(data) {
    if (!data || !data.data) {
      throw new Error('Invalid import data format');
    }

    for (const [storeName, records] of Object.entries(data.data)) {
      if (this.stores.includes(storeName) && Array.isArray(records)) {
        for (const record of records) {
          await this.put(storeName, record);
        }
      }
    }
  }

  /**
   * 初始化默认数据
   */
  async initDefaultData() {
    // 检查是否已有数据
    const contacts = await this.getAll('contacts');
    if (contacts.length > 0) {
      return; // 已有数据，跳过初始化
    }

    console.log('[Database] Initializing default data...');

    // 默认联系人
    const defaultContacts = [
      {
        id: 'contact_001',
        name: '小助手',
        avatar_blob: null,
        avatar_mime: null,
        avatar_updated_at: null,
        persona: '你是一个贴心的 AI 助手，总是能给出温暖的建议。',
        user_persona: '用户是你的朋友，正在学习如何使用小手机。',
        tags: ['助手', 'AI'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
      },
      {
        id: 'contact_002',
        name: '树洞',
        avatar_blob: null,
        avatar_mime: null,
        avatar_updated_at: null,
        persona: '你是一个安静的倾听者，不会评判，只会理解和陪伴。',
        user_persona: '用户需要倾诉，希望你能安静地听他说完。',
        tags: ['倾听', '陪伴'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
      }
    ];

    for (const contact of defaultContacts) {
      await this.add('contacts', contact);
    }

    // 默认会话
    const defaultConversations = [
      {
        id: 'conv_001',
        type: 'private',
        contact_id: 'contact_001',
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        is_pinned: false,
        is_muted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
      }
    ];

    for (const conv of defaultConversations) {
      await this.add('conversations', conv);
    }

    // 默认消息
    const defaultMessages = [
      {
        id: 'msg_001',
        conversation_id: 'conv_001',
        sender_id: 'contact_001',
        content: '你好！我是小助手，很高兴认识你～',
        type: 'text',
        status: 'sent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
      }
    ];

    for (const msg of defaultMessages) {
      await this.add('messages', msg);
    }

    console.log('[Database] Default data initialized');
  }

  /**
   * 存储持久化申请
   */
  async requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log('[Database] Persistence granted:', isPersisted);
      return isPersisted;
    }
    return false;
  }

  /**
   * 检查存储配额
   */
  async checkQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = quota > 0 ? (usage / quota) * 100 : 0;
      
      console.log(`[Database] Storage: ${this.formatBytes(usage)} / ${this.formatBytes(quota)} (${percent.toFixed(1)}%)`);
      
      return {
        usage,
        quota,
        percent,
        warning: percent >= 70
      };
    }
    return null;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 导出单例
const db = new Database();
