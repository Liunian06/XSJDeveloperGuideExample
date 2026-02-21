/**
 * IndexedDB 存储模块
 * 封装建库、事务、CRUD、容错
 */
const DB = (() => {
  const DB_NAME = 'XSJ_DB';
  const DB_VERSION = 1;
  let db = null;

  // 对象仓库定义
  const STORES = {
    settings:      { keyPath: 'key' },
    contacts:      { keyPath: 'id', indexes: ['nickname', 'updated_at', 'is_deleted'] },
    conversations: { keyPath: 'id', indexes: ['contact_id', 'updated_at', 'is_deleted', 'is_pinned'] },
    messages:      { keyPath: 'id', indexes: ['conversation_id', 'created_at', 'is_deleted'] },
    groups:        { keyPath: 'id', indexes: ['name', 'updated_at', 'is_deleted'] },
    moments:       { keyPath: 'id', indexes: ['author_id', 'created_at', 'is_deleted'] },
    memories:      { keyPath: 'id', indexes: ['tags', 'importance', 'created_at', 'is_deleted'] },
    journals:      { keyPath: 'id', indexes: ['date', 'mood', 'created_at', 'is_deleted'] },
    forums:        { keyPath: 'id', indexes: ['tags', 'created_at', 'likes', 'is_deleted'] },
    worldbook:     { keyPath: 'id', indexes: ['type', 'name', 'updated_at', 'is_deleted'] },
    presets:       { keyPath: 'id', indexes: ['group', 'updated_at', 'is_deleted'] },
    stickers:      { keyPath: 'id', indexes: ['category', 'is_favorite', 'use_count'] }
  };

  /** 打开数据库 */
  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        for (const [name, config] of Object.entries(STORES)) {
          if (!database.objectStoreNames.contains(name)) {
            const store = database.createObjectStore(name, { keyPath: config.keyPath });
            if (config.indexes) {
              config.indexes.forEach(idx => {
                store.createIndex(idx, idx, { unique: false });
              });
            }
          }
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        db.onerror = (ev) => console.error('DB error:', ev.target.error);
        resolve(db);
      };

      request.onerror = (e) => {
        console.error('Failed to open DB:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /** 获取事务中的 store */
  async function getStore(storeName, mode = 'readonly') {
    const database = await open();
    const tx = database.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /** 通用 CRUD */
  async function get(storeName, key) {
    const store = await getStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    const store = await getStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, data) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function add(storeName, data) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.add(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(storeName, key) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function clear(storeName) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** 按索引查询 */
  async function getByIndex(storeName, indexName, value) {
    const store = await getStore(storeName);
    const index = store.index(indexName);
    return new Promise((resolve, reject) => {
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /** Settings 快捷方法 */
  async function getSetting(key) {
    const result = await get('settings', key);
    return result ? result.value : null;
  }

  async function setSetting(key, value) {
    return put('settings', { key, value });
  }

  /** 导出全部数据 */
  async function exportAll() {
    const data = {};
    for (const name of Object.keys(STORES)) {
      data[name] = await getAll(name);
    }
    data._meta = {
      version: DB_VERSION,
      exported_at: new Date().toISOString(),
      app: 'XSJ_教程机'
    };
    return data;
  }

  /** 导入数据 */
  async function importAll(data) {
    if (!data || !data._meta) {
      throw new Error('无效的备份数据格式');
    }
    const database = await open();
    const storeNames = Object.keys(STORES).filter(n => data[n]);
    const tx = database.transaction(storeNames, 'readwrite');

    for (const name of storeNames) {
      const store = tx.objectStore(name);
      store.clear();
      for (const item of data[name]) {
        store.put(item);
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** 存储配额检查 */
  async function checkQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const percent = (usage / quota * 100).toFixed(1);
      if (percent >= 70) {
        // 尝试申请持久化存储
        if (navigator.storage.persist) {
          const persisted = await navigator.storage.persist();
          if (!persisted && percent >= 90) {
            console.warn('存储空间接近上限，请清理旧数据');
          }
        }
      }
      return { usage, quota, percent: parseFloat(percent) };
    }
    return null;
  }

  return {
    open, get, getAll, put, add, remove, clear,
    getByIndex, getSetting, setSetting,
    exportAll, importAll, checkQuota
  };
})();
